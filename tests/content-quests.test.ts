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
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

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
  game.actors = { get: (id: string) => (actors.has(id) ? { id, position: new Vector3() } : undefined) };
  const placed: { id: string; interact(g: unknown): void }[] = [];
  if (o.interactions) game.interactions = { add: (i: { id: string; interact(g: unknown): void }) => (placed.push(i), () => placed.splice(placed.indexOf(i), 1)) };
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: o.background ?? 'civis-suburanus' });
  return { ...fg, rpg, spawned, engaged, actors, placed };
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

describe('mq-01-madida-capena: The Dripping Gate', () => {
  it('starts at a new game; talk → ambush → two grassatores → the dying courier → the Forum', () => {
    const w = world({ actors: ['npc-festus'] });
    expect(status(w, 'mq-01-madida-capena')).toMatchObject({ running: true, stage: 'start' });
    expect(w.rpg.quests.tracked).toBe('mq-01-madida-capena');
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(0); // not in the starting pack

    let v = talk(w, 'npc-festus', 'What are you carrying?');
    expect(v!.nodeId).toBe('carrying');
    v = talk(w, 'npc-festus', 'arches', 'swear');
    expect(v!.nodeId).toBe('sworn');
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('start'); // the knife-men wait for the talk to end
    close(w);
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('ambush');
    expect(w.spawned.map((s) => [s.archetype, s.opts.id])).toEqual([
      ['grassator', 'npc-sorex'],
      ['grassator', 'npc-calvus'],
    ]);

    yieldTo(w, 'npc-sorex');
    kill(w, 'npc-sorex'); // the same foe twice counts once
    expect(w.rpg.quests.objectives('mq-01-madida-capena').find((o) => o.id === 'grassatores')!.count).toBe(1);
    kill(w, 'npc-nobody');
    kill(w, 'npc-calvus');
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('tablet');
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(0); // the courier is still alive in the world

    v = talk(w, 'npc-festus', 'Who did this?');
    expect(v!.text).toContain('scars');
    v = talk(w, 'npc-festus', 'take it to Castor');
    expect(v!.nodeId).toBe('lastWords');
    close(w);
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(1);
    expect(w.rpg.inventory.count('evectio-festi')).toBe(1);
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('forum');

    w.events.emit('view:changed', { mode: 'first' });
    w.rpg.inventory.use('evectio-festi');
    w.rpg.devotion.prayAtCompitum('compitum-capena');
    const objectives = w.rpg.quests.objectives('mq-01-madida-capena');
    for (const id of ['view', 'warrant', 'pray']) expect(objectives.find((o) => o.id === id)!.done, id).toBe(true);

    const before = w.rpg.inventory.denarii;
    goTo(w, 'miliarium-aureum');
    expect(status(w, 'mq-01-madida-capena')).toMatchObject({ completed: true, stage: 'done' });
    expect(w.rpg.inventory.denarii).toBe(before + 10);
    expect(w.rpg.sheet.skillXp('brawling')).toBeGreaterThan(0); // the Suburan's fustis
    expect(status(w, 'mq-02-tabella')).toMatchObject({ running: true });
    expect(unknownItems()).toEqual([]);
  });

  it('stays playable without combat or NPCs: walking on starts the ambush, the knife-men run, the tablet is taken from the satchel', () => {
    const w = world({ combat: false });
    goTo(w, 'courier-ambush');
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('forum');
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(1);
    goTo(w, 'temple-castor-pollux');
    expect(status(w, 'mq-01-madida-capena')!.completed).toBe(true);
  });

  it('counts a grassator who fled once the player walks away after beating the other', () => {
    const w = world();
    goTo(w, 'courier-ambush');
    kill(w, 'npc-calvus');
    goTo(w, 'spawn-capena');
    expect(status(w, 'mq-01-madida-capena')!.stage).toBe('forum');
  });
});

