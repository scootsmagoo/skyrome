/**
 * The Ludus bouts as one-step test fixtures: `?fight=nereus` in the URL and the console's
 * `fight nereus` skip lud-01 "The Oath" up to that bout and start it.
 */
import type { Game } from '../core/Game';

/** The three bouts of lud-01 in order (bout 1 = Pullus … bout 3 = Nereus, the boss). */
export const FIGHTS = ['pullus', 'auctus', 'nereus'];

/**
 * Skip the Ludus questline to bout `n` (1–3) and start it, as if the player had signed on, drawn
 * the Ludus rudis and scutum and told Asiaticus to begin. The skipped stages ask for an autosave:
 * let it finish (no saving in combat) and give the player a moment to look round the arena first.
 */
export async function startBout(game: Game, n: number): Promise<boolean> {
  const quest = 'lud-01-sacramentum';
  // setStage starts the quest when it hasn't begun; a finished one can't be replayed.
  if (!game.quests.setStage(quest, 'kit') && game.quests.state(quest)?.status !== 'running') return false;
  game.events.emit('dialogue:node', { npcId: 'npc-successus', dialogueId: 'npc-successus', nodeId: 'issueScutum' });
  game.quests.setStage(quest, `bout${n}`);
  await new Promise((r) => setTimeout(r, 1500));
  await game.rpg?.save.idle().catch(() => {});
  game.events.emit('dialogue:node', { npcId: 'npc-asiaticus', dialogueId: 'npc-asiaticus', nodeId: `begin${n}` });
  return true;
}
