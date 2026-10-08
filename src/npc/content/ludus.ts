/**
 * The Ludus Magnus (docs/CONTENT.md §2.C) for lud-01-sacramentum: Glaucus the doctor (the giver;
 * signs on guests and sworn men), Sextus Attius Celer the procurator, Hermippus the physician of
 * the Saniarium, Successus who keeps the armory, Asiaticus the referee, and the three practice
 * opponents: the tiro Pullus, the thraex Auctus and the champion retiarius Nereus (boss-nereus).
 * Gladiators follow the §14.7 template: drill h1–h6 and h8–h10, locked in at night.
 */
import { at } from '../../content/hours';
import { AUCTUS_PROFILE, NEREUS_PROFILE, PULLUS_PROFILE } from '../../content/profiles';
import type { NpcDef, ScheduleEntry } from '../types';

/** GDD §14.7 'gladiator' template. */
function gladiatorDay(evening: ScheduleEntry['activity'] = 'sleep'): ScheduleEntry[] {
  return [
    { from: at('h1'), at: 'ludus-arena-center', activity: 'drill' },
    { from: at('h6'), at: 'ludus-cellae', activity: 'sit' },
    { from: at('h8'), at: 'ludus-arena-center', activity: 'drill' },
    { from: at('h10'), at: 'ludus-cellae', activity: 'sit' },
    { from: at('v1'), at: 'ludus-cellae', activity: evening },
  ];
}

