/**
 * NPCs of the v0.1 main-quest thread (mq-01-madida-capena, mq-02-tabella): the courier, the night
 * carter, the two grassatores, the aedituus of Castor and the strongroom keeper who is Pudens' man.
 * All fictional except where noted (GDD §10.3 names the courier).
 */
import { archetype, tier } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-festus',
    name: 'Gaius Marius Festus',
    title: 'Imperial courier',
    home: 'night-cart',
    dialogue: 'npc-festus',
    disposition: 'friendly',
    // A soldier seconded as a courier (frumentarius): travel cloak over a military tunic, hobnailed boots.
    appearance: {
      sex: 'male', age: 'adult', build: 'average', height: 1.71, skin: '#c6936b',
      hair: { style: 'cropped', color: '#2a1f17' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#d9d0bd' }, { kind: 'balteus', color: '#3b2a1c' }, { kind: 'paenula', color: '#5b4a3a' }],
      footwear: 'caligae', weapon: 'pugio',
    },
    combat: tier('civilian', { name: 'Courier', health: 40, weapon: 'pugio', skill: 25 }),
    barks: ['Keep close to the cart.', 'Rome. Every time I see it I want to turn round.'],
    tags: ['soldier', 'frumentarius', 'mq-01'],
  },
  {
    id: 'npc-dama',
    name: 'Dama',
    title: 'Carter',
    home: 'night-cart',
    schedule: [
      { from: 0, at: 'night-cart', activity: 'work' },
      { from: 6, at: 'capena-spring', activity: 'sit' },
      { from: 9, at: 'popina-vicus-tuscus', activity: 'drunk' },
      { from: 17, at: 'porta-capena', activity: 'sleep' },
      { from: 21, at: 'night-cart', activity: 'work' },
    ],
    dialogue: 'npc-dama',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'stocky', height: 1.63, skin: '#bb8660',
      hair: { style: 'receding', color: '#5c5751' }, beard: 'stubble',
      garments: [{ kind: 'tunica-short', color: '#8a6e50' }, { kind: 'paenula', color: '#4e4136' }],
      footwear: 'soleae',
    },
    barks: ['Hup! Hup, you misbegotten mule!', 'Out by dawn, out by dawn, or the aediles have my wheels.', 'Whose wine is this? Mine. Hands off.'],
    tags: ['plebs', 'plaustrarius'],
  },
  {
    id: 'npc-sorex',
    name: 'Sorex',
    title: 'Grassator',
    faction: 'grassatores',
    dialogue: 'npc-grassatores',
    disposition: 'hostile',
    appearance: {
      sex: 'male', age: 'young', build: 'slight', height: 1.62, skin: '#a0744d',
      hair: { style: 'curly-short', color: '#1f1914' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#5e4a36' }, { kind: 'paenula', color: '#3d332b' }],
      footwear: 'soleae', weapon: 'pugio',
    },
    combat: archetype('grassator', { kit: 0 }),
    barks: ['Nice cloak.', 'Hold him! Hold him!'],
    tags: ['grassator', 'underworld', 'mq-01'],
  },
  {
    id: 'npc-calvus',
    name: 'Calvus',
    title: 'Grassator',
    faction: 'grassatores',
    dialogue: 'npc-grassatores',
    disposition: 'hostile',
    appearance: {
      sex: 'male', age: 'adult', build: 'heavy', height: 1.72, skin: '#d9ab84',
      hair: { style: 'bald', color: '#3a2a1d' }, beard: 'short',
      garments: [{ kind: 'tunica', color: '#6f5843' }],
      footwear: 'barefoot', weapon: 'fustis',
    },
    combat: archetype('grassator', { kit: 1 }),
    barks: ['Where are you going so early, friend?', 'Get the satchel, Sorex!'],
    tags: ['grassator', 'underworld', 'mq-01'],
  },
  {
    id: 'npc-aedituus-castoris',
    name: 'Tiberius Claudius Hyginus',
    title: 'Aedituus of the Temple of Castor',
    home: 'castor-steps',
    schedule: [
      { from: 0, at: 'temple-castor-pollux', activity: 'sleep' },
      { from: 5, at: 'castor-steps', activity: 'sweep' },
      { from: 8, at: 'castor-steps', activity: 'stand' },
      { from: 12, at: 'lacus-juturnae', activity: 'pray' },
      { from: 13, at: 'castor-steps', activity: 'sit' },
      { from: 19.5, at: 'temple-castor-pollux', activity: 'sleep' },
    ],
    dialogue: 'npc-aedituus-castoris',
    disposition: 'friendly',
    services: ['vendor', 'priest'],
    vendor: { stock: [{ id: 'libum', count: 12 }, { id: 'tus', count: 8 }, { id: 'lucerna', count: 4 }, { id: 'fascinum', count: 2 }], denarii: 100 },
    // An imperial freedman: aeditui of the great temples were often freedmen [P].
    appearance: {
      sex: 'male', age: 'old', build: 'slight', height: 1.6, skin: '#cf9f78',
      hair: { style: 'receding', color: '#a39e95' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#ebe5d6', sleeves: 'elbow' }, { kind: 'apron', color: '#cfc4ad' }],
      footwear: 'soleae',
    },
    barks: ['The god’s house is shut today. The Lemuria.', 'Mind the steps, they are older than you.', 'A honey cake for the Twins? One as.'],
    tags: ['vendor:aedituus', 'pious', 'dignitas:libertus', 'official'],
  },
  {
    id: 'npc-castor-contact',
    name: 'Gaius Gavius Silo',
    title: 'Keeper of the Strongrooms',
    home: 'castor-strongroom',
    schedule: [
      { from: 0, at: 'castor-strongroom', activity: 'sleep' },
      { from: 6, at: 'castor-strongroom', activity: 'sit' },
      { from: 13, at: 'basilica-julia-steps', activity: 'stand' },
      { from: 15, at: 'castor-strongroom', activity: 'sit' },
    ],
    dialogue: 'npc-castor-contact',
    disposition: 'neutral',
    essential: true,
    // Pudens' man among the strongroom keepers: a clerk's tunic and a soldier's boots.
    appearance: {
      sex: 'male', age: 'middle', build: 'average', height: 1.69, skin: '#c6936b',
      hair: { style: 'cropped', color: '#5c5751' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#cfc4ad' }, { kind: 'lacerna', color: '#5d6e80' }],
      footwear: 'caligae',
    },
    barks: ['Deposits by daylight.', 'Locker numbers on the token, please.'],
    tags: ['official', 'frumentarius', 'incorruptible', 'dignitas:civis'],
  },
];

export default npcs;
