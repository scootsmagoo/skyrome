/**
 * Staged named NPCs (NpcManager.stage / unstage, and the director helpers that wrap them): a
 * scene puts a named NPC at a point out of their schedule; they stay talkable, survive the
 * schedule, come back to the point when they respawn, and go back to their schedule on unstage.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/core/Game';
import { spawnEnemyAt, stage as stageAt, unstage as unstageAt } from '../src/content/director';
import { NpcRegistry } from '../src/npc/registry';
import type { NpcDef } from '../src/npc/types';
import { npcHarness } from './npc-harness';

/** A named NPC whose schedule puts them at a place 30 m east, so a stage has something to beat. */
function stagedDef(id = 'qa-gratus'): NpcDef {
  return {
    id,
    name: 'Gratus',
    appearance: { sex: 'male', age: 'middle', build: 'average', height: 1.7, skin: '#b07d58', hair: { style: 'cropped', color: '#8a8580' }, beard: 'none', garments: [{ kind: 'tunica', color: '#e2dac6' }] },
    schedule: [{ from: 0, at: 'qa-elsewhere', activity: 'work' }],
    dialogue: 'npc-gratus',
    essential: true,
  };
}

/** The harness with a named-NPC registry and one place (qa-elsewhere, 30 m east). */
async function stageHarness(hour = 10) {
  const h = await npcHarness({ hour, opts: { named: true, crowd: false } });
  h.game.npcs = new NpcRegistry([stagedDef()]);
  const places = new Map([['qa-elsewhere', { id: 'qa-elsewhere', name: 'Elsewhere', position: { x: 30, z: 0 }, radius: 4 }]]);
  (h.game as unknown as { locations: unknown }).locations = { get: (id: string) => places.get(id) };
  h.face(0);
  return h;
}

