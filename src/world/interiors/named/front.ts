/**
 * The street doors of the named shops (docs/modules/interiors.md, "Named cells"). The Silver Pig, the
 * arms shop and the bankers' shops are places in the content (spots on the Vicus Tuscus and the Sacra
 * Via, src/content/places.ts), not buildings of their own: the city builds the street's blocks as
 * the player comes near, so the wall a shop's door belongs in is not there until then. So the door is
 * hung when the player is near: the nearest plain, face-on wall within a few metres of the spot (found
 * with rays), a stone porch and a plank door with the door system's lock, key, pick and blows, and the
 * way into the cell behind it. When the player goes away (or the wall does) the door is taken down; its
 * lock state is the door system's own and outlives it.
 *
 * Pure parts (the wall search's scoring, the door's frame) are in the exports; the rest needs a game.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Game, System } from '../../../core/Game';
import { Layer } from '../../../core/Physics';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { DoorDef } from '../../doors/DoorSystem';
import type { DoorLock } from '../../doors/rules';
import { primeArea } from '../../safeGround';
import type { Vec3 } from '../types';

declare module '../../../core/Game' {
  interface Game {
    /** The named shops' street doors (named/front.ts). */
    namedFronts?: NamedFronts;
  }
}

export interface FrontSpec {
  /** The door's id (the door system keeps its lock state under it). */
  id: string;
  /** The location the wall is looked for around. */
  spot: string;
  label: string;
  width: number;
  height: number;
  style: 'plank' | 'studded';
  lock?: DoorLock;
  owner?: { id: string; name: string };
  /** The cell behind it, and where the player appears (local) facing which way. */
  cell: string;
  entry: { position: Vec3; heading: number };
  /** A shop sign hung beside the door (a signboard prop), on this side (+1 right of the door as seen from the street, −1 left). */
  sign?: 1 | -1;
  /**
   * Not a door in a wall but a hatch in the ground (the burned taberna has no walls): `dx`, `dz` metres from the
   * spot, the nearest level, clear ground to there. `lock`, `owner`, `width`, `height` and `sign` are not used.
   */
  hatch?: { dx: number; dz: number; verb: string };
  /** How far from the spot to look for the wall (m). Default 11. */
  reach?: number;
  /** Extra wall to ask for either side of the door and its jambs (m): the door is taken down when the wall's ends are only just beyond it. Default 0.35. */
  margin?: number;
  /** Extra marks drawn with the porch, in the door's frame (the leaves at z = 0, the wall face at z = PORCH, the street at −z): a sign scratched on the plaster. */
  mark?: (d: Draw) => void;
}

/** What the wall search found: the point on the wall face and the face's outward unit normal (horizontal). */
export interface WallFace {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** From the spot. */
  distance: number;
  /** Ground height at the foot of the door. */
  groundY: number;
}

export const PORCH = 0.34; // depth of the porch: the leaves stand this far out from the wall
const SEARCH_EVERY = 0.8;
const PLACE_WITHIN = 26; // m: the street's walls have colliders this close (city nearR is 30)
const KEEP_WITHIN = 60;

const DOWN = { x: 0, y: -1, z: 0 };
const DOWN_DIR = DOWN;

/** The door's frame matrix on a wall face: origin in the leaves' plane (PORCH out), x along the wall, +z into the building. */
export function frontMatrix(face: Pick<WallFace, 'point' | 'normal' | 'groundY'>): THREE.Matrix4 {
  const n = face.normal;
  const z = new THREE.Vector3(-n.x, 0, -n.z);
  const x = new THREE.Vector3(-n.z, 0, n.x);
  const m = new THREE.Matrix4().makeBasis(x, new THREE.Vector3(0, 1, 0), z);
  m.setPosition(face.point.x + n.x * PORCH, face.groundY, face.point.z + n.z * PORCH);
  return m;
}

