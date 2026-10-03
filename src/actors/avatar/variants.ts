/**
 * Random appearances by social role, grounded in Rome c. AD 113:
 *  - commoners wear undyed or cheaply dyed wool (off-white, oatmeal, browns, madder, faded woad);
 *  - the wealthy show brighter dyes; togas are natural white wool; purple only as elite trim;
 *  - elite men are clean-shaven (beards = philosophers, mourners, Greeks, "barbarians");
 *  - Rome is cosmopolitan: skin tones span the Mediterranean, North Africa, the East and the North;
 *  - soldiers and gladiators follow docs/research/society.md §9–10.
 */
import type { Appearance, BeardStyle, Build, Garment, HairStyle, HelmetKind } from '../appearance';
import type { Rng } from '../../core/Rng';

export const AVATAR_ROLES = [
  'plebeian-man',
  'plebeian-woman',
  'patrician-man',
  'matron',
  'slave',
  'freedman',
  'child',
  'elderly',
  'merchant',
  'priest',
  'vestal',
  'legionary',
  'praetorian',
  'urban-cohort',
  'vigil',
  'murmillo',
  'thraex',
  'retiarius',
  'secutor',
  'hoplomachus',
  'provocator',
  'dacian',
  'germanic',
  'egyptian',
  'syrian',
  'greek',
] as const;

export type AvatarRole = (typeof AVATAR_ROLES)[number];

export function isAvatarRole(s: string): s is AvatarRole {
  return (AVATAR_ROLES as readonly string[]).includes(s);
}

// --- palettes ---------------------------------------------------------------

export const PALETTE = {
  undyed: ['#d9d0bd', '#cfc4ad', '#c4b79c', '#bfb196', '#e0d8c6'],
  plainBrown: ['#a08665', '#8a6e50', '#6f5843', '#5e4a36', '#8c8170', '#7a6a55'],
  cheapDye: ['#8f4a35', '#9a5a3a', '#b08a4a', '#5d6e80', '#6f7553', '#7d5a6a', '#a46a46'],
  richDye: ['#a8382a', '#9e2a24', '#c98b2e', '#3f5f8a', '#4f6b45', '#b86a6a', '#2f6e74', '#d19a3a', '#8a5a2e'],
  white: ['#ebe5d6', '#efe9dc', '#f2eee4'],
  purple: '#4f1838',
  military: ['#d9d0bd', '#cdc3ad'],
  militaryRed: ['#8e3324', '#9b3a2a', '#7f2b20'],
  cloak: ['#6b5137', '#5b4a3a', '#4e4136', '#7a6248', '#6e3a2a'],
};

export const SKIN = {
  italic: ['#d9ab84', '#cf9f78', '#c6936b', '#bb8660', '#dcb08c'],
  olive: ['#bd9067', '#b0825a', '#a0744d', '#c09670'],
  northern: ['#e3bf9f', '#dbb595', '#e6c4a6'],
  african: ['#a46b49', '#8b5a3c', '#744a31', '#5c3a26', '#4a2f20'],
  eastern: ['#c08a63', '#b07c58', '#a5714f', '#c99772'],
};

export const HAIR = {
  dark: ['#1f1914', '#2a1f17', '#2e2219', '#3a2a1d'],
  brown: ['#4a3524', '#5e3b22', '#563d2a'],
  fair: ['#b08a52', '#c8a66a', '#9c7442', '#7a3e22'],
  grey: ['#8a857d', '#a39e95', '#5c5751', '#cfccc5'],
};

// --- helpers ----------------------------------------------------------------

function heightFor(rng: Rng, sex: 'male' | 'female', bias = 0): number {
  const mean = sex === 'male' ? 1.67 : 1.56;
  return +(mean + bias + rng.gauss() * 0.045).toFixed(3);
}

function build(rng: Rng, weights: [Build, number][]): Build {
  return rng.weighted(weights);
}

