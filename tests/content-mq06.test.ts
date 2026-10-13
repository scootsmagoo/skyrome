/**
 * The mq-06 quest, "The Purse" (docs/STORY.md chapter 6), against the real QuestSystem, DialogueSystem
 * and RPG services. Stubbed: the population (stage/unstage record calls), the combat service (spawns
 * recorded), the interactions (the sacks and the chest are recorded and fired by hand), and the
 * calendar. The warehouse's places are the content fallbacks (content/places.ts). The clock moves with
 * setHour(); the dice with roll() (0 always passes a Rhetoric check, 0.999 always fails).
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnOptions } from '../src/content/director';
import type { DialogueView } from '../src/dialogue/DialogueSystem';
import { boardView } from '../src/game/board/board';
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  expect(logged.filter((m: string) => m.startsWith('[quests]') || m.startsWith('[dialogue]') || m.startsWith('[content]'))).toEqual([]);
});

const Q = 'mq-06-sacculus';
const DRACHM = 'quest-drachma-parthica';
const ARROW = 'quest-sagitta-dacica';
const LEDGER = 'quest-rationes-euhodi';
const TABLETS = 'quest-tabulae-lyci';
const PAPERS = 'quest-chartae-aviti';
const KNIVES = ['sica-aviti-1', 'sica-aviti-2'];

function world() {
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
  // Who exists in the world: the spawned knife-men until `gone()` is called.
  const alive = new Set<string>();
  game.actors = { get: (id: string) => (alive.has(id) ? { id, position: new Vector3(), teleport: () => {} } : undefined) };
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
  game.calendar = { stepToAnchor: () => true, date: () => ({ year: 113, month: 4, day: 20 }) };
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  const subtitles: { speaker: string; text: string }[] = [];
  fg.events.on('ui:subtitle', (e) => subtitles.push({ speaker: e.speaker ?? '', text: e.text }));
  const notices: string[] = [];
  fg.events.on('ui:notify', (e) => notices.push(e.text));
  return {
    ...fg,
    rpg,
    spawned,
    placed,
    staged,
    unstaged,
    subtitles,
    notices,
    alive,
    /** Whether the quest's examine spot `key` is on offer. */
    has: (key: string) => placed.some((i) => i.id === `content:${key}`),
    /** Use the spot. */
    use: (key: string) => placed.find((i) => i.id === `content:${key}`)!.interact(fg.game),
  };
}
type World = ReturnType<typeof world>;

/** Set the clock to `hour` o'clock forward (fires 'time:hour' on the way). */
function setHour(w: World, hour: number) {
  const d = (hour - w.game.time.hour + 24) % 24;
  if (d > 0) w.game.time.advanceHours(d);
}