describe('NpcManager.stage', () => {
  it('spawns the named NPC at the point, posed in the loop and facing the heading', async () => {
    const h = await stageHarness();
    expect(h.pop.stage('qa-gratus', 2, -2, Math.PI, 'stand')).toBe(true);
    h.run(2);
    const n = h.pop.get('qa-gratus')!;
    expect(n).toBeDefined();
    expect(Math.hypot(n.position.x - 2, n.position.z + 2)).toBeLessThan(0.3);
    expect(Math.abs(n.position.y)).toBeLessThan(0.5);
    expect(n.scripted).toBe(true);
    expect(n.brain?.task?.loop).toBe('stand');
    expect(n.canMove).toBe(false);
  });

  it('keeps the NPC talkable while posed (the default prompt is off for scripted NPCs)', async () => {
    const h = await stageHarness();
    h.pop.stage('qa-gratus', 2, -2);
    h.run(1);
    const n = h.pop.get('qa-gratus')!;
    expect(n.scripted).toBe(true);
    expect(n.interactable.enabled?.()).toBe(true);
    // A hostile NPC still can't be talked to.
    n.hostile = true;
    expect(n.interactable.enabled?.()).toBe(false);
  });

  it('keeps the point through the schedule: the NPC does not walk to their place 30 m east', async () => {
    const h = await stageHarness();
    h.pop.stage('qa-gratus', 0, 0);
    h.run(30);
    const n = h.pop.get('qa-gratus')!;
    expect(Math.hypot(n.position.x, n.position.z)).toBeLessThan(0.5);
    expect(n.scripted).toBe(true);
    expect(h.pop.list.filter((x) => x.id === 'qa-gratus')).toHaveLength(1);
  });

  it('reports the staged point from positionOf, while spawned and once despawned', async () => {
    const h = await stageHarness();
    h.pop.stage('qa-gratus', 4, 3);
    h.run(2);
    expect(h.pop.get('qa-gratus')).toBeDefined();
    expect(h.pop.positionOf('qa-gratus')).toMatchObject({ x: 4, z: 3 });
    // Walk far off so the staged NPC despawns: the point is still reported, not the schedule's.
    h.walk(200, 0, 0, 0);
    h.run(10);
    expect(h.pop.get('qa-gratus')).toBeUndefined();
    expect(h.pop.positionOf('qa-gratus')).toMatchObject({ x: 4, z: 3 });
  }, 30000);

  it('a stage that fails (the NPC is fighting) changes nothing: no teleport, Talk prompt unchanged', async () => {
    const h = await stageHarness();
    h.pop.stage('qa-gratus', 0, 0);
    h.run(2);
    const n = h.pop.get('qa-gratus')!;
    n.isFighting = () => true;
    const before = n.position.clone();
    const prompt = n.interactable.enabled;
    expect(h.pop.stage('qa-gratus', 6, 6)).toBe(false);
    expect(n.position.distanceTo(before)).toBeLessThan(0.01);
    expect(n.interactable.enabled).toBe(prompt);
  });

  it('a refused stage is not kept: once the fight ends, the NPC is not teleported to the refused point', async () => {
    const h = await stageHarness();
    h.pop.stage('qa-gratus', 0, 0);
    h.run(2);
    const n = h.pop.get('qa-gratus')!;
    n.isFighting = () => true;
    expect(h.pop.stage('qa-gratus', 6, 6)).toBe(false);
    n.isFighting = () => false;
    h.run(3);
    // The kept point is the first stage's (0,0), not the refused (6,6).
    expect(Math.hypot(n.position.x - 6, n.position.z - 6)).toBeGreaterThan(1);
    expect(Math.hypot(n.position.x, n.position.z)).toBeLessThan(0.5);
  });

  it('a held NPC cannot be staged until the hold is released (the quest holds Pudens before staging him)', async () => {
    const h = await stageHarness();
    const release = h.pop.holdNamed('qa-gratus');
    expect(h.pop.stage('qa-gratus', 2, -2)).toBe(false);
    h.run(2);
    expect(h.pop.get('qa-gratus')).toBeUndefined();
    release();
    expect(h.pop.stage('qa-gratus', 2, -2)).toBe(true);
    h.run(2);
    expect(h.pop.get('qa-gratus')).toBeDefined();
  });

  it('moves an NPC already in the world to the point', async () => {
    const h = await stageHarness();
    h.pop.stage('qa-gratus', 0, 0);
    h.run(1);
    expect(h.pop.stage('qa-gratus', -6, 5, 0)).toBe(true);
    h.run(1);
    const n = h.pop.get('qa-gratus')!;
    expect(Math.hypot(n.position.x + 6, n.position.z - 5)).toBeLessThan(0.3);
  });

  it('comes back to the point when the NPC despawns and respawns near it', async () => {
    const h = await stageHarness();
    h.pop.stage('qa-gratus', 0, 0);
    h.run(2);
    expect(h.pop.get('qa-gratus')).toBeDefined();
    // Far off and out of sight: despawned.
    h.walk(200, 0, 0, 0);
    h.run(10);
    expect(h.pop.get('qa-gratus')).toBeUndefined();
    // Back near the point: respawned there, posed again.
    h.walk(-5, 0, 0, 0);
    h.run(4);
    const n = h.pop.get('qa-gratus')!;
    expect(n).toBeDefined();
    expect(Math.hypot(n.position.x, n.position.z)).toBeLessThan(0.5);
    expect(n.scripted).toBe(true);
    expect(n.interactable.enabled?.()).toBe(true);
  }, 30000);

  it('releases the NPC to their schedule on unstage, and the prompt goes back to the default', async () => {
    const h = await stageHarness();
    h.pop.stage('qa-gratus', 0, 0);
    h.run(2);
    const n = h.pop.get('qa-gratus')!;
    h.pop.unstage('qa-gratus');
    expect(n.scripted).toBe(false);
    expect(n.canMove).toBe(true);
    expect(n.interactable.enabled?.()).toBe(true);
    h.run(20);
    // Their schedule is 30 m east: they set off that way.
    expect(Math.hypot(n.position.x, n.position.z)).toBeGreaterThan(2);
    // The schedule's place is east of the staged point: they walk toward it, not back to the point.
    expect(n.position.x).toBeGreaterThan(2);
    // Unstaged: a respawn is left to the schedule too.
    expect(h.pop.positionOf('qa-gratus')).not.toMatchObject({ x: 0, z: 0 });
  });

  it('returns false for an unknown NPC, and unstage of an unknown id does nothing', async () => {
    const h = await stageHarness();
    expect(h.pop.stage('qa-nobody', 0, 0)).toBe(false);
    expect(() => h.pop.unstage('qa-nobody')).not.toThrow();
  });
});

