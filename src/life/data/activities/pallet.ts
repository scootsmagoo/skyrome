/**
 * Services crew, the pallet behind the Silver Pig (docs/design/world-life.md §4.5): the first bed
 * of the player's own, and a chest beside it (`ctn-cista-pergulae`, src/content/containers.ts).
 * It is rented from Vibia Chreste in her conversation (2 denarii for 30 days: she sets the flag
 * `pallet-until` to the day the rent runs out, and gives the key `clavis-pergulae`), and this
 * card is there only while the rent has not run out. Sleeping in it is a night in one's own bed
 * (`bene-quietus`), the GDD's `domus-pergula`.
 */
import { defineLife } from '../../types';

export default defineLife({
  activities: [
    {
      id: 'act.silver-pig.pallet',
      name: 'Your pallet',
      verb: 'Sleep',
      // Behind the popina, away from the street. dx/dz are game metres from the Silver Pig.
      at: { place: 'popina-vici-tusci', dx: 3.5, dz: 7 },
      reach: 2.6,
      // Rented until the day in `pallet-until` (the flag counts game days, Chreste's dialogue sets it).
      gate: { if: (game) => Number(game.quests?.flags.get('pallet-until') ?? -1) >= game.time.dayIndex },
      intro: [
        'A straw pallet in the lean-to behind the Silver Pig, under a roof of old amphora-sherds and sailcloth. It smells of wine lees and warm dust. Beside it stands the chest Chreste lent you, with a key that fits.',
        'Your corner behind the kitchen: a blanket, a pallet, a chest with a lock. The wall on the other side is the oven, and it is warm.',
      ],
      options: [
        {
          id: 'sleep-dawn',
          text: 'Sleep until dawn',
          effects: [{ kind: 'sleep', bed: 'own', until: 'h1' }],
          result: 'You wake with the first cart in the street and the smell of the morning’s bread. Well rested.',
        },
        {
          id: 'sleep-mid',
          text: 'Sleep until the sixth hour',
          effects: [{ kind: 'sleep', bed: 'own', until: 'h6' }],
          result: 'You sleep through the noise of the market and wake at the hour when the shadows are shortest. Well rested.',
        },
      ],
      period: 'Rented sleeping-places in or behind a taberna (pergula, cenaculum): Pompeii, Rome [A]; the GDD’s domus-pergula [G]',
    },
  ],
});
