/**
 * Flying debris: chunks thrown by a blast and chips knocked from a wall by a bullet. A ring of boxes
 * in one InstancedMesh, each with a position, a velocity and a spin, moved under gravity with one
 * bounce off a floor height chosen when it was thrown. No colliders: they are only for looks.
 */
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly wx: Float32Array;
  private readonly wy: Float32Array;
  private readonly wz: Float32Array;
  private readonly qx: Float32Array;
  private readonly qy: Float32Array;
  private readonly qz: Float32Array;
  private readonly qw: Float32Array;
  private readonly size: Float32Array;
  private readonly floor: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly bounces: Uint8Array;
  private readonly tint: Float32Array;
  n = 0;

  constructor(readonly max: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    mat.name = 'gun:debris';
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.name = 'gun:debris';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const f = () => new Float32Array(max);
    this.px = f(); this.py = f(); this.pz = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.wx = f(); this.wy = f(); this.wz = f(); this.qx = f(); this.qy = f(); this.qz = f(); this.qw = f();
    this.size = f(); this.floor = f(); this.age = f(); this.life = f(); this.tint = new Float32Array(max * 3);
    this.bounces = new Uint8Array(max);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, floor: number, life: number, r: number, g: number, b: number, spin = 9) {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    // A random spin, a random starting attitude.
    this.wx[i] = (Math.random() - 0.5) * spin; this.wy[i] = (Math.random() - 0.5) * spin; this.wz[i] = (Math.random() - 0.5) * spin;
    _q.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.qx[i] = _q.x; this.qy[i] = _q.y; this.qz[i] = _q.z; this.qw[i] = _q.w;
    this.size[i] = size;
    this.floor[i] = floor + size * 0.5;
    this.age[i] = 0;
    this.life[i] = life;
    this.bounces[i] = 0;
    this.tint[i * 3] = r; this.tint[i * 3 + 1] = g; this.tint[i * 3 + 2] = b;
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.n === 0) return;
    let i = 0;
    while (i < this.n) {
      const age = (this.age[i] += dt);
      if (age >= this.life[i]) {
        const j = --this.n;
        if (j !== i) this.copy(j, i);
        continue;
      }
      this.vy[i] -= 9.8 * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.floor[i]) {
        this.py[i] = this.floor[i];
        if (this.bounces[i] < 2 && this.vy[i] < -1) {
          this.vy[i] *= -0.35;
          this.vx[i] *= 0.6;
          this.vz[i] *= 0.6;
          this.bounces[i]++;
        } else {
          // Come to rest: slide to a stop and stop spinning.
          this.vy[i] = 0;
          this.vx[i] *= 0.85;
          this.vz[i] *= 0.85;
          this.wx[i] *= 0.8; this.wy[i] *= 0.8; this.wz[i] *= 0.8;
        }
      }
      // Integrate the attitude: q += 0.5 * w * q * dt.
      const wx = this.wx[i], wy = this.wy[i], wz = this.wz[i];
      const qx = this.qx[i], qy = this.qy[i], qz = this.qz[i], qw = this.qw[i];
      const h = 0.5 * dt;
      let nx = qx + h * (wx * qw + wy * qz - wz * qy);
      let ny = qy + h * (wy * qw + wz * qx - wx * qz);
      let nz = qz + h * (wz * qw + wx * qy - wy * qx);
      let nw = qw + h * (-wx * qx - wy * qy - wz * qz);
      const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw) || 1);
      nx *= l; ny *= l; nz *= l; nw *= l;
      this.qx[i] = nx; this.qy[i] = ny; this.qz[i] = nz; this.qw[i] = nw;
      // Shrink away over the last second.
      const k = Math.min(1, (this.life[i] - age) / 0.8);
      _m.compose(_p.set(this.px[i], this.py[i], this.pz[i]), _q.set(nx, ny, nz, nw), _s.set(1, 0.7, 1.2).multiplyScalar(this.size[i] * k));
      this.mesh.setMatrixAt(i, _m);
      _c.setRGB(this.tint[i * 3], this.tint[i * 3 + 1], this.tint[i * 3 + 2]);
      this.mesh.setColorAt(i, _c);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  private copy(from: number, to: number) {
    for (const arr of [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.wx, this.wy, this.wz, this.qx, this.qy, this.qz, this.qw, this.size, this.floor, this.age, this.life]) arr[to] = arr[from];
    this.bounces[to] = this.bounces[from];
    for (let c = 0; c < 3; c++) this.tint[to * 3 + c] = this.tint[from * 3 + c];
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
