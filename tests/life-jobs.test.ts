/**
 * Jobs (src/life/jobs, src/quests/content/job-*.ts; docs/design/world-life.md §4.7, §5.4 E): the
 * stages defineJob builds, the daily cap in the life save, the day's variant, the porter's three
 * loads (and the burden), the bread round failing cleanly at the third hour, the tracker staying on
 * the main quest, a step skipped when its person isn't in the game, the practice bout after lud-01
 * and the sportula that lets the patron's letter be offered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/core/Game';
import { defineJob, expireJobs, jobKey, offerable, variantFor } from '../src/life/jobs/defineJob';
import { HANDOVER } from '../src/life/jobs/handover';
import { BURDEN_SPEED, PATRON_DOOR, SPORTULA } from '../src/life/jobs/runtime';
import { installLife, type LifeService } from '../src/life/install';
import { jobRuntime, lifeChoices } from '../src/life/talk';
import type { JobDef } from '../src/life/types';
import { loadQuestContent } from '../src/quests/QuestSystem';
import { arenaPurse, startingFavor } from '../src/rpg/arena';
import { installRpg } from '../src/rpg/install';
import { AS } from '../src/rpg/money';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const PORTER = 'job-portus-saccarius';
const BREAD = 'job-subura-pistor';
const LETTER = 'job-cliens-epistula';
const LUSIO = 'job-ludus-lusio';
const quests = loadQuestContent();
const quest = (id: string) => quests.find((q) => q.id === id)!;

async function world(hour = 9) {
  const fg = fakeGame({ controller: true });
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  rpg.quests.restore({});
  const game = fg.game as Game;
  game.time.advanceHours((hour - game.time.hour + 24) % 24);
  const life = (await installLife(game)) as LifeService;
  return { ...fg, game, rpg, life };
}

/** The opening done (STORY rule 2: nothing is offered before it). */
function finishOpening(game: Game) {
  game.quests.start('mq-01-madida-capena');
  game.quests.complete('mq-01-madida-capena');
}

/** Take the delivery line a job step adds to a person's talk (what the conversation does). */
function deliver(game: Game, npcId: string): string | null {
  const ctx = game.dialogue.context(npcId);
  const text = (t: unknown) => (typeof t === 'function' ? t(ctx) : String(t));
  const line = lifeChoices(npcId).choices.find((c) => (!c.if || c.if(ctx)) && /\(.*\)$/.test(text(c.text)) && /^Here:|^About the work/.test(text(c.text)));
  if (!line || (line.enabled && !line.enabled(ctx))) return null;
  const said = text(line.text);
  line.effects?.(ctx);
  return said;
}

