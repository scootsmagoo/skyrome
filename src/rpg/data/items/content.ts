/**
 * Items added by the content bible (docs/CONTENT.md §4, the 18 marked NEW) and the Ludus' lent
 * practice shields. Values in denarii (1 as = 1/16). The v0.1 needs: sica-lusoria, sica-muris,
 * lupini, cicer (Chreste), fabae (the Lemuria), the two keys; the rest are v0.2 or later and exist
 * so data resolves.
 */
import { DEFIXIO_TIBERINA, T6_DEFIXIO_VENETA } from '../../../content/texts';
import type { ItemDef } from '../../types';
import { armor, AS, cloth, food, hot, misc, weapon, ws } from './build';
import { SHIELDS } from './armor';
import { BASE_WEAPONS } from './weapons';

const base = (list: ItemDef[], id: string) => list.find((d) => d.id === id)!;

/** The Ludus' practice shields, tagged 'ludus-issued': stored by the armory whenever the player leaves the school. */
function lent(id: string, of: string, name: string, description: string): ItemDef {
  const b = base(SHIELDS, of);
  return { ...b, id, name, value: 0, description, tags: [...(b.tags ?? []), 'ludus-issued'] };
}

export const CONTENT_ITEMS: ItemDef[] = [
  // §4.1 — a practice sica for thraeces in lusiones (Auctus): never kills; hooks round shields.
  weapon('sica-lusoria', 'Practice Sica', 'sica lusoria', ws('blade', 'blades', 9, 'blunt', 1.15, 0.7, 10, { practice: true }), 0.5, 1, 'sica', 'A curved wooden sica for thraeces in practice bouts. It never kills, and it hooks round a shield as the real one does (it ignores a quarter of block mitigation). Not sold.', { tags: ['lusoria', 'training', 'hook'] }),
  // §4.3 uniques
  { ...base(BASE_WEAPONS, 'sica'), id: 'sica-muris', name: 'The Mouse’s Sica', latin: 'sica Muris', value: 25, description: '“Notched, oiled and too often used. Thirty-one bouts, its owner liked to say, and one cloak.” The notched edge bleeds a little more (+5% bleed chance).', tags: ['dagger', 'hook', 'unique', 'bleed+5'] },
  { id: 'anulus-festi', name: 'Festus’ Signet', latin: 'anulus Festi', type: 'misc', slot: 'finger', weight: 0.01, value: 5, icon: '○', tags: ['unique', 'signet'], description: 'An iron signet ring cut with a horseman holding a raised spear: the seal of C. Marius Festus. A letter sealed with it would open doors at the Castra Peregrina.' },
  // §4.8 food
  food('fabae', 'Black Beans', 'fabae nigrae', 0.2, AS, [hot(3, 6)], 'Black beans, the bean of the Lemuria rite: the pious throw them behind them for the dead, without looking back, rather than eat them.', ['food', 'offering', 'lemuria']),
  food('lupini', 'Lupins', 'lupini', 0.2, AS, [hot(4, 6)], 'Salted lupin beans, sold hot in the street.'),
  food('cicer', 'Hot Chickpeas', 'cicer frictum', 0.3, AS, [hot(6, 8)], 'A paper cone of roasted chickpeas, too hot to hold.'),
  // §4.9 ingredient
  { id: 'nardus', name: 'Indian Nard', latin: 'nardus', type: 'ingredient', weight: 0.1, value: 12, stackable: true, icon: '✿', tags: ['ingredient', 'perfume', 'valuable'], description: 'Spikenard from India, the costliest of perfumes, in a little alabaster flask. Often faked with grass (Pliny NH 12.43).' },
  // §4.10 tools (vig-01)
  { id: 'hama', name: 'Fire Bucket', latin: 'hama', type: 'tool', weight: 1.5, value: 1, stackable: true, icon: '◒', tags: ['vigiles', 'water'], description: 'A vigiles’ esparto bucket sealed with pitch. Carried full, it douses one small fire.' },
  armor('cento', 'Wet Rag Blanket', 'cento', 'cloak', cloth(), 2, 1, {}, 'The vigiles’ smothering blanket of patched rags, soaked through. Worn over the head for 30 s it carries you across one fire zone unharmed.', { tags: ['vigiles', 'fire-blanket'], equipModifiers: { 'fire.resist': 0.5 } }),
  // §4.11 documents, tokens and keepsakes
  { id: 'defixio-veneta', name: 'Curse Tablet against the Blues', latin: 'defixio', type: 'book', weight: 0.2, value: 2 * AS, icon: '✠', tags: ['curse', 'tablet'], description: 'A thin rolled lead sheet pierced by a nail, cursing the horses of the Blues. It works only on those who learn of it.', text: T6_DEFIXIO_VENETA },
  { id: 'defixio-tiberina', name: 'Curse Strip from the Bridge', latin: 'defixio', type: 'book', weight: 0.05, value: 0, icon: '✠', tags: ['curse', 'note'], description: 'A tiny rolled lead strip, once pinned under the deck of the Pons Sublicius by an iron nail.', text: DEFIXIO_TIBERINA },
  misc('tessera-lavernae', 'Token of Laverna', 'tessera Lavernae', 0.02, 0, 'A bronze token stamped with a hooded woman and a lamp: the pass of the Cultores Lavernae.', { tags: ['token'], stackable: false }),
  // mq-04 reward from Pudens (docs/design/mq-04-columna.md §2.1): the couriers' mark.
  misc('anulus-peregrinorum', 'Courier’s Ring', 'anulus', 0, 0, 'A plain iron ring with a horseman and a spear cut into the bezel: the couriers’ mark. Pudens gave it to me.', { tags: ['token'], stackable: false }),
  misc('margarita', 'Small Pearl', 'margarita', 0.01, 15, 'A small Red Sea pearl, not quite round, with a pink lustre.', { tags: ['valuable'] }),
  misc('armilla-dacica', 'Dacian Silver Bracelet', 'armilla Dacica', 0.1, 20, 'A spiral silver bracelet with snake-head ends, Dacian work. Dacians who see it treat its wearer more kindly (+5 disposition when the jewellery slot exists).', { tags: ['valuable', 'keepsake', 'dacian'], stackable: false }),
  misc('penna-corvi', 'Raven Feather', 'penna corvi', 0.01, 0, 'A black feather: the keepsake of the Mithraic grade Corax.', { tags: ['keepsake', 'mithraic'], stackable: false }),
  // §4.13 keys
  { id: 'clavis-cellae-muris', name: 'Key to Mus’ Strongbox', latin: 'clavis', type: 'key', weight: 0.05, value: 0, icon: '⚿', tags: ['key'], description: 'A small iron key on a greasy string. It opens the strongbox in the back cellar of the burned taberna.' },
  { id: 'clavis-cloacae', name: 'Ianuarius’ Grate Key', latin: 'clavis cloacae', type: 'key', weight: 0.1, value: 0, icon: '⚿', tags: ['key'], description: 'A heavy bronze key for the drain grate under the shrine of Venus Cloacina, and the gang gate below.' },
  { id: 'clavis-loculi', name: 'Strongroom Key', latin: 'clavis loculi', type: 'key', weight: 0.05, value: 0, icon: '⚿', tags: ['key'], description: 'A key to the deposit chests of the strongrooms of Castor. Chrysippus never lets it out of his sight.' },
  // The Ludus' practice shields (lud-01; GDD §9.2: returned when you leave the Ludus)
  lent('scutum-ludi', 'scutum', 'Ludus Scutum', 'A battered curved scutum from the armory of the Ludus Magnus, stamped LVD·MAG on the rim. Successus wants it back.'),
  lent('parmula-ludi', 'parmula', 'Ludus Parmula', 'A small square thraex shield from the armory of the Ludus Magnus, its paint flaked to the wood. Successus wants it back.'),
];
