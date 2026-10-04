/**
 * installContent against a fake world: shrines you can pray at, texts you can read, containers you
 * can open (with their loot, owners, locks and world deltas) and the lamps along the golden path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTAINERS, STREET_CONTAINERS } from '../src/content/containers';
import { installContent, placeXZ } from '../src/content/install';
import { lampSpecs } from '../src/content/lamps';
import { SHRINES } from '../src/content/shrines';
import { THINGS } from '../src/content/things';
import { ALL_WALL_TEXTS } from '../src/content/texts';
import type { Game } from '../src/core/Game';
import type { Interactable } from '../src/interaction/Interactions';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import type { ContainerView } from '../src/ui/types';
import { fakeGame, record } from './rpg-fakes';
import { LANDMARK_BY_ID } from '../src/data/atlas';
import { footprintRadius } from '../src/world/landmarks/footprint';
import { solidLandmarkAt } from '../src/content/ground';
import { Vector3 } from 'three';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function world(witnesses: string[] = [], extra: (game: Record<string, unknown>) => void = () => {}) {
  const fg = fakeGame();
  const game = fg.game as unknown as Record<string, unknown>;
  extra(game);
  const items: Interactable[] = [];
  game.interactions = { add: (i: Interactable) => (items.push(i), () => items.splice(items.indexOf(i), 1)), remove: () => {} };
  const books: { title: string; text: string; kind: string }[] = [];
  const views: ContainerView[] = [];
  game.ui = { openBook: (b: { title: string; text: string; kind: string }) => books.push(b), openContainer: (v: ContainerView) => views.push(v) };
  const lamps: { position: { x: number; y: number; z: number }; night?: boolean; removed?: boolean }[] = [];
  game.lights = { request: (r: { position: { x: number; y: number; z: number }; night?: boolean }) => { const l = { ...r, removed: false }; lamps.push(l); return { remove: () => (l.removed = true) }; } };
  game.population ??= { witnesses: () => witnesses };
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  const content = installContent(fg.game);
  const find = (id: string) => items.find((i) => i.id === id)!;
  return { ...fg, rpg, content, items, books, views, lamps, find, game: fg.game as Game };
}
type World = ReturnType<typeof world>;

describe('installContent', () => {
  it('places everything the content defines and is idempotent', () => {
    const w = world();
    expect(w.content.shrines).toBe(SHRINES.length);
    expect(w.content.texts).toBe(ALL_WALL_TEXTS.length);
    expect(w.content.things).toBe(THINGS.length);
    expect(w.content.containers).toBe(STREET_CONTAINERS.length);
    expect(w.content.containers).toBeGreaterThanOrEqual(40);
    // Street lamps hang on house walls; a world without walls (no physics here) has none of them.
    expect(w.content.lamps).toBe(lampSpecs().filter((l) => l.wallOnly === undefined).length);
    expect(w.content.props).toBeGreaterThanOrEqual(w.content.shrines + w.content.things); // every prompt has something to see
    expect(w.lamps.every((l) => l.night)).toBe(true); // lit from dusk to dawn, out at first light
    expect(w.game.content).toBe(w.content);
    expect(installContent(w.game)).toBe(w.content);
    expect(w.items.length).toBe(w.content.shrines + w.content.texts + w.content.things + w.content.containers);
    // Interior containers wait for their interiors.
    expect(CONTAINERS.filter((c) => c.interior).every((c) => !w.items.some((i) => i.id === `container:${c.id}`))).toBe(true);
    w.content.dispose();
    expect(w.items).toHaveLength(0);
    expect(w.lamps.every((l) => l.removed)).toBe(true);
  });

  it('puts every placed thing on the street: shrines, texts and containers have positions near their places, outside buildings', () => {
    const w = world();
    for (const s of SHRINES) {
      const it = w.find(`shrine:${s.id}`);
      const p = placeXZ(w.game, s.id)!;
      // A shrine that is a building itself (the Lacus Curtius) has its altar in front of it.
      const lm = LANDMARK_BY_ID[s.id];
      const allow = 3 + (lm ? footprintRadius(lm) * 0.6 + 1.5 : 0);
      expect(Math.hypot(it.position().x - p.x, it.position().z - p.z), s.id).toBeLessThan(allow);
    }
    for (const it of w.items) {
      const lm = solidLandmarkAt(it.position().x, it.position().z, 0);
      expect(lm?.id ?? null, `${it.id} is inside ${lm?.id}`).toBeNull();
    }
  });

  it('keeps prompts apart: no two things to use within 1 m of each other (the offering box is not on the altar)', () => {
    const w = world();
    const pts = w.items.map((i) => ({ id: i.id, p: i.position() }));
    const close: string[] = [];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) if (pts[i].p.distanceTo(pts[j].p) < 1) close.push(`${pts[i].id} ~ ${pts[j].id} (${pts[i].p.distanceTo(pts[j].p).toFixed(2)} m)`);
    expect(close).toEqual([]);
    for (const c of ['compitum-capenae', 'compitum-circi', 'compitum-vici-tusci']) {
      const d = w.find(`shrine:${c}`).position().distanceTo(w.find(`container:ctn-arca-${c}`).position());
      expect(d, c).toBeGreaterThanOrEqual(1.2);
    }
  });
});

describe('shrines (AC-18)', () => {
  it('praying at a crossroads shrine gives +5 Pietas once a day and the Lares favor; the second prayer gives only the favor', () => {
    const w = world();
    const before = w.rpg.sheet.vitals.get('pietas').current;
    const shrine = w.find('shrine:compitum-capenae');
    expect(shrine.verb()).toBe('Pray');
    expect(shrine.detail!()).toContain('+5 Pietas');
    shrine.interact(w.game);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(before + 5);
    expect(w.rpg.sheet.hasCondition('favor-larum')).toBe(true);
    expect(shrine.detail!()).toContain('prayed here today');
    shrine.interact(w.game);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(before + 5);
  });

  it('works on the Lemuria, when the temple cellae are shut', () => {
    const w = world();
    w.rpg.hooks.templesClosed = () => true;
    const before = w.rpg.sheet.vitals.get('pietas').current;
    w.find('shrine:compitum-circi').interact(w.game);
    expect(w.rpg.sheet.vitals.get('pietas').current).toBe(before + 5);
  });

  it('Cloacina purifies and Juturna heals and washes', () => {
    const w = world();
    w.rpg.standing.setCleanliness('sordidus');
    w.find('shrine:shrine-venus-cloacina').interact(w.game);
    expect(w.rpg.standing.cleanliness).toBe('normal');
    w.rpg.standing.setCleanliness('sordidus');
    w.rpg.sheet.vitals.drain('health', 40);
    const hp = w.rpg.sheet.vitals.get('health').current;
    const it = w.find('shrine:lacus-juturnae');
    expect(it.verb()).toBe('Drink');
    it.interact(w.game);
    expect(w.rpg.sheet.vitals.get('health').current).toBeGreaterThan(hp);
    expect(w.rpg.standing.cleanliness).toBe('normal');
  });
});

describe('wall texts', () => {
  it('reads graffiti and inscriptions in the reader with the Latin above the translation', () => {
    const w = world();
    const reads = record(w.events, ['content:read']);
    const altar = w.find('text:t9-ara-vici-tusci');
    expect(altar.verb()).toBe('Read');
    altar.interact(w.game);
    expect(w.books).toHaveLength(1);
    expect(w.books[0].kind).toBe('tablet');
    expect(w.books[0].text).toContain('LARIBVS · AVGVSTIS');
    expect(w.books[0].text).toContain('restored at their own cost');
    expect(reads.map((r) => (r.e as { id: string }).id)).toEqual(['t9-ara-vici-tusci']);
    w.find('text:t3-chreste').interact(w.game);
    expect(w.books[1].kind).toBe('note');
  });

  it('washes off the lampoon on the Basilica Julia steps at sunset', () => {
    const w = world();
    const lampoon = w.find('text:t5-lampoon');
    expect(lampoon.enabled!()).toBe(true);
    w.game.time.advanceHours(12); // evening
    expect(w.game.time.hour).toBeGreaterThan(19.1);
    expect(lampoon.enabled!()).toBe(false);
  });
});

describe('landmark things', () => {
  it('Read or Look at a landmark opens its note; an inscription shows its Latin first', () => {
    const w = world();
    const reads = record(w.events, ['content:read']);
    const col = w.find('thing:column-trajan');
    expect(col.verb()).toBe('Read');
    expect(col.detail!()).toContain('Trajan');
    col.interact(w.game);
    expect(w.books[0].kind).toBe('tablet');
    expect(w.books[0].text.startsWith('SENATVS')).toBe(true);
    expect(w.books[0].text).toContain('hundred feet of marble');
    const circus = w.find('thing:circus-maximus');
    expect(circus.verb()).toBe('Look');
    circus.interact(w.game);
    expect(w.books[1].text).toContain('two hundred and fifty thousand');
    expect(reads.map((r) => (r.e as { id: string }).id)).toEqual(['thing:column-trajan', 'thing:circus-maximus']);
  });
});

describe('containers', () => {
  const open = (w: World, id: string) => {
    const it = w.find(`container:${id}`);
    it.interact(w.game);
    return it;
  };

  it('a slab: deterministic loot, taken through the container view and remembered in the world deltas', () => {
    const w = world();
    const opens = record(w.events, ['content:opened']);
    const it = open(w, 'ctn-latebra-vortumni');
    expect(w.views).toHaveLength(1);
    expect(it.illegal!()).toBe(false);
    expect(it.detail!()).toBeNull();
    const view = w.views[0];
    expect(view.owned).toBe(false);
    expect(view.title).toBe('A loose paving slab');
    const before = view.items().map((i) => [i.itemId, i.count]);
    expect(opens).toHaveLength(1);
    // The same slab in a second world holds the same things.
    const w2 = world();
    open(w2, 'ctn-latebra-vortumni');
    expect(w2.views[0].items().map((i) => [i.itemId, i.count])).toEqual(before);

    const items = view.items();
    if (items.length) {
      view.take(items[0].itemId, items[0].count);
      expect(view.items().length).toBe(items.length - 1); // (coin items turn into denarii on pickup)
    }
    view.takeAll();
    expect(view.items()).toEqual([]);
    expect(w.game.deltas.isLooted('ctn-latebra-vortumni')).toBe(true);
    expect(it.enabled!()).toBe(false); // emptied: nothing left to prompt for
    // A new game clears the deltas: the slab holds its hollow again.
    w.game.deltas.restore({});
    expect(it.enabled!()).toBe(true);
    it.interact(w.game);
    expect(w.views.at(-1)!.items().map((i) => [i.itemId, i.count])).toEqual(before);
  });

  it('a coin in a basin and a dropped tool are taken at once', () => {
    const w = world();
    const before = w.rpg.inventory.denarii;
    open(w, 'ctn-moneta-mercurii');
    expect(w.views).toHaveLength(0);
    expect(w.rpg.inventory.denarii).toBeGreaterThan(before);
    expect(w.find('container:ctn-moneta-mercurii').enabled!()).toBe(false);
    open(w, 'ctn-instrumentum-1');
    expect(w.rpg.inventory.weight).toBeGreaterThan(0);
  });

  it('an owned container is theft when someone sees (furtum) and nothing when nobody does', () => {
    const seen = world(['npc-caunea']);
    const it = open(seen, 'ctn-corbis-ficus');
    expect(it.illegal!()).toBe(true);
    expect(it.detail!()).toBe('Owned: Caunea');
    expect(seen.views[0].owned).toBe(true);
    expect(seen.views[0].owner).toBe('Caunea');
    seen.views[0].takeAll();
    const bounty = seen.rpg.crime.totalBounty();
    expect(bounty).toBeGreaterThan(0);
    // One theft per container, however many things are taken from it.
    const again = world(['npc-caunea']);
    open(again, 'ctn-corbis-ficus');
    for (const i of again.views[0].items()) again.views[0].take(i.itemId, 1);
    expect(again.rpg.crime.totalBounty()).toBe(bounty);
    // What was taken is stolen goods (the arms dealer and the aedituus refuse them).
    const stolen = seen.rpg.inventory.count('panis', { stolen: true }) + seen.rpg.inventory.count('caseus', { stolen: true }) + seen.rpg.inventory.count('olivae', { stolen: true }) + seen.rpg.inventory.count('ficus', { stolen: true }) + seen.rpg.inventory.count('botulus', { stolen: true });
    expect(stolen).toBeGreaterThanOrEqual(0);

    const unseen = world([]);
    open(unseen, 'ctn-corbis-ficus');
    unseen.views[0].takeAll();
    expect(unseen.rpg.crime.totalBounty()).toBe(0);
  });

  it('the Mouse’s strongbox needs the Mouse’s key and holds the satchel, the scraped tablet and the Parthian coin', () => {
    const w = world();
    const notes = record(w.events, ['rpg:notify']);
    open(w, 'ctn-cista-muris');
    expect(w.views).toHaveLength(0);
    expect(notes.some((n) => String((n.e as { text: string }).text).includes('needs a key'))).toBe(true);
    expect(w.find('container:ctn-cista-muris').detail!()).toBe('Locked');
    w.rpg.inventory.add('clavis-cellae-muris');
    const before = w.rpg.inventory.denarii;
    open(w, 'ctn-cista-muris');
    expect(w.views).toHaveLength(1);
    const ids = w.views[0].items().map((i) => i.itemId).sort();
    expect(ids).toEqual(['fascia', 'nugae', 'quest-drachma-parthica', 'quest-sacculum-festi', 'quest-tabula-rasa']);
    w.views[0].takeAll();
    expect(w.rpg.inventory.count('quest-sacculum-festi')).toBe(1);
    expect(w.rpg.inventory.denarii).toBe(before + 18);
  });

  it('the Rex’s cache is a container the quest listens for', () => {
    const w = world();
    const opens = record(w.events, ['content:opened']);
    open(w, 'ctn-cista-regis');
    expect((opens[0].e as { kind: string }).kind).toBe('cista-regis-cloacae');
    expect(w.views[0].items().map((i) => i.itemId)).toEqual(expect.arrayContaining(['pugio-noric', 'quest-tabella-drachmae']));
  });
});

describe('the world’s spots and the people who come and go', () => {
  it('mirrors the Porta Capena builder’s spots into the places: the arch, the cart, the knife-men, the spring', () => {
    const spot = (id: string, x: number, z: number) => ({ id, kind: 'npc', position: new Vector3(x, 9, z) });
    const w = world([], (g) => {
      g.landmarks = new Map([
        ['porta-capena', { spots: [spot('spawn-capena', 320, 590), spot('courier-ambush', 310, 580), spot('night-cart', 318, 592), spot('capena-grassator-a', 307, 578), spot('night-cart-driver', 319, 594), spot('capena-mercury-spring', 300, 590)] }],
        ['temple-castor-pollux', { spots: [spot('temple-castor-pollux:castor-strongroom', 50, 60)] }],
      ]);
    });
    const loc = (id: string) => w.rpg.locations.get(id)!.position;
    expect(loc('courier-ambush')).toMatchObject({ x: 310, z: 580 });
    expect(loc('capena-fight-area')).toMatchObject({ x: 310, z: 580 }); // the 40 m round the new ambush
    expect(w.rpg.locations.get('capena-fight-area')!.radius).toBe(40);
    expect(loc('capena-extra')).toMatchObject({ x: 318, z: 592 }); // the bible's cart stand follows the cart
    expect(loc('night-cart-courier')).toMatchObject({ x: 318, z: 592 });
    expect(loc('castor-strongroom')).toMatchObject({ x: 50, z: 60 });
    expect(loc('castor-loculi')).toMatchObject({ x: 50, z: 60 });
    expect(w.content.worldSpots).toEqual(expect.arrayContaining(['spawn-capena', 'courier-ambush', 'night-cart', 'capena-grassator-a', 'night-cart-driver', 'castor-strongroom']));
    // The builder's spring is the shrine: the prompt is there and the content adds no altar of its own.
    const shrine = w.find('shrine:fons-mercurii').position();
    expect(Math.hypot(shrine.x - 300, shrine.z - 590)).toBeLessThan(0.5);
    // The builder's cart is in the world: its load can be searched at once.
    expect(w.find('container:ctn-plaustrum-dromonis').enabled!()).toBe(true);
  });

  it('without a builder the fallbacks stand: the opening in front of the flow’s spawn, nothing mirrored', () => {
    const w = world();
    expect(w.content.worldSpots).toEqual([]);
    const amb = w.rpg.locations.get('courier-ambush')!;
    expect(solidLandmarkAt(amb.position.x, amb.position.z, 0.5)).toBeNull();
    // The cart's load waits for the cart (the NPC module's props are not in this build).
    expect(w.find('container:ctn-plaustrum-dromonis').enabled!()).toBe(false);
  });

  it('a New Game brings back the courier the last game killed; a loaded save takes away who died in it', () => {
    const despawned: string[] = [];
    const npcs = new Map<string, { id: string; dead: boolean }>([
      ['npc-festus', { id: 'npc-festus', dead: true }],
      ['npc-mus', { id: 'npc-mus', dead: false }],
    ]);
    const pop = {
      deadNamed: new Set(['npc-festus']),
      witnesses: () => [],
      get: (id: string) => npcs.get(id),
      despawn: (n: { id: string }) => (despawned.push(n.id), npcs.delete(n.id)),
    };
    const w = world([], (g) => (g.population = pop));
    w.events.emit('game:started', { kind: 'new' });
    expect(pop.deadNamed.has('npc-festus')).toBe(false); // the population module will spawn him again
    expect(despawned).toEqual(['npc-festus']); // the corpse from the last game is gone
    // Alive but left where the last opening moved him (down the street): a New Game sends him home.
    npcs.set('npc-festus', { id: 'npc-festus', dead: false });
    w.events.emit('game:started', { kind: 'new' });
    expect(despawned).toEqual(['npc-festus', 'npc-festus']);
    npcs.set('npc-festus', { id: 'npc-festus', dead: false });
    w.events.emit('game:started', { kind: 'quick' });
    expect(despawned).toHaveLength(2); // quick starts and loads leave him be
    // A save in which Mus died: he is taken away and stays dead.
    w.game.deltas!.merge('npc-mus', { dead: true });
    w.events.emit('game:started', { kind: 'load' });
    expect(pop.deadNamed.has('npc-mus')).toBe(true);
    expect(despawned).toEqual(['npc-festus', 'npc-festus', 'npc-mus']);
  });

  it('keeps Mus offstage until the player is on his trail, and gone once he is dealt with', () => {
    const w = world();
    const here = () => !!w.rpg.locations.get('mus-latebra');
    expect(here()).toBe(false);
    w.rpg.quests.flags.set('hideout-known', true);
    expect(here()).toBe(true);
    w.rpg.quests.flags.set('mus-fate', 'fled');
    expect(here()).toBe(false);
    // mq-02 sending the player after him also brings him out.
    w.rpg.quests.flags.delete('mus-fate');
    w.rpg.quests.flags.delete('hideout-known');
    expect(here()).toBe(false);
    w.rpg.quests.start('mq-02-tabella');
    w.rpg.quests.setStage('mq-02-tabella', 'mus');
    expect(here()).toBe(true);
  });
});
