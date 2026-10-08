/**
 * Scripted playthroughs of the v0.1 quests (AC-15) against the real QuestSystem, DialogueSystem
 * and RPG services: the player talks (choosing dialogue lines by their text), walks (moving the
 * player into named places so the location system fires), fights (emitting 'actor:killed' /
 * 'actor:yielded' as the combat module would) and waits (advancing the clock). A fake combat
 * service records what the quests ask it to spawn.
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnOptions } from '../src/content/director';
import type { DialogueView } from '../src/dialogue/DialogueSystem';
import { arenaPurse } from '../src/rpg/arena';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame, record } from './rpg-fakes';

let warn: ReturnType<typeof vi.spyOn>;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  // Handler errors are logged, not thrown: a quest that threw is a failed test.
  const logged = errors.mock.calls.map((c: unknown[]) => String(c[0]));
  vi.restoreAllMocks();
  expect(logged.filter((m: string) => m.startsWith('[quests]') || m.startsWith('[dialogue]') || m.startsWith('[content]'))).toEqual([]);
});

interface WorldOptions {
  /** Actors already in the world (the NPC module spawned them). */
  actors?: string[];
  /** Give the world a combat module (default true). */
  combat?: boolean;
  /** Give combat an `engage` hook for actors already in the world. */
  engage?: boolean;
  /** Give the world an interaction system that records what content places. */
  interactions?: boolean;
  background?: string;
}

function world(o: WorldOptions = {}) {
  const fg = fakeGame();
  const game = fg.game as unknown as Record<string, unknown>;
  const spawned: { archetype: string; opts: SpawnOptions }[] = [];
  const engaged: string[] = [];
  const actors = new Set(o.actors ?? []);
  if (o.combat !== false) {
    game.combat = {
      spawnEnemy: (archetype: string, _pos: Vector3, opts: SpawnOptions) => {
        spawned.push({ archetype, opts });
        return { id: opts.id };
      },
      ...(o.engage ? { engage: (id: string) => void engaged.push(id) } : {}),
    };
  }
  const moved: { id: string; to: { x: number; z: number } }[] = [];
  game.actors = { get: (id: string) => (actors.has(id) ? { id, position: new Vector3(), teleport: (p: { x: number; z: number }) => moved.push({ id, to: p }) } : undefined) };
  const placed: { id: string; interact(g: unknown): void }[] = [];
  if (o.interactions) game.interactions = { add: (i: { id: string; interact(g: unknown): void }) => (placed.push(i), () => placed.splice(placed.indexOf(i), 1)) };
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: o.background ?? 'civis-suburanus' });
  return { ...fg, rpg, spawned, engaged, actors, placed, moved };
}
type World = ReturnType<typeof world>;

/** Walk the player into a named place and let the location system notice. */
function goTo(w: World, id: string) {
  const l = w.rpg.locations.get(id);
  if (!l) throw new Error(`no place ${id}`);
  (w.game.player!.position as Vector3).set(l.position.x, 0, l.position.z);
  w.step(20);
}

/** Talk to an NPC, picking choices whose text contains each string; continues through text-only nodes. Returns the last view (null when the talk ended). */
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
  while (v && !v.choices.length) v = w.rpg.dialogue.advance();
  w.rpg.dialogue.end();
}

const status = (w: World, id: string) => w.rpg.quests.status(id);
const lastJournal = (w: World, id: string) => w.rpg.quests.state(id)!.journal.at(-1)!.text;
const kill = (w: World, id: string, tags?: string[]) => w.events.emit('actor:killed', { victimId: id, killerId: 'player', tags });
const yieldTo = (w: World, id: string) => w.events.emit('actor:yielded', { actorId: id, byId: 'player' });
/** Advance the clock to the next time it is `hour` o'clock (fires 'time:hour' on the way). */
function waitUntil(w: World, hour: number) {
  const now = w.game.time.hour;
  w.game.time.advanceHours(((hour - now + 24) % 24) || 24);
}
const unknownItems = () => warn.mock.calls.map((c: unknown[]) => String(c[0])).filter((m: string) => m.includes('unknown item'));


const flag = (w: World, name: string) => w.rpg.dialogue.flags.get(name);
const setFlag = (w: World, name: string, v: number | string | boolean) => w.rpg.dialogue.flags.set(name, v);
const objective = (w: World, q: string, id: string) => w.rpg.quests.objectives(q).find((o) => o.id === id);

