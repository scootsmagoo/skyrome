/**
 * Extras of the Forum of Trajan complex: some forty idle figures at the builders' spots, so the
 * showpiece is not a ghost town on the eve of the Column's dedication. Praetorians at the gates,
 * the consul, praetor and herald on the tribunal, priests at the altars, garland and incense
 * sellers, a teacher and his pupils in the exedrae, librarians and readers, the courts in the
 * basilica, the clerks, shopkeepers and the Lares shrine in the Markets.
 *
 * This is a stop-gap until a population system consumes landmark spots (src/npc has definitions
 * but no spawner yet). Each figure is an Actor (a capsule, so the player cannot walk through it)
 * with a procedural HumanoidAvatar playing an idle loop. There is no AI, dialogue or schedule beyond
 * an hour window per figure. Figures spawn within SPAWN m of the camera and are removed beyond
 * DESPAWN, at most a couple per tick, so the cost is paid only near the complex.
 * `game.trajanExtras.enabled = false` (or `?extras=0` in the URL) turns them off; a future NPC
 * system should do that when it takes over these spots.
 */
import * as THREE from 'three';
import { Actor, type IdleLoop } from '../../../actors/Actor';
import { createHumanoid } from '../../../actors/avatar/HumanoidAvatar';
import { randomAppearance, type AvatarRole } from '../../../actors/avatar/variants';
import type { Game, System } from '../../../core/Game';
import { Layer } from '../../../core/Physics';
import { Rng } from '../../../core/Rng';

declare module '../../../core/Game' {
  interface Game {
    trajanExtras?: TrajanExtras;
  }
}

export interface ExtraDef {
  /** The landmark and the spot (by id) the figure occupies. */
  lm: string;
  spot: string;
  role: AvatarRole;
  idle: IdleLoop;
  /** Hours of the day the figure is there, [from, to) (may wrap past midnight). Default: always. */
  hours?: readonly [number, number];
  /** Carries a torch while it is dark. */
  torch?: boolean;
}

const DAY: readonly [number, number] = [6.5, 18.5];
const SHOPS: readonly [number, number] = [4.5, 20.5];
const COURTS: readonly [number, number] = [7, 16];

