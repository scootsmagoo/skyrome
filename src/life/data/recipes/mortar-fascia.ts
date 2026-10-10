/**
 * rec.mortar.fascia: linen torn into bandages (docs/design/world-life.md §4.6). Its `linteum` is the
 * CITY VOICE crew's item (src/rpg/data/items/life.ts), sold by the Subura fuller.
 */
import { defineLife } from '../../types';

export default defineLife({
  recipes: [
    {
      id: 'rec.mortar.fascia',
      bench: 'mortar',
      name: 'Tear bandages',
      skill: 'medicina',
      minLevel: 0,
      inputs: [{ item: 'linteum', count: 1 }],
      output: { item: 'fascia', count: 2 },
      hours: 0.25,
      xp: 20,
      period: 'Linen lint and bandages (linamenta, Celsus 5.26 and 7) [A]; two rolls from one cloth [G]',
    },
  ],
});
