/**
 * Scripted runs of the QUESTS II crew's side quests (docs/design/world-life.md §4.8 Q4-Q6;
 * acceptance F/G 1-4): from the offer to every ending, against the real QuestSystem, DialogueSystem
 * and RPG services, with fake combat, population and interaction services that record what the
 * quests ask of them. The tracker stays on the main quest throughout; every quest is offered by a
 * rumour or a notice that disappears once it has started; Mercury's Water waits for the Ides.
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnOptions } from '../src/content/director';
import type { DialogueView } from '../src/dialogue/DialogueSystem';
import { crispina } from '../src/dialogue/content/misc-life-g';
import { LIFE } from '../src/life/registry';
import { RumourMill } from '../src/life/rumours';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  const logged = errors.mock.calls.map((c: unknown[]) => String(c[0]));
  vi.restoreAllMocks();
  // A handler that threw is a failed test.
  expect(logged.filter((m: string) => m.startsWith('[quests]') || m.startsWith('[dialogue]') || m.startsWith('[content]'))).toEqual([]);
});

// ------------------------------------------------------------------ the world

interface Staged {
  id: string;
  x: number;
  z: number;
  loop: string | null;
}

function world() {
  const fg = fakeGame();
  const game = fg.game as unknown as Record<string, unknown>;
  // Combat: records what the quests ask for; `engage` is for NPCs already in the world.
  const engaged: string[] = [];
  const spawned: { archetype: string; opts: SpawnOptions }[] = [];
  game.combat = {
    spawnEnemy: (archetype: string, _pos: Vector3, opts: SpawnOptions) => (spawned.push({ archetype, opts }), { id: opts.id }),
    engage: (id: string) => void engaged.push(id),
  };
  // Population: staging, holding, witnesses.
  const staged: Staged[] = [];
  const unstaged: string[] = [];
  const held: string[] = [];
  const walked: string[] = [];
  const pop = {
    witness: [] as string[],
    get: (id: string) => ({ id }),
    direct: (npc: { id: string }) => (walked.push(npc.id), true),
    undirect: () => {},
    stage: (id: string, x: number, z: number, _h: number, loop: string | null) => (staged.push({ id, x, z, loop }), true),
    unstage: (id: string) => void unstaged.push(id),
    holdNamed: (id: string) => (held.push(id), () => {}),
    witnesses: () => pop.witness,
  };
  game.population = pop;
  game.actors = { get: (id: string) => (['npc-daos-man-a', 'npc-daos-man-b'].includes(id) ? { id, position: new Vector3() } : undefined) };
  const placed: string[] = [];
  game.interactions = { add: (i: { id: string }) => (placed.push(i.id), () => placed.splice(placed.indexOf(i.id), 1)) };
  // The game opens on 11 May (the bare clock starts on the 13th).
  Object.assign(fg.game.time, { start: { year: 113, month: 4, day: 11 } });
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  rpg.quests.setStage('mq-01-madida-capena', 'done'); // the opening night is over; mq-02 leads the tracker
  rpg.inventory.addDenarii(100);
  // The fence's line is content only when the QUESTS I crew's keeper is in the life data; the test brings it either way.
  if (!rpg.dialogue.get('dlg-tess-crispina')) rpg.dialogue.register(crispina);
  return { ...fg, rpg, pop, staged, unstaged, held, walked, placed, engaged, spawned };
}
type World = ReturnType<typeof world>;

const MAIN = 'mq-02-tabella';
/** The main quest after the Lemuria night. */
const MAIN_ACT_I_END = 'mq-04-columna';
const status = (w: World, id: string) => w.rpg.quests.status(id);
const flag = (w: World, name: string) => w.rpg.dialogue.flags.get(name);
const lastJournal = (w: World, id: string) => w.rpg.quests.state(id)!.journal.at(-1)!.text;
const kill = (w: World, id: string, tags?: string[]) => w.events.emit('actor:killed', { victimId: id, killerId: 'player', tags });
const yieldTo = (w: World, id: string) => w.events.emit('actor:yielded', { actorId: id, byId: 'player' });
const pass = (w: World) => void (w.rpg.dialogue.rng = { next: () => 0.01 });
const fail = (w: World) => void (w.rpg.dialogue.rng = { next: () => 0.99 });

