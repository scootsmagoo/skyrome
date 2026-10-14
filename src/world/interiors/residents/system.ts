/**
 * Residents: the people at home in a generic cell (docs/modules/interiors.md, "Residents"). Who is
 * there is the pure rule in plan.ts (by door seed and hour); this file puts them in the world as real
 * `Npc`s of the population, so the crime system sees them like anyone in the street.
 *
 * Life cycle. They exist only while the player is in the cell: `arriveResidents` (the cell's onEnter)
 * spawns them with `population.spawnResident`, posed in place (`population.pose`: a sleeper in the
 * 'sleep' loop on the bed, a sitter on a stool, a standing figure at a post); `leaveResidents` (onExit,
 * or the cell being dropped) despawns them. A person killed stays dead for the session
 * (`population.isKilled`).
 *
 * Crime. `Npc.resident` makes them answer for themselves: a sleeper is not a witness (`witnesses` skips
 * them) and an alarm reaches them through `NpcBrain.alarm` into `Resident.alarm` below. An awake
 * resident turns to face the player in sight, so `population.witnesses` counts them (the container and
 * door crime paths already ask it); a witnessed crime makes them cry out and the cry carries into the
 * street by the door (guards come). A crime nobody saw is remembered for the visit: a sleeper who is
 * woken by it and sees the thief reports it then (caught red-handed).
 *
 * Waking. Noises wake the sleepers near enough (plan.ts `wakeChance`): a pick scraping, one snapping, a
 * bolt forced, blows, hands in a chest, a fight. Talking to a sleeper ("Wake") wakes them.
 */
import * as THREE from 'three';
import type { IdleLoop } from '../../../actors/Actor';
import { randomAppearance } from '../../../actors/avatar/variants';
import type { Game, System } from '../../../core/Game';
import { Layer } from '../../../core/Physics';
import { Rng } from '../../../core/Rng';
import type { Npc } from '../../../npc/Npc';
import type { NpcManager } from '../../../npc/NpcManager';
import type { Vec3 } from '../types';
import { NAMES, avatarRoleFor, isTrespass, lightness, lineFor, unit, whoIsHome, wakes, type Home, type LineKind, type Noise, type Person, type Placement, type ResidentSpot } from './plan';

/** What the cell tells this module when the player comes in. */
export interface CellResidents {
  id: string;
  spots: ResidentSpot[];
  seed: number;
  wealth: number;
  /** The cell frame's turn about y (its door's), and the street point in front of the door. */
  rotY: number;
  street: Vec3;
}

export type Mode = 'asleep' | 'rising' | 'awake';

export interface Resident {
  id: string;
  spot: ResidentSpot;
  person: Person;
  /** The home it was spawned for: the key says which posture, so a change of hour can replace it. */
  key: string;
  npc: Npc;
  mode: Mode;
  /** Seconds left sitting up before getting out of bed. */
  riseT: number;
  light: number;
  lastSpoke: number;
  /** Has had the first look at the player (the greeting or the challenge). */
  noticed: boolean;
  /** Has the player in sight (seen this half second). */
  watching: boolean;
  sightT: number;
  lastSeen: number;
  posture: Home['posture'];
}

declare module '../../../core/Game' {
  interface Game {
    residents?: Residents;
  }
}

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();

const LOOPS: Record<Home['posture'], IdleLoop> = { sleep: 'sleep', sit: 'sit', stand: 'stand' };
/** Sitting up in bed before getting out of it (s). */
const RISE_S = 1.3;
/** Awake people watch the player within this far (m). */
const WATCH_R = 9;
/** The first words (greeting or challenge) are said within this far (m). */
const NOTICE_R = 7;
/** How often a picking in progress makes its noise (s). */
const PICK_EVERY = 3;

