/**
 * A combatant: an actor (player, enemy, guard, gladiator) taking part in combat, with its pools,
 * loadout, poise and the state of whatever it is doing. The rules that change this state live in
 * CombatCore; this file is data plus small queries.
 *
 * Bodies and avatars are reached through two small adapters so the rules run without Three.js
 * scenes or Rapier in tests: `CombatBody` (position, facing, one step of locomotion) and
 * `CombatView` (an avatar's clips, guard, charge pose and hand socket).
 */
import type * as THREE from 'three';
import type { ActionClip } from '../actors/Actor';
import type { CombatBrain } from '../ai/combat/CombatBrain';
import type { NereusScript } from '../ai/combat/nereus';
import { createPoise, type CombatantStats, type PoiseState } from '../rpg/combat-math';
import type { CharacterSheetImpl } from '../rpg/sheet';
import type { InventoryImpl } from '../rpg/inventory';
import type { ArmorFamily, CombatProfile, ItemDef, ShieldStats, WeaponStats } from '../rpg/types';
import type { VitalsImpl } from '../rpg/vitals';
import type { AttackKind, Phases } from './timing';

/** The physical side of a combatant (an Actor in the game, a point in tests). */
export interface CombatBody {
  readonly id: string;
  /** Feet position at the latest fixed step. */
  readonly position: THREE.Vector3;
  heading: number;
  readonly radius: number;
  readonly height: number;
  /** One fixed step of locomotion toward a horizontal velocity (m/s). NPCs only. */
  move(wish: { x: number; z: number }, dt: number, accel?: number): void;
  /** Stop blocking the living (a corpse); and back. */
  setGhost?(ghost: boolean): void;
  /** Stop dead (no glide): kill the body's velocity at once. */
  halt?(): void;
  /** Current horizontal velocity (m/s). */
  velocity?(): { x: number; z: number };
}

export interface PlayClipOptions {
  speed?: number;
  onHit?: () => void;
  onEnd?: (interrupted: boolean) => void;
}

/** The visual side (a HumanoidAvatar in the game; absent in tests). */
export interface CombatView {
  play(clip: ActionClip, opts?: PlayClipOptions): void;
  /** The clip's hit time at speed 1 for the current stance, if it has one. */
  clipHit(clip: ActionClip): number | undefined;
  /** The held wind-up pose time of a power clip. */
  clipWindup(clip: ActionClip): number | undefined;
  setDrawn(drawn: boolean): void;
  setBlocking(on: boolean): void;
  setCharge(c: number): void;
  setDead(dead: boolean): void;
  /** World position of the weapon hand and of the shoulder pivot; false if unknown. */
  hand(out: THREE.Vector3): boolean;
  shoulder(out: THREE.Vector3): boolean;
  /** Show or hide a carried net (the retiarius). */
  setNet?(on: boolean): void;
}

export type StunKind = 'flinch' | 'stagger' | 'knockdown' | 'guardBreak';
export type CombatStatus = 'active' | 'ko' | 'yielded' | 'dead' | 'fled';

/** Something the combatant is doing on the combat clock. */
export interface Action {
  kind: AttackKind | 'charge' | 'dodge' | 'draw' | 'sheathe' | 'kneel';
  start: number;
  end: number;
  /** Attacks: phases and the absolute hit time. */
  phases?: Phases;
  hitAt?: number;
  resolved: boolean;
  /** Light chain position (1–3). */
  chain?: number;
  /** Power: seconds charged and the latched direction. */
  charge?: number;
  direction?: 'none' | 'forward' | 'sideways' | 'back';
  sprint?: boolean;
  unblockable?: boolean;
  /** Ignores flinches (heavy-weapon and boss power wind-ups, §6.5). */
  hyperArmor?: boolean;
  /** Feints stop here. */
  cancelAt?: number;
  /** A weapon other than the main one (Nereus' practice dagger). */
  weapon?: WeaponStats;
  /** The avatar is playing this attack's clip (its onHit may resolve the hit). */
  viewed?: boolean;
  /** Dodges: direction (unit, world). */
  dx?: number;
  dz?: number;
}

