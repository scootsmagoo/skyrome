/** Building blocks for vignette scripts. */
import type { IdleLoop } from '../../actors/Actor';
import type { CrowdRoleId } from '../crowd/roles';
import type { Npc } from '../Npc';
import type { Cue, VignetteContext } from './types';

/** Walk a cast member to a point; resumes when there (or after `timeout` s). */
export function* walk(ctx: VignetteContext, npc: Npc, x: number, z: number, speed = npc.walkSpeed, timeout = 30): Generator<Cue, void, unknown> {
  npc.brain?.scriptGo(x, z, speed);
  const t0 = ctx.now;
  yield () => !!npc.brain?.arrived || npc.dead || ctx.now - t0 > timeout;
}

/** Send several cast members at once and wait for all of them. */
export function* walkAll(ctx: VignetteContext, moves: [Npc, number, number, number?][], timeout = 30): Generator<Cue, void, unknown> {
  for (const [n, x, z, s] of moves) n.brain?.scriptGo(x, z, s ?? n.walkSpeed);
  const t0 = ctx.now;
  yield () => moves.every(([n]) => !!n.brain?.arrived || n.dead || !n.brain?.npc.mover.active) || ctx.now - t0 > timeout;
}

export function stand(npc: Npc, loop: IdleLoop | null, face: number | null = null) {
  npc.brain?.scriptStand(loop, face);
}

/** Face another point. */
export function faceTo(npc: Npc, x: number, z: number) {
  return Math.atan2(x - npc.position.x, z - npc.position.z);
}

/** A walkable point within [minR, maxR] of the player, inside ±`cone` rad of the camera's view. */
export function anchorAhead(ctx: VignetteContext, minR: number, maxR: number, open = 1.5, cone = 0.9): { x: number; z: number } | null {
  const base = Math.atan2(ctx.look.x, ctx.look.z);
  for (let i = 0; i < 16; i++) {
    const a = base + (ctx.rng.next() - 0.5) * 2 * cone;
    const r = minR + ctx.rng.next() * (maxR - minR);
    const x = ctx.player.x + Math.sin(a) * r;
    const z = ctx.player.z + Math.cos(a) * r;
    const g = ctx.nav.grid;
    if (g && g.ready(x, z)) {
      if (!g.areaWalkable(x, z, open)) continue;
      return { x: (g.cellOf(x) + 0.5) * g.cell, z: (g.cellOf(z) + 0.5) * g.cell };
    }
    if (!g) return { x, z };
  }
  return null;
}

/** A walkable point near (x, z) at [minR, maxR] that the camera can't see (to spawn extras). */
export function hiddenPoint(ctx: VignetteContext, x: number, z: number, minR: number, maxR: number): { x: number; z: number } | null {
  let fallback: { x: number; z: number } | null = null;
  for (let i = 0; i < 20; i++) {
    const a = ctx.rng.next() * Math.PI * 2;
    const r = minR + ctx.rng.next() * (maxR - minR);
    const p = ctx.snap(x + Math.sin(a) * r, z + Math.cos(a) * r, 2);
    if (!p) continue;
    const y = ctx.floorY(p.x, p.z) ?? ctx.player.y;
    if (!ctx.isVisible(p.x, y + 1, p.z)) return p;
    if (!fallback || Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) > Math.hypot(fallback.x - ctx.player.x, fallback.z - ctx.player.z)) fallback = p;
  }
  return fallback;
}

/**
 * Get a performer: a free NPC near (x, z) matching `filter`, else a fresh `role` spawned out of
 * sight nearby. Cast automatically.
 */
export function recruit(ctx: VignetteContext, x: number, z: number, r: number, filter: (n: Npc) => boolean, role: CrowdRoleId): Npc | null {
  const n = ctx.free(x, z, r, filter)[0];
  if (n) return ctx.cast(n);
  const p = hiddenPoint(ctx, x, z, 12, 26);
  if (!p) return null;
  const s = ctx.spawn(role, p.x, p.z, Math.atan2(x - p.x, z - p.z));
  return s ? ctx.cast(s) : null;
}

/** Up to `n` onlookers near a point (only already-present NPCs: onlookers never pop in). */
export function onlookers(ctx: VignetteContext, x: number, z: number, r: number, n: number, filter?: (n: Npc) => boolean): Npc[] {
  return ctx
    .free(x, z, r, (c) => !c.role?.fragile || c.role.id === 'matron' || c.role.id === 'elder' || c.role.id === 'child')
    .filter((c) => !filter || filter(c))
    .slice(0, n)
    .map((c) => ctx.cast(c));
}

/** Points on an arc of radius r around (x, z), centred on heading `face` (toward the centre). */
export function arc(x: number, z: number, face: number, r: number, n: number, spread = 1.6): { x: number; z: number; face: number }[] {
  const out: { x: number; z: number; face: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = face + Math.PI + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
    const px = x + Math.sin(a) * r;
    const pz = z + Math.cos(a) * r;
    out.push({ x: px, z: pz, face: Math.atan2(x - px, z - pz) });
  }
  return out;
}