/** A world where mq-01 is done (the no-combat path) and the player stands in the Forum. */
function afterArrival(o: WorldOptions = {}) {
  const w = world({ combat: false, ...o });
  goTo(w, 'courier-ambush');
  goTo(w, 'miliarium-aureum');
  expect(status(w, 'mq-02-tabella')!.running).toBe(true);
  return w;
}

describe('mq-02-tabella: The Tablet', () => {
  it('Castor → the aedituus (cella shut for the Lemuria) → Silo → back at dusk → “Tomorrow, the Column.”', () => {
    const w = afterArrival();
    expect(w.game.time.date()).toMatchObject({ month: 4, day: 13 }); // a Lemuria day
    goTo(w, 'temple-castor-pollux');
    expect(status(w, 'mq-02-tabella')!.stage).toBe('aedituus');

    let v = talk(w, 'npc-aedituus-castoris');
    expect(v!.nodeId).toBe('closedGreet');
    const pietas = w.rpg.sheet.vitals.get('pietas').current;
    v = talk(w, 'npc-aedituus-castoris', 'strongrooms');
    expect(v!.nodeId).toBe('strongrooms');
    close(w);
    expect(status(w, 'mq-02-tabella')!.stage).toBe('contact');
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(pietas);

    v = talk(w, 'npc-castor-contact');
    expect(v!.nodeId).toBe('tablet');
    expect(status(w, 'mq-02-tabella')!.stage).toBe('dusk');
    expect(status(w, 'lud-01-sacramentum')).toMatchObject({ running: false, done: false });
    v = pick(w, 'died in my arms');
    expect(v!.nodeId).toBe('ludus');
    close(w);
    expect(status(w, 'lud-01-sacramentum')!.running).toBe(true); // pointed at the Ludus

    expect(talk(w, 'npc-castor-contact')!.nodeId).toBe('notYet');
    close(w);
    waitUntil(w, 19.5);
    const before = w.rpg.inventory.denarii;
    v = talk(w, 'npc-castor-contact', 'Here.');
    expect(v!.nodeId).toBe('delivered');
    expect(v!.text).toContain('Tomorrow, the Column.');
    close(w);
    expect(status(w, 'mq-02-tabella')).toMatchObject({ completed: true, stage: 'end' });
    expect(lastJournal(w, 'mq-02-tabella')).toContain('Tomorrow, the Column.');
    expect(w.rpg.inventory.count('quest-tabella-signata')).toBe(0);
    expect(w.rpg.inventory.count('chirographum-castoris')).toBe(1);
    expect(w.rpg.inventory.denarii).toBe(before + 25);
  });

  it('AC-18: on the Lemuria the aedituus refuses offerings; on a later day an offering gives the Twins’ blessing', () => {
    const w = afterArrival();
    goTo(w, 'temple-castor-pollux');
    let v = talk(w, 'npc-aedituus-castoris', 'strongrooms');
    close(w);
    w.rpg.inventory.add('libum', 2);
    v = talk(w, 'npc-aedituus-castoris', 'offering');
    expect(v!.text).toContain('Not today');
    expect(v!.choices.map((c) => c.text)).toEqual(['I understand.']);
    w.rpg.dialogue.end();
    w.game.time.advanceHours(24); // 14 May: the Lemuria is over
    expect(w.game.time.date().day).toBe(14);
    const pietas = w.rpg.sheet.vitals.get('pietas').current;
    v = talk(w, 'npc-aedituus-castoris', 'offering', 'honey cake');
    expect(v!.nodeId).toBe('blessed');
    close(w);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(pietas + 10);
    expect(w.rpg.inventory.count('libum')).toBe(1);
  });

  it('pays a bonus at the strongrooms when the player proved himself at the Ludus first', () => {
    const w = afterArrival();
    talk(w, 'npc-castor-contact', 'died in my arms'); // straight to the strongrooms: the quest skips ahead
    close(w);
    expect(status(w, 'mq-02-tabella')!.stage).toBe('dusk');
    w.rpg.quests.complete('lud-01-sacramentum');
    expect(w.rpg.quests.isObjectiveDone('mq-02-tabella', 'ludus')).toBe(true);
    waitUntil(w, 20);
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-castor-contact', 'Here.');
    close(w);
    expect(w.rpg.inventory.denarii).toBe(before + 40);
  });
});

