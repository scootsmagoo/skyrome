/**
 * The calendar (GDD §14.10): the date the player sees, the *pridie* clamp and the festivals.
 *
 * Two counters: `GameTime.dayIndex` (elapsed days; the sky's sun and moon follow it) always counts
 * up, while the calendar date advances at midnight only up to the eve of the next main-quest
 * anchor whose quest isn't done. While held there, days keep cycling but the date stays on the eve
 * (§14.10: "the world waits for the player"). Festival effects fire only on the first elapsed day
 * that shows a festival date, so 11 May (the Lemuria) is a festival once; held days after it are
 * just "the eve of the Column".
 *
 * Dates are { month (0-based), day } in AD 113 (Julian, not a leap year), as in GameTime.
 */
import { MONTHS, romanDate, toRoman } from '../core/GameTime';

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface DateAnchor {
  /** Main-quest id whose set piece the date waits for. */
  quest: string;
  month: number;
  day: number;
  /** "the Column" — for "Come back on …" lines. */
  label: string;
}

/** §10.3 date anchors (main-quest set pieces only). */
export const ANCHORS: DateAnchor[] = [
  { quest: 'mq-04-columna', month: 4, day: 12, label: 'the dedication of the Column' },
  { quest: 'mq-10-penus-vestae', month: 5, day: 9, label: 'the Vestalia' },
  { quest: 'mq-11-cucurbitae', month: 6, day: 6, label: 'the Ludi Apollinares' },
  { quest: 'mq-12-volcanalia', month: 7, day: 23, label: 'the Volcanalia' },
  { quest: 'mq-13-patres-conscripti', month: 8, day: 1, label: 'the Kalends of September' },
  { quest: 'mq-14-natalis', month: 8, day: 18, label: 'Trajan’s sixtieth birthday' },
  { quest: 'mq-15-profectio', month: 9, day: 19, label: 'the Departure' },
];

export interface FestivalDef {
  id: string;
  name: string;
  /** [month, firstDay, lastDay] ranges. */
  days: [number, number, number][];
}

/** §14.10 festivals in the game window. */
export const FESTIVALS: FestivalDef[] = [
  { id: 'fest-lemuria', name: 'Lemuria', days: [[4, 9, 9], [4, 11, 11], [4, 13, 13]] },
  { id: 'fest-columna', name: 'Dedication of the Column', days: [[4, 12, 12]] },
  { id: 'fest-argei', name: 'Argei', days: [[4, 14, 14]] },
  { id: 'fest-mercuralia', name: 'Mercuralia', days: [[4, 15, 15]] },
  { id: 'fest-vestalia', name: 'Vestalia', days: [[5, 7, 15]] },
  { id: 'fest-matralia', name: 'Matralia', days: [[5, 11, 11]] },
  { id: 'fest-quinquatrus-minores', name: 'Quinquatrus Minusculae', days: [[5, 13, 15]] },
  { id: 'fest-fors-fortuna', name: 'Fors Fortuna', days: [[5, 24, 24]] },
  { id: 'fest-kalendae-iuliae', name: 'Kalends of July', days: [[6, 1, 1]] },
  { id: 'fest-ludi-apollinares', name: 'Ludi Apollinares', days: [[6, 6, 13]] },
  { id: 'fest-nonae-caprotinae', name: 'Nonae Caprotinae', days: [[6, 7, 7]] },
  { id: 'fest-transvectio', name: 'Transvectio Equitum', days: [[6, 15, 15]] },
  { id: 'fest-ludi-victoriae', name: 'Ludi Victoriae Caesaris', days: [[6, 20, 30]] },
  { id: 'fest-neptunalia', name: 'Neptunalia', days: [[6, 23, 23]] },
  { id: 'fest-diana', name: 'Festival of Diana', days: [[7, 13, 13]] },
  { id: 'fest-portunalia', name: 'Portunalia', days: [[7, 17, 17]] },
  { id: 'fest-consualia', name: 'Consualia', days: [[7, 21, 21]] },
  { id: 'fest-volcanalia', name: 'Volcanalia', days: [[7, 23, 23]] },
  { id: 'fest-mundus', name: 'Mundus Patet', days: [[7, 24, 24], [9, 5, 5]] },
  { id: 'fest-ludi-romani', name: 'Ludi Romani', days: [[8, 4, 19]] },
  { id: 'fest-natalis-traiani', name: 'Birthday of Trajan', days: [[8, 18, 18]] },
  { id: 'fest-ludi-augustales', name: 'Augustalia', days: [[9, 3, 12]] },
  { id: 'fest-equus-october', name: 'October Horse', days: [[9, 15, 15]] },
  { id: 'fest-armilustrium', name: 'Armilustrium', days: [[9, 19, 19]] },
];

/** Day of the year (0 = 1 January) for a month/day. */
export function ordinalOf(month: number, day: number): number {
  let n = 0;
  for (let m = 0; m < month; m++) n += MONTHS[m].days;
  return n + day - 1;
}

