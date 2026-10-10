/**
 * The mortar's recipes (docs/design/world-life.md §4.6): remedies from the herbs the druggist and
 * the greengrocer sell. The gain is Medicina XP and having the remedy when it is needed; the
 * economy rule (tests/life-economy.test.ts) keeps selling a craft back from beating its inputs by
 * more than 2×, so a few recipes need more of an expensive input than the first table drew.
 *
 * rec.mortar.fascia (linen into bandages) waits in `_pending-fascia.ts`: its `linteum` is an item
 * the CITY VOICE crew adds; rename the file when it lands.
 */
import { defineLife } from '../../types';

export default defineLife({
  recipes: [
    {
      id: 'rec.mortar.posca',
      bench: 'mortar',
      name: 'Mix posca',
      skill: 'medicina',
      minLevel: 0,
      inputs: [
        { item: 'acetum', count: 1 },
        { item: 'aqua', count: 1 },
      ],
      output: { item: 'posca', count: 2 },
      hours: 0.25,
      xp: 20,
      period: 'Posca, sour wine and water, the soldier’s drink (Plutarch, Cato Maior 1) [A]; two cups from one measure [G]',
    },
    {
      id: 'rec.mortar.emplastrum',
      bench: 'mortar',
      name: 'Grind poultices',
      skill: 'medicina',
      minLevel: 10,
      inputs: [
        { item: 'mel', count: 1 },
        { item: 'salvia', count: 1 },
        { item: 'acetum', count: 1 },
      ],
      output: { item: 'emplastrum', count: 3 },
      hours: 0.5,
      xp: 15,
      period: 'Honey, vinegar and herbs on a wound: Celsus 5.19, Pliny NH 20 and 22 [A]; the amounts [G]',
    },
    {
      id: 'rec.mortar.collyrium',
      bench: 'mortar',
      name: 'Mix eye salve',
      skill: 'medicina',
      minLevel: 20,
      inputs: [
        { item: 'ruta', count: 1 },
        { item: 'acetum', count: 1 },
        { item: 'mel', count: 1 },
      ],
      output: { item: 'collyrium', count: 2 },
      hours: 0.5,
      xp: 15,
      period: 'Collyria, rolled in sticks and stamped with the oculist’s name: Celsus 6.6; Pliny NH 20.132 on rue [A]; simplified [G]',
    },
    {
      id: 'rec.mortar.febrifugum',
      bench: 'mortar',
      name: 'Brew a fever draught',
      skill: 'medicina',
      minLevel: 30,
      inputs: [
        { item: 'absinthium', count: 2 },
        { item: 'vinum', count: 1 },
        { item: 'mel', count: 2 },
      ],
      output: { item: 'febrifugum', count: 1 },
      hours: 1,
      xp: 15,
      period: 'Wormwood steeped in wine (Pliny NH 27.45–52; Celsus 3.12 on fevers) [A]; simplified [G]',
    },
    {
      id: 'rec.mortar.soporificum',
      bench: 'mortar',
      name: 'Prepare a soporific',
      skill: 'medicina',
      minLevel: 40,
      inputs: [
        { item: 'papaver', count: 3 },
        { item: 'mandragora', count: 2 },
      ],
      output: { item: 'soporificum', count: 1 },
      hours: 1,
      xp: 10,
      period: 'Poppy and mandrake for sleep before the knife (Celsus 5.25; Pliny NH 25.147–150, mandrake given before surgery) [A]; simplified [G]',
    },
    {
      id: 'rec.mortar.theriaca',
      bench: 'mortar',
      name: 'Compound a theriac',
      skill: 'medicina',
      minLevel: 55,
      inputs: [
        { item: 'myrrha', count: 3 },
        { item: 'papaver', count: 2 },
        { item: 'mel', count: 2 },
        { item: 'ruta', count: 2 },
        { item: 'allium', count: 2 },
        { item: 'vinum-falernum', count: 2 },
      ],
      output: { item: 'theriaca', count: 1 },
      hours: 2,
      xp: 20,
      period: 'Andromachus’s antidote for Nero, many drugs in honey and wine; the Mithridatium (Pliny NH 23.149, 25.6) [A]; the short list [G]',
    },
  ],
});
