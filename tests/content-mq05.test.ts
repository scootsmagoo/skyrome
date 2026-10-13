/**
 * The mq-05 quest, "The Board" (docs/STORY.md chapter 5), against the real QuestSystem,
 * DialogueSystem and RPG services. Stubbed: the population (stage/unstage record calls), the combat
 * service (spawns recorded), the interactions (the board's prompt), and the calendar. The camp's
 * places are the content fallbacks (content/places.ts). The player moves with goTo(); the clock with
 * setHour().
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnOptions } from '../src/content/director';
import type { DialogueView } from '../src/dialogue/DialogueSystem';
import { BOARD_FLAG, boardView } from '../src/game/board/board';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  // Handler errors are logged, not thrown: a quest that threw is a failed test.
  const logged = errors.mock.calls.map((c: unknown[]) => String(c[0]));
  vi.restoreAllMocks();
  expect(logged.filter((m: string) => m.startsWith('[quests]') || m.startsWith('[dialogue]') || m.startsWith('[content]'))).toEqual([]);
});

const Q = 'mq-05-tabula';
const SICARIUS = 'npc-sicarius-caelius';
const TABLET = 'quest-tabula-sicarii';

function world(opts: { date?: { month: number; day: number } } = {}) {
  const fg = fakeGame();
  const game = fg.game as unknown as Record<string, unknown>;
  const spawned: { archetype: string; opts: SpawnOptions }[] = [];
  game.combat = {
    spawnEnemy: (archetype: string, _pos: Vector3, o: SpawnOptions) => {
      spawned.push({ archetype, opts: o });
      return { id: o.id };
    },
    get: () => undefined,
  };
  game.actors = { get: (id: string) => ({ id, position: new Vector3(), teleport: () => {} }) };
  const placed: { id: string; interact(g: unknown): void }[] = [];
  game.interactions = {
    add: (i: { id: string; interact(g: unknown): void }) => {
      placed.push(i);
      return () => {
        const at = placed.indexOf(i);
        if (at >= 0) placed.splice(at, 1);
      };
    },
  };
  const staged: { id: string; x: number; z: number; loop: string | null }[] = [];
  const unstaged: string[] = [];
  game.population = {
    stage: (id: string, x: number, z: number, _heading: number, loop: string | null) => {
      staged.push({ id, x, z, loop });
      return true;
    },
    unstage: (id: string) => {
      unstaged.push(id);
    },
  };
  let steps = 0;
  game.calendar = {
    stepToAnchor: () => {
      steps++;
      return true;
    },
    date: () => ({ year: 113, ...(opts.date ?? { month: 4, day: 12 }) }),
  };
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  return {
    ...fg,
    rpg,
    spawned,
    placed,
    staged,
    unstaged,
    get steps() {
      return steps;
    },
  };
}
type World = ReturnType<typeof world>;

function goTo(w: World, id: string) {
  const l = w.rpg.locations.get(id);
  if (!l) throw new Error(`no place ${id}`);
  (w.game.player!.position as Vector3).set(l.position.x, 0, l.position.z);
  w.step(20);
}

/** Set the clock to `hour` o'clock forward (fires 'time:hour' on the way). */
function setHour(w: World, hour: number) {
  const d = (hour - w.game.time.hour + 24) % 24;
  if (d > 0) w.game.time.advanceHours(d);
}

function talk(w: World, npc: string, ...picks: string[]): DialogueView | null {
  let v = w.rpg.dialogue.start(npc);
  if (!v) throw new Error(`${npc} has nothing to say`);
  for (const p of picks) {
    while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
    if (!v) throw new Error(`${npc}: conversation ended before "${p}"`);
    const i = v.choices.findIndex((c) => c.text.includes(p));
    if (i < 0) throw new Error(`${npc}/${v.nodeId}: no choice "${p}" in ${JSON.stringify(v.choices.map((c) => c.text))}`);
    v = w.rpg.dialogue.choose(i);
  }
  return v;
}

/** Finish the current conversation (continue through text, then close). */
function close(w: World) {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
  if (w.rpg.dialogue.active) w.rpg.dialogue.end();
}

/** The first line a conversation opens on. */
function opening(w: World, npc: string): string {
  const v = w.rpg.dialogue.start(npc);
  const t = v?.text ?? '';
  close(w);
  return t;
}

const status = (w: World) => w.rpg.quests.status(Q);
const objective = (w: World, id: string) => w.rpg.quests.objectives(Q).find((o) => o.id === id);
const give = (w: World, id: string) => w.rpg.inventory.add(id, 1, { source: 'loot' });
const flag = (w: World, name: string) => w.rpg.dialogue.flags.get(name);

