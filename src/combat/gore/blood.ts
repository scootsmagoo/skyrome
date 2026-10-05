/**
 * Blood: droplets, splats and pools.
 *
 * - Droplets: one THREE.Points of up to MAX_DROPS particles (one draw call), moved on the CPU with
 *   gravity and drag. They fall to the ground height sampled once per burst (or per spurt) and
 *   some of them leave a splat where they land.
 * - Splats and pools: one InstancedMesh of flat, lit decals (one draw call) over a ring buffer of
 *   MAX_DECALS, so the oldest blood goes first. Pools grow slowly under the dead.
 * - Spurts: an anchor (a stump) pulses droplets out along its +Y for a few seconds, like a heartbeat.
 */
import * as THREE from 'three';
import { Layer, type Physics } from '../../core/Physics';

const MAX_DROPS = 3000;
const MAX_DECALS = 420;
const GRAVITY = -9.8;
const DOWN = { x: 0, y: -1, z: 0 };

export interface Spurt {
  anchor: THREE.Object3D;
  until: number;
  t: number;
  /** Droplets per second at the pulse's peak. */
  rate: number;
  speed: number;
  ground: number;
  groundAt: number;
  carry: number;
}

interface Pool {
  index: number;
  x: number;
  y: number;
  z: number;
  q: THREE.Quaternion;
  size: number;
  from: number;
  grow: number;
  t: number;
}

const tmpV = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

export class BloodFx {
  readonly group = new THREE.Group();
  private readonly pos = new Float32Array(MAX_DROPS * 3);
  private readonly vel = new Float32Array(MAX_DROPS * 3);
  private readonly floor = new Float32Array(MAX_DROPS);
  private readonly splatChance = new Float32Array(MAX_DROPS);
  private count = 0;
  private readonly points: THREE.Points;
  private readonly decals: THREE.InstancedMesh;
  private next = 0;
  private used = 0;
  private readonly pools: Pool[] = [];
  private readonly spurts: Spurt[] = [];
  private splatBudget = 0;
  private time = 0;