/** Month/day for a day of the year (wraps past 31 December into the next year). */
export function dateOfOrdinal(ordinal: number, year = 113): CalendarDate {
  let y = year;
  let n = ordinal;
  while (n >= 365) {
    n -= 365;
    y++;
  }
  let month = 0;
  while (n >= MONTHS[month].days) {
    n -= MONTHS[month].days;
    month++;
  }
  return { year: y, month, day: n + 1 };
}

/** Festivals on a calendar date. */
export function festivalsOn(month: number, day: number): FestivalDef[] {
  return FESTIVALS.filter((f) => f.days.some(([m, a, b]) => m === month && day >= a && day <= b));
}

export interface CalendarState {
  /** Calendar day of the year (113). */
  ordinal: number;
  /** Elapsed day index the calendar last saw. */
  elapsed: number;
  /** Calendar ordinal → the first elapsed day that showed it (festival rule). */
  firstSeen: Record<string, number>;
}

/**
 * The calendar. `questDone(id)` answers whether an anchor's quest has finished (a quest that
 * doesn't exist yet counts as pending, so v0.1 holds the eve of 12 May).
 */
export class Calendar {
  /** Calendar day of the year. */
  ordinal: number;
  private elapsed: number;
  private firstSeen = new Map<number, number>();

  constructor(
    readonly year: number,
    startOrdinal: number,
    private readonly questDone: (questId: string) => boolean,
    startElapsed = 0,
  ) {
    this.ordinal = startOrdinal;
    this.elapsed = startElapsed;
    this.firstSeen.set(startOrdinal, startElapsed);
  }

  /** The anchor the date is waiting for (its quest pending), or null when none is ahead. */
  nextAnchor(): DateAnchor | null {
    for (const a of ANCHORS) if (!this.questDone(a.quest) && ordinalOf(a.month, a.day) > this.ordinal) return a;
    return null;
  }

  /** The anchor quest holding the date on its eve right now, or null (SaveSystem records it). */
  get clamp(): string | null {
    const a = this.nextAnchor();
    return a && this.ordinal >= ordinalOf(a.month, a.day) - 1 ? a.quest : null;
  }

  /** Follow the elapsed-day counter: one calendar day per midnight, but never past the next eve. */
  sync(elapsedDay: number) {
    while (this.elapsed < elapsedDay) {
      this.elapsed++;
      const a = this.nextAnchor();
      const eve = a ? ordinalOf(a.month, a.day) - 1 : Infinity;
      if (this.ordinal < eve) this.ordinal++;
      if (!this.firstSeen.has(this.ordinal)) this.firstSeen.set(this.ordinal, this.elapsed);
    }
  }

  /** Step from the eve onto the anchor day (entering the set piece's trigger area, "Wait until…"). */
  stepToAnchor(): boolean {
    const a = this.nextAnchor();
    if (!a) return false;
    const day = ordinalOf(a.month, a.day);
    if (this.ordinal !== day - 1) return false;
    this.ordinal = day;
    if (!this.firstSeen.has(day)) this.firstSeen.set(day, this.elapsed);
    return true;
  }

  date(): CalendarDate {
    return dateOfOrdinal(this.ordinal, this.year);
  }

  /** Festivals in effect today (only on the first elapsed day that shows their date). */
  festivals(): FestivalDef[] {
    if (this.firstSeen.get(this.ordinal) !== this.elapsed) return [];
    const d = this.date();
    return festivalsOn(d.month, d.day);
  }

  isFestival(id: string): boolean {
    return this.festivals().some((f) => f.id === id);
  }

  /** "a.d. V Id. Mai. DCCCLXVI AUC" for the calendar date. */
  formatRoman(): string {
    const d = this.date();
    return `${romanDate(d.month, d.day)} ${toRoman(d.year + 753)} AUC`;
  }

  /** "11 Maius, AD 113". */
  formatModern(): string {
    const d = this.date();
    return `${d.day} ${MONTHS[d.month].name}, AD ${d.year}`;
  }

  serialize(): CalendarState {
    return { ordinal: this.ordinal, elapsed: this.elapsed, firstSeen: Object.fromEntries([...this.firstSeen].map(([k, v]) => [String(k), v])) };
  }

  restore(s: unknown, fallback: { ordinal: number; elapsed: number }) {
    const d = (s ?? {}) as Partial<CalendarState>;
    this.ordinal = Number.isFinite(d.ordinal) ? Number(d.ordinal) : fallback.ordinal;
    this.elapsed = Number.isFinite(d.elapsed) ? Number(d.elapsed) : fallback.elapsed;
    this.firstSeen.clear();
    for (const [k, v] of Object.entries(d.firstSeen ?? {})) if (Number.isFinite(Number(k)) && Number.isFinite(v)) this.firstSeen.set(Number(k), Number(v));
    if (!this.firstSeen.has(this.ordinal)) this.firstSeen.set(this.ordinal, this.elapsed);
  }
}
