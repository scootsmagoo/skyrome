/**
 * Social standing (game.standing) — docs/GDD.md §3.4, tracked separately from skills:
 *   Dignitas     legal rank: peregrinus / latinus-iunianus 0 · libertus 1 · civis 2 · cliens-notus 3 · eques 4
 *   Fama         reputation −100…+100 per district here (per faction: FactionSystem)
 *   Infamia      0…100: the stain of arena, stage or brothel work and of convictions
 *   Cleanliness  lautus (washed, +10 persuasion for 12 game hours) · normal · sordidus (−10)
 * Legal status comes from the origin; only citizens and freedmen may wear the toga.
 */
import type { EventBus, GameEvents } from '../core/Events';
import { STANDING } from './data/balance';
import type { LegalStatus } from './types';
import './events';

export const DIGNITAS_STEPS = ['peregrinus', 'libertus', 'civis', 'cliens-notus', 'eques'] as const;
export type Dignitas = (typeof DIGNITAS_STEPS)[number];
export type Cleanliness = 'lautus' | 'normal' | 'sordidus';

const LEGAL: LegalStatus[] = ['civis', 'libertus', 'latinus-iunianus', 'peregrinus', 'alexandrinus'];
/** Dignitas a legal status starts at. */
const DIGNITAS_OF: Record<LegalStatus, Dignitas> = { civis: 'civis', libertus: 'libertus', 'latinus-iunianus': 'peregrinus', peregrinus: 'peregrinus', alexandrinus: 'peregrinus' };

export class Standing {
  private _legal: LegalStatus = 'civis';
  private _dignitas: Dignitas = 'civis';
  private _infamia = 0;
  private readonly fama = new Map<string, number>();
  private _cleanliness: Cleanliness = 'normal';
  /** Game hours (totalHours) when `lautus` wears off. */
  private lautusUntil = 0;
  /** Origin chosen at character creation (BACKGROUNDS id). */
  origin: string | null = null;
  /** Debt in denarii (the fallen eques starts 2,000 in debt). */
  debt = 0;

  constructor(
    private readonly events?: EventBus<GameEvents>,
    private readonly hours: () => number = () => 0,
  ) {}

  get legal(): LegalStatus {
    return this._legal;
  }
  get dignitas(): Dignitas {
    return this._dignitas;
  }
  /** 0 peregrinus … 4 eques. */
  get rank(): number {
    return DIGNITAS_STEPS.indexOf(this._dignitas);
  }
  get infamia(): number {
    return this._infamia;
  }
  /** Roman citizens (appeal, lighter sentences, the Urban Cohorts). */
  get isCitizen(): boolean {
    return this._legal === 'civis';
  }
  /** Only citizens and freedmen may wear the toga (§3.2); anyone else commits usurpatio togae. */
  get mayWearToga(): boolean {
    return this._legal === 'civis' || this._legal === 'libertus';
  }

  /** Character creation: legal status from the origin. */
  setOrigin(status: LegalStatus) {
    this._legal = status;
    this._dignitas = DIGNITAS_OF[status];
    this.changed();
  }

  /** The Vigiles' commendation, the bakers' route, a grant from Caesar. */
  grantCitizenship() {
    if (this._legal === 'civis') return;
    this._legal = 'civis';
    this.raise('civis');
    this.events?.emit('rpg:notify', { text: 'You are a Roman citizen', kind: 'faction' });
  }

  /** Rise to a Dignitas step (never lowers; use demote). */
  raise(step: Dignitas) {
    if (DIGNITAS_STEPS.indexOf(step) <= this.rank) return;
    this._dignitas = step;
    this.changed();
  }

  demote(step: Dignitas) {
    if (DIGNITAS_STEPS.indexOf(step) >= this.rank) return;
    this._dignitas = step;
    this.changed();
  }

  /** The equestrian ring needs the census (assets ≥ 25,000 den. at game scale) and Infamia ≤ 20. */
  canBecomeEques(assets: number): boolean {
    return this.isCitizen && assets >= STANDING.equestrianCensus && this._infamia <= STANDING.equestrianMaxInfamia;
  }

  addInfamia(amount: number) {
    const v = Math.max(0, Math.min(100, this._infamia + amount));
    if (v === this._infamia) return;
    this._infamia = v;
    this.changed();
  }

  fame(district: string): number {
    return this.fama.get(district) ?? 0;
  }

  addFame(district: string, amount: number) {
    this.fama.set(district, Math.max(STANDING.famaMin, Math.min(STANDING.famaMax, this.fame(district) + amount)));
  }

  allFame(): [string, number][] {
    return [...this.fama];
  }

  get cleanliness(): Cleanliness {
    if (this._cleanliness === 'lautus' && this.hours() >= this.lautusUntil) this._cleanliness = 'normal';
    return this._cleanliness;
  }

  /** Baths make you lautus for 12 game hours; a fountain restores normal; fighting, sewers and rain make you sordidus. */
  setCleanliness(c: Cleanliness) {
    this._cleanliness = c;
    if (c === 'lautus') this.lautusUntil = this.hours() + STANDING.lautusHours;
    this.events?.emit('standing:cleanliness', { cleanliness: c });
  }

  private changed() {
    this.events?.emit('standing:changed', { dignitas: this._dignitas, infamia: this._infamia, legal: this._legal });
  }

  serialize() {
    return { legal: this._legal, dignitas: this._dignitas, infamia: this._infamia, fama: Object.fromEntries(this.fama), origin: this.origin, debt: this.debt, cleanliness: this._cleanliness, lautusUntil: this.lautusUntil };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as Partial<ReturnType<Standing['serialize']>>;
    this._legal = LEGAL.includes(d.legal as LegalStatus) ? (d.legal as LegalStatus) : 'civis';
    this._dignitas = DIGNITAS_STEPS.includes(d.dignitas as Dignitas) ? (d.dignitas as Dignitas) : DIGNITAS_OF[this._legal];
    this._infamia = typeof d.infamia === 'number' ? Math.max(0, Math.min(100, d.infamia)) : 0;
    this.fama.clear();
    for (const [k, v] of Object.entries(d.fama ?? {})) if (typeof v === 'number' && Number.isFinite(v)) this.fama.set(k, v);
    this.origin = typeof d.origin === 'string' ? d.origin : null;
    this.debt = typeof d.debt === 'number' && d.debt > 0 ? d.debt : 0;
    this._cleanliness = d.cleanliness === 'lautus' || d.cleanliness === 'sordidus' ? d.cleanliness : 'normal';
    this.lautusUntil = typeof d.lautusUntil === 'number' ? d.lautusUntil : 0;
  }
}