describe('lud-01-sacramentum: The Oath', () => {
  it('signs on as a guest, draws the kit, beats Pullus and Callinicus (after a loss), faces Nereus, grants missio and collects the purse', () => {
    const w = world({ actors: ['npc-pullus'], engage: true });
    w.rpg.quests.restore({}); // only the Ludus thread here
    const v = talk(w, 'npc-attius-celer', 'I want to fight.');
    expect(v!.nodeId).toBe('offer');
    expect(status(w, 'lud-01-sacramentum')!.running).toBe(true);
    expect(v!.choices.some((c) => c.text.includes('Infamia +20'))).toBe(true); // the crossroad shows its cost
    pick(w, 'paid guest');
    close(w);
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('armory');
    expect(w.rpg.standing.infamia).toBe(0);
    expect(w.rpg.factions.isMember('ludus-magnus')).toBe(false);

    expect(talk(w, 'npc-glaucus')!.nodeId).toBe('noKit');
    close(w);
    talk(w, 'npc-bassus', 'The scutum.');
    close(w);
    expect(w.rpg.inventory.count('rudis')).toBe(1);
    expect(w.rpg.inventory.count('scutum-ludi')).toBe(1);
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout1');

    talk(w, 'npc-glaucus', 'Ready.');
    close(w);
    expect(w.engaged).toEqual(['npc-pullus']); // already in the world: combat turns him
    expect(w.rpg.inventory.equipped('mainHand')).toBe('rudis');
    expect(w.rpg.inventory.equipped('offHand')).toBe('scutum-ludi');
    yieldTo(w, 'npc-pullus');
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout2');

    talk(w, 'npc-glaucus', 'Ready.');
    close(w);
    expect(w.spawned.at(-1)).toMatchObject({ archetype: 'thraex', opts: { id: 'npc-callinicus', practice: true } });
    yieldTo(w, 'player'); // lost: Glaucus stops it
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout2');
    expect(talk(w, 'npc-glaucus')!.nodeId).toBe('ready2');
    w.rpg.dialogue.end();
    talk(w, 'npc-glaucus', 'Ready.');
    close(w);
    kill(w, 'npc-callinicus'); // practice arms: a knockout
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('bout3');

    talk(w, 'npc-glaucus', 'Ready.');
    close(w);
    expect(w.rpg.inventory.count('libellus-tironis')).toBe(1);
    expect(w.spawned.at(-1)).toMatchObject({ archetype: 'retiarius', opts: { id: 'npc-nereus', boss: 'boss-nereus', practice: true } });
    yieldTo(w, 'player'); // netted and beaten once: the Saniarium, injured, a lighter purse
    expect(w.rpg.sheet.hasCondition('injured')).toBe(true);
    talk(w, 'npc-glaucus', 'Ready.');
    close(w);
    yieldTo(w, 'npc-nereus');
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('missio');

    const pietas = w.rpg.sheet.vitals.get('pietas').current;
    const v2 = talk(w, 'npc-nereus');
    expect(v2!.nodeId).toBe('kneeling');
    talk(w, 'npc-nereus', 'Mitte');
    close(w);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(pietas + 5);
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('purse');

    talk(w, 'npc-eudemus');
    close(w);
    expect(w.rpg.sheet.hasCondition('injured')).toBe(false);
    expect(w.rpg.quests.isObjectiveDone('lud-01-sacramentum', 'medicus')).toBe(true);

    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-attius-celer', 'My thanks.');
    close(w);
    expect(status(w, 'lud-01-sacramentum')).toMatchObject({ completed: true, stage: 'done' });
    expect(w.rpg.inventory.denarii).toBe(before + (Math.round(25 * 1.3) - 8)); // purse × (1 + favor/100), one loss
    expect(w.rpg.inventory.count('rudis')).toBe(0);
    expect(w.rpg.inventory.count('scutum-ludi')).toBe(0);
    expect(w.rpg.factions.reputation('ludus-magnus')).toBe(10);
    expect(w.rpg.factions.reputation('plebs')).toBe(8); // missio +3, the quest +5
    expect(talk(w, 'npc-glaucus')!.text).toContain('missio');
    expect(unknownItems()).toEqual([]);
  });

  it('the oath is an explicit crossroad: joins the Ludus as a tiro, Infamia +20, oath money', () => {
    const w = world();
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-attius-celer', 'I want to fight.', 'swear the oath', 'Uri, vinciri');
    close(w);
    expect(w.rpg.factions.isMember('ludus-magnus')).toBe(true);
    expect(w.rpg.factions.rank('ludus-magnus')!.id).toBe('tiro');
    expect(w.rpg.standing.infamia).toBe(20);
    expect(w.rpg.inventory.denarii).toBe(before + 20);
    expect(w.rpg.quests.state('lud-01-sacramentum')!.vars.oath).toBe(true);
  });

  it('starts at the gate, and the armory takes its kit back when the player leaves the school', () => {
    const w = world();
    goTo(w, 'ludus-gate');
    expect(status(w, 'lud-01-sacramentum')!.running).toBe(true);
    expect(w.rpg.quests.isObjectiveDone('lud-01-sacramentum', 'go')).toBe(true);
    talk(w, 'npc-attius-celer', 'I want to fight.', 'paid guest');
    close(w);
    talk(w, 'npc-bassus', 'parmula');
    close(w);
    goTo(w, 'ludus-arena-center');
    goTo(w, 'meta-sudans');
    expect(w.rpg.inventory.count('rudis')).toBe(0);
    expect(w.rpg.inventory.count('parmula-ludi')).toBe(0);
    goTo(w, 'armory');
    expect(talk(w, 'npc-bassus')!.nodeId).toBe('reissue');
    talk(w, 'npc-bassus', 'scutum');
    close(w);
    expect(w.rpg.inventory.count('rudis')).toBe(1);
    expect(w.rpg.inventory.count('scutum-ludi')).toBe(1);
  });

  it('without a combat module Glaucus calls each bout, so the thread still finishes', () => {
    const w = world({ combat: false });
    w.rpg.quests.restore({});
    talk(w, 'npc-attius-celer', 'I want to fight.', 'paid guest');
    close(w);
    talk(w, 'npc-bassus', 'scutum');
    close(w);
    for (let i = 0; i < 3; i++) {
      talk(w, 'npc-glaucus', 'Ready.');
      close(w);
    }
    expect(status(w, 'lud-01-sacramentum')!.stage).toBe('missio');
    talk(w, 'npc-nereus', 'Iugula');
    close(w);
    expect(w.rpg.factions.reputation('ludus-magnus')).toBe(-5);
    talk(w, 'npc-attius-celer', 'My thanks.');
    close(w);
    expect(status(w, 'lud-01-sacramentum')!.completed).toBe(true);
  });
});

