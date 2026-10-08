/**
 * Act I and the frumentarii (docs/CONTENT.md §2.A) as far as v0.1 needs them: the courier Festus,
 * the carter Dromo, Gratus (centurion of the frumentarii), Chrysippus (keeper of the Castor
 * strongrooms), Verecundus (optio of the Forum day patrol) and Mus, the knife-men's leader. The
 * Marii (Festus' family) and Pudens arrive with mq-03 / mq-05 in v0.2. Schedules are authored in
 * Roman hours (§0.3) and compiled with `at()`; place ids are the content's (src/content/places.ts).
 */
import { at } from '../../content/hours';
import { MUS_PROFILE, archetype, tier } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-festus',
    name: 'Gaius Marius Festus',
    title: 'Imperial courier (miles frumentarius)',
    home: 'night-cart-courier',
    dialogue: 'npc-festus',
    disposition: 'friendly',
    // Scripted only: beside the night cart at the start, dies at the gate (mq-01).
    appearance: {
      sex: 'male', age: 'adult', build: 'average', height: 1.68, skin: '#c99a72',
      hair: { style: 'cropped', color: '#2a1d14' }, beard: 'stubble', // nine days on the road
      garments: [{ kind: 'tunica', color: '#8e8a80' }, { kind: 'balteus', color: '#3b2a1c' }, { kind: 'paenula', color: '#6b5236' }],
      footwear: 'caligae', weapon: 'pugio',
    },
    combat: tier('civilian', { name: 'Courier', health: 40, weapon: 'pugio', skill: 25, loot: 'body.npc-festus' }),
    barks: ['Nine days from Brundisium and the last mile is the longest.', 'Don’t ask me what’s in the tube. I’m paid not to know.', 'Mind the arch. It drips on emperors too.', 'Rome. Smell that? Bread, smoke and somebody else’s money.'],
    tags: ['soldier', 'frumentarius', 'scripted', 'dignitas:civis'],
  },
  {
    id: 'npc-dromo',
    name: 'Dromo',
    title: 'Night carter',
    home: 'night-cart-driver',
    schedule: [
      { from: at('v3'), at: 'night-cart-driver', activity: 'sleep' }, // under the cart
      { from: at('v4'), at: 'night-cart-driver', activity: 'work' }, // the cart, mq-01
      { from: at('h2'), at: 'caupona-carcerum', activity: 'sit' }, // tells the story all day (the bible's h1, an hour later so he is still at the cart when the player asks)
      { from: at('v1'), at: 'night-cart-driver', activity: 'work' }, // the next load
    ],
    dialogue: 'npc-dromo',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'middle', build: 'stocky', height: 1.62, skin: '#b07d58',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'stubble',
      garments: [{ kind: 'tunica-short', color: '#7a6248' }],
      footwear: 'barefoot',
    },
    barks: ['Up, Ballista! Up, Catapulta! The sun’s coming and the law with it.', 'I was under the cart. Best seat in the house.', 'A man died at the gate. Nobody’s mule will stop there now.', 'Wine for the Velabrum, lime for the Pantheon, and corpses for the gods. Busy night.'],
    tags: ['plebs', 'servus', 'plaustrarius'],
  },
  {
    id: 'npc-gratus',
    name: 'Aulus Vettulenus Gratus',
    title: 'Centurion of the frumentarii',
    home: 'castor-strongroom',
    // Act I keeps him at the strongrooms day and night: by day he inspects the deposits (mq-02),
    // at dusk he takes the tablet, and through the Lemuria night he waits for the key (mq-03).
    schedule: [
      { from: at('h1'), at: 'castor-strongroom', activity: 'stand' },
      { from: at('v1'), at: 'castor-strongroom', activity: 'guard' },
    ],
    dialogue: 'npc-gratus',
    disposition: 'neutral',
    essential: true, // until mq-04 (wounded there, survives)
    appearance: {
      sex: 'male', age: 'middle', build: 'muscular', height: 1.7, skin: '#b07d58',
      hair: { style: 'cropped', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#e2dac6' }, { kind: 'balteus', color: '#3b2a1c' }, { kind: 'paenula', color: '#8e8a80' }],
      footwear: 'caligae', weapon: 'gladius',
    },
    combat: archetype('miles-urbanus', { kit: 1 }, { name: 'Centurion', armor: 2, armorFamily: 'cloth', shield: undefined, worn: ['tunica', 'paenula', 'caligae'] }),
    barks: ['Walk on. If you need me you’ll know where.', 'Every seal in Rome tells a story. Most of them lie.', 'Daylight is for honest men and fools.', 'Festus was the best rider in the camp. Remember that, if anyone asks.'],
    tags: ['soldier', 'official', 'frumentarius', 'incorruptible', 'dignitas:civis'],
  },
  {
    id: 'npc-chrysippus',
    name: 'Chrysippus',
    title: 'Keeper of the Castor strongrooms',
    home: 'castor-strongroom',
    schedule: [
      { from: at('h1'), at: 'castor-strongroom', activity: 'work' },
      { from: at('v1'), at: 'castor-strongroom', activity: 'sit' },
      { from: at('v2'), at: 'castor-strongroom', activity: 'sleep' }, // a cubicle above the vaults
    ],
    dialogue: 'npc-chrysippus',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.6, skin: '#ddb48f',
      hair: { style: 'receding', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#e2dac6' }],
      footwear: 'soleae',
    },
    barks: ['Deposits on the left, withdrawals on the right, complaints to the gods.', 'The temple is shut. The money is not. Money never sleeps.', 'Mind the step. Eleven steps. I counted them in the year of Nerva.'],
    tags: ['servus', 'official'],
  },
  {
    id: 'npc-verecundus',
    name: 'Titus Flavius Verecundus',
    title: 'Optio, Cohors X Urbana (Forum day patrol)',
    faction: 'cohortes-urbanae',
    rank: 'optio',
    home: 'statio-cohortium-urbanarum',
    schedule: [
      { from: at('h1'), at: 'statio-cohortium-urbanarum', activity: 'guard' },
      { from: at('h2'), at: 'statio-cohortium-urbanarum', activity: 'patrol', route: ['statio-cohortium-urbanarum', 'rostra:front', 'basilica-julia-gradus', 'temple-castor-pollux:front', 'tabernae-aemiliae', 'statio-cohortium-urbanarum'] },
      { from: at('h7'), at: 'statio-cohortium-urbanarum', activity: 'sit' },
      { from: at('h8'), at: 'statio-cohortium-urbanarum', activity: 'patrol', route: ['statio-cohortium-urbanarum', 'rostra:front', 'basilica-julia-gradus', 'temple-castor-pollux:front', 'tabernae-aemiliae', 'statio-cohortium-urbanarum'] },
      { from: at('v1'), at: 'statio-cohortium-urbanarum', activity: 'guard' }, // hands the city to the vigiles
      { from: at('v2'), at: 'castra-praetoria', activity: 'sleep' },
    ],
    dialogue: 'npc-verecundus',
    disposition: 'neutral',
    services: [],
    appearance: {
      sex: 'male', age: 'adult', build: 'muscular', height: 1.71, skin: '#c99a72',
      hair: { style: 'cropped', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#e2dac6' }, { kind: 'sagum', color: '#9e3b2e' }],
      footwear: 'caligae',
      armor: { helmet: { kind: 'imperial-italic', metal: 'iron' }, body: { kind: 'lorica-hamata', metal: 'iron' } },
      weapon: 'gladius', shield: { model: 'scutum-oval', color: '#9e3b2e', emblem: 'thunderbolt' },
    },
    combat: archetype('miles-urbanus', { kit: 1 }, { name: 'Optio of the Urban Cohorts' }),
    barks: ['Move along. Rome’s big enough for everyone if everyone moves.', 'Dice? On the basilica steps? I see nothing. I see everything.', 'No fighting in the Forum. Fight in the Subura like civilised people.', 'Before the Column, everyone’s a suspect. After it, everyone’s a hero.'],
    tags: ['soldier', 'official', 'law', 'dignitas:civis'],
  },
  {
    id: 'npc-mus',
    name: 'Dizas, called Mus',
    title: 'Leader of the knife-men',
    faction: 'grassatores',
    // Gone to ground after the murder: his corner (mus-latebra, at the burned taberna) exists only
    // while the player is on his trail and he has not been dealt with (src/content/install.ts
    // syncMusHideout), so before that nobody sees him, and after it he is gone.
    home: 'mus-latebra',
    schedule: [
      { from: at('h1'), at: 'mus-latebra', activity: 'sit' },
      { from: at('v1'), at: 'mus-latebra', activity: 'guard' },
    ],
    dialogue: 'npc-mus',
    // Talks first (dlg-mus); the encounter turns him hostile (dialogue 'attack' effect).
    disposition: 'neutral',
    // A thraex thrown out of the Ludus for theft: torn left ear, a brown hood, the curved sica.
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.61, skin: '#b07d58',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#9c4a3a' }, { kind: 'paenula', color: '#5a4632' }],
      footwear: 'barefoot', weapon: 'sica',
    },
    combat: MUS_PROFILE,
    barks: ['Thirty-one bouts! And they threw me out for a cloak.', 'Up from under, like a thraex finishing a man on his knees.', 'The mice eat what the lions leave.', 'Who sent you? Glaucus? Tell him the Mouse still bites.'],
    tags: ['grassator', 'underworld', 'thraex', 'dun-taberna-collapsa'],
  },
];

