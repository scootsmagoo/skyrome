/**
 * Clothing, formal dress and status items — docs/GDD.md §8.2. Formal dress is a toga (men) or a
 * stola with a palla (women): its status effects apply once, not per piece. Only citizens and
 * freed citizens may wear it (usurpatio, §14.1); a woman in a toga takes a social stain (§3.7).
 */
import type { ItemDef } from '../../types';
import { armor, cloth } from './build';

export const CLOTHING: ItemDef[] = [
  armor('tunica', 'Tunic', 'tunica', 'under', cloth(), 0.5, 4, { garment: { kind: 'tunica', color: '#e2d6bc' } }, 'A plain belted tunic of undyed wool.'),
  armor('tunica-crassa', 'Thick Tunic', 'tunica crassa', 'under', cloth(2), 0.9, 6, { garment: { kind: 'tunica', color: '#b8a27c' } }, 'A tunic of heavy wool, good against the cold and the occasional knife.'),
  armor('toga', 'Toga', 'toga', 'cloak', cloth(), 3.5, 25, { garment: { kind: 'toga', color: '#efe8d8' } }, 'Formal dress of male citizens and freedmen — anyone else commits usurpatio togae; on a woman it marks a prostitute or an adulteress. +10 persuasion with elites and officials, −5 with Subura plebs; sprinting costs 50% more and attacks are 20% slower. Required at a salutatio and in court.', { tags: ['citizen-only', 'toga'], equipFlags: ['dress.toga'], equipModifiers: { 'stamina.sprintCost': -0.5, 'attack.speed': -0.2 } }),
  armor('toga-fina', 'Fine Toga', 'toga pura', 'cloak', cloth(), 3.5, 80, { garment: { kind: 'toga', color: '#f5f1e6' } }, 'Fine Apulian wool, fulled to a gleam. As the toga.', { tags: ['citizen-only', 'toga'], equipFlags: ['dress.toga'], equipModifiers: { 'stamina.sprintCost': -0.5, 'attack.speed': -0.2 } }),
  armor('stola', 'Stola', 'stola', 'body', cloth(), 1.2, 20, { garment: { kind: 'stola', color: '#7d5a7a' } }, 'The matron’s long overdress on shoulder straps: citizen women and freedwomen only (otherwise usurpatio). With a palla it is formal dress, with the toga’s status effects. Sprinting costs 15% more.', { tags: ['citizen-only', 'stola'], equipFlags: ['dress.stola'], equipModifiers: { 'stamina.sprintCost': -0.15 } }),
  armor('stola-fina', 'Fine Stola', 'stola', 'body', cloth(), 1.2, 60, { garment: { kind: 'stola', color: '#8a3f5e' } }, 'A stola of fine dyed wool with a woven border. As the stola.', { tags: ['citizen-only', 'stola'], equipFlags: ['dress.stola'], equipModifiers: { 'stamina.sprintCost': -0.15 } }),
  armor('palla', 'Palla', 'palla', 'cloak', cloth(), 1.5, 8, { garment: { kind: 'palla', color: '#5e6f4a' } }, 'A woman’s mantle, often drawn over the head outdoors. With a stola it completes formal dress. Sprinting costs 25% more and attacks are 10% slower.', { tags: ['palla'], equipFlags: ['dress.palla'], equipModifiers: { 'stamina.sprintCost': -0.25, 'attack.speed': -0.1 } }),
  armor('palla-fina', 'Fine Palla', 'palla', 'cloak', cloth(), 1.5, 30, { garment: { kind: 'palla', color: '#3e5878' } }, 'A palla of fine dyed wool. As the palla.', { tags: ['palla'], equipFlags: ['dress.palla'], equipModifiers: { 'stamina.sprintCost': -0.25, 'attack.speed': -0.1 } }),
  armor('paenula', 'Paenula', 'paenula', 'cloak', cloth(), 1.5, 8, { garment: { kind: 'paenula', color: '#6b5236' } }, 'A hooded travelling cloak. Hooded at night, witnesses identify you only half the time; it keeps off the rain.', { equipFlags: ['hooded'] }),
  armor('sagum', 'Sagum', 'sagum', 'cloak', cloth(1), 1.8, 6, { garment: { kind: 'sagum', color: '#8a2f22' } }, 'A rectangle of heavy wool pinned at the shoulder: a soldier’s cloak and blanket.'),
  armor('lacerna', 'Lacerna', 'lacerna', 'cloak', cloth(), 0.8, 10, { garment: { kind: 'lacerna', color: '#3f5a7a' } }, 'A fashionable light cloak: +3 persuasion at the games.', { equipFlags: ['dress.lacerna'] }),
  armor('bracae', 'Bracae', 'bracae', 'legs', cloth(1), 0.6, 3, {}, 'Gallic trousers. Useful in winter, barbarous in the Forum.'),
  armor('fasciae', 'Leg Wrappings', 'fasciae', 'legs', cloth(1), 0.2, 1, {}, 'Wool bands wound round the shins.'),
  armor('caligae', 'Caligae', 'caligae', 'feet', cloth(1), 1, 5, {}, 'Hobnailed military boots: footsteps 20% louder on stone.', { equipFlags: ['hobnails'] }),
  armor('calcei', 'Calcei', 'calcei', 'feet', cloth(), 0.6, 4, {}, 'Closed leather shoes, worn with the toga.'),
  armor('soleae', 'Soleae', 'soleae', 'feet', cloth(), 0.3, 1, {}, 'Indoor sandals. In the street: −5 persuasion with elites.', { equipFlags: ['dress.soleae'] }),
  armor('carbatinae', 'Carbatinae', 'carbatinae', 'feet', cloth(), 0.5, 1, {}, 'Rustic one-piece leather shoes.'),
  armor('cucullus', 'Hood', 'cucullus', 'head', cloth(), 0.2, 1, {}, 'A loose hood: as the paenula’s, witnesses identify you only half the time at night. Worn instead of a helmet.', { equipFlags: ['hooded'] }),
  armor('petasus', 'Petasus', 'petasus', 'head', cloth(1), 0.2, 1, {}, 'A broad-brimmed sun hat for travellers.'),
  // extras
  armor('tunica-linea', 'Linen Tunic', 'tunica linea', 'under', cloth(), 0.4, 12, { garment: { kind: 'tunica', color: '#ece3cf' } }, 'Fine Egyptian linen, cool in the Roman summer. (Extra.)'),
  armor('tunica-longa', 'Long Tunic', 'tunica talaris', 'under', cloth(), 0.7, 5, { garment: { kind: 'tunica-long', color: '#b98f5e' } }, 'An ankle-length tunic in the eastern fashion. (Extra.)'),
  armor('pallium', 'Pallium', 'pallium', 'cloak', cloth(), 1.2, 10, { garment: { kind: 'lacerna', color: '#a5916c' } }, 'The Greek mantle of philosophers and physicians. (Extra.)'),
  armor('pileus', 'Pileus', 'pileus', 'head', cloth(), 0.2, 1, { armor: { helmet: { kind: 'pileus' } } }, 'A conical felt cap, worn at manumission. (Extra.)'),
];

