/**
 * Jobs (docs/design/world-life.md §4.7, §3.2): paid work a keeper or a named person offers again
 * and again — amphorae at the river port, the bread round, a patron's letter, a practice bout.
 * `defineJob(def)` turns a JobDef into a QuestDef (category 'radiant', repeatable) and registers it
 * with the conversations (talk.ts `registerJob`): its giver offers it ("Any work going?") while it
 * can be offered, and the people its steps end with take the delivery in their own talk.
 *
 *   stages   'start' is the first step (with `variants`: a short opening that picks the variant),
 *            's:<step>' and 'v<k>:<step>' are the others, then 'done' (paid) or 'failed'
 *   steps    { talk } and { deliver } end in that person's talk (talk.ts emits 'life:option'
 *            `job:<job>:<step>`); { reach } on entering a location; { use } on an activity's option
 *   goods    a step's `give` is handed over as the step starts; what is left is taken back at the end
 *   daily    counted in the life save when the job starts (`store.today('job:<id>')`); offers stop
 *            at `def.daily`, and nothing is offered before the opening is done (STORY rule 2)
 *   variant  picked by the day the job starts (the same all day and through a save), kept for the
 *            whole job, past midnight too
 *   expiry   `limitHours` after the start, or the next `until` Roman hour (the bread round's h3);
 *            runtime.ts checks it at 2 Hz and the job fails cleanly with a journal line
 *
 * A step whose person isn't in this build (another crew's keeper not merged yet) or is dead, or
 * whose activity or place doesn't exist, is skipped, so a job never waits for someone who won't come.
 * The tracker is the QuestSystem's: a job never takes it from a running main quest.
 */
import { at, type RomanHour, hoursUntil } from '../../content/hours';
import type { Game } from '../../core/Game';
import type { QuestContext, QuestDef, QuestStageDef } from '../../quests/types';
import { priceText } from '../effects';
import { passes, questDone } from '../gates';
import { hash32, OPENING } from '../rumours';
import { jobRuntimes, registerJob } from '../talk';
import type { JobDef, JobStep } from '../types';

/** What a job adds beyond the JobDef contract. */
export interface JobExt {
  /** The first journal line of a job with variants (the steps' own lines follow). */
  intro?: string;
  /** Journal lines at the end: paid, or failed (too late). First person, past tense. */
  done?: string;
  failed?: string;
  /** Fail cleanly when the clock next reaches this Roman hour mark (the bread round: h3). */
  until?: RomanHour;
  /** The pay when it isn't `def.pay` (by variant; a purse), in denarii. */
  pay?: (q: QuestContext) => number;
  /** Extra stages (the practice bout's fight) and handlers while the job runs. */
  stages?: Record<string, QuestStageDef>;
  on?: QuestDef['on'];
  /** Runs as the job ends in 'done' or 'failed' (give back what was lent). */
  end?: (q: QuestContext) => void;
}

/** The life store key of a job's starts today. */
export const jobKey = (id: string) => `job:${id}`;

/** The variant of a job for a game day: stable for the day, spread over the days. */
export function variantFor(jobId: string, day: number, n: number): number {
  return n > 1 ? hash32(`${jobId}|${day}`) % n : 0;
}

interface StepAt {
  step: JobStep;
  /** The stage after this one ('done' after the last step). */
  next: string;
}

