/**
 * The mortar bench (docs/design/world-life.md §4.6, §5.4 D2): what the rules say can be made, what
 * the card shows (nothing hidden), and a making on the real runtime with a stand-in game: inputs
 * and fee taken, goods and Medicina XP given, time passed, 'life:crafted' fired.
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { installLifeBench } from '../src/life/craft/bench';
import { craftXp, makeState, whyNot } from '../src/life/craft/rules';
import { LIFE } from '../src/life/registry';
import type { Recipe } from '../src/life/types';
import { ITEMS } from '../src/rpg/data/items';

const NAME = (id: string) => ITEMS.find((i) => i.id === id)?.name.toLowerCase() ?? id;
const mortar = LIFE.recipes.filter((r) => r.bench === 'mortar');
const byId = (id: string) => mortar.find((r) => r.id === id)!;

describe('the rules of the bench', () => {
  const have = (items: Record<string, number>, level: number) => ({ count: (i: string) => items[i] ?? 0, level });

  it('a recipe above the level is greyed with its level, whatever is in the bag', () => {
    const r = byId('rec.mortar.collyrium');
    const s = makeState(r, have({ ruta: 1, acetum: 1, mel: 1 }, 19));
    expect(s).toEqual({ ok: false, why: 'level', need: 20 });
    expect(whyNot(s, NAME)).toBe('Medicina 20');
    expect(makeState(r, have({ ruta: 1, acetum: 1, mel: 1 }, 20)).ok).toBe(true);
  });

  it('a recipe without the goods says what it needs, with counts', () => {
    const r = byId('rec.mortar.emplastrum');
    const s = makeState(r, have({ mel: 1, acetum: 1 }, 10));
    expect(s.ok).toBe(false);
    expect(whyNot(s, NAME)).toBe('You need sage');
    const t = makeState(byId('rec.mortar.febrifugum'), have({}, 30));
    expect(whyNot(t, NAME)).toBe('You need 2 × wormwood, house wine and 2 × honey');
  });

  it('gives Medicina XP by the 10 + 5 per effect rule', () => {
    expect(craftXp(0)).toBe(10);
    expect(craftXp(1)).toBe(15);
    expect(craftXp(2)).toBe(20);
  });

  it('the mortar has the six recipes of the data, in a ladder from 0 to 55', () => {
    expect(mortar.map((r) => r.minLevel)).toEqual([0, 10, 20, 30, 40, 55]);
    for (const r of mortar) expect(r.skill).toBe('medicina');
  });
});

// ------------------------------------------------------------------ the bench in a stand-in game

function world(opts: { items?: Record<string, number>; level?: number; denarii?: number; luds?: boolean } = {}) {
  const bag = new Map<string, number>(Object.entries(opts.items ?? {}));
  let denarii = opts.denarii ?? 5;
  let hours = 0;
  let xp = 0;
  const events: { name: string; payload: unknown }[] = [];
  const game = {
    time: { advanceHours: (h: number) => void (hours += h) },
    events: { emit: (name: string, payload: unknown) => void events.push({ name, payload }), on() {} },
    dialogue: { register() {}, start: () => ({}) },
    items: { get: (id: string) => ITEMS.find((i) => i.id === id) },
    quests: { status: (id: string) => (id === 'lud-01-sacramentum' && opts.luds ? { done: true, running: false, completed: true } : undefined) },
    life: { data: { recipes: LIFE.recipes } },
    player: {
      sheet: { skillLevel: () => opts.level ?? 0, useSkill: (_s: string, n: number) => void (xp += n) },
      inventory: {
        get denarii() {
          return denarii;
        },
        spendDenarii: (n: number) => (denarii + 1e-9 >= n ? ((denarii -= n), true) : false),
        count: (i: string) => bag.get(i) ?? 0,
        remove: (i: string, n = 1) => (bag.set(i, (bag.get(i) ?? 0) - n), true),
        add: (i: string, n = 1) => void bag.set(i, (bag.get(i) ?? 0) + n),
      },
    },
  } as unknown as Game;
  installLifeBench(game);
  return { game, bag, events, get hours() { return hours; }, get xp() { return xp; }, get denarii() { return denarii; } };
}

describe('Demetrius’s mortar', () => {
  it('makes three poultices from honey, sage and vinegar: XP, half an hour, an as', () => {
    const w = world({ items: { mel: 1, salvia: 1, acetum: 1 }, level: 10 });
    const r = w.game.lifeCraft.make('rec.mortar.emplastrum', 'npc-demetrius');
    expect(r.ok).toBe(true);
    expect(w.bag.get('emplastrum')).toBe(3);
    expect(w.bag.get('mel')).toBe(0);
    expect(w.bag.get('salvia')).toBe(0);
    expect(w.bag.get('acetum')).toBe(0);
    expect(w.xp).toBe(15);
    expect(w.hours).toBe(0.5);
    expect(w.denarii).toBeCloseTo(5 - 1 / 16, 6);
    expect(w.events.some((e) => e.name === 'life:crafted' && JSON.stringify(e.payload) === JSON.stringify({ recipe: 'rec.mortar.emplastrum', item: 'emplastrum', count: 3 }))).toBe(true);
    expect(w.events.some((e) => e.name === 'time:skipped')).toBe(true);
  });

  it('the card hides nothing: every recipe is listed, greyed with the level or what is missing', () => {
    const w = world({ items: { mel: 1, salvia: 1, acetum: 1 }, level: 10 });
    const list = w.game.lifeCraft.states('npc-demetrius');
    expect(list.length).toBe(mortar.length);
    const line = (id: string) => list.find((s) => s.recipe.id === id)!.line;
    expect(list.find((s) => s.recipe.id === 'rec.mortar.emplastrum')!.state.ok).toBe(true);
    expect(line('rec.mortar.collyrium')).toBe('Medicina 20');
    expect(line('rec.mortar.theriaca')).toBe('Medicina 55');
    expect(line('rec.mortar.posca')).toBe('You need water');
  });

  it('refuses a recipe above the player’s level, or without the goods, and takes nothing', () => {
    const w = world({ items: { ruta: 1, acetum: 1, mel: 1 }, level: 10 });
    const r = w.game.lifeCraft.make('rec.mortar.collyrium', 'npc-demetrius');
    expect(r).toMatchObject({ ok: false, text: 'Medicina 20.' });
    expect(w.bag.get('ruta')).toBe(1);
    expect(w.denarii).toBe(5);
    expect(w.hours).toBe(0);
  });

  it('wants its as for the use of the bench', () => {
    const w = world({ items: { acetum: 1, aqua: 1 }, level: 0, denarii: 0 });
    expect(w.game.lifeCraft.make('rec.mortar.posca', 'npc-demetrius').ok).toBe(false);
    expect(w.bag.get('acetum')).toBe(1);
  });
});

describe('Hermippus’s mortar', () => {
  it('is shut to strangers until the Ludus has the player’s name, and then free', () => {
    const before = world({ items: { acetum: 1, aqua: 1 }, denarii: 0 });
    expect(before.game.lifeCraft.make('rec.mortar.posca', 'npc-hermippus').ok).toBe(false);
    expect(before.bag.get('acetum')).toBe(1);

    const after = world({ items: { acetum: 1, aqua: 1 }, denarii: 0, luds: true });
    expect(after.game.lifeCraft.fee('npc-hermippus')).toBe(0);
    const r = after.game.lifeCraft.make('rec.mortar.posca', 'npc-hermippus');
    expect(r.ok).toBe(true);
    expect(after.bag.get('posca')).toBe(2);
    expect(after.denarii).toBe(0);
    expect(after.hours).toBe(0.25);
  });
});

describe('the data', () => {
  it('every recipe names items that exist and outputs a remedy or a drink', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    for (const r of mortar as Recipe[]) {
      for (const i of r.inputs) expect(ids.has(i.item), `${r.id}: ${i.item}`).toBe(true);
      expect(ids.has(r.output.item), `${r.id}: ${r.output.item}`).toBe(true);
    }
  });
});
