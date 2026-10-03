/**
 * NPC definitions (content) and named locations. Files in src/npc/content/*.ts default-export
 * NpcDef[]; locations come from the atlas (landmark ids) plus content-defined spots.
 */
import type { Appearance } from '../actors/appearance';
import type { IdleLoop } from '../actors/Actor';
import type { CombatProfile } from '../rpg/types';

export interface ScheduleEntry {
  /** Hour of day this entry starts (0..24). The entry lasts until the next entry's start. */
  from: number;
  /** Location id (landmark id or spot id). */
  at: string;
  activity: IdleLoop | 'wander' | 'patrol' | 'travel';
  /** Patrol route (location ids) for activity 'patrol'. */
  route?: string[];
}

export type Service = 'vendor' | 'trainer' | 'fence' | 'healer' | 'smith' | 'innkeeper' | 'barber' | 'scribe' | 'banker' | 'priest' | 'lanista';

export interface NpcDef {
  id: string;
  name: string;
  /** Short role shown under the name ("Baker", "Vigil of the 4th Cohort"). */
  title?: string;
  appearance: Appearance;
  faction?: string;
  rank?: string;
  /** Cannot be killed (knocked down instead). */
  essential?: boolean;
  /** Spawn at this location if no schedule. */
  home?: string;
  schedule?: ScheduleEntry[];
  dialogue?: string;
  /** Lines spoken in passing. */
  barks?: string[];
  services?: Service[];
  vendor?: { stock: { id: string; count: number }[]; denarii: number; buys?: string[] /* item types */ };
  trainer?: { skill: string; maxLevel: number };
  combat?: CombatProfile;
  /** 'hostile' attacks on sight; 'neutral' defends; 'friendly' never attacks the player unless crimes. */
  disposition?: 'hostile' | 'neutral' | 'friendly';
  tags?: string[];
}

export interface LocationDef {
  id: string;
  name: string;
  latin?: string;
  /** Game-space position (meters). */
  position: { x: number; y?: number; z: number };
  /** Radius for 'location:entered' and discovery. */
  radius: number;
  /** Show on map / compass once discovered. */
  mapMarker?: 'temple' | 'forum' | 'baths' | 'arena' | 'market' | 'gate' | 'palace' | 'tavern' | 'shop' | 'dungeon' | 'landmark' | 'camp' | 'bridge' | 'house';
  /** Parent location (e.g. a spot inside a landmark). */
  parent?: string;
  discoverable?: boolean;
}
