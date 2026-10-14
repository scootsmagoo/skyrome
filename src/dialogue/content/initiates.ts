/**
 * The two initiates who sit on the benches of the cave of Mithras at night (docs/STORY.md chapter 7, npc/content/aurum.ts:
 * Sabinus and Verecundus, soldiers). They have little to say to a stranger and send him to the Father (`npc-cassius-ursus`,
 * dialogue/content/aurum.ts): a short word each, no quest nodes (the feast's turn against Mardonius is the quest's).
 */
import { defineDialogue } from '../types';

const sabinus = defineDialogue({
  id: 'npc-initiate-1',
  npcs: ['npc-initiate-1'],
  priority: 90,
  start: () => 'i0',
  nodes: {
    i0: {
      text: '(A soldier in a plain tunic sits very straight on the bench, hands on his knees.) The Father keeps the cave. Ask him what you want to know. I only keep my place.',
      choices: [
        { text: 'What is this place?', goto: 'i1' },
        { text: 'Peace to you.', end: true },
      ],
    },
    i1: {
      text: 'The god’s cave. A soldier’s god: he caught the bull and killed it, and the world drank. That is all I say to a man the Father has not brought down himself.',
      end: true,
    },
  },
});

const verecundus = defineDialogue({
  id: 'npc-initiate-2',
  npcs: ['npc-initiate-2'],
  priority: 90,
  start: () => 'i0',
  nodes: {
    i0: {
      text: '(A young soldier looks up from the lamp he is trimming.) You came down the stair, so the Father let you. Sit, if you like. Eat. Don’t ask anyone his name.',
      choices: [
        { text: 'Why not?', goto: 'i1' },
        { text: 'Another time.', end: true },
      ],
    },
    i1: {
      text: 'Down here a man is a Raven, or a Lion, or a Father. The rest he left at the top of the stair. Most of us are glad to.',
      end: true,
    },
  },
});

export default [sabinus, verecundus];
