/**
 * NpcManager (game.population): everyone in the streets.
 *
 *   installNpcs(game, { density?, crowd?, named?, vignettes?, carts? })
 *
 * - Named NPCs from the registry (game.npcs, i.e. src/npc/content/*.ts) appear at their schedule
 *   locations when the player is near and walk between them as the hours change.
 * - An ambient crowd of 30–60 citizens fills the district around the player by day (fewer at
 *   night, plus lanterned vigiles and carts), mixed by district and hour, spawned out of sight or
 *   in doorways and sent home by their archetype schedules.
 * - Simulation bubble: character controller + steering within ~60 m, cheap kinematic path following
 *   beyond, despawn out of view past ~95 m; animation LOD from avatar/lod.ts, shadows off past 50 m.
 * - Navigation: local nav grid (physics-sampled) + street graph (game.streets, when the city module
 *   provides it) + steering; the stuck ladder guarantees no one is stuck for more than ~3 s.
 * - Life: barks with subtitles, look-at, reactions (flee, gawk, guards respond via game.combat),
 *   ambient vignettes, talking (game.dialogue) with a generic fallback.
 */
import * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import type { Appearance } from '../actors/appearance';
import { avatarLod } from '../actors/avatar/lod';
import { randomAppearance, type AvatarRole } from '../actors/avatar/variants';
import type { Game, System } from '../core/Game';
import { headingFromDir } from '../core/math';
import { ALL_LAYERS, groups, Layer, RAPIER } from '../core/Physics';
import { Rng } from '../core/Rng';
import * as atlas from '../data/atlas';
import { toGame } from '../world/coords';
import { dateOfOrdinal, festivalsOn } from '../game/calendar';
import { NavGrid } from '../ai/life/navgrid';
import { NavService } from '../ai/life/nav';
import { PhysicsCellSampler } from '../ai/life/physicsSampler';
import { SpatialHash } from '../ai/life/spatialHash';
import { DEFAULT_STEER, steer, type SteerAgent, type SteerNeighbor, type Vec2 } from '../ai/life/steering';
import { StreetNav } from '../ai/life/streets';
import { laneAt, type LaneSet } from '../ai/life/lanes';
import { atlasLanes, cartLane } from './crowd/atlasLanes';
import type { StationDef, StationMember } from './crowd/stations';
import { StationDirector, type StationHost } from './stationDirector';
import { BarkDirector, type BarkKind } from './barks';
import { makeTask, NpcBrain, type LifeContext } from './brain';
import { CartDirector, type CartHost } from './carts';
import { crowdBudget, crowdTarget, dayPhase, NIGHT_CAP, pickRole, roleWeights, type CrowdBudget, type DayPhase } from './crowd/budget';
import { allPois, districtAt, landmarkForecourt, poiBoosts, poisNear, type District, type Poi, type PoiKind } from './crowd/districts';
import { CROWD_ROLES, FOREIGN_LABELS, type CrowdRole, type CrowdRoleId } from './crowd/roles';
import { crowdRoom, LANE_SPAWN, laneSpawnRing, laneSpawnVerdict, type LaneSpawnVerdict } from './crowd/spawnRules';
import { combatOf, streetsOf } from './hooks';
import { Npc } from './Npc';
import { attachProp, makeWorkBlock } from './props';
import { loadNpcContent, NpcRegistry } from './registry';
import { activeScheduleEntry, archetypeSlot, sunTimes, type SunTimes } from './schedules';
import { SpotIndex, type WallProbe } from './spots';
import { EngineDialogueView } from './talkBridge';
import type { NpcDef } from './types';
import { VignetteDirector, type VignetteHost } from './vignettes/director';
import { VIGNETTES } from './vignettes';

declare module '../core/Game' {
  interface Game {
    population: NpcManager;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    'npc:spawned': { id: string; ambient: boolean };
    'npc:despawned': { id: string };
    /**
     * Something alarming happened here: crowds flee or gawk, guards respond. Any module may emit it
     * (combat, crime, fires). `aggressorId` is an actor id (game.actors) when known.
     */
    'npc:alarm': { x: number; z: number; radius?: number; kind?: 'fight' | 'crime' | 'danger'; aggressorId?: string };
    'npc:talk': { npcId: string; dialogue: boolean };
    'npc:died': { id: string; named: boolean };
  }
}

export interface NpcManagerOptions {
  /** Ambient crowd on/off (default true). */
  crowd?: boolean;
  /** Multiplier on crowd sizes (default 1; `?crowd=` overrides in dev). */
  density?: number;
  /** Named NPCs from the registry (default true). */
  named?: boolean;
  vignettes?: boolean;
  carts?: boolean;
  /** Hard cap on ambient NPCs (default 110). */
  maxCrowd?: number;
  /** Nav grid radius around the player (default 80 m). */
  navRadius?: number;
  /** Seed for crowd randomness (default: game.rng). */
  seed?: number | string;
  /** Use the atlas (districts, landmark forecourts). Off for test beds that aren't Rome. */
  atlas?: boolean;
  /** Fixed crowd mix (test beds); default: the atlas district at the player. */
  district?: District;
  /** Authored stations (vigiles' posts, stalls, the cart stand…; needs the atlas). Default true. */
  stations?: boolean;
  /** Fixed street centrelines (test beds); default: the atlas roads when the atlas is on. */
  lanes?: LaneSet;
}

/** Character controller within this distance (m); measured cost ~0.05–0.15 ms per NPC per step. */
const KCC_RADIUS = 26;
/** At most this many NPCs get the character controller at once (the nearest moving ones). */
const KCC_MAX = 28;
/** Steering (separation, avoidance, the player) within this distance. */
const STEER_RADIUS = 62;
const DESPAWN_UNSEEN = 82;
const DESPAWN_ALWAYS = 115;
const NAMED_SPAWN = 100;
const NAMED_DESPAWN = 140;
/** A named NPC never appears more than this far above or below the terrain (m): no roofs. */
const NAMED_MAX_LIFT = 2.5;
const SPAWN_MIN = 20;
/** Unseen people farther than this behind the camera are recycled toward the view… */
const RECYCLE_BEHIND = 12;
/** …and those this far off to the side, out of view for longer. */
const RECYCLE_SIDE = 18;
const SPAWN_MAX = 62;
/** Appearance variants per avatar role (shared → geometry cache hits, cheap spawns). */
const VARIANTS = 14;

/** Where the crowd director puts a new citizen. */
interface SpawnPick {
  x: number;
  z: number;
  heading?: number;
  /** At its work spot (initial fill): start the schedule there. */
  spotPlaced?: boolean;
  /** On a street: walk on along it. */
  onLane?: boolean;
  /** Behind the camera (overtaking a player standing still): not recycled at once. */
  behind?: boolean;
}

/** The calendar's public surface used here (src/game/calendar.ts; read structurally). */
interface CalendarLike {
  year?: number;
  serialize(): { firstSeen?: Record<string, number> };
}

function isLemuriaDate(month: number, day: number): boolean {
  return festivalsOn(month, day).some((f) => f.id === 'fest-lemuria');
}

const ZERO = { x: 0, y: 0, z: 0 };
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const wish = new THREE.Vector3();
const desired: Vec2 = { x: 0, z: 0 };
const steered: Vec2 = { x: 0, z: 0 };

export class NpcManager implements System {
  readonly name = 'npcs';
  /** After the player controller (-10) and before the actor system (50). */
  readonly priority = -5;
  readonly grid: NavGrid;
  readonly nav: NavService;
  readonly spots = new SpotIndex();
  readonly barks: BarkDirector;
  readonly vignettes: VignetteDirector;
  readonly carts: CartDirector;
  readonly stations: StationDirector;
  readonly rng: Rng;
  readonly list: Npc[] = [];
  readonly life: LifeContext;
  crowdEnabled: boolean;
  namedEnabled: boolean;
  density: number;
  maxCrowd: number;
  readonly useAtlas: boolean;
  private readonly fixedDistrict: District | null;
  private readonly fixedLanes: LaneSet | null;
  /**
   * Scripted fights (a quest's ambush, a set piece): while true no guard steps in anywhere. For a
   * single fight mark its enemies with `questFight(actor)` instead.
   */
  suppressGuards = false;
  private readonly questFighters = new WeakSet<Actor>();
  /** Seconds of simulation. */
  clock = 0;
  /** Nav-grid cells sampled per frame. */
  buildBudget = 260;
  readonly stats = { spawned: 0, despawned: 0, unstuck: 0, full: 0, mid: 0, cheap: 0, visible: 0, seen: 0, maxStuck: 0, pathSearches: 0, ms: 0, msBrain: 0, msSteer: 0, msLoco: 0, msUpdate: 0 };
  /** Ids of dead named NPCs (never respawned). */
  readonly deadNamed = new Set<string>();
  private byId = new Map<string, Npc>();
  private hash = new SpatialHash<Npc>(4);
  private neigh: Npc[] = [];
  private stepList: Npc[] = [];
  private steerNs: SteerNeighbor[] = [];
  /** Pooled steering records (reused every step). */
  private readonly neighborPool: SteerNeighbor[] = [];
  private readonly agent: SteerAgent = { x: 0, z: 0, vx: 0, vz: 0, radius: 0.28, maxSpeed: 1 };
  private sampler: PhysicsCellSampler;
  private streetNav: StreetNav | null = null;
  private district: District;
  private districtAt = { x: Infinity, z: Infinity };
  private budget: CrowdBudget;
  private sun: SunTimes;
  private sunDay = -1;
  private phase: DayPhase = 'morning';
  private seq = 0;
  private stepNo = 0;
  private tierT = 0;
  private crowdT = 0;
  private namedT = 0;
  private reactT = 0;
  private chatterT = 6;
  private lookT = 0;
  private initialDone = false;
  private floodT = 0;
  /** Where the player was last frame (a jump of more than 40 m is a teleport). */
  private lastPlayer = { x: NaN, z: NaN };
  /** Where the reachability flood starts (the player, or the street below them). */
  private readonly floodOrigin = { x: 0, z: 0 };
  /** Game hours at the last frame (a jump of more than half an hour is a wait or a load). */
  private lastHours = NaN;
  private readonly freeShape = new RAPIER.Capsule(0.5, 0.3);
  private frameDt = 1 / 60;
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly look = { x: 0, z: -1 };
  private appearanceCache = new Map<string, Appearance>();
  private footsteps = new Map<Npc, { detach(): void }>();
  private talk: { npc: Npc; until: number; bridged: boolean; check: number } | null = null;
  private dialogueOpened = false;
  private weaponWarned = new Map<string, number>();
  private offs: (() => void)[] = [];
  private registryFallback: NpcRegistry | null = null;
  private workBlocks = new Map<string, THREE.Object3D>();
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private readonly tmpCell = { x: 0, z: 0 };
  /** Floor height on the nav grid for gliders (one closure, not one per NPC per step). */
  private readonly gridFloor = (x: number, z: number) => (this.grid.walkable(x, z) ? this.grid.heightAt(x, z) : null);
  /** A cell the nav grid knows is not walkable (unknown ground is not blocked). */
  private readonly gridBlocked = (x: number, z: number) => !this.grid.walkable(x, z, true);
  /** The Lemuria phase and the temple rule for one game minute (`key`). */
  private readonly lemCache: { key: number; phase: 'day' | 'night' | null; shut: boolean | null } = { key: NaN, phase: null, shut: null };
  readonly wallProbe: WallProbe;

