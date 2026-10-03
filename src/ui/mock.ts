/**
 * Realistic mock data and view implementations for the UI dev scene (and UI unit tests).
 * Everything here implements the read models in ./types, the same way the real engines will
 * through thin adapters at integration.
 */
import type { MarkerTarget } from '../quests/types';
import type { EquipSlot, ItemDef, PerkDef, Resource, SkillDef } from '../rpg/types';
import { skillCheckChance } from './format';
import type {
  BarterView,
  BookView,
  CharacterView,
  ContainerItem,
  ContainerView,
  Deal,
  DialogueChoiceView,
  DialogueLine,
  DialogueView,
  EffectView,
  FactionView,
  InventoryEntry,
  InventoryView,
  NoteView,
  QuestLogView,
  QuestView,
  SaveSlot,
  SaveSlotsView,
  TradeItem,
  VitalsView,
} from './types';

// ------------------------------------------------------------------ items

const W = (id: string, name: string, latin: string, cls: 'blade' | 'spear' | 'blunt' | 'bow', damage: number, speed: number, reach: number, weight: number, value: number, description: string, extra: Partial<ItemDef> = {}): ItemDef => ({
  id, name, latin, type: 'weapon', slot: 'mainHand', weight, value, description,
  weapon: { class: cls, damage, speed, reach, stagger: cls === 'blunt' ? 1.4 : 1, skill: cls === 'blade' ? 'blades' : cls === 'spear' ? 'spear' : cls === 'blunt' ? 'blunt' : 'archery', ...(extra.weapon ?? {}) },
  ...extra,
});