describe('director helpers', () => {
  it('stage uses a point as given, and a place id as the location is registered', () => {
    const stage = vi.fn(() => true);
    const unstage = vi.fn();
    const places = new Map([['column-court', { position: { x: 10, y: 3, z: -4 } }]]);
    const game = { population: { stage, unstage }, locations: { get: (id: string) => places.get(id) } } as unknown as Game;
    expect(stageAt(game, 'npc-gratus', { x: 2.2, y: 9, z: -2.2 }, 1.5)).toBe(true);
    expect(stage).toHaveBeenLastCalledWith('npc-gratus', 2.2, -2.2, 1.5, 'stand');
    expect(stageAt(game, 'npc-apollodorus', 'column-court', 0, 'talk')).toBe(true);
    expect(stage).toHaveBeenLastCalledWith('npc-apollodorus', 10, -4, 0, 'talk');
    expect(stageAt(game, 'npc-x', 'no-such-place', 0)).toBe(false);
    unstageAt(game, 'npc-gratus');
    expect(unstage).toHaveBeenCalledWith('npc-gratus');
  });

  it('stage and unstage are no-ops without a population module', () => {
    const game = {} as unknown as Game;
    expect(stageAt(game, 'npc-gratus', { x: 0, z: 0 }, 0)).toBe(false);
    expect(() => unstageAt(game, 'npc-gratus')).not.toThrow();
  });

  it('spawnEnemyAt passes the exact position and the npc option to game.combat.spawnEnemy', () => {
    const spawn = vi.fn((_a: string, _p: THREE.Vector3, _o: unknown) => ({ id: 'npc-bitus-actor' }));
    const game = { combat: { spawnEnemy: spawn } } as unknown as Game;
    const id = spawnEnemyAt(game, 'thraex', { x: 1, y: 42.5, z: -3 }, { id: 'npc-bitus', npc: 'npc-bitus' });
    expect(id).toBe('npc-bitus-actor');
    const [archetype, pos, opts] = spawn.mock.calls[0] as unknown as [string, THREE.Vector3, { hostile: boolean; npc: string; id: string }];
    expect(archetype).toBe('thraex');
    expect(pos).toBeInstanceOf(THREE.Vector3);
    expect(pos.toArray()).toEqual([1, 42.5, -3]);
    expect(opts).toMatchObject({ hostile: true, npc: 'npc-bitus', id: 'npc-bitus' });
  });

  it('spawnEnemyAt falls back to the given id, and returns null without a combat module', () => {
    const game = { combat: { spawnEnemy: () => undefined } } as unknown as Game;
    expect(spawnEnemyAt(game, 'thraex', { x: 0, y: 0, z: 0 }, { id: 'mq04-dacian-a', hostile: false })).toBe('mq04-dacian-a');
    expect(spawnEnemyAt({} as Game, 'thraex', { x: 0, y: 0, z: 0 }, { id: 'x' })).toBeNull();
  });

  it('spawnEnemyAt does not snap to the street: the height is kept as given', () => {
    const spawn = vi.fn((_a: string, _p: THREE.Vector3, _o: unknown) => ({ id: 'a' }));
    const game = { combat: { spawnEnemy: spawn } } as unknown as Game;
    spawnEnemyAt(game, 'thraex', { x: 5, y: 20, z: 5 }, { id: 'a' });
    expect((spawn.mock.calls[0] as unknown as [string, THREE.Vector3])[1].y).toBe(20);
  });
});
