/**
 * The dedication of Trajan's Column (mq-04, docs/design/mq-04-columna.md §3.5; CONTENT §2.A and
 * the dedication table in §2.B): Pudens, the chief of the frumentarii; Bitus, the Dacian archer on
 * the viewing platform; and Crito, Trajan's physician, who has no home and is only ever staged.
 * Pudens keeps his CONTENT schedule; the quest holds him out of the world on 12 May until it stages
 * him in the Column court (`NpcManager.stage`). Bitus has no schedule: the quest spawns him.
 */
import { at } from '../../content/hours';
import { BITUS_PROFILE } from '../../content/profiles';
import type { NpcDef } from '../types';

const npcs: NpcDef[] = [
  {
    id: 'npc-pudens',
    name: 'Titus Aufidius Pudens',
    title: 'Princeps peregrinorum (chief of the frumentarii)',
    // The frumentarii are not a joinable faction (yet): like Gratus, Pudens has none.
    home: 'castra-peregrina',
    // CONTENT §2.A: work through the morning, sit at noon, back to work, asleep from the second watch.
    schedule: [
      { from: at('h1'), at: 'castra-peregrina', activity: 'work' },
      { from: at('h7'), at: 'castra-peregrina', activity: 'sit' },
      { from: at('h9'), at: 'castra-peregrina', activity: 'work' },
      { from: at('v2'), at: 'castra-peregrina', activity: 'sleep' },
    ],
    dialogue: 'npc-pudens',
    disposition: 'friendly',
    essential: true,
    // Heavy, receding, clean-shaven; the red sagum over a tunica with a red hem. The vine staff
    // (vitis) is not a weapon model, so he carries none.
    appearance: {
      sex: 'male', age: 'middle', build: 'heavy', height: 1.66, skin: '#DDB48F',
      hair: { style: 'receding', color: '#8A8580' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#f2eee4', trim: '#9E3B2E' }, { kind: 'sagum', color: '#9E3B2E' }],
      footwear: 'caligae',
    },
    barks: ['Everyone in Rome is someone’s informer. The trick is to be mine.', 'Sit. Eat a fig. Then lie to me, if you still want to.', 'The emperor leaves in the autumn. Until then, nobody sleeps.'],
    tags: ['frumentarius', 'official', 'dignitas:civis'],
  },
  {
    id: 'npc-bitus',
    name: 'Bitus',
    title: 'Dacian archer, son of Dida',
    // No home and no schedule: the quest spawns him on the viewing platform (mq-04 §3.4, §3.7).
    dialogue: 'npc-bitus',
    disposition: 'hostile',
    combat: BITUS_PROFILE,
    // About 22, slight and wiry; a long tunic with sleeves, Dacian trousers and a cloak.
    appearance: {
      sex: 'male', age: 'young', build: 'slight', height: 1.72, skin: '#c99a72',
      hair: { style: 'long-tied', color: '#2a1d14' }, beard: 'short',
      garments: [{ kind: 'tunica', color: '#8e8a80', sleeves: 'long' }, { kind: 'braccae', color: '#5e5040' }, { kind: 'paenula', color: '#7a6248' }],
      footwear: 'soleae', weapon: 'bow',
    },
    barks: ['Count the steps, Roman. I did.', 'Look down. That is my country on your stone.', 'Dacians kneel once. I have used mine.'],
    tags: ['dacian', 'archer', 'captive'],
  },
  {
    id: 'npc-crito',
    name: 'Titus Statilius Crito',
    title: 'Physician to the Emperor',
    dialogue: 'npc-crito',
    essential: true,
    // No home: staged only (the Column court by the wounded Gratus). A Greek doctor's full beard.
    // CONTENT says "pallium", which is not a garment kind here: a long tunic and a lacerna stand in
    // for it. The hair colour is not in CONTENT; it is picked to match the beard.
    appearance: {
      sex: 'male', age: 'middle', build: 'slight', height: 1.64, skin: '#C99A72',
      hair: { style: 'cropped', color: '#5a4a3a' }, beard: 'full',
      garments: [{ kind: 'tunica-long', color: '#e2dac6' }, { kind: 'lacerna', color: '#d8cfbc' }],
      footwear: 'calcei',
    },
    // His overheard line from CONTENT §2.B ("Lay him flat...") is said once by the quest's `say`
    // when he reaches Gratus (mq-04 §3.8), so it is not among his barks.
    barks: ['Boil the linen. Then boil it again.', 'Hippocrates would have hated Rome. Too many stairs.'],
    tags: ['fixed-star', 'greek', 'physician'],
  },
];

export default npcs;
