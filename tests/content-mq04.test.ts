/**
 * The mq-04 quest (docs/design/mq-04-columna.md §1.2, §2, §3.8, §5) against the real QuestSystem,
 * DialogueSystem and RPG services. Stubbed: the interiors (spots and "inside" state, driven by the
 * test's own 'interior:entered' events), the dedication (a recording fake that exposes its onShot
 * hook), the calendar, the population (stage/unstage/holdNamed record calls), the Column landmark
 * and the combat service. The player moves with goTo(); the clock with setHour().
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnOptions } from '../src/content/director';
import type { DialogueView } from '../src/dialogue/DialogueSystem';
import { BITUS_PROFILE, DACIAN_KNIFE_PROFILE } from '../src/content/profiles';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame, record } from './rpg-fakes';

interface FakeDedication {
  hooks: { onShot(): void };
  starts: number;
  seals: number;
  stops: number;
  phase: string;
  start(): void;
  sealSeen(): void;
  stop(): void;
}

const ded = vi.hoisted(() => ({ made: [] as FakeDedication[] }));

vi.mock('../src/content/dedication', () => ({
  createDedication: (_game: unknown, hooks: { onShot(): void }) => {
    const d: FakeDedication = {
      hooks,
      starts: 0,
      seals: 0,
      stops: 0,
      phase: 'idle',
      start() {
        d.starts++;
      },
      sealSeen() {
        d.seals++;
      },
      stop() {
        d.stops++;
      },
    };
    ded.made.push(d);
    return d;
  },
}));

let warn: ReturnType<typeof vi.spyOn>;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  ded.made.length = 0;
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  // Handler errors are logged, not thrown: a quest that threw is a failed test.
  const logged = errors.mock.calls.map((c: unknown[]) => String(c[0]));
  vi.restoreAllMocks();
  expect(logged.filter((m: string) => m.startsWith('[quests]') || m.startsWith('[dialogue]') || m.startsWith('[content]'))).toEqual([]);
});

const Q = 'mq-04-columna';
const ARROW = 'quest-sagitta-dacica';
/** The Column's landmark origin in the world (rotation 0), so column-local points are world points plus an offset. */
const COLUMN_AT = { x: 300, y: 0, z: 300 };
/** The bronze door in the world: column-local (-1.04, -2.55). */
const DOOR = { x: COLUMN_AT.x - 1.04, y: 0.03, z: COLUMN_AT.z - 2.55 };

function world() {
  const fg = fakeGame();
  const game = fg.game as unknown as Record<string, unknown>;
  const spawned: { archetype: string; opts: SpawnOptions }[] = [];
  const combatants = new Map<string, { id: string }>();
  const despawned: string[] = [];
  const actors = new Set(['npc-gratus', 'npc-apollodorus', 'npc-crito', 'npc-pudens', 'npc-bitus', 'npc-traianus', 'npc-helpis', 'npc-festus']);
  game.combat = {
    spawnEnemy: (archetype: string, _pos: Vector3, opts: SpawnOptions) => {
      spawned.push({ archetype, opts });
      combatants.set(opts.id, { id: opts.id });
      return { id: opts.id };
    },
    get: (id: string) => combatants.get(id),
    despawn: (c: { id: string }) => {
      despawned.push(c.id);
      combatants.delete(c.id);
    },
  };
  game.actors = { get: (id: string) => (actors.has(id) ? { id, position: new Vector3(), teleport: () => {} } : undefined) };
  game.landmarks = { get: (id: string) => (id === 'column-trajan' ? { position: new Vector3(COLUMN_AT.x, COLUMN_AT.y, COLUMN_AT.z), rotationY: 0 } : undefined) };
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
  const staged: { id: string; x: number; z: number; heading: number; loop: string | null }[] = [];
  const unstaged: string[] = [];
  const held: string[] = [];
  const released: string[] = [];
  let steps = 0;
  const inside = new Set<string>();
  const spots: Record<string, Vector3> = {
    'dun-columna:landing-1': new Vector3(299, -30, 297),
    'dun-columna:landing-2': new Vector3(299, -60, 297),
    'dun-columna:chamber': new Vector3(298, -10, 296),
    'dun-columna:top': new Vector3(299, -2, 297),
    'columna-summa:bitus': new Vector3(300, 21.8, 296),
    'columna-summa:hatch': new Vector3(300, 21.8, 298),
  };
  game.interiors = {
    spot: (id: string, s: string) => {
      const p = spots[`${id}:${s}`];
      return p ? { position: p.clone(), heading: 0 } : null;
    },
    isInside: (id: string) => inside.has(id),
  };
  game.population = {
    stage: (id: string, x: number, z: number, heading: number, loop: string | null) => {
      staged.push({ id, x, z, heading, loop });
      return true;
    },
    unstage: (id: string) => {
      unstaged.push(id);
    },
    holdNamed: (id: string) => {
      held.push(id);
      return () => {
        released.push(id);
      };
    },
    crowdBoost: null,
  };
  game.calendar = {
    stepToAnchor: () => {
      steps++;
      return true;
    },
  };
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  // Places the Column's content uses (the real ones come from the atlas and the landmark builders).
  if (!rpg.locations.get('forum-trajan')) rpg.locations.add({ id: 'forum-trajan', name: 'Forum of Trajan', position: { x: 200, y: 0, z: 200 }, radius: 40, discoverable: false });
  rpg.locations.add({ id: 'column-door', name: 'The Column’s door', position: { x: DOOR.x, y: 0, z: DOOR.z }, radius: 3, discoverable: false });
  return {
    ...fg,
    rpg,
    spawned,
    despawned,
    combatants,
    staged,
    unstaged,
    held,
    released,
    placed,
    inside,
    get steps() {
      return steps;
    },
  };
}
type World = ReturnType<typeof world>;

