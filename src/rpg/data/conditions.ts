/**
 * PROVISIONAL diseases, blessings and poisons (GDD pending). Apply with
 * `sheet.applyCondition(id)`; the effect source becomes `${kind}:${id}` so cures and the UI can
 * find them. Durations are real seconds (Infinity = until cured). One blessing at a time unless
 * the Pontifex perk is taken.
 */
import type { ConditionDef } from '../types';

const MIN = 60;

export const CONDITIONS: ConditionDef[] = [
  // ---- diseases (until cured)
  { id: 'febris', kind: 'disease', name: 'Tertian Fever', latin: 'febris tertiana', contagion: 0.15, description: 'The marsh fever of the Campus Martius and the Pontine flats. It comes back every other day.', effects: [{ kind: 'modifier', target: 'stamina.regen', amount: -0.5, duration: Infinity }, { kind: 'fortify', target: 'health', amount: -15, duration: Infinity }] },
  { id: 'lippitudo', kind: 'disease', name: 'Lippitudo', latin: 'lippitudo', contagion: 0.2, description: 'Inflamed, weeping eyes, common in the dust of the city. Hard to aim, hard to read faces.', effects: [{ kind: 'modifier', target: 'damage.ranged', amount: -0.25, duration: Infinity }, { kind: 'modifier', target: 'persuade.chance', amount: -0.1, duration: Infinity }] },
  { id: 'scabies', kind: 'disease', name: 'The Itch', latin: 'scabies', contagion: 0.25, description: 'Caught in the cheaper baths. Everyone notices you scratching.', effects: [{ kind: 'modifier', target: 'price.buy', amount: -0.1, duration: Infinity }, { kind: 'modifier', target: 'stealth.noise', amount: -0.1, duration: Infinity }] },
  { id: 'tussis', kind: 'disease', name: 'Insula Cough', latin: 'tussis', contagion: 0.2, description: 'A wet cough from damp, smoky tenements.', effects: [{ kind: 'fortify', target: 'stamina', amount: -20, duration: Infinity }] },
  // ---- poisons (timed)
  { id: 'cicuta', kind: 'poison', name: 'Hemlock', latin: 'cicuta', description: 'The Athenian poison, numbing from the feet upward.', effects: [{ kind: 'damage', target: 'health', amount: 2, duration: 20 }, { kind: 'modifier', target: 'speed.move', amount: -0.3, duration: 20 }] },
  { id: 'aconitum', kind: 'poison', name: 'Aconite', latin: 'aconitum', description: 'Wolfsbane — the stepmother’s poison, the satirists say.', effects: [{ kind: 'damage', target: 'health', amount: 4, duration: 10 }] },
  { id: 'garum_malum', kind: 'poison', name: 'Bad Garum', latin: 'garum corruptum', description: 'Something in that fish sauce had turned.', effects: [{ kind: 'damage', target: 'stamina', amount: 2, duration: 30 }] },
  // ---- blessings (shrines and temples)
  { id: 'iuppiter', kind: 'blessing', god: 'Jupiter Optimus Maximus', name: 'Blessing of Jupiter', latin: 'favor Iovis', description: 'The best and greatest god watches over you: +25 health.', effects: [{ kind: 'fortify', target: 'health', amount: 25, duration: 8 * MIN }] },
  { id: 'iuno', kind: 'blessing', god: 'Juno Regina', name: 'Blessing of Juno', latin: 'favor Iunonis', description: 'The queen of the gods guards the household: blocking absorbs 10% more.', effects: [{ kind: 'modifier', target: 'block.mitigation', amount: 0.1, duration: 8 * MIN }] },
  { id: 'minerva', kind: 'blessing', god: 'Minerva', name: 'Blessing of Minerva', latin: 'favor Minervae', description: 'Wisdom and craft: skills improve 10% faster.', effects: [{ kind: 'modifier', target: 'xp.mult', amount: 0.1, duration: 8 * MIN }] },
  { id: 'mars', kind: 'blessing', god: 'Mars Ultor', name: 'Blessing of Mars', latin: 'favor Martis', description: 'Mars the Avenger, in his temple in the Forum of Augustus: melee damage +10%.', effects: [{ kind: 'modifier', target: 'damage.blades', amount: 0.1, duration: 8 * MIN }, { kind: 'modifier', target: 'damage.spear', amount: 0.1, duration: 8 * MIN }, { kind: 'modifier', target: 'damage.blunt', amount: 0.1, duration: 8 * MIN }] },
  { id: 'venus', kind: 'blessing', god: 'Venus Genetrix', name: 'Blessing of Venus', latin: 'favor Veneris', description: 'Mother of the Julian line: persuasion +15%.', effects: [{ kind: 'modifier', target: 'persuade.chance', amount: 0.15, duration: 8 * MIN }] },
  { id: 'mercurius', kind: 'blessing', god: 'Mercury', name: 'Blessing of Mercury', latin: 'favor Mercurii', description: 'God of merchants and thieves: prices 10% better, pickpocketing 10% easier.', effects: [{ kind: 'modifier', target: 'price.buy', amount: 0.1, duration: 8 * MIN }, { kind: 'modifier', target: 'price.sell', amount: 0.1, duration: 8 * MIN }, { kind: 'modifier', target: 'pickpocket.chance', amount: 0.1, duration: 8 * MIN }] },
  { id: 'vesta', kind: 'blessing', god: 'Vesta', name: 'Blessing of Vesta', latin: 'favor Vestae', description: 'The hearth of Rome: health regenerates 50% faster.', effects: [{ kind: 'modifier', target: 'health.regen', amount: 0.5, duration: 8 * MIN }] },
  { id: 'diana', kind: 'blessing', god: 'Diana', name: 'Blessing of Diana', latin: 'favor Dianae', description: 'The huntress on the Aventine: bows and slings +15%.', effects: [{ kind: 'modifier', target: 'damage.ranged', amount: 0.15, duration: 8 * MIN }] },
  { id: 'hercules', kind: 'blessing', god: 'Hercules Victor', name: 'Blessing of Hercules', latin: 'favor Herculis', description: 'At the round temple by the cattle market: carry 25 kg more.', effects: [{ kind: 'modifier', target: 'carry.max', amount: 25, duration: 8 * MIN }] },
  { id: 'fortuna', kind: 'blessing', god: 'Fortuna', name: 'Blessing of Fortuna', latin: 'favor Fortunae', description: 'Luck turns your way: locks and pockets 10% easier.', effects: [{ kind: 'modifier', target: 'lockpick.ease', amount: 0.1, duration: 8 * MIN }, { kind: 'modifier', target: 'pickpocket.chance', amount: 0.1, duration: 8 * MIN }] },
  { id: 'aesculapius', kind: 'blessing', god: 'Aesculapius', name: 'Blessing of Aesculapius', latin: 'favor Aesculapii', description: 'The healer of the Tiber Island: remedies 25% stronger.', effects: [{ kind: 'modifier', target: 'potion.strength', amount: 0.25, duration: 8 * MIN }] },
  { id: 'isis', kind: 'blessing', god: 'Isis', name: 'Blessing of Isis', latin: 'favor Isidis', description: 'The Egyptian Queen of Heaven: +20 pietas and it returns faster.', effects: [{ kind: 'fortify', target: 'pietas', amount: 20, duration: 8 * MIN }, { kind: 'modifier', target: 'pietas.regen', amount: 0.5, duration: 8 * MIN }] },
  { id: 'mithras', kind: 'blessing', god: 'Mithras', name: 'Blessing of Mithras', latin: 'favor Mithrae', description: 'The bull-slayer of the soldiers’ mysteries: +25 stamina.', effects: [{ kind: 'fortify', target: 'stamina', amount: 25, duration: 8 * MIN }] },
];
