/**
 * Runtime helpers for the palcirc builders: instancing a MeshBuilder part many times, light
 * requests that wait for the light pool (it is installed with the sky, after the landmarks), and
 * small animated effects (dripping water) driven by one shared System.
 */
import * as THREE from 'three';
import type { Game, System } from '../../../../core/Game';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { LightRequest } from '../../../lights/LightPool';
import { AUDIT, auditInstanced } from '../../../../dev/audit/geomAudit';

/**
 * Turns every per-material mesh of `b` into an InstancedMesh with the given instance matrices
 * (in the landmark's local frame). One draw call per material for any number of copies.
 */
export function instanced(b: MeshBuilder, name: string, matrices: THREE.Matrix4[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  if (!matrices.length || b.isEmpty) return g;
  const src = b.build(name);
  for (const child of src.children) {
    const mesh = child as THREE.Mesh;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = mesh.castShadow;
    im.receiveShadow = true;
    im.name = mesh.name;
    im.computeBoundingBox();
    im.computeBoundingSphere();
    g.add(im);
  }
  if (AUDIT) auditInstanced(name, g, matrices);
  return g;
}

/** Instance matrix for a part whose local −z should face (nx, nz), placed at (x, y, z), optional x scale. */
export function facing(x: number, y: number, z: number, nx: number, nz: number, sx = 1): THREE.Matrix4 {
  // Local axes: z = −n (inward), y = up, x = y × z.
  const zAxis = new THREE.Vector3(-nx, 0, -nz).normalize();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(xAxis.multiplyScalar(sx), yAxis, zAxis);
  m.setPosition(x, y, z);
  return m;
}

interface Pending {
  game: Game;
  run: (game: Game) => void;
}

const pending: Pending[] = [];
let waiter: (System & { game: Game }) | null = null;

/**
 * Runs `fn` once the game's light pool exists (next frame after installSky). Landmark builders run
 * before the sky is installed, so lamps are requested from here.
 */
export function whenLights(game: Game, fn: (game: Game) => void) {
  if (game.lights) {
    fn(game);
    return;
  }
  pending.push({ game, run: fn });
  if (waiter && waiter.game === game) return;
  const sys: System & { game: Game; name: string } = {
    name: 'palcirc-lights',
    priority: 200,
    game,
    update() {
      if (!game.lights) return;
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].game !== game) continue;
        const p = pending.splice(i, 1)[0];
        try {
          p.run(game);
        } catch (err) {
          console.error('[palcirc] light request failed', err);
        }
      }
      game.removeSystem(sys);
      if (waiter === sys) waiter = null;
    },
  };
  waiter = sys;
  game.addSystem(sys);
}

/** Requests lamps (positions in the landmark's local frame) through the light pool. */
export function requestLamps(game: Game, toWorld: THREE.Matrix4, lamps: (LightRequest & { position: THREE.Vector3 })[]) {
  if (!lamps.length || typeof document === 'undefined') return;
  const world = lamps.map((l) => ({ ...l, position: l.position.clone().applyMatrix4(toWorld) }));
  whenLights(game, (g) => {
    for (const l of world) g.lights.request(l);
  });
}

// ---------------------------------------------------------------- dripping water

/**
 * Falling drops: an InstancedMesh of small streaks that fall from emitters (local points) to a
 * floor height and restart, GPU-cheap (one draw call) and updated by one tiny System.
 */
export class Drips {
  readonly mesh: THREE.InstancedMesh;
  private readonly t: Float32Array;
  private readonly speed: Float32Array;
  private readonly m = new THREE.Matrix4();

  constructor(
    readonly emitters: { x: number; y: number; z: number; floor: number }[],
    perEmitter = 3,
  ) {
    const geo = new THREE.CylinderGeometry(0.012, 0.006, 0.22, 4, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbfd6e0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
    const n = emitters.length * perEmitter;
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.name = 'drips';
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.t = new Float32Array(n);
    this.speed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.t[i] = (i * 0.618) % 1;
      this.speed[i] = 0.55 + ((i * 37) % 11) / 22;
    }
    this.update(0);
  }