export const MOCK_ITEMS: ItemDef[] = [
  W('gladius', 'Gladius Hispaniensis', 'gladius Hispaniensis', 'blade', 9, 1.1, 0.75, 1.2, 60, 'The short sword that conquered the world: a leaf-shaped Spanish blade made for the thrust from behind a shield.'),
  W('gladius-pompeii', 'Pompeii-pattern gladius', 'gladius', 'blade', 8, 1.2, 0.7, 1.0, 45, 'Straight-edged and short-pointed, the newer pattern most legionaries carry today.'),
  W('spatha', 'Cavalry spatha', 'spatha', 'blade', 11, 0.95, 0.95, 1.5, 80, 'A long blade for horsemen of the auxilia, good for cutting down from the saddle.'),
  W('pugio', 'Pugio', 'pugio', 'blade', 5, 1.5, 0.45, 0.4, 20, 'A soldier’s broad dagger. The same kind of blade ended Caesar on the Ides of March.'),
  W('hasta', 'Hasta', 'hasta', 'spear', 10, 0.9, 1.9, 2.2, 25, 'A thrusting spear of ash with an iron head. Older than the Republic, and still deadly.'),
  W('fustis', 'Fustis', 'fustis', 'blunt', 6, 1.05, 0.8, 1.4, 3, 'A cudgel of seasoned olive wood. The vigiles favor it for unruly drunks.'),
  W('arcus', 'Composite bow', 'arcus', 'bow', 10, 0.8, 0.5, 1.0, 90, 'Horn, sinew and wood in the eastern style, as Syrian archers carry.', { weapon: { class: 'bow', damage: 10, speed: 0.8, reach: 0.5, stagger: 0.6, skill: 'archery', twoHanded: true, projectileSpeed: 55, ammo: 'sagittae' } }),
  { id: 'sagittae', name: 'Arrows', latin: 'sagittae', type: 'ammo', slot: 'ammo', weight: 0.05, value: 0.25, stackable: true, description: 'Reed shafts with iron trilobate heads.' },
  { id: 'scutum', name: 'Legionary scutum', latin: 'scutum', type: 'shield', slot: 'offHand', weight: 7.5, value: 50, description: 'Curved plywood faced with leather and rimmed in bronze, with an iron boss for punching.', shield: { rating: 14, blockMitigation: 0.7 } },
  { id: 'parma', name: 'Parma', latin: 'parma', type: 'shield', slot: 'offHand', weight: 3, value: 30, description: 'A small round shield, light enough for a thraex or a skirmisher.', shield: { rating: 8, blockMitigation: 0.5 } },
  { id: 'galea', name: 'Imperial Gallic helmet', latin: 'galea', type: 'armor', slot: 'head', weight: 2.2, value: 70, description: 'Iron bowl, brass trim, deep neck guard and hinged cheek pieces.', armor: { rating: 8, weightClass: 'heavy' } },
  { id: 'lorica-segmentata', name: 'Lorica segmentata', latin: 'lorica segmentata', type: 'armor', slot: 'body', weight: 9, value: 200, description: 'Overlapping iron bands on leather straps. Superb protection, endless maintenance.', armor: { rating: 24, weightClass: 'heavy' } },
  { id: 'lorica-hamata', name: 'Lorica hamata', latin: 'lorica hamata', type: 'armor', slot: 'body', weight: 11, value: 160, description: 'Mail of riveted iron rings — heavy, but it never needs a smith.', armor: { rating: 20, weightClass: 'heavy' } },
  { id: 'subarmalis', name: 'Leather subarmalis', latin: 'subarmalis', type: 'armor', slot: 'body', weight: 3, value: 25, description: 'A padded leather jerkin, worn under armor or alone by those who can’t afford iron.', armor: { rating: 8, weightClass: 'light' } },
  { id: 'caligae', name: 'Caligae', latin: 'caligae', type: 'clothing', slot: 'feet', weight: 1.2, value: 6, description: 'Hobnailed army boots. You hear a soldier before you see him.', armor: { rating: 1, weightClass: 'clothing' } },
  { id: 'tunica', name: 'Woolen tunic', latin: 'tunica', type: 'clothing', slot: 'body', weight: 0.8, value: 4, description: 'Undyed wool, belted at the waist. What nearly everyone in Rome wears.', armor: { rating: 0, weightClass: 'clothing' } },
  { id: 'toga', name: 'Toga virilis', latin: 'toga virilis', type: 'clothing', slot: 'cloak', weight: 3, value: 40, description: 'Six yards of white wool and a citizen’s right to wear it. Impossible to fight in.', armor: { rating: 0, weightClass: 'clothing' } },
  { id: 'paenula', name: 'Paenula', latin: 'paenula', type: 'clothing', slot: 'cloak', weight: 1.8, value: 12, description: 'A hooded traveling cloak of oiled wool. Rain runs straight off it.', armor: { rating: 1, weightClass: 'clothing' } },
  { id: 'panis', name: 'Panis quadratus', latin: 'panis quadratus', type: 'consumable', weight: 0.3, value: 0.25, stackable: true, tags: ['food'], description: 'A round loaf scored into eight wedges, stamped with the baker’s name.', effects: [{ kind: 'restore', target: 'health', amount: 10 }] },
  { id: 'posca', name: 'Posca', latin: 'posca', type: 'consumable', weight: 0.5, value: 0.5, stackable: true, tags: ['drink'], description: 'Sour wine cut with water and herbs. Soldiers swear by it on the march.', effects: [{ kind: 'restore', target: 'stamina', amount: 25 }] },
  { id: 'falernum', name: 'Falernian wine', latin: 'vinum Falernum', type: 'consumable', weight: 1, value: 6, stackable: true, tags: ['drink'], description: 'The finest vintage in Italy. A cup makes a man eloquent, two make him a poet.', effects: [{ kind: 'restore', target: 'stamina', amount: 10 }, { kind: 'modifier', target: 'persuade.chance', amount: 0.1, duration: 120 }] },
  { id: 'theriac', name: 'Theriac', latin: 'theriaca', type: 'consumable', weight: 0.2, value: 25, stackable: true, tags: ['potion', 'medicine'], description: 'Galen’s great antidote of sixty-four ingredients, viper flesh among them.', effects: [{ kind: 'cure', target: 'poison', amount: 1 }, { kind: 'restore', target: 'health', amount: 40 }] },
  { id: 'garum', name: 'Garum', latin: 'garum', type: 'ingredient', weight: 0.5, value: 3, stackable: true, description: 'Fermented fish sauce from Hispania. Romans put it on everything.' },
  { id: 'laurus', name: 'Bay laurel', latin: 'laurus', type: 'ingredient', weight: 0.05, value: 0.5, stackable: true, description: 'Sacred to Apollo. Good for wreaths, fevers and roasting pork.' },
  { id: 'book-column', name: 'On the New Column', latin: 'De Columna Nova', type: 'book', weight: 0.4, value: 8, description: 'A visitor’s account of Trajan’s Column, written in a hurry and sold in the Argiletum.' },
  { id: 'letter-pliny', name: 'A Letter from Bithynia', latin: 'Epistula', type: 'book', weight: 0.05, value: 0, tags: ['letter'], description: 'A letter in a careful hand, sealed with a ring showing a four-horse chariot.' },
  { id: 'book-apicius', name: 'Apicius on Sauces', latin: 'De Re Coquinaria', type: 'book', weight: 0.4, value: 12, teaches: 'commerce', description: 'Recipes attributed to the gourmet Apicius, who poisoned himself rather than eat plainly.' },
  { id: 'defixio', name: 'Curse tablet', latin: 'defixio', type: 'book', weight: 0.2, value: 0, questItem: true, tags: ['letter'], description: 'A sheet of lead, scratched with names and folded around an iron nail.' },
  { id: 'tessera', name: 'Grain token', latin: 'tessera frumentaria', type: 'quest', weight: 0.02, value: 0, questItem: true, stackable: true, description: 'A bronze token entitling the bearer to five modii of grain at the Porticus Minucia.' },
  { id: 'tabella', name: 'Sealed wax tablet', latin: 'tabella obsignata', type: 'quest', weight: 0.3, value: 0, questItem: true, description: 'Two wooden leaves bound with thread and sealed. Addressed to the Tabularium.' },
  { id: 'lucerna', name: 'Clay oil lamp', latin: 'lucerna', type: 'misc', weight: 0.3, value: 1, tags: ['lamp'], description: 'Red clay, a gladiator on the lid. Burns olive oil for an evening.' },
  { id: 'tali', name: 'Knucklebones', latin: 'tali', type: 'misc', weight: 0.1, value: 2, tags: ['dice'], description: 'Four sheep’s knucklebones for dice. The Venus throw wins.' },
  { id: 'strigil', name: 'Bronze strigil', latin: 'strigilis', type: 'tool', weight: 0.3, value: 5, description: 'For scraping oil and sweat from your skin at the baths.' },
  { id: 'clavis', name: 'Key to a room in the Subura', latin: 'clavis', type: 'key', weight: 0.05, value: 0, description: 'Iron, with a ring for the finger. Opens a room on the fourth floor.' },
];

const ITEM_BY_ID = new Map(MOCK_ITEMS.map((i) => [i.id, i]));
export const mockItem = (id: string): ItemDef => ITEM_BY_ID.get(id)!;

// ------------------------------------------------------------------ books