/** Code displacement (no root motion, §6.15): a velocity held until a time. */
export interface Motion {
  vx: number;
  vz: number;
  until: number;
  accel: number;
}

export interface CombatantInit {
  id: string;
  body: CombatBody;
  view?: CombatView | null;
  isPlayer?: boolean;
  /** Side: 'player', 'hostile', a faction id… Different teams fight only when hostile or engaged. */
  team: string;
  /** Allies who answer a call for help (default: the team). */
  group?: string;
  name: string;
  title?: string;
  /** Faint label after the name on the enemy bar ('Veteran'). */
  tierLabel?: string;
  profile?: CombatProfile;
  sheet?: CharacterSheetImpl;
  inventory?: InventoryImpl;
  stats: CombatantStats;
  vitals: VitalsImpl;
  /** The core ticks these vitals (NPCs). The player's are ticked by the RPG system. */
  ownsVitals: boolean;
  weaponItem?: ItemDef;
  weapon: WeaponStats;
  shieldItem?: ItemDef;
  shield?: ShieldStats;
  armor: number;
  family: ArmorFamily;
  poise: number;
  /** Law-keepers (miles, vigil): answer calls against an aggressor, prefer arrests. */
  lawful?: boolean;
  /** Never dies: kneels 3 s instead (§6.14). */
  essential?: boolean;
  /** People (for knockouts and takedowns); beasts are not. */
  human?: boolean;
  /** Boss bar title and phase marks. */
  boss?: { title: string; phases: number[] };
}

export class Combatant {
  readonly id: string;
  readonly body: CombatBody;
  view: CombatView | null;
  readonly isPlayer: boolean;
  team: string;
  group: string;
  name: string;
  title?: string;
  tierLabel?: string;
  profile?: CombatProfile;
  sheet?: CharacterSheetImpl;
  inventory?: InventoryImpl;
  stats: CombatantStats;
  vitals: VitalsImpl;
  readonly ownsVitals: boolean;
  weaponItem?: ItemDef;
  weapon: WeaponStats;
  shieldItem?: ItemDef;
  shield?: ShieldStats;
  weaponCondition = 1;
  shieldCondition = 1;
  armor: number;
  family: ArmorFamily;
  poise: PoiseState;
  basePoise: number;
  lawful: boolean;
  essential: boolean;
  human: boolean;
  boss?: { title: string; phases: number[] };
  /** Voice for grunts and cries (vox.*.m / vox.*.f). */
  voice: 'm' | 'f' = 'm';

