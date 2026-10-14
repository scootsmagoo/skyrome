/**
 * The mq-07 quest, "The Eastern Gold" (docs/STORY.md chapter 7), against the real QuestSystem, DialogueSystem
 * and RPG services. Stubbed: the population (stage/unstage record calls), the interior cells (their spots are
 * fixed points; `w.cell` says which one the player is in), the combat service (spawns and `engage` recorded),
 * the interactions (the sack and the nativity are recorded and fired by hand), the calendar. The clock moves
 * with setHour(); the dice with roll() (0 always passes a check, 0.999 always fails). The staging poll of the
 * quest (0.5 s) is driven by tick().
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnOptions } from '../src/content/director';
import type { DialogueView } from '../src/dialogue/DialogueSystem';
import { syncMusHideout } from '../src/content/install';
import { boardView } from '../src/game/board/board';
import { NpcManager } from '../src/npc/NpcManager';
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

const Q = 'mq-07-aurum';
const DRACHM = 'quest-drachma-parthica';
const ARROW = 'quest-sagitta-dacica';
const LEDGER = 'quest-rationes-malchi';
const TABLE = 'quest-tabula-siderum';
const NATIVITY = 'quest-genitura-caesaris';
const LETTER = 'quest-epistula-mardonii';
const KNIVES = ['sica-mardonii-1', 'sica-mardonii-2'];
const CAVE = 'mithraeum-subura';
const BAY = 'piperataria-bay';
const FLAT = 'domus-asclepiodoti';

/** The cells' spots the quest asks for (fixed points, one set per cell, a distinct x per spot). */
const SPOTS: Record<string, string[]> = {
  [BAY]: ['sacks'],
  [FLAT]: ['table', 'reader'],
  [CAVE]: ['feast-mardonius', 'feast-malchus', 'feast-chaldaean', 'stair-1', 'stair-2', 'father'],
};

