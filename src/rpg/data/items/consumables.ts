/** Food and drink, remedies, poisons and ingredients — docs/GDD.md §8.5 and the §7.2 prices. */
import type { ItemDef } from '../../types';
import { AS, cond, food, hot, misc, remedy, stam } from './build';

export const FOOD: ItemDef[] = [
  food('panis', 'Bread', 'panis', 0.33, AS, [hot(8, 8)], 'A one-libra loaf scored into eight wedges.'),
  food('puls', 'Puls', 'puls', 0.5, AS, [hot(12, 8), stam(10)], 'A bowl of spelt porridge.'),
  food('caseus', 'Cheese', 'caseus', 0.3, 2 * AS, [hot(6, 8)], 'A portion of hard smoked cheese.'),
  food('olivae', 'Olives', 'olivae', 0.3, 3 * AS, [hot(4, 8)], 'A small jar of brined olives.'),
  food('ficus', 'Dried Figs', 'ficus aridae', 0.2, 2 * AS, [hot(4, 8)], 'A bag of dried figs (or dates).', ['food', 'fig']),
  food('botulus', 'Sausage', 'botulus', 0.3, 2 * AS, [hot(15, 10)], 'A smoked pork sausage.'),
  food('patina', 'Garum Dish', 'patina', 0.5, 8 * AS, [hot(20, 10), { kind: 'modifier', target: 'stamina.regen', amount: 0.1, duration: 15 }], 'Something baked with fish sauce — Romans put garum on everything.'),
  food('cena', 'Full Dinner', 'cena', 1.5, 3, [hot(40, 20), cond('satur')], 'A full dinner at a good caupona: from the egg to the apples.'),
  food('libum', 'Honey Cake', 'libum', 0.1, AS, [{ kind: 'restore', target: 'health', amount: 5 }], 'A honey cake — the standard small offering.', ['food', 'offering']),
  food('mel', 'Honey', 'mel', 0.3, 6 * AS, [{ kind: 'restore', target: 'health', amount: 5 }], 'A small jar of thyme honey.', ['food', 'ingredient']),
  food('aqua', 'Water', 'aqua', 0.5, 0, [stam(5)], 'Water from a street fountain (lacus): free, and it partly washes off the grime.', ['drink', 'water']),
  food('posca', 'Posca', 'posca', 0.6, AS, [stam(30), { kind: 'modifier', target: 'stamina.regen', amount: 0.2, duration: 60 }], 'Sour wine cut with water: the soldier’s drink.', ['drink']),
  food('vinum', 'House Wine', 'vinum', 0.25, AS, [stam(15), cond('ebrius')], 'A cup of house wine. “Here you drink for an as.”', ['drink', 'wine']),
  food('vinum-melius', 'Better Wine', 'vinum melius', 0.25, 2 * AS, [stam(20), cond('ebrius')], 'A cup of better wine: “give two and you’ll drink better.”', ['drink', 'wine']),
  food('vinum-falernum', 'Falernian', 'vinum Falernum', 0.25, 4 * AS, [stam(25), cond('ebrius'), { kind: 'fortify', target: 'rhetoric', amount: 5, duration: 120 }], 'A cup of Falernian: “give four and you’ll drink Falernian.” +5 Rhetoric for 120 s.', ['drink', 'wine']),
  food('mulsum', 'Mulsum', 'mulsum', 0.25, 2 * AS, [stam(20), cond('ebrius')], 'Wine sweetened with honey.', ['drink', 'wine']),
];

export const REMEDIES: ItemDef[] = [
  remedy('fascia', 'Bandage', 'fascia', 0.05, 2 * AS, [hot(25, 5), { kind: 'cure', target: 'injury:cruentus', amount: 1 }], 'A roll of clean linen: +25 health over 5 s; stops bleeding.', ['bandage']),
  remedy('emplastrum', 'Poultice', 'emplastrum', 0.1, 4 * AS, [hot(40, 10)], 'A plaster of herbs and honey: +40 health over 10 s.'),
  remedy('collyrium', 'Eye Salve', 'collyrium', 0.05, 4 * AS, [{ kind: 'cure', target: 'state:caecatus', amount: 1 }], 'A stick of eye salve stamped with the oculist’s name. Cures blindness from sand or smoke.'),
  remedy('theriaca', 'Theriac', 'theriaca', 0.15, 15, [{ kind: 'cure', target: 'poison', amount: 1 }, { kind: 'flag', target: 'poison.resist', amount: 1, duration: 180 }], 'Andromachus’ antidote of sixty-four ingredients (also sold as Mithridatium): cures poison and halves it for a game hour.'),
  remedy('febrifugum', 'Fever Draught', 'febrifugum', 0.2, 28 * AS, [{ kind: 'cure', target: 'disease:febris', amount: 1 }], 'A bitter draught of willow and wormwood. Cures the fever.'),
  remedy('soporificum', 'Soporific', 'soporificum', 0.1, 10, [], 'Poppy and mandragora, to coat a weapon: for 3 hits, a struck target up to elite collapses after 3 s.', ['weapon-coating']),
];

// The dear drugs (poppy, mandrake, myrrh) are priced so that a remedy made from them at the mortar
// sells back for a modest margin at most (docs/design/world-life.md §4.6; tests/life-economy.test.ts).
export const INGREDIENTS: ItemDef[] = [
  ...[
    ['papaver', 'Poppy', 'papaver', 12 * AS, 'Dried poppy heads, scored for their milk.'],
    ['mandragora', 'Mandrake', 'mandragora', 3, 'A forked root given before surgery.'],
    ['allium', 'Garlic', 'allium', AS, 'Pliny lists sixty-one remedies made from garlic.'],
    ['acetum', 'Vinegar', 'acetum', AS, 'Sour wine vinegar — the base of posca and of many remedies.'],
    ['myrrha', 'Myrrh', 'myrrha', 3, 'Arabian resin for wounds and embalming.'],
    ['absinthium', 'Wormwood', 'absinthium', 4 * AS, 'Steeped in wine against worms and sea-sickness.'],
    ['helleborus', 'Hellebore', 'helleborus', 8 * AS, 'Black hellebore: a purge for madness, a poison for the careless.'],
    ['ruta', 'Rue', 'ruta', 4 * AS, 'A bitter herb against poison and the evil eye.'],
    ['salvia', 'Sage', 'salvia', 2 * AS, 'Sage, for the throat and for wounds.'],
  ].map(([id, name, latin, value, desc]) => misc(id as string, name as string, latin as string, 0.05, value as number, desc as string, { type: 'ingredient', tags: ['herb'] })),
  misc('tus', 'Incense', 'tus', 0.05, AS, 'A pinch of Arabian frankincense, burned at every altar in Rome (a box costs 1 den.).', { type: 'ingredient', tags: ['offering', 'herb'] }),
  misc('aconitum', 'Aconite', 'aconitum', 0.05, 3, 'Wolfsbane: 4 damage a second for 10 s.', { type: 'ingredient', tags: ['poison'] }),
  misc('cicuta', 'Hemlock', 'cicuta', 0.05, 2, 'The Athenian poison: halves stamina regeneration for 60 s.', { type: 'ingredient', tags: ['poison'] }),
  misc('taxus', 'Yew', 'taxus', 0.05, 2, 'Yew needles: 2 damage a second for 30 s.', { type: 'ingredient', tags: ['poison'] }),
];
