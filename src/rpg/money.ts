/** Roman money: 1 denarius = 4 sestertii = 16 asses. Values are stored as (fractional) denarii. */

export const SESTERTIUS = 0.25;
export const AS = 1 / 16;

/** Split denarii into whole denarii, sestertii and asses (rounded to the nearest as). */
export function splitDenarii(d: number): { denarii: number; sestertii: number; asses: number } {
  const asses = Math.max(0, Math.round(d * 16));
  return { denarii: Math.floor(asses / 16), sestertii: Math.floor((asses % 16) / 4), asses: asses % 4 };
}

/**
 * Human-readable price. 'short' → "12 d 2 s 1 a" / "3 a"; 'long' → "12 denarii, 2 sestertii, 1 as".
 * Zero is "0 d" / "nothing".
 */
export function formatDenarii(d: number, style: 'short' | 'long' = 'short'): string {
  const { denarii, sestertii, asses } = splitDenarii(d);
  const parts: string[] = [];
  if (style === 'short') {
    if (denarii) parts.push(`${denarii} d`);
    if (sestertii) parts.push(`${sestertii} s`);
    if (asses) parts.push(`${asses} a`);
    return parts.join(' ') || '0 d';
  }
  if (denarii) parts.push(`${denarii} ${denarii === 1 ? 'denarius' : 'denarii'}`);
  if (sestertii) parts.push(`${sestertii} ${sestertii === 1 ? 'sestertius' : 'sestertii'}`);
  if (asses) parts.push(`${asses} ${asses === 1 ? 'as' : 'asses'}`);
  return parts.join(', ') || 'nothing';
}
