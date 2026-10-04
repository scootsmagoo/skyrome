/**
 * What the combat AI sees and what it asks for. The brain never touches the scene, physics or
 * avatars: the combat system fills a `Perception` each step and applies the returned `Intent`, so
 * tests drive brains with a fake world (tests/combat-ai.test.ts).
 */
import type { CombatProfile } from '../../rpg/types';

export type BrainState = 'idle' | 'approach' | 'engage' | 'circle' | 'retreat' | 'flee' | 'yield' | 'search' | 'down';

/** The §6.11 numbers the AI reads, plus behaviour switches derived from tier and archetype. */
export interface BrainProfile {
  tier: string;
  aggression: number;
  blockSkill: number;
  reactionS: number;
  speedMult: number;
  yieldAt: number;
  fleeAt: number;
  tokensCost: number;
  /** Overrides lerp(2.5, 0.9, aggression) (§6.13). */
  attackIntervalS?: number;
  /** Share of power attacks: 30 %, elites 40 % (§6.13). */
  powerChance: number;
  /** Tiers ≥ veteran feint (§6.13). */
  canFeint: boolean;
  /** Elites, champions and bosses can parry (chance blockSkill × 0.4). */
  canParry: boolean;
  /** Runs instead of kneeling (the grassator "flees at low HP"). */
  prefersFlee?: boolean;
  /** Beasts never yield or retreat to regain stamina. */
  beast?: boolean;
}

const FEINT_TIERS = new Set(['veteran', 'champion', 'elite', 'boss']);
const PARRY_TIERS = new Set(['champion', 'elite', 'boss']);

/** Derive the AI profile from a CombatProfile (§6.11 tier defaults are already in it). */
export function brainProfileFrom(p: CombatProfile, extra: Partial<BrainProfile> = {}): BrainProfile {
  return {
    tier: p.tier,
    aggression: p.aggression,
    blockSkill: p.blockSkill,
    reactionS: p.reactionS ?? 0.4,
    speedMult: p.speedMult ?? 1,
    yieldAt: p.beast ? 0 : (p.yieldAt ?? 0),
    fleeAt: p.fleeAt ?? 0,
    tokensCost: p.tokensCost ?? (p.tier === 'boss' ? 2 : 1),
    attackIntervalS: p.attackIntervalS,
    powerChance: p.tier === 'elite' ? 0.4 : 0.3,
    canFeint: FEINT_TIERS.has(p.tier),
    canParry: PARRY_TIERS.has(p.tier),
    beast: !!p.beast,
    ...extra,
  };
}

export interface SelfPerception {
  x: number;
  z: number;
  heading: number;
  /** Health and stamina as fractions 0..1. */
  health: number;
  stamina: number;
  /** In an attack, a stagger or any action that ignores new orders. */
  busy: boolean;
  /** Can start an attack now (not busy, not exhausted, weapon drawn). */
  canAct: boolean;
  /** Centre-to-centre distance at which this NPC's weapon reaches the target. */
  reach: number;
  /** Has a shield or weapon to guard with. */
  guardable: boolean;
  /** Carries a shield (fights from behind it: more patient for an opening). */
  shield?: boolean;
  /** Boss props (Nereus' net). */
  hasNet?: boolean;
  /** When it was last struck (combat clock), for the guard reaction to a blow. */
  lastHitAt?: number;
}

export interface TargetPerception {
  id: string;
  x: number;
  z: number;
  heading: number;
  /** In line of sight now. */
  visible: boolean;
  /** Centre-to-centre distance at which the target's weapon reaches this NPC. */
  reach: number;
  /** Winding up or striking. */
  attacking: boolean;
  /** Charging or winding up a power attack. */
  power: boolean;
  /** Seconds until the target's current attack lands (Infinity if none). */
  impactIn: number;
  /** The target faces this NPC (±60°). */
  facingMe: boolean;
  /** Caught in a net (Nereus follows up). */
  entangled?: boolean;
}

export interface Perception {
  now: number;
  self: SelfPerception;
  target: TargetPerception | null;
  /** Allies close by, for spacing in the circle. */
  allies: ReadonlyArray<{ x: number; z: number }>;
  night?: boolean;
}

/** Token access for this brain (the system binds holder id and target). */
export interface BrainServices {
  requestToken(cost: number): boolean;
  releaseToken(): void;
  holdsToken(): boolean;
  tokenOverdue(): boolean;
  rng(): number;
}

export interface Intent {
  /** Desired horizontal velocity (m/s, world). */
  move: { x: number; z: number };
  /** Heading to face, or null to keep. */
  face: number | null;
  guard: boolean;
  /** Try a timed parry now (elites, champions, bosses). */
  parry: boolean;
  /** 'bash': a shield fighter's umbo strike against a target who keeps swinging. */
  attack: 'light' | 'power' | 'feint' | 'bash' | null;
  /** Boss actions: 'net', 'sandKick'. */
  special: string | null;
  /** Stretch the next attack's wind-up to at least this (Nereus' telegraphed follow-up). */
  minWindup?: number;
  /** Call for help this step (combat start, 50 % health). */
  shout: boolean;
  /** Entered yield / flee this step. */
  yield: boolean;
  flee: boolean;
  /** Boss phase changed to this (1-based) this step. */
  phase?: number;
}

export function emptyIntent(): Intent {
  return { move: { x: 0, z: 0 }, face: null, guard: false, parry: false, attack: null, special: null, shout: false, yield: false, flee: false };
}
