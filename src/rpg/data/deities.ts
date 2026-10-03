/**
 * Patron deities — docs/GDD.md §14.6. Choose one at the god's temple (§3.1, like Skyrim's Guardian
 * Stones); changing costs 100 den. and a 7-day wait. The passive applies while the god is your
 * patron; the invocation (Z) spends pietas. Flags are read by the systems they name
 * (combat: power.free, stagger.immune, telegraph.clear, nemesis.retribution; stealth: senses.keen).
 */
import type { DeityDef } from '../types';

export const DEITIES: DeityDef[] = [
  {
    id: 'patronus-mars', name: 'Mars Ultor', latin: 'Mars Ultor', temple: 'temple-mars-ultor', blessing: 'benedictio-mars',
    passive: { description: '+10% stamina regeneration in combat.', modifiers: { 'stamina.regenCombat': 0.1 } },
    invocation: { name: 'Furor', description: 'Power attacks cost no stamina for 10 seconds.', cost: 30, effects: [{ kind: 'flag', target: 'power.free', amount: 1, duration: 10 }] },
  },
  {
    id: 'patronus-minerva', name: 'Minerva', latin: 'Minerva', temple: 'temple-minerva-nerva', blessing: 'benedictio-minerva',
    passive: { description: '+10% XP for Smithing and Medicine.', modifiers: { 'xp.fabrica': 0.1, 'xp.medicina': 0.1 } },
    invocation: { name: 'Clarity', description: 'Enemy telegraphs read more clearly (slower anticipation) for 15 seconds.', cost: 30, effects: [{ kind: 'flag', target: 'telegraph.clear', amount: 1, duration: 15 }] },
  },
  {
    id: 'patronus-mercurius', name: 'Mercury', latin: 'Mercurius', temple: 'temple-mercury', blessing: undefined,
    passive: { description: 'Better prices (+5%).', modifiers: { 'price.buy': 0.05, 'price.sell': 0.05 } },
    invocation: { name: 'Swift', description: 'Sprinting costs no stamina for 20 seconds.', cost: 30, effects: [{ kind: 'modifier', target: 'stamina.sprintCost', amount: 1, duration: 20 }] },
  },
  {
    id: 'patronus-fortuna', name: 'Fortuna', latin: 'Fortuna', temple: 'sant-omobono-temples', blessing: 'benedictio-fortuna',
    passive: { description: '+5% on crits and luck rolls.', modifiers: { luck: 0.05 } },
    invocation: { name: 'Fortune’s Turn', description: 'Your next lock, lift or persuasion roll succeeds.', cost: 25, effects: [{ kind: 'flag', target: 'fortuna.nextRoll', amount: 1, duration: 600 }] },
  },
  {
    id: 'patronus-hercules', name: 'Hercules', latin: 'Hercules Victor', temple: 'ara-maxima', blessing: 'benedictio-hercules',
    passive: { description: 'Carry 15 kg more.', modifiers: { 'carry.max': 15 } },
    invocation: { name: 'Labor', description: 'Immune to stagger for 10 seconds.', cost: 30, effects: [{ kind: 'flag', target: 'stagger.immune', amount: 1, duration: 10 }] },
  },
  {
    id: 'patronus-venus', name: 'Venus Genetrix', latin: 'Venus Genetrix', temple: 'temple-venus-genetrix', blessing: 'benedictio-venus',
    passive: { description: '+5 persuasion.', modifiers: { 'persuade.chance': 0.05 } },
    invocation: { name: 'Charis', description: '+25 persuasion for one conversation (two minutes).', cost: 30, effects: [{ kind: 'modifier', target: 'persuade.chance', amount: 0.25, duration: 120 }] },
  },
  {
    id: 'patronus-diana', name: 'Diana', latin: 'Diana', temple: 'temple-diana-aventine', blessing: 'benedictio-diana',
    passive: { description: '+10% at night and with bows.', modifiers: { 'damage.ranged': 0.1 }, flags: ['night.sight'] },
    invocation: { name: 'Keen', description: 'Hear hidden enemies (audio pings) for 30 seconds.', cost: 30, effects: [{ kind: 'flag', target: 'senses.keen', amount: 1, duration: 30 }] },
  },
  {
    id: 'patronus-aesculapius', name: 'Aesculapius', latin: 'Aesculapius', temple: 'temple-aesculapius', blessing: 'benedictio-aesculapius',
    passive: { description: '+25% bandage healing.', modifiers: { 'bandage.strength': 0.25 } },
    invocation: { name: 'Salus', description: 'Heal 50% of your health over 10 seconds.', cost: 40, effects: [{ kind: 'regen', target: 'health', amount: 5, percent: true, duration: 10 }] },
  },
  {
    id: 'patronus-laverna', name: 'Laverna', latin: 'Laverna', temple: 'porta-lavernalis', blessing: 'benedictio-laverna',
    passive: { description: 'Quieter steps (−20% noise).', modifiers: { 'stealth.noise': 0.2 } },
    invocation: { name: 'Shade', description: 'Silent footsteps for 30 seconds.', cost: 30, effects: [{ kind: 'modifier', target: 'stealth.noise', amount: 1, duration: 30 }] },
  },
  {
    id: 'patronus-nemesis', name: 'Nemesis', latin: 'Nemesis', temple: 'colosseum', blessing: 'benedictio-nemesis',
    passive: { description: '+15% crowd favor; +15 points on missio rolls.', modifiers: { 'arena.favor': 0.15, 'arena.missio': 0.15 } },
    invocation: { name: 'Retribution', description: '+25% damage against your last attacker for 15 seconds.', cost: 30, effects: [{ kind: 'flag', target: 'nemesis.retribution', amount: 1, duration: 15 }] },
  },
  {
    id: 'patronus-mithras', name: 'Mithras', latin: 'Mithras Invictus', temple: 'horrea-agrippiana', blessing: undefined,
    passive: { description: '+15 poise.', modifiers: { 'poise.max': 15 } },
    invocation: { name: 'Invictus', description: 'Once a day: stay at 1 health instead of dying.', cost: 50, oncePerDay: true, effects: [{ kind: 'flag', target: 'invictus', amount: 1, duration: 4320 }] },
  },
  {
    id: 'patronus-isis', name: 'Isis', latin: 'Isis', temple: 'iseum-campense', blessing: 'benedictio-isis',
    passive: { description: 'Praying cures ailments (disease and poison).', flags: ['patron.isis'] },
    invocation: { name: 'Salvation', description: 'Cure poison and bleeding.', cost: 30, effects: [{ kind: 'cure', target: 'poison', amount: 1 }, { kind: 'cure', target: 'injury:cruentus', amount: 1 }] },
  },
];

/** The patron deity chosen at a temple, if any. */
export function patronAt(templeId: string): DeityDef | undefined {
  return DEITIES.find((d) => d.temple === templeId);
}
