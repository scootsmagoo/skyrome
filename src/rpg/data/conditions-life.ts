/**
 * Conditions phase 2 adds (docs/design/world-life.md §4.4, the SERVICES crew): `tonsus` (groomed,
 * +5 persuasion for a game day) and `calefactus` (warmed, +10% stamina regeneration for a game
 * hour). Empty until the crew fills it; conditions.ts merges it into CONDITIONS.
 */
import type { ConditionDef } from '../types';

export const LIFE_CONDITIONS: ConditionDef[] = [];