// ------------------------------------------------------------------ the Marii (mq-03)

npcs.push(
  {
    id: 'npc-helpis',
    name: 'Antonia Helpis',
    title: 'Festus’ mother',
    home: 'insula-mariorum',
    schedule: [
      { from: at('h1'), at: 'insula-mariorum', activity: 'work' },
      { from: at('v1'), at: 'insula-mariorum', activity: 'stand' },
    ],
    dialogue: 'npc-helpis',
    disposition: 'friendly',
    essential: true,
    // A freedwoman of fifty-eight, in a dark mourning palla over her stola.
    appearance: {
      sex: 'female', age: 'old', build: 'slight', height: 1.55, skin: '#c99a72',
      hair: { style: 'veiled', color: '#8a8580' },
      garments: [{ kind: 'stola', color: '#5e4a36' }, { kind: 'palla', color: '#2e2a26' }],
      footwear: 'soleae',
    },
    barks: ['Mind the step. The lamps are Fuscus’ business; the step is mine.', 'Two boys, and the house was never quiet. Now listen to it.', 'Light a lamp for the dead, and keep one for the living.'],
    tags: ['plebs', 'libertina', 'dignitas:civis'],
  },
  {
    id: 'npc-marius-fuscus',
    name: 'Gaius Marius Fuscus',
    title: 'Lamp-maker, veteran',
    home: 'insula-mariorum',
    schedule: [
      { from: at('h1'), at: 'insula-mariorum', activity: 'work' },
      { from: at('v1'), at: 'insula-mariorum', activity: 'stand' },
    ],
    dialogue: 'npc-marius-fuscus',
    disposition: 'neutral',
    essential: true,
    // A retired legionary of the Flavian wars: a soldier's back, lamp-black on his fingers.
    appearance: {
      sex: 'male', age: 'old', build: 'stocky', height: 1.66, skin: '#b07d58',
      hair: { style: 'receding', color: '#c9c4bc' }, beard: 'short',
      garments: [{ kind: 'tunica', color: '#6f5843' }, { kind: 'apron', color: '#3b2a1c' }],
      footwear: 'soleae',
    },
    barks: ['Lamps, two for an as. They burn as long as anyone’s prayers.', 'Twenty-five years with the Fifth Macedonian, and now I make lamps. Better lamps than the legion made soldiers.', 'Tonight the dead walk. Mind your feet.'],
    tags: ['plebs', 'veteranus', 'dignitas:civis'],
  },
  {
    id: 'npc-gemellus',
    name: 'Gaius Marius Gemellus',
    title: 'Copyist',
    home: 'gemellus-latebra',
    schedule: [{ from: 0, at: 'gemellus-latebra', activity: 'sitGround' }],
    dialogue: 'npc-gemellus',
    disposition: 'friendly',
    essential: true,
    // Festus' twin: the same face, ink on his fingers, his brother's brown courier's cloak.
    appearance: {
      sex: 'male', age: 'adult', build: 'average', height: 1.68, skin: '#c99a72',
      hair: { style: 'cropped', color: '#2a1d14' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#d9d0bd' }, { kind: 'paenula', color: '#6b5236' }],
      footwear: 'soleae',
    },
    barks: ['Don’t. Please.', 'I copy other men’s words. I don’t say my own.', 'Four. It was always four.'],
    tags: ['plebs', 'librarius', 'dignitas:civis'],
  },
);

export default npcs;
