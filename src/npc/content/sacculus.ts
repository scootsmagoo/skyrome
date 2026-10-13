/**
 * The people of mq-06-sacculus, "The Purse" (docs/STORY.md chapter 6), from 13 May AD 113: the keeper of the Horrea
 * Agrippiana on the Vicus Tuscus, Euhodus's shop boy, the warehouse's night porter, the banker Hermogenes's clerk,
 * and Sextus Pinarius Avitus, the army's grain contractor.
 *
 * Their places are the Horrea Agrippiana's spots (builders/forum-velia.ts, content/places.ts: agrippiana-gate,
 * -bays, -office, -porter) and the two shops they work in. Avitus has no home and no schedule: mq-06 stages him in
 * his counting-room. His two hired knives are unnamed foes the quest spawns (AVITUS_KNIFE_PROFILE, kind 'grassator').
 *
 * Ids: the keeper is `npc-horrearius` (`npc-successus` is the Ludus armory keeper, npc/content/ludus.ts; none is defined here) and the
 * shop boy `npc-puer-euhodi` (rpg/data/factions.ts names an `npc-puer-euhodi` as the Greens' leader, with no NpcDef yet: give that man another id when he is built).
 */
import { at, shift } from '../../content/hours';
import { tier } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-horrearius',
    name: 'Primigenius',
    title: 'Keeper (horrearius) of the Horrea Agrippiana',
    home: 'agrippiana-gate',
    schedule: [
      { from: at('h1'), at: 'agrippiana-gate', activity: 'stand' },
      { from: at('h2'), at: 'agrippiana-gate', activity: 'sit' },
      { from: at('h11'), at: 'agrippiana-gate', activity: 'stand' },
      { from: at('v1'), at: 'agrippiana-gate', activity: 'sleep' }, // home above the cloth dealers (offstage)
    ],
    dialogue: 'npc-horrearius',
    disposition: 'friendly',
    // An old freedman who has kept other men's goods for thirty years: stooped, careful, tally tablets on his knee.
    appearance: {
      sex: 'male', age: 'old', build: 'stocky', height: 1.6, skin: '#c99a72',
      hair: { style: 'receding', color: '#cfcbc4' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#a89a78' }, { kind: 'lacerna', color: '#6e6450' }],
      footwear: 'soleae',
    },
    barks: ['Every bay has a lease and every lease has a name. I know them all.', 'Cloth on the left, oil on the right, and nothing in the passage.', 'Tally first, trust after. Thirty years and I have never been short.'],
    tags: ['plebs', 'dignitas:libertus', 'horrearius'],
  },
  {
    id: 'npc-puer-euhodi',
    name: 'Felix',
    title: 'Shop boy of Euhodus',
    home: 'taberna-armorum',
    schedule: [
      { from: at('h1'), at: 'taberna-armorum', activity: 'sweep' },
      { from: at('h2'), at: 'taberna-armorum', activity: 'stand' },
      { from: at('h6'), at: 'taberna-armorum', activity: 'sit' },
      { from: at('h8'), at: 'taberna-armorum', activity: 'stand' },
      { from: at('v1'), at: 'taberna-armorum', activity: 'sleep' }, // sleeps under the counter (offstage)
    ],
    dialogue: 'npc-puer-euhodi',
    disposition: 'friendly',
    // Thirteen, a slave's son: thin, quick, a tunic cut down from a bigger one.
    appearance: {
      sex: 'male', age: 'child', build: 'slight', height: 1.5, skin: '#a87650',
      hair: { style: 'cropped', color: '#2a1d14' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#b8ab8c' }],
      footwear: 'barefoot',
    },
    barks: ['Mind the blades, sir. They bite, and the master bills for it.', 'Whetstone, oil, rag. Whetstone, oil, rag.', 'Master says a shop boy is a pair of ears with legs.'],
    tags: ['puer', 'servus'],
  },
  {
    id: 'npc-ianitor-horreorum',
    name: 'Dasius',
    title: 'Night porter of the Horrea Agrippiana',
    home: 'agrippiana-porter',
    // On his corner from dusk to first light; asleep (off the streets) by day.
    schedule: shift('agrippiana-porter', 'stand', 'v1', 'h1'),
    dialogue: 'npc-ianitor-horreorum',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'adult', build: 'muscular', height: 1.74, skin: '#8e5e3e',
      hair: { style: 'curly-short', color: '#1b1612' }, beard: 'short',
      garments: [{ kind: 'tunica', color: '#7a6a52' }, { kind: 'paenula', color: '#4a4036' }],
      footwear: 'caligae',
    },
    combat: tier('civilian', { name: 'Night porter', health: 60, weapon: 'fustis', skill: 30 }),
    barks: ['Nothing moves in here after dark that I haven’t counted.', 'Cold on the feet, this watch. Warm on the purse, if the master’s generous.', 'Keys are the keeper’s. Eyes are mine.'],
    tags: ['plebs', 'ianitor'],
  },
  {
    id: 'npc-lycus',
    name: 'Lycus',
    title: 'Clerk of the banker Hermogenes',
    home: 'tabernae-aemiliae',
    // Reliably at the table all day (the argei errand of CONTENT.md is not built): he keeps it when Hermogenes goes to the basilica at the seventh hour.
    schedule: [
      { from: at('h2'), at: 'tabernae-aemiliae', activity: 'work' },
      { from: at('h9'), at: 'tabernae-aemiliae', activity: 'sleep' }, // home to the Subura (offstage)
    ],
    dialogue: 'npc-lycus',
    disposition: 'friendly',
    // Of The Purse's books but not of its plans (GDD §10.2): protected with his master until Act III.
    essential: true,
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.68, skin: '#ddb48f',
      hair: { style: 'cropped', color: '#4a3424' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4' }],
      footwear: 'soleae',
    },
    barks: ['Count it yourself if you don’t trust me. Everyone does.', 'My master’s busy. My master is always busy.', 'A stylus behind the ear, wax in the hand, and still I lose things.'],
    tags: ['plebs', 'dignitas:libertus', 'coniuratio-unwitting'],
  },
  {
    id: 'npc-avitus',
    name: 'Sextus Pinarius Avitus',
    title: 'Contractor for the army’s grain',
    // No home and no schedule: mq-06 stages him in his counting-room (`agrippiana-office`).
    dialogue: 'npc-avitus',
    disposition: 'neutral',
    // Fat, rich and frightened: a fine tunic with the narrow stripe of the knights, a good lacerna, rings on three
    // fingers. He does not fight; the knife-men do it for him.
    combat: tier('civilian', { name: 'Avitus', health: 60, skill: 10 }),
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.66, skin: '#ddb48f',
      hair: { style: 'receding', color: '#8a8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4', clavi: 'narrow' }, { kind: 'lacerna', color: '#6a2a44', trim: '#c9a43c' }],
      footwear: 'calcei',
    },
    barks: ['A war is the best customer Rome has.', 'I do not hold a knife. I hold a warehouse.', 'Everything has a price. Name yours.'],
    tags: ['dignitas:eques', 'coniuratio-masked', 'contractor'],
  },
];

export default npcs;
