/**
 * The Ludus Magnus for lud-01-sacramentum (GDD §9.2, §13.2, §17.2): the procurator who signs on
 * guests (the 'lanista' vendor), the doctor Glaucus (GDD's npc-glaucus), the armorer, the medicus of
 * the Saniarium, and the three practice opponents: the tiro Pullus, the thraex Callinicus and the
 * champion retiarius Nereus (boss-nereus). Gladiators drill hours 1–6 and 8–10 and are locked in
 * at night (§14.7).
 */
import { archetype, NEREUS_PROFILE } from '../../content/profiles';
import type { NpcDef, ScheduleEntry } from '../types';

/** §14.7 'gladiator' template: drill, rest, drill, locked in. */
function gladiatorDay(post: string): ScheduleEntry[] {
  return [
    { from: 0, at: 'ludus-cellae', activity: 'sleep' },
    { from: 5.5, at: post, activity: 'work' },
    { from: 11.5, at: 'ludus-cellae', activity: 'sit' },
    { from: 13.5, at: post, activity: 'work' },
    { from: 17, at: 'ludus-cellae', activity: 'sit' },
    { from: 20, at: 'ludus-cellae', activity: 'sleep' },
  ];
}

const npcs: NpcDef[] = [
  {
    id: 'npc-attius-celer',
    name: 'Sextus Attius Celer',
    title: 'Procurator of the Ludus Magnus',
    faction: 'ludus-magnus',
    home: 'lanista',
    schedule: [
      { from: 0, at: 'lanista', activity: 'sleep' },
      { from: 6, at: 'lanista', activity: 'sit' },
      { from: 12, at: 'ludus-arena-center', activity: 'stand' },
      { from: 14, at: 'lanista', activity: 'sit' },
      { from: 19, at: 'lanista', activity: 'sleep' },
    ],
    dialogue: 'npc-attius-celer',
    disposition: 'neutral',
    essential: true,
    services: ['lanista', 'vendor'],
    vendor: {
      stock: [
        { id: 'manica-linea', count: 2 }, { id: 'ocrea', count: 2 }, { id: 'ocreae', count: 1 }, { id: 'parmula', count: 1 },
        { id: 'galea-thraecis', count: 1 }, { id: 'galea-murmillonis', count: 1 }, { id: 'cardiophylax', count: 1 }, { id: 'fascia', count: 6 },
      ],
      denarii: 400,
    },
    // An imperial procurator of equestrian rank: narrow stripes and a toga for business.
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.68, skin: '#d9ab84',
      hair: { style: 'receding', color: '#4a3524' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#efe9dc', clavi: 'narrow', trim: '#4f1838' }, { kind: 'toga', color: '#efe9dc' }],
      footwear: 'calcei',
    },
    barks: ['Guests pay their own doctor.', 'Sign here. Or make your mark. Either.', 'The emperor’s school does not haggle.'],
    tags: ['vendor:lanista', 'official', 'dignitas:eques'],
  },
  {
    id: 'npc-glaucus',
    name: 'Glaucus',
    title: 'Doctor of the Ludus (trainer)',
    faction: 'ludus-magnus',
    rank: 'rudiarius',
    home: 'ludus-palus',
    schedule: [
      { from: 0, at: 'ludus-cellae', activity: 'sleep' },
      { from: 5.5, at: 'ludus-palus', activity: 'guard' },
      { from: 11.5, at: 'ludus-arena-center', activity: 'stand' },
      { from: 13.5, at: 'ludus-palus', activity: 'guard' },
      { from: 18, at: 'popina-vicus-tuscus', activity: 'drunk' },
      { from: 21, at: 'ludus-cellae', activity: 'sleep' },
    ],
    dialogue: 'npc-glaucus',
    disposition: 'neutral',
    essential: true,
    services: ['trainer'],
    trainer: { skill: 'blades', maxLevel: 40 },
    // A Thracian-born rudiarius: freed with the wooden sword, now the school's doctor. Scarred, grey, still hard.
    appearance: {
      sex: 'male', age: 'middle', build: 'muscular', height: 1.74, skin: '#bd9067',
      hair: { style: 'cropped', color: '#8a857d' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#8a6e50', sleeves: 'none' }, { kind: 'balteus', color: '#3b2a1c' }],
      footwear: 'soleae', weapon: 'gladius',
    },
    barks: ['Again!', 'Shield up, point out, step!', 'You fight like a senator dances.', 'Watch his hips, not his eyes.'],
    tags: ['gladiator', 'arena-fan', 'trainer:blades'],
  },
  {
    id: 'npc-bassus',
    name: 'Bassus',
    title: 'Armorer of the Ludus',
    faction: 'ludus-magnus',
    home: 'armory',
    schedule: [
      { from: 0, at: 'armory', activity: 'sleep' },
      { from: 5, at: 'armory', activity: 'work' },
      { from: 20, at: 'armory', activity: 'sleep' },
    ],
    dialogue: 'npc-bassus',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'old', build: 'stocky', height: 1.62, skin: '#bb8660',
      hair: { style: 'bald', color: '#8a857d' }, beard: 'short',
      garments: [{ kind: 'tunica-short', color: '#6f5843' }, { kind: 'apron', color: '#5e4a36' }],
      footwear: 'soleae',
    },
    barks: ['Bring it back with all its pieces.', 'That rudis has more bouts than you have teeth.'],
    tags: ['plebs', 'dignitas:libertus'],
  },
  {
    id: 'npc-eudemus',
    name: 'Eudemus',
    title: 'Medicus of the Ludus',
    faction: 'ludus-magnus',
    home: 'medicus',
    schedule: [
      { from: 0, at: 'medicus', activity: 'sleep' },
      { from: 6, at: 'medicus', activity: 'work' },
      { from: 21, at: 'medicus', activity: 'sleep' },
    ],
    dialogue: 'npc-eudemus',
    disposition: 'friendly',
    services: ['healer', 'vendor'],
    vendor: { stock: [{ id: 'fascia', count: 10 }, { id: 'emplastrum', count: 4 }, { id: 'collyrium', count: 3 }, { id: 'febrifugum', count: 2 }], denarii: 150 },
    // A Greek physician, linen tunic and a philosopher's short beard; he reads Celsus and quotes Hippocrates.
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.66, skin: '#c09670',
      hair: { style: 'curly-short', color: '#2e2219' }, beard: 'short',
      garments: [{ kind: 'tunica', color: '#e0d8c6' }, { kind: 'palla', color: '#cfc4ad' }],
      footwear: 'soleae',
    },
    barks: ['Sit. Show me. No, the other arm.', 'Wine on the wound, not in the mouth.'],
    tags: ['vendor:medicus', 'greek'],
  },
  {
    id: 'npc-pullus',
    name: 'Pullus',
    title: 'Tiro of the Ludus',
    faction: 'ludus-magnus',
    home: 'ludus-palus',
    schedule: gladiatorDay('ludus-palus'),
    dialogue: 'npc-ludus-gladiators',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'young', build: 'average', height: 1.66, skin: '#e3bf9f',
      hair: { style: 'cropped', color: '#9c7442' }, beard: 'none',
      garments: [{ kind: 'subligaculum', color: '#e6dfcf' }, { kind: 'balteus', color: '#5a3c24' }],
      footwear: 'barefoot', weapon: 'gladius', shield: { model: 'scutum', color: '#8e2a1e', emblem: 'wreath' },
    },
    combat: archetype('murmillo', { tier: 'thug' }, { name: 'Tiro', weapon: 'rudis', yieldAt: 0.25 }),
    barks: ['Hit me gently, I’m new.', 'My arm! My arm is lead.'],
    tags: ['gladiator', 'tiro'],
  },
  {
    id: 'npc-callinicus',
    name: 'Callinicus',
    title: 'Thraex',
    faction: 'ludus-magnus',
    home: 'ludus-palus',
    schedule: gladiatorDay('ludus-palus'),
    dialogue: 'npc-ludus-gladiators',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'adult', build: 'muscular', height: 1.7, skin: '#b0825a',
      hair: { style: 'curly-short', color: '#2a1f17' }, beard: 'none',
      garments: [{ kind: 'subligaculum', color: '#d9d0bd' }, { kind: 'balteus', color: '#3b2a1c' }],
      footwear: 'barefoot',
      armor: { helmet: { kind: 'thraex', crest: '#b3261e', metal: 'bronze' }, manica: 'right', greaves: 'both' },
      weapon: 'sica', shield: { model: 'parmula', color: '#c98b2e', emblem: 'none' },
    },
    // A practice bout: the sica is wooden today (the rudis's numbers, §6.10).
    combat: archetype('thraex', { tier: 'veteran' }, { weapon: 'rudis', yieldAt: 0.3 }),
    barks: ['The parmularii love me. Ask anyone at the Meta Sudans.', 'Low and round, tiro. Low and round.'],
    tags: ['gladiator', 'thraex'],
  },
  {
    id: 'npc-nereus',
    name: 'Nereus',
    title: 'Retiarius, victor of 31',
    faction: 'ludus-magnus',
    rank: 'primus-palus',
    home: 'ludus-palus',
    schedule: gladiatorDay('ludus-arena-center'),
    dialogue: 'npc-nereus',
    disposition: 'neutral',
    essential: true,
    // Tall and quick; no helmet (the retiarius fights bareheaded), linen manica on the left arm, the galerus on the shoulder.
    appearance: {
      sex: 'male', age: 'adult', build: 'muscular', height: 1.78, skin: '#a46b49',
      hair: { style: 'curly-short', color: '#1f1914' }, beard: 'none',
      garments: [{ kind: 'subligaculum', color: '#efe9dc' }, { kind: 'balteus', color: '#c98b2e' }],
      footwear: 'barefoot',
      armor: { manica: 'left', greaves: 'left' },
      weapon: 'trident',
    },
    combat: NEREUS_PROFILE,
    barks: ['Fish come to the net.', 'Thirty-one. Count them.', 'Salute the crowd. They pay.'],
    tags: ['gladiator', 'retiarius', 'boss-nereus', 'arena-fan'],
  },
];

export default npcs;