describe('misc-meta-sudans-rixa: Brawl at the Fountain', () => {
  it('fists: knock out or make yield both scutarii → won (no deaths)', () => {
    const w = world();
    goTo(w, 'meta-sudans-ring');
    expect(status(w, 'misc-meta-sudans-rixa')).toMatchObject({ running: true, stage: 'start' });
    talk(w, 'npc-hilarus', 'argument');
    close(w);
    expect(status(w, 'misc-meta-sudans-rixa')!.stage).toBe('choice');
    talk(w, 'npc-crispus', 'Fists, then.');
    close(w);
    expect(status(w, 'misc-meta-sudans-rixa')!.stage).toBe('brawl');
    expect(w.spawned.map((s) => [s.opts.id, s.opts.brawl])).toEqual([
      ['npc-crispus', true],
      ['npc-bucco', true],
    ]);
    const before = w.rpg.inventory.denarii;
    yieldTo(w, 'npc-crispus');
    kill(w, 'npc-bucco', ['ko']);
    expect(status(w, 'misc-meta-sudans-rixa')).toMatchObject({ completed: true, stage: 'won' });
    expect(w.rpg.inventory.denarii).toBe(before + 6);
    expect(w.rpg.standing.fame('dist-vallis-colossei')).toBe(3);
    expect(w.rpg.sheet.skillXp('brawling')).toBeGreaterThan(0);
  });

  it('words: a bribe for the wine settles it before it starts', () => {
    const w = world();
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-crispus', 'for the wine');
    close(w);
    expect(status(w, 'misc-meta-sudans-rixa')).toMatchObject({ completed: true, stage: 'calmed' });
    expect(w.rpg.inventory.denarii).toBe(before - 3);
    expect(w.rpg.factions.reputation('plebs')).toBe(5);
  });

  it('a Rhetoric check talks them down (with the odds shown) or starts the fight', () => {
    const w = world();
    w.rpg.dialogue.rng = { next: () => 0 };
    const v = talk(w, 'npc-crispus');
    const persuade = v!.choices.find((c) => c.kind === 'check' && c.tag?.startsWith('Persuade'))!;
    expect(persuade.tag).toMatch(/^Persuade \d+%$/);
    talk(w, 'npc-crispus', 'Save it for the games');
    close(w);
    expect(status(w, 'misc-meta-sudans-rixa')!.stage).toBe('calmed');
    const w2 = world();
    w2.rpg.dialogue.rng = { next: () => 0.999 };
    talk(w2, 'npc-crispus', 'Save it for the games');
    close(w2);
    expect(status(w2, 'misc-meta-sudans-rixa')!.stage).toBe('brawl');
  });

  it('yielding ends it (lost); drawing steel makes it assault (failed)', () => {
    const w = world();
    talk(w, 'npc-crispus', 'Fists, then.');
    close(w);
    yieldTo(w, 'player');
    expect(status(w, 'misc-meta-sudans-rixa')).toMatchObject({ completed: true, stage: 'lost' });
    const w2 = world();
    talk(w2, 'npc-crispus', 'Fists, then.');
    close(w2);
    w2.rpg.crime.commit('vis', { witnessed: true });
    expect(status(w2, 'misc-meta-sudans-rixa')).toMatchObject({ failed: true, stage: 'assault' });
  });
});