function skinFor(rng: Rng, origin: 'rome' | 'north' | 'africa' | 'east' | 'greek' = 'rome'): string {
  switch (origin) {
    case 'north':
      return rng.pick(SKIN.northern);
    case 'africa':
      return rng.pick(SKIN.african);
    case 'east':
      return rng.pick(SKIN.eastern);
    case 'greek':
      return rng.pick(rng.chance(0.5) ? SKIN.olive : SKIN.italic);
    default:
      // Cosmopolitan city: mostly Italic/olive, with Africans, Easterners and Northerners in the mix.
      return rng.pick(
        rng.weighted<string[]>([
          [SKIN.italic, 45],
          [SKIN.olive, 30],
          [SKIN.eastern, 10],
          [SKIN.african, 9],
          [SKIN.northern, 6],
        ]),
      );
  }
}

function hairColor(rng: Rng, age: Appearance['age'], fair = 0.06): string {
  if (age === 'old') return rng.pick(HAIR.grey);
  if (age === 'middle' && rng.chance(0.35)) return rng.pick(HAIR.grey.slice(0, 3));
  if (rng.chance(fair)) return rng.pick(HAIR.fair);
  return rng.pick(rng.chance(0.7) ? HAIR.dark : HAIR.brown);
}

function age(rng: Rng): Appearance['age'] {
  return rng.weighted<Appearance['age']>([
    ['young', 30],
    ['adult', 40],
    ['middle', 22],
    ['old', 8],
  ]);
}

function g(kind: Garment['kind'], color: string, extra: Partial<Garment> = {}): Garment {
  return { kind, color, ...extra };
}

function maleHair(rng: Rng, a: Appearance['age']): HairStyle {
  if (a === 'old') return rng.weighted<HairStyle>([['receding', 5], ['bald', 3], ['cropped', 2]]);
  if (a === 'middle') return rng.weighted<HairStyle>([['cropped', 5], ['receding', 3], ['curly-short', 2], ['bald', 1]]);
  return rng.weighted<HairStyle>([['cropped', 6], ['curly-short', 3]]);
}

function femaleHair(rng: Rng, wealthy: boolean): HairStyle {
  return wealthy
    ? rng.weighted<HairStyle>([['trajanic-tower', 5], ['braided-crown', 3], ['bun', 1]])
    : rng.weighted<HairStyle>([['bun', 6], ['braided-crown', 2], ['veiled', 1]]);
}

function beardRoman(rng: Rng): BeardStyle {
  return rng.weighted<BeardStyle>([['none', 85], ['stubble', 13], ['short', 2]]);
}

function shield(model: NonNullable<Appearance['shield']>['model'], color: string, emblem = 'thunderbolt'): Appearance['shield'] {
  return { model, color, emblem };
}

// --- roles ------------------------------------------------------------------

