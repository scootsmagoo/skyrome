/**
 * Effects (docs/design/world-life.md §3.2): what happens when an option is taken. This is the only
 * place they run. Each works through the game's own rules (rest.ts for baths and beds, devotion.ts
 * for omens, barter.ts for repairs, the sheet for conditions and skills), and fails quietly when a
 * service is missing. Effects that pass time ask for the screen to dim (`ctx.dims`), as Wait does.
 */
import { at, hoursUntil } from '../content/hours';
import type { Game } from '../core/Game';
import { skipTime } from '../rpg/clock';
import { REST, sleep } from '../rpg/rest';
import type { EquipSlot } from '../rpg/types';
import type { Effect } from './types';

export interface EffectCtx {
  /** Who it is done with or at: a keeper, a named NPC or an activity id. */
  owner: string;
  rng: { next(): number };
  /** One of today's rumours for the speaker to pass on (null: none today). */
  rumour(district?: string): string | null;
  /** Lines said after the result (a rumour, an omen, a repair bill). */
  lines: string[];
  /** Facts for the 'life:option' event (`stolen`: the cloak taken at the baths, `omen`). */
  detail: Record<string, string | number | boolean>;
  /** Time passed: dim the screen. */
  dims: boolean;
}

/** Why these effects can't run now (a `take` of something the player hasn't got), or null. */
export function missing(game: Game, effects: readonly Effect[]): string | null {
  const inv = game.player?.inventory;
  for (const e of effects) {
    if (e.kind !== 'take') continue;
    const n = e.count ?? 1;
    if ((inv?.count(e.item) ?? 0) < n) {
      const name = game.items?.get(e.item)?.name ?? e.item;
      return n > 1 ? `You need ${n} × ${name}.` : `You need ${aOrAn(name)}.`;
    }
  }
  return null;
}

const OMEN_LINES = {
  good: ['The signs are clean and full. Something stands at your shoulder today, or seems to.', 'Every lobe where it should be. Go about your business; the day is with you.'],
  bad: ['A blemish on the lobe. He looks at it a long time, and tells you only to be careful today.', 'The bird flew left, then would not fly at all. He wipes his hands and says nothing more than he must.'],
  amulet: ['A blemish on the lobe. Your hand finds the amulet at your throat, and he nods, as if that settled it.'],
  none: ['The signs say nothing either way. Nothing is also an answer.', 'Neither good nor bad. The gods, it seems, are busy elsewhere.'],
  done: ['The signs have been asked once today. Asking twice is how people end up in Livy.'],
};

/** Run effects in order. */
export function runEffects(game: Game, effects: readonly Effect[], ctx: EffectCtx) {
  for (const e of effects) {
    try {
      run(game, e, ctx);
    } catch (err) {
      console.error(`[life] effect ${e.kind} for ${ctx.owner} failed`, err);
    }
  }
}

