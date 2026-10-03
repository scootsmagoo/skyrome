/**
 * Quest engine (game.quests). Quest definitions are TypeScript modules in ./content (discovered
 * by glob); their logic is event handlers. Only state is saved: status, stage, objective counts,
 * vars, journal, plus the global flags and the tracked quest.
 *
 * Handlers are subscribed per quest status: `triggers` while a quest has not started (and after
 * completion for `repeatable` quests), `on` while it runs (and before it starts with
 * `listenBeforeStart`). A handler error is logged and never breaks other quests.
 *
 * Files whose name starts with '_' are examples/dev content, loaded only with includeExamples.
 */
import { Vector3 } from 'three';
import type { GameEvents } from '../core/Events';
import type { Game } from '../core/Game';
import { skillXpToNext } from '../rpg/sheet';
import type { LocationDef, NpcDef } from '../npc/types';
import '../rpg/events';
import type { ItemDef } from '../rpg/types';
import { GlobalFlags, type FlagValue } from './flags';
import type { MarkerTarget, ObjectiveDef, QuestCategory, QuestContext, QuestDef, Reward } from './types';

declare module '../core/Game' {
  interface Game {
    quests: QuestSystem;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    'quest:tracked': { questId: string | null };
  }
}

export type QuestStatus = 'inactive' | 'running' | 'completed' | 'failed';

export interface ObjectiveState {
  count: number;
  done: boolean;
  revealed: boolean;
  /** Belongs to the current stage. */
  active: boolean;
}

export interface JournalEntry {
  stage: string;
  text: string;
  /** Game hours (GameTime.totalHours) when written. */
  hours: number;
}

export interface QuestState {
  status: QuestStatus;
  stage: string;
  objectives: Record<string, ObjectiveState>;
  vars: Record<string, FlagValue>;
  journal: JournalEntry[];
  startedAt?: number;
  endedAt?: number;
}

export interface ObjectiveView {
  id: string;
  text: string;
  count: number;
  needed: number;
  done: boolean;
  optional: boolean;
  /** Part of the current stage (inactive ones are history). */
  active: boolean;
  target?: MarkerTarget;
}

export interface QuestView {
  id: string;
  title: string;
  latin?: string;
  category: QuestCategory;
  summary: string;
  giver?: string;
  status: Exclude<QuestStatus, 'inactive'>;
  stage: string;
  tracked: boolean;
  journal: readonly JournalEntry[];
  /** Revealed objectives, current stage first. */
  objectives: ObjectiveView[];
}

export interface QuestMarker {
  questId: string;
  objectiveId: string;
  text: string;
  target: MarkerTarget;
  position: Vector3;
}

export interface QuestSummary {
  stage: string;
  running: boolean;
  /** Finished, successfully or not. */
  done: boolean;
  failed: boolean;
  completed: boolean;
}

export interface QuestSystemOptions {
  /** Explicit definitions (tests). Default: everything in ./content. */
  defs?: readonly QuestDef[];
  /** Load '_'-prefixed example files from ./content (dev scenes). */
  includeExamples?: boolean;
  flags?: GlobalFlags;
}

type Resolver = (t: MarkerTarget) => Vector3 | null;

/**
 * A quest content module: default-exports the quest(s); may also export the quest items,
 * locations and NPCs it needs (`items`, `locations`, `npcs`), which installRpg registers.
 */
export interface QuestModule {
  default?: QuestDef | QuestDef[];
  items?: ItemDef[];
  locations?: LocationDef[];
  npcs?: NpcDef[];
}

/** Quest modules from ./content. Underscore files are examples. */
export function questModules(includeExamples = false): QuestModule[] {
  const mods = import.meta.glob<QuestModule>('./content/*.ts', { eager: true });
  return Object.entries(mods)
    .filter(([path]) => includeExamples || !path.split('/').pop()!.startsWith('_'))
    .map(([, m]) => m);
}

export function loadQuestContent(includeExamples = false): QuestDef[] {
  return questModules(includeExamples).flatMap((m) => (m.default ? (Array.isArray(m.default) ? m.default : [m.default]) : []));
}

