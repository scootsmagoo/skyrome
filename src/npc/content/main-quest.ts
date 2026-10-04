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
    home: 'night-cart',
    dialogue: 'npc-festus',
    disposition: 'friendly',
    // Scripted only: on the cart at capena-extra, dies under the arch of the porta-capena (mq-01).
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
    home: 'night-cart',
    schedule: [
      { from: at('v3'), at: 'night-cart', activity: 'sleep' }, // under the cart
      { from: at('v4'), at: 'night-cart', activity: 'work' }, // the cart, mq-01
      { from: at('h2'), at: 'caupona-carcerum', activity: 'sit' }, // tells the story all day (the bible's h1, an hour later so he is still at the cart when the player asks)
      { from: at('v1'), at: 'night-cart', activity: 'work' }, // the next load
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
    schedule: [
      { from: at('v3'), at: 'castra-peregrina', activity: 'sleep' },
      // The bible sends him back to the camp at h4; v0.1 keeps him at the vaults all day so that
      // "ask Chrysippus for Gratus" works at any hour of the golden path, and at dusk (mq-02).
      { from: at('h1'), at: 'castor-strongroom', activity: 'work' }, // inspects the deposits
      { from: at('v1'), at: 'castor-strongroom', activity: 'work' }, // meets the player at dusk (mq-02)
      { from: at('v2'), at: 'castra-peregrina', activity: 'sleep' },
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
      { from: at('h2'), at: 'statio-cohortium-urbanarum', activity: 'patrol', route: ['statio-cohortium-urbanarum', 'rostra', 'basilica-julia-gradus', 'temple-castor-pollux', 'tabernae-aemiliae', 'statio-cohortium-urbanarum'] },
      { from: at('h7'), at: 'statio-cohortium-urbanarum', activity: 'sit' },
      { from: at('h8'), at: 'statio-cohortium-urbanarum', activity: 'patrol', route: ['statio-cohortium-urbanarum', 'rostra', 'basilica-julia-gradus', 'temple-castor-pollux', 'tabernae-aemiliae', 'statio-cohortium-urbanarum'] },
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
    home: 'taberna-collapsa',
    schedule: [
      { from: at('h1'), at: 'taberna-collapsa', activity: 'sit' },
      { from: at('v1'), at: 'taberna-collapsa', activity: 'guard' },
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

export default npcs;