/** Walk the player into a named place so the location system fires. */
function goTo(w: World, id: string) {
  const l = w.rpg.locations.get(id);
  if (!l) throw new Error(`no place ${id}`);
  (w.game.player!.position as Vector3).set(l.position.x, 0, l.position.z);
  w.step(20);
}

/** Leave every place (so entering one again fires). */
function away(w: World) {
  (w.game.player!.position as Vector3).set(9000, 0, 9000);
  w.step(20);
}

/** Talk to someone, picking choices whose text contains each string; returns the last view. */
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

/** Pick a choice in the conversation already open. */
function pick(w: World, p: string): DialogueView | null {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
  if (!v) throw new Error(`no conversation open for "${p}"`);
  const i = v.choices.findIndex((c) => c.text.includes(p));
  if (i < 0) throw new Error(`${v.npcId}/${v.nodeId}: no choice "${p}" in ${JSON.stringify(v.choices.map((c) => c.text))}`);
  return w.rpg.dialogue.choose(i);
}

function close(w: World) {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length) v = w.rpg.dialogue.advance();
  w.rpg.dialogue.end();
}

/** Advance the clock to the next time it is `hour` o'clock. */
function waitUntil(w: World, hour: number) {
  const now = w.game.time.hour;
  w.game.time.advanceHours(((hour - now + 24) % 24) || 24);
}

/** Advance to the given calendar day of May (11 = the start) at `hour`. */
function waitUntilDay(w: World, day: number, hour: number) {
  w.game.time.advanceHours(Math.max(0, (day - 11) * 24 + hour - w.game.time.totalHours));
}

/** Continue through text-only nodes to the next choices (or the end). */
function through(w: World) {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
}

// ------------------------------------------------------------------ Q4 Forged Tokens

const TESS = 'misc-tesserae-falsae';

/** The quest up to the point where the player is at the dice table (stage lucrio). */
function toLucrio(w: World) {
  waitUntil(w, 9);
  goTo(w, 'minucia-dole');
  talk(w, 'npc-eutychus-libertus', 'I’ll find out who is making these.');
  close(w);
  talk(w, 'keeper-minucia-curator', 'I’ll find the mould.');
  close(w);
  waitUntil(w, 20.5);
  away(w);
}