describe('misc-lemuria-fabae: Black Beans', () => {
  it('watch at midnight → follow the figure → Chloe and Pomponia → persuade Gemellus to feed the living', () => {
    const w = world();
    talk(w, 'npc-fabius-gemellus', 'The Lemuria.', 'keep watch');
    close(w);
    expect(status(w, 'misc-lemuria-fabae')!.running).toBe(true);
    expect(w.rpg.inventory.count('fabae-nigrae')).toBe(9);
    goTo(w, 'insula-fabaria');
    expect(status(w, 'misc-lemuria-fabae')!.stage).toBe('start'); // it's morning
    w.rpg.sheet.vitals.set('pietas', 5);
    const pietas = 5;
    waitUntil(w, 23);
    expect(status(w, 'misc-lemuria-fabae')!.stage).toBe('ghost');
    expect(w.rpg.inventory.count('fabae-nigrae')).toBe(0);
    // The festival rite (+25; Rites XP may also raise the pool's max by 0.2 per skill level).
    expect(w.rpg.sheet.vitals.get('pietas').current).toBeCloseTo(pietas + 25, 0);
    goTo(w, 'insula-fabaria-scalae');
    expect(status(w, 'misc-lemuria-fabae')!.stage).toBe('truth');

    expect(talk(w, 'npc-fabius-gemellus')!.nodeId).toBe('waiting'); // he can't be told yet
    close(w);
    talk(w, 'npc-chloe', 'Who are the beans for?');
    close(w);
    const v = talk(w, 'npc-pomponia', 'Who brings them?');
    expect(v!.text).toContain('Crooked thumb');
    close(w);
    expect(w.rpg.quests.isObjectiveDone('misc-lemuria-fabae', 'pomponia')).toBe(true);

    w.rpg.dialogue.rng = { next: () => 0 };
    talk(w, 'npc-fabius-gemellus', 'starving widow');
    close(w);
    expect(status(w, 'misc-lemuria-fabae')).toMatchObject({ completed: true, stage: 'charity' });
    expect(w.rpg.inventory.count('carmen-lemuriae')).toBe(1);
    expect(w.rpg.standing.fame('dist-velabrum-boarium')).toBe(5);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBeCloseTo(pietas + 35, 0);
  });

  it('telling the truth bluntly exposes Chloe (paid, but Pomponia goes hungry)', () => {
    const w = world();
    talk(w, 'npc-fabius-gemellus', 'The Lemuria.', 'keep watch');
    close(w);
    w.rpg.quests.setStage('misc-lemuria-fabae', 'truth');
    talk(w, 'npc-chloe', 'Who are the beans for?', 'won’t tell');
    close(w);
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-fabius-gemellus', 'Chloe');
    close(w);
    expect(status(w, 'misc-lemuria-fabae')).toMatchObject({ completed: true, stage: 'exposed' });
    expect(w.rpg.inventory.denarii).toBe(before + 10);
    expect(talk(w, 'npc-chloe')!.nodeId).toBe('hurt');
  });
});