function run(game: Game, e: Effect, ctx: EffectCtx) {
  const sheet = game.player?.sheet;
  const inv = game.player?.inventory;
  const deps = sheet ? { sheet, standing: game.standing, inventory: inv, time: game.time, events: game.events } : null;
  switch (e.kind) {
    case 'receive':
      inv?.addDenarii(e.denarii);
      break;
    case 'hours':
      skipTime(game.time, game.events, e.hours);
      ctx.dims = true;
      break;
    case 'bathe': {
      // rest.bathe()'s rules; the fee is the option's price, already paid.
      skipTime(game.time, game.events, REST.bath.hours);
      game.standing?.setCleanliness('lautus');
      if (e.massage && sheet) sheet.vitals.restore('stamina', sheet.vitals.stamina.max);
      if (!e.tip && inv && ctx.rng.next() < REST.bath.theftChance) {
        const cloak = inv.equipped('cloak');
        if (cloak && inv.remove(cloak, 1, { reason: 'quest' })) {
          ctx.detail.stolen = cloak;
          ctx.lines.push(`When you come out, your ${game.items?.get(cloak)?.name.toLowerCase() ?? 'cloak'} is gone from its peg.`);
        }
      }
      ctx.dims = true;
      break;
    }
    case 'clean':
      if (e.to === 'lautus') game.standing?.setCleanliness('lautus');
      else if (game.standing?.cleanliness === 'sordidus') game.standing.setCleanliness('normal');
      break;
    case 'sleep': {
      if (!deps) break;
      const hours = hoursUntil(at(e.until), game.time.hour) || 24;
      const r = sleep(deps, hours, e.bed);
      if (!r.ok) ctx.lines.push(r.reason === 'trespassing' ? 'You cannot sleep here.' : 'You cannot sleep with enemies about.');
      ctx.dims = r.ok;
      break;
    }
    case 'condition':
      sheet?.applyCondition(e.id);
      break;
    case 'restore':
      if (sheet) sheet.vitals.restore(e.target, e.amount === 'full' ? sheet.vitals[e.target].max : e.amount);
      break;
    case 'skillXp':
      sheet?.useSkill(e.skill, e.amount);
      break;
    case 'pietas':
      if (e.amount > 0) game.devotion?.gainPietas(e.amount);
      break;
    case 'fama':
      game.factions?.addReputation(e.faction, e.amount);
      break;
    case 'give':
      inv?.add(e.item, e.count ?? 1, { source: 'life' });
      break;
    case 'take':
      inv?.remove(e.item, e.count ?? 1, { reason: 'given' });
      break;
    case 'flag':
      game.quests?.flags.set(e.name, e.value ?? true);
      break;
    case 'rumour': {
      const r = ctx.rumour(e.district);
      if (r) ctx.lines.push(r);
      break;
    }
    case 'omen': {
      const dev = game.devotion;
      const roll = dev?.rollOmen(ctx.rng);
      let line: string;
      if (!roll) line = pick(OMEN_LINES.done, ctx.rng);
      else if (roll.omen === 'good') {
        dev!.acceptOmen();
        line = pick(OMEN_LINES.good, ctx.rng);
      } else if (roll.omen === 'bad') line = pick(sheet?.hasFlag('amulet') ? OMEN_LINES.amulet : OMEN_LINES.bad, ctx.rng);
      else line = pick(OMEN_LINES.none, ctx.rng);
      ctx.detail.omen = roll?.omen ?? 'done';
      ctx.lines.push(line);
      break;
    }
    case 'repair': {
      const barter = game.barter;
      if (!barter || !inv) break;
      let total = 0;
      let mended = 0;
      let poor = false;
      for (const { slot } of inv.worn()) {
        if (barter.repairPrice(slot as EquipSlot) === null) continue;
        const r = barter.repair(ctx.owner, slot as EquipSlot);
        if (r.ok) {
          total += r.price;
          mended++;
        } else if (r.reason === 'no-money') poor = true;
      }
      ctx.lines.push(mended ? `(${mended} piece${mended > 1 ? 's' : ''} mended for ${priceText(total)}.)` : poor ? '(You cannot pay for the mending.)' : '(Nothing you wear needs mending.)');
      ctx.detail.mended = mended;
      break;
    }
    case 'startQuest':
      // QuestSystem.start never takes the tracker from a running main quest.
      game.quests?.start(e.quest);
      break;
  }
}

function pick(lines: readonly string[], rng: { next(): number }): string {
  return lines[Math.min(lines.length - 1, Math.floor(rng.next() * lines.length))];
}

function aOrAn(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name.toLowerCase()}` : `a ${name.toLowerCase()}`;
}

/**
 * Roman money as a buyer hears it: "a quadrans", "2 asses", "1 as and a quadrans", "3 denarii".
 * Denarii and asses only (sestertii are for book-keeping).
 */
export function priceText(d: number): string {
  const q = Math.max(0, Math.round(d * 64));
  const den = Math.floor(q / 64);
  const as = Math.floor((q % 64) / 4);
  const quad = q % 4;
  const parts: string[] = [];
  if (den) parts.push(den === 1 ? '1 denarius' : `${den} denarii`);
  if (as) parts.push(as === 1 ? '1 as' : `${as} asses`);
  if (quad) parts.push(quad === 1 ? 'a quadrans' : `${quad} quadrantes`);
  if (!parts.length) return 'nothing';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
