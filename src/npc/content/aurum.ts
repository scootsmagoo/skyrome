/**
 * The people of mq-07-aurum, "The Eastern Gold" (docs/STORY.md chapter 7), from 13 May AD 113: Malchus son of
 * Iarhai the Palmyrene (pepper and silk, at his bay in the Horrea Piperataria by day), the clerk of the
 * warehouse, Asclepiodotus the Chaldaean astrologer, Cassius Ursus the Father of the Mithras cave, and two
 * initiates (soldiers).
 *
 * Places: `piperataria-malchus` and `piperataria-clerk` (content/places.ts: before Malchus's bay in the
 * warehouse's front wall), and the cells' own (world/interiors/named). Asclepiodotus, Ursus and the initiates
 * have no home and no schedule: they are placed whenever the player is in their cell
 * (world/interiors/named/cast.ts: the Chaldaean at his table, the Father by the relief, the initiates on the
 * benches from 19:00 to 24:00). Mardonius (npc/content/tabula.ts) is the quest's to place in the cave.
 */
import { tier } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-malchus',
    name: 'Malchus',
    title: 'Pepper and silk, of Palmyra',
    home: 'piperataria-malchus',
    // By day at his bay (07:00 to 18:00, when the bay's door is open); at night offstage, at his lodging.
    schedule: [
      { from: 7, at: 'piperataria-malchus', activity: 'stand' },
      { from: 12.5, at: 'piperataria-malchus', activity: 'lean' },
      { from: 14, at: 'piperataria-malchus', activity: 'stand' },
      { from: 18, at: 'piperataria-malchus', activity: 'sleep' },
    ],
    dialogue: 'npc-malchus',
    disposition: 'friendly',
    // The head of the eastern gold's Roman end (GDD §10.2): protected until Act III.
    essential: true,
    // Fifty, comfortable and charming: a long Syrian tunic with long sleeves in dyed wool, a good cloak pinned
    // at the shoulder, a close beard, and the rings (the clue the street remembers).
    combat: tier('civilian', { name: 'Malchus', health: 55, skill: 15 }),
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.7, skin: '#b8865e',
      hair: { style: 'curly-short', color: '#2a2420' }, beard: 'short',
      garments: [{ kind: 'tunica-long', color: '#2f5a6e', trim: '#c9a43c', sleeves: 'long' }, { kind: 'lacerna', color: '#7a2f3a', trim: '#c9a43c' }],
      footwear: 'calcei',
    },
    barks: ['Pepper by the shipload, silk by the bolt. Smell that? That is India.', 'Everyone in Rome is a friend of a friend.', 'I never haggle. A fair price is a fair price.'],
    tags: ['dignitas:eques', 'coniuratio-masked', 'mercator', 'palmyrene'],
  },
  {
    id: 'npc-clerk-piperataria',
    name: 'Hilarus',
    title: 'Clerk of the Horrea Piperataria',
    home: 'piperataria-clerk',
    schedule: [
      { from: 6, at: 'piperataria-clerk', activity: 'stand' },
      { from: 12.5, at: 'piperataria-clerk', activity: 'lean' },
      { from: 14, at: 'piperataria-clerk', activity: 'stand' },
      { from: 18.5, at: 'piperataria-clerk', activity: 'sleep' },
    ],
    dialogue: 'npc-clerk-piperataria',
    disposition: 'friendly',
    // A freedman with tally tablets, sneezing, who has weighed pepper for twenty years.
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.66, skin: '#ddb48f',
      hair: { style: 'receding', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#cfc6ae' }],
      footwear: 'soleae',
    },
    combat: tier('civilian', { name: 'Clerk', health: 40, skill: 10 }),
    barks: ['Weighed and sealed, or it doesn’t leave the bay.', 'Mind the pepper. It gets in everything, and in the nose most of all.', 'Every sack has a number and every number has a name.'],
    tags: ['plebs', 'dignitas:libertus', 'scriba'],
  },
  {
    id: 'npc-asclepiodotus',
    name: 'Asclepiodotus',
    title: 'Chaldaean astrologer, of Seleucia',
    // No home and no schedule: world/interiors/named/cast.ts seats him at his table (`domus-asclepiodoti:reader`)
    // whenever the player is in his rooms.
    dialogue: 'npc-asclepiodotus',
    disposition: 'friendly',
    essential: true,
    // Sixty, long-robed and long-bearded, grey, soft-spoken: a white wool robe with long sleeves, a dark mantle.
    appearance: {
      sex: 'male', age: 'old', build: 'slight', height: 1.68, skin: '#c99a72',
      hair: { style: 'receding', color: '#bdb8b0' }, beard: 'full',
      garments: [{ kind: 'tunica-long', color: '#e6dfcb', trim: '#6e5a8a', sleeves: 'long' }, { kind: 'lacerna', color: '#3b3158' }],
      footwear: 'soleae',
    },
    combat: tier('civilian', { name: 'Asclepiodotus', health: 40, skill: 5 }),
    barks: ['The stars incline. They do not compel.', 'Saturn is in the house of the hidden. A fine hour for a secret.', 'Your hour of birth, and I will tell you your death. Not the day.'],
    tags: ['dignitas:peregrinus', 'coniuratio-masked', 'astrologus'],
  },
  {
    id: 'npc-cassius-ursus',
    name: 'Cassius Ursus',
    title: 'Father of the cave',
    // No home and no schedule: world/interiors/named/cast.ts stands him before the relief (`mithraeum-subura:father`)
    // whenever the player is in the cave.
    dialogue: 'npc-cassius-ursus',
    disposition: 'neutral',
    // Sixty, an old centurion and an honest man: a plain soldier's tunic and a cloak, a scarred, short-cropped white head.
    appearance: {
      sex: 'male', age: 'old', build: 'stocky', height: 1.74, skin: '#b8865e',
      hair: { style: 'cropped', color: '#d8d4cc' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#b0a07c' }, { kind: 'balteus', color: '#3b2a1c' }, { kind: 'sagum', color: '#6a3a30' }],
      footwear: 'caligae', weapon: 'gladius',
    },
    combat: tier('miles', { name: 'Cassius Ursus', health: 85, weapon: 'gladius', skill: 55 }),
    barks: ['The god sees every man who comes down the stair.', 'Forty years of the legion, and the god is the only officer I never wanted to leave.', 'We keep no secrets here. We keep silence. They are not the same.'],
    tags: ['soldier', 'dignitas:civis', 'mithras', 'veteranus'],
  },
  {
    id: 'npc-initiate-1',
    name: 'Sabinus',
    title: 'Soldier, initiate of Mithras',
    // No home and no schedule: seated on a bench of the cave (`mithraeum-subura:initiate-1`) from 19:00 to 24:00.
    dialogue: 'npc-initiate-1',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'adult', build: 'muscular', height: 1.76, skin: '#c99a72',
      hair: { style: 'cropped', color: '#3a2a1c' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#cfc6ae' }, { kind: 'balteus', color: '#3b2a1c' }],
      footwear: 'caligae',
    },
    combat: tier('miles', { name: 'Initiate of Mithras', health: 65, weapon: 'gladius', skill: 40 }),
    barks: ['The god watches. Say little.', 'We are all brothers here, and nobody asks whose.', 'Sit. Eat. The Father speaks when the lamps are trimmed.'],
    tags: ['soldier', 'dignitas:civis', 'mithras'],
  },
  {
    id: 'npc-initiate-2',
    name: 'Verecundus',
    title: 'Soldier, initiate of Mithras',
    // No home and no schedule: seated on a bench of the cave (`mithraeum-subura:initiate-2`) from 19:00 to 24:00.
    dialogue: 'npc-initiate-2',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'young', build: 'average', height: 1.7, skin: '#a87650',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#d8cfbc' }, { kind: 'balteus', color: '#3b2a1c' }],
      footwear: 'caligae',
    },
    combat: tier('miles', { name: 'Initiate of Mithras', health: 55, weapon: 'gladius', skill: 35 }),
    barks: ['I have not slept since the last feast. The bread keeps me awake.', 'Seven steps down and the whole city is gone.', 'The Raven carries the word. The Lion keeps the fire.'],
    tags: ['soldier', 'dignitas:civis', 'mithras'],
  },
];

export default npcs;
