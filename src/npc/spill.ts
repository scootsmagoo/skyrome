/**
 * Wine on the ground: the stain an amphora leaves where it breaks.
 *
 * One InstancedMesh of flat, lit decals over a small ring buffer (one draw call, hidden while
 * empty), like the blood pools in combat/gore/blood.ts. A stain spreads out over a moment, darkens
 * as it soaks in and shrinks away after a while. The shape is a ragged blob with a few thrown
 * drops, painted once into an alpha map.
 */
import * as THREE from 'three';

export const MAX_STAINS = 6;
/** Seconds a stain takes to spread, how long it lasts and how long it takes to dry away. */
const SPREAD = 0.9;
const LIFE = 70;
const DRY = 20;

interface Stain {
  index: number;
  x: number;
  y: number;
  z: number;
  size: number;
  turn: number;
  born: number;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const YAXIS = new THREE.Vector3(0, 1, 0);

/** The stain's alpha: a ragged puddle with lobes and flung drops, deterministic. */
function stainTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  if (!g) return null;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  g.fillStyle = '#fff';
  g.beginPath();
  const steps = 36;
  const lobes = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = N * (0.27 + 0.05 * Math.sin(a * 3 + lobes[0]) + 0.035 * Math.sin(a * 5 + lobes[1]) + 0.02 * Math.sin(a * 9 + lobes[2]) + (rnd() - 0.5) * 0.02);
    const x = N / 2 + Math.cos(a) * r;
    const y = N / 2 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  // Flung drops, a few beads, mostly out along a couple of directions.
  for (let i = 0; i < 22; i++) {
    const a = (i % 3) * 2.1 + rnd() * 1.1;
    const d = N * (0.3 + rnd() * 0.17);
    g.beginPath();
    g.arc(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, 1 + rnd() * 2.6, 0, Math.PI * 2);
    g.fill();
  }
  // Soft edge.
  const out = document.createElement('canvas');
  out.width = out.height = N;
  const og = out.getContext('2d')!;
  og.filter = 'blur(1.5px)';
  og.drawImage(c, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export class WineStains {
  readonly mesh: THREE.InstancedMesh;
  private readonly stains: Stain[] = [];
  private next = 0;
  private time = 0;
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly tex: THREE.CanvasTexture | null;

  constructor(parent: THREE.Object3D, private readonly max = MAX_STAINS) {
    this.tex = stainTexture();
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x42091a,
      roughness: 0.18,
      metalness: 0,
      transparent: true,
      opacity: 0.96,
      alphaMap: this.tex,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.name = 'wine-stains';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(this.mesh);
  }

  get count(): number {
    return this.stains.length;
  }

  /** A stain of about `size` metres across at (x, y, z) (y: the ground's height). */
  add(x: number, y: number, z: number, size: number, turn = 0) {
    const st: Stain = { index: this.next, x, y: y + 0.03, z, size, turn, born: this.time };
    this.next = (this.next + 1) % this.max;
    const old = this.stains.findIndex((o) => o.index === st.index);
    if (old >= 0) this.stains.splice(old, 1);
    this.stains.push(st);
    this.write(st, 0);
    this.refresh();
  }

  update(dt: number) {
    this.time += dt;
    if (this.stains.length === 0) return;
    let changed = false;
    for (let i = this.stains.length - 1; i >= 0; i--) {
      const st = this.stains[i];
      const age = this.time - st.born;
      if (age > LIFE + DRY) {
        this.hide(st.index);
        this.stains.splice(i, 1);
        changed = true;
        continue;
      }
      // Only while spreading or drying away does the matrix change.
      if (age < SPREAD + 0.05 || age > LIFE) {
        this.write(st, age);
        changed = true;
      }
    }
    if (changed) this.refresh();
  }

  clear() {
    for (const st of this.stains) this.hide(st.index);
    this.stains.length = 0;
    this.refresh();
  }

  private hide(index: number) {
    this.mesh.setMatrixAt(index, m4.makeScale(0, 0, 0));
  }

  private write(st: Stain, age: number) {
    const spread = Math.min(1, age / SPREAD);
    const grow = 1 - Math.pow(1 - spread, 3);
    const dry = age > LIFE ? Math.max(0, 1 - (age - LIFE) / DRY) : 1;
    const k = st.size * (0.15 + 0.85 * grow) * (0.4 + 0.6 * dry);
    q.setFromAxisAngle(YAXIS, st.turn).multiply(FLAT);
    m4.compose(p.set(st.x, st.y, st.z), q, s.set(k, k, 1));
    this.mesh.setMatrixAt(st.index, m4);
  }

  /** Instances are addressed by slot, so the drawn range covers every slot in use. */
  private refresh() {
    let top = 0;
    for (const st of this.stains) top = Math.max(top, st.index + 1);
    this.mesh.count = top;
    this.mesh.visible = top > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.tex?.dispose();
  }
}
