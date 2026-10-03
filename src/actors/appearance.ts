/**
 * Appearance spec for procedural humanoids. NPC definitions (content) produce these; the avatar
 * module consumes them. Colors are sRGB hex strings ('#a33b2a').
 */

export type Sex = 'male' | 'female';
export type Build = 'slight' | 'average' | 'stocky' | 'muscular' | 'heavy';
export type AgeGroup = 'child' | 'young' | 'adult' | 'middle' | 'old';

export type HairStyle =
  | 'bald'
  | 'cropped' // Trajanic short comb-forward
  | 'curly-short'
  | 'receding'
  | 'long-tied' // provincial / barbarian
  | 'bun' // simple women's knot
  | 'braided-crown' // matron's braided coil
  | 'trajanic-tower' // elite Trajanic/Flavian piled curls
  | 'veiled' // palla drawn over the head
  | 'vestal'; // seni crines + infula

export type BeardStyle = 'none' | 'stubble' | 'short' | 'full'; // beards are rare in AD 113 (philosophers, mourners, barbarians)

export type GarmentKind =
  | 'tunica' // knee-length tunic (men), belted
  | 'tunica-long' // ankle-length tunic (women)
  | 'tunica-short' // workers/slaves, exomis-like
  | 'toga' // citizen's toga (white), praetexta has a purple border
  | 'stola' // matron's overdress
  | 'palla' // women's mantle
  | 'paenula' // hooded travel cloak
  | 'lacerna' // light cloak pinned at the shoulder
  | 'sagum' // military cloak
  | 'subligaculum' // loincloth (gladiators, laborers)
  | 'apron'
  | 'balteus' // belt / baldric
  | 'braccae'; // trousers (Dacians, Germans, Gauls)

export interface Garment {
  kind: GarmentKind;
  color: string;
  /** Border/stripe color: toga praetexta purple border, latus clavus on a senator's tunic, etc. */
  trim?: string;
  /** Vertical purple stripes on the tunic (clavi): 'wide' senators, 'narrow' equestrians. */
  clavi?: 'wide' | 'narrow';
  /** Tunic sleeve length override (default by kind: short for men, elbow for long tunics). */
  sleeves?: 'none' | 'short' | 'elbow' | 'long';
}

export type HelmetKind =
  | 'imperial-gallic'
  | 'imperial-italic'
  | 'praetorian-attic' // crested parade helmet
  | 'vigiles-cap'
  | 'murmillo'
  | 'secutor'
  | 'thraex'
  | 'hoplomachus'
  | 'provocator'
  | 'leather-cap'
  | 'pileus'; // felt cap (freedmen)

export type BodyArmorKind = 'lorica-segmentata' | 'lorica-hamata' | 'lorica-squamata' | 'leather' | 'padded' | 'manica-only';

export interface ArmorLook {
  helmet?: { kind: HelmetKind; crest?: string; metal?: 'iron' | 'bronze' | 'gilded' };
  body?: { kind: BodyArmorKind; metal?: 'iron' | 'bronze' };
  /** Arm guard (gladiators): which arm. */
  manica?: 'left' | 'right';
  greaves?: 'both' | 'left' | 'right';
}

export type WeaponModel =
  | 'gladius'
  | 'spatha'
  | 'pugio'
  | 'sica'
  | 'hasta'
  | 'pilum'
  | 'fustis'
  | 'trident'
  | 'net'
  | 'bow'
  | 'sling'
  | 'axe'
  | 'hammer'
  | 'torch'
  | 'none';
export type ShieldModel = 'scutum' | 'scutum-oval' | 'parma' | 'parmula' | 'none';

export interface Appearance {
  sex: Sex;
  age: AgeGroup;
  build: Build;
  /** Height in meters (1.50–1.85 typical; Romans averaged ~1.65 m men, ~1.55 m women). */
  height: number;
  skin: string;
  hair: { style: HairStyle; color: string };
  beard?: BeardStyle;
  garments: Garment[];
  footwear?: 'calcei' | 'caligae' | 'soleae' | 'barefoot';
  armor?: ArmorLook;
  /** Visual-only defaults; equipped items override. */
  weapon?: WeaponModel;
  shield?: { model: ShieldModel; color?: string; emblem?: string };
}
