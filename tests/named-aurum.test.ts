/**
 * The places of mq-07, "The Eastern Gold" (docs/STORY.md chapter 7): Malchus's storeroom bay at the Horrea
 * Piperataria, the cave of Mithras in the Subura, the Chaldaean's flat on the Clivus Victoriae and the couriers'
 * barracks at the Castra Peregrina (src/world/interiors/named/{piperataria,mithraeum,asclepiodotus,peregrina}.ts),
 * the people placed in them (named/cast.ts) and their containers and loot.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Draw } from '../src/arch/fabric/draw';
import { CONTAINERS } from '../src/content/containers';
import { isKnownPlace } from '../src/content/places';
import type { Game } from '../src/core/Game';
import { initPhysics } from '../src/core/Physics';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import aurumNpcs from '../src/npc/content/aurum';
import { LOOT_TABLES } from '../src/rpg/data/loot';
import { isLocked } from '../src/world/doors/rules';
import { NAMED_CELLS, NAMED_FRONTS } from '../src/world/interiors/named';
import { asclepiodotusCell, asclepiodotusFront, DOMUS_ASCLEPIODOTI, READ_Z1, TABLE } from '../src/world/interiors/named/asclepiodotus';
import { castAt, CELL_CAST } from '../src/world/interiors/named/cast';
import { inBounds, interiorContainers, namedDef, placeSpots } from '../src/world/interiors/named/common';
import * as mith from '../src/world/interiors/named/mithraeum';
import { peregrinaCell, peregrinaFront, BUNK_Z, LOCKER_X } from '../src/world/interiors/named/peregrina';
import { piperatariaCell, piperatariaFront, PILE } from '../src/world/interiors/named/piperataria';

const ctx = { game: {} as Game, builder: () => new MeshBuilder() };
const cells = { 'piperataria-bay': piperatariaCell, 'mithraeum-subura': mith.mithraeumCell, 'domus-asclepiodoti': asclepiodotusCell, 'peregrina-barracks': peregrinaCell };

beforeAll(async () => {
  await initPhysics();
});

describe('the four cells of chapter 7', () => {
  it('are registered under the ids the quest uses, with their names', () => {
    for (const [id, cell] of Object.entries(cells)) expect(NAMED_CELLS.find((c) => c.id === id), id).toBe(cell);
    expect(piperatariaCell.name).toBe('Malchus’s storeroom');
    expect(piperatariaCell.latin).toBe('Cella Malchi');
    expect(mith.mithraeumCell.name).toBe('The cave of Mithras');
    expect(mith.mithraeumCell.latin).toBe('Spelaeum Mithrae');
    expect(asclepiodotusCell.name).toBe('The Chaldaean’s rooms');
    expect(asclepiodotusCell.latin).toBe('Cenaculum Asclepiodoti');
    expect(peregrinaCell.name).toBe('The couriers’ barracks');
    expect(peregrinaCell.latin).toBe('Contubernia');
  });

  it.each(Object.entries(cells))('%s: every named place is a spot of the built cell, inside the bounds, and resolves as a quest marker spot', (_id, cell) => {
    const built = cell.build(ctx);
    for (const [name, p] of Object.entries(cell.places!)) {
      expect(inBounds(cell, p.position), name).toBe(true);
      const spot = built.spots.find((s) => s.id === name);
      expect(spot, name).toBeDefined();
      expect(spot!.position.x).toBeCloseTo(p.position.x, 6);
      expect(spot!.position.y).toBeCloseTo(p.position.y, 6);
      expect(spot!.position.z).toBeCloseTo(p.position.z, 6);
    }
    expect(placeSpots(cell).length).toBe(Object.keys(cell.places!).length);
  });

  it('the places the quest names exist', () => {
    expect(Object.keys(piperatariaCell.places!)).toEqual(expect.arrayContaining(['entry', 'sacks']));
    expect(Object.keys(mith.mithraeumCell.places!)).toEqual(
      expect.arrayContaining(['father', 'initiate-1', 'initiate-2', 'feast-mardonius', 'feast-malchus', 'feast-chaldaean', 'stair-1', 'stair-2', 'entry']),
    );
    expect(Object.keys(asclepiodotusCell.places!)).toEqual(expect.arrayContaining(['reader', 'client', 'table', 'entry']));
  });

  it('every door has its place, and the street doors are the quest’s: owner, lock and hours', () => {
    const fronts = Object.fromEntries(NAMED_FRONTS.map((f) => [f.id, f]));
    const pip = fronts['front:piperataria-bay'];
    expect(pip).toBe(piperatariaFront);
    expect(pip.spot).toBe('piperataria-malchus');
    expect(pip.owner).toEqual({ id: 'npc-malchus', name: 'Malchus' });
    expect(pip.lock!.tier).toBe('mediocris');
    expect(isLocked(pip.lock, undefined, 10)).toBe(false);
    expect(isLocked(pip.lock, undefined, 6.5)).toBe(true);
    expect(isLocked(pip.lock, undefined, 19)).toBe(true);

    const mf = fronts['front:mithraeum-subura'];
    expect(mf).toBe(mith.mithraeumFront);
    expect(mf.spot).toBe('mithraeum-door');
    expect(mf.owner).toEqual({ id: 'cult-mithras', name: 'the Father of the cave' });
    expect(mf.lock!.tier).toBe('firma');
    expect(mf.lock!.openHours).toEqual([19, 24]);
    expect(isLocked(mf.lock, undefined, 12)).toBe(true);
    expect(isLocked(mf.lock, undefined, 21)).toBe(false);
    expect(isLocked(mf.lock, undefined, 0.5)).toBe(true);
    expect(typeof mf.mark).toBe('function');

    const af = fronts['front:domus-asclepiodoti'];
    expect(af).toBe(asclepiodotusFront);
    expect(af.spot).toBe('asclepiodotus-door');
    expect(af.owner).toEqual({ id: 'npc-asclepiodotus', name: 'Asclepiodotus' });
    expect(af.lock!.tier).toBe('mediocris');
    expect(isLocked(af.lock, undefined, 10)).toBe(false);
    expect(isLocked(af.lock, undefined, 22)).toBe(true);

    const pf = fronts['front:peregrina-barracks'];
    expect(pf).toBe(peregrinaFront);
    expect(pf.spot).toBe('peregrina-barracks-door');
    expect(pf.owner).toEqual({ id: 'castra-peregrina', name: 'the couriers' });
    expect(pf.lock!.tier).toBe('mediocris');
    expect(isLocked(pf.lock, undefined, 6)).toBe(false);
    expect(isLocked(pf.lock, undefined, 23)).toBe(true);
    for (const f of [pip, mf, af, pf]) {
      expect(isKnownPlace(f.spot), f.spot).toBe(true);
      expect(f.cell).toBeTruthy();
      expect(inBounds(Object.values(cells).find((c) => c.id === f.cell)!, f.entry.position)).toBe(true);
    }
    expect(isKnownPlace('piperataria-clerk')).toBe(true);
  });

  it('each cell has a way out to its own street door', () => {
    for (const cell of Object.values(cells)) {
      const out = namedDef(cell).doors!.find((d) => d.id === `${cell.id}:out`)!;
      expect(out.from).toBe(cell.id);
      expect(out.to.interior).toBeNull();
      expect(inBounds(cell, cell.exit.at)).toBe(true);
    }
  });
});

describe('the cave of Mithras', () => {
  const { FLOOR, VAULT_Z0, VAULT_Z1, VAULT_HALF, RELIEF, PLACES } = mith;

  it('is a long low vault: 4.4 m wide, 14 m long, the stair of 14 treads down to the floor', () => {
    expect(VAULT_HALF * 2).toBeCloseTo(4.4, 6);
    expect(VAULT_Z1 - VAULT_Z0).toBeCloseTo(14, 6);
    expect(mith.STEPS * mith.RISE).toBeCloseTo(-FLOOR, 6);
    expect(mith.mithraeumCell.entry.position.y).toBeGreaterThan(-0.2);
  });

  it('has the relief of the bull-slaying framed on the far wall, inside the cell and above the altars', () => {
    const cell = mith.mithraeumCell;
    for (const x of [RELIEF.x0, RELIEF.x1]) for (const y of [RELIEF.y0, RELIEF.y1]) expect(inBounds(cell, { x, y, z: RELIEF.z }), `${x},${y}`).toBe(true);
    expect(RELIEF.z).toBeGreaterThan(VAULT_Z1 - 0.25);
    expect(RELIEF.z).toBeLessThan(VAULT_Z1);
    expect(RELIEF.x1 - RELIEF.x0).toBeLessThan(VAULT_HALF * 2);
    // The crown of the vault clears the panel's top (the arch of the field).
    expect(FLOOR + 2.0 + VAULT_HALF).toBeGreaterThan(RELIEF.y1);
    // The relief paints: the figures draw into the builder.
    const b = new MeshBuilder();
    mith.reliefPainting(new Draw(b));
    expect(b.build('relief').children.length).toBeGreaterThan(5);
  });

  it('the Father stands before the relief facing the aisle; the initiates sit on the benches near the stair; the three of the feast sit apart near the far end', () => {
    const father = PLACES.father;
    expect(father.position.x).toBe(0);
    expect(father.position.z).toBeGreaterThan(VAULT_Z1 - 3);
    expect(Math.cos(father.heading)).toBeLessThan(-0.99); // faces −z, down the aisle
    const seat = (n: string) => PLACES[n];
    for (const n of ['initiate-1', 'initiate-2', 'feast-mardonius', 'feast-malchus', 'feast-chaldaean']) {
      const p = seat(n).position;
      expect(Math.abs(p.x), n).toBeGreaterThan(VAULT_HALF - 1.1);
      expect(Math.abs(p.x), n).toBeLessThan(VAULT_HALF);
      expect(p.y, n).toBeCloseTo(FLOOR + 0.5, 6);
      expect(p.z, n).toBeGreaterThan(mith.PODIUM_Z0);
      expect(p.z, n).toBeLessThan(mith.PODIUM_Z1);
      // They face the aisle.
      expect(Math.sin(seat(n).heading) * p.x, n).toBeLessThan(0);
    }
    const dist = (a: string, b: string) => Math.hypot(seat(a).position.x - seat(b).position.x, seat(a).position.z - seat(b).position.z);
    for (const f of ['feast-mardonius', 'feast-malchus', 'feast-chaldaean']) for (const i of ['initiate-1', 'initiate-2']) expect(dist(f, i), `${f} / ${i}`).toBeGreaterThan(4.9);
    expect(dist('feast-mardonius', 'feast-malchus')).toBeGreaterThan(1);
  });

  it('the two knife-men’s places are on the stair, one above the other, each on a tread', () => {
    const [a, b] = [PLACES['stair-1'], PLACES['stair-2']];
    for (const s of [a, b]) {
      expect(s.position.x).toBe(0);
      const i = Math.floor((s.position.z - mith.LANDING) / mith.RUN);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(mith.STEPS);
      expect(s.position.y).toBeCloseTo(mith.treadTop(i), 6);
    }
    expect(a.position.z).toBeLessThan(b.position.z);
    expect(PLACES.entry.position.y).toBeCloseTo(FLOOR, 6);
    expect(PLACES.entry.position.z).toBeGreaterThan(VAULT_Z0);
  });
});

describe('Malchus’s bay', () => {
  it('has the marked pile of sacks in front of its place, and the strongbox in the corner, clear of the pile', () => {
    const sacks = piperatariaCell.places!.sacks;
    expect(sacks.position.x).toBeGreaterThan(PILE.x0);
    expect(sacks.position.x).toBeLessThan(PILE.x1);
    expect(PILE.z0 - sacks.position.z).toBeGreaterThan(0.4);
    expect(PILE.z0 - sacks.position.z).toBeLessThan(1.6);
    expect(sacks.heading).toBe(0); // faces +z, at the pile
    const box = CONTAINERS.find((c) => c.id === 'ctn-arca-malchi')!;
    expect(box).toMatchObject({ interior: true, at: 'piperataria-bay', owner: 'npc-malchus', ownerName: 'Malchus', locked: 'difficilis', table: 'arca-malchi' });
    const x = box.dx!, z = box.dz!;
    expect(inBounds(piperatariaCell, { x, y: 0.2, z }, 0.5)).toBe(true);
    expect(x - 0.5).toBeGreaterThan(PILE.x1);
  });
});

describe('the couriers’ barracks', () => {
  it('has Mardonius’s box at the foot of the third bunk on the east side, owned, and two ordinary lockers', () => {
    const m = CONTAINERS.find((c) => c.id === 'ctn-loculus-mardonii')!;
    expect(m).toMatchObject({ interior: true, at: 'peregrina-barracks', owner: 'npc-mardonius', ownerName: 'Mardonius', locked: 'mediocris', label: 'Mardonius’s box', table: 'loculus-mardonii' });
    expect(m.dx).toBeCloseTo(LOCKER_X, 6);
    expect(m.dz).toBe(BUNK_Z[2]);
    expect(interiorContainers('peregrina-barracks').length).toBe(3);
    for (const c of interiorContainers('peregrina-barracks')) expect(inBounds(peregrinaCell, { x: c.dx!, y: 0.3, z: c.dz! }, 0.4), c.id).toBe(true);
  });
});

describe('the Chaldaean’s flat', () => {
  it('seats him on the far side of the table, the client opposite, and a visitor’s place at the table’s edge', () => {
    const { reader, client, table } = asclepiodotusCell.places!;
    expect(reader.position.z).toBeGreaterThan(TABLE.z1);
    expect(client.position.z).toBeLessThan(TABLE.z0);
    expect(table.position.z).toBeLessThan(TABLE.z0);
    expect(table.position.z).toBeGreaterThan(TABLE.z0 - 1.2);
    expect(table.position.x).toBeGreaterThan(TABLE.x0);
    expect(table.position.x).toBeLessThan(TABLE.x1);
    expect(Math.cos(reader.heading)).toBeLessThan(-0.99); // faces the client
    expect(Math.cos(client.heading)).toBeGreaterThan(0.99);
    for (const p of [reader, client, table]) expect(p.position.y).toBeCloseTo(3.2, 6);
    expect(READ_Z1).toBeGreaterThan(reader.position.z);
  });
});

describe('who is in the cells', () => {
  it('Asclepiodotus is at his table at any hour; the Father at the relief; the initiates only from 19:00 to 24:00', () => {
    for (const h of [0, 6, 12, 18.9, 20, 23.9]) {
      expect(castAt(DOMUS_ASCLEPIODOTI, h).map((m) => m.npc)).toEqual(['npc-asclepiodotus']);
      expect(castAt('mithraeum-subura', h).map((m) => m.npc)).toContain('npc-cassius-ursus');
    }
    expect(castAt('mithraeum-subura', 12).map((m) => m.npc)).toEqual(['npc-cassius-ursus']);
    expect(castAt('mithraeum-subura', 19).map((m) => m.npc)).toEqual(['npc-cassius-ursus', 'npc-initiate-1', 'npc-initiate-2']);
    expect(castAt('mithraeum-subura', 23.5).map((m) => m.npc)).toContain('npc-initiate-2');
    expect(castAt('mithraeum-subura', 0.5).map((m) => m.npc)).toEqual(['npc-cassius-ursus']);
    expect(castAt('piperataria-bay', 12)).toEqual([]);
  });

  it('each person is placed at a place of their cell, and has a definition (with a dialogue for the two who talk)', () => {
    const byId = new Map(aurumNpcs.map((n) => [n.id, n]));
    for (const [cell, members] of Object.entries(CELL_CAST)) {
      for (const m of members) {
        expect(Object.keys((cells as Record<string, { places?: object }>)[cell].places!), m.npc).toContain(m.place);
        expect(byId.has(m.npc), m.npc).toBe(true);
        // Placed by the cast, not by a street schedule.
        expect(byId.get(m.npc)!.schedule, m.npc).toBeUndefined();
        expect(byId.get(m.npc)!.home, m.npc).toBeUndefined();
      }
    }
    expect(byId.get('npc-asclepiodotus')!.dialogue).toBe('npc-asclepiodotus');
    expect(byId.get('npc-cassius-ursus')!.dialogue).toBe('npc-cassius-ursus');
    expect(byId.get('npc-asclepiodotus')!.essential).toBe(true);
  });

  it('Malchus and the clerk keep their places by day, Malchus essential, offstage at night', () => {
    const malchus = aurumNpcs.find((n) => n.id === 'npc-malchus')!;
    const clerk = aurumNpcs.find((n) => n.id === 'npc-clerk-piperataria')!;
    expect(malchus.essential).toBe(true);
    expect(malchus.dialogue).toBe('npc-malchus');
    expect(clerk.dialogue).toBe('npc-clerk-piperataria');
    for (const n of [malchus, clerk]) {
      expect(n.schedule!.every((e) => isKnownPlace(e.at))).toBe(true);
      expect(n.schedule!.find((e) => e.activity === 'sleep')!.from).toBeGreaterThanOrEqual(18);
    }
    expect(malchus.schedule![0]).toMatchObject({ at: 'piperataria-malchus', from: 7 });
  });
});

describe('the loot', () => {
  it('Malchus’s box holds his ledger, Mardonius’s his letter; both are fixed tables', () => {
    const table = (id: string) => LOOT_TABLES.find((t) => t.id === id)!;
    expect(table('arca-malchi').always!.some((a) => a.item === 'quest-rationes-malchi' && (a.count ?? 1) === 1)).toBe(true);
    expect(table('loculus-mardonii').always!.some((a) => a.item === 'quest-epistula-mardonii' && (a.count ?? 1) === 1)).toBe(true);
    for (const id of ['arca-malchi', 'loculus-mardonii']) expect(table(id).rolls).toEqual([0, 0]);
  });
});

