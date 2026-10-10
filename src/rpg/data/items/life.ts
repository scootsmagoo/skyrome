/**
 * Items phase 2 adds for the life of the city (docs/design/world-life.md §5.1, the CITY VOICE crew):
 * calda, linteum, oleum, amphora-olei, clavis-pergulae and the bread-round basket. lucerna and
 * tabula-cerata already sit in misc.ts, and epistula-signata in the loot tables, so they are not
 * repeated here. Quest items that belong to one quest are exported by that quest module instead.
 */
import type { ItemDef } from '../../types';
import { AS, misc } from './build';

export const LIFE_ITEMS: ItemDef[] = [
  misc('calda', 'Flask of Hot Water', 'calda', 0.6, AS, 'A bronze flask of water warm from the bath furnace. It cools in a quarter hour, so drink it or put it on a sore neck.', { icon: '🫗', tags: ['bath'] }),
  misc('linteum', 'Linen Cloth', 'linteum', 0.15, 2 * AS, 'A square of undyed linen for drying, wiping and binding. Every bath attendant wants one, and every fuller wants more.', { tags: ['cloth'] }),
  misc('oleum', 'Flask of Oil', 'oleum', 0.5, 3 * AS, 'A small glass flask of pressed olive oil, stoppered with wool. For the lamp, the skin after the strigil, or the cook.', { icon: '🫙', tags: ['oil', 'ingredient'] }),
  misc('amphora-olei', 'Amphora of Oil', 'amphora olei', 22, 6, 'A two-handled jar of Baetican oil with the stamp of its shipper still wet on the neck. Heavy, and it slops if you hurry. The storehouse wants it whole.', { questItem: true, icon: '🏺', stackable: false, tags: ['job'] }),
  misc('clavis-pergulae', 'Shutter Key', 'clavis pergulae', 0.1, 2 * AS, 'An iron key for a shop’s wooden shutters and the padlock on its strongbox. Shopkeepers hang theirs on a cord round the neck.', { questItem: true, icon: '🗝', tags: ['key', 'job'] }),
  misc('corbis-panis', 'Bread Basket', 'corbis panis', 1.2, 0, 'A wicker basket with a cloth over the rolls, marked with the bakery’s red chalk. Deliver it before the third hour, and do not eat the samples.', { questItem: true, stackable: false, icon: '🧺', tags: ['job'] }),
];