/** Build the job's quest and register it with the conversations. */
export function defineJob(def: JobDef, ext: JobExt = {}): QuestDef {
  const byStage = new Map<string, StepAt>();
  const variants = def.variants?.length ? def.variants : null;
  const lines = variants ?? [def.steps];
  const stageId = (k: number, i: number) => (!variants && i === 0 ? 'start' : variants ? `v${k}:${lines[k][i].id}` : `s:${lines[k][i].id}`);
  lines.forEach((steps, k) => steps.forEach((step, i) => byStage.set(stageId(k, i), { step, next: i + 1 < steps.length ? stageId(k, i + 1) : 'done' })));
  // Everything a step hands over, taken back when the job ends.
  const goods = new Map<string, number>();
  for (const steps of lines) for (const s of steps) for (const g of s.give ?? []) goods.set(g.item, Math.max(goods.get(g.item) ?? 0, g.count));

  /** The job begins: count it today, pick the variant, set the clock running. */
  const begin = (q: QuestContext) => {
    const g = q.game;
    g.life?.store.addToday(jobKey(def.id));
    const day = g.time?.dayIndex ?? 0;
    q.vars.day = day;
    q.vars.variant = variants ? variantFor(def.id, day, variants.length) : 0;
    const now = g.time?.totalHours ?? 0;
    let until = def.limitHours ? now + def.limitHours : Infinity;
    if (ext.until) until = Math.min(until, now + (hoursUntil(at(ext.until), g.time?.hour ?? 0) || 24));
    if (Number.isFinite(until)) q.vars.until = Math.round(until * 1000) / 1000;
  };

  /** A step begins: skip it if its person or thing isn't there, else hand over its goods. */
  const enter = (q: QuestContext, sid: string) => {
    const s = byStage.get(sid)!;
    q.vars.step = s.step.id;
    if (!present(q.game, s.step)) {
      // Nobody to go to: the step's journal line (just written) would tell of a visit never made.
      const journal = q.game.quests?.state(def.id)?.journal;
      if (journal?.[journal.length - 1]?.stage === sid) journal.pop();
      advance(q, sid);
      return;
    }
    const inv = q.game.player?.inventory;
    for (const g of s.step.give ?? []) inv?.add(g.item, g.count, { source: 'quest' });
  };

  const advance = (q: QuestContext, sid: string) => {
    const s = byStage.get(sid);
    if (!s || q.stage !== sid) return;
    q.completeObjective(sid);
    // completeObjective never moves a step stage on (they have no `next`): this does.
    if (q.running && q.stage === sid) q.setStage(s.next);
  };

  const stages: Record<string, QuestStageDef> = {};
  if (variants) {
    stages.start = {
      journal: ext.intro ?? `I took on the work: ${def.title.toLowerCase()}.`,
      onEnter: (q) => {
        begin(q);
        q.setStage(stageId(Number(q.vars.variant) || 0, 0));
      },
    };
  }
  for (const [sid, s] of byStage) {
    stages[sid] = {
      journal: s.step.journal,
      objectives: [{ id: sid, text: s.step.text, target: s.step.target }],
      onEnter: (q) => {
        if (sid === 'start') begin(q);
        enter(q, sid);
      },
    };
  }
  stages.done = {
    journal: ext.done ?? `The work was done and I was paid ${priceText(def.pay)}.`,
    onEnter: (q) => {
      ext.end?.(q);
      payout(q, def, ext.pay ? ext.pay(q) : def.pay);
      takeBack(q, goods);
    },
    end: 'complete',
  };
  stages.failed = {
    journal: ext.failed ?? 'I did not finish in time, and the work went to someone else. Nobody pays for half a job.',
    onEnter: (q) => {
      ext.end?.(q);
      takeBack(q, goods);
    },
    end: 'fail',
  };
  Object.assign(stages, ext.stages);

  const quest: QuestDef = {
    id: def.id,
    title: def.title,
    latin: def.latin,
    category: 'radiant',
    // QuestDef.giver names a registered NPC (src/npc/content); a keeper's name is in the journal.
    giver: def.giver.startsWith('npc-') ? def.giver : undefined,
    summary: def.summary,
    stages,
    repeatable: true,
    on: merge(
      {
        'life:option': (q, e) => {
          const s = byStage.get(q.stage);
          if (!s) return;
          const d = s.step.done;
          if (e.option === `job:${def.id}:${s.step.id}` || ('use' in d && e.owner === d.use)) advance(q, q.stage);
        },
        'location:entered': (q, e) => {
          const s = byStage.get(q.stage);
          if (s && 'reach' in s.step.done && e.locationId === s.step.done.reach) advance(q, q.stage);
        },
      },
      ext.on,
    ),
  };

  registerJob({
    def,
    step: (game) => {
      const st = game.quests?.state(def.id);
      return st?.status === 'running' ? (byStage.get(st.stage)?.step ?? null) : null;
    },
    offerable: (game) => offerable(game, def),
  });
  return quest;
}

