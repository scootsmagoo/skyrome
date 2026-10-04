/**
 * Vendors and service people (docs/CONTENT.md §2.D). v0.1 ships three (GDD §17.1 Must): Euhodus
 * (arms, repairs), Vibia Chreste (the Silver Pig) and Philetus (aedituus of Castor). The Should
 * ones (Demetrius the physician, Tryphon the barber, Fortunata's honey cakes, Cerinthus the fuller)
 * and the city's other trades (the crier, the vicomagister, the diviners by the Circus, the baker,
 * the perfumer, the innkeeper, the banker and the clothier) stand in their places too; their
 * v0.2 quests come later. Stock is `id count` from §4 at §7.2 values; purses follow §7.3.
 */
import { at } from '../../content/hours';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-euhodus',
    name: 'Tiberius Claudius Euhodus',
    title: 'Arms dealer (Sacra Via)',
    home: 'taberna-armorum',
    schedule: [
      { from: at('h1'), at: 'taberna-armorum', activity: 'work' },
      { from: at('h6'), at: 'taberna-armorum', activity: 'sit' },
      { from: at('h8'), at: 'taberna-armorum', activity: 'work' },
      { from: at('v1'), at: 'taberna-armorum', activity: 'sleep' }, // home to the Carinae (offstage)
    ],
    dialogue: 'npc-euhodus',
    disposition: 'neutral',
    // Secretly of The Purse cell (GDD §10.2): protected until mq-06 resolves.
    essential: true,
    services: ['vendor', 'smith'],
    vendor: {
      stock: [
        { id: 'pugio', count: 3 }, { id: 'sica', count: 1 }, { id: 'gladius', count: 3 }, { id: 'gladius-noric', count: 1 }, { id: 'spatha', count: 1 },
        { id: 'hasta', count: 2 }, { id: 'lancea', count: 4 }, { id: 'fustis', count: 4 }, { id: 'clava', count: 2 }, { id: 'caestus', count: 2 },
        { id: 'scutum', count: 1 }, { id: 'scutum-ovale', count: 1 }, { id: 'parma', count: 1 }, { id: 'parmula', count: 1 }, { id: 'subarmalis', count: 2 },
        { id: 'thorax-coriaceus', count: 1 }, { id: 'lorica-hamata', count: 1 }, { id: 'galea-gallica', count: 1 }, { id: 'galea-italica', count: 1 },
        { id: 'manica-linea', count: 2 }, { id: 'ocreae', count: 1 }, { id: 'fascia', count: 5 },
      ],
      denarii: 500,
    },
    // A rich freedman: dyed hair, three gold rings, a scale for weighing blades.
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.67, skin: '#ddb48f',
      hair: { style: 'cropped', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'lacerna', color: '#9c4a3a' }],
      footwear: 'calcei',
    },
    barks: ['Iron from Noricum, steel from Bilbilis, prices from heaven.', 'Parthia! Every recruit needs a sword, and every sword needs me.', 'Repairs while you wait. Waiting is extra.', 'No segmentata. I don’t sell army plate. Officially.'],
    tags: ['vendor:armorum-negotiator', 'dignitas:libertus', 'coniuratio-masked'],
  },
  {
    id: 'npc-chreste',
    name: 'Vibia Chreste',
    title: 'Keeper of the Silver Pig',
    home: 'popina-vici-tusci',
    schedule: [
      { from: at('v3'), at: 'popina-vici-tusci', activity: 'sleep' },
      { from: at('v4'), at: 'pistrinum-velabri', activity: 'talk' }, // buys bread
      { from: at('h1'), at: 'popina-vici-tusci', activity: 'work' },
      { from: at('v2'), at: 'popina-vici-tusci', activity: 'sweep' },
    ],
    dialogue: 'npc-chreste',
    disposition: 'friendly',
    services: ['vendor', 'innkeeper'],
    vendor: {
      stock: [
        { id: 'vinum', count: 30 }, { id: 'vinum-melius', count: 20 }, { id: 'vinum-falernum', count: 6 }, { id: 'mulsum', count: 6 }, { id: 'posca', count: 10 },
        { id: 'panis', count: 12 }, { id: 'puls', count: 8 }, { id: 'botulus', count: 8 }, { id: 'caseus', count: 6 }, { id: 'olivae', count: 6 },
        { id: 'ficus', count: 6 }, { id: 'lupini', count: 10 }, { id: 'cicer', count: 10 }, { id: 'patina', count: 4 }, { id: 'fabae', count: 12 },
      ],
      denarii: 40,
    },
    appearance: {
      sex: 'female', age: 'middle', build: 'stocky', height: 1.54, skin: '#b07d58',
      hair: { style: 'bun', color: '#2a1d14' },
      garments: [{ kind: 'tunica-long', color: '#cc9a35' }, { kind: 'apron', color: '#e2dac6' }],
      footwear: 'soleae',
    },
    barks: ['An as for the house wine, two for the better, four if you want to remember Campania.', 'Hot chickpeas! Lupins! Sit or move, the step isn’t free.', 'Dice in my popina and the aedile’s men will drink for free. On you.', 'Knife-men in the burned taberna, so they say. I say nothing. I sell wine.', 'On ghost night you pay before midnight. After midnight the dead pay, and the dead are terrible at it.'],
    tags: ['vendor:popina', 'plebs', 'dignitas:libertus'],
  },
  {
    id: 'npc-philetus',
    name: 'Marcus Pomponius Philetus',
    title: 'Aedituus of the Temple of Castor',
    home: 'temple-castor-pollux:front',
    schedule: [
      { from: at('h1'), at: 'temple-castor-pollux:front', activity: 'work' }, // opens the doors (on the Lemuria: stands at the shut doors)
      { from: at('h6'), at: 'temple-castor-pollux:front', activity: 'sit' },
      { from: at('h7'), at: 'temple-castor-pollux:front', activity: 'work' },
      { from: at('v1'), at: 'temple-castor-pollux:front', activity: 'sweep' }, // closes
      { from: at('v2'), at: 'temple-castor-pollux:front', activity: 'sleep' },
    ],
    dialogue: 'npc-philetus',
    disposition: 'friendly',
    services: ['vendor', 'priest', 'trainer'],
    vendor: { stock: [{ id: 'libum', count: 12 }, { id: 'tus', count: 20 }, { id: 'lucerna', count: 6 }], denarii: 100 },
    trainer: { skill: 'religio', maxLevel: 40 },
    appearance: {
      sex: 'male', age: 'old', build: 'slight', height: 1.62, skin: '#c99a72',
      hair: { style: 'receding', color: '#cfcbc4' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }],
      footwear: 'soleae',
    },
    barks: ['The Lemures walk tonight. The god’s doors stay shut. Come back tomorrow.', 'Twins, both divine, both horsemen, both patient. Unlike my visitors.', 'An offering for the Dioscuri? A cake will do. A coin will do better.', 'The strongrooms? Down the side, under the podium. They’re not the god’s; they’re the bankers’.'],
    tags: ['vendor:aedituus', 'pious', 'dignitas:libertus'],
  },
  {
    id: 'npc-demetrius',
    name: 'Demetrius of Tralles',
    title: 'Physician (Basilica Paulli)',
    home: 'tabernae-aemiliae',
    schedule: [
      { from: at('h2'), at: 'tabernae-aemiliae', activity: 'work' },
      { from: at('h9'), at: 'tabernae-aemiliae', activity: 'sleep' },
    ],
    dialogue: 'npc-demetrius',
    disposition: 'neutral',
    services: ['healer', 'vendor', 'trainer'],
    vendor: { stock: [{ id: 'fascia', count: 12 }, { id: 'emplastrum', count: 6 }, { id: 'collyrium', count: 3 }, { id: 'theriaca', count: 1 }, { id: 'febrifugum', count: 2 }], denarii: 150 },
    trainer: { skill: 'medicina', maxLevel: 40 },
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.65, skin: '#c99a72',
      hair: { style: 'curly-short', color: '#4a3424' }, beard: 'short',
      garments: [{ kind: 'tunica-long', color: '#f2eee4' }, { kind: 'palla', color: '#a5916c' }],
      footwear: 'soleae',
    },
    barks: ['Wine for the wound, honey for the scar, and two denarii for me.', 'Archigenes charges a senator’s fee. I charge a baker’s. Choose.'],
    tags: ['vendor:medicus', 'greek'],
  },
  {
    id: 'npc-tryphon',
    name: 'Tryphon',
    title: 'Barber (Basilica Paulli)',
    home: 'tabernae-aemiliae',
    schedule: [
      { from: at('h1'), at: 'tabernae-aemiliae', activity: 'work' },
      { from: at('h8'), at: 'basilica-julia-gradus', activity: 'talk' },
      { from: at('v1'), at: 'tabernae-aemiliae', activity: 'sleep' },
    ],
    dialogue: 'npc-tryphon',
    disposition: 'friendly',
    services: ['barber'],
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.63, skin: '#b07d58',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'apron', color: '#cfc4ad' }],
      footwear: 'soleae',
    },
    barks: ['A shave, citizen? You look like a mourner, or a philosopher, or worse, a Greek.', 'Sit still. My razor is fast and my tongue is faster.', 'They say the emperor shaves himself. They say a lot of things.'],
    tags: ['vendor:tonsor', 'plebs', 'dignitas:libertus'],
  },
  {
    id: 'npc-cerdo',
    name: 'Lucius Seius Cerdo',
    title: 'Public crier',
    home: 'rostra:front',
    schedule: [
      { from: at('h2'), at: 'rostra:front', activity: 'stand' },
      { from: at('h6'), at: 'basilica-julia-gradus', activity: 'sit' },
      { from: at('h8'), at: 'rostra:front', activity: 'stand' },
      { from: at('v1'), at: 'rostra:front', activity: 'sleep' },
    ],
    dialogue: 'npc-cerdo',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.68, skin: '#c99a72',
      hair: { style: 'cropped', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'toga', color: '#efe8d8' }],
      footwear: 'calcei',
    },
    barks: [
      'Hear, Quirites! A bronze pot has walked out of a shop in the Vicus Tuscus. Sixty-five sesterces for its return, more for the thief!',
      'Tomorrow, the gods willing, Caesar dedicates his column. The Forum will be closed to carts from the fourth hour.',
      'Lost: a Molossian bitch answering to Hilara. She answers to nothing. Reward.',
      'The Lemures walk tonight! The temples are shut! The taverns are not!',
    ],
    tags: ['plebs', 'praeco', 'dignitas:civis'],
  },
  {
    id: 'npc-zethus',
    name: 'Marcus Lucretius Zethus',
    title: 'Vicomagister of the Vicus Tuscus',
    home: 'compitum-vici-tusci',
    schedule: [
      { from: at('h1'), at: 'compitum-vici-tusci', activity: 'pray' },
      { from: at('h2'), at: 'compitum-vici-tusci', activity: 'sweep' },
      { from: at('h7'), at: 'popina-vici-tusci', activity: 'sit' },
      { from: at('h12'), at: 'compitum-vici-tusci', activity: 'pray' }, // lights the lamp
      { from: at('v1'), at: 'compitum-vici-tusci', activity: 'sleep' },
    ],
    dialogue: 'npc-zethus',
    disposition: 'friendly',
    services: ['priest', 'trainer'],
    trainer: { skill: 'religio', maxLevel: 40 },
    // On his days of office the vicomagister wears the bordered toga praetexta [A].
    appearance: {
      sex: 'male', age: 'old', build: 'slight', height: 1.6, skin: '#ddb48f',
      hair: { style: 'receding', color: '#cfcbc4' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'toga', color: '#efe8d8', trim: '#5b1f3b' }],
      footwear: 'calcei',
    },
    barks: ['The Lares see the whole street. Behave as if they do.', 'A pinch of incense costs an as. Bad luck costs more.', 'We renewed our altar this January, when Celsus was consul again. Look, it’s carved.'],
    tags: ['plebs', 'pious', 'dignitas:libertus'],
  },
  {
    id: 'npc-fortunata',
    name: 'Fortunata',
    title: 'Seller of honey cakes',
    home: 'temple-castor-pollux:front',
    schedule: [
      { from: at('h1'), at: 'temple-castor-pollux:front', activity: 'stand' }, // a tray by the steps
      { from: at('h10'), at: 'pistrinum-velabri', activity: 'work' },
      { from: at('v1'), at: 'pistrinum-velabri', activity: 'sleep' },
    ],
    dialogue: 'npc-fortunata',
    disposition: 'friendly',
    services: ['vendor'],
    vendor: { stock: [{ id: 'libum', count: 20 }, { id: 'tus', count: 10 }, { id: 'mel', count: 3 }], denarii: 20 },
    appearance: {
      sex: 'female', age: 'adult', build: 'slight', height: 1.52, skin: '#8e5e3e',
      hair: { style: 'bun', color: '#1b1612' },
      garments: [{ kind: 'tunica-long', color: '#e2dac6' }, { kind: 'apron', color: '#cfc4ad' }],
      footwear: 'barefoot',
    },
    barks: ['Liba! Honey cakes for the gods and for you!', 'One for Castor, one for Pollux, one for your stomach.', 'Shut for the dead today, but the gods still eat tomorrow.'],
    tags: ['vendor:pistor', 'servus'],
  },
  {
    id: 'npc-cerinthus',
    name: 'Cerinthus',
    title: 'Fuller of the Velabrum',
    home: 'fullonica-velabri',
    schedule: [
      { from: at('h1'), at: 'fullonica-velabri', activity: 'work' },
      { from: at('v1'), at: 'fullonica-velabri', activity: 'sleep' },
    ],
    dialogue: 'npc-cerinthus',
    disposition: 'neutral',
    services: ['vendor'],
    vendor: { stock: [{ id: 'tunica', count: 4 }, { id: 'tunica-crassa', count: 2 }, { id: 'paenula', count: 1 }, { id: 'cucullus', count: 2 }], denarii: 30 },
    // Legs stained grey to the knee from the vats.
    appearance: {
      sex: 'male', age: 'middle', build: 'stocky', height: 1.61, skin: '#b07d58',
      hair: { style: 'cropped', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#cfc4ad' }, { kind: 'apron', color: '#8e8a80' }],
      footwear: 'barefoot',
    },
    barks: ['Bring me your stains. I’ve a vat for everything, and you don’t want to know what’s in it.', 'Minerva’s my goddess. Urine’s my trade.', 'Non olet, said the deified Vespasian. He never smelled my yard.'],
    tags: ['vendor:fullo', 'plebs', 'dignitas:libertus'],
  },
  // ---- the city's other trades (their quests are v0.2; they stand in their places in v0.1)
  {
    id: 'npc-zenon',
    name: 'Zenon of Seleucia',
    title: 'Astrologer (mathematicus)',
    home: 'astrologi-circi',
    schedule: [
      { from: at('v3'), at: 'astrologi-circi', activity: 'sleep' },
      { from: at('h3'), at: 'astrologi-circi', activity: 'sit' },
      { from: at('v1'), at: 'astrologi-circi', activity: 'work' }, // stars by night
    ],
    dialogue: 'npc-zenon',
    disposition: 'friendly',
    services: ['vendor'],
    vendor: { stock: [{ id: 'tabella-mathematici', count: 10 }], denarii: 50 },
    // An Easterner: the full beard, a mantle embroidered with stars, a bronze sphere.
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.7, skin: '#b07d58',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'full',
      garments: [{ kind: 'tunica-long', color: '#4f6e6a' }, { kind: 'lacerna', color: '#2d3a5a' }],
      footwear: 'soleae',
    },
    barks: ['Your nativity, citizen? Saturn in the eighth. Terrible. Ten denarii and I’ll fix it.', 'The stars incline; they do not compel. Mostly.', 'Whose stars? Nobody’s. Everybody’s. Don’t ask.'],
    tags: ['vendor:mathematicus', 'dignitas:peregrinus'],
  },
  {
    id: 'npc-arruns',
    name: 'Arruns',
    title: 'Haruspex of the Circus booths',
    home: 'astrologi-circi',
    schedule: [
      { from: at('h2'), at: 'astrologi-circi', activity: 'sit' },
      { from: at('v1'), at: 'astrologi-circi', activity: 'sleep' },
    ],
    dialogue: 'npc-arruns',
    disposition: 'neutral',
    // A fringed cloak with a brooch and a tall pointed cap.
    appearance: {
      sex: 'male', age: 'old', build: 'heavy', height: 1.64, skin: '#c99a72',
      hair: { style: 'receding', color: '#cfcbc4' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#e2dac6' }, { kind: 'paenula', color: '#5a4632' }],
      footwear: 'calcei', armor: { helmet: { kind: 'leather-cap' } },
    },
    barks: ['The liver does not lie. Men lie. Livers are honest.', 'Two denarii, and the gods will whisper. Five, and they’ll speak up.', 'Ask the Chaldaean whose stars he sells. Go on, ask him.'],
    tags: ['vendor:haruspex', 'pious', 'dignitas:civis'],
  },
  {
    id: 'npc-philadelphus',
    name: 'Philadelphus',
    title: 'Baker of the Velabrum',
    home: 'pistrinum-velabri',
    schedule: [
      { from: at('v3'), at: 'pistrinum-velabri', activity: 'work' }, // bakers work at night (Martial 12.57)
      { from: at('h4'), at: 'pistrinum-velabri', activity: 'sit' },
      { from: at('h6'), at: 'pistrinum-velabri', activity: 'sleep' },
      { from: at('v2'), at: 'pistrinum-velabri', activity: 'work' },
    ],
    dialogue: 'npc-philadelphus',
    disposition: 'friendly',
    services: ['vendor'],
    vendor: { stock: [{ id: 'panis', count: 30 }, { id: 'libum', count: 10 }], denarii: 20 },
    appearance: {
      sex: 'male', age: 'adult', build: 'heavy', height: 1.66, skin: '#c99a72',
      hair: { style: 'cropped', color: '#2a1d14' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#e2dac6' }, { kind: 'apron', color: '#efe9dc' }],
      footwear: 'barefoot',
    },
    barks: ['A hundred modii a day for three years and I’m a citizen. Ninety-one to go today.', 'Bread! Still warm, unlike the city.', 'Donkeys turn the mill, I turn the donkeys.'],
    tags: ['vendor:pistor', 'plebs', 'dignitas:latinus-iunianus'],
  },
  {
    id: 'npc-fadia',
    name: 'Fadia Musa',
    title: 'Perfumer of the Vicus Tuscus',
    home: 'seplasia-vici-tusci',
    schedule: [
      { from: at('h2'), at: 'seplasia-vici-tusci', activity: 'work' },
      { from: at('h10'), at: 'basilica-aemilia:front', activity: 'wander' },
      { from: at('v1'), at: 'seplasia-vici-tusci', activity: 'sleep' },
    ],
    dialogue: 'npc-fadia',
    disposition: 'neutral',
    services: ['vendor'],
    vendor: {
      stock: [{ id: 'tus', count: 30 }, { id: 'myrrha', count: 4 }, { id: 'ruta', count: 6 }, { id: 'salvia', count: 6 }, { id: 'allium', count: 6 }, { id: 'absinthium', count: 4 }, { id: 'papaver', count: 2 }, { id: 'nardus', count: 2 }, { id: 'acetum', count: 6 }],
      denarii: 120,
    },
    appearance: {
      sex: 'female', age: 'adult', build: 'slight', height: 1.55, skin: '#ddb48f',
      hair: { style: 'bun', color: '#6b3a22' },
      garments: [{ kind: 'tunica-long', color: '#c77b83' }, { kind: 'palla', color: '#6b3a6e' }],
      footwear: 'soleae',
    },
    barks: ['Nard from India, myrrh from Arabia, honesty from nowhere, sadly.', 'Smell that? That’s money that hasn’t been spent yet.', 'Incense for the gods, perfume for the living, vinegar for the doctors.'],
    tags: ['vendor:seplasiarius', 'dignitas:libertus'],
  },
  {
    id: 'npc-dama',
    name: 'Lucius Novius Dama',
    title: 'Innkeeper of the Inn at the Starting Gates',
    home: 'caupona-carcerum',
    schedule: [
      { from: at('v3'), at: 'caupona-carcerum', activity: 'sleep' },
      { from: at('h1'), at: 'caupona-carcerum', activity: 'work' },
    ],
    dialogue: 'npc-dama',
    disposition: 'friendly',
    services: ['vendor', 'innkeeper'],
    vendor: { stock: [{ id: 'cena', count: 6 }, { id: 'vinum', count: 20 }, { id: 'vinum-melius', count: 10 }, { id: 'panis', count: 10 }, { id: 'puls', count: 6 }], denarii: 60 },
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.63, skin: '#b07d58',
      hair: { style: 'bald', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#7a6248' }, { kind: 'apron', color: '#cfc4ad' }],
      footwear: 'soleae',
    },
    barks: ['A bed for four asses, fleas for free.', 'Race days I triple the price and nobody notices.', 'The carter’s been telling that story since dawn. It gets better every cup.'],
    tags: ['vendor:caupona', 'plebs', 'dignitas:libertus'],
  },
  {
    id: 'npc-hermogenes',
    name: 'Hermogenes',
    title: 'Banker (Basilica Paulli)',
    home: 'tabernae-aemiliae',
    schedule: [
      { from: at('h2'), at: 'tabernae-aemiliae', activity: 'work' },
      { from: at('h7'), at: 'basilica-aemilia:front', activity: 'talk' },
      { from: at('h8'), at: 'tabernae-aemiliae', activity: 'sleep' }, // home to the Esquiline (offstage)
    ],
    dialogue: 'npc-hermogenes',
    disposition: 'neutral',
    essential: true, // of The Purse cell (GDD §10.2), protected until mq-06
    services: ['banker', 'vendor'],
    vendor: { stock: [], denarii: 3000 },
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.64, skin: '#ddb48f',
      hair: { style: 'cropped', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'toga', color: '#efe8d8' }],
      footwear: 'calcei',
    },
    barks: ['One in the hundred a month. The law’s limit, and my pleasure.', 'Plated denarii? Not at my table. Bite them yourself.', 'Letters of credit to Brundisium, Antioch, anywhere Caesar goes.'],
    tags: ['vendor:argentarius', 'dignitas:civis', 'coniuratio-masked'],
  },
  {
    id: 'npc-tychicus',
    name: 'Tiberius Claudius Tychicus',
    title: 'Clothier in the Horrea Agrippiana',
    home: 'taberna-vestiarii',
    schedule: [
      { from: at('h2'), at: 'taberna-vestiarii', activity: 'work' },
      { from: at('h11'), at: 'taberna-vestiarii', activity: 'sit' },
      { from: at('v2'), at: 'taberna-vestiarii', activity: 'sleep' }, // "We close early on some nights. Don't ask which."
    ],
    dialogue: 'npc-tychicus',
    disposition: 'neutral',
    services: ['vendor'],
    vendor: {
      stock: [
        { id: 'tunica', count: 6 }, { id: 'tunica-crassa', count: 3 }, { id: 'tunica-linea', count: 2 }, { id: 'tunica-longa', count: 2 }, { id: 'toga', count: 2 },
        { id: 'toga-fina', count: 1 }, { id: 'stola', count: 2 }, { id: 'stola-fina', count: 1 }, { id: 'palla', count: 3 }, { id: 'palla-fina', count: 1 },
        { id: 'paenula', count: 3 }, { id: 'lacerna', count: 2 }, { id: 'cucullus', count: 4 }, { id: 'petasus', count: 2 }, { id: 'calcei', count: 4 },
        { id: 'soleae', count: 4 }, { id: 'caligae', count: 2 }, { id: 'fasciae', count: 4 },
      ],
      denarii: 150,
    },
    appearance: {
      sex: 'male', age: 'middle', build: 'average', height: 1.66, skin: '#c99a72',
      hair: { style: 'cropped', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }, { kind: 'lacerna', color: '#5e9a8a' }],
      footwear: 'calcei',
    },
    barks: ['A toga for a citizen, a palla for a lady, a hood for a man with a past.', 'Dyed in Tarentum, cut in Rome, worn by the lucky.', 'We close early on some nights. Don’t ask which.'],
    tags: ['vendor:vestiarius', 'dignitas:libertus'],
  },
];

export default npcs;
