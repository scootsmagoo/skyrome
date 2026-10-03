/**
 * Roman money under Trajan: 1 aureus = 25 denarii; 1 denarius = 4 sestertii (HS) = 16 asses;
 * 1 as = 4 quadrantes (the bath fee). Amounts are stored as fractional denarii, kept exact to the
 * quadrans (1/64 d — a power of two, so floating point holds it exactly).
 */

export const SESTERTIUS = 0.25;
export const AS = 1 / 16;
export const QUADRANS = 1 / 64;

/** Round to the nearest quadrans. */
export function roundQuadrans(d: number): number {
  return Math.round(d * 64) / 64;
}

/** Split denarii into whole denarii, sestertii, asses and quadrantes. */
export function splitDenarii(d: number): { denarii: number; sestertii: number; asses: number; quadrantes: number } {
  const q = Math.max(0, Math.round(d * 64));
  return { denarii: Math.floor(q / 64), sestertii: Math.floor((q % 64) / 16), asses: Math.floor((q % 16) / 4), quadrantes: q % 4 };
}

/**
 * Human-readable money.
 *   'short' → "12 d 2 s 3 a" (denarii first, as the RPG stores them)
 *   'long'  → "12 denarii, 2 sestertii, 3 asses"
 *   'hs'    → "50 HS 3 a" (sesterces, as Romans priced things — society research §4.5)
 */
export function formatDenarii(d: number, style: 'short' | 'long' | 'hs' = 'short'): string {
  const { denarii, sestertii, asses, quadrantes } = splitDenarii(d);
  const parts: string[] = [];
  if (style === 'hs') {
    const hs = denarii * 4 + sestertii;
    if (hs) parts.push(`${hs.toLocaleString('en-US')} HS`);
    if (asses) parts.push(`${asses} a`);
    if (quadrantes) parts.push(`${quadrantes} q`);
    return parts.join(' ') || '0 HS';
  }
  if (style === 'short') {
    if (denarii) parts.push(`${denarii} d`);
    if (sestertii) parts.push(`${sestertii} s`);
    if (asses) parts.push(`${asses} a`);
    if (quadrantes) parts.push(`${quadrantes} q`);
    return parts.join(' ') || '0 d';
  }
  if (denarii) parts.push(`${denarii} ${denarii === 1 ? 'denarius' : 'denarii'}`);
  if (sestertii) parts.push(`${sestertii} ${sestertii === 1 ? 'sestertius' : 'sestertii'}`);
  if (asses) parts.push(`${asses} ${asses === 1 ? 'as' : 'asses'}`);
  if (quadrantes) parts.push(`${quadrantes} ${quadrantes === 1 ? 'quadrans' : 'quadrantes'}`);
  return parts.join(', ') || 'nothing';
}
