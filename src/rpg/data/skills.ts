/**
 * The 17 skills — docs/GDD.md §5.4. Use-based, in three lines (Martial, Clandestine, Civic), each
 * feeding a pool (Health, Stamina, Pietas). Every skill starts at 10 plus the origin bonus.
 */
import type { SkillDef } from '../types';

export const SKILLS: SkillDef[] = [
  // ---- Martial
  { id: 'blades', name: 'Blades', latin: 'Gladius', attribute: 'health', category: 'martial', description: 'Pugio, sica, gladius, spatha, the dolabra and the two-handed Dacian falx.', howToTrain: 'Hit a hostile: light 4, power 7, riposte or finisher 10, sneak attack 12. A training dummy gives half, and nothing above 30; practice bouts against living opponents count as real fights.' },
  { id: 'spear', name: 'Spear', latin: 'Hasta', attribute: 'stamina', category: 'martial', description: 'Hasta, lancea, venabulum and trident; thrown pila, javelins and the net.', howToTrain: 'As Blades; a thrown hit 8, or 12 beyond 15 m; a net that entangles 6.' },
  { id: 'archery', name: 'Archery & Sling', latin: 'Arcus et Funda', attribute: 'stamina', category: 'martial', description: 'The composite bow and the sling.', howToTrain: 'A hit 6, +1 per 10 m (max +6); headshots ×1.5.' },
  { id: 'shield', name: 'Shield', latin: 'Scutum', attribute: 'health', category: 'martial', description: 'Scutum, clipeus, parma and parmula: blocking, bashing and the timed parry.', howToTrain: 'Block 3 + 0.2 × damage absorbed; parry 8; bash hit 5.' },
  { id: 'brawling', name: 'Brawling', latin: 'Pugilatus', attribute: 'stamina', category: 'martial', description: 'Fists, the caestus, the fustis, clava and vitis — and knockouts.', howToTrain: 'Hit 3 (blunt weapon 4); knockout 12; grapple-throw 8.' },
  { id: 'heavy-armor', name: 'Heavy Armor', latin: 'Lorica', attribute: 'health', category: 'martial', description: 'Mail, scale, segmented plate, the muscle cuirass and metal helmets.', howToTrain: 'Take hits while your body piece is heavy: 2 + 0.3 × damage (max 10).' },
  { id: 'light-armor', name: 'Light Armor', latin: 'Levis Armatura', attribute: 'stamina', category: 'martial', description: 'Subarmalis, leather, manica, greaves and the gladiator’s kit.', howToTrain: 'As Heavy Armor, while your body piece is light (or you wear only padding).' },
  // ---- Clandestine
  { id: 'athletics', name: 'Athletics', latin: 'Gymnastica', attribute: 'stamina', category: 'clandestine', difficulty: 0.8, description: 'Sprinting, mantling, climbing, swimming the Tiber and falling well.', howToTrain: '1 per 10 m sprinted; mantle or climb 4; a rooftop route completed 25; a Vigiles fire-run 20; 1 per 20 m swum; surviving a fall over 4 m 3.' },
  { id: 'stealth', name: 'Stealth', latin: 'Latebrae', attribute: 'stamina', category: 'clandestine', description: 'Sneaking, crowd cover and sneak attacks.', howToTrain: '0.6/s while sneaking undetected within 15 m of someone who could see you (max 30 a minute); sneak attack 15.' },
  { id: 'pickpocket', name: 'Pickpocket', latin: 'Furtum', attribute: 'stamina', category: 'clandestine', difficulty: 1.2, description: 'Lifting purses and planting things in them.', howToTrain: 'A successful lift: 10 + value/5 (max 60).' },
  { id: 'locks-seals', name: 'Locks & Seals', latin: 'Claustra et Signa', attribute: 'stamina', category: 'clandestine', difficulty: 1.1, description: 'Roman tumbler locks, wax seals and forgery.', howToTrain: 'A lock opened 8 / 15 / 25 / 40 by tier; a seal opened and resealed 15; a seal forged 40.' },
  // ---- Civic
  { id: 'rhetoric', name: 'Rhetoric', latin: 'Eloquentia', attribute: 'pietas', category: 'civic', difficulty: 1.1, description: 'Persuade, intimidate, haggle, plead in court and speak to crowds.', howToTrain: 'A check passed 10 × tier (1–6), failed 2; haggle won 10; salutatio small talk 5 (once per patron per day); a popina debate won 15; radiant persuasion jobs 20–40; a court case won 100; a crowd speech 50.' },
  { id: 'mercatura', name: 'Trade', latin: 'Mercatura', attribute: 'pietas', category: 'civic', description: 'Buying, selling, fencing and investments.', howToTrain: 'Every transaction worth 1 den. or more: 1 + value/10 (max 50); repeats of the same item with the same vendor on the same day give half each time; fencing ×1.5.' },
  { id: 'medicina', name: 'Medicine', latin: 'Medicina', attribute: 'health', category: 'civic', description: 'Bandaging, remedies, poisons and diagnosis.', howToTrain: 'Bandaging yourself 3; treating someone 15; a new effect learned 5. Remedy-making (10 + 5 per effect) arrives with the crafting workbench.' },
  { id: 'fabrica', name: 'Smithing', latin: 'Fabrica', attribute: 'health', category: 'civic', description: 'Improving and repairing arms and armor, casting lead shot, forging.', howToTrain: 'Improve 10 + value/20; repair 5; casting 10 glandes 6. Forging arrives with crafting recipes.' },
  { id: 'religio', name: 'Rites', latin: 'Religio', attribute: 'pietas', category: 'civic', description: 'Prayer, offerings, vows, omens and festivals. (The skill is religio so it never collides with the pool pietas.)', howToTrain: 'Daily prayer 8; offering 5 + value/2 (max 30); vow fulfilled 40; festival rite 25; omen read 10.' },
  { id: 'equitatio', name: 'Riding & Driving', latin: 'Equitatio', attribute: 'stamina', category: 'civic', difficulty: 0.8, description: 'Chariot racing in the city; riding in the expansions.', howToTrain: '2 per 100 m driven or ridden; a race lap 15; a race won 100.' },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);
