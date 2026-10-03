/**
 * What happens when an NPC yields and the player chooses (docs/GDD.md §6.9). The combat side
 * decides when a foe yields (HP ≤ yieldAt) and calls resolveYield with the player's choice.
 *
 *   spare   Pietas +5, Fama +2 in the district (spared foes may return as informants)
 *   rob     take the purse; furtum if witnessed
 *   arrest  needs a mandate: Vigiles rank ≥ sebaciarius (at night), Urban Cohorts rank ≥ miles,
 *           or a bounty contract; pays the bounty
 *   kill    Pietas −15 always; caedes-supplicis if witnessed
 */
import type { CrimeSystem } from './crime';
import type { Devotion } from './devotion';
import type { FactionSystem } from './factions';
import type { InventoryImpl } from './inventory';
import type { Standing } from './standing';

export type YieldChoice = 'spare' | 'rob' | 'arrest' | 'kill';

export interface YieldDeps {
  devotion?: Devotion;
  standing?: Standing;
  inventory?: InventoryImpl;
  crime?: CrimeSystem;
  factions?: FactionSystem;
  /** Night by the game clock (the Vigiles' mandate). */
  night?: () => boolean;
}

export interface YieldContext {
  npcId: string;
  /** District for the Fama change. */
  district?: string;
  /** Witnessed? true/false or witness ids. */
  witnessed?: boolean | readonly string[];
  /** The yielded NPC's purse (rob). */
  purse?: number;
  /** A bounty on the NPC (arrest pays it). */
  bounty?: number;
  /** The player holds a bounty contract for this NPC. */
  contract?: boolean;
}

const FAMA_SPARE = 2;

/** Whether the player may arrest a yielded NPC now (§6.9 mandate). */
export function canArrest(d: YieldDeps, ctx: Pick<YieldContext, 'contract'> = {}): boolean {
  if (ctx.contract) return true;
  const f = d.factions;
  if (!f) return false;
  const vig = f.isMember('vigiles') ? f.rankIndex('vigiles') : -1;
  if (vig >= 1 && (d.night?.() ?? true)) return true; // sebaciarius is the second rank
  return f.isMember('cohortes-urbanae') && f.rankIndex('cohortes-urbanae') >= 0;
}

/** Apply the consequences of a yield choice. Returns false if the choice isn't possible (arrest without a mandate). */
export function resolveYield(d: YieldDeps, choice: YieldChoice, ctx: YieldContext): boolean {
  const witnessed = ctx.witnessed ?? false;
  switch (choice) {
    case 'spare':
      d.devotion?.sparedYielded();
      if (ctx.district) d.standing?.addFame(ctx.district, FAMA_SPARE);
      return true;
    case 'rob': {
      const purse = Math.max(0, ctx.purse ?? 0);
      if (purse > 0) d.inventory?.addDenarii(purse);
      d.crime?.commit('furtum', { witnessed, value: purse, victimId: ctx.npcId, district: ctx.district });
      return true;
    }
    case 'arrest':
      if (!canArrest(d, ctx)) return false;
      if ((ctx.bounty ?? 0) > 0) d.inventory?.addDenarii(ctx.bounty!);
      return true;
    case 'kill':
      d.devotion?.impiety('killYielded');
      d.crime?.commit('caedes-supplicis', { witnessed, victimId: ctx.npcId, district: ctx.district });
      return true;
  }
}
