/** Global saved flags shared by quests and dialogue ("met_trajan", "subura_fire_stage": 3…). */
import type { EventBus, GameEvents } from '../core/Events';

export type FlagValue = number | string | boolean;

declare module '../core/Events' {
  interface GameEvents {
    'flag:changed': { name: string; value: FlagValue | undefined };
  }
}

export class GlobalFlags {
  private map = new Map<string, FlagValue>();

  constructor(private readonly events?: EventBus<GameEvents>) {}

  get(name: string): FlagValue | undefined {
    return this.map.get(name);
  }

  has(name: string) {
    return this.map.has(name);
  }

  set(name: string, value: FlagValue) {
    if (this.map.get(name) === value) return;
    this.map.set(name, value);
    this.events?.emit('flag:changed', { name, value });
  }

  /** Add to a numeric flag (missing counts as 0). */
  add(name: string, amount = 1): number {
    const v = (typeof this.map.get(name) === 'number' ? (this.map.get(name) as number) : 0) + amount;
    this.set(name, v);
    return v;
  }

  delete(name: string) {
    if (this.map.delete(name)) this.events?.emit('flag:changed', { name, value: undefined });
  }

  clear() {
    this.map.clear();
  }

  entries(): [string, FlagValue][] {
    return [...this.map];
  }

  serialize(): Record<string, FlagValue> {
    return Object.fromEntries(this.map);
  }

  restore(data: unknown) {
    this.map.clear();
    if (!data || typeof data !== 'object') return;
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') this.map.set(k, v);
    }
  }
}
