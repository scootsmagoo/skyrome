/**
 * People of the QUESTS II crew's side quests (docs/design/world-life.md §4.8 Q4-Q6):
 *
 *   Forged Tokens (misc-tesserae-falsae)    Eutychus the freedman, Lucrio the lead-worker
 *   Mercury's Water (misc-mercuralia)       the aediles' clerk, three merchants at the spring
 *   Free by the God's Hand (misc-servus-aesculapii)
 *                                           Daos, the temple attendant Philo, the patient Cleon, the carter
 *                                           Bato, the steward Stichus and his two men
 *
 * The curator of the dole and Lucius Septimius are shopkeepers: keepers in src/life/data/keepers/quests-g.ts.
 * People with no home and no schedule (the merchants at the spring, the steward and his men) are never
 * spawned by the schedule loop: their quest stages them where and when the story needs them.
 */
import { at } from '../../content/hours';
import { archetype } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  // ---------------------------------------------------------------- misc-tesserae-falsae
  {
    id: 'npc-eutychus-libertus',
    name: 'Eutychus',
    title: 'Freedman, on the grain list',
    home: 'minucia-dole',
    schedule: [
      { from: at('h2'), at: 'minucia-dole', activity: 'stand' },
      { from: at('h7'), at: 'minucia-dole', activity: 'sitGround' }, // waits on the step for the curator to relent
      { from: at('v1'), at: 'minucia-dole', activity: 'sleep' },
    ],
    dialogue: 'dlg-tess-eutychus',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.62, skin: '#b9866a',
      hair: { style: 'receding', color: '#5a4636' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#cdbf9f' }, { kind: 'lacerna', color: '#6e6a5a' }],
      footwear: 'soleae',
    },
    barks: ['Six denarii! Six! And the curator held it to the light like a coin from a dead man.', 'Five modii a month, and I have a lead token and a broken heart.', 'A freedman’s grain is a freedman’s bread, curator!'],
    tags: ['plebs', 'dignitas:libertus'],
  },
  {
    id: 'npc-lucrio-plumbarius',
    name: 'Lucrio',
    title: 'Lead-worker, dicer',
    home: 'lucrio-yard',
    schedule: [
      { from: at('v3'), at: 'lucrio-yard', activity: 'sleep' }, // in his yard bed until the lamps are lit
      { from: at('v1'), at: 'lucrio-dice', activity: 'sitGround' }, // dice in the Subura (Juvenal 8.172)
    ],
    dialogue: 'dlg-tess-lucrio',
    disposition: 'neutral',
    // A thumb grey to the knuckle with lead.
    appearance: {
      sex: 'male', age: 'adult', build: 'stocky', height: 1.66, skin: '#a87650',
      hair: { style: 'curly-short', color: '#241a12' }, beard: 'stubble',
      garments: [{ kind: 'tunica-short', color: '#7d7466' }, { kind: 'apron', color: '#4c453c' }],
      footwear: 'barefoot',
    },
    barks: ['Ones and sixes! Dogs and senios, and a Venus for the man who pays!', 'Lead is lead. It goes where lead goes.', 'My thumb? Pipes. I make pipes.'],
    tags: ['plebs', 'faber', 'dicer'],
  },

  // ---------------------------------------------------------------- misc-mercuralia
  {
    id: 'npc-clericus-aedilium',
    name: 'Naevius',
    title: 'Clerk of the plebeian aediles',
    home: 'aediles-clerk',
    schedule: [
      { from: at('h3'), at: 'aediles-clerk', activity: 'stand' },
      { from: at('h10'), at: 'aediles-clerk', activity: 'sleep' }, // the archive is shut and he is gone
    ],
    dialogue: 'dlg-merc-clerk',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.68, skin: '#d1a684',
      hair: { style: 'cropped', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#ece4d0' }, { kind: 'lacerna', color: '#6b5a3c' }],
      footwear: 'calcei',
    },
    barks: ['Weights and measures, by order of the aediles! Short measure is a fine, and the fine is half to the informer.', 'The album is public. The archive is not.', 'No, the aediles do not discuss the price of fish.'],
    tags: ['plebs', 'official', 'dignitas:civis'],
  },
  ...(['a', 'b', 'c'] as const).map(
    (k, i): NpcDef => ({
      id: `npc-mercurialis-${k}`,
      name: ['Merchant with a jar', 'Dealer in nard', 'Greengrocer'][i],
      title: 'At Mercury’s spring on the Ides',
      dialogue: 'dlg-merc-merchants',
      disposition: 'friendly',
      appearance: {
        sex: i === 1 ? 'female' : 'male', age: ['middle', 'adult', 'old'][i] as 'middle' | 'adult' | 'old',
        build: (['average', 'slight', 'stocky'] as const)[i], height: [1.66, 1.56, 1.62][i], skin: ['#c99a76', '#b07d58', '#d1a684'][i],
        hair: { style: i === 1 ? 'bun' : 'cropped', color: ['#3a2a1c', '#2a1d14', '#a09a90'][i] }, beard: 'none',
        garments: i === 1
          ? [{ kind: 'tunica-long', color: '#c29a4f' }, { kind: 'palla', color: '#8e4a3a' }]
          : [{ kind: 'tunica', color: ['#d8cdb4', '#cbbf9d', '#b9ad8c'][i] }, { kind: 'apron', color: '#d4cab1' }],
        footwear: 'soleae',
      },
      barks: [
        'Mercury, wash it away: last year’s lies and this year’s prices.',
        'Laurel and a jar. Cheaper than a lawyer.',
        'A drop on the head and a drop on the goods, and the god goes blind for a year.',
      ],
      tags: ['plebs', 'pious', 'merchant'],
    }),
  ),

  // ---------------------------------------------------------------- misc-servus-aesculapii
  {
    id: 'npc-daos',
    name: 'Daos',
    title: 'Syrian cook, once a slave',
    home: 'island-daos',
    schedule: [
      { from: at('h1'), at: 'island-daos', activity: 'sitGround' },
      { from: at('v1'), at: 'island-daos', activity: 'sleep' },
    ],
    dialogue: 'dlg-daos',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'old', build: 'slight', height: 1.58, skin: '#a06f4c',
      hair: { style: 'cropped', color: '#cfcbc4' }, beard: 'short',
      garments: [{ kind: 'tunica-short', color: '#a8947a' }, { kind: 'apron', color: '#d8cfba' }],
      footwear: 'barefoot',
    },
    barks: ['The Lord brought me to the god’s house on a hurdle. The god sent me out on my feet.', 'Forty years of other men’s dinners. I would like to eat one of mine.', 'I am well. I keep telling them I am well.'],
    tags: ['servus', 'pious', 'syrian'],
  },
  {
    id: 'npc-philo-aedituus',
    name: 'Philo',
    title: 'Attendant of the temple of Aesculapius',
    home: 'island-attendant',
    schedule: [
      { from: at('h2'), at: 'island-attendant', activity: 'stand' },
      { from: at('v1'), at: 'island-attendant', activity: 'sleep' },
    ],
    dialogue: 'dlg-daos-witnesses',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'middle', build: 'average', height: 1.7, skin: '#d1a684',
      hair: { style: 'receding', color: '#6a5a48' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'paenula', color: '#7d8a74' }],
      footwear: 'soleae',
    },
    barks: ['The god’s house is open to the sick. Free and slave, he asks no difference.', 'Sleep in the porch, wake with a dream, tell it to the priest.', 'A cock for the god, if you are cured. Or a hen. He is not particular.'],
    tags: ['plebs', 'pious', 'temple'],
  },
  {
    id: 'npc-cleon-aegrotus',
    name: 'Cleon',
    title: 'Patient in the sleeping porch',
    home: 'island-patients',
    schedule: [
      { from: at('h1'), at: 'island-patients', activity: 'sitGround' },
      { from: at('v1'), at: 'island-patients', activity: 'sleep' },
    ],
    dialogue: 'dlg-daos-witnesses',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.67, skin: '#cfa27c',
      hair: { style: 'curly-short', color: '#4a3424' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#cfc7b3' }, { kind: 'lacerna', color: '#8e8a80' }],
      footwear: 'barefoot',
    },
    barks: ['Nine nights I have slept in this porch and the god has dreamed nothing for me.', 'My leg is better. It is the waiting that wears me out.', 'They bring them in on hurdles and carry them out on their own feet. Mostly.'],
    tags: ['plebs', 'sick'],
  },
  {
    id: 'npc-bato-carter',
    name: 'Bato',
    title: 'Carter, for hire at the bridge',
    home: 'carter-bridgehead',
    schedule: [
      { from: at('h2'), at: 'carter-bridgehead', activity: 'sitGround' },
      { from: at('h11'), at: 'carter-bridgehead', activity: 'sleep' },
    ],
    dialogue: 'dlg-daos-witnesses',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'muscular', height: 1.72, skin: '#b07d58',
      hair: { style: 'cropped', color: '#2a1d14' }, beard: 'short',
      garments: [{ kind: 'tunica-short', color: '#8a7b60' }, { kind: 'paenula', color: '#5a4b3a' }],
      footwear: 'caligae',
    },
    barks: ['Anywhere on the Campus for an as, anywhere on the island for two. The bridge is narrow.', 'Mind the wheel. It bites.', 'Not before the third hour. The steward’s men have the bridge.'],
    tags: ['plebs', 'carter'],
  },
  {
    id: 'npc-stichus-actor',
    name: 'Stichus',
    title: 'Steward of Aebutius Capito’s household',
    dialogue: 'dlg-daos-steward',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'average', height: 1.7, skin: '#cfa27c',
      hair: { style: 'cropped', color: '#3a2a1c' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#9a8e6c' }, { kind: 'lacerna', color: '#4f5b4a' }, { kind: 'balteus', color: '#3c2c1c' }],
      footwear: 'calcei',
    },
    barks: ['A slave is a slave in a fever or out of one.', 'The master’s property goes home with the master’s steward. It is simple.'],
    tags: ['servus', 'steward'],
  },
  ...(['a', 'b'] as const).map(
    (k, i): NpcDef => ({
      id: `npc-daos-man-${k}`,
      name: 'The steward’s man',
      title: 'Hired muscle, Aebutius household',
      dialogue: 'dlg-daos-steward',
      disposition: 'neutral',
      appearance: {
        sex: 'male', age: 'adult', build: i ? 'heavy' : 'muscular', height: i ? 1.74 : 1.78, skin: i ? '#8e5e3e' : '#b07d58',
        hair: { style: 'cropped', color: '#1b1612' }, beard: i ? 'stubble' : 'none',
        garments: [{ kind: 'tunica-short', color: i ? '#6e5a44' : '#8a3c30' }],
        footwear: 'barefoot',
      },
      combat: archetype('collegium-bruiser', { kit: 0 }, { name: 'The steward’s man' }),
      barks: ['Move along, citizen. Slave business.', 'We are collecting, not talking.'],
      tags: ['plebs', 'bruiser'],
    }),
  ),
];

export default npcs;
