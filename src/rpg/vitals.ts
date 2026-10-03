/**
 * Health / stamina / pietas pools with delayed regeneration. Used by the player (through the
 * CharacterSheet, which supplies modifier-aware regen rates) and directly by NPCs and enemies.
 */
import { REGEN } from './data/tuning';
import type { Resource, ResourceId, Vitals } from './types';

export const RESOURCE_IDS: readonly ResourceId[] = ['health', 'stamina', 'pietas'];

export interface VitalsOptions {
  health: number;
  stamina?: number;
  pietas?: number;
  /** Regen per second for a resource; default REGEN[id] (× the combat multiplier). */
  regenRate?: (id: ResourceId, v: VitalsImpl) => number;
  onDeath?: (source?: string) => void;
}

export class VitalsImpl implements Vitals {
  private readonly res: Record<ResourceId, Resource>;
  private readonly delay: Record<ResourceId, number> = { health: 0, stamina: 0, pietas: 0 };
  private _dead = false;
  /** Set by combat: slows regeneration (REGEN.combat; no health regen in combat). */
  inCombat = false;
  /** Set by combat while the shield is up: stamina regenerates at REGEN.blockingStamina. */
  blocking = false;
  /** Asked before a killing blow lands; return true to survive at 1 health (Mithras's Invictus). */
  preventDeath?: () => boolean;
  /** Who dealt the last damage (for kill credit). */
  lastDamageSource?: string;
  regenRate: (id: ResourceId, v: VitalsImpl) => number;
  onDeath?: (source?: string) => void;

  constructor(opts: VitalsOptions) {
    const mk = (max: number) => ({ current: max, max });
    this.res = { health: mk(opts.health), stamina: mk(opts.stamina ?? 100), pietas: mk(opts.pietas ?? 0) };
    this.regenRate = opts.regenRate ?? defaultRegen;
    this.onDeath = opts.onDeath;
  }

  get health(): Readonly<Resource> {
    return this.res.health;
  }
  get stamina(): Readonly<Resource> {
    return this.res.stamina;
  }
  get pietas(): Readonly<Resource> {
    return this.res.pietas;
  }
  get dead() {
    return this._dead;
  }

  get(id: ResourceId): Readonly<Resource> {
    return this.res[id];
  }

  /** current / max, 0..1. */
  fraction(id: ResourceId): number {
    const r = this.res[id];
    return r.max > 0 ? r.current / r.max : 0;
  }

  damage(amount: number, source?: string): number {
    if (this._dead || !(amount > 0)) return 0;
    const r = this.res.health;
    const dealt = Math.min(r.current, amount);
    r.current -= dealt;
    if (source) this.lastDamageSource = source;
    if (r.current <= 1e-6) {
      if (this.preventDeath?.()) {
        r.current = Math.min(1, r.max);
        return dealt - r.current;
      }
      r.current = 0;
      this._dead = true;
      this.onDeath?.(source);
    }
    return dealt;
  }

  restore(id: ResourceId, amount: number) {
    if (!(amount > 0) || (this._dead && id === 'health')) return;
    const r = this.res[id];
    r.current = Math.min(r.max, r.current + amount);
  }

  spend(id: ResourceId, amount: number): boolean {
    if (!(amount > 0)) return true;
    const r = this.res[id];
    if (r.current + 1e-9 < amount) return false;
    r.current = Math.max(0, r.current - amount);
    this.delayRegen(id, REGEN.delay[id]);
    return true;
  }

  drain(id: ResourceId, amount: number): number {
    if (!(amount > 0)) return 0;
    if (id === 'health') return this.damage(amount);
    const r = this.res[id];
    const spent = Math.min(r.current, amount);
    r.current -= spent;
    this.delayRegen(id, REGEN.delay[id]);
    return spent;
  }

  delayRegen(id: ResourceId, seconds: number) {
    this.delay[id] = Math.max(this.delay[id], seconds);
  }

  /** Changes the maximum; raising it also raises the current value by the same amount (fortify). */
  setMax(id: ResourceId, max: number) {
    const r = this.res[id];
    max = Math.max(id === 'health' ? 1 : 0, max);
    const delta = max - r.max;
    r.max = max;
    if (delta > 0 && !(this._dead && id === 'health')) r.current += delta;
    r.current = Math.min(r.current, r.max);
  }

  /** Set the current value directly (loading, scripted events). */
  set(id: ResourceId, current: number) {
    const r = this.res[id];
    r.current = Math.max(0, Math.min(r.max, current));
  }

  tick(dt: number) {
    if (this._dead || !(dt > 0)) return;
    for (const id of RESOURCE_IDS) {
      if (this.delay[id] > 0) {
        this.delay[id] = Math.max(0, this.delay[id] - dt);
        continue;
      }
      const r = this.res[id];
      const blockMul = id === 'stamina' && this.blocking ? REGEN.blockingStamina : 1;
      if (r.current < r.max) r.current = Math.min(r.max, r.current + Math.max(0, this.regenRate(id, this)) * blockMul * dt);
    }
  }

  revive() {
    this._dead = false;
    for (const id of RESOURCE_IDS) {
      this.res[id].current = this.res[id].max;
      this.delay[id] = 0;
    }
  }

  serialize() {
    return { health: this.res.health.current, stamina: this.res.stamina.current, pietas: this.res.pietas.current, dead: this._dead };
  }

  restoreState(s: { health?: number; stamina?: number; pietas?: number; dead?: boolean } | undefined) {
    if (!s) return;
    for (const id of RESOURCE_IDS) if (typeof s[id] === 'number' && Number.isFinite(s[id])) this.set(id, s[id]!);
    this._dead = !!s.dead;
  }
}

/** Absolute regeneration per second (GDD §3.3): health 0.5 out of combat, stamina 20, pietas none. */
function defaultRegen(id: ResourceId, v: VitalsImpl): number {
  return REGEN[id] * (v.inCombat ? REGEN.combat[id] : 1);
}
