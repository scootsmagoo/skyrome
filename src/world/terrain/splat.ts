/**
 * Terrain surface mix ("splat"): which ground texture shows where. Pure TypeScript, mirrored
 * line by line in GLSL (SPLAT_GLSL below), so `Terrain.surfaceAt` answers with what is drawn.
 *
 * Rome in May: green grass going gold where it is dry (south-facing slopes, hilltops, steep
 * ground), bare trodden earth in the dense quarters, around building pads and along road verges,
 * tufa outcrops on cliffs, gravel and mud beaches at the river, basalt roads, travertine fora.
 * Each rule is an overlay on what is below, so weights always sum to 1.
 */
import type { MaterialId } from '../../gfx/materialIds';

export const SPLAT_LAYERS = ['grass', 'dry_grass', 'dirt', 'rock', 'sand', 'mud', 'gravel', 'paving_basalt', 'paving_travertine'] as const satisfies readonly MaterialId[];
export type SplatLayer = (typeof SPLAT_LAYERS)[number];
export const L = {
  grass: 0,
  dry: 1,
  dirt: 2,
  rock: 3,
  sand: 4,
  mud: 5,
  gravel: 6,
  basalt: 7,
  travertine: 8,
} as const;
export const LAYER_COUNT = SPLAT_LAYERS.length;

/** Inputs at one ground point (all distances in GAME meters). */
export interface SplatInput {
  x: number;
  z: number;
  /** Surface normal y (1 = flat) and z (> 0 faces south). */
  ny: number;
  nz: number;
  /** Height above the local water level. */
  hw: number;
  roadSd: number;
  padSd: number;
  /** 0 earth, 0.5 gravel, 1 travertine. */
  padKind: number;
  urban: number;
  lush: number;
}

const fract = (v: number) => v - Math.floor(v);

/** Hash of a lattice point (Dave Hoskins' hash12, as in the GLSL). */
export function hash2(ix: number, iz: number): number {
  let p0 = fract(ix * 0.1031), p1 = fract(iz * 0.1031), p2 = fract(ix * 0.1031);
  const d = p0 * (p1 + 33.33) + p1 * (p2 + 33.33) + p2 * (p0 + 33.33);
  p0 += d;
  p1 += d;
  p2 += d;
  return fract((p0 + p1) * p2);
}

/** 2D value noise in [0, 1]. */
export function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** The four noise fields the rules use (large patches → fine edge breakup). */
export function splatNoise(x: number, z: number): [number, number, number, number] {
  const n1 = vnoise(x * 0.011 + 3.1, z * 0.011 + 7.7) * 0.65 + vnoise(x * 0.027 + 11.3, z * 0.027 + 5.1) * 0.35;
  const n2 = vnoise(x * 0.05 + 1.7, z * 0.05 + 9.2);
  const n3 = vnoise(x * 0.21 + 4.3, z * 0.21 + 2.9);
  const n4 = vnoise(x * 0.9 + 0.5, z * 0.9 + 0.5);
  return [n1, n2, n3, n4];
}

function overlay(w: Float32Array, c: number, layer: number) {
  if (c <= 0) return;
  const k = 1 - c;
  for (let i = 0; i < w.length; i++) w[i] *= k;
  w[layer] += c;
}

/** Layer weights (sum 1) at a point. `out` is reused when given. */
export function splatWeights(p: SplatInput, out = new Float32Array(LAYER_COUNT)): Float32Array {
  out.fill(0);
  const [n1, n2, n3, n4] = splatNoise(p.x, p.z);
  const steep = 1 - p.ny;
  // Green vs sun-dried grass.
  let dry = 0.42 + (n1 - 0.5) * 1.3 + (n2 - 0.5) * 0.45 + p.nz * 0.55 + steep * 1.6 - p.lush * 0.6 + p.urban * 0.12;
  dry = smoothstep(0.2, 0.8, dry);
  out[L.grass] = 1 - dry;
  out[L.dry] = dry;
  // Trodden and bare earth.
  const verge = p.roadSd > 0 ? Math.max(0, 1 - p.roadSd / 2.2) * 0.85 : 0;
  const apron = p.padSd > 0 ? Math.max(0, 1 - p.padSd / 5) * 0.75 : 0;
  const town = p.urban * smoothstep(0.3, 0.62, n2 * 0.55 + n3 * 0.45 + p.urban * 0.25) * 0.9;
  const bare = smoothstep(0.66, 0.8, n2 * 0.55 + n3 * 0.45) * 0.55 * (1 - p.lush);
  const eroded = smoothstep(0.16, 0.3, steep) * 0.35;
  const dirt = smoothstep(0.3, 0.7, clamp01(verge + apron + town + bare + eroded) + (n4 - 0.5) * 0.3);
  overlay(out, dirt, L.dirt);
  // River margins: gravelly sand above the waterline, mud at it and below.
  overlay(out, 1 - smoothstep(0.8, 1.7, p.hw + (n3 - 0.5) * 0.8), L.sand);
  overlay(out, 1 - smoothstep(0.12, 0.55, p.hw + (n3 - 0.5) * 0.35), L.mud);
  // Tufa outcrops on cliffs.
  const slopeDeg = (Math.acos(Math.min(1, Math.max(-1, p.ny))) * 180) / Math.PI;
  overlay(out, smoothstep(31, 41, slopeDeg + (n3 - 0.5) * 9), L.rock);
  // Building pads: travertine (fora, monuments), gravel or trodden earth.
  const pad = 1 - smoothstep(-0.15, 0.15, p.padSd + (n4 - 0.5) * 0.25);
  const trav = smoothstep(0.7, 0.9, p.padKind);
  const grav = (1 - trav) * smoothstep(0.2, 0.4, p.padKind);
  overlay(out, pad * trav, L.travertine);
  overlay(out, pad * grav, L.gravel);
  overlay(out, pad * (1 - trav - grav), L.dirt);
  // Basalt roads.
  overlay(out, 1 - smoothstep(-0.12, 0.12, p.roadSd), L.basalt);
  return out;
}

