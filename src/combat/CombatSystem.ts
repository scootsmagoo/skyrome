/**
 * CombatSystem (`game.combat`): wires CombatCore into the Game.
 *
 *   installCombat(game)                         after setupPlayer (and installRpg, installUI if used)
 *   game.combat.spawnEnemy('grassator', pos)    a procedural enemy with its kit, AI and look
 *   game.combat.register(actor, {...})          make any actor a combatant (NPC module)
 *   game.combat.engage(a, b) / isInCombat(a)    start a fight / ask about one
 *   game.combat.startBout({ foes, lusio })      an arena bout with crowd favor (§6.10)
 *
 * It owns the player's combat input (PlayerCombat), lock-on and its camera framing, hit-stop
 * (game.timeScale) and camera shake (CameraRig.shake), the PlayerController hooks (Space dodges in
 * combat, motion overrides for dodges and steps, combat speed), the HUD sources (enemy bar, boss
 * bar, compass ticks, inCombat) plus the combat HUD overlay, combat music, the yield decision, and
 * the net's visuals. Rules live in CombatCore; timings in timing.ts.
 */
import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import { createHumanoid, HumanoidAvatar } from '../actors/avatar/HumanoidAvatar';
import { randomAppearance } from '../actors/avatar/variants';
import { CombatBrain } from '../ai/combat/CombatBrain';
import { NereusScript } from '../ai/combat/nereus';
import type { NavPoint, NavProbe } from '../ai/combat/pathing';
import { brainProfileFrom, type BrainProfile } from '../ai/combat/types';
import type { Surface } from '../audio/FootstepDriver';
import type { GameEvents } from '../core/Events';
import type { Game, System } from '../core/Game';
import { codeLabel } from '../core/Input';
import { DEG, clamp, damp, wrapAngle } from '../core/math';
import { Layer } from '../core/Physics';
import { Rng } from '../core/Rng';
import type { CameraRig } from '../player/CameraRig';
import type { PlayerController } from '../player/PlayerController';
import { armorFamilyOf, effectiveArmorRating, flatStats, FISTS } from '../rpg/combat-math';
import { ITEMS } from '../rpg/data/items';
import { profileStats, profileWeapon } from '../rpg/enemies';
import { ItemDb } from '../rpg/items';
import { rollLoot } from '../rpg/loot';
import type { CombatProfile } from '../rpg/types';
import { VitalsImpl } from '../rpg/vitals';
import { canArrest, resolveYield, type YieldChoice } from '../rpg/yield';
import type { BossView, CompassMarker, TargetView } from '../ui/types';
import { AvatarCombatView, ActorBody } from './adapters';
import { ChoiceView } from './choice';
import type { BoutOptions } from './ArenaBout';
import { visualsFor, type EnemyOptions, type Opener } from './archetypes';
import { Bodies } from './bodies';
import { StreetDanger } from './danger';
import { RagdollSystem } from '../physics/ragdoll/RagdollSystem';
import { GoreSystem } from './gore/GoreSystem';
import { adoptProfile, resolveSpawn, type NpcLike } from './spawnSpec';
import { Combatant, type CombatView } from './Combatant';
import { CombatCore, type Blow, type CombatEnv, type Projectile } from './CombatCore';
import { BODY, angleTo, dist2D } from './geometry';
import { CombatHud, type CombatHudState } from './hud/CombatHud';
import { PlayerCombat, type PlayerCombatHost } from './PlayerCombat';
import { combatSettings, type CombatSettings } from './settings';
import { TIMING } from './timing';

const BODY_HAND = BODY.handDist;
/** Aim assist: how far beyond reach (m) and how far off the facing it looks for whom to hit. */
const ASSIST = { extra: 1.9, cone: 55 * DEG };
import './events';

declare module '../core/Game' {
  interface Game {
    combat: CombatSystem;
  }
}

export interface InstallCombatOptions {
  /** Where the combat HUD mounts when the UI module isn't installed (the scene's UI root). */
  hudRoot?: HTMLElement;
  /** Draw the combat HUD (default true). */
  hud?: boolean;
  /** Seed for combat randomness. */
  seed?: number | string;
}

export interface RegisterOptions {
  team?: string;
  group?: string;
  /** Faction id: the call-for-help group when `group` isn't given. */
  faction?: string;
  /** Override the profile's kit (item ids): what the NPC really carries and wears. */
  loadout?: { weapon?: string; shield?: string; worn?: string[] };
  name?: string;
  title?: string;
  /** NPCs: the §6.11 profile (tier stats, kit). */
  profile?: CombatProfile;
  /** Run the combat AI (default true for NPCs with a profile). */
  ai?: boolean;
  /** Attack hostile teams on sight within this radius (m). 0 = only when engaged. */
  aggro?: number;
  lawful?: boolean;
  essential?: boolean;
  brawl?: boolean;
  boss?: { title: string; phases: number[] };
  drawn?: boolean;
  voice?: 'm' | 'f';
  brain?: Partial<BrainProfile>;
  /** The combat system moves this body from now on (spawned enemies). */
  driven?: boolean;
  /** Tier label for the enemy bar. */
  tierLabel?: string;
  /** Echoed in 'actor:killed' (quest tags). */
  tags?: string[];
  /** Attach Nereus' script (net, phases) even when the profile's archetype says 'retiarius'. */
  nereus?: boolean;
  /** A scripted first exchange (the mq-01 tutorial pair). */
  opener?: Opener;
}

export interface SpawnOptions extends EnemyOptions {
  id?: string;
  heading?: number;
  team?: string;
  group?: string;
  /** Attack the player and other hostiles on sight within this radius (default 18 m; 0 = wait). */
  aggro?: number;
  /** Fight this combatant right away (true = the player). */
  engage?: Combatant | boolean;
  seed?: number | string;
  lod?: 'high' | 'low' | 'auto';
  drawn?: boolean;
  name?: string;
  // ---- the words quest content uses (src/content/director.ts)
  /** Practice arms (= `lusio`). A practice gladiator also starts an arena bout with crowd favor. */
  practice?: boolean;
  /** A rixa: non-lethal by rule (§6.9); drawing a blade makes it an assault. */
  brawl?: boolean;
  /** Override the yield threshold (fraction of health). */
  yieldAt?: number;
  /** Hostile to the player at once (default: as the archetype is). */
  hostile?: boolean;
  /** Echoed in 'actor:killed'.tags (with 'dead', 'ko' or 'fled'). */
  tags?: string[];
  /** Owning quest id (also a tag; picks the quest's scripted openers). */
  quest?: string;
  /** Named NPC id (game.npcs): its name, title, look, stat block and essential flag. */
  npc?: string;
  /** Boss id ('boss-nereus'): wins over the archetype. */
  boss?: string;
  /** A scripted first exchange: 'chain' or 'delayed-power'. */
  opener?: Opener;
  /** Start an arena bout (crowd favor, missio) against this foe (default: practice gladiators). */
  bout?: boolean;
  /**
   * The stat block content wants (src/content/profiles.ts: the mq-01 pair, named gladiators): it
   * replaces the archetype's numbers; practice arms and `yieldAt` still apply on top.
   */
  profile?: CombatProfile;
}

/** Options for engage(actor) without a second combatant (quest content): fight the player. */
export interface EngageOptions {
  hostile?: boolean;
  practice?: boolean;
  brawl?: boolean;
  yieldAt?: number;
  tags?: string[];
  quest?: string;
  name?: string;
  /** The profile to fight with when the actor isn't a combatant yet. */
  profile?: CombatProfile;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const rayDir = new THREE.Vector3();

export class CombatSystem implements System, PlayerCombatHost {
  readonly name = 'combat';
  readonly priority = 20;
  readonly core: CombatCore;
  readonly items: ItemDb;
  playerC: Combatant | null = null;
  readonly input: PlayerCombat;
  private hud: CombatHud | null = null;
  private rig: CameraRig | null = null;
  private rng: Rng;
  /** Time effects (hit-stop, a kill's slow motion), in real seconds (game.elapsed). */
  private freezeUntil = -1;
  private slowFrom = -1;
  private slowUntil = -1;
  private timeFx = false;
  private baseTimeScale = 1;
  /** Camera trauma 0..1 (shake ∝ trauma²) and the kick springs back from `rig.kick`. */
  private trauma = 0;
  private feelT = 0;
  private readonly kick = { pitch: 0, yaw: 0, roll: 0, fov: 0 };
  private lockLostAt = -1;
  private downHeading: number | null = null;
  /** Which way the locked third-person camera turns off the line to the foe (+1 / −1). */
  lockOrbit = 1;
  private netGeo: THREE.BufferGeometry;
  private drapeGeo: THREE.BufferGeometry;
  private ropeMat: THREE.LineBasicMaterial;
  private netVisuals = new Map<number, THREE.Object3D>();
  private drapes = new Map<string, THREE.Object3D>();
  private spawned = new Map<string, Actor>();
  private footsteps = new Map<string, () => void>();
  /** Ground surface for spawned enemies' footsteps (scenes set it: sand → 'dirt'). */
  surfaceAt: ((x: number, y: number, z: number) => Surface) | null = null;
  private yieldOffs = new Map<string, () => void>();
  private pendingChoice: { c: Combatant; at: number } | null = null;
  /** People the player attacked who weren't enemies: when they kneel, no prompt pops up (E decides). */
  private readonly assaultVictims = new Set<string>();
  private lastStruck: { c: Combatant; at: number } | null = null;
  /** The last lock target (to move on when it goes down). */
  private prevLock: Combatant | null = null;
  /** When the player last struck each combatant (lock-on candidates). */
  private struckAt = new WeakMap<Combatant, number>();
  private seq = 0;
  private cached: CombatSettings;
  /** Dev-scene settings that are never persisted (arena URL parameters). */
  private overrides: Partial<CombatSettings> = {};
  /** Fighters spawned per quest so far (for its scripted openers). */
  private questSpawns = new Map<string, number>();
  /** Lootable bodies (§6.14). */
  readonly bodies: Bodies;
  /** Muggers in the streets at night (§13.3). */
  readonly danger: StreetDanger;
  /** Blood and dismemberment (none in tests without a DOM). */
  gore: GoreSystem | null = null;
  /** Is there any save to go back to (cached: the save list is async)? */
  private hasSave = false;
  /** When the Aesculapian rescue happens (game.elapsed), or −1. */
  private rescueAt = -1;

