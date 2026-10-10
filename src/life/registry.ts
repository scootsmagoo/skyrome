/**
 * The life registry (docs/design/world-life.md §3.1, §3.6). Every file in ./data/ (and its
 * folders) default-exports `defineLife({...})`; an eager glob finds them and `LIFE` is their merge,
 * in path order. Files whose name starts with '_' are examples (`_examples.ts`): they are left out
 * here and loaded only by tests and by the dev build with `?lifex=1` (install.ts).
 *
 * `validateLife(data, refs)` checks every id, reference, hour, price and text length, plus the
 * history and story rules (nothing after AD 113, the protected people, the main quest's lead). It
 * returns one line per problem (empty when clean). It runs in tests (tests/life-data.test.ts), never
 * at boot: in production nothing is validated at runtime.
 */
import { ROMAN_HOURS } from '../content/hours';
import type { StationDef } from '../npc/crowd/stations';
import type { ActivityDef, Effect, Gate, Hours, KeeperDef, LifeData, OptionDef, Recipe, RumourDef, ServiceSet, WagerDef } from './types';

type LifeModule = { default?: LifeData };

const mods = import.meta.glob<LifeModule>(['./data/**/*.ts', '!./data/**/_*.ts'], { eager: true });

const EMPTY = (): Required<LifeData> => ({ keepers: [], services: [], activities: [], recipes: [], wagers: [], rumours: [] });

/** Merge data files (in the order given) into one set of lists. */
export function mergeLife(parts: readonly (LifeData | undefined)[]): Required<LifeData> {
  const out = EMPTY();
  for (const p of parts) {
    if (!p) continue;
    out.keepers.push(...(p.keepers ?? []));
    out.services.push(...(p.services ?? []));
    out.activities.push(...(p.activities ?? []));
    out.recipes.push(...(p.recipes ?? []));
    out.wagers.push(...(p.wagers ?? []));
    out.rumours.push(...(p.rumours ?? []));
  }
  return out;
}

/** Every life data file, merged (src/life/data/**, examples left out). */
export const LIFE: Readonly<Required<LifeData>> = mergeLife(
  Object.keys(mods)
    .sort()
    .map((k) => mods[k].default),
);

/**
 * Real data plus the worked examples: an example gives way to real data that claims the same id
 * or the same station post (so the example keeper steps aside once SHOPS has the real wine-seller).
 */
export function withExamples(real: Required<LifeData>, examples: LifeData): Required<LifeData> {
  const ids = new Set<string>();
  const posts = new Set<string>();
  const boardsTaken = new Set<string>();
  for (const k of real.keepers) {
    ids.add(k.id);
    posts.add(postKey(k));
  }
  for (const list of [real.services.map((s) => s.npc), real.activities.map((a) => a.id), real.recipes.map((r) => r.id), real.wagers.map((w) => w.id), real.rumours.map((r) => r.id)]) for (const id of list) ids.add(id);
  for (const a of real.activities) if (a.board) boardsTaken.add(a.board);
  const ex = mergeLife([examples]);
  return mergeLife([
    real,
    {
      keepers: ex.keepers.filter((k) => !ids.has(k.id) && !posts.has(postKey(k))),
      services: ex.services.filter((s) => !ids.has(s.npc)),
      activities: ex.activities.filter((a) => !ids.has(a.id) && !(a.board && boardsTaken.has(a.board))),
      recipes: ex.recipes.filter((r) => !ids.has(r.id)),
      wagers: ex.wagers.filter((w) => !ids.has(w.id)),
      rumours: ex.rumours.filter((r) => !ids.has(r.id)),
    },
  ]);
}

/** "st-subura-vinarius#0": the station post a keeper claims. */
export function postKey(k: Pick<KeeperDef, 'station' | 'member'>): string {
  return `${typeof k.station === 'string' ? k.station : k.station.id}#${k.member ?? 0}`;
}

// ------------------------------------------------------------------ the rules of the text

/**
 * Names of buildings and rulers after AD 113 (CLAUDE.md "History", world-life.md §3.6). A text
 * naming any of these is from the wrong century.
 */