describe('misc-tesserae-falsae: Forged Tokens', () => {
  it('the scene at the dole shows once, in the morning after the opening, and Eutychus offers the quest', () => {
    const w = world();
    const subs: string[] = [];
    w.events.on('ui:subtitle', (e) => subs.push(e.speaker ?? ''));
    waitUntil(w, 15);
    goTo(w, 'minucia-dole');
    expect(flag(w, 'tess-scene')).toBeUndefined(); // afternoon: the dole is over
    away(w);
    waitUntil(w, 9);
    goTo(w, 'minucia-dole');
    expect(flag(w, 'tess-scene')).toBe(true);
    expect(subs[0]).toBe('Curator of the dole');
    expect(status(w, TESS)?.running ?? false).toBe(false); // a scene is not an acceptance
    talk(w, 'npc-eutychus-libertus', 'Who sold it to you?');
    expect(w.rpg.dialogue.view!.text).toContain('Lucrio');
    pick(w, 'I’ll find out');
    expect(status(w, TESS)).toMatchObject({ running: true, stage: 'curator' });
    expect(w.rpg.inventory.count('tessera-falsa')).toBe(1);
    expect(w.rpg.quests.tracked).toBe(MAIN); // never takes the tracker from the main quest
  });

  it('persuade Lucrio → the yard → the curator: 20 den., Fama plebs +5, Lucrio is taken away (through a reload)', () => {
    const w = world();
    toLucrio(w);
    expect(status(w, TESS)).toMatchObject({ running: true, stage: 'lucrio' });
    expect(w.rpg.quests.tracked).toBe(MAIN);
    pass(w);
    talk(w, 'npc-lucrio-plumbarius', 'Eutychus bought a token');
    close(w);
    expect(status(w, TESS)!.stage).toBe('yard');
    expect(flag(w, 'tess-consent')).toBe(true);
    expect(w.placed).toContain('content:tess-moulds');
    // He told me where: no theft, even with a witness about.
    w.pop.witness = ['npc-passer-by'];
    w.events.emit('content:interact', { id: 'tess-moulds' });
    expect(w.rpg.inventory.count('forma-tesserarum')).toBe(1);
    expect(w.rpg.crime.bounty()).toBe(0);
    expect(status(w, TESS)!.stage).toBe('choose');
    // Not before the curator is at his table: he is in the dialogue wherever the player finds him.
    const before = w.rpg.inventory.denarii;
    const rep = w.rpg.factions.reputation('plebs');
    talk(w, 'keeper-minucia-curator', 'Here are the moulds');
    close(w);
    expect(status(w, TESS)).toMatchObject({ completed: true, stage: 'done-curator' });
    expect(w.rpg.inventory.denarii).toBe(before + 20);
    expect(w.rpg.factions.reputation('plebs')).toBe(rep + 5);
    expect(w.rpg.inventory.count('forma-tesserarum')).toBe(0);
    expect(w.held).toContain('npc-lucrio-plumbarius');
    expect(flag(w, 'tess-lucrio-taken')).toBe(true);
    expect(lastJournal(w, TESS)).toContain('I gave the moulds');
    expect(w.rpg.quests.tracked).toBe(MAIN);
    // The trigger keeps him out after a load.
    w.held.length = 0;
    w.events.emit('save:loaded', {} as never);
    expect(w.held).toEqual(['npc-lucrio-plumbarius']);
    // The talk afterwards.
    expect(talk(w, 'npc-eutychus-libertus')!.text).toContain('four denarii');
  });

  it('stake Lucrio at tali: lose twice and the table closes; win once and he talks', () => {
    const w = world();
    toLucrio(w);
    fail(w);
    const purse = w.rpg.inventory.denarii;
    talk(w, 'npc-lucrio-plumbarius', 'Deal me in');
    expect(w.rpg.dialogue.view!.nodeId).toBe('lThrow');
    expect(w.rpg.inventory.denarii).toBe(purse - 2);
    pick(w, 'Another throw'); // back to l0 with the stake
    expect(w.rpg.dialogue.view!.nodeId).toBe('l0');
    pick(w, 'Deal me in');
    expect(w.rpg.dialogue.view!.nodeId).toBe('lThrow');
    expect(w.rpg.inventory.denarii).toBe(purse - 4);
    expect(w.rpg.dialogue.view!.choices.map((c) => c.text)).not.toContain('Another throw.');
    close(w);
    expect(status(w, TESS)!.stage).toBe('lucrio');
    // Enough of your luck for one day: the table closes, and opens again tomorrow night.
    expect(() => talk(w, 'npc-lucrio-plumbarius', 'Deal me in')).toThrow(/no choice/);
    close(w);
    w.game.time.advanceHours(24);
    pass(w);
    talk(w, 'npc-lucrio-plumbarius', 'Deal me in');
    expect(w.rpg.dialogue.view!.nodeId).toBe('lThrow');
    pick(w, 'You owe me a word');
    close(w);
    expect(status(w, TESS)!.stage).toBe('yard');
    expect(flag(w, 'tess-consent')).toBe(true);
  });

  it('follow Lucrio home, take the moulds with a witness about: theft, then sell them to Crispina (30 den., Infamia +5, the tokens stay about)', () => {
    const w = world();
    toLucrio(w);
    talk(w, 'npc-lucrio-plumbarius', 'Say nothing');
    close(w);
    expect(status(w, TESS)!.stage).toBe('follow');
    expect(w.walked).toContain('npc-lucrio-plumbarius'); // he walks to the yard and the player follows
    expect(flag(w, 'tess-consent')).toBeUndefined();
    goTo(w, 'lucrio-yard');
    expect(status(w, TESS)!.stage).toBe('yard');
    w.pop.witness = ['npc-passer-by'];
    w.events.emit('content:interact', { id: 'tess-moulds' });
    expect(w.rpg.inventory.count('forma-tesserarum')).toBe(1);
    expect(w.rpg.crime.bounty()).toBeGreaterThan(0); // furtum, seen
    // The curator would pay; the fence pays more.
    const before = w.rpg.inventory.denarii;
    const infamia = w.rpg.standing.infamia;
    expect(talk(w, 'keeper-subura-receptatrix')!.nodeId).toBe('sOffer');
    pick(w, 'Thirty. Done.');
    close(w);
    expect(status(w, TESS)).toMatchObject({ completed: true, stage: 'done-sold' });
    expect(w.rpg.inventory.denarii).toBe(before + 30);
    expect(w.rpg.standing.infamia).toBeGreaterThan(infamia);
    expect(flag(w, 'tokens-still-about')).toBe(true);
    expect(w.held).toEqual([]); // Lucrio is still at his dice
    expect(talk(w, 'npc-eutychus-libertus')!.text).toContain('still about');
  });

  it('an unseen theft is no crime; killing Lucrio still leaves the way to the yard', () => {
    const w = world();
    toLucrio(w);
    kill(w, 'npc-lucrio-plumbarius', ['dead']);
    expect(status(w, TESS)!.stage).toBe('yard');
    w.pop.witness = [];
    w.events.emit('content:interact', { id: 'tess-moulds' });
    expect(w.rpg.crime.bounty()).toBe(0);
    expect(status(w, TESS)!.stage).toBe('choose');
  });

  it('a reload in the yard puts the search back', () => {
    const w = world();
    toLucrio(w);
    pass(w);
    talk(w, 'npc-lucrio-plumbarius', 'Eutychus bought a token');
    close(w);
    w.placed.length = 0;
    w.events.emit('save:loaded', {} as never);
    expect(w.placed).toEqual(['content:tess-moulds']);
  });
});