  /**
   * Game flow asks: does combat take over the player's death? On Tiro, yes: the Aesculapian
   * rescue (§6.12). And on any difficulty while there is no save to load, rather than ending a new
   * game at the title [design]. Only in the real game (the flow), never in dev scenes.
   */
  get handlesDeath(): boolean {
    const flow = (this.game as unknown as { flow?: unknown }).flow;
    return !!flow && (this.core.difficulty === 'tiro' || !this.hasSave);
  }
  /** The player is out cold (the screen goes dark) until this time (game.elapsed). */
  private blackoutUntil = -1;

  constructor(
    readonly game: Game,
    private readonly opts: InstallCombatOptions = {},
  ) {
    this.rng = new Rng(opts.seed ?? 'combat');
    this.items = game.items ?? new ItemDb(ITEMS);
    this.cached = combatSettings(game.settings.data);
    game.settings.onChange((s) => (this.cached = { ...combatSettings(s), ...this.overrides }));
    this.core = new CombatCore(this.env());
    this.bodies = new Bodies(game, this.items, () => this.rng.next());
    this.danger = new StreetDanger(game, this);
    this.core.difficulty = this.cached.difficulty;
    this.input = new PlayerCombat(this);
    // Rope: shared line geometry for the thrown net (a flat disc) and the drape over a netted body.
    this.netGeo = new THREE.WireframeGeometry(new THREE.CircleGeometry(0.85, 10, 0, Math.PI * 2));
    const drape = new THREE.SphereGeometry(0.62, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62);
    drape.scale(1, 1.35, 1);
    this.drapeGeo = new THREE.WireframeGeometry(drape);
    this.ropeMat = new THREE.LineBasicMaterial({ color: 0x4a3a24 });
    if (game.player) this.registerPlayer();
    this.wireEvents();
    const save = (game as unknown as { save?: { latest?: () => Promise<unknown> } }).save;
    void save
      ?.latest?.()
      .then((m) => (this.hasSave ||= !!m))
      .catch(() => {});
  }

  settings(): CombatSettings {
    return this.cached;
  }

  /** Dev scenes: override settings for this session only (never written to the player's settings). */
  override(o: Partial<CombatSettings>) {
    Object.assign(this.overrides, o);
    this.cached = { ...combatSettings(this.game.settings.data), ...this.overrides };
  }

  // ------------------------------------------------------------------ env

  private env(): CombatEnv {
    const game = this.game;
    return {
      emit: (type, payload) => game.events.emit(type, payload),
      lineOfSight: (a, b) => this.lineOfSight(a, b),
      sfx: (id, position, volume) => game.events.emit('sfx', { id, position, volume }),
      feedback: (kind, blow) => this.feedback(kind, blow),
      cue: (kind, c) => this.cue(kind, c),
      night: () => {
        const h = game.time.hour;
        return h < 5.5 || h >= 19.5;
      },
      rng: () => this.rng.next(),
      parryWindowOverride: () => this.cached.parryWindow,
      projectileVisual: (p, on) => this.projectileVisual(p, on),
      adoptNear: (c, r, o) => this.adoptNear(c, r, o.power),
      assistTarget: (c, w) => this.assistTarget(c, w.reach),
      nav: this.navProbe(),
    };
  }

  /**
   * The world for the NPCs' steering: rays against the world at knee and chest height (and at the
   * shoulders) for "is the way blocked", and the NPC crew's paths (`game.population.nav`, read
   * structurally: built in parallel) when they exist.
   */
  private navProbe(): NavProbe {
    const g = this.game;
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    const ray = (x: number, y: number, z: number, len: number) => {
      o.set(x, y, z);
      return !!g.physics.raycast(o, d, len, Layer.World);
    };
    return {
      blocked: (ax, az, bx, bz, y, r) => {
        let dx = bx - ax;
        let dz = bz - az;
        const L = Math.hypot(dx, dz);
        if (L < 0.05) return false;
        dx /= L;
        dz /= L;
        // Follow the lie of the land so a slope isn't a wall.
        const hm = (g as { heightmap?: { heightAt(x: number, z: number): number } }).heightmap;
        const rise = hm ? hm.heightAt(bx, bz) - hm.heightAt(ax, az) : 0;
        const k = Math.hypot(L, rise);
        d.set((dx * L) / k, rise / k, (dz * L) / k);
        if (ray(ax, y + 0.55, az, k) || ray(ax, y + 1.25, az, k)) return true;
        const sx = -dz * r * 0.9;
        const sz = dx * r * 0.9;
        return ray(ax + sx, y + 0.9, az + sz, k) || ray(ax - sx, y + 0.9, az - sz, k);
      },
      findPath: (ax, az, bx, bz) => {
        const nav = (g as unknown as { population?: { nav?: { findPath?(ax: number, az: number, bx: number, bz: number): NavPoint[] | null | 'busy' } } }).population?.nav;
        if (!nav?.findPath) return null;
        try {
          const p = nav.findPath(ax, az, bx, bz);
          // A lone point at the goal is the service's "unknown ground, go straight": no help here.
          if (p && p !== 'busy' && p.length === 1 && Math.hypot(p[0].x - bx, p[0].z - bz) < 0.5) return null;
          return p;
        } catch {
          return null;
        }
      },
    };
  }

  /**
   * People (humanoid actors) in front of `c` within `r` m who aren't combatants yet: adopt them so
   * the player's blow can land on them. Anyone can be struck; essential people are knocked down
   * for a moment instead of dying (CombatCore's §6.9 rules).
   */
  private adoptNear(c: Combatant, r: number, _power: boolean): number {
    const game = this.game;
    if (!game.actors) return 0;
    let n = 0;
    for (const a of game.actors.near(c.position, r)) {
      if (n >= 3) break;
      if (!this.adoptable(a)) continue;
      if (Math.abs(angleTo(c.heading, a.position.x - c.position.x, a.position.z - c.position.z)) > 80 * DEG) continue;
      if (this.adoptForBlow(a)) n++;
    }
    return n;
  }

  /** A person who can be struck but isn't a combatant yet. */
  private adoptable(a: Actor): boolean {
    if (a === (this.game.player as unknown) || this.core.get(a.id)) return false;
    return a.avatar instanceof HumanoidAvatar && !(a as Actor & { dead?: boolean }).dead;
  }

  private adoptForBlow(a: Actor): Combatant | null {
    const adopted = this.adoptActor(a);
    if (adopted) this.adopted.set(adopted.id, this.core.now);
    return adopted ?? null;
  }

  /**
   * Aim assist (who the player's attack is meant for): the lock target when it's within a few
   * steps; else the person, foe or not, nearest the line of the swing within ±55° and a step or two
   * beyond reach. Enemies on their feet are preferred, the kneeling least. The core turns the body
   * to them and closes the gap over the wind-up, so a trackpad player needn't line up exactly.
   */
  private assistTarget(c: Combatant, reach: number): Combatant | null {
    const R = BODY_HAND + reach + ASSIST.extra;
    const lock = c.lockTarget;
    if (lock && (lock.active || lock.status === 'yielded') && dist2D(lock.position, c.position) <= R + 1.5) return lock;
    let best: Combatant | Actor | null = null;
    let bestScore = Infinity;
    // In a fight (an enemy close by), the assist only steers at enemies: a swing at a foe who
    // stepped back must not turn onto a spectator.
    const fighting = this.core.list.some((o) => o !== c && o.active && (o.target === c || this.core.hostile(c, o)) && dist2D(o.position, c.position) < 8);
    const score = (x: number, z: number, radius: number, bias: number) => {
      const dx = x - c.position.x;
      const dz = z - c.position.z;
      const d = Math.max(0, Math.hypot(dx, dz) - radius);
      if (d > R) return Infinity;
      const ang = Math.abs(angleTo(c.heading, dx, dz));
      if (ang > ASSIST.cone) return Infinity;
      return ang / ASSIST.cone + d / R + bias;
    };
    for (const o of this.core.list) {
      if (o === c || !(o.active || o.status === 'yielded')) continue;
      if (fighting && !(o.target === c || this.core.hostile(c, o))) continue;
      const bias = o.status === 'yielded' ? 0.8 : this.core.hostile(c, o) || o.target === c ? -0.4 : 0;
      const s = score(o.position.x, o.position.z, o.body.radius, bias);
      if (s < bestScore && this.lineOfSight(c, o)) {
        best = o;
        bestScore = s;
      }
    }
    for (const a of fighting ? [] : (this.game.actors?.near(c.position, R + 1) ?? [])) {
      if (!this.adoptable(a)) continue;
      const s = score(a.position.x, a.position.z, a.body.radius, 0);
      if (s < bestScore) {
        best = a;
        bestScore = s;
      }
    }
    if (!best) return null;
    return best instanceof Combatant ? best : this.adoptForBlow(best);
  }

  /** Actors adopted from other modules, and when (combat clock): idle ones are let go again. */
  private adopted = new Map<string, number>();

  private lineOfSight(a: Combatant, b: Combatant): boolean {
    const pa = a.position;
    const pb = b.position;
    tmp.set(pa.x, pa.y + a.body.height * 0.8, pa.z);
    tmp2.set(pb.x, pb.y + b.body.height * 0.8, pb.z);
    rayDir.subVectors(tmp2, tmp);
    const d = rayDir.length();
    if (d < 0.5) return true;
    rayDir.multiplyScalar(1 / d);
    const hit = this.game.physics.raycast(tmp, rayDir, d, Layer.World);
    return !hit || hit.distance > d - 0.35;
  }

  /**
   * The feel of a blow involving the player: hit-stop (the world nearly stops for a beat), a kill's
   * slow motion, camera trauma (shake and roll), a kick (striking nods the view into the blow and
   * punches the field of view in; being struck snaps it away from the attacker) and the hit marker.
   */
  private feedback(kind: 'light' | 'power' | 'heavy', blow?: Blow) {
    const S = this.cached;
    const pc = this.playerC;
    const dealt = !!blow && blow.att === pc;
    const taken = !!blow && blow.def === pc && !blow.parried;
    const blocked = !!blow?.blocked;
    if (S.hitStop) this.freeze(blocked ? TIMING.hitStop.light * 0.6 : TIMING.hitStop[kind]);
    if (dealt && blow?.kill && S.hitStop) this.slowMo(TIMING.feel.kill.seconds);
    if (dealt) this.hud?.hitMarker(blow?.kill ? 'kill' : blocked ? 'blocked' : kind === 'light' ? 'hit' : 'power');
    if (S.shake === 'off') return;
    // First person moves the eye itself: a gentler share (and only the kick, by default).
    const first = this.game.player?.viewMode === 'first';
    const amp = first ? (S.shake === 'third' ? 0.35 : 0.6) : 1;
    const F = TIMING.feel;
    this.trauma = Math.min(1, this.trauma + F.trauma[kind] * (blocked ? 0.5 : 1) * amp);
    if (!blow) return;
    const kick = this.kick;
    if (dealt && !blocked) {
      kick.pitch -= F.nod[kind] * amp;
      if (kind !== 'light' || blow.kill) kick.fov -= F.fovPunch * amp;
    } else if (taken) {
      // Away from the attacker: which side of the view the blow came from.
      const p = this.game.player!;
      const dx = blow.att.position.x - p.position.x;
      const dz = blow.att.position.z - p.position.z;
      const side = Math.sign(dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) || 1;
      const k = F.recoil * amp * (blocked ? 0.4 : kind === 'light' ? 0.7 : 1);
      kick.yaw += side * k * 0.6;
      kick.roll -= side * k * 0.5;
      kick.pitch += k * 0.4;
    }
  }

