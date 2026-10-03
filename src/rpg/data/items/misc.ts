/** Tools, trade goods, documents and coins — docs/GDD.md §8.5–8.6. Coins become denarii when picked up (§7.1). */
import type { ItemDef } from '../../types';
import { AS, misc } from './build';

export const TOOLS: ItemDef[] = [
  { id: 'hamulus', name: 'Lockpick', latin: 'hamulus', type: 'tool', weight: 0.02, value: 1, stackable: true, icon: '⌐', tags: ['lockpick'], description: 'A bent bronze pick. Owning one is not a crime; being found with one at night is a conversation.' },
  { id: 'instrumentum-fabri', name: 'Repair Kit', latin: 'instrumentum fabri', type: 'tool', weight: 1.5, value: 8, stackable: true, icon: '⚒', tags: ['repair-kit'], description: 'Rivets, wire, whetstone and leather: +25% condition in the field (needs the Armorer of the Legion perk).' },
  { id: 'lucerna', name: 'Clay Lamp', latin: 'lucerna', type: 'tool', weight: 0.3, value: AS, stackable: true, icon: '🪔', tags: ['light'], description: 'A mould-made clay lamp for interiors and for the lararium.' },
  { id: 'tabula-cerata', name: 'Wax Tablet', latin: 'tabula cerata', type: 'misc', weight: 0.3, value: 3 * AS, stackable: true, icon: '▭', description: 'Two leaves of black wax with a stylus: notes, forged messages, quest letters.' },
  misc('stilus', 'Stylus', 'stilus', 0.02, AS, 'A bronze stylus: one end to write, the other to erase.'),
  misc('cera-signatoria', 'Sealing Wax', 'cera signatoria', 0.05, 2 * AS, 'Red sealing wax, for resealing letters (Locks & Seals).'),
  misc('defixio', 'Curse Tablet', 'defixio', 0.2, 2 * AS, 'A blank lead sheet. Inscribe it, nail it and deposit it at a grave, well or spring. It harms only a target who learns of it.', { tags: ['curse'] }),
  misc('clavus', 'Nail', 'clavus', 0.02, AS, 'An iron nail, to pierce a curse tablet.', { tags: ['curse'] }),
  misc('tabella-votiva', 'Votive Tablet', 'tabella votiva', 0.2, 0, 'A little bronze tablet for a temple wall: V·S·L·M, votum solvit libens merito, “paid the vow, willingly and deservedly”. Given when you pay a vow (§14.6).'),
  misc('tessera-frumentaria', 'Grain Token', 'tessera frumentaria', 0.01, 25, 'A lead token for the monthly grain dole at the Porticus Minucia. Worth 25 den. on the black market.'),
  misc('tessera-theatralis', 'Theatre Token', 'tessera theatralis', 0.01, AS, 'A bone token for a seat at the theatre.'),
  misc('tali', 'Knucklebones', 'tali', 0.05, 4 * AS, 'Four sheep’s knucklebones. Dice games are illegal outside the Saturnalia.'),
  misc('fritillus', 'Dice Cup', 'fritillus', 0.1, 4 * AS, 'A turned-wood dice cup.'),
  misc('piper', 'Black Pepper', 'piper nigrum', 0.33, 4, 'A libra of black pepper from India, stored in the Horrea Piperataria.', { tags: ['valuable', 'spice'] }),
  misc('piper-album', 'White Pepper', 'piper album', 0.33, 7, 'A libra of white pepper.', { tags: ['valuable', 'spice'] }),
  misc('piper-longum', 'Long Pepper', 'piper longum', 0.33, 15, 'A libra of long pepper, the dearest kind (Pliny NH 12.28).', { tags: ['valuable', 'spice'] }),
  misc('argentum', 'Silver Plate', 'argentum', 0.6, 40, 'A silver dish chased with olive branches.', { tags: ['valuable'] }),
  misc('vasa-arretina', 'Arretine Ware', 'vasa Arretina', 0.6, 2, 'Glossy red Arretine bowls stamped with the potter’s name.', { tags: ['valuable'] }),
  misc('vitrum', 'Glass Beaker', 'vitrum', 0.3, 3, 'Blown glass, clear as water.', { tags: ['valuable'] }),
  misc('purpura', 'Tyrian Purple', 'purpura', 0.1, 100, 'A vial of dye from ten thousand murex snails.', { tags: ['valuable', 'luxury'] }),
  misc('diploma', 'Discharge Diploma', 'diploma militare', 0.1, 0, 'Two bronze tablets, wired shut and witnessed by seven, granting a veteran citizenship and the right to marry.', { tags: ['keepsake', 'document'] }),
  misc('gemma', 'Carnelian Gem', 'gemma', 0.01, 30, 'A carnelian cut with a tiny Fortuna. (Extra.)', { tags: ['valuable'] }),
  misc('tessera-collegii', 'Collegium Token', 'tessera collegii', 0.02, 4 * AS, 'A bronze token of a trade club, stamped with its patron god. A pass to its back rooms.', { tags: ['token'] }),
  misc('tabula-stipendii', 'Pay Tablet', 'tabula stipendii', 0.1, 2, 'A soldier’s pay record with the deductions: hay, boots, the burial club, the camp Saturnalia.', { tags: ['document'] }),
  misc('epistula-signata', 'Sealed Letter', 'epistula signata', 0.05, 0, 'A sealed letter from a dead man’s purse. Someone will want it back.', { tags: ['document', 'quest-lead'] }),
  misc('nugae', 'Stolen Trinket', 'nugae', 0.05, 3, 'A pretty thing someone else paid for: a hairpin, a bronze mirror, a cheap ring.', { tags: ['valuable'] }),
  misc('corium', 'Hide', 'corium', 1.5, 2, 'A tanned hide. (Extra.)'),
  misc('ferrum', 'Iron Bar', 'ferrum', 2, 2, 'Wrought iron for the forge.', { tags: ['metal'] }),
  // Coins convert to denarii when picked up (§7.1).
  misc('aureus', 'Aureus', 'aureus', 0.007, 25, 'A gold aureus of Trajan: 25 denarii.', { tags: ['coin'] }),
  misc('denarius-columnae', 'New Denarius', 'denarius', 0.003, 1, 'A new denarius showing the Column.', { tags: ['coin'] }),
  misc('dupondius-domitiani', 'Worn Dupondius', 'dupondius', 0.013, 2 * AS, 'A worn dupondius of Domitian.', { tags: ['coin'] }),
];
