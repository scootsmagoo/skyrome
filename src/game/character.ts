/**
 * The player character (GDD §3): what character creation produces, the three appearance presets
 * per sex, the Roman naming helper (§3.6), and the mapping from worn items to the avatar's look
 * (§8.2: dress follows the equipment; a woman's tunic is the long tunica). Pure — unit-tested.
 */
import type { Appearance, BeardStyle, Build, AgeGroup, Garment, HairStyle, ShieldModel, WeaponModel } from '../actors/appearance';
import { ORIGINS } from '../rpg/data/origins';
import type { BackgroundDef, EquipSlot, ItemDef } from '../rpg/types';
import type { CreationExtra } from '../rpg/data/origins';

export type Sex = 'male' | 'female';

/** What character creation produces (and what the 'character' save section stores). */
export interface CharacterSpec {
  name: string;
  sex: Sex;
  /** Origin id (ORIGINS). */
  origin: string;
  /** Appearance preset id (LOOKS). */
  look: string;
  /** The creation extra (every origin but the veteran). */
  extra?: CreationExtra;
}

/** v0.1 ships these four origins (GDD §3.2); the other six are shown locked. */
export const PLAYABLE_ORIGINS = ['civis-suburanus', 'hispanus', 'veteranus', 'dacus'] as const;

export interface OriginChoice {
  def: BackgroundDef;
  playable: boolean;
  /** Why it is locked ('Arrives in v0.2'). */
  locked?: string;
}

/** All ten origins in GDD order, the four playable ones first. */
export function originChoices(): OriginChoice[] {
  const play = new Set<string>(PLAYABLE_ORIGINS);
  const rows = ORIGINS.map((def) => ({ def, playable: play.has(def.id), locked: play.has(def.id) ? undefined : `Arrives in ${def.since ?? 'a later version'}` }));
  return [...rows.filter((r) => r.playable), ...rows.filter((r) => !r.playable)];
}

// ------------------------------------------------------------------ appearance presets

export interface LookPreset {
  id: string;
  sex: Sex;
  label: string;
  /** One line under the label. */
  note: string;
  age: AgeGroup;
  build: Build;
  height: number;
  skin: string;
  hair: { style: HairStyle; color: string };
  beard?: BeardStyle;
}

/** Three presets per sex (GDD §17.1 Must: "3 appearance presets per sex"). */
export const LOOKS: LookPreset[] = [
  { id: 'm-urbanus', sex: 'male', label: 'Townsman', note: 'Clean-shaven, Trajanic fringe', age: 'adult', build: 'average', height: 1.68, skin: '#cf9f78', hair: { style: 'cropped', color: '#2a1f17' }, beard: 'none' },
  { id: 'm-durus', sex: 'male', label: 'Weathered', note: 'Broad, greying, a day’s stubble', age: 'middle', build: 'muscular', height: 1.71, skin: '#b0825a', hair: { style: 'receding', color: '#5c5751' }, beard: 'stubble' },
  { id: 'm-peregrinus', sex: 'male', label: 'Provincial', note: 'Young, curly-haired, bearded', age: 'young', build: 'average', height: 1.74, skin: '#dbb595', hair: { style: 'curly-short', color: '#5e3b22' }, beard: 'short' },
  { id: 'f-plebeia', sex: 'female', label: 'Townswoman', note: 'Hair in a simple knot', age: 'adult', build: 'average', height: 1.55, skin: '#d9ab84', hair: { style: 'bun', color: '#2e2219' } },
  { id: 'f-matrona', sex: 'female', label: 'Matron', note: 'Sturdy, braids coiled high', age: 'middle', build: 'stocky', height: 1.53, skin: '#b0825a', hair: { style: 'braided-crown', color: '#3a2a1d' } },
  { id: 'f-peregrina', sex: 'female', label: 'Provincial', note: 'Young, fair, auburn hair', age: 'young', build: 'slight', height: 1.58, skin: '#e3bf9f', hair: { style: 'bun', color: '#7a3e22' } },
];

export function looksFor(sex: Sex): LookPreset[] {
  return LOOKS.filter((l) => l.sex === sex);
}

export function lookById(id: string, sex: Sex): LookPreset {
  return LOOKS.find((l) => l.id === id && l.sex === sex) ?? looksFor(sex)[0];
}

// ------------------------------------------------------------------ outfit → appearance

/** Shoes by item id (items carry no shoe visual of their own). */
const FOOTWEAR: Record<string, NonNullable<Appearance['footwear']>> = {
  caligae: 'caligae',
  calcei: 'calcei',
  soleae: 'soleae',
  carbatinae: 'calcei',
};

/** Legwear by item id. */
const LEGWEAR: Record<string, Garment> = {
  bracae: { kind: 'braccae', color: '#6f5843' },
};

/** Equipped slot → item def, as the inventory reports it. */
export type Worn = Partial<Record<EquipSlot, ItemDef | undefined>>;

