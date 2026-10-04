/**
 * mq-02-tabella "The Sealed Tablet" (docs/CONTENT.md §3.1.2; GDD §10.3 #2, §17.2 steps 3 and 5).
 * Main quest, v0.1 Must: deliver the dead courier's tablet to Gratus under the Temple of Castor.
 * It is the v0.1 form of mq-02-carcer, which continues from `deliver` into the arrest in v0.2.
 *
 *   start    go to the Temple of Castor (the cella is shut for the Lemuria, AC-18)   → loculi
 *   loculi   ask Chrysippus, keeper of the strongrooms, for Gratus                     → gratus
 *   gratus   Gratus wants the man with the curved blade: Auctus at the Ludus knows     → mus
 *   mus      come back after sunset (T waits); optionally face Mus in the burned taberna → deliver
 *   deliver  give Gratus the tablet; "Tomorrow, the Column."                           → done-v01
 *
 * The hooks, all node ids and flags: npc-philetus 'strongrooms' / 'n2' (the doors are shut),
 * npc-chrysippus 'fetch', the flag 'clue-mus' (npc-auctus 'mus', npc-glaucus 'd1', the citizens'
 * gossip), npc-mus 'surrender' / 'dialogue:attack', npc-gratus 'delivered'. Gratus stays at the vaults
 * from the first hour to the second watch (the bible sends him back to camp at the fourth hour), so
 * "ask for Gratus" works whenever the player gets there.
 */
import { fight, hint, isDusk, spawnEnemy } from '../../content/director';
import { MUS_PROFILE } from '../../content/profiles';
import { addFoe, beatFoe } from '../../content/questkit';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'mq-02-tabella';
const VAULTS = ['castor-loculi', 'castor-strongroom'];
const MUS = ['npc-mus', 'npc-mus~foe'];
const KNIFEMEN = ['mq02-knife-a', 'mq02-knife-b'] as const;

function arrived(q: QuestContext) {
  q.completeObjective('castor');
}

function atVaultsAtDusk(q: QuestContext): boolean {
  return isDusk(q.game) && VAULTS.some((id) => !!q.game.locations?.isInside?.(id));
}