/** Random appearance for a role. Deterministic for a given RNG state. */
export function randomAppearance(rng: Rng, role: AvatarRole = 'plebeian-man'): Appearance {
  switch (role) {
    case 'plebeian-man': {
      const a = age(rng);
      const col = rng.chance(0.6) ? rng.pick(PALETTE.undyed) : rng.chance(0.6) ? rng.pick(PALETTE.plainBrown) : rng.pick(PALETTE.cheapDye);
      const garments = [g('tunica', col)];
      if (rng.chance(0.18)) garments.push(g(rng.chance(0.5) ? 'paenula' : 'lacerna', rng.pick(PALETTE.cloak)));
      return {
        sex: 'male',
        age: a,
        build: build(rng, [['slight', 3], ['average', 5], ['stocky', 3], ['muscular', 1], ['heavy', 1]]),
        height: heightFor(rng, 'male'),
        skin: skinFor(rng),
        hair: { style: maleHair(rng, a), color: hairColor(rng, a) },
        beard: beardRoman(rng),
        garments,
        footwear: rng.weighted([['soleae', 6], ['calcei', 3], ['barefoot', 1]] as const),
      };
    }
    case 'plebeian-woman': {
      const a = age(rng);
      const col = rng.chance(0.5) ? rng.pick(PALETTE.undyed) : rng.chance(0.5) ? rng.pick(PALETTE.cheapDye) : rng.pick(PALETTE.plainBrown);
      const garments = [g('tunica-long', col)];
      const hair = femaleHair(rng, false);
      if (hair === 'veiled' || rng.chance(0.35)) garments.push(g('palla', rng.pick([...PALETTE.plainBrown, ...PALETTE.cheapDye])));
      return {
        sex: 'female',
        age: a,
        build: build(rng, [['slight', 3], ['average', 5], ['stocky', 2], ['heavy', 1]]),
        height: heightFor(rng, 'female'),
        skin: skinFor(rng),
        hair: { style: hair, color: hairColor(rng, a) },
        garments,
        footwear: rng.weighted([['soleae', 7], ['calcei', 2], ['barefoot', 1]] as const),
      };
    }
    case 'patrician-man': {
      const a = rng.weighted<Appearance['age']>([['adult', 4], ['middle', 4], ['old', 2]]);
      const senator = rng.chance(0.4);
      return {
        sex: 'male',
        age: a,
        build: build(rng, [['slight', 2], ['average', 5], ['heavy', 2]]),
        height: heightFor(rng, 'male', 0.02),
        skin: rng.pick(SKIN.italic),
        hair: { style: maleHair(rng, a), color: hairColor(rng, a) },
        beard: 'none',
        garments: [g('tunica', rng.pick(PALETTE.white), { clavi: senator ? 'wide' : 'narrow', trim: PALETTE.purple }), g('toga', rng.pick(PALETTE.white), rng.chance(0.15) ? { trim: PALETTE.purple } : {})],
        footwear: 'calcei',
      };
    }
    case 'matron': {
      const a = rng.weighted<Appearance['age']>([['adult', 4], ['middle', 4], ['old', 1]]);
      const hair = rng.chance(0.3) ? 'veiled' : femaleHair(rng, true);
      return {
        sex: 'female',
        age: a,
        build: build(rng, [['slight', 2], ['average', 5], ['heavy', 2]]),
        height: heightFor(rng, 'female'),
        skin: rng.pick(SKIN.italic),
        hair: { style: hair, color: hairColor(rng, a) },
        garments: [g('tunica-long', rng.pick(PALETTE.undyed)), g('stola', rng.pick(PALETTE.richDye)), g('palla', rng.pick([...PALETTE.richDye, ...PALETTE.white]))],
        footwear: 'calcei',
      };
    }
    case 'slave': {
      const a = rng.weighted<Appearance['age']>([['young', 4], ['adult', 4], ['middle', 2]]);
      const male = rng.chance(0.7);
      const garments = [g(male ? 'tunica-short' : 'tunica-long', rng.pick([...PALETTE.plainBrown, ...PALETTE.undyed]))];
      if (rng.chance(0.3)) garments.push(g('apron', rng.pick(PALETTE.plainBrown)));
      return {
        sex: male ? 'male' : 'female',
        age: a,
        build: build(rng, male ? [['slight', 3], ['average', 4], ['stocky', 3], ['muscular', 2]] : [['slight', 4], ['average', 4]]),
        height: heightFor(rng, male ? 'male' : 'female', -0.01),
        skin: skinFor(rng, rng.weighted<'rome' | 'north' | 'africa' | 'east'>([['rome', 4], ['north', 2], ['africa', 2], ['east', 2]])),
        hair: { style: male ? rng.weighted<HairStyle>([['cropped', 6], ['curly-short', 3], ['bald', 1]]) : 'bun', color: hairColor(rng, a, 0.15) },
        beard: male ? rng.weighted<BeardStyle>([['none', 6], ['stubble', 4]]) : undefined,
        garments,
        footwear: rng.weighted([['barefoot', 3], ['soleae', 5]] as const),
      };
    }
    case 'freedman': {
      const a = age(rng);
      const garments = [g('tunica', rng.pick([...PALETTE.undyed, ...PALETTE.cheapDye]))];
      if (rng.chance(0.4)) garments.push(g('lacerna', rng.pick(PALETTE.cheapDye)));
      return {
        sex: 'male',
        age: a,
        build: build(rng, [['slight', 2], ['average', 5], ['heavy', 2]]),
        height: heightFor(rng, 'male'),
        skin: skinFor(rng, rng.weighted<'rome' | 'east' | 'greek' | 'africa'>([['rome', 4], ['east', 3], ['greek', 3], ['africa', 1]])),
        hair: { style: maleHair(rng, a), color: hairColor(rng, a) },
        beard: beardRoman(rng),
        garments,
        footwear: 'calcei',
        armor: rng.chance(0.35) ? { helmet: { kind: 'pileus' } } : undefined,
      };
    }
    case 'child': {
      const boy = rng.chance(0.5);
      const h = +(1.05 + rng.next() * 0.35).toFixed(3);
      return {
        sex: boy ? 'male' : 'female',
        age: 'child',
        build: 'slight',
        height: h,
        skin: skinFor(rng),
        hair: { style: boy ? rng.pick<HairStyle>(['cropped', 'curly-short']) : 'bun', color: hairColor(rng, 'young', 0.1) },
        garments: [g(boy ? 'tunica' : 'tunica-long', rng.pick([...PALETTE.undyed, ...PALETTE.cheapDye]))],
        footwear: rng.chance(0.5) ? 'barefoot' : 'soleae',
      };
    }
    case 'elderly': {
      const male = rng.chance(0.5);
      const garments = male ? [g('tunica', rng.pick(PALETTE.plainBrown)), g('paenula', rng.pick(PALETTE.cloak))] : [g('tunica-long', rng.pick(PALETTE.plainBrown)), g('palla', rng.pick(PALETTE.cloak))];
      return {
        sex: male ? 'male' : 'female',
        age: 'old',
        build: build(rng, [['slight', 5], ['average', 3], ['heavy', 1]]),
        height: heightFor(rng, male ? 'male' : 'female', -0.03),
        skin: skinFor(rng),
        hair: { style: male ? rng.pick<HairStyle>(['receding', 'bald']) : rng.pick<HairStyle>(['bun', 'veiled']), color: rng.pick(HAIR.grey) },
        beard: male ? rng.weighted<BeardStyle>([['none', 5], ['stubble', 3], ['full', 1]]) : undefined,
        garments,
        footwear: 'soleae',
      };
    }
    case 'merchant': {
      const a = rng.weighted<Appearance['age']>([['adult', 5], ['middle', 4], ['old', 1]]);
      return {
        sex: 'male',
        age: a,
        build: build(rng, [['average', 4], ['heavy', 4], ['stocky', 2]]),
        height: heightFor(rng, 'male'),
        skin: skinFor(rng, rng.weighted<'rome' | 'east' | 'greek'>([['rome', 5], ['east', 3], ['greek', 2]])),
        hair: { style: maleHair(rng, a), color: hairColor(rng, a) },
        beard: beardRoman(rng),
        garments: [g('tunica', rng.pick(PALETTE.richDye)), g('lacerna', rng.pick([...PALETTE.cheapDye, ...PALETTE.cloak]))],
        footwear: 'calcei',
      };
    }
    case 'priest': {
      const a = rng.weighted<Appearance['age']>([['middle', 5], ['old', 3], ['adult', 2]]);
      return {
        sex: 'male',
        age: a,
        build: build(rng, [['slight', 2], ['average', 5], ['heavy', 2]]),
        height: heightFor(rng, 'male'),
        skin: rng.pick(SKIN.italic),
        // Capite velato: the toga drawn over the head for sacrifice.
        hair: { style: 'veiled', color: hairColor(rng, a) },
        beard: 'none',
        garments: [g('tunica', PALETTE.white[0]), g('toga', PALETTE.white[2], { trim: PALETTE.purple }), g('palla', PALETTE.white[2])],
        footwear: 'calcei',
      };
    }
    case 'vestal':
      return {
        sex: 'female',
        age: rng.weighted<Appearance['age']>([['young', 3], ['adult', 4], ['middle', 2]]),
        build: 'slight',
        height: heightFor(rng, 'female'),
        skin: rng.pick(SKIN.italic),
        hair: { style: 'vestal', color: hairColor(rng, 'adult') },
        garments: [g('tunica-long', '#f2eee4'), g('stola', '#ebe5d8'), g('palla', '#f2eee4')],
        footwear: 'calcei',
      };
    case 'legionary': {
      const seg = rng.chance(0.65);
      return {
        sex: 'male',
        age: rng.weighted<Appearance['age']>([['young', 4], ['adult', 5], ['middle', 1]]),
        build: build(rng, [['average', 4], ['stocky', 3], ['muscular', 3]]),
        height: heightFor(rng, 'male', 0.03),
        skin: skinFor(rng, rng.weighted<'rome' | 'north' | 'east'>([['rome', 7], ['north', 2], ['east', 1]])),
        hair: { style: 'cropped', color: hairColor(rng, 'adult') },
        beard: rng.weighted<BeardStyle>([['none', 8], ['stubble', 2]]),
        garments: [g('tunica', rng.chance(0.6) ? rng.pick(PALETTE.military) : rng.pick(PALETTE.militaryRed)), ...(rng.chance(0.25) ? [g('sagum', rng.pick(PALETTE.cloak))] : [])],
        footwear: 'caligae',
        armor: {
          helmet: { kind: rng.chance(0.75) ? 'imperial-gallic' : 'imperial-italic', metal: rng.chance(0.8) ? 'iron' : 'bronze' },
          body: { kind: seg ? 'lorica-segmentata' : 'lorica-hamata', metal: 'iron' },
          manica: !seg && rng.chance(0.3) ? 'right' : undefined,
          greaves: !seg && rng.chance(0.2) ? 'both' : undefined,
        },
        weapon: rng.chance(0.85) ? 'gladius' : 'pilum',
        shield: shield('scutum', '#8e2a1e', 'thunderbolt'),
      };
    }
    case 'praetorian':
      return {
        sex: 'male',
        age: rng.weighted<Appearance['age']>([['young', 3], ['adult', 6], ['middle', 1]]),
        build: build(rng, [['average', 3], ['muscular', 5], ['stocky', 2]]),
        height: heightFor(rng, 'male', 0.08),
        skin: rng.pick(SKIN.italic),
        hair: { style: 'cropped', color: hairColor(rng, 'adult') },
        beard: 'none',
        garments: [g('tunica', rng.pick(PALETTE.militaryRed)), g('sagum', '#8a2f22')],
        footwear: 'caligae',
        armor: {
          helmet: { kind: 'praetorian-attic', crest: rng.chance(0.7) ? '#b3261e' : '#e8e2d2', metal: rng.chance(0.4) ? 'gilded' : 'bronze' },
          body: { kind: rng.chance(0.5) ? 'lorica-segmentata' : 'lorica-squamata', metal: 'iron' },
        },
        weapon: rng.chance(0.7) ? 'gladius' : 'hasta',
        shield: shield('scutum-oval', '#7c1f2a', 'scorpion'),
      };
    case 'urban-cohort':
      return {
        sex: 'male',
        age: rng.weighted<Appearance['age']>([['young', 3], ['adult', 5], ['middle', 2]]),
        build: build(rng, [['average', 5], ['stocky', 3], ['muscular', 2]]),
        height: heightFor(rng, 'male', 0.03),
        skin: rng.pick(SKIN.italic),
        hair: { style: 'cropped', color: hairColor(rng, 'adult') },
        beard: rng.weighted<BeardStyle>([['none', 7], ['stubble', 3]]),
        garments: [g('tunica', rng.pick(PALETTE.military)), ...(rng.chance(0.4) ? [g('paenula', rng.pick(PALETTE.cloak))] : [])],
        footwear: 'caligae',
        armor: { helmet: { kind: 'imperial-italic', metal: 'iron' }, body: { kind: 'lorica-hamata', metal: 'iron' } },
        weapon: rng.chance(0.5) ? 'gladius' : 'fustis',
        shield: shield('scutum-oval', '#5a4a6e', 'wreath'),
      };
    case 'vigil':
      return {
        sex: 'male',
        age: rng.weighted<Appearance['age']>([['young', 4], ['adult', 5], ['middle', 2]]),
        build: build(rng, [['average', 4], ['stocky', 4], ['muscular', 2]]),
        height: heightFor(rng, 'male'),
        skin: skinFor(rng, rng.weighted<'rome' | 'east' | 'africa' | 'greek'>([['rome', 5], ['east', 2], ['greek', 2], ['africa', 1]])),
        hair: { style: rng.pick<HairStyle>(['cropped', 'curly-short']), color: hairColor(rng, 'adult') },
        beard: rng.weighted<BeardStyle>([['none', 6], ['stubble', 4]]),
        garments: [g('tunica', rng.pick(['#7a4a32', '#8a5a3c', '#6f5843'])), g('balteus', '#3b2a1c')],
        footwear: 'caligae',
        armor: { helmet: { kind: 'vigiles-cap' } },
        weapon: 'axe',
      };
    case 'murmillo':
    case 'thraex':
    case 'retiarius':
    case 'secutor':
    case 'hoplomachus':
    case 'provocator':
      return gladiator(rng, role);
    case 'dacian': {
      const noble = rng.chance(0.3);
      return {
        sex: 'male',
        age: rng.weighted<Appearance['age']>([['young', 3], ['adult', 5], ['middle', 2]]),
        build: build(rng, [['average', 3], ['stocky', 3], ['muscular', 3]]),
        height: heightFor(rng, 'male', 0.04),
        skin: rng.pick(SKIN.italic.concat(SKIN.northern)),
        hair: { style: 'long-tied', color: hairColor(rng, 'adult', 0.25) },
        beard: rng.weighted<BeardStyle>([['full', 6], ['short', 3]]),
        garments: [g('tunica', rng.pick(PALETTE.plainBrown), { sleeves: 'long' }), g('braccae', rng.pick(PALETTE.plainBrown)), g('sagum', rng.pick(PALETTE.cloak))],
        footwear: 'calcei',
        armor: noble ? { helmet: { kind: 'pileus' } } : undefined,
        weapon: 'sica',
        shield: shield('scutum-oval', rng.pick(['#5d6e80', '#7a4a32', '#6f7553']), 'spirals'),
      };
    }
    case 'germanic':
      return {
        sex: 'male',
        age: rng.weighted<Appearance['age']>([['young', 4], ['adult', 5], ['middle', 1]]),
        build: build(rng, [['average', 2], ['muscular', 4], ['stocky', 3]]),
        height: heightFor(rng, 'male', 0.08),
        skin: rng.pick(SKIN.northern),
        hair: { style: 'long-tied', color: rng.pick([...HAIR.fair, ...HAIR.brown]) },
        beard: rng.weighted<BeardStyle>([['short', 4], ['full', 4], ['none', 2]]),
        garments: [g('braccae', rng.pick(PALETTE.plainBrown)), g('sagum', rng.pick(PALETTE.cloak)), ...(rng.chance(0.5) ? [g('tunica', rng.pick(PALETTE.plainBrown), { sleeves: 'long' })] : [])],
        footwear: 'calcei',
        weapon: 'hasta',
        shield: shield('scutum-oval', rng.pick(['#7a4a32', '#4f6b45', '#3f5f8a']), 'none'),
      };
    case 'egyptian': {
      const priest = rng.chance(0.4);
      return {
        sex: 'male',
        age: age(rng),
        build: build(rng, [['slight', 4], ['average', 5]]),
        height: heightFor(rng, 'male', -0.01),
        skin: rng.pick(SKIN.african.slice(0, 3).concat(SKIN.eastern)),
        hair: { style: priest ? 'bald' : 'cropped', color: rng.pick(HAIR.dark) },
        beard: 'none',
        garments: [g(priest ? 'tunica-long' : 'tunica', '#ece6d6')],
        footwear: 'soleae',
      };
    }
    case 'syrian':
      return {
        sex: 'male',
        age: age(rng),
        build: build(rng, [['slight', 3], ['average', 5], ['heavy', 2]]),
        height: heightFor(rng, 'male'),
        skin: rng.pick(SKIN.eastern),
        hair: { style: 'curly-short', color: rng.pick(HAIR.dark) },
        beard: rng.weighted<BeardStyle>([['short', 5], ['full', 3], ['none', 2]]),
        garments: [g('tunica-long', rng.pick(PALETTE.richDye)), g('lacerna', rng.pick(PALETTE.cheapDye))],
        footwear: 'soleae',
      };
    case 'greek':
      return {
        sex: 'male',
        age: rng.weighted<Appearance['age']>([['adult', 4], ['middle', 4], ['old', 2]]),
        build: build(rng, [['slight', 4], ['average', 5]]),
        height: heightFor(rng, 'male'),
        skin: skinFor(rng, 'greek'),
        hair: { style: rng.pick<HairStyle>(['curly-short', 'receding']), color: hairColor(rng, 'middle') },
        // Philosophers' beards and the Greek himation (draped like a palla).
        beard: rng.weighted<BeardStyle>([['full', 6], ['short', 3], ['none', 1]]),
        garments: [g('tunica', rng.pick(PALETTE.undyed)), g('palla', rng.pick([...PALETTE.undyed, ...PALETTE.plainBrown]))],
        footwear: 'soleae',
      };
  }
}

