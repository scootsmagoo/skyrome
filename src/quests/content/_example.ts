/**
 * EXAMPLE QUEST (dev scenes and tests only — underscore files load with `examples: true`).
 *
 * "The Scribe's Letter": a scribe below the Rostra asks the player to carry a sealed letter to a
 * banker in the Basilica Aemilia. Shows the patterns content authors need:
 *   - starting from a dialogue node (triggers)
 *   - a location objective, an NPC objective, a hidden optional counted objective
 *   - stage changes driven by dialogue nodes, failure on a death, rewards
 *   - quest-owned items, locations and NPCs exported next to the quest (registered by installRpg)
 * Positions are for the `rpg` dev scene; real quests use atlas landmark ids.
 */
import type { LocationDef, NpcDef } from '../../npc/types';
import type { ItemDef } from '../../rpg/types';
import { defineQuest } from '../types';

export const items: ItemDef[] = [
  {
    id: 'ex_letter', name: 'Sealed Letter for Sextus Aelius', latin: 'epistula obsignata', type: 'quest', questItem: true, weight: 0.1, value: 0, icon: '✉',
    description: 'Two wax tablets bound with linen thread and sealed with Pudens’s ring, a Minerva cut in carnelian.',
    text: 'Gaius Valerius Pudens to his friend Sextus Aelius, greetings.\n\nThe four hundred sesterces you lent me at the Kalends are, I regret, with the gods of chance in a tavern on the Vicus Tuscus. Give me until the Ides of June and you will have them with interest. If you will not, I know where your clerk spends his evenings, and so will your wife.\n\nFarewell.',
  },
  {
    id: 'ex_reply', name: 'Reply from Sextus Aelius', latin: 'rescriptum', type: 'quest', questItem: true, weight: 0.1, value: 0, icon: '✉',
    description: 'A folded tablet, sealed in haste with a thumbprint.',
  },
];

export const locations: LocationDef[] = [
  { id: 'ex_rostra', name: 'The Rostra', latin: 'Rostra', position: { x: -6, z: 2 }, radius: 7, mapMarker: 'forum', discoverable: true },
  { id: 'ex_basilica', name: 'Basilica Aemilia', latin: 'Basilica Aemilia', position: { x: 16, z: -16 }, radius: 7, mapMarker: 'landmark', discoverable: true },
];

export const npcs: NpcDef[] = [
  {
    id: 'ex_pudens', name: 'Gaius Valerius Pudens', title: 'Scribe', home: 'ex_rostra', dialogue: 'ex_pudens', faction: 'populus', disposition: 'friendly', services: ['scribe'],
    appearance: { sex: 'male', age: 'middle', build: 'slight', height: 1.66, skin: '#c99a76', hair: { style: 'receding', color: '#4a3a2a' }, beard: 'none', garments: [{ kind: 'tunica', color: '#d8cdb4' }], footwear: 'soleae' },
    barks: ['Petitions copied, contracts drawn!', 'Three copies by noon, they say. Three!'],
  },
  {
    id: 'ex_sextus', name: 'Sextus Aelius', title: 'Banker', home: 'ex_basilica', dialogue: 'ex_sextus', faction: 'mercatores', disposition: 'neutral', services: ['banker'],
    appearance: { sex: 'male', age: 'old', build: 'heavy', height: 1.68, skin: '#d1a684', hair: { style: 'cropped', color: '#9a9a9a' }, beard: 'none', garments: [{ kind: 'tunica', color: '#e4dccb' }, { kind: 'toga', color: '#efe8d8' }], footwear: 'calcei' },
    barks: ['One percent a month. Fair rates.', 'Mind the scales.'],
  },
];

export default defineQuest({
  id: 'ex_letter',
  title: 'The Scribe’s Letter',
  latin: 'Epistula Scribae',
  category: 'misc',
  giver: 'ex_pudens',
  summary: 'Carry a sealed letter from a scribe at the Rostra to a banker in the Basilica Aemilia.',
  stages: {
    start: {
      journal: 'Gaius Valerius Pudens, a scribe who works below the Rostra, asked me to carry a sealed letter to the banker Sextus Aelius in the Basilica Aemilia. He was very particular that the seal stay unbroken.',
      objectives: [
        { id: 'go', text: 'Go to the Basilica Aemilia', target: { kind: 'location', id: 'ex_basilica' } },
        { id: 'deliver', text: 'Give the letter to Sextus Aelius', target: { kind: 'npc', id: 'ex_sextus' } },
        { id: 'figs', text: 'Find three dried figs for Pudens', count: 3, optional: true, hidden: true },
      ],
      onEnter: (q) => q.game.player?.inventory?.add('ex_letter', 1, { source: 'quest' }),
    },
    reply: {
      journal: 'Sextus Aelius read the letter twice and went pale. He wrote a reply at once and told me to take it to Pudens — and to say nothing about it to anyone.',
      objectives: [
        { id: 'return', text: 'Bring the reply to Pudens', target: { kind: 'npc', id: 'ex_pudens' } },
        { id: 'figs', text: 'Find three dried figs for Pudens', count: 3, optional: true, hidden: true },
      ],
      onEnter: (q) => q.game.player?.inventory?.add('ex_reply', 1, { source: 'quest' }),
    },
    done: {
      journal: 'Pudens took the reply, read it, and laughed with relief. He paid me as promised.',
      end: 'complete',
    },
    sextusDead: {
      journal: 'Sextus Aelius is dead. Whatever was in the letter, he will never read it now.',
      end: 'fail',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'ex_pudens' && e.nodeId === 'accept') q.start();
    },
  },
  on: {
    'location:entered': (q, e) => {
      if (e.locationId === 'ex_basilica') q.completeObjective('go');
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'ex_pudens' && e.nodeId === 'figs') q.reveal('figs');
      if (e.dialogueId === 'ex_pudens' && e.nodeId === 'figsGiven') q.giveReward({ denarii: 2, reputation: [{ faction: 'populus', amount: 5 }] });
      if (e.dialogueId === 'ex_sextus' && e.nodeId === 'delivered') {
        q.completeObjective('deliver');
        q.setStage('reply');
      }
      if (e.dialogueId === 'ex_pudens' && e.nodeId === 'thanks') {
        q.completeObjective('return');
        q.setStage('done');
      }
    },
    'item:added': (q, e) => {
      if (e.itemId === 'ficus' && !q.flag('ex_figs_given')) q.progress('figs', e.count);
    },
    'item:used': (q, e) => {
      if (e.itemId === 'ex_letter' && !q.flag('ex_letter_opened')) {
        q.setFlag('ex_letter_opened', true);
        q.notify('You broke Pudens’s seal.');
      }
    },
    'actor:killed': (q, e) => {
      if (e.victimId === 'ex_sextus') q.setStage('sextusDead');
    },
  },
  rewards: { denarii: 15, skills: [{ id: 'rhetoric', amount: 5 }], reputation: [{ faction: 'mercatores', amount: 10 }] },
});