  /** Hit-stop: the world nearly stops for `seconds` of real time. */
  private freeze(seconds: number) {
    this.beginTimeFx();
    this.freezeUntil = Math.max(this.freezeUntil, this.game.elapsed + seconds);
    this.game.timeScale = this.baseTimeScale * TIMING.hitStop.scale;
  }

  /** A kill's slow motion: after any hit-stop, ease from `feel.kill.scale` back to normal. */
  private slowMo(seconds: number) {
    this.beginTimeFx();
    this.slowFrom = Math.max(this.game.elapsed, this.freezeUntil);
    this.slowUntil = this.slowFrom + seconds;
  }

  private beginTimeFx() {
    if (this.timeFx) return;
    this.timeFx = true;
    this.baseTimeScale = this.game.timeScale;
  }

  private stepTimeFx() {
    if (!this.timeFx) return;
    const t = this.game.elapsed;
    let k = 1;
    if (t < this.freezeUntil) k = TIMING.hitStop.scale;
    else if (t < this.slowUntil) {
      const u = (t - this.slowFrom) / Math.max(1e-3, this.slowUntil - this.slowFrom);
      k = TIMING.feel.kill.scale + (1 - TIMING.feel.kill.scale) * u * u;
    } else {
      this.timeFx = false;
      this.freezeUntil = this.slowUntil = -1;
    }
    this.game.timeScale = this.baseTimeScale * k;
  }

  private cue(kind: 'stamina' | 'unblockable' | 'blind' | 'entangled' | 'free', c: Combatant) {
    if (kind === 'unblockable') {
      this.hud?.pulseUnblockable(this.cached.reduceFlashing);
      return;
    }
    if (!c.isPlayer) return;
    if (kind === 'stamina') {
      const hud = (this.game.ui as { hud?: { flashBar?: (k: 'stamina') => void } } | undefined)?.hud;
      hud?.flashBar?.('stamina');
    }
  }

  // ------------------------------------------------------------------ registration

  /** The player's combatant (built from the sheet and inventory when the RPG is installed). */
  registerPlayer(): Combatant {
    const game = this.game;
    const p = game.player;
    const sheet = p.sheet;
    const vitals = sheet?.vitals ?? new VitalsImpl({ health: 100, stamina: 100, pietas: 50 });
    const c = new Combatant({
      id: p.id,
      body: new ActorBody(p),
      view: AvatarCombatView.from(p.avatar),
      isPlayer: true,
      team: 'player',
      name: 'You',
      sheet,
      inventory: p.inventory,
      stats: sheet ?? flatStats(25),
      vitals,
      ownsVitals: !sheet,
      weapon: FISTS,
      armor: 0,
      family: 'cloth',
      poise: 50,
    });
    const av = p.avatar as HumanoidAvatar | null;
    if (av instanceof HumanoidAvatar) c.voice = av.appearance.sex === 'female' ? 'f' : 'm';
    this.playerC = c;
    this.core.add(c);
    this.refreshPlayerLoadout();
    this.hookController();
    return c;
  }

  /** Re-read the player's weapon, shield and armor from the inventory (on equip changes). */
  refreshPlayerLoadout() {
    const c = this.playerC;
    const inv = c?.inventory;
    if (!c) return;
    if (!inv) return;
    const items = inv.items;
    const main = inv.equipped('mainHand');
    const off = inv.equipped('offHand');
    const worn = inv.worn();
    c.weaponItem = main ? items.get(main) : undefined;
    c.weapon = c.weaponItem?.weapon && !c.weaponItem.weapon.projectileSpeed ? c.weaponItem.weapon : FISTS;
    c.shieldItem = off ? items.get(off) : undefined;
    c.shield = c.shieldItem?.shield;
    c.weaponCondition = worn.find((w) => w.slot === 'mainHand')?.condition ?? 1;
    c.shieldCondition = worn.find((w) => w.slot === 'offHand')?.condition ?? 1;
    c.armor = effectiveArmorRating(worn.filter((w) => w.def.armor), c.stats);
    c.family = armorFamilyOf(worn.map((w) => w.def));
    // The avatar carries what is equipped (the game flow's PlayerLook does it, with colours, when present).
    const av = this.game.player.avatar;
    if (av instanceof HumanoidAvatar && !this.game.getSystem('playerLook')) {
      const wm = c.weaponItem?.visual?.weapon ?? 'none';
      const sm = c.shieldItem?.visual?.shield ?? 'none';
      if (av.equipment.weapon !== wm) av.setWeapon(wm);
      if (av.equipment.shield !== sm) av.setShield(sm);
    }
  }

  private hookController() {
    const pc = this.game.getSystem<PlayerController>('playerController');
    if (!pc) return;
    const prevJump = pc.canJump;
    pc.canJump = () => prevJump() && this.canJump();
    const prevMotion = pc.motionOverride;
    pc.motionOverride = (dt) => (this.playerC ? this.core.motionFor(this.playerC) : null) ?? prevMotion(dt);
    const prevSpeed = pc.speedMultiplier;
    pc.speedMultiplier = () => {
      const c = this.playerC;
      let m = prevSpeed();
      if (!c) return m;
      // §6.6: a little slower in combat with a weapon drawn, and while guarding or swinging, but
      // never stuck in place (Skyrim-like: you keep moving through a fight). A sprint is a sprint:
      // armed you can still run someone down.
      if (c.drawn && this.core.playerInCombat && !this.game.player?.sprinting) m *= 0.95;
      if (c.guardActive) m *= 0.75;
      if (c.attacking()) m *= c.action?.kind === 'charge' ? 0.7 : 0.65;
      return m;
    };
    const prevSprint = pc.canSprint;
    pc.canSprint = () => prevSprint() && !(this.playerC?.winded ?? false) && !(this.playerC?.guardActive ?? false);
  }

  /** Space jumps unless in combat with a weapon drawn (§4.2); then it dodges. */
  canJump(): boolean {
    const c = this.playerC;
    if (!c) return true;
    if (!c.active) return false;
    if (this.cached.spaceAlwaysJumps) return true;
    return !(c.drawn && this.core.playerInCombat);
  }

  /** Make an actor a combatant. NPCs get vitals, stats and an AI from the profile. */
  register(actor: Actor, o: RegisterOptions = {}): Combatant {
    if (!o.profile) throw new Error('[combat] register needs a CombatProfile for NPCs');
    const p: CombatProfile = { ...o.profile, ...(o.loadout ?? {}) };
    const weaponItem = p.weapon ? this.items.get(p.weapon) : undefined;
    const shieldItem = p.shield ? this.items.get(p.shield) : undefined;
    const c = new Combatant({
      id: actor.id,
      body: new ActorBody(actor),
      view: AvatarCombatView.from(actor.avatar),
      team: o.team ?? 'hostile',
      group: o.group ?? o.faction,
      name: o.name ?? p.name ?? actor.id,
      title: o.title,
      tierLabel: o.tierLabel ?? tierLabel(p.tier),
      profile: p,
      stats: profileStats(p),
      vitals: new VitalsImpl({ health: p.health, stamina: p.stamina }),
      ownsVitals: true,
      weaponItem,
      weapon: profileWeapon(p, this.items),
      shieldItem,
      shield: shieldItem?.shield,
      armor: p.armor,
      family: p.armorFamily ?? 'cloth',
      poise: p.poise ?? 50,
      lawful: o.lawful,
      essential: o.essential,
      boss: o.boss,
    });
    c.brawl = !!o.brawl;
    if (o.tags) c.tags = [...o.tags];
    if (o.voice) c.voice = o.voice;
    else if (actor.avatar instanceof HumanoidAvatar) c.voice = actor.avatar.appearance.sex === 'female' ? 'f' : 'm';
    if (o.ai !== false) {
      c.brain = new CombatBrain(brainProfileFrom(p, o.brain), () => this.rng.next());
      c.brain.opener = o.opener ?? null;
      if (o.nereus || p.archetype === 'boss-nereus') {
        const s = new NereusScript();
        s.onNetLost = () => {
          c.hasNet = false;
          c.view?.setNet?.(false);
        };
        c.script = s;
        c.brain.script = s;
        c.hasNet = true;
      }
    }
    c.driven = !!o.driven;
    c.keepDriven = !!o.driven;
    if (o.aggro) this.core.aggro.set(c.id, o.aggro);
    this.core.add(c);
    if (o.drawn) {
      c.drawn = true;
      c.view?.setDrawn(true);
    }
    return c;
  }

