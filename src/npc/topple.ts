/**
 * The physical topple gate: what happens when the player's body meets an NPC's.
 *
 * The blow is momentum, about 75 kg × the speed it arrives along the line between them. Against
 * it stands the NPC's resistance: their mass, their age, what they carry (a basket on the head
 * is a tall, wobbly load), whether they are braced for it (a guard, someone who sees it coming)
 * and which way they face. Below a fraction of the resistance the body is only jostled; above it
 * the NPC stumbles (the stagger clip); above all of it they fall (a ragdoll). Every contact is
 * resolved once, then that NPC is out of the gate for a couple of seconds.
 *
 * Walking into people shoulders them aside; a run makes them stumble; a full sprint rarely fells
 * an average adult who saw you coming, and often a slight, old or loaded one with their back turned.
 */
import type { Appearance, Build } from '../actors/appearance';
import type { PropKind } from './crowd/roles';

export type ContactOutcome = 'none' | 'stumble' | 'fall';

/** The player's mass (kg) behind a shove. */
export const PLAYER_MASS = 75;
/** Resistance per kg of body: a 70 kg adult stands against ~700 N·s. */
const RESIST_PER_KG = 10;
/** Share of the resistance that makes someone stumble. */
export const STUMBLE_AT = 0.4;
/** Seconds an NPC is out of the gate after a stumble or fall, and after a mere brush. */
export const TOPPLE_COOLDOWN = 2.5;
export const BRUSH_COOLDOWN = 0.5;
/** Strength of the dice: the resistance varies by this much either way (a stance, a lucky foot). */
export const TOPPLE_JITTER = 0.2;

const BUILD_KG: Record<Build, number> = { slight: 58, average: 70, stocky: 80, muscular: 88, heavy: 96 };
const AGE_FACTOR: Record<Appearance['age'], number> = { child: 0.55, young: 0.95, adult: 1, middle: 1, old: 0.72 };
/** A load that makes the carrier top-heavy (head, back) stands against less. */
const LOAD_FACTOR: Partial<Record<PropKind, number>> = { basket: 0.88, amphora: 0.9, sack: 0.94, tray: 0.88 };

export interface Resistor {
  build: Build;
  age: Appearance['age'];
  /** Height in metres (scales the body mass a little). */
  height?: number;
  load?: PropKind | null;
  /** Ready for it: a guard, a soldier, someone fighting or talking. */
  braced?: boolean;
  /** Goes down easily (the fragile). */
  frail?: boolean;
}

export interface Contact {
  /** The mover's speed along the line between the two (m/s). */
  approach: number;
  /** Mover's mass (kg). */
  mass?: number;
  /** Cosine between the NPC's facing and the direction to the mover: 1 sees it coming, -1 back turned. */
  facing: number;
}

/** Momentum of the blow (N·s). */
export function impulseOf(c: Contact): number {
  return Math.max(0, c.approach) * (c.mass ?? PLAYER_MASS);
}

/** What the NPC stands against (N·s), before the dice. */
export function resistanceOf(r: Resistor, facing: number): number {
  let kg = BUILD_KG[r.build] * (r.height ? Math.min(1.15, Math.max(0.85, r.height / 1.68)) : 1);
  kg *= AGE_FACTOR[r.age];
  if (r.load) kg *= LOAD_FACTOR[r.load] ?? 1;
  if (r.frail) kg *= 0.8;
  if (r.braced) kg *= 1.5;
  // Seeing it coming braces the legs; a shove from behind finds them unready.
  const f = 1 + 0.15 * Math.max(-1, Math.min(1, facing));
  return kg * RESIST_PER_KG * f;
}

/** Resolve one contact. `roll` is a uniform random number in [0, 1). */
export function resolveContact(c: Contact, r: Resistor, roll: number): ContactOutcome {
  const ratio = impulseOf(c) / (resistanceOf(r, c.facing) * (1 + TOPPLE_JITTER * (roll * 2 - 1)));
  if (ratio >= 1) return 'fall';
  if (ratio >= STUMBLE_AT) return 'stumble';
  return 'none';
}

/** Per-NPC cooldown so one contact is resolved once (not every physics step it lasts). */
export class ToppleGate {
  private readyAt = new Map<string, number>();

  /** Resolve a contact for `id` at time `now`; 'none' while it is cooling down. */
  resolve(id: string, now: number, c: Contact, r: Resistor, roll: number): ContactOutcome {
    if (now < (this.readyAt.get(id) ?? 0)) return 'none';
    const out = resolveContact(c, r, roll);
    this.readyAt.set(id, now + (out === 'none' ? BRUSH_COOLDOWN : TOPPLE_COOLDOWN));
    if (this.readyAt.size > 200) this.prune(now);
    return out;
  }

  /** Is `id` still in its cooldown? */
  cooling(id: string, now: number): boolean {
    return now < (this.readyAt.get(id) ?? 0);
  }

  forget(id: string) {
    this.readyAt.delete(id);
  }

  private prune(now: number) {
    for (const [k, t] of this.readyAt) if (t <= now) this.readyAt.delete(k);
  }
}