/** The next Rhetoric rolls pass (true) or fail (false). */
function roll(w: World, pass: boolean) {
  w.rpg.dialogue.rng = { next: () => (pass ? 0 : 0.999) };
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

/** Continue the open conversation: past plain text, then the choice containing `pick`. */
function talk_on(w: World, pick: string): DialogueView | null {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
  const i = v?.choices.findIndex((c) => c.text.includes(pick)) ?? -1;
  if (!v || i < 0) throw new Error(`no choice "${pick}" in ${JSON.stringify(v?.choices.map((c) => c.text))}`);
  return w.rpg.dialogue.choose(i);
}

/** Finish the current conversation (continue through text, then close). */
function close(w: World) {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
  if (w.rpg.dialogue.active) w.rpg.dialogue.end();
}

/** Talk, pick, and close the conversation. */
function say(w: World, npc: string, ...picks: string[]) {
  talk(w, npc, ...picks);
  close(w);
}

/** The first line a conversation opens on. */
function opening(w: World, npc: string): string {
  const v = w.rpg.dialogue.start(npc);
  const t = v?.text ?? '';
  close(w);
  return t;
}

const status = (w: World) => w.rpg.quests.status(Q);
const stageOf = (w: World) => status(w)?.stage;
const objective = (w: World, id: string) => w.rpg.quests.objectives(Q).find((o) => o.id === id);
const give = (w: World, id: string) => w.rpg.inventory.add(id, 1, { source: 'loot' });
const flag = (w: World, name: string) => w.rpg.quests.flags.get(name);
const has = (w: World, id: string) => w.rpg.inventory.count(id) > 0;
const board = (w: World) => boardView({ hasItem: (id) => has(w, id), flag: (n) => w.rpg.quests.flags.get(n) })!;
const purse = (w: World) => board(w).cells.find((c) => c.id === 'purse')!;
const member = (w: World, id: string) => purse(w).members.find((m) => m.id === id)!;

/** Act II has begun: mq-05 done (the board open), the player with Chapter 4's keepsakes and 400 denarii. */
function actTwo(opts: { drachm?: boolean; hour?: number } = {}) {
  const w = world();
  setHour(w, opts.hour ?? 10);
  give(w, ARROW);
  if (opts.drachm !== false) give(w, DRACHM);
  w.rpg.inventory.addDenarii(400);
  w.rpg.quests.setStage('mq-04-columna', 'done');
  w.rpg.quests.flags.set('mq05-sicarius-dead', true);
  give(w, 'quest-tabula-sicarii');
  w.rpg.quests.setStage('mq-05-tabula', 'board');
  w.rpg.quests.setStage('mq-05-tabula', 'done');
  expect(w.rpg.quests.status('mq-05-tabula')).toMatchObject({ running: false, completed: true });
  expect(status(w)?.running).toBeFalsy();
  return w;
}

/** The Purse started through Pudens (stage `lead`). */
function leadWorld(opts: { drachm?: boolean; hour?: number } = {}) {
  const w = actTwo(opts);
  say(w, 'npc-pudens', 'The Purse');
  expect(stageOf(w)).toBe('lead');
  return w;
}

/** The Purse started through Primigenius (stage `names`). */
function namesWorld(opts: { drachm?: boolean; hour?: number } = {}) {
  const w = actTwo(opts);
  say(w, 'npc-horrearius', 'Who is Pinarius?', 'Who comes to see him?');
  expect(stageOf(w)).toBe('names');
  return w;
}

// The three ways of proving a man (each leaves the quest in `names` until all three are done).
function euhodusByArrow(w: World) {
  roll(w, true);
  say(w, 'npc-euhodus', 'Show him the Dacian arrow', 'Who to?');
}
function hermogenesByDrachm(w: World) {
  say(w, 'npc-hermogenes', 'Change a Parthian drachm', 'What others?');
}
/** The bays through the porter, at night, for a bribe; then the sacks are cut open. */
function baysByPorter(w: World) {
  setHour(w, 23);
  say(w, 'npc-ianitor-horreorum', 'Here’s for your trouble');
  expect(w.has('mq06-sacks')).toBe(true);
  w.use('mq06-sacks');
}

/** All three proven: Avitus waits in his counting-room. */
function avitusWorld() {
  const w = namesWorld();
  euhodusByArrow(w);
  hermogenesByDrachm(w);
  baysByPorter(w);
  expect(stageOf(w)).toBe('avitus');
  return w;
}

/** The knife-men called and put down. */
function knivesDownWorld() {
  const w = avitusWorld();
  roll(w, true);
  say(w, 'npc-avitus', 'No.');
  for (const id of KNIVES) {
    w.alive.add(id);
    w.events.emit('actor:killed', { victimId: id, killerId: 'player' });
  }
  return w;
}

describe('mq-06-sacculus: The Purse', () => {
  describe('starting', () => {
    it('Pudens offers the four groups once mq-05 is done; the Purse starts the quest at `lead`, and the drachm is kept', () => {
      const w = actTwo();
      const v = w.rpg.dialogue.start('npc-pudens')!;
      expect(v.text).toContain('Where do you want to start');
      expect(v.choices.map((c) => c.text)).toEqual(expect.arrayContaining(['The Purse: the money men.', 'The Eastern Gold.', 'The Dacian Blades.', 'The Toga.', 'Later.']));
      close(w);
      expect(status(w)?.running).toBeFalsy();
      // sLead, then sDrachm: the player still has the coin.
      const v2 = talk(w, 'npc-pudens', 'The Purse')!;
      expect(v2.nodeId).toBe('sLead');
      expect(v2.text).toContain('Horrea Agrippiana');
      expect(status(w)).toMatchObject({ running: true, stage: 'lead' });
      const v3 = w.rpg.dialogue.advance()!;
      expect(v3.nodeId).toBe('sDrachm');
      expect(v3.text).toContain('keep that Parthian coin');
      close(w);
      expect(w.rpg.inventory.count(DRACHM)).toBe(1);
      expect(objective(w, 'name')).toMatchObject({ done: false });
      expect(w.rpg.quests.state(Q)!.journal.at(-1)!.text).toContain('Three half-names');
    });

    it('gives the drachm back when Gratus kept it, and finishes the optional objective', () => {
      const w = actTwo({ drachm: false });
      expect(has(w, DRACHM)).toBe(false);
      talk(w, 'npc-pudens', 'The Purse');
      expect(objective(w, 'drachm')).toMatchObject({ optional: true, done: false });
      const v = w.rpg.dialogue.advance()!;
      expect(v.text).toContain('Gratus kept it');
      close(w);
      expect(has(w, DRACHM)).toBe(true);
      expect(objective(w, 'drachm')!.done).toBe(true);
      // Not handed out twice.
      expect(w.rpg.inventory.count(DRACHM)).toBe(1);
      expect(opening(w, 'npc-pudens')).toContain('The Purse first');
      expect(w.rpg.inventory.count(DRACHM)).toBe(1);
    });

    it('the other three groups get a deferral and return to the hub', () => {
      const w = actTwo();
      let v = talk(w, 'npc-pudens', 'The Eastern Gold')!;
      expect(v.text).toContain('pepper');
      v = w.rpg.dialogue.advance()!;
      expect(v.nodeId).toBe('sHub');
      v = talk(w, 'npc-pudens')!;
      // (a new conversation: the asked group is not offered again)
      expect(v.choices.map((c) => c.text)).not.toContain('The Eastern Gold.');
      v = w.rpg.dialogue.choose(v.choices.findIndex((c) => c.text.includes('Dacian Blades')))!;
      expect(v.text).toContain('Mucapor');
      v = w.rpg.dialogue.advance()!;
      expect(v.nodeId).toBe('sHub');
      v = w.rpg.dialogue.choose(v.choices.findIndex((c) => c.text.includes('The Toga')))!;
      expect(v.text).toContain('Nothing on him yet');
      close(w);
      expect(status(w)?.running).toBeFalsy();
    });

    it('starting at the keeper first: hNames starts the quest at `names`, and Pudens then gives the drachm back', () => {
      const w = actTwo({ drachm: false });
      expect(opening(w, 'npc-horrearius')).toContain('Primigenius, keeper');
      talk(w, 'npc-horrearius', 'Who is Pinarius?');
      expect(w.rpg.dialogue.view!.nodeId).toBe('hName');
      expect(status(w)?.running).toBeFalsy();
      talk_on(w, 'Who comes to see him?');
      close(w);
      expect(stageOf(w)).toBe('names');
      expect(objective(w, 'name')!.done).toBe(true);
      expect(objective(w, 'drachm')).toMatchObject({ optional: true, done: false });
      expect(opening(w, 'npc-horrearius')).not.toContain('Primigenius, keeper');
      // Pudens: sDrachmBack.
      const v = w.rpg.dialogue.start('npc-pudens')!;
      expect(v.nodeId).toBe('sDrachmBack');
      close(w);
      expect(has(w, DRACHM)).toBe(true);
      expect(objective(w, 'drachm')!.done).toBe(true);
      expect(opening(w, 'npc-pudens')).toContain('The Purse first');
    });
  });

  describe('Euhodus', () => {
    it('the arrow and a Rhetoric pass: he gives up the buyer, and the board says how', () => {
      const w = leadWorld();
      roll(w, true);
      const v = talk(w, 'npc-euhodus', 'Show him the Dacian arrow')!;
      expect(v.nodeId).toBe('eArrow');
      expect(v.choices).toHaveLength(2);
      expect(v.choices[0].text).toContain('Who to?');
      w.rpg.dialogue.choose(0);
      expect(w.rpg.dialogue.view!.nodeId).toBe('eConfess');
      close(w);
      expect(flag(w, 'board:euhodus')).toBe(true);
      expect(flag(w, 'board-how:euhodus')).toContain('fletching');
      expect(objective(w, 'euhodus')!.done).toBe(true); // (counted ahead of the stage that lists it)
      expect(w.notices).toContain('Unmasked on the board: Tiberius Claudius Euhodus.');
      expect(member(w, 'euhodus')).toMatchObject({ unmasked: true, how: expect.stringContaining('fletching') });
      // Proven in `lead`: the stage counts him when the keeper sends the player on.
      expect(stageOf(w)).toBe('lead');
      say(w, 'npc-horrearius', 'Who is Pinarius?', 'Who comes to see him?');
      expect(stageOf(w)).toBe('names');
      expect(objective(w, 'euhodus')!.done).toBe(true);
      // The arrow offer is gone once he is unmasked.
      expect(w.rpg.dialogue.start('npc-euhodus')!.choices.map((c) => c.text)).not.toContain('Show him the Dacian arrow.');
      close(w);
    });

    it('a failed check falls back (he denies it, the offer is not repeated); his shop boy then takes a bribe for the ledger page', () => {
      const w = namesWorld();
      roll(w, false);
      talk(w, 'npc-euhodus', 'Show him the Dacian arrow', 'Who to?');
      expect(w.rpg.dialogue.view!.nodeId).toBe('eDeny');
      close(w);
      expect(flag(w, 'board:euhodus')).toBeFalsy();
      expect(objective(w, 'euhodus')!.done).toBe(false);
      expect(w.rpg.dialogue.start('npc-euhodus')!.choices.map((c) => c.text)).not.toContain('Show him the Dacian arrow.');
      close(w);
      // Felix: the bribe.
      const before = w.rpg.inventory.denarii;
      say(w, 'npc-puer-euhodi', 'Your master keeps an order-book', 'A few coins');
      expect(w.rpg.inventory.denarii).toBeLessThan(before);
      expect(has(w, LEDGER)).toBe(true);
      expect(flag(w, 'board:euhodus')).toBe(true);
      expect(flag(w, 'board-how:euhodus')).toContain('order-book');
      expect(objective(w, 'euhodus')!.done).toBe(true);
      expect(board(w).cells.find((c) => c.id === 'purse')!.clues.map((c) => c.id)).toContain('rationes-euhodi');
      expect(opening(w, 'npc-puer-euhodi')).toContain('Master’s in the back');
    });

    it('Felix also gives the page for a Rhetoric pass, and a failed pass gives nothing', () => {
      const w = namesWorld({ drachm: false });
      roll(w, false);
      say(w, 'npc-puer-euhodi', 'Your master keeps an order-book', 'He beats you anyway');
      expect(has(w, LEDGER)).toBe(false);
      expect(flag(w, 'board:euhodus')).toBeFalsy();
      expect(opening(w, 'npc-puer-euhodi')).toContain('Master’s at the forge');
      // The failure locks that approach for a day; the bribe is still open.
      w.game.time.advanceHours(30);
      roll(w, true);
      say(w, 'npc-puer-euhodi', 'Your master keeps an order-book', 'He beats you anyway');
      expect(has(w, LEDGER)).toBe(true);
      expect(flag(w, 'board-how:euhodus')).toContain('order-book');
    });
  });

  describe('Hermogenes', () => {
    it('the drachm: his ready price unmasks him', () => {
      const w = namesWorld();
      const v = talk(w, 'npc-hermogenes', 'Change a Parthian drachm')!;
      expect(v.nodeId).toBe('hgDrachm');
      talk_on(w, 'What others?');
      close(w);
      expect(flag(w, 'board:hermogenes')).toBe(true);
      expect(flag(w, 'board-how:hermogenes')).toContain('Parthian silver');
      expect(objective(w, 'hermogenes')!.done).toBe(true);
      expect(member(w, 'hermogenes')).toMatchObject({ unmasked: true, how: expect.stringContaining('Parthian') });
      // He hands the coin back: the player still has it.
      expect(has(w, DRACHM)).toBe(true);
      expect(w.rpg.dialogue.start('npc-hermogenes')!.choices.map((c) => c.text)).not.toContain('Change a Parthian drachm for me.');
      close(w);
    });

    it('without the drachm, Lycus the clerk: a bribe gives his tablets', () => {
      const w = namesWorld({ drachm: false });
      expect(w.rpg.dialogue.start('npc-hermogenes')!.choices.map((c) => c.text)).not.toContain('Change a Parthian drachm for me.');
      close(w);
      const before = w.rpg.inventory.denarii;
      say(w, 'npc-lycus', 'What does Pinarius change', 'Buy yourself a better master');
      expect(w.rpg.inventory.denarii).toBeLessThan(before);
      expect(has(w, TABLETS)).toBe(true);
      expect(flag(w, 'board:hermogenes')).toBe(true);
      expect(flag(w, 'board-how:hermogenes')).toContain('clerk');
      expect(objective(w, 'hermogenes')!.done).toBe(true);
      expect(opening(w, 'npc-lycus')).toContain('Busy, busy');
    });

    it('Lycus on a Rhetoric pass gives the tablets too; on a fail he sends the player away', () => {
      const w = namesWorld();
      roll(w, false);
      say(w, 'npc-lycus', 'What does Pinarius change', 'You know it’s wrong');
      expect(has(w, TABLETS)).toBe(false);
      expect(flag(w, 'board:hermogenes')).toBeFalsy();
      w.game.time.advanceHours(30);
      roll(w, true);
      say(w, 'npc-lycus', 'What does Pinarius change', 'You know it’s wrong');
      expect(has(w, TABLETS)).toBe(true);
      expect(flag(w, 'board-how:hermogenes')).toContain('clerk');
    });
  });

  describe('the bays', () => {
    it('the keeper opens a bay only by day and only once one man is proven', () => {
      const w = namesWorld();
      // Nobody proven: he has nothing for the player.
      expect(opening(w, 'npc-horrearius')).toContain('Cloth on the left');
      hermogenesByDrachm(w);
      // Proof in hand, but at night he is not the one to ask.
      setHour(w, 21);
      expect(opening(w, 'npc-horrearius')).toContain('Cloth on the left');
      setHour(w, 10);
      expect(opening(w, 'npc-horrearius')).toContain('Found something?');
      expect(w.has('mq06-sacks')).toBe(false);
      say(w, 'npc-horrearius', 'Not yet');
      expect(w.has('mq06-sacks')).toBe(false);
      say(w, 'npc-horrearius', 'Show him what you found');
      expect(flag(w, 'mq06-bay-open')).toBe(true);
      expect(w.has('mq06-sacks')).toBe(true);
      expect(flag(w, 'mq06-knives-found')).toBeFalsy();
      // Opened: he does not offer it again.
      expect(opening(w, 'npc-horrearius')).toContain('Cloth on the left');
    });

    it('the night porter takes a bribe only at night', () => {
      const w = namesWorld();
      setHour(w, 10);
      expect(opening(w, 'npc-ianitor-horreorum')).toContain('Nothing to see');
      setHour(w, 23);
      const v = w.rpg.dialogue.start('npc-ianitor-horreorum')!;
      expect(v.nodeId).toBe('n0');
      close(w);
      const before = w.rpg.inventory.denarii;
      say(w, 'npc-ianitor-horreorum', 'Here’s for your trouble');
      expect(w.rpg.inventory.denarii).toBeLessThan(before);
      expect(flag(w, 'mq06-bay-open')).toBe(true);
      expect(opening(w, 'npc-ianitor-horreorum')).toContain('Nothing to see');
    });

    it('cutting the sacks open proves Avitus: any order, bays first through the porter, then the other two', () => {
      const w = namesWorld();
      baysByPorter(w);
      expect(flag(w, 'mq06-knives-found')).toBe(true);
      expect(flag(w, 'board:pinarius-avitus')).toBe(true);
      expect(flag(w, 'board-how:pinarius-avitus')).toContain('wheat');
      expect(objective(w, 'bays')!.done).toBe(true);
      expect(w.has('mq06-sacks')).toBe(false);
      expect(board(w).cells.find((c) => c.id === 'purse')!.clues.map((c) => c.id)).toContain('knives-in-wheat');
      expect(w.subtitles.some((s) => s.text.includes('sicae'))).toBe(true);
      expect(stageOf(w)).toBe('names');
      setHour(w, 10);
      say(w, 'npc-puer-euhodi', 'Your master keeps an order-book', 'A few coins');
      expect(stageOf(w)).toBe('names');
      say(w, 'npc-lycus', 'What does Pinarius change', 'Buy yourself a better master');
      expect(stageOf(w)).toBe('avitus');
      expect(purse(w).members.every((m) => m.unmasked && m.how)).toBe(true);
      expect(purse(w).broken).toBe(true);
    });

    it('the sacks work in the keeper’s order too, and the spot is not offered before a bay is open', () => {
      const w = namesWorld();
      expect(w.has('mq06-sacks')).toBe(false);
      euhodusByArrow(w);
      say(w, 'npc-horrearius', 'Show him what you found');
      w.use('mq06-sacks');
      expect(flag(w, 'board:pinarius-avitus')).toBe(true);
      hermogenesByDrachm(w);
      expect(stageOf(w)).toBe('avitus');
    });
  });

  describe('Avitus', () => {
    it('all three proven: stage `avitus`, Avitus staged in his counting-room, and the warning said', () => {
      const w = avitusWorld();
      expect(w.staged.filter((s) => s.id === 'npc-avitus')).toHaveLength(1);
      expect(objective(w, 'face')).toMatchObject({ done: false });
      expect(w.subtitles.filter((s) => s.speaker === 'Night porter' && s.text.includes('two hired knives'))).toHaveLength(1);
      expect(w.subtitles.some((s) => s.text.includes('a man came from the Caelian'))).toBe(false);
    });

    it('the keeper does the warning when he opened the bay, and the Mardonius line follows when the leak flag is set', () => {
      vi.useFakeTimers();
      const w = namesWorld();
      w.rpg.quests.flags.set('mq05-told-mardonius', true);
      euhodusByArrow(w);
      setHour(w, 10);
      say(w, 'npc-horrearius', 'Show him what you found');
      w.use('mq06-sacks');
      hermogenesByDrachm(w);
      expect(stageOf(w)).toBe('avitus');
      expect(w.subtitles.filter((s) => s.speaker === 'Primigenius' && s.text.includes('two hired knives'))).toHaveLength(1);
      expect(w.subtitles.some((s) => s.text.includes('a man came from the Caelian'))).toBe(false);
      vi.advanceTimersByTime(7000);
      expect(w.subtitles.filter((s) => s.speaker === 'Primigenius' && s.text.includes('a man came from the Caelian'))).toHaveLength(1);
    });

    it('take the money: +300 denarii, he runs, no knives, on to the report', () => {
      const w = avitusWorld();
      const before = w.rpg.inventory.denarii;
      talk(w, 'npc-avitus');
      expect(w.rpg.dialogue.view!.nodeId).toBe('a0');
      talk_on(w, 'Take the money');
      close(w);
      expect(w.rpg.inventory.denarii - before).toBe(300);
      expect(flag(w, 'mq06-avitus-fate')).toBe('ran');
      expect(objective(w, 'face')!.done).toBe(true);
      expect(w.spawned).toHaveLength(0);
      expect(w.unstaged).toContain('npc-avitus');
      expect(stageOf(w)).toBe('report');
      expect(opening(w, 'npc-avitus')).toContain('quiet');
      expect(board(w).cells.find((c) => c.id === 'purse')!.clues.find((c) => c.id === 'avitus-fate')!.text).toContain('Ostia');
      expect(w.has('mq06-chest')).toBe(true);
    });

    it('refuse: two knife-men are spawned; with both down Avitus asks what now', () => {
      const w = avitusWorld();
      roll(w, true);
      say(w, 'npc-avitus', 'No.');
      expect(w.spawned.map((s) => s.opts.id)).toEqual(KNIVES);
      expect(w.spawned.every((s) => s.archetype === 'grassator' && s.opts.quest === Q)).toBe(true);
      expect(stageOf(w)).toBe('avitus');
      // While they fight, he waits; and he is not asked twice for the fight.
      expect(opening(w, 'npc-avitus')).toContain('watches');
      w.events.emit('actor:killed', { victimId: KNIVES[0], killerId: 'player' });
      expect(flag(w, 'mq06-knives-dead')).toBeFalsy();
      expect(opening(w, 'npc-avitus')).toContain('watches');
      w.events.emit('actor:killed', { victimId: KNIVES[1], killerId: 'player' });
      expect(flag(w, 'mq06-knives-dead')).toBe(true);
      const v = w.rpg.dialogue.start('npc-avitus')!;
      expect(v.nodeId).toBe('aDecide');
      expect(v.choices).toHaveLength(3);
      close(w);
      expect(w.spawned).toHaveLength(2);
    });

    it('“You’re under arrest” is the same fight; the knives are not spawned twice', () => {
      const w = avitusWorld();
      say(w, 'npc-avitus', 'You’re under arrest');
      expect(w.spawned).toHaveLength(2);
      say(w, 'npc-avitus');
      expect(w.spawned).toHaveLength(2);
    });

    it('after the fight: arrest him', () => {
      const w = knivesDownWorld();
      say(w, 'npc-avitus', 'Castra Peregrina');
      expect(flag(w, 'mq06-avitus-fate')).toBe('arrested');
      expect(stageOf(w)).toBe('report');
      expect(w.unstaged).toContain('npc-avitus');
      expect(board(w).cells.find((c) => c.id === 'purse')!.clues.find((c) => c.id === 'avitus-fate')!.text).toContain('cells');
    });

    it('after the fight: let him run', () => {
      const w = knivesDownWorld();
      say(w, 'npc-avitus', 'Get out of Rome');
      expect(flag(w, 'mq06-avitus-fate')).toBe('ran');
      expect(stageOf(w)).toBe('report');
      expect(board(w).cells.find((c) => c.id === 'purse')!.clues.find((c) => c.id === 'avitus-fate')!.text).toContain('Ostia');
    });

    it('after the fight: kill him', () => {
      const w = knivesDownWorld();
      const attacks: unknown[] = [];
      w.events.on('dialogue:attack', (e) => attacks.push(e));
      say(w, 'npc-avitus', 'Kill him');
      expect(attacks).toEqual([{ npcId: 'npc-avitus' }]);
      expect(stageOf(w)).toBe('avitus');
      w.events.emit('actor:killed', { victimId: 'npc-avitus', killerId: 'player' });
      expect(flag(w, 'mq06-avitus-fate')).toBe('killed');
      expect(stageOf(w)).toBe('report');
      expect(w.unstaged).not.toContain('npc-avitus');
      expect(board(w).cells.find((c) => c.id === 'purse')!.clues.find((c) => c.id === 'avitus-fate')!.text).toContain('Dead');
    });

    it('killing him in the middle of the fight, or at once, also ends it (no second decision)', () => {
      const w = avitusWorld();
      w.events.emit('actor:killed', { victimId: 'npc-avitus', killerId: 'player' });
      expect(flag(w, 'mq06-avitus-fate')).toBe('killed');
      expect(stageOf(w)).toBe('report');
      w.events.emit('actor:killed', { victimId: 'npc-avitus', killerId: 'player' });
      expect(flag(w, 'mq06-avitus-fate')).toBe('killed');
    });
  });

  describe('his papers, the report, the end', () => {
    /** Pudens's report, line by line (each node's text), to the end of the talk. */
    function report(w: World): string[] {
      const lines: string[] = [];
      let v = w.rpg.dialogue.start('npc-pudens');
      while (v) {
        lines.push(`${v.nodeId}: ${v.text}`);
        v = w.rpg.dialogue.advance();
      }
      return lines;
    }
    /** At the report with Avitus having run (the money taken). */
    function reportWorld() {
      const w = avitusWorld();
      say(w, 'npc-avitus', 'Take the money');
      expect(stageOf(w)).toBe('report');
      return w;
    }

    it('the chest gives his papers once, ticks the optional objective, and the Toga clue appears', () => {
      const w = reportWorld();
      expect(w.has('mq06-chest')).toBe(true);
      expect(objective(w, 'report')).toMatchObject({ done: false });
      expect(objective(w, 'papers')).toMatchObject({ optional: true, done: false });
      expect(board(w).cells.find((c) => c.id === 'toga')!.clues.map((c) => c.id)).not.toContain('scribe');
      w.use('mq06-chest');
      expect(w.rpg.inventory.count(PAPERS)).toBe(1);
      expect(objective(w, 'papers')!.done).toBe(true);
      expect(w.has('mq06-chest')).toBe(false);
      expect(board(w).cells.find((c) => c.id === 'toga')!.clues.map((c) => c.id)).toContain('scribe');
    });

    it('Pudens’s sR3 differs with and without the papers', () => {
      const without = reportWorld();
      const a = report(without).find((l) => l.startsWith('sR3'))!;
      expect(a).toContain('You didn’t bring his papers');
      const withPapers = reportWorld();
      withPapers.use('mq06-chest');
      const b = report(withPapers).find((l) => l.startsWith('sR3'))!;
      expect(b).toContain('Chrysogonus');
      expect(b).not.toBe(a);
    });

    it('the report completes the quest: rewards, the banner, the board with three “how” lines', () => {
      const w = reportWorld();
      const banners: unknown[] = [];
      w.events.on('ui:banner', (e) => banners.push(e));
      const den = w.rpg.inventory.denarii;
      const merc = w.rpg.sheet.baseSkillLevel('mercatura');
      const rhet = w.rpg.sheet.baseSkillLevel('rhetoric');
      const lines = report(w);
      expect(lines.map((l) => l.split(':')[0])).toEqual(['sR0', 'sR1', 'sR2', 'sR3', 'sDone']);
      expect(lines.find((l) => l.startsWith('sR2'))).toContain('boat to Ostia');
      expect(status(w)).toMatchObject({ running: false, completed: true, stage: 'done' });
      expect(objective(w, 'report')?.done ?? true).toBe(true);
      expect(w.rpg.inventory.denarii - den).toBe(150);
      expect(w.rpg.sheet.baseSkillLevel('mercatura')).toBeGreaterThan(merc);
      expect(w.rpg.sheet.baseSkillLevel('rhetoric')).toBeGreaterThan(rhet);
      expect(banners).toEqual([expect.objectContaining({ label: 'Act II', title: 'The Purse is broken' })]);
      expect(w.has('mq06-sacks')).toBe(false);
      expect(w.has('mq06-chest')).toBe(false);
      expect(w.unstaged).toContain('npc-avitus');
      const p = purse(w);
      expect(p.broken).toBe(true);
      expect(p.members.map((m) => m.how)).toEqual([expect.any(String), expect.any(String), expect.any(String)]);
      expect(p.members.every((m) => m.unmasked && m.how)).toBe(true);
      expect(board(w).broken).toBe(1);
      // Pudens afterwards: the hub without the Purse.
      const v = w.rpg.dialogue.start('npc-pudens')!;
      expect(v.text).toContain('The Purse is broken');
      expect(v.choices.map((c) => c.text)).not.toContain('The Purse: the money men.');
      close(w);
    });

    it('the arrested and the killed Avitus change Pudens’s sR2; killed leaves the chest to search', () => {
      const w = knivesDownWorld();
      say(w, 'npc-avitus', 'Castra Peregrina');
      expect(report(w).find((l) => l.startsWith('sR2'))).toContain('in my cells');
      const k = knivesDownWorld();
      say(k, 'npc-avitus', 'Kill him');
      k.events.emit('actor:killed', { victimId: 'npc-avitus', killerId: 'player' });
      expect(k.has('mq06-chest')).toBe(true);
      expect(report(k).find((l) => l.startsWith('sR2'))).toContain('Avitus is dead');
      expect(status(k)!.completed).toBe(true);
    });

    it('a night report: the hint says to wait until morning', () => {
      const w = avitusWorld();
      const hints: string[] = [];
      w.events.on('rpg:notify', (e) => hints.push(e.text));
      say(w, 'npc-avitus', 'Take the money');
      expect(hints.some((h) => h.includes('Press T'))).toBe(true);
    });
  });

  describe('saves', () => {
    it('loading in `avitus` with the knife-men spawned but gone: the fight counts as over, Avitus is asked, no soft-lock', () => {
      const w = avitusWorld();
      roll(w, true);
      say(w, 'npc-avitus', 'No.');
      expect(w.spawned).toHaveLength(2);
      expect(flag(w, 'mq06-knives-dead')).toBeFalsy();
      // The saved game: the actors are not in the world after loading.
      const saved = w.rpg.quests.serialize();
      w.rpg.quests.restore(JSON.parse(JSON.stringify(saved)));
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(flag(w, 'mq06-knives-dead')).toBe(true);
      expect(stageOf(w)).toBe('avitus');
      expect(w.rpg.dialogue.start('npc-avitus')!.nodeId).toBe('aDecide');
      w.rpg.dialogue.choose(1);
      close(w);
      expect(stageOf(w)).toBe('report');
    });

    it('loading with the knife-men still in the world keeps the fight on', () => {
      const w = avitusWorld();
      roll(w, true);
      say(w, 'npc-avitus', 'No.');
      for (const id of KNIVES) w.alive.add(id);
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(flag(w, 'mq06-knives-dead')).toBeFalsy();
    });

    it('loading puts back what the stage needs: Avitus staged, the sacks, the chest', () => {
      const w = avitusWorld();
      w.staged.length = 0;
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(w.staged.filter((s) => s.id === 'npc-avitus')).toHaveLength(1);
      expect(w.has('mq06-chest')).toBe(false);
      // Fresh start of the process: the interactions are gone, and the poll/load restores them.
      const r = reportWorld2();
      expect(r.has('mq06-chest')).toBe(true);
      r.placed.length = 0;
      r.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(r.has('mq06-chest')).toBe(true);
    });

    it('a save in `names` with a bay open and the sacks uncut offers the sacks again', () => {
      const w = namesWorld();
      baysByPorterOnly(w);
      w.placed.length = 0;
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(w.has('mq06-sacks')).toBe(true);
    });
  });
});

function reportWorld2() {
  const w = avitusWorld();
  say(w, 'npc-avitus', 'Take the money');
  return w;
}
function baysByPorterOnly(w: World) {
  setHour(w, 23);
  say(w, 'npc-ianitor-horreorum', 'Here’s for your trouble');
}