export const POST_113: readonly { re: RegExp; why: string }[] = [
  { re: /aurelian(us)?\s+walls?|muri\s+aureliani/i, why: 'the Aurelian Walls (AD 271)' },
  { re: /venus\s+and\s+roma|veneris\s+et\s+romae/i, why: 'the Temple of Venus and Roma (Hadrian)' },
  { re: /constantin/i, why: 'Constantine (4th century)' },
  { re: /septimius\s+severus|arch\s+of\s+severus/i, why: 'Septimius Severus (AD 193)' },
  { re: /caracalla|antonin(ian)?a\s+baths|thermae\s+antoninianae/i, why: 'Caracalla (AD 211)' },
  { re: /diocletian/i, why: 'Diocletian (AD 284)' },
  { re: /hadrian['’]?s\s+(pantheon|wall|villa|mausoleum|temple)|mausoleum\s+of\s+hadrian|hadrianeum|castel\s+sant/i, why: 'a building of Hadrian’s reign' },
  { re: /(emperor|caesar|divus|divine|imperator)\s+hadrian|hadrian\s+(augustus|the\s+emperor)/i, why: 'Hadrian as emperor (from AD 117)' },
  { re: /antoninus\s+pius|marcus\s+aurelius|commodus|elagabalus|severus\s+alexander|maxentius|aurelian\b/i, why: 'a ruler after AD 113' },
];

/** The Pepper Warehouses are a main-quest lead (Appendix A.4): nobody in life data names them. */
export const PEPPER = /piperataria|pepper[\s-]*(ware)?house/i;

/** Real people are seen and never speak (STORY rule 5). */
export const REAL_SPEAKERS = /\b(trajan|traian(us)?|plotina|hadrian(us)?|pliny|plini(us)?|martial(is)?)\b/i;

/** Protected people (coniuratio-masked, Appendix A.5). */
const HERMOGENES = /hermogenes/i;
const EUHODUS = 'npc-euhodus';

/** History lint for one text: one line per broken rule (quests and dialogue run it in tests too). */
export function lintText(text: string): string[] {
  const out: string[] = [];
  for (const r of POST_113) if (r.re.test(text)) out.push(`names ${r.why}`);
  if (PEPPER.test(text)) out.push('names the Pepper Warehouses (a main-quest lead)');
  return out;
}

// ------------------------------------------------------------------ validation

/** The world's ids that life data refers to. A missing set skips that check. */
export interface LifeRefs {
  items?: ReadonlySet<string>;
  /** Named NPC ids (src/npc/content, quest and dialogue modules), keepers not included. */
  npcs?: ReadonlySet<string>;
  /** Existing stations by id (crowd/stations.ts STATIONS). */
  stations?: ReadonlyMap<string, StationDef>;
  /** Vendor kinds (rpg/data/vendors.ts VENDORS, with vendors-life.ts). */
  vendors?: ReadonlySet<string>;
  /** Quest ids, jobs included. */
  quests?: ReadonlySet<string>;
  /** game/calendar.ts FESTIVALS ids. */
  festivals?: ReadonlySet<string>;
  skills?: ReadonlySet<string>;
  conditions?: ReadonlySet<string>;
  factions?: ReadonlySet<string>;
  /** crowd/districts.ts ids. */
  districts?: ReadonlySet<string>;
}

/** The four notice boards of §4.5 (activities may add more with `board`). */
export const BOARDS = ['board-subura', 'board-forum', 'board-ceres', 'board-meta'] as const;

const DRESSING_KINDS = new Set(['brazier', 'stall-food', 'stall-cloth', 'stall-pots', 'table', 'cart', 'counter', 'amphorae', 'scrolls', 'bench', 'stool', 'vats', 'anvil', 'oven', 'mill', 'altar', 'shutters', 'banner']);
const BENCHES = new Set(['mortar']);
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isHour = (h: unknown) => typeof h === 'string' && Object.prototype.hasOwnProperty.call(ROMAN_HOURS, h);
/** A whole number of quadrantes (1/64 denarius), above zero. */
const quadrans = (d: unknown) => typeof d === 'number' && d > 0 && Number.isFinite(d) && Math.abs(d * 64 - Math.round(d * 64)) < 1e-9;
const list = (v: string | readonly string[] | undefined) => (v === undefined ? [] : typeof v === 'string' ? [v] : v);

/**
 * Check life data against the world (§3.6). Returns one readable line per problem: "keeper
 * keeper-x: unknown item 'panis2'". Empty when clean.
 */
export function validateLife(data: Required<LifeData>, refs: LifeRefs): string[] {
  const out: string[] = [];
  const bad = (where: string, msg: string) => out.push(`${where}: ${msg}`);
  const has = (set: ReadonlySet<string> | undefined, id: string) => !set || set.has(id);
  const item = (where: string, id: string) => {
    if (!id) bad(where, 'empty item id');
    else if (!has(refs.items, id)) bad(where, `unknown item '${id}'`);
  };
  const quest = (where: string, id: string) => {
    if (!has(refs.quests, id)) bad(where, `unknown quest '${id}'`);
  };
  const hours = (where: string, hs: readonly Hours[] | undefined) => {
    for (const h of hs ?? []) {
      if (!isHour(h.from)) bad(where, `'${String(h.from)}' is not a Roman hour mark (h1…h12, v1…v4)`);
      if (!isHour(h.to)) bad(where, `'${String(h.to)}' is not a Roman hour mark (h1…h12, v1…v4)`);
    }
  };
  const gate = (where: string, g: Gate | undefined) => {
    if (!g) return;
    for (const q of [...list(g.questDone), ...list(g.questCompleted), ...list(g.questNotStarted), ...list(g.questRunning)]) quest(where, q);
    if (g.festival !== undefined && !has(refs.festivals, g.festival)) bad(where, `unknown festival '${g.festival}'`);
    hours(where, g.hours);
    if (g.dates) {
      for (const [m, d] of [g.dates.from, g.dates.to]) if (!(m >= 0 && m <= 11 && d >= 1 && d <= MONTH_DAYS[m])) bad(where, `bad date [${m}, ${d}] (month is 0-based)`);
    }
    for (const w of g.wearing ?? []) item(where, w);
    if (g.has) {
      item(where, g.has.item);
      if (g.has.count !== undefined && !(Number.isInteger(g.has.count) && g.has.count >= 1)) bad(where, 'has.count must be a whole number ≥ 1');
    }
    if (g.skill && !has(refs.skills, g.skill.id)) bad(where, `unknown skill '${g.skill.id}'`);
    if (g.fama && !has(refs.factions, g.fama.faction)) bad(where, `unknown faction '${g.fama.faction}'`);
  };
  const effect = (where: string, e: Effect) => {
    switch (e.kind) {
      case 'receive':
        if (!quadrans(e.denarii)) bad(where, `receive ${e.denarii}: must be above 0 in whole quadrantes (1/64)`);
        break;
      case 'hours':
        if (!(e.hours > 0 && e.hours <= 24)) bad(where, `hours ${e.hours}: must be above 0 and at most 24`);
        break;
      case 'sleep':
        if (!isHour(e.until)) bad(where, `sleep until '${String(e.until)}' is not a Roman hour mark`);
        if (e.bed !== 'own' && e.bed !== 'rented') bad(where, `sleep: bed must be 'own' or 'rented'`);
        break;
      case 'clean':
        if (e.to !== 'normal' && e.to !== 'lautus') bad(where, `clean: to must be 'normal' or 'lautus'`);
        break;
      case 'condition':
        if (!has(refs.conditions, e.id)) bad(where, `unknown condition '${e.id}'`);
        break;
      case 'restore':
        if (e.amount !== 'full' && !(e.amount > 0)) bad(where, 'restore: amount must be above 0 or "full"');
        break;
      case 'skillXp':
        if (!has(refs.skills, e.skill)) bad(where, `unknown skill '${e.skill}'`);
        if (!(e.amount > 0)) bad(where, 'skillXp: amount must be above 0');
        break;
      case 'pietas':
        if (!e.amount) bad(where, 'pietas: amount must not be 0');
        break;
      case 'fama':
        if (!has(refs.factions, e.faction)) bad(where, `unknown faction '${e.faction}'`);
        if (!e.amount) bad(where, 'fama: amount must not be 0');
        break;
      case 'give':
      case 'take':
        item(where, e.item);
        if (e.count !== undefined && !(Number.isInteger(e.count) && e.count >= 1)) bad(where, `${e.kind}: count must be a whole number ≥ 1`);
        break;
      case 'flag':
        if (!e.name) bad(where, 'flag: empty name');
        break;
      case 'rumour':
        if (e.district !== undefined && !has(refs.districts, e.district)) bad(where, `unknown district '${e.district}'`);
        break;
      case 'startQuest':
        quest(where, e.quest);
        break;
      case 'bathe':
      case 'omen':
      case 'repair':
        break;
      default:
        bad(where, `unknown effect kind '${(e as { kind: string }).kind}'`);
    }
  };
  const options = (where: string, opts: readonly OptionDef[] | undefined) => {
    const seen = new Set<string>();
    for (const o of opts ?? []) {
      const w = `${where} option ${o.id || '(no id)'}`;
      if (!o.id) bad(w, 'empty id');
      else if (seen.has(o.id)) bad(w, 'id used twice by one owner');
      seen.add(o.id);
      if (!o.text) bad(w, 'empty text');
      if (o.price !== undefined && !quadrans(o.price)) bad(w, `price ${o.price}: must be above 0 in whole quadrantes (1/64)`);
      gate(w, o.gate);
      if (o.needs) {
        gate(w, o.needs.gate);
        if (!o.needs.why) bad(w, 'needs: empty why');
      }
      if (!Array.isArray(o.effects)) bad(w, 'effects must be a list');
      for (const e of o.effects ?? []) effect(w, e);
      if (typeof o.result === 'string' ? !o.result : Array.isArray(o.result) && !o.result.length) bad(w, 'empty result');
    }
  };
  const unique = (lane: string, prefix: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id.startsWith(prefix) || id.length <= prefix.length) bad(`${lane} ${id || '(no id)'}`, `id must start with '${prefix}'`);
      if (seen.has(id)) bad(`${lane} ${id}`, 'id used twice');
      seen.add(id);
    }
  };

  // ---- ids
  unique('keeper', 'keeper-', data.keepers.map((k) => k.id));
  unique('activity', 'act.', data.activities.map((a) => a.id));
  unique('recipe', 'rec.', data.recipes.map((r) => r.id));
  unique('wager', 'wgr.', data.wagers.map((w) => w.id));
  unique('rumour', 'rum.', data.rumours.map((r) => r.id));
  const wagerIds = new Set(data.wagers.map((w) => w.id));
  const boards = new Set<string>(BOARDS);
  for (const a of data.activities) if (a.board) boards.add(a.board);

  // ---- keepers
  const posts = new Map<string, string>();
  const ownStations = new Set<string>();
  for (const k of data.keepers) keeper(k);
  function keeper(k: KeeperDef) {
    const w = `keeper ${k.id}`;
    if (refs.npcs?.has(k.id)) bad(w, 'id is already a named NPC');
    if (!has(refs.districts, k.district)) bad(w, `unknown district '${k.district}'`);
    let st: StationDef | undefined;
    if (typeof k.station === 'string') {
      st = refs.stations?.get(k.station);
      if (refs.stations && !st) bad(w, `unknown station '${k.station}'`);
    } else {
      st = k.station;
      if (!st.id.startsWith('st-life-')) bad(w, `new station '${st.id}' must start with 'st-life-'`);
      if (refs.stations?.has(st.id)) bad(w, `new station '${st.id}' already exists`);
      if (ownStations.has(st.id)) bad(w, `new station '${st.id}' defined twice`);
      ownStations.add(st.id);
      if (!st.members?.length) bad(w, `station '${st.id}' has no members`);
      if (!st.when?.length) bad(w, `station '${st.id}' has no hours ('when')`);
      for (const d of st.dressing ?? []) if (!DRESSING_KINDS.has(d.kind)) bad(w, `unknown dressing '${d.kind}'`);
    }
    const m = k.member ?? 0;
    if (st && !(Number.isInteger(m) && m >= 0 && m < st.members.length)) bad(w, `member ${m}: station '${st.id}' has ${st.members.length} members`);
    const post = postKey(k);
    if (posts.has(post)) bad(w, `post ${post} is already claimed by ${posts.get(post)}`);
    posts.set(post, k.id);
    if (!k.name) bad(w, 'empty name');
    if (!k.title) bad(w, 'empty title');
    if (REAL_SPEAKERS.test(k.name)) bad(w, `'${k.name}' is a real person: real people never speak`);
    if (k.shop) {
      if (!has(refs.vendors, k.shop.vendor)) bad(w, `unknown vendor kind '${k.shop.vendor}'`);
      if (!k.shop.stock?.length) bad(w, 'a shop with no stock');
      for (const s of k.shop.stock ?? []) {
        item(w, s.id);
        if (!(Number.isInteger(s.count) && s.count >= 1)) bad(w, `stock ${s.id}: count must be a whole number ≥ 1`);
      }
      if (k.shop.purse !== undefined && !(k.shop.purse > 0)) bad(w, 'purse must be above 0');
    }
    if (!k.talk?.greet) bad(w, 'talk: no greeting');
    if ((k.talk?.topics?.length ?? 0) < 2) bad(w, `talk: ${k.talk?.topics?.length ?? 0} topics (at least 2)`);
    options(w, k.services);
    for (const j of k.jobs ?? []) quest(w, j);
    if (k.bench && !BENCHES.has(k.bench)) bad(w, `unknown bench '${k.bench}'`);
    if (k.wager && !wagerIds.has(k.wager)) bad(w, `unknown wager '${k.wager}'`);
    for (const d of k.closed ?? []) if (!DRESSING_KINDS.has(d.kind)) bad(w, `unknown closed dressing '${d.kind}'`);
    if (!k.period) bad(w, 'no period (sources and confidence)');
  }

  // ---- services for existing people
  const served = new Set<string>();
  for (const s of data.services) serviceSet(s);
  function serviceSet(s: ServiceSet) {
    const w = `services ${s.npc}`;
    if (!has(refs.npcs, s.npc)) bad(w, `unknown NPC '${s.npc}'`);
    if (served.has(s.npc)) bad(w, 'two service sets for one NPC');
    served.add(s.npc);
    if (REAL_SPEAKERS.test(s.npc)) bad(w, 'a real person: real people never speak');
    options(w, s.services);
    for (const j of s.jobs ?? []) quest(w, j);
    if (s.bench && !BENCHES.has(s.bench)) bad(w, `unknown bench '${s.bench}'`);
    if (s.wager && !wagerIds.has(s.wager)) bad(w, `unknown wager '${s.wager}'`);
    if (s.npc === EUHODUS) {
      // Euhodus is protected (coniuratio-masked): he mends arms and nothing else.
      const effects = (s.services ?? []).flatMap((o) => o.effects);
      if (s.jobs?.length || s.bench || s.wager || !effects.length || effects.some((e) => e.kind !== 'repair')) bad(w, 'Euhodus gets the repair choice only (Appendix A.5)');
    }
  }

  // ---- things
  for (const a of data.activities) activity(a);
  function activity(a: ActivityDef) {
    const w = `activity ${a.id}`;
    if (!a.name) bad(w, 'empty name');
    if (!a.verb) bad(w, 'empty verb');
    const at = a.at;
    if ('place' in at) {
      if (!at.place) bad(w, 'at.place is empty');
    } else if ('landmarkSpot' in at) {
      if (!at.landmarkSpot) bad(w, 'at.landmarkSpot is empty');
    } else if ('streetSpots' in at) {
      if (at.streetSpots !== 'fountain') bad(w, `unknown street spot kind '${String(at.streetSpots)}'`);
      if (at.max !== undefined && !(at.max >= 1 && at.max <= 12)) bad(w, 'streetSpots.max must be 1–12');
    } else if ('station' in at) {
      const st = refs.stations?.get(at.station) ?? data.keepers.map((k) => k.station).find((s): s is StationDef => typeof s !== 'string' && s.id === at.station);
      if (refs.stations && !st) bad(w, `unknown station '${at.station}'`);
      else if (st && !st.dressing?.[at.dressing]) bad(w, `station '${at.station}' has no dressing #${at.dressing}`);
    } else bad(w, 'at: give a place, landmarkSpot, streetSpots or station');
    if (a.reach !== undefined && !(a.reach > 0 && a.reach <= 8)) bad(w, 'reach must be above 0 and at most 8');
    gate(w, a.gate);
    hours(w, a.open);
    options(w, a.options);
    if (a.board !== undefined && !a.board.startsWith('board-')) bad(w, `board '${a.board}' must start with 'board-'`);
    if (!a.options?.length && !a.board) bad(w, 'nothing to do: give options or a board');
    if (!a.period) bad(w, 'no period (sources and confidence)');
  }

  // ---- crafting and games
  for (const r of data.recipes) recipe(r);
  function recipe(r: Recipe) {
    const w = `recipe ${r.id}`;
    if (!BENCHES.has(r.bench)) bad(w, `unknown bench '${r.bench}'`);
    else if (!r.id.startsWith(`rec.${r.bench}.`)) bad(w, `id must start with 'rec.${r.bench}.'`);
    if (!r.name) bad(w, 'empty name');
    if (r.skill && !has(refs.skills, r.skill)) bad(w, `unknown skill '${r.skill}'`);
    if (!(r.minLevel >= 0 && r.minLevel <= 100)) bad(w, 'minLevel must be 0–100');
    if (!r.inputs?.length) bad(w, 'no inputs');
    for (const i of r.inputs ?? []) {
      item(w, i.item);
      if (!(Number.isInteger(i.count) && i.count >= 1)) bad(w, `input ${i.item}: count must be a whole number ≥ 1`);
    }
    item(w, r.output?.item);
    if (!(Number.isInteger(r.output?.count) && r.output.count >= 1)) bad(w, 'output count must be a whole number ≥ 1');
    if (r.inputs?.some((i) => i.item === r.output?.item)) bad(w, `the output '${r.output.item}' is one of its inputs`);
    if (!(r.hours > 0 && r.hours <= 24)) bad(w, 'hours must be above 0 and at most 24');
    if (!(r.xp >= 0)) bad(w, 'xp must be 0 or more');
    if (!r.period) bad(w, 'no period (sources and confidence)');
  }
  for (const g of data.wagers) wager(g);
  function wager(g: WagerDef) {
    const w = `wager ${g.id}`;
    if (g.game !== 'tali' && g.game !== 'munus') bad(w, `unknown game '${String(g.game)}'`);
    else if (!g.id.startsWith(`wgr.${g.game}.`)) bad(w, `id must start with 'wgr.${g.game}.'`);
    if (!(g.stakes?.length >= 1 && g.stakes.length <= 4)) bad(w, 'give 1–4 stakes');
    for (const s of g.stakes ?? []) if (!quadrans(s)) bad(w, `stake ${s}: must be above 0 in whole quadrantes (1/64)`);
    if (!quadrans(g.bank)) bad(w, `bank ${g.bank}: must be above 0 in whole quadrantes (1/64)`);
    if (g.watchRadius !== undefined && !(g.watchRadius > 0)) bad(w, 'watchRadius must be above 0');
    if (g.odds !== undefined && !(g.odds > 1)) bad(w, 'odds must be above 1');
    if (!g.period) bad(w, 'no period (sources and confidence)');
  }

  // ---- the city's voice
  for (const r of data.rumours) rumour(r);
  function rumour(r: RumourDef) {
    const w = `rumour ${r.id}`;
    if (r.kind !== 'talk' && r.kind !== 'cry' && r.kind !== 'notice') bad(w, `unknown kind '${String(r.kind)}'`);
    const max = r.kind === 'notice' ? 400 : 280;
    if (!r.text) bad(w, 'empty text');
    else if (r.text.length > max) bad(w, `text is ${r.text.length} characters (${r.kind} at most ${max})`);
    for (const d of r.districts ?? []) if (!has(refs.districts, d)) bad(w, `unknown district '${d}'`);
    for (const b of r.boards ?? []) if (!boards.has(b)) bad(w, `unknown board '${b}'`);
    if (r.boards && r.kind !== 'notice') bad(w, 'only notices go on boards');
    gate(w, r.gate);
    if (r.hook !== undefined) quest(w, r.hook);
    if (r.weight !== undefined && !(r.weight > 0)) bad(w, 'weight must be above 0');
  }

  // ---- history and story (§3.6): every text in the data, functions aside
  const lanes: [string, readonly { id?: string; npc?: string }[]][] = [
    ['keeper', data.keepers],
    ['services', data.services],
    ['activity', data.activities],
    ['recipe', data.recipes],
    ['wager', data.wagers],
    ['rumour', data.rumours],
  ];
  for (const [lane, entries] of lanes) {
    for (const e of entries) {
      const w = `${lane} ${e.id ?? e.npc ?? '?'}`;
      walkStrings(e, (s) => {
        for (const msg of lintText(s)) bad(w, `${msg}: “${clip(s)}”`);
        if (HERMOGENES.test(s)) bad(w, 'Hermogenes is protected until mq-06: he never appears in life data');
        if (s.includes(EUHODUS) && lane !== 'services') bad(w, 'Euhodus appears only in his own repair service set');
      });
    }
  }
  return out;
}

/** Call `fn` for every string under a value (objects and arrays; functions are skipped). */
export function walkStrings(v: unknown, fn: (s: string) => void, depth = 0) {
  if (depth > 12 || v === null || v === undefined) return;
  if (typeof v === 'string') fn(v);
  else if (Array.isArray(v)) for (const x of v) walkStrings(x, fn, depth + 1);
  else if (typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walkStrings(x, fn, depth + 1);
}

function clip(s: string): string {
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}
