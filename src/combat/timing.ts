/**
 * Combat timings — docs/GDD.md §6.1 (verbs), §6.4 (parry), §6.5 (hit-stop, telegraphs), §6.15
 * (clip phases), §4.2/§4.3 (input rules) and §13.2 (Nereus). Seconds at weapon speed 1.0; attack
 * phases divide by the weapon's `speed`. Damage numbers live in src/rpg (combat-math, tuning).
 */
import { clamp } from '../core/math';

export const TIMING = {
  /** Light attack: wind-up 0.25, active 0.12, recovery 0.30 (§6.1). */
  light: { windup: 0.25, active: 0.12, recovery: 0.3 },
  /** A light press during an attack is remembered this long (§6.1 input buffer; generous, so mashing F chains). */
  buffer: 0.4,
  /** The chain continues if the next light attack starts within this long after the last one ended. */
  chainGap: 0.45,
  /** The player's own light, sprint and riposte swings are quicker than the table (× wind-up, × recovery). */
  playerQuick: { windup: 0.8, recovery: 0.85 },
  /** The player's swings reach this much further and sweep this much wider than an NPC's (forgiving aim). */
  playerReach: { extra: 0.2, arc: 1.2, maxArcDeg: 160 },
  /** Power attack: hold ≥ 0.35 s (adjustable 0.2–0.6), auto-release at 1.0 s, then 0.15 to the hit and 0.45 recovery. */
  power: { hold: 0.35, autoRelease: 1.0, release: 0.15, recovery: 0.45 },
  /** Shield bash 0.12 + 0.08 + 0.15 = 0.35 s (§6.15). */
  bash: { windup: 0.12, active: 0.08, recovery: 0.15 },
  /** Riposte 0.15 + 0.10 + 0.35 (§6.15). */
  riposte: { windup: 0.15, active: 0.1, recovery: 0.35 },
  /** Sprint attack 0.25 + 0.12 + 0.40 (§6.15). */
  sprint: { windup: 0.25, active: 0.12, recovery: 0.4 },
  /** Dodge: 2.5 m over 0.3 s, i-frames 0.12 s, recovery 0.2 s; the third dodge within 1 s costs double. */
  dodge: { move: 0.3, recovery: 0.2, distance: 2.5, iframes: 0.12, window: 1 },
  draw: 0.5,
  sheathe: 0.5,
  /** The guard takes 0.06 s to come up (a parry needs only the press). */
  guardUp: 0.06,
  /** Toggle-block rule (§4.2): a press shorter than this is a parry attempt only. */
  togglePress: 0.18,
  /** NPC wind-ups are stretched to these telegraph minimums (§6.5, Normal; the bash [design]). */
  npcMinWindup: { light: 0.35, power: 0.7, bash: 0.3 },
  /** A feint cancels its wind-up at 40 % (§6.13). */
  feintCancel: 0.4,
  /** Nereus' net (§6.8, §13.2): 0.8 s twirl, cast, 0.5 s recovery; 14 m/s, 6 m; entangles 3 s (bosses 1.5 s); −0.4 s per struggle press. */
  net: { windup: 0.8, release: 0.2, recovery: 0.5, speed: 14, range: 6, entangle: 3, entangleBoss: 1.5, perPress: 0.4, interval: 12, followUpWindup: 0.8 },
  /**
   * Arrows (mq-04): the draw is the profile's `shoot.drawS` (held in the bowDraw pose), then the
   * release and a recovery. Flight: the bow's projectileSpeed (arcus 55 m/s, 40 without one),
   * gravity, a body capsule of 0.35 m; a miss flies on for 2 s or until it strikes the world, where
   * it sticks for 4 s. A guard facing the arrow (±70°) stops it; the shooter leads a moving target
   * by this share of its flight. `drawS` is the draw when the profile gives none.
   */
  arrow: { release: 0.06, recovery: 0.45, speed: 40, gravity: 9.8, radius: 0.35, ttl: 2, stick: 4, blockArc: 70, lead: 0.5, drawS: 0.9 },
  /** Nereus' sand kick (phase 2): blinds for 1 s. */
  sandKick: { windup: 0.45, active: 0.1, recovery: 0.5, blind: 1, range: 2.6, interval: 9 },
  /** Hold Y for 1 s to yield; hold X 0.5 s to release a lock. */
  yieldHold: 1,
  lockReleaseHold: 0.5,
  /** Hold E to salute or take the crowd's gifts (arena), hold F on a knocked-out body to kill. */
  holdInteract: 0.6,
  holdKill: 1,
  /** Lock-on: acquire within 15 m and ±35° of the screen centre; break at 20 m or 2 s without sight (§6.1). */
  lock: { acquire: 15, cone: 35, breakDistance: 25, sightLost: 4, autoSuggest: 8 },
  /**
   * Hit-stop (§6.5, made heavier so blows land): the world almost stops for light 0.07, power
   * 0.11, parry/riposte/finisher 0.15 s.
   */
  hitStop: { light: 0.07, power: 0.11, heavy: 0.15, scale: 0.03 },
  /**
   * The camera's share of a blow: "trauma" 0..1 added per blow and fading at `decay`/s; the shake
   * is trauma² × `shake` m and × `roll` rad. Striking nods the view into the blow and punches the
   * field of view in (`fovPunch`° for a power blow); being struck snaps it away from the attacker.
   */
  feel: {
    trauma: { light: 0.3, power: 0.55, heavy: 0.75 },
    decay: 1.8,
    shake: 0.13,
    roll: 0.035,
    nod: { light: 0.018, power: 0.035, heavy: 0.03 },
    recoil: 0.06,
    fovPunch: 4,
    /** A killing blow: slow motion at this scale, easing back to normal over this long. */
    kill: { scale: 0.25, seconds: 0.55 },
  },
  /** A knockout lasts 60 game minutes = 3 real minutes (§6.9). */
  knockout: 180,
  /** The player comes to sooner [design]: the screen goes dark for this long (robbed in the street). */
  playerKnockout: 6,
  /** inCombat: a hostile aware of the player within 40 m at any moment in the last 8 s (§6). */
  inCombat: { radius: 40, memory: 8 },
  /** Code displacement (no root motion, §6.15), metres over the clip's active part. */
  steps: { light: 0.3, power: 0.5, lunge: 1.5, back: -1.5, riposte: 0.6, bash: 0.4, staggerShort: -0.5, staggerLong: -1, blockImpact: -0.2, knockdown: -1, knockLight: -0.3, knockPower: -0.8 },
  /** Stagger after a guard break (§6.4). */
  guardBreak: 1.2,
  /** Knocked down for 2 s (§6.5). */
  knockdownTime: 2,
};

