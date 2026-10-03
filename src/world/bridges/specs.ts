/**
 * Builder's data for the Tiber bridges standing in AD 113 (docs/research/architecture.md §3.33),
 * keyed by atlas BRIDGES id. The atlas gives the ends, width, arch count and materials; this adds
 * the arch spans, piers, rise and the details each bridge is known for.
 */
import type { MaterialId } from '../../gfx/materialIds';
import type { BridgeArchSpec } from './layout';

export interface BridgeStyle extends BridgeArchSpec {
  kind: 'stone' | 'timber';
  /** Spandrels and piers. */
  body: MaterialId;
  /** Arch rings, cutwaters' caps, string course, parapets. */
  trim: MaterialId;
  /** Inscriptions on the faces over the arches (both sides) and on the parapets. */
  inscription?: { lines: string[]; parapet?: string[] };
  /** Small shrines / herms at the abutments [C]. */
  abutmentHerms?: boolean;
  /** Deck height above the water for timber trestles (game m). */
  deckAbove?: number;
  note: string;
}

export const BRIDGE_STYLES: Record<string, BridgeStyle> = {
  'pons-fabricius': {
    kind: 'stone',
    // Two 24.5 m arches and a central pier pierced by a small flood arch [A].
    spans: [24.5, 24.5],
    piers: [6.2],
    riseRatio: 0.36,
    reliefPiers: [0],
    body: 'tufa',
    trim: 'travertine',
    inscription: {
      lines: ['L·FABRICIVS·C·F·CVR·VIAR', 'FACIVNDVM·COERAVIT'],
      parapet: ['Q·LEPIDVS·M·F·M·LOLLIVS·M·F·COS', 'EX·S·C·PROBAVERVNT'],
    },
    abutmentHerms: true,
    note: '62 BC (L. Fabricius, curator viarum); tested by the consuls of 21 BC.',
  },
  'pons-cestius': {
    kind: 'stone',
    // One great arch (23.65 m) between two small flood arches in the abutments.
    spans: [5.8, 23.65, 5.8],
    piers: [5.2, 5.2],
    riseRatio: 0.36,
    body: 'peperino',
    trim: 'travertine',
    note: 'Mid-1st c. BC; island to the Transtiberim.',
  },
  'pons-aemilius': {
    kind: 'stone',
    // Rome's first stone bridge: six arches on massive piers with flood openings (as at Ponte Rotto).
    spans: [17, 20, 23, 23, 20, 17],
    piers: [7, 7.5, 7.5, 7.5, 7],
    riseRatio: 0.42,
    reliefPiers: [0, 1, 2, 3, 4],
    body: 'tufa',
    trim: 'travertine',
    note: 'Piers 179 BC, arches 142 BC, Augustan restoration.',
  },
  'pons-sublicius': {
    kind: 'timber',
    spans: [],
    piers: [],
    riseRatio: 0,
    body: 'wood_dark',
    trim: 'wood',
    deckAbove: 2.6,
    note: 'All timber, pegged without iron, kept by the pontiffs. The Argei are thrown from it on the Ides of May.',
  },
  'pons-agrippae': {
    kind: 'stone',
    spans: [15, 18, 20, 18, 15],
    piers: [6, 6.5, 6.5, 6],
    riseRatio: 0.42,
    reliefPiers: [1, 2],
    body: 'tufa',
    trim: 'travertine',
    note: 'Agrippa, late 1st c. BC.',
  },
  'pons-neronianus': {
    kind: 'stone',
    spans: [18, 21, 23, 21, 18],
    piers: [6.5, 7, 7, 6.5],
    riseRatio: 0.42,
    reliefPiers: [1, 2],
    body: 'tufa',
    trim: 'travertine',
    note: 'Caligula or Nero; to the Vatican gardens.',
  },
  'pons-mulvius': {
    kind: 'stone',
    // Four central spans of ~18.5 m between smaller end arches, semicircular, with pier openings.
    spans: [12, 18.5, 18.5, 18.5, 18.5, 12],
    piers: [6.5, 7, 7, 7, 6.5],
    riseRatio: 0.5,
    reliefPiers: [0, 1, 2, 3, 4],
    body: 'tufa',
    trim: 'travertine',
    note: '109 BC (M. Aemilius Scaurus); the Via Flaminia crossing north of the city.',
  },
};

/** Fallback for a bridge the table doesn't know (equal spans from the atlas arch count). */
export function styleFor(id: string, arches: number, length: number): BridgeStyle {
  const known = BRIDGE_STYLES[id];
  if (known) return known;
  if (arches <= 0) return { kind: 'timber', spans: [], piers: [], riseRatio: 0, body: 'wood_dark', trim: 'wood', deckAbove: 2.6, note: '' };
  const pier = 6;
  const span = Math.max(8, (length * 0.85 - pier * (arches - 1)) / arches);
  return { kind: 'stone', spans: Array(arches).fill(span), piers: Array(arches - 1).fill(pier), riseRatio: 0.42, body: 'tufa', trim: 'travertine', note: '' };
}
