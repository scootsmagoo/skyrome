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
    expect(Object.keys(q.stages)).toEqual(['start', 'v0:deliver', 'v1:deliver', 'v2:deliver', 'done', 'failed']);
    expect(q.stages.start.objectives).toBeUndefined();
    expect(q.stages['v1:deliver'].objectives?.[0].target).toEqual({ kind: 'npc', id: 'npc-zethus' });
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
    expect(st.stage).toBe(`v${st.vars.variant}:deliver`);
    expect(game.player.inventory.count('quest-epistula-patroni')).toBe(1);
    game.time.advanceHours(4);
    expect(game.time.dayIndex).toBe(day + 1);
    expect(game.quests.state(LETTER)!.stage).toBe(`v${st.vars.variant}:deliver`);
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