export const JEWELLERY: ItemDef[] = [
  { id: 'fascinum', name: 'Fascinum', latin: 'fascinum', type: 'misc', slot: 'neck', weight: 0.05, value: 2, icon: '◎', equipFlags: ['amulet'], description: 'A small bronze phallic charm. Amulets negate curse tablets and halve the chance of a bad daily omen.' },
  { id: 'bulla', name: 'Golden Bulla', latin: 'bulla aurea', type: 'misc', slot: 'neck', weight: 0.05, value: 25, icon: '◎', equipFlags: ['amulet'], description: 'The locket a freeborn boy wears until he takes the toga of manhood. As an amulet, it negates curse tablets.' },
  { id: 'lunula', name: 'Lunula', latin: 'lunula', type: 'misc', slot: 'neck', weight: 0.05, value: 10, icon: '◎', equipFlags: ['amulet'], description: 'A crescent-moon pendant worn by girls and women against the evil eye.' },
  { id: 'anulus-aureus', name: 'Gold Ring', latin: 'anulus aureus', type: 'misc', slot: 'finger', weight: 0.01, value: 50, icon: '○', equipFlags: ['dress.anulus-aureus'], description: 'The gold ring. On a man it marks an eques (anyone else commits usurpatio): +10 persuasion with elites. On a woman it is jewellery, with no status and no crime.' },
  { id: 'anulus-signatorius', name: 'Signet Ring', latin: 'anulus signatorius', type: 'misc', slot: 'finger', weight: 0.01, value: 5, icon: '○', description: 'An iron ring with a carnelian intaglio for sealing letters. It can be copied (the Forger perk).' },
  // extras
  { id: 'nodus-isidis', name: 'Knot of Isis', latin: 'nodus Isiacus', type: 'misc', slot: 'neck', weight: 0.02, value: 15, icon: '◎', equipFlags: ['amulet'], description: 'A faience tyet amulet from the Iseum Campense. (Extra.)' },
  { id: 'torques', name: 'Gold Torc', latin: 'torques', type: 'misc', weight: 0.4, value: 120, icon: '◎', tags: ['valuable'], description: 'A twisted gold neck ring taken from a Gaul or a Dacian — loot, not jewellery for a Roman. (Extra.)' },
];
