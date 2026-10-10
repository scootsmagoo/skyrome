/**
 * The daily practice bout at the Ludus Magnus (job-ludus-lusio, docs/design/world-life.md §4.7):
 * who the guest faces today. The quest (src/quests/content/job-ludus-lusio.ts) and Asiaticus' lines
 * (src/dialogue/content/ludus.ts) both ask here, so the name he calls is the man who walks out.
 *
 * Two of the regulars are lud-01's own (Pullus the tiro, Auctus the thraex, with their stat blocks
 * and looks); two are school gladiators of other armaturae, armed by the combat module's archetype
 * tables. Nereus is not among them: a champion doesn't spar with guests for a few denarii.
 */
import { AUCTUS_PROFILE, PULLUS_PROFILE } from '../../content/profiles';
import type { CombatProfile } from '../../rpg/types';
import { hash32 } from '../rumours';

export interface Regular {
  /** The fighter's id (a named NPC's own id: the resident steps out while he fights). */
  id: string;
  /** combat archetype (src/combat/archetypes.ts, src/rpg/data/combatants.ts). */
  archetype: string;
  name: string;
  /** How Asiaticus announces him. */
  call: string;
  profile?: CombatProfile;
}

export const REGULARS: readonly Regular[] = [
  { id: 'npc-pullus', archetype: 'murmillo', name: 'Pullus', call: 'Pullus, the boy from Capua, who has learned to keep his shield up since you last met', profile: PULLUS_PROFILE },
  { id: 'npc-auctus', archetype: 'thraex', name: 'Auctus', call: 'Auctus the thraex, eighteen wins, who fights low and hooks round your shield', profile: AUCTUS_PROFILE },
  { id: 'lusio-ursio', archetype: 'hoplomachus', name: 'Ursio', call: 'Ursio the hoplomachus, spear first and dagger after, so stay out of his reach or inside it' },
  { id: 'lusio-callinicus', archetype: 'secutor', name: 'Callinicus', call: 'Callinicus the secutor, a smooth helmet and a heavy shield, who follows you like a debt' },
];

/** Today's opponent (the same all day, through a save). */
export function lusioFoe(day: number): Regular {
  return REGULARS[hash32(`lusio|${day}`) % REGULARS.length];
}

/** The base of the practice purse (denarii): arenaPurse(5, favor) pays 5–10 for a win. */
export const LUSIO_PURSE = 5;
/** A draw (both sent away standing) is paid a token. */
export const LUSIO_DRAW = 3;