  constructor(
    readonly game: Game,
    opts: NpcManagerOptions = {},
  ) {
    const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    this.rng = opts.seed !== undefined ? new Rng(opts.seed) : game.rng.fork('npc');
    this.crowdEnabled = opts.crowd ?? q.get('crowd') !== '0';
    this.namedEnabled = opts.named ?? true;
    const qd = Number(q.get('crowd'));
    this.density = qd > 0 && qd <= 4 ? qd : (opts.density ?? game.settings?.data.crowdDensity ?? 1);
    // The graphics tier sets how full the streets are (core/graphics: Low 0.6, Medium 0.8).
    if (!(qd > 0) && opts.density === undefined) game.settings?.onChange((d) => (this.density = d.crowdDensity ?? 1));
    this.maxCrowd = opts.maxCrowd ?? 110;
    this.useAtlas = opts.atlas ?? true;
    this.fixedDistrict = opts.district ?? null;
    this.fixedLanes = opts.lanes ?? null;
    this.sampler = new PhysicsCellSampler(game.physics, {
      refHeight: (x, z) => (game.heightmap ? game.heightmap.heightAt(x, z) : null),
      fallbackY: 0,
    });
    this.grid = new NavGrid(this.sampler, { radius: opts.navRadius ?? 80 });
    this.nav = new NavService(this.grid, () => this.streets());
    const filter = groups(ALL_LAYERS, Layer.World);
    this.wallProbe = (x, y, z, dx, dz, max) => {
      const r = this.ray;
      r.origin.x = x;
      r.origin.y = y;
      r.origin.z = z;
      r.dir.x = dx;
      r.dir.y = 0;
      r.dir.z = dz;
      const hit = game.physics.world.castRayAndGetNormal(r, max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, filter);
      if (!hit) return null;
      const n = hit.normal;
      if (Math.abs(n.y) > 0.5) return null;
      const l = Math.hypot(n.x, n.z) || 1;
      return { dist: hit.timeOfImpact, nx: n.x / l, nz: n.z / l };
    };
    // No subtitles over the title, the creation screen or a loading fade.
    this.barks = new BarkDirector((text, speaker) => {
      if (!this.quiet()) game.events.emit('ui:subtitle', { text, speaker });
    });
    this.sun = sunTimes(game.time.date());
    this.budget = crowdBudget(game.time.hour, this.sun, 1, this.density);
    this.district = this.fixedDistrict ?? districtAt(0, 0);
    this.life = this.makeLife();
    this.vignettes = new VignetteDirector(VIGNETTES, this.makeVignetteHost());
    this.vignettes.enabled = opts.vignettes ?? q.get('vignettes') !== '0';
    this.carts = new CartDirector(this.makeCartHost());
    if (opts.carts === false) this.cartsEnabled = false;
    this.stations = new StationDirector(this.makeStationHost());
    this.stations.enabled = this.useAtlas && (opts.stations ?? q.get('stations') !== '0');
    if (!avatarLod.viewer) avatarLod.viewer = game.camera;
    this.listen();
  }

  cartsEnabled = true;

  // ---------------------------------------------------------------- queries

  get(id: string): Npc | undefined {
    return this.byId.get(id);
  }

  all(): readonly Npc[] {
    return this.list;
  }

  /**
   * Where a named NPC is (quest markers): its body when spawned, else where its schedule puts it
   * at this hour (or its home). Null for unknown or dead NPCs.
   */
  positionOf(id: string): THREE.Vector3 | null {
    const n = this.byId.get(id);
    if (n) return n.position.clone();
    if (this.deadNamed.has(id)) return null;
    const def = this.registry().get(id);
    if (!def) return null;
    const e = activeScheduleEntry(def.schedule, this.game.time.hour);
    const at = e?.at ?? def.home;
    const loc = at ? this.resolveLocation(at) : null;
    if (!loc) return null;
    return new THREE.Vector3(loc.x, this.game.heightmap?.heightAt(loc.x, loc.z) ?? 0, loc.z);
  }

