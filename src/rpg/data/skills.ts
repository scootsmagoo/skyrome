/**
 * Skills, perks and origins — docs/GDD.md §3.2, §5.4 and §5.5 (v1.0 starting values).
 *
 * Seventeen use-based skills in three lines (Martial, Clandestine, Civic) feeding the pools Health,
 * Stamina and Pietas. Every skill starts at 10 plus the origin bonus. Perks cost one point each and
 * need a skill level; a taken perk's id is also a sheet flag (sheet.hasFlag('perk-blades-punctim')),
 * which is how systems test perks without a ModifierId. Modifiers are additive fractions except
 * `*.max` and `carry.max` (flat points).
 */
import type { BackgroundDef, PerkDef, SkillDef } from '../types';

export const SKILLS: SkillDef[] = [
  // ---- Martial
  { id: 'blades', name: 'Blades', latin: 'Gladius', attribute: 'health', category: 'martial', description: 'Pugio, sica, gladius, spatha, the dolabra and the two-handed Dacian falx.', howToTrain: 'Hit a hostile: light 4, power 7, riposte or finisher 10, sneak attack 12. Dummies and sparring give half, and nothing above 30.' },
  { id: 'spear', name: 'Spear', latin: 'Hasta', attribute: 'stamina', category: 'martial', description: 'Hasta, lancea, venabulum and trident; thrown pila, javelins and the net.', howToTrain: 'As Blades; a thrown hit 8, or 12 beyond 15 m; a net that entangles 6.' },
  { id: 'archery', name: 'Archery & Sling', latin: 'Arcus et Funda', attribute: 'stamina', category: 'martial', description: 'The composite bow and the sling.', howToTrain: 'A hit 6, +1 per 10 m (max +6); headshots ×1.5.' },
  { id: 'shield', name: 'Shield', latin: 'Scutum', attribute: 'health', category: 'martial', description: 'Scutum, clipeus, parma and parmula: blocking, bashing and the timed parry.', howToTrain: 'Block 3 + 0.2 × damage absorbed; parry 8; bash hit 5.' },
  { id: 'brawling', name: 'Brawling', latin: 'Pugilatus', attribute: 'stamina', category: 'martial', description: 'Fists, the caestus, the fustis, clava and vitis — and knockouts.', howToTrain: 'Hit 3 (blunt weapon 4); knockout 12; grapple-throw 8.' },
  { id: 'heavy-armor', name: 'Heavy Armor', latin: 'Lorica', attribute: 'health', category: 'martial', description: 'Mail, scale, segmented plate, the muscle cuirass and metal helmets.', howToTrain: 'Take hits while at least half your worn armor is heavy: 2 + 0.3 × damage (max 10).' },
  { id: 'light-armor', name: 'Light Armor', latin: 'Levis Armatura', attribute: 'stamina', category: 'martial', description: 'Subarmalis, leather, manica, greaves and the gladiator’s kit.', howToTrain: 'As Heavy Armor, for light armor.' },
  // ---- Clandestine
  { id: 'athletics', name: 'Athletics', latin: 'Gymnastica', attribute: 'stamina', category: 'clandestine', difficulty: 0.8, description: 'Sprinting, mantling, climbing, swimming the Tiber and falling well.', howToTrain: '1 per 25 m sprinted; mantle or climb 2; 1 per 20 m swum; surviving a fall over 4 m 3.' },
  { id: 'stealth', name: 'Stealth', latin: 'Latebrae', attribute: 'stamina', category: 'clandestine', description: 'Sneaking, crowd cover and sneak attacks.', howToTrain: '0.6/s while sneaking undetected within 15 m of someone who could see you (max 30 a minute); sneak attack 15.' },
  { id: 'pickpocket', name: 'Pickpocket', latin: 'Furtum', attribute: 'stamina', category: 'clandestine', difficulty: 1.2, description: 'Lifting purses and planting things in them.', howToTrain: 'A successful lift: 10 + value/5 (max 60).' },
  { id: 'locks-seals', name: 'Locks & Seals', latin: 'Claustra et Signa', attribute: 'stamina', category: 'clandestine', difficulty: 1.1, description: 'Roman tumbler locks, wax seals and forgery.', howToTrain: 'A lock opened 8 / 15 / 25 / 40 by tier; a seal opened and resealed 15; a seal forged 40.' },
  // ---- Civic
  { id: 'rhetoric', name: 'Rhetoric', latin: 'Eloquentia', attribute: 'pietas', category: 'civic', difficulty: 1.1, description: 'Persuade, intimidate, haggle, plead in court and speak to crowds.', howToTrain: 'A check passed 10 × tier (1–6), failed 2; haggle won 5; court case won 100; crowd speech 50.' },
  { id: 'mercatura', name: 'Trade', latin: 'Mercatura', attribute: 'pietas', category: 'civic', description: 'Buying, selling, fencing and investments.', howToTrain: 'Every transaction: 1 + value/10 (max 50); fencing ×1.5.' },
  { id: 'medicina', name: 'Medicine', latin: 'Medicina', attribute: 'health', category: 'civic', description: 'Bandaging, remedies, poisons and diagnosis.', howToTrain: 'A remedy made 10 + 5 per effect; a new effect learned 5; treating someone 15; bandaging yourself 3.' },
  { id: 'fabrica', name: 'Smithing', latin: 'Fabrica', attribute: 'health', category: 'civic', description: 'Improving and repairing arms and armor, casting lead shot, forging.', howToTrain: 'Improve 10 + value/20; repair 5; casting 10 glandes 6; forging 25.' },
  { id: 'religio', name: 'Rites', latin: 'Religio', attribute: 'pietas', category: 'civic', description: 'Prayer, offerings, vows, omens and festivals. (The skill is religio so it never collides with the pool pietas.)', howToTrain: 'Daily prayer 8; offering 5 + value/2 (max 30); vow fulfilled 40; festival rite 25; omen read 10.' },
  { id: 'equitatio', name: 'Riding & Driving', latin: 'Equitatio', attribute: 'stamina', category: 'civic', difficulty: 0.8, description: 'Chariot racing in the city; riding in the expansions.', howToTrain: '2 per 100 m driven or ridden; a race lap 15; a race won 100.' },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);

