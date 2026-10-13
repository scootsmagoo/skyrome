/**
 * Pooled camera-facing sprites in one instanced draw: smoke, dust, fire, sparks, muzzle flares.
 * A ring of `max` particles integrated on the CPU (position, drag, a constant acceleration), each
 * with a size that grows over its life and a colour and alpha that fade; nothing is allocated after
 * construction. Two instances serve the whole cheat: one blended normally (smoke, dust) and one
 * additive (fire, flares, sparks).
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aPosSize;  // xyz, size (m)
attribute vec4 aColor;    // rgb, alpha
attribute vec3 aMisc;     // rotation, kind (0 puff, 1 flare, 2 spark), seed
uniform float uFogDensity;
uniform vec3 uTint;
varying vec4 vColor;
varying vec2 vUv;
varying vec2 vMisc;
void main() {
  vec4 mv = viewMatrix * vec4(aPosSize.xyz, 1.0);
  float dist = -mv.z;
  float c = cos(aMisc.x);
  float s = sin(aMisc.x);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  float size = aPosSize.w;
  mv.xy += q * size * 0.5;
  // Pulled toward the camera by half its size, so a puff on a wall does not slice into it.
  mv.xyz += normalize(-mv.xyz) * min(size * 0.4, dist * 0.4);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vColor.rgb *= uTint;
  vColor.a *= exp(-uFogDensity * dist * 0.6);
  // A puff the camera is inside (or right beside) thins out instead of veiling the screen.
  vColor.a *= clamp((dist - 0.15 * size) / (0.6 * size), 0.0, 1.0);
  vUv = position.xy;
  vMisc = aMisc.yz;
}
`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying vec2 vUv;
varying vec2 vMisc;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float a;
  if (vMisc.x < 0.5) {
    // A puff: a soft disc with a ragged edge.
    float n = vnoise(vUv * 2.6 + vMisc.y * 31.0) * 0.65 + vnoise(vUv * 5.5 - vMisc.y * 17.0) * 0.35;
    float edge = 1.0 - sqrt(r2);
    a = smoothstep(0.0, 0.55, edge * (0.55 + n * 0.9));
    a *= a * 0.5 + 0.5;
  } else if (vMisc.x < 1.5) {
    // A flare: a hot core, a halo and a star of spikes.
    float ang = atan(vUv.y, vUv.x);
    float star = pow(abs(cos(ang * 2.5 + vMisc.y * 6.28)), 10.0);
    a = exp(-r2 * 24.0) * 1.3 + exp(-r2 * 5.0) * 0.28 + star * exp(-r2 * 3.2) * 0.9;
  } else {
    // A spark: a small hot dot.
    a = exp(-r2 * 7.0);
  }
  gl_FragColor = vec4(vColor.rgb * (ADDITIVE > 0 ? a : 1.0), vColor.a * (ADDITIVE > 0 ? 1.0 : a));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const Kind = { Puff: 0, Flare: 1, Spark: 2 } as const;
export type KindId = (typeof Kind)[keyof typeof Kind];

export class Billboards {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uFogDensity: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) } };
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly posSize: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;
  private readonly misc: THREE.InstancedBufferAttribute;
  // Particle state, structure of arrays.
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly drag: Float32Array;
  private readonly acc: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly alpha: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly kind: Float32Array;
  private readonly seed: Float32Array;
  private readonly fade: Float32Array;
  private seedCounter = 0.37;
  n = 0;

  constructor(readonly max: number, private readonly additive: boolean) {
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    const dyn = (size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.posSize = dyn(4);
    this.color = dyn(4);
    this.misc = dyn(3);
    this.geo.setAttribute('aPosSize', this.posSize);
    this.geo.setAttribute('aColor', this.color);
    this.geo.setAttribute('aMisc', this.misc);
    this.geo.instanceCount = 0;
    const f = () => new Float32Array(max);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f(); this.s0 = f(); this.s1 = f();
    this.drag = f(); this.acc = f(); this.alpha = f(); this.rot = f(); this.spin = f();
    this.kind = f(); this.seed = f(); this.fade = f();
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    const mat = new THREE.ShaderMaterial({
      name: additive ? 'GunFire' : 'GunSmoke',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { ADDITIVE: additive ? 1 : 0 },
      transparent: true,
      depthWrite: false,
      fog: false,
      // Additive in colour only, as the light glows do: three's own additive blend also adds alpha, which a canvas
      // with an alpha channel composites as a dark disc.
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = additive ? 'gun:fire' : 'gun:smoke';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 4;
    this.mesh.visible = false;
  }

  /**
   * Add a particle (the oldest is recycled when the ring is full). Colour runs from (r0,g0,b0) to
   * (r1,g1,b1) over its life; alpha is `a`, rising over the first `fadeIn` of the life and falling
   * to nothing by the end. `acc` is a vertical acceleration (negative = falls, positive = rises).
   */
  spawn(
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
    size0: number, size1: number, life: number,
    r0: number, g0: number, b0: number, r1: number, g1: number, b1: number,
    a: number, drag: number, acc: number, spin: number, kind: KindId, fadeIn = 0.1,
  ) {
    const i = this.n < this.max ? this.n++ : Math.floor(this.seedCounter * 9973) % this.max;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life;
    this.s0[i] = size0; this.s1[i] = size1;
    this.drag[i] = drag; this.acc[i] = acc;
    this.c0[i * 3] = r0; this.c0[i * 3 + 1] = g0; this.c0[i * 3 + 2] = b0;
    this.c1[i * 3] = r1; this.c1[i * 3 + 1] = g1; this.c1[i * 3 + 2] = b1;
    this.alpha[i] = a;
    this.seedCounter = (this.seedCounter * 7.13 + 0.618) % 1;
    this.rot[i] = this.seedCounter * 6.2832;
    this.spin[i] = spin;
    this.kind[i] = kind;
    this.seed[i] = this.seedCounter;
    this.fade[i] = Math.max(0.001, fadeIn);
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.n === 0) return;
    const ps = this.posSize.array as Float32Array;
    const cs = this.color.array as Float32Array;
    const ms = this.misc.array as Float32Array;
    let i = 0;
    while (i < this.n) {
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) {
        // Swap-remove: the last particle takes this slot (and is processed next).
        const j = --this.n;
        if (j !== i) this.copy(j, i);
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= k;
      this.vy[i] = this.vy[i] * k + this.acc[i] * dt;
      this.vz[i] *= k;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      const u = age / life;
      const grow = 1 - (1 - u) * (1 - u);
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * grow;
      const fin = Math.min(1, u / this.fade[i]);
      const out = 1 - u;
      // Fire dies fast; smoke thins slowly and lingers.
      const fall = this.additive ? (this.kind[i] === Kind.Puff ? out * out : out) : 1 - u * u;
      const alpha = this.alpha[i] * fin * fall;
      const o4 = i * 4;
      ps[o4] = this.px[i]; ps[o4 + 1] = this.py[i]; ps[o4 + 2] = this.pz[i]; ps[o4 + 3] = size;
      const o3 = i * 3;
      cs[o4] = this.c0[o3] + (this.c1[o3] - this.c0[o3]) * u;
      cs[o4 + 1] = this.c0[o3 + 1] + (this.c1[o3 + 1] - this.c0[o3 + 1]) * u;
      cs[o4 + 2] = this.c0[o3 + 2] + (this.c1[o3 + 2] - this.c0[o3 + 2]) * u;
      cs[o4 + 3] = alpha;
      ms[o3] = this.rot[i]; ms[o3 + 1] = this.kind[i]; ms[o3 + 2] = this.seed[i];
      i++;
    }
    this.geo.instanceCount = this.n;
    this.posSize.needsUpdate = this.color.needsUpdate = this.misc.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  private copy(from: number, to: number) {
    this.px[to] = this.px[from]; this.py[to] = this.py[from]; this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]; this.vz[to] = this.vz[from];
    this.age[to] = this.age[from]; this.life[to] = this.life[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.drag[to] = this.drag[from]; this.acc[to] = this.acc[from];
    this.alpha[to] = this.alpha[from]; this.rot[to] = this.rot[from]; this.spin[to] = this.spin[from];
    this.kind[to] = this.kind[from]; this.seed[to] = this.seed[from]; this.fade[to] = this.fade[from];
    for (let c = 0; c < 3; c++) {
      this.c0[to * 3 + c] = this.c0[from * 3 + c];
      this.c1[to * 3 + c] = this.c1[from * 3 + c];
    }
  }

  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
