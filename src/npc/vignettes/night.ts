/**
 * Night vignettes: a drunk staggering home with a torch, and a rich man walking back from dinner
 * between torch-bearing slaves (Juvenal 3.283–5: "he keeps well clear of the man in scarlet with
 * his long train of attendants, the many torches and the bronze lamp").
 */
import type { Npc } from '../Npc';
import { anchorAhead, faceTo, hiddenPoint, recruit, stand, walk } from './kit';
import type { VignetteDef } from './types';

export const drunk: VignetteDef = {
  id: 'drunk',
  when: 'night',
  weight: 3,
  cooldown: 120,
  plan(ctx) {
    const a = anchorAhead(ctx, 8, 18, 2);
    return a ? { x: a.x, z: a.z, face: 0 } : null;
  },
  *run(ctx, plan) {
    const d = recruit(ctx, plan.x, plan.z, 30, (n) => n.role?.id === 'reveler', 'reveler');
    if (!d) return;
    d.name = 'Drunkard';
    yield* walk(ctx, d, plan.x, plan.z, 0.9, 25);
    stand(d, 'drunk', faceTo(d, ctx.player.x, ctx.player.z));
    ctx.say(d, ctx.rng.pick(['Bene sit tibi! Bene sit… everyone!', 'Hic! To the Greens! To the… which one was it?', 'One more cup. Just one. The innkeeper said so.']));
    yield 4;
    if (Math.hypot(ctx.player.x - d.position.x, ctx.player.z - d.position.z) < 9) {
      ctx.say(d, 'You! Where are you from? Whose sour wine and beans are you full of?');
      yield 3.5;
    }
    // Wander off in a zig-zag.
    for (let i = 0; i < 3; i++) {
      const p = ctx.snap(d.position.x + (ctx.rng.next() - 0.5) * 8, d.position.z + (ctx.rng.next() - 0.5) * 8, 3);
      if (p) yield* walk(ctx, d, p.x, p.z, 0.8, 8);
      stand(d, 'drunk', null);
      yield 1.5 + ctx.rng.next() * 2;
    }
    ctx.say(d, 'Manes exite paterni! Ghosts of my fathers, out! …Is that how it goes?');
    yield 3;
  },
};

export const torchlitReturn: VignetteDef = {
  id: 'cena-return',
  when: 'night',
  weight: 2,
  cooldown: 200,
  plan(ctx) {
    const a = anchorAhead(ctx, 12, 22, 2.5, 0.5);
    if (!a) return null;
    const side = Math.atan2(ctx.look.x, ctx.look.z) + Math.PI / 2;
    const from = ctx.snap(a.x - Math.sin(side) * 24, a.z - Math.cos(side) * 24, 5);
    const to = ctx.snap(a.x + Math.sin(side) * 24, a.z + Math.cos(side) * 24, 5);
    if (!from || !to) return null;
    return { x: a.x, z: a.z, face: side, data: { from, to } };
  },
  *run(ctx, plan) {
    const { from, to } = plan.data as { from: { x: number; z: number }; to: { x: number; z: number } };
    const start = hiddenPoint(ctx, from.x, from.z, 0, 8) ?? from;
    const lead = ctx.spawn('senator', start.x, start.z, Math.atan2(to.x - start.x, to.z - start.z));
    if (!lead) return;
    ctx.cast(lead);
    const train: Npc[] = [...lead.followers];
    for (let i = 0; i < 2; i++) {
      const t = ctx.spawn('torchbearer', start.x - Math.sin(plan.face) * (1 + i), start.z - Math.cos(plan.face) * (1 + i));
      if (!t) break;
      t.leader = lead;
      // Torch-bearers walk in front: put them first in the formation.
      lead.followers.unshift(t);
      train.push(t);
    }
    lead.brain?.scriptGo(to.x, to.z, 1.0);
    yield () => Math.hypot(lead.position.x - plan.x, lead.position.z - plan.z) < 9 || !!lead.brain?.arrived;
    const tb = train.find((t) => t.role?.id === 'torchbearer');
    if (tb) ctx.say(tb, 'Make way! Light for the master!');
    yield () => !!lead.brain?.arrived;
    yield 1;
  },
};

export const vigilesRound: VignetteDef = {
  id: 'vigiles',
  when: 'night',
  weight: 2,
  cooldown: 150,
  plan(ctx) {
    const a = anchorAhead(ctx, 8, 18, 2);
    return a ? { x: a.x, z: a.z, face: 0 } : null;
  },
  *run(ctx, plan) {
    const v = recruit(ctx, plan.x, plan.z, 45, (n) => n.role?.id === 'vigil', 'vigil');
    if (!v) return;
    const spot = hiddenPoint(ctx, plan.x, plan.z, 2, 6) ?? plan;
    yield* walk(ctx, v, spot.x, spot.z, 1.3, 25);
    stand(v, 'guard', faceTo(v, ctx.player.x, ctx.player.z));
    const near = Math.hypot(ctx.player.x - v.position.x, ctx.player.z - v.position.z) < 12;
    ctx.say(v, near ? ctx.rng.pick(['Who goes there? Show your face.', 'Late to be out, citizen. Keep to the lit streets.']) : ctx.rng.pick(['Smoke? No — someone\'s supper.', 'All quiet. Fourth watch soon.']));
    yield 4;
    ctx.say(v, 'Mind your lamps tonight — no fires!');
    yield 3;
  },
};