export const MOCK_BOOKS: Record<string, BookView> = {
  'book-column': {
    title: 'On the New Column',
    author: 'by a Greek of Alexandria, written in the Argiletum',
    kind: 'book',
    text: `I came to the Forum of Trajan four days after the dedication, and still the crowd stood ten deep about the column, every head tipped back as though the whole city were watching for rain.

The thing rises from a pedestal heaped with carved armor — shields, trumpets, dragon-standards of the Dacians — and above it the shaft climbs a hundred Roman feet, wrapped in a single band of figures that winds about it three-and-twenty times. Upon this band, they say, are two thousand five hundred men.

*How is a man to read it?* I asked a freedman who sold sausages at its foot. "You don't read it," he told me. "You walk around it until you're dizzy, and then you buy a sausage."

Yet I tried. At the bottom the river god Danuvius lifts his head from the water to watch the legions cross on a bridge of boats. Then come camps, and forts, and the emperor speaking to the soldiers — he appears some sixty times, always calm, always a little taller than the men about him. Then the Dacians burn their own towns rather than surrender them, and their king Decebalus opens his own throat beneath a tree as the cavalry close in.

At the very top stands Trajan himself, in gilded bronze. The architect is Apollodorus of Damascus, who also bridged the Danube, and who is said to be the only man in Rome who will tell the emperor that he is wrong.

Inside, a stair of one hundred and eighty-five steps climbs to a platform beneath the statue, lit by narrow windows. The guards will not let you up. I tried this also.

The inscription on the base says that the Senate and People of Rome raised the column to show how high a hill was cut away to make room for so great a work. The Romans, I have learned, are prouder of the digging than of the battles.`,
  },
  'letter-pliny': {
    title: 'A Letter from Bithynia',
    author: 'C. Plinius to his friend, greeting',
    kind: 'letter',
    text: `Gaius Plinius to his friend, greeting.

You ask how I find the province. I find it in want of everything except problems. The people of Nicomedia have spent three million three hundred and twenty-nine thousand sesterces on an aqueduct that was abandoned before it was finished, and are now demolishing what they built. At Nicaea the theatre is cracking from top to bottom. I write to Caesar about all of it, and he answers me with great patience and, I suspect, some amusement.

There was a fire here that consumed a great many private houses and two public buildings. The people stood by and watched, for there was not a single pump, bucket or any other tool for fighting it. I asked the emperor whether a guild of a hundred and fifty firemen might be formed. He refused me — such clubs, he says, soon turn into political societies. He is not wrong.

When you are next in the Forum of Trajan, look at the column for me and tell me if it is as fine as they say. And go to the baths on my account, and drink a cup of Falernian, and think of your friend among the Bithynians, who drinks water and reads petitions.

Farewell.`,
  },
  'book-apicius': {
    title: 'Apicius on Sauces',
    author: 'attributed to M. Gavius Apicius',
    kind: 'book',
    text: `*For roast meat:* pepper, lovage, celery seed, mint, rue, a little honey, wine and garum. Pound together and pour over while hot.

*For boiled chicken:* pepper, cumin, a little thyme, fennel seed, mint, rue, asafoetida root, vinegar; add dates, honey, vinegar, garum and oil. Thicken with starch and serve.

*Patina of pears:* boil and core the pears, pound them with pepper, cumin, honey, passum, garum and a little oil. Add eggs, make a patina, sprinkle with pepper and serve.

It is said that Apicius, having spent a hundred million sesterces on his table, sat down one day to examine his accounts. Finding that only ten million remained, he concluded that he would starve, and poisoned himself. Whether this is true I do not know, but the sauce for roast meat is excellent.`,
  },
  defixio: {
    title: 'Curse tablet',
    author: 'scratched on lead, found in a drain of the Circus',
    kind: 'tablet',
    text: `I bind the horses of the Blue faction — Eustolus, Victor, Celer, Pegasus — and the charioteer Florus who drives them.

Bind their feet, their running, their strength. Let them not leave the gates. Let them not round the turning posts. Let them fall at the meta with their driver.

Now, now, quickly, quickly.

*Below, in a different hand:* Paid in full — two denarii.`,
  },
};

// ------------------------------------------------------------------ skills & perks

const SK = (id: string, name: string, latin: string, attribute: SkillDef['attribute'], description: string, howToTrain: string): SkillDef => ({ id, name, latin, attribute, description, howToTrain });

export const MOCK_SKILLS: SkillDef[] = [
  SK('blades', 'Blades', 'Ars gladii', 'health', 'Gladius, spatha, pugio and sica. The art of the short thrust from behind a shield.', 'Strike enemies with bladed weapons.'),
  SK('spear', 'Spear', 'Hasta', 'health', 'Thrusting spears and javelins: reach that keeps an enemy at bay.', 'Strike with spears; land thrown javelins.'),
  SK('blunt', 'Blunt', 'Fustis', 'health', 'Clubs, cudgels and the occasional amphora.', 'Strike enemies with blunt weapons.'),
  SK('block', 'Block', 'Scutum', 'health', 'Catch blows on the shield and bash back with the boss.', 'Block attacks with a shield or weapon.'),
  SK('heavyArmor', 'Heavy Armor', 'Lorica', 'health', 'Moving and fighting in iron: mail, scale and the segmented plate.', 'Take hits while wearing heavy armor.'),
  SK('archery', 'Archery', 'Sagittatio', 'health', 'The bow and the sling, the skills of auxiliaries from Crete and Syria.', 'Hit targets with arrows and sling stones.'),
  SK('lightArmor', 'Light Armor', 'Armatura levis', 'stamina', 'Leather, padding and the gladiator’s manica.', 'Take hits while wearing light armor.'),
  SK('athletics', 'Athletics', 'Cursus', 'stamina', 'Running, climbing and swimming, as at the Campus Martius.', 'Sprint and swim; win foot races.'),
  SK('sneak', 'Sneak', 'Ars latendi', 'stamina', 'Moving unseen through crowded streets and dark insulae.', 'Sneak near people without being noticed.'),
  SK('lockpicking', 'Lockpicking', 'Claustra', 'stamina', 'Persuading the iron locks of strongboxes and doors.', 'Pick locks.'),
  SK('pickpocket', 'Pickpocket', 'Sector zonarius', 'stamina', 'Cutting purses in the press of the Forum.', 'Steal from people’s purses unseen.'),
  SK('rhetoric', 'Rhetoric', 'Rhetorica', 'pietas', 'Persuasion, flattery and the art of Cicero.', 'Persuade, bribe or intimidate in conversation.'),
  SK('commerce', 'Commerce', 'Mercatura', 'pietas', 'Haggling in the markets of the Velabrum and the Emporium.', 'Buy and sell goods.'),
  SK('medicine', 'Medicine', 'Medicina', 'pietas', 'Herbs, poultices and Greek learning.', 'Mix remedies; heal the sick and wounded.'),
  SK('religio', 'Religion', 'Religio', 'pietas', 'Rites, prayers and the reading of omens.', 'Pray at temples; make offerings; complete rites.'),
];