const npcs: NpcDef[] = [
  {
    id: 'npc-glaucus',
    name: 'Glaucus',
    title: 'Doctor of the Ludus Magnus',
    faction: 'ludus-magnus',
    rank: 'rudiarius',
    home: 'ludus-cellae',
    schedule: [
      { from: at('h1'), at: 'ludus-arena-center', activity: 'talk' }, // calls the drills
      { from: at('h6'), at: 'ludus-cellae', activity: 'sit' },
      { from: at('h8'), at: 'ludus-arena-center', activity: 'talk' },
      { from: at('h10'), at: 'ludus-cellae', activity: 'talk' },
      { from: at('v1'), at: 'ludus-cellae', activity: 'sleep' },
    ],
    dialogue: 'npc-glaucus',
    disposition: 'neutral',
    essential: true,
    services: ['trainer', 'lanista'],
    trainer: { skill: 'blades', maxLevel: 70 },
    // A Thracian-born rudiarius: scars (one across the nose), barefoot on the sand, a long practice stick and his own rudis on the belt.
    appearance: {
      sex: 'male', age: 'middle', build: 'muscular', height: 1.72, skin: '#b07d58',
      hair: { style: 'cropped', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#e2dac6' }, { kind: 'balteus', color: '#3b2a1c' }],
      footwear: 'barefoot', weapon: 'fustis',
    },
    barks: ['Feet first, then the shield, then the sword. Then your mouth, if there’s time.', 'You parry with the eyes. The arm only agrees.', 'The crowd isn’t cruel, tiro. It’s bored. Don’t bore it.', 'I got this stick after forty bouts. You’ll get a bruise after four.', 'Guest or sworn? Make up your mind before the sand does.'],
    tags: ['gladiator', 'arena-fan', 'rudiarius'],
  },
  {
    id: 'npc-celer',
    name: 'Sextus Attius Celer',
    title: 'Procurator of the Ludus Magnus',
    faction: 'ludus-magnus',
    home: 'lanista',
    schedule: [
      { from: at('h2'), at: 'lanista', activity: 'talk' }, // the office in the barracks block
      { from: at('h6'), at: 'ludus-magnus', activity: 'sleep' }, // offstage
    ],
    dialogue: 'npc-celer',
    disposition: 'neutral',
    essential: true,
    // An equestrian procurator: narrow stripes, a toga, a gold ring; a slave with tablets follows.
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.66, skin: '#ddb48f',
      hair: { style: 'receding', color: '#cfcbc4' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#efe8d8', clavi: 'narrow', trim: '#5b1f3b' }, { kind: 'toga', color: '#efe8d8' }],
      footwear: 'calcei',
    },
    barks: ['Each pair costs Caesar more than a ship. Fight like it.', 'Guests sign here. The sworn sign there. The dead sign nothing.', 'The Column will want games. Games want men.'],
    tags: ['official', 'elite', 'dignitas:eques'],
  },
  {
    id: 'npc-hermippus',
    name: 'Hermippus of Cos',
    title: 'Physician of the Ludus',
    faction: 'ludus-magnus',
    home: 'medicus',
    schedule: [
      { from: at('h1'), at: 'medicus', activity: 'stand' },
      { from: at('v1'), at: 'medicus', activity: 'sleep' },
    ],
    dialogue: 'npc-hermippus',
    disposition: 'friendly',
    services: ['healer', 'vendor', 'trainer'],
    vendor: { stock: [{ id: 'fascia', count: 10 }, { id: 'emplastrum', count: 4 }, { id: 'collyrium', count: 2 }, { id: 'posca', count: 6 }], denarii: 150 },
    trainer: { skill: 'medicina', maxLevel: 40 },
    // A Greek physician: the full beard, a long white tunic and an apron, a bronze probe and a bowl of vinegar.
    appearance: {
      sex: 'male', age: 'old', build: 'slight', height: 1.62, skin: '#ddb48f',
      hair: { style: 'receding', color: '#cfcbc4' }, beard: 'full',
      garments: [{ kind: 'tunica-long', color: '#f2eee4' }, { kind: 'apron', color: '#cfc4ad' }],
      footwear: 'soleae',
    },
    barks: ['Vinegar, honey and silence. Mostly silence.', 'Lie down. You’ll be a hero tomorrow; today you’re a patient.', 'The best wound is the one you stepped away from.', 'Rest till the lamps are lit. Doctor’s orders, and the doctor is me.'],
    tags: ['vendor:medicus', 'greek'],
  },
  {
    id: 'npc-successus',
    name: 'Successus',
    title: 'Keeper of the Ludus armory',
    faction: 'ludus-magnus',
    home: 'armory',
    schedule: [
      { from: at('h1'), at: 'armory', activity: 'work' },
      { from: at('h11'), at: 'ludus-cellae', activity: 'sit' },
      { from: at('v1'), at: 'armory', activity: 'sleep' },
    ],
    dialogue: 'npc-successus',
    disposition: 'neutral',
    services: ['vendor'],
    vendor: {
      stock: [
        { id: 'manica-linea', count: 2 }, { id: 'ocrea', count: 2 }, { id: 'ocreae', count: 1 }, { id: 'fasciae', count: 4 }, { id: 'subarmalis', count: 1 },
        { id: 'galea-thraecis', count: 1 }, { id: 'galea-murmillonis', count: 1 }, { id: 'rete', count: 1 },
      ],
      denarii: 400,
    },
    appearance: {
      sex: 'male', age: 'adult', build: 'stocky', height: 1.6, skin: '#8e5e3e',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#7a6248' }, { kind: 'apron', color: '#5e4a36' }],
      footwear: 'barefoot',
    },
    barks: ['One rudis, one shield, one signature. Bring them back or I’ll know.', 'That scutum has blocked more blows than you’ve thrown.', 'Wood for practice, iron for Caesar.'],
    tags: ['vendor:lanista', 'servus'],
  },
  {
    id: 'npc-asiaticus',
    name: 'Asiaticus',
    title: 'Summa rudis (chief referee)',
    faction: 'ludus-magnus',
    home: 'ludus-cellae',
    schedule: [
      { from: at('h2'), at: 'ludus-arena-center', activity: 'guard' }, // referees the bouts
      { from: at('h6'), at: 'ludus-cellae', activity: 'sit' },
      { from: at('h8'), at: 'ludus-arena-center', activity: 'guard' },
      { from: at('v1'), at: 'ludus-cellae', activity: 'sleep' },
    ],
    dialogue: 'npc-asiaticus',
    disposition: 'neutral',
    services: ['trainer'],
    trainer: { skill: 'shield', maxLevel: 40 },
    // A retired rudiarius: bald, a white tunic with the referee's two red bands at the hem, a long staff.
    appearance: {
      sex: 'male', age: 'old', build: 'slight', height: 1.65, skin: '#c99a72',
      hair: { style: 'bald', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4', trim: '#9e3b2e' }],
      footwear: 'soleae', weapon: 'fustis',
    },
    barks: ['Shields up! The sand is hungry!', 'A finger! He raises a finger! Ad digitum!', 'Step apart! Step apart, I said, or I’ll part you.', 'The crowd asks: Mitte! or Iugula? Today, it asks Mitte!'],
    tags: ['rudiarius', 'arena-fan'],
  },
  {
    id: 'npc-pullus',
    name: 'Pullus',
    title: 'Tiro of the Ludus',
    faction: 'ludus-magnus',
    rank: 'tiro',
    home: 'ludus-cellae',
    schedule: gladiatorDay(),
    dialogue: 'npc-ludus-tirones',
    disposition: 'friendly',
    // A free volunteer from Capua, nineteen: a light first beard.
    appearance: {
      sex: 'male', age: 'young', build: 'slight', height: 1.66, skin: '#ddb48f',
      hair: { style: 'cropped', color: '#4a3424' }, beard: 'stubble',
      garments: [{ kind: 'subligaculum', color: '#efe9dc' }, { kind: 'balteus', color: '#5a3c24' }],
      footwear: 'barefoot', weapon: 'gladius', shield: { model: 'scutum', color: '#8e2a1e', emblem: 'wreath' },
    },
    combat: PULLUS_PROFILE,
    barks: ['My mother thinks I’m a baker.', 'Is it true they throw roses? Or is it just the bread?', 'Go easy. Not too easy. Medium.'],
    tags: ['gladiator', 'tiro', 'lud01-pullus'],
  },
  {
    id: 'npc-auctus',
    name: 'Auctus',
    title: 'Thraex (veteranus)',
    faction: 'ludus-magnus',
    rank: 'veteranus',
    home: 'ludus-cellae',
    schedule: gladiatorDay(),
    dialogue: 'npc-auctus',
    disposition: 'neutral',
    // Gallic-born, sunburned; high greaves, manica on the right, the griffin-crested thraex helmet for bouts.
    appearance: {
      sex: 'male', age: 'adult', build: 'muscular', height: 1.68, skin: '#ddb48f',
      hair: { style: 'cropped', color: '#6b3a22' }, beard: 'none',
      garments: [{ kind: 'subligaculum', color: '#e2dac6' }, { kind: 'balteus', color: '#3b2a1c' }],
      footwear: 'barefoot',
      armor: { helmet: { kind: 'thraex', crest: '#b3261e', metal: 'bronze' }, manica: 'right', greaves: 'both' },
      weapon: 'sica', shield: { model: 'parmula', color: '#c98b2e', emblem: 'none' },
    },
    combat: AUCTUS_PROFILE,
    barks: ['The thraex fights low. Watch my feet, not my sword.', 'Thirty bouts, eighteen wins, eleven missio, one draw. And a cold.', 'Up from under, that’s the thraex’s stroke. Nobody else uses it in the street.'],
    tags: ['gladiator', 'thraex', 'lud01-auctus'],
  },
  {
    id: 'npc-nereus',
    name: 'Nereus',
    title: 'Retiarius, victor of 31',
    faction: 'ludus-magnus',
    rank: 'palus-secundus',
    home: 'ludus-cellae',
    schedule: gladiatorDay('sit'), // mends nets in the evening
    dialogue: 'npc-nereus',
    disposition: 'neutral',
    essential: true,
    // The retiarius' bare face: no helmet; manica on the left arm, the galerus on the left shoulder.
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.75, skin: '#8e5e3e',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'subligaculum', color: '#efe9dc' }, { kind: 'balteus', color: '#c98b2e' }],
      footwear: 'barefoot',
      armor: { manica: 'left', greaves: 'left' },
      weapon: 'trident',
    },
    combat: NEREUS_PROFILE,
    services: [],
    trainer: { skill: 'spear', maxLevel: 40 }, // after lud-01 completes (his dialogue gates it)
    barks: ['The net has no edges. Only patience.', 'Thirty-one wins, and I still pray before each one.', 'You blocked my net with your shield? Clever. Do it again.', 'Non te peto, piscem peto! I’m after the fish, not you. Old habit.'],
    tags: ['gladiator', 'retiarius', 'boss-nereus'],
  },
];

export default npcs;