  /** Weapon in hand. */
  drawn = false;
  /** What the input or AI wants; `guardActive` is what actually happens. */
  guardWanted = false;
  guardActive = false;
  /** When the guard came up (it protects after TIMING.guardUp). */
  guardSince = Infinity;
  /** Last parry attempt (core clock) and whether it was spent. */
  parryAt = -Infinity;
  parryUsed = true;
  action: Action | null = null;
  stun: { kind: StunKind; until: number } | null = null;
  motion: Motion | null = null;
  /** Walk to a mark while not fighting (the arena's entrances and exits); cleared on arrival or engage. */
  march: { x: number; z: number; speed: number; face?: number } | null = null;
  iframesUntil = -Infinity;
  dodges: number[] = [];
  /** At 0 stamina you cannot attack, sprint or dodge until 15 has regenerated (§6.6). */
  winded = false;
  /** Attacks landing on this combatant before this time are ripostes (opened by its stagger or a parry). */
  riposteUntil = -Infinity;
  status: CombatStatus = 'active';
  koUntil = Infinity;
  entangledUntil = -Infinity;
  blindUntil = -Infinity;
  lastChain = 0;
  lastLightEnd = -Infinity;
  /** NPC bleeding stacks: end times (2 HP/s each, ×3 max). */
  bleeds: number[] = [];
  brain: CombatBrain | null = null;
  /** Nereus' script, for the net. */
  script: NereusScript | null = null;
  /** Who this combatant fights. */
  target: Combatant | null = null;
  /** The player's lock-on target. */
  lockTarget: Combatant | null = null;
  /** The core moves this body (spawned enemies; NPCs while fighting). */
  driven = false;
  /** Keep driving when idle (spawned enemies); others are handed back to their module after a fight. */
  keepDriven = false;
  home = { x: 0, z: 0 };
  /** In a rixa: non-lethal by rule (§6.9). */
  brawl = false;
  /** Struck first without provocation (lawful guards answer calls against it). */
  aggressor = false;
  /** The player's aim assist: who the current attack is meant for (turned to and stepped toward). */
  assist: Combatant | null = null;
  /** Nereus still has his net. */
  hasNet = false;
  /** Pila stuck in the shield (block mitigation −50 %). */
  pila = 0;
  /** When it started to run (combat clock), or null. */
  fleeSince: number | null = null;
  /** Yield already granted once (the yield floor applies to the first crossing only). */
  yieldedOnce = false;
  /** Last time this combatant attacked (arena "no attack for 6 s"). */
  lastAttackAt = 0;
  /** Last time it was hit, and by whom. */
  lastHitAt = -Infinity;
  lastHitBy: string | null = null;
  /** When it knelt (combat clock), for the auto-release of a yield nobody decides. */
  yieldedAt = -Infinity;
  /** A named NPC (a definition in game.npcs): struck only on purpose, like an essential one. */
  named = false;
  /** The player is sneaking (set by the system): a deliberate sneak attack even on a non-hostile. */
  sneaking = false;
  /**
   * Tags echoed in 'actor:killed' (quest tags from the spawner, the archetype), followed there by
   * how the fight ended for it: 'dead', 'ko' or 'fled'.
   */
  tags: string[] = [];

  constructor(init: CombatantInit) {
    this.id = init.id;
    this.body = init.body;
    this.view = init.view ?? null;
    this.isPlayer = !!init.isPlayer;
    this.team = init.team;
    this.group = init.group ?? init.team;
    this.name = init.name;
    this.title = init.title;
    this.tierLabel = init.tierLabel;
    this.profile = init.profile;
    this.sheet = init.sheet;
    this.inventory = init.inventory;
    this.stats = init.stats;
    this.vitals = init.vitals;
    this.ownsVitals = init.ownsVitals;
    this.weaponItem = init.weaponItem;
    this.weapon = init.weapon;
    this.shieldItem = init.shieldItem;
    this.shield = init.shield;
    this.armor = init.armor;
    this.family = init.family;
    this.basePoise = init.poise;
    this.poise = createPoise(init.poise, { player: this.isPlayer });
    this.lawful = !!init.lawful;
    this.essential = !!init.essential;
    this.human = init.human ?? !init.profile?.beast;
    this.boss = init.boss;
    this.home.x = init.body.position.x;
    this.home.z = init.body.position.z;
  }

  get position() {
    return this.body.position;
  }

  get heading() {
    return this.body.heading;
  }

  /** Alive and taking part (not dead, knocked out, yielded or gone). */
  get active() {
    return this.status === 'active';
  }

  get dead() {
    return this.status === 'dead';
  }

  healthFrac() {
    return this.vitals.fraction('health');
  }

  /** In a stagger, guard break or knockdown at `now`. */
  stunned(now: number) {
    return !!this.stun && this.stun.kind !== 'flinch' && now < this.stun.until;
  }

  entangled(now: number) {
    return now < this.entangledUntil;
  }

  /** An attack (wind-up, strike or recovery) or a held charge is in progress. */
  attacking() {
    const k = this.action?.kind;
    return !!k && k !== 'dodge' && k !== 'draw' && k !== 'sheathe' && k !== 'kneel';
  }

  /** Is the combatant in the wind-up of an attack (before its hit)? */
  inWindup(now: number) {
    const a = this.action;
    if (!a) return false;
    if (a.kind === 'charge') return true;
    return a.hitAt !== undefined && !a.resolved && now < a.hitAt;
  }
}
