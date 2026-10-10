/**
 * job-subura-pistor "The Bread Round" (docs/design/world-life.md §4.7): before dawn Fortunatus, the
 * baker of the Vicus Patricius, loads the player with three baskets of warm bread. The first is left
 * on the counter of the popina on the Argiletum, which opens at the third hour
 * (act.subura.popina-panis); the second goes to Vibia Chreste at the Silver Pig and the third to
 * Dama at the Inn at the Starting Gates (lines in their talk). All before the third hour: at h3 the
 * bread is cold and the job fails cleanly. 6 asses and a loaf; once a day, offered from the fourth
 * watch to the first hour, after the opening.
 */
import { defineJob } from '../../life/jobs/defineJob';
import { stationTarget } from '../../life/jobs/posts';
import type { ItemDef } from '../../rpg/types';
import { AS } from '../../rpg/money';

export const JOB_ID = 'job-subura-pistor';
export const BASKET = 'quest-corbis-panis';

export const items: ItemDef[] = [
  {
    id: BASKET,
    name: 'Basket of Bread',
    latin: 'corbis panis',
    type: 'quest',
    questItem: true,
    weight: 0,
    value: 0,
    icon: '◒',
    description: 'A wicker basket of round loaves scored into eight wedges, still warm from Fortunatus’ oven, under a cloth. Not yours to eat.',
    tags: ['job', 'carry:basket'],
  },
];

export default defineJob(
  {
    id: JOB_ID,
    title: 'The Bread Round',
    latin: 'Panis',
    summary: 'Carry the baker’s baskets of warm bread to a popina and two inns before the third hour.',
    giver: 'keeper-subura-furnarius',
    offer: { hours: [{ from: 'v4', to: 'h1' }] },
    daily: 1,
    pay: 6 * AS,
    rewards: { items: [{ id: 'panis', count: 1 }] },
    steps: [
      {
        id: 'popina',
        text: 'Leave a basket on the counter of the popina on the Argiletum',
        target: stationTarget('st-subura-thermopolium', { dressing: 0 }),
        done: { use: 'act.subura.popina-panis' },
        give: [{ item: BASKET, count: 3 }],
        journal: 'Fortunatus the baker loaded me with three baskets of warm bread: one for the popina on the Argiletum, one for Vibia Chreste at the Silver Pig, one for Dama at his inn by the Circus. All before the third hour, while it was still warm.',
      },
      {
        id: 'chreste',
        text: 'Bring a basket to Vibia Chreste of the Silver Pig',
        target: { kind: 'npc', id: 'npc-chreste' },
        done: { deliver: { item: BASKET, count: 1, to: 'npc-chreste' } },
        journal: 'I left the first basket on the popina’s counter against its shutters. The next was for Vibia Chreste, who keeps the Silver Pig in the Vicus Tuscus.',
      },
      {
        id: 'dama',
        text: 'Bring the last basket to Dama at the Inn at the Starting Gates',
        target: { kind: 'npc', id: 'npc-dama' },
        done: { deliver: { item: BASKET, count: 1, to: 'npc-dama' } },
        journal: 'Chreste took her basket and counted the loaves twice. The last was for Dama, at his inn by the starting gates of the Circus.',
      },
    ],
    period: 'Bakers baked through the night (Martial 12.57) [A]; popinae and inns bought their bread [P]; the round is invented [G]',
  },
  {
    until: 'h3',
    // Chreste and Dama speak from hand-written dialogues: what they say as the bread arrives.
    talk: {
      steps: {
        chreste: {
          hail: '(Vibia Chreste lifts the cloth and sniffs.) Fortunatus’ bread, and still warm? Give it here before the early drinkers smell it.',
          thanks: '(She counts the loaves twice.) All there. Go on, then: Dama is waiting for his, and he whines when it’s cold.',
        },
        dama: {
          hail: '(Dama lifts the cloth and breathes in.) Still warm. Fortunatus is learning.',
          thanks: '(He takes the basket and counts coins into your hand.) The baker’s money, and a loaf from me. Bakers and innkeepers settle among themselves.',
        },
      },
    },
    done: 'Dama took the last basket while it was still warm and paid me what the baker owed me: six asses and a loaf. Bakers and innkeepers settle among themselves.',
    failed: 'The third hour came and the bread was cold. Nobody pays for yesterday’s bread, and Fortunatus would not pay for today’s.',
  },
);