/** The porch round a door of `width` × `height` in its own frame (the leaves at z = 0, the wall face at z = PORCH). */
export function porch(d: Draw, width: number, height: number, sign?: 1 | -1) {
  const hw = width / 2;
  const jamb = 0.22;
  const deep = PORCH + 0.06;
  // Jambs and lintel in stone, a worn threshold, the dark of the doorway behind the leaves.
  for (const s of [-1, 1]) d.span('travertine', s * hw, 0, -0.06, s * (hw + jamb), height + 0.18, deep, { collide: true });
  d.span('travertine', -hw - jamb * 1.4, height, -0.08, hw + jamb * 1.4, height + 0.3, deep, { collide: true });
  d.span('travertine', -hw - 0.05, 0, -0.18, hw + 0.05, 0.07, deep);
  d.span('black', -hw, 0.02, PORCH - 0.04, hw, height, PORCH - 0.02, { shadow: false });
  if (sign) placeProp(d, 'signboard', sign * (hw + jamb + 0.85), 0, -0.02, 0, { collide: false });
}

/** Score a candidate wall for a door: nearer the spot is better; a wall that does not run level is worse. */
export function faceScore(distance: number, groundDelta: number, lateral: number): number {
  return distance + groundDelta * 4 + lateral * 3;
}

/** Look for the door's wall around (cx, cz): needs the street's colliders (the city primed near the player). */
export function findWall(game: Game, cx: number, cz: number, nearY: number, reach: number, width = 1.3, height = 2.3, margin = 0.35): WallFace | null {
  const ph = game.physics;
  const g0 = ph.raycast({ x: cx, y: nearY + 3, z: cz }, DOWN, 12, Layer.World);
  if (!g0 || g0.normal.y < 0.8) return null;
  const gy = g0.point.y;
  const o = { x: cx, y: gy + 1.3, z: cz };
  const hw = width / 2 + margin;
  let best: (WallFace & { score: number }) | null = null;
  const N = 64;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const dir = { x: Math.cos(a), y: 0, z: Math.sin(a) };
    const hit = ph.raycast(o, dir, reach, Layer.World);
    if (!hit || hit.distance < 1.2 || Math.abs(hit.normal.y) > 0.3) continue;
    const n = new THREE.Vector3(hit.normal.x, 0, hit.normal.z).normalize();
    if (n.x * dir.x + n.z * dir.z > -0.7) continue; // face-on enough to hang a door
    const p = hit.point;
    const t = new THREE.Vector3(-n.z, 0, n.x);
    // The wall runs level for the width of the door and the jambs, and up to the lintel.
    let ok = true;
    let lateral = 0;
    for (const s of [-hw, -hw / 2, 0, hw / 2, hw]) {
      for (const h of [0.5, 1.5, height + 0.05]) {
        const from = { x: p.x + n.x * 0.6 + t.x * s, y: gy + h, z: p.z + n.z * 0.6 + t.z * s };
        const w = ph.raycast(from, { x: -n.x, y: 0, z: -n.z }, 1.2, Layer.World);
        if (!w || Math.abs(w.distance - 0.6) > 0.12) {
          ok = false;
          break;
        }
        lateral = Math.max(lateral, Math.abs(w.distance - 0.6));
      }
      if (!ok) break;
    }
    if (!ok) continue;
    // Room in front: nothing at knee or head height within 1.6 m, across the door's width.
    for (const s of [-hw, 0, hw]) {
      for (const h of [0.5, 1.7]) {
        const from = { x: p.x + n.x * 0.08 + t.x * s, y: gy + h, z: p.z + n.z * 0.08 + t.z * s };
        if (ph.raycast(from, n, 1.6, Layer.World)) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    // Level ground before the door (a step of a few cm is the threshold), and the floor of the door's foot.
    let groundDelta = 0;
    let foot = gy;
    for (const out of [0.15, 0.7, 1.4]) {
      const gx = p.x + n.x * out, gz = p.z + n.z * out;
      const down = ph.raycast({ x: gx, y: gy + 1.5, z: gz }, DOWN, 3, Layer.World);
      if (!down || down.normal.y < 0.8) {
        ok = false;
        break;
      }
      groundDelta = Math.max(groundDelta, Math.abs(down.point.y - gy));
      if (out === 0.7) foot = down.point.y;
    }
    if (!ok || groundDelta > 0.35) continue;
    const score = faceScore(hit.distance, groundDelta, lateral);
    if (!best || score < best.score) best = { point: p.clone(), normal: n, distance: hit.distance, groundY: foot, score };
  }
  return best;
}

/**
 * Level, clear ground for a hatch near (x, z): the point itself, else the nearest ring point where the ground is flat to
 * within 15 cm under a metre and a half square and nothing stands over it (a wall, a stall, a person-high prop).
 */
export function findHatchSpot(game: Game, x: number, z: number, nearY: number): { x: number; y: number; z: number } | null {
  const ph = game.physics;
  const tryAt = (px: number, pz: number) => {
    const g = ph.raycast({ x: px, y: nearY + 4, z: pz }, DOWN, 14, Layer.World);
    if (!g || g.normal.y < 0.92) return null;
    const y = g.point.y;
    for (const [ox, oz] of [[0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]]) {
      const h = ph.raycast({ x: px + ox, y: y + 1.5, z: pz + oz }, DOWN, 3, Layer.World);
      if (!h || Math.abs(h.point.y - y) > 0.15) return null;
    }
    if (ph.raycast({ x: px, y: y + 0.1, z: pz }, { x: 0, y: 1, z: 0 }, 2.2, Layer.World)) return null;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (ph.raycast({ x: px, y: y + 0.9, z: pz }, { x: Math.cos(a), y: 0, z: Math.sin(a) }, 1.0, Layer.World)) return null;
    }
    return { x: px, y, z: pz };
  };
  const here = tryAt(x, z);
  if (here) return here;
  for (let r = 1.2; r <= 6; r += 1.2) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 1.2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = tryAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (p) return p;
    }
  }
  return null;
}

