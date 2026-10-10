/**
 * Life lines in conversations (docs/design/world-life.md §3.3 "Services for existing NPCs"):
 * `lifeChoices(npcId)` gives the choices and nodes for everything a person does in phase 2 — their
 * services (OptionDefs), their bench, their dice table, the jobs they offer and the job steps that
 * end with them — for a keeper's own conversation and for a hand-written dialogue alike:
 *
 *   const life = lifeChoices('npc-tryphon');
 *   person({ id: 'npc-tryphon', …, choices: [...life.choices], nodes: { ...life.nodes } });
 *
 * Every choice is hidden without the life module (tests, a build without it), and while a keeper's
 * shop is shut. The other crews plug their systems in here:
 *
 *   registerBench('mortar', (game, owner) => …)     CRAFT: opens the bench card
 *   registerWager('tali', (game, wager, owner) => …) GAMES: one round of dice, a bet on the games
 *   registerJob({ def, step, offerable })            JOBS: defineJob registers each job
 */
import type { Game } from '../core/Game';
import type { DialogueChoice, DialogueContext, DialogueNode } from '../dialogue/types';
import { priceText } from './effects';
import { LIFE } from './registry';
import type { BenchKind, JobDef, JobStep, LifeData, OptionDef, WagerDef } from './types';

/** The data in play: LIFE, or LIFE with the examples (install.ts sets it under ?lifex=1). */
let active: Readonly<Required<LifeData>> = LIFE;

export function setLifeData(data: Readonly<Required<LifeData>>) {
  active = data;
}

// ------------------------------------------------------------------ hooks for the other crews

/** A job as the conversations see it (registered by src/life/jobs/defineJob.ts). */
export interface JobRuntime {
  def: JobDef;
  /** The step the player is on now, or null when the job isn't running. */
  step(game: Game): JobStep | null;
  /** Can its giver offer it now (its `offer` gate, the daily cap, not already running)? */
  offerable(game: Game): boolean;
}

type BenchOpener = (game: Game, owner: string) => boolean;
type WagerOpener = (game: Game, wager: WagerDef, owner: string) => boolean;

const JOBS = new Map<string, JobRuntime>();
const BENCHES = new Map<BenchKind, BenchOpener>();
const WAGERS = new Map<WagerDef['game'], WagerOpener>();

/** A job the conversations can offer and finish steps of (defineJob calls this). */
export function registerJob(rt: JobRuntime) {
  JOBS.set(rt.def.id, rt);
}

/** What "Work at the mortar" does (the CRAFT crew's bench card). */
export function registerBench(kind: BenchKind, open: BenchOpener) {
  BENCHES.set(kind, open);
}

/** What "Play" does at a dice table or a bookmaker's (the GAMES crew). */
export function registerWager(game: WagerDef['game'], open: WagerOpener) {
  WAGERS.set(game, open);
}

export function jobRuntime(id: string): JobRuntime | undefined {
  return JOBS.get(id);
}

export function jobRuntimes(): IterableIterator<JobRuntime> {
  return JOBS.values();
}

// ------------------------------------------------------------------ option choices

/** What the last option taken with each owner said (the result node reads it). */
const results = new Map<string, string>();

/** The node an option's result is shown in (one per owner, shared by all its options). */
export const RESULT_NODE = 'life:res';

/** The player's line for an option: "Bathe (a quadrans)", with why it is off when it is. */
export function optionText(game: Game, owner: string, o: OptionDef): string {
  const label = o.price ? `${o.text} (${priceText(o.price)})` : o.text;
  const why = game.life?.blocked(owner, o);
  return why ? `${label} — ${why}` : label;
}

/**
 * Choices for options taken with `owner` (a keeper, a named NPC, an activity): hidden while their
 * gate fails, shown but off with the reason while `needs`, the daily mark or the purse says no.
 * The result goes to RESULT_NODE, which returns to `back`.
 */
export function optionChoices(owner: string, options: readonly OptionDef[] | undefined, extraIf?: (c: DialogueContext) => boolean): DialogueChoice[] {
  return (options ?? []).map((o) => ({
    text: (c) => optionText(c.game, owner, o),
    if: (c) => !!c.game.life && (!extraIf || extraIf(c)) && c.game.life.visible(o),
    enabled: (c) => !c.game.life?.blocked(owner, o),
    effects: (c) => {
      const r = c.game.life?.apply(owner, o);
      results.set(owner, r?.text ?? '…');
    },
    goto: RESULT_NODE,
  }));
}

/** The result node for an owner's options. */
export function resultNode(owner: string, back: string): DialogueNode {
  return { text: () => results.get(owner) ?? '…', next: back };
}

/** Remember what an option said (for a caller that took it outside a conversation). */
export function setResult(owner: string, text: string) {
  results.set(owner, text);
}