function world() {
  const fg = fakeGame();
  const game = fg.game as unknown as Record<string, unknown>;
  const spawned: { archetype: string; opts: SpawnOptions; pos: Vector3 }[] = [];
  const engaged: { id: string; opts: Record<string, unknown> }[] = [];
  game.combat = {
    spawnEnemy: (archetype: string, pos: Vector3, o: SpawnOptions) => {
      spawned.push({ archetype, opts: o, pos });
      return { id: o.id };
    },
    engage: (id: string, opts: Record<string, unknown>) => {
      engaged.push({ id, opts });
      return true;
    },
    get: () => undefined,
  };
  // Who exists in the world: the spawned knife-men until they are taken out.
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
  const staged: { id: string; x: number; y: number | undefined; z: number; loop: string | null }[] = [];
  const unstaged: string[] = [];
  game.population = {
    stage: (id: string, x: number, z: number, _heading: number, loop: string | null, y?: number) => {
      staged.push({ id, x, z, loop, y });
      return true;
    },
    unstage: (id: string) => {
      unstaged.push(id);
    },
  };
  // The interior cells: spots at fixed points under the street (y −250), and the cell the player is in.
  const state = { cell: null as string | null };
  game.interiors = {
    spot: (cell: string, spot: string) => {
      const i = (SPOTS[cell] ?? []).indexOf(spot);
      return i < 0 ? null : { position: new Vector3(100 * Object.keys(SPOTS).indexOf(cell) + i, -250, 7), heading: 0 };
    },
    current: () => state.cell,
    cellAt: () => 'a-cell',
  };
  // The cell-cast hold (named/cast.ts): who the quest has asked it to leave alone.
  const held = new Set<string>();
  game.cellCast = { held };
  game.calendar = { stepToAnchor: () => true, date: () => ({ year: 113, month: 4, day: 20 }) };
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  const subtitles: { speaker: string; text: string }[] = [];
  fg.events.on('ui:subtitle', (e) => subtitles.push({ speaker: e.speaker ?? '', text: e.text }));
  const notices: string[] = [];
  fg.events.on('ui:notify', (e) => notices.push(e.text));
  const hints: string[] = [];
  fg.events.on('rpg:notify', (e) => hints.push(e.text));
  const banners: Record<string, unknown>[] = [];
  fg.events.on('ui:banner', (e) => banners.push(e as unknown as Record<string, unknown>));
  return {
    ...fg,
    rpg,
    spawned,
    engaged,
    placed,
    staged,
    unstaged,
    subtitles,
    notices,
    hints,
    banners,
    alive,
    held,
    state,
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

/** The next checks pass (true) or fail (false). */
function roll(w: World, pass: boolean) {
  w.rpg.dialogue.rng = { next: () => (pass ? 0 : 0.999) };
}

/** Run the game's systems for a second or so (the quest's staging poll runs every 0.5 s). */
function tick(w: World) {
  w.step(70, 1 / 60);
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

/** Every node a conversation passes through to its end, as "node: text" lines (no choices taken). */
function lines(w: World, npc: string): string[] {
  const out: string[] = [];
  let v = w.rpg.dialogue.start(npc);
  while (v) {
    out.push(`${v.nodeId}: ${v.text}`);
    v = w.rpg.dialogue.advance();
  }
  return out;
}

const status = (w: World) => w.rpg.quests.status(Q);
const stageOf = (w: World) => status(w)?.stage;
const objective = (w: World, id: string) => w.rpg.quests.objectives(Q).find((o) => o.id === id);
/** Done by the quest's own record (a hidden objective counts as done without ever being shown). */
const done = (w: World, id: string) => !!w.rpg.quests.state(Q)!.objectives[id]?.done;
const give = (w: World, id: string) => w.rpg.inventory.add(id, 1, { source: 'loot' });
const flag = (w: World, name: string) => w.rpg.quests.flags.get(name);
const setFlag = (w: World, name: string, v: boolean | string | number = true) => w.rpg.quests.flags.set(name, v);
const has = (w: World, id: string) => w.rpg.inventory.count(id) > 0;
const board = (w: World) => boardView({ hasItem: (id) => has(w, id), flag: (n) => w.rpg.quests.flags.get(n) })!;
const aurum = (w: World) => board(w).cells.find((c) => c.id === 'aurum')!;
const member = (w: World, id: string) => aurum(w).members.find((m) => m.id === id)!;
const clues = (w: World, cell: string) => board(w).cells.find((c) => c.id === cell)!.clues;
const clueIds = (w: World, cell = 'aurum') => clues(w, cell).map((c) => c.id);
/** Enter a cell (the interior service's event, with the player's cell set). */
function enter(w: World, cell: string) {
  w.state.cell = cell;
  w.events.emit('interior:entered', { id: cell });
}

/** Act II has begun: mq-05 done (the board open), the player with Chapter 4's keepsakes and 400 denarii. */
function actTwo(opts: { hour?: number; told?: boolean } = {}) {
  const w = world();
  setHour(w, opts.hour ?? 10);
  give(w, ARROW);
  give(w, DRACHM);
  w.rpg.inventory.addDenarii(400);
  w.rpg.quests.setStage('mq-04-columna', 'done');
  setFlag(w, 'mq05-sicarius-dead');
  give(w, 'quest-tabula-sicarii');
  if (opts.told) setFlag(w, 'mq05-told-mardonius');
  w.rpg.quests.setStage('mq-05-tabula', 'board');
  w.rpg.quests.setStage('mq-05-tabula', 'done');
  expect(w.rpg.quests.status('mq-05-tabula')).toMatchObject({ running: false, completed: true });
  expect(status(w)?.running).toBeFalsy();
  return w;
}

/** The Eastern Gold started through Pudens (stage `lead`). */
function leadWorld(opts: { hour?: number; told?: boolean } = {}) {
  const w = actTwo(opts);
  say(w, 'npc-pudens', 'The Eastern Gold');
  expect(stageOf(w)).toBe('lead');
  return w;
}

/** Malchus met (stage `names`). */
function namesWorld(opts: { hour?: number; told?: boolean } = {}) {
  const w = leadWorld(opts);
  say(w, 'npc-malchus');
  expect(stageOf(w)).toBe('names');
  return w;
}

// The ways of proving a man (each leaves the quest in `names` until all three are done).
/** Malchus by the pepper: the Mercatura check, then the sack in his bay is cut open. */
function malchusByPepper(w: World) {
  roll(w, true);
  say(w, 'npc-malchus', 'Let me see your prices', 'Work it out');
  expect(flag(w, 'mq07-pepper-cheap')).toBe(true);
  enter(w, BAY);
  expect(w.has('mq07-sack')).toBe(true);
  w.use('mq07-sack');
}
/** Malchus by his ledger (taken from the strongbox). */
function malchusByLedger(w: World) {
  give(w, LEDGER);
}
/** The Chaldaean by Zenon's copy, read by Gemellus. */
function chaldaeanByZenon(w: World) {
  roll(w, true);
  say(w, 'npc-zenon', 'Who do you copy star tables for', 'Careful men keep a copy');
  expect(has(w, TABLE)).toBe(true);
  say(w, 'npc-gemellus', 'Can you read this');
}
/** The Chaldaean by the reading: fifty denarii, left alone with the table, the nativity taken, then Gemellus. */
function chaldaeanByReading(w: World) {
  say(w, 'npc-asclepiodotus', 'Fifty denarii');
  enter(w, FLAT);
  w.use('mq07-nativity');
  expect(has(w, NATIVITY)).toBe(true);
  say(w, 'npc-gemellus', 'Can you read this');
}
/** Mardonius by the Father: Pudens names the cave, then the Father tells. */
function mardoniusByFather(w: World) {
  roll(w, true);
  say(w, 'npc-cassius-ursus', 'One of your Lions');
}
/** Mardonius by the letter from his box. */
function mardoniusByLetter(w: World) {
  give(w, LETTER);
}

/** All three proven (Malchus by the ledger, the Chaldaean by Zenon, Mardonius by the letter): the feast. */
function feastWorld(opts: { hour?: number; told?: boolean } = {}) {
  const w = namesWorld(opts);
  malchusByLedger(w);
  chaldaeanByZenon(w);
  mardoniusByLetter(w);
  expect(stageOf(w)).toBe('feast');
  return w;
}

/** In the cave at night, the feast on. */
function caveWorld(opts: { told?: boolean } = {}) {
  const w = feastWorld({ hour: 10, told: opts.told });
  setHour(w, 22);
  enter(w, CAVE);
  return w;
}

/** The knife-men (if any) down, Mardonius talked to and drawn. */
function fightWorld(opts: { told?: boolean } = {}) {
  const w = caveWorld(opts);
  if (opts.told) for (const id of KNIVES) w.events.emit('actor:killed', { victimId: id, killerId: 'player' });
  say(w, 'npc-mardonius', 'You’re coming to Pudens');
  expect(w.engaged.map((e) => e.id)).toEqual(['npc-mardonius']);
  return w;
}

/** The report waiting: Mardonius decided one way or another. */
function reportWorld(choice: 'arrest' | 'spare' | 'kill' = 'arrest', opts: { hour?: number } = {}) {
  const w = fightWorld();
  w.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius', choice });
  expect(stageOf(w)).toBe('report');
  setHour(w, opts.hour ?? 10);
  return w;
}

describe('mq-07-aurum: The Eastern Gold', () => {
  describe('starting', () => {
    it('Pudens offers the Eastern Gold once mq-05 is done; gLead starts the quest at `lead` and sends the player to the pepper', () => {
      const w = actTwo();
      const v = w.rpg.dialogue.start('npc-pudens')!;
      expect(v.choices.map((c) => c.text)).toEqual(expect.arrayContaining(['The Eastern Gold: the silver and the pepper.']));
      // The lion question is not asked before the quest runs.
      expect(v.choices.map((c) => c.text.slice(0, 20))).not.toContain('Malchus’s ledger pay');
      close(w);
      expect(status(w)?.running).toBeFalsy();
      const v2 = talk(w, 'npc-pudens', 'The Eastern Gold')!;
      expect(v2.nodeId).toBe('gLead');
      expect(v2.text).toContain('Pepper Warehouses');
      expect(status(w)).toMatchObject({ running: true, stage: 'lead' });
      expect(w.rpg.dialogue.advance()!.text).toContain('Someone here talks');
      close(w);
      expect(objective(w, 'find')).toMatchObject({ done: false, target: { kind: 'npc', id: 'npc-malchus' } });
      expect(w.rpg.quests.state(Q)!.journal.at(-1)!.text).toContain('Syrian rings');
      // Not offered again.
      expect(w.rpg.dialogue.start('npc-pudens')!.choices.map((c) => c.text)).not.toContain('The Eastern Gold: the silver and the pepper.');
      close(w);
    });

    it('the Purse and the Eastern Gold can both be on the go: the hub keeps offering the Purse', () => {
      const w = leadWorld();
      const v = w.rpg.dialogue.start('npc-pudens')!;
      expect(v.choices.map((c) => c.text)).toContain('The Purse: the money men.');
      close(w);
      say(w, 'npc-pudens', 'The Purse');
      expect(w.rpg.quests.status('mq-06-sacculus')).toMatchObject({ running: true });
      expect(stageOf(w)).toBe('lead');
    });

    it('the clerk points out Malchus (once); Malchus met: the stage is `names`, the lead done, the first two objectives on', () => {
      const w = leadWorld();
      expect(opening(w, 'npc-clerk-piperataria')).toContain('Buying or asking');
      say(w, 'npc-clerk-piperataria', 'A man with Syrian rings');
      expect(opening(w, 'npc-clerk-piperataria')).toContain('Mind the dust');
      expect(stageOf(w)).toBe('lead');
      const v = talk(w, 'npc-malchus')!;
      expect(v.nodeId).toBe('m0');
      expect(stageOf(w)).toBe('lead');
      w.rpg.dialogue.advance();
      expect(w.rpg.dialogue.view!.nodeId).toBe('mMet');
      expect(stageOf(w)).toBe('names');
      close(w);
      expect(objective(w, 'find')!.done).toBe(true);
      expect(objective(w, 'malchus')).toMatchObject({ done: false, target: { kind: 'npc', id: 'npc-malchus' } });
      expect(objective(w, 'lion')).toMatchObject({ done: false, target: { kind: 'npc', id: 'npc-pudens' } });
      // Learned later: hidden for now.
      expect(objective(w, 'chaldaean')).toBeUndefined();
      expect(objective(w, 'cipher')).toBeUndefined();
      expect(objective(w, 'cave')).toBeUndefined();
      // Malchus remembers the player.
      expect(opening(w, 'npc-malchus')).toContain('Back again');
    });

    it('Malchus and the Chaldaean have nothing for a player who is not on the quest', () => {
      const w = actTwo();
      expect(opening(w, 'npc-malchus')).toContain('best in Rome');
      expect(opening(w, 'npc-asclepiodotus')).toContain('heavens are closed');
      expect(status(w)?.running).toBeFalsy();
    });
  });

  describe('objectives appear as they are learned', () => {
    it('Malchus names the Chaldaean (mStars): the objective is revealed, pointing at the flat’s door', () => {
      const w = namesWorld();
      say(w, 'npc-malchus', 'Who reads your stars');
      expect(flag(w, 'mq07-chaldaean-named')).toBe(true);
      expect(objective(w, 'chaldaean')).toMatchObject({ done: false, target: { kind: 'location', id: 'asclepiodotus-door' } });
      // The cipher waits for a table to read.
      expect(objective(w, 'cipher')).toBeUndefined();
    });

    it('Zenon’s copy (zTraced) names him too and hands over the star table: both objectives on', () => {
      const w = namesWorld();
      expect(w.rpg.dialogue.start('npc-zenon')!.choices.map((c) => c.text)).toContain('Who do you copy star tables for?');
      close(w);
      roll(w, true);
      talk(w, 'npc-zenon', 'Who do you copy star tables for', 'Careful men keep a copy');
      expect(w.rpg.dialogue.view!.nodeId).toBe('zTraced');
      close(w);
      expect(flag(w, 'mq07-chaldaean-named')).toBe(true);
      expect(flag(w, 'mq07-chaldaean-named-zenon')).toBe(true);
      expect(has(w, TABLE)).toBe(true);
      expect(objective(w, 'chaldaean')).toBeDefined();
      expect(objective(w, 'cipher')).toMatchObject({ done: false, target: { kind: 'npc', id: 'npc-gemellus' } });
      // Once, and the offer is gone.
      expect(w.rpg.dialogue.start('npc-zenon')!.choices.map((c) => c.text)).not.toContain('Who do you copy star tables for?');
      close(w);
      expect(w.rpg.inventory.count(TABLE)).toBe(1);
    });

    it('either of Zenon’s two ways (Intimidate or Persuade) works; a failed roll gets nothing', () => {
      const w = namesWorld();
      roll(w, false);
      say(w, 'npc-zenon', 'Who do you copy star tables for', 'Tell me, and you stay here');
      expect(has(w, TABLE)).toBe(false);
      expect(flag(w, 'mq07-chaldaean-named')).toBeFalsy();
      expect(objective(w, 'chaldaean')).toBeUndefined();
      // A failed approach is shut for a day; the other way is another approach.
      roll(w, true);
      w.game.time.advanceHours(30);
      say(w, 'npc-zenon', 'Who do you copy star tables for', 'Tell me, and you stay here');
      expect(has(w, TABLE)).toBe(true);
    });

    it('holding the star table or the nativity reveals the cipher (from any source)', () => {
      const w = namesWorld();
      expect(objective(w, 'cipher')).toBeUndefined();
      give(w, NATIVITY);
      expect(objective(w, 'cipher')).toMatchObject({ done: false });
      const t = namesWorld();
      give(t, TABLE);
      expect(objective(t, 'cipher')).toBeDefined();
    });

    it('Pudens on the Lion (gLion) names the cave: the Lion objective is done and the cave is revealed', () => {
      const w = namesWorld();
      expect(objective(w, 'cave')).toBeUndefined();
      const v = w.rpg.dialogue.start('npc-pudens')!;
      expect(v.choices.map((c) => c.text)).toContain('Malchus’s ledger pays “the Lion”. Who would that be?');
      close(w);
      talk(w, 'npc-pudens', 'Who would that be');
      expect(w.rpg.dialogue.view!.nodeId).toBe('gLion');
      close(w);
      expect(flag(w, 'mq07-cave-known')).toBe(true);
      expect(objective(w, 'lion')!.done).toBe(true);
      expect(objective(w, 'cave')).toMatchObject({ done: false, target: { kind: 'location', id: 'mithraeum-door' } });
      // Not asked again, and the man is not yet proven.
      expect(w.rpg.dialogue.start('npc-pudens')!.choices.map((c) => c.text)).not.toContain('Malchus’s ledger pays “the Lion”. Who would that be?');
      close(w);
      expect(flag(w, 'board:mardonius')).toBeFalsy();
    });
  });

  describe('Malchus', () => {
    it('his prices: a Mercatura pass says the pepper is cheap, and offers the sacks in his bay once the player is inside', () => {
      const w = namesWorld();
      roll(w, true);
      talk(w, 'npc-malchus', 'Let me see your prices', 'Work it out');
      expect(w.rpg.dialogue.view!.nodeId).toBe('mPrices');
      close(w);
      expect(flag(w, 'mq07-pepper-cheap')).toBe(true);
      // The sack is in the cell: offered as the player comes into the bay.
      expect(w.has('mq07-sack')).toBe(false);
      enter(w, BAY);
      expect(w.has('mq07-sack')).toBe(true);
      expect(flag(w, 'board:mercator-piperis')).toBeFalsy();
    });

    it('a failed Mercatura check shows nothing; the prices can be asked again', () => {
      const w = namesWorld();
      roll(w, false);
      talk(w, 'npc-malchus', 'Let me see your prices', 'Work it out');
      expect(w.rpg.dialogue.view!.nodeId).toBe('mPricesNo');
      close(w);
      expect(flag(w, 'mq07-pepper-cheap')).toBeFalsy();
      enter(w, BAY);
      expect(w.has('mq07-sack')).toBe(false);
      // The failure shuts that check for a day.
      w.game.time.advanceHours(30);
      roll(w, true);
      say(w, 'npc-malchus', 'Let me see your prices', 'Work it out');
      expect(flag(w, 'mq07-pepper-cheap')).toBe(true);
    });

    it('cutting the sack open: the silver is found, Malchus is unmasked, the board says how, the sack is gone', () => {
      const w = namesWorld();
      malchusByPepper(w);
      expect(flag(w, 'mq07-silver-found')).toBe(true);
      expect(flag(w, 'board:mercator-piperis')).toBe(true);
      expect(flag(w, 'board-how:mercator-piperis')).toContain('drachms under the pepper');
      expect(objective(w, 'malchus')!.done).toBe(true);
      expect(w.has('mq07-sack')).toBe(false);
      expect(w.notices).toContain('Unmasked on the board: Malchus son of Iarhai.');
      expect(w.subtitles.some((s) => s.text.includes('Parthian drachms'))).toBe(true);
      expect(member(w, 'mercator-piperis')).toMatchObject({ unmasked: true, name: 'Malchus son of Iarhai', how: expect.stringContaining('pepper') });
      expect(clueIds(w)).toContain('silver-in-pepper');
      // He has nothing more to say.
      expect(opening(w, 'npc-malchus')).toContain('nothing more to say');
      // Entering the bay again does not offer the sack.
      enter(w, BAY);
      expect(w.has('mq07-sack')).toBe(false);
      expect(stageOf(w)).toBe('names');
    });

    it('his ledger from the strongbox unmasks him too (any way it comes into the pack)', () => {
      const w = namesWorld();
      malchusByLedger(w);
      expect(flag(w, 'board:mercator-piperis')).toBe(true);
      expect(flag(w, 'board-how:mercator-piperis')).toContain('ledger');
      expect(objective(w, 'malchus')!.done).toBe(true);
      expect(clueIds(w)).toContain('rationes-malchi');
      expect(w.notices.filter((n) => n.includes('Malchus son of Iarhai'))).toHaveLength(1);
    });

    it('both ways together unmask him once, and the first “how” stays', () => {
      const w = namesWorld();
      malchusByPepper(w);
      malchusByLedger(w);
      expect(flag(w, 'board-how:mercator-piperis')).toContain('pepper');
      expect(w.notices.filter((n) => n.includes('Malchus son of Iarhai'))).toHaveLength(1);
    });

    it('the ledger taken before Malchus is met (the strongbox picked first) moves the quest on to `names` at once, with the objective done', () => {
      const w = leadWorld();
      malchusByLedger(w);
      expect(flag(w, 'board:mercator-piperis')).toBe(true);
      expect(stageOf(w)).toBe('names');
      expect(objective(w, 'find')!.done).toBe(true);
      expect(objective(w, 'malchus')!.done).toBe(true);
      // Malchus then has nothing more to say, and nothing is left in `lead`.
      expect(opening(w, 'npc-malchus')).toContain('nothing more to say');
      expect(stageOf(w)).toBe('names');
    });

    it('the drachm: he knows it and sends the player to Hermogenes, and nothing is unmasked', () => {
      const w = namesWorld();
      const v = talk(w, 'npc-malchus', 'Change me this coin')!;
      expect(v.nodeId).toBe('mDrachm');
      expect(v.text).toContain('Hermogenes');
      close(w);
      expect(flag(w, 'board:mercator-piperis')).toBeFalsy();
      expect(has(w, DRACHM)).toBe(true);
    });
  });

  describe('Asclepiodotus', () => {
    it('by Zenon: the table he gave, read by Gemellus (planets for letters), unmasks him', () => {
      const w = namesWorld();
      roll(w, true);
      say(w, 'npc-zenon', 'Who do you copy star tables for', 'Careful men keep a copy');
      // Gemellus opens with the star table.
      const v = w.rpg.dialogue.start('npc-gemellus')!;
      expect(v.nodeId).toBe('gm0');
      w.rpg.dialogue.choose(0);
      expect(w.rpg.dialogue.view!.nodeId).toBe('gm1');
      w.rpg.dialogue.advance();
      expect(w.rpg.dialogue.view!.nodeId).toBe('gmRead');
      expect(w.rpg.dialogue.view!.text).toContain('October');
      close(w);
      expect(flag(w, 'mq07-cipher-read')).toBe(true);
      expect(flag(w, 'board:asclepiodotus')).toBe(true);
      expect(flag(w, 'board-how:asclepiodotus')).toContain('Gemellus');
      expect(objective(w, 'chaldaean')!.done).toBe(true);
      expect(objective(w, 'cipher')!.done).toBe(true);
      expect(member(w, 'asclepiodotus')).toMatchObject({ unmasked: true, how: expect.stringContaining('cipher') });
      expect(clueIds(w)).toContain('tabula-siderum');
      expect(w.notices).toContain('Unmasked on the board: Asclepiodotus.');
      // Not asked to read it twice.
      expect(opening(w, 'npc-gemellus')).not.toContain('You again');
    });

    it('Gemellus has nothing to read for a player with no table, and goes back to his old talk', () => {
      const w = namesWorld();
      expect(w.rpg.dialogue.start('npc-gemellus')!.nodeId).not.toBe('gm0');
      close(w);
    });

    it('by the reading: 50 denarii, then left alone with the table; the nativity can be looked at (once) and taken', () => {
      const w = namesWorld();
      const den = w.rpg.inventory.denarii;
      const v = talk(w, 'npc-asclepiodotus')!;
      expect(v.nodeId).toBe('c0');
      w.rpg.dialogue.advance();
      expect(w.rpg.dialogue.view!.nodeId).toBe('cAsk');
      expect(w.rpg.dialogue.view!.choices.map((c) => c.text)).not.toContain('Malchus sent me. He said you’d charge me double, and that you’re worth it.');
      talk_on(w, 'Fifty denarii');
      expect(w.rpg.dialogue.view!.nodeId).toBe('cReading');
      w.rpg.dialogue.advance();
      expect(w.rpg.dialogue.view!.nodeId).toBe('cAlone');
      close(w);
      expect(den - w.rpg.inventory.denarii).toBe(50);
      expect(w.rpg.quests.state(Q)!.vars.alone).toBe(true);
      // The table is in his flat: offered when the player is in it, not before nor after.
      expect(w.has('mq07-nativity')).toBe(true);
      w.use('mq07-nativity');
      expect(has(w, NATIVITY)).toBe(true);
      expect(flag(w, 'mq07-saw-nativity')).toBe(true);
      expect(w.has('mq07-nativity')).toBe(false);
      expect(w.subtitles.some((s) => s.text.includes('the departure'))).toBe(true);
      expect(objective(w, 'cipher')).toBeDefined();
      expect(clueIds(w)).toContain('genitura');
      // He comes back and sits as if nothing happened.
      expect(opening(w, 'npc-asclepiodotus')).toContain('long life');
      // And Gemellus reads the nativity as he would the copy.
      say(w, 'npc-gemellus', 'Can you read this');
      expect(flag(w, 'board:asclepiodotus')).toBe(true);
      expect(flag(w, 'board-how:asclepiodotus')).toContain('Gemellus');
    });

    it('the nativity is taken once: looking again after it is taken offers nothing, and re-entering the flat does not either', () => {
      const w = namesWorld();
      chaldaeanByReading(w);
      expect(w.has('mq07-nativity')).toBe(false);
      enter(w, FLAT);
      expect(w.has('mq07-nativity')).toBe(false);
      expect(w.rpg.inventory.count(NATIVITY)).toBe(1);
    });

    it('without the money the reading is not on offer', () => {
      const w = namesWorld();
      w.rpg.inventory.spendDenarii(w.rpg.inventory.denarii - 20);
      talk(w, 'npc-asclepiodotus');
      w.rpg.dialogue.advance();
      const c = w.rpg.dialogue.view!.choices.find((x) => x.text.includes('Fifty denarii'))!;
      expect(c.enabled).toBe(false);
      close(w);
    });

    it('with Rhetoric instead of the money (Malchus’s name): a pass gives the reading, a fail sends the player away', () => {
      const w = namesWorld();
      say(w, 'npc-malchus', 'Who reads your stars');
      const den = w.rpg.inventory.denarii;
      roll(w, false);
      talk(w, 'npc-asclepiodotus');
      w.rpg.dialogue.advance();
      talk_on(w, 'Malchus sent me');
      expect(w.rpg.dialogue.view!.nodeId).toBe('cNo');
      close(w);
      expect(w.rpg.quests.state(Q)!.vars.alone).toBeFalsy();
      expect(w.has('mq07-nativity')).toBe(false);
      w.game.time.advanceHours(30);
      roll(w, true);
      say(w, 'npc-asclepiodotus', 'Malchus sent me');
      expect(w.rpg.quests.state(Q)!.vars.alone).toBe(true);
      expect(w.rpg.inventory.denarii).toBe(den);
      expect(w.has('mq07-nativity')).toBe(true);
    });
  });

  describe('Mardonius', () => {
    it('by the Father: a Rhetoric pass makes him tell (uTells), and the board says how', () => {
      const w = namesWorld();
      expect(opening(w, 'npc-cassius-ursus')).toContain('god’s house');
      roll(w, true);
      talk(w, 'npc-cassius-ursus', 'One of your Lions');
      expect(w.rpg.dialogue.view!.nodeId).toBe('uTells');
      expect(w.rpg.dialogue.view!.text).toContain('Mardonius');
      close(w);
      expect(flag(w, 'board:mardonius')).toBe(true);
      expect(flag(w, 'board-how:mardonius')).toContain('Father');
      expect(flag(w, 'mq07-feast-promised')).toBe(true);
      expect(objective(w, 'lion')!.done).toBe(true);
      expect(done(w, 'cave')).toBe(true);
      expect(member(w, 'mardonius')).toMatchObject({ unmasked: true, how: expect.stringContaining('Father') });
      expect(w.notices).toContain('Unmasked on the board: Mardonius.');
      // The leak note on the board now has his name.
      expect(board(w).notes.find((n) => n.id === 'leak')!.text).toContain('Mardonius');
    });

    it('a failed pass: “the god keeps his men’s secrets”; Pudens’s name is the easier way in', () => {
      const w = namesWorld();
      roll(w, false);
      say(w, 'npc-cassius-ursus', 'One of your Lions');
      expect(flag(w, 'board:mardonius')).toBeFalsy();
      expect(w.rpg.dialogue.start('npc-cassius-ursus')!.nodeId).toBe('uAsk');
      close(w);
      w.game.time.advanceHours(30);
      roll(w, true);
      say(w, 'npc-cassius-ursus', 'Pudens of the Castra Peregrina');
      expect(flag(w, 'board:mardonius')).toBe(true);
    });

    it('by his letter from the locked box: the item alone unmasks him, the Lion and cave objectives are done', () => {
      const w = namesWorld();
      mardoniusByLetter(w);
      expect(flag(w, 'board:mardonius')).toBe(true);
      expect(flag(w, 'board-how:mardonius')).toContain('letter');
      expect(objective(w, 'lion')!.done).toBe(true);
      expect(done(w, 'cave')).toBe(true);
      expect(clueIds(w)).toContain('epistula-mardonii');
      expect(board(w).notes.find((n) => n.id === 'leak')!.text).toContain('sold Festus’s road');
    });

    it('before he is proven the leak note is the old one, and Mardonius at the gate is his usual self', () => {
      const w = namesWorld();
      expect(board(w).notes.find((n) => n.id === 'leak')!.text).toBe('Festus’s road and hour were sold from inside the Castra Peregrina.');
      expect(opening(w, 'npc-mardonius')).toContain('Ask me anything');
    });
  });

  describe('the three proven', () => {
    it('any order: the stage is `feast` only after the third, with the hint about the night', () => {
      const w = namesWorld();
      mardoniusByLetter(w);
      expect(stageOf(w)).toBe('names');
      malchusByPepper(w);
      expect(stageOf(w)).toBe('names');
      chaldaeanByReading(w);
      expect(stageOf(w)).toBe('feast');
      expect(aurum(w).members.every((m) => m.unmasked && m.how)).toBe(true);
      expect(aurum(w).broken).toBe(true);
      expect(objective(w, 'feast')).toMatchObject({ done: false, target: { kind: 'location', id: 'mithraeum-door' } });
      expect(objective(w, 'confront')).toBeUndefined();
      expect(w.hints.some((h) => h.includes('Press T'))).toBe(true);
      // The names objectives are all done on the way.
      for (const id of ['malchus', 'chaldaean', 'cipher', 'lion']) expect(objective(w, id)?.done ?? true, id).toBe(true);
    });

    it('proven before Malchus is met (the first proof moves the quest on to `names`): the other two end it in `feast`', () => {
      const w = leadWorld();
      mardoniusByLetter(w);
      expect(stageOf(w)).toBe('names'); // (the first proof moves the quest on)
      malchusByLedger(w);
      chaldaeanByZenon(w);
      expect(stageOf(w)).toBe('feast');
    });

    it('in the daytime the hint says to wait; at night it does not', () => {
      const w = actTwo({ hour: 22 });
      say(w, 'npc-pudens', 'The Eastern Gold');
      say(w, 'npc-malchus');
      malchusByLedger(w);
      chaldaeanByZenon(w);
      mardoniusByLetter(w);
      expect(stageOf(w)).toBe('feast');
      expect(w.hints.some((h) => h.includes('Press T'))).toBe(false);
    });
  });

  describe('the feast', () => {
    it('into the cave at night: the three guests are staged on their benches (sitting, at the cell’s floor), the Father speaks, the Chaldaean is held from his flat', () => {
      const w = caveWorld();
      expect(objective(w, 'feast')!.done).toBe(true);
      expect(objective(w, 'confront')).toMatchObject({ done: false, target: { kind: 'npc', id: 'npc-mardonius' } });
      const at = (id: string) => w.staged.filter((s) => s.id === id);
      for (const id of ['npc-mardonius', 'npc-malchus', 'npc-asclepiodotus']) {
        expect(at(id).length).toBeGreaterThanOrEqual(1);
        expect(at(id).at(-1)).toMatchObject({ loop: 'sit', y: -250 });
      }
      // Three different benches.
      const xs = ['npc-mardonius', 'npc-malchus', 'npc-asclepiodotus'].map((id) => at(id).at(-1)!.x);
      expect(new Set(xs).size).toBe(3);
      expect(w.held.has('npc-asclepiodotus')).toBe(true);
      expect(w.spawned).toHaveLength(0);
      expect(w.subtitles.some((s) => s.speaker === 'Cassius Ursus' && s.text.includes('All three'))).toBe(true);
    });

    it('if the player told Mardonius what the archer said (Chapter 5): two hired knives wait on the stair, and the Father says so', () => {
      const w = caveWorld({ told: true });
      expect(w.spawned.map((s) => s.opts.id)).toEqual(KNIVES);
      expect(w.spawned.every((s) => s.archetype === 'grassator' && s.opts.quest === Q)).toBe(true);
      // On the two places of the stair (the cell’s `stair-1`, `stair-2`).
      expect(new Set(w.spawned.map((s) => s.pos.x)).size).toBe(2);
      expect(w.spawned.every((s) => s.pos.y === -250)).toBe(true);
      expect(w.subtitles.some((s) => s.speaker === 'Cassius Ursus' && s.text.includes('sent men to my door'))).toBe(true);
      expect(w.subtitles.some((s) => s.text.includes('All three'))).toBe(false);
      expect(objective(w, 'confront')).toBeDefined();
      // Not spawned twice, however often the player comes in.
      enter(w, CAVE);
      expect(w.spawned).toHaveLength(2);
    });

    it('the knife-men down: the flag is set once both are; one is not enough', () => {
      const w = caveWorld({ told: true });
      w.events.emit('actor:killed', { victimId: KNIVES[0], killerId: 'player' });
      expect(flag(w, 'mq07-knives-dead')).toBeFalsy();
      w.events.emit('actor:killed', { victimId: KNIVES[1], killerId: 'player' });
      expect(flag(w, 'mq07-knives-dead')).toBe(true);
      expect(w.notices.some((n) => n.includes('knife-men are down'))).toBe(true);
      // Back in the cave: not spawned again.
      enter(w, CAVE);
      expect(w.spawned).toHaveLength(2);
    });

    it('entering by day (a way in by the lock) does not stage the feast or spawn anyone: it waits for the night', () => {
      const w = feastWorld({ hour: 10, told: true });
      enter(w, CAVE);
      expect(w.spawned).toHaveLength(0);
      expect(w.staged.filter((s) => s.loop === 'sit')).toHaveLength(0);
      expect(objective(w, 'confront')).toBeUndefined();
      // At night the poll stages them (the player is still in the cave) and the next entry brings the knives.
      setHour(w, 22);
      tick(w);
      expect(w.staged.filter((s) => s.loop === 'sit').length).toBeGreaterThanOrEqual(3);
      enter(w, CAVE);
      expect(w.spawned).toHaveLength(2);
    });

    it('the Father of the cave tells the feast’s hour: a word by night, “come back at dark” by day', () => {
      const w = feastWorld({ hour: 10 });
      expect(opening(w, 'npc-cassius-ursus')).toContain('feast is at dark');
      setHour(w, 22);
      expect(opening(w, 'npc-cassius-ursus')).toContain('All three');
    });

    it('Mardonius talks first (md0 → md1 → md2), then draws: he is engaged as a fighter that yields at 30%', () => {
      const w = caveWorld();
      const v = talk(w, 'npc-mardonius')!;
      expect(v.nodeId).toBe('md0');
      w.rpg.dialogue.advance();
      expect(w.rpg.dialogue.view!.nodeId).toBe('md1');
      expect(w.rpg.dialogue.view!.text).toContain('Fifteen years');
      w.rpg.dialogue.advance();
      expect(w.rpg.dialogue.view!.nodeId).toBe('md2');
      expect(w.rpg.dialogue.view!.text).toContain('I sold a road');
      expect(w.engaged).toHaveLength(0);
      talk_on(w, 'You’re coming to Pudens');
      expect(w.rpg.dialogue.view!.nodeId).toBe('mdDraw');
      close(w);
      expect(w.engaged).toEqual([{ id: 'npc-mardonius', opts: expect.objectContaining({ yieldAt: 0.3, quest: Q }) }]);
      expect(stageOf(w)).toBe('feast');
    });

    it('talking to him again before the fight starts goes to “Well?”, which draws as well; the Father’s way of putting it also draws', () => {
      const w = caveWorld();
      talk(w, 'npc-mardonius');
      close(w);
      expect(w.engaged).toHaveLength(0);
      const v = w.rpg.dialogue.start('npc-mardonius')!;
      expect(v.nodeId).toBe('mdAgain');
      close(w);
      say(w, 'npc-mardonius', 'Get up, Mardonius');
      expect(w.engaged).toHaveLength(1);
      const x = caveWorld();
      say(x, 'npc-mardonius', 'The Father knows what you are');
      expect(x.engaged).toHaveLength(1);
    });

    it('Mardonius at the camp gate is his usual self before the feast, and a Mardonius met outside the feast does not draw', () => {
      const w = namesWorld();
      expect(opening(w, 'npc-mardonius')).toContain('Ask me anything');
      expect(w.engaged).toHaveLength(0);
    });
  });

  describe('Mardonius yields: the choice', () => {
    it('arrest: “taken”; the other two are seized; the gone flags; the Father’s lines; the stage is `report`', () => {
      vi.useFakeTimers();
      const w = fightWorld();
      expect(w.held.has('npc-asclepiodotus')).toBe(true);
      w.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius', choice: 'arrest' });
      expect(flag(w, 'mq07-mardonius-fate')).toBe('taken');
      expect(objective(w, 'confront')!.done).toBe(true);
      expect(stageOf(w)).toBe('report');
      expect(w.subtitles.some((s) => s.text.includes('Take him up to the street'))).toBe(true);
      expect(w.subtitles.some((s) => s.text.includes('walk them to the Caelian'))).toBe(false);
      vi.advanceTimersByTime(6000);
      expect(w.subtitles.some((s) => s.text.includes('walk them to the Caelian'))).toBe(true);
      // Gone from their posts for good; unstaged where they were seated (Mardonius too: he is alive).
      for (const id of ['npc-mardonius', 'npc-malchus', 'npc-asclepiodotus']) {
        expect(flag(w, `gone:${id}`), id).toBe(true);
        expect(w.unstaged, id).toContain(id);
      }
      expect(flag(w, 'mq07-malchus-taken')).toBe(true);
      expect(w.held.has('npc-asclepiodotus')).toBe(false);
    });

    it('spare and rob both leave him to the Father: “father”', () => {
      for (const choice of ['spare', 'rob'] as const) {
        vi.useFakeTimers();
        const w = fightWorld();
        w.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius', choice });
        expect(flag(w, 'mq07-mardonius-fate'), choice).toBe('father');
        expect(w.subtitles.some((s) => s.text.includes('god’s house keeps its own accounts')), choice).toBe(true);
        expect(flag(w, 'gone:npc-mardonius')).toBe(true);
        expect(stageOf(w)).toBe('report');
        vi.useRealTimers();
      }
    });

    it('kill: “killed”; he is not unstaged (he is dead), the others are', () => {
      vi.useFakeTimers();
      const w = fightWorld();
      w.unstaged.length = 0;
      w.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius', choice: 'kill' });
      expect(flag(w, 'mq07-mardonius-fate')).toBe('killed');
      expect(w.unstaged).not.toContain('npc-mardonius');
      expect(w.unstaged).toEqual(expect.arrayContaining(['npc-malchus', 'npc-asclepiodotus']));
      expect(flag(w, 'gone:npc-mardonius')).toBe(true);
      expect(stageOf(w)).toBe('report');
    });

    it('killed outright before he yields (actor:killed) is the same as “killed”, once', () => {
      vi.useFakeTimers();
      const w = fightWorld();
      w.events.emit('actor:killed', { victimId: 'npc-mardonius', killerId: 'player' });
      expect(flag(w, 'mq07-mardonius-fate')).toBe('killed');
      expect(stageOf(w)).toBe('report');
      const said = w.subtitles.length;
      w.events.emit('actor:killed', { victimId: 'npc-mardonius', killerId: 'player' });
      w.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius', choice: 'arrest' });
      expect(flag(w, 'mq07-mardonius-fate')).toBe('killed');
      expect(w.subtitles.length).toBe(said);
    });

    it('the choice of anyone else’s, or outside the feast, is not the quest’s', () => {
      const w = fightWorld();
      w.events.emit('combat:yieldChoice', { actorId: KNIVES[0], choice: 'kill' });
      w.events.emit('combat:yieldChoice', { actorId: 'npc-malchus', choice: 'arrest' });
      expect(flag(w, 'mq07-mardonius-fate')).toBeFalsy();
      expect(stageOf(w)).toBe('feast');
      const n = namesWorld();
      n.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius', choice: 'arrest' });
      n.events.emit('actor:killed', { victimId: 'npc-mardonius', killerId: 'player' });
      expect(flag(n, 'mq07-mardonius-fate')).toBeFalsy();
      expect(stageOf(n)).toBe('names');
    });

    it('a fight that goes through the knife-men first: their killing is counted but is not a decision', () => {
      const w = caveWorld({ told: true });
      for (const id of KNIVES) w.events.emit('actor:killed', { victimId: id, killerId: 'player' });
      expect(stageOf(w)).toBe('feast');
      expect(flag(w, 'mq07-mardonius-fate')).toBeFalsy();
    });

    it('the unique ids of a spawned copy (`~`) still count as the man', () => {
      const w = fightWorld();
      w.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius~1', choice: 'arrest' });
      expect(flag(w, 'mq07-mardonius-fate')).toBe('taken');
    });
  });

  describe('the report and the end', () => {
    it('Pudens’s report, line by line, ends the quest: gR0 … gR4, gDone', () => {
      const w = reportWorld('arrest');
      const l = lines(w, 'npc-pudens');
      expect(l.map((x) => x.split(':')[0])).toEqual(['gR0', 'gR1', 'gR2', 'gR3', 'gR4', 'gDone']);
      expect(l.find((x) => x.startsWith('gR2'))).toContain('Capena gate');
      expect(l.find((x) => x.startsWith('gR3'))).toContain('in my cells');
      expect(l.find((x) => x.startsWith('gR4'))).toContain('October');
      expect(status(w)).toMatchObject({ running: false, completed: true, stage: 'done' });
      expect(objective(w, 'report')?.done ?? true).toBe(true);
    });

    it('his word on Mardonius follows the choice: cells, the Father’s justice, or dead', () => {
      expect(lines(reportWorld('arrest'), 'npc-pudens').find((x) => x.startsWith('gR3'))).toContain('in my cells');
      expect(lines(reportWorld('spare'), 'npc-pudens').find((x) => x.startsWith('gR3'))).toContain('god’s justice');
      expect(lines(reportWorld('kill'), 'npc-pudens').find((x) => x.startsWith('gR3'))).toContain('he’s dead');
    });

    it('the rewards: 150 denarii and skill XP; the banner says the Eastern Gold is broken (“One of four” if the Purse stands)', () => {
      const w = reportWorld('arrest');
      const den = w.rpg.inventory.denarii;
      const rhet = w.rpg.sheet.baseSkillLevel('rhetoric');
      const locks = w.rpg.sheet.baseSkillLevel('locks-seals');
      lines(w, 'npc-pudens');
      expect(w.rpg.inventory.denarii - den).toBe(150);
      expect(w.rpg.sheet.baseSkillLevel('rhetoric')).toBeGreaterThan(rhet);
      expect(w.rpg.sheet.baseSkillLevel('locks-seals')).toBeGreaterThan(locks);
      expect(w.banners.filter((b) => b.title === 'The Eastern Gold is broken')).toEqual([expect.objectContaining({ title: 'The Eastern Gold is broken', subtitle: 'One of four. Pudens wants three.' })]);
      expect(board(w).broken).toBe(1);
    });

    it('with the Purse broken first, the banner says “Two of four”', () => {
      const w = reportWorld('spare');
      for (const id of ['pinarius-avitus', 'euhodus', 'hermogenes']) setFlag(w, `board:${id}`);
      lines(w, 'npc-pudens');
      expect(w.banners.filter((b) => b.title === 'The Eastern Gold is broken')).toEqual([expect.objectContaining({ title: 'The Eastern Gold is broken', subtitle: 'Two of four. Pudens wants three.' })]);
      expect(board(w).broken).toBe(2);
    });

    it('done: Malchus and the Chaldaean are unstaged, the sack and the nativity are not on offer, the hub no longer offers the quest', () => {
      const w = reportWorld('arrest');
      w.unstaged.length = 0;
      lines(w, 'npc-pudens');
      expect(w.unstaged).toEqual(expect.arrayContaining(['npc-malchus', 'npc-asclepiodotus']));
      expect(w.has('mq07-sack')).toBe(false);
      expect(w.has('mq07-nativity')).toBe(false);
      const v = w.rpg.dialogue.start('npc-pudens')!;
      expect(v.choices.map((c) => c.text)).not.toContain('The Eastern Gold: the silver and the pepper.');
      close(w);
    });

    it('a night report: the hint says to wait for the morning; on the camp’s edge too', () => {
      const w = reportWorld('arrest', { hour: 23 });
      w.hints.length = 0;
      w.events.emit('location:entered', { locationId: 'castra-peregrina' });
      expect(w.hints.some((h) => h.includes('Press T'))).toBe(true);
      setHour(w, 10);
      w.hints.length = 0;
      w.events.emit('location:entered', { locationId: 'castra-peregrina' });
      expect(w.hints).toEqual([]);
    });

    it('reaching the report at night says the same (the stage’s own hint)', () => {
      const w = fightWorld();
      w.hints.length = 0;
      w.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius', choice: 'arrest' });
      expect(w.hints.some((h) => h.includes('Press T'))).toBe(true);
    });

    it('the gone flag takes the NPC out of the world: NpcManager.isGone reads it, and refuses to stage him', () => {
      const w = reportWorld('arrest');
      const game = { quests: { flags: { get: (k: string) => w.rpg.quests.flags.get(k) } } };
      const isGone = (id: string) => NpcManager.prototype.isGone.call({ game }, id);
      expect(isGone('npc-mardonius')).toBe(true);
      expect(isGone('npc-malchus')).toBe(true);
      expect(isGone('npc-asclepiodotus')).toBe(true);
      expect(isGone('npc-clerk-piperataria')).toBe(false);
      expect(isGone('npc-cassius-ursus')).toBe(false);
    });
  });

  describe('the people in their places', () => {
    it('Gemellus is back in Tryphon’s back room while the quest hunts for names (he reads the star tables there), and gone from it before and after', () => {
      const locs = new Map<string, unknown>();
      const w = actTwo();
      const game = {
        locations: { get: (id: string) => locs.get(id), add: (l: { id: string }) => void locs.set(l.id, l), remove: (id: string) => void locs.delete(id) },
        quests: { flags: w.rpg.quests.flags, status: (id: string) => w.rpg.quests.status(id) },
      };
      syncMusHideout(game as never);
      expect(locs.has('gemellus-latebra')).toBe(false);
      say(w, 'npc-pudens', 'The Eastern Gold');
      syncMusHideout(game as never);
      expect(locs.has('gemellus-latebra')).toBe(true);
      say(w, 'npc-malchus');
      malchusByLedger(w);
      chaldaeanByZenon(w);
      mardoniusByLetter(w);
      expect(stageOf(w)).toBe('feast');
      syncMusHideout(game as never);
      expect(locs.has('gemellus-latebra')).toBe(false);
    });

    it('the Father after the feast: the cave is clean, or he will not say where Mardonius went; the Chaldaean has his closed days again', () => {
      const w = reportWorld('arrest');
      expect(opening(w, 'npc-cassius-ursus')).toContain('cave is clean');
      const f = reportWorld('spare');
      expect(opening(f, 'npc-cassius-ursus')).toContain('Don’t ask me where');
      expect(opening(w, 'npc-asclepiodotus')).toContain('heavens are closed');
    });

    it('with both reports waiting (the Purse and the Eastern Gold), Pudens takes the Eastern Gold’s first and the Purse’s on the next visit', () => {
      const w = reportWorld('arrest');
      w.rpg.quests.setStage('mq-06-sacculus', 'report');
      expect(w.rpg.quests.status('mq-06-sacculus')).toMatchObject({ running: true, stage: 'report' });
      expect(w.rpg.dialogue.start('npc-pudens')!.nodeId).toBe('gR0');
      w.rpg.dialogue.end();
      lines(w, 'npc-pudens');
      expect(status(w)).toMatchObject({ completed: true });
      expect(w.rpg.quests.status('mq-06-sacculus')).toMatchObject({ running: true, stage: 'report' });
      expect(w.rpg.dialogue.start('npc-pudens')!.nodeId).toBe('sR0');
      w.rpg.dialogue.end();
    });
  });

  describe('the board', () => {
    it('the Eastern Gold’s cell: three faces unknown until proven, with their names, roles and “how”', () => {
      const w = namesWorld();
      expect(aurum(w).members.map((m) => m.name)).toEqual(['Unknown', 'Unknown', 'Unknown']);
      expect(aurum(w).broken).toBe(false);
      malchusByLedger(w);
      expect(member(w, 'mercator-piperis')).toMatchObject({ unmasked: true, name: 'Malchus son of Iarhai', role: expect.stringContaining('Palmyra'), how: expect.stringContaining('ledger') });
      expect(member(w, 'asclepiodotus').unmasked).toBe(false);
      chaldaeanByZenon(w);
      expect(member(w, 'asclepiodotus')).toMatchObject({ unmasked: true, role: 'Chaldaean astrologer' });
      mardoniusByFather(w);
      expect(member(w, 'mardonius')).toMatchObject({ unmasked: true, name: 'Mardonius' });
      expect(aurum(w).members.every((m) => typeof m.how === 'string' && m.how.length > 5)).toBe(true);
      expect(aurum(w).broken).toBe(true);
    });

    it('the clues are pinned as they are found', () => {
      const w = namesWorld();
      // (What the earlier chapters left pinned: the coin and the smell of pepper.)
      const before = clueIds(w);
      expect(before).not.toContain('silver-in-pepper');
      malchusByPepper(w);
      expect(clueIds(w)).toEqual([...before, 'silver-in-pepper']);
      give(w, LEDGER);
      expect(clueIds(w)).toEqual(expect.arrayContaining(['silver-in-pepper', 'rationes-malchi']));
      expect(clues(w, 'aurum').find((c) => c.id === 'rationes-malchi')!.text).toContain('To the Lion, 500');
      chaldaeanByReading(w);
      expect(clueIds(w)).toEqual(expect.arrayContaining(['genitura', 'tabula-siderum']));
      give(w, LETTER);
      expect(clueIds(w)).toContain('epistula-mardonii');
      // Nothing about the fate yet.
      expect(clueIds(w)).not.toContain('mardonius-fate');
    });

    it('Caesar’s nativity is pinned once seen, even if the paper was not taken (the flag)', () => {
      const w = namesWorld();
      setFlag(w, 'mq07-saw-nativity');
      expect(clueIds(w)).toContain('genitura');
    });

    it('the Mardonius clue reads by what the player did: taken, left to the Father, killed', () => {
      const text = (w: World) => clues(w, 'aurum').find((c) => c.id === 'mardonius-fate')!.text;
      expect(text(reportWorld('arrest'))).toContain('Pudens’s cells');
      expect(text(reportWorld('spare'))).toContain('Left to the Father');
      expect(text(reportWorld('kill'))).toContain('Dead in the cave');
    });

    it('under the Toga: the praetorian with the plan, only if Mardonius was taken alive', () => {
      expect(clueIds(reportWorld('arrest'), 'toga')).toContain('praetorian');
      expect(clueIds(reportWorld('spare'), 'toga')).not.toContain('praetorian');
      expect(clueIds(reportWorld('kill'), 'toga')).not.toContain('praetorian');
      expect(clues(reportWorld('arrest'), 'toga').find((c) => c.id === 'praetorian')!.text).toContain('praetorian');
    });
  });

  describe('saves', () => {
    it('loading in the feast, in the cave at night, puts the three guests back on their benches and the held Chaldaean again', () => {
      const w = caveWorld();
      w.staged.length = 0;
      w.held.clear();
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(w.staged.map((s) => s.id).sort()).toEqual(['npc-asclepiodotus', 'npc-malchus', 'npc-mardonius']);
      expect(w.held.has('npc-asclepiodotus')).toBe(true);
    });

    it('loading in the feast outside the cave stages nobody (they are staged on the way in)', () => {
      const w = feastWorld({ hour: 22 });
      w.staged.length = 0;
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(w.staged).toHaveLength(0);
    });

    it('loading with the knife-men spawned but gone: the fight counts as over, no soft-lock; with them in the world it stays on', () => {
      const w = caveWorld({ told: true });
      expect(w.spawned).toHaveLength(2);
      for (const id of KNIVES) w.alive.add(id);
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(flag(w, 'mq07-knives-dead')).toBeFalsy();
      w.alive.clear();
      const saved = w.rpg.quests.serialize();
      w.rpg.quests.restore(JSON.parse(JSON.stringify(saved)));
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(flag(w, 'mq07-knives-dead')).toBe(true);
      expect(stageOf(w)).toBe('feast');
    });

    it('loading puts the sack back when it was found uncut, and the nativity when the player was left alone with it', () => {
      const w = namesWorld();
      roll(w, true);
      say(w, 'npc-malchus', 'Let me see your prices', 'Work it out');
      enter(w, BAY);
      expect(w.has('mq07-sack')).toBe(true);
      w.placed.length = 0;
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(w.has('mq07-sack')).toBe(true);
      const v = namesWorld();
      say(v, 'npc-asclepiodotus', 'Fifty denarii');
      expect(v.has('mq07-nativity')).toBe(true);
      v.placed.length = 0;
      v.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(v.has('mq07-nativity')).toBe(true);
    });

    it('loading after the sack is cut offers nothing again', () => {
      const w = namesWorld();
      malchusByPepper(w);
      w.events.emit('save:loaded', { slot: 'test', meta: {} as never });
      expect(w.has('mq07-sack')).toBe(false);
      expect(flag(w, 'board:mercator-piperis')).toBe(true);
    });

    it('the staging poll brings the interactions on within a second, without anything else happening', () => {
      const w = namesWorld();
      setFlag(w, 'mq07-pepper-cheap');
      w.rpg.quests.state(Q)!.vars.staged = '';
      tick(w);
      expect(w.has('mq07-sack')).toBe(true);
    });
  });

  describe('Arch of the story: the whole chapter by one route', () => {
    it('Pudens, Malchus, the sack, Zenon and Gemellus, the Father, the cave, the arrest and the report', () => {
      vi.useFakeTimers();
      const w = actTwo({ told: true });
      say(w, 'npc-pudens', 'The Eastern Gold');
      say(w, 'npc-clerk-piperataria', 'A man with Syrian rings');
      say(w, 'npc-malchus');
      malchusByPepper(w);
      chaldaeanByZenon(w);
      say(w, 'npc-pudens', 'Who would that be');
      mardoniusByFather(w);
      expect(stageOf(w)).toBe('feast');
      setHour(w, 21);
      enter(w, CAVE);
      expect(w.spawned).toHaveLength(2);
      for (const id of KNIVES) w.events.emit('actor:killed', { victimId: id, killerId: 'player' });
      say(w, 'npc-mardonius', 'You’re coming to Pudens');
      w.events.emit('combat:yieldChoice', { actorId: 'npc-mardonius', choice: 'arrest' });
      expect(stageOf(w)).toBe('report');
      setHour(w, 9);
      const den = w.rpg.inventory.denarii;
      lines(w, 'npc-pudens');
      expect(status(w)).toMatchObject({ completed: true, stage: 'done' });
      expect(w.rpg.inventory.denarii - den).toBe(150);
      expect(aurum(w).broken).toBe(true);
    });
  });
});