/** A cellar hatch in the ground: a timber frame, the dark of the stair below, the burnt leaf thrown back. Origin at its middle, y = 0 the ground. */
export function hatchModel(d: Draw) {
  const hw = 0.55;
  d.span('black', -hw, 0.004, -hw, hw, 0.012, hw, { shadow: false });
  for (const s of [-1, 1]) {
    d.span('wood_dark', s * hw, 0, -hw - 0.1, s * (hw + 0.12), 0.1, hw + 0.1);
    d.span('wood_dark', -hw - 0.1, 0, s * hw, hw + 0.1, 0.1, s * (hw + 0.12));
  }
  // The leaf, thrown back on its hinge (the −z edge), charred and half gone.
  const leaf = d.at(0, 0.1, -hw - 0.04, 0);
  leaf.box('wood_dark', 0, 0.5, -0.28, 1.05, 0.07, 1.0, { rx: -1.15 });
  leaf.box('black', 0.2, 0.52, -0.3, 0.5, 0.075, 0.6, { rx: -1.15 });
  // Two rails of the stair's ladder showing over the lip.
  for (const x of [-0.3, 0.3]) d.rod('wood', { x, y: 0.05, z: 0.35 }, { x, y: -0.3, z: 0.1 }, 0.025, 5);
}

interface Placed {
  face: WallFace;
  object: THREE.Object3D;
  colliders: ReturnType<Game['physics']['addBox']>[];
  /** Half the door's width plus its jambs and a margin: where the wall is checked from (the door's own colliders stand in front of its middle). */
  side: number;
  /** Checks in a row that did not find the wall (a block rebuilding for a moment is not the wall gone). */
  missed: number;
  /** A hatch's prompt (removed with it); a door's is the door system's. */
  prompt?: () => void;
  hatch?: boolean;
}