/**
 * The avatar look for a body preset wearing these items. Garments go innermost first (tunic,
 * trousers, stola or armor, cloak); a woman's knee-length tunic becomes the long tunica; with no
 * tunic at all a man wears a loincloth and a woman a plain long tunic.
 */
export function outfitAppearance(look: LookPreset, worn: Worn): Appearance {
  const female = look.sex === 'female';
  const garments: Garment[] = [];
  const pushGarment = (def: ItemDef | undefined) => {
    const g = def?.visual?.garment;
    if (!g) return;
    garments.push(female && g.kind === 'tunica' ? { ...g, kind: 'tunica-long', sleeves: g.sleeves ?? 'elbow' } : { ...g });
  };
  pushGarment(worn.under);
  if (!garments.length) garments.push(female ? { kind: 'tunica-long', color: '#d9d0bd' } : { kind: 'subligaculum', color: '#d9d0bd' });
  const legs = worn.legs ? LEGWEAR[worn.legs.id] : undefined;
  if (legs) garments.push({ ...legs });
  pushGarment(worn.body);
  pushGarment(worn.cloak);

  const armor: NonNullable<Appearance['armor']> = {};
  const body = worn.body?.visual?.armor?.body ?? worn.padding?.visual?.armor?.body;
  if (body) armor.body = { ...body };
  const helmet = worn.head?.visual?.armor?.helmet;
  if (helmet) armor.helmet = { ...helmet };
  const arm = worn.arm?.visual?.armor?.manica;
  if (arm) armor.manica = arm;
  const greaves = worn.shins?.visual?.armor?.greaves;
  if (greaves) armor.greaves = greaves;

  const weapon: WeaponModel = worn.mainHand?.visual?.weapon ?? 'none';
  const offHand = worn.offHand;
  const shieldModel: ShieldModel = offHand?.visual?.shield ?? 'none';

  return {
    sex: look.sex,
    age: look.age,
    build: look.build,
    height: look.height,
    skin: look.skin,
    hair: { ...look.hair },
    beard: female ? undefined : look.beard ?? 'none',
    garments,
    footwear: worn.feet ? FOOTWEAR[worn.feet.id] ?? 'calcei' : 'barefoot',
    armor: Object.keys(armor).length ? armor : undefined,
    weapon,
    shield: { model: shieldModel, color: '#7d2a1e', emblem: 'thunderbolt' },
  };
}

/**
 * A key for the parts of the look baked into the avatar mesh (body, garments, armor, shoes).
 * Weapons and shields are attachments and can change without rebuilding.
 */
export function meshKey(app: Appearance): string {
  const { weapon: _w, shield: _s, ...rest } = app;
  return JSON.stringify(rest);
}

/**
 * What an origin's kit puts on the body (GDD §3.2: formal dress starts in the pack, not worn) —
 * the creation preview dresses the turntable avatar with it before the inventory exists.
 */
export function kitWorn(origin: string, itemDef: (id: string) => ItemDef | undefined): Worn {
  const o = ORIGINS.find((x) => x.id === origin);
  const out: Worn = {};
  for (const k of o?.kit ?? []) {
    if (!k.equip) continue;
    const def = itemDef(k.id);
    if (!def) continue;
    const slot: EquipSlot | undefined = def.slot ?? (def.type === 'weapon' ? 'mainHand' : def.type === 'shield' ? 'offHand' : undefined);
    if (slot && !out[slot]) out[slot] = def;
  }
  return out;
}

/** Whether the off-hand item is a lit torch (the avatar holds it with `setTorch`). */
export function isTorch(def: ItemDef | undefined): boolean {
  return !!def && (def.visual?.weapon === 'torch' || !!def.tags?.includes('light'));
}

// ------------------------------------------------------------------ names (GDD §3.6)

const PRAENOMINA = ['Marcus', 'Gaius', 'Lucius', 'Publius', 'Quintus', 'Titus', 'Gnaeus', 'Sextus', 'Aulus', 'Decimus', 'Tiberius', 'Servius'];
const NOMINA = ['Ulpius', 'Aelius', 'Iulius', 'Cornelius', 'Valerius', 'Claudius', 'Flavius', 'Aemilius', 'Fabius', 'Licinius', 'Sempronius', 'Domitius', 'Iunius', 'Caecilius', 'Cassius', 'Antonius', 'Vettius', 'Pompeius'];
/** Baetican families (Trajan's homeland, §3.2 hispanus). */
const NOMINA_BAETICA = ['Ulpius', 'Aelius', 'Annius', 'Fabius', 'Iunius', 'Pompeius', 'Licinius', 'Cornelius'];
const COGNOMINA = ['Celer', 'Rufus', 'Priscus', 'Maximus', 'Severus', 'Felix', 'Fronto', 'Saturninus', 'Crispus', 'Longus', 'Niger', 'Paulinus', 'Verus', 'Gallus', 'Secundus', 'Faustus', 'Proculus', 'Varus'];
const COGNOMINA_F = ['Procula', 'Prisca', 'Secunda', 'Tertia', 'Maxima', 'Severa', 'Lucilla', 'Faustina', 'Marcella', 'Paulina', 'Rufina', 'Quinta', 'Felicula', 'Saturnina'];
/** Dacian and Thracian names (cf. Daizus, son of Mucapor, §3.6). */
const DACIAN_M = ['Daizus', 'Bitus', 'Tarsa', 'Dotus', 'Diurpaneus', 'Comozous', 'Mucapor', 'Zinais', 'Bastus', 'Sinna'];
const DACIAN_F = ['Zia', 'Dida', 'Aptusa', 'Bendidora', 'Mamutzis'];

