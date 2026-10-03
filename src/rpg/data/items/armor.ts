/**
 * Armor and shields — docs/GDD.md §8.3–8.4. The outermost torso piece's family (body, else
 * padding) sets the damage-type matrix; the body piece's class decides heavy-armor penalties and
 * which armor skill trains. Helmets, manicae and greaves only add AR and weight.
 */
import type { ItemDef } from '../../types';
import { armor, heavy, light } from './build';

export const SHIELDS: ItemDef[] = [
  { id: 'scutum', name: 'Scutum', latin: 'scutum', type: 'shield', slot: 'offHand', weight: 7.5, value: 45, shield: { rating: 30, blockMitigation: 0.85, missiles: 1 }, visual: { shield: 'scutum' }, description: 'The curved rectangular shield of legionary, murmillo and secutor. Stops every missile.', icon: '▮' },
  { id: 'scutum-ovale', name: 'Oval Shield', latin: 'clipeus', type: 'shield', slot: 'offHand', weight: 6, value: 35, shield: { rating: 26, blockMitigation: 0.78, missiles: 0.9 }, visual: { shield: 'scutum-oval' }, description: 'The flat oval clipeus of auxiliaries and praetorians.', icon: '⬮' },
  { id: 'parma', name: 'Parma', latin: 'parma', type: 'shield', slot: 'offHand', weight: 3, value: 25, shield: { rating: 20, blockMitigation: 0.65, missiles: 0.7 }, visual: { shield: 'parma' }, description: 'A round shield of cavalry and hoplomachi.', icon: '●' },
  { id: 'parmula', name: 'Parmula', latin: 'parmula', type: 'shield', slot: 'offHand', weight: 2.5, value: 20, shield: { rating: 18, blockMitigation: 0.58, missiles: 0.6 }, visual: { shield: 'parmula' }, description: 'The small square shield of the thraex.', icon: '▪' },
  { id: 'galerus', name: 'Galerus', latin: 'galerus', type: 'shield', slot: 'offHand', weight: 1.2, value: 25, shield: { rating: 0, blockMitigation: 0.35, missiles: 0.2 }, visual: { shield: 'none' }, description: 'The retiarius’s raised shoulder guard. It only protects the left side.', icon: '◣', tags: ['retiarius'] },
];