/** The street doors: the system that hangs and takes down each one as the player comes and goes. */
export class NamedFronts implements System {
  readonly name = 'named-fronts';
  readonly priority = 62;
  private readonly specs = new Map<string, FrontSpec>();
  private readonly placed = new Map<string, Placed>();
  private readonly tried = new Map<string, number>();
  private acc = 0;
  private clock = 0;

  constructor(private readonly game: Game) {}

  add(spec: FrontSpec) {
    this.specs.set(spec.id, spec);
  }

  /** The place before a door (street level, outside it) and the heading out of it, if the door is hung now. */
  standing(id: string): { position: THREE.Vector3; heading: number } | null {
    const p = this.placed.get(id);
    if (!p) return null;
    const n = p.face.normal;
    const out = p.hatch ? 1.5 : 1.0;
    return { position: new THREE.Vector3(p.face.point.x + n.x * out, p.face.groundY + 0.05, p.face.point.z + n.z * out), heading: Math.atan2(n.x, n.z) };
  }

  isPlaced(id: string): boolean {
    return this.placed.has(id);
  }

  update(dt: number) {
    this.acc += dt;
    this.clock += dt;
    if (this.acc < SEARCH_EVERY) return;
    this.acc = 0;
    const g = this.game;
    const pl = g.player?.position;
    if (!pl || !g.doors || !g.locations) return;
    // Inside a cell the player is far below the street: the doors above stay as they are, but the door of the cell
    // they are in must exist (a game saved inside one loads there), so it is hung now, the street primed for it.
    const inside = g.interiors?.current() ?? null;
    if (inside) {
      for (const spec of this.specs.values()) {
        if (spec.cell !== inside || this.placed.has(spec.id) || (this.tried.get(spec.id) ?? -9) + 3 > this.clock) continue;
        const loc = g.locations.get(spec.spot);
        if (!loc) continue;
        this.tried.set(spec.id, this.clock);
        const y = loc.position.y ?? 0;
        primeArea(g, { x: loc.position.x, y, z: loc.position.z });
        this.tryHang(spec, loc.position.x, loc.position.z, y);
      }
      return;
    }
    for (const spec of this.specs.values()) {
      const loc = g.locations.get(spec.spot);
      if (!loc) continue;
      const dist = Math.hypot(loc.position.x - pl.x, loc.position.z - pl.z);
      const here = this.placed.get(spec.id);
      if (here) {
        if (this.stillThere(here)) here.missed = 0;
        else here.missed++;
        if (dist > KEEP_WITHIN || here.missed >= 3) this.take(spec.id);
        continue;
      }
      if (dist > PLACE_WITHIN || (this.tried.get(spec.id) ?? -9) + 2.4 > this.clock) continue;
      this.tried.set(spec.id, this.clock);
      this.tryHang(spec, loc.position.x, loc.position.z, pl.y);
    }
  }

  private tryHang(spec: FrontSpec, x: number, z: number, nearY: number) {
    if (spec.hatch) {
      const at = findHatchSpot(this.game, x + spec.hatch.dx, z + spec.hatch.dz, nearY);
      if (at) this.hangHatch(spec, at);
      return;
    }
    const face = findWall(this.game, x, z, nearY, spec.reach ?? 11, spec.width, spec.height, spec.margin);
    if (face) this.hang(spec, face);
  }

  /** Is the wall still behind the door (the block may have streamed out)? */
  private stillThere(p: Placed): boolean {
    if (p.hatch) {
      const g = this.game.physics.raycast({ x: p.face.point.x, y: p.face.groundY + 1.0, z: p.face.point.z }, DOWN_DIR, 2.0, Layer.World);
      return !!g && Math.abs(g.point.y - p.face.groundY) < 0.3;
    }
    const n = p.face.normal;
    for (const s of [-p.side, p.side]) {
      const o = { x: p.face.point.x + n.x * 0.6 - n.z * s, y: p.face.groundY + 1.3, z: p.face.point.z + n.z * 0.6 + n.x * s };
      const w = this.game.physics.raycast(o, { x: -n.x, y: 0, z: -n.z }, 1.0, Layer.World);
      if (!w || Math.abs(w.distance - 0.6) > 0.15) return false;
    }
    return true;
  }

