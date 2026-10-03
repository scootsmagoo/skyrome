/**
 * Ordinary Romans of the v0.1 districts from docs/CONTENT.md §2.E: the dice idler of the Basilica
 * Julia steps, the pearl-seller of the Sacra Via and his climbing son, the cattle dealer of the
 * Forum Boarium and the Tiber diver. Their own quests (misc-colossus, lav-01, misc-argei…) are
 * v0.2; in v0.1 they fill the streets, talk and bark.
 */
import { at } from '../../content/hours';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-talarius',
    name: 'Talarius',
    title: 'Idler on the Basilica Julia steps',
    home: 'basilica-julia-gradus',
    schedule: [
      { from: at('h2'), at: 'basilica-julia-gradus', activity: 'sitGround' },
      { from: at('h10'), at: 'popina-vici-tusci', activity: 'drunk' },
      { from: at('v2'), at: 'popina-vici-tusci', activity: 'travel' },
    ],
    dialogue: 'npc-talarius',
    disposition: 'friendly',
    // Careless stubble (not a philosopher's beard), a patched grey tunic, knucklebones.
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.63, skin: '#b07d58',
      hair: { style: 'receding', color: '#8a8580' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#8e8a80' }],
      footwear: 'soleae',
    },
    barks: ['Venus! Venus, by the gods! No, it’s the Dog again.', 'Dice are illegal, citizen. That’s why the stakes are so low.', 'Stand in front of me. The aedile’s man is looking.'],
    tags: ['plebs', 'otiosus', 'dignitas:libertus'],
  },
  {
    id: 'npc-hilario',
    name: 'Marcus Valerius Hilario',
    title: 'Pearl-seller (Porticus Margaritaria)',
    home: 'porticus-margaritaria',
    schedule: [
      { from: at('h2'), at: 'porticus-margaritaria', activity: 'work' },
      { from: at('v1'), at: 'porticus-margaritaria', activity: 'travel' },
    ],
    dialogue: 'npc-hilario',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'average', height: 1.66, skin: '#c99a72',
      hair: { style: 'cropped', color: '#2a1d14' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'lacerna', color: '#5e9a8a' }],
      footwear: 'calcei',
    },
    barks: ['Pearls from the Red Sea, the price of a farm, the weight of a tear.', 'My son will be an eques. If he lives, which he won’t, the way he climbs.'],
    tags: ['dignitas:libertus'],
  },
  {
    id: 'npc-pusio',
    name: 'Marcus Valerius “Pusio”',
    title: 'The pearl-seller’s son',
    home: 'colossus-sol',
    schedule: [
      { from: at('h2'), at: 'colossus-sol', activity: 'wander' }, // with his gang
      { from: at('h8'), at: 'porticus-margaritaria', activity: 'sit' },
      { from: at('v1'), at: 'porticus-margaritaria', activity: 'travel' },
    ],
    dialogue: 'npc-pusio',
    disposition: 'friendly',
    // Fifteen and freeborn: the gold bulla at his neck.
    appearance: {
      sex: 'male', age: 'child', build: 'slight', height: 1.55, skin: '#ddb48f',
      hair: { style: 'cropped', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }],
      footwear: 'calcei',
    },
    barks: ['I bet you I can touch his crown. I bet you anything.', 'I’m not scared. I’m just thinking. Up here.', 'Don’t tell my father. He’ll tell my mother. She’ll tell the whole Sacred Way.'],
    tags: ['puer', 'dignitas:civis'],
  },
  {
    id: 'npc-lurco',
    name: 'Publius Naevius Lurco',
    title: 'Cattle dealer of the Forum Boarium',
    home: 'forum-boarium',
    schedule: [
      { from: at('h1'), at: 'forum-boarium', activity: 'work' }, // sales; two bruisers follow him
      { from: at('h7'), at: 'caupona-carcerum', activity: 'drunk' },
      { from: at('h9'), at: 'caupona-carcerum', activity: 'travel' },
    ],
    dialogue: 'npc-lurco',
    disposition: 'neutral',
    // His name means "glutton": a Plautine joke, flagged as such.
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.65, skin: '#c99a72',
      hair: { style: 'receding', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'lacerna', color: '#9c4a3a' }],
      footwear: 'calcei',
    },
    barks: ['Bulls from Campania, heifers from Etruria, prices from heaven!', 'That slave? Cost me a fortune in doctors. Well, in one doctor. Well, in the god.', 'Mind the dung. It’s worth more than you.'],
    tags: ['dignitas:civis', 'bodyguards:2'],
  },
  {
    id: 'npc-mergus',
    name: '“Mergus” (the Diver)',
    title: 'Tiber diver',
    home: 'portus-tiberinus',
    schedule: [
      { from: at('h1'), at: 'portus-tiberinus', activity: 'work' }, // salvage
      { from: at('h7'), at: 'caupona-carcerum', activity: 'sit' },
      { from: at('v1'), at: 'caupona-carcerum', activity: 'sleep' },
    ],
    dialogue: 'npc-mergus',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.72, skin: '#8e5e3e',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'subligaculum', color: '#cfc4ad' }, { kind: 'balteus', color: '#5a4632' }],
      footwear: 'barefoot', weapon: 'pugio',
    },
    barks: ['Twenty-seven straw men go in. Twenty-six float. Funny, that.', 'Father Tiber gives back everything. Eventually. In pieces.', 'Want to see the bottom? Hold your breath and your tongue.'],
    tags: ['plebs', 'dignitas:peregrinus'],
  },
];

export default npcs;
