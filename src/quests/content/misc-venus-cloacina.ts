/**
 * misc-venus-cloacina "What Venus Hides" (GDD §11.1, v0.1 Should). Misc quest in the Forum.
 *
 * Eros, a money-changer under the porticus of the Basilica Aemilia, has twice seen a thin man come
 * out of nowhere at dusk by the little round shrine of Venus Cloacina (the Purifier, over the
 * Cloaca Maxima), lean over the drain grate as if to pray, and drop something in. The player
 * watches after dusk; a sewer-runner, Mus, comes up through the drain and fights or runs; the
 * packet under the grate holds a lead token stamped REX and a Parthian drachm. Eros knows the coin.
 * The token is the hook into the Cloaca (dun-cloaca-maxima, the Rex Cloacae: v0.2).
 *
 *   start (watch after dusk) → runner (deal with Mus; search the grate) → packet (show Eros) → sold | kept | silo
 */
import { fight, isDusk, placeExamine, removeExamine, say } from '../../content/director';
import { addFoe, beatFoe, giveItem, takeItem } from '../../content/questkit';
import type { ItemDef } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-venus-cloacina';

export const items: ItemDef[] = [
  {
    id: 'tessera-regis',
    name: 'Lead Token Stamped REX',
    latin: 'tessera plumbea',
    type: 'misc',
    weight: 0.02,
    value: 0,
    icon: '◆',
    tags: ['token', 'quest-lead'],
    description: 'A lead token the size of a thumbnail, stamped with a crude crown and the letters REX. It smells of the drain.',
  },
  {
    id: 'drachma-parthica',
    name: 'Parthian Drachm',
    latin: 'drachma Parthica',
    type: 'misc',
    weight: 0.004,
    value: 4,
    stackable: true,
    icon: '◆',
    tags: ['valuable', 'foreign', 'quest-lead'],
    description: 'A thin silver coin: on one side a king with a long beard and a tall tiara, on the other an archer seated on a throne, and Greek letters around him. Not money anyone in Rome should be paid in.',
  },
];

const GRATE = { id: 'cloacina-grate', at: 'shrine-venus-cloacina', verb: 'Search', label: 'Drain grate', height: 0.4 };

function searchGrate(q: QuestContext) {
  if (q.stage !== 'runner' || q.isObjectiveDone('grate')) return;
  removeExamine('cloacina-grate');
  giveItem(q, 'tessera-regis');
  giveItem(q, 'drachma-parthica');
  q.completeObjective('grate');
}

function watched(q: QuestContext) {
  if (q.stage === 'start' && isDusk(q.game) && q.game.locations?.isInside?.('shrine-venus-cloacina')) q.completeObjective('watch');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'What Venus Hides',
  latin: 'Quod Cloacina Celat',
  category: 'misc',
  giver: 'npc-eros-nummularius',
  summary: 'Someone drops things into the drain under the shrine of Venus Cloacina at dusk.',
  stages: {
    start: {
      journal: 'Eros, a money-changer under the porticus of the Basilica Aemilia, says that twice now, at dusk, a thin young man has appeared by the little round shrine of Venus Cloacina, leaned over the drain grate as if to pray, and dropped something in. Eros wants to know what, and who. So, now, do I.',
      objectives: [{ id: 'watch', text: 'Watch the shrine of Venus Cloacina after dusk', target: { kind: 'location', id: 'shrine-venus-cloacina' } }],
      onEnter: watched,
      next: 'runner',
    },
    runner: {
      journal: 'He came up out of the drain itself, through the grate behind the shrine: a thin young man black to the knees and smelling of the Cloaca. He saw me and went for his knife.',
      objectives: [
        { id: 'mus', text: 'Deal with the sewer-runner', optional: true, target: { kind: 'location', id: 'shrine-venus-cloacina' } },
        { id: 'grate', text: 'Search under the drain grate', target: { kind: 'location', id: 'shrine-venus-cloacina' } },
      ],
      onEnter: (q) => {
        say(q.game, 'Mus', 'Not for you! The Rex will hear of this!');
        addFoe(q, 'foes', fight(q.game, 'npc-mus', 'cloacarius', 'shrine-venus-cloacina', { quest: QUEST_ID, tags: [QUEST_ID] }, { x: 2 }));
        // Without a world to search in (dev scenes), the player finds the packet at once.
        if (!placeExamine(q.game, GRATE)) searchGrate(q);
      },
      next: 'packet',
    },
    packet: {
      journal: 'On a ledge under the grate, above the black water, lay a packet in waxed cloth: a lead token stamped with a crown and the letters REX, and a silver coin I didn’t know, a king with a long beard and a tall hat. Eros will know the coin.',
      objectives: [{ id: 'eros', text: 'Show Eros what you found', target: { kind: 'npc', id: 'npc-eros-nummularius' } }],
    },
    sold: {
      journal: 'Eros weighed the coin, bit it, and paid me for it. “Parthian. An Arsacid drachm. With a war coming, nobody in Rome should be paid in this, and somebody under the Forum is.” He kept the coin. I kept the token. REX: the sewer-runners have a king.',
      onEnter: (q) => q.giveReward({ denarii: 8 }),
      end: 'complete',
    },
    kept: {
      journal: 'Eros told me what it was, a Parthian drachm of King Osroes, and told me to keep it out of sight. With a war coming, nobody in Rome should be paid in Parthian silver, and somebody under the Forum is. And the token says REX: the sewer-runners have a king.',
      onEnter: (q) => q.giveReward({ skillXp: ['mercatura'] }),
      end: 'complete',
    },
    silo: {
      journal: 'I took the coin and the token to Gavius Silo at the strongrooms. He turned the drachm over twice, and for the first time since I met him he looked worried. “Under the Forum,” he said. “Of course it is.” He paid me, and wrote something down.',
      onEnter: (q) => {
        q.giveReward({ denarii: 20 });
        q.setFlag('cloacina.silo', true);
      },
      end: 'complete',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-eros-nummularius' && e.nodeId === 'accept') q.start();
    },
  },
  on: {
    'time:hour': (q) => watched(q),
    'location:entered': (q, e) => {
      if (e.locationId === 'shrine-venus-cloacina') watched(q);
    },
    'content:interact': (q, e) => {
      if (e.id === 'cloacina-grate') searchGrate(q);
    },
    'save:loaded': (q) => {
      if (q.stage === 'runner' && !q.isObjectiveDone('grate')) placeExamine(q.game, GRATE);
    },
    'actor:killed': (q, e) => {
      if (beatFoe(q, 'foes', e.victimId, ['npc-mus'])) q.completeObjective('mus');
    },
    'actor:yielded': (q, e) => {
      if (beatFoe(q, 'foes', e.actorId, ['npc-mus'])) q.completeObjective('mus');
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-eros-nummularius' && q.stage === 'packet' && ['sold', 'kept'].includes(e.nodeId)) {
        if (e.nodeId === 'sold') takeItem(q, 'drachma-parthica');
        q.completeObjective('eros');
        q.setStage(e.nodeId);
      }
      if (e.dialogueId === 'npc-castor-contact' && e.nodeId === 'drachm' && q.stage === 'packet') {
        takeItem(q, 'drachma-parthica');
        q.completeObjective('eros');
        q.setStage('silo');
      }
    },
  },
});