const PK = (id: string, skill: string, name: string, requiresLevel: number, description: string, requiresPerk?: string): PerkDef => ({ id, skill, name, requiresLevel, description, requiresPerk });

export const MOCK_PERKS: PerkDef[] = [
  PK('blades-1', 'blades', 'Tiro', 0, 'Bladed weapons do 20% more damage.'),
  PK('blades-2', 'blades', 'Punctim, non caesim', 20, 'Thrusts ignore 25% of the target’s armor. “With the point, not the edge.”', 'blades-1'),
  PK('blades-3', 'blades', 'Behind the Scutum', 30, 'Attacking right after a block staggers the enemy.', 'blades-2'),
  PK('blades-4', 'blades', 'Centurion’s Eye', 50, 'Power attacks with blades have a chance to cause bleeding.', 'blades-3'),
  PK('blades-5', 'blades', 'Primus Pilus', 75, 'Bladed weapons do 50% more damage. The legion follows you.', 'blades-4'),
  PK('block-1', 'block', 'Shield Wall', 0, 'Blocking absorbs 20% more damage.'),
  PK('block-2', 'block', 'Umbo', 25, 'Shield bashes can stagger even veterans.', 'block-1'),
  PK('block-3', 'block', 'Testudo', 50, 'Arrows that hit your raised shield do no damage.', 'block-2'),
  PK('rhetoric-1', 'rhetoric', 'Captatio Benevolentiae', 0, 'Persuasion checks are 10% easier.'),
  PK('rhetoric-2', 'rhetoric', 'Bribery', 20, 'Bribes cost 25% less and work on more people.', 'rhetoric-1'),
  PK('rhetoric-3', 'rhetoric', 'In Catilinam', 40, 'Intimidation works on enemies of your level or lower.', 'rhetoric-2'),
  PK('rhetoric-4', 'rhetoric', 'Patronus', 60, 'Your clients bring you a little coin each market day.', 'rhetoric-3'),
  PK('sneak-1', 'sneak', 'Shadow of the Insula', 0, 'You are 20% harder to see while sneaking.'),
  PK('sneak-2', 'sneak', 'Soft Sandals', 25, 'Sneaking in heavy armor makes no extra noise.', 'sneak-1'),
  PK('sneak-3', 'sneak', 'Sicarius', 40, 'Sneak attacks with daggers do triple damage.', 'sneak-2'),
  PK('commerce-1', 'commerce', 'Haggler', 0, 'Buying and selling prices are 10% better.'),
  PK('commerce-2', 'commerce', 'Negotiator', 30, 'Sell any kind of goods to any merchant.', 'commerce-1'),
  PK('religio-1', 'religio', 'Pius', 0, 'Blessings last 50% longer.'),
  PK('religio-2', 'religio', 'Haruspex', 30, 'Omens reveal the location of a hidden shrine.', 'religio-1'),
  PK('medicine-1', 'medicine', 'Disciple of Galen', 0, 'Remedies you mix are 25% stronger.'),
];

// ------------------------------------------------------------------ change notification

class Emitter {
  private fns = new Set<() => void>();
  onChange(fn: () => void) {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  emit() {
    for (const f of [...this.fns]) f();
  }
}

// ------------------------------------------------------------------ vitals & character

export class MockVitals implements VitalsView {
  health: Resource = { current: 112, max: 150 };
  stamina: Resource = { current: 140, max: 140 };
  pietas: Resource = { current: 34, max: 80 };
}

export class MockCharacter extends Emitter implements CharacterView {
  name = 'Marcus Valerius Felix';
  title = 'Peregrinus from Ostia · freeborn';
  level = 7;
  levelProgress = 0.62;
  perkPoints = 2;
  private levels: Record<string, number> = {
    blades: 34, spear: 18, blunt: 22, block: 28, heavyArmor: 21, archery: 15, lightArmor: 26, athletics: 31, sneak: 24,
    lockpicking: 19, pickpocket: 16, rhetoric: 41, commerce: 29, medicine: 17, religio: 23,
  };
  private taken = new Set(['blades-1', 'blades-2', 'block-1', 'rhetoric-1', 'rhetoric-2', 'sneak-1', 'commerce-1']);

  constructor(readonly vitals: VitalsView = new MockVitals()) {
    super();
  }

  skills() {
    return MOCK_SKILLS.map((def) => ({ def, level: this.levels[def.id] ?? 15, progress: ((this.levels[def.id] ?? 15) * 37) % 100 / 100 }));
  }

  private canTake(p: PerkDef) {
    return this.perkPoints > 0 && !this.taken.has(p.id) && (this.levels[p.skill] ?? 0) >= p.requiresLevel && (!p.requiresPerk || this.taken.has(p.requiresPerk));
  }

  perks(skillId?: string) {
    return MOCK_PERKS.filter((p) => !skillId || p.skill === skillId).map((def) => ({ def, taken: this.taken.has(def.id), available: this.canTake(def) }));
  }

  takePerk(id: string) {
    const p = MOCK_PERKS.find((x) => x.id === id);
    if (!p || !this.canTake(p)) return false;
    this.taken.add(id);
    this.perkPoints--;
    this.emit();
    return true;
  }

  effects(): EffectView[] {
    return [
      { source: 'Blessing of Mercury', description: 'Prices are 10% better in every shop.', remaining: 2640, kind: 'blessing' },
      { source: 'Falernian wine', description: 'Persuasion +10%.', remaining: 74, kind: 'potion' },
      { source: 'Tertian fever', description: 'Stamina regenerates 25% slower. A priest of Aesculapius could help.', kind: 'disease' },
    ];
  }

