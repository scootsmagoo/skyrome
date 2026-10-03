/**
 * v0.1 vendors (GDD §7.3, §17.1: the arms dealer who also repairs, the popina and the aedituus are
 * Must; the aedituus lives with the Castor NPCs and the Ludus medicus with the Ludus). Stock uses
 * catalogue ids at their §7.2 values; purses follow the §7.3 vendor kinds. A vendor is a `vendor:<kind>`
 * tag plus `vendor.stock`.
 */
import type { NpcDef } from '../types';

const shopDay = (at: string, from = 6, to = 19) => [
  { from: 0, at, activity: 'sleep' as const },
  { from, at, activity: 'work' as const },
  { from: to, at, activity: 'sleep' as const },
];

const npcs: NpcDef[] = [
  {
    id: 'npc-annius-aper',
    name: 'Marcus Annius Aper',
    title: 'Arms dealer (Sacra Via)',
    home: 'taberna-armorum',
    schedule: shopDay('taberna-armorum', 6.5, 19),
    dialogue: 'npc-annius-aper',
    disposition: 'neutral',
    services: ['vendor', 'smith'],
    vendor: {
      stock: [
        { id: 'pugio', count: 4 }, { id: 'sica', count: 2 }, { id: 'gladius', count: 4 }, { id: 'spatha', count: 1 }, { id: 'hasta', count: 3 },
        { id: 'fustis', count: 4 }, { id: 'clava', count: 2 }, { id: 'caestus', count: 2 }, { id: 'pugio-noric', count: 1 }, { id: 'gladius-noric', count: 1 },
        { id: 'gladius-bilbilis', count: 1 }, { id: 'scutum', count: 1 }, { id: 'scutum-ovale', count: 2 }, { id: 'parma', count: 2 }, { id: 'parmula', count: 2 },
        { id: 'subarmalis', count: 2 }, { id: 'thorax-coriaceus', count: 2 }, { id: 'lorica-hamata', count: 1 }, { id: 'galea-gallica', count: 1 }, { id: 'galea-italica', count: 1 },
        { id: 'manica-linea', count: 2 }, { id: 'ocreae', count: 1 }, { id: 'instrumentum-fabri', count: 2 }, { id: 'glans-plumbea', count: 40 }, { id: 'funda', count: 2 },
      ],
      denarii: 500,
    },
    // From Bilbilis in Tarraconensis (Martial's town), so he talks steel like other men talk horses.
    appearance: {
      sex: 'male', age: 'middle', build: 'stocky', height: 1.7, skin: '#bd9067',
      hair: { style: 'cropped', color: '#5c5751' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#a8382a' }, { kind: 'apron', color: '#5e4a36' }, { kind: 'balteus', color: '#3b2a1c' }],
      footwear: 'calcei', weapon: 'pugio',
    },
    barks: ['Bilbilis steel! Quenched in the Salo, the coldest river in Spain!', 'Repairs while you wait. Well, while you wait a while.', 'A gladius for the Ludus? Three kinds: cheap, good, and mine.'],
    tags: ['vendor:armorum-negotiator', 'dignitas:civis'],
  },
  {
    id: 'npc-vibia-sabina',
    name: 'Vibia Sabina',
    title: 'Keeper of the Cockerel (popina)',
    home: 'popina-vicus-tuscus',
    schedule: [
      { from: 0, at: 'popina-vicus-tuscus', activity: 'work' },
      { from: 2, at: 'popina-vicus-tuscus', activity: 'sleep' },
      { from: 8, at: 'popina-vicus-tuscus', activity: 'work' },
    ],
    dialogue: 'npc-vibia-sabina',
    disposition: 'friendly',
    services: ['vendor', 'innkeeper'],
    vendor: {
      stock: [
        { id: 'vinum', count: 30 }, { id: 'vinum-melius', count: 12 }, { id: 'vinum-falernum', count: 4 }, { id: 'posca', count: 10 }, { id: 'mulsum', count: 6 },
        { id: 'panis', count: 12 }, { id: 'puls', count: 8 }, { id: 'botulus', count: 8 }, { id: 'caseus', count: 6 }, { id: 'olivae', count: 6 },
        { id: 'ficus', count: 6 }, { id: 'patina', count: 3 }, { id: 'libum', count: 6 },
      ],
      denarii: 40,
    },
    appearance: {
      sex: 'female', age: 'middle', build: 'heavy', height: 1.57, skin: '#d9ab84',
      hair: { style: 'bun', color: '#4a3524' },
      garments: [{ kind: 'tunica-long', color: '#9a5a3a' }, { kind: 'apron', color: '#cfc4ad' }],
      footwear: 'soleae',
    },
    barks: ['Wine for an as, better for two, Falernian for four!', 'Sit, sit, nobody bites here. Except the bread.', 'Pay first, then sing.'],
    tags: ['vendor:popina', 'plebs', 'dignitas:libertus'],
  },
  {
    id: 'npc-philetus',
    name: 'Philetus',
    title: 'Baker of the Velabrum',
    home: 'pistrinum-velabri',
    schedule: [
      { from: 0, at: 'pistrinum-velabri', activity: 'sleep' },
      { from: 3, at: 'pistrinum-velabri', activity: 'work' },
      { from: 14, at: 'pistrinum-velabri', activity: 'sit' },
      { from: 20, at: 'pistrinum-velabri', activity: 'sleep' },
    ],
    dialogue: 'npc-philetus',
    disposition: 'friendly',
    services: ['vendor'],
    vendor: { stock: [{ id: 'panis', count: 30 }, { id: 'libum', count: 12 }], denarii: 20 },
    appearance: {
      sex: 'male', age: 'adult', build: 'heavy', height: 1.65, skin: '#e3bf9f',
      hair: { style: 'cropped', color: '#b08a52' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#e0d8c6' }, { kind: 'apron', color: '#efe9dc' }],
      footwear: 'soleae',
    },
    barks: ['Fresh bread! Still warm!', 'Honey cakes for the gods, one as!', 'Up since the third watch. Buy something.'],
    tags: ['vendor:pistor', 'plebs', 'dignitas:libertus'],
  },
  {
    id: 'npc-sextus-niger',
    name: 'Sextus Niger',
    title: 'Fuller of the Velabrum',
    home: 'fullonica-velabri',
    schedule: shopDay('fullonica-velabri', 6, 18),
    dialogue: 'npc-sextus-niger',
    disposition: 'neutral',
    services: ['vendor'],
    vendor: { stock: [{ id: 'tunica', count: 4 }, { id: 'tunica-crassa', count: 2 }, { id: 'paenula', count: 1 }, { id: 'cucullus', count: 2 }], denarii: 30 },
    appearance: {
      sex: 'male', age: 'middle', build: 'muscular', height: 1.68, skin: '#bb8660',
      hair: { style: 'cropped', color: '#2a1f17' }, beard: 'stubble',
      garments: [{ kind: 'tunica-short', color: '#cfc4ad' }],
      footwear: 'barefoot',
    },
    barks: ['Clean as a Vestal’s conscience, four asses a tunic!', 'The smell? That’s the smell of clean.'],
    tags: ['vendor:fullo', 'plebs'],
  },
  {
    id: 'npc-thallus',
    name: 'Thallus',
    title: 'Barber by the Rostra',
    home: 'forum-tonsor',
    schedule: shopDay('forum-tonsor', 6, 17),
    dialogue: 'npc-thallus',
    disposition: 'friendly',
    services: ['barber', 'vendor'],
    vendor: { stock: [{ id: 'fascinum', count: 2 }], denarii: 20 },
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.63, skin: '#c09670',
      hair: { style: 'curly-short', color: '#2e2219' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#b08a4a' }, { kind: 'apron', color: '#e0d8c6' }],
      footwear: 'soleae',
    },
    barks: ['A shave, citizen? You look like a Dacian.', 'Sit, sit. Gossip is free; the razor is two asses.'],
    tags: ['vendor:tonsor', 'plebs', 'dignitas:libertus'],
  },
  {
    id: 'npc-abdes',
    name: 'Abdes the Chaldaean',
    title: 'Astrologer by the Circus',
    home: 'circus-arcades',
    schedule: shopDay('circus-arcades', 7, 20),
    dialogue: 'npc-abdes',
    disposition: 'friendly',
    services: ['vendor'],
    vendor: { stock: [{ id: 'tabella-mathematici', count: 10 }, { id: 'fascinum', count: 2 }, { id: 'lunula', count: 1 }], denarii: 50 },
    // A Syrian from Emesa calling himself a Chaldaean: long tunic, short beard, a chalk board.
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.66, skin: '#b07c58',
      hair: { style: 'curly-short', color: '#1f1914' }, beard: 'full',
      garments: [{ kind: 'tunica-long', color: '#2f6e74' }, { kind: 'lacerna', color: '#8f4a35' }],
      footwear: 'soleae',
    },
    barks: ['Your stars, citizen? One as!', 'Saturn in the eighth house. A journey, a loss, a letter.', 'I foretold the death of Domitian. Afterwards, but still.'],
    tags: ['vendor:mathematicus', 'dignitas:peregrinus'],
  },
  {
    id: 'npc-iulia-helpis',
    name: 'Iulia Helpis',
    title: 'Pearl seller (Porticus Margaritaria)',
    home: 'porticus-margaritaria',
    schedule: shopDay('porticus-margaritaria', 8, 18),
    dialogue: 'npc-iulia-helpis',
    disposition: 'neutral',
    services: ['vendor'],
    vendor: { stock: [{ id: 'gemma', count: 1 }, { id: 'lunula', count: 2 }, { id: 'bulla', count: 1 }, { id: 'nodus-isidis', count: 1 }, { id: 'vitrum', count: 3 }], denarii: 150, buys: ['misc'] },
    // Margaritarii of the Sacra Via are attested in Roman inscriptions [A]; this one is fictional.
    appearance: {
      sex: 'female', age: 'adult', build: 'slight', height: 1.58, skin: '#cf9f78',
      hair: { style: 'trajanic-tower', color: '#2a1f17' },
      garments: [{ kind: 'tunica-long', color: '#efe9dc' }, { kind: 'stola', color: '#2f6e74' }, { kind: 'palla', color: '#d19a3a' }],
      footwear: 'calcei',
    },
    barks: ['Pearls from the Red Sea, for the lady who has everything.', 'Glass? Madam, I would never.'],
    tags: ['dignitas:libertus'],
  },
];

export default npcs;
