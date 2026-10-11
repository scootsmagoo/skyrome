/**
 * The people of mq-05-tabula, "The Board" (docs/STORY.md chapter 5), 13 May AD 113 on the Caelian:
 * the soldier on the Castra Peregrina's gate, Mardonius the courier (one of the plotters, in the
 * Eastern Gold; nothing in Act I says so), the water-carrier who warns the player about the man
 * following them, and Bitus as Pudens's prisoner when the player spared him on the Column.
 *
 * Pudens, Gratus and the sicarius are elsewhere (npc/content/columna.ts, main-quest.ts; the
 * sicarius is an unnamed foe the quest spawns). The water-carrier and the prisoner have no home
 * and no schedule: the quest stages them.
 */
import { at } from '../../content/hours';
import { archetype, SICARIUS_PROFILE, tier } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-custos-peregrinus',
    name: 'Quintus Aebutius',
    title: 'Soldier on the gate of the Castra Peregrina',
    home: 'peregrina-gate-front',
    // On the gate from the fourth watch until the second; another man takes the night between.
    schedule: [
      { from: at('v4'), at: 'peregrina-gate-front', activity: 'guard' },
      { from: at('v2'), at: 'castra-peregrina', activity: 'sleep' },
    ],
    dialogue: 'npc-custos-peregrinus',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'adult', build: 'average', height: 1.7, skin: '#c99a72',
      hair: { style: 'cropped', color: '#3a2a1c' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#e2dac6' }, { kind: 'sagum', color: '#7a3a2e' }],
      footwear: 'caligae',
      armor: { helmet: { kind: 'imperial-italic', metal: 'iron' }, body: { kind: 'lorica-hamata', metal: 'iron' } },
      weapon: 'gladius', shield: { model: 'scutum-oval', color: '#7a3a2e', emblem: 'thunderbolt' },
    },
    combat: archetype('miles-urbanus', { kit: 1 }, { name: 'Soldier of the Castra Peregrina' }),
    barks: ['Token or business. Pick one.', 'The chief’s in. The chief’s always in.', 'Couriers in, couriers out. Nobody stays long but the flies.'],
    tags: ['soldier', 'frumentarius', 'dignitas:civis'],
  },
  {
    id: 'npc-mardonius',
    name: 'Mardonius',
    title: 'Courier of the Castra Peregrina',
    home: 'castra-peregrina',
    schedule: [
      { from: at('h1'), at: 'castra-peregrina', activity: 'lean' },
      { from: at('h7'), at: 'castra-peregrina', activity: 'sit' },
      { from: at('h9'), at: 'castra-peregrina', activity: 'lean' },
      { from: at('v2'), at: 'castra-peregrina', activity: 'sleep' },
    ],
    dialogue: 'npc-mardonius',
    disposition: 'friendly',
    // Easy and well kept: a courier between rides, in a good cloak.
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.73, skin: '#b8865e',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'short',
      garments: [{ kind: 'tunica', color: '#d8cfbc' }, { kind: 'balteus', color: '#3b2a1c' }, { kind: 'paenula', color: '#5a4a3a' }],
      footwear: 'caligae', weapon: 'pugio',
    },
    combat: tier('civilian', { name: 'Courier', health: 45, weapon: 'pugio', skill: 30 }),
    barks: ['Six days to Brundisium if the horses hold. They never hold.', 'Ask me anything. I hear it all, sooner or later.', 'The chief likes figs. Bring him figs and he’ll like you.'],
    tags: ['soldier', 'frumentarius', 'dignitas:civis'],
  },
  {
    id: 'npc-aquarius-caelius',
    name: 'Philo',
    title: 'Water-carrier',
    // No home and no schedule: mq-05 stages him on the slope below the Arch of Dolabella.
    dialogue: 'npc-aquarius-caelius',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'middle', build: 'stocky', height: 1.6, skin: '#a87650',
      hair: { style: 'cropped', color: '#2a1d14' }, beard: 'stubble',
      garments: [{ kind: 'tunica-short', color: '#8a7a5c' }],
      footwear: 'barefoot',
    },
    barks: ['Water! Fresh from the arches!', 'Two asses a jar, and I carry it up.'],
    tags: ['plebs', 'aquarius'],
  },
  {
    id: 'npc-sicarius-caelius',
    name: 'Man in a dark cloak',
    title: 'Sicarius',
    // No home and no schedule: mq-05 spawns him behind the player on the way up the Caelian.
    dialogue: 'npc-sicarius-caelius',
    disposition: 'hostile',
    combat: SICARIUS_PROFILE,
    appearance: {
      sex: 'male', age: 'adult', build: 'average', height: 1.7, skin: '#b8865e',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#4a4038' }, { kind: 'paenula', color: '#2a2622' }],
      footwear: 'soleae', weapon: 'sica',
    },
    barks: ['…', 'Walk on, new one.', 'Nothing personal.'],
    tags: ['sicarius', 'cabal'],
  },
  {
    id: 'npc-bitus-vinctus',
    name: 'Bitus',
    title: 'Prisoner, son of Dida',
    // The spared archer from the Column, in Pudens's cell: staged by mq-05 (and after it) only when
    // the flag bitus-fate is 'spared'. A separate NPC from npc-bitus, who is the hostile archer.
    dialogue: 'npc-bitus-vinctus',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'young', build: 'slight', height: 1.72, skin: '#c99a72',
      hair: { style: 'long-tied', color: '#2a1d14' }, beard: 'short',
      garments: [{ kind: 'tunica', color: '#8e8a80', sleeves: 'long' }, { kind: 'braccae', color: '#5e5040' }],
      footwear: 'barefoot',
    },
    barks: ['Still here, Roman.', 'They feed me better than the forum did.'],
    tags: ['dacian', 'captive', 'prisoner'],
  },
];

export default npcs;
