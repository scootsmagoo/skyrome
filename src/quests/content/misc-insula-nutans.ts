/**
 * misc-insula-nutans "The Leaning Insula" (GDD §11.1, v0.1 Should). Misc quest on the Vicus Tuscus.
 *
 * Juvenal 3.190–196: "we live in a city propped up on slender poles… the agent patches the gaping
 * crack and tells us to sleep soundly with ruin hanging over our heads." Rufina, a weaver on the
 * third floor of the Fulvian block, says the walls are cracking and the agent shrugs. The player
 * examines three places (the stairwell, the ground-floor shop, the party wall), then confronts the
 * agent, Saturninus: persuaded, frightened or paid, he shores the block up; if he refuses, the
 * player warns the tenants to get out, and after nightfall the back wall comes down on an empty
 * house.
 *
 *   start (examine 3) → agent → shored | warn → evacuated → fallen (after 21:00)
 */
import { beat, placeExamine, removeExamine } from '../../content/director';
import { giveItem } from '../../content/questkit';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-insula-nutans';

/** Examine points: interactable id → objective, place and prompt. */
const CRACKS = [
  { id: 'nutans-scalae', objective: 'stair', at: 'insula-nutans-scalae', label: 'Cracked stair treads' },
  { id: 'nutans-taberna', objective: 'shop', at: 'insula-nutans-taberna', label: 'Propped ceiling beam' },
  { id: 'nutans-paries', objective: 'wall', at: 'insula-nutans-paries', label: 'Fresh plaster on the party wall' },
] as const;

function placeCracks(q: QuestContext) {
  for (const c of CRACKS) if (!q.isObjectiveDone(c.objective)) placeExamine(q.game, { id: c.id, at: c.at, label: c.label });
}

function examined(q: QuestContext, objective: string) {
  if (q.stage !== 'start') return;
  const c = CRACKS.find((x) => x.objective === objective);
  if (c) removeExamine(c.id);
  q.completeObjective(objective);
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Leaning Insula',
  latin: 'Insula Nutans',
  category: 'misc',
  giver: 'npc-rufina',
  summary: 'A weaver on the Vicus Tuscus says her insula is cracking, and the landlord’s agent shrugs.',
  stages: {
    start: {
      journal: 'Rufina weaves on the third floor of the Fulvian block on the Vicus Tuscus. She says the walls have started to talk at night, creaking like a ship, and the cracks grow wider every week. The agent, Saturninus, plasters over them and tells the tenants to sleep soundly. She wants someone to look with fresh eyes before it falls on her loom, or on her.',
      objectives: [
        { id: 'stair', text: 'Examine the stairwell', target: { kind: 'location', id: 'insula-nutans-scalae' } },
        { id: 'shop', text: 'Examine the ground-floor shop', target: { kind: 'location', id: 'insula-nutans-taberna' } },
        { id: 'wall', text: 'Examine the party wall', target: { kind: 'location', id: 'insula-nutans-paries' } },
      ],
      onEnter: placeCracks,
      next: 'agent',
    },
    agent: {
      journal: 'The stair treads have pulled a finger’s width away from the wall. In the shop the main ceiling beam is split and propped on an old ship’s mast. The party wall bulges like a sail, and someone has plastered over its crack, recently, in a hurry. Saturninus keeps his table in the ground-floor shop.',
      objectives: [{ id: 'confront', text: 'Confront Saturninus, the owner’s agent', target: { kind: 'npc', id: 'npc-saturninus' } }],
    },
    warn: {
      journal: 'Saturninus laughed at me. “Every wall in Rome has cracks. It’s called character.” If he won’t shore the block up, the tenants have to get out before it comes down.',
      objectives: [{ id: 'warn', text: 'Warn Rufina to get the tenants out tonight', target: { kind: 'npc', id: 'npc-rufina' } }],
      next: 'evacuated',
    },
    evacuated: {
      journal: 'Rufina went door to door. By dusk the upper floors were empty: the tenants slept with cousins, in the porticoes and in the popina. Saturninus watched from his table and said they would all be back tomorrow, paying.',
      objectives: [{ id: 'night', text: 'Wait for nightfall', optional: true }],
    },
    fallen: {
      journal: 'In the second hour of the night the back wall of the Fulvian block came down into the alley with a noise like the end of the world. Nobody was inside. In the morning the vigiles were measuring the rubble and Saturninus was nowhere to be found.',
      onEnter: (q) => {
        beat(q.game, QUEST_ID, 'insula-collapse', { at: 'insula-nutans-paries' });
        q.giveReward({ denarii: 4, reputation: [{ faction: 'plebs', amount: 5 }] });
        giveItem(q, 'fascinum');
        q.game.standing?.addFame('dist-velabrum-boarium', 10);
        q.setFlag('nutans.fallen', true);
      },
      end: 'complete',
    },
    shored: {
      journal: 'Saturninus gave in. By the afternoon a builder’s gang was wedging props under the beam and shoring the party wall with timbers, and the third floor slept at a cousin’s for a few nights. Rufina says the walls have stopped talking. I don’t think the building has stopped thinking about it.',
      onEnter: (q) => {
        q.giveReward({ denarii: 6, skillXp: ['rhetoric'] });
        q.game.standing?.addFame('dist-velabrum-boarium', 5);
        q.setFlag('nutans.shored', true);
      },
      end: 'complete',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-rufina' && e.nodeId === 'accept') q.start();
    },
  },
  on: {
    'content:interact': (q, e) => {
      const c = CRACKS.find((x) => x.id === e.id);
      if (c) examined(q, c.objective);
    },
    'location:entered': (q, e) => {
      const c = CRACKS.find((x) => x.at === e.locationId);
      if (c) examined(q, c.objective);
    },
    'save:loaded': (q) => {
      if (q.stage === 'start') placeCracks(q);
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-saturninus' && q.stage === 'agent') {
        if (e.nodeId === 'agrees') {
          q.completeObjective('confront');
          q.setStage('shored');
        }
        if (e.nodeId === 'refuses') {
          q.completeObjective('confront');
          q.setStage('warn');
        }
      }
      if (e.dialogueId === 'npc-rufina' && e.nodeId === 'warned' && q.stage === 'warn') q.completeObjective('warn');
    },
    'time:hour': (q, e) => {
      if (q.stage === 'evacuated' && (e.hour >= 21 || e.hour < 4)) {
        q.completeObjective('night');
        q.setStage('fallen');
      }
    },
  },
});