/** mq-04 done at 10:00 on 12 May: mq-05 starts. */
function summonsWorld(opts: { spared?: boolean } = {}) {
  const w = world();
  setHour(w, 10);
  give(w, 'quest-tessera-peregrina');
  if (opts.spared) w.rpg.quests.flags.set('bitus-fate', 'spared');
  w.rpg.quests.setStage('mq-04-columna', 'done');
  expect(status(w)).toMatchObject({ running: true, stage: 'summons' });
  return w;
}

/** The morning of 13 May at 07:00, the follower dead and searched: at the gate. */
function gateWorld(opts: { spared?: boolean } = {}) {
  const w = summonsWorld(opts);
  setHour(w, 7);
  goTo(w, 'arch-dolabella');
  expect(status(w)!.stage).toBe('followed');
  w.events.emit('actor:killed', { victimId: SICARIUS, killerId: 'player' });
  expect(status(w)!.stage).toBe('search');
  give(w, TABLET);
  expect(status(w)!.stage).toBe('gate');
  return w;
}

/** In through the gate: Pudens's stage. */
function pudensWorld(opts: { spared?: boolean } = {}) {
  const w = gateWorld(opts);
  talk(w, 'npc-custos-peregrinus', 'Gratus’s token');
  close(w);
  expect(status(w)!.stage).toBe('pudens');
  return w;
}

