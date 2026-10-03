/**
 * The night law of v0.1 (docs/CONTENT.md §2.C, GDD §14.1: the vigiles by night): Primigenius, the
 * torch-man of the Velabrum patrol, "the lanterned vigiles of AC-10". The day patrol's optio,
 * Verecundus, lives with the Act I cast (main-quest.ts); the crowd module adds unnamed soldiers
 * and watchmen from the `miles-urbanus` and `vigil` archetypes.
 */
import { at } from '../../content/hours';
import { archetype } from '../../content/profiles';
import type { NpcDef } from '../types';

const NIGHT_ROUTE = ['excubitorium-velabri', 'compitum-vici-tusci', 'popina-vici-tusci', 'signum-vortumni', 'castor-strongroom', 'basilica-julia-gradus', 'compitum-velabri', 'excubitorium-velabri'];

const npcs: NpcDef[] = [
  {
    id: 'npc-primigenius',
    name: 'Quintus Vibius Primigenius',
    title: 'Sebaciarius of the Vigiles (torch-man)',
    faction: 'vigiles',
    rank: 'sebaciarius',
    home: 'excubitorium-velabri',
    schedule: [
      { from: at('v4'), at: 'excubitorium-velabri', activity: 'sit' },
      { from: at('h1'), at: 'excubitorium-velabri', activity: 'sleep' },
      { from: at('h9'), at: 'excubitorium-velabri', activity: 'sit' },
      { from: at('v1'), at: 'excubitorium-velabri', activity: 'patrol', route: NIGHT_ROUTE },
    ],
    dialogue: 'npc-primigenius',
    disposition: 'neutral',
    // A lantern on a pole (warm light) and a cudgel.
    appearance: {
      sex: 'male', age: 'adult', build: 'slight', height: 1.63, skin: '#8e5e3e',
      hair: { style: 'cropped', color: '#1b1612' }, beard: 'none',
      garments: [{ kind: 'tunica', color: '#e2dac6' }, { kind: 'paenula', color: '#6b5236' }],
      footwear: 'caligae', armor: { helmet: { kind: 'vigiles-cap' } }, weapon: 'torch',
    },
    combat: archetype('vigil', { kit: 1 }, { name: 'Sebaciarius of the Vigiles', loot: 'vigil' }),
    barks: ['Fourth year in the watch. Two more and I’m a citizen. Two more!', 'Lamp out? Good. Lamp lit? Mind it.', 'Beans tonight, friend. Ghosts about. Stay in.', 'Quis est? Oh. Just you. Walk on.'],
    tags: ['vigil', 'law', 'soldier', 'dignitas:latinus-iunianus'],
  },
];

export default npcs;