  /**
   * Spawn a §13 enemy archetype at a position: avatar, actor, combatant and AI. Unknown archetypes
   * fall back to the RPG's §13.1 table (murmillo, retiarius, cloacarius…), then to a knife thug.
   */
  spawnEnemy(archetypeId: string, position: THREE.Vector3Like, opts: SpawnOptions = {}): Combatant {
    const game = this.game;
    const npc = opts.npc ? (game.npcs?.get(opts.npc) as NpcLike | undefined) : undefined;
    const qi = opts.quest ? (this.questSpawns.get(opts.quest) ?? 0) : 0;
    if (opts.quest) this.questSpawns.set(opts.quest, qi + 1);
    const r = resolveSpawn({ ...opts, archetype: archetypeId, npc: npc ?? (opts.npc ? { id: opts.npc } : undefined) }, this.items, qi);
    let id = opts.id ?? `${r.spec.id}-${++this.seq}`;
    // A fighter we spawned with this id is still here (a respawned quest foe): replace it. Someone
    // else's actor has the id (a placed NPC): fight as a stand-in, `<id>~foe` (quest content
    // matches either).
    const old = this.core.get(id);
    if (old && !old.isPlayer && this.spawned.has(id)) this.despawn(old);
    else if (game.actors.get(id) || old) id = `${id}~foe`;
    const base = r.appearance ?? randomAppearance(new Rng(opts.seed ?? id), r.spec.role);
    const app = r.spec.look ? r.spec.look(base, !!r.appearance) : base;
    const vis = visualsFor(this.items, r.profile);
    const avatar = createHumanoid(app, { lod: opts.lod ?? 'auto', weapon: vis.weapon, shield: vis.shield });
    const actor = new Actor(game, { id, position, heading: opts.heading ?? 0, layer: Layer.Npc, avatar });
    game.actors.add(actor);
    this.spawned.set(id, actor);
    // Footsteps (hobnails and mail for soldiers).
    const steps = game.audio?.footsteps?.attach(actor, {
      surfaceAt: this.surfaceAt ?? undefined,
      gear: r.profile.armorFamily === 'mail' || r.profile.armorFamily === 'plate' ? 'armor' : 'cloth',
      voice: app.sex === 'female' ? 'f' : 'm',
    });
    if (steps) this.footsteps.set(id, () => steps.detach());
    // Told not to be hostile but of a hostile archetype (a quest's allies): not on the 'hostile'
    // team, which is the player's enemy by definition.
    const team = opts.team ?? (opts.hostile === false && r.team === 'hostile' ? `npc:${id}` : r.team);
    const c = this.register(actor, {
      profile: r.profile,
      team,
      group: opts.group ?? r.group,
      name: r.name,
      title: r.title,
      lawful: r.lawful,
      essential: r.essential,
      brawl: r.brawl,
      boss: r.spec.boss,
      brain: r.spec.brain,
      aggro: opts.aggro ?? 18,
      driven: true,
      drawn: opts.drawn,
      tags: r.tags,
      nereus: r.nereus,
      opener: r.opener ?? undefined,
    });
    if (r.hostile) this.core.setHostile(team, 'player');
    // A quest's ambushers (and anyone told to engage) know where you are: they notice you within
    // their aggro radius without a line of sight, and walk round what stands between.
    if (r.hostile && (opts.quest || opts.engage)) this.core.hearing.set(c.id, opts.aggro ?? 18);
    if (c.brawl && this.playerC) this.playerC.brawl = true;
    const engage = opts.engage;
    if (engage === true && this.playerC) this.core.engage(c, this.playerC);
    else if (engage instanceof Combatant) this.core.engage(c, engage);
    // A practice bout of the Ludus has a crowd: favor, the chant, missio (§6.10).
    const bout = opts.bout ?? (r.lusio && r.spec.team === 'ludus' && (opts.practice !== undefined || !!opts.quest));
    if (bout && this.playerC && (!this.core.bout || this.core.bout.over)) this.startBout({ foes: [c], lusio: r.lusio, purse: r.spec.boss ? 40 : 10 });
    else if (bout && this.core.bout && !this.core.bout.over) this.core.bout.foes.add(c.id);
    return c;
  }

  /** Remove a spawned enemy (and its actor). */
  despawn(c: Combatant) {
    this.core.remove(c);
    this.yieldOffs.get(c.id)?.();
    this.yieldOffs.delete(c.id);
    const a = this.spawned.get(c.id);
    if (a) {
      this.game.actors.remove(a);
      this.spawned.delete(c.id);
    }
    this.footsteps.get(c.id)?.();
    this.footsteps.delete(c.id);
    const d = this.drapes.get(c.id);
    if (d) {
      d.removeFromParent();
      this.drapes.delete(c.id);
    }
  }

  get(idOrActor: string | Actor | Combatant): Combatant | undefined {
    if (idOrActor instanceof Combatant) return idOrActor;
    return this.core.get(typeof idOrActor === 'string' ? idOrActor : idOrActor.id);
  }

  /**
   * `a` fights `b` (combatants, actors or ids). Without `b` (or with options instead, as quest
   * content calls it) `a` fights the player. An actor that isn't a combatant yet — an NPC another
   * module placed — is made one first, from its definition's profile (adoptActor). Returns whether
   * a fight started.
   */
  engage(a: string | Actor | Combatant, b?: string | Actor | Combatant | EngageOptions): boolean {
    // Options are a plain object; anything with a position is someone to fight.
    const opts = b && typeof b === 'object' && !(b instanceof Combatant) && !('position' in b) ? (b as EngageOptions) : undefined;
    const ca = this.get(a) ?? this.adoptActor(a, opts);
    const cb = opts || b === undefined ? this.playerC : (this.get(b as string | Actor | Combatant) ?? this.adoptActor(b as string | Actor, undefined));
    for (const x of [ca, cb]) if (x && !x.isPlayer && !this.spawned.has(x.id) && !this.adopted.has(x.id)) this.adopted.set(x.id, this.core.now);
    if (!ca || !cb || ca === cb) return false;
    if (opts) {
      if (opts.tags) for (const t of opts.tags) if (!ca.tags.includes(t)) ca.tags.push(t);
      if (opts.quest && !ca.tags.includes(opts.quest)) ca.tags.push(opts.quest);
      if (opts.brawl) {
        ca.brawl = true;
        if (cb.isPlayer) cb.brawl = true;
      }
      if (opts.yieldAt !== undefined && ca.brain) ca.brain.profile.yieldAt = opts.yieldAt;
      if (opts.name) ca.name = opts.name;
    }
    if ((opts?.hostile ?? true) && cb.isPlayer && ca.team !== 'player' && !ca.lawful) this.core.setHostile(ca.team, cb.team);
    this.core.engage(ca, cb);
    return ca.target === cb;
  }

  /**
   * Make an actor another module placed into a combatant (it is driven by combat only while it
   * fights, then handed back). Its profile comes from its NPC definition (game.npcs, or the actor's
   * own `def`), else from its faction, else a civilian who defends himself.
   */
  adoptActor(a: string | Actor | Combatant, opts?: EngageOptions): Combatant | undefined {
    if (a instanceof Combatant) return a;
    const actor = typeof a === 'string' ? this.game.actors.get(a) : a;
    if (!actor || actor === (this.game.player as unknown)) return actor ? (this.playerC ?? undefined) : undefined;
    const existing = this.core.get(actor.id);
    if (existing) return existing;
    const ext = actor as Actor & { def?: NpcLike; hostile?: boolean; essential?: boolean; name?: unknown; role?: { guard?: boolean; archetype?: string } };
    const def = (this.game.npcs?.get(actor.id) as NpcLike | undefined) ?? ext.def;
    // The crowd's soldiers and vigiles are the watch (lawful: they answer for the city).
    const role = ext.role;
    const faction = role?.guard ? (role.archetype === 'vigil' ? 'vigiles' : role.archetype === 'praetorianus' ? 'praetoriani' : 'cohortes-urbanae') : undefined;
    const ad = adoptProfile(actor.id, this.items, {
      npc: def,
      faction,
      hostile: ext.hostile ?? opts?.hostile,
      essential: ext.essential,
      name: !def && typeof ext.name === 'string' ? ext.name : undefined,
    });
    const profile = opts?.profile ?? (opts?.practice ? { ...ad.profile, weapon: 'rudis' } : ad.profile);
    const c = this.register(actor, {
      profile,
      team: ad.team,
      group: ad.group,
      name: opts?.name ?? ad.name,
      title: ad.title,
      lawful: ad.lawful,
      essential: ad.essential,
      brawl: opts?.brawl,
      tags: opts?.tags,
      aggro: 0,
    });
    c.named = !!this.game.npcs?.get(actor.id);
    return c;
  }

  disengage(a: string | Actor | Combatant) {
    const c = this.get(a);
    if (c) this.core.disengage(c);
  }

  /** Is this actor fighting (default: the player, by the §6 inCombat predicate)? */
  /**
   * Does combat own this actor's body right now: fighting, kneeling in a yield (or cowering) or
   * knocked out? Their own module must not walk them meanwhile (they slid along on their knees).
   */
  holds(a: string | Actor | Combatant): boolean {
    const c = this.get(a);
    return !!c && (this.core.isInCombat(c) || c.status === 'yielded' || c.status === 'ko');
  }

  isInCombat(a?: string | Actor | Combatant): boolean {
    const c = a === undefined ? this.playerC : this.get(a);
    return !!c && this.core.isInCombat(c);
  }

  /** Is this actor (or the player) fighting in a running arena bout? Spectators watch those calmly. */
  inBout(a: string | Actor | Combatant): boolean {
    const b = this.core.bout;
    const c = this.get(a);
    return !!b && !b.over && !!c && (c === this.playerC || b.foes.has(c.id));
  }

  /** Does the combat system move this actor right now (the NPC module should leave it alone)? */
  isDriving(a: string | Actor | Combatant): boolean {
    const c = this.get(a);
    return !!c && c.driven && c.status !== 'fled';
  }

  get active(): boolean {
    return this.core.playerInCombat;
  }

  /** Did the player start the current trouble (an assault on someone who wasn't an enemy)? */
  /** The combat module's seeded random number (0..1). */
  rngNext(): number {
    return this.rng.next();
  }

  get playerAggressor(): boolean {
    return !!this.playerC?.aggressor;
  }

  /** The law has dealt with it (fine paid, jail served): the player is no longer the aggressor. */
  clearAggressor() {
    if (this.playerC) this.playerC.aggressor = false;
  }

  get difficulty() {
    return this.core.difficulty;
  }

  /** Start an arena bout (crowd favor, lusio rules, missio) against these foes. */
  startBout(o: Omit<BoutOptions, 'foes'> & { foes: Combatant[] }) {
    const bout = this.core.startBout({ ...o, foes: o.foes.map((f) => f.id) });
    for (const f of o.foes) if (this.playerC) this.core.engage(f, this.playerC);
    return bout;
  }

  // ------------------------------------------------------------------ lock-on

  private lockCandidates(maxDist: number, cone: number | null): Combatant[] {
    const pc = this.playerC;
    if (!pc) return [];
    const cam = this.game.camera;
    cam.getWorldDirection(tmp);
    const camYaw = Math.atan2(tmp.x, tmp.z);
    const out: { c: Combatant; a: number }[] = [];
    for (const c of this.core.list) {
      if (c === pc || !c.active) continue;
      // Enemies, anyone fighting the player, and anyone the player struck lately (a passer-by
      // set upon is a fair target too).
      const struck = this.struckAt.get(c);
      if (!this.core.hostile(pc, c) && c.target !== pc && !(struck !== undefined && this.game.elapsed - struck < 8)) continue;
      const d = dist2D(c.position, pc.position);
      if (d > maxDist) continue;
      const a = angleTo(camYaw, c.position.x - cam.position.x, c.position.z - cam.position.z);
      if (cone !== null && Math.abs(a) > cone) continue;
      if (!this.core.sight(pc, c)) continue;
      out.push({ c, a });
    }
    return out.sort((x, y) => Math.abs(x.a) - Math.abs(y.a)).map((x) => x.c);
  }