const perk = (skill: string, id: string, name: string, requiresLevel: number, description: string, extra: Partial<PerkDef> = {}): PerkDef => ({ id: `perk-${id}`, skill, name, requiresLevel, description, ...extra });

/** GDD §5.5: four perks per skill for v1.0. Effects use ModifierIds where one exists, else the perk id as a flag. */
export const PERKS: PerkDef[] = [
  perk('blades', 'blades-punctim', 'Punctim', 20, '“With the point”: thrusts do 25% more damage against mail and plate.'),
  perk('blades', 'blades-bilbilis-edge', 'Bilbilis Edge', 35, 'Cuts are 15 percentage points more likely to cause bleeding.'),
  perk('blades', 'blades-pugio-draw', 'Pugio Draw', 50, 'A riposte on a staggered foe below 30% health is an instant finisher.'),
  perk('blades', 'blades-falx-hook', 'Falx Hook', 65, 'Falx and sica attacks ignore 50% of block mitigation.'),
  perk('spear', 'spear-longa-manus', 'Long Reach', 20, '+0.3 m reach with spears.'),
  perk('spear', 'spear-pilum-volley', 'Pilum Volley', 30, 'Thrown weapons do 30% more damage; pila stuck in shields halve block mitigation.'),
  perk('spear', 'spear-venator', 'Venator', 45, '+30% damage against beasts.'),
  perk('spear', 'spear-brace', 'Brace', 60, 'Blocking a charge with a spear: the attacker takes double damage and staggers.'),
  perk('archery', 'archery-steady-draw', 'Steady Draw', 20, 'Holding a drawn bow drains 30% less stamina; slight zoom at full draw.'),
  perk('archery', 'archery-lead-shot', 'Lead Shot', 30, 'Lead glandes do 50% more poise damage.'),
  perk('archery', 'archery-cretan-eye', 'Cretan Eye', 50, 'Aim sway −60%; full draw 0.2 s faster.'),
  perk('archery', 'archery-moving-shot', 'Moving Shot', 60, 'Draw and whirl at jogging speed.'),
  perk('shield', 'shield-umbo', 'Umbo Strike', 20, 'A power bash (hold F while blocking) knocks down non-elite humans.'),
  perk('shield', 'shield-testudo', 'Testudo', 30, 'A raised scutum stops missiles from 180° and blocks them for no stamina.'),
  perk('shield', 'shield-parry-plus', 'Practised Parry', 40, 'The parry window is 0.06 s longer.'),
  perk('shield', 'shield-wall', 'Shield Wall', 60, '+10% block mitigation per ally within 2 m (max +20%).'),
  perk('brawling', 'brawling-caestus', 'Caestus', 20, 'Fist and caestus damage +50%.', { modifiers: { 'damage.unarmed': 0.5 } }),
  perk('brawling', 'brawling-subdue', 'Subdue', 30, 'All blunt weapons knock out (never kill) non-boss humans.'),
  perk('brawling', 'brawling-pankration', 'Pankration', 50, 'An unarmed power attack becomes a grapple-throw (knockdown 2 s).'),
  perk('brawling', 'brawling-fustis', 'Fustis Discipline', 60, 'Blunt hits on staggered foes disarm them 25% of the time.'),
  perk('heavy-armor', 'heavy-armor-well-fitted', 'Well Fitted', 20, 'Removes the −15% stamina regeneration penalty of heavy armor.'),
  perk('heavy-armor', 'heavy-armor-drill', 'Segmentata Drill', 40, '+30 poise in heavy armor.'),
  perk('heavy-armor', 'heavy-armor-cingulum', 'Cingulum', 50, 'Removes the +25% sprint cost of heavy armor.'),
  perk('heavy-armor', 'heavy-armor-iron-skin', 'Iron Skin', 70, 'Heavy pieces give 15% more armor.', { modifiers: { 'armor.heavy': 0.15 } }),
  perk('light-armor', 'light-armor-manica', 'Gladiator’s Manica', 20, 'You cannot be disarmed; a manica gives twice the armor.'),
  perk('light-armor', 'light-armor-nimble', 'Nimble', 30, 'Dodging costs 30% less stamina.'),
  perk('light-armor', 'light-armor-padded', 'Padded', 40, 'You take 20% less blunt damage.'),
  perk('light-armor', 'light-armor-unburdened', 'Unburdened', 60, 'Worn light armor weighs nothing.'),
  perk('athletics', 'athletics-second-wind', 'Second Wind', 20, 'Once per fight, at 0 stamina, instantly regain 40.'),
  perk('athletics', 'athletics-roof-runner', 'Roof-runner', 30, 'Mantling costs half; no fall damage below 6 m.'),
  perk('athletics', 'athletics-swimmer', 'Tiber Swimmer', 40, 'Swim 30% faster and resist the Tiber’s current.'),
  perk('athletics', 'athletics-cursor', 'Cursor', 60, 'Sprinting costs 25% less stamina.', { modifiers: { 'stamina.sprintCost': 0.25 } }),
  perk('stealth', 'stealth-crowd-blend', 'Crowd Blend', 20, 'Crowds hide you better (cover factor 0.4 instead of 0.6); standing still in a crowd breaks pursuit.'),
  perk('stealth', 'stealth-night-walker', 'Night Walker', 30, '−25% visibility in darkness.'),
  perk('stealth', 'stealth-silent-hobnails', 'Silent Hobnails', 40, 'No noise penalty for caligae or heavy armor.'),
  perk('stealth', 'stealth-assassin', 'Sicarius', 60, 'Melee sneak attacks ×4 (daggers ×6).'),
  perk('pickpocket', 'pickpocket-light-fingers', 'Light Fingers', 20, '+10 percentage points to lift chance.', { modifiers: { 'pickpocket.chance': 0.1 } }),
  perk('pickpocket', 'pickpocket-sector-zonarius', 'Sector Zonarius', 40, '“Purse-cutter”: cut the whole purse in one lift.'),
  perk('pickpocket', 'pickpocket-plant', 'Plant', 50, 'Plant items, including evidence.'),
  perk('pickpocket', 'pickpocket-crowd-cover', 'Crowd Cover', 60, 'A failed lift in a crowd of 3 or more is not pinned on you: no bounty, only an alert.'),
  perk('locks-seals', 'locks-light-touch', 'Light Touch', 20, 'The set zone is 20% wider.', { modifiers: { 'lockpick.ease': 0.2 } }),
  perk('locks-seals', 'locks-tumbler-sense', 'Tumbler Sense', 30, 'An audible click and a highlight at the right lift height.'),
  perk('locks-seals', 'locks-reseal', 'Reseal', 40, 'Open and reseal wax seals without a trace.'),
  perk('locks-seals', 'locks-forger', 'Forger', 60, 'Cut a seal ring from a wax impression (a capital-grade crime, falsum).'),
  perk('rhetoric', 'rhetoric-exordium', 'Exordium', 20, '+10 to your first check with each person.'),
  perk('rhetoric', 'rhetoric-clientela', 'Clientela', 30, 'The “invoke your patron” option gets +15.'),
  perk('rhetoric', 'rhetoric-advocatus', 'Advocatus', 50, 'One extra argument per round in court debates.'),
  perk('rhetoric', 'rhetoric-laudatio', 'Laudatio', 60, 'Speak to crowds: calm riots and gain Fama.'),
  perk('mercatura', 'mercatura-nundinae', 'Nundinae', 20, '−10% buying prices on market days, at every vendor.'),
  perk('mercatura', 'mercatura-fence', 'Receptator', 30, 'Fences pay you the full fence rate (70% instead of 50%).'),
  perk('mercatura', 'mercatura-nauticum', 'Faenus Nauticum', 50, 'Invest in a cargo: after 30 days +40% (80%) or a total loss (20%).'),
  perk('mercatura', 'mercatura-argentarius', 'Argentarius', 60, 'Vendor purses doubled; haggling +15.'),
  perk('medicina', 'medicina-celsus', 'Celsus’ Method', 20, 'Bandages cure bleeding and heal 50% more.'),
  perk('medicina', 'medicina-dioscorides', 'Dioscorides', 30, 'Tasting an ingredient reveals two effects.'),
  perk('medicina', 'medicina-theriaca', 'Theriac', 40, 'Brew theriac; immune to poison for 1 game hour after drinking it.'),
  perk('medicina', 'medicina-soporificum', 'Soporific', 50, 'Brew knockout poison for weapons.'),
  perk('fabrica', 'fabrica-plumbum', 'Lead Caster', 20, 'Cast inscribed glandes (+10% sling damage).'),
  perk('fabrica', 'fabrica-noric', 'Noric Steel', 30, 'Improve iron and Noric steel one quality tier further.'),
  perk('fabrica', 'fabrica-armorer', 'Armorer of the Legion', 40, 'Repair in the field with a repair kit.'),
  perk('fabrica', 'fabrica-bilbilis', 'Bilbilis Temper', 60, 'Improve Bilbilis steel; improved blades +10% damage.'),
  perk('religio', 'religio-votum', 'Votum', 20, 'Vow buffs are 50% stronger.'),
  perk('religio', 'religio-augur', 'Augur’s Eye', 30, 'The daily omen offers a choice of two.'),
  perk('religio', 'religio-lararium', 'Lararium', 40, 'Praying at your home lararium fully restores pietas once a day.'),
  perk('religio', 'religio-pax-deorum', 'Pax Deorum', 60, '+25 pietas; invocations cost 20% less.', { modifiers: { 'pietas.max': 25 } }),
  perk('equitatio', 'equitatio-quadriga', 'Quadriga', 20, 'Team stamina +20% in races.'),
  perk('equitatio', 'equitatio-hortator', 'Hortator', 30, 'Whip cooldown −30%.'),
  perk('equitatio', 'equitatio-spina', 'Spina Hug', 50, 'Turning at the metae loses 15% less speed.'),
  perk('equitatio', 'equitatio-eques', 'Eques', 60, 'Mounted attacks +25% (expansions).'),
];

