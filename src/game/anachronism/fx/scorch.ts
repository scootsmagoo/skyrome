/**
 * Scorch marks: a ragged dark ring laid on the ground where a rocket burst. One instanced draw of
 * flat quads (a ring of `max`, the oldest reused), drawn in a small shader: dark at the heart,
 * soot thinning out to a jagged edge. They fade after a minute and a half.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float aFade;
attribute float aSeed;
varying vec2 vUv;
varying float vFade;
varying float vSeed;
void main() {
  vUv = position.xy * 2.0;
  vFade = aFade;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vFade;
varying float vSeed;
void main() {
  float r = length(vUv);
  float a = atan(vUv.y, vUv.x);
  // A ragged edge: a few lobes of soot thrown further than the rest.
  float edge = 0.78 + 0.12 * sin(a * 5.0 + vSeed) + 0.07 * sin(a * 11.0 + vSeed * 2.3) + 0.04 * sin(a * 23.0 + vSeed * 5.1);
  float k = 1.0 - smoothstep(edge * 0.55, edge, r);
  // Speckle, so the soot isn't a flat disc.
  float s = fract(sin(dot(floor(vUv * 18.0), vec2(12.9898, 78.233)) + vSeed) * 43758.5453);
  float alpha = k * (0.7 + 0.25 * (1.0 - r)) * (0.85 + 0.15 * s) * vFade;
  if (alpha < 0.01) discard;
  // Black at the heart, scorched brown toward the edge.
  vec3 col = mix(vec3(0.02, 0.018, 0.016), vec3(0.16, 0.09, 0.045), smoothstep(0.25, edge, r));
  gl_FragColor = vec4(col * (0.8 + 0.4 * s), alpha);
}
`;

const LIFE = 120;
const FADE = 30;

export class Scorches {
  readonly mesh: THREE.InstancedMesh;
  private readonly fade: THREE.InstancedBufferAttribute;
  private readonly seed: THREE.InstancedBufferAttribute;
  private readonly age: number[];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  /** Turns the quad's +z face up. */
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly n = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(private readonly max: number) {
    // A quad in xy (the shader reads xy as the disc's coordinates); each instance lays it flat.
    const geo = new THREE.PlaneGeometry(1, 1);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('aFade', this.fade);
    geo.setAttribute('aSeed', this.seed);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'gunFx:scorch';
    this.age = new Array(max).fill(Infinity);
  }

  /** A mark of radius `r` at `at` on ground whose normal is `normal` (null: flat). */
  spawn(at: THREE.Vector3Like, normal: THREE.Vector3Like | null, r: number, seed: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.n.set(normal?.x ?? 0, normal?.y ?? 1, normal?.z ?? 0).normalize();
    this.q.setFromUnitVectors(this.up, this.n).multiply(this.flat);
    this.m.compose(this.p.set(at.x, at.y + 0.02, at.z), this.q, this.s.set(r * 2, r * 2, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.age[i] = 0;
    this.seed.setX(i, seed);
    this.seed.needsUpdate = true;
    this.fade.setX(i, 1);
    this.fade.needsUpdate = true;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (!this.mesh.visible) return;
    let live = 0;
    for (let i = 0; i < this.mesh.count; i++) {
      if (!Number.isFinite(this.age[i])) continue;
      this.age[i] += dt;
      const f = this.age[i] < LIFE - FADE ? 1 : Math.max(0, (LIFE - this.age[i]) / FADE);
      if (f !== this.fade.getX(i)) {
        this.fade.setX(i, f);
        this.fade.needsUpdate = true;
      }
      if (f <= 0) this.age[i] = Infinity;
      else live++;
    }
    if (!live) {
      this.mesh.visible = false;
      this.mesh.count = 0;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
