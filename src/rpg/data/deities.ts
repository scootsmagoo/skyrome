/**
 * Patron deities (docs/research/game-design.md §B8.3 "[design numbers]"; GDD §14.6 is pending).
 * Choose one at its temple (GDD §3.1, like Skyrim's Guardian Stones): the passive applies while it
 * is your patron, and the invocation (Z) spends pietas. Flags are read by the systems they name.
 */
import type { DeityDef } from '../types';

export const DEITIES: DeityDef[] = [
  {
    id: 'mars', name: 'Mars Ultor', latin: 'Mars Ultor', temple: 'Temple of Mars Ultor, Forum of Augustus', blessing: 'mars',
    passive: { description: 'Stamina returns 10% faster.', modifiers: { 'stamina.regen': 0.1 } },
    invocation: { name: 'Furor', description: 'Power attacks cost no stamina for 10 seconds.', cost: 25, effects: [{ kind: 'flag', target: 'power.free', amount: 1, duration: 10 }] },
  },
  {
    id: 'minerva', name: 'Minerva', latin: 'Minerva', temple: 'Temple of Minerva, Forum of Nerva', blessing: 'minerva',
    passive: { description: 'Smithing and Medicine improve 10% faster.', flags: ['xp.fabrica', 'xp.medicina'] },
    invocation: { name: 'Clarity', description: 'Enemy attacks are easier to read for 15 seconds.', cost: 20, effects: [{ kind: 'flag', target: 'telegraph.clear', amount: 1, duration: 15 }] },
  },
  {
    id: 'mercurius', name: 'Mercury', latin: 'Mercurius', temple: 'Temple of Mercury, by the Circus Maximus', blessing: 'mercurius',
    passive: { description: 'Buy 5% cheaper and sell 5% dearer.', modifiers: { 'price.buy': 0.05, 'price.sell': 0.05 } },
    invocation: { name: 'Swift', description: 'Sprinting costs no stamina for 20 seconds.', cost: 20, effects: [{ kind: 'modifier', target: 'stamina.sprintCost', amount: 1, duration: 20 }] },
  },
  {
    id: 'fortuna', name: 'Fortuna', latin: 'Fortuna Huiusce Diei', temple: 'Temple of Fortuna Huiusce Diei, Campus Martius', blessing: 'fortuna',
    passive: { description: 'Locks, lifts and lucky blows come 5% easier.', modifiers: { 'lockpick.ease': 0.05, 'pickpocket.chance': 0.05 }, flags: ['luck.crit'] },
    invocation: { name: 'Fortune’s Turn', description: 'Your next lock, lift or persuasion roll succeeds.', cost: 30, effects: [{ kind: 'flag', target: 'fortuna.nextRoll', amount: 1, duration: 600 }] },
  },
  {
    id: 'hercules', name: 'Hercules', latin: 'Hercules Victor', temple: 'Ara Maxima, Forum Boarium', blessing: 'hercules',
    passive: { description: 'Carry 15 kg more.', modifiers: { 'carry.max': 15 } },
    invocation: { name: 'Labor', description: 'Nothing staggers you for 10 seconds.', cost: 25, effects: [{ kind: 'flag', target: 'stagger.immune', amount: 1, duration: 10 }] },
  },
  {
    id: 'venus', name: 'Venus Genetrix', latin: 'Venus Genetrix', temple: 'Temple of Venus Genetrix, Forum of Caesar', blessing: 'venus',
    passive: { description: '+5 Rhetoric.', modifiers: { 'persuade.chance': 0.2 } },
    invocation: { name: 'Charis', description: '+25 Rhetoric for one conversation (two minutes).', cost: 25, effects: [{ kind: 'fortify', target: 'rhetoric', amount: 25, duration: 120 }] },
  },
  {
    id: 'diana', name: 'Diana', latin: 'Diana', temple: 'Temple of Diana, Aventine', blessing: 'diana',
    passive: { description: 'Bows and slings do 10% more damage; better at night.', modifiers: { 'damage.ranged': 0.1 }, flags: ['night.sight'] },
    invocation: { name: 'Keen', description: 'Hear hidden enemies for 30 seconds.', cost: 20, effects: [{ kind: 'flag', target: 'senses.keen', amount: 1, duration: 30 }] },
  },
  {
    id: 'aesculapius', name: 'Aesculapius', latin: 'Aesculapius', temple: 'Sanctuary of Aesculapius, Tiber Island', blessing: 'aesculapius',
    passive: { description: 'Bandages and remedies are 10% stronger.', modifiers: { 'potion.strength': 0.1 } },
    invocation: { name: 'Salus', description: 'Heal 50 health over 10 seconds.', cost: 30, effects: [{ kind: 'regen', target: 'health', amount: 5, duration: 10 }] },
  },
  {
    id: 'laverna', name: 'Laverna', latin: 'Laverna', temple: 'Altar by the Porta Lavernalis (through the Cultores Lavernae)', blessing: 'laverna',
    passive: { description: 'Your steps are 15% quieter.', modifiers: { 'stealth.noise': 0.15 } },
    invocation: { name: 'Shade', description: 'Your footsteps are silent for 30 seconds.', cost: 20, effects: [{ kind: 'modifier', target: 'stealth.noise', amount: 1, duration: 30 }] },
  },
  {
    id: 'nemesis', name: 'Nemesis', latin: 'Nemesis', temple: 'The shrines of the Amphitheatre', blessing: 'nemesis',
    passive: { description: 'The arena crowd warms to you faster.', flags: ['arena.favor'] },
    invocation: { name: 'Retribution', description: 'Do 50% more damage to whoever last struck you, for 20 seconds.', cost: 25, effects: [{ kind: 'flag', target: 'nemesis.retribution', amount: 1, duration: 20 }] },
  },
  {
    id: 'mithras', name: 'Mithras', latin: 'Mithras Invictus', temple: 'The cell’s spelaeum (through the Mithraic brothers)', blessing: 'mithras',
    passive: { description: 'You take 15% less poise damage.', flags: ['patron.poise'] },
    invocation: { name: 'Invictus', description: 'Once, within a day, a killing blow leaves you at 1 health instead.', cost: 40, effects: [{ kind: 'flag', target: 'invictus', amount: 1, duration: 4320 }] },
  },
  {
    id: 'isis', name: 'Isis', latin: 'Isis', temple: 'Iseum Campense, Campus Martius', blessing: 'isis',
    passive: { description: 'Praying cures your diseases.', flags: ['patron.isis'] },
    invocation: { name: 'Salvation', description: 'Cure poison and bleeding.', cost: 25, effects: [{ kind: 'cure', target: 'poison', amount: 1 }, { kind: 'cure', target: 'injury', amount: 1 }] },
  },
];