  factions(): FactionView[] {
    return [
      { name: 'The Green Faction', latin: 'Factio Prasina', rank: 'Supporter', progress: 0.4 },
      { name: 'Collegium of Bakers', latin: 'Collegium Pistorum', rank: 'Friend', progress: 0.15 },
    ];
  }

  bounties() {
    return [{ authority: 'Vigiles, Fourth Cohort', amount: 40 }];
  }

  stats() {
    return [
      { label: 'Days in Rome', value: 'III' },
      { label: 'Places discovered', value: '14' },
      { label: 'Quests completed', value: '2' },
      { label: 'Denarii earned', value: '386' },
      { label: 'Loaves eaten', value: '27' },
      { label: 'Fights won in the arena', value: '0' },
      { label: 'Times robbed in the Subura', value: '1' },
      { label: 'Offerings made', value: '5' },
    ];
  }

  armorRating() {
    return 31;
  }
}

// ------------------------------------------------------------------ inventory

export class MockInventory extends Emitter implements InventoryView {
  denarii = 152.25;
  maxWeight = 120;
  private counts = new Map<string, number>([
    ['gladius', 1], ['pugio', 1], ['hasta', 1], ['fustis', 1], ['arcus', 1], ['sagittae', 24], ['scutum', 1], ['galea', 1],
    ['subarmalis', 1], ['lorica-hamata', 1], ['caligae', 1], ['tunica', 2], ['toga', 1], ['paenula', 1],
    ['panis', 4], ['posca', 2], ['falernum', 1], ['theriac', 1], ['garum', 1], ['laurus', 6],
    ['book-column', 1], ['letter-pliny', 1], ['book-apicius', 1], ['defixio', 1], ['tessera', 2], ['tabella', 1],
    ['lucerna', 1], ['tali', 1], ['strigil', 1], ['clavis', 1],
  ]);
  private eq: Partial<Record<EquipSlot, string>> = { mainHand: 'gladius', offHand: 'scutum', head: 'galea', body: 'subarmalis', feet: 'caligae', cloak: 'paenula' };
  stolen = new Set(['tali']);
  /** Books read (fed to the journal's Notes). */
  readonly booksRead = new Set(['letter-pliny', 'book-column']);

  get weight() {
    let w = 0;
    for (const [id, n] of this.counts) w += (ITEM_BY_ID.get(id)?.weight ?? 0) * n;
    return Math.round(w * 10) / 10;
  }

  entries(): InventoryEntry[] {
    const eqBy = new Map(Object.entries(this.eq).map(([slot, id]) => [id, slot as EquipSlot]));
    return [...this.counts].map(([itemId, count]) => ({ itemId, def: mockItem(itemId), count, equipped: eqBy.get(itemId), stolen: this.stolen.has(itemId) }));
  }

  count(id: string) {
    return this.counts.get(id) ?? 0;
  }

  add(id: string, n = 1) {
    this.counts.set(id, this.count(id) + n);
    this.emit();
  }

  remove(id: string, n = 1) {
    const c = this.count(id) - n;
    if (c <= 0) {
      this.counts.delete(id);
      for (const [slot, eid] of Object.entries(this.eq)) if (eid === id) delete this.eq[slot as EquipSlot];
    } else this.counts.set(id, c);
    this.emit();
  }

  /** Like the real Inventory: unequip from whatever slot holds it, else pick a slot from the def. */
  toggleEquip(itemId: string) {
    const worn = Object.entries(this.eq).find(([, v]) => v === itemId);
    if (worn) delete this.eq[worn[0] as EquipSlot];
    else {
      const def = mockItem(itemId);
      const slot = def?.slot ?? (def?.weapon ? 'mainHand' : def?.shield ? 'offHand' : def?.armor || def?.type === 'clothing' ? 'body' : null);
      if (!slot) return false;
      this.eq[slot] = itemId;
    }
    this.emit();
    return true;
  }

  use(itemId: string) {
    if (!this.count(itemId)) return false;
    this.remove(itemId, 1);
    return true;
  }

  drop(itemId: string, count: number) {
    if (!this.count(itemId)) return false;
    this.remove(itemId, count);
    return true;
  }

  read(itemId: string): BookView | null {
    const b = MOCK_BOOKS[itemId];
    if (b && !this.booksRead.has(itemId)) {
      this.booksRead.add(itemId);
      this.emit();
    }
    return b ?? null;
  }

