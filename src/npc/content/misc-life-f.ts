/**
 * The named people of the first three phase-2 side quests who are not keepers at a station (the
 * keepers, Primus, Felix and Crispina, are in src/life/data/keepers/quests-f.ts), docs/design/
 * world-life.md §4.8:
 *
 *   misc-hilara          Fuscus, stable-lad at the Inn at the Starting Gates
 *   misc-urna-aenea      Cnaeus the dicer at the Silver Pig; the optio of the vigiles (also Q3)
 *   misc-fur-balnearius  Sabinus the capsarius at the Baths of Titus; the slave he sends out with a
 *                        bundle (no schedule: the quest stages him)
 * (Onesimus, who writes curse tablets among the tombs outside the Porta Capena, is a keeper: src/life/data/keepers/quests-f.ts)
 */
import { at } from '../../content/hours';
import { archetype } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  // ---------------------------------------------------------------- misc-hilara
  {
    id: 'npc-fuscus-carcerum',
    name: 'Fuscus',
    title: 'Stable-lad at the Starting Gates',
    home: 'caupona-carcerum',
    schedule: [
      { from: at('h2'), at: 'caupona-carcerum', activity: 'stand' },
      { from: at('v2'), at: 'caupona-carcerum', activity: 'sleep' },
    ],
    dialogue: 'npc-fuscus-carcerum',
    disposition: 'friendly',
    appearance: {
      sex: 'male', age: 'young', build: 'slight', height: 1.62, skin: '#a9764f',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#8a7a5c' }],
      footwear: 'barefoot',
    },
    barks: ['Horses, harness, a bucket of water! Mind the dung!', 'The Reds’ colts are out, the Greens’ are sulking.'],
    tags: ['plebs'],
  },
  // ---------------------------------------------------------------- misc-urna-aenea
  {
    id: 'npc-cnaeus-aleator',
    name: 'Cnaeus',
    title: 'Dicer',
    home: 'popina-vici-tusci',
    schedule: [
      { from: at('v4'), at: 'popina-vici-tusci', activity: 'sleep' },
      { from: at('h11'), at: 'popina-vici-tusci', activity: 'sitGround' },
    ],
    dialogue: 'npc-cnaeus-aleator',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'average', height: 1.67, skin: '#b5835d',
      hair: { style: 'receding', color: '#3a2c22' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#a9987a' }],
      footwear: 'soleae',
    },
    barks: ['Venus! Venus, you lazy girl! … Dog.', 'One as a die, citizen. The bones are honest. I’m not.'],
    tags: ['plebs', 'gambler'],
  },
  {
    id: 'npc-optio-vigilum',
    name: 'Lucius Fabricius',
    title: 'Optio of the Vigiles',
    home: 'excubitorium-velabri',
    schedule: [
      { from: at('h1'), at: 'excubitorium-velabri', activity: 'sleep' },
      { from: at('v1'), at: 'excubitorium-velabri', activity: 'guard' },
    ],
    dialogue: 'npc-optio-vigilum',
    faction: 'vigiles',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'stocky', height: 1.7, skin: '#b07d58',
      hair: { style: 'cropped', color: '#6a5a4a' }, beard: 'stubble',
      garments: [{ kind: 'tunica', color: '#6a5a46' }, { kind: 'sagum', color: '#7a4a3a' }],
      armor: { helmet: { kind: 'vigiles-cap' } },
      footwear: 'caligae', weapon: 'fustis',
    },
    barks: ['Fire in the Subura, thieves in the Velabrum. Tell me what’s new.', 'A bucket, a hook and a very short temper. That’s the vigiles.'],
    tags: ['vigiles', 'dignitas:libertus'],
  },
  // ---------------------------------------------------------------- misc-fur-balnearius
  {
    id: 'npc-sabinus-capsarius',
    name: 'Sabinus',
    title: 'Cloakroom attendant (capsarius)',
    home: 'baths-titus:front',
    schedule: [
      { from: at('h8'), at: 'baths-titus:front', activity: 'stand' },
      { from: at('h11'), at: 'baths-titus:front', activity: 'sleep' },
    ],
    dialogue: 'npc-sabinus-capsarius',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.64, skin: '#b88862',
      hair: { style: 'curly-short', color: '#2a2018' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#bdb097' }],
      footwear: 'soleae',
    },
    combat: archetype('ebrius-rixator', { kit: 0 }, { name: 'Sabinus' }),
    barks: ['Cloaks, tunics, sandals, an as for the peg!', 'I watch your things as I watch my own. Better, in fact.', 'Tip the man at the door, citizen. It’s only an as.'],
    tags: ['plebs', 'balnea'],
  },
  {
    // Staged by the quest at the cloakroom door with a bundle; never scheduled.
    id: 'npc-servus-balnei',
    name: 'The cloakroom slave',
    title: 'Slave of the baths',
    disposition: 'neutral',
    appearance: {
      sex: 'male', age: 'young', build: 'slight', height: 1.6, skin: '#9a6a46',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica-short', color: '#a89878' }],
      footwear: 'barefoot',
    },
    dialogue: 'npc-servus-balnei',
    barks: ['Out of the way, please. Out of the way.'],
    tags: ['plebs'],
  },
];

export default npcs;