  constructor(
    private readonly physics: Physics,
    private readonly rng: () => number = Math.random,
    /**
     * How far the drawn ground sits above the physics ground at (x, z): the city lays its paving
     * a few cm above the terrain collider, and blood must land on what you see.
     */
    private readonly surfaceLift: (x: number, z: number) => number = () => 0,
  ) {
    this.group.name = 'blood';
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(this.pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr);
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x5c0505, size: 0.045, sizeAttenuation: true, map: dropTexture(), alphaTest: 0.45, transparent: false }),
    );
    this.points.frustumCulled = false;
    this.points.name = 'blood:drops';
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: splatTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 0.28,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    mat.name = 'blood:splat';
    this.decals = new THREE.InstancedMesh(plane, mat, MAX_DECALS);
    this.decals.count = 0;
    this.decals.visible = false;
    this.decals.receiveShadow = true;
    this.decals.frustumCulled = false;
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decals.name = 'blood:splats';
    this.group.add(this.points, this.decals);
  }

  /** Ground height under a point (searching down from just above it), or `fallback`. */
  groundBelow(x: number, y: number, z: number, fallback = y - 1.2): { y: number; n: THREE.Vector3 } {
    const hit = this.physics.raycast({ x, y: y + 0.3, z }, DOWN, 12, Layer.World);
    return hit ? { y: hit.point.y + this.surfaceLift(x, z), n: hit.normal } : { y: fallback, n: Y };
  }

  /**
   * A burst of droplets from `at` along `dir` (unit), `n` of them, in a cone of `spread` (0..1),
   * at `speed` m/s (±40 %). `splat`: the share of them that leave a mark where they land.
   */
  burst(at: THREE.Vector3Like, dir: THREE.Vector3Like, n: number, speed = 3, spread = 0.55, splat = 0.18, ground?: number) {
    const g = ground ?? this.groundBelow(at.x, at.y, at.z).y;
    for (let i = 0; i < n; i++) {
      const k = this.count < MAX_DROPS ? this.count++ : Math.floor(this.rng() * MAX_DROPS);
      const s = speed * (0.6 + this.rng() * 0.8);
      const dx = dir.x + (this.rng() - 0.5) * 2 * spread;
      const dy = dir.y + (this.rng() - 0.3) * 2 * spread;
      const dz = dir.z + (this.rng() - 0.5) * 2 * spread;
      const l = Math.hypot(dx, dy, dz) || 1;
      this.pos[k * 3] = at.x + (this.rng() - 0.5) * 0.06;
      this.pos[k * 3 + 1] = at.y + (this.rng() - 0.5) * 0.06;
      this.pos[k * 3 + 2] = at.z + (this.rng() - 0.5) * 0.06;
      this.vel[k * 3] = (dx / l) * s;
      this.vel[k * 3 + 1] = (dy / l) * s;
      this.vel[k * 3 + 2] = (dz / l) * s;
      this.floor[k] = g;
      this.splatChance[k] = splat;
    }
  }

  /** A splat on the ground at (x, z) near height y: `size` m across. */
  splat(x: number, y: number, z: number, size: number, ground?: { y: number; n: THREE.Vector3 }) {
    const gr = ground ?? this.groundBelow(x, y, z);
    tmpQ.setFromUnitVectors(Y, gr.n);
    tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(Y, this.rng() * Math.PI * 2));
    const stretch = 0.75 + this.rng() * 0.5;
    this.place(this.alloc(), x, gr.y + 0.012, z, tmpQ, size * stretch, size / stretch);
  }

  /** A pool spreading under a body: grows to `size` m over `seconds`. */
  pool(x: number, y: number, z: number, size: number, seconds: number) {
    const gr = this.groundBelow(x, y, z);
    const q = new THREE.Quaternion().setFromUnitVectors(Y, gr.n).multiply(new THREE.Quaternion().setFromAxisAngle(Y, this.rng() * Math.PI * 2));
    const index = this.alloc(0.03);
    const p: Pool = { index, x, y: gr.y + 0.014, z, q, size, from: size * 0.15, grow: seconds, t: 0 };
    this.place(index, p.x, p.y, p.z, q, p.from, p.from);
    this.pools.push(p);
  }

  /** Spurt from a stump: `anchor`'s +Y is the way the blood leaves, for `seconds`. */
  spurt(anchor: THREE.Object3D, seconds: number, rate = 260, speed = 3.2) {
    this.spurts.push({ anchor, until: this.time + seconds, t: this.rng() * 0.5, rate, speed, ground: -Infinity, groundAt: -1, carry: 0 });
  }

  /** Stop spurts from anchors that are gone (a body cleared away). */
  forget(anchor: THREE.Object3D) {
    for (let i = this.spurts.length - 1; i >= 0; i--) if (this.spurts[i].anchor === anchor) this.spurts.splice(i, 1);
  }

  private alloc(dark = 0): number {
    const i = this.next;
    this.next = (this.next + 1) % MAX_DECALS;
    this.used = Math.max(this.used, this.next === 0 ? MAX_DECALS : this.next);
    this.decals.count = this.used;
    this.decals.visible = true;
    // A pool still growing in this slot is overwritten.
    for (let k = this.pools.length - 1; k >= 0; k--) if (this.pools[k].index === i) this.pools.splice(k, 1);
    // Fresh blood is a deep crimson, nearly black where it pools.
    const c = new THREE.Color().setHSL(0.995, 0.92, Math.max(0.03, 0.085 + this.rng() * 0.045 - dark));
    this.decals.setColorAt(i, c);
    if (this.decals.instanceColor) this.decals.instanceColor.needsUpdate = true;
    return i;
  }

  private place(i: number, x: number, y: number, z: number, q: THREE.Quaternion, sx: number, sz: number) {
    tmpM.compose(tmpV.set(x, y, z), q, tmpS.set(sx, 1, sz));
    this.decals.setMatrixAt(i, tmpM);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    if (!(dt > 0)) return;
    this.time += dt;
    this.splatBudget = Math.min(6, this.splatBudget + dt * 40);
    // Spurts: a heartbeat of ~75 per minute.
    for (let i = this.spurts.length - 1; i >= 0; i--) {
      const s = this.spurts[i];
      if (this.time > s.until || !s.anchor.parent) {
        this.spurts.splice(i, 1);
        continue;
      }
      s.t += dt;
      const fade = Math.min(1, (s.until - this.time) / 2);
      const beat = Math.pow(Math.max(0, Math.sin(s.t * Math.PI * 2 * 1.25)), 3);
      s.carry += s.rate * beat * fade * dt;
      const n = Math.floor(s.carry);
      if (n <= 0) continue;
      s.carry -= n;
      s.anchor.updateWorldMatrix(true, false);
      const at = tmpV.setFromMatrixPosition(s.anchor.matrixWorld);
      const dir = tmpUp.set(0, 1, 0).transformDirection(s.anchor.matrixWorld);
      if (this.time - s.groundAt > 0.25) {
        s.ground = this.groundBelow(at.x, at.y, at.z).y;
        s.groundAt = this.time;
      }
      this.burst(at, dir, n, s.speed * (0.6 + beat * 0.5), 0.18, 0.12, s.ground);
    }
    // Droplets.
    const p = this.pos;
    const v = this.vel;
    const drag = Math.exp(-0.6 * dt);
    for (let i = 0; i < this.count; ) {
      const j = i * 3;
      v[j + 1] += GRAVITY * dt;
      v[j] *= drag;
      v[j + 2] *= drag;
      p[j] += v[j] * dt;
      p[j + 1] += v[j + 1] * dt;
      p[j + 2] += v[j + 2] * dt;
      if (p[j + 1] <= this.floor[i]) {
        if (this.splatBudget >= 1 && this.rng() < this.splatChance[i]) {
          this.splatBudget -= 1;
          this.splat(p[j], this.floor[i], p[j + 2], 0.07 + this.rng() * 0.2, { y: this.floor[i], n: Y });
        }
        // Remove: move the last droplet into this slot.
        const last = --this.count;
        if (i !== last) {
          const l = last * 3;
          p[j] = p[l];
          p[j + 1] = p[l + 1];
          p[j + 2] = p[l + 2];
          v[j] = v[l];
          v[j + 1] = v[l + 1];
          v[j + 2] = v[l + 2];
          this.floor[i] = this.floor[last];
          this.splatChance[i] = this.splatChance[last];
        }
        continue;
      }
      i++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = this.count > 0;
    this.points.visible = this.count > 0;
    // Pools.
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pl = this.pools[i];
      pl.t += dt;
      const k = Math.min(1, pl.t / pl.grow);
      const s = pl.from + (pl.size - pl.from) * (1 - (1 - k) * (1 - k));
      this.place(pl.index, pl.x, pl.y, pl.z, pl.q, s, s * 0.85);
      if (k >= 1) this.pools.splice(i, 1);
    }
  }

  get droplets(): number {
    return this.count;
  }

  get decalCount(): number {
    return this.used;
  }

  clear() {
    this.count = 0;
    this.spurts.length = 0;
    this.pools.length = 0;
    this.used = 0;
    this.next = 0;
    this.decals.count = 0;
    this.decals.visible = false;
  }

  dispose() {
    this.group.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.PointsMaterial).map?.dispose();
    (this.points.material as THREE.Material).dispose();
    this.decals.geometry.dispose();
    (this.decals.material as THREE.MeshStandardMaterial).map?.dispose();
    (this.decals.material as THREE.Material).dispose();
  }
}

/** A round droplet sprite. */
function dropTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.7, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** An irregular splat: a wet core, smaller drops around it and a few streaks (white; tinted per instance). */
function splatTexture(): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(255,255,255,1)';
  const blob = (x: number, y: number, rad: number) => {
    g.beginPath();
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = rad * (0.75 + r() * 0.45);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  };
  blob(S / 2, S / 2, S * 0.24);
  for (let i = 0; i < 9; i++) blob(S / 2 + (r() - 0.5) * S * 0.36, S / 2 + (r() - 0.5) * S * 0.36, S * (0.06 + r() * 0.09));
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = S * (0.25 + r() * 0.22);
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.008 + r() * 0.022));
  }
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,1)';
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    g.lineWidth = 3 + r() * 6;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a) * S * 0.18, S / 2 + Math.sin(a) * S * 0.18);
    g.lineTo(S / 2 + Math.cos(a) * S * (0.32 + r() * 0.14), S / 2 + Math.sin(a) * S * (0.32 + r() * 0.14));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