export type AttackKind = 'light' | 'power' | 'bash' | 'riposte' | 'sprint' | 'feint' | 'net' | 'sandKick';

export interface Phases {
  /** Seconds from the start to the hit frame. */
  windup: number;
  active: number;
  recovery: number;
}

/**
 * Phases of an attack by kind and weapon speed (§6.1, §6.15). NPC wind-ups are stretched to the
 * §6.5 telegraph minimums; `minWindup` stretches further (Nereus' follow-up poke ≥ 0.8 s).
 * A player's power attack winds up while the key is held, so `windup` here is only the release.
 */
export function attackPhases(kind: AttackKind, weaponSpeed = 1, opts: { npc?: boolean; minWindup?: number } = {}): Phases {
  const s = Math.max(0.1, weaponSpeed);
  const T = TIMING;
  let p: Phases;
  switch (kind) {
    case 'power':
      p = opts.npc ? { windup: T.npcMinWindup.power, active: 0.12 / s, recovery: T.power.recovery / s } : { windup: T.power.release / s, active: 0.12 / s, recovery: T.power.recovery / s };
      break;
    case 'bash':
      p = { windup: T.bash.windup, active: T.bash.active, recovery: T.bash.recovery };
      break;
    case 'riposte':
      p = { windup: T.riposte.windup / s, active: T.riposte.active / s, recovery: T.riposte.recovery / s };
      break;
    case 'sprint':
      p = { windup: T.sprint.windup / s, active: T.sprint.active / s, recovery: T.sprint.recovery / s };
      break;
    case 'net':
      p = { windup: T.net.windup, active: T.net.release, recovery: T.net.recovery };
      break;
    case 'sandKick':
      p = { windup: T.sandKick.windup, active: T.sandKick.active, recovery: T.sandKick.recovery };
      break;
    case 'feint':
    case 'light':
    default:
      p = { windup: T.light.windup / s, active: T.light.active / s, recovery: T.light.recovery / s };
  }
  if (!opts.npc && (kind === 'light' || kind === 'sprint' || kind === 'riposte')) {
    p.windup *= T.playerQuick.windup;
    p.recovery *= T.playerQuick.recovery;
  }
  if (opts.npc) {
    if (kind === 'light' || kind === 'feint' || kind === 'sprint' || kind === 'riposte') p.windup = Math.max(p.windup, T.npcMinWindup.light);
    if (kind === 'power') p.windup = Math.max(p.windup, T.npcMinWindup.power);
  }
  if (opts.minWindup) p.windup = Math.max(p.windup, opts.minWindup);
  return p;
}

/** Total length of an attack. */
export function attackLength(p: Phases): number {
  return p.windup + p.active + p.recovery;
}

/**
 * Playback speed that lands an avatar clip's hit frame (`clipHit`, seconds at speed 1) on the
 * combat timeline's hit time. `fromT` is where the clip starts (a held power wind-up).
 */
export function clipSpeedFor(clipHit: number | undefined, windup: number, fromT = 0): number {
  if (clipHit === undefined || windup <= 0) return 1;
  return clamp((clipHit - fromT) / windup, 0.25, 4);
}

/** Power-attack charge seconds (from the hold start) → the avatar's 0..1 charge pose. */
export function chargeFraction(heldSeconds: number): number {
  return clamp(heldSeconds / TIMING.power.autoRelease, 0, 1);
}