describe('misc-insula-nutans: The Leaning Insula', () => {
  it('three cracks → Saturninus refuses → warn Rufina → the wall falls on an empty house', () => {
    const w = world({ interactions: true });
    talk(w, 'npc-rufina', 'What’s wrong', 'take a look');
    close(w);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('start');
    expect(w.placed.map((p) => p.id).sort()).toEqual(['content:nutans-paries', 'content:nutans-scalae', 'content:nutans-taberna']);
    for (const p of [...w.placed]) p.interact(w.game);
    expect(w.placed).toEqual([]);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('agent');

    w.rpg.dialogue.rng = { next: () => 0.999 };
    talk(w, 'npc-saturninus', 'lose your head');
    close(w);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('warn');
    talk(w, 'npc-rufina', 'Get everyone out');
    close(w);
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('evacuated');
    waitUntil(w, 21);
    expect(status(w, 'misc-insula-nutans')).toMatchObject({ completed: true, stage: 'fallen' });
    expect(w.rpg.inventory.count('fascinum')).toBe(1);
    expect(w.rpg.standing.fame('dist-velabrum-boarium')).toBe(10);
  });

  it('walking into the three places also counts, and paying for props shores it up', () => {
    const w = world();
    talk(w, 'npc-rufina', 'What’s wrong', 'take a look');
    close(w);
    for (const id of ['insula-nutans-scalae', 'insula-nutans-taberna', 'insula-nutans-paries']) w.events.emit('location:entered', { locationId: id });
    expect(status(w, 'misc-insula-nutans')!.stage).toBe('agent');
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-saturninus', 'ten denarii');
    close(w);
    expect(status(w, 'misc-insula-nutans')).toMatchObject({ completed: true, stage: 'shored' });
    expect(w.rpg.inventory.denarii).toBe(before - 10 + 6);
  });
});