  /**
   * X tap: the target nearest the screen centre within 15 m and ±35° (§6.1); when nobody is
   * there, the nearest one in any direction (a trackpad camera is hard to aim exactly).
   */
  acquireLock(): boolean {
    const L = TIMING.lock;
    const pc = this.playerC;
    let best = this.lockCandidates(L.acquire, L.cone * DEG)[0];
    if (!best && pc) best = this.lockCandidates(L.acquire, null).sort((a, b) => dist2D(a.position, pc.position) - dist2D(b.position, pc.position))[0];
    if (best) this.setLock(best);
    return !!best;
  }

  /** X tap (or →) while locked: the next target to the right; ← the next to the left (wrapping). */
  cycleLock(dir: 1 | -1 = 1) {
    const pc = this.playerC;
    if (!pc) return;
    const L = TIMING.lock;
    const cands = this.lockCandidates(L.acquire, null);
    if (!cands.length) return;
    const cam = this.game.camera;
    cam.getWorldDirection(tmp);
    const camYaw = Math.atan2(tmp.x, tmp.z);
    const sorted = cands
      .map((c) => ({ c, a: angleTo(camYaw, c.position.x - cam.position.x, c.position.z - cam.position.z) }))
      .sort((x, y) => y.a - x.a); // left → right on screen
    const i = sorted.findIndex((x) => x.c === pc.lockTarget);
    this.setLock(sorted[(i + dir + sorted.length) % sorted.length].c);
  }

  setLock(t: Combatant | null) {
    const pc = this.playerC;
    if (!pc || pc.lockTarget === t) return;
    if (t) this.prevLock = t;
    pc.lockTarget = t;
    this.lockLostAt = -1;
    this.game.events.emit('combat:lock', { targetId: t?.id ?? null });
  }

  /** Drawing a weapon with a hostile within 8 m locks on (Trackpad preset, §4.3). */
  suggestLock() {
    const pc = this.playerC;
    if (!pc || pc.lockTarget || this.cached.lockOn === 'manual') return;
    const best = this.lockCandidates(TIMING.lock.autoSuggest, 90 * DEG)[0];
    if (best) this.setLock(best);
  }

  private maintainLock() {
    const pc = this.playerC;
    const t = pc?.lockTarget;
    if (!pc) return;
    if (!t) {
      // The lock went with a target that is down for good (the core clears it on a death or a
      // knockout): hand it to the next one still fighting you. A lock let go of by hand, or
      // dropped on a yield (the decision is pending), stays off.
      const prev = this.prevLock;
      if (prev && !prev.active && prev.status !== 'yielded') {
        this.prevLock = null;
        if (this.core.playerInCombat) this.acquireLock();
      }
      return;
    }
    const L = TIMING.lock;
    // A foe kneeling in a yield stays locked (the decision is yours); one who is down for good
    // (dead, knocked out, fled) hands the lock to the next one still fighting you.
    if (!pc.active || dist2D(t.position, pc.position) > L.breakDistance) {
      this.setLock(null);
      return;
    }
    if (!t.active && t.status !== 'yielded') {
      this.setLock(null);
      if (this.core.playerInCombat) this.acquireLock();
      return;
    }
    if (this.core.sight(pc, t)) this.lockLostAt = -1;
    else if (this.lockLostAt < 0) this.lockLostAt = this.game.elapsed;
    else if (this.game.elapsed - this.lockLostAt > L.sightLost) this.setLock(null);
  }

  /** Lock-on framing (§4.4): the view tracks the target; third person pulls back to 3.5–5 m. */
  private frameLock(dt: number) {
    const p = this.game.player;
    const t = this.playerC?.lockTarget;
    const rig = (this.rig ??= this.game.getSystem<CameraRig>('cameraRig') ?? null);
    if (!t) {
      if (rig) rig.framingDistance = 0;
      return;
    }
    const dx = t.position.x - p.position.x;
    const dz = t.position.z - p.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = damp(1 / 0.15, dt);
    if (p.viewMode === 'first') {
      // First person: the view tracks the target's chest with a 0.15 s lag.
      p.yaw += wrapAngle(Math.atan2(-dx, -dz) - p.yaw) * k;
      const dy = t.position.y + t.body.height * 0.72 - (p.position.y + p.eyeHeight);
      p.pitch += (Math.atan2(dy, d) - p.pitch) * k;
      if (rig) rig.framingDistance = 0;
    } else {
      // Third person frames both: the yaw turns a little off the line to the foe so the camera
      // orbits beside the player instead of hiding the foe behind it; pull back to 3.5–5 m.
      const off = this.lockOrbit * clamp(0.5 / d, 0.12, 0.3);
      p.yaw += wrapAngle(Math.atan2(-dx, -dz) + off - p.yaw) * k;
      p.pitch += (-0.24 - p.pitch) * k * 0.5;
      if (rig) rig.framingDistance = clamp(3.5 + d * 0.3, 3.5, 5);
    }
  }

  // ------------------------------------------------------------------ yields, bodies, the arena

  private wireEvents() {
    const ev = this.game.events;
    ev.on('item:equipped', () => this.refreshPlayerLoadout());
    ev.on('item:unequipped', () => this.refreshPlayerLoadout());
    // New clothes replace the player's avatar object (src/game/PlayerLook.ts): fight with the new one.
    ev.on('player:avatar', () => this.onPlayerAvatar());
    ev.on('combat:death', (e) => this.onDeath(e));
    // A load or a new game: the fights of the moment before are over, and you are on your feet.
    ev.on('save:loaded', () => {
      this.hasSave = true;
      this.rescueAt = -1;
      this.resetFights();
    });
    ev.on('save:saved', () => (this.hasSave = true));
    ev.on('game:started', () => this.resetFights());
    ev.on('combat:parry', (e) => {
      if (e.defenderId === this.playerC?.id) this.input.onParried();
    });
    ev.on('combat:hit', (e) => {
      if (e.attackerId === this.playerC?.id) {
        const c = this.core.get(e.targetId);
        if (c) {
          this.lastStruck = { c, at: this.game.elapsed };
          this.struckAt.set(c, this.game.elapsed);
        }
      }
    });
    ev.on('combat:started', () => {
      this.game.audio?.music?.setOverride('combat', 'combat', 10);
      // The first few fights: name the lock-on keys (live bindings).
      const st = this.game.settings;
      const n = st.data.combatLockHints ?? 0;
      if (n < 3 && !this.playerC?.lockTarget) {
        st.set('combatLockHints', n + 1);
        const key = (a: 'lockOn' | 'lookLeft' | 'lookRight') => codeLabel(this.game.input.bindings[a]?.[0] ?? '?');
        this.game.events.emit('ui:notify', { text: `Lock on: ${key('lockOn')}. While locked, ${key('lookLeft')} ${key('lookRight')} or ${key('lockOn')} switch targets; hold ${key('lockOn')} to let go.`, kind: 'info' });
      }
    });
    ev.on('combat:ended', () => this.game.audio?.music?.setOverride('combat', null));
    ev.on('actor:yielded', (e) => this.onYielded(e.actorId, e.byId));
    ev.on('combat:assault', (e) => {
      if (e.attackerId === this.playerC?.id) this.assaultVictims.add(e.victimId);
    });
    ev.on('combat:yieldChoice', (e) => this.onYieldChoice(e));
    ev.on('combat:bout', (e) => {
      if (e.phase !== 'end') return;
      if (e.winner === 'player') {
        const purse = e.purse ?? 0;
        if (purse > 0) this.game.player?.inventory?.addDenarii(purse);
        this.hud?.message('VICTORIA', purse > 0 ? `The crowd's favor: ${Math.round(e.favor)} · purse ${purse} den.` : `The crowd's favor: ${Math.round(e.favor)}`, 4);
      }
    });
    ev.on('combat:playerYielded', (e) => {
      if (e.context === 'arena') this.hud?.message(e.spared ? 'MISSIO' : 'SINE MISSIONE', e.spared ? 'The crowd spares you.' : e.outcome === 'death' ? 'The crowd wants blood.' : 'The doctor stops the bout.', 4);
      else if (e.context === 'brawl') this.hud?.message('You yield', 'The brawl is over. It cost you a tenth of your purse.', 3);
    });
    ev.on('combat:playerDefeated', (e) => {
      if (e.outcome !== 'death') this.onPlayerKnockedOut(e);
      const msg: Record<string, [string, string]> = {
        death: ['MORTVVS ES', 'You have fallen.'],
        'knocked-out': ['You are knocked out', ''],
        'brawl-lost': ['You are knocked out', 'The brawl is lost.'],
        saniarium: ['MISSIO', 'You wake in the Saniarium.'],
        'saniarium-no-purse': ['The bout is lost', 'You wake in the Saniarium, injured.'],
      };
      const [a, b] = msg[e.outcome] ?? ['', ''];
      this.hud?.message(a, b, 5);
      if (e.outcome !== 'death' && e.outcome !== 'knocked-out') this.game.player?.sheet?.applyCondition('injured');
      this.setLock(null);
    });
    ev.on('combat:phase', (e) => {
      const c = this.core.get(e.actorId);
      if (c?.boss) this.game.events.emit('ui:subtitle', { text: e.phase === 2 ? 'Now you dance, tiro!' : 'No more games.', speaker: c.name, duration: 3 });
    });
  }

  /** The player's avatar was rebuilt: point the combatant's view at it and restore the stance. */
  private onPlayerAvatar() {
    const c = this.playerC;
    const av = this.game.player?.avatar;
    if (!c || !av) return;
    c.view = AvatarCombatView.from(av);
    c.view?.setDrawn(c.drawn);
    c.view?.setBlocking(c.guardActive);
    if (av instanceof HumanoidAvatar) c.voice = av.appearance.sex === 'female' ? 'f' : 'm';
  }

