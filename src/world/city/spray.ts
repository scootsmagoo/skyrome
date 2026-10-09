/**
 * Fountain spray: the street lacus' jet lands in the basin in a shower of droplets and a little
 * rising mist. Fill code registers the point where the jet hits the water (`registerSpray`, by id,
 * so a re-streamed block does not duplicate); `FountainSpray` keeps the nearest few within
 * `RANGE` as one `Points` draw whose droplets are animated entirely in the vertex shader (ballistic
 * arcs from per-point randoms), so the per-frame work is one time uniform and, every few frames, a
 * rewrite of the origin attribute.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';

const RANGE = 55;
const MAX_FOUNTAINS = 16;
const PER = 26;

const points = new Map<string, [number, number, number]>();

/** Note where a fountain's jet lands (world m). Safe to call again for the same id. */
export function registerSpray(id: string, x: number, y: number, z: number) {
  points.set(id, [x, y, z]);
}

export function sprayPointCount() {
  return points.size;
}

export function clearSpray() {
  points.clear();
}

const VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aRand;
uniform float uTime;
uniform float uScale;
varying float vAlpha;
void main() {
  // Droplets (kind < 0.7): a quick ballistic burst; mist (kind >= 0.7): a slow soft puff.
  float mist = step( 0.7, aRand.w );
  float life = mix( 0.55, 1.8, mist );
  float t = fract( uTime / life + aRand.x );
  float ang = aRand.y * 6.2831853;
  float sp = mix( 0.35 + 0.5 * aRand.z, 0.12 + 0.1 * aRand.z, mist );
  vec3 v = vec3( cos( ang ) * sp, mix( 1.5 + 1.2 * aRand.z, 0.25, mist ), sin( ang ) * sp );
  float tt = t * life;
  vec3 p = aOrigin + v * tt + vec3( 0.0, mix( -4.9 * tt * tt, 0.0, mist ), 0.0 );
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  float size = mix( 0.035, 0.22, mist ) * ( 0.7 + 0.6 * aRand.z );
  gl_PointSize = clamp( size * uScale / max( - mv.z, 0.1 ), 1.5, mix( 7.0, 40.0, mist ) );
  vAlpha = mix( 0.9 * ( 1.0 - t * t ), 0.16 * sin( t * 3.14159 ), mist );
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot( c, c ) * 4.0;
  float a = ( 1.0 - smoothstep( 0.35, 1.0, d ) ) * vAlpha;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( uColor, a );
}`;

export class FountainSpray implements System {
  readonly name = 'fountainSpray';
  readonly priority = 98;
  private readonly origin: THREE.BufferAttribute;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private readonly obj: THREE.Points;
  private time = 0;
  private frame = 0;
  private lastCount = -1;
  private readonly last = new THREE.Vector3(Infinity, 0, 0);

  constructor(private readonly game: Game) {
    const n = MAX_FOUNTAINS * PER;
    this.origin = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.origin.setUsage(THREE.DynamicDrawUsage);
    const rand = new Float32Array(n * 4);
    // Deterministic randoms (a small LCG) so the shower looks the same every load.
    let s = 12345;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const j = i % PER;
      rand[i * 4] = r();
      rand[i * 4 + 1] = r();
      rand[i * 4 + 2] = r();
      rand[i * 4 + 3] = j < 18 ? r() * 0.69 : 0.7 + r() * 0.3;
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('aOrigin', this.origin);
    this.geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uColor: { value: new THREE.Color(0.8, 0.88, 0.95) } },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.obj = new THREE.Points(this.geo, this.mat);
    this.obj.frustumCulled = false;
    this.obj.name = 'fountainSpray';
    this.obj.visible = false;
    game.scene.add(this.obj);
  }

  update(dt: number) {
    if (!this.obj.visible && points.size === 0) return;
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    const cam = this.game.camera;
    const h = this.game.renderer.domElement.height;
    const fov = (cam as THREE.PerspectiveCamera).fov ?? 60;
    this.mat.uniforms.uScale.value = (h * 0.5) / Math.tan((fov * Math.PI) / 360);
    const day = this.game.sky?.daylight ?? 1;
    const k = 0.22 + 0.78 * day;
    this.mat.uniforms.uColor.value.setRGB(0.8 * k, 0.88 * k, 0.95 * k);
    this.frame++;
    const cp = cam.position;
    if (this.frame % 15 !== 0 && cp.distanceToSquared(this.last) < 25 && this.lastCount >= 0) return;
    this.last.copy(cp);
    // Nearest fountains in range.
    const near: { d: number; p: [number, number, number] }[] = [];
    const r2 = RANGE * RANGE;
    for (const p of points.values()) {
      const dx = p[0] - cp.x, dz = p[2] - cp.z;
      const d = dx * dx + dz * dz;
      if (d < r2) near.push({ d, p });
    }
    near.sort((a, b) => a.d - b.d);
    const cnt = Math.min(near.length, MAX_FOUNTAINS);
    const arr = this.origin.array as Float32Array;
    for (let f = 0; f < cnt; f++) {
      const p = near[f].p;
      for (let j = 0; j < PER; j++) {
        const o = (f * PER + j) * 3;
        arr[o] = p[0];
        arr[o + 1] = p[1];
        arr[o + 2] = p[2];
      }
    }
    this.origin.needsUpdate = true;
    this.geo.setDrawRange(0, cnt * PER);
    this.lastCount = cnt;
    this.obj.visible = cnt > 0;
  }

  dispose() {
    this.game.scene.remove(this.obj);
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** Registered jet points (debug / tests). */
export function sprayPoints(): readonly [number, number, number][] {
  return [...points.values()];
}