// ------------------------------------------------------------------ everything a person does

const DELIVERED = ['Good. Put it there.', 'About time. Here, it’s counted.', 'That’s the lot? Good.'];
let delivered = 0;

/**
 * The life lines for a person: their services, bench, dice table, jobs to offer and job steps that
 * end with them. `back` is the node to return to after a result (person() hubs are 'hub').
 */
export function lifeChoices(npcId: string, back = 'hub'): { choices: DialogueChoice[]; nodes: Record<string, DialogueNode> } {
  const keeper = active.keepers.find((k) => k.id === npcId);
  const set = active.services.find((s) => s.npc === npcId);
  const services = [...(keeper?.services ?? []), ...(set?.services ?? [])];
  const bench = keeper?.bench ?? set?.bench;
  const wager = keeper?.wager ?? set?.wager;
  const jobs = [...(keeper?.jobs ?? []), ...(set?.jobs ?? [])];
  // A keeper does business only at the open shop.
  const open = (c: DialogueContext) => !keeper || !!c.game.life?.isOpen(npcId);
  const choices: DialogueChoice[] = [...optionChoices(npcId, services, open)];
  const nodes: Record<string, DialogueNode> = { [RESULT_NODE]: resultNode(npcId, back) };

  if (bench) {
    choices.push({
      text: bench === 'mortar' ? 'Could I use your mortar?' : 'Could I use your bench?',
      if: (c) => !!c.game.life && open(c) && BENCHES.has(bench),
      effects: (c) => void BENCHES.get(bench)?.(c.game, npcId),
      end: true,
    });
  }
  if (wager) {
    const def = active.wagers.find((w) => w.id === wager);
    choices.push({
      text: def?.game === 'munus' ? 'I’d like to place a bet.' : 'Deal me in. (Dice)',
      if: (c) => !!c.game.life && open(c) && !!def && WAGERS.has(def.game),
      effects: (c) => void (def && WAGERS.get(def.game)?.(c.game, def, npcId)),
      end: true,
    });
  }
  // Job offers: "Any work going?" for each job this person gives, while it can be offered.
  for (const id of jobs) {
    choices.push({
      text: () => `Any work going? (${JOBS.get(id)?.def.title ?? id})`,
      if: (c) => !!c.game.life && open(c) && !!JOBS.get(id)?.offerable(c.game),
      effects: (c) => {
        const ok = c.game.quests?.start(id);
        results.set(npcId, ok ? (JOBS.get(id)?.def.summary ?? 'There’s work. Off you go.') : 'Not now. Come back later.');
      },
      goto: RESULT_NODE,
    });
  }
  // Job steps that end with this person (two at once is plenty).
  for (let i = 0; i < 2; i++) {
    choices.push({
      text: (c) => stepLine(c.game, stepsFor(c.game, npcId)[i]),
      if: (c) => !!c.game.life && !!stepsFor(c.game, npcId)[i],
      enabled: (c) => {
        const s = stepsFor(c.game, npcId)[i];
        if (!s || !('deliver' in s.step.done)) return true;
        const d = s.step.done.deliver;
        return (c.game.player?.inventory?.count(d.item) ?? 0) >= d.count;
      },
      effects: (c) => {
        const s = stepsFor(c.game, npcId)[i];
        if (!s) return;
        if ('deliver' in s.step.done) {
          const d = s.step.done.deliver;
          c.game.player?.inventory?.remove(d.item, d.count, { reason: 'quest' });
        }
        c.game.events.emit('life:option', { owner: npcId, option: `job:${s.job.def.id}:${s.step.id}`, detail: { job: s.job.def.id, step: s.step.id } });
        results.set(npcId, DELIVERED[delivered++ % DELIVERED.length]);
      },
      goto: RESULT_NODE,
    });
  }
  return { choices, nodes };
}

/** Running jobs whose current step is a talk or a delivery to this person. */
function stepsFor(game: Game, npcId: string): { job: JobRuntime; step: JobStep }[] {
  const out: { job: JobRuntime; step: JobStep }[] = [];
  for (const job of JOBS.values()) {
    const step = job.step(game);
    if (!step) continue;
    const d = step.done;
    if (('talk' in d && d.talk === npcId) || ('deliver' in d && d.deliver.to === npcId)) out.push({ job, step });
  }
  return out;
}

function stepLine(game: Game, s: { job: JobRuntime; step: JobStep } | undefined): string {
  if (!s) return '';
  const d = s.step.done;
  if ('deliver' in d) {
    const name = game.items?.get(d.deliver.item)?.name ?? d.deliver.item;
    return `Here: ${d.deliver.count > 1 ? `${d.deliver.count} × ` : ''}${name}. (${s.job.def.title})`;
  }
  return `About the work. (${s.job.def.title})`;
}
