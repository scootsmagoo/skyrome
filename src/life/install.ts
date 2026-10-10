/**
 * installLife(game) — the life of the city (docs/design/world-life.md §3, docs/modules/life.md):
 * game.life, the keepers at their station posts, the cards on things, the rumour pool, the `life`
 * save section and the `life` / `job` console commands. src/game/optional.ts finds this file and
 * runs it after the NPCs and the content are installed.
 *
 *  - Data: LIFE (every src/life/data/** file), plus the worked examples in the dev build with
 *    `?lifex=1` (they give way to real data on the same ids and posts).
 *  - Other crews' runtime: every module in ./craft, ./wager and ./jobs is loaded here, and each
 *    exported function named install… is called with the game (register benches, tables, jobs).
 *  - Work: a 2 Hz tick (the counters of shut shops, things within 60 m); rumours are picked once
 *    per game hour; nothing runs per frame. Validation runs in tests, never here.
 */
import type { Game, System } from '../core/Game';
import { Rng } from '../core/Rng';
import { DISTRICTS as BARK_DISTRICTS } from '../content/barks';
import { FESTIVALS } from '../game/calendar';
import { STATIONS } from '../npc/crowd/stations';
import { VENDORS } from '../rpg/data/vendors';
import { Cards } from './cards';
import { lifeCommands } from './console';
import { missing, runEffects, type EffectCtx } from './effects';
import { passes } from './gates';
import { Keepers } from './keepers';
import { LIFE, mergeLife, validateLife, withExamples } from './registry';
import { districtHere, RumourMill, type RumourWhere } from './rumours';
import { setLifeData } from './talk';
import type { KeeperDef, LifeData, OptionDef, RumourDef, RumourKind } from './types';
import { registerCommands } from '../dev/console/commands';

declare module '../core/Game' {
  interface Game {
    life: LifeService;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    /** An option was taken (owner = keeper, NPC or activity id). Quests listen here (the bath thief). */
    'life:option': { owner: string; option: string; detail?: Record<string, string | number | boolean> };
    'life:crafted': { recipe: string; item: string; count: number };
    'life:wager': { wager: string; staked: number; won: number };
  }
}

/** Small saved state for life systems (the `life` save section). */
export interface LifeStore {
  /** Today's count for a key: daily options, jobs done today, a table's losses (resets at midnight). */
  today(key: string): number;
  /** Add to today's count; returns the new count. */
  addToday(key: string, n?: number): number;
  /** A saved value (open munus bets, the pallet's rent day). JSON-able. */
  get<T = unknown>(key: string): T | undefined;
  /** Save a value (undefined removes it). Keep it small: the whole section stays under 16 KB. */
  set(key: string, value: unknown): void;
}

export interface LifeService {
  /** The keeper is at their post now (station on duty, keeper alive). */
  isOpen(keeperId: string): boolean;
  /** "at the first hour" while shut; null when open, or shut for good (a dead keeper). */
  opensAt(keeperId: string): string | null;
  /** Today's picks: stable for the game day (seeded by the elapsed day) and across save/load. */
  rumours(where: { district?: string; board?: string; kind?: RumourKind }, n: number): RumourDef[];
  /** What E does on a thing; tests and the console call it too. False when shut or gated. */
  open(activityId: string): boolean;
  /** Take an option for an owner: gates, price, daily, effects, then 'life:option'. */
  take(owner: string, option: OptionDef): { ok: boolean; why?: string };
  status(): { keepers: number; open: number; activities: number; interactables: number; rumoursToday: number; problems: string[] };

  // ---- beyond the §3.2 contract: what the cards, talk.ts and the other crews' runtime use
  /** The data in play (LIFE, with the examples under ?lifex=1). */
  readonly data: Readonly<Required<LifeData>>;
  readonly store: LifeStore;
  /** A keeper's definition. */
  keeper(id: string): KeeperDef | undefined;
  /** Is the option shown now (its gate)? */
  visible(option: OptionDef): boolean;
  /** Why the option is off now (needs, the daily mark, missing goods, the purse), or null. */
  blocked(owner: string, option: OptionDef): string | null;
  /** take(), with what was said: the result line, then any rumour, omen or bill. */
  apply(owner: string, option: OptionDef): { ok: boolean; why?: string; text: string };
  /** The district rumours are told in where the player stands (rumours.ts districtHere). */
  districtHere(): string | null;
  /** Did the keeper die (their shop shut for good)? */
  dead(keeperId: string): boolean;
  /** Where to stand for a keeper or a thing, and what to look at (life goto). */
  whereIs(id: string): { stand: { x: number; z: number }; look: { x: number; z: number } } | null;
}