/** Walk the player into a named place and let the location system notice. */
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

/** Talk to an NPC, picking choices whose text contains each string. Returns the last view (null when the talk ended). */
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

/** Pick a choice (by text) in the conversation already open. */
function pick(w: World, p: string): DialogueView | null {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
  if (!v) throw new Error(`no conversation open for "${p}"`);
  const i = v.choices.findIndex((c) => c.text.includes(p));
  if (i < 0) throw new Error(`${v.npcId}/${v.nodeId}: no choice "${p}" in ${JSON.stringify(v.choices.map((c) => c.text))}`);
  return w.rpg.dialogue.choose(i);
}

/** Finish the current conversation (continue through text, then close). */
function close(w: World) {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
  if (w.rpg.dialogue.active) w.rpg.dialogue.end();
}

const status = (w: World, id: string) => w.rpg.quests.status(id);
const lastJournal = (w: World, id: string) => w.rpg.quests.state(id)!.journal.at(-1)!.text;
const kill = (w: World, id: string) => w.events.emit('actor:killed', { victimId: id, killerId: 'player' });
const yieldTo = (w: World, id: string) => w.events.emit('actor:yielded', { actorId: id, byId: 'player' });
const choice = (w: World, actorId: string, c: 'spare' | 'kill') => w.events.emit('combat:yieldChoice', { actorId, choice: c });
const flag = (w: World, name: string) => w.rpg.dialogue.flags.get(name);
const objective = (w: World, q: string, id: string) => w.rpg.quests.objectives(q).find((o) => o.id === id);
const notices = (log: { e: unknown }[]) => log.map((x) => String((x.e as { text?: string }).text ?? ''));
const current = () => ded.made.at(-1)!;
const pop = (w: World) => (w.game as unknown as { population: { crowdBoost: ((x: number, z: number) => number) | null } }).population;

/** mq-03 is done: mq-04 starts at dawn, at 01:00. */
function dawnWorld() {
  const w = world();
  setHour(w, 1);
  w.rpg.quests.setStage('mq-03-lemuria', 'done');
  expect(status(w, Q)).toMatchObject({ running: true, stage: 'dawn' });
  return w;
}

/** Dawn, then the Forum at 06:00: the post. */
function postWorld() {
  const w = dawnWorld();
  goTo(w, 'forum-trajan');
  setHour(w, 6);
  expect(status(w, Q)!.stage).toBe('post');
  return w;
}

/** Gratus's briefing done: the ceremony. */
function ceremonyWorld() {
  const w = postWorld();
  talk(w, 'npc-gratus', 'Where do you want me?');
  close(w);
  expect(status(w, Q)!.stage).toBe('ceremony');
  return w;
}