// ------------------------------------------------------------------ Q5 Mercury's Water

const MERC = 'misc-mercuralia';
const LUCIUS = 'keeper-boarium-olearius';

/** The quest started on 11 May, then the Ides at dawn at the spring: the stage is `clerk`. */
function toClerk(w: World) {
  waitUntil(w, 9);
  talk(w, 'npc-clericus-aedilium', 'I’d like to see a measure proved');
  close(w);
  waitUntilDay(w, 15, 5.5);
  goTo(w, 'mercury-spring-crowd');
}

describe('misc-mercuralia: Mercury’s Water', () => {
  it('is offered on 11 May and waits: nothing plays out before the Ides', () => {
    const w = world();
    waitUntil(w, 9);
    expect(w.game.time.date().day).toBe(11);
    expect(talk(w, 'npc-clericus-aedilium')!.nodeId).toBe('m0');
    pick(w, 'I’d like to see a measure proved');
    close(w);
    expect(status(w, MERC)).toMatchObject({ running: true, stage: 'start' });
    expect(w.rpg.quests.tracked).toBe(MAIN);
    // The spring on the 11th (or any day before the Ides): nothing.
    waitUntil(w, 5.5);
    goTo(w, 'fons-mercurii');
    expect(status(w, MERC)!.stage).toBe('start');
    expect(w.staged).toEqual([]);
    waitUntilDay(w, 14, 5.5);
    expect(status(w, MERC)!.stage).toBe('start');
    expect(w.staged).toEqual([]);
    // The Ides at dawn: the quest moves on by itself and the merchants come to the spring.
    waitUntilDay(w, 15, 5.5);
    expect(w.game.time.date()).toMatchObject({ month: 4, day: 15 });
    expect(status(w, MERC)!.stage).toBe('spring');
    const ids = w.staged.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([LUCIUS, 'npc-mercurialis-a', 'npc-mercurialis-b', 'npc-mercurialis-c']));
    expect(w.staged.find((s) => s.id === LUCIUS)!.loop).toBe('pray');
  });

  it('overhear Lucius, borrow the measure, test it, and REPORT him: 10 den., his stall sealed eight days', () => {
    const w = world();
    toClerk(w);
    expect(status(w, MERC)!.stage).toBe('clerk'); // the prayer was overheard
    waitUntil(w, 9);
    talk(w, 'npc-clericus-aedilium', 'Lend me the aediles’ sextarius');
    close(w);
    expect(w.rpg.inventory.count('mensura-aedilicia')).toBe(1);
    expect(status(w, MERC)!.stage).toBe('test');
    talk(w, LUCIUS, 'fill this sextarius');
    through(w);
    expect(flag(w, 'merc-short')).toBe(true);
    expect(status(w, MERC)!.stage).toBe('choose');
    close(w);
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-clericus-aedilium', 'I’ll report him');
    close(w);
    expect(status(w, MERC)).toMatchObject({ completed: true, stage: 'done-report' });
    expect(w.rpg.inventory.denarii).toBe(before + 10);
    expect(w.rpg.inventory.count('mensura-aedilicia')).toBe(0);
    // Sealed: "Closed. By order of the aediles." for eight days, then the shop is his again.
    expect(talk(w, LUCIUS)!.nodeId).toBe('lSealed');
    close(w);
    w.game.time.advanceHours(8 * 24 + 1);
    expect(w.rpg.dialogue.start(LUCIUS)?.dialogueId).not.toBe('dlg-merc-lucius'); // nothing of the quest's: the keeper's own talk is underneath
    expect(w.rpg.quests.tracked).toBe(MAIN);
  });

  it('SQUEEZE him: 15 den., Infamia +3, and he keeps selling', () => {
    const w = world();
    toClerk(w);
    waitUntil(w, 9);
    talk(w, 'npc-clericus-aedilium', 'Lend me the aediles’ sextarius');
    close(w);
    talk(w, LUCIUS, 'fill this sextarius');
    const before = w.rpg.inventory.denarii;
    const infamia = w.rpg.standing.infamia;
    pick(w, 'Fifteen denarii');
    close(w);
    expect(status(w, MERC)).toMatchObject({ completed: true, stage: 'done-squeeze' });
    expect(w.rpg.inventory.denarii).toBe(before + 15);
    expect(w.rpg.standing.infamia).toBe(infamia + 3);
    expect(flag(w, 'merc-squeezed')).toBe(true);
    expect(w.rpg.dialogue.start(LUCIUS)?.dialogueId).not.toBe('dlg-merc-lucius');
  });

  it('WARN him that Mercury sees (Rhetoric 40): Pietas, and he sells at cost; a failed warning can be followed by another way', () => {
    const w = world();
    toClerk(w);
    waitUntil(w, 9);
    talk(w, 'npc-clericus-aedilium', 'Lend me the aediles’ sextarius');
    close(w);
    fail(w);
    talk(w, LUCIUS, 'fill this sextarius');
    pick(w, 'Mercury heard you');
    expect(status(w, MERC)!.stage).toBe('choose'); // the warning failed
    close(w);
    pass(w);
    // A failed approach is locked with this person for a day; the clerk is the other way. Wait it out.
    w.game.time.advanceHours(25);
    const pietas = w.rpg.sheet.vitals.pietas.current;
    talk(w, LUCIUS, 'Mercury heard you');
    close(w);
    expect(status(w, MERC)).toMatchObject({ completed: true, stage: 'done-warn' });
    expect(flag(w, 'septimius-at-cost')).toBe(true);
    expect(w.rpg.sheet.vitals.pietas.current).toBeGreaterThan(pietas);
    expect(lastJournal(w, MERC)).toContain('at cost');
  });

  it('arriving after the third hour: the clerk tells what Lucius prayed', () => {
    const w = world();
    waitUntil(w, 9);
    talk(w, 'npc-clericus-aedilium', 'I’d like to see a measure proved');
    close(w);
    waitUntilDay(w, 15, 9.5);
    expect(status(w, MERC)!.stage).toBe('spring');
    expect(w.staged).toEqual([]); // the merchants are gone home
    goTo(w, 'mercury-spring-crowd');
    expect(status(w, MERC)!.stage).toBe('spring');
    talk(w, 'npc-clericus-aedilium', 'Was Lucius Septimius at the spring');
    close(w);
    expect(status(w, MERC)!.stage).toBe('clerk');
  });

  it('a missed Ides fails the quest with a journal line: the day goes by, or a long rest skips it', () => {
    const w = world();
    waitUntil(w, 9);
    talk(w, 'npc-clericus-aedilium', 'I’d like to see a measure proved');
    close(w);
    waitUntilDay(w, 15, 20);
    expect(status(w, MERC)!.stage).toBe('spring'); // still the Ides: the clerk keeps his table until the tenth hour, but the quest waits for the player
    w.game.time.advanceHours(6); // past midnight: the 16th
    expect(status(w, MERC)).toMatchObject({ failed: true, stage: 'missed' });
    expect(lastJournal(w, MERC)).toContain('Ides came and went');
    expect(w.unstaged).toEqual(expect.arrayContaining(['npc-mercurialis-a']));
    expect(w.rpg.quests.tracked).toBe(MAIN);

    // A long rest over the whole day (five days in one jump).
    const w2 = world();
    waitUntil(w2, 9);
    talk(w2, 'npc-clericus-aedilium', 'I’d like to see a measure proved');
    close(w2);
    w2.game.time.advanceHours(24 * 5 + 1);
    expect(status(w2, MERC)).toMatchObject({ failed: true, stage: 'missed' });
  });

  it('once the measure is tested the choice can wait a day', () => {
    const w = world();
    toClerk(w);
    waitUntil(w, 9);
    talk(w, 'npc-clericus-aedilium', 'Lend me the aediles’ sextarius');
    close(w);
    talk(w, LUCIUS, 'fill this sextarius');
    through(w);
    close(w);
    expect(status(w, MERC)!.stage).toBe('choose');
    w.game.time.advanceHours(30);
    expect(status(w, MERC)!.stage).toBe('choose');
  });
});