  armorRating() {
    let r = 0;
    for (const id of Object.values(this.eq)) {
      const d = id ? ITEM_BY_ID.get(id) : undefined;
      r += d?.armor?.rating ?? d?.shield?.rating ?? 0;
    }
    return r;
  }
}

// ------------------------------------------------------------------ quests

export class MockQuestLog extends Emitter implements QuestLogView {
  private list: QuestView[] = [
    {
      id: 'mq-column',
      title: 'The Column and the Crowd',
      latin: 'Columna et Turba',
      category: 'main',
      giver: 'Tiberius Claudius Pansa',
      location: 'Forum Romanum',
      summary: 'A sealed tablet, a missing scribe, and a city celebrating its emperor.',
      state: 'active',
      tracked: true,
      entries: [
        'I came to Rome the day after Trajan dedicated his column. The ship from Ostia was late, and the Forum was still littered with garlands.',
        'A scribe named Tiberius Claudius Pansa pressed a sealed tablet into my hands at the Golden Milestone and asked me to carry it to the Tabularium. He seemed afraid of someone in the crowd, and was gone before I could ask his reasons.',
      ],
      objectives: [
        { id: 'arrive', text: 'Reach the Roman Forum', done: true },
        { id: 'deliver', text: 'Deliver the sealed tablet to the Tabularium', done: false, target: { kind: 'location', id: 'tabularium' } },
        { id: 'ask', text: 'Ask after Pansa at the Basilica Ulpia', done: false, optional: true, target: { kind: 'location', id: 'forum-traiani' } },
      ],
    },
    {
      id: 'misc-tokens',
      title: 'Bread for the Plebs',
      latin: 'Panis Plebi',
      category: 'misc',
      giver: 'Decimus Attius, baker',
      location: 'Vicus Tuscus',
      summary: 'Someone is pocketing the grain tokens of the Subura.',
      state: 'active',
      tracked: false,
      entries: ['Decimus the baker told me that half his customers came to the Grain Portico this month and found no tokens waiting for them. If I find out who is selling the tesserae, he will feed me until the Saturnalia.'],
      objectives: [
        { id: 'tokens', text: 'Recover stolen grain tokens', done: false, count: 3, progress: 2, target: { kind: 'location', id: 'porticus-minucia' } },
        { id: 'who', text: 'Find out who is selling them', done: false, target: { kind: 'location', id: 'popina' } },
      ],
    },
    {
      id: 'fac-curse',
      title: 'A Curse upon the Blues',
      latin: 'Defixio Venetorum',
      category: 'faction',
      giver: 'Scorpus the Younger, Green charioteer',
      location: 'Circus Maximus',
      summary: 'Lead tablets in the drains of the Circus, and nails through the horses’ names.',
      state: 'active',
      tracked: false,
      entries: ['A Green charioteer swears that someone is cursing the horses. He wants the tablets found before the next race — and he wants to know who paid for them.'],
      objectives: [
        { id: 'find', text: 'Search the drains beneath the Circus Maximus', done: true, target: { kind: 'location', id: 'circus-maximus' } },
        { id: 'buyer', text: 'Learn who bought the curse', done: false },
      ],
    },
    {
      id: 'arena-missio',
      title: 'Missio',
      latin: 'Missio',
      category: 'arena',
      giver: 'Lanista Gaius Iulius Rufus',
      location: 'Ludus Magnus',
      summary: 'A free man who wants to fight in the arena must first survive the training ground.',
      state: 'active',
      tracked: false,
      entries: ['The lanista laughed when I asked to fight, and then told me to come back at dawn with my own sword.'],
      objectives: [{ id: 'train', text: 'Report to the Ludus Magnus at dawn', done: false, target: { kind: 'location', id: 'ludus-magnus' } }],
    },
    {
      id: 'misc-strigil',
      title: 'The Strigil of Sextus',
      category: 'misc',
      giver: 'Sextus the bath attendant',
      location: 'Baths of Trajan',
      summary: 'A senator’s gilded strigil has gone missing from the changing room.',
      state: 'active',
      tracked: false,
      entries: ['Sextus will be flogged if his master’s gilded strigil is not found by sunset. He suspects the capsarii who guard the clothes.'],
      objectives: [{ id: 'find', text: 'Find the gilded strigil', done: false, target: { kind: 'location', id: 'baths-trajan' } }],
    },
    {
      id: 'mq-arrival',
      title: 'Arrival',
      latin: 'Adventus',
      category: 'main',
      summary: 'From Ostia up the Tiber to the city.',
      state: 'completed',
      tracked: false,
      entries: ['I took passage on a grain barge from Ostia and walked the last miles beside the Via Ostiensis.', 'I passed the Pyramid of Cestius at dawn and entered the city by the river gate.'],
      objectives: [{ id: 'reach', text: 'Reach Rome', done: true }],
    },
    {
      id: 'misc-room',
      title: 'A Room in the Subura',
      category: 'misc',
      summary: 'Lodgings on the fourth floor, three denarii a week.',
      state: 'completed',
      tracked: false,
      entries: ['I rented a room on the fourth floor of an insula in the Subura. The landlord swears the building has never collapsed.'],
      objectives: [{ id: 'rent', text: 'Rent a room', done: true }],
    },
    {
      id: 'misc-dog',
      title: 'The Lost Dog of Vibia',
      category: 'misc',
      summary: 'A widow’s Maltese dog wandered off near the Saepta.',
      state: 'failed',
      tracked: false,
      entries: ['Vibia’s little dog was found by someone else first. She has decided I am useless.'],
      objectives: [{ id: 'dog', text: 'Find Vibia’s dog', done: false }],
    },
  ];

  constructor(private readonly inv?: MockInventory) {
    super();
  }

  quests() {
    return this.list;
  }

  setTracked(id: string, tracked: boolean) {
    const q = this.list.find((x) => x.id === id);
    if (q) q.tracked = tracked;
    this.emit();
  }

  notes(): NoteView[] {
    const read = this.inv?.booksRead ?? new Set(Object.keys(MOCK_BOOKS));
    return Object.entries(MOCK_BOOKS)
      .filter(([id]) => read.has(id))
      .map(([id, b]) => ({ id, title: b.title, kind: b.kind, meta: b.kind === 'letter' ? 'Letter' : b.kind === 'tablet' ? 'Lead tablet' : 'Book', open: () => b }));
  }

  /** Map markers for active objectives (all quests; tracked ones highlighted). */
  markerTargets(): { questId: string; label: string; target: MarkerTarget; tracked: boolean }[] {
    const out: { questId: string; label: string; target: MarkerTarget; tracked: boolean }[] = [];
    for (const q of this.list) {
      if (q.state !== 'active') continue;
      const o = q.objectives.find((x) => !x.done && x.target);
      if (o?.target) out.push({ questId: q.id, label: q.title, target: o.target, tracked: q.tracked });
    }
    return out;
  }
}

// ------------------------------------------------------------------ dialogue

interface DNode {
  line: DialogueLine;
  choices?: (DialogueChoiceView & { goto?: string; end?: boolean })[];
  next?: string;
}

export class MockDialogue extends Emitter implements DialogueView {
  readonly npcId = 'decimus';
  readonly npcName = 'Decimus Attius';
  readonly npcTitle = 'Baker of the Vicus Tuscus';
  ended = false;
  private node = 'greet';
  private seen = new Set<string>();
  private nodes: Record<string, DNode>;

