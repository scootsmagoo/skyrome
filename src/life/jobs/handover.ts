/**
 * The handover (docs/design/world-life.md §3.3, §4.7): job lines for people whose own conversation
 * has none. A job's deliveries end in the recipient's talk and its offers in the giver's, through
 * the `lifeChoices` spread (src/life/talk.ts). Not everyone carries it: Vibia Chreste, Dama,
 * Philetus and Zethus speak from hand-written dialogues (src/dialogue/content/vendors.ts), and a
 * keeper's data may not list a job the keeper gives (the doorkeeper at the salutatio gives the
 * patron's letter). For them this conversation sits just above their own (priority 75, under the
 * quests' 80 and more) and takes it only while something is due:
 *
 *   deliver  a running job's step hands goods to this person ("Here: Basket of Bread.")
 *   offer    a keeper's job that the keeper's data doesn't list can be offered now
 *
 * E on a person whose NpcDef names a dialogue opens that one by name, past the priorities
 * (NpcManager.talkTo): then the handover takes over from it as the talk begins ('npc:talk'), when
 * something is due and that dialogue ranks under the handover. "Something else." goes on into the
 * person's own conversation (talkTo again, with the handover standing aside).
 *
 * Once their own talk carries the life lines (a `lifeChoices` spread brings its 'life:res' node) or
 * the keeper's data lists the job, this steps aside, so nothing is said twice. Talk steps are left
 * to the giver's own dialogue (Asiaticus's "Ready." starts the practice bout). The lines are the
 * job's own (`JobExt.talk`).
 *
 * Registered at install rather than as a dialogue content file: the keepers it speaks for are not
 * NPCs of src/npc/content. Nothing here runs unless the player starts a conversation.
 */
import type { Game } from '../../core/Game';
import type { DialogueChoice, DialogueContext, DialogueDef } from '../../dialogue/types';
import { jobRuntimes, RESULT_NODE, type JobRuntime } from '../talk';
import type { JobStep } from '../types';
import { jobExt } from './defineJob';

/** The handover's dialogue id. */
export const HANDOVER = 'life:jobs';
/** Above the people's own talk (vendors 0 to 70), under the quests' (80 and more). */
const PRIORITY = 75;

interface Due {
  job: JobRuntime;
  step: JobStep;
  item: string;
  count: number;
}

/** Running jobs whose step hands goods to this person (two at once is plenty). */
function dues(game: Game, npcId: string): Due[] {
  const out: Due[] = [];
  for (const job of jobRuntimes()) {
    const step = job.step(game);
    const d = step?.done;
    if (step && d && 'deliver' in d && d.deliver.to === npcId) out.push({ job, step, item: d.deliver.item, count: d.deliver.count });
  }
  return out.slice(0, 2);
}

/** Jobs a keeper gives that their data doesn't list, offerable now (their shop open). */
function offers(game: Game, npcId: string): JobRuntime[] {
  const life = game.life;
  const keeper = life?.keeper(npcId);
  if (!life || !keeper || !life.isOpen(npcId)) return [];
  const listed = new Set([...(keeper.jobs ?? []), ...life.data.services.filter((s) => s.npc === npcId).flatMap((s) => s.jobs ?? [])]);
  const out: JobRuntime[] = [];
  for (const job of jobRuntimes()) if (job.def.giver === npcId && !listed.has(job.def.id) && job.offerable(game)) out.push(job);
  return out.slice(0, 2);
}

/** Does the person's own conversation carry the life lines (and so the deliveries)? */
function ownLines(game: Game, npcId: string): boolean {
  return game.dialogue.candidates(npcId).some((d) => d.id !== HANDOVER && !!d.nodes[RESULT_NODE]);
}

/** What the person said last (the thanks, the errand), by person. */
const said = new Map<string, string>();

const name = (game: Game, item: string) => game.items?.get(item)?.name ?? item;
const carrying = (game: Game, d: Due) => (game.player?.inventory?.count(d.item) ?? 0) >= d.count;

/** Hand the goods over: the job's step ends (defineJob listens for 'job:<job>:<step>'). */
function hand(c: DialogueContext, d: Due | undefined) {
  if (!d || !carrying(c.game, d)) return;
  const thanks = jobExt(d.job.def.id)?.talk?.steps?.[d.step.id]?.thanks ?? 'Good. That’s what I was waiting for.';
  said.set(c.npcId, thanks);
  c.game.player?.inventory?.remove(d.item, d.count, { reason: 'quest' });
  c.game.events.emit('life:option', { owner: c.npcId, option: `job:${d.job.def.id}:${d.step.id}`, detail: { job: d.job.def.id, step: d.step.id } });
}

/** Take the job: the giver says what it is (the day's errand). */
function take(c: DialogueContext, job: JobRuntime | undefined) {
  if (!job) return;
  const ok = !!c.game.quests?.start(job.def.id);
  const talk = jobExt(job.def.id)?.talk;
  said.set(c.npcId, ok ? (talk?.taken?.(c.game) ?? job.def.summary) : 'Not now. Come back later.');
}