describe('mq-01-madida-capena: The Dripping Gate', () => {
  it('starts at a new game; the cart talk sets up the danger → gate → ambush → Festus’ last words', () => {
    const w = world({ actors: ['npc-festus', 'npc-dromo'], interactions: true });
    const deaths = record(w.events, ['actor:killed']);
    expect(status(w, 'mq-01-madida-capena')).toMatchObject({ running: true, stage: 'start' });
    expect(w.rpg.quests.tracked).toBe('mq-01-madida-capena');
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(0); // not in the starting pack

    // On the cart: Festus is a courier, he is being followed, and he asks for company.
    let v = talk(w, 'npc-festus');
    expect(v!.nodeId).toBe('n0');
    pick(w, 'First time.');
    pick(w, 'You keep looking back down the road.');
    expect(flag(w, 'festus-followed')).toBe(true);
    pick(w, 'Who’s waiting for you in Rome?');
    expect(flag(w, 'festus-mentioned-twin')).toBe(true);
    pick(w, 'We’re nearly at the gate.');
    expect(w.rpg.dialogue.view!.text).toContain('Two are harder to knife than one');
    v = pick(w, 'I’ll walk with you.');
    expect(v!.nodeId).toBe('cartEnd');
    close(w);
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('gate');
    expect(objective(w, 'mq-01-madida-capena', 'walk-gate')!.text).toContain('with Festus');

    // Under the arch the knife-men come: two tutorial thugs, and the hooded killer who runs.
    goTo(w, 'courier-ambush');
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('ambush');
    expect(w.spawned.map((s) => [s.archetype, s.opts.id, s.opts.hostile])).toEqual([
      ['grassator', 'mq01-hooded-man', false],
      ['grassator', 'mq01-grassator-a', true],
      ['grassator', 'mq01-grassator-b', true],
    ]);
    expect(w.spawned[0].opts.npc).toBe('npc-mus'); // the man the player meets again in the taberna
    expect(w.spawned[1].opts.profile).toMatchObject({ name: 'Grassator with a knife', health: 45 });
    expect(flag(w, 'mus-has-satchel')).toBe(true);

    yieldTo(w, 'mq01-grassator-a');
    kill(w, 'mq01-grassator-a'); // the same foe twice counts once
    expect(objective(w, 'mq-01-madida-capena', 'fight')!.count).toBe(1);
    kill(w, 'somebody-else');
    kill(w, 'mq01-grassator-b');
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('dying');

    // Dromo saw the hooded fighter; Festus gives the tablet, names Gratus and Castor, and dies.
    talk(w, 'npc-dromo', 'Did you see who did it?');
    close(w);
    expect(flag(w, 'clue-hooded-fighter')).toBe(true);
    expect(objective(w, 'mq-01-madida-capena', 'ask-dromo')!.done).toBe(true);
    deaths.length = 0;
    v = talk(w, 'npc-festus');
    expect(v!.nodeId).toBe('d0');
    while (w.rpg.dialogue.view && !w.rpg.dialogue.view.choices.length) w.rpg.dialogue.advance();
    expect(w.rpg.dialogue.view!.text).toContain('strongrooms under the Temple of Castor');
    pick(w, 'Who did this to you?');
    pick(w, 'I’ll tell her myself.');
    close(w);
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(1);
    expect(flag(w, 'clue-curved-blade')).toBe(true);
    expect(flag(w, 'promised-festus')).toBe(true);
    expect(flag(w, 'festus-dead')).toBe(true);
    expect(deaths.some((d) => (d.e as { victimId: string }).victimId === 'npc-festus')).toBe(true);
    expect(status(w, 'mq-01-madida-capena')).toMatchObject({ completed: true, stage: 'done' });
    expect(lastJournal(w, 'mq-01-madida-capena')).toContain('Gratus');

    // The next chapter takes over at once and is tracked; his body can be searched.
    expect(status(w, 'mq-02-tabella')).toMatchObject({ running: true, stage: 'start' });
    expect(w.rpg.quests.tracked).toBe('mq-02-tabella');
    const before = w.rpg.inventory.denarii;
    w.placed.find((p) => p.id === 'content:festus-body')!.interact(w.game);
    expect(w.rpg.inventory.count('quest-epistula-festi')).toBe(1);
    expect(w.rpg.inventory.count('pugio')).toBeGreaterThanOrEqual(1);
    expect(w.rpg.inventory.denarii).toBeCloseTo(before + 6.1875, 3);
    expect(objective(w, 'mq-02-tabella', 'search')!.done).toBe(true);
    expect(unknownItems()).toEqual([]);
  });

  it('stays playable without combat or NPCs: the knife-men run, the tablet is taken from the belt', () => {
    const w = world({ combat: false });
    goTo(w, 'courier-ambush');
    expect(status(w, 'mq-01-madida-capena')!.completed).toBe(true);
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(1);
    expect(status(w, 'mq-02-tabella')!.stage).toBe('start');
  });

  it('walking off to the gate counts as agreeing to go with Festus; running 40 m off ends the fight', () => {
    const w = world({ actors: ['npc-festus'] });
    goTo(w, 'courier-ambush');
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('ambush');
    kill(w, 'mq01-grassator-a');
    goTo(w, 'circus-maximus'); // far away: the other one gives up
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('dying');
  });

  it('never stops at the dying courier: walking on to the Forum without his last words still gives the tablet', () => {
    const w = world({ actors: ['npc-festus'] });
    const deaths = record(w.events, ['actor:killed']);
    goTo(w, 'courier-ambush');
    kill(w, 'mq01-grassator-a');
    kill(w, 'mq01-grassator-b');
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('dying');
    goTo(w, 'circus-maximus'); // still dying: the player may go back
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('dying');
    goTo(w, 'miliarium-aureum');
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(1);
    expect(flag(w, 'festus-dead')).toBe(true);
    expect(deaths.some((d) => (d.e as { victimId: string }).victimId === 'npc-festus')).toBe(true);
    expect(status(w, 'mq-01-madida-capena')).toMatchObject({ completed: true });
    expect(status(w, 'mq-02-tabella')!.running).toBe(true);
  });

  it('spawns the knife-men where the world says they wait (the Capena builder’s spots, or the fallback)', () => {
    const w = world({ actors: ['npc-festus'] });
    const at: { id: string; x: number; z: number }[] = [];
    (w.game as unknown as { combat: { spawnEnemy: (a: string, p: { x: number; z: number }, o: SpawnOptions) => unknown } }).combat.spawnEnemy = (_a, p, o) => (at.push({ id: o.id, x: p.x, z: p.z }), { id: o.id });
    goTo(w, 'courier-ambush');
    for (const which of ['a', 'b']) {
      const spot = w.rpg.locations.get(`capena-grassator-${which}`)!;
      const s = at.find((x) => x.id === `mq01-grassator-${which}`)!;
      expect(Math.hypot(s.x - spot.position.x, s.z - spot.position.z), which).toBeLessThan(1.5);
    }
  });
});

