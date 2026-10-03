/**
 * Perks — docs/GDD.md §5.5. One point each; every skill's first perk needs 15. A taken perk's id is
 * also a sheet flag (sheet.hasFlag('perk-blades-punctim')), which is how systems test perks without
 * a ModifierId. `requiresSystem` names the game system a perk depends on: perks whose system isn't
 * shipped are hidden (availablePerks), never offered as dead picks.
 */
import type { PerkDef } from '../types';

const perk = (skill: string, id: string, name: string, requiresLevel: number, description: string, extra: Partial<PerkDef> = {}): PerkDef => ({ id: `perk-${id}`, skill, name, requiresLevel, description, ...extra });

/** GDD §5.5: the core set, four perks per skill. Effects use ModifierIds where one exists, else the perk id as a flag. */
export const PERKS: PerkDef[] = [
  perk('blades', 'blades-punctim', 'Punctim', 15, '“With the point”: thrusts do 25% more damage against mail and plate.'),
  perk('blades', 'blades-bilbilis-edge', 'Bilbilis Edge', 35, 'Cuts are 15 percentage points more likely to cause bleeding.', { requiresSystem: 'bleeding' }),
  perk('blades', 'blades-pugio-draw', 'Pugio Draw', 50, 'A riposte on a staggered foe below 30% health is an instant finisher.', { requiresSystem: 'finisher' }),
  perk('blades', 'blades-falx-hook', 'Falx Hook', 65, 'Falx and sica attacks ignore 50% of block mitigation.'),
  perk('spear', 'spear-longa-manus', 'Long Reach', 15, '+0.3 m reach with spears.'),
  perk('spear', 'spear-pilum-volley', 'Pilum Volley', 30, 'Thrown weapons do 30% more damage; pila stuck in shields halve block mitigation.', { requiresSystem: 'javelin' }),
  perk('spear', 'spear-venator', 'Venator', 45, '+30% damage against beasts.', { requiresSystem: 'beasts' }),
  perk('spear', 'spear-brace', 'Brace', 60, 'Blocking a charge with a spear: the attacker takes double damage and staggers.', { requiresSystem: 'beasts' }),
  perk('archery', 'archery-steady-draw', 'Steady Draw', 15, 'Holding a drawn bow drains 30% less stamina; slight zoom at full draw.', { requiresSystem: 'bow' }),
  perk('archery', 'archery-lead-shot', 'Lead Shot', 30, 'Lead glandes do 50% more poise damage.', { requiresSystem: 'sling' }),
  perk('archery', 'archery-cretan-eye', 'Cretan Eye', 50, 'Aim sway −60%; full draw 0.2 s faster.', { requiresSystem: 'bow' }),
  perk('archery', 'archery-moving-shot', 'Moving Shot', 60, 'Draw and whirl at jogging speed.', { requiresSystem: 'bow' }),
  perk('shield', 'shield-umbo', 'Umbo Strike', 15, 'A power bash (hold F while blocking) knocks down non-elite humans.'),
  perk('shield', 'shield-testudo', 'Testudo', 30, 'A raised scutum stops missiles from 180° and blocks them for no stamina.', { requiresSystem: 'missiles' }),
  perk('shield', 'shield-parry-plus', 'Practised Parry', 40, 'The parry window is 0.06 s longer.'),
  perk('shield', 'shield-wall', 'Shield Wall', 60, 'Block stamina cost −30% per ally within 2 m (max −60%).', { requiresSystem: 'allies' }),
  perk('brawling', 'brawling-caestus', 'Caestus', 15, 'Fist and caestus damage +50%.', { modifiers: { 'damage.unarmed': 0.5 } }),
  perk('brawling', 'brawling-subdue', 'Subdue', 30, 'All blunt weapons knock out (never kill) non-boss humans.'),
  perk('brawling', 'brawling-pankration', 'Pankration', 50, 'An unarmed power attack becomes a grapple-throw (knockdown 2 s).', { requiresSystem: 'grapple' }),
  perk('brawling', 'brawling-fustis', 'Fustis Discipline', 60, 'Blunt hits on staggered foes disarm them 25% of the time.', { requiresSystem: 'disarm' }),
  perk('heavy-armor', 'heavy-armor-well-fitted', 'Well Fitted', 15, 'Removes the −15% stamina regeneration penalty of heavy armor.'),
  perk('heavy-armor', 'heavy-armor-drill', 'Segmentata Drill', 40, '+30 poise in heavy armor.'),
  perk('heavy-armor', 'heavy-armor-cingulum', 'Cingulum', 50, 'Removes the +25% sprint cost of heavy armor.'),
  perk('heavy-armor', 'heavy-armor-iron-skin', 'Iron Skin', 70, 'Heavy pieces give 15% more armor.', { modifiers: { 'armor.heavy': 0.15 } }),
  perk('light-armor', 'light-armor-manica', 'Gladiator’s Manica', 15, 'You cannot be disarmed; a manica gives twice the armor.'),
  perk('light-armor', 'light-armor-nimble', 'Nimble', 30, 'Dodging costs 30% less stamina.'),
  perk('light-armor', 'light-armor-padded', 'Padded', 40, 'You take 20% less blunt damage.'),
  perk('light-armor', 'light-armor-unburdened', 'Unburdened', 60, 'Worn light armor weighs nothing.'),
  perk('athletics', 'athletics-second-wind', 'Second Wind', 15, 'Once per fight, at 0 stamina, instantly regain 40.'),
  perk('athletics', 'athletics-roof-runner', 'Roof-runner', 30, 'Mantling costs half; no fall damage below 6 m.', { requiresSystem: 'rooftops' }),
  perk('athletics', 'athletics-swimmer', 'Tiber Swimmer', 40, 'Swim 30% faster and resist the Tiber’s current.', { requiresSystem: 'swimming' }),
  perk('athletics', 'athletics-cursor', 'Cursor', 60, 'Sprinting costs 25% less stamina.', { modifiers: { 'stamina.sprintCost': 0.25 } }),
  perk('stealth', 'stealth-crowd-blend', 'Crowd Blend', 15, 'Crowds hide you better (cover factor 0.4 instead of 0.6); standing still in a crowd breaks pursuit.', { requiresSystem: 'stealth' }),
  perk('stealth', 'stealth-night-walker', 'Night Walker', 30, '−25% visibility in darkness.', { requiresSystem: 'stealth' }),
  perk('stealth', 'stealth-silent-hobnails', 'Silent Hobnails', 40, 'No noise penalty for caligae or heavy armor.', { requiresSystem: 'stealth' }),
  perk('stealth', 'stealth-assassin', 'Sicarius', 60, 'Melee sneak attacks ×4 (daggers ×6).', { requiresSystem: 'stealth' }),
  perk('pickpocket', 'pickpocket-light-fingers', 'Light Fingers', 15, '+10 percentage points to lift chance.', { modifiers: { 'pickpocket.chance': 0.1 } , requiresSystem: 'pickpocketing' }),
  perk('pickpocket', 'pickpocket-sector-zonarius', 'Sector Zonarius', 40, '“Purse-cutter”: cut the whole purse in one lift.', { requiresSystem: 'pickpocketing' }),
  perk('pickpocket', 'pickpocket-plant', 'Plant', 50, 'Plant items, including evidence.', { requiresSystem: 'pickpocketing' }),
  perk('pickpocket', 'pickpocket-crowd-cover', 'Crowd Cover', 60, 'A failed lift in a crowd of 3 or more is not pinned on you: no bounty, only an alert.', { requiresSystem: 'pickpocketing' }),
  perk('locks-seals', 'locks-light-touch', 'Light Touch', 15, 'The set zone is 20% wider.', { modifiers: { 'lockpick.ease': 0.2 } , requiresSystem: 'lockpicking' }),
  perk('locks-seals', 'locks-tumbler-sense', 'Tumbler Sense', 30, 'An audible click and a highlight at the right lift height.', { requiresSystem: 'lockpicking' }),
  perk('locks-seals', 'locks-reseal', 'Reseal', 40, 'Open and reseal wax seals without a trace.', { requiresSystem: 'lockpicking' }),
  perk('locks-seals', 'locks-forger', 'Forger', 60, 'Cut a seal ring from a wax impression (a capital-grade crime, falsum).', { requiresSystem: 'lockpicking' }),
  perk('rhetoric', 'rhetoric-exordium', 'Exordium', 15, '+10 to your first check with each person.'),
  perk('rhetoric', 'rhetoric-clientela', 'Clientela', 30, 'The “invoke your patron” option gets +15.', { requiresSystem: 'clientela' }),
  perk('rhetoric', 'rhetoric-advocatus', 'Advocatus', 50, 'One extra argument per round in court debates.', { requiresSystem: 'court' }),
  perk('rhetoric', 'rhetoric-laudatio', 'Laudatio', 60, 'Speak to crowds: calm riots and gain Fama.', { requiresSystem: 'crowd-speech' }),
  perk('mercatura', 'mercatura-nundinae', 'Nundinae', 15, '−10% buying prices on market days, at every vendor.', { requiresSystem: 'market-days' }),
  perk('mercatura', 'mercatura-fence', 'Receptator', 30, 'Fences pay you the full fence rate (70% instead of 50%).', { requiresSystem: 'fences' }),
  perk('mercatura', 'mercatura-nauticum', 'Faenus Nauticum', 50, 'Invest in a cargo: after 30 days +40% (80%) or a total loss (20%).', { requiresSystem: 'investments' }),
  perk('mercatura', 'mercatura-argentarius', 'Argentarius', 60, 'Vendor purses doubled; haggling +15.'),
  perk('medicina', 'medicina-celsus', 'Celsus’ Method', 15, 'Bandages cure bleeding and heal 50% more.'),
  perk('medicina', 'medicina-dioscorides', 'Dioscorides', 30, 'Tasting an ingredient reveals two effects.', { requiresSystem: 'crafting' }),
  perk('medicina', 'medicina-theriaca', 'Theriac', 40, 'Brew theriac; immune to poison for 1 game hour after drinking it.', { requiresSystem: 'crafting' }),
  perk('medicina', 'medicina-soporificum', 'Soporific', 50, 'Brew knockout poison for weapons.', { requiresSystem: 'crafting' }),
  perk('fabrica', 'fabrica-plumbum', 'Lead Caster', 15, 'Cast inscribed glandes (+10% sling damage).', { requiresSystem: 'crafting' }),
  perk('fabrica', 'fabrica-noric', 'Noric Steel', 30, 'Improve iron and Noric steel one quality tier further.', { requiresSystem: 'crafting' }),
  perk('fabrica', 'fabrica-armorer', 'Armorer of the Legion', 40, 'Repair in the field with a repair kit.', { requiresSystem: 'crafting' }),
  perk('fabrica', 'fabrica-bilbilis', 'Bilbilis Temper', 60, 'Improve Bilbilis steel; improved blades +10% damage.', { requiresSystem: 'crafting' }),
  perk('religio', 'religio-votum', 'Votum', 15, 'Vow buffs are 50% stronger.', { requiresSystem: 'vows' }),
  perk('religio', 'religio-augur', 'Augur’s Eye', 30, 'The daily omen offers a choice of two.', { requiresSystem: 'omens' }),
  perk('religio', 'religio-lararium', 'Lararium', 40, 'Praying at your home lararium fully restores pietas once a day.', { requiresSystem: 'housing' }),
  perk('religio', 'religio-pax-deorum', 'Pax Deorum', 60, '+25 pietas; invocations cost 20% less.', { modifiers: { 'pietas.max': 25 } }),
  perk('equitatio', 'equitatio-quadriga', 'Quadriga', 15, 'Team stamina +20% in races.', { requiresSystem: 'racing' }),
  perk('equitatio', 'equitatio-hortator', 'Hortator', 30, 'Whip cooldown −30%.', { requiresSystem: 'racing' }),
  perk('equitatio', 'equitatio-spina', 'Spina Hug', 50, 'Turning at the metae loses 15% less speed.', { requiresSystem: 'racing' }),
  perk('equitatio', 'equitatio-eques', 'Eques', 60, 'Mounted attacks +25% (expansions).', { requiresSystem: 'mounted' }),
];

/** Systems the perks above depend on (requiresSystem). */
export const PERK_SYSTEMS = [...new Set(PERKS.map((p) => p.requiresSystem).filter((s): s is string => !!s))];

/** Perks whose system has shipped (perks without a requiresSystem always). */
export function availablePerks(shipped: Iterable<string>, perks: readonly PerkDef[] = PERKS): PerkDef[] {
  const set = new Set(shipped);
  return perks.filter((p) => !p.requiresSystem || set.has(p.requiresSystem));
}
