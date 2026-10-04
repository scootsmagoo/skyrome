/**
 * misc-lemuria-fabae "Black Beans" (docs/CONTENT.md §3.3.2; GDD §11.1, §14.10; v0.1 Should). Misc
 * quest, investigation, festival: the Lemuria of 9, 11 and 13 May (the night of 11 May in v0.1).
 *
 * Florus the cooper throws black beans to the ghosts of his fathers, nine handfuls over the shoulder,
 * and every year by cockcrow they are gone. The player keeps watch on the stair after the midnight
 * rite and sees who gathers them: Thallusa, his old slave, whose freed daughter's children are
 * starving. Then she is followed to the lean-to at the crossroads shrine of the Velabrum, and the
 * player decides what Florus is told (a lie, the truth, or a persuasion that feeds the family).
 *
 *   start   keep watch in Florus' stairwell after the midnight rite (T waits)  → watch
 *   watch   see who comes down the stair (Thallusa, from 00:30); follow her to the compitum → choice
 *   choice  decide what to tell Florus (dialogue)                              → done
 *   done    the nine beans on the stair
 *
 * Stealth ships later (v0.2): in v0.1 the tail is a matter of time and place, not of being seen. The
 * bible's "unexplained detail" is the last line of the journal: nine beans on the stair, though she
 * swept every one into her apron.
 */
import { hint } from '../../content/director';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-lemuria-fabae';

const hour = (q: QuestContext) => q.game.time?.hour ?? 12;
const inside = (q: QuestContext, id: string) => !!q.game.locations?.isInside?.(id);
/** After the midnight rite and before the fourth watch ends. */
const afterRite = (q: QuestContext) => hour(q) >= 0 && hour(q) < 2.45;
/** The fourth watch: Thallusa has gone to the compitum with the beans. */
const fourthWatch = (q: QuestContext) => hour(q) >= 2.45 && hour(q) < 5;

function tryWatch(q: QuestContext) {
  if (q.stage === 'start' && inside(q, 'insula-tuccii') && afterRite(q)) q.completeObjective('watch');
}

function trySee(q: QuestContext) {
  if (q.stage === 'watch' && inside(q, 'insula-tuccii') && hour(q) >= 0.5 && hour(q) < 3) q.completeObjective('see');
}

function tryFollow(q: QuestContext) {
  if (q.stage === 'watch' && q.isObjectiveDone('see') && inside(q, 'compitum-velabri') && fourthWatch(q)) q.completeObjective('follow');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Black Beans',
  latin: 'Fabae Nigrae',
  category: 'misc',
  giver: 'npc-florus',
  summary: 'Every Lemuria the beans Florus throws for the dead are gone by cockcrow. He wants to know how hungry the ghosts are.',
  stages: {
    start: {
      journal: 'Florus the cooper throws black beans to the ghosts of his fathers every Lemuria, and every year by cockcrow they are gone. His wife says the dead are hungry. Florus wants to know how hungry.',
      objectives: [{ id: 'watch', text: 'Keep watch in Florus’ stairwell after the midnight rite', target: { kind: 'location', id: 'insula-tuccii' } }],
      onEnter: (q) => {
        tryWatch(q);
        if (!afterRite(q)) hint(q.game, 'Press T to wait until after midnight, the third watch.');
      },
      next: 'watch',
    },
    watch: {
      journal: 'After the rite, when the house was dark again, someone came down the stairs on bare feet and began to pick up the beans, one by one.',
      objectives: [
        { id: 'see', text: 'See who gathers the beans', target: { kind: 'location', id: 'insula-tuccii' } },
        { id: 'follow', text: 'Follow her without being seen', target: { kind: 'location', id: 'compitum-velabri' } },
      ],
      onEnter: (q) => {
        trySee(q);
        tryFollow(q);
      },
      next: 'choice',
    },
    choice: {
      journal: 'The ghosts’ beans were feeding Thallusa’s grandchildren. Her daughter was freed years ago; freedom, it turned out, did not include supper.',
      objectives: [{ id: 'decide', text: 'Decide what to tell Florus', target: { kind: 'npc', id: 'npc-thallusa' } }],
      next: 'done',
    },
    done: {
      journal: 'When I went back up Florus’ stair, there was one black bean on every step, nine of them, although I had watched Thallusa sweep every last one into her apron.',
      onEnter: (q) => q.giveReward({ skills: [{ id: 'stealth', amount: 15 }, ...(q.flag('florus-feeds-family') ? [{ id: 'rhetoric', amount: 10 }] : [])] }),
      end: 'complete',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-fabae' && e.nodeId === 'accept') q.start();
    },
  },
  on: {
    'location:entered': (q) => {
      tryWatch(q);
      trySee(q);
      tryFollow(q);
    },
    'time:hour': (q) => {
      tryWatch(q);
      trySee(q);
      tryFollow(q);
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId !== 'npc-fabae' || q.stage !== 'choice') return;
      if (['florusLie', 'florusPersuaded', 'florusTold'].includes(e.nodeId)) q.completeObjective('decide');
    },
  },
});