  constructor(
    private readonly rhetoric = 41,
    private readonly denarii = () => 152,
    private readonly hooks: { onBarter?: () => void } = {},
  ) {
    super();
    const persuade = skillCheckChance(this.rhetoric, 40);
    this.nodes = {
      greet: {
        line: { speaker: 'npc', text: 'Ave, stranger. Bread’s fresh from the oven — the good kind, not the dole loaves. What will it be?' },
        choices: [
          { text: 'Ask about the missing grain tokens.', tag: { kind: 'quest', label: 'Bread for the Plebs' }, goto: 'tokens' },
          { text: 'You look like a man who hears things. What’s the word in the Forum?', tag: { kind: 'skill', label: 'Rhetoric 40', chance: persuade }, goto: persuade >= 1 ? 'rumor' : 'rumorFail' },
          { text: 'Perhaps this will loosen your tongue.', tag: { kind: 'bribe', label: '25 denarii' }, goto: 'rumor' },
          { text: 'Let me see what you’re selling.', tag: { kind: 'service', label: 'Trade' }, goto: 'trade' },
          { text: 'Join me in an offering to Ceres.', tag: { kind: 'skill', label: 'Religion 50', chance: skillCheckChance(23, 50) }, disabled: true, disabledReason: 'requires Religion 50' },
          { text: 'Goodbye.', exit: true, end: true },
        ],
      },
      tokens: {
        line: { speaker: 'npc', text: 'The aediles’ men skipped half the Subura this month. Three of my regulars came to me with no tesserae, and a baker can’t live on promises. Find out who’s pocketing the tokens and there’s a loaf for you every day until the Saturnalia.' },
        choices: [
          { text: 'Who handles the tokens for your street?', goto: 'who' },
          { text: 'I’ll look into it.', goto: 'greet' },
          { text: 'Not my problem.', goto: 'greet' },
        ],
      },
      who: {
        line: { speaker: 'npc', text: 'A freedman called Philetus keeps the lists for the vicus. Drinks at the Popina of the Four Winds, loses at dice, and lately he pays his debts in silver. Make of that what you will.' },
        next: 'greet',
      },
      rumor: {
        line: { speaker: 'npc', text: 'They say the Greens paid a woman by the Temple of Isis to curse the Blue horses. Lead tablets in the drains of the Circus, nails through the names. Me? I bet on bread.' },
        next: 'greet',
      },
      rumorFail: {
        line: { speaker: 'npc', text: 'The word? The word is “buy something or move along.”' },
        next: 'greet',
      },
      trade: {
        line: { speaker: 'npc', text: 'Panis quadratus, honey cakes, and a jar of posca if you’re thirsty. Prices are on the board.' },
        next: 'greet',
      },
    };
  }

  private get cur() {
    return this.nodes[this.node];
  }

  get line() {
    return this.cur.line;
  }

  get choices(): readonly DialogueChoiceView[] {
    return (this.cur.choices ?? []).map((c) => ({ ...c, seen: c.seen || (!!c.goto && this.seen.has(`${this.node}>${c.goto}`)) }));
  }

  choose(i: number) {
    const c = this.cur.choices?.[i];
    if (!c || c.disabled) return;
    if (c.end) return this.end();
    if (c.tag?.kind === 'bribe' && this.denarii() < 25) return;
    if (c.goto) {
      this.seen.add(`${this.node}>${c.goto}`);
      this.node = c.goto;
      if (c.goto === 'trade') this.hooks.onBarter?.();
    }
    this.emit();
  }

  advance() {
    if (this.cur.next) {
      this.node = this.cur.next;
      this.emit();
    }
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    this.emit();
  }
}

// ------------------------------------------------------------------ barter

export class MockBarter extends Emitter implements BarterView {
  readonly merchantName = 'Decimus Attius';
  readonly merchantTitle = 'Baker of the Vicus Tuscus · Pistor';
  private purse = 230;
  private stock = new Map<string, number>([
    ['panis', 24], ['posca', 6], ['falernum', 2], ['garum', 3], ['laurus', 10], ['lucerna', 3], ['strigil', 1], ['book-apicius', 1], ['paenula', 1], ['pugio', 1],
  ]);

  constructor(private readonly inv: MockInventory) {
    super();
  }

  merchantDenarii() {
    return this.purse;
  }

  playerDenarii() {
    return this.inv.denarii;
  }

  playerGoods(): TradeItem[] {
    return this.inv
      .entries()
      .filter((e) => !e.def.questItem)
      .map((e) => ({ itemId: e.itemId, def: e.def, count: e.count, price: Math.max(0.25, Math.round(e.def.value * 0.45 * 4) / 4), equipped: !!e.equipped, stolen: e.stolen, refuse: e.stolen ? 'Decimus does not buy stolen goods.' : undefined }));
  }

  merchantGoods(): TradeItem[] {
    return [...this.stock].map(([itemId, count]) => {
      const def = mockItem(itemId);
      return { itemId, def, count, price: Math.max(0.25, Math.round(def.value * 1.35 * 4) / 4) };
    });
  }

  playerLoad() {
    return { weight: this.inv.weight, max: this.inv.maxWeight };
  }

