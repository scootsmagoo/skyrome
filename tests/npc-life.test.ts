import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Actor } from '../src/actors/Actor';
import { randomAppearance } from '../src/actors/avatar/variants';
import { initPhysics, Layer, Physics } from '../src/core/Physics';
import { Rng } from '../src/core/Rng';
import { BarkDirector, barkLines } from '../src/npc/barks';
import { Npc } from '../src/npc/Npc';
import { CROWD_ROLES } from '../src/npc/crowd/roles';
import { SpotIndex } from '../src/npc/spots';
import { NavGrid } from '../src/ai/life/navgrid';
import { NavService } from '../src/ai/life/nav';
import { StreetNav } from '../src/ai/life/streets';
import { FakeWorld } from './npc-fakes';

describe('barks', () => {
  it('rations subtitles: a global gap, a per-speaker cooldown, no quick repeats', () => {
    const said: [string, string][] = [];
    const b = new BarkDirector((t, s) => said.push([t, s]));
    const rng = new Rng(1);
    expect(b.bark(rng, 'a', 'Citizen', { kind: 'greet', table: 'citizen' })).toBeTruthy();
    // Too soon for anyone.
    expect(b.bark(rng, 'b', 'Citizen', { kind: 'greet', table: 'citizen' })).toBeNull();
    b.tick(4);
    expect(b.bark(rng, 'b', 'Citizen', { kind: 'greet', table: 'citizen' })).toBeTruthy();
    b.tick(4);
    // 'a' spoke 8 s ago: still on its own cooldown.
    expect(b.bark(rng, 'a', 'Citizen', { kind: 'ambient', table: 'citizen' })).toBeNull();
    // Screams and guards cut in (urgent) after a short beat.
    b.tick(1);
    expect(b.bark(rng, 'c', 'Slave', { kind: 'flee', table: 'slave' }, true)).toBeTruthy();
    expect(said.length).toBe(3);
    expect(said[2][1]).toBe('Slave');
    // No line repeats until the memory cycles.
    const lines = new Set<string>();
    for (let i = 0; i < 8; i++) {
      b.tick(40);
      lines.add(b.bark(rng, 'd', 'Citizen', { kind: 'ambient', table: 'citizen', district: 'dist-forum-romanum', phase: 'morning' })!);
    }
    expect(lines.size).toBe(8);
  });

  it('named NPCs speak their own lines; districts and phases add flavour', () => {
    expect(barkLines({ kind: 'greet', table: 'citizen', own: ['Bread!'] })).toEqual(['Bread!']);
    const forum = barkLines({ kind: 'ambient', table: 'citizen', district: 'dist-forum-romanum', phase: 'night' });
    expect(forum.some((l) => /Basilica Julia/.test(l))).toBe(true);
    expect(forum.some((l) => /will before you go out to dinner/.test(l))).toBe(true);
    expect(barkLines({ kind: 'shoved', table: 'slave' }).every((l) => /domine|sir|fault|Pardon|Sorry/.test(l))).toBe(true);
    // Every role has greetings and a brush-off.
    for (const r of Object.values(CROWD_ROLES)) {
      expect(barkLines({ kind: 'greet', table: r.barks }).length).toBeGreaterThan(0);
      expect(barkLines({ kind: 'brushoff', table: r.barks }).length).toBeGreaterThan(0);
    }
  });
});

describe('spots', () => {
  it('turns street spots into claimable places (shops, benches, doors, shrines)', () => {
    const w = new FakeWorld();
    const grid = new NavGrid(w, { radius: 40 });
    grid.setFocus(0, 0);
    grid.buildAll();
    const nav = new NavService(grid);
    const streets = new StreetNav({
      nodes: [],
      spots: [
        { id: 's1', kind: 'shopDoor', position: { x: 5, z: 0 }, facing: 0, tag: 'smithy' },
        { id: 's2', kind: 'shopDoor', position: { x: 8, z: 0 }, facing: 0, tag: 'thermopolium' },
        { id: 'b1', kind: 'bench', position: { x: 0, z: 5 }, facing: Math.PI },
        { id: 'd1', kind: 'houseDoor', position: { x: -5, z: 0 }, facing: 0 },
        { id: 'sh', kind: 'shrine', position: { x: 0, z: -5 }, facing: 0 },
      ],
    });
    const idx = new SpotIndex();
    idx.refresh(0, 0, 0, nav, streets, new Rng(1), null, () => 0);
    const rng = new Rng(2);
    const shop = idx.find('shop', 0, 0, 20, rng)!;
    expect(shop.id).toBe('st:s1');
    expect(idx.find('tavern', 0, 0, 20, rng)?.id).toBe('st:s2');
    const bench = idx.find('steps', 0, 0, 20, rng)!;
    expect(bench.loop).toBe('sit');
    // Sitting: the root sits ~0.35 m in front of the seat line (avatar.md).
    expect(bench.z).toBeCloseTo(5 - 0.35, 2);
    expect(idx.find('shrine', 0, 0, 20, rng)?.loop).toBe('pray');
    idx.claim(shop, 'npc1');
    expect(idx.find('shop', 0, 0, 20, rng)).toBeNull();
    idx.release('npc1');
    expect(idx.find('shop', 0, 0, 20, rng)?.id).toBe('st:s1');
  });
});

describe('Npc bodies (GDD §14.7b shoulder-through)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  function walkInto(solid: boolean) {
    const physics = new Physics();
    physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    const game = { physics, scene: new THREE.Scene(), rng: new Rng(1) } as never;
    const npc = new Npc(game, { id: 'n', name: 'Citizen', appearance: randomAppearance(new Rng('n'), 'plebeian-man'), position: { x: 0, y: 0.02, z: -2 }, ambient: true, lod: 'low' });
    npc.setSolid(solid);
    const player = new Actor(game, { id: 'p', position: { x: 0, y: 0.02, z: 0 }, layer: Layer.Player });
    physics.step(1 / 60);
    for (let i = 0; i < 90; i++) {
      player.locomote({ x: 0, y: 0, z: -3 }, 1 / 60);
      npc.locomote({ x: 0, y: 0, z: 0 }, 1 / 60);
      physics.step(1 / 60);
    }
    return { player: player.position.z, npc: npc.position.z };
  }

  it('the player walks through a crowd NPC but not through a solid (hostile) one', () => {
    const soft = walkInto(false);
    expect(soft.player).toBeLessThan(-3.5); // straight through at full speed
    expect(soft.npc).toBeCloseTo(-2, 1); // and the NPC isn't bulldozed by the capsule
    const solid = walkInto(true);
    expect(solid.player).toBeGreaterThan(solid.npc + 0.5); // still on its own side
  });

  it('exposes a Talk interactable labelled with the name and title', () => {
    const physics = new Physics();
    const game = { physics, scene: new THREE.Scene() } as never;
    const npc = new Npc(game, { id: 'felix', name: 'Felix', title: 'Baker', appearance: randomAppearance(new Rng('f'), 'merchant'), position: { x: 0, y: 0, z: 0 }, ambient: false, lod: 'low' });
    expect(npc.interactable.verb()).toBe('Talk');
    expect(npc.interactable.label()).toBe('Felix');
    expect(npc.interactable.detail?.()).toBe('Baker');
    expect(npc.interactable.enabled?.()).toBe(true);
    npc.hostile = true;
    expect(npc.interactable.enabled?.()).toBe(false);
  });
});