/** GLSL twin of the functions above. Inputs are the same; `w[9]` receives the weights. */
export const SPLAT_GLSL = /* glsl */ `
float tHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float tNoise( vec2 x ) {
  vec2 i = floor( x );
  vec2 f = x - i;
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = tHash( i ), b = tHash( i + vec2( 1.0, 0.0 ) ), c = tHash( i + vec2( 0.0, 1.0 ) ), d = tHash( i + vec2( 1.0, 1.0 ) );
  return mix( a + ( b - a ) * u.x, c + ( d - c ) * u.x, u.y );
}
void tOverlay( inout float w[ 9 ], float c, int layer ) {
  if ( c <= 0.0 ) return;
  float k = 1.0 - c;
  for ( int i = 0; i < 9; i ++ ) w[ i ] *= k;
  w[ layer ] += c;
}
void splatWeights( vec2 p, float ny, float nz, float hw, float roadSd, float padSd, float padKind, float urban, float lush, out float w[ 9 ], out vec4 n ) {
  n.x = tNoise( p * 0.011 + vec2( 3.1, 7.7 ) ) * 0.65 + tNoise( p * 0.027 + vec2( 11.3, 5.1 ) ) * 0.35;
  n.y = tNoise( p * 0.05 + vec2( 1.7, 9.2 ) );
  n.z = tNoise( p * 0.21 + vec2( 4.3, 2.9 ) );
  n.w = tNoise( p * 0.9 + vec2( 0.5 ) );
  for ( int i = 0; i < 9; i ++ ) w[ i ] = 0.0;
  float steep = 1.0 - ny;
  float dry = 0.42 + ( n.x - 0.5 ) * 1.3 + ( n.y - 0.5 ) * 0.45 + nz * 0.55 + steep * 1.6 - lush * 0.6 + urban * 0.12;
  dry = smoothstep( 0.2, 0.8, dry );
  w[ 0 ] = 1.0 - dry;
  w[ 1 ] = dry;
  float verge = roadSd > 0.0 ? max( 0.0, 1.0 - roadSd / 2.2 ) * 0.85 : 0.0;
  float apron = padSd > 0.0 ? max( 0.0, 1.0 - padSd / 5.0 ) * 0.75 : 0.0;
  float town = urban * smoothstep( 0.3, 0.62, n.y * 0.55 + n.z * 0.45 + urban * 0.25 ) * 0.9;
  float bare = smoothstep( 0.66, 0.8, n.y * 0.55 + n.z * 0.45 ) * 0.55 * ( 1.0 - lush );
  float eroded = smoothstep( 0.16, 0.3, steep ) * 0.35;
  float dirt = smoothstep( 0.3, 0.7, clamp( verge + apron + town + bare + eroded, 0.0, 1.0 ) + ( n.w - 0.5 ) * 0.3 );
  tOverlay( w, dirt, 2 );
  tOverlay( w, 1.0 - smoothstep( 0.8, 1.7, hw + ( n.z - 0.5 ) * 0.8 ), 4 );
  tOverlay( w, 1.0 - smoothstep( 0.12, 0.55, hw + ( n.z - 0.5 ) * 0.35 ), 5 );
  float slopeDeg = degrees( acos( clamp( ny, -1.0, 1.0 ) ) );
  tOverlay( w, smoothstep( 31.0, 41.0, slopeDeg + ( n.z - 0.5 ) * 9.0 ), 3 );
  float pad = 1.0 - smoothstep( -0.15, 0.15, padSd + ( n.w - 0.5 ) * 0.25 );
  float trav = smoothstep( 0.7, 0.9, padKind );
  float grav = ( 1.0 - trav ) * smoothstep( 0.2, 0.4, padKind );
  tOverlay( w, pad * trav, 8 );
  tOverlay( w, pad * grav, 6 );
  tOverlay( w, pad * ( 1.0 - trav - grav ), 2 );
  tOverlay( w, 1.0 - smoothstep( -0.12, 0.12, roadSd ), 7 );
}
`;