export class QuestSystem {
  readonly flags: GlobalFlags;
  private readonly defs = new Map<string, QuestDef>();
  private readonly states = new Map<string, QuestState>();
  private readonly contexts = new Map<string, QuestContext>();
  private readonly subs = new Map<string, (() => void)[]>();
  private readonly stageGen = new Map<string, number>();
  /** Saved states of quests whose definitions are missing (kept so they survive a resave). */
  private orphans: Record<string, QuestState> = {};
  private _tracked: string | null = null;
  private readonly resolvers = new Map<MarkerTarget['kind'], Resolver>();

  /**
   * Where a marker points. Default: registered resolvers by kind, then 'point' directly,
   * 'location' via game.locations and 'npc' via game.actors. Replace or use registerResolver().
   */
  resolveTarget: Resolver = (t) => this.defaultResolve(t);
  /** Applies rewards. Default: game.player.sheet/inventory and game.factions when present. */
  rewardHandler: (r: Reward, questId: string) => void = (r, id) => this.defaultReward(r, id);

  constructor(
    readonly game: Game,
    opts: QuestSystemOptions = {},
  ) {
    this.flags = opts.flags ?? new GlobalFlags(game.events);
    for (const d of opts.defs ?? loadQuestContent(opts.includeExamples)) this.register(d);
  }

  // ---------------------------------------------------------------- registry

  register(def: QuestDef) {
    if (this.defs.has(def.id)) console.warn(`[quests] "${def.id}" registered twice; the last one wins`);
    if (!def.stages.start) console.warn(`[quests] "${def.id}" has no 'start' stage`);
    this.defs.set(def.id, def);
    if (!this.states.has(def.id)) {
      const orphan = this.orphans[def.id];
      this.states.set(def.id, orphan ? sanitizeState(orphan, def) : blankState());
      delete this.orphans[def.id];
    }
    this.subscribe(def.id);
  }

  get(id: string): QuestDef | undefined {
    return this.defs.get(id);
  }

  all(): QuestDef[] {
    return [...this.defs.values()];
  }

  state(id: string): QuestState | undefined {
    return this.states.get(id);
  }

  status(id: string): QuestSummary | undefined {
    const s = this.states.get(id);
    if (!s) return undefined;
    return { stage: s.stage, running: s.status === 'running', done: s.status === 'completed' || s.status === 'failed', failed: s.status === 'failed', completed: s.status === 'completed' };
  }