describe('defineJob', () => {
  it('builds the stages: the first step is start, then one stage a step, then done and failed', () => {
    const q = quest(PORTER);
    expect(q.category).toBe('radiant');
    expect(q.repeatable).toBe(true);
    expect(Object.keys(q.stages)).toEqual(['start', 's:carry1', 's:take2', 's:carry2', 's:take3', 's:carry3', 'done', 'failed']);
    for (const [sid, s] of Object.entries(q.stages)) expect(s.journal.length, sid).toBeGreaterThan(20);
    expect(q.stages.start.objectives?.[0]).toMatchObject({ id: 'start', text: expect.stringContaining('amphora') });
    expect(q.stages.start.objectives?.[0].target?.kind).toBe('point');
    expect(q.stages.done.end).toBe('complete');
    expect(q.stages.failed.end).toBe('fail');
    // A keeper isn't a registered NPC: the giver is named in the journal, not in QuestDef.giver.
    expect(q.giver).toBeUndefined();
    expect(quest(LUSIO).giver).toBe('npc-asiaticus');
  });

  it('with variants, start is an opening and every variant has its own stages', () => {
    const q = quest(LETTER);
    expect(Object.keys(q.stages)).toEqual(['start', 'v0:philetus', 'v1:zethus', 'v2:dama', 'done', 'failed']);
    expect(q.stages.start.objectives).toBeUndefined();
    expect(q.stages['v1:zethus'].objectives?.[0].target).toEqual({ kind: 'npc', id: 'npc-zethus' });
  });

  it('picks the same variant all day, and more than one over the days', () => {
    const seen = new Set<number>();
    for (let day = 0; day < 30; day++) {
      const v = variantFor(LETTER, day, 3);
      expect(variantFor(LETTER, day, 3)).toBe(v);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(variantFor(LETTER, 5, 1)).toBe(0);
  });

  it('keeps the variant it started with past midnight', async () => {
    const { game, life } = await world(22);
    finishOpening(game);
    game.quests.start(LETTER);
    const st = game.quests.state(LETTER)!;
    const day = game.time.dayIndex;
    expect(st.vars.variant).toBe(variantFor(LETTER, day, 3));
    const stage = `v${st.vars.variant}:${['philetus', 'zethus', 'dama'][Number(st.vars.variant)]}`;
    expect(st.stage).toBe(stage);
    expect(game.player.inventory.count('quest-epistula-patroni')).toBe(1);
    game.time.advanceHours(4);
    expect(game.time.dayIndex).toBe(day + 1);
    expect(game.quests.state(LETTER)!.stage).toBe(stage);
    expect(life.store.today(jobKey(LETTER))).toBe(0);
  });
});

describe('the porter (E2)', () => {
  it('three loads under the burden, 12 asses, two jobs a day and a third refused; the main quest keeps the tracker', async () => {
    const { game, life, step } = await world(9);
    finishOpening(game);
    game.quests.start('mq-02-tabella');
    const rt = jobRuntime(PORTER)!;
    expect(rt.offerable(game)).toBe(true);
    // The tally clerk offers it in his talk.
    const offer = lifeChoices('keeper-portus-tabularius').choices.find((c) => /Any work going/.test(typeof c.text === 'function' ? c.text(game.dialogue.context('keeper-portus-tabularius')) : c.text));
    expect(offer).toBeTruthy();
    const inv = game.player.inventory;
    const pc = game.getSystem<{ name: string; speedMultiplier(): number; canSprint(): boolean }>('playerController')!;
    for (let job = 1; job <= 2; job++) {
      const money = inv.denarii;
      expect(game.quests.start(PORTER)).toBe(true);
      expect(life.store.today(jobKey(PORTER))).toBe(job);
      expect(rt.offerable(game)).toBe(false);
      for (let load = 1; load <= 3; load++) {
        expect(rt.step(game)?.id).toBe(`take${load}`);
        expect(life.open('act.portus.amphorae')).toBe(true);
        expect(rt.step(game)?.id).toBe(`carry${load}`);
        expect(inv.count('quest-amphora-olei')).toBe(1);
        step(31);
        expect(pc.speedMultiplier()).toBeCloseTo(BURDEN_SPEED, 6);
        expect(pc.canSprint()).toBe(false);
        expect(deliver(game, 'keeper-portus-horrearius')).toMatch(/Amphora of Oil/);
        expect(inv.count('quest-amphora-olei')).toBe(0);
        step(31);
        expect(pc.speedMultiplier()).toBeCloseTo(1, 6);
        expect(game.quests.tracked).toBe('mq-02-tabella');
      }
      expect(game.quests.status(PORTER)?.completed).toBe(true);
      expect(inv.denarii - money).toBeCloseTo(12 * AS, 6);
    }
    // A third the same day is refused, and the next day it is offered again.
    expect(rt.offerable(game)).toBe(false);
    game.time.advanceHours(24);
    expect(rt.offerable(game)).toBe(true);
  });

  it('a new player controller carries the burden too', async () => {
    const { game, life, step, systems } = await world(9);
    finishOpening(game);
    game.quests.start(PORTER);
    life.open('act.portus.amphorae');
    step(31);
    const i = systems.findIndex((s) => s.name === 'playerController');
    const fresh = { name: 'playerController', priority: -10, canSprint: () => true, speedMultiplier: () => 1 };
    systems[i] = fresh as never;
    step(31);
    expect(fresh.speedMultiplier()).toBeCloseTo(BURDEN_SPEED, 6);
    expect(fresh.canSprint()).toBe(false);
  });

  it('nothing is offered before the opening is done', async () => {
    const { game } = await world(9);
    expect(jobRuntime(PORTER)!.offerable(game)).toBe(false);
  });

  it('the heap gives nothing while no load is due', async () => {
    const { game, life } = await world(9);
    finishOpening(game);
    expect(life.open('act.portus.amphorae')).toBe(false);
    game.quests.start(PORTER);
    expect(life.open('act.portus.amphorae')).toBe(true);
    expect(life.open('act.portus.amphorae')).toBe(false);
  });

  it('a load given up after six hours goes back, unpaid', async () => {
    const { game, life, step } = await world(9);
    finishOpening(game);
    game.quests.start(PORTER);
    life.open('act.portus.amphorae');
    expect(game.player.inventory.count('quest-amphora-olei')).toBe(1);
    game.time.advanceHours(6.1);
    step(31);
    expect(game.quests.status(PORTER)?.failed).toBe(true);
    expect(game.player.inventory.count('quest-amphora-olei')).toBe(0);
  });
});

describe('the bread round (E3)', () => {
  it('three baskets before the third hour: 6 asses and a loaf', async () => {
    const { game, life } = await world(3.5);
    finishOpening(game);
    const rt = jobRuntime(BREAD)!;
    expect(rt.offerable(game)).toBe(true);
    const inv = game.player.inventory;
    const money = inv.denarii;
    const bread = inv.count('panis');
    game.quests.start(BREAD);
    expect(inv.count('quest-corbis-panis')).toBe(3);
    expect(life.open('act.subura.popina-panis')).toBe(true);
    expect(rt.step(game)?.id).toBe('chreste');
    expect(deliver(game, 'npc-chreste')).toMatch(/Basket of Bread/);
    expect(deliver(game, 'npc-dama')).toMatch(/Basket of Bread/);
    expect(game.quests.status(BREAD)?.completed).toBe(true);
    expect(inv.denarii - money).toBeCloseTo(6 * AS, 6);
    expect(inv.count('panis')).toBe(bread + 1);
    expect(inv.count('quest-corbis-panis')).toBe(0);
    expect(rt.offerable(game)).toBe(false);
  });

  it('is offered only from the fourth watch to the first hour', async () => {
    const { game } = await world(9);
    finishOpening(game);
    expect(jobRuntime(BREAD)!.offerable(game)).toBe(false);
  });

  it('fails cleanly at the third hour, with a journal line, and the baskets go back', async () => {
    const { game, step } = await world(4);
    finishOpening(game);
    game.quests.start(BREAD);
    game.time.advanceHours(3.4); // past h3 (07:16)
    step(31);
    const st = game.quests.state(BREAD)!;
    expect(st.status).toBe('failed');
    expect(st.journal[st.journal.length - 1].text).toMatch(/third hour came and the bread was cold/);
    expect(game.player.inventory.count('quest-corbis-panis')).toBe(0);
  });
});

/** Talk to a person and pick choices by their text (what the conversation panel does). */
function talk(game: Game, npcId: string) {
  const ds = game.dialogue;
  const v0 = ds.start(npcId);
  return {
    first: v0,
    get view() {
      return ds.view;
    },
    pick(re: RegExp) {
      const i = ds.view?.choices.findIndex((c) => re.test(c.text)) ?? -1;
      if (i < 0) throw new Error(`no choice ${re} in ${JSON.stringify(ds.view?.choices.map((c) => c.text))}`);
      return ds.choose(i);
    },
  };
}

describe('the handover (deliveries where the person’s own talk has no life lines)', () => {
  it('the bread round runs through Chreste’s and Dama’s own conversations, and pays', async () => {
    const { game, life } = await world(3.5);
    finishOpening(game);
    const inv = game.player.inventory;
    const money = inv.denarii;
    game.quests.start(BREAD);
    life.open('act.subura.popina-panis');
    // Chreste: the handover takes the conversation while her basket is due.
    const c = talk(game, 'npc-chreste');
    expect(c.first?.dialogueId).toBe(HANDOVER);
    expect(c.first?.text).toMatch(/Fortunatus’ bread/);
    c.pick(/^Here: Basket of Bread\. \(The Bread Round\)$/);
    expect(game.dialogue.view?.text).toMatch(/counts the loaves twice/);
    // "Something else." goes on into her own conversation.
    c.pick(/^Something else/);
    expect(game.dialogue.view?.dialogueId).toBe('npc-chreste');
    game.dialogue.end();
    // Nothing more is due with her: her own talk again.
    expect(game.dialogue.start('npc-chreste')?.dialogueId).toBe('npc-chreste');
    game.dialogue.end();
    // E on Dama opens his own dialogue by name (NpcManager.talkTo): the handover takes over from it.
    game.dialogue.start('npc-dama', { dialogueId: 'npc-dama' });
    game.events.emit('npc:talk', { npcId: 'npc-dama', dialogue: true });
    expect(game.dialogue.view?.dialogueId).toBe(HANDOVER);
    game.dialogue.end();
    const d = talk(game, 'npc-dama');
    expect(d.first?.dialogueId).toBe(HANDOVER);
    d.pick(/^Here: Basket of Bread/);
    expect(game.quests.status(BREAD)?.completed).toBe(true);
    expect(inv.denarii - money).toBeCloseTo(6 * AS, 6);
    d.pick(/^Vale/);
    expect(game.dialogue.active).toBe(false);
    // Nothing due: E on Dama stays in his own talk.
    game.dialogue.start('npc-dama', { dialogueId: 'npc-dama' });
    game.events.emit('npc:talk', { npcId: 'npc-dama', dialogue: true });
    expect(game.dialogue.view?.dialogueId).toBe('npc-dama');
    game.dialogue.end();
  });

  it('steps aside for a keeper, whose own talk carries the deliveries and the jobs it lists', async () => {
    const { game, life } = await world(9);
    finishOpening(game);
    // Thallus lists the porter's job: his own talk offers it.
    expect(jobRuntime(PORTER)!.offerable(game)).toBe(true);
    expect(game.dialogue.start('keeper-portus-tabularius')?.dialogueId).toBe('keeper-portus-tabularius');
    game.dialogue.end();
    game.quests.start(PORTER);
    life.open('act.portus.amphorae');
    expect(game.dialogue.start('keeper-portus-horrearius')?.dialogueId).toBe('keeper-portus-horrearius');
    game.dialogue.end();
  });

  it('offers a keeper’s job that the keeper’s data doesn’t list, and stops once it is taken', async () => {
    const errand = defineJob(
      {
        id: 'job-test-errand',
        title: 'A Test Errand',
        summary: 'Carry a loaf to Dama for the storekeeper.',
        giver: 'keeper-portus-horrearius',
        offer: {},
        daily: 1,
        pay: AS,
        steps: [{ id: 'dama', text: 'Bring Dama a loaf', target: { kind: 'npc', id: 'npc-dama' }, done: { deliver: { item: 'panis', count: 1, to: 'npc-dama' } }, give: [{ item: 'panis', count: 1 }], journal: 'Daphnus sent me to Dama with a loaf.' }],
        period: '[G]',
      },
      { talk: { offer: 'You. Carry a loaf to Dama for me?', taken: () => 'To Dama, then. Mind it.' } },
    );
    const { game } = await world(9);
    game.quests.register(errand);
    finishOpening(game);
    const k = talk(game, 'keeper-portus-horrearius');
    expect(k.first?.dialogueId).toBe(HANDOVER);
    expect(k.first?.text).toBe('You. Carry a loaf to Dama for me?');
    k.pick(/^I’ll do it\. \(A Test Errand\)$/);
    expect(game.dialogue.view?.text).toBe('To Dama, then. Mind it.');
    expect(game.quests.status('job-test-errand')?.running).toBe(true);
    k.pick(/^Something else/);
    expect(game.dialogue.view?.dialogueId).toBe('keeper-portus-horrearius');
    game.dialogue.end();
    expect(game.dialogue.start('keeper-portus-horrearius')?.dialogueId).toBe('keeper-portus-horrearius');
    game.dialogue.end();
    const d = talk(game, 'npc-dama');
    d.pick(/^Here: Bread\. \(A Test Errand\)$|^Here: .*\(A Test Errand\)$/);
    expect(game.quests.status('job-test-errand')?.completed).toBe(true);
  });
});

describe('the patron’s letter', () => {
  it('is offered on odd days after the sportula, once mq-02 is done', async () => {
    const { game, life } = await world(5.5);
    finishOpening(game);
    game.quests.start('mq-02-tabella');
    game.quests.complete('mq-02-tabella');
    const rt = jobRuntime(LETTER)!;
    if (game.time.dayIndex % 2 === 0) game.time.advanceHours(24);
    expect(rt.offerable(game)).toBe(false);
    game.events.emit('life:option', { owner: PATRON_DOOR, option: 'salutatio' });
    expect(life.store.today(SPORTULA)).toBe(1);
    expect(rt.offerable(game)).toBe(true);
    game.time.advanceHours(24);
    game.events.emit('life:option', { owner: PATRON_DOOR, option: 'salutatio' });
    expect(rt.offerable(game)).toBe(false);
  });

  it('pays by the distance of the day’s recipient', async () => {
    const { game } = await world(6);
    finishOpening(game);
    const money = game.player.inventory.denarii;
    game.quests.start(LETTER);
    const v = Number(game.quests.state(LETTER)!.vars.variant);
    const to = ['npc-philetus', 'npc-zethus', 'npc-dama'][v];
    expect(deliver(game, to)).toMatch(/Patron/);
    expect(game.quests.status(LETTER)?.completed).toBe(true);
    expect(game.player.inventory.denarii - money).toBeCloseTo([4, 6, 8][v] * AS, 6);
  });
});

describe('the practice bout (E4)', () => {
  it('after lud-01, in drill hours, once a day; without a combat module Asiaticus calls it on points', async () => {
    const { game } = await world(9);
    finishOpening(game);
    const rt = jobRuntime(LUSIO)!;
    expect(rt.offerable(game)).toBe(false);
    game.quests.start('lud-01-sacramentum');
    game.quests.complete('lud-01-sacramentum');
    expect(rt.offerable(game)).toBe(true);
    const money = game.player.inventory.denarii;
    expect(game.quests.start(LUSIO)).toBe(true);
    expect(rt.step(game)?.id).toBe('ready');
    game.events.emit('dialogue:node', { npcId: 'npc-asiaticus', dialogueId: 'npc-asiaticus', nodeId: 'lusioBegin' });
    expect(game.quests.status(LUSIO)?.completed).toBe(true);
    const purse = Math.round(arenaPurse(5, startingFavor(game.factions.reputation('plebs'))));
    expect(game.player.inventory.denarii - money).toBeCloseTo(purse, 6);
    expect(purse).toBeGreaterThanOrEqual(3);
    expect(purse).toBeLessThanOrEqual(10);
    expect(rt.offerable(game)).toBe(false);
    // lud-01 is untouched by it.
    expect(game.quests.status('lud-01-sacramentum')?.completed).toBe(true);
  });

  it('the clock stops while the bout is on, and runs again once it is over', async () => {
    const { game, rpg } = await world(9);
    finishOpening(game);
    const now = game.time.totalHours;
    rpg.quests.restore({ states: { [LUSIO]: { status: 'running', stage: 'bout', objectives: {}, vars: { until: now + 0.5, bout: 1 }, journal: [] } } });
    const bout = { over: false };
    (game as unknown as { combat: unknown }).combat = { core: { bout } };
    game.time.advanceHours(1);
    expect(expireJobs(game)).toBe(0);
    expect(game.quests.state(LUSIO)?.status).toBe('running');
    bout.over = true;
    expect(expireJobs(game)).toBe(1);
    expect(game.quests.state(LUSIO)?.status).toBe('failed');
  });

  it('is not offered outside drill hours', async () => {
    const { game } = await world(13);
    finishOpening(game);
    game.quests.start('lud-01-sacramentum');
    game.quests.complete('lud-01-sacramentum');
    expect(jobRuntime(LUSIO)!.offerable(game)).toBe(false);
  });
});

describe('a step whose person isn’t in the game', () => {
  const def: JobDef = {
    id: 'job-test-ghost',
    title: 'A Test Errand',
    summary: 'A job for the tests: one person who exists and one who does not.',
    giver: 'npc-dama',
    offer: {},
    daily: 1,
    pay: AS,
    steps: [
      { id: 'ghost', text: 'Bring it to nobody', target: { kind: 'npc', id: 'npc-dama' }, done: { deliver: { item: 'panis', count: 1, to: 'keeper-nowhere-nobody' } }, journal: 'The first errand was to somebody who was never there.' },
      { id: 'dama', text: 'Talk to Dama', target: { kind: 'npc', id: 'npc-dama' }, done: { talk: 'npc-dama' }, journal: 'Then I was to see Dama at his inn by the Circus.' },
    ],
    period: '[G]',
  };

  it('is skipped (and its journal line with it)', async () => {
    const q = defineJob(def);
    const { game } = await world(9);
    game.quests.register(q);
    finishOpening(game);
    expect(offerable(game, def)).toBe(true);
    game.quests.start(def.id);
    const st = game.quests.state(def.id)!;
    expect(st.stage).toBe('s:dama');
    expect(st.journal.map((j) => j.stage)).toEqual(['s:dama']);
    expect(deliver(game, 'npc-dama')).toMatch(/About the work/);
    expect(game.quests.status(def.id)?.completed).toBe(true);
    expect(expireJobs(game)).toBe(0);
  });
});

describe('a job’s notice on a board', () => {
  it('is noted down only while the giver could offer the job (the board skips none of its rules)', async () => {
    const { game, rpg, life } = await world(12);
    finishOpening(game);
    /** Open the Subura board on a day its card shows the bread round's notice; the notice's choices. */
    const noticeChoices = () => {
      for (let d = 0; d < 24; d++) {
        if (life.open('act.subura.board')) {
          const i = rpg.dialogue.view!.choices.findIndex((c) => c.text.startsWith('“The baker'));
          if (i >= 0) return rpg.dialogue.choose(i)!.choices.map((c) => c.text);
          rpg.dialogue.end();
        }
        game.time.advanceHours(24);
      }
      return null;
    };
    // At noon the bread round isn't offered (v4 to h1): the notice can be read, not noted down.
    const noon = noticeChoices();
    expect(noon).not.toBeNull();
    expect(noon).not.toContain('Note it down.');
    rpg.dialogue.end();
    // At the fourth watch the baker would offer it, and so does his notice.
    game.time.advanceHours((3.5 - game.time.hour + 24) % 24);
    expect(offerable(game, jobRuntime(BREAD)!.def)).toBe(true);
    const night = noticeChoices();
    expect(night).toContain('Note it down.');
    rpg.dialogue.choose(0);
    expect(game.quests.status(BREAD)?.running).toBe(true);
  });
});