function gladiator(rng: Rng, role: 'murmillo' | 'thraex' | 'retiarius' | 'secutor' | 'hoplomachus' | 'provocator'): Appearance {
  const base: Appearance = {
    sex: rng.chance(0.03) ? 'female' : 'male',
    age: rng.weighted<Appearance['age']>([['young', 5], ['adult', 5]]),
    build: build(rng, [['muscular', 6], ['stocky', 3], ['heavy', 1]]),
    height: heightFor(rng, 'male', 0.02),
    skin: skinFor(rng, rng.weighted<'rome' | 'north' | 'africa' | 'east'>([['rome', 4], ['north', 3], ['africa', 2], ['east', 1]])),
    hair: { style: rng.pick<HairStyle>(['cropped', 'curly-short']), color: hairColor(rng, 'adult', 0.15) },
    beard: rng.weighted<BeardStyle>([['none', 6], ['stubble', 4]]),
    garments: [g('subligaculum', rng.pick(['#e6dfcf', '#d9d0bd', '#efe9dc'])), g('balteus', rng.pick(['#5a3c24', '#3b2a1c']))],
    footwear: 'barefoot',
  };
  if (base.sex === 'female') {
    base.height = heightFor(rng, 'female', 0.04);
    base.garments.unshift(g('tunica-short', '#d9d0bd'));
  }
  const crest = rng.pick(['#b3261e', '#e8e2d2', '#2f5e8a', '#d19a3a']);
  const helm = (kind: HelmetKind, metal: 'bronze' | 'iron' = 'bronze') => ({ kind, crest, metal });
  switch (role) {
    case 'murmillo':
      return { ...base, armor: { helmet: helm('murmillo'), manica: 'right', greaves: 'left' }, weapon: 'gladius', shield: shield('scutum', rng.pick(['#8e2a1e', '#2f5e8a', '#4f6b45']), 'wreath') };
    case 'thraex':
      return { ...base, armor: { helmet: helm('thraex'), manica: 'right', greaves: 'both' }, weapon: 'sica', shield: shield('parmula', rng.pick(['#8e2a1e', '#2f5e8a', '#c98b2e']), 'none') };
    case 'hoplomachus':
      return { ...base, armor: { helmet: helm('hoplomachus'), manica: 'right', greaves: 'both' }, weapon: 'hasta', shield: shield('parma', '#b08d4a', 'none') };
    case 'secutor':
      return { ...base, armor: { helmet: { kind: 'secutor', metal: rng.chance(0.5) ? 'bronze' : 'iron' }, manica: 'right', greaves: 'left' }, weapon: 'gladius', shield: shield('scutum', rng.pick(['#8e2a1e', '#2f5e8a']), 'wreath') };
    case 'provocator':
      return { ...base, armor: { helmet: { kind: 'provocator', metal: 'iron' }, manica: 'right', greaves: 'left' }, weapon: 'gladius', shield: shield('scutum', rng.pick(['#8e2a1e', '#4f6b45']), 'wreath') };
    case 'retiarius':
      return { ...base, armor: { manica: 'left' }, weapon: 'trident' };
  }
}