/** Feminine form of a nomen: Ulpius → Ulpia. */
export function feminineNomen(nomen: string): string {
  return nomen.endsWith('ius') ? `${nomen.slice(0, -3)}ia` : nomen.endsWith('us') ? `${nomen.slice(0, -2)}a` : nomen;
}

type Pick = <T>(list: readonly T[]) => T;

/**
 * A name in the pattern of §3.6 for an origin and sex: citizen man praenomen + nomen + cognomen,
 * citizen woman feminine nomen + cognomen, a Junian Latin or peregrine "X, son/daughter of Y".
 */
export function romanName(origin: string, sex: Sex, pick: Pick): string {
  const status = ORIGINS.find((o) => o.id === origin)?.status ?? 'civis';
  if (status === 'latinus-iunianus' || status === 'peregrinus' || status === 'alexandrinus') {
    if (origin === 'dacus') {
      const own = pick(sex === 'male' ? DACIAN_M : DACIAN_F);
      const father = pick(DACIAN_M.filter((n) => n !== own));
      return `${own}, ${sex === 'male' ? 'son' : 'daughter'} of ${father}`;
    }
    const own = sex === 'male' ? pick(COGNOMINA) : pick(COGNOMINA_F);
    return `${own}, ${sex === 'male' ? 'son' : 'daughter'} of ${pick(COGNOMINA)}`;
  }
  const nomen = pick(origin === 'hispanus' ? NOMINA_BAETICA : NOMINA);
  if (status === 'libertus') return sex === 'male' ? `${pick(PRAENOMINA)} ${nomen} ${pick(['Eros', 'Hermes', 'Felix', 'Philetus', 'Onesimus'])}` : `${feminineNomen(nomen)} ${pick(['Chloe', 'Tyche', 'Helpis', 'Prima'])}`;
  return sex === 'male' ? `${pick(PRAENOMINA)} ${nomen} ${pick(COGNOMINA)}` : `${feminineNomen(nomen)} ${pick(COGNOMINA_F)}`;
}

/** A fixed, pleasant default name per origin and sex (the quick start and the first suggestion). */
export function defaultName(origin: string, sex: Sex): string {
  const table: Record<string, [string, string]> = {
    'civis-suburanus': ['Marcus Vettius Celer', 'Vettia Procula'],
    hispanus: ['Lucius Annius Severus', 'Annia Severa'],
    veteranus: ['Gaius Iulius Longus', 'Iulia Secunda'],
    dacus: ['Daizus, son of Mucapor', 'Zia, daughter of Bitus'],
  };
  const row = table[origin] ?? table['civis-suburanus'];
  return sex === 'male' ? row[0] : row[1];
}

/** Clean a typed name: trimmed, single spaces, at most 40 characters; empty → the default. */
export function cleanName(raw: string, origin: string, sex: Sex): string {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  return s || defaultName(origin, sex);
}

/** Validate a saved or typed spec, filling gaps with defaults (never throws). */
export function normalizeSpec(s: Partial<CharacterSpec> | null | undefined): CharacterSpec {
  const sex: Sex = s?.sex === 'female' ? 'female' : 'male';
  const origin = s?.origin && ORIGINS.some((o) => o.id === s.origin) ? s.origin : 'civis-suburanus';
  const look = lookById(s?.look ?? '', sex).id;
  const name = cleanName(typeof s?.name === 'string' ? s.name : '', origin, sex);
  const extra = s?.extra === 'parmula' || s?.extra === 'denarii' ? s.extra : undefined;
  return { name, sex, origin, look, extra };
}

/** Status line for menus: 'Civis Suburanus · citizen'. */
export function statusLine(spec: CharacterSpec): string {
  const o = ORIGINS.find((x) => x.id === spec.origin);
  const legal: Record<string, string> = { civis: 'citizen', libertus: 'freed citizen', 'latinus-iunianus': 'Junian Latin', peregrinus: 'free provincial', alexandrinus: 'Alexandrian' };
  return o ? `${o.latin} · ${legal[o.status ?? 'civis'] ?? o.status}` : 'Peregrinus';
}
