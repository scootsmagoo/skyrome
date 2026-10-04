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
export function treatWounds(game: DialogueContext['game']) {
  const sheet = game.player?.sheet;
  if (!sheet) return;
  sheet.cure('injury');
  sheet.vitals.restore('health', sheet.vitals.get('health').max);
}

export function treat(c: DialogueContext) {
  treatWounds(c.game);
}

/** Cycle through lines on each visit (per NPC memory). */
export function rotate(c: DialogueContext, key: string, lines: readonly string[]): string {
  if (!lines.length) return '';
  const n = typeof c.memory[key] === 'number' ? (c.memory[key] as number) : 0;
  c.memory[key] = n + 1;
  return lines[n % lines.length];
}

/** The player's origin id (civis-suburanus, hispanus, veteranus, dacus…), or '' without a character. */
export function origin(c: DialogueContext): string {
  return c.game.standing?.origin ?? '';
}

/** The hour of day (0..24). */
export function hourNow(c: DialogueContext): number {
  return c.game.time?.hour ?? 12;
}

/**
 * Rumors that fit the moment (docs/CONTENT.md §8.1, "Rumours"): hooks for content still open come
 * first, then the city's talk and the news of the day. Deterministic per NPC (rotates through the
 * list on each ask).
 */
export function rumors(c: DialogueContext): string[] {
  const out: string[] = [];
  if (notStarted(c, 'misc-lemuria-fabae') && lemuriaWindow(c)) out.push('Florus the cooper, in the Velabrum: every Lemuria he throws his beans for the dead and by cockcrow they’re gone. Hungry ghosts, he says. I say hungry neighbours.');
  if (notStarted(c, 'misc-insula-nutans')) out.push('The insula by the Vicus Tuscus where the widow Prima lives? The wall is cracked from cellar to roof. The landlord’s man props it with oak and tells everyone to sleep easy. I sleep in the Subura.');
  if (notStarted(c, 'misc-venus-cloacina')) out.push('Ianuarius, the drain man, says somebody has been lifting the grate at the little shrine of Venus Cloacina in the Forum. Ianuarius says it every month. This month he’s oiled the bolt.');
  if (notStarted(c, 'misc-meta-sudans-rixa') && completed(c, 'lud-01-sacramentum')) out.push('Bassulus the butcher and Anicetus the tanner are shouting about shields by the Meta Sudans again. Big shield or small. It’ll come to fists before supper.');
  if (stage(c, 'mq-02-tabella') === 'start' || completed(c, 'mq-01-madida-capena')) out.push('A courier knifed under the Capena arch before dawn. A soldier’s courier, they say. The urban cohorts are pretending they didn’t notice, which means somebody’s paid them.');
  if (completed(c, 'lud-01-sacramentum')) out.push('They say a guest put Nereus on his knees at the Ludus today. With a wooden sword! Nereus! Thirty-one wins!');
  out.push(
    'Tomorrow the emperor dedicates his Column. A hundred feet, with the whole Dacian war carved round it like a ribbon. They say the Forum will be shut to carts from the fourth hour.',
    'The doors of Janus are open. Parthia. The recruiters are in the Forum and mule prices have doubled.',
    'They say Hadrian is still in Athens, playing the Greek.',
    'They say Tacitus is coming back from Asia to write us all into his book.',
    'No letters from Pliny in Bithynia since the winter. That’s not like Pliny.',
    'Lusius Quietus’ Moorish horsemen are camped on the Campus, they say, eating raw horse.',
    'There’ll be games for the Column. Eighteen days, a hundred pairs. Or eight days and ten pairs. Someone’s lying.',
    'The emperor walked through the Forum yesterday on his own feet, like a citizen. My cousin touched his cloak.',
    'No heir, and he’s nearly sixty. Everyone’s betting. Hadrian, says one; Servianus, says another. Me, I’m betting on the war.',
    'The Pantheon is still a black shell behind hoardings. Lightning, years ago. Somebody should do something about that roof.',
  );
  return out;
}

export function rumor(c: DialogueContext): string {
  return rotate(c, '_rumor', rumors(c));
}
