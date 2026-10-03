/**
 * misc-lemuria-fabae "Black Beans" (GDD §11.1, v0.1 Should). Misc quest, Lemuria nights (9, 11,
 * 13 May; in v0.1 the clamp holds the night of 11 May).
 *
 * Old Gemellus keeps the Lemuria as his fathers did (Ovid, Fasti 5.429–444): at midnight, barefoot,
 * he throws black beans behind him nine times without looking back, to redeem himself and his house
 * from the shades. Every year the beans are gone by morning. Angry ghosts, he thinks. The player
 * watches at midnight and follows the "ghost": the household slave Chloe, who gathers the beans for
 * old Pomponia, a widow sleeping under the back stairs. The Ambiguity Contract (§2.4) keeps one
 * thing unexplained: Pomponia says the beans are brought by "a kind old man with a crooked thumb
 * who smells of fuller's earth" — Gemellus' father, a fuller, dead twenty years, whom she never met.
 *
 *   start (watch at midnight) → ghost (follow the figure) → truth (Chloe; Pomponia) →
 *   exposed | appeased | charity
 */
import { beat, hint, isLemuriaMidnight } from '../../content/director';
import { giveItem, takeItem } from '../../content/questkit';
import type { ItemDef } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-lemuria-fabae';

export const items: ItemDef[] = [
  {
    id: 'fabae-nigrae',
    name: 'Black Beans',
    latin: 'fabae nigrae',
    type: 'misc',
    weight: 0.2,
    value: 1 / 16,
    stackable: true,
    icon: '•',
    tags: ['offering', 'lemuria'],
    description: 'A twist of cloth with a handful of black beans, for the midnight rite of the Lemuria.',
  },
];

function watched(q: QuestContext) {
  if (q.stage === 'start' && isLemuriaMidnight(q.game)) q.completeObjective('watch');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Black Beans',
  latin: 'Fabae Nigrae',
  category: 'misc',
  giver: 'npc-fabius-gemellus',
  summary: 'On the ghost nights of the Lemuria, an old man’s beans for the dead vanish before morning.',
  stages: {
    start: {
      journal: 'Lucius Fabius Gemellus, an old fuller in the Velabrum, keeps the Lemuria as his fathers did: at midnight, barefoot, he throws black beans behind him for the shades of his house. Every year the beans are gone before dawn, every one. He thinks the dead are hungry and angry with him. He asked me to keep watch in his courtyard at midnight.',
      objectives: [{ id: 'watch', text: 'Keep watch in the courtyard of the Insula of the Fabii at midnight', target: { kind: 'location', id: 'insula-fabaria-atrium' } }],
      onEnter: (q) => {
        hint(q.game, 'Press T to wait until midnight.');
        if (q.game.locations?.isInside?.('insula-fabaria')) watched(q);
      },
      next: 'ghost',
    },
    ghost: {
      journal: 'At midnight the old man came out barefoot, made the sign with his thumb, threw the beans over his shoulder nine times without looking back and banged a bronze pan. When he had gone in, a small pale figure came down the back stairs and gathered the beans, one by one, in the dark.',
      objectives: [{ id: 'follow', text: 'Follow the figure to the back stairs', target: { kind: 'location', id: 'insula-fabaria-scalae' } }],
      onEnter: (q) => {
        // The player kept the rite beside him (§14.6: taking part in a festival rite, +25 Pietas).
        const beans = q.game.player?.inventory?.count('fabae-nigrae') ?? 0;
        if (beans > 0) {
          takeItem(q, 'fabae-nigrae', Math.min(9, beans));
          q.game.devotion?.festivalRite('fest-lemuria');
          q.notify('You throw the black beans behind you, nine times, and do not look back.');
        }
        beat(q.game, QUEST_ID, 'lemuria-figure', { actors: ['npc-chloe'], at: 'insula-fabaria-scalae' });
        if (q.game.locations?.isInside?.('insula-fabaria-scalae')) q.completeObjective('follow');
      },
      next: 'truth',
    },
    truth: {
      journal: 'The ghost was Chloe, Gemellus’ slave girl. Under the back stairs sleeps Pomponia, a widow with nothing, and Chloe gives her the beans. The old woman thinks the dead bring them.',
      objectives: [
        { id: 'chloe', text: 'Speak with Chloe', target: { kind: 'npc', id: 'npc-chloe' } },
        { id: 'pomponia', text: 'Speak with Pomponia', optional: true, target: { kind: 'npc', id: 'npc-pomponia' } },
        { id: 'decide', text: 'Decide what to tell Gemellus', target: { kind: 'npc', id: 'npc-fabius-gemellus' } },
      ],
    },
    exposed: {
      journal: 'I told Gemellus the truth about his beans and his slave girl. He was not angry at the shades any more. He was angry at Chloe. He paid me, and I did not ask what happened in the house afterwards. Pomponia went hungry.',
      onEnter: (q) => q.giveReward({ denarii: 10 }),
      end: 'complete',
    },
    appeased: {
      journal: 'I told Gemellus the shades had taken their due and his rite was answered. He wept with relief. Chloe is safe, Pomponia eats, and an old man sleeps soundly. It was a lie, but a pious one, I think.',
      onEnter: (q) => q.giveReward({ denarii: 4, skillXp: ['rhetoric'] }),
      end: 'complete',
    },
    charity: {
      journal: 'I told Gemellus who ate his beans, and why. He was quiet for a long time. Then he said that a house which feeds the hungry for the sake of its dead has nothing to fear from them, and sent Chloe down with bread and a blanket. Pomponia will sleep by his hearth. The beans with the crooked thumb I cannot explain, and I have stopped trying.',
      onEnter: (q) => {
        q.giveReward({ denarii: 6, skillXp: ['rhetoric'] });
        q.game.devotion?.gainPietas(10);
        q.game.standing?.addFame('dist-velabrum-boarium', 5);
        giveItem(q, 'carmen-lemuriae');
        q.setFlag('lemuria.charity', true);
      },
      end: 'complete',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-fabius-gemellus' && e.nodeId === 'accept') q.start();
    },
  },
  on: {
    'time:hour': (q) => {
      if (q.game.locations?.isInside?.('insula-fabaria')) watched(q);
    },
    'location:entered': (q, e) => {
      if (e.locationId === 'insula-fabaria' || e.locationId === 'insula-fabaria-atrium') watched(q);
      if (e.locationId === 'insula-fabaria-scalae' && q.stage === 'ghost') q.completeObjective('follow');
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-chloe' && e.nodeId === 'confess') {
        if (q.stage === 'ghost') q.completeObjective('follow');
        q.completeObjective('chloe');
      }
      if (e.dialogueId === 'npc-pomponia' && e.nodeId === 'thumb') q.completeObjective('pomponia');
      if (e.dialogueId !== 'npc-fabius-gemellus' || q.stage !== 'truth') return;
      if (e.nodeId === 'exposed' || e.nodeId === 'appeased' || e.nodeId === 'charity') {
        q.completeObjective('decide');
        q.setStage(e.nodeId);
      }
    },
  },
});
