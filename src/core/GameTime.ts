/**
 * In-game clock and Roman calendar (Julian; AD 113 is not a leap year).
 * Game time runs `timeScale` times faster than real time (Skyrim uses 20).
 */
import type { EventBus, GameEvents } from './Events';

export const MONTHS = [
  { name: 'Ianuarius', abbr: 'Ian.', days: 31 },
  { name: 'Februarius', abbr: 'Feb.', days: 28 },
  { name: 'Martius', abbr: 'Mart.', days: 31 },
  { name: 'Aprilis', abbr: 'Apr.', days: 30 },
  { name: 'Maius', abbr: 'Mai.', days: 31 },
  { name: 'Iunius', abbr: 'Iun.', days: 30 },
  { name: 'Iulius', abbr: 'Iul.', days: 31 },
  { name: 'Augustus', abbr: 'Aug.', days: 31 },
  { name: 'September', abbr: 'Sept.', days: 30 },
  { name: 'October', abbr: 'Oct.', days: 31 },
  { name: 'November', abbr: 'Nov.', days: 30 },
  { name: 'December', abbr: 'Dec.', days: 31 },
] as const;

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRoman(n: number): string {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Nones fall on the 7th and Ides on the 15th in March, May, July and October; otherwise 5th / 13th. */
export function nonesOf(month: number) { return [2, 4, 6, 9].includes(month) ? 7 : 5; }
export function idesOf(month: number) { return nonesOf(month) + 8; }

/** Roman-style date, e.g. "a.d. VI Id. Mai." for 10 May. `month` is 0-based, `day` 1-based. */
export function romanDate(month: number, day: number): string {
  const m = MONTHS[month];
  const next = MONTHS[(month + 1) % 12];
  const nones = nonesOf(month);
  const ides = idesOf(month);
  if (day === 1) return `Kal. ${m.abbr}`;
  if (day === nones) return `Non. ${m.abbr}`;
  if (day === ides) return `Id. ${m.abbr}`;
  let count: number, label: string, abbr: string;
  if (day < nones) { count = nones - day + 1; label = 'Non.'; abbr = m.abbr; }
  else if (day < ides) { count = ides - day + 1; label = 'Id.'; abbr = m.abbr; }
  else { count = m.days - day + 2; label = 'Kal.'; abbr = next.abbr; }
  if (count === 2) return `prid. ${label} ${abbr}`;
  return `a.d. ${toRoman(count)} ${label} ${abbr}`;
}

export interface GameDate { year: number; month: number; day: number; hour: number; minute: number }

export class GameTime {
  /** Game seconds per real second. */
  timeScale = 20;
  /** Total elapsed game time in hours since the start date at 00:00. */
  totalHours: number;
  paused = false;
  private lastHour: number;

  constructor(
    private readonly events: EventBus<GameEvents>,
    public readonly start = { year: 113, month: 4, day: 13 }, // 13 May AD 113 (Ides of May, day after the Column's dedication?) — GDD may adjust
    startHour = 8,
  ) {
    this.totalHours = startHour;
    this.lastHour = Math.floor(startHour);
  }

  /** Advance by real seconds. */
  tick(realDt: number) {
    if (this.paused) return;
    this.advanceHours((realDt * this.timeScale) / 3600);
  }

  advanceHours(h: number) {
    this.totalHours += h;
    const whole = Math.floor(this.totalHours);
    while (this.lastHour < whole) {
      this.lastHour++;
      this.events.emit('time:hour', { hour: this.lastHour % 24, day: Math.floor(this.lastHour / 24) });
    }
  }

  /** Hour of day, 0..24 (fractional). */
  get hour(): number { return ((this.totalHours % 24) + 24) % 24; }
  /** Whole days since the start date. */
  get dayIndex(): number { return Math.floor(this.totalHours / 24); }
  get isNight(): boolean { const h = this.hour; return h < 5.5 || h > 20.5; }

  date(): GameDate {
    let { year, month, day } = this.start;
    let d = this.dayIndex;
    while (d > 0) {
      const left = MONTHS[month].days - day;
      if (d <= left) { day += d; d = 0; }
      else { d -= left + 1; day = 1; month++; if (month > 11) { month = 0; year++; } }
    }
    const h = this.hour;
    return { year, month, day, hour: Math.floor(h), minute: Math.floor((h % 1) * 60) };
  }

  /** e.g. "a.d. III Id. Mai. DCCCLXVI AUC — hora tertia" */
  formatRoman(): string {
    const d = this.date();
    const auc = toRoman(d.year + 753);
    return `${romanDate(d.month, d.day)} ${auc} AUC`;
  }

  /** e.g. "13 May, AD 113 · 08:30" */
  formatModern(): string {
    const d = this.date();
    const mm = String(d.minute).padStart(2, '0');
    return `${d.day} ${MONTHS[d.month].name.replace(/ius$|us$/, (s) => s)} AD ${d.year} · ${String(d.hour).padStart(2, '0')}:${mm}`;
  }

  serialize() { return { totalHours: this.totalHours, timeScale: this.timeScale }; }
  restore(s: { totalHours: number; timeScale?: number }) {
    this.totalHours = s.totalHours;
    this.lastHour = Math.floor(s.totalHours);
    if (s.timeScale) this.timeScale = s.timeScale;
  }
}