  private hang(spec: FrontSpec, face: WallFace) {
    const g = this.game;
    const m = frontMatrix(face);
    const b = new MeshBuilder();
    const d = new Draw(b, new THREE.Matrix4());
    porch(d, spec.width, spec.height, spec.sign);
    spec.mark?.(d);
    const object = b.build(`front:${spec.id}`);
    object.applyMatrix4(m);
    object.updateMatrixWorld(true);
    g.scene.add(object);
    const colliders: Placed['colliders'] = [];
    for (const c of b.colliders) {
      if (c.kind !== 'box') continue;
      const center = c.center.clone().applyMatrix4(m);
      const q = new THREE.Quaternion().setFromRotationMatrix(m).multiply(c.rotation ?? new THREE.Quaternion());
      colliders.push(g.physics.addOrientedBox(center, c.half, q, { owner: `front:${spec.id}`, layer: Layer.World }));
    }
    const def: DoorDef = {
      id: spec.id,
      label: spec.label,
      matrix: m,
      width: spec.width,
      height: spec.height,
      leaves: spec.width > 1.3 ? 2 : 1,
      style: spec.style,
      lock: spec.lock,
      owner: spec.owner,
      leadsTo: (game) => void game.interiors?.enter(spec.cell, spec.entry.position, spec.entry.heading),
    };
    g.doors!.add(def, 'named-fronts');
    this.placed.set(spec.id, { face, object, colliders, side: spec.width / 2 + 0.22 + 0.4, missed: 0 });
  }

  private hangHatch(spec: FrontSpec, at: { x: number; y: number; z: number }) {
    const g = this.game;
    const b = new MeshBuilder();
    hatchModel(new Draw(b, new THREE.Matrix4()));
    const object = b.build(`front:${spec.id}`);
    object.position.set(at.x, at.y, at.z);
    object.updateMatrixWorld(true);
    g.scene.add(object);
    const pos = new THREE.Vector3(at.x, at.y + 0.4, at.z);
    const prompt = g.interactions?.add({
      id: `door:${spec.id}`,
      reach: 2.4,
      position: () => pos,
      verb: () => spec.hatch!.verb,
      label: () => spec.label,
      interact: (game) => void game.interiors?.enter(spec.cell, spec.entry.position, spec.entry.heading),
    });
    const face: WallFace = { point: new THREE.Vector3(at.x, at.y, at.z), normal: new THREE.Vector3(1, 0, 0), distance: 0, groundY: at.y };
    this.placed.set(spec.id, { face, object, colliders: [], side: 0, missed: 0, prompt, hatch: true });
  }

  private take(id: string) {
    const p = this.placed.get(id);
    if (!p) return;
    this.placed.delete(id);
    p.prompt?.();
    this.game.doors?.remove(id);
    p.object.removeFromParent();
    p.object.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const c of p.colliders) this.game.physics.removeCollider(c);
  }

  dispose() {
    for (const id of [...this.placed.keys()]) this.take(id);
  }
}

/** Where a front door's cell puts the player on the way out: before the door if it is hung, else at its spot (cheap: routes ask). */
export function streetExit(game: Game, frontId: string, spotId: string): { position: THREE.Vector3; heading: number } | null {
  const s = game.namedFronts?.standing(frontId);
  if (s) return s;
  const loc = game.locations?.get(spotId);
  return loc ? { position: new THREE.Vector3(loc.position.x, loc.position.y ?? 0, loc.position.z), heading: 0 } : null;
}
