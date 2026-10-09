/**
 * Foam where the river meets something solid: bridge piers get a bright collar of broken white
 * water, a bow ripple on the upstream face and a streaky wake that runs downstream and fades over a
 * few tens of metres. The obstacles are plain oriented rectangles (centre, axis, half extents) kept
 * in two shared uniform arrays that every water material reads, so builders (bridges, quays) only
 * have to call `addFoamObstacle`, in any order relative to the water itself.
 */
import * as THREE from 'three';

/** Upper bound of obstacles the water shader loops over. */
export const MAX_FOAM_OBSTACLES = 32;

export interface FoamObstacle {
  /** Centre (game m). */
  x: number;
  z: number;
  /** Unit direction of the obstacle's long axis (game xz). */
  dx: number;
  dz: number;
  /** Half extents along that axis and across it (game m). */
  hl: number;
  hw: number;
}

/** (cx, cz, dirx, dirz) and (hl, hw, 0, 0) per obstacle; `uFoamCount` of them are live. */
export const foamUniforms = {
  uFoamA: { value: Array.from({ length: MAX_FOAM_OBSTACLES }, () => new THREE.Vector4()) },
  uFoamB: { value: Array.from({ length: MAX_FOAM_OBSTACLES }, () => new THREE.Vector4()) },
  uFoamCount: { value: 0 },
};

const list: FoamObstacle[] = [];
/** Owner tag per entry (parallel to `list`), so a builder can drop only its own on a rebuild. */
const owners: string[] = [];

/** Add an obstacle (ignored past the cap). Returns whether it was taken. */
export function addFoamObstacle(o: FoamObstacle, owner = ''): boolean {
  if (list.length >= MAX_FOAM_OBSTACLES) return false;
  const i = list.length;
  list.push(o);
  owners.push(owner);
  foamUniforms.uFoamA.value[i].set(o.x, o.z, o.dx, o.dz);
  foamUniforms.uFoamB.value[i].set(o.hl, o.hw, 0, 0);
  foamUniforms.uFoamCount.value = list.length;
  return true;
}

/** Forget obstacles: every one, or only those added with `owner` (a rebuild of that builder). */
export function clearFoamObstacles(owner?: string) {
  const keep = list.map((o, i) => ({ o, w: owners[i] })).filter((e) => owner !== undefined && e.w !== owner);
  list.length = 0;
  owners.length = 0;
  foamUniforms.uFoamCount.value = 0;
  for (const e of keep) addFoamObstacle(e.o, e.w);
}

export function foamObstacles(): readonly FoamObstacle[] {
  return list;
}

/** The piers of a laid-out bridge as foam obstacles: `a`→`b` is the axis, `width` the deck width (game m). */
export function pierObstacles(a: { x: number; z: number }, b: { x: number; z: number }, piers: readonly { u0: number; u1: number }[], width: number): FoamObstacle[] {
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const dx = (b.x - a.x) / l, dz = (b.z - a.z) / l;
  return piers.map((p) => {
    const u = (p.u0 + p.u1) / 2;
    return { x: a.x + dx * u, z: a.z + dz * u, dx, dz, hl: (p.u1 - p.u0) / 2, hw: width / 2 };
  });
}

/** GLSL: uniforms and the foam function at a world xz given the local current. Needs wNoise. */
export const FOAM_PARS = /* glsl */ `
uniform vec4 uFoamA[${MAX_FOAM_OBSTACLES}];
uniform vec4 uFoamB[${MAX_FOAM_OBSTACLES}];
uniform int uFoamCount;
// Foam around the registered obstacles: x = collar and bow wave, y = the downstream wake streaks.
vec2 wObstacleFoam( vec2 p, vec2 flow, float t ) {
  vec2 res = vec2( 0.0 );
  float spd = length( flow );
  bool moving = spd > 0.05;
  vec2 f = moving ? flow / spd : vec2( 1.0, 0.0 );
  for ( int i = 0; i < ${MAX_FOAM_OBSTACLES}; i++ ) {
    if ( i >= uFoamCount ) break;
    vec4 A = uFoamA[ i ];
    vec2 d = p - A.xy;
    if ( dot( d, d ) > 2500.0 ) continue;
    vec4 B = uFoamB[ i ];
    vec2 q = vec2( dot( d, A.zw ), dot( d, vec2( - A.w, A.z ) ) );
    // Signed distance to the pier rectangle.
    vec2 o = abs( q ) - B.xy;
    float sd = length( max( o, 0.0 ) ) + min( max( o.x, o.y ), 0.0 );
    float ring = 1.0 - smoothstep( 0.0, 2.2, sd );
    float chop = wNoise( p * 3.1 + vec2( t * 0.6, - t * 0.45 ) ) * 0.6 + wNoise( p * 7.3 - t * 0.9 ) * 0.4;
    float collar = smoothstep( 0.1, 0.5, ring * 1.5 + ( chop - 0.5 ) * 0.9 ) * smoothstep( 0.0, 0.25, ring );
    // Bow wave: a pale line a little ahead of the upstream face.
    float tail = dot( d, f );
    float bow = ( 1.0 - smoothstep( 0.0, 0.6, abs( sd - 1.2 ) ) ) * smoothstep( 0.0, 1.5, - tail ) * 0.7;
    // Wake: downstream of the pier, as wide as the pier and narrowing, in streaks along the flow.
    float side = abs( dot( d, vec2( - f.y, f.x ) ) );
    float wid = max( B.x, 0.6 ) * 1.1;
    float len = 6.0 + 22.0 * min( spd, 1.4 );
    float tl = max( tail, 0.0 );
    float streak = wNoise( vec2( tl * 0.28 - t * 0.9 * spd, side * 2.4 ) ) * 0.7 + wNoise( vec2( tl * 0.9 - t * 1.4 * spd, side * 5.0 + 3.0 ) ) * 0.3;
    float wake = ( moving ? 1.0 : 0.0 ) * smoothstep( 0.0, 0.8, tail ) * exp( - tl / len ) * ( 1.0 - smoothstep( wid * 0.6, wid * 1.8 + tl * 0.08, side ) ) * ( 0.2 + 0.8 * smoothstep( 0.35, 0.7, streak ) );
    res.x = max( res.x, max( collar, bow * 0.8 ) );
    res.y = max( res.y, wake * 0.75 );
  }
  return res;
}
`;