  /** A body to search, and the NPC module told of the death of someone it placed. */
  private onDeath(e: GameEvents['combat:death']) {
    const c = this.core.get(e.actorId);
    if (!c || c.isPlayer) return;
    this.bodies.add(e, c.name, () => c.position);
    if (!this.spawned.has(c.id)) {
      const actor = (c.body as ActorBody).actor;
      const pop = (this.game as unknown as { population?: { kill?: (a: unknown) => void } }).population;
      try {
        pop?.kill?.(actor);
      } catch (err) {
        console.error('[combat] population.kill failed', err);
      }
    }
  }

  /**
   * The player is out cold outside a bout's rules (§6.9): the screen goes dark for a few seconds.
   * Street thugs take part of the purse and leave; the brawlers and the law simply stop. The bout
   * and quest outcomes follow from the events.
   */
  private onPlayerKnockedOut(e: GameEvents['combat:playerDefeated']) {
    const g = this.game;
    this.blackoutUntil = g.elapsed + TIMING.playerKnockout;
    const foes = (e.foes ?? []).map((id) => this.core.get(id)).filter((c): c is Combatant => !!c);
    let robbed = 0;
    for (const f of foes) {
      this.core.disengage(f);
      // They don't pick the fight up again the moment you stand.
      this.core.aggro.delete(f.id);
      if (!f.lawful && !f.brawl && f.team === 'hostile' && !robbed && !e.lusio) {
        const inv = g.player?.inventory;
        const purse = inv?.denarii ?? 0;
        robbed = Math.round(purse * 0.5 * 4) / 4;
        if (robbed > 0) inv?.spendDenarii(robbed);
      }
      if (this.spawned.has(f.id) && f.team === 'hostile') this.leaveAt.push({ c: f, at: g.elapsed + TIMING.playerKnockout * 0.6 });
    }
    if (robbed > 0) this.notices.push({ at: g.elapsed + TIMING.playerKnockout, text: `You come to in the street. Your purse is ${robbed} denarii lighter.` });
  }

  private leaveAt: { c: Combatant; at: number }[] = [];
  /** Notifications due on the game clock (cleared by a load or a new game). */
  private notices: { at: number; text: string }[] = [];

  /** End every fight with the player, drop the street encounter and the bout, stand the player up. */
  resetFights() {
    const pc = this.playerC;
    this.danger.clear();
    this.leaveAt.length = 0;
    this.notices.length = 0;
    this.blackoutUntil = -1;
    this.pendingChoice = null;
    if (this.core.bout && !this.core.bout.over) this.core.bout = null;
    if (!pc) return;
    for (const c of this.core.list) if (c !== pc && c.target === pc) this.core.disengage(c);
    this.setLock(null);
    if (pc.status !== 'active' && !pc.vitals.dead) this.core.standUp(pc);
    pc.brawl = false;
    this.core.playerCombatUntil = -Infinity;
  }

  /** Hostile NPCs aware of the player but not fighting yet (music: tension). */
  alerted(): boolean {
    const pc = this.playerC;
    if (!pc || this.core.playerInCombat) return false;
    return this.core.list.some((c) => c.active && !c.isPlayer && !!c.brain && (c.brain.state === 'search' || (c.target === pc && dist2D(c.position, pc.position) < 60)));
  }

  private onYielded(id: string, byId?: string) {
    const c = this.core.get(id);
    const pc = this.playerC;
    if (!c || !pc || c.isPlayer) return;
    // The event says who made him kneel (the blow's attacker; lastHitBy is set before the blow too).
    if ((byId ?? c.lastHitBy) !== pc.id && !this.core.bout?.foes.has(c.id)) return;
    if (pc.lockTarget === c) this.setLock(null);
    const inter = this.game.interactions;
    if (inter) {
      const at = new THREE.Vector3();
      const off = inter.add({
        id: `yield:${c.id}`,
        position: () => at.set(c.position.x, c.position.y + 0.9, c.position.z),
        reach: 3.2,
        verb: () => 'Decide',
        label: () => `${c.name} (yielded)`,
        enabled: () => c.status === 'yielded',
        interact: () => this.openYieldChoice(c),
      });
      this.yieldOffs.set(c.id, off);
    }
    // A foe who fought you gets the choice put to you; a passer-by you set upon just kneels (look
    // at them and press E to decide).
    if (!this.assaultVictims.has(c.id)) this.pendingChoice = { c, at: this.game.elapsed + 1.2 };
  }

  /** The §6.9 choice over a yielded foe, as a dialogue panel (arena: Mitte / Iugula). */
  openYieldChoice(c: Combatant) {
    if (c.status !== 'yielded') return;
    const ui = this.game.ui;
    const bout = this.core.bout && this.core.bout.foes.has(c.id) ? this.core.bout : null;
    const choose = (choice: YieldChoice) => this.applyYieldChoice(c, choice);
    let text: string;
    let opts: { text: string; act: () => void; disabled?: boolean; reason?: string }[];
    if (bout) {
      const chant = bout.chant === 'iugula' ? 'Iugula! (cut his throat)' : 'Mitte! (let him go)';
      text = `${c.name} drops to one knee and raises a finger: ad digitum. The crowd roars: ${chant}`;
      opts = [
        { text: 'Mitte — grant him missio', act: () => choose('spare') },
        { text: bout.lusio ? 'Strike him down (the practice arms only knock him out)' : 'Iugula — finish him', act: () => choose('kill') },
      ];
    } else {
      const arrest = canArrest({ factions: this.game.factions, night: () => this.core.env.night() });
      text = `${c.name} throws down the weapon and kneels. "Mercy! I yield!"`;
      opts = [
        { text: 'Spare him', act: () => choose('spare') },
        { text: 'Rob him', act: () => choose('rob') },
        { text: 'Arrest him', act: () => choose('arrest'), disabled: !arrest, reason: 'You hold no mandate to arrest (Vigiles or Urban Cohorts rank, or a bounty contract).' },
        { text: 'Kill him', act: () => choose('kill') },
      ];
    }
    if (!ui) {
      choose('spare');
      return;
    }
    ui.openDialogue(new ChoiceView(c.id, c.name, c.title, text, opts));
  }

  /** The player's decision; the RPG consequences follow from the 'combat:yieldChoice' event. */
  applyYieldChoice(c: Combatant, choice: YieldChoice) {
    if (c.status !== 'yielded') return;
    this.core.decideYielded(c, choice, { purse: choice === 'rob' ? this.purseOf(c) : 0 });
  }

  /** §6.9 consequences (rpg/yield.ts): Pietas and Fama for sparing, the purse and furtum, the arrest, Pietas −15 for killing. */
  private onYieldChoice(e: { actorId: string; choice: YieldChoice; purse?: number }) {
    const g = this.game;
    const c = this.core.get(e.actorId);
    const purse = e.purse ?? 0;
    resolveYield(
      { devotion: g.devotion, standing: g.standing, inventory: g.player?.inventory, crime: g.crime, factions: g.factions, night: () => this.core.env.night() },
      e.choice,
      { npcId: e.actorId, district: g.locations?.current()?.id, witnessed: false, purse },
    );
    this.yieldOffs.get(e.actorId)?.();
    this.yieldOffs.delete(e.actorId);
    if (this.pendingChoice?.c.id === e.actorId) this.pendingChoice = null;
    // An arrested foe is led away (the crime/NPC module may take over before then).
    if (c && e.choice === 'arrest' && this.spawned.has(c.id)) this.despawnAt.push({ c, at: g.elapsed + 2 });
    if (e.choice === 'rob' && purse > 0) g.events.emit('ui:notify', { text: `Took ${purse} denarii`, kind: 'item' });
  }

  private despawnAt: { c: Combatant; at: number }[] = [];

  private purseOf(c: Combatant): number {
    const table = c.profile?.loot;
    if (table) {
      try {
        return Math.max(1, Math.round(rollLoot(table, 1, this.rng).denarii));
      } catch {
        /* unknown table */
      }
    }
    return 1 + Math.floor(this.rng.next() * 5);
  }

  /** A knocked-out body within 1.6 m in front and no enemy within 3 m (hold F to finish it). */
  finishable(): Combatant | null {
    const pc = this.playerC;
    if (!pc) return null;
    let best: Combatant | null = null;
    for (const c of this.core.list) {
      if (c === pc) continue;
      if (c.active && c.target === pc && dist2D(c.position, pc.position) < 3) return null;
      if (c.status !== 'ko') continue;
      const d = dist2D(c.position, pc.position);
      if (d > 1.8) continue;
      if (Math.abs(angleTo(pc.heading, c.position.x - pc.position.x, c.position.z - pc.position.z)) > 70 * DEG) continue;
      best = c;
    }
    return best;
  }

  finishBody(c: Combatant) {
    const pc = this.playerC;
    if (!pc || c.status !== 'ko') return;
    pc.view?.play('attackPower');
    c.status = 'active';
    this.core.kill(c, pc);
    this.game.events.emit('combat:assault', { attackerId: pc.id, victimId: c.id, lawfulVictim: c.lawful });
  }

  arenaHoldLabel(): string | null {
    const b = this.core.bout;
    const pc = this.playerC;
    if (!b || b.over || !pc?.active) return null;
    if (b.favor >= 100) return 'GIFTS';
    if (b.canSalute() && b.editor) {
      const a = angleTo(pc.heading, b.editor.x - pc.position.x, b.editor.z - pc.position.z);
      if (Math.abs(a) < 40 * DEG) return 'SALUTE';
    }
    return null;
  }

  arenaHoldE() {
    const b = this.core.bout;
    const pc = this.playerC;
    if (!b || !pc) return;
    if (b.favor >= 100) {
      const g = b.takeGifts(() => this.rng.next());
      if (!g) return;
      pc.vitals.restore('stamina', g.wineStamina);
      this.game.player?.inventory?.addDenarii(g.denarii);
      if (g.weapon && this.items.has('gladius-noric')) this.game.player?.inventory?.add('gladius-noric', 1, { source: 'gift' });
      pc.view?.play('cheer');
      this.game.events.emit('ui:notify', { text: `The crowd throws gifts: ${g.denarii} denarii and wine${g.weapon ? ', and a fine blade' : ''}`, kind: 'item' });
    } else if (b.salute()) {
      pc.view?.play('wave');
      this.game.events.emit('ui:notify', { text: 'You salute the editor (+5 favor)', kind: 'info' });
    }
  }

  playerYield() {
    const r = this.core.playerYield();
    if (r.context === 'none') this.game.events.emit('ui:notify', { text: 'Nobody here accepts your surrender.', kind: 'warning' });
  }

  // ------------------------------------------------------------------ visuals