export const ARMOR: ItemDef[] = [
  armor('subarmalis', 'Subarmalis', 'subarmalis', 'padding', light(10, 'padded'), 3, 20, { armor: { body: { kind: 'padded' } } }, 'A padded linen jerkin, worn over the tunic and under mail — or on its own.'),
  armor('thorax-coriaceus', 'Leather Cuirass', 'thorax coriaceus', 'body', light(14, 'padded'), 5, 35, { armor: { body: { kind: 'leather' } } }, 'Hardened oxhide shaped to the chest.'),
  armor('cardiophylax', 'Cardiophylax', 'cardiophylax', 'body', light(10, 'padded'), 2, 30, { armor: { body: { kind: 'padded' } } }, 'The provocator’s small chest plate on a padded harness.'),
  armor('lorica-hamata', 'Mail Shirt', 'lorica hamata', 'body', heavy(30, 'mail'), 9, 190, { armor: { body: { kind: 'lorica-hamata', metal: 'iron' } } }, 'Thousands of riveted iron rings: heavy on the shoulders, kind to the ribs.'),
  armor('lorica-squamata', 'Scale Shirt', 'lorica squamata', 'body', heavy(32, 'mail'), 10, 220, { armor: { body: { kind: 'lorica-squamata', metal: 'bronze' } } }, 'Bronze scales wired to a linen backing.'),
  armor('lorica-segmentata', 'Lorica Segmentata', 'lorica segmentata', 'body', heavy(38, 'plate'), 8.5, 260, { armor: { body: { kind: 'lorica-segmentata', metal: 'iron' } } }, 'Segmented iron plate of the Corbridge type, as on Trajan’s Column. Military issue: 390 den. on the black market.', { tags: ['military'] }),
  armor('thorax-musculus', 'Muscle Cuirass', 'thorax', 'body', heavy(34, 'plate'), 9, 320, { armor: { body: { kind: 'lorica-segmentata', metal: 'bronze' } } }, 'A bronze cuirass modelled on a hero’s torso, for officers.'),
  armor('galea-gallica', 'Imperial Gallic Helmet', 'galea', 'head', heavy(12), 1.8, 60, { armor: { helmet: { kind: 'imperial-gallic', metal: 'iron' } } }, 'An iron helmet with a deep neck guard and embossed brows.'),
  armor('galea-italica', 'Imperial Italic Helmet', 'galea', 'head', heavy(11), 1.9, 55, { armor: { helmet: { kind: 'imperial-italic', metal: 'bronze' } } }, 'A bronze helmet from Italian workshops.'),
  armor('galea-cruciata', 'Cross-braced Gallic Helmet', 'galea', 'head', heavy(14), 2.1, 80, { armor: { helmet: { kind: 'imperial-gallic', metal: 'iron' } } }, 'A Gallic helmet with iron cross-braces added in the Dacian wars, after the falx split too many skulls.'),
  armor('galea-attica', 'Praetorian Helmet', 'galea Attica', 'head', heavy(12), 2, 150, { armor: { helmet: { kind: 'praetorian-attic', crest: '#9b1c1c', metal: 'gilded' } } }, 'The Guard’s crested Attic-style helmet.'),
  armor('galea-murmillonis', 'Murmillo Helmet', 'galea murmillonis', 'head', heavy(14), 3.5, 90, { armor: { helmet: { kind: 'murmillo', metal: 'bronze' } } }, 'Broad brim and tall crest; a grille visor narrows your view.', { equipFlags: ['visor.medium'] }),
  armor('galea-thraecis', 'Thraex Helmet', 'galea thraecis', 'head', heavy(13), 3.3, 90, { armor: { helmet: { kind: 'thraex', metal: 'bronze' } } }, 'A griffin-crested helmet with a grille visor.', { equipFlags: ['visor.medium'] }),
  armor('galea-secutoris', 'Secutor Helmet', 'galea secutoris', 'head', heavy(16), 3.8, 90, { armor: { helmet: { kind: 'secutor', metal: 'bronze' } } }, 'A smooth egg of bronze with two eyeholes: no net can catch it, and you see very little.', { equipFlags: ['visor.strong', 'net.proof'] }),
  armor('galea-hoplomachi', 'Hoplomachus Helmet', 'galea hoplomachi', 'head', heavy(13), 3.3, 85, { armor: { helmet: { kind: 'hoplomachus', metal: 'bronze' } } }, 'A Greek-style gladiator’s helmet with a feathered crest.', { equipFlags: ['visor.medium'] }),
  armor('galea-provocatoris', 'Provocator Helmet', 'galea provocatoris', 'head', heavy(13), 3.2, 80, { armor: { helmet: { kind: 'provocator', metal: 'bronze' } } }, 'A visored helmet with a neck guard, like a legionary’s.', { equipFlags: ['visor.medium'] }),
  armor('galea-equitis', 'Eques Helmet', 'galea equitis', 'head', heavy(12), 2.8, 80, { armor: { helmet: { kind: 'imperial-italic', metal: 'bronze' } } }, 'A brimmed visored helmet for the mounted gladiator.', { equipFlags: ['visor.medium'] }),
  armor('manica-linea', 'Linen Manica', 'manica linea', 'arm', light(4), 1, 15, { armor: { manica: 'right' } }, 'A quilted linen arm guard.', { tags: ['manica'] }),
  armor('manica-ferrea', 'Iron Manica', 'manica ferrea', 'arm', heavy(7), 2, 60, { armor: { manica: 'right' } }, 'A segmented iron arm guard of the kind the Dacian falx made necessary.', { tags: ['manica'] }),
  armor('manica-thraecis-aurata', 'Gilded Thraex Manica', 'manica aurata', 'arm', light(9), 1.2, 160, { armor: { manica: 'right' } }, 'A famous thraex’s gilded arm guard.', { tags: ['manica', 'unique'] }),
  armor('ocrea', 'Greave', 'ocrea', 'shins', light(3), 0.8, 18, { armor: { greaves: 'left' } }, 'A single bronze greave, gladiator fashion.'),
  armor('ocreae', 'High Greaves', 'ocreae', 'shins', light(6), 1.8, 40, { armor: { greaves: 'both' } }, 'A pair of high bronze greaves.'),
];