/** Can the job's giver offer it now: after the opening, not running, its gate, under the daily cap. */
export function offerable(game: Game, def: JobDef): boolean {
  if (!game.life || !game.quests) return false;
  if (!questDone(game, OPENING)) return false;
  const s = game.quests.status(def.id);
  if (!s || s.running) return false;
  if (!passes(def.offer, game)) return false;
  return game.life.store.today(jobKey(def.id)) < def.daily;
}

/** Fail running jobs whose time is up (runtime.ts calls this at 2 Hz). Returns how many failed. */
export function expireJobs(game: Game): number {
  const quests = game.quests;
  const now = game.time?.totalHours;
  if (!quests || now === undefined) return 0;
  let n = 0;
  for (const rt of jobRuntimes()) {
    const st = quests.state(rt.def.id);
    if (st?.status !== 'running') continue;
    const until = st.vars.until;
    if (typeof until !== 'number' || now < until) continue;
    if (quests.get(rt.def.id)?.stages.failed) quests.setStage(rt.def.id, 'failed');
    else quests.fail(rt.def.id);
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ inside

/** Is the person or thing a step ends with in this game? */
function present(game: Game, step: JobStep): boolean {
  const d = step.done;
  const who = 'talk' in d ? d.talk : 'deliver' in d ? d.deliver.to : null;
  if (who) {
    if (game.npcs && !game.npcs.get(who)) return false;
    return !game.life?.dead(who) && !game.population?.deadNamed?.has(who);
  }
  if ('use' in d) return !!game.life?.data.activities.some((a) => a.id === d.use);
  if ('reach' in d) return !game.locations || !!game.locations.get(d.reach);
  return true;
}

/** Pay the wage (with the reward items) in one line: "Paid 12 asses". */
function payout(q: QuestContext, def: JobDef, pay: number) {
  const g = q.game;
  const inv = g.player?.inventory;
  const parts: string[] = [];
  if (pay > 0 && inv) {
    inv.addDenarii(pay);
    parts.push(priceText(pay));
  }
  const r = def.rewards;
  for (const it of r?.items ?? []) {
    inv?.add(it.id, it.count ?? 1, { source: 'quest', silent: true });
    const name = g.items?.get(it.id)?.name ?? it.id;
    parts.push((it.count ?? 1) > 1 ? `${it.count} × ${name}` : name);
  }
  // Reputation, XP and skills through the quest's own reward rules (they say nothing).
  if (r && (r.reputation || r.xp || r.skills || r.skillXp || r.rank)) q.giveReward({ ...r, items: undefined, denarii: undefined });
  if (parts.length) g.events.emit('rpg:notify', { text: `${def.title}: paid ${parts.join(' and ')}`, kind: 'item' });
}

/** Take back the job's goods still carried (the last basket, an amphora put down unfinished). */
function takeBack(q: QuestContext, goods: ReadonlyMap<string, number>) {
  const inv = q.game.player?.inventory;
  if (!inv) return;
  for (const id of goods.keys()) {
    const n = inv.count(id);
    if (n > 0) inv.remove(id, n, { reason: 'quest' });
  }
}

type Handlers = NonNullable<QuestDef['on']>;

/** Both handler maps; where both listen to an event, both run (the job's first). */
function merge(a: Handlers, b: Handlers | undefined): Handlers {
  if (!b) return a;
  const out: Record<string, unknown> = { ...a };
  for (const [k, fn] of Object.entries(b)) {
    const first = out[k] as ((q: QuestContext, e: unknown) => void) | undefined;
    const second = fn as (q: QuestContext, e: unknown) => void;
    out[k] = first
      ? (q: QuestContext, e: unknown) => {
          first(q, e);
          second(q, e);
        }
      : second;
  }
  return out as Handlers;
}