  private projectileVisual(p: Projectile, on: boolean) {
    if (on) {
      const net = new THREE.LineSegments(this.netGeo, this.ropeMat);
      net.position.set(p.x, p.y, p.z);
      this.game.scene.add(net);
      this.netVisuals.set(p.id, net);
      p.owner.view?.setNet?.(false);
    } else {
      const v = this.netVisuals.get(p.id);
      v?.removeFromParent();
      this.netVisuals.delete(p.id);
      if (p.owner.hasNet) p.owner.view?.setNet?.(true);
    }
  }

  private updateVisuals(dt: number) {
    for (const p of this.core.projectiles) {
      const v = this.netVisuals.get(p.id);
      if (!v) continue;
      v.position.set(p.x, p.y - 0.1, p.z);
      v.rotation.x = -Math.PI / 2 + 0.35;
      v.rotation.z += dt * 9;
    }
    // A net drapes over anyone caught in it.
    for (const c of this.core.list) {
      const on = c.entangled(this.core.now) && c.active;
      let d = this.drapes.get(c.id);
      if (on && !d) {
        d = new THREE.LineSegments(this.drapeGeo, this.ropeMat);
        d.position.y = 0.95;
        this.drapes.set(c.id, d);
      }
      if (d) {
        const actorRoot = (c.body as ActorBody).actor?.root;
        if (on && actorRoot && d.parent !== actorRoot) actorRoot.add(d);
        if (!on && d.parent) d.removeFromParent();
        // In first person the drape would sit on the camera: the HUD shows the net instead.
        d.visible = !(c.isPlayer && this.game.player.viewMode === 'first');
      }
    }
  }

  // ------------------------------------------------------------------ HUD

  /** The UI's sources: enemy bar, boss bar, inCombat, compass ticks (§15.1). */
  private provideUi() {
    const ui = this.game.ui;
    if (!ui) return;
    const prevMarkers = ui.sources.compassMarkers;
    const merged: CompassMarker[] = [];
    ui.provide({
      target: () => this.targetView(),
      boss: () => this.bossView(),
      inCombat: () => this.core.playerInCombat,
      // The game flow's wiring may already ask game.combat for its markers: never list one twice.
      compassMarkers: () => {
        const own = this.compassMarkers();
        const prev = prevMarkers?.() ?? [];
        if (!prev.length) return own;
        merged.length = 0;
        for (const m of prev) if (!m.id.startsWith('enemy:') || !own.some((o) => o.id === m.id)) merged.push(m);
        for (const m of own) merged.push(m);
        return merged;
      },
    });
  }

  // Reused views for the UI's per-frame sources (the HUD reads them at once and keeps nothing).
  private tv: TargetView = { name: '', health: 1 };
  private bv: BossView = { name: '', health: 1 };
  private markers: CompassMarker[] = [];
  private markerOf = new WeakMap<Combatant, CompassMarker>();
  private hs: CombatHudState = { lock: null, favor: null, net: null, blind: false, hold: null, dark: false };
  private hsLock = { x: 0, y: 0 };
  private hsFavor: { value: number; chant: 'mitte' | 'iugula' | null } = { value: 0, chant: null };

  /** The enemy bar: the lock target, else the last one struck (for 4 s), else whoever is attacking. */
  targetView(): TargetView | null {
    const pc = this.playerC;
    if (!pc || pc.status === 'ko' || pc.status === 'dead') return null;
    let c: Combatant | null = pc.lockTarget;
    if (!c && this.lastStruck && this.game.elapsed - this.lastStruck.at < 4 && this.lastStruck.c.status !== 'dead') c = this.lastStruck.c;
    if (!c || c.boss) return null;
    const v = this.tv;
    v.name = c.name;
    v.health = c.healthFrac();
    v.tier = c.tierLabel;
    return v;
  }

  /** The boss bar while a boss is fighting the player within 30 m. */
  bossView(): BossView | null {
    const pc = this.playerC;
    if (!pc) return null;
    for (const c of this.core.list) {
      if (!c.boss || c.status === 'dead' || c.status === 'fled') continue;
      if (c.target !== pc && c.status === 'active' && !this.core.bout?.foes.has(c.id)) continue;
      if (dist2D(c.position, pc.position) > 30) continue;
      const v = this.bv;
      v.name = c.name;
      v.title = c.boss.title;
      v.health = c.healthFrac();
      v.phases = c.boss.phases;
      return v;
    }
    return null;
  }

  /** Combatants fighting the player right now. */
  hostiles(): Combatant[] {
    const pc = this.playerC;
    return pc ? this.core.list.filter((c) => c.active && c.target === pc) : [];
  }

  /** Compass ticks for everyone fighting the player (a reused list; read it at once). */
  compassMarkers(): CompassMarker[] {
    const out = this.markers;
    out.length = 0;
    const pc = this.playerC;
    if (!pc) return out;
    for (const c of this.core.list) {
      if (!c.active || c.target !== pc) continue;
      let m = this.markerOf.get(c);
      if (!m) this.markerOf.set(c, (m = { id: `enemy:${c.id}`, kind: 'enemy', x: 0, z: 0 }));
      m.x = c.position.x;
      m.z = c.position.z;
      out.push(m);
    }
    return out;
  }

  private hudState(): CombatHudState {
    const pc = this.playerC;
    const now = this.core.now;
    const s = this.hs;
    s.lock = null;
    const t = pc?.lockTarget;
    if (t) {
      const cam = this.game.camera;
      tmp.set(t.position.x, t.position.y + t.body.height * 0.7, t.position.z).project(cam);
      if (tmp.z < 1) {
        const w = this.game.canvas.clientWidth || window.innerWidth;
        const h = this.game.canvas.clientHeight || window.innerHeight;
        this.hsLock.x = (tmp.x * 0.5 + 0.5) * w;
        this.hsLock.y = (-tmp.y * 0.5 + 0.5) * h;
        s.lock = this.hsLock;
      }
    }
    const b = this.core.bout;
    s.favor = null;
    if (b && (!b.over || b.chant)) {
      this.hsFavor.value = b.favor;
      this.hsFavor.chant = b.chant;
      s.favor = this.hsFavor;
    }
    s.net = pc && pc.entangled(now) ? clamp((pc.entangledUntil - now) / TIMING.net.entangle, 0, 1) : null;
    // Out cold, or carried off to the Aesculapian rescue: the world goes dark for a moment.
    s.dark = !!pc && pc.status !== 'yielded' && this.game.elapsed < this.blackoutUntil;
    s.blind = !!pc && now < pc.blindUntil;
    s.hold = this.input.hold;
    return s;
  }

  /** Mount the HUD overlay and the UI sources (called once the UI exists, or at install). */
  attachHud() {
    if (this.hud || this.opts.hud === false) return;
    const ui = this.game.ui as { hud?: { el?: HTMLElement } } | undefined;
    const parent = ui?.hud?.el ?? this.opts.hudRoot;
    if (!parent) return;
    const b = this.game.input.bindings;
    this.hud = new CombatHud(parent, { attack: codeLabel(b.attack.find((k) => !k.startsWith('Mouse')) ?? 'KeyF'), interact: codeLabel(b.interact[0] ?? 'KeyE') });
    this.provideUi();
    const sys: System = {
      name: 'combatHud',
      priority: 120, // after the camera
      lateUpdate: (dt) => this.hud?.update(this.hudState(), dt),
    };
    this.game.addSystem(sys);
  }

  // ------------------------------------------------------------------ the frame

  fixedUpdate(dt: number) {
    this.core.difficulty = this.cached.difficulty;
    // Locked on with a weapon drawn, the body squares up to the foe (the camera orbits a little off it).
    const pc = this.playerC;
    const t = pc?.lockTarget;
    const p = this.game.player;
    if (pc && t && pc.drawn && pc.active && !pc.stunned(this.core.now) && pc.action?.kind !== 'dodge') {
      p.heading = Math.atan2(t.position.x - p.position.x, t.position.z - p.position.z);
    }
    // Aim assist: square up to the one the attack is meant for until the blow lands.
    const aim = pc?.assist;
    const act = pc?.action;
    if (pc && aim && act && act.hitAt !== undefined && !act.resolved && pc.active && !pc.stunned(this.core.now) && aim.status !== 'dead') {
      p.heading = Math.atan2(aim.position.x - p.position.x, aim.position.z - p.position.z);
    }
    if (pc) pc.sneaking = !!p.sneaking;
    // A fallen player stays where it fell (the controller would turn the body with the keys).
    if (pc && pc.status !== 'active' && pc.status !== 'yielded') {
      this.downHeading ??= p.heading;
      p.heading = this.downHeading;
    } else this.downHeading = null;
    this.danger.fixedUpdate(dt);
    this.core.fixedStep(dt);
  }

  update(dt: number) {
    const pc = this.playerC;
    const g = this.game;
    if (pc) {
      // Brought back by someone else (a load, the flow's revive): stand up.
      if (pc.status === 'dead' && !pc.vitals.dead) this.core.standUp(pc);
      this.input.update();
      g.player.combatStance = pc.drawn && pc.active;
      const av = g.player.avatar;
      if (av instanceof HumanoidAvatar) av.setAimPitch(g.player.pitch);
      this.maintainLock();
      if (this.cached.lockOn === 'auto' && !pc.lockTarget && this.core.playerInCombat) this.acquireLock();
      // A brawl is over once no brawler is about any more.
      if (pc.brawl && !this.core.playerInCombat && !this.core.list.some((c) => c !== pc && c.brawl && c.active && dist2D(c.position, pc.position) < 30)) pc.brawl = false;
      this.frameLock(dt);
    }
    this.tickRescue();
    if (this.pendingChoice && g.elapsed >= this.pendingChoice.at) {
      const c = this.pendingChoice.c;
      this.pendingChoice = null;
      // Open at once unless someone else is still attacking the player, or the player is still
      // swinging (then a moment after the last swing).
      const busy = this.core.list.some((o) => o.active && o.target === pc && o !== c);
      if (pc && this.core.now - pc.lastAttackAt < 1) this.pendingChoice = { c, at: g.elapsed + 0.5 };
      else if (!busy && c.status === 'yielded' && !g.ui?.top) this.openYieldChoice(c);
    }
    for (let i = this.despawnAt.length - 1; i >= 0; i--) {
      if (g.elapsed >= this.despawnAt[i].at) {
        this.despawn(this.despawnAt[i].c);
        this.despawnAt.splice(i, 1);
      }
    }
    for (let i = this.notices.length - 1; i >= 0; i--) {
      if (g.elapsed >= this.notices[i].at) {
        g.events.emit('ui:notify', { text: this.notices[i].text, kind: 'warning' });
        this.notices.splice(i, 1);
      }
    }
    // Thugs who robbed a knocked-out player are gone when the player comes to.
    for (let i = this.leaveAt.length - 1; i >= 0; i--) {
      if (g.elapsed >= this.leaveAt[i].at) {
        const c = this.leaveAt[i].c;
        if (c.status === 'active' && !c.target) this.despawn(c);
        this.leaveAt.splice(i, 1);
      }
    }
    this.housekeeping();
    this.danger.update();
    this.updateVisuals(dt);
  }

