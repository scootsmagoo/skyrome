/**
 * Givers and players of the v0.1 misc quests (docs/CONTENT.md §2.E, §3.3): the Meta Sudans brawl
 * (Bassulus of the scutarii, Anicetus of the parmularii), Black Beans (Florus the cooper and
 * Thallusa), the Leaning Insula (Iulia Prima, Callistus the rent collector, Dento the aediles'
 * man), What Venus Hides (Ianuarius of the drains, the Rex Cloacae) and the Face on the Column
 * (Antiochus the carver, Moschus the foreman).
 */
import { at, shift } from '../../content/hours';
import { REX_CLOACAE_PROFILE, archetype } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  // ---------------------------------------------------------------- misc-meta-sudans-rixa
  {
    id: 'npc-bassulus',
    name: 'Bassulus',
    title: 'Butcher, leader of the scutarii',
    home: 'meta-sudans:front',
    schedule: [
      { from: at('h8'), at: 'meta-sudans:front', activity: 'stand' },
      { from: at('v1'), at: 'popina-vici-tusci', activity: 'drunk' },
    ],
    dialogue: 'npc-rixa',
    disposition: 'neutral',
    // A cloth painted with a big rectangular shield tied round the arm; blood on the tunic.
    appearance: {
      sex: 'male', age: 'adult', build: 'heavy', height: 1.69, skin: '#b07d58',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#9c4a3a' }],
      footwear: 'barefoot',
    },
    combat: archetype('collegium-bruiser', { kit: 0 }, { name: 'Leader of the scutarii' }),
    barks: ['Big shield, big heart! Scutarii!', 'A thraex is a rat with a hat.', 'The murmillo stands. The thraex runs. Which would you marry?'],
    tags: ['plebs', 'arena-fan', 'scutarii'],
  },
  {
    id: 'npc-anicetus',
    name: 'Anicetus',
    title: 'Tanner, leader of the parmularii',
    home: 'meta-sudans:front',
    schedule: [
      { from: at('h8'), at: 'meta-sudans:front', activity: 'stand' },
      { from: at('v1'), at: 'popina-vici-tusci', activity: 'drunk' },
    ],
    dialogue: 'npc-rixa',
    disposition: 'neutral',
    // A small square shield painted on a board hung from his neck; stinks of the tannery.
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.66, skin: '#8e5e3e',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#7a6248' }],
      footwear: 'barefoot',
    },
    combat: archetype('collegium-bruiser', { kit: 0 }, { name: 'Leader of the parmularii' }),
    barks: ['Small shield, quick feet! Parmularii!', 'The murmillo is a fish in a pot. We eat fish.', 'Did you see Auctus today? Robbed, I tell you. Robbed!'],
    tags: ['plebs', 'arena-fan', 'parmularii'],
  },
  // ---------------------------------------------------------------- misc-lemuria-fabae
  {
    id: 'npc-florus',
    name: 'Marcus Tuccius Florus',
    title: 'Cooper of the Velabrum',
    home: 'insula-tuccii',
    schedule: [
      { from: at('v3'), at: 'insula-tuccii', activity: 'pray' }, // the Lemuria rite at midnight
      { from: at('h1'), at: 'insula-tuccii', activity: 'work' }, // hammering hoops
      { from: at('h9'), at: 'popina-vici-tusci', activity: 'sit' },
      { from: at('v1'), at: 'insula-tuccii', activity: 'sleep' },
    ],
    dialogue: 'npc-fabae',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'stocky', height: 1.64, skin: '#b07d58',
      hair: { style: 'cropped', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#7a6248' }, { kind: 'apron', color: '#5a4632' }],
      footwear: 'barefoot', weapon: 'axe',
    },
    barks: ['Every Lemuria, the same. I throw the beans, and by dawn: gone. The ghosts have an appetite.', 'Oak for wine, chestnut for oil, pine for fools.', 'My father haunts me. He haunted me alive, too.'],
    tags: ['plebs', 'pious', 'dignitas:civis'],
  },
  {
    id: 'npc-thallusa',
    name: 'Thallusa',
    title: 'Housekeeper of Florus',
    home: 'insula-tuccii',
    schedule: [
      { from: at('v3', 0.5), at: 'insula-tuccii', activity: 'work' }, // after the rite: gathers the beans
      { from: at('v4'), at: 'compitum-velabri', activity: 'sitGround' }, // feeds her grandchildren
      { from: at('h1'), at: 'insula-tuccii', activity: 'work' },
      { from: at('v1'), at: 'insula-tuccii', activity: 'sleep' },
    ],
    dialogue: 'npc-fabae',
    disposition: 'friendly',
    appearance: {
      sex: 'female', age: 'old', build: 'slight', height: 1.48, skin: '#8e5e3e',
      hair: { style: 'bun', color: '#cfcbc4' },
      garments: [{ kind: 'tunica-long', color: '#7a6248' }],
      footwear: 'barefoot',
    },
    barks: ['Yes, master. No, master. The ghosts, master.', 'Little ones, eat slowly. Slowly, I said.'],
    tags: ['servus', 'pious'],
  },
  // ---------------------------------------------------------------- misc-insula-nutans
  {
    id: 'npc-prima',
    name: 'Iulia Prima',
    title: 'Widow of a stonemason, third floor',
    home: 'insula-nutans',
    schedule: [
      { from: at('h1'), at: 'lacus-velabri', activity: 'work' },
      { from: at('h2'), at: 'insula-nutans', activity: 'work' }, // spins wool on the stair
      { from: at('h8'), at: 'compitum-vici-tusci', activity: 'pray' },
      { from: at('v1'), at: 'insula-nutans', activity: 'sleep' },
    ],
    dialogue: 'npc-prima',
    disposition: 'friendly',
    // A grey palla drawn over the head.
    appearance: {
      sex: 'female', age: 'adult', build: 'slight', height: 1.53, skin: '#c99a72',
      hair: { style: 'veiled', color: '#2a1d14' },
      garments: [{ kind: 'tunica-long', color: '#4f6e6a' }, { kind: 'palla', color: '#8e8a80' }],
      footwear: 'soleae',
    },
    barks: ['Another crack. Sleep easy, says Callistus. I’ll sleep easy in my tomb.', 'My husband built half the Forum. He couldn’t afford to live in a wall that stands.', 'Children! Away from that wall!'],
    tags: ['plebs', 'dignitas:civis'],
  },
  // The other three households of the Leaning Insula (the evacuation counts four with Prima's): minor extras [G].
  {
    id: 'npc-sutor-nutans',
    name: 'Felix the cobbler',
    title: 'Cobbler, ground floor of the Leaning Insula',
    home: 'insula-nutans-taberna',
    schedule: shift('insula-nutans-taberna', 'work', 'h1', 'v2'),
    dialogue: 'npc-nutans-tenants',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'middle', build: 'stocky', height: 1.6, skin: '#b07d58',
      hair: { style: 'receding', color: '#4a3424' }, beard: 'stubble',
      garments: [{ kind: 'tunica-short', color: '#7a6248' }, { kind: 'apron', color: '#5a4632' }],
      footwear: 'barefoot',
    },
    barks: ['Eleven pairs by the Ludi, and the lasts have all gone missing.', 'Mind the nails. I spit them, I don’t sweep them.', 'It creaks. Houses creak.'],
    tags: ['plebs', 'faber', 'dignitas:libertus'],
  },
  {
    id: 'npc-senes-nutans',
    name: 'Fabia',
    title: 'Old tenant of the Leaning Insula (with her husband)',
    home: 'insula-nutans-scalae',
    schedule: shift('insula-nutans-scalae', 'sit', 'h1', 'v2'),
    dialogue: 'npc-nutans-tenants',
    disposition: 'friendly',
    appearance: {
      sex: 'female', age: 'old', build: 'slight', height: 1.48, skin: '#ddb48f',
      hair: { style: 'veiled', color: '#cfcbc4' },
      garments: [{ kind: 'tunica-long', color: '#8e8a80' }, { kind: 'palla', color: '#7a6248' }],
      footwear: 'soleae',
    },
    barks: ['Forty years on this stair, and it has never once been level.', 'Gnaeus! The lamp! Gnaeus, you old goat!', 'The third step is not a step so much as a suggestion.'],
    tags: ['plebs', 'dignitas:civis'],
  },
  {
    id: 'npc-syri-nutans',
    name: 'Abdes',
    title: 'Syrian tenant of the Leaning Insula',
    home: 'insula-nutans-tectum',
    schedule: shift('insula-nutans-tectum', 'stand', 'h1', 'v2'),
    dialogue: 'npc-nutans-tenants',
    disposition: 'friendly',
    // A long striped tunic of the Orontes, little Latin; his wife and two children are with him.
    appearance: {
      sex: 'male', age: 'adult', build: 'average', height: 1.68, skin: '#b07d58',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'short',
      garments: [{ kind: 'tunica-long', color: '#cc9a35', trim: '#6b3a6e' }],
      footwear: 'soleae',
    },
    barks: ['Wall? What wall? We stay.', 'Antioch has wide streets. Rome has the stairs.', 'Good water, bad stairs. Everything comes with something.'],
    tags: ['plebs', 'syrian', 'dignitas:peregrinus'],
  },
  {
    id: 'npc-callistus',
    name: 'Callistus',
    title: 'Rent collector of the Leaning Insula',
    home: 'insula-nutans',
    schedule: [
      { from: at('h2'), at: 'insula-nutans', activity: 'work' }, // collects
      { from: at('h5'), at: 'tabernae-aemiliae', activity: 'talk' },
      { from: at('h8'), at: 'popina-vici-tusci', activity: 'drunk' },
      { from: at('v1'), at: 'popina-vici-tusci', activity: 'sleep' },
    ],
    dialogue: 'npc-callistus',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.67, skin: '#ddb48f',
      hair: { style: 'cropped', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'lacerna', color: '#7a6248' }],
      footwear: 'calcei',
    },
    barks: ['Sleep easy, sleep easy. The props are oak.', 'The rent is due on the Kalends. The repairs are due on the Greek Kalends.', 'The master is a senator. Senators don’t do walls.'],
    tags: ['servus'],
  },
  {
    id: 'npc-dento',
    name: 'Sextus Furius Dento',
    title: 'Apparitor of the aediles',
    home: 'rostra:front',
    schedule: [
      { from: at('h2'), at: 'rostra:front', activity: 'work' }, // by the aediles' tribunal
      { from: at('h6'), at: 'basilica-julia-gradus', activity: 'sit' },
      { from: at('h7'), at: 'rostra:front', activity: 'patrol', route: ['rostra:front', 'vicus-tuscus', 'forum-boarium', 'vicus-tuscus', 'rostra:front'] }, // markets and weights
      { from: at('v1'), at: 'rostra:front', activity: 'sleep' },
    ],
    dialogue: 'npc-dento',
    disposition: 'neutral',
    // A set of bronze test weights on a cord.
    appearance: {
      sex: 'male', age: 'middle', build: 'average', height: 1.66, skin: '#c99a72',
      hair: { style: 'cropped', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'toga', color: '#efe8d8' }],
      footwear: 'calcei',
    },
    barks: ['Short measure? Show me. No, show me with witnesses.', 'Taverns, brothels, weights and walls. The aediles do everything, and I do it for them.', 'If it falls down, it’s my aedile’s fault. If it’s my aedile’s fault, it’s mine.'],
    tags: ['official', 'dignitas:civis'],
  },
  // ---------------------------------------------------------------- misc-venus-cloacina
  {
    id: 'npc-ianuarius',
    name: 'Ianuarius',
    title: 'Public slave of the drains',
    home: 'shrine-venus-cloacina:front',
    schedule: [
      { from: at('h1'), at: 'shrine-venus-cloacina:front', activity: 'patrol', route: ['shrine-venus-cloacina:front', 'cloaca-grate-aemiliae', 'basilica-julia-gradus', 'cloaca-maxima-outlet', 'shrine-venus-cloacina:front'] }, // checks grates
      { from: at('h8'), at: 'popina-vici-tusci', activity: 'sit' },
      { from: at('v1'), at: 'popina-vici-tusci', activity: 'sleep' },
    ],
    dialogue: 'npc-ianuarius',
    disposition: 'friendly',
    // Leather leggings to the thigh, a long iron hook and a lantern.
    appearance: {
      sex: 'male', age: 'adult', build: 'stocky', height: 1.61, skin: '#6b4229',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#7a6248' }, { kind: 'braccae', color: '#5a4632' }],
      footwear: 'barefoot', weapon: 'torch',
    },
    barks: ['The old lady’s been here since the kings. She’ll outlast the lot of us.', 'Someone’s been lifting my grate. My grate!', 'Venus of the drains, they call her. Laugh, but she’s never had a flood she didn’t forgive.'],
    tags: ['servus', 'publicus'],
  },
  {
    id: 'npc-rex-cloacae',
    name: 'Saturninus, called Rex Cloacae',
    title: 'King of the Cloaca',
    faction: 'latrones',
    // Lives in the junction chamber of dun-cloaca-maxima (an interior cell): no surface home.
    dialogue: 'npc-rex-cloacae',
    disposition: 'hostile',
    // Pale from the dark, greasy long hair and a full beard (an outcast), a stolen bath toga worn as a cloak, a crown of drain-grate iron.
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.7, skin: '#b07d58',
      hair: { style: 'long-tied', color: '#2a1d14' }, beard: 'full',
      garments: [{ kind: 'tunica', color: '#5a4632' }, { kind: 'palla', color: '#c8bfa8' }],
      footwear: 'barefoot',
      armor: { body: { kind: 'leather' } },
      weapon: 'gladius',
    },
    combat: REX_CLOACAE_PROFILE,
    barks: ['Welcome to my kingdom. Mind the floor; it moves.', 'Above, Caesar. Below, me.', 'Every toga in Rome ends up here eventually. So does every senator.', 'Open the sluice and we’ll all go swimming!'],
    tags: ['underworld', 'boss-rex-cloacae', 'dun-cloaca-maxima'],
  },
  // ---------------------------------------------------------------- misc-facies-columnae (v0.1-Could)
  {
    id: 'npc-antiochus',
    name: 'Antiochus of Aphrodisias',
    title: 'Stone carver of the Column’s frieze',
    home: 'officina-columnae',
    schedule: [
      { from: at('v3'), at: 'officina-columnae', activity: 'sleep' },
      { from: at('h1'), at: 'officina-columnae', activity: 'work' },
      { from: at('v1'), at: 'column-trajan:front', activity: 'sitGround' }, // keeps watch over "his" face
    ],
    dialogue: 'npc-antiochus',
    disposition: 'friendly',
    // Marble dust in his curls; a Greek craftsman's short beard; chisels and a drill bow.
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.66, skin: '#c99a72',
      hair: { style: 'curly-short', color: '#6a5f55' }, beard: 'short',
      garments: [{ kind: 'tunica-short', color: '#e2dac6' }, { kind: 'apron', color: '#cfc4ad' }],
      footwear: 'barefoot', weapon: 'hammer',
    },
    barks: ['Four hundred soldiers on that spiral, and one of them is my brother.', 'Marble remembers everything. That’s the trouble with it.', 'The master wants a hundred identical faces. The army didn’t have identical faces.'],
    tags: ['greek', 'faber', 'dignitas:peregrinus'],
  },
  {
    id: 'npc-moschus',
    name: 'Moschus',
    title: 'Foreman of the carving crew',
    home: 'column-trajan:front',
    schedule: [
      { from: at('h1'), at: 'column-trajan:front', activity: 'work' },
      { from: at('v1'), at: 'officina-columnae', activity: 'talk' },
      { from: at('v2'), at: 'officina-columnae', activity: 'sleep' },
    ],
    dialogue: 'npc-moschus',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.64, skin: '#ddb48f',
      hair: { style: 'receding', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#cfc4ad' }],
      footwear: 'soleae', weapon: 'hammer',
    },
    barks: ['Recut by dawn. Those are the orders, and orders don’t have brothers.', 'The dedication waits for no chisel.', 'Every face the same height, every shield the same size. That’s discipline.'],
    tags: ['faber', 'dignitas:libertus'],
  },
];

export default npcs;