  /** The handler-facing context for a quest. */
  context(id: string): QuestContext {
    let c = this.contexts.get(id);
    if (!c) {
      const def = this.defs.get(id);
      if (!def) throw new Error(`[quests] unknown quest "${id}"`);
      c = this.makeContext(def);
      this.contexts.set(id, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- lifecycle

  /** Reset every quest and flag, then start autoStart quests. */
  newGame() {
    for (const id of this.defs.keys()) this.states.set(id, blankState());
    this.orphans = {};
    this.flags.clear();
    this._tracked = null;
    for (const id of this.defs.keys()) this.subscribe(id);
    for (const d of this.defs.values()) if (d.autoStart) this.start(d.id);
  }

  start(id: string, stage = 'start'): boolean {
    const def = this.defs.get(id);
    let st = this.states.get(id);
    if (!def || !st) return warn(`start: unknown quest "${id}"`);
    if (st.status === 'running') return false;
    if (st.status !== 'inactive') {
      if (!def.repeatable) return false;
      st = blankState();
      this.states.set(id, st);
    }
    if (!def.stages[stage]) return warn(`start: quest "${id}" has no stage "${stage}"`);
    st.status = 'running';
    st.startedAt = this.hours();
    this.subscribe(id);
    this.game.events.emit('quest:started', { questId: id });
    this.notify(`Quest started: ${def.title}`);
    if (!this._tracked || def.category === 'main') this.track(id);
    this.enterStage(id, stage);
    return true;
  }

  /** Move to a stage (starting the quest if needed). */
  setStage(id: string, stage: string): boolean {
    const st = this.states.get(id);
    if (!st) return warn(`setStage: unknown quest "${id}"`);
    if (st.status === 'inactive') return this.start(id, stage);
    if (st.status !== 'running') return false;
    return this.enterStage(id, stage);
  }

  complete(id: string) {
    this.finish(id, 'completed');
  }

  fail(id: string) {
    this.finish(id, 'failed');
  }

  private enterStage(id: string, stage: string): boolean {
    const def = this.defs.get(id)!;
    const st = this.states.get(id)!;
    const sdef = def.stages[stage];
    if (!sdef) return warn(`quest "${id}" has no stage "${stage}"`);
    const gen = (this.stageGen.get(id) ?? 0) + 1;
    this.stageGen.set(id, gen);
    st.stage = stage;
    if (sdef.journal) st.journal.push({ stage, text: sdef.journal, hours: this.hours() });
    for (const o of Object.values(st.objectives)) o.active = false;
    for (const od of sdef.objectives ?? []) {
      const os = (st.objectives[od.id] ??= { count: 0, done: false, revealed: !od.hidden, active: true });
      os.active = true;
      if (!od.hidden) os.revealed = true;
    }
    this.game.events.emit('quest:stage', { questId: id, stage });
    if (sdef.onEnter) {
      try {
        sdef.onEnter(this.context(id));
      } catch (err) {
        console.error(`[quests] ${id} stage "${stage}" onEnter threw`, err);
      }
    }
    // onEnter may have moved on to another stage or ended the quest.
    if (this.stageGen.get(id) !== gen || st.status !== 'running') return true;
    if (sdef.end === 'complete') this.complete(id);
    else if (sdef.end === 'fail') this.fail(id);
    else this.checkAdvance(id);
    return true;
  }

  private finish(id: string, status: 'completed' | 'failed') {
    const def = this.defs.get(id);
    const st = this.states.get(id);
    if (!def || !st || st.status !== 'running') return;
    st.status = status;
    st.endedAt = this.hours();
    for (const o of Object.values(st.objectives)) o.active = false;
    this.subscribe(id);
    if (status === 'completed') {
      if (def.rewards) this.giveReward(def.rewards, id);
      this.game.events.emit('quest:completed', { questId: id });
      this.notify(`Quest completed: ${def.title}`);
    } else {
      this.game.events.emit('quest:failed', { questId: id });
      this.notify(`Quest failed: ${def.title}`);
    }
    if (this._tracked === id) this.track(this.running()[0]?.id ?? null);
  }

  // ---------------------------------------------------------------- objectives

  objectiveDef(id: string, objectiveId: string): ObjectiveDef | undefined {
    const def = this.defs.get(id);
    if (!def) return undefined;
    const st = this.states.get(id);
    const cur = st && def.stages[st.stage]?.objectives?.find((o) => o.id === objectiveId);
    if (cur) return cur;
    for (const s of Object.values(def.stages)) {
      const o = s.objectives?.find((x) => x.id === objectiveId);
      if (o) return o;
    }
    return undefined;
  }

  /** Advance an objective; returns true on the call that completes it. */
  progress(id: string, objectiveId: string, amount = 1): boolean {
    const st = this.states.get(id);
    const od = this.objectiveDef(id, objectiveId);
    if (!st || !od) return warn(`progress: unknown objective "${id}/${objectiveId}"`);
    if (st.status === 'completed' || st.status === 'failed') return false;
    const os = (st.objectives[objectiveId] ??= { count: 0, done: false, revealed: !od.hidden, active: false });
    if (os.done) return false;
    const need = od.count ?? 1;
    os.count = Math.max(0, Math.min(need, os.count + amount));
    if (os.count >= need) {
      os.done = true;
      this.game.events.emit('quest:objective', { questId: id, objectiveId, done: true });
      this.checkAdvance(id);
      return true;
    }
    this.game.events.emit('quest:objective', { questId: id, objectiveId, done: false });
    return false;
  }

  completeObjective(id: string, objectiveId: string) {
    const od = this.objectiveDef(id, objectiveId);
    if (od) this.progress(id, objectiveId, od.count ?? 1);
  }

  isObjectiveDone(id: string, objectiveId: string): boolean {
    return !!this.states.get(id)?.objectives[objectiveId]?.done;
  }

  reveal(id: string, objectiveId: string) {
    const st = this.states.get(id);
    const od = this.objectiveDef(id, objectiveId);
    if (!st || !od) return;
    const os = (st.objectives[objectiveId] ??= { count: 0, done: false, revealed: true, active: false });
    if (os.revealed) return;
    os.revealed = true;
    this.game.events.emit('quest:objective', { questId: id, objectiveId, done: os.done });
  }

  /** A stage with `next` advances when all its required objectives are done. */
  private checkAdvance(id: string) {
    const def = this.defs.get(id);
    const st = this.states.get(id);
    if (!def || !st || st.status !== 'running') return;
    const sdef = def.stages[st.stage];
    if (!sdef?.next) return;
    const required = (sdef.objectives ?? []).filter((o) => !o.optional);
    if (required.every((o) => st.objectives[o.id]?.done)) this.setStage(id, sdef.next);
  }

  // ---------------------------------------------------------------- rewards & flags

  giveReward(r: Reward, questId = '') {
    try {
      this.rewardHandler(r, questId);
    } catch (err) {
      console.error(`[quests] reward for "${questId}" failed`, err);
    }
  }

  private defaultReward(r: Reward, _questId: string) {
    const sheet = this.game.player?.sheet;
    const inv = this.game.player?.inventory;
    const parts: string[] = [];
    if (r.denarii) {
      inv?.addDenarii(r.denarii);
      parts.push(`${r.denarii} denarii`);
    }
    for (const it of r.items ?? []) {
      inv?.add(it.id, it.count ?? 1, { source: 'quest' });
      parts.push(`${this.game.items?.get(it.id)?.name ?? it.id}${(it.count ?? 1) > 1 ? ` ×${it.count}` : ''}`);
    }
    for (const s of r.skills ?? []) sheet?.useSkill(s.id, s.amount);
    // One level's worth of XP per entry (§5.1), at the level the skill has when it lands.
    for (const e of r.skillXp ?? []) {
      const { id, levels = 1 } = typeof e === 'string' ? { id: e } : e;
      for (let i = 0; i < levels && sheet; i++) sheet.useSkill(id, skillXpToNext(sheet.baseSkillLevel(id), sheet.skillDef(id)?.difficulty) + 1e-6);
    }
    for (const f of r.reputation ?? []) this.game.factions?.addReputation(f.faction, f.amount);
    if (r.rank) {
      const f = this.game.factions;
      if (r.rank.rank) f?.grantRank(r.rank.faction, r.rank.rank);
      else f?.promote(r.rank.faction);
    }
    if (r.xp) sheet?.addXp(r.xp);
    if (parts.length) this.game.events.emit('rpg:notify', { text: `Received ${parts.join(', ')}`, kind: 'item' });
  }

  private notify(text: string) {
    this.game.events.emit('rpg:notify', { text, kind: 'quest' });
  }

  // ---------------------------------------------------------------- tracking & markers

  get tracked(): string | null {
    return this._tracked;
  }

  /** Track a running quest on the compass (null clears). */
  track(id: string | null) {
    if (id !== null && this.states.get(id)?.status !== 'running') return;
    if (this._tracked === id) return;
    this._tracked = id;
    this.game.events.emit('quest:tracked', { questId: id });
  }

  registerResolver(kind: MarkerTarget['kind'], fn: Resolver) {
    this.resolvers.set(kind, fn);
  }

  private defaultResolve(t: MarkerTarget): Vector3 | null {
    const custom = this.resolvers.get(t.kind);
    if (custom) {
      const v = custom(t);
      if (v) return v;
    }
    switch (t.kind) {
      case 'point':
        return new Vector3(t.x, t.y, t.z);
      case 'location': {
        const l = this.game.locations?.get(t.id);
        return l ? new Vector3(l.position.x, l.position.y ?? 0, l.position.z) : null;
      }
      case 'npc': {
        const a = this.game.actors?.get(t.id);
        return a ? a.position.clone() : null;
      }
      default:
        return null;
    }
  }

  /** Active, revealed, unfinished objectives with resolvable targets (tracked quest, or all running). */
  markers(opts: { all?: boolean } = {}): QuestMarker[] {
    const ids = opts.all ? this.running().map((d) => d.id) : this._tracked ? [this._tracked] : [];
    const out: QuestMarker[] = [];
    for (const id of ids) {
      for (const o of this.objectives(id)) {
        if (!o.active || o.done || !o.target) continue;
        const position = this.resolveTarget(o.target);
        if (position) out.push({ questId: id, objectiveId: o.id, text: o.text, target: o.target, position });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- views (journal / HUD)

  running(): QuestDef[] {
    return this.all().filter((d) => this.states.get(d.id)?.status === 'running');
  }

  /** Revealed objectives of a quest, current stage first, in definition order. */
  objectives(id: string): ObjectiveView[] {
    const def = this.defs.get(id);
    const st = this.states.get(id);
    if (!def || !st) return [];
    const seen = new Set<string>();
    const ordered: ObjectiveDef[] = [];
    for (const o of def.stages[st.stage]?.objectives ?? []) if (!seen.has(o.id)) (seen.add(o.id), ordered.push(o));
    for (const s of Object.values(def.stages)) for (const o of s.objectives ?? []) if (!seen.has(o.id) && st.objectives[o.id]) (seen.add(o.id), ordered.push(o));
    const out: ObjectiveView[] = [];
    for (const o of ordered) {
      const os = st.objectives[o.id];
      if (!os?.revealed) continue;
      out.push({ id: o.id, text: o.text, count: os.count, needed: o.count ?? 1, done: os.done, optional: !!o.optional, active: os.active && st.status === 'running', target: o.target });
    }
    return out;
  }

  /** Started quests for the journal: running (tracked first), then completed, then failed. */
  list(): QuestView[] {
    const order: Record<QuestStatus, number> = { running: 0, completed: 1, failed: 2, inactive: 3 };
    const out: QuestView[] = [];
    for (const def of this.defs.values()) {
      const st = this.states.get(def.id)!;
      if (st.status === 'inactive') continue;
      out.push({ id: def.id, title: def.title, latin: def.latin, category: def.category, summary: def.summary, giver: def.giver, status: st.status, stage: st.stage, tracked: this._tracked === def.id, journal: st.journal, objectives: this.objectives(def.id) });
    }
    return out.sort((a, b) => Number(b.tracked) - Number(a.tracked) || order[a.status] - order[b.status] || (this.states.get(b.id)!.startedAt ?? 0) - (this.states.get(a.id)!.startedAt ?? 0));
  }

  // ---------------------------------------------------------------- persistence

  serialize() {
    const states: Record<string, QuestState> = { ...this.orphans };
    for (const [id, s] of this.states) if (s.status !== 'inactive' || Object.keys(s.vars).length || Object.keys(s.objectives).length) states[id] = structuredClone(s);
    return { version: 1, states, flags: this.flags.serialize(), tracked: this._tracked };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as { states?: Record<string, QuestState>; flags?: unknown; tracked?: string | null };
    this.orphans = {};
    for (const id of this.defs.keys()) this.states.set(id, blankState());
    for (const [id, s] of Object.entries(d.states ?? {})) {
      const def = this.defs.get(id);
      if (def) this.states.set(id, sanitizeState(s, def));
      else if (s && typeof s === 'object') this.orphans[id] = s;
    }
    this.flags.restore(d.flags);
    for (const id of this.defs.keys()) this.subscribe(id);
    this._tracked = typeof d.tracked === 'string' && this.states.get(d.tracked)?.status === 'running' ? d.tracked : null;
    this.game.events.emit('quest:tracked', { questId: this._tracked });
  }

  dispose() {
    for (const id of [...this.subs.keys()]) this.unsubscribe(id);
  }

  // ---------------------------------------------------------------- internals

  private hours(): number {
    return this.game.time?.totalHours ?? 0;
  }

  private unsubscribe(id: string) {
    for (const off of this.subs.get(id) ?? []) off();
    this.subs.delete(id);
  }

  private subscribe(id: string) {
    this.unsubscribe(id);
    const def = this.defs.get(id);
    const st = this.states.get(id);
    if (!def || !st) return;
    const list: (() => void)[] = [];
    const triggersLive = (s: QuestStatus) => s === 'inactive' || (!!def.repeatable && (s === 'completed' || s === 'failed'));
    const onLive = (s: QuestStatus) => s === 'running' || (s === 'inactive' && !!def.listenBeforeStart);
    const bind = (map: QuestDef['triggers'], live: (s: QuestStatus) => boolean) => {
      for (const [type, fn] of Object.entries(map ?? {})) {
        if (typeof fn !== 'function') continue;
        list.push(
          this.game.events.on(type as keyof GameEvents, (e: unknown) => {
            // The bus iterates a snapshot, so re-check: an earlier listener may have changed status.
            const now = this.states.get(id)?.status;
            if (!now || !live(now)) return;
            try {
              (fn as (q: QuestContext, e: unknown) => void)(this.context(id), e);
            } catch (err) {
              console.error(`[quests] ${id} handler for "${type}" threw`, err);
            }
          }),
        );
      }
    };
    if (triggersLive(st.status)) bind(def.triggers, triggersLive);
    if (onLive(st.status)) bind(def.on, onLive);
    this.subs.set(id, list);
  }

  private makeContext(def: QuestDef): QuestContext {
    const sys = this;
    const id = def.id;
    const st = () => sys.states.get(id)!;
    return {
      get game() {
        return sys.game;
      },
      def,
      get stage() {
        return st().stage;
      },
      get running() {
        return st().status === 'running';
      },
      get done() {
        return st().status === 'completed' || st().status === 'failed';
      },
      get vars() {
        return st().vars;
      },
      start: (stage?: string) => void sys.start(id, stage),
      setStage: (stage: string) => void sys.setStage(id, stage),
      progress: (o: string, amount?: number) => sys.progress(id, o, amount),
      completeObjective: (o: string) => sys.completeObjective(id, o),
      isObjectiveDone: (o: string) => sys.isObjectiveDone(id, o),
      reveal: (o: string) => sys.reveal(id, o),
      complete: () => sys.complete(id),
      fail: () => sys.fail(id),
      giveReward: (r: Reward) => sys.giveReward(r, id),
      quest: (other: string) => sys.status(other),
      flag: (name: string) => sys.flags.get(name),
      setFlag: (name: string, value: FlagValue) => sys.flags.set(name, value),
      notify: (text: string) => sys.notify(text),
    };
  }
}

function blankState(): QuestState {
  return { status: 'inactive', stage: '', objectives: {}, vars: {}, journal: [] };
}

/** Accept a saved state defensively: unknown stages fall back, bad fields are dropped. */
function sanitizeState(raw: unknown, def: QuestDef): QuestState {
  const s = (raw ?? {}) as Partial<QuestState>;
  const status: QuestStatus = s.status === 'running' || s.status === 'completed' || s.status === 'failed' ? s.status : 'inactive';
  let stage = typeof s.stage === 'string' ? s.stage : '';
  if (status === 'running' && !def.stages[stage]) {
    console.warn(`[quests] saved stage "${stage}" of "${def.id}" no longer exists; restarting at 'start'`);
    stage = 'start';
  }
  // Objective flags are re-derived from the definitions where possible: visible unless hidden,
  // active when part of the current stage of a running quest.
  const defs = new Map<string, ObjectiveDef>();
  for (const st of Object.values(def.stages)) for (const o of st.objectives ?? []) if (!defs.has(o.id)) defs.set(o.id, o);
  const current = new Set((def.stages[stage]?.objectives ?? []).map((o) => o.id));
  const objectives: Record<string, ObjectiveState> = {};
  for (const [k, o] of Object.entries(s.objectives ?? {})) {
    const od = defs.get(k);
    if (!o || typeof o !== 'object' || !od) continue;
    const count = Math.max(0, Math.min(od.count ?? 1, Number(o.count) || 0));
    objectives[k] = { count, done: !!o.done || count >= (od.count ?? 1), revealed: !!o.revealed || !od.hidden, active: status === 'running' && current.has(k) };
  }
  if (status === 'running') for (const id of current) objectives[id] ??= { count: 0, done: false, revealed: !defs.get(id)!.hidden, active: true };
  const vars: Record<string, FlagValue> = {};
  for (const [k, v] of Object.entries(s.vars ?? {})) if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') vars[k] = v;
  const journal = (Array.isArray(s.journal) ? s.journal : []).filter((j) => j && typeof j.text === 'string').map((j) => ({ stage: String(j.stage ?? ''), text: j.text, hours: Number(j.hours) || 0 }));
  return { status, stage, objectives, vars, journal, startedAt: num(s.startedAt), endedAt: num(s.endedAt) };
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function warn(msg: string): false {
  console.warn(`[quests] ${msg}`);
  return false;
}
