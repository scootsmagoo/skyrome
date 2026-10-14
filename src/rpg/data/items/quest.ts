/**
 * Quest items — docs/CONTENT.md §4.14 (all `type: 'quest'`, weightless, `questItem: true`: they
 * cannot be dropped, sold or stolen). Items that carry writing keep it in `text` (readable through
 * Inventory.use and the reader; see src/content/texts.ts bookViewFor).
 */
import { T12_GENITURA, T1_DECODED, T1_TABELLA, T2_EPISTULA } from '../../../content/texts';
import type { ItemDef } from '../../types';

function q(id: string, name: string, latin: string, description: string, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, latin, type: 'quest', questItem: true, weight: 0, value: 0, icon: '◈', description, ...extra };
}

export const QUEST_ITEMS: ItemDef[] = [
  q('quest-tabella-signata', 'The Courier’s Sealed Tablet', 'tabella signata', 'Two hinged wax tablets bound with linen thread, sealed with a horseman intaglio: Festus’ ring. The seal is unbroken. C. Marius Festus died for it.', { icon: '▭', text: T1_TABELLA, tags: ['tablet', 'sealed'] }),
  q('quest-epistula-festi', 'Festus’ Letter Home', 'epistula', 'An unsent letter to his mother, folded small and kept in his belt.', { icon: '✉', text: T2_EPISTULA, tags: ['letter'] }),
  q('quest-sacculum-festi', 'Festus’ Satchel', 'sacculus', 'A courier’s leather satchel with a cut strap. A scraped wax tablet and a strange silver coin are still inside.', { icon: '◫' }),
  q('quest-tabula-rasa', 'Scraped Wax Tablet', 'tabula rasa', 'A tablet scraped in haste. Under the lamp, three names still show in the grooves of the wax: “…NARIVS AVIT…”, “…VHOD…”, “HERMOG…”.', { icon: '▭', tags: ['tablet', 'clue'] }),
  q('quest-drachma-parthica', 'Parthian Drachm', 'drachma Parthica', 'A silver drachm of King Osroes: a bearded profile in a tiara. Not Roman money; not for spending.', { icon: '◉', tags: ['coin-foreign', 'clue'] }),
  q('quest-tessera-peregrina', 'Gratus’ Token', 'tessera', 'A bone token cut with a spear and the letters PEREG. It admits you to the Castra Peregrina, and helps when talking your way past a soldier (+10).', { icon: '◆', tags: ['token'] }),
  // The twins' game: the 21-letter alphabet shifted four along (X wraps to D), CONTENT.md T1.
  q('quest-clavis-cifrae', 'Gemellus’ Key', 'clavis litterarum', 'A child’s wax tablet: two alphabets, the second moved four letters along.', { icon: '▭', tags: ['tablet', 'cipher'], text: 'A B C D E F G H I K L M N O P Q R S T V X\nE F G H I K L M N O P Q R S T V X A B C D\n\n*(Four is still the number.)*' }),
  q('quest-nuntius-festi', 'Festus’ Message, Read', 'nuntius', 'The decoded dispatch, copied out letter by letter.', { icon: '✉', text: T1_DECODED, tags: ['letter'] }),
  q('quest-tabella-drachmae', 'Tablet Sealed with a Drachm', 'tabella', 'Sealed not with a ring but with the impression of a Parthian coin. Blank inside, except for a tally.', { icon: '▭', text: 'XII · XII · XXIV', tags: ['tablet', 'clue'] }),
  q('quest-zona-lurconis', 'Lurco’s Purse', 'zona', 'A fat leather purse with a folded bill of sale inside.', { icon: '◫' }),
  q('quest-titulus-onesimi', 'Bill of Sale for Onesimus', 'titulus', 'A bill of sale for a slave, crossed through.', { icon: '✉', tags: ['note'], text: '“Onesimus, drover, Syrian, about 26, healthy and without defects, 1,600 HS.”\n\n*(Crossed through, and beside it in another hand:)* aeger · in insula relictus. *“Sick, left on the island.”*' }),
  q('quest-testimonium-sorani', 'Soranus’ Statement', 'testimonium', 'A Greek physician’s note, in Greek and Latin, that the man was gravely ill and has recovered.', { icon: '✉', tags: ['note'] }),
  q('quest-genitura', 'The Sealed Nativity', 'genitura', 'A horoscope on a single papyrus sheet, folded and sealed. Carrying it is maiestas if it is found on you.', { icon: '✉', text: T12_GENITURA, tags: ['note', 'treason'] }),
  q('quest-formae-nummariae', 'Coin Moulds', 'formae nummariae', 'Clay moulds for denarii of Trajan and a lead blank, wrapped in waxed cloth inside a rush puppet.', { icon: '◫', tags: ['forgery'] }),
  q('quest-panni-picati', 'Pitch-soaked Rags', 'panni picati', 'Rags stiff with pitch from under the burned stair. Nobody cooks with pitch.', { icon: '◫', tags: ['evidence'] }),
  q('quest-hordeum-corruptum', 'Spoiled Barley', 'hordeum', 'Barley with chopped oleander leaves in it.', { icon: '◫', tags: ['evidence'] }),
  q('quest-epistula-patroni', 'The Patron’s Note', 'epistula', 'A sealed note from a patron’s house.', { icon: '✉', tags: ['letter', 'sealed'] }),
  q('quest-penna-corvi', 'Raven Feather', 'penna', 'A black feather: an invitation token.', { icon: '◆' }),
  q('quest-nardus-falsum', 'False Nard', 'nardus adulteratus', 'A flask of “nard” that smells of grass and lies.', { icon: '⚱', tags: ['evidence'] }),
  // mq-04 (docs/design/mq-04-columna.md §2.1): the archer's token, and the arrow Crito takes from Gratus's shoulder.
  q('quest-tessera-mucaporis', 'Bone Token', 'tessera ossea', 'A bone gaming token, scratched with a curved Dacian blade and the letters MVCAPOR.', { icon: '◆', tags: ['clue'] }),
  // mq-06-sacculus, The Purse (docs/STORY.md chapter 6).
  q('quest-rationes-euhodi', 'Page from Euhodus’s Ledger', 'pagina rationum', 'A page torn from the arms dealer’s order-book: “To P. A., Horrea Agrippiana, in grain sacks: 200 sicae, 6 bows, 300 arrows. Paid through H.”', { icon: '▤', tags: ['clue'] }),
  q('quest-tabulae-lyci', 'Lycus’s Tablets', 'tabellae', 'The banker’s clerk’s own count: “Eastern silver, by weight, for Pinarius. Every Nones since March.” The names are written very small.', { icon: '▭', tags: ['clue'] }),
  q('quest-chartae-aviti', 'Avitus’s Papers', 'chartae', 'The grain contract for the army bound for the East, Hermogenes’s loans, and one line that doesn’t fit: “To M. Ulpius Chrysogonus, of the chancery: 2,000 sesterces, for the fine hand.”', { icon: '▤', tags: ['clue'] }),
  // mq-07-aurum, The Eastern Gold (docs/STORY.md chapter 7).
  q('quest-rationes-malchi', 'Malchus’s Ledger', 'rationes', 'The Palmyrene’s ledger, in Greek: “To H., silver by weight. To the Lion, 500, for the road in March.”', { icon: '▤', tags: ['clue'] }),
  q('quest-tabula-siderum', 'A Star Table', 'tabula siderum', 'A Chaldaean’s table of the planets’ places, copied by Zenon for a client from Seleucia. The numbers don’t fit any sky.', { icon: '✶', tags: ['clue'] }),
  q('quest-genitura-caesaris', 'Caesar’s Nativity', 'genitura', 'The emperor’s stars, cast by Asclepiodotus: October marked, and one word in Greek, “the departure”. Casting it is treason.', { icon: '✶', tags: ['clue', 'contraband'] }),
  q('quest-epistula-mardonii', 'Mardonius’s Letter', 'epistula', 'From Mardonius’s box, in the planet cipher, with a purse of drachms. Gemellus read it: “Festus comes by the Appian Way on the eleventh, at dawn, to the Capena gate.”', { icon: '✉', tags: ['clue'] }),
  q('quest-sagitta-dacica', 'Dacian Arrow', 'sagitta', 'Crito pulled it out of Gratus’s shoulder: barbed, the shaft painted with red bands. He gave it to you without a word.', { icon: '➶' }),
  // mq-05 (docs/STORY.md chapter 5): what the sicarius under the Arch of Dolabella carried.
  q('quest-tabula-sicarii', 'The Knife-Man’s Tablet', 'tabella', 'A small wax tablet from the man in the dark cloak. Scratched in the wax: THE NEW ONE. CAELIAN. BEFORE THE CAMP. The wax is red, and a horseman with a spear is stamped on the frame: the couriers’ own tablets.', { icon: '▭', tags: ['clue'] }),
];