describe('misc-venus-cloacina: What Venus Hides', () => {
  it('watch the shrine after dusk → the sewer-runner → search the grate → Eros buys the Parthian drachm', () => {
    const w = world({ interactions: true });
    talk(w, 'npc-eros-nummularius', 'odd', 'I’ll watch');
    close(w);
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('start');
    goTo(w, 'shrine-venus-cloacina');
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('start'); // daylight
    waitUntil(w, 20);
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('runner');
    expect(w.spawned.at(-1)).toMatchObject({ archetype: 'cloacarius', opts: { id: 'npc-mus' } });
    yieldTo(w, 'npc-mus');
    expect(w.rpg.quests.isObjectiveDone('misc-venus-cloacina', 'mus')).toBe(true);
    w.placed.find((p) => p.id === 'content:cloacina-grate')!.interact(w.game);
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('packet');
    expect(w.rpg.inventory.count('drachma-parthica')).toBe(1);
    expect(w.rpg.inventory.count('tessera-regis')).toBe(1);
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-eros-nummularius', 'Eight denarii');
    close(w);
    expect(status(w, 'misc-venus-cloacina')).toMatchObject({ completed: true, stage: 'sold' });
    expect(w.rpg.inventory.denarii).toBe(before + 8);
    expect(w.rpg.inventory.count('drachma-parthica')).toBe(0);
  });

  it('the drachm can go to Gavius Silo instead (a main-quest thread)', () => {
    const w = world({ combat: false });
    w.rpg.quests.start('mq-02-tabella');
    talk(w, 'npc-eros-nummularius', 'odd', 'I’ll watch');
    close(w);
    waitUntil(w, 21);
    goTo(w, 'shrine-venus-cloacina');
    expect(status(w, 'misc-venus-cloacina')!.stage).toBe('packet'); // no world to search: found at once
    expect(talk(w, 'npc-eros-nummularius', 'strongrooms')!.nodeId).toBe('toSilo');
    close(w);
    const before = w.rpg.inventory.denarii;
    talk(w, 'npc-castor-contact', 'Cloacina grate');
    close(w);
    expect(status(w, 'misc-venus-cloacina')).toMatchObject({ completed: true, stage: 'silo' });
    expect(w.rpg.inventory.denarii).toBe(before + 20);
    expect(w.rpg.quests.flags.get('cloacina.silo')).toBe(true);
  });
});

describe('saving mid-quest', () => {
  it('a reload restores stages, objectives and quest vars (the Ludus kit, the foes)', () => {
    const w = world();
    talk(w, 'npc-attius-celer', 'I want to fight.', 'paid guest');
    close(w);
    talk(w, 'npc-bassus', 'parmula');
    close(w);
    const saved = JSON.parse(JSON.stringify(w.rpg.quests.serialize()));
    const w2 = world();
    w2.rpg.quests.restore(saved);
    expect(status(w2, 'lud-01-sacramentum')!.stage).toBe('bout1');
    expect(w2.rpg.quests.state('lud-01-sacramentum')!.vars.kit).toBe('parmula-ludi');
    expect(status(w2, 'mq-01-madida-capena')!.stage).toBe('start');
  });
});

describe('the citizens', () => {
  it('unnamed people answer with news, Roman directions and a Rhetoric check after the courier’s death', () => {
    const w = afterArrival();
    let v = w.rpg.dialogue.start('crowd-7', { name: 'Fishmonger' })!;
    expect(v.dialogueId).toBe('citizens');
    expect(v.speakerName).toBe('Fishmonger');
    const check = v.choices.find((c) => c.kind === 'check')!;
    expect(check.tag).toMatch(/^Persuade \d+%$/);
    v = w.rpg.dialogue.choose(v.choices.findIndex((c) => c.text.startsWith('Which way')))!;
    v = w.rpg.dialogue.choose(v.choices.findIndex((c) => c.text.includes('Ludus')))!;
    expect(v.text).toContain('amphitheatre');
    w.rpg.dialogue.end();
    w.rpg.dialogue.rng = { next: () => 0 };
    v = talk(w, 'crowd-7', 'knifed at the Porta Capena')!;
    expect(v.nodeId).toBe('secret');
    expect(w.rpg.quests.flags.get('hideout.known')).toBe(true);
  });
});
