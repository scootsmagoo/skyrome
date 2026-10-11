import { describe, expect, it, vi } from 'vitest';

// findSafeGround streams the city and casts rays: here a stub that lands 0.1 m over the terrain.
vi.mock('../src/world/safeGround', () => ({
  findSafeGround: vi.fn((_game: unknown, near: { x: number; y: number; z: number }) => ({ x: near.x + 1, y: near.y + 0.1, z: near.z })),
}));

import { regroundAfterLoad } from '../src/save/SaveSystem';
import { findSafeGround } from '../src/world/safeGround';

/** A game with only what the re-grounding reads: the player, the heightmap, physics, water and interiors. */
function game(opts: { profile: 'v1' | 'v2'; feetY: number; groundY: number; floor?: number | null; depth?: number; interior?: boolean }) {
  const pos = { x: 10, y: opts.feetY, z: 20 };
  const teleport = vi.fn((to: { x: number; y: number; z: number }) => Object.assign(pos, to));
  return {
    pos,
    teleport,
    game: {
      player: { position: pos, teleport },
      heightmap: { profile: opts.profile, heightAt: () => opts.groundY },
      physics: { groundHeight: () => (opts.floor === undefined ? opts.groundY : opts.floor) },
      water: { depthAt: () => opts.depth ?? 0 },
      interiors: { cellAt: () => (opts.interior ? {} : null) },
    } as never,
  };
}

describe('save re-grounding across terrain profiles (solid-ground §3)', () => {
  it('leaves a save made on this ground with its feet on the ground where it was', () => {
    const g = game({ profile: 'v2', feetY: 12, groundY: 12 });
    regroundAfterLoad(g.game, 'v2');
    expect(g.teleport).not.toHaveBeenCalled();
  });

  it('re-grounds a save from the other profile (no profile stored = v1) near its x, z', () => {
    for (const saved of [undefined, 'v1']) {
      const g = game({ profile: 'v2', feetY: 12, groundY: 12.4 });
      regroundAfterLoad(g.game, saved);
      expect(g.teleport).toHaveBeenCalledTimes(1);
      expect(g.pos).toMatchObject({ x: 11, z: 20 });
      expect(g.pos.y).toBeCloseTo(12.5, 6);
    }
  });

  it('re-grounds feet more than 1 m under the ground, or over nothing, on the same profile', () => {
    const buried = game({ profile: 'v2', feetY: 10, groundY: 11.5 });
    regroundAfterLoad(buried.game, 'v2');
    expect(buried.teleport).toHaveBeenCalledTimes(1);
    expect(buried.pos.y).toBeGreaterThan(11.5);
    const floating = game({ profile: 'v2', feetY: 30, groundY: 12, floor: null });
    regroundAfterLoad(floating.game, 'v2');
    expect(floating.teleport).toHaveBeenCalledTimes(1);
  });

  it('keeps a swimmer in the river and a player in an interior cell where they are', () => {
    const swimmer = game({ profile: 'v2', feetY: 3, groundY: 1, floor: null, depth: 2 });
    regroundAfterLoad(swimmer.game, 'v2');
    expect(swimmer.teleport).not.toHaveBeenCalled();
    const inside = game({ profile: 'v2', feetY: -200, groundY: 12, interior: true });
    regroundAfterLoad(inside.game, 'v1');
    expect(inside.teleport).not.toHaveBeenCalled();
  });

  it('falls back to the terrain height when no safe ground is found', () => {
    vi.mocked(findSafeGround).mockReturnValueOnce(null);
    const g = game({ profile: 'v2', feetY: 10, groundY: 12 });
    regroundAfterLoad(g.game, 'v1');
    expect(g.pos.y).toBeCloseTo(12.05, 6);
  });
});
