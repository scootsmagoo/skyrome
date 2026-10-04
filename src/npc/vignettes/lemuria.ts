/**
 * The Lemuria (9, 11 and 13 May; docs/CONTENT.md §8.3.1): at midnight the head of the house throws
 * black beans over his shoulder for the hungry dead (Ovid, Fasti 5.429–44), and after nightfall a
 * figure in a brown paenula is glimpsed at the edge of vision — never confirmed (GDD §2.4).
 */
import { randomAppearance } from '../../actors/avatar/variants';
import { Rng } from '../../core/Rng';
import { recruit, stand, walk } from './kit';
import type { VignetteDef } from './types';

/** `vig-fabae`: a paterfamilias at his door throws beans for the dead. */
export const fabae: VignetteDef = {
  id: 'fabae',
  when: 'night',
  weight: 4,
  cooldown: 240,
  plan(ctx) {
    if (!ctx.lemuria) return null;
    // A doorway or a wall within 10–25 m.
    const base = Math.atan2(ctx.look.x, ctx.look.z);
    const py = ctx.floorY(ctx.player.x, ctx.player.z) ?? ctx.player.y;
    for (let i = 0; i < 12; i++) {
      const a = base + (ctx.rng.next() - 0.5) * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const hit = ctx.wallProbe(ctx.player.x, py + 1.2, ctx.player.z, dx, dz, 25);
      if (!hit || hit.dist < 8) continue;
      const p = ctx.snap(ctx.player.x + dx * (hit.dist - 0.6), ctx.player.z + dz * (hit.dist - 0.6), 1.5);
      if (p) return { x: p.x, z: p.z, face: Math.atan2(hit.nx, hit.nz) };
    }
    return null;
  },
  *run(ctx, plan) {
    const pater = recruit(ctx, plan.x, plan.z, 30, (n) => n.role?.id === 'citizen' || n.role?.id === 'elder', 'elder');
    if (!pater) return;
    pater.name = 'Paterfamilias';
    yield* walk(ctx, pater, plan.x, plan.z, 0.9, 25);
    // He faces away from his door and never looks back.
    stand(pater, 'pray', plan.face);
    ctx.say(pater, 'Haec ego mitto; his redimo meque meosque fabis. — These I cast; with these beans I redeem me and mine.');
    yield 4;
    for (let i = 0; i < 3; i++) {
      pater.humanoid.play('throw');
      yield 1.6;
    }
    ctx.say(pater, 'Nine times, and not one look behind me. Not one.');
    yield 3;
    ctx.sfx('clash.metal', pater.position);
    ctx.say(pater, 'Manes exite paterni! — Shades of my fathers, go out!');
    yield 3;
    stand(pater, 'stand', plan.face);
    yield 2;
  },
};

/** `vig-lemuria-umbra`: the ghost-glimpse. Gone when looked at directly or approached. */
export const umbra: VignetteDef = {
  id: 'umbra',
  when: 'night',
  weight: 6,
  cooldown: 600,
  plan(ctx) {
    if (!ctx.lemuria) return null;
    // At the edge of vision, 22–40 m away.
    const base = Math.atan2(ctx.look.x, ctx.look.z);
    for (let i = 0; i < 16; i++) {
      const side = ctx.rng.chance(0.5) ? 1 : -1;
      const a = base + side * (0.55 + ctx.rng.next() * 0.25);
      const d = 22 + ctx.rng.next() * 18;
      const p = ctx.snap(ctx.player.x + Math.sin(a) * d, ctx.player.z + Math.cos(a) * d, 2);
      if (!p) continue;
      const y = ctx.floorY(p.x, p.z) ?? ctx.player.y;
      if (!ctx.isVisible(p.x, y + 1.2, p.z)) continue;
      return { x: p.x, z: p.z, face: Math.atan2(ctx.player.x - p.x, ctx.player.z - p.z) };
    }
    return null;
  },
  *run(ctx, plan) {
    // Brown paenula, hood up: there are plenty of those in the Velabrum (a natural lead).
    const app = randomAppearance(new Rng('umbra'), 'plebeian-man');
    const look = { ...app, garments: [{ kind: 'tunica' as const, color: '#5b4a3a' }, { kind: 'paenula' as const, color: '#4e3f31' }], hair: { style: 'veiled' as const, color: '#3a2a1d' } };
    const ghost = ctx.spawn('citizen', plan.x, plan.z, plan.face, { appearance: look, escorts: false });
    if (!ghost) return;
    ctx.cast(ghost);
    ghost.name = '…';
    stand(ghost, 'stand', plan.face);
    ctx.sfx('cloth.rustle', ghost.position);
    const t0 = ctx.now;
    // Gone after two seconds, or the moment the player looks straight at it or comes close.
    yield () => {
      const dx = ghost.position.x - ctx.player.x;
      const dz = ghost.position.z - ctx.player.z;
      const d = Math.hypot(dx, dz) || 1;
      const direct = (dx * ctx.look.x + dz * ctx.look.z) / d > 0.97;
      return ctx.now - t0 > 2 || direct || d < 15;
    };
    ctx.vanish(ghost);
  },
};