function musFate(q: QuestContext, fate: 'killed' | 'spared' | 'fled') {
  q.setFlag('mus-fate', fate);
  q.completeObjective('hideout');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Sealed Tablet',
  latin: 'Tabella Signata',
  category: 'main',
  giver: 'npc-festus',
  summary: 'Deliver the dead courier’s sealed tablet to Gratus in the strongrooms under the Temple of Castor.',
  stages: {
    start: {
      journal: 'Festus’ last words sent me to the strongrooms under the Temple of Castor and Pollux, in the Forum, to a man called Gratus.',
      objectives: [{ id: 'castor', text: 'Go to the Temple of Castor and Pollux', target: { kind: 'location', id: 'temple-castor-pollux' } }],
      onEnter: (q) => {
        if (q.game.locations?.isInside?.('temple-castor-pollux')) arrived(q);
      },
      next: 'loculi',
    },
    loculi: {
      journal: 'The temple itself was shut for the Lemuria, the night of the restless dead, but the strongrooms in its podium open onto the street. Their keeper, Chrysippus, guards the door like a dog guards a bone.',
      objectives: [{ id: 'chrysippus', text: 'Ask the keeper of the strongrooms for Gratus', target: { kind: 'npc', id: 'npc-chrysippus' } }],
      next: 'gratus',
    },
    gratus: {
      journal: 'Gratus is a centurion of the frumentarii, the imperial couriers. He would not take the tablet. A dispatch like this, he said, is never carried across the Forum in daylight; I should keep it in my belt until dusk. Meanwhile he wanted to know who carries a curved blade and fights like a gladiator.',
      objectives: [
        { id: 'ludus', text: 'Go to the Ludus Magnus', optional: true, target: { kind: 'location', id: 'ludus-magnus' } },
        { id: 'ask', text: 'Find out who fights with a curved blade', target: { kind: 'npc', id: 'npc-auctus' } },
      ],
      onEnter: (q) => {
        if (q.flag('clue-mus')) q.completeObjective('ask');
      },
      next: 'mus',
    },
    mus: {
      journal: 'Auctus knew the stroke at once: “Up from under, like a thraex finishing a man on his knees.” He named Dizas, called the Mouse, a thraex thrown out of the Ludus for theft. He runs knife-men out of a burned taberna off the Vicus Tuscus. Gratus said to come back at dusk.',
      objectives: [
        { id: 'dusk', text: 'Return to the strongrooms of Castor after sunset', target: { kind: 'location', id: 'castor-loculi' } },
        { id: 'hideout', text: 'Deal with Mus in the burned taberna', optional: true, target: { kind: 'location', id: 'taberna-collapsa' } },
        { id: 'satchel', text: 'Recover Festus’ satchel', optional: true, target: { kind: 'item', id: 'quest-sacculum-festi' } },
      ],
      onEnter: (q) => {
        if (q.flag('mus-fate')) q.completeObjective('hideout');
        if (q.game.player?.inventory?.count('quest-sacculum-festi')) q.completeObjective('satchel');
        if (atVaultsAtDusk(q)) q.completeObjective('dusk');
        else if (!isDusk(q.game)) hint(q.game, 'Press T to wait until the lamps are lit. The sun sets a little after 19:00.');
      },
      next: 'deliver',
    },
    deliver: {
      journal: 'Gratus was waiting by lamplight among the strongboxes.',
      objectives: [{ id: 'give', text: 'Give the tablet to Gratus', target: { kind: 'npc', id: 'npc-gratus' } }],
      next: 'done-v01',
    },
    'done-v01': {
      journal: 'Gratus broke the seal and swore softly. The tablet was written in Festus’ private cipher. “His brother would have the key,” he said, “and tomorrow is the Column.” I walked out into an empty Forum. Somewhere in the Velabrum a man was beating a bronze pot to drive the ghosts away. Tomorrow, the Column.',
      onEnter: (q) => {
        q.setFlag('mq02-delivered', true);
        if (q.flag('mus-fate') === 'spared') q.setFlag('mus-informant', true);
      },
      end: 'complete',
    },
  },
  triggers: {
    'quest:completed': (q, e) => {
      if (e.questId === 'mq-01-madida-capena') q.start();
    },
  },
  on: {
    'location:entered': (q, e) => {
      if ((e.locationId === 'temple-castor-pollux' || e.locationId === 'castor-loculi') && q.stage === 'start') arrived(q);
      if ((e.locationId === 'ludus-magnus' || e.locationId === 'ludus-gate') && q.stage === 'gratus') q.completeObjective('ludus');
      if (VAULTS.includes(e.locationId) && q.stage === 'mus' && atVaultsAtDusk(q)) q.completeObjective('dusk');
    },
    'time:hour': (q) => {
      if (q.stage === 'mus' && atVaultsAtDusk(q)) q.completeObjective('dusk');
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-philetus' && (e.nodeId === 'strongrooms' || e.nodeId === 'n2') && q.stage === 'start') {
        arrived(q);
      }
      if (e.dialogueId === 'npc-chrysippus' && e.nodeId === 'fetch') q.completeObjective('chrysippus');
      if (e.dialogueId === 'npc-auctus' && e.nodeId === 'mus') q.completeObjective('ask');
      if (e.dialogueId === 'npc-gratus' && e.nodeId === 'delivered') q.completeObjective('give');
      if (e.dialogueId === 'npc-mus' && e.nodeId === 'surrender') {
        q.setFlag('mus-fate', 'fled');
        q.completeObjective('hideout');
      }
    },
    'flag:changed': (q, e) => {
      if (e.name === 'clue-mus' && e.value === true && q.stage === 'gratus') q.completeObjective('ask');
    },
    // The fight in the burned taberna: Mus and two knife-men (the dungeon's room 2 and room 3 in one).
    'dialogue:attack': (q, e) => {
      if (e.npcId !== 'npc-mus' || (q.stage !== 'mus' && q.stage !== 'deliver') || q.flag('mus-fate')) return;
      addFoe(q, 'musfoes', fight(q.game, 'npc-mus', 'grassator', 'taberna-collapsa', { quest: QUEST_ID, tags: [QUEST_ID, 'mus'], name: 'Mus · the Mouse', yieldAt: 0.2, profile: MUS_PROFILE }));
      KNIFEMEN.forEach((id, i) => addFoe(q, 'musfoes', spawnEnemy(q.game, 'grassator', 'taberna-collapsa', { id, name: 'Knife-man', tags: [QUEST_ID, 'mus'], quest: QUEST_ID }, { x: i ? 3 : -3, z: 2 })));
    },
    'actor:killed': (q, e) => {
      if (MUS.includes(e.victimId) && q.stage !== 'done-v01') musFate(q, 'killed');
      beatFoe(q, 'musfoes', e.victimId, KNIFEMEN);
    },
    'actor:yielded': (q, e) => {
      // Mus yields at 20% (GDD §6.9: spare, rob or kill is the combat module's prompt; sparing is the default).
      if (MUS.includes(e.actorId) && q.stage !== 'done-v01') musFate(q, 'spared');
    },
    'item:added': (q, e) => {
      if (e.itemId === 'quest-sacculum-festi') q.completeObjective('satchel');
    },
  },
  rewards: { skills: [{ id: 'rhetoric', amount: 10 }] },
});