  /** Living NPCs within `r` of a point (xz), nearest first. */
  near(p: THREE.Vector3Like, r: number, filter?: (n: Npc) => boolean): Npc[] {
    return this.list
      .filter((n) => !n.dead && Math.hypot(n.position.x - p.x, n.position.z - p.z) <= r && (!filter || filter(n)))
      .sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z));
  }

  /** Ids of NPCs who can see a point (crime witnesses): within `r`, facing it (±100°), clear line of sight. */
  witnesses(p: THREE.Vector3Like, r = 20): string[] {
    const out: string[] = [];
    for (const n of this.near(p, r)) {
      const h = n.headingTo(p.x, p.z);
      const d = Math.abs(((h - n.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d > 1.75) continue;
      const eye = tmpV.copy(n.position).setY(n.position.y + 1.55);
      const dir = tmpV2.set(p.x - eye.x, (p.y ?? eye.y) + 1.2 - eye.y, p.z - eye.z);
      const dist = dir.length();
      if (this.game.physics.raycast(eye, dir.normalize(), Math.max(0, dist - 0.5), Layer.World)) continue;
      out.push(n.id);
    }
    return out;
  }

  /**
   * A scripted fight (a quest's ambush): guards, vigiles and station watchmen leave fights involving
   * this actor to the player (bystanders still flee or gawk). Unmark with `on = false`; dead or
   * despawned actors drop out on their own.
   */
  questFight(actor: Actor, on = true) {
    if (on) this.questFighters.add(actor);
    else this.questFighters.delete(actor);
  }

  /** Do guards stay out of a fight with this aggressor (suppressGuards, or a quest fighter)? */
  guardsStandDown(aggressor: Actor | null): boolean {
    return this.suppressGuards || (!!aggressor && this.questFighters.has(aggressor));
  }

  /** Named NPCs kept out of the world while someone else plays them (see `holdNamed`). */
  private readonly held = new Set<string>();

  /**
   * Take a named NPC out of the world until the returned release is called (a staged fight's
   * fighter plays them in the arena meanwhile); they come back at their schedule's place.
   */
  holdNamed(id: string): () => void {
    this.held.add(id);
    const n = this.byId.get(id);
    if (n && !n.dead) this.despawn(n);
    return () => {
      this.held.delete(id);
    };
  }

  /** A guard of the watch: the Urban Cohorts or the Vigiles (crowd role or named faction). */
  isGuard(n: Npc): boolean {
    return !!n.role?.guard || n.def?.faction === 'cohortes-urbanae' || n.def?.faction === 'vigiles';
  }

  private directed = new Set<Npc>();

  /**
   * Walk someone to a point for another module (a guard coming to arrest the player). The NPC is
   * scripted until `undirect`; call again to move the goal. False when it can't be directed now
   * (dead, fighting, talking, or in someone else's script).
   */
  direct(npc: Npc, x: number, z: number, speed: number, arrive = 1.5): boolean {
    if (npc.dead || npc.isFighting() || npc.talking || (npc.scripted && !this.directed.has(npc))) return false;
    if (!npc.scripted) {
      npc.brain?.script(this.life);
      this.directed.add(npc);
    }
    npc.brain?.scriptGo(x, z, speed, arrive);
    return true;
  }

  /** Give a directed NPC back to normal life. */
  undirect(npc: Npc) {
    if (!this.directed.delete(npc)) return;
    if (npc.scripted && !npc.dead) npc.brain?.release(this.life);
  }

  /** Something alarming at a point (see the 'npc:alarm' event). */
  alarm(x: number, z: number, radius = 16, kind: 'fight' | 'crime' | 'danger' = 'fight', aggressor: Actor | null = null) {
    for (const n of this.near({ x, y: 0, z }, radius)) {
      if (n === aggressor) continue;
      n.brain?.alarm(this.life, x, z, kind, aggressor);
    }
  }

  /** The current district around the player. */
  get currentDistrict(): District {
    return this.district;
  }

  get currentBudget(): CrowdBudget {
    return this.budget;
  }

  /** Ambient crowd size right now. */
  get crowdCount(): number {
    let n = 0;
    for (const c of this.list) if (c.ambient) n++;
    return n;
  }

  // ---------------------------------------------------------------- spawning

  private streets(): StreetNav | null {
    const raw = streetsOf(this.game);
    if (!raw) return null;
    if (!this.streetNav || this.streetNav.source !== raw) this.streetNav = new StreetNav(raw);
    return this.streetNav;
  }

  private registry(): NpcRegistry {
    if (this.game.npcs) return this.game.npcs;
    if (!this.registryFallback) this.registryFallback = new NpcRegistry(loadNpcContent());
    return this.registryFallback;
  }

  private appearanceFor(role: AvatarRole, variant: number, toga: boolean): Appearance {
    const key = `${role}:${variant}:${toga ? 't' : ''}`;
    let a = this.appearanceCache.get(key);
    if (!a) {
      a = randomAppearance(new Rng(`crowd:${role}:${variant}`), role);
      if (toga && !a.garments.some((g) => g.kind === 'toga')) {
        a = { ...a, garments: [...a.garments.filter((g) => g.kind !== 'paenula' && g.kind !== 'lacerna'), { kind: 'toga', color: '#e4dccb' }] };
      }
      this.appearanceCache.set(key, a);
    }
    return a;
  }

  /** Floor height at a point: nav grid, else a ray from above the terrain. */
  floorY(x: number, z: number): number | null {
    const g = this.grid.heightAt(x, z);
    if (g !== null && this.grid.walkable(x, z)) return g;
    const ref = this.game.heightmap ? this.game.heightmap.heightAt(x, z) : (this.game.player?.position.y ?? 0);
    return this.game.physics.groundHeight(x, z, ref + 5.5, 14);
  }

  /** Spawn a crowd NPC of a role (escorts included unless `escorts: false`). */
  spawnAmbient(roleId: CrowdRoleId, x: number, z: number, heading?: number, opts: { escorts?: boolean; appearance?: Appearance; noProp?: boolean } = {}): Npc | null {
    const role = CROWD_ROLES[roleId];
    if (!role) return null;
    const y = this.floorY(x, z);
    if (y === null) return null;
    const avatarRole = this.rng.pick(role.avatar);
    const app = opts.appearance ?? this.appearanceFor(avatarRole, this.rng.int(0, VARIANTS - 1), !!role.toga);
    const label = role.id === 'foreigner' ? (FOREIGN_LABELS[avatarRole] ?? role.label) : role.id === 'citizen' && avatarRole === 'freedman' ? 'Freedman' : role.label;
    const npc = new Npc(this.game, {
      id: `cit-${++this.seq}`,
      name: label,
      appearance: app,
      position: { x, y: y + 0.03, z },
      heading: heading ?? this.rng.next() * Math.PI * 2,
      role,
      ambient: true,
      speed: role.speed[0] + this.rng.next() * (role.speed[1] - role.speed[0]),
    });
    this.register(npc);
    const night = this.budget.night;
    if (role.prop && !opts.noProp && this.rng.chance(role.propChance ?? 0)) {
      const lightProp = role.prop === 'lantern' || role.prop === 'torch';
      if (!lightProp || night || role.id === 'torchbearer') this.giveProp(npc, role.prop);
    }
    if (opts.escorts !== false && role.escort) {
      for (const e of role.escort) {
        const n = this.rng.int(e.count[0], e.count[1]);
        for (let i = 0; i < n; i++) {
          const h = npc.heading;
          const bx = x - Math.sin(h) * (1.4 + i) + Math.cos(h) * (i % 2 ? 0.7 : -0.7);
          const bz = z - Math.cos(h) * (1.4 + i) - Math.sin(h) * (i % 2 ? 0.7 : -0.7);
          const p = this.nav.snap(bx, bz, 2);
          const f = this.spawnAmbient(e.role, p.x, p.z, h, { escorts: false });
          if (!f) continue;
          f.leader = npc;
          npc.followers.push(f);
          // Night escorts carry torches for their master.
          if (night && !f.prop && npc.followers.length === 1) this.giveProp(f, 'torch');
        }
      }
    }
    return npc;
  }

  /** Spawn a named NPC from its definition. */
  spawnNamed(def: NpcDef, x: number, z: number, heading = 0): Npc | null {
    if (this.byId.has(def.id) || this.deadNamed.has(def.id)) return this.byId.get(def.id) ?? null;
    const y = this.floorY(x, z);
    if (y === null) return null;
    const npc = new Npc(this.game, { id: def.id, name: def.name, title: def.title, appearance: def.appearance, position: { x, y: y + 0.03, z }, heading, def, ambient: false, speed: 1.25 });
    if (def.disposition === 'hostile') npc.hostile = true;
    this.register(npc);
    return npc;
  }

  private giveProp(npc: Npc, kind: NonNullable<CrowdRole['prop']>) {
    npc.prop?.dispose();
    npc.prop = attachProp(npc.humanoid, kind);
    if ((kind === 'lantern' || kind === 'torch') && this.game.lights) {
      npc.light = this.game.lights.request({ position: npc.position, intensity: kind === 'torch' ? 9 : 5, distance: kind === 'torch' ? 10 : 8, flicker: kind === 'torch' ? true : 0.4, night: true });
    }
  }

  private register(npc: Npc) {
    npc.brain = new NpcBrain(npc);
    npc.bornAt = this.clock;
    this.list.push(npc);
    this.byId.set(npc.id, npc);
    this.game.actors.add(npc);
    this.game.interactions?.add(npc.interactable);
    const fs = this.game.audio?.footsteps;
    if (fs && typeof fs.attach === 'function') {
      const armored = npc.role?.id === 'soldier' || !!npc.def?.appearance.armor?.body;
      this.footsteps.set(npc, fs.attach(npc, { surfaceAt: () => 'stone', gear: armored ? 'armor' : 'cloth', voice: npc.humanoid.appearance.sex === 'female' ? 'f' : 'm' }));
    }
    this.stats.spawned++;
    this.game.events.emit('npc:spawned', { id: npc.id, ambient: npc.ambient });
  }

  /** Remove an NPC from the world. */
  despawn(npc: Npc) {
    const i = this.list.indexOf(npc);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.byId.delete(npc.id);
    this.spots.release(npc.id);
    const block = this.workBlocks.get(npc.id);
    if (block) {
      block.removeFromParent();
      this.workBlocks.delete(npc.id);
    }
    this.game.interactions?.remove(npc.interactable);
    this.footsteps.get(npc)?.detach();
    this.footsteps.delete(npc);
    if (npc.leader) npc.leader.followers = npc.leader.followers.filter((f) => f !== npc);
    for (const f of npc.followers) f.leader = null;
    npc.followers = [];
    if (this.talk?.npc === npc) this.talk = null;
    this.game.actors.remove(npc);
    this.stats.despawned++;
    this.game.events.emit('npc:despawned', { id: npc.id });
  }

  /**
   * The player jumped somewhere else: drop the ambient people and scenes left behind (named NPCs
   * go by their own distance rule) and fill the new place at once on the next update.
   */
  relocate() {
    this.vignettes.stopAll();
    this.carts.clear();
    this.stations.reset();
    if (this.talk) this.endTalk();
    for (const n of [...this.list]) if (n.ambient) this.despawn(n);
    this.initialDone = false;
    this.floodT = 0;
    this.grid.resetFlood();
    // Something happens soon after arriving somewhere new.
    this.vignettes.nextAt = this.clock + 6 + this.rng.next() * 6;
    // The hour may have jumped: no stale night budget (carts!) for the next fixed step.
    this.budget = crowdBudget(this.game.time.hour, this.sun, this.district.density, this.density);
    this.districtAt = { x: Infinity, z: Infinity };
  }

  /** Despawn everyone (scene change, tests). */
  clear() {
    this.vignettes.stopAll();
    this.carts.clear();
    this.stations.clear();
    for (const n of [...this.list]) this.despawn(n);
  }

  /** Kill an NPC (the combat module calls this); essential ones are knocked down instead. */
  kill(npc: Npc) {
    if (npc.dead) return;
    if (npc.essential) {
      npc.humanoid.play('knockdown');
      return;
    }
    npc.dead = true;
    npc.canMove = false;
    npc.humanoid.setDead(true);
    npc.mover.clear();
    this.game.interactions?.remove(npc.interactable);
    if (!npc.ambient) this.deadNamed.add(npc.id);
    this.game.events.emit('npc:died', { id: npc.id, named: !npc.ambient });
  }

  // ---------------------------------------------------------------- talking

  /** The player pressed Talk on an NPC. */
  talkTo(npc: Npc) {
    if (npc.dead || npc.hostile) return;
    npc.talking = true;
    npc.velocity.set(0, 0, 0);
    npc.mover.clear();
    const dlg = this.game.dialogue;
    let started = false;
    this.dialogueOpened = false;
    if (dlg && typeof dlg.start === 'function') {
      try {
        started = !!dlg.start(npc.id, { name: npc.name, dialogueId: npc.def?.dialogue });
      } catch (err) {
        console.error('[npc] dialogue failed to start', err);
      }
    }
    this.game.events.emit('npc:talk', { npcId: npc.id, dialogue: started });
    if (!started) {
      const line = this.barks.pick(this.rng, { kind: npc.def?.barks?.length ? 'greet' : 'brushoff', table: npc.barkTable, own: npc.def?.barks });
      if (line) this.barks.say(npc.id, npc.name, line);
      this.talk = { npc, until: this.clock + 3.5, bridged: true, check: 0 };
      return;
    }
    this.talk = { npc, until: Infinity, bridged: false, check: 2 };
  }

  private endTalk() {
    const t = this.talk;
    if (!t) return;
    t.npc.talking = false;
    t.npc.lookAtPoint(null);
    this.talk = null;
  }

  private updateTalk() {
    const t = this.talk;
    if (!t) return;
    const pl = this.game.player;
    const far = pl ? Math.hypot(pl.position.x - t.npc.position.x, pl.position.z - t.npc.position.z) > 6 : true;
    if (this.clock > t.until || far) {
      if (far && this.game.dialogue?.active) this.game.dialogue.end();
      this.endTalk();
      return;
    }
    if (pl) t.npc.lookAtPoint(tmpV.copy(pl.position).setY(pl.position.y + (pl.eyeHeight ?? 1.6)));
    // Nobody showed the conversation? Open the UI panel ourselves (once, a frame later).
    if (!t.bridged && --t.check <= 0) {
      t.bridged = true;
      const dlg = this.game.dialogue;
      if (!this.dialogueOpened && dlg?.active && this.game.ui?.openDialogue) {
        this.game.ui.openDialogue(new EngineDialogueView(dlg, t.npc.id, t.npc.name, t.npc.title));
      } else if (!dlg?.active) {
        this.endTalk();
      }
    }
  }

  private listen() {
    const ev = this.game.events;
    this.offs.push(
      ev.on('ui:modal', (e) => {
        if (e.open && e.id === 'dialogue') this.dialogueOpened = true;
      }),
      ev.on('dialogue:ended', (e) => {
        if (this.talk?.npc.id === e.npcId) this.endTalk();
      }),
      ev.on('dialogue:attack', (e) => {
        const n = this.byId.get(e.npcId);
        if (!n) return;
        this.endTalk();
        n.hostile = true;
        n.setSolid(true);
        if (this.game.player) combatOf(this.game)?.engage?.(n, this.game.player);
        this.alarm(n.position.x, n.position.z, 14, 'fight', this.game.player ?? null);
      }),
      // A new game, a loaded save or the quick start: fill the place afresh for its hour.
      ev.on('game:started', () => this.relocate()),
      ev.on('npc:alarm', (e) => {
        const a = e.aggressorId ? (this.game.actors.get(e.aggressorId) ?? null) : null;
        this.alarm(e.x, e.z, e.radius ?? 16, e.kind ?? 'fight', a);
      }),
    );
    // Crimes the RPG module records (assault, theft…) frighten bystanders near the player, and the
    // watch comes over (to arrest: game/law.ts has the talk). Violence is answered with force by
    // the law module's own alarm, which names the player as the aggressor.
    this.offs.push(
      ev.on('crime:committed', (e) => {
        const p = this.game.player;
        if (p && e.witnessed) this.alarm(p.position.x, p.position.z, 14, 'crime', null);
      }),
    );
  }

  // ---------------------------------------------------------------- life context

  private makeLife(): LifeContext {
    const m = this;
    return {
      get game() {
        return m.game;
      },
      get rng() {
        return m.rng;
      },
      get nav() {
        return m.nav;
      },
      get spots() {
        return m.spots;
      },
      get now() {
        return m.clock;
      },
      get hour() {
        return m.game.time.hour;
      },
      get sun() {
        return m.sun;
      },
      get phase() {
        return m.phase;
      },
      get playerPos() {
        return m.game.player?.position ?? null;
      },
      templesShut: () => m.templesShut(),
      guardsStandDown: (aggressor) => m.guardsStandDown(aggressor),
      reachable: (x, z) => !m.grid.ready(x, z) || m.grid.reachable(x, z),
      warp: (npc, x, z) => {
        const y = m.floorY(x, z);
        if (y === null) return false;
        npc.teleport({ x, y: y + 0.03, z });
        npc.mover.stuck.reset(x, z);
        return true;
      },
      wanderTarget: (npc, radius, minR = 0) => m.wanderTarget(npc, radius, minR),
      exitTarget: (npc) => m.exitTarget(npc),
      resolveLocation: (id) => m.resolveLocation(id),
      despawn: (npc) => m.despawn(npc),
      bark: (npc, kind, urgent) => m.bark(npc, kind, urgent),
      isVisible: (x, y, z) => m.isVisible(x, y, z),
      travelTarget: (npc) => m.travelTarget(npc),
      travelChance: (npc) => m.travelChance(npc),
      chatPartner: (npc) => {
        for (const o of m.near(npc.position, 7)) {
          if (o === npc || !o.ambient || o.scripted || o.station || o.leader || o.followers.length || o.talking) continue;
          const k = o.brain?.task?.kind;
          if (k === 'goto' || k === 'idle' || k === undefined) {
            if (o.brain?.task?.spot) continue;
            return o;
          }
        }
        return null;
      },
      engage: (guard, target) => {
        const c = combatOf(m.game);
        if (!c?.engage || !target) return;
        guard.setSolid(true);
        try {
          c.engage(guard, target);
        } catch (err) {
          console.error('[npc] combat.engage failed', err);
        }
      },
    };
  }

  /**
   * A wander destination: a few walkable, reachable candidates on street level, scored so the
   * crowd drifts toward where the player is looking (people nobody sees are wasted budget) and
   * stays inside the bubble.
   */
  private wanderTarget(npc: Npc, radius: number, minR: number): Vec2 | null {
    const g = this.grid;
    const lanes = this.lanes();
    const square = this.inSquare();
    const pl = this.game.player?.position;
    let best: Vec2 | null = null;
    let bestScore = -Infinity;
    for (let i = 0, found = 0; i < 8 && found < 3; i++) {
      let p: Vec2 | null = null;
      if (g.ready(npc.position.x, npc.position.z)) p = g.randomWalkable(() => this.rng.next(), npc.position.x, npc.position.z, radius, 8, minR);
      else {
        const a = this.rng.next() * Math.PI * 2;
        const r = minR + this.rng.next() * (radius - minR);
        p = { x: npc.position.x + Math.cos(a) * r, z: npc.position.z + Math.sin(a) * r };
      }
      if (!p) continue;
      // Stay around the player's bubble (people out there are despawned anyway).
      const dp = pl ? Math.hypot(p.x - pl.x, p.z - pl.z) : 0;
      if (pl && dp > this.crowdRadius() + 8) continue;
      // Stay on the street level: skip podium tops and roofs far above the terrain.
      const y = g.heightAt(p.x, p.z);
      if (y !== null && Math.abs(y - npc.position.y) > 3) continue;
      if (!g.reachable(p.x, p.z)) continue;
      // Not up a grassy hillside.
      if (this.steep(p.x, p.z, y)) continue;
      found++;
      let score = this.rng.next();
      // Streets and squares over open ground.
      const ln = square ? null : lanes?.nearest(p.x, p.z, 8);
      if (ln && ln.d < ln.lane.width / 2 + 3) score += 0.6;
      if (pl) {
        const fx = (p.x - pl.x) / (dp || 1);
        const fz = (p.z - pl.z) / (dp || 1);
        if (dp > 6 && dp < 55 && fx * this.look.x + fz * this.look.z > 0.45 && this.isSeen(p.x, (y ?? npc.position.y) + 1.4, p.z)) score += dp < 38 ? 2.2 : 1.6;
        if (dp < 40) score += 0.4;
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private exitTarget(npc: Npc): { x: number; z: number; door: boolean } | null {
    const streets = this.streets();
    if (streets) {
      const door = streets.spotsNear(npc.position.x, npc.position.z, 30, 'houseDoor')[0];
      if (door) return { x: door.x, z: door.z, door: true };
    }
    const pl = this.game.player?.position;
    if (!pl) return null;
    // Off down the street, away from the player.
    const lanes = this.lanes();
    if (lanes) {
      const away = Math.atan2(npc.position.x - pl.x, npc.position.z - pl.z);
      const t = lanes.ahead(() => this.rng.next(), npc.position.x, npc.position.z, away, 34 + this.rng.next() * 20, 10);
      if (t && Math.hypot(t.x - pl.x, t.z - pl.z) > Math.hypot(npc.position.x - pl.x, npc.position.z - pl.z) + 8) {
        const p = this.nav.snap(t.x, t.z, 4);
        return { x: p.x, z: p.z, door: false };
      }
    }
    // Away from the player, ideally out of sight.
    const dx = npc.position.x - pl.x;
    const dz = npc.position.z - pl.z;
    const d = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 6; i++) {
      const a = Math.atan2(dz, dx) + (this.rng.next() - 0.5) * 1.6;
      const r = 30 + this.rng.next() * 25;
      const p = this.nav.snap(npc.position.x + Math.cos(a) * r, npc.position.z + Math.sin(a) * r, 5);
      if (Math.hypot(p.x - pl.x, p.z - pl.z) > d) return { x: p.x, z: p.z, door: false };
    }
    return null;
  }

  /**
   * Location id → game point. Atlas landmarks resolve to the forecourt in front of the facade (the
   * game flow registers every landmark in game.locations at its centre, which is inside or on top
   * of the building; a location registered under a landmark id at a point of its own wins); then
   * game.locations (content's places); then street spots.
   */
  resolveLocation(id: string): { x: number; z: number; radius: number } | null {
    const loc = this.game.locations?.get(id);
    const lm = this.useAtlas ? atlas.LANDMARK_BY_ID[id] : undefined;
    if (lm) {
      const [gx, gz] = toGame(lm.center[0], lm.center[1]);
      if (loc && Math.hypot(loc.position.x - gx, loc.position.z - gz) > 1) return { x: loc.position.x, z: loc.position.z, radius: loc.radius };
      const f = landmarkForecourt(lm);
      const poi = allPois().find((p) => p.landmarkId === id);
      return { x: f.x, z: f.z, radius: poi ? Math.max(4, poi.radius) : 6 };
    }
    if (loc) return { x: loc.position.x, z: loc.position.z, radius: loc.radius };
    const s = this.streets()?.spots.find((sp) => sp.id === id);
    if (s) return { x: s.x, z: s.z, radius: 2 };
    return null;
  }

  /**
   * Where a named NPC appears near a resolved location: a walkable cell the player can reach, at
   * street level (not on a podium top, a roof or a pediment). Null while the nav grid there isn't
   * built yet (the NPC waits until the player is closer) or when nothing near qualifies.
   */
  namedSpawnPoint(loc: { x: number; z: number; radius: number }): { x: number; z: number } | null {
    const g = this.grid;
    if (!g.ready(loc.x, loc.z)) return null;
    const hm = this.game.heightmap;
    // Several people share a spot (the Ludus regulars all drill at the arena centre): spread them.
    const jitter = Math.max(2.5, Math.min(4, loc.radius));
    for (const [r, tries] of [[5, 8], [12, 3], [25, 1]] as const) {
      for (let i = 0; i < tries; i++) {
        const j = i === 0 ? 0 : jitter;
        const c = g.nearestWalkable(loc.x + (this.rng.next() - 0.5) * j, loc.z + (this.rng.next() - 0.5) * j, r, { x: 0, z: 0 }, true);
        if (!c || !g.reachable(c.x, c.z) || this.occupied(c.x, c.z)) continue;
        const y = g.heightAt(c.x, c.z);
        if (y === null) continue;
        if (hm && Math.abs(y - hm.heightAt(c.x, c.z)) > NAMED_MAX_LIFT) continue;
        return c;
      }
    }
    return null;
  }

  /** Someone already stands within 0.9 m of this point (spawns must not stack people). */
  private occupied(x: number, z: number): boolean {
    for (const n of this.list) if (!n.dead && Math.abs(n.position.x - x) < 0.9 && Math.abs(n.position.z - z) < 0.9) return true;
    return false;
  }

  bark(npc: Npc, kind: BarkKind, urgent = false): boolean {
    const ctx = { kind, table: npc.barkTable, district: this.district.id, phase: this.phase, own: kind === 'greet' || kind === 'ambient' ? npc.def?.barks : undefined, lemuria: this.isLemuria() };
    return !!this.barks.bark(this.rng, npc.id, npc.name, ctx, urgent);
  }

  /** Atlas points of interest (none when the atlas is off). */
  pois(x: number, z: number, r: number, kind?: PoiKind | readonly PoiKind[]): Poi[] {
    return this.useAtlas ? poisNear(x, z, r, kind) : [];
  }

  /** Atlas roads (wheel-worthy ones) passing within 40 m of the player, in game metres. */
  roadsNear(): { x: number; z: number }[][] {
    const pp = this.game.player?.position;
    const lanes = this.lanes();
    if (!lanes || !pp) return [];
    const out: { x: number; z: number }[][] = [];
    for (const l of lanes.near(pp.x, pp.z, 40)) if (cartLane(l)) out.push(l.pts.map((p) => ({ x: p.x, z: p.z })));
    const shuffled = this.rng.shuffle(out);
    // Before dawn at the Porta Capena the last carts leave the city through the gate (GDD §17.2).
    const gate = this.gateRoute(pp);
    if (gate) shuffled.unshift(gate);
    return shuffled;
  }

  /** From inside the Porta Capena out along the Via Appia, when the player is near it in the night watches. */
  private gateRoute(pp: THREE.Vector3Like): { x: number; z: number }[] | null {
    if (!this.budget.night) return null;
    const lanes = this.lanes();
    const intra = lanes?.lanes.find((l) => l.id === 'conn-capena-intra');
    const appia = lanes?.lanes.find((l) => l.id === 'via-appia');
    if (!intra || !appia) return null;
    const gate = intra.pts[0];
    if (Math.hypot(gate.x - pp.x, gate.z - pp.z) > 90) return null;
    const inner = [...intra.pts].reverse();
    const outer: { x: number; z: number }[] = [];
    for (let s = 6; s <= 80; s += 6) outer.push(laneAt(appia, s, 1.2));
    return [...inner.map((p) => ({ x: p.x, z: p.z })), ...outer.map((p) => ({ x: p.x, z: p.z }))];
  }

  /** Is there room for a person standing at (x, y, z) (feet)? */
  isFree(x: number, y: number, z: number): boolean {
    const hit = this.game.physics.world.intersectionWithShape({ x, y: y + 0.85, z }, { x: 0, y: 0, z: 0, w: 1 }, this.freeShape, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groups(ALL_LAYERS, Layer.World));
    return !hit;
  }

  /** The game flow is somewhere other than play (title, creation, spawning): no barks or scenes. */
  quiet(): boolean {
    const f = (this.game as unknown as { flow?: { state?: string } }).flow;
    return !!f && typeof f.state === 'string' && f.state !== 'playing';
  }

  /**
   * Is elapsed day `day` the Lemuria? Festival effects fire on the first elapsed day that shows
   * 9, 11 or 13 May (GDD §14.10); the calendar (game.calendar) knows which day that was, and
   * without it (test beds) only the start date counts.
   */
  lemuriaOnDay(day: number): boolean {
    if (day < 0) return false;
    const cal = (this.game as unknown as { calendar?: CalendarLike }).calendar;
    if (cal && typeof cal.serialize === 'function') {
      const seen = cal.serialize().firstSeen ?? {};
      for (const k in seen) {
        if (seen[k] !== day) continue;
        const d = dateOfOrdinal(Number(k), cal.year ?? 113);
        return isLemuriaDate(d.month, d.day);
      }
      return false;
    }
    const st = this.game.time.start;
    return day === 0 && !!st && isLemuriaDate(st.month, st.day);
  }

  /**
   * The Lemuria right now: 'day' from sunrise to sunset of the festival day (temple cellae shut),
   * 'night' from that sunset until sunrise of the next elapsed day (the midnight bean rite, the
   * ghost-glimpse, mq-03), else null.
   */
  lemuriaPhase(): 'day' | 'night' | null {
    const t = this.game.time;
    // Asked by every bark and scene: worked out once per game minute.
    const key = Math.floor(t.totalHours * 60);
    const c = this.lemCache;
    if (c.key === key) return c.phase;
    const h = t.hour;
    const day = t.dayIndex;
    let phase: 'day' | 'night' | null;
    if (h < this.sun.rise) phase = this.lemuriaOnDay(day - 1) ? 'night' : null;
    else if (!this.lemuriaOnDay(day)) phase = null;
    else phase = h >= this.sun.set ? 'night' : 'day';
    c.key = key;
    c.phase = phase;
    c.shut = null;
    return phase;
  }

  /** Ghosts walk tonight (the Lemuria night). */
  isLemuria(): boolean {
    return this.lemuriaPhase() === 'night';
  }

  /** Temple cellae are shut today (the Lemuria day): no sacrifices before temples, nobody at prayer inside. */
  templesShut(): boolean {
    this.lemuriaPhase();
    const c = this.lemCache;
    if (c.shut !== null) return c.shut;
    const hooks = (this.game as unknown as { rpg?: { hooks?: { templesClosed?: () => boolean } } }).rpg?.hooks;
    c.shut = hooks && typeof hooks.templesClosed === 'function' ? !!hooks.templesClosed() : this.lemuriaOnDay(this.game.time.dayIndex);
    return c.shut;
  }

  /** In the camera frustum (no occlusion). */
  isVisible(x: number, y: number, z: number): boolean {
    return this.frustum.containsPoint(tmpV.set(x, y, z));
  }

  /** In view and not hidden behind world geometry. */
  isSeen(x: number, y: number, z: number): boolean {
    if (!this.isVisible(x, y, z)) return false;
    const cam = this.game.camera.getWorldPosition(tmpV2);
    const dir = tmpV.set(x - cam.x, y - cam.y, z - cam.z);
    const d = dir.length();
    return !this.game.physics.raycast(cam, dir.normalize(), Math.max(0, d - 0.5), Layer.World);
  }

  // ---------------------------------------------------------------- vignette & cart hosts

  private makeVignetteHost(): VignetteHost {
    const m = this;
    return {
      get game() {
        return m.game;
      },
      get rng() {
        return m.rng;
      },
      get nav() {
        return m.nav;
      },
      get life() {
        return m.life;
      },
      get dt() {
        return m.frameDt;
      },
      get now() {
        return m.clock;
      },
      get night() {
        return m.budget.night;
      },
      get lemuria() {
        return m.isLemuria();
      },
      get templesShut() {
        return m.templesShut();
      },
      get player() {
        return m.game.player?.position ?? tmpV.set(0, 0, 0);
      },
      get look() {
        return m.look;
      },
      free: (x, z, r, filter) =>
        m.near({ x, y: 0, z }, r, (n) => n.ambient && !n.scripted && !n.station && !n.talking && !n.leader && !n.followers.length && !n.dead && !n.isFighting() && n.brain?.task?.kind !== 'flee' && (!filter || filter(n))),
      spawn: (role, x, z, heading, opts) => {
        // Scenes recruit from the crowd first; extras never break the night cap (AC-10).
        if (m.crowdCount >= m.maxCrowd + 8 || (m.budget.night && m.crowdCount >= NIGHT_CAP)) return null;
        return m.spawnAmbient(role, x, z, heading, opts);
      },
      vanish: (npc) => m.despawn(npc),
      say: (npc, text) => {
        if (typeof npc === 'string') m.barks.say(`v:${npc}`, npc, text);
        else m.barks.say(npc.id, npc.name, text);
      },
      sfx: (id, pos) => m.game.events.emit('sfx', { id, position: pos }),
      floorY: (x, z) => m.floorY(x, z),
      wallProbe: (x, y, z, dx, dz, max) => m.wallProbe(x, y, z, dx, dz, max),
      isVisible: (x, y, z) => m.isVisible(x, y, z),
      snap: (x, z, r = 4) => {
        if (!m.grid.ready(x, z)) return { x, z };
        return m.grid.nearestWalkable(x, z, r, { x: 0, z: 0 }, true);
      },
      alive: (n) => m.byId.get(n.id) === n,
      takeOver: (n) => n.brain?.script(m.life),
      giveBack: (n) => n.brain?.release(m.life),
      addToScene: (o) => m.game.scene.add(o),
      pois: (x, z, r, k) => m.pois(x, z, r, k),
      busy: () => m.quiet() || !!m.talk || !!(m.game.player && combatOf(m.game)?.isInCombat?.(m.game.player)),
    };
  }

  private makeCartHost(): CartHost {
    const m = this;
    return {
      get game() {
        return m.game;
      },
      get nav() {
        return m.nav;
      },
      streets: () => m.streets(),
      roads: () => m.roadsNear(),
      get player() {
        return m.game.player?.position ?? null;
      },
      rand: () => m.rng.next(),
      isVisible: (x, y, z) => m.isSeen(x, y, z),
      floorY: (x, z) => m.floorY(x, z),
      spawnDrover: (x, z, h) => {
        const d = m.spawnAmbient('carter', x, z, h, { escorts: false });
        if (d) d.brain?.script(m.life);
        return d;
      },
      releaseDrover: (n) => {
        if (m.byId.get(n.id) === n) {
          n.brain?.release(m.life);
          n.brain?.leave(m.life);
        }
      },
      bark: (n, text) => m.barks.say(n.id, n.name, text),
    };
  }

  private makeStationHost(): StationHost {
    const m = this;
    return {
      get game() {
        return m.game;
      },
      get player() {
        return m.game.player?.position ?? null;
      },
      get phase() {
        return m.phase;
      },
      isSeen: (x, y, z) => m.isSeen(x, y, z),
      floorY: (x, z) => m.floorY(x, z),
      spawnMember: (def, mem, x, z, heading, from) => m.spawnStationMember(def, mem, x, z, heading, from),
      hiddenNear: (x, z, rMin, rMax) => m.hiddenNear(x, z, rMin, rMax),
      dismiss: (npc, now) => {
        if (now || !npc.brain) {
          m.despawn(npc);
          return;
        }
        npc.station = null;
        if (!npc.scripted && !npc.talking) npc.brain.leave(m.life);
      },
      alive: (n) => m.byId.get(n.id) === n,
      block: (x, z, r) => {
        for (let dz = -r; dz <= r; dz += 0.5) for (let dx = -r; dx <= r; dx += 0.5) if (dx * dx + dz * dz <= r * r) m.grid.block(x + dx, z + dz);
      },
    };
  }

  /**
   * A station member for its post at (x, z): the role's look, the station's prop, label and loop.
   * Spawned at `from` (out of sight nearby) it walks to the post first.
   */
  private spawnStationMember(def: StationDef, mem: StationMember, x: number, z: number, heading: number, from?: { x: number; z: number }): Npc | null {
    const sx = from?.x ?? x;
    const sz = from?.z ?? z;
    const n = this.spawnAmbient(mem.role, sx, sz, from ? Math.atan2(x - sx, z - sz) : heading, { escorts: false, noProp: mem.prop !== undefined });
    if (!n) return null;
    if (mem.prop) this.giveProp(n, mem.prop);
    if (mem.label) n.name = mem.label;
    if (mem.barks) n.barkTable = mem.barks;
    n.station = { id: def.id, x, z, face: heading, loop: mem.loop };
    n.brain?.next(this.life);
    return n;
  }

  /** A walkable, reachable point within rMin–rMax of (x, z) at street level that the camera can't see. */
  hiddenNear(x: number, z: number, rMin: number, rMax: number): { x: number; z: number } | null {
    const g = this.grid;
    if (!g.ready(x, z)) return null;
    const hm = this.game.heightmap;
    for (let i = 0; i < 10; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = rMin + this.rng.next() * (rMax - rMin);
      const c = g.nearestWalkable(x + Math.sin(a) * r, z + Math.cos(a) * r, 2, { x: 0, z: 0 }, true);
      if (!c) continue;
      const y = g.heightAt(c.x, c.z);
      if (y === null || (hm && Math.abs(y - hm.heightAt(c.x, c.z)) > 1.6) || this.steep(c.x, c.z, y)) continue;
      if (this.isSeen(c.x, y + 1.2, c.z) || this.isSeen(c.x, y + 0.2, c.z)) continue;
      return c;
    }
    return null;
  }

  // ---------------------------------------------------------------- streets (lanes)

  /** Street centrelines people walk along: the atlas roads (until the city's street graph). */
  lanes(): LaneSet | null {
    return this.fixedLanes ?? (this.useAtlas ? atlasLanes() : null);
  }

  /**
   * How far from the player the crowd spreads (m): tight in the fora so the squares feel packed,
   * wider in the streets where people stream past.
   */
  crowdRadius(): number {
    if (!this.useAtlas && !this.fixedLanes) return SPAWN_MAX;
    return this.inSquare() ? 42 : this.budget.night ? 50 : 56;
  }

  /**
   * How far along the streets late arrivals spawn (m): wider than the crowd radius outside the
   * squares, so people far down an open street can appear in view and walk toward the player.
   */
  laneRadius(): number {
    if (this.inSquare()) return this.crowdRadius();
    return this.budget.night ? LANE_SPAWN.radiusNight : LANE_SPAWN.radiusDay;
  }

  /** In one of the great squares (the fora), where people mill about rather than stream past. */
  inSquare(): boolean {
    return this.district.id === 'dist-forum-romanum' || this.district.id === 'dist-fora-imperialia';
  }

  /** A walkable, reachable point in front of the camera, 8–34 m from the player (or null). */
  viewTarget(): Vec2 | null {
    const pp = this.game.player?.position;
    if (!pp) return null;
    const ahead = Math.atan2(this.look.x, this.look.z);
    const halfFov = Math.atan(Math.tan((this.game.camera.fov * Math.PI) / 360) * this.game.camera.aspect);
    for (let i = 0; i < 6; i++) {
      const a = ahead + (this.rng.next() * 2 - 1) * halfFov * 0.8;
      const d = 8 + this.rng.next() * 26;
      const x = pp.x + Math.sin(a) * d;
      const z = pp.z + Math.cos(a) * d;
      if (!this.grid.ready(x, z)) continue;
      const c = this.grid.nearestWalkable(x, z, 2, { x: 0, z: 0 }, true);
      if (!c) continue;
      const y = this.grid.heightAt(c.x, c.z);
      if (y === null || Math.abs(y - pp.y) > 4 || this.steep(c.x, c.z, y)) continue;
      return { x: c.x, z: c.z };
    }
    return null;
  }

  /** A walkable cell at street level (on the terrain) near a point: a lane if there is one. */
  private streetLevelNear(x: number, z: number): Vec2 | null {
    const g = this.grid;
    const hm = this.game.heightmap;
    const ok = (p: Vec2 | null) => {
      if (!p || !g.walkable(p.x, p.z)) return false;
      const h = g.heightAt(p.x, p.z);
      return h !== null && (!hm || Math.abs(h - hm.heightAt(p.x, p.z)) < 0.8);
    };
    const ln = this.lanes()?.nearest(x, z, 40);
    if (ln) {
      const c = g.nearestWalkable(ln.x, ln.z, 3);
      if (ok(c)) return c;
    }
    for (let r = 4; r <= 32; r += 4) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const c = g.nearestWalkable(x + Math.cos(a) * r, z + Math.sin(a) * r, 1.5);
        if (ok(c)) return c;
      }
    }
    return null;
  }

  /** Terrain slope (rise over run) at a point; hillsides are no place for a crowd. */
  slopeAt(x: number, z: number): number {
    const hm = this.game.heightmap;
    if (!hm) return 0;
    const e = 1.5;
    const gx = (hm.heightAt(x + e, z) - hm.heightAt(x - e, z)) / (2 * e);
    const gz = (hm.heightAt(x, z + e) - hm.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }

  /** On open terrain steeper than a street (a built floor, steps or a podium, doesn't count). */
  private steep(x: number, z: number, floorY: number | null): boolean {
    const hm = this.game.heightmap;
    if (!hm) return false;
    if (floorY !== null && Math.abs(floorY - hm.heightAt(x, z)) > 0.4) return false;
    return this.slopeAt(x, z) > 0.3;
  }

  /** The next leg along the street an NPC is on (keeps its direction, turns at junctions). */
  private travelTarget(npc: Npc): Vec2 | null {
    const lanes = this.lanes();
    if (!lanes) return null;
    const pl = this.game.player?.position;
    for (let i = 0; i < 3; i++) {
      // Mostly carry on the way they face; sometimes turn round.
      const h = i === 0 && this.rng.chance(0.85) ? npc.heading : npc.heading + Math.PI;
      const t = lanes.ahead(() => this.rng.next(), npc.position.x, npc.position.z, h, 22 + this.rng.next() * 22, 12);
      if (!t) return null;
      // Stay in the bubble.
      if (pl && Math.hypot(t.x - pl.x, t.z - pl.z) > this.crowdRadius() + 16) continue;
      if (!this.grid.ready(t.x, t.z)) return { x: t.x, z: t.z };
      const p = this.grid.nearestWalkable(t.x, t.z, 3, { x: 0, z: 0 }, true);
      if (p) return { x: p.x, z: p.z };
    }
    return null;
  }

  /** Wanderers near a street usually walk on along it; in the squares they mostly browse. */
  private travelChance(npc: Npc): number {
    const lanes = this.lanes();
    if (!lanes || npc.station || npc.leader) return 0;
    const near = lanes.nearest(npc.position.x, npc.position.z, 10);
    if (!near) return 0;
    return this.inSquare() ? 0.2 : this.budget.night ? 0.7 : 0.55;
  }

  // ---------------------------------------------------------------- systems

  fixedUpdate(dt: number) {
    const t0 = performance.now();
    this.clock += dt;
    this.nav.beginStep();
    const player = this.game.player;
    const pp = player?.position;
    // Neighbour hash.
    this.hash.clear();
    for (const n of this.list) {
      n.hx = n.position.x;
      n.hz = n.position.z;
      if (!n.dead) this.hash.insert(n);
    }
    const pv = player?.velocity;
    const pSpeed = pv ? Math.sqrt(pv.x * pv.x + pv.z * pv.z) : 0;
    const armed = !!player?.combatStance;
    // The per-phase timings (stats) are taken on every 8th step only: performance.now() per NPC
    // costs time and garbage (boxed doubles).
    const timed = (this.stepNo++ & 7) === 0;
    let tBrain = 0;
    let tSteer = 0;
    let tLoco = 0;
    // A copy: brains may despawn people (or vignettes spawn them) during the loop.
    const list = this.stepList;
    list.length = 0;
    for (let i = 0; i < this.list.length; i++) list.push(this.list[i]);
    const carts = this.carts.carts;
    for (let li = 0; li < list.length; li++) {
      const n = list[li];
      if (this.byId.get(n.id) !== n) continue;
      if (n.dead) {
        if (n.sim === 'full') n.locomote(ZERO, dt);
        continue;
      }
      if (n.isFighting()) {
        // The combat module owns fighters' movement; keep them solid.
        n.setSolid(true);
        continue;
      }
      const brain = n.brain!;
      const tb = timed ? performance.now() : 0;
      brain.step(dt, this.life, desired);
      if (timed) tBrain += performance.now() - tb;
      if (brain.unstickRequested) {
        brain.unstickRequested = false;
        this.unstick(n);
      }
      // Gone home (despawned) during its step: its body no longer exists.
      if (this.byId.get(n.id) !== n) continue;
      let wx = desired.x;
      let wz = desired.z;
      const ts = timed ? performance.now() : 0;
      if (n.sim !== 'cheap') {
        // Steering with neighbours, the player and carts (pooled records: no garbage per step).
        const ns = this.steerNs;
        ns.length = 0;
        const around = this.hash.query(n.hx, n.hz, 3.2, this.neigh, n);
        for (let k = 0; k < around.length; k++) {
          const o = around[k];
          // Followers don't push their own leader around (and vice versa) as hard.
          const w = o === n.leader || o.leader === n ? 0.4 : 1;
          ns.push(this.neighbor(ns.length, o.hx, o.hz, o.velocity.x, o.velocity.z, 0.28, w));
        }
        if (pp && pv) {
          const dpx = pp.x - n.position.x;
          const dpz = pp.z - n.position.z;
          const dp = Math.sqrt(dpx * dpx + dpz * dpz);
          if (dp < 4) {
            ns.push(this.neighbor(ns.length, pp.x, pp.z, pv.x, pv.z, 0.35, armed ? 4 : 2.2));
            // Shoulder-through: the player walking into someone shoves them aside (GDD §14.7b).
            if (dp < 0.85 && pSpeed > 1 && (pv.x * -dpx + pv.z * -dpz) / (dp || 1) > 0.5) this.shove(n, pp.x, pp.z, pSpeed, dp);
          }
        }
        for (let k = 0; k < carts.length; k++) {
          const c = carts[k];
          const cx = c.pos.x - n.position.x;
          const cz = c.pos.z - n.position.z;
          if (cx * cx + cz * cz < 36) ns.push(this.neighbor(ns.length, c.pos.x, c.pos.z, Math.sin(c.heading) * c.speed, Math.cos(c.heading) * c.speed, c.radius, 3));
        }
        if (ns.length) {
          const ag = this.agent;
          ag.x = n.position.x;
          ag.z = n.position.z;
          ag.vx = n.velocity.x;
          ag.vz = n.velocity.z;
          ag.seed = n.steerSeed;
          ag.maxSpeed = Math.max(n.walkSpeed * 1.3, Math.sqrt(desired.x * desired.x + desired.z * desired.z));
          steer(ag, desired, ns, DEFAULT_STEER, steered);
          wx = steered.x;
          wz = steered.z;
        }
      }
      // Face where we walk.
      if (wx * wx + wz * wz > 0.0625 && desired.x * desired.x + desired.z * desired.z > 0.01) n.turnToward(headingFromDir(desired.x * 0.7 + wx * 0.3, desired.z * 0.7 + wz * 0.3), 5.5, dt);
      wish.set(wx, 0, wz);
      n.wish.copy(wish);
      const tl = timed ? performance.now() : 0;
      if (timed) tSteer += tl - ts;
      // Sprawled on the ground (a ragdoll): stay put until up again.
      if (this.game.ragdolls?.has(n)) wish.set(0, 0, 0);
      if (n.sim === 'full') n.locomote(wish, dt);
      else n.glide(wish, dt, this.gridFloor, this.gridBlocked);
      if (timed) tLoco += performance.now() - tl;
      const st = n.mover.stuck.stuckTime;
      if (st > this.stats.maxStuck) this.stats.maxStuck = st;
    }
    if (timed) {
      this.stats.msBrain = this.stats.msBrain * 0.7 + tBrain * 0.3;
      this.stats.msSteer = this.stats.msSteer * 0.7 + tSteer * 0.3;
      this.stats.msLoco = this.stats.msLoco * 0.7 + tLoco * 0.3;
    }
    if (this.cartsEnabled) this.carts.update(dt, this.budget.carts);
    this.stats.ms = this.stats.ms * 0.95 + (performance.now() - t0) * 0.05;
  }

  /** Pooled neighbour record number `i`, filled in. */
  private neighbor(i: number, x: number, z: number, vx: number, vz: number, radius: number, weight: number): SteerNeighbor {
    let r = this.neighborPool[i];
    if (!r) this.neighborPool[i] = r = { x: 0, z: 0, vx: 0, vz: 0, radius: 0, weight: 0 };
    r.x = x;
    r.z = z;
    r.vx = vx;
    r.vz = vz;
    r.radius = radius;
    r.weight = weight;
    return r;
  }

  private shove(n: Npc, px: number, pz: number, speed: number, d: number) {
    const ax = (n.position.x - px) / (d || 1);
    const az = (n.position.z - pz) / (d || 1);
    n.velocity.x += ax * speed * 0.6;
    n.velocity.z += az * speed * 0.6;
    const sprint = !!this.game.player?.sprinting;
    // A full sprint into someone (GTA-style) often takes them off their feet: a ragdoll sprawl.
    if (sprint && speed > 5 && this.rng.chance(0.45) && this.game.ragdolls?.topple(n, { x: px, y: n.position.y, z: pz })) {
      this.bark(n, 'shoved', true);
      return;
    }
    if (!n.humanoid.isBusy() && (sprint || this.rng.chance(0.08))) n.humanoid.play(sprint ? 'stagger' : 'hitBack');
    if (this.rng.chance(sprint ? 0.7 : 0.35)) this.bark(n, 'shoved', sprint);
  }

  /** Last rung of the stuck ladder: put the NPC somewhere free (AC-22). */
  private unstick(n: Npc) {
    this.stats.unstuck++;
    const c = n.mover.corner();
    const seen = this.isSeen(n.position.x, n.position.y + 1, n.position.z);
    this.grid.block(n.position.x + Math.sin(n.heading) * 0.8, n.position.z + Math.cos(n.heading) * 0.8);
    if (!seen && c) {
      // Out of sight: hop ahead to the next free cell on the path.
      const p = this.grid.nearestWalkable(c.x, c.z, 3) ?? c;
      const y = this.floorY(p.x, p.z);
      if (y !== null) {
        n.teleport({ x: p.x, y: y + 0.03, z: p.z });
        n.mover.stuck.reset(p.x, p.z);
        return;
      }
    }
    if (!seen && n.ambient && n.distToPlayer > 25) {
      this.despawn(n);
      return;
    }
    // In view: give up the goal and stand a moment; the brain picks a new one.
    const free = this.grid.nearestWalkable(n.position.x, n.position.z, 2);
    if (free && Math.hypot(free.x - n.position.x, free.z - n.position.z) > 0.4) {
      const y = this.floorY(free.x, free.z);
      if (y !== null && !seen) n.teleport({ x: free.x, y: y + 0.03, z: free.z });
    }
    n.mover.clear();
    n.mover.stuck.reset(n.position.x, n.position.z);
    if (!n.scripted) n.brain?.setTask(makeTask('idle', { loop: 'stand', until: this.clock + 1 + this.rng.next() * 2 }), this.life);
  }

  update(dt: number) {
    const tu = performance.now();
    this.updateInner(dt);
    this.stats.msUpdate = this.stats.msUpdate * 0.95 + (performance.now() - tu) * 0.05;
  }

  private updateInner(dt: number) {
    this.frameDt = dt;
    this.barks.tick(dt);
    const time = this.game.time;
    const day = time.dayIndex;
    if (day !== this.sunDay) {
      this.sunDay = day;
      this.sun = sunTimes(time.date());
    }
    this.phase = dayPhase(time.hour, this.sun);
    const player = this.game.player;
    if (!player) return;
    const pp = player.position;
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    this.projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    cam.getWorldDirection(tmpV);
    const ll = Math.hypot(tmpV.x, tmpV.z) || 1;
    this.look.x = tmpV.x / ll;
    this.look.z = tmpV.z / ll;

    // Physics queries only see colliders after the first physics step.
    if (this.clock <= 0) return;
    // Teleported (spawn after the title, fast travel, a loaded save): start afresh around the
    // player instead of waiting for the old crowd to drift out of range.
    if (Number.isFinite(this.lastPlayer.x) && Math.hypot(pp.x - this.lastPlayer.x, pp.z - this.lastPlayer.z) > 40) this.relocate();
    this.lastPlayer.x = pp.x;
    this.lastPlayer.z = pp.z;
    if (Number.isFinite(this.lastHours) && Math.abs(time.totalHours - this.lastHours) > 0.5) this.relocate();
    this.lastHours = time.totalHours;
    // Nav grid around the player.
    this.sampler.fallbackY = pp.y;
    this.grid.setFocus(pp.x, pp.z);
    // On the first frame build the near field (~45 m, nearest chunks first) so the first crowd
    // has somewhere to stand; afterwards a small budget per frame.
    this.grid.build(this.initialDone ? this.buildBudget : 9000);
    // Which cells can be walked to from where the player stands (spawns and wander targets).
    this.floodT -= dt;
    const fo = this.floodOrigin;
    if (this.grid.flooding) this.grid.flood(fo.x, fo.z, 2500);
    else if (this.floodT <= 0 || !this.initialDone) {
      this.floodT = 2;
      // Flood from the player; if that labels only a pocket (a rooftop, a podium top, a closed
      // room), from the street below instead, so the town around still fills with people.
      fo.x = pp.x;
      fo.z = pp.z;
      if (this.grid.lastFloodSize > 0 && this.grid.lastFloodSize < 300) {
        const alt = this.streetLevelNear(pp.x, pp.z);
        if (alt) {
          fo.x = alt.x;
          fo.z = alt.z;
        }
      }
      this.grid.flood(fo.x, fo.z, this.initialDone ? 2500 : 1e6);
      // The first fill can't wait two seconds for that.
      if (!this.initialDone && !this.grid.flooding && this.grid.lastFloodSize < 300) {
        const alt = this.streetLevelNear(pp.x, pp.z);
        if (alt) this.grid.flood(alt.x, alt.z, 1e6);
      }
    }
    this.spots.refresh(pp.x, pp.z, dt, this.nav, this.streets(), this.rng, this.wallProbe, (x, z) => this.floorY(x, z), (x, z, r, k) => this.pois(x, z, r, k));

    // District and budget (re-evaluated as the player moves).
    if (Math.hypot(pp.x - this.districtAt.x, pp.z - this.districtAt.z) > 15) {
      this.district = this.fixedDistrict ?? districtAt(pp.x, pp.z);
      this.districtAt = { x: pp.x, z: pp.z };
    }
    this.budget = crowdBudget(time.hour, this.sun, this.district.density, this.density);

    this.tierT -= dt;
    if (this.tierT <= 0) {
      this.tierT = 0.25;
      this.updateTiers(0.25);
    }
    this.crowdT -= dt;
    if (this.crowdT <= 0 || !this.initialDone) {
      this.crowdT = 0.3;
      this.updateCrowd(!this.initialDone);
      this.initialDone = true;
    }
    this.stations.update(dt);
    this.namedT -= dt;
    if (this.namedT <= 0) {
      this.namedT = 1;
      this.updateNamed();
    }
    this.reactT -= dt;
    if (this.reactT <= 0) {
      this.reactT = 0.2;
      this.updateReactions();
    }
    this.updateTalk();
    this.updateBarksAndLooks(dt);
    this.vignettes.update();
    this.stats.pathSearches = this.nav.searches;
  }

  lateUpdate() {
    for (const n of this.list) if (n.prop || n.light) n.updateCarried();
  }

  /** Simulation tiers, visibility, shadows and despawns (4 Hz). */
  private updateTiers(dt: number) {
    const pp = this.game.player!.position;
    let full = 0;
    let mid = 0;
    let cheap = 0;
    let visible = 0;
    let seen = 0;
    const cam = this.game.camera.getWorldPosition(new THREE.Vector3());
    // The character controller costs ~0.05–0.15 ms per NPC: only the nearest people who are on the
    // move get it (standing people glide in place on the nav-grid floor at no cost).
    const near: [Npc, number][] = [];
    for (const n of this.list) {
      const d = Math.hypot(n.position.x - pp.x, n.position.z - pp.z);
      const k = n.brain?.task?.kind;
      const standing = (k === 'idle' || k === 'converse') && Math.hypot(n.velocity.x, n.velocity.z) < 0.3 && d > 3;
      if (d < KCC_RADIUS + 4 && !standing) near.push([n, d]);
    }
    near.sort((a, b) => a[1] - b[1]);
    const kcc = new Set<Npc>();
    for (let i = 0; i < near.length && i < KCC_MAX; i++) kcc.add(near[i][0]);
    for (const n of [...this.list]) {
      const d = Math.hypot(n.position.x - pp.x, n.position.z - pp.z);
      n.distToPlayer = d;
      n.inView = this.isVisible(n.position.x, n.position.y + 1, n.position.z);
      n.unseenFor = n.inView ? 0 : n.unseenFor + dt;
      if (n.inView) n.recycleGraceUntil = 0;
      if (n.inView && d < 150) {
        visible++;
        // Not hidden behind a building (head or feet visible)?
        const hx = n.position.x - cam.x;
        const hy = n.position.y + 1.5 - cam.y;
        const hz = n.position.z - cam.z;
        const hd = Math.hypot(hx, hy, hz);
        if (!this.game.physics.raycast(cam, tmpV.set(hx / hd, hy / hd, hz / hd), Math.max(0, hd - 0.4), Layer.World)) seen++;
      }
      // Full simulation near the player (hysteresis to avoid flapping).
      // Tiers with hysteresis so walkers on a boundary don't flap.
      const h = n.sim === 'full' ? 4 : -4;
      const hm = n.sim === 'cheap' ? -4 : 4;
      const sim = (d < KCC_RADIUS + h && kcc.has(n)) || n.isFighting() || n.talking ? 'full' : d < STEER_RADIUS + hm || n.scripted ? 'mid' : 'cheap';
      // Gliding keeps the capsule's kinematic body in place, so switching tiers needs no re-seat.
      n.sim = sim;
      if (n.sim === 'full') full++;
      else if (n.sim === 'mid') mid++;
      else cheap++;
      n.updateShadow(d);
      // Work blocks for masons at their spots.
      if (n.brain?.task?.kind === 'idle' && n.brain.task.loop === 'work' && !this.workBlocks.has(n.id) && d < 60) {
        const b = makeWorkBlock();
        const h = n.heading;
        b.position.set(n.position.x + Math.sin(h) * 0.62, n.position.y + b.position.y, n.position.z + Math.cos(h) * 0.62);
        b.rotation.y = h;
        this.game.scene.add(b);
        this.workBlocks.set(n.id, b);
      } else if (this.workBlocks.has(n.id) && !(n.brain?.task?.kind === 'idle' && n.brain.task.loop === 'work')) {
        this.workBlocks.get(n.id)!.removeFromParent();
        this.workBlocks.delete(n.id);
      }
      if (n.scripted || n.talking || n.station) continue;
      if (n.ambient) {
        // Far away, or a while out of view: recycle them where the player looks (they respawn just
        // outside the edges of the view and walk into it). Sooner when well behind the camera.
        const behind = (n.position.x - pp.x) * this.look.x + (n.position.z - pp.z) * this.look.z < -0.5 * d;
        // People standing at a spot or chatting stay put (the place keeps its regulars).
        const k = n.brain?.task?.kind;
        const settled = (k === 'idle' && !!n.brain?.task?.spot) || k === 'converse';
        // People overtaking a player who stands still are behind the camera on purpose.
        const graced = this.clock < n.recycleGraceUntil;
        let recycle = !graced && !n.leader && !n.followers.length && ((behind && d > RECYCLE_BEHIND && n.unseenFor > 3) || (d > RECYCLE_SIDE && n.unseenFor > 6) || (!settled && d > 10 && n.unseenFor > 6 && this.clock - n.bornAt > 14));
        // A senator and his train go together, once none of them has been seen for a while.
        if (n.followers.length && d > RECYCLE_SIDE && n.unseenFor > 8 && n.followers.every((f) => f.unseenFor > 8 && !f.scripted && !f.talking)) {
          for (const f of [...n.followers]) this.despawn(f);
          recycle = true;
        }
        if (d > DESPAWN_ALWAYS || (d > DESPAWN_UNSEEN && n.unseenFor > 1) || recycle) this.despawn(n);
      } else if (d > NAMED_DESPAWN && n.unseenFor > 1 && !n.isFighting()) {
        this.despawn(n);
      }
    }
    this.stats.full = full;
    this.stats.mid = mid;
    this.stats.cheap = cheap;
    this.stats.visible = visible;
    this.stats.seen = seen;
  }

  /**
   * Keep the crowd at its budget: spawn out of sight, far down the street or in doors; send extras
   * home. People walking home still count toward the cap (they are still in the street), so a role
   * that turns for home at once can never make the crowd run away (AC-10 at night).
   */
  private updateCrowd(initial: boolean) {
    if (!this.crowdEnabled) return;
    const pp = this.game.player!.position;
    const b = this.budget;
    let citizens = 0;
    let present = 0;
    let vigiles = 0;
    let vigilesPresent = 0;
    for (const n of this.list) {
      if (!n.ambient || n.station || n.role?.id === 'carter') continue;
      const leaving = n.brain?.activity === 'home';
      if (n.role?.id === 'vigil') {
        vigilesPresent++;
        if (!leaving) vigiles++;
      } else {
        present++;
        if (!leaving) citizens++;
      }
    }
    // At night the station people (vigiles' posts, drovers) count toward the ≤ 25 cap (AC-10).
    const target = crowdTarget(b, this.maxCrowd, this.stations.count);
    const boosts = this.useAtlas ? poiBoosts(pp.x, pp.z) : {};
    let weights = roleWeights(this.district, this.game.time.hour, this.sun, boosts);
    // Escorted roles bring 1–4 people each: cap the groups so they don't swallow the budget.
    const escorted = this.list.filter((n) => n.ambient && n.followers.length > 0).length;
    if (escorted >= Math.max(2, Math.round(target / 25))) weights = weights.filter(([r]) => !CROWD_ROLES[r].escort);
    let room = crowdRoom(present, citizens, target, b.night);
    let budget = initial ? target : 3;
    while (room > 0 && budget-- > 0) {
      const role = pickRole(this.rng, weights);
      if (!role) break;
      // A group bigger than the room left would overshoot the cap: someone on their own instead.
      const big = !!CROWD_ROLES[role].escort && room < 3;
      const p = this.spawnPoint(role, initial);
      if (!p) break;
      const n = this.spawnAmbient(role, p.x, p.z, p.heading, { escorts: !big });
      if (!n) continue;
      const added = 1 + n.followers.length;
      citizens += added;
      present += added;
      room -= added;
      if (p.behind) n.recycleGraceUntil = this.clock + 30;
      if (p.spotPlaced && n.brain) n.brain.next(this.life);
      else if (p.onLane && n.brain && !n.followers.length && this.rng.chance(0.8)) n.brain.travel(this.life);
      else if (!initial && n.brain && n.brain.activity !== 'home') {
        // Spawned just outside the view: walk into it.
        const t = this.viewTarget();
        if (t) n.brain.setTask(makeTask('goto', { x: t.x, z: t.z, speed: n.walkSpeed }), this.life);
      }
    }
    while (vigilesPresent < b.vigiles && budget-- >= 0) {
      const p = this.spawnPoint('vigil', initial);
      if (!p) break;
      if (!this.spawnAmbient('vigil', p.x, p.z, p.heading)) break;
      vigiles++;
      vigilesPresent++;
    }
    // Too many (the hour turned, or night fell): send the farthest unseen ones home.
    const excess = citizens - (target + 4);
    if (excess > 0) {
      const extra = this.list
        .filter((n) => n.ambient && !n.scripted && !n.station && !n.leader && n.brain?.activity !== 'home' && n.role?.id !== 'vigil')
        .sort((a, c) => (c.inView ? 0 : 1) - (a.inView ? 0 : 1) || c.distToPlayer - a.distToPlayer)
        .slice(0, Math.min(excess, 3));
      for (const n of extra) n.brain?.leave(this.life);
    }
    if (vigiles > b.vigiles + 1) {
      const v = this.list.find((n) => n.role?.id === 'vigil' && !n.scripted && !n.station && n.brain?.activity !== 'home');
      v?.brain?.leave(this.life);
    }
  }

  /**
   * Where to spawn a new citizen: at its work spot (initial fill), along a street (see
   * crowd/spawnRules.ts: out of view, behind something, or far down the street in view), in a
   * doorway, or out of sight off the street.
   */
  private spawnPoint(role: CrowdRoleId, initial: boolean): SpawnPick | null {
    const pp = this.game.player!.position;
    const g = this.grid;
    const r = CROWD_ROLES[role];
    const R = this.crowdRadius();
    // Initial fill: workers appear at their posts so shops are open and priests at prayer.
    if (initial && r) {
      const slot = archetypeSlot(r.archetype, this.game.time.hour, this.sun);
      if ((slot.activity === 'work' || slot.activity === 'idle') && slot.place) {
        const s = this.spots.find(slot.place, pp.x, pp.z, 70, this.rng, pp.y);
        if (s && Math.hypot(s.x - pp.x, s.z - pp.z) > 4) return { x: s.x, z: s.z, heading: s.face, spotPlaced: true };
      }
    }
    const ahead = Math.atan2(this.look.x, this.look.z);
    const halfFov = Math.atan(Math.tan((this.game.camera.fov * Math.PI) / 360) * this.game.camera.aspect);
    /** Angle between a point's bearing from the player and the view direction. */
    const offView = (x: number, z: number) => Math.abs(((Math.atan2(x - pp.x, z - pp.z) - ahead + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    // On a street, heading along it (most people are going somewhere).
    const lanes = this.lanes();
    if (lanes && this.rng.chance(this.inSquare() ? 0.2 : this.budget.night ? 0.85 : 0.75)) {
      const p = this.laneSpawn(initial, halfFov, offView);
      if (p) return p;
    }
    // A doorway (people step out of houses even in view).
    const streets = this.streets();
    if (!initial && streets && this.rng.chance(0.5)) {
      const doors = streets.spotsNear(pp.x, pp.z, 60, 'houseDoor').filter((d) => Math.hypot(d.x - pp.x, d.z - pp.z) > 12);
      if (doors.length) {
        const d = this.rng.pick(doors);
        return { x: d.x, z: d.z, heading: d.facing };
      }
    }
    const terrain = (x: number, z: number) => (this.game.heightmap ? this.game.heightmap.heightAt(x, z) : pp.y);
    for (let i = 0; i < 24; i++) {
      let a: number;
      let d: number;
      if (initial) {
        // The first crowd: half of it in front of the camera (nothing has been seen yet).
        a = this.rng.chance(0.7) ? ahead + (this.rng.next() - 0.5) * 1.7 : this.rng.next() * Math.PI * 2;
        d = 4 + Math.pow(this.rng.next(), 0.75) * (R - 4);
      } else if (this.rng.chance(0.85)) {
        // Just outside the edges of the view, so people walk into it.
        a = ahead + (this.rng.chance(0.5) ? 1 : -1) * (halfFov + 0.08 + this.rng.next() * 0.45);
        d = 12 + this.rng.next() * 30;
      } else {
        a = this.rng.next() * Math.PI * 2;
        d = SPAWN_MIN + Math.sqrt(this.rng.next()) * (R - SPAWN_MIN);
      }
      let x = pp.x + Math.sin(a) * d;
      let z = pp.z + Math.cos(a) * d;
      if (g.ready(x, z)) {
        const c = g.nearestWalkable(x, z, 2);
        if (!c) continue;
        x = c.x;
        z = c.z;
        const h = g.heightAt(x, z);
        if (h === null || Math.abs(h - terrain(x, z)) > 1.6) continue;
        if (!g.reachable(x, z) || !this.isFree(x, h, z)) continue;
        if (this.steep(x, z, h)) continue;
      } else continue;
      if (initial) return { x, z };
      const y = (g.heightAt(x, z) ?? pp.y) + 1.2;
      if (!this.isVisible(x, y, z)) return { x, z };
      // In the frustum but behind a building: they will step out from behind it.
      if (d > 22 && !this.isSeen(x, y, z)) return { x, z };
    }
    return null;
  }

  /** A street spawn point (see crowd/spawnRules.ts), or null after a dozen tries. */
  private laneSpawn(initial: boolean, halfFov: number, offView: (x: number, z: number) => number): SpawnPick | null {
    const lanes = this.lanes();
    const player = this.game.player!;
    const pp = player.position;
    const g = this.grid;
    const R = initial ? this.crowdRadius() : this.laneRadius();
    const pv = player.velocity;
    const playerSpeed = pv ? Math.hypot(pv.x, pv.z) : 0;
    for (let i = 0; i < 12 && lanes; i++) {
      const [r0, r1] = laneSpawnRing(i, initial, R, SPAWN_MIN - 6);
      const p = lanes.sample(() => this.rng.next(), pp.x, pp.z, r0, r1);
      if (!p) break;
      if (!g.ready(p.x, p.z)) continue;
      const c = g.nearestWalkable(p.x, p.z, 1.5, this.tmpCell);
      if (!c) continue;
      const cx = c.x;
      const cz = c.z;
      const h = g.heightAt(cx, cz);
      const terrain = this.game.heightmap ? this.game.heightmap.heightAt(cx, cz) : pp.y;
      if (h === null || Math.abs(h - terrain) > 1.6 || !g.reachable(cx, cz) || !this.isFree(cx, h, cz)) continue;
      let verdict: LaneSpawnVerdict = 'side';
      if (!initial) {
        const y = h + 1.2;
        verdict = laneSpawnVerdict({
          d: Math.hypot(cx - pp.x, cz - pp.z),
          inView: this.isVisible(cx, y, cz),
          seen: () => this.isSeen(cx, y, cz),
          offView: offView(cx, cz),
          halfFov,
          playerSpeed,
        });
        if (!verdict) continue;
      } else if (i < 5 && offView(cx, cz) > 1.2 && this.rng.chance(0.5)) {
        // The first crowd: favour the stretch of street in front of the camera.
        continue;
      }
      let heading = p.heading;
      if (verdict === 'behind') {
        // From behind the camera: walking the way the player looks, so they overtake into view.
        if (Math.sin(heading) * this.look.x + Math.cos(heading) * this.look.z < 0) heading += Math.PI;
      } else if (!initial && Math.sin(heading) * (pp.x - cx) + Math.cos(heading) * (pp.z - cz) < 0) {
        // Late arrivals walk toward the player's side of the street, into view.
        heading += Math.PI;
      }
      return { x: cx, z: cz, heading, onLane: true, behind: verdict === 'behind' };
    }
    return null;
  }

  /** Named NPCs appear at their schedule locations when the player comes near. */
  private updateNamed() {
    if (!this.namedEnabled) return;
    const pp = this.game.player!.position;
    const reg = this.registry();
    for (const def of reg.all()) {
      if (this.byId.has(def.id) || this.deadNamed.has(def.id) || this.held.has(def.id)) continue;
      if (!def.schedule?.length && !def.home) continue;
      const e = activeScheduleEntry(def.schedule, this.game.time.hour);
      const at = e?.at ?? def.home;
      if (!at || e?.activity === 'sleep') continue;
      const loc = this.resolveLocation(at);
      if (!loc) continue;
      if (Math.hypot(loc.x - pp.x, loc.z - pp.z) > NAMED_SPAWN) continue;
      // Reachable and at street level, or not yet (asked again every second).
      const p = this.namedSpawnPoint(loc);
      if (!p) continue;
      const n = this.spawnNamed(def, p.x, p.z, this.rng.next() * Math.PI * 2);
      if (n?.hostile && this.game.player) {
        n.setSolid(true);
      }
    }
  }

  /** Fights and drawn weapons near the player (5 Hz). */
  private updateReactions() {
    const player = this.game.player!;
    const combat = combatOf(this.game);
    if (combat?.isInCombat) {
      const fighters: Actor[] = [];
      for (const a of this.game.actors.near(player.position, 40)) {
        try {
          if (combat.isInCombat(a)) fighters.push(a);
        } catch {
          /* combat module not ready */
        }
      }
      const seen: { x: number; z: number }[] = [];
      for (const f of fighters) {
        // An arena bout is a show: the Ludus watches it, nobody runs.
        if (combat.inBout?.(f)) continue;
        if (seen.some((s) => Math.hypot(s.x - f.position.x, s.z - f.position.z) < 5)) continue;
        seen.push({ x: f.position.x, z: f.position.z });
        // The aggressor guards go for: the player when the player started it (an assault);
        // otherwise whoever is fighting that isn't the player, a quest's fighter first, so a
        // scripted fight keeps the watch out of it.
        const near = (o: Actor) => o !== player && Math.hypot(o.position.x - f.position.x, o.position.z - f.position.z) < 8;
        const quest = fighters.find((o) => near(o) && this.questFighters.has(o));
        const foe = quest ?? (combat.playerAggressor && combat.isInCombat(player) ? player : (fighters.find(near) ?? null));
        for (const n of this.near(f.position, 16)) {
          if (n === f || n.isFighting() || n.brain?.task?.kind === 'flee' || n.brain?.task?.kind === 'respond' || n.brain?.task?.kind === 'gawk') continue;
          n.brain?.alarm(this.life, f.position.x, f.position.z, 'fight', foe);
        }
      }
    }
    // Hostile named NPCs pick a fight when the player comes near (if combat exists).
    if (combat?.engage) {
      for (const n of this.list) {
        if (!n.hostile || n.dead || n.isFighting() || n.distToPlayer > 12) continue;
        n.setSolid(true);
        try {
          combat.engage(n, player);
        } catch (err) {
          console.error('[npc] combat.engage failed', err);
        }
      }
    }
    // A drawn weapon makes people nervous.
    if (player.combatStance) {
      for (const n of this.near(player.position, 5)) {
        const last = this.weaponWarned.get(n.id) ?? -1e9;
        if (this.clock - last < 60 || n.scripted) continue;
        this.weaponWarned.set(n.id, this.clock);
        this.bark(n, 'weapon', true);
        break;
      }
    }
  }

  /** Greetings, overheard chatter and heads turning toward the player. */
  private updateBarksAndLooks(dt: number) {
    const player = this.game.player!;
    const pp = player.position;
    this.lookT -= dt;
    const doLook = this.lookT <= 0;
    if (doLook) this.lookT = 0.2;
    const head = tmpV2.copy(pp).setY(pp.y + (player.eyeHeight ?? 1.6));
    let greeted = false;
    for (const n of this.list) {
      if (n.dead || n.talking) continue;
      const d = n.distToPlayer;
      if (doLook) {
        const facing = Math.abs(((n.headingTo(pp.x, pp.z) - n.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.9;
        n.lookAtPoint(d < 4.5 && facing && !n.scripted ? head : null);
      }
      if (!greeted && d < 3.2 && !n.scripted && this.rng.chance(0.012)) {
        // The streets notice a filthy (or freshly bathed) player (docs/CONTENT.md §8.1).
        const clean = this.game.standing?.cleanliness;
        const kind: BarkKind = clean === 'sordidus' && this.rng.chance(0.5) ? 'sordidus' : clean === 'lautus' && this.rng.chance(0.3) ? 'lautus' : 'greet';
        greeted = !!this.bark(n, kind);
      }
    }
    this.chatterT -= dt;
    if (this.chatterT <= 0) {
      this.chatterT = (this.budget.night ? 14 : 7) + this.rng.next() * 9;
      const cands = this.near(pp, 11, (n) => !n.scripted && !n.talking && n.brain?.task?.kind !== 'flee');
      if (cands.length) {
        const n = this.rng.pick(cands);
        const kind: BarkKind = n.role?.id === 'merchant' && this.rng.chance(0.4) ? 'vendor' : 'ambient';
        this.bark(n, kind);
      }
    }
  }

  dispose() {
    for (const off of this.offs) off();
    this.clear();
  }
}

function segDist(px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

/** Install the population manager (idempotent). */
export function installNpcs(game: Game, opts: NpcManagerOptions = {}): NpcManager {
  if (game.population) return game.population;
  const m = new NpcManager(game, opts);
  game.population = m;
  game.addSystem(m);
  return m;
}