describe('mq-01: the opening conversation', () => {
  it('opens Festus’ cart conversation by itself two seconds after a new game begins, but not on a quick start or a load', () => {
    vi.useFakeTimers();
    try {
      const w = world({ actors: ['npc-festus'] });
      w.events.emit('game:started', { kind: 'quick' });
      w.events.emit('game:started', { kind: 'load' });
      vi.advanceTimersByTime(3000);
      expect(w.rpg.dialogue.active).toBe(false);
      w.events.emit('game:started', { kind: 'new' });
      vi.advanceTimersByTime(1000);
      expect(w.rpg.dialogue.active).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(w.rpg.dialogue.active).toBe(true);
      expect(w.rpg.dialogue.view).toMatchObject({ npcId: 'npc-festus', nodeId: 'n0' });
      w.rpg.dialogue.end();
      // Once the player has talked, a later new-game event (or a replay) does not talk again.
      talk(w, 'npc-festus', 'Let’s go.');
      close(w);
      w.events.emit('game:started', { kind: 'new' });
      vi.advanceTimersByTime(3000);
      expect(w.rpg.dialogue.active).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** A world where mq-01 is done (the no-combat path) and mq-02 has begun. */
function afterArrival(o: WorldOptions = {}) {
  const w = world(o);
  w.rpg.quests.setStage('mq-01-madida-capena', 'done');
  expect(status(w, 'mq-02-tabella')!.running).toBe(true);
  return w;
}

describe('mq-02-tabella: The Sealed Tablet', () => {
  it('Chrysippus (the seal) → Gratus explains → Glaucus names the Mouse → the taberna → the satchel → dusk → the cipher', () => {
    const w = afterArrival({ combat: false, actors: ['npc-gratus', 'npc-chrysippus', 'npc-philetus', 'npc-glaucus', 'npc-mus'] });
    w.rpg.dialogue.rng = { next: () => 0.01 }; // every check passes
    w.rpg.inventory.add('quest-tabella-signata');
    expect(objective(w, 'mq-02-tabella', 'castor')!.target).toEqual({ kind: 'npc', id: 'npc-chrysippus' });

    // Philetus at the shut doors only points the way.
    let v = talk(w, 'npc-philetus');
    expect(v!.nodeId).toBe('n0');
    pick(w, 'strongrooms');
    close(w);

    // Chrysippus guards his clients' names until he sees the couriers' seal.
    v = talk(w, 'npc-chrysippus');
    expect(v!.nodeId).toBe('n0');
    pick(w, 'looking for a man called Gratus');
    expect(w.rpg.dialogue.view!.text).toContain('between them and me');
    pick(w, 'Show him the seal');
    close(w);
    expect(status(w, 'mq-02-tabella')!.stage).toBe('gratus');

    // Gratus: the leak in the camp, not by daylight, the thraex's stroke, Glaucus.
    v = talk(w, 'npc-gratus');
    expect(v!.nodeId).toBe('day0');
    pick(w, 'Dead. Knifed under the Capena Gate');
    pick(w, 'A hooded one with a curved blade');
    while (w.rpg.dialogue.view && !w.rpg.dialogue.view.choices.length) w.rpg.dialogue.advance();
    expect(w.rpg.dialogue.view!.text).toContain('after sunset');
    pick(w, 'And until sunset?');
    expect(w.rpg.dialogue.view!.text).toContain('Ask for Glaucus');
    pick(w, 'I’ll go to the Ludus.');
    close(w);
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(1); // he would not take it by day
    expect(status(w, 'mq-02-tabella')!.stage).toBe('ludus');
    expect(objective(w, 'mq-02-tabella', 'ask')!.target).toEqual({ kind: 'npc', id: 'npc-glaucus' });

    // Glaucus names Dizas at once: no bouts, no checks, and The Oath is not started by it.
    v = talk(w, 'npc-glaucus');
    expect(v!.nodeId).toBe('mq0');
    pick(w, 'A courier was knifed');
    close(w);
    expect(flag(w, 'clue-mus')).toBe(true);
    expect(status(w, 'mq-02-tabella')!.stage).toBe('mus');
    expect(status(w, 'lud-01-sacramentum')?.running ?? false).toBe(false);

    // The Mouse hands over his key; his strongbox holds the satchel.
    talk(w, 'npc-mus', 'Hand over the courier’s satchel');
    close(w);
    expect(flag(w, 'mus-fate')).toBe('fled');
    expect(w.rpg.inventory.count('clavis-cellae-muris')).toBe(1);
    expect(status(w, 'mq-02-tabella')!.stage).toBe('satchel');
    w.rpg.inventory.add('quest-sacculum-festi');
    w.rpg.inventory.add('quest-drachma-parthica');
    expect(status(w, 'mq-02-tabella')!.stage).toBe('dusk');

    // Not before the lamps are lit.
    expect(talk(w, 'npc-gratus')!.nodeId).toBe('notYet');
    close(w);
    waitUntil(w, 19.5);
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-gratus', '(Give him the tablet.)');
    pick(w, 'I have his satchel.');
    while (w.rpg.dialogue.view && !w.rpg.dialogue.view.choices.length) w.rpg.dialogue.advance();
    expect(w.rpg.dialogue.view!.text).toContain('Take this');
    pick(w, 'I’ll go to the Marii.');
    close(w);
    expect(status(w, 'mq-02-tabella')).toMatchObject({ completed: true, stage: 'done' });
    expect(lastJournal(w, 'mq-02-tabella')).toContain('cipher');
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(0);
    expect(w.rpg.inventory.count('quest-sacculum-festi')).toBe(0);
    expect(w.rpg.inventory.count('quest-tessera-peregrina')).toBe(1);
    expect(w.rpg.inventory.denarii).toBe(before + 50);
    expect(flag(w, 'gratus-has-drachm')).toBe(true);
    expect(flag(w, 'mq02-delivered')).toBe(true);
    expect(status(w, 'mq-03-lemuria')).toMatchObject({ running: true, stage: 'start' });
    expect(w.rpg.quests.tracked).toBe('mq-03-lemuria');
  });

  it('Auctus can name the Mouse too, and the street gossip does', () => {
    const w = afterArrival({ combat: false, actors: ['npc-auctus'] });
    w.rpg.dialogue.rng = { next: () => 0.01 };
    w.rpg.quests.setStage('mq-02-tabella', 'ludus');
    talk(w, 'npc-auctus', 'Up from under');
    close(w);
    expect(flag(w, 'clue-mus')).toBe(true);
    expect(status(w, 'mq-02-tabella')!.stage).toBe('mus');
  });

  it('Mus in the burned taberna: a fight with two knife-men; he yields (spared) or dies', () => {
    const w = afterArrival({ actors: ['npc-mus'], engage: true });
    w.rpg.quests.setStage('mq-02-tabella', 'mus');
    talk(w, 'npc-mus', 'Draw steel.');
    expect(w.rpg.dialogue.view).toBeNull(); // attack() ended the talk
    expect(w.engaged).toEqual(['npc-mus']);
    expect(w.spawned.map((s) => s.opts.id)).toEqual(['mq02-knife-a', 'mq02-knife-b']);
    yieldTo(w, 'npc-mus');
    expect(flag(w, 'mus-fate')).toBe('spared');
    expect(status(w, 'mq-02-tabella')!.stage).toBe('satchel');
    // Beaten, he gives up the key.
    talk(w, 'npc-mus');
    close(w);
    expect(w.rpg.inventory.count('clavis-cellae-muris')).toBe(1);

    const w2 = afterArrival({ actors: ['npc-mus'], engage: true });
    w2.rpg.quests.setStage('mq-02-tabella', 'mus');
    talk(w2, 'npc-mus', 'Draw steel.');
    kill(w2, 'npc-mus');
    expect(w2.rpg.dialogue.flags.get('mus-fate')).toBe('killed');
  });

  it('AC-18: Castor’s cella is shut on the Lemuria (the aedituus refuses) and open on a later day: an offering gives its blessing', () => {
    const w = world({ combat: false, actors: ['npc-philetus'] });
    w.rpg.hooks.templesClosed = () => true; // the calendar's rule on the Lemuria (the flow module wires it)
    w.rpg.inventory.add('libum', 2);
    let v = talk(w, 'npc-philetus');
    expect(v!.nodeId).toBe('shut');
    expect(v!.choices.some((c) => c.text.includes('offering'))).toBe(true);
    pick(w, 'Make an offering?');
    expect(w.rpg.dialogue.view!.text).toContain('come back tomorrow');
    w.rpg.dialogue.end();
    expect(w.rpg.devotion.prayAtTemple('temple-castor-pollux', { itemId: 'libum' })).toMatchObject({ ok: false, reason: 'closed' });
    w.game.time.advanceHours(24); // 14 May: the Lemuria is over
    w.rpg.hooks.templesClosed = () => false;
    const pietas = w.rpg.sheet.vitals.get('pietas').current;
    v = talk(w, 'npc-philetus');
    expect(v!.nodeId).toBe('open');
    pick(w, 'make an offering');
    pick(w, 'honey cake');
    close(w);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(pietas + 10);
    expect(w.rpg.inventory.count('libum')).toBe(1);
    expect(w.rpg.sheet.hasCondition('benedictio-castores')).toBe(true);
  });
});

describe('mq-03-lemuria: Beans for the Dead', () => {
  function lemuria(o: WorldOptions = {}) {
    const w = afterArrival({ combat: false, interactions: true, actors: ['npc-helpis', 'npc-marius-fuscus', 'npc-gemellus', 'npc-gratus'], ...o });
    w.rpg.quests.setStage('mq-02-tabella', 'done');
    expect(status(w, 'mq-03-lemuria')!.stage).toBe('start');
    return w;
  }

  it('the house → Helpis → the midnight rite → two clues → Gemellus’ key → warn Gratus → “Tomorrow, the Column.”', () => {
    vi.useFakeTimers();
    try {
      const w = lemuria();
      w.rpg.dialogue.rng = { next: () => 0.01 };
      setFlag(w, 'promised-festus', true);
      w.rpg.inventory.add('quest-epistula-festi');
      waitUntil(w, 21);
      goTo(w, 'insula-mariorum');
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('family');

      let v = talk(w, 'npc-helpis');
      expect(v!.nodeId).toBe('h0');
      pick(w, 'He was carrying this. A letter to you.');
      expect(w.rpg.inventory.count('quest-epistula-festi')).toBe(0);
      pick(w, 'Festus’ tablet is written in a cipher');
      pick(w, 'I’ll stay.');
      close(w);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('rite');

      // Midnight: the rite plays out over some forty seconds, then the clues.
      waitUntil(w, 23.5);
      vi.advanceTimersByTime(45_000);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('clues');
      expect(w.placed.filter((p) => p.id.startsWith('content:clue-')).length).toBe(3);
      w.placed.find((p) => p.id === 'content:clue-cloak')!.interact(w.game);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('clues');
      // Helpis tells where Gemellus works: that counts as the second clue.
      talk(w, 'npc-helpis', 'Where would Gemellus hide');
      close(w);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('gemellus');
      expect(w.placed.some((p) => p.id.startsWith('content:clue-'))).toBe(false);

      // Gemellus: the letter is proof enough; the key, and the decoded message.
      v = talk(w, 'npc-gemellus');
      expect(v!.nodeId).toBe('g0');
      pick(w, 'four is still the number');
      expect(w.rpg.inventory.count('quest-clavis-cifrae')).toBe(1);
      pick(w, 'Who was the man?');
      expect(flag(w, 'gemellus-saw-forger')).toBe(true);
      pick(w, 'What should I tell your mother?');
      pick(w, 'That you’re alive.');
      close(w);
      expect(flag(w, 'gemellus-revealed')).toBe(true);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('warn');
      expect(w.rpg.inventory.count('quest-nuntius-festi')).toBe(1);

      // Gratus: the high place is the Column.
      const before = w.rpg.inventory.denarii;
      v = talk(w, 'npc-gratus');
      expect(v!.nodeId).toBe('warn0');
      pick(w, 'Show him Festus’ message');
      close(w);
      expect(status(w, 'mq-03-lemuria')).toMatchObject({ completed: true, stage: 'done' });
      expect(lastJournal(w, 'mq-03-lemuria')).toContain('Column');
      expect(w.rpg.inventory.denarii).toBe(before + 40);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the rite waits for midnight at the house; a threat gets the key too', () => {
    vi.useFakeTimers();
    try {
      const w = lemuria();
      w.rpg.dialogue.rng = { next: () => 0.01 };
      w.rpg.quests.setStage('mq-03-lemuria', 'rite');
      waitUntil(w, 23.5); // midnight, but the player is elsewhere
      vi.advanceTimersByTime(45_000);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('rite');
      goTo(w, 'insula-mariorum');
      vi.advanceTimersByTime(45_000);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('clues');
      for (const id of ['clue-beans', 'clue-ink']) w.placed.find((p) => p.id === `content:${id}`)!.interact(w.game);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('gemellus');
      talk(w, 'npc-gemellus', 'Give me the key');
      close(w);
      expect(w.rpg.inventory.count('quest-clavis-cifrae')).toBe(1);
      expect(status(w, 'mq-03-lemuria')!.stage).toBe('warn');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('lud-01-sacramentum: The Oath', () => {
  function ludusWorld(o: WorldOptions = {}) {
    const w = world({ actors: ['npc-pullus'], engage: true, ...o });
    w.rpg.quests.restore({}); // only the Ludus thread here
    return w;
  }

  it('signs on as a guest, draws the kit, beats Pullus and Auctus (after a loss), spares Nereus (after a refused missio) and is patched up', () => {
    const w = ludusWorld();
    const v = talk(w, 'npc-glaucus');
    expect(v!.nodeId).toBe('n0');
    expect(status(w, 'lud-01-sacramentum')?.running ?? false).toBe(false); // a greeting starts nothing
    pick(w, 'To fight on your sand.');
    expect(status(w, 'lud-01-sacramentum')!.running).toBe(true); // asking to fight does
    const cost = w.rpg.dialogue.view!;
    expect(cost.choices.map((c) => c.text)).toContain('Tell me exactly what the oath costs.'); // the crossroad shows its price
    pick(w, 'As a guest.');
    close(w);
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('kit');
    expect(flag(w, 'ludus-status')).toBe('guest');
    expect(w.rpg.standing.infamia).toBe(0);
    expect(w.rpg.factions.isMember('ludus-magnus')).toBe(false);

    expect(talk(w, 'npc-asiaticus')!.nodeId).toBe('needKit');
    close(w);
    talk(w, 'npc-successus', 'The scutum.');
    close(w);
    expect(w.rpg.inventory.count('rudis')).toBe(1);
    expect(w.rpg.inventory.count('scutum-ludi')).toBe(1);
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout1');

    // Bout 1: Pullus is already in the world, so combat turns him.
    const purse0 = w.rpg.inventory.denarii;
    talk(w, 'npc-asiaticus', 'Ready.');
    close(w);
    expect(w.engaged).toEqual(['npc-pullus']);
    expect(w.rpg.inventory.equipped('mainHand')).toBe('rudis');
    expect(w.rpg.inventory.equipped('offHand')).toBe('scutum-ludi');
    expect(talk(w, 'npc-asiaticus')!.nodeId).toBe('calls'); // a bout is on
    w.rpg.dialogue.end();
    yieldTo(w, 'npc-pullus');
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout2');
    expect(w.rpg.inventory.denarii).toBe(purse0 + 3); // the practice-bout fee

    // Bout 2: Auctus (a thraex in practice arms); the player is beaten once first.
    talk(w, 'npc-asiaticus', 'Ready.');
    close(w);
    expect(w.spawned.at(-1)).toMatchObject({ archetype: 'thraex', opts: { id: 'npc-auctus', practice: true, profile: { weapon: 'sica-lusoria' } } });
    yieldTo(w, 'player');
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout2');
    expect(w.rpg.sheet.hasCondition('injured')).toBe(true); // a lusio injury lasts one game hour, not a day
    w.game.time.advanceHours(1.2);
    expect(w.rpg.sheet.hasCondition('injured')).toBe(false);
    talk(w, 'npc-asiaticus', 'Ready.');
    close(w);
    kill(w, 'npc-auctus'); // practice arms: a knockout
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout3');

    // After the bout Auctus names the Mouse.
    expect(talk(w, 'npc-auctus')!.nodeId).toBe('a0');
    w.rpg.dialogue.end();

    // Bout 3: Nereus the boss. The player yields: the crowd (favor 30) refuses → the doctor stops it; an hour's rest.
    talk(w, 'npc-asiaticus', 'Ready.');
    close(w);
    expect(w.spawned.at(-1)).toMatchObject({ archetype: 'retiarius', opts: { id: 'npc-nereus', boss: 'boss-nereus', practice: true, profile: { health: 260 } } });
    Object.assign(w.game, { rng: { fork: () => ({ next: () => 0.99 }) } });
    yieldTo(w, 'player');
    expect(flag(w, 'lud01-favor')).toBe(30);
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout3');
    expect(talk(w, 'npc-asiaticus')!.nodeId).toBe('rest');
    w.rpg.dialogue.end();
    w.game.time.advanceHours(1.2);
    talk(w, 'npc-asiaticus', 'Ready.');
    close(w);
    yieldTo(w, 'npc-nereus');
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('missio');

    // Nereus kneels, finger raised: spare him (Mitte!).
    const pietas = w.rpg.sheet.vitals.get('pietas').current;
    const before = w.rpg.inventory.denarii;
    expect(talk(w, 'npc-nereus')!.nodeId).toBe('m0');
    pick(w, 'Spare him');
    close(w);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(pietas + 5);
    expect(flag(w, 'nereus-spared')).toBe(true);
    expect(status(w, 'lud-01-sacramentum')).toMatchObject({ completed: true, stage: 'done' });
    expect(w.rpg.inventory.denarii).toBe(before + Math.round(arenaPurse(30, 30)));
    expect(w.rpg.inventory.count('rudis')).toBe(0); // the armory has its wood back
    expect(w.rpg.factions.reputation('ludus-magnus')).toBeGreaterThanOrEqual(10);
    expect(w.rpg.sheet.skillXp('blades')).toBeGreaterThan(0);
    expect(lastJournal(w, 'lud-01-sacramentum')).toContain('Hermippus');

    // The physician patches the player up and sends them to rest until the lamps are lit.
    const notes = record(w.events, ['rpg:notify']);
    w.rpg.sheet.applyCondition('injured');
    const h = talk(w, 'npc-hermippus');
    expect(h!.nodeId).toBe('patch');
    close(w);
    expect(w.rpg.sheet.hasCondition('injured')).toBe(false);
    expect(notes.some((n) => String((n.e as { text: string }).text).includes('Press T'))).toBe(true);
    expect(unknownItems()).toEqual([]);
  });

  it('swearing the oath costs Infamia +20 and makes a tiro; a spared player is paid half and the quest ends', () => {
    const w = ludusWorld();
    w.rpg.quests.start('lud-01-sacramentum');
    talk(w, 'npc-glaucus', 'To fight on your sand.', 'I’ll swear the oath.', 'Uri, vinciri');
    close(w);
    expect(flag(w, 'ludus-status')).toBe('auctoratus');
    expect(w.rpg.standing.infamia).toBeGreaterThanOrEqual(20);
    expect(w.rpg.factions.isMember('ludus-magnus')).toBe(true);
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('kit');

    // Straight to Nereus with the player's own shield, then a yield the crowd spares (favor ≥ 50 always).
    w.rpg.inventory.add('parma');
    w.rpg.inventory.equip('parma');
    talk(w, 'npc-successus', 'my own shield');
    close(w);
    expect(w.rpg.inventory.count('rudis')).toBe(1);
    expect(w.rpg.inventory.count('scutum-ludi')).toBe(0);
    w.rpg.quests.setStage('lud-01-sacramentum', 'bout3');
    setFlag(w, 'arena.favor', 80);
    talk(w, 'npc-asiaticus', 'Ready.');
    close(w);
    const before = w.rpg.inventory.denarii;
    yieldTo(w, 'player');
    expect(status(w, 'lud-01-sacramentum')).toMatchObject({ completed: true, stage: 'done' });
    expect(w.rpg.inventory.denarii).toBe(before + Math.round(arenaPurse(30, 80) / 2));
    expect(lastJournal(w, 'lud-01-sacramentum')).toContain('Hermippus');
  });

  it('keeps the practice arms in the armory whenever the player leaves the Ludus and gives them back on re-entry', () => {
    const w = ludusWorld({ actors: [] });
    w.rpg.quests.start('lud-01-sacramentum');
    w.rpg.quests.setStage('lud-01-sacramentum', 'kit');
    goTo(w, 'ludus-magnus');
    talk(w, 'npc-successus', 'The parmula.');
    close(w);
    expect(w.rpg.inventory.count('parmula-ludi')).toBe(1);
    goTo(w, 'circus-maximus'); // leaves the Ludus
    expect(w.rpg.inventory.count('rudis')).toBe(0);
    expect(w.rpg.inventory.count('parmula-ludi')).toBe(0);
    goTo(w, 'ludus-magnus');
    expect(w.rpg.inventory.count('rudis')).toBe(1);
    expect(w.rpg.inventory.count('parmula-ludi')).toBe(1);
  });

  it('is only offered: walking in starts nothing, asking Glaucus to fight does; the arena’s own yield prompt can decide the missio', () => {
    const w = ludusWorld({ actors: [] });
    goTo(w, 'ludus-magnus');
    expect(status(w, 'lud-01-sacramentum')?.running ?? false).toBe(false);
    talk(w, 'npc-glaucus', 'To fight on your sand.');
    w.rpg.dialogue.end();
    expect(status(w, 'lud-01-sacramentum')!.running).toBe(true);
    w.rpg.quests.setStage('lud-01-sacramentum', 'missio');
    w.events.emit('content:missio', { spared: false });
    expect(status(w, 'lud-01-sacramentum')!.completed).toBe(true);
  });

  it('plays through without a combat module: the referee calls each bout on points', () => {
    const w = ludusWorld({ combat: false, actors: [] });
    talk(w, 'npc-glaucus', 'To fight on your sand.', 'As a guest.');
    close(w);
    talk(w, 'npc-successus', 'The scutum.');
    close(w);
    for (let i = 0; i < 3; i++) {
      talk(w, 'npc-asiaticus', 'Ready.');
      close(w);
    }
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('missio');
    talk(w, 'npc-nereus', 'Spare him');
    close(w);
    expect(status(w, 'lud-01-sacramentum')!.completed).toBe(true);
  });
});

describe('misc-meta-sudans-rixa: Brawl at the Fountain', () => {
  function rixaWorld(o: WorldOptions = {}) {
    const w = world(o);
    w.rpg.quests.restore({});
    w.rpg.quests.start('lud-01-sacramentum');
    w.rpg.quests.setStage('lud-01-sacramentum', 'done'); // the Ludus is behind us
    waitUntil(w, 17); // the way back from the Ludus, after the wait
    goTo(w, 'meta-sudans');
    return w;
  }

  it('takes a side; knock out or make yield the other side’s three brawlers (no deaths); the watch asks who started it', () => {
    const w = rixaWorld({ actors: ['npc-verecundus'] });
    expect(status(w, 'misc-meta-sudans-rixa')).toMatchObject({ running: true, stage: 'start' });
    talk(w, 'npc-bassulus', 'The big shield wins');
    close(w);
    expect(flag(w, 'rixa-side')).toBe('scutarii');
    expect(status(w, 'misc-meta-sudans-rixa')!.stage).toBe('rixa');
    const foes = w.spawned.filter((s) => !s.opts.tags?.includes('rixa-ally'));
    expect(foes.map((s) => [s.archetype, s.opts.id, s.opts.brawl])).toEqual([
      ['collegium-bruiser', 'npc-anicetus', true],
      ['ebrius-rixator', 'rixa-parm-a', true],
      ['ebrius-rixator', 'rixa-parm-b', true],
    ]);
    expect(w.spawned.filter((s) => s.opts.hostile === false)).toHaveLength(2); // two fans on the player's side

    yieldTo(w, 'rixa-parm-a');
    kill(w, 'rixa-parm-b'); // fists knock out
    kill(w, 'rixa-scut-a'); // an ally: no count
    expect(objective(w, 'misc-meta-sudans-rixa', 'ko')!.count).toBe(2);
    kill(w, 'npc-anicetus');
    expect(status(w, 'misc-meta-sudans-rixa')!.stage).toBe('after');

    // The optio: the player egged it on, so there is a fine unless it is talked down.
    talk(w, 'npc-verecundus', 'I did.');
    close(w);
    expect(w.rpg.crime.bounty()).toBe(10);
    expect(status(w, 'misc-meta-sudans-rixa')).toMatchObject({ completed: true, stage: 'done' });
    expect(flag(w, 'rixa-outcome')).toBe('won');
    expect(w.rpg.inventory.count('vinum-falernum')).toBe(1);
    expect(w.rpg.standing.fame('dist-vallis-colossei')).toBe(5);
  });

  it('the rival leader who already stands at the fountain is engaged where he is, never cloned under his own id', () => {
    const w = rixaWorld({ actors: ['npc-anicetus', 'npc-bassulus'], engage: true });
    talk(w, 'npc-bassulus', 'The big shield wins');
    close(w);
    expect(w.engaged).toEqual(['npc-anicetus']);
    const ids = w.spawned.map((s) => s.opts.id);
    expect(ids).not.toContain('npc-anicetus');
    expect(ids.filter((id) => id === 'npc-anicetus' || id === 'npc-bassulus')).toEqual([]);
    yieldTo(w, 'rixa-parm-a');
    kill(w, 'rixa-parm-b');
    kill(w, 'npc-anicetus'); // the engaged NPC, by his own id
    expect(status(w, 'misc-meta-sudans-rixa')!.stage).toBe('after');

    // A combat module that cannot turn an NPC: a stand-in with its own id, never a second npc-anicetus.
    const w2 = rixaWorld({ actors: ['npc-anicetus'] });
    talk(w2, 'npc-bassulus', 'The big shield wins');
    close(w2);
    expect(w2.spawned.map((s) => s.opts.id)).toContain('npc-anicetus~foe');
    expect(w2.spawned.map((s) => s.opts.id)).not.toContain('npc-anicetus');
    kill(w2, 'npc-anicetus~foe');
    kill(w2, 'rixa-parm-a');
    kill(w2, 'rixa-parm-b');
    expect(status(w2, 'misc-meta-sudans-rixa')!.stage).toBe('after');
  });

  it('a Rhetoric check calms them (peacemaker), walking away does nothing, a failed check starts the brawl', () => {
    const w = rixaWorld();
    w.rpg.dialogue.rng = { next: () => 0.01 };
    talk(w, 'npc-anicetus', 'Both shields lost to me today');
    close(w);
    expect(status(w, 'misc-meta-sudans-rixa')).toMatchObject({ completed: true, stage: 'done-peace' });
    expect(w.rpg.factions.reputation('plebs')).toBeGreaterThan(0);

    const w2 = rixaWorld();
    talk(w2, 'npc-bassulus', 'Not my fight');
    close(w2);
    expect(status(w2, 'misc-meta-sudans-rixa')).toMatchObject({ completed: true, stage: 'done-walked' });

    const w3 = rixaWorld();
    w3.rpg.dialogue.rng = { next: () => 0.99 };
    talk(w3, 'npc-anicetus', 'Both shields lost to me');
    close(w3);
    expect(status(w3, 'misc-meta-sudans-rixa')!.stage).toBe('rixa');
    expect(flag(w3, 'rixa-side')).toBe('scutarii'); // the cup came from the thraex fan: the player is with the butcher
    expect(flag(w3, 'threw-first-punch')).toBe(false);
  });

  it('drawing steel makes it assault and fails the quest; yielding costs a tenth of the purse and ends the fight', () => {
    const w = rixaWorld();
    talk(w, 'npc-bassulus', 'The big shield wins');
    close(w);
    w.events.emit('crime:committed', { crime: 'vis', witnessed: true, bounty: 40 });
    expect(status(w, 'misc-meta-sudans-rixa')).toMatchObject({ failed: true, stage: 'fail' });

    const w2 = rixaWorld();
    talk(w2, 'npc-anicetus', 'Auctus was robbed');
    close(w2);
    const before = w2.rpg.inventory.denarii;
    yieldTo(w2, 'player');
    expect(status(w2, 'misc-meta-sudans-rixa')!.stage).toBe('after');
    expect(w2.rpg.inventory.denarii).toBeCloseTo(before * 0.9, 1);
    goTo(w2, 'circus-maximus'); // slips away before the patrol arrives
    expect(status(w2, 'misc-meta-sudans-rixa')).toMatchObject({ completed: true, stage: 'done' });
    expect(flag(w2, 'rixa-outcome')).toBe('beaten');
    expect(w2.rpg.inventory.count('vinum-falernum')).toBe(0);
  });

  it('is armed only on the way back from the Ludus: before lud-01 or outside the evening the fountain is quiet', () => {
    const w = world();
    w.rpg.quests.restore({});
    waitUntil(w, 17);
    goTo(w, 'meta-sudans');
    expect(status(w, 'misc-meta-sudans-rixa')!.running).toBe(false);
  });
});

describe('misc-lemuria-fabae: Black Beans', () => {
  /** Florus' job accepted; the player waits out the midnight rite in his stairwell. */
  function accepted(o: WorldOptions = {}) {
    const w = world({ combat: false, actors: ['npc-florus', 'npc-thallusa'], ...o });
    w.rpg.quests.restore({});
    w.rpg.dialogue.rng = { next: () => 0.01 };
    const v = talk(w, 'npc-florus');
    expect(v!.nodeId).toBe('offer');
    pick(w, 'Maybe it’s not ghosts.');
    pick(w, 'I’ll watch your stairwell.');
    close(w);
    expect(status(w, 'misc-lemuria-fabae')).toMatchObject({ running: true, stage: 'start' });
    return w;
  }

  /** Watch from the stair after the rite, see Thallusa, follow her to the lean-to by the compitum. */
  function followed(w: World) {
    goTo(w, 'insula-tuccii');
    waitUntil(w, 1);
    expect(status(w, 'misc-lemuria-fabae')!.stage).toBe('watch');
    expect(objective(w, 'misc-lemuria-fabae', 'see')!.done).toBe(true);
    goTo(w, 'compitum-velabri');
    waitUntil(w, 3);
    expect(status(w, 'misc-lemuria-fabae')!.stage).toBe('choice');
  }

  it('watch at midnight → follow Thallusa → she pleads → the persuasion ending feeds the family', () => {
    const w = accepted();
    followed(w);
    const before = w.rpg.inventory.denarii;
    const pietas = w.rpg.sheet.vitals.get('pietas').current;
    talk(w, 'npc-thallusa', 'I’ll tell him the truth, but I’ll make him listen.');
    close(w);
    expect(flag(w, 'fabae')).toBe('persuade');
    talk(w, 'npc-florus', 'Your beans feed your slave’s grandchildren');
    close(w);
    expect(status(w, 'misc-lemuria-fabae')).toMatchObject({ completed: true, stage: 'done' });
    expect(w.rpg.inventory.denarii).toBe(before + 15);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(pietas + 10);
    expect(flag(w, 'florus-feeds-family')).toBe(true);
    expect(w.rpg.standing.fame('dist-velabrum-boarium')).toBe(5);
    expect(lastJournal(w, 'misc-lemuria-fabae')).toContain('one black bean on every step');
    expect(w.rpg.sheet.skillXp('stealth')).toBeGreaterThan(0);
  });

  it('the lie ends in nine more handfuls; the truth costs Fama with the Velabrum; a gift is kind', () => {
    const w = accepted();
    followed(w);
    talk(w, 'npc-thallusa', '(Give her 5 denarii.)');
    expect(w.rpg.dialogue.view!.nodeId).toBe('gift');
    pick(w, 'Your secret is safe.');
    close(w);
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-florus', 'Hungry ones');
    close(w);
    expect(status(w, 'misc-lemuria-fabae')!.completed).toBe(true);
    expect(w.rpg.inventory.denarii).toBe(before + 5);

    const w2 = accepted();
    followed(w2);
    talk(w2, 'npc-thallusa', 'He’s your master.');
    close(w2);
    talk(w2, 'npc-florus', 'Thallusa takes them');
    close(w2);
    expect(status(w2, 'misc-lemuria-fabae')!.completed).toBe(true);
    expect(w2.rpg.standing.fame('dist-velabrum-boarium')).toBe(-5);
  });

  it('is open only to the one who agrees; a wait before midnight does not count', () => {
    const w = accepted();
    goTo(w, 'insula-tuccii');
    expect(objective(w, 'misc-lemuria-fabae', 'watch')!.done).toBe(false); // it is morning
    waitUntil(w, 23);
    expect(objective(w, 'misc-lemuria-fabae', 'watch')!.done).toBe(false);
  });
});

describe('misc-insula-nutans: The Leaning Insula', () => {
  function accepted(o: WorldOptions = {}) {
    const w = world({ combat: false, interactions: true, actors: ['npc-prima', 'npc-callistus', 'npc-dento', 'npc-sutor-nutans', 'npc-senes-nutans', 'npc-syri-nutans'], ...o });
    w.rpg.quests.restore({});
    w.rpg.dialogue.rng = { next: () => 0.01 };
    talk(w, 'npc-prima', 'This wall is cracked?', 'Let me look.');
    close(w);
    expect(status(w, 'misc-insula-nutans')).toMatchObject({ running: true, stage: 'start' });
    return w;
  }
  const point = (w: World, id: string) => w.placed.find((p) => p.id === `content:${id}`)!;

  it('evidence (three of four signs) → Callistus → the aediles’ man → four households warned before dusk → the wall falls on an empty house', () => {
    const w = accepted();
    expect(w.placed.filter((p) => p.id.startsWith('content:nutans-')).map((p) => p.id).sort()).toEqual(['content:nutans-cenaculum', 'content:nutans-scalae', 'content:nutans-taberna', 'content:nutans-tectum']);
    point(w, 'nutans-taberna').interact(w.game);
    point(w, 'nutans-scalae').interact(w.game);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('start');
    point(w, 'nutans-tectum').interact(w.game);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('callistus');
    expect(w.placed.some((p) => p.id.startsWith('content:nutans-'))).toBe(false); // the signs are cleared

    talk(w, 'npc-callistus', 'I’m taking this to the aediles.', 'Keep it.');
    close(w);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('aedile');
    talk(w, 'npc-dento', 'It will fall on the public.');
    close(w);
    expect(flag(w, 'dento-order')).toBe(true);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('evacuate');

    talk(w, 'npc-prima'); // Prima's own family
    close(w);
    talk(w, 'npc-sutor-nutans', 'The aediles ordered it.');
    close(w);
    talk(w, 'npc-senes-nutans', 'The aediles ordered it.');
    close(w);
    talk(w, 'npc-senes-nutans'); // already gone: not counted twice
    close(w);
    expect(objective(w, 'misc-insula-nutans', 'warn')!.count).toBe(3);
    talk(w, 'npc-syri-nutans', 'Show him the aediles’ order');
    close(w);
    expect(objective(w, 'misc-insula-nutans', 'warn')!.done).toBe(true);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('evacuate'); // the wall falls at dusk, not before

    const before = w.rpg.inventory.denarii;
    waitUntil(w, 19.5);
    expect(status(w, 'misc-insula-nutans')).toMatchObject({ completed: true, stage: 'done' });
    expect(flag(w, 'nutans-collapsed')).toBe(true);
    expect(flag(w, 'callistus-fled')).toBe(true);
    expect(w.rpg.inventory.denarii).toBe(before + 20);
    expect(w.rpg.standing.fame('dist-velabrum-boarium')).toBe(10);
    expect(talk(w, 'npc-prima')!.nodeId).toBe('thanks');
    close(w);
    expect(w.rpg.inventory.count('fascinum')).toBe(1);
  });

  it('a smith’s eye reads the wall (Fabrica 25 counts double), and Dento can be persuaded, lied to or paid', () => {
    const w = accepted();
    w.rpg.sheet.setSkill('fabrica', 30);
    point(w, 'nutans-taberna').interact(w.game);
    expect(flag(w, 'nutans-fabrica')).toBe(true);
    expect(objective(w, 'misc-insula-nutans', 'evidence')!.count).toBe(2);
    point(w, 'nutans-cenaculum').interact(w.game);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('callistus');
    w.rpg.quests.setStage('misc-insula-nutans', 'aedile');
    const v = talk(w, 'npc-dento');
    // With the Fabrica finding the report needs no check at all.
    expect(v!.choices.some((c) => c.text.includes('bonding course'))).toBe(true);
    pick(w, 'bonding course');
    close(w);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('evacuate');

    const w2 = accepted();
    w2.rpg.quests.setStage('misc-insula-nutans', 'aedile');
    w2.rpg.inventory.addDenarii(20);
    const before = w2.rpg.inventory.denarii;
    talk(w2, 'npc-dento', 'For the paperwork.');
    close(w2);
    expect(status(w2, 'misc-insula-nutans')!.stage).toBe('evacuate');
    expect(w2.rpg.inventory.denarii).toBeLessThan(before);
  });

  it('taking Callistus’ ten denarii fails the quest; being too slow lets the wall fall with people in it', () => {
    const w = accepted();
    w.rpg.quests.setStage('misc-insula-nutans', 'callistus');
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-callistus', 'I’m taking this to the aediles.', 'Take the money.');
    close(w);
    expect(status(w, 'misc-insula-nutans')).toMatchObject({ failed: true, stage: 'bribed' });
    expect(w.rpg.inventory.denarii).toBe(before + 10);
    expect(flag(w, 'nutans-bribed')).toBe(true);
    expect(flag(w, 'nutans-collapse-pending')).toBe(true);
    expect(w.rpg.standing.fame('dist-velabrum-boarium')).toBe(-15);

    const w2 = accepted();
    w2.rpg.quests.setStage('misc-insula-nutans', 'evacuate');
    waitUntil(w2, 19.5);
    expect(status(w2, 'misc-insula-nutans')).toMatchObject({ failed: true, stage: 'collapsed' });
  });
});

describe('misc-venus-cloacina: What Venus Hides', () => {
  it('watch the shrine at night → the Cloaca’s landing → three lookouts → the Rex → the cache → Ianuarius', () => {
    const w = world({ actors: [] });
    w.rpg.quests.restore({});
    talk(w, 'npc-ianuarius', 'Tell me about the grate.', 'I’ll watch it tonight.');
    close(w);
    expect(status(w, 'misc-venus-cloacina')).toMatchObject({ running: true, stage: 'start' });
    expect(w.rpg.inventory.count('clavis-cloacae')).toBe(1);
    expect(w.rpg.inventory.count('fax')).toBe(2);

    goTo(w, 'shrine-venus-cloacina');
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('start'); // it is morning
    waitUntil(w, 22);
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('descend');
    goTo(w, 'cloaca-maxima-outlet');
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('rex');
    expect(w.spawned.map((s) => [s.archetype, s.opts.id])).toEqual([
      ['cloacarius', 'cloaca-gang-a'],
      ['cloacarius', 'cloaca-gang-b'],
      ['cloacarius', 'cloaca-gang-c'],
    ]);
    kill(w, 'cloaca-gang-a');
    yieldTo(w, 'cloaca-gang-b');
    expect(w.spawned).toHaveLength(3);
    kill(w, 'cloaca-gang-c');
    expect(w.spawned.at(-1)).toMatchObject({ archetype: 'cloacarius', opts: { id: 'npc-rex-cloacae', boss: 'boss-rex-cloacae', profile: { health: 350 } } });
    kill(w, 'npc-rex-cloacae');
    expect(flag(w, 'rex-cloacae-fate')).toBe('killed');
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('cache');

    w.events.emit('content:opened', { id: 'ctn-cista-regis', kind: 'cista-regis-cloacae' });
    expect(objective(w, 'misc-venus-cloacina', 'loot')!.done).toBe(true);
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-ianuarius');
    close(w);
    expect(status(w, 'misc-venus-cloacina')).toMatchObject({ completed: true, stage: 'done' });
    expect(w.rpg.inventory.denarii).toBe(before + 30);
    expect(w.rpg.standing.fame('dist-forum-romanum')).toBe(10);
  });

  it('the Rex can be talked down (Persuade 55) and the quest stays playable without combat', () => {
    const w = world({ combat: false, actors: [] });
    w.rpg.quests.restore({});
    w.rpg.dialogue.rng = { next: () => 0.01 };
    w.rpg.quests.start('misc-venus-cloacina');
    w.rpg.quests.setStage('misc-venus-cloacina', 'rex');
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('cache'); // no combat: the lookouts bolt, the Rex surrenders
    expect(flag(w, 'rex-cloacae-fate')).toBe('spared');

    const w2 = world({ actors: [] });
    w2.rpg.quests.restore({});
    w2.rpg.dialogue.rng = { next: () => 0.01 };
    w2.rpg.quests.start('misc-venus-cloacina');
    w2.rpg.quests.setStage('misc-venus-cloacina', 'rex');
    talk(w2, 'npc-rex-cloacae', 'The curators want their drain back');
    close(w2);
    expect(flag(w2, 'rex-cloacae-fate')).toBe('parleyed');
    expect(status(w2, 'misc-venus-cloacina')!.stage).toBe('cache');
  });
});
