/**
 * Events emitted by the RPG rules (in addition to the quest-facing ones declared in
 * src/quests/types.ts: item:added/removed, player:levelup, skill:levelup, crime:committed…).
 */
import type { EquipSlot } from './types';

export type NotifyKind = 'quest' | 'item' | 'skill' | 'level' | 'crime' | 'faction' | 'effect' | 'location' | 'save' | 'info' | 'warning';

declare module '../core/Events' {
  interface GameEvents {
    /** A short HUD toast ("Quest started: …", "Blades increased to 23"). The UI decides how to show it. */
    'rpg:notify': { text: string; kind?: NotifyKind };
    'perk:taken': { perkId: string };
    /** A character level is waiting for the player to choose health/stamina/pietas. */
    'player:levelChoice': { level: number; pending: number };
    'effect:added': { source: string };
    'effect:expired': { source: string };
    'item:equipped': { itemId: string; slot: EquipSlot };
    'item:unequipped': { itemId: string; slot: EquipSlot };
    'item:used': { itemId: string };
    'book:read': { itemId: string; first: boolean; skill?: string };
    'denarii:changed': { amount: number; delta: number };
    'faction:joined': { factionId: string };
    'faction:left': { factionId: string };
    'faction:rank': { factionId: string; rankId: string; title: string };
    'faction:reputation': { factionId: string; amount: number; delta: number };
    'crime:bounty': { jurisdiction: string; bounty: number };
    'crime:cleared': { jurisdiction: string; how: 'paid' | 'jail' | 'bribe' | 'persuade' | 'pardon' | 'lapsed' | 'ludus' | 'fine' };
    'crime:jailed': { jurisdiction: string; days: number };
    'crime:resist': { jurisdiction: string };
    /** A severe sentence instead of jail: condemnation to the gladiator school (the arena line picks this up). */
    'crime:sentenced': { jurisdiction: string; sentence: 'ludus' };
    'barter:trade': { npcId: string; itemId: string; count: number; price: number; kind: 'buy' | 'sell' };
    'devotion:patron': { deityId: string };
    'devotion:invoked': { deityId: string; invocation: string };
    'devotion:act': { act: string; god?: string };
    'standing:changed': { dignitas: string; infamia: number; legal: string };
    /** Washed at the baths, cleaned at a fountain, or dirtied by blood, sewers or rain (§14.8). */
    'standing:cleanliness': { cleanliness: 'lautus' | 'normal' | 'sordidus' };
  }
}

export {};