// ------------------------------------------------------------------ Q6 Free by the God's Hand

const SERVUS = 'misc-servus-aesculapii';

/** After the Lemuria night (mq-03 done): Daos accepts, two witnesses speak; the stage is `bridge`. */
function toBridge(w: World, third = false) {
  w.rpg.quests.start('mq-03-lemuria');
  w.rpg.quests.complete('mq-03-lemuria');
  waitUntil(w, 10);
  talk(w, 'npc-daos', 'I’ll help you.');
  close(w);
  expect(status(w, SERVUS)).toMatchObject({ running: true, stage: 'proofs' });
  talk(w, 'npc-philo-aedituus', 'Will you say so');
  close(w);
  expect(status(w, SERVUS)!.stage).toBe('proofs'); // one is not enough
  pass(w);
  talk(w, 'npc-cleon-aegrotus', 'Say that on the bridge');
  close(w);
  expect(status(w, SERVUS)!.stage).toBe('bridge');
  if (third) {
    talk(w, 'npc-bato-carter', '(Give him two denarii');
    close(w);
    expect(flag(w, 'daos-proofs')).toBe(3);
  }
}

describe('misc-servus-aesculapii: Free by the God’s Hand', () => {
  it('waits for the Lemuria night to be over, and the first talk with Daos is only gratitude', () => {
    const w = world();
    waitUntil(w, 10);
    expect(talk(w, 'npc-daos')!.nodeId).toBe('dIdle');
    close(w);
  });

  it('three proofs, the steward persuaded (Rhetoric 55 − 15 each), Daos told: the amulet, Pietas, Fama plebs +3', () => {
    const w = world();
    toBridge(w, true);
    expect(w.rpg.quests.tracked).toBe(MAIN_ACT_I_END); // mq-03 done: the Column leads
    // Not at the wrong hour: the steward is on the bridge from the third hour.
    expect(w.staged.map((s) => s.id)).not.toContain('npc-stichus-actor');
    waitUntil(w, 8);
    goTo(w, 'pons-fabricius');
    expect(w.staged.map((s) => s.id)).toEqual(expect.arrayContaining(['npc-stichus-actor', 'npc-daos-man-a', 'npc-daos-man-b']));
    pass(w);
    const rep = w.rpg.factions.reputation('plebs');
    talk(w, 'npc-stichus-actor');
    // Three proofs: the easy persuasion (DC 10) is the one offered.
    expect(w.rpg.dialogue.view!.choices.some((c) => c.text.includes('three witnesses'))).toBe(true);
    pick(w, 'three witnesses');
    close(w);
    expect(status(w, SERVUS)!.stage).toBe('report');
    expect(flag(w, 'daos-method')).toBe('persuaded');
    talk(w, 'npc-daos');
    expect(w.rpg.dialogue.view!.nodeId).toBe('dFree');
    close(w);
    expect(status(w, SERVUS)).toMatchObject({ completed: true, stage: 'done' });
    expect(w.rpg.inventory.count('amuletum-syrium')).toBe(1);
    expect(w.rpg.factions.reputation('plebs')).toBe(rep + 3);
    // Worn, the amulet is an amulet.
    expect(w.rpg.inventory.equip('amuletum-syrium')).toBe(true);
    expect(w.rpg.sheet.hasFlag('amulet')).toBe(true);
    expect(w.rpg.quests.tracked).toBe(MAIN_ACT_I_END); // mq-03 done: the Column leads
    expect(w.unstaged).toEqual(expect.arrayContaining(['npc-stichus-actor']));
  });

  it('two proofs and a bribe of 10 den.', () => {
    const w = world();
    toBridge(w);
    waitUntil(w, 8);
    goTo(w, 'pons-fabricius');
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-stichus-actor', 'Ten denarii');
    close(w);
    expect(w.rpg.inventory.denarii).toBe(before - 10);
    expect(flag(w, 'daos-method')).toBe('bribed');
    expect(status(w, SERVUS)!.stage).toBe('report');
  });

  it('two proofs, a failed persuasion (DC 25) locks that approach; fists with his two men then settle it', () => {
    const w = world();
    toBridge(w);
    waitUntil(w, 8);
    goTo(w, 'pons-fabricius');
    fail(w);
    talk(w, 'npc-stichus-actor');
    expect(w.rpg.dialogue.view!.choices.some((c) => c.text.includes('three witnesses'))).toBe(false);
    pick(w, 'attendant’s word');
    expect(status(w, SERVUS)!.stage).toBe('bridge');
    pick(w, 'Your men are big');
    close(w);
    expect(status(w, SERVUS)!.stage).toBe('fight');
    expect(w.engaged).toEqual(['npc-daos-man-a', 'npc-daos-man-b']); // fists: they are in the world, so combat engages them
    expect(w.spawned).toEqual([]);
    kill(w, 'npc-daos-man-a');
    yieldTo(w, 'npc-daos-man-b');
    expect(status(w, SERVUS)!.stage).toBe('report');
    expect(flag(w, 'daos-method')).toBe('fought');
  });

  it('steel kills one of them: the quest fails; being beaten sends the player back to the bridge', () => {
    const w = world();
    toBridge(w);
    waitUntil(w, 8);
    goTo(w, 'pons-fabricius');
    talk(w, 'npc-stichus-actor', 'Your men are big');
    close(w);
    expect(status(w, SERVUS)!.stage).toBe('fight');
    kill(w, 'npc-daos-man-a', ['dead']);
    expect(status(w, SERVUS)).toMatchObject({ failed: true, stage: 'fail' });

    const w2 = world();
    toBridge(w2);
    waitUntil(w2, 8);
    goTo(w2, 'pons-fabricius');
    talk(w2, 'npc-stichus-actor', 'Your men are big');
    close(w2);
    w2.events.emit('actor:yielded', { actorId: 'player' });
    expect(status(w2, SERVUS)!.stage).toBe('bridge');
  });

  it('the carter needs persuading or a coin; a witness who has spoken says so', () => {
    const w = world();
    w.rpg.quests.start('mq-03-lemuria');
    w.rpg.quests.complete('mq-03-lemuria');
    waitUntil(w, 10);
    talk(w, 'npc-daos', 'I’ll help you.');
    close(w);
    fail(w);
    talk(w, 'npc-bato-carter', 'carry the truth');
    close(w);
    expect(flag(w, 'daos-proofs')).toBeUndefined();
    talk(w, 'npc-bato-carter', '(Give him two denarii');
    close(w);
    expect(flag(w, 'daos-proofs')).toBe(1);
    expect(talk(w, 'npc-bato-carter')!.nodeId).toBe('cDone');
  });
});

