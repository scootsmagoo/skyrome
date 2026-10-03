/** Pure text formatting for the UI (no DOM). Unit-tested in tests/ui-format.test.ts. */
import { toRoman } from '../core/GameTime';

/**
 * Classical inscriptional capitals: upper case, U → V, J → I, and an interpunct between words
 * ('Forum Romanum' → 'FORVM · ROMANVM'), as carved on Trajan's column base.
 */
export function toInscription(text: string, interpunct = true): string {
  const up = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop macrons/accents
    .toUpperCase()
    .replace(/U/g, 'V')
    .replace(/J/g, 'I');
  return interpunct ? up.trim().split(/\s+/).join(' · ') : up;
}

const ORDINALS = [
  'prima', 'secunda', 'tertia', 'quarta', 'quinta', 'sexta',
  'septima', 'octava', 'nona', 'decima', 'undecima', 'duodecima',
];
const ORDINALS_EN = [
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth',
];

/**
 * Roman time of day. Daylight is twelve horae from sunrise (taken as 06:00, so hora sexta ends at
 * noon); the night is four military watches (vigiliae) of three hours.
 */
export function romanHour(hour: number): { latin: string; english: string } {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 18) {
    const i = Math.floor(h - 6);
    return { latin: `Hora ${ORDINALS[i]}`, english: `the ${ORDINALS_EN[i]} hour` };
  }
  const nightHours = h >= 18 ? h - 18 : h + 6;
  const w = Math.min(3, Math.floor(nightHours / 3));
  const latin = ['Prima', 'Secunda', 'Tertia', 'Quarta'][w];
  return { latin: `${latin} vigilia`, english: `the ${ORDINALS_EN[w]} watch of the night` };
}

/** '08:30' */
export function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Money in denarii with sestertii (¼ denarius) and asses (¹⁄₁₆ denarius) for fractions:
 * 152 → '152', 12.25 → '12 d 1 s', 0.0625 → '1 a'. Use `long` for full words.
 */
export function formatMoney(denarii: number, long = false): string {
  const totalAsses = Math.round(Math.max(0, denarii) * 16);
  const d = Math.floor(totalAsses / 16);
  const s = Math.floor((totalAsses % 16) / 4);
  const a = totalAsses % 4;
  if (s === 0 && a === 0) return long ? `${d} ${d === 1 ? 'denarius' : 'denarii'}` : String(d);
  const parts: string[] = [];
  if (d) parts.push(long ? `${d} ${d === 1 ? 'denarius' : 'denarii'}` : `${d} d`);
  if (s) parts.push(long ? `${s} ${s === 1 ? 'sestertius' : 'sestertii'}` : `${s} s`);
  if (a) parts.push(long ? `${a} ${a === 1 ? 'as' : 'asses'}` : `${a} a`);
  return parts.join(' ');
}

/** Weight in kg with at most one decimal: 1 → '1', 1.25 → '1.3', 0.04 → '0.04'. */
export function formatWeight(kg: number): string {
  if (kg === 0) return '0';
  if (kg < 0.1) return kg.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return kg.toFixed(1).replace(/\.0$/, '');
}

/** '2h 05m' / '45m' / '3d 4h' from seconds. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${m}m`;
}

/** Remaining effect time: '45 s', '3 min', '2 h'. */
export function formatRemaining(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

/** Page number in Roman numerals (lower-case, as in old books). */
export function pageNumeral(n: number): string {
  return toRoman(n).toLowerCase();
}

/** Real-world save timestamp: '3 Oct 2026, 14:05'. */
export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${mon} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Skill-check success chance using the dialogue contract's rule (guaranteed at difficulty,
 *  falling off linearly over 25 levels below it). */
export function skillCheckChance(skill: number, difficulty: number): number {
  if (skill >= difficulty) return 1;
  return Math.max(0, 1 - (difficulty - skill) / 25);
}

/** Typographic quotes: "a" → “a”, 'b' → ‘b’, don't → don’t. Content can be typed with plain quotes. */
export function smartQuotes(s: string): string {
  return s
    .replace(/(^|[\s([{—–-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{—–-])'/g, '$1‘')
    .replace(/'/g, '’');
}

/** Splits text on blank lines into paragraphs (trimmed, empties removed). */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}