/** The player at the door at 06:00: the dedication runs, the shot comes, the climb begins. */
function climbWorld() {
  const w = ceremonyWorld();
  goTo(w, 'column-door');
  expect(current().starts).toBe(1);
  current().hooks.onShot();
  expect(status(w, Q)!.stage).toBe('climb');
  return w;
}

/** Up the stair to the platform: the archer is on the top. */
function archerWorld() {
  const w = climbWorld();
  w.inside.add('dun-columna');
  w.events.emit('interior:entered', { id: 'dun-columna' });
  w.inside.add('columna-summa');
  w.events.emit('interior:entered', { id: 'columna-summa' });
  expect(status(w, Q)!.stage).toBe('archer');
  return w;
}

describe('mq-04-columna: One Hundred Feet', () => {
  it('mq-03 done → mq-04 at dawn: the calendar steps to the anchor, the court is staged, Trajan is held, the night hint', () => {
    const w = world();
    const notes = record(w.events, ['rpg:notify']);
    setHour(w, 1);
    w.rpg.quests.setStage('mq-03-lemuria', 'done');
    expect(status(w, Q)).toMatchObject({ running: true, stage: 'dawn' });
    expect(w.steps).toBe(1);
    expect(w.held).toContain('npc-traianus');
    expect(notices(notes).some((t) => t.includes('Press T to wait until first light, about 05:30.'))).toBe(true);
    const g = w.staged.find((s) => s.id === 'npc-gratus')!;
    expect(g).toMatchObject({ loop: 'stand' });
    expect(g.x).toBeCloseTo(COLUMN_AT.x + 1.4, 3);
    expect(g.z).toBeCloseTo(COLUMN_AT.z - 4.6, 3);
    const apo = w.staged.find((s) => s.id === 'npc-apollodorus')!;
    expect(apo).toMatchObject({ loop: 'talk' });
    expect(apo.x).toBeCloseTo(COLUMN_AT.x - 3.0, 3);
    expect(lastJournal(w, Q)).toContain('Gratus had told me to be in the Forum of Trajan at first light.');
  });

  it('dawn completes at 06:00 in the Forum, not before', () => {
    const w = dawnWorld();
    goTo(w, 'forum-trajan');
    expect(status(w, Q)!.stage).toBe('dawn');
    setHour(w, 5);
    expect(status(w, Q)!.stage).toBe('dawn');
    setHour(w, 6);
    expect(status(w, Q)!.stage).toBe('post');
    expect(w.staged.some((s) => s.id === 'npc-gratus')).toBe(true);
  });

  it('Gratus’s briefing (postEnd) → ceremony; the optional door question is an objective of the post', () => {
    const w = postWorld();
    talk(w, 'npc-gratus', 'Where do you want me?');
    close(w);
    expect(status(w, Q)).toMatchObject({ running: true, stage: 'ceremony' });
    expect(objective(w, Q, 'post')!.text).toContain('Column');
  });

  it('before 06:00 the ceremony hints to wait and does not start at the door; at 06:00 it starts there', () => {
    const w = dawnWorld();
    const notes = record(w.events, ['rpg:notify']);
    w.rpg.quests.setStage(Q, 'ceremony');
    expect(notices(notes).some((t) => t.includes('Caesar comes at the second hour. Press T to wait until 06:00.'))).toBe(true);
    goTo(w, 'column-door');
    expect(ded.made.length).toBe(0);
    setHour(w, 6);
    expect(ded.made.length).toBe(1);
    expect(current().starts).toBe(1);
  });

  it('at the door at 07:00 the dedication starts and Apollodorus leaves the court', () => {
    const w = ceremonyWorld();
    setHour(w, 7);
    goTo(w, 'column-door');
    expect(current().starts).toBe(1);
    expect(w.unstaged).toContain('npc-apollodorus');
    expect(w.staged.some((s) => s.id === 'npc-gratus' && s.loop === 'stand')).toBe(true);
  });

  it('the seal: examining it sets the flag, notifies, and tells the dedication', () => {
    const w = ceremonyWorld();
    const notes = record(w.events, ['rpg:notify']);
    goTo(w, 'column-door');
    const seal = w.placed.find((p) => p.id === 'content:mq04-seal');
    expect(seal).toBeDefined();
    seal!.interact(w.game);
    expect(flag(w, 'mq04-seal-seen')).toBe(true);
    expect(current().seals).toBe(1);
    expect(notices(notes).some((t) => t.includes('Someone has been inside since dawn.'))).toBe(true);
    expect(objective(w, Q, 'seal')!.done).toBe(true);
  });

  it('the arrow (onShot) → climb with the door open; Gratus lies down; his wounded talk opens on its own', () => {
    const w = ceremonyWorld();
    goTo(w, 'column-door');
    const dialogues = record(w.events, ['dialogue:started']);
    const subs = record(w.events, ['ui:subtitle']);
    w.staged.splice(0);
    current().hooks.onShot();
    expect(status(w, Q)!.stage).toBe('climb');
    expect(flag(w, 'columna-open')).toBe(true);
    expect(w.staged.find((s) => s.id === 'npc-gratus')).toMatchObject({ loop: 'sleep' });
    // Crito is staged at his start, then (no walking population here) at the kneeling point.
    expect(w.staged.filter((s) => s.id === 'npc-crito').at(-1)).toMatchObject({ loop: 'pray' });
    // The quest's Crito (the dedication's figure steps aside) says the line when he kneels by Gratus.
    expect(notices(subs)).toContain('Lay him flat. Press there. No, harder. Good.');
    w.step(60 * 2);
    expect(dialogues.some((d) => (d.e as { npcId: string }).npcId === 'npc-gratus')).toBe(true);
    expect(w.rpg.dialogue.view?.nodeId).toBe('w0');
  });

  it('entering the stair spawns the two knife-men once, and the stair objectives follow the player', () => {
    const w = climbWorld();
    w.inside.add('dun-columna');
    w.events.emit('interior:entered', { id: 'dun-columna' });
    expect(w.spawned.map((s) => [s.archetype, s.opts.id])).toEqual([
      ['grassator', 'mq04-dacian-a'],
      ['grassator', 'mq04-dacian-b'],
    ]);
    expect(w.spawned[0].opts).toMatchObject({ name: 'Dacian knife-man', profile: DACIAN_KNIFE_PROFILE, quest: Q, aggro: 6, tags: [Q, 'stair'] });
    w.events.emit('interior:entered', { id: 'dun-columna' });
    expect(w.spawned.length).toBe(2);
    expect(objective(w, Q, 'door')!.done).toBe(true);
    expect(w.placed.some((p) => p.id === 'content:mq04-chamber')).toBe(true);
    kill(w, 'mq04-dacian-a');
    expect(objective(w, Q, 'stairmen')!.count).toBe(1);
    kill(w, 'mq04-dacian-a');
    expect(objective(w, Q, 'stairmen')!.count).toBe(1);
    kill(w, 'mq04-dacian-b');
    expect(objective(w, Q, 'stairmen')!.done).toBe(true);
  });

  it('the top of the stair (columna-summa) → archer, with Bitus spawned once on the platform', () => {
    const w = archerWorld();
    const bitus = w.spawned.filter((s) => s.opts.id === 'npc-bitus');
    expect(bitus.length).toBe(1);
    expect(bitus[0]).toMatchObject({ archetype: 'sagittarius' });
    expect(bitus[0].opts).toMatchObject({ npc: 'npc-bitus', name: 'Bitus', profile: BITUS_PROFILE, quest: Q, aggro: 12 });
    // Re-entering the platform does not spawn him again.
    w.events.emit('interior:entered', { id: 'columna-summa' });
    expect(w.spawned.filter((s) => s.opts.id === 'npc-bitus').length).toBe(1);
  });

  it('Bitus spared → aftermath; his talk opens after 1.2 s; “Get up” takes him down in chains', () => {
    const w = archerWorld();
    const notes = record(w.events, ['rpg:notify']);
    yieldTo(w, 'npc-bitus');
    choice(w, 'npc-bitus', 'spare');
    expect(status(w, Q)!.stage).toBe('aftermath');
    expect(flag(w, 'bitus-fate')).toBe('spared');
    expect(lastJournal(w, Q)).toContain('I spared him.');
    w.step(60 * 1.5);
    expect(w.rpg.dialogue.view?.npcId).toBe('npc-bitus');
    pick(w, 'Who paid you?');
    pick(w, 'Get up.');
    close(w);
    expect(w.despawned).toEqual(['npc-bitus']);
    expect(notices(notes)).toContain('Pudens’s men came up the stair and took Bitus down in chains.');
    expect(status(w, Q)!.stage).toBe('aftermath');
  });

  it('coming out of the stair\'s door into the court completes "Go down to Gratus"', () => {
    const w = archerWorld();
    yieldTo(w, 'npc-bitus');
    w.inside.delete('columna-summa');
    w.events.emit('interior:exited', { id: 'columna-summa' });
    expect(status(w, Q)!.stage).toBe('aftermath');
    const down = () => w.rpg.quests.objectives(Q).find((o) => o.id === 'down');
    expect(down()?.done).toBe(false);
    // Down the stair and out of its door: the player lands on the door's own spot.
    w.inside.delete('dun-columna');
    w.events.emit('interior:exited', { id: 'dun-columna' });
    expect(down()?.done).toBe(true);
  });

  it('leaving the platform with Bitus yielded and undecided counts as spared', () => {
    const w = archerWorld();
    yieldTo(w, 'npc-bitus');
    w.inside.delete('columna-summa');
    w.events.emit('interior:exited', { id: 'columna-summa' });
    expect(flag(w, 'bitus-fate')).toBe('spared');
    expect(status(w, Q)!.stage).toBe('aftermath');
  });

  it('Bitus killed (a second world): the archer waits for the bone token, then aftermath-killed', () => {
    const w = archerWorld();
    yieldTo(w, 'npc-bitus');
    choice(w, 'npc-bitus', 'kill');
    kill(w, 'npc-bitus');
    expect(flag(w, 'bitus-fate')).toBe('killed');
    expect(status(w, Q)!.stage).toBe('archer');
    expect(objective(w, Q, 'search')).toBeDefined();
    w.events.emit('item:added', { itemId: 'quest-tessera-mucaporis', count: 1 });
    expect(status(w, Q)).toMatchObject({ running: true, stage: 'aftermath-killed' });
    expect(objective(w, Q, 'search')!.done).toBe(true);
    expect(lastJournal(w, Q)).toContain('MVCAPOR');
    // Pudens's talk is the killed variant.
    const v = talk(w, 'npc-pudens');
    expect(v!.text).toContain('dead Dacian');
  });

  it('Pudens summonsEnd → done: the banner, the rewards, Trajan and the court released', () => {
    const w = archerWorld();
    const banners = record(w.events, ['ui:banner']);
    yieldTo(w, 'npc-bitus');
    choice(w, 'npc-bitus', 'spare');
    w.step(60 * 1.5);
    pick(w, 'Get up.');
    close(w);
    const before = w.rpg.inventory.denarii;
    const blades = w.rpg.sheet.baseSkillLevel('blades');
    const athletics = w.rpg.sheet.baseSkillLevel('athletics');
    talk(w, 'npc-pudens', 'What happens now?', 'A hawk over the Column');
    close(w);
    expect(status(w, Q)).toMatchObject({ completed: true, stage: 'done' });
    expect(w.rpg.inventory.denarii).toBe(before + 80);
    // One level's worth of XP in each of the reward's skills.
    expect(w.rpg.sheet.baseSkillLevel('blades')).toBe(blades + 1);
    expect(w.rpg.sheet.baseSkillLevel('athletics')).toBe(athletics + 1);
    // The ring comes from Pudens's dialogue (once); the arrow from the first talk with Pudens in aftermath.
    expect(w.rpg.inventory.count('anulus-peregrinorum')).toBe(1);
    expect(w.rpg.inventory.count(ARROW)).toBe(1);
    expect(pop(w).crowdBoost).toBeNull();
    expect(banners.some((b) => (b.e as { title?: string }).title === 'The Board')).toBe(true);
    for (const id of ['npc-gratus', 'npc-crito', 'npc-pudens', 'npc-apollodorus']) expect(w.unstaged).toContain(id);
    expect(w.released).toContain('npc-traianus');
    expect(current().stops).toBeGreaterThanOrEqual(1);
    expect(lastJournal(w, Q)).toContain('Castra Peregrina');
  });

  it('save:loaded mid-ceremony re-stages Gratus and drops the old dedication; the next visit starts a new one', () => {
    const w = ceremonyWorld();
    goTo(w, 'column-door');
    expect(ded.made.length).toBe(1);
    w.staged.splice(0);
    w.events.emit('save:loaded', { slot: 'a', meta: {} as never });
    expect(w.staged.some((s) => s.id === 'npc-gratus' && s.loop === 'stand')).toBe(true);
    expect(ded.made[0].stops).toBe(1);
    expect(status(w, Q)!.stage).toBe('ceremony');
    goTo(w, 'forum-trajan');
    goTo(w, 'column-door');
    expect(ded.made.length).toBe(2);
    expect(current().starts).toBe(1);
  });

  it('the Dacian arrow is given once, at the first talk with Pudens in aftermath, and Crito does not give it again', () => {
    const w = archerWorld();
    yieldTo(w, 'npc-bitus');
    choice(w, 'npc-bitus', 'spare');
    w.step(60 * 1.5);
    pick(w, 'Get up.');
    close(w);
    expect(w.rpg.inventory.count(ARROW)).toBe(0);
    talk(w, 'npc-pudens');
    close(w);
    expect(w.rpg.inventory.count(ARROW)).toBe(1);
    talk(w, 'npc-crito');
    close(w);
    expect(w.rpg.inventory.count(ARROW)).toBe(1);
    expect(flag(w, 'mq04-arrow-given')).toBe(true);
  });

  it('rob and arrest are spares too: the archer is taken down and the stage moves to aftermath', () => {
    for (const c of ['rob', 'arrest'] as const) {
      const w = archerWorld();
      yieldTo(w, 'npc-bitus');
      w.events.emit('combat:yieldChoice', { actorId: 'npc-bitus', choice: c });
      expect(flag(w, 'bitus-fate'), c).toBe('spared');
      expect(status(w, Q)!.stage, c).toBe('aftermath');
    }
  });

  it('the Apollodorus door question (flag mq04-apollodorus-door) completes its optional objective in the post', () => {
    const w = postWorld();
    expect(objective(w, Q, 'ask-door')!.done).toBeFalsy();
    w.events.emit('flag:changed', { name: 'mq04-apollodorus-door', value: true });
    expect(objective(w, Q, 'ask-door')!.done).toBe(true);
    expect(status(w, Q)!.stage).toBe('post');
  });

  it('mq-03 ending after noon: the calendar steps when the clock reaches 00:00 (§2.2)', () => {
    const w = world();
    setHour(w, 13);
    w.rpg.quests.setStage('mq-03-lemuria', 'done');
    expect(status(w, Q)).toMatchObject({ running: true, stage: 'dawn' });
    expect(w.steps).toBe(0);
    setHour(w, 0);
    expect(w.steps).toBe(1);
    setHour(w, 1);
    expect(w.steps).toBe(1);
  });

  it('the seal examined before 06:00 is remembered: the dedication starts with it already seen', () => {
    const w = dawnWorld();
    w.rpg.quests.setStage(Q, 'ceremony');
    goTo(w, 'column-door');
    expect(ded.made.length).toBe(0);
    w.placed.find((p) => p.id === 'content:mq04-seal')!.interact(w.game);
    expect(flag(w, 'mq04-seal-seen')).toBe(true);
    setHour(w, 6);
    expect(current().starts).toBe(1);
    expect(current().seals).toBe(1);
  });

  it('save:loaded on the stair: the foes not down come back, and the chamber examine is placed once', () => {
    const w = climbWorld();
    w.inside.add('dun-columna');
    w.events.emit('interior:entered', { id: 'dun-columna' });
    expect(w.spawned.length).toBe(2);
    kill(w, 'mq04-dacian-a');
    w.events.emit('save:loaded', { slot: 'a', meta: {} as never });
    expect(w.spawned.map((s) => s.opts.id)).toEqual(['mq04-dacian-a', 'mq04-dacian-b', 'mq04-dacian-b']);
    expect(w.placed.filter((p) => p.id === 'content:mq04-chamber').length).toBe(1);
    expect(w.staged.filter((s) => s.id === 'npc-gratus').at(-1)).toMatchObject({ loop: 'sleep' });
    expect(status(w, Q)!.stage).toBe('climb');
  });

  it('the Forum fills for the day (×1.3 near the forum) and the crowd boost goes at the end', () => {
    const w = dawnWorld();
    const f = w.rpg.locations.get('forum-trajan')!;
    const boost = pop(w).crowdBoost!;
    expect(boost(f.position.x, f.position.z)).toBeCloseTo(1.3, 5);
    expect(boost(f.position.x + 500, f.position.z)).toBe(1);
  });

  it('a killed archer with no save: the search objective is completed on load in aftermath-killed (the body is not saved)', () => {
    const w = archerWorld();
    yieldTo(w, 'npc-bitus');
    choice(w, 'npc-bitus', 'kill');
    kill(w, 'npc-bitus');
    w.inside.delete('columna-summa');
    w.events.emit('interior:exited', { id: 'columna-summa' });
    expect(status(w, Q)!.stage).toBe('aftermath-killed');
    expect(objective(w, Q, 'search')!.done).toBe(false);
    w.events.emit('save:loaded', { slot: 'a', meta: {} as never });
    expect(objective(w, Q, 'search')!.done).toBe(true);
  });

  it('the dedication is dropped once its panic is over, so its own Crito does not stay beside the staged one', () => {
    const w = climbWorld();
    const d = current();
    expect(d.stops).toBe(0);
    d.phase = 'over';
    w.step(60);
    expect(d.stops).toBe(1);
  });

  it('Bitus dies with no fate chosen: that is a kill, and the search is open', () => {
    const w = archerWorld();
    kill(w, 'npc-bitus');
    expect(flag(w, 'bitus-fate')).toBe('killed');
    expect(status(w, Q)!.stage).toBe('archer');
    expect(objective(w, Q, 'search')!.done).toBe(false);
  });

  it('Crito runs to Gratus through the population; he kneels and speaks when he arrives', () => {
    const w = ceremonyWorld();
    const pop = (w.game as unknown as { population: Record<string, unknown> }).population;
    const walks: { x: number; z: number }[] = [];
    const crito = { id: 'npc-crito' };
    pop.get = (id: string) => (id === 'npc-crito' ? crito : undefined);
    pop.direct = (_npc: unknown, x: number, z: number) => {
      walks.push({ x, z });
      return true;
    };
    const subs = record(w.events, ['ui:subtitle']);
    goTo(w, 'column-door');
    current().hooks.onShot();
    expect(status(w, Q)!.stage).toBe('climb');
    expect(walks.length).toBe(1);
    // Kneeling point: 0.8 m east of Gratus's fall at column-local (0.2, -3.6).
    expect(Math.hypot(walks[0].x - (COLUMN_AT.x + 1.0), walks[0].z - (COLUMN_AT.z - 3.6))).toBeLessThan(1.5);
    // Not yet arrived: no kneel, no line.
    expect(w.staged.filter((s) => s.id === 'npc-crito').every((s) => s.loop !== 'pray')).toBe(true);
    expect(notices(subs)).not.toContain(CRITO_LINE);
    // He reaches the kneeling point: he kneels, and the line is said once. While the dedication is live its own Crito says it, so the quest waits for the dedication to end.
    expect(notices(subs)).not.toContain(CRITO_LINE);
    current().phase = 'over';
    const at = new Vector3(COLUMN_AT.x + 1.0, 0, COLUMN_AT.z - 3.6);
    (w.game as unknown as { actors: { get(id: string): unknown } }).actors.get = (id: string) =>
      id === 'npc-crito' ? { id, position: at, teleport: () => {} } : undefined;
    w.step(60);
    expect(w.staged.filter((s) => s.id === 'npc-crito').at(-1)).toMatchObject({ loop: 'pray' });
    expect(notices(subs).filter((t) => t === CRITO_LINE).length).toBe(1);
  });

  it('a Column not placed yet stages nobody; the poll stages Gratus once it is', () => {
    const w = world();
    const game = w.game as unknown as { landmarks: unknown };
    const real = game.landmarks;
    game.landmarks = { get: () => undefined };
    setHour(w, 1);
    w.rpg.quests.setStage('mq-03-lemuria', 'done');
    expect(status(w, Q)!.stage).toBe('dawn');
    expect(w.staged.some((s) => s.id === 'npc-gratus')).toBe(false);
    game.landmarks = real;
    w.step(60);
    expect(w.staged.some((s) => s.id === 'npc-gratus' && s.loop === 'stand')).toBe(true);
  });
});

const CRITO_LINE = 'Lay him flat. Press there. No, harder. Good.';