interface LifeSave {
  v: 1;
  /** key → [day, count]: only today's survive a save. */
  day: Record<string, [number, number]>;
  /** Keepers dead: their shops shut for good. */
  shut: string[];
  kv: Record<string, unknown>;
}

const examples = import.meta.glob<{ default: LifeData }>('./data/_examples.ts');
// The other crews' runtime modules: benches, tables, jobs.
const crews = import.meta.glob<Record<string, unknown>>(['./craft/*.ts', './wager/*.ts', './jobs/*.ts'], { eager: true });

class Life implements LifeService, System {
  readonly name = 'life';
  readonly priority = 120;
  readonly keepers: Keepers;
  readonly cards: Cards;
  readonly mill: RumourMill;
  readonly store: LifeStore;
  private readonly day = new Map<string, [number, number]>();
  private readonly shut = new Set<string>();
  private readonly kv = new Map<string, unknown>();
  private readonly rotation = new Map<string, number>();
  private readonly rng: Rng;
  private t = 0;
  private problemsCache: string[] | null = null;
  /** How long installLife took (ms; the budget is 5). */
  installMs = 0;

  constructor(
    private readonly game: Game,
    readonly data: Readonly<Required<LifeData>>,
  ) {
    this.rng = game.rng ? game.rng.fork('life') : new Rng('life');
    this.keepers = new Keepers(game, data.keepers, (id) => this.dead(id));
    this.mill = new RumourMill(game, data.rumours);
    this.cards = new Cards(game, data.activities, {
      visible: (o) => this.visible(o),
      apply: (owner, o) => this.apply(owner, o),
      notices: (board) => this.rumours({ board }, 4),
    });
    const today = () => this.game.time.dayIndex;
    this.store = {
      today: (key) => {
        const e = this.day.get(key);
        return e && e[0] === today() ? e[1] : 0;
      },
      addToday: (key, n = 1) => {
        const v = this.store.today(key) + n;
        this.day.set(key, [today(), v]);
        return v;
      },
      get: <T>(key: string) => this.kv.get(key) as T | undefined,
      set: (key, value) => {
        if (value === undefined) this.kv.delete(key);
        else this.kv.set(key, value);
      },
    };
  }

  update(dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const p = this.game.player?.position;
    if (!p) return;
    this.keepers.tick(p.x, p.z);
    this.cards.tick(p.x, p.z);
  }

  dispose() {
    this.keepers.clear();
    this.cards.clear();
  }

  // ---------------------------------------------------------------- LifeService

  isOpen(id: string): boolean {
    return this.keepers.isOpen(id);
  }

  opensAt(id: string): string | null {
    return this.keepers.opensAt(id);
  }

  rumours(where: RumourWhere, n: number): RumourDef[] {
    return this.mill.pick(where, n);
  }

  open(id: string): boolean {
    return this.cards.open(id);
  }

  take(owner: string, option: OptionDef): { ok: boolean; why?: string } {
    const r = this.apply(owner, option);
    return r.ok ? { ok: true } : { ok: false, why: r.why };
  }

  status() {
    let open = 0;
    for (const k of this.keepers.list) if (this.isOpen(k.def.id)) open++;
    let rumoursToday = 0;
    for (const r of this.data.rumours) if (this.mill.allowed(r)) rumoursToday++;
    return {
      keepers: this.keepers.list.length,
      open,
      activities: this.data.activities.length,
      interactables: this.keepers.registered + this.cards.registered,
      rumoursToday,
      problems: import.meta.env.DEV ? this.problems() : [],
    };
  }

  keeper(id: string): KeeperDef | undefined {
    return this.keepers.get(id)?.def;
  }

  visible(o: OptionDef): boolean {
    return passes(o.gate, this.game);
  }

