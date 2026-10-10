/**
 * Services crew, the street fountains (docs/design/world-life.md §4.4): wash at any of the six
 * nearest street basins when filthy. A fountain removes `sordidus` but gives no `lautus`
 * (rest.ts washAtFountain); that takes the baths.
 */
import { defineLife } from '../../types';

export default defineLife({
  activities: [
    {
      id: 'act.fountains.wash',
      name: 'Street fountain',
      verb: 'Wash',
      at: { streetSpots: 'fountain', max: 6 },
      reach: 2.6,
      // Only the filthy are offered a wash; the rest walk past a fountain.
      gate: { sordidus: true },
      options: [
        {
          id: 'wash',
          text: 'Wash at the basin',
          effects: [{ kind: 'clean', to: 'normal' }],
          result: 'You scrub face and hands in the cold water and slap the worst off your tunic. Not clean, exactly, but fit to be seen.',
        },
      ],
      period: 'Street basins (lacus) fed by the aqueducts, free to all (Frontinus, De aquis 23, 78) [A]',
    },
  ],
});