/** Who stands (or sits) where. Spots that a landmark does not provide are skipped. */
export const EXTRAS: readonly ExtraDef[] = [
  // The square and the dedication.
  { lm: 'forum-trajan', spot: 'forum-guard-gatene', role: 'praetorian', idle: 'guard', torch: true },
  { lm: 'forum-trajan', spot: 'forum-guard-gatesw', role: 'praetorian', idle: 'guard', torch: true },
  { lm: 'forum-trajan', spot: 'forum-vendor-garlands', role: 'plebeian-woman', idle: 'stand', hours: SHOPS },
  { lm: 'forum-trajan', spot: 'forum-vendor-incense', role: 'syrian', idle: 'stand', hours: SHOPS },
  { lm: 'forum-trajan', spot: 'forum-tribunal-consul', role: 'patrician-man', idle: 'stand', hours: [4, 13] },
  { lm: 'forum-trajan', spot: 'forum-tribunal-praetor', role: 'patrician-man', idle: 'talk', hours: [4, 13] },
  { lm: 'forum-trajan', spot: 'forum-tribunal-herald', role: 'freedman', idle: 'talk', hours: [4, 13] },
  { lm: 'forum-trajan', spot: 'forum-altar', role: 'priest', idle: 'pray', hours: [4, 21] },
  { lm: 'forum-trajan', spot: 'forum-exedrane-teacher', role: 'greek', idle: 'talk', hours: DAY },
  { lm: 'forum-trajan', spot: 'forum-exedrane-bench1', role: 'plebeian-man', idle: 'sit', hours: DAY },
  { lm: 'forum-trajan', spot: 'forum-exedrane-bench2', role: 'patrician-man', idle: 'sit', hours: DAY },
  { lm: 'forum-trajan', spot: 'forum-exedrane-bench3', role: 'freedman', idle: 'sit', hours: DAY },
  { lm: 'forum-trajan', spot: 'forum-exedrasw-teacher', role: 'greek', idle: 'talk', hours: DAY },
  { lm: 'forum-trajan', spot: 'forum-exedrasw-bench1', role: 'greek', idle: 'sit', hours: DAY },
  { lm: 'forum-trajan', spot: 'forum-exedrasw-bench3', role: 'plebeian-man', idle: 'sit', hours: DAY },
  { lm: 'forum-trajan', spot: 'forum-standne-seat0', role: 'matron', idle: 'sit', hours: [6, 20] },
  { lm: 'forum-trajan', spot: 'forum-standne-seat12', role: 'patrician-man', idle: 'sit', hours: [6, 20] },
  { lm: 'forum-trajan', spot: 'forum-standsw-seat3', role: 'plebeian-man', idle: 'sit', hours: [6, 20] },
  { lm: 'forum-trajan', spot: 'forum-standsw-seat15', role: 'plebeian-woman', idle: 'sit', hours: [6, 20] },
  { lm: 'equus-traiani', spot: 'equus-orator', role: 'patrician-man', idle: 'talk', hours: [5, 20] },
  { lm: 'forum-trajan-gateway', spot: 'forum-gateway-guardne', role: 'praetorian', idle: 'guard', torch: true },
  { lm: 'forum-trajan-gateway', spot: 'forum-gateway-guardsw', role: 'praetorian', idle: 'guard', torch: true },
  // The Column court and the libraries.
  { lm: 'column-trajan', spot: 'column-priest', role: 'priest', idle: 'pray', hours: [4, 21] },
  { lm: 'column-trajan', spot: 'column-guard', role: 'praetorian', idle: 'guard', torch: true },
  { lm: 'column-trajan', spot: 'column-carver', role: 'slave', idle: 'work', hours: [5, 19] },
  { lm: 'bibliotheca-ulpia-east', spot: 'library-east-librarian', role: 'greek', idle: 'stand', hours: [6, 19] },
  { lm: 'bibliotheca-ulpia-east', spot: 'library-east-reader0', role: 'patrician-man', idle: 'sit', hours: [7, 18] },
  { lm: 'bibliotheca-ulpia-east', spot: 'library-east-reader3', role: 'greek', idle: 'sit', hours: [7, 18] },
  { lm: 'bibliotheca-ulpia-west', spot: 'library-west-librarian', role: 'freedman', idle: 'stand', hours: [6, 19] },
  { lm: 'bibliotheca-ulpia-west', spot: 'library-west-reader1', role: 'greek', idle: 'sit', hours: [7, 18] },
  { lm: 'bibliotheca-ulpia-west', spot: 'library-west-reader2', role: 'patrician-man', idle: 'sit', hours: [7, 18] },
  // The Basilica Ulpia: a court in the NE aisle, the praetor's tribunal in the Atrium Libertatis.
  { lm: 'basilica-ulpia', spot: 'basilica-courtne-judge', role: 'patrician-man', idle: 'stand', hours: COURTS },
  { lm: 'basilica-ulpia', spot: 'basilica-courtne-advocate', role: 'patrician-man', idle: 'talk', hours: COURTS },
  { lm: 'basilica-ulpia', spot: 'basilica-courtne-clerk', role: 'freedman', idle: 'stand', hours: COURTS },
  { lm: 'basilica-ulpia', spot: 'basilica-libertatis-praetor', role: 'patrician-man', idle: 'stand', hours: COURTS },
  { lm: 'basilica-ulpia', spot: 'basilica-libertatis-lictor', role: 'freedman', idle: 'guard', hours: COURTS },
  // The Markets.
  { lm: 'markets-trajan', spot: 'markets-taberna1-vendor', role: 'merchant', idle: 'stand', hours: SHOPS },
  { lm: 'markets-trajan', spot: 'markets-taberna6-vendor', role: 'plebeian-woman', idle: 'stand', hours: SHOPS },
  { lm: 'markets-trajan', spot: 'markets-taberna9-vendor', role: 'merchant', idle: 'stand', hours: SHOPS },
  { lm: 'markets-trajan', spot: 'markets-lares-shrine', role: 'elderly', idle: 'pray', hours: [4, 22] },
  { lm: 'markets-trajan', spot: 'markets-street-bench1', role: 'elderly', idle: 'sit', hours: [6, 20] },
  { lm: 'markets-trajan', spot: 'markets-upper-outer6-vendor', role: 'plebeian-woman', idle: 'talk', hours: SHOPS },
  { lm: 'markets-trajan', spot: 'markets-upper-outer10-vendor', role: 'merchant', idle: 'stand', hours: SHOPS },
  { lm: 'markets-trajan', spot: 'markets-hall-clerk', role: 'freedman', idle: 'stand', hours: [5, 20] },
  { lm: 'markets-trajan', spot: 'markets-hall-dais', role: 'patrician-man', idle: 'stand', hours: [6, 18] },
];

/** Spawn within this distance of the camera, remove beyond DESPAWN (m). */
export const SPAWN = 75;
export const DESPAWN = 95;
/** At most this many figures alive at once, and this many created per tick. */
const MAX_LIVE = 28;
const PER_TICK = 2;
const TICK = 0.25;