describe('mq-05-tabula: The Board', () => {
  it('starts when the Column is done; Pudens said tomorrow, so the camp is shut on 12 May', () => {
    const w = summonsWorld();
    expect(w.rpg.quests.state(Q)!.journal.at(-1)!.text).toContain('Castra Peregrina');
    expect(objective(w, 'camp')!.target).toEqual({ kind: 'location', id: 'peregrina-gate-front' });
    expect(w.steps).toBe(0);
    expect(flag(w, 'mq05-camp-open')).toBe(false);
    expect(opening(w, 'npc-custos-peregrinus')).toContain('Come back tomorrow');
    expect(opening(w, 'npc-pudens')).toContain('I said tomorrow');
    // Pudens in his office, Gratus in the infirmary, Mardonius by the gate.
    expect(w.staged.map((s) => s.id)).toEqual(expect.arrayContaining(['npc-pudens', 'npc-gratus', 'npc-mardonius']));
    expect(w.staged.some((s) => s.id === 'npc-bitus-vinctus')).toBe(false);
  });

  it('steps the calendar onto 13 May at midnight and opens the camp at first light', () => {
    const w = summonsWorld();
    setHour(w, 0.5);
    expect(w.steps).toBe(1);
    expect(flag(w, 'mq05-camp-open')).toBe(false);
    setHour(w, 6);
    expect(flag(w, 'mq05-camp-open')).toBe(true);
    expect(opening(w, 'npc-custos-peregrinus')).toContain('Token or business');
    setHour(w, 20);
    expect(flag(w, 'mq05-camp-open')).toBe(false);
    expect(opening(w, 'npc-custos-peregrinus')).toContain('after dark');
  });

  it('near the camp, a water-carrier warns the player and the man in the dark cloak comes for them', () => {
    const w = summonsWorld();
    goTo(w, 'castra-peregrina');
    expect(status(w)!.stage).toBe('followed');
    expect(w.staged.some((s) => s.id === 'npc-aquarius-caelius')).toBe(true);
    expect(w.spawned).toHaveLength(1);
    expect(w.spawned[0]).toMatchObject({ archetype: 'sicarius', opts: { id: SICARIUS, npc: SICARIUS, quest: Q } });
    expect(objective(w, 'follower')!.target).toEqual({ kind: 'npc', id: SICARIUS });
    expect(opening(w, 'npc-aquarius-caelius')).toContain('man in the dark cloak');
  });

  it('his body carries the couriers’ tablet; searching it leads to the gate', () => {
    const w = gateWorld();
    expect(w.rpg.quests.state(Q)!.journal.at(-1)!.text).toContain('THE NEW ONE. CAELIAN. BEFORE THE CAMP.');
    expect(w.rpg.quests.state(Q)!.vars.searched).toBe(true);
  });

  it('the guard lets the player in on Gratus’s token, and Mardonius asks what the archer said', () => {
    const w = pudensWorld();
    expect(objective(w, 'gate')!.done).toBe(true);
    expect(w.unstaged).toContain('npc-mardonius');
    talk(w, 'npc-mardonius', 'Caesar was for later');
    close(w);
    expect(flag(w, 'mq05-told-mardonius')).toBe(true);
    expect(opening(w, 'npc-mardonius')).toContain('I hear it all');
  });

  it('without a token the gate needs a word with the guard; walking past him to the principia also lets the player in', () => {
    const w = gateWorld();
    w.rpg.inventory.remove('quest-tessera-peregrina', 1);
    w.rpg.inventory.remove('anulus-peregrinorum', 1);
    const v = w.rpg.dialogue.start('npc-custos-peregrinus')!;
    expect(v.choices.map((c) => c.text)).toContain('Pudens sent for me. Ask him.');
    close(w);
    goTo(w, 'peregrina-principia-gate');
    expect(status(w)!.stage).toBe('pudens');
  });

  it('Pudens reads the tablet, makes the offer, and the player accepts: the board opens', () => {
    const w = pudensWorld();
    talk(w, 'npc-pudens', 'knife-man’s tablet', 'What was the arrow about?', 'Who are “they”?', 'What do you want from me?');
    expect(objective(w, 'pudens')!.done).toBe(true);
    expect(objective(w, 'accept')).toMatchObject({ done: false });
    const v = w.rpg.dialogue.view!;
    expect(v.choices.map((c) => c.text)).toEqual(expect.arrayContaining(['You’re asking me to be a spy.', 'Why not tell Caesar?', 'What’s in it for me?', 'I’ll work for you.', 'Not yet.']));
    w.rpg.dialogue.choose(v.choices.findIndex((c) => c.text === 'I’ll work for you.'));
    close(w);
    expect(status(w)!.stage).toBe('board');
    expect(flag(w, BOARD_FLAG)).toBe(true);
    expect(w.placed.some((i) => i.id === 'content:mq05-board')).toBe(true);
  });

  it('“Not yet” leaves the offer open; he asks again next time', () => {
    const w = pudensWorld();
    talk(w, 'npc-pudens', 'knife-man’s tablet', 'What do you want from me?', 'Not yet.');
    close(w);
    expect(status(w)!.stage).toBe('pudens');
    expect(opening(w, 'npc-pudens')).toContain('Have you decided?');
    talk(w, 'npc-pudens', 'I’ll work for you.');
    close(w);
    expect(status(w)!.stage).toBe('board');
  });

  it('looking at the board ends Act I: rewards, the banner, the board in the journal', () => {
    const w = pudensWorld();
    const banners: unknown[] = [];
    w.events.on('ui:banner', (e) => banners.push(e));
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-pudens', 'knife-man’s tablet', 'What do you want from me?', 'I’ll work for you.');
    close(w);
    w.placed.find((i) => i.id === 'content:mq05-board')!.interact(w.game);
    expect(status(w)).toMatchObject({ running: false, stage: 'done' });
    expect(w.rpg.quests.status(Q)!.completed).toBe(true);
    expect(w.rpg.inventory.denarii - before).toBe(100);
    expect(banners).toEqual([expect.objectContaining({ label: 'Act II', title: 'The Board' })]);
    expect(w.placed.some((i) => i.id === 'content:mq05-board')).toBe(false);
    const view = boardView({ hasItem: (id) => w.rpg.inventory.count(id) > 0, flag: (n) => w.rpg.quests.flags.get(n) })!;
    expect(view.notes.map((n) => n.id)).toContain('tabula-sicarii');
    expect(opening(w, 'npc-pudens')).toContain('Where do you want to start');
  });

  it('a spared Bitus is in the cell: Pudens mentions him, and he says where Mucapor trains', () => {
    const w = pudensWorld({ spared: true });
    expect(w.staged.some((s) => s.id === 'npc-bitus-vinctus')).toBe(true);
    expect(objective(w, 'bitus')).toBeUndefined();
    talk(w, 'npc-pudens', 'knife-man’s tablet', 'What happened to the archer?');
    close(w);
    expect(objective(w, 'bitus')).toMatchObject({ done: false, optional: true });
    talk(w, 'npc-bitus-vinctus', 'Where do I find Mucapor?');
    close(w);
    expect(objective(w, 'bitus')!.done).toBe(true);
    expect(flag(w, 'mq05-bitus-mucapor')).toBe(true);
  });

  it('Gratus in the infirmary is optional', () => {
    const w = pudensWorld();
    expect(objective(w, 'gratus')).toMatchObject({ optional: true, done: false });
    talk(w, 'npc-gratus', 'What does Pudens want with me?');
    close(w);
    expect(objective(w, 'gratus')!.done).toBe(true);
  });

  it('a save from after the Column but before this chapter starts it on load, with the camp already open', () => {
    const w = world({ date: { month: 4, day: 16 } });
    setHour(w, 10);
    w.rpg.quests.setStage('mq-04-columna', 'done');
    // An older build's save: mq-04 completed, and no mq-05 at all.
    const old = w.rpg.quests.serialize();
    delete old.states[Q];
    w.rpg.quests.restore(old);
    expect(status(w)!.running).toBe(false);
    w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
    expect(status(w)).toMatchObject({ running: true, stage: 'summons' });
    setHour(w, 9);
    expect(flag(w, 'mq05-camp-open')).toBe(true);
  });
});
