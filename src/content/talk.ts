/**
 * Helpers for dialogue content: quest-state queries in one call, the physician's treatment, the
 * player's sex for framing (§3.7), and the rumor mill that popina keepers, barbers and passers-by
 * draw on. Rumors point at the content that is open: a quest not yet started, a place not yet
 * visited, tomorrow's Column, the war.
 */
import type { DialogueContext } from '../dialogue/types';
import { isDusk, templesShut } from './director';

export function stage(c: DialogueContext, questId: string): string | undefined {
  const s = c.quest(questId);
  return s?.running ? s.stage : undefined;
}

export function running(c: DialogueContext, questId: string): boolean {
  return !!c.quest(questId)?.running;
}

export function completed(c: DialogueContext, questId: string): boolean {
  return !!c.quest(questId)?.completed;
}

export function notStarted(c: DialogueContext, questId: string): boolean {
  const s = c.quest(questId);
  return !s || (!s.running && !s.done);
}

/** The quest's final stage once it is finished (its outcome), else undefined. */
export function outcome(c: DialogueContext, questId: string): string | undefined {
  const s = c.quest(questId);
  return s?.done ? s.stage : undefined;
}

export function objectiveDone(c: DialogueContext, questId: string, objectiveId: string): boolean {
  return !!c.game.quests?.isObjectiveDone(questId, objectiveId);
}

export function questVar(c: DialogueContext, questId: string, name: string): number | string | boolean | undefined {
  return c.game.quests?.state(questId)?.vars[name];
}

export function female(c: DialogueContext): boolean {
  return c.game.standing?.sex === 'female';
}

export const dusk = (c: DialogueContext) => isDusk(c.game);
export const shut = (c: DialogueContext) => templesShut(c.game);

/** On a Lemuria night or its eve (9–13 May). Without a calendar: true (v0.1 holds 11 May). */
export function lemuriaWindow(c: DialogueContext): boolean {
  const d = c.game.time?.date?.();
  if (!d) return true;
  return d.month === 4 && d.day >= 8 && d.day <= 13;
}

/** A physician's treatment: health back to full and the arena injury healed. */
export function treat(c: DialogueContext) {
  const sheet = c.game.player?.sheet;
  if (!sheet) return;
  sheet.cure('injury');
  sheet.vitals.restore('health', sheet.vitals.get('health').max);
}

/** Cycle through lines on each visit (per NPC memory). */
export function rotate(c: DialogueContext, key: string, lines: readonly string[]): string {
  if (!lines.length) return '';
  const n = typeof c.memory[key] === 'number' ? (c.memory[key] as number) : 0;
  c.memory[key] = n + 1;
  return lines[n % lines.length];
}

/**
 * Rumors that fit the moment: hooks for content still open come first, then the city's talk.
 * Deterministic per NPC (rotates through the list on each ask).
 */
export function rumors(c: DialogueContext): string[] {
  const out: string[] = [];
  if (notStarted(c, 'misc-lemuria-fabae') && lemuriaWindow(c)) out.push('Old Gemellus in the Velabrum, the retired fuller? Every Lemuria his beans for the dead vanish before morning. He thinks his father’s ghost is angry with him. Poor old goat.');
  if (notStarted(c, 'misc-insula-nutans')) out.push('Rufina the weaver says the Fulvian block on the Vicus Tuscus is coming down. She says it every month. This month I believe her.');
  if (notStarted(c, 'misc-venus-cloacina')) out.push('Eros the money-changer swears he’s seen a man feeding the drain at the Cloacina shrine at dusk. Feeding it what? Ask him. He’ll tell you twice.');
  if (notStarted(c, 'misc-meta-sudans-rixa')) out.push('The parmularii and the scutarii are at it again by the Meta Sudans. Thracian-lovers against murmillo-lovers. It’ll come to fists by noon.');
  if (completed(c, 'mq-01-madida-capena') || running(c, 'mq-02-tabella')) out.push('A courier knifed at the Porta Capena before dawn, right in the road, they say. An imperial courier. The cohorts are pretending they didn’t notice.');
  if (completed(c, 'lud-01-sacramentum')) out.push('They say a guest put Nereus the retiarius on his knees at the Ludus today. At practice, with a wooden sword, but still!');
  out.push(
    'Tomorrow the emperor dedicates his Column. A hundred feet, with the whole Dacian war carved round it like a ribbon. They’re rededicating Venus Genetrix the same day.',
    'The doors of Janus are open. Parthia. The recruiters are in the Forum and mules have doubled in price.',
    'No heir, and he’s nearly sixty. Everyone’s betting. Hadrian, says one; Servianus, says another. Me, I’m betting on the war.',
    'The Pantheon is still a black shell behind the hoardings. Lightning, three years ago. Somebody should do something about that roof.',
    'The emperor walks among the people, they say: no lictors pushing, no “Lord and God” like the last one. My cousin saw him buy figs.',
  );
  return out;
}

export function rumor(c: DialogueContext): string {
  return rotate(c, '_rumor', rumors(c));
}