  update(dt: number) {
    const per = this.t.length / Math.max(1, this.emitters.length);
    for (let i = 0; i < this.t.length; i++) {
      const e = this.emitters[Math.floor(i / per)];
      this.t[i] = (this.t[i] + dt * this.speed[i]) % 1;
      // Free fall: y = y0 − ½ g t², scaled so a drop reaches the floor at t = 1.
      const fall = (e.y - e.floor) * this.t[i] * this.t[i];
      const jitter = ((i * 13) % 7) * 0.05 - 0.15;
      this.m.makeTranslation(e.x + jitter, e.y - fall, e.z + (((i * 7) % 5) * 0.05 - 0.1));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const dripSets = new WeakMap<Game, Drips[]>();
const dripPos = new THREE.Vector3();

/** Visible and within 200 m of the camera (the mesh and every ancestor shown). */
function dripsLive(game: Game, drips: Drips): boolean {
  let o: THREE.Object3D | null = drips.mesh;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  if (!drips.mesh.parent) return true;
  return game.camera.position.distanceToSquared(dripPos.setFromMatrixPosition(drips.mesh.matrixWorld)) <= 200 * 200;
}

/**
 * Animates sets of drips while they are visible: one System per game, shared by every set
 * registered with it (it is added with the first set and never allocates per frame).
 */
export function animateDrips(game: Game, drips: Drips) {
  const list = dripSets.get(game);
  if (list) {
    list.push(drips);
    return;
  }
  const sets = [drips];
  dripSets.set(game, sets);
  const sys: System & { name: string } = {
    name: 'palcirc-drips',
    priority: 60,
    update(dt: number) {
      const step = Math.min(dt, 0.05);
      for (const d of sets) if (dripsLive(game, d)) d.update(step);
    },
  };
  game.addSystem(sys);
}

// ---------------------------------------------------------------- instance LOD

/**
 * Distance-based selection of instances for the instanced parts of a long landmark (the Circus
 * facade): near sets draw only the instances within `radius` of the camera, far sets only the
 * others. Instances are repacked into the first slots and `count` is set, so the draw calls stay
 * the same and far detail costs nothing. Positions are in the landmark's local frame.
 */
export class InstanceLod {
  private readonly sets: { meshes: THREE.InstancedMesh[]; mats: THREE.Matrix4[]; pos: THREE.Vector3[]; near: boolean }[] = [];
  private readonly last = new THREE.Vector3(Infinity, 0, 0);

  constructor(public radius: number) {}

  /** Registers the InstancedMeshes of `group` (built by `instanced` with these matrices). */
  add(group: THREE.Group, mats: THREE.Matrix4[], mode: 'near' | 'far') {
    const meshes = group.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);
    if (!meshes.length) return;
    this.sets.push({ meshes, mats, pos: mats.map((m) => new THREE.Vector3().setFromMatrixPosition(m)), near: mode === 'near' });
    if (mode === 'far') for (const m of meshes) { m.count = 0; m.visible = false; }
  }

  /** Re-selects the instances for a camera at `cam` (local frame); cheap no-op if it barely moved. */
  update(cam: THREE.Vector3, force = false) {
    if (!force && cam.distanceToSquared(this.last) < 36) return;
    this.last.copy(cam);
    const r2 = this.radius * this.radius;
    for (const s of this.sets) {
      let k = 0;
      for (let i = 0; i < s.mats.length; i++) {
        if (s.pos[i].distanceToSquared(cam) < r2 !== s.near) continue;
        for (const m of s.meshes) m.setMatrixAt(k, s.mats[i]);
        k++;
      }
      for (const m of s.meshes) {
        m.count = k;
        m.visible = k > 0; // empty InstancedMeshes still cost a program bind each
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  get size() {
    return this.sets.length;
  }
}

/** Drives an InstanceLod from the camera, four times a second, while its landmark is visible. */
export function attachLod(game: Game, obj: THREE.Object3D, lod: InstanceLod) {
  if (!lod.size || typeof document === 'undefined') return;
  const inv = new THREE.Matrix4();
  const p = new THREE.Vector3();
  let t = 1;
  const sys: System & { name: string } = {
    name: 'palcirc-lod',
    priority: 96,
    update(dt: number) {
      t += dt;
      if (t < 0.25) return;
      t = 0;
      if (!obj.parent || !obj.visible) return;
      inv.copy(obj.matrixWorld).invert();
      lod.update(p.copy(game.camera.position).applyMatrix4(inv));
    },
  };
  game.addSystem(sys);
}