export class Residents implements System {
  readonly name = 'residents';
  readonly priority = 0;
  private cell: CellResidents | null = null;
  private readonly people = new Map<string, Resident>();
  private clock = 0;
  private syncT = 0;
  private homeT = 0;
  /** The player has just come in and the first sync is still to be made (the population may not be there yet). */
  private fresh = false;
  private rolls = 0;
  /** A pick is being worked in the cell (its noise comes every few seconds). */
  private picking = false;
  private pickT = 0;
  /** Crimes nobody saw in this visit: (crime, victim). A sleeper woken and seeing the thief reports them. */
  private pending: { crime: string; victimId?: string }[] = [];
  private lastStreetAlarm = -1e9;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly game: Game) {
    const ev = game.events;
    this.offs.push(
      ev.on('lockpick:start', () => {
        this.picking = true;
        this.pickT = PICK_EVERY;
        this.noiseAtPlayer('pick');
      }),
      ev.on('lockpick:done', () => {
        this.picking = false;
      }),
      ev.on('lockpick:snap', (e) => this.noise('snap', e.x, e.y, e.z)),
      ev.on('door:unlocked', (e) => {
        if (e.how === 'force') this.noiseAtPlayer('force');
      }),
      ev.on('combat:swing', (e) => {
        if (e.attackerId === game.player?.id && e.hits === 0) this.noiseAtPlayer('bash');
      }),
      ev.on('crime:committed', (e) => this.onCrime(e.crime, e.victimId, e.witnessed)),
    );
  }

  private get pop(): NpcManager | undefined {
    return this.game.population;
  }

  /** The people at home in the cell the player is in (tests, the console). */
  list(): readonly Resident[] {
    return [...this.people.values()];
  }

  // ------------------------------------------------------------------ coming and going

  arrive(cell: CellResidents) {
    this.leave();
    this.cell = cell;
    this.pending = [];
    this.picking = false;
    this.syncT = 2;
    this.fresh = true;
    this.sync();
  }

  leave(id?: string) {
    if (!this.cell || (id !== undefined && this.cell.id !== id)) return;
    for (const r of [...this.people.values()]) this.remove(r);
    this.cell = null;
    this.pending = [];
    this.picking = false;
  }

  private remove(r: Resident) {
    this.people.delete(r.spot.id);
    r.npc.resident = null;
    if (this.pop?.get(r.id) === r.npc) this.pop.despawn(r.npc);
  }

  /** The cell-local placement as a world point and heading. */
  private world(p: Placement): { at: THREE.Vector3; heading: number } | null {
    const c = this.cell;
    const at = c ? this.game.interiors?.toWorld(c.id, p.position) : null;
    return c && at ? { at, heading: p.heading + c.rotY } : null;
  }

  /** Bring the people present in line with who is home at this hour (the first time, at once, in view or not). */
  private sync() {
    const c = this.cell;
    const pop = this.pop;
    if (!c || !pop) return;
    const first = this.fresh;
    this.fresh = false;
    const homes = whoIsHome(c.spots, c.seed, this.game.time.hour);
    const wanted = new Map(homes.map((h) => [h.spot.id, h] as const));
    for (const r of [...this.people.values()]) {
      const h = wanted.get(r.spot.id);
      if (r.npc.dead || pop.get(r.id) !== r.npc) {
        if (pop.get(r.id) !== r.npc) this.people.delete(r.spot.id);
        continue;
      }
      if (h && r.key === keyOf(h)) continue;
      // Gone out, or into bed: not while anyone is looking, and not once the player has dealt with them.
      if (!first && (r.noticed || r.mode === 'rising' || this.shown(r))) continue;
      this.remove(r);
    }
    for (const h of homes) {
      if (this.people.has(h.spot.id) || pop.isKilled(this.idOf(h.spot))) continue;
      const w = this.world(h.place);
      if (!w) continue;
      if (!first && pop.isVisible(w.at.x, w.at.y + 1, w.at.z)) continue;
      this.spawn(h);
    }
  }

  private idOf(spot: ResidentSpot): string {
    return `res:${this.cell!.id}:${spot.id}`;
  }

  private shown(r: Resident): boolean {
    const p = r.npc.position;
    return !!this.pop?.isVisible(p.x, p.y + 1, p.z);
  }

  private spawn(h: Home) {
    const c = this.cell!;
    const pop = this.pop!;
    const w = this.world(h.place);
    if (!w) return;
    const id = this.idOf(h.spot);
    const app = randomAppearance(new Rng(`res:${c.id}:${h.spot.id}`), avatarRoleFor(h.spot.person, c.seed, c.wealth));
    const npc = pop.spawnResident(id, NAMES[h.spot.person], app, w.at, w.heading, h.spot.person === 'ianitor' ? 'slave' : 'citizen');
    if (!npc) return;
    pop.pose(npc, LOOPS[h.posture], null);
    const r: Resident = {
      id,
      spot: h.spot,
      person: h.spot.person,
      key: keyOf(h),
      npc,
      mode: h.posture === 'sleep' ? 'asleep' : 'awake',
      riseT: 0,
      light: lightness(c.seed, h.spot.id),
      lastSpoke: -1e9,
      noticed: false,
      watching: false,
      sightT: 0,
      lastSeen: -1e9,
      posture: h.posture,
    };
    this.people.set(h.spot.id, r);
    // Posed people are scripted, which turns the default Talk prompt off: ours is on, and asks for "Wake" of a sleeper.
    const it = npc.interactable;
    it.verb = () => (r.mode === 'asleep' ? 'Wake' : 'Talk');
    it.enabled = () => !npc.dead && !npc.isFighting();
    it.interact = () => this.talk(r);
    npc.resident = {
      get asleep() {
        return r.mode === 'asleep';
      },
      alarm: (kind, aggressor) => this.alarm(r, kind, aggressor?.id),
    };
  }

  // ------------------------------------------------------------------ speaking and talking

  private roll(): number {
    return unit(this.cell?.seed ?? 0, `say:${this.rolls++}`);
  }

  private speak(r: Resident, kind: LineKind, urgent = false): boolean {
    if (this.clock - r.lastSpoke < (urgent ? 3 : 10)) return false;
    r.lastSpoke = this.clock;
    this.pop?.barks.say(r.npc.id, r.npc.name, lineFor(r.person, kind, this.roll()));
    return true;
  }

  private talk(r: Resident) {
    if (r.npc.dead) return;
    if (r.mode === 'asleep') {
      // Woken on purpose: a grumble, and up.
      this.wake(r, 'roused');
      return;
    }
    r.lastSpoke = -1e9;
    this.speak(r, isTrespass(this.game.time.hour) ? 'trespass' : 'talk');
    r.noticed = true;
  }

  // ------------------------------------------------------------------ waking and noises

  /** Wake a sleeper: sit up (a line), and shortly get out of bed. */
  private wake(r: Resident, kind: 'woken' | 'roused') {
    if (r.mode !== 'asleep' || r.npc.dead) return;
    r.mode = 'rising';
    r.riseT = RISE_S;
    r.lastSpoke = -1e9;
    this.speak(r, kind, true);
    r.npc.brain?.scriptStand('sitGround', null);
  }

  private getUp(r: Resident) {
    r.mode = 'awake';
    r.posture = 'stand';
    const side = r.spot.bedside ?? r.spot.post ?? r.spot.bed;
    const w = side ? this.world(side) : null;
    if (w) r.npc.teleport({ x: w.at.x, y: w.at.y + 0.03, z: w.at.z }, w.heading);
    r.npc.brain?.scriptStand('stand', null);
    this.caught(r);
  }

  /** A woken sleeper who sees the thief reports the crimes of this visit that nobody saw. */
  private caught(r: Resident) {
    if (!this.pending.length || !this.seesPlayer(r, WATCH_R)) return;
    const crime = this.game.crime;
    const pend = this.pending.splice(0);
    for (const p of pend) crime?.commit(p.crime as 'furtum', { witnessed: [r.npc.id], victimId: p.victimId });
    this.speak(r, 'caught', true);
    this.streetAlarm();
  }

  /** A noise at the player's feet. */
  private noiseAtPlayer(kind: Noise) {
    const p = this.game.player?.position;
    if (p) this.noise(kind, p.x, p.y, p.z);
  }

  private noise(kind: Noise, x: number, y: number, z: number) {
    const c = this.cell;
    if (!c || this.game.interiors?.current() !== c.id) return;
    const sneaking = !!this.game.player?.sneaking;
    for (const r of this.people.values()) {
      if (r.mode !== 'asleep' || r.npc.dead) continue;
      const d = Math.hypot(r.npc.position.x - x, r.npc.position.y - y, r.npc.position.z - z);
      if (wakes(kind, d, unit(c.seed, `${r.spot.id}:wake:${this.rolls++}`), { sneaking, light: r.light })) this.wake(r, 'woken');
    }
  }

  // ------------------------------------------------------------------ crime

  private onCrime(crime: string, victimId: string | undefined, witnessed: boolean) {
    const c = this.cell;
    if (!c || this.game.interiors?.current() !== c.id) return;
    if (crime === 'furtum' || crime === 'effractio') {
      if (!witnessed) this.pending.push({ crime, victimId });
      if (crime === 'furtum') this.noiseAtPlayer('rummage');
    }
    if (!witnessed) return;
    // Those who saw it cry out, and the cry carries into the street.
    const p = this.game.player.position;
    const seen = new Set(this.pop?.witnesses(p, 20) ?? []);
    let shouted = false;
    for (const r of this.people.values()) {
      if (r.mode === 'asleep' || !seen.has(r.npc.id)) continue;
      if (this.speak(r, 'caught', true)) shouted = true;
    }
    if (shouted) this.streetAlarm();
  }

  /** Called by the population when an alarm reaches this person (NpcBrain.alarm). */
  private alarm(r: Resident, kind: 'fight' | 'crime' | 'danger', aggressorId?: string) {
    const c = this.cell;
    if (!c || this.game.interiors?.current() !== c.id || r.npc.dead) return;
    if (r.mode === 'asleep') {
      // A fight or a cry wakes the house.
      const p = this.game.player.position;
      const d = Math.hypot(r.npc.position.x - p.x, r.npc.position.y - p.y, r.npc.position.z - p.z);
      if (wakes(kind === 'crime' ? 'shout' : 'fight', d, unit(c.seed, `${r.spot.id}:wake:${this.rolls++}`), { light: r.light })) this.wake(r, 'woken');
      return;
    }
    if (aggressorId === this.game.player?.id || kind === 'crime') {
      r.watching = true;
      if (this.speak(r, 'caught', true)) this.streetAlarm();
    }
  }

  /** The household's cry carries to the street by the door: guards near it come. */
  private streetAlarm() {
    const c = this.cell;
    if (!c || this.clock - this.lastStreetAlarm < 20) return;
    this.lastStreetAlarm = this.clock;
    this.pop?.alarm(c.street.x, c.street.z, 16, 'crime', null);
  }

  // ------------------------------------------------------------------ the loop

  private seesPlayer(r: Resident, range: number): boolean {
    const pl = this.game.player;
    const n = r.npc;
    const d = Math.hypot(pl.position.x - n.position.x, pl.position.y - n.position.y, pl.position.z - n.position.z);
    if (d > range) return false;
    eye.set(n.position.x, n.position.y + (r.posture === 'sit' ? 1.2 : r.mode === 'rising' ? 0.9 : 1.55), n.position.z);
    dir.set(pl.position.x - eye.x, pl.position.y + 1.2 - eye.y, pl.position.z - eye.z);
    const len = dir.length();
    return !this.game.physics.raycast(eye, dir.normalize(), Math.max(0, len - 0.5), Layer.World);
  }

  fixedUpdate(dt: number) {
    const c = this.cell;
    if (!c) return;
    this.clock += dt;
    const pl = this.game.player;
    if (!pl) return;
    this.homeT -= dt;
    if (this.homeT <= 0) {
      this.homeT = 0.5;
      if (this.game.interiors?.current() !== c.id) {
        // The player is somewhere else (a teleport the exit hook did not see): the house empties.
        this.leave();
        return;
      }
    }
    // A pick being worked keeps up its scraping.
    if (this.picking && (this.pickT -= dt) <= 0) {
      this.pickT = PICK_EVERY;
      this.noiseAtPlayer('pick');
    }
    this.syncT -= dt;
    if (this.syncT <= 0) {
      this.syncT = 2;
      this.sync();
    }
    for (const r of this.people.values()) {
      const n = r.npc;
      if (n.dead || this.pop?.get(r.id) !== n) continue;
      if (r.mode === 'rising') {
        r.riseT -= dt;
        if (r.riseT <= 0) this.getUp(r);
        continue;
      }
      if (r.mode === 'asleep') continue;
      // Awake: keep the player in sight and face them.
      r.sightT -= dt;
      if (r.sightT <= 0) {
        r.sightT = 0.25;
        const sees = this.seesPlayer(r, WATCH_R);
        if (sees) r.lastSeen = this.clock;
        r.watching = sees || this.clock - r.lastSeen < 2;
        if (sees && !r.noticed && Math.hypot(pl.position.x - n.position.x, pl.position.z - n.position.z) < NOTICE_R) {
          r.noticed = true;
          this.speak(r, isTrespass(this.game.time.hour) ? 'trespass' : 'greet');
        }
      }
      if (r.watching && !n.talking) n.turnToward(n.headingTo(pl.position.x, pl.position.z), 3.5, dt);
    }
  }

  dispose() {
    this.leave();
    for (const off of this.offs.splice(0)) off();
  }
}

function keyOf(h: Home): string {
  return `${h.spot.id}:${h.posture}`;
}

/** The residents service of a game (made on first use). */
export function residentsOf(game: Game): Residents {
  if (!game.residents) game.residents = game.addSystem(new Residents(game));
  return game.residents;
}

/** The player has come into a cell: the people at home appear. */
export function arriveResidents(game: Game, cell: CellResidents) {
  if (!cell.spots.length) return;
  residentsOf(game).arrive(cell);
}

/** The player has left a cell (or it is being dropped): the people go. */
export function leaveResidents(game: Game, id: string) {
  game.residents?.leave(id);
}
