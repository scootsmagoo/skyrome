/**
 * Tracers: thin glowing streaks that fly from the muzzle to where the bullet stopped. One instanced
 * draw of ribbon quads that turn to face the camera (done in the vertex shader), a ring of `max`,
 * each with a start, an end, a speed and a streak length; the head runs to the end and the tail
 * follows it. Never smaller than about a pixel and a half, so a far tracer still shows.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aA;   // tail xyz, width (m)
attribute vec4 aB;   // head xyz, alpha
attribute vec3 aCol;
uniform vec2 uViewport;
varying float vX;
varying float vY;
varying float vAlpha;
varying vec3 vCol;
void main() {
  // A ribbon built in screen space, so a tracer flying straight away from the camera is still a line.
  vec4 ca = projectionMatrix * viewMatrix * vec4(aA.xyz, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(aB.xyz, 1.0);
  float nearW = 0.08;
  if (ca.w < nearW && cb.w < nearW) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vX = 0.0; vY = 0.0; vAlpha = 0.0; vCol = vec3(0.0); return; }
  if (ca.w < nearW) ca = mix(ca, cb, (nearW - ca.w) / (cb.w - ca.w));
  if (cb.w < nearW) cb = mix(cb, ca, (nearW - cb.w) / (ca.w - cb.w));
  vec2 asp = vec2(uViewport.x / uViewport.y, 1.0);
  vec2 d = (cb.xy / cb.w - ca.xy / ca.w) * asp;
  float l = length(d);
  d = l > 1e-6 ? d / l : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x) / asp;
  vec4 c = mix(ca, cb, position.x);
  float pxPerM = projectionMatrix[1][1] * uViewport.y * 0.5 / max(c.w, 0.05);
  float wpx = max(aA.w * pxPerM, 2.4);
  c.xy += n * position.y * (wpx / uViewport.y) * c.w;
  gl_Position = c;
  vX = position.x;
  vY = position.y;
  vAlpha = aB.w * min(1.0, aA.w * pxPerM / 2.4);
  vCol = aCol;
}
`;

const FRAG = /* glsl */ `
varying float vX;
varying float vY;
varying float vAlpha;
varying vec3 vCol;
void main() {
  float along = pow(vX, 1.1);
  float across = 1.0 - vY * vY;
  float a = along * across * vAlpha;
  gl_FragColor = vec4(vCol * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Streaks {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uViewport: { value: new THREE.Vector2(1280, 720) } };
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly a: THREE.InstancedBufferAttribute;
  private readonly b: THREE.InstancedBufferAttribute;
  private readonly col: THREE.InstancedBufferAttribute;
  private readonly sx: Float32Array;
  private readonly sy: Float32Array;
  private readonly sz: Float32Array;
  private readonly dx: Float32Array;
  private readonly dy: Float32Array;
  private readonly dz: Float32Array;
  /** Distance to the end, streak length, speed, width, age, brightness. */
  private readonly total: Float32Array;
  private readonly trail: Float32Array;
  private readonly speed: Float32Array;
  private readonly width: Float32Array;
  private readonly age: Float32Array;
  private readonly bright: Float32Array;
  n = 0;

  constructor(readonly max: number) {
    // A quad along x 0..1 (tail to head), y -1..1 across.
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    const dyn = (size: number) => {
      const x = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size);
      x.setUsage(THREE.DynamicDrawUsage);
      return x;
    };
    this.a = dyn(4);
    this.b = dyn(4);
    this.col = dyn(3);
    this.geo.setAttribute('aA', this.a);
    this.geo.setAttribute('aB', this.b);
    this.geo.setAttribute('aCol', this.col);
    this.geo.instanceCount = 0;
    const f = () => new Float32Array(max);
    this.sx = f(); this.sy = f(); this.sz = f(); this.dx = f(); this.dy = f(); this.dz = f();
    this.total = f(); this.trail = f(); this.speed = f(); this.width = f(); this.age = f(); this.bright = f();
    const mat = new THREE.ShaderMaterial({
      name: 'GunTracer',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = 'gun:tracers';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
  }

  /** A tracer from (sx, sy, sz) along unit (dx, dy, dz) for `dist` metres. */
  spawn(sx: number, sy: number, sz: number, dx: number, dy: number, dz: number, dist: number, trail: number, speed: number, width: number, bright: number) {
    const i = this.n < this.max ? this.n++ : 0;
    this.sx[i] = sx; this.sy[i] = sy; this.sz[i] = sz;
    this.dx[i] = dx; this.dy[i] = dy; this.dz[i] = dz;
    this.total[i] = Math.max(0.05, dist);
    this.trail[i] = Math.min(trail, dist);
    this.speed[i] = speed;
    this.width[i] = width;
    this.age[i] = 0;
    this.bright[i] = bright;
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.n === 0) return;
    const A = this.a.array as Float32Array;
    const Bf = this.b.array as Float32Array;
    const C = this.col.array as Float32Array;
    let i = 0;
    while (i < this.n) {
      const age = (this.age[i] += dt);
      const head = age * this.speed[i];
      const tail = head - this.trail[i];
      if (tail >= this.total[i]) {
        const j = --this.n;
        if (j !== i) this.copy(j, i);
        continue;
      }
      const h = Math.min(head, this.total[i]);
      const t = Math.max(0, tail);
      const o4 = i * 4;
      A[o4] = this.sx[i] + this.dx[i] * t; A[o4 + 1] = this.sy[i] + this.dy[i] * t; A[o4 + 2] = this.sz[i] + this.dz[i] * t; A[o4 + 3] = this.width[i];
      Bf[o4] = this.sx[i] + this.dx[i] * h; Bf[o4 + 1] = this.sy[i] + this.dy[i] * h; Bf[o4 + 2] = this.sz[i] + this.dz[i] * h;
      // Fade as the tail catches up with the end.
      const left = Math.min(1, (this.total[i] - t) / Math.max(0.5, this.trail[i]));
      Bf[o4 + 3] = this.bright[i] * Math.min(1, 0.4 + left);
      const o3 = i * 3;
      C[o3] = 1.0; C[o3 + 1] = 0.86; C[o3 + 2] = 0.55;
      i++;
    }
    this.geo.instanceCount = this.n;
    this.a.needsUpdate = this.b.needsUpdate = this.col.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  private copy(from: number, to: number) {
    for (const arr of [this.sx, this.sy, this.sz, this.dx, this.dy, this.dz, this.total, this.trail, this.speed, this.width, this.age, this.bright]) arr[to] = arr[from];
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