  /** Dead with combat handling the death: a moment of black, then the Aesculapian rescue. */
  private tickRescue() {
    const g = this.game;
    const pc = this.playerC;
    const flow = (g as unknown as { flow?: { state?: string } }).flow;
    const dead = !!pc && (pc.vitals.dead || pc.status === 'dead');
    if (!dead || !this.handlesDeath || flow?.state !== 'playing') {
      this.rescueAt = -1;
      return;
    }
    if (this.rescueAt < 0) {
      this.rescueAt = g.elapsed + 3;
      this.blackoutUntil = this.rescueAt + 0.5;
    } else if (g.elapsed >= this.rescueAt) this.rescue();
  }

  /**
   * The Aesculapian rescue (§6.12, §6.14): people found you and carried you to the Temple of
   * Aesculapius on the Tiber Island. You wake on your feet there with full health and a fifth less
   * coin (no miracle). The fights of the moment before are over.
   */
  rescue() {
    const g = this.game;
    const pc = this.playerC;
    if (!pc) return;
    this.rescueAt = -1;
    this.resetFights();
    this.core.revive(pc);
    const inv = g.player?.inventory;
    const purse = inv?.denarii ?? 0;
    const fee = Math.round(purse * 0.2 * 4) / 4;
    if (fee > 0) inv?.spendDenarii(fee);
    const at = this.rescuePoint();
    if (at) {
      g.player.teleport(at.position, at.heading);
      g.player.yaw = at.heading + Math.PI;
      g.player.pitch = -0.1;
      (g as unknown as { world?: { refreshAll?: () => void } }).world?.refreshAll?.();
    }
    // Whoever was fighting you is far away now (and stops looking).
    for (const c of this.core.list) if (c !== pc && c.target === pc) this.core.disengage(c);
    this.blackoutUntil = g.elapsed + 0.6;
    this.hud?.message('AESCVLAPIVS', 'Passers-by carried you to the Tiber Island. The priests patched you up.', 5);
    g.events.emit('ui:notify', { text: fee > 0 ? `You wake in the Temple of Aesculapius. The priests' care cost ${fee} denarii.` : 'You wake in the Temple of Aesculapius.', kind: 'warning' });
    g.events.emit('combat:rescued', { fee, place: at ? 'temple-aesculapius' : null });
  }

  /** In front of the Temple of Aesculapius (Tiber Island), facing it; null without the landmark. */
  private rescuePoint(): { position: THREE.Vector3; heading: number } | null {
    const g = this.game;
    const placed = g.landmarks?.get('temple-aesculapius');
    if (!placed) return null;
    const altar = placed.spots.find((s) => s.id.endsWith('temple-aesculapius:altar'));
    const door = placed.spots.find((s) => s.id.endsWith('temple-aesculapius:door'));
    const base = altar?.position ?? placed.position;
    // A couple of metres out from the altar, away from the temple door.
    let ox = Math.sin(placed.rotationY + Math.PI);
    let oz = Math.cos(placed.rotationY + Math.PI);
    if (altar && door) {
      const dx = altar.position.x - door.position.x;
      const dz = altar.position.z - door.position.z;
      const d = Math.hypot(dx, dz) || 1;
      ox = dx / d;
      oz = dz / d;
    }
    const x = base.x + ox * 2.2;
    const z = base.z + oz * 2.2;
    const y = g.physics.groundHeight(x, z, base.y + 4, 12) ?? base.y;
    return { position: new THREE.Vector3(x, y + 0.05, z), heading: Math.atan2(-ox, -oz) };
  }

  private nextHousekeeping = 0;

  /**
   * Every few seconds: old bodies expire (3 game days), and spawned enemies that are over —
   * corpses already searched or far away, the fled, the spared who walked off — leave the world.
   */
  private housekeeping() {
    const g = this.game;
    if (g.elapsed < this.nextHousekeeping) return;
    this.nextHousekeeping = g.elapsed + 3;
    for (const id of this.bodies.expire()) {
      const c = this.core.get(id);
      if (c && this.spawned.has(id)) this.despawn(c);
    }
    // Adopted people who are gone from the world, or idle for 30 s, go back to their own module.
    for (const [id, at] of this.adopted) {
      const c = this.core.get(id);
      const actor = c ? (c.body as ActorBody).actor : null;
      const gone = !c || !actor || g.actors.get(id) !== actor;
      const idle = !!c && c.status === 'active' && !c.target && !c.driven && this.core.now - Math.max(at, c.lastHitAt, c.lastAttackAt) > 30;
      if (gone) this.bodies.remove(id);
      if (gone || idle) {
        if (c) this.core.remove(c);
        this.adopted.delete(id);
      }
    }
    const pp = g.player?.position;
    if (!pp) return;
    this.releaseUndecided(pp);
    for (const c of [...this.core.list]) {
      if (!this.spawned.has(c.id) || c.isPlayer) continue;
      const d = dist2D(c.position, pp);
      const over = c.status === 'fled' || (c.status === 'active' && c.team.startsWith('spared:'));
      const corpse = c.status === 'dead';
      if ((over && d > 30) || (corpse && d > 160) || (c.status === 'active' && !c.target && d > 220)) {
        this.bodies.remove(c.id);
        this.despawn(c);
      }
    }
  }

  /**
   * A yield nobody decides: once the player is 40 m away, or after 60 s (15 s when he didn't yield
   * to the player), he gets up and goes about his business. An adopted NPC goes back to its own
   * module. Arena foes wait for the missio.
   */
  private releaseUndecided(pp: { x: number; z: number }) {
    const now = this.core.now;
    const g = this.game;
    for (const c of [...this.core.list]) {
      if (c.status !== 'yielded' || c.isPlayer || this.core.bout?.foes.has(c.id)) continue;
      if (this.pendingChoice?.c === c || (g.ui?.isOpen?.('dialogue') && dist2D(c.position, pp) < 6)) continue;
      const mine = this.yieldOffs.has(c.id);
      const age = now - c.yieldedAt;
      // A civilian stays down only a few seconds before scrambling up to run (20 s while the player
      // stands over them with the spare / rob choice); a fighter longer.
      const civ = c.profile?.tier === 'civilian';
      const keep = civ ? (mine ? 20 : 6) : mine ? 60 : 15;
      if (dist2D(c.position, pp) <= 40 && age <= keep) continue;
      this.yieldOffs.get(c.id)?.();
      this.yieldOffs.delete(c.id);
      this.core.releaseYielded(c);
      if (this.adopted.has(c.id)) {
        this.core.remove(c);
        this.adopted.delete(c.id);
      }
    }
  }

  lateUpdate(dt: number) {
    const g = this.game;
    this.stepTimeFx();
    const rig = (this.rig ??= g.getSystem<CameraRig>('cameraRig') ?? null);
    if (rig) {
      // Real time: the shake and the kicks play out at full speed through a hit-stop.
      const rdt = Math.min(0.05, dt);
      const F = TIMING.feel;
      const kick = this.kick;
      this.feelT += rdt;
      this.trauma = Math.max(0, this.trauma - F.decay * rdt);
      const a = this.trauma * this.trauma;
      const t = this.feelT;
      // Smooth noise (sums of sines), not white jitter: it reads as a jolt, not a buzz.
      const n = (f: number, o: number) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 1.73 + o * 2.1) * 0.4;
      if (a > 0) rig.shake.set(n(31, 0) * a * F.shake, n(29, 1.7) * a * F.shake, n(27, 3.1) * a * F.shake);
      else if (rig.shake.lengthSq() > 0) rig.shake.set(0, 0, 0);
      // Kicks spring back to rest.
      const back = Math.exp(-11 * rdt);
      kick.pitch *= back;
      kick.yaw *= back;
      kick.roll *= back;
      kick.fov *= Math.exp(-9 * rdt);
      for (const k of ['pitch', 'yaw', 'roll'] as const) if (Math.abs(kick[k]) < 1e-4) kick[k] = 0;
      if (Math.abs(kick.fov) < 0.01) kick.fov = 0;
      rig.kick.pitch = kick.pitch;
      rig.kick.yaw = kick.yaw;
      rig.kick.roll = kick.roll + (a > 0 ? n(23, 4.2) * a * F.roll : 0);
      rig.fovKick = kick.fov;
    }
  }

  dispose() {
    this.hud?.dispose();
    this.netGeo.dispose();
    this.drapeGeo.dispose();
    this.ropeMat.dispose();
  }
}

function tierLabel(tier: string): string | undefined {
  const t: Record<string, string> = { civilian: 'Civilian', thug: 'Thug', bruiser: 'Bruiser', skirmisher: 'Skirmisher', miles: 'Soldier', veteran: 'Veteran', champion: 'Champion', elite: 'Elite' };
  return t[tier];
}

/** Install the combat system (after setupPlayer; after installRpg and installUI when used). */
export function installCombat(game: Game, opts: InstallCombatOptions = {}): CombatSystem {
  if (game.combat) return game.combat;
  const sys = new CombatSystem(game, opts);
  game.combat = sys;
  game.addSystem(sys);
  sys.attachHud();
  // Blood and severed limbs (Settings → Gameplay → Gore); needs a scene with a canvas.
  if (typeof document !== 'undefined') sys.gore = game.addSystem(new GoreSystem(game, sys.core, () => sys.rngNext()));
  // Active ragdolls for deaths, knockouts and knockdowns (physics/ragdoll).
  if (typeof document !== 'undefined' && !game.ragdolls) game.addSystem(new RagdollSystem(game));
  // Dev: &danger=0 keeps the streets safe; &danger=<site id> stages that encounter just ahead of
  // you when the game starts (src/combat/danger.ts).
  const d = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('danger') : null;
  if (d === '0') sys.danger.enabled = false;
  else if (d) {
    game.events.on('game:started', () => {
      const p = game.player;
      if (!p) return;
      const f = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
      sys.danger.trigger(d, { x: p.position.x + f.x * 20, z: p.position.z + f.z * 20 });
    });
  }
  return sys;
}

export type { CombatView };