  blocked(owner: string, o: OptionDef): string | null {
    if (o.needs && !passes(o.needs.gate, this.game)) return o.needs.why;
    if (o.daily && this.store.today(dailyKey(owner, o)) > 0) return 'Not again today.';
    const lack = missing(this.game, o.effects);
    if (lack) return lack;
    if (o.price && (this.game.player?.inventory?.denarii ?? 0) + 1e-9 < o.price) return 'You haven’t the money.';
    return null;
  }

  apply(owner: string, o: OptionDef): { ok: boolean; why?: string; text: string } {
    const fail = (why: string) => ({ ok: false, why, text: why });
    if (!this.visible(o)) return fail('Not now.');
    const why = this.blocked(owner, o);
    if (why) return fail(why);
    if (o.price && !this.game.player?.inventory?.spendDenarii(o.price)) return fail('You haven’t the money.');
    const ctx: EffectCtx = { owner, rng: this.rng, rumour: (d) => this.rumourLine(d), lines: [], detail: {}, dims: false };
    runEffects(this.game, o.effects, ctx);
    if (o.daily) this.store.addToday(dailyKey(owner, o));
    const text = [this.resultText(owner, o), ...ctx.lines].filter(Boolean).join(' ');
    this.game.events.emit('life:option', { owner, option: o.id, detail: Object.keys(ctx.detail).length ? ctx.detail : undefined });
    if (ctx.dims) dim(this.game);
    return { ok: true, text };
  }

  districtHere(): string | null {
    const p = this.game.player?.position;
    return p ? districtHere(p.x, p.z) : null;
  }

  whereIs(id: string) {
    const p = this.game.player?.position;
    return this.keepers.standFor(id) ?? this.cards.where(id, p?.x ?? 0, p?.z ?? 0);
  }

  dead(id: string): boolean {
    return this.shut.has(id) || !!this.game.population?.deadNamed.has(id) || !!this.game.deltas?.isDead(id);
  }

  // ---------------------------------------------------------------- inside

  /** One of today's rumours for a speaker to pass on, a different one each time. */
  private rumourLine(district?: string): string | null {
    const picks = this.rumours({ district: district ?? this.districtHere() ?? undefined, kind: 'talk' }, 3);
    if (!picks.length) return null;
    const n = this.rotation.get('rumour') ?? 0;
    this.rotation.set('rumour', n + 1);
    return picks[n % picks.length].text;
  }

  /** The option's result: a line, the next of a list, or a function of the game. */
  private resultText(owner: string, o: OptionDef): string {
    const r = o.result;
    if (typeof r === 'string') return r;
    if (typeof r === 'function') {
      try {
        return r(this.game);
      } catch (err) {
        console.error(`[life] result of ${owner}/${o.id} threw`, err);
        return '';
      }
    }
    if (!r.length) return '';
    const key = dailyKey(owner, o);
    const n = this.rotation.get(key) ?? 0;
    this.rotation.set(key, n + 1);
    return r[n % r.length];
  }

  /** The keeper died: the shop is shut for good (and the world deltas agree). */
  noteDeath(id: string) {
    if (!this.keepers.get(id) || this.shut.has(id)) return;
    this.shut.add(id);
    this.game.deltas?.markDead(id);
  }

  serialize(): LifeSave {
    const now = this.game.time.dayIndex;
    const day: Record<string, [number, number]> = {};
    for (const [k, v] of this.day) if (v[0] === now) day[k] = v;
    return { v: 1, day, shut: [...this.shut], kv: Object.fromEntries(this.kv) };
  }

  restore(d: unknown) {
    this.day.clear();
    this.shut.clear();
    this.kv.clear();
    this.rotation.clear();
    const s = (d ?? {}) as Partial<LifeSave>;
    for (const [k, v] of Object.entries(s.day ?? {})) if (Array.isArray(v) && v.length === 2) this.day.set(k, [Number(v[0]), Number(v[1])]);
    for (const id of s.shut ?? []) if (typeof id === 'string') this.shut.add(id);
    for (const [k, v] of Object.entries(s.kv ?? {})) this.kv.set(k, v);
  }

  /** After a load: the population knows the dead keepers too, so their posts stay empty. */
  afterLoad() {
    const pop = this.game.population;
    if (pop) for (const id of this.shut) pop.deadNamed.add(id);
  }

