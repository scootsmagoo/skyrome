/** Item builders shared by the catalogue files (docs/GDD.md §8). */
import type { ArmorFamily, ArmorStats, DamageType, Effect, ItemDef, WeaponStats } from '../../types';

/** One as in denarii (1 den. = 16 asses). */
export const AS = 1 / 16;

export type Visual = NonNullable<ItemDef['visual']>;

export function weapon(id: string, name: string, latin: string, w: WeaponStats, weight: number, value: number, model: Visual['weapon'], description: string, extra: Partial<ItemDef> = {}): ItemDef {
  const thrown = w.class === 'thrown';
  return { id, name, latin, type: 'weapon', slot: 'mainHand', weapon: w, weight, value, description, visual: { weapon: model }, stackable: thrown, icon: '⚔', ...extra };
}
export const ws = (cls: WeaponStats['class'], skill: string, damage: number, damageType: DamageType, speed: number, reach: number, stagger: number, extra: Partial<WeaponStats> = {}): WeaponStats => ({ class: cls, skill, damage, damageType, speed, reach, stagger, ...extra });

export function armor(id: string, name: string, latin: string, slot: ItemDef['slot'], a: ArmorStats, weight: number, value: number, look: Visual, description: string, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, latin, type: a.weightClass === 'clothing' ? 'clothing' : 'armor', slot, armor: a, weight, value, description, visual: look, icon: a.weightClass === 'clothing' ? '👕' : '🛡', ...extra };
}
export const heavy = (rating: number, family?: ArmorFamily): ArmorStats => ({ rating, weightClass: 'heavy', family });
export const light = (rating: number, family?: ArmorFamily): ArmorStats => ({ rating, weightClass: 'light', family });
export const cloth = (rating = 0): ArmorStats => ({ rating, weightClass: 'clothing', family: 'cloth' });

export function food(id: string, name: string, latin: string, weight: number, value: number, effects: Effect[], description: string, tags: string[] = ['food']): ItemDef {
  return { id, name, latin, type: 'consumable', weight, value, effects, description, stackable: true, icon: tags.includes('drink') ? '🍷' : '🍞', tags };
}
export function remedy(id: string, name: string, latin: string, weight: number, value: number, effects: Effect[], description: string, tags: string[] = []): ItemDef {
  return { id, name, latin, type: 'consumable', weight, value, effects, description, stackable: true, icon: '⚱', tags: ['medicine', ...tags] };
}
/** Restore `hp` over `seconds` (GDD food heals over time). */
export const hot = (hp: number, seconds: number): Effect => ({ kind: 'regen', target: 'health', amount: hp / seconds, duration: seconds });
export const stam = (amount: number): Effect => ({ kind: 'restore', target: 'stamina', amount });
export const cond = (id: string): Effect => ({ kind: 'condition', target: id, amount: 1 });

export function book(id: string, name: string, latin: string, value: number, teaches: string | undefined, description: string, text: string, tags: string[] = []): ItemDef {
  return { id, name, latin, type: 'book', weight: 0.4, value, text, teaches, description, icon: '📜', stackable: true, tags: ['book', ...tags] };
}
export function misc(id: string, name: string, latin: string, weight: number, value: number, description: string, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, latin, type: 'misc', weight, value, description, stackable: true, icon: '◆', ...extra };
}
