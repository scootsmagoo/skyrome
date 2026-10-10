/**
 * Conditions phase 2 adds (docs/design/world-life.md §4.4, the SERVICES crew): `tonsus` (groomed,
 * +5 persuasion for a game day) and `calefactus` (warmed, +10% stamina regeneration for a game
 * hour). conditions.ts merges this list into CONDITIONS.
 *
 * Durations are real seconds at timeScale 20, as in conditions.ts (1 game hour = 180 s).
 */
import type { ConditionDef } from '../types';
import { DEVOTION } from './tuning';

const DAY = DEVOTION.blessingSeconds;
const HOUR = DAY / 24;

export const LIFE_CONDITIONS: ConditionDef[] = [
  {
    id: 'tonsus',
    kind: 'state',
    name: 'Groomed',
    latin: 'tonsus',
    description: 'Fresh from the barber: hair cut, chin smooth. +5 persuasion for a game day.',
    // The `tonsus` flag is the +5 persuasion (checks.ts persuasionPoints reads it).
    effects: [
      { kind: 'flag', target: 'tonsus', amount: 1, duration: DAY },
    ],
  },
  {
    id: 'calefactus',
    kind: 'state',
    name: 'Warmed',
    latin: 'calefactus',
    description: 'A hot cup inside you: +10% stamina regeneration for a game hour.',
    effects: [{ kind: 'modifier', target: 'stamina.regen', amount: 0.1, duration: HOUR }],
  },
];