/**
 * Origins (GDD §3.2). Skills start at 10; an origin adds +10 / +5 / +5. Trait ids are also flags.
 * Every origin also gets the common kit of §3.5 (startNewGame adds it) and its signature weapon
 * starts at 70% condition.
 */
export const BACKGROUNDS: BackgroundDef[] = [
  {
    id: 'civis-suburanus', name: 'Subura-born Plebeian', latin: 'Civis Suburanus', status: 'civis',
    description: 'Born in a Suburan tenement to plebeian citizens. You know every alley, every popina and every man who owes money.',
    skills: { rhetoric: 10, mercatura: 5, brawling: 5 },
    traitId: 'trait-street-wise', trait: 'Street-wise: the Subura’s and Velabrum’s lesser sights start revealed; −5% prices at plebeian vendors.', flags: ['trait-street-wise'],
    kit: [{ id: 'tunica', equip: true }, { id: 'paenula', equip: true }, { id: 'toga' }, { id: 'calcei', equip: true }, { id: 'fustis', equip: true, condition: 0.7 }],
    denarii: 60, hook: 'An aunt’s popina is being squeezed by a collegium.',
  },
  {
    id: 'libertus', name: 'Freedman or Freedwoman', latin: 'Libertus', status: 'libertus',
    description: 'You wore the felt cap at your manumission and still keep accounts for your old master’s house. You know what everything costs.',
    skills: { mercatura: 10, 'locks-seals': 5, rhetoric: 5 },
    traitId: 'trait-patrons-shadow', trait: 'Patron’s shadow: +10% Trade XP; your former owner calls in favors.', flags: ['trait-patrons-shadow', 'xp.mercatura'],
    kit: [{ id: 'tunica-crassa', equip: true }, { id: 'soleae', equip: true }, { id: 'pugio', equip: true, condition: 0.7 }],
    denarii: 80, hook: 'Your manumission tablet is “lost”: prove your freedom.',
  },
  {
    id: 'gallus', name: 'Gaul', latin: 'Gallus', status: 'civis',
    description: 'From Narbonensis, where your family works iron. Someone in Rome is forging your kinsman’s maker’s mark.',
    skills: { fabrica: 10, spear: 5, 'heavy-armor': 5 },
    traitId: 'trait-gallic-smith', trait: 'Gallic smith: improvements at a forge reach one quality tier further.', flags: ['trait-gallic-smith'],
    kit: [{ id: 'tunica', equip: true }, { id: 'bracae', equip: true }, { id: 'sagum', equip: true }, { id: 'carbatinae', equip: true }, { id: 'hasta', equip: true, condition: 0.7 }, { id: 'thorax-coriaceus', equip: true }],
    denarii: 50, hook: 'A forgery ring uses a kinsman’s maker’s mark.',
  },
  {
    id: 'hispanus', name: 'Hispanian from Baetica', latin: 'Hispanus', status: 'civis',
    description: 'From Baetica around Italica, the emperor’s own homeland, with a letter of introduction in your satchel.',
    skills: { blades: 10, rhetoric: 5, equitatio: 5 },
    traitId: 'trait-caesars-countryman', trait: 'Caesar’s countryman: +10 disposition with Baetican NPCs; Bilbilis-steel blades cost 20% less.', flags: ['trait-caesars-countryman'],
    kit: [{ id: 'tunica', equip: true }, { id: 'toga' }, { id: 'calcei', equip: true }, { id: 'gladius', equip: true, condition: 0.7 }],
    denarii: 90, hook: 'A letter of introduction to the patroness Calpurnia Severa.',
  },
  {
    id: 'syrus', name: 'Syrian', latin: 'Syrus', status: 'peregrinus',
    description: 'From Antioch or Emesa, a bowman’s son. With war against Parthia coming, some Romans eye every Easterner.',
    skills: { archery: 10, mercatura: 5, medicina: 5 },
    traitId: 'trait-eastern-archer', trait: 'Eastern archer: bow draw time −20%; soldiers −5 disposition during the war levy.', flags: ['trait-eastern-archer'],
    kit: [{ id: 'tunica-longa', equip: true }, { id: 'soleae', equip: true }, { id: 'arcus', equip: true, condition: 0.7 }, { id: 'sagitta', count: 20, equip: true }, { id: 'pugio' }],
    denarii: 70, hook: 'A Parthian silk merchant asks for “a small favor”.',
  },
  {
    id: 'aegyptius', name: 'Alexandrian', latin: 'Aegyptius', status: 'alexandrinus',
    description: 'Trained in the shadow of the Museum. The Iseum Campense has lost a papyrus, and they think you can find it.',
    skills: { medicina: 10, 'locks-seals': 5, religio: 5 },
    traitId: 'trait-alexandrian-learning', trait: 'Alexandrian learning: +50% from Greek skill books; devotees of Isis +10 disposition.', flags: ['trait-alexandrian-learning'],
    kit: [{ id: 'tunica-linea', equip: true }, { id: 'soleae', equip: true }, { id: 'fascia', count: 5 }, { id: 'pugio', equip: true, condition: 0.7 }],
    denarii: 60, hook: 'A papyrus is missing from the Iseum Campense.',
  },
  {
    id: 'afer', name: 'African', latin: 'Afer', status: 'civis',
    description: 'From Africa Proconsularis or Mauretania, where you hunted for the arena trade.',
    skills: { spear: 10, athletics: 5, 'light-armor': 5 },
    traitId: 'trait-beast-wise', trait: 'Beast-wise: +20% damage against beasts; beasts flee from you sooner.', flags: ['trait-beast-wise'],
    kit: [{ id: 'tunica', equip: true }, { id: 'carbatinae', equip: true }, { id: 'lancea', count: 3, equip: true, condition: 0.7 }, { id: 'thorax-coriaceus', equip: true }],
    denarii: 50, hook: 'A leopard crate for the Ludus Matutinus has gone missing.',
  },
  {
    id: 'veteranus', name: 'Veteran of Dacia', latin: 'Veteranus', status: 'civis',
    description: 'Discharged early (missio causaria) with a wound from the Dacian wars and a bronze diploma. Your old centurion is in the city, too rich for his pay.',
    skills: { shield: 10, blades: 5, 'heavy-armor': 5, athletics: -5 },
    traitId: 'trait-old-wound', trait: 'Old wound: Athletics −5 at the start, +20 poise; soldiers +10 disposition.', flags: ['trait-old-wound'],
    kit: [{ id: 'tunica', equip: true }, { id: 'sagum', equip: true }, { id: 'caligae', equip: true }, { id: 'gladius', equip: true, condition: 0.7 }, { id: 'scutum', equip: true, condition: 0.6 }, { id: 'galea-gallica', equip: true }, { id: 'diploma' }],
    denarii: 120, hook: 'Your old centurion is too rich for his pay.',
  },
  {
    id: 'dacus', name: 'Dacian', latin: 'Dacus', status: 'latinus-iunianus',
    description: 'Taken captive in 106, you hauled stone for Trajan’s Forum and were informally freed — a Junian Latin. Your people are carved on the Column.',
    skills: { fabrica: 10, athletics: 5, blades: 5 },
    traitId: 'trait-survivor', trait: 'Survivor: +10 poise per enemy beyond the first (max +30); some Romans −10 disposition, Dacians +20.', flags: ['trait-survivor'],
    kit: [{ id: 'tunica', equip: true }, { id: 'carbatinae', equip: true }, { id: 'sica', equip: true, condition: 0.7 }, { id: 'malleus' }],
    denarii: 30, hook: 'A Dacian revenge cell wants your help.',
  },
  {
    id: 'eques-lapsus', name: 'Fallen Equestrian', latin: 'Eques Lapsus', status: 'civis',
    description: 'Born to the equestrian order, you lost the census and the gold ring with it. Debt collectors know your door.',
    skills: { rhetoric: 10, equitatio: 5, blades: 5 },
    traitId: 'trait-old-name', trait: 'Old name: opens one elite door per patron, once; debt collectors ambush you.', flags: ['trait-old-name'],
    kit: [{ id: 'toga-fina', equip: true, condition: 0.5 }, { id: 'tunica', equip: true }, { id: 'calcei', equip: true }, { id: 'anulus-signatorius', equip: true }, { id: 'spatha', equip: true, condition: 0.7 }],
    denarii: 20, debt: 2000, hook: 'Win back the gold ring.',
  },
];

/** §3.5 Every origin also starts with these (the courier's tablet is added if the main quest defines it). */
export const COMMON_KIT: { id: string; count?: number }[] = [
  { id: 'fascia', count: 2 },
  { id: 'panis', count: 1 },
  { id: 'tabula-cerata', count: 1 },
  { id: 'quest-tabella-signata', count: 1 },
];