  commit(deal: Deal): { ok: true } | { ok: false; reason: string } {
    const buy = this.merchantGoods();
    const sell = this.playerGoods();
    let net = 0;
    for (const l of deal.buy) net -= (buy.find((t) => t.itemId === l.itemId)?.price ?? 0) * l.count;
    for (const l of deal.sell) net += (sell.find((t) => t.itemId === l.itemId)?.price ?? 0) * l.count;
    if (this.inv.denarii + net < 0) return { ok: false, reason: 'You cannot afford this.' };
    if (this.purse - net < 0) return { ok: false, reason: 'Decimus has not enough coin.' };
    for (const l of deal.buy) {
      this.stock.set(l.itemId, (this.stock.get(l.itemId) ?? 0) - l.count);
      if ((this.stock.get(l.itemId) ?? 0) <= 0) this.stock.delete(l.itemId);
      this.inv.add(l.itemId, l.count);
    }
    for (const l of deal.sell) {
      this.inv.remove(l.itemId, l.count);
      this.stock.set(l.itemId, (this.stock.get(l.itemId) ?? 0) + l.count);
    }
    this.inv.denarii += net;
    this.purse -= net;
    this.emit();
    return { ok: true };
  }
}

// ------------------------------------------------------------------ containers

export class MockContainer extends Emitter implements ContainerView {
  readonly title = 'Strongbox';
  readonly owner = 'Decimus Attius';
  readonly owned = true;
  private contents = new Map<string, number>([['tessera', 3], ['lucerna', 1], ['tali', 1], ['falernum', 1], ['letter-pliny', 1]]);

  constructor(private readonly inv: MockInventory) {
    super();
  }

  items(): ContainerItem[] {
    return [...this.contents].map(([itemId, count]) => ({ itemId, def: mockItem(itemId), count }));
  }

  playerItems(): ContainerItem[] {
    return this.inv.entries().filter((e) => !e.def.questItem && !e.equipped).map((e) => ({ itemId: e.itemId, def: e.def, count: e.count }));
  }

  take(itemId: string, count: number) {
    const have = this.contents.get(itemId) ?? 0;
    const n = Math.min(have, count);
    if (!n) return;
    if (have - n <= 0) this.contents.delete(itemId);
    else this.contents.set(itemId, have - n);
    this.inv.add(itemId, n);
    if (this.owned) this.inv.stolen.add(itemId);
    this.emit();
  }

  takeAll() {
    for (const [id, n] of [...this.contents]) this.take(id, n);
  }

  store(itemId: string, count: number) {
    const n = Math.min(this.inv.count(itemId), count);
    if (!n) return;
    this.inv.remove(itemId, n);
    this.contents.set(itemId, (this.contents.get(itemId) ?? 0) + n);
    this.emit();
  }
}

// ------------------------------------------------------------------ saves

/** A tiny painted 'screenshot' so the save list has something to show. */
function paintThumb(seed: number): string {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 108;
  const g = c.getContext('2d')!;
  const skies = [['#f2b46b', '#7f5a8a'], ['#9cc3e6', '#e9d9b8'], ['#2b2440', '#c76a3c'], ['#cfe0ef', '#f3e5c8']];
  const [a, b] = skies[seed % skies.length];
  const sky = g.createLinearGradient(0, 0, 0, 108);
  sky.addColorStop(0, a);
  sky.addColorStop(1, b);
  g.fillStyle = sky;
  g.fillRect(0, 0, 192, 108);
  g.fillStyle = 'rgba(60, 40, 30, 0.75)';
  // Colonnade and a temple pediment silhouette.
  for (let i = 0; i < 9; i++) g.fillRect(18 + i * 18 + (seed % 3) * 4, 44, 6, 44);
  g.beginPath();
  g.moveTo(12, 44);
  g.lineTo(96 + (seed % 3) * 4, 22);
  g.lineTo(180, 44);
  g.fill();
  g.fillStyle = 'rgba(40, 28, 20, 0.9)';
  g.fillRect(0, 88, 192, 20);
  return c.toDataURL('image/png');
}

export class MockSaves implements SaveSlotsView {
  private slots: SaveSlot[];
  constructor(private readonly onLoad?: (id: string) => void) {
    const now = Date.now();
    this.slots = [
      { id: 's4', name: 'Marcus Valerius Felix', level: 7, location: 'Roman Forum', gameDate: 'a.d. III Id. Mai. DCCCLXVI AUC', savedAt: now - 1000 * 60 * 14, playTime: 3 * 3600 + 22 * 60, kind: 'quick', thumbnail: paintThumb(0) },
      { id: 's3', name: 'Marcus Valerius Felix', level: 6, location: 'Circus Maximus', gameDate: 'prid. Id. Mai. DCCCLXVI AUC', savedAt: now - 1000 * 60 * 60 * 26, playTime: 2 * 3600 + 51 * 60, kind: 'manual', thumbnail: paintThumb(1) },
      { id: 's2', name: 'Marcus Valerius Felix', level: 4, location: 'Popina of the Four Winds', gameDate: 'a.d. IV Id. Mai. DCCCLXVI AUC', savedAt: now - 1000 * 60 * 60 * 50, playTime: 1 * 3600 + 40 * 60, kind: 'auto', thumbnail: paintThumb(2) },
      { id: 's1', name: 'Marcus Valerius Felix', level: 1, location: 'Porta Ostiensis', gameDate: 'a.d. VI Id. Mai. DCCCLXVI AUC', savedAt: now - 1000 * 60 * 60 * 80, playTime: 12 * 60, kind: 'manual', thumbnail: paintThumb(3) },
    ];
  }
  list() {
    return this.slots;
  }
  save(slotId?: string) {
    const base = { name: 'Marcus Valerius Felix', level: 7, location: 'Roman Forum', gameDate: 'a.d. III Id. Mai. DCCCLXVI AUC', savedAt: Date.now(), playTime: 3 * 3600 + 30 * 60, kind: 'manual' as const, thumbnail: paintThumb(Date.now() % 4) };
    if (slotId) this.slots = this.slots.map((s) => (s.id === slotId ? { ...s, ...base } : s));
    else this.slots = [{ id: `s${Date.now()}`, ...base }, ...this.slots];
  }
  load(id: string) {
    this.onLoad?.(id);
  }
  remove(id: string) {
    this.slots = this.slots.filter((s) => s.id !== id);
  }
}