// ------------------------------------------------------------------ the offers (acceptance 3)

describe('the offers: every quest has a rumour and a notice that go once the quest has started', () => {
  const HOOKS = ['misc-tesserae-falsae', 'misc-mercuralia', 'misc-servus-aesculapii'];

  it('each quest has a talk rumour, a notice and a board it is on', () => {
    for (const q of HOOKS) {
      const hooked = LIFE.rumours.filter((r) => r.hook === q);
      expect(hooked.map((r) => r.kind), q).toEqual(expect.arrayContaining(['talk', 'notice']));
      expect(hooked.find((r) => r.kind === 'notice')!.boards!.length, q).toBeGreaterThan(0);
    }
    expect(LIFE.rumours.find((r) => r.id === 'rum.quests-g.tokens-notice')!.boards).toContain('board-subura'); // §4.8 Q4
    expect(LIFE.rumours.find((r) => r.id === 'rum.quests-g.daos-notice')!.boards).toContain('board-ceres'); // §4.8 Q6
  });

  it('none is told before the opening is done; each is told after; each drops out once its quest has started', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
    const mill = new RumourMill(fg.game, LIFE.rumours);
    const hooked = LIFE.rumours.filter((r) => HOOKS.includes(r.hook ?? ''));
    for (const r of hooked) expect(mill.allowed(r), `${r.id} before mq-01`).toBe(false);
    rpg.quests.setStage('mq-01-madida-capena', 'done');
    rpg.quests.start('mq-03-lemuria');
    rpg.quests.complete('mq-03-lemuria');
    for (const r of hooked) expect(mill.allowed(r), `${r.id} after mq-01 and mq-03`).toBe(true);
    for (const q of HOOKS) {
      const picks = (where: { board?: string; kind?: 'talk' | 'cry' | 'notice' }) => mill.pick(where, 50).filter((r) => r.hook === q).map((r) => r.id);
      const board = LIFE.rumours.find((r) => r.hook === q && r.kind === 'notice')!.boards![0];
      expect(picks({ board }), `${q} on ${board}`).not.toEqual([]);
      rpg.quests.start(q);
      for (const r of hooked.filter((x) => x.hook === q)) expect(mill.allowed(r), `${r.id} after the start`).toBe(false);
      expect(picks({ board })).toEqual([]);
    }
  });

  it('the Daos case is not offered in the Lemuria night (mq-03 not done)', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
    rpg.quests.setStage('mq-01-madida-capena', 'done');
    const mill = new RumourMill(fg.game, LIFE.rumours);
    for (const r of LIFE.rumours.filter((x) => x.hook === 'misc-servus-aesculapii')) expect(mill.allowed(r)).toBe(false);
  });

  it('the notice starts the quest at its first stage, and the journal tracks it only when no main quest runs', () => {
    const w = world();
    expect(w.rpg.quests.start(TESS)).toBe(true);
    expect(status(w, TESS)!.stage).toBe('start');
    expect(w.rpg.quests.tracked).toBe(MAIN);
    expect(w.rpg.quests.start(MERC)).toBe(true);
    expect(w.rpg.quests.tracked).toBe(MAIN);
    expect(w.rpg.quests.start(SERVUS)).toBe(true);
    expect(w.rpg.quests.tracked).toBe(MAIN);
  });
});