  /** Dev only: the data checked against the live game's ids (the tests are the real check). */
  private problems(): string[] {
    if (this.problemsCache) return this.problemsCache;
    const g = this.game;
    const keeperIds = new Set(this.data.keepers.map((k) => k.id));
    this.problemsCache = validateLife(mergeLife([this.data]), {
      items: g.items ? new Set(g.items.all().map((d) => d.id)) : undefined,
      npcs: g.npcs ? new Set(g.npcs.all().map((d) => d.id).filter((id) => !keeperIds.has(id))) : undefined,
      stations: new Map(STATIONS.filter((s) => !s.id.startsWith('st-life-')).map((s) => [s.id, s])),
      vendors: new Set(Object.keys(VENDORS)),
      quests: g.quests ? new Set(g.quests.all().map((q) => q.id)) : undefined,
      festivals: new Set(FESTIVALS.map((f) => f.id)),
      skills: g.player?.sheet ? new Set(g.player.sheet.skillDefsList().map((s) => s.id)) : undefined,
      factions: g.factions ? new Set(g.factions.all().map((f) => f.id)) : undefined,
      districts: new Set(['dist-forum-romanum', 'dist-fora-imperialia', 'dist-velia', 'dist-vallis-colossei', 'dist-subura', 'dist-velabrum-boarium', 'dist-circus-maximus', 'dist-porta-capena', ...BARK_DISTRICTS.map((d) => d.id)]),
    });
    return this.problemsCache;
  }
}

const dailyKey = (owner: string, o: OptionDef) => `opt:${owner}:${o.id}`;

/** Dim the screen for 650 ms as Wait does (the wt-veil of the Wait dialog), over the panel. */
function dim(game: Game) {
  const layer = game.ui?.overlayLayer;
  if (!layer || typeof document === 'undefined') return;
  const veil = document.createElement('div');
  veil.className = 'wt-veil';
  layer.appendChild(veil);
  setTimeout(() => {
    veil.classList.add('is-out');
    setTimeout(() => veil.remove(), 700);
  }, 650);
}

/**
 * Install the life of the city (game.life). `opts.data` replaces the data (tests: the examples);
 * otherwise LIFE, with the worked examples in the dev build under `?lifex=1`.
 */
export async function installLife(game: Game, opts: { data?: LifeData } = {}): Promise<LifeService> {
  if (game.life) return game.life;
  let data: Required<LifeData> = opts.data ? mergeLife([opts.data]) : (LIFE as Required<LifeData>);
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (!opts.data && import.meta.env.DEV && q?.get('lifex') === '1') {
    const load = examples['./data/_examples.ts'];
    if (load) data = withExamples(data, (await load()).default);
  }
  const t0 = performance.now();
  setLifeData(data);
  const life = new Life(game, data);
  game.life = life;
  life.keepers.install();
  for (const d of life.cards.dialogues()) game.dialogue?.register(d);
  game.save?.register('life', { save: () => life.serialize(), load: (d) => life.restore(d), reset: () => life.restore(undefined), afterLoad: () => life.afterLoad() });
  // A keeper killed: the shop is shut for good.
  game.events.on('npc:died', (e) => life.noteDeath(e.id));
  game.events.on('actor:killed', (e) => {
    if (!e.tags?.includes('ko') && !e.tags?.includes('fled')) life.noteDeath(e.victimId);
  });
  game.addSystem(life);
  registerCommands(...lifeCommands());
  // The other crews' runtime (benches, dice tables, jobs) plugs in through talk.ts's register*.
  for (const [path, mod] of Object.entries(crews)) {
    for (const [name, fn] of Object.entries(mod)) {
      if (!/^install[A-Z]/.test(name) || typeof fn !== 'function') continue;
      try {
        (fn as (g: Game) => unknown)(game);
      } catch (err) {
        console.error(`[life] ${path} ${name} failed`, err);
      }
    }
  }
  const ms = performance.now() - t0;
  if (import.meta.env.DEV) console.info(`[life] installed in ${ms.toFixed(2)} ms: ${life.keepers.list.length} keepers, ${data.activities.length} things, ${data.rumours.length} rumours`);
  life.installMs = ms;
  return life;
}