/** Going on into a person's own conversation: the handover stands aside meanwhile. */
let passing = false;

/** On into the person's own conversation: as E on them would open it, or the next dialogue that speaks. */
function goOn(c: DialogueContext) {
  const ds = c.game.dialogue;
  const npc = c.game.population?.get(c.npcId);
  passing = true;
  try {
    if (npc) {
      c.game.population!.talkTo(npc);
      if (ds.active && ds.view?.npcId === c.npcId) return;
    }
    for (const d of ds.candidates(c.npcId)) {
      if (d.id !== HANDOVER && ds.start(c.npcId, { dialogueId: d.id })) return;
    }
  } finally {
    passing = false;
  }
}

const ON: DialogueChoice = { text: 'Something else.', effects: goOn };
const VALE: DialogueChoice = { text: 'Vale.', end: true };

/** "Here: Basket of Bread. (The Bread Round)" for each delivery due. */
const handChoices = (): DialogueChoice[] =>
  [0, 1].map((i) => ({
    text: (c) => {
      const d = dues(c.game, c.npcId)[i];
      return d ? `Here: ${d.count > 1 ? `${d.count} × ` : ''}${name(c.game, d.item)}. (${d.job.def.title})` : '';
    },
    if: (c) => !!dues(c.game, c.npcId)[i],
    enabled: (c) => {
      const d = dues(c.game, c.npcId)[i];
      return !!d && carrying(c.game, d);
    },
    effects: (c) => hand(c, dues(c.game, c.npcId)[i]),
    goto: 'thanks',
  }));

/** The handover conversation for these people. */
export function handoverDialogue(people: readonly string[]): DialogueDef {
  return {
    id: HANDOVER,
    npcs: [...people],
    priority: PRIORITY,
    start: (c) => {
      if (passing || !c.game.life) return '';
      if (dues(c.game, c.npcId).length && !ownLines(c.game, c.npcId)) return 'deliver';
      return offers(c.game, c.npcId).length ? 'offer' : '';
    },
    nodes: {
      deliver: {
        text: (c) => {
          const d = dues(c.game, c.npcId)[0];
          const hail = d && jobExt(d.job.def.id)?.talk?.steps?.[d.step.id]?.hail;
          return hail ?? 'Is that for me? Hand it over, then.';
        },
        choices: [...handChoices(), ON, VALE],
      },
      thanks: {
        text: (c) => said.get(c.npcId) ?? 'Good.',
        choices: [...handChoices(), ON, VALE],
      },
      offer: {
        text: (c) => {
          const job = offers(c.game, c.npcId)[0];
          return (job && jobExt(job.def.id)?.talk?.offer) ?? `There’s work, if you want it: ${job?.def.title ?? 'an errand'}.`;
        },
        choices: [
          ...[0, 1].map(
            (i): DialogueChoice => ({
              text: (c) => `I’ll do it. (${offers(c.game, c.npcId)[i]?.def.title ?? ''})`,
              if: (c) => !!offers(c.game, c.npcId)[i],
              effects: (c) => take(c, offers(c.game, c.npcId)[i]),
              goto: 'taken',
            }),
          ),
          ON,
          VALE,
        ],
      },
      taken: {
        text: (c) => said.get(c.npcId) ?? 'Off you go, then.',
        choices: [ON, VALE],
      },
    },
  };
}

/** Who the handover may speak for: every job's recipients, and the keepers who give jobs. */
export function handoverPeople(game: Game): string[] {
  const people = new Set<string>();
  for (const { def } of jobRuntimes()) {
    for (const steps of def.variants?.length ? def.variants : [def.steps]) {
      for (const s of steps) if ('deliver' in s.done) people.add(s.done.deliver.to);
    }
    if (game.life?.keeper(def.giver)) people.add(def.giver);
  }
  return [...people];
}

/** installLife calls this (every install… of src/life/jobs): register the handover. */
export function installJobTalk(game: Game) {
  const people = handoverPeople(game);
  const ds = game.dialogue;
  if (!people.length || !ds) return;
  const def = handoverDialogue(people);
  ds.register(def);
  // E on someone whose NpcDef names their dialogue opened that one by name: take over from it when
  // something is due here and it ranks under the handover (a quest's own talk always wins).
  const who = new Set(people);
  game.events.on('npc:talk', (e) => {
    const v = ds.view;
    if (!e.dialogue || passing || !who.has(e.npcId) || !v || v.npcId !== e.npcId || v.dialogueId === HANDOVER) return;
    if ((ds.get(v.dialogueId)?.priority ?? 0) >= PRIORITY || !def.start(ds.context(e.npcId))) return;
    ds.start(e.npcId, { dialogueId: HANDOVER });
  });
}
