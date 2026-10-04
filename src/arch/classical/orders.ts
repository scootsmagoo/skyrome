/**
 * Proportions of the five Roman orders, in lower column diameters (D). Values follow Vitruvius
 * (De architectura III–IV) as systematised by Vignola, nudged towards surviving Roman buildings
 * of the 1st–2nd century (Pantheon porch, Temple of Mars Ultor, Maison Carrée, Colosseum):
 *
 * | order       | column | base | capital | top Ø | entablature (of column) |
 * |-------------|--------|------|---------|-------|-------------------------|
 * | Tuscan      | 7 D    | ½ D  | ½ D     | ¾ D   | ¼                       |
 * | Doric       | 8 D    | ½ D  | ½ D     | ⅚ D   | ¼                       |
 * | Ionic       | 9 D    | ½ D  | ⅓ D     | ⅚ D   | ¼ (Vignola 2¼ D)        |
 * | Corinthian  | 10 D   | ½ D  | 1⅙ D    | 0.85 D| ≈ 0.235 (Roman practice) |
 * | Composite   | 10 D   | ½ D  | 1⅙ D    | 0.85 D| ≈ 0.235                 |
 *
 * Intercolumniation (clear space between shafts, Vitruvius III.3): pycnostyle 1½ D, systyle 2 D,
 * eustyle 2¼ D, diastyle 3 D, araeostyle 4 D. Pure data and arithmetic: no Three.js.
 */

export type Order = 'tuscan' | 'doric' | 'ionic' | 'corinthian' | 'composite';
export const ORDERS: readonly Order[] = ['tuscan', 'doric', 'ionic', 'corinthian', 'composite'];

/**
 * Level of detail (docs/research/architecture.md §1.8):
 *  - 'high' LOD0/1, touching to street distance: flutes, carved capitals, dentils and modillions.
 *  - 'low'  LOD1/2, street to district: lathe shafts, simplified capitals and mouldings.
 *  - 'far'  LOD2, district to skyline (> ~150 m): 8-sided column prisms with a frustum capital and
 *           a slab abacus, entablatures as architrave/frieze/corona with the cornice shadow line,
 *           no mouldings, ornaments or sculpture. About 1–5k triangles per building.
 * Everything not special-cased treats 'far' like 'low'.
 */
export type Detail = 'high' | 'low' | 'far';

export interface OrderProportions {
  /** Column height (base + shaft + capital) in D. */
  heightD: number;
  baseD: number;
  capitalD: number;
  /** Upper shaft diameter / lower diameter. */
  topRatio: number;
  /** Entablature height / column height. */
  entablatureRatio: number;
  /** Architrave, frieze, cornice as fractions of the entablature (sum 1). */
  parts: [number, number, number];
  /** Number of flutes when fluted. */
  flutes: number;
  /** Square plinth side in D. */
  plinthD: number;
  /** Cornice projection beyond the frieze face, in fractions of cornice height. */
  corniceProjection: number;
  /** Number of fasciae in the architrave. */
  fasciae: number;
  dentils: boolean;
  modillions: boolean;
  /** Doric triglyphs in the frieze. */
  triglyphs: boolean;
}

