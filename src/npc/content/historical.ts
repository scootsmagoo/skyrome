/**
 * Historical figures who appear in v0.1 (docs/CONTENT.md §2.B, §2.F; GDD §2.5 fixed stars): all
 * essential, never combat targets, their lines opinion rather than invented fact. Juvenal and
 * Apollodorus are present and talkable; Trajan is only ever seen at a distance (the `vig-traianus`
 * vignette stages him: he has no home here, so no ambient system spawns him); the chief Vestal
 * (Cassia Lucilla, an invented name: the Vestals of 113 are unknown) walks with a lictor.
 */
import { at } from '../../content/hours';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-iuvenalis',
    name: 'Decimus Iunius Iuvenalis',
    title: 'Satirist (Juvenal)',
    home: 'basilica-julia-gradus',
    schedule: [
      { from: at('h2'), at: 'rostra', activity: 'stand' }, // heckles the crier
      { from: at('h3'), at: 'basilica-julia-gradus', activity: 'sit' },
      { from: at('h7'), at: 'popina-vici-tusci', activity: 'sit' },
      { from: at('h9'), at: 'baths-titus', activity: 'travel' }, // offstage
      { from: at('v1'), at: 'popina-vici-tusci', activity: 'drunk' },
      { from: at('v2'), at: 'popina-vici-tusci', activity: 'travel' }, // home to his third-floor cenaculum (offstage)
    ],
    dialogue: 'npc-iuvenalis',
    disposition: 'neutral',
    essential: true,
    // A poor client: a threadbare patched toga over a grey tunic, shaved badly, calcei split at the toe.
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.64, skin: '#c99a72',
      hair: { style: 'receding', color: '#8a8580' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#8e8a80' }, { kind: 'toga', color: '#d8cfba' }],
      footwear: 'calcei',
    },
    barks: [
      'In Rome even the smoke from your neighbour’s kitchen costs you a tip.',
      'They’ve built a column a hundred feet high so the rich can look down on us from even further away.',
      'I was a client at dawn, a pedestrian at noon and a target at night. A full day.',
      'Another Greek. Another Syrian. Another cook who calls himself a philosopher.',
      'Make your will before you walk under a window. I’ve made mine. I’m leaving everything to the landlord; he takes it anyway.',
      'If you want honesty, try the gladiators. At least they admit they’ll kill you.',
    ],
    tags: ['plebs', 'fixed-star', 'dignitas:civis'],
  },
  {
    id: 'npc-apollodorus',
    name: 'Apollodorus of Damascus',
    title: 'Architect of Trajan’s Forum and Column',
    home: 'forum-trajan',
    // 11 May, the eve of the dedication: at the Column and the carvers' hut all day.
    schedule: [
      { from: at('h1'), at: 'column-trajan', activity: 'work' },
      { from: at('h4'), at: 'officina-columnae', activity: 'talk' },
      { from: at('h7'), at: 'basilica-ulpia', activity: 'work' },
      { from: at('h10'), at: 'column-trajan', activity: 'work' },
      { from: at('v1'), at: 'forum-trajan', activity: 'travel' }, // offstage, toward the Baths of Trajan
    ],
    dialogue: 'npc-apollodorus',
    disposition: 'neutral',
    essential: true,
    // A Greek-speaking Syrian intellectual: the short beard reads as Greek (GDD §3.6).
    appearance: {
      sex: 'male', age: 'middle', build: 'average', height: 1.67, skin: '#b07d58',
      hair: { style: 'curly-short', color: '#5a4a3a' }, beard: 'short',
      garments: [{ kind: 'tunica-long', color: '#e2dac6' }, { kind: 'lacerna', color: '#a5916c' }],
      footwear: 'calcei',
    },
    barks: ['A hundred feet of Luna marble and they ask me if it will fall down.', 'Measure twice. Carve once. Pray never.', 'The frieze climbs like the army did: slowly, and in the rain.', 'Domes? Domes are for people who draw pumpkins.'],
    tags: ['fixed-star', 'greek', 'elite'],
  },
  {
    id: 'npc-traianus',
    name: 'Imperator Caesar Nerva Traianus Augustus',
    title: 'The Emperor',
    disposition: 'friendly',
    essential: true,
    // Never approachable: ≥ 25 m togate cordon, 24 lictors; overheard lines only (vignette vig-traianus).
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.78, skin: '#c99a72',
      hair: { style: 'cropped', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'toga', color: '#efe8d8', trim: '#5b1f3b' }],
      footwear: 'calcei',
    },
    barks: ['Well, Apollodorus? Does it stand?', 'Let them come close. They paid for it.', 'Tomorrow the gods, and then the East.', 'Commilito! Were you at Sarmizegetusa? So was I. Wet, wasn’t it?'],
    tags: ['fixed-star', 'scripted', 'cordon-25m', 'elite'],
  },
  {
    id: 'npc-vestalis-maxima',
    name: 'Cassia Lucilla',
    title: 'Virgo Vestalis Maxima',
    home: 'atrium-vestae',
    schedule: [
      { from: at('h1'), at: 'temple-vesta', activity: 'pray' },
      { from: at('h6'), at: 'atrium-vestae', activity: 'sit' },
      { from: at('v1'), at: 'atrium-vestae', activity: 'sleep' },
    ],
    dialogue: 'npc-vestalis-maxima',
    disposition: 'neutral',
    essential: true, // sacrosanct
    appearance: {
      sex: 'female', age: 'middle', build: 'slight', height: 1.56, skin: '#ddb48f',
      hair: { style: 'vestal', color: '#4a3424' },
      garments: [{ kind: 'tunica-long', color: '#f2eee4' }, { kind: 'stola', color: '#f1eee6' }, { kind: 'palla', color: '#f2eee4', trim: '#5b1f3b' }],
      footwear: 'calcei',
    },
    barks: ['The fire does not care who you are. Neither do I.', 'Twenty-seven of rush, as our fathers made them.', 'Stand back, citizen. The goddess is not a sight for gawkers.'],
    tags: ['elite', 'pious', 'incorruptible', 'vestal'],
  },
  {
    id: 'npc-patron-vettius',
    name: 'Sextus Vettius Crispinus',
    title: 'Senator',
    faction: 'clientela',
    home: 'domus-vettii',
    schedule: [
      { from: at('h1'), at: 'domus-vettii', activity: 'talk' }, // the salutatio
      { from: at('h2'), at: 'curia-julia', activity: 'stand' },
      { from: at('h4'), at: 'domus-vettii', activity: 'sit' },
      { from: at('v1'), at: 'domus-vettii', activity: 'sleep' },
    ],
    dialogue: 'npc-patron-vettius',
    disposition: 'neutral',
    essential: true,
    // A patrician of the old school: the broad stripe, a worn old-fashioned toga, calcei with the ivory crescent.
    appearance: {
      sex: 'male', age: 'old', build: 'slight', height: 1.62, skin: '#c99a72',
      hair: { style: 'receding', color: '#cfcbc4' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4', clavi: 'wide', trim: '#5b1f3b' }, { kind: 'toga', color: '#e6dfcf' }],
      footwear: 'calcei',
    },
    barks: ['Wars are paid for twice: once in silver and once in sons.', 'In my father’s day a senator walked. Now he is carried, and calls it progress.', 'Sit, sit. The young stand too much.'],
    tags: ['elite', 'official', 'dignitas:senator'],
  },
];

export default npcs;