/** Seat height the 'sit' idle expects, and how far in front of a seat spot the sitter's feet go. */
const SEAT_H = 0.45;
const SEAT_FWD = 0.37;

/**
 * Feet position and heading for a figure at a spot (world space). Standing spots are the feet;
 * a 'sit' spot is on the seat, so the sitter stands SEAT_FWD in front of it and SEAT_H lower (the
 * idle puts the seat's front edge 0.12 m behind the feet).
 */
export function extraPlacement(idle: IdleLoop, spot: { position: THREE.Vector3; heading?: number }): { position: THREE.Vector3; heading: number } {
  const h = spot.heading ?? 0;
  const p = spot.position.clone();
  if (idle === 'sit') p.add(new THREE.Vector3(Math.sin(h) * SEAT_FWD, -SEAT_H, Math.cos(h) * SEAT_FWD));
  return { position: p, heading: h };
}

/** Is hour h inside [from, to) (wrapping past midnight)? */
export function inHours(h: number, hours?: readonly [number, number]): boolean {
  if (!hours) return true;
  const [a, b] = hours;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

interface Slot {
  def: ExtraDef;
  /** Resolved feet position/heading (null until the landmark and spot exist). */
  at: { position: THREE.Vector3; heading: number } | null;
  missing: boolean;
  actor: Actor | null;
}

export class TrajanExtras implements System {
  readonly name = 'trajanExtras';
  readonly priority = 45;
  enabled = true;
  private readonly slots: Slot[] = EXTRAS.map((def) => ({ def, at: null, missing: false, actor: null }));
  private t = 0;

  constructor(private readonly game: Game) {
    try {
      if (new URLSearchParams(globalThis.location?.search ?? '').get('extras') === '0') this.enabled = false;
    } catch {
      /* no location (tests) */
    }
  }

  /** Figures alive now (debug, tests). */
  get live(): number {
    return this.slots.filter((s) => s.actor).length;
  }

  update(dt: number) {
    this.t += dt;
    if (this.t < TICK) return;
    this.t = 0;
    const g = this.game;
    if (!g.actors || !g.landmarks || !g.physics || !g.camera) return;
    const cam = g.camera.position;
    const hour = g.time?.hour ?? 12;
    let live = this.live;
    let budget = PER_TICK;
    for (const s of this.slots) {
      if (!s.at && !s.missing && !this.resolve(s)) continue;
      if (!s.at) continue;
      const d = Math.hypot(s.at.position.x - cam.x, s.at.position.z - cam.z);
      const want = this.enabled && inHours(hour, s.def.hours) && d < (s.actor ? DESPAWN : SPAWN);
      if (want && !s.actor && budget > 0 && live < MAX_LIVE) {
        this.spawn(s, hour);
        budget--;
        live++;
      } else if (!want && s.actor) {
        g.actors.remove(s.actor);
        s.actor = null;
        live--;
      }
    }
  }

  /** Remove every figure (and stop spawning until enabled again). */
  clear() {
    for (const s of this.slots) {
      if (s.actor) this.game.actors?.remove(s.actor);
      s.actor = null;
    }
  }

  private resolve(s: Slot): boolean {
    const placed = this.game.landmarks?.get(s.def.lm);
    if (!placed) return false; // not built (yet, or not in this scene)
    const spot = placed.spots.find((q) => q.id === s.def.spot);
    if (!spot) {
      s.missing = true;
      return false;
    }
    const at = extraPlacement(s.def.idle, spot);
    // Settle the feet on the floor the colliders actually provide.
    const y = this.game.physics.groundHeight(at.position.x, at.position.z, at.position.y + 0.5, 1.2);
    if (y !== null) at.position.y = y;
    s.at = at;
    return true;
  }

  private spawn(s: Slot, hour: number) {
    const g = this.game;
    const { def, at } = s;
    const avatar = createHumanoid(randomAppearance(new Rng(`trajan-extra:${def.spot}`), def.role), { lod: 'auto' });
    avatar.setIdleLoop(def.idle);
    if (def.torch && (hour < 6.2 || hour > 19.8)) avatar.setTorch(true);
    const actor = new Actor(g, { id: `extra:${def.spot}`, position: at!.position, heading: at!.heading, layer: Layer.Npc, avatar });
    // Never driven: it stands where it was put, grounded (so the idle loop plays).
    actor.grounded = true;
    actor.canMove = false;
    g.actors.add(actor);
    s.actor = actor;
  }
}

/** Install the extras once per game (called by the Trajanic builders; a no-op without a real game). */
export function installExtras(game: Game | undefined) {
  if (!game || typeof game.addSystem !== 'function' || game.trajanExtras) return;
  game.trajanExtras = game.addSystem(new TrajanExtras(game));
}