export const ORDER_PROPORTIONS: Record<Order, OrderProportions> = {
  tuscan: {
    heightD: 7,
    baseD: 0.5,
    capitalD: 0.5,
    topRatio: 0.75,
    entablatureRatio: 0.25,
    parts: [0.29, 0.33, 0.38],
    flutes: 0,
    plinthD: 1.33,
    corniceProjection: 1.0,
    fasciae: 1,
    dentils: false,
    modillions: false,
    triglyphs: false,
  },
  doric: {
    heightD: 8,
    baseD: 0.5,
    capitalD: 0.5,
    topRatio: 0.83,
    entablatureRatio: 0.25,
    parts: [0.25, 0.375, 0.375],
    flutes: 20,
    plinthD: 1.4,
    corniceProjection: 1.1,
    fasciae: 1,
    dentils: false,
    modillions: false,
    triglyphs: true,
  },
  ionic: {
    heightD: 9,
    baseD: 0.5,
    capitalD: 0.36,
    topRatio: 0.833,
    entablatureRatio: 0.25,
    parts: [0.28, 0.33, 0.39],
    flutes: 24,
    plinthD: 1.4,
    corniceProjection: 1.0,
    fasciae: 3,
    dentils: true,
    modillions: false,
    triglyphs: false,
  },
  corinthian: {
    heightD: 10,
    baseD: 0.5,
    capitalD: 1.167,
    topRatio: 0.85,
    entablatureRatio: 0.235,
    parts: [0.3, 0.28, 0.42],
    flutes: 24,
    plinthD: 1.42,
    corniceProjection: 1.05,
    fasciae: 3,
    dentils: true,
    modillions: true,
    triglyphs: false,
  },
  composite: {
    heightD: 10,
    baseD: 0.5,
    capitalD: 1.167,
    topRatio: 0.85,
    entablatureRatio: 0.235,
    parts: [0.3, 0.28, 0.42],
    flutes: 24,
    plinthD: 1.42,
    corniceProjection: 1.05,
    fasciae: 2,
    dentils: true,
    modillions: true,
    triglyphs: false,
  },
};

export type Intercolumniation = 'pycnostyle' | 'systyle' | 'eustyle' | 'diastyle' | 'araeostyle';
/** Clear space between shafts, in D. */
export const INTERCOLUMNIATION: Record<Intercolumniation, number> = {
  pycnostyle: 1.5,
  systyle: 2,
  eustyle: 2.25,
  diastyle: 3,
  araeostyle: 4,
};

export interface ColumnDims {
  D: number;
  height: number;
  base: number;
  shaft: number;
  capital: number;
  /** Upper shaft diameter. */
  d: number;
  plinth: number;
}

/** Column part heights for lower diameter `D`; `height` overrides the canonical H (the shaft absorbs it). */
export function columnDims(order: Order, D: number, height?: number): ColumnDims {
  const p = ORDER_PROPORTIONS[order];
  const H = height ?? p.heightD * D;
  const base = p.baseD * D;
  const capital = p.capitalD * D;
  return { D, height: H, base, capital, shaft: Math.max(0.1, H - base - capital), d: p.topRatio * D, plinth: p.plinthD * D };
}

/** Lower diameter that gives a column of height `H` in canonical proportion. */
export function diameterForHeight(order: Order, H: number): number {
  return H / ORDER_PROPORTIONS[order].heightD;
}

export interface EntablatureDims {
  total: number;
  architrave: number;
  frieze: number;
  cornice: number;
  /** Horizontal projection of the cornice beyond the frieze face. */
  projection: number;
}

export function entablatureDims(order: Order, columnHeight: number): EntablatureDims {
  const p = ORDER_PROPORTIONS[order];
  const total = columnHeight * p.entablatureRatio;
  const [a, f, c] = p.parts;
  return { total, architrave: total * a, frieze: total * f, cornice: total * c, projection: total * c * p.corniceProjection };
}

/** Axial spacing (centre to centre) for a clear intercolumniation. */
export function axialSpacing(D: number, ic: Intercolumniation | number = 'systyle'): number {
  return D * (1 + (typeof ic === 'number' ? ic : INTERCOLUMNIATION[ic]));
}

/** Shaft radius at height fraction t (0 = bottom, 1 = top) with Vitruvian entasis: straight lower third, then a gentle convex taper. */
export function entasisRadius(D: number, topRatio: number, t: number): number {
  const r0 = D / 2;
  const r1 = (D * topRatio) / 2;
  if (t <= 1 / 3) return r0;
  const s = (t - 1 / 3) / (2 / 3);
  // Convex curve: slower taper at first (sin-shaped), reaching r1 at the top.
  return r0 - (r0 - r1) * (1 - Math.cos((s * Math.PI) / 2));
}

/** Pediment rise for a span (Vitruvius: tympanum height = 1/9 of the cornice length ≈ 12.5°; Roman pediments a little steeper). */
export function pedimentRise(span: number, pitchDeg = 14): number {
  return (span / 2) * Math.tan((pitchDeg * Math.PI) / 180);
}
