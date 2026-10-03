/**
 * Civic and religious vignettes: a sacrifice before a temple, a senator's procession with his
 * clients, a crier (praeco) at the Rostra, idlers dicing on the basilica steps.
 */
import { makeAltar } from '../props';
import type { Npc } from '../Npc';
import { anchorAhead, arc, faceTo, hiddenPoint, onlookers, recruit, stand, walk, walkAll } from './kit';
import type { VignetteContext, VignetteDef } from './types';

/** A named NPC (content) near a point who is free to take part, if any. */
function namedNear(ctx: VignetteContext, id: string, x: number, z: number, r: number): Npc | null {
  const n = ctx.game.population?.get(id);
  if (!n || n.dead || n.talking || n.scripted || n.isFighting()) return null;
  return Math.hypot(n.position.x - x, n.position.z - z) <= r ? n : null;
}

// ---------------------------------------------------------------- sacrifice

export const sacrifice: VignetteDef = {
  id: 'sacrifice',
  when: 'day',
  weight: 2,
  cooldown: 240,
  plan(ctx) {
    // Prefer a temple forecourt near the player.
    for (const p of ctx.pois(ctx.player.x, ctx.player.z, 45, ['temple', 'shrine', 'vesta'])) {
      const s = ctx.snap(p.x - Math.sin(p.face) * 3, p.z - Math.cos(p.face) * 3, 3);
      if (s && (!ctx.nav.grid || ctx.nav.grid.areaWalkable(s.x, s.z, 2))) return { x: s.x, z: s.z, face: p.face, data: { place: p.name } };
    }
    const a = anchorAhead(ctx, 10, 20, 3);
    return a ? { x: a.x, z: a.z, face: Math.atan2(a.x - ctx.player.x, a.z - ctx.player.z) } : null;
  },
  *run(ctx, plan) {
    const fx = Math.sin(plan.face);
    const fz = Math.cos(plan.face);
    const { group: altar, flame } = makeAltar();
    const ay = ctx.floorY(plan.x, plan.z) ?? ctx.player.y;
    altar.position.set(plan.x, ay, plan.z);
    altar.rotation.y = plan.face;
    ctx.addObject(altar);
    const light = ctx.game.lights?.request({ position: { x: plan.x, y: ay + 1.2, z: plan.z }, intensity: 8, distance: 9, flicker: true });
    ctx.onEnd(() => light?.remove());
    flame.visible = false;
    const priest = recruit(ctx, plan.x, plan.z, 40, (n) => n.role?.id === 'priest', 'priest');
    const popa = priest && recruit(ctx, plan.x, plan.z, 30, (n) => n.role?.id === 'porter' || n.role?.id === 'artisan', 'artisan');
    if (!priest || !popa) return;
    popa.name = 'Victimarius';
    // Priest behind the altar facing the temple; assistant at his side.
    yield* walkAll(ctx, [
      [priest, plan.x - fx * 1.1, plan.z - fz * 1.1, 1.0],
      [popa, plan.x - fx * 0.6 + fz * 1.3, plan.z - fz * 0.6 - fx * 1.3, 1.1],
    ]);
    stand(priest, 'pray', plan.face);
    stand(popa, 'stand', faceTo(popa, plan.x, plan.z));
    flame.visible = true;
    ctx.say(priest, 'Favete linguis! Keep holy silence!');
    const crowd = onlookers(ctx, plan.x, plan.z, 22, 6, (n) => n !== priest && n !== popa);
    const ring = arc(plan.x - fx * 1.1, plan.z - fz * 1.1, plan.face, 4.2, crowd.length, 1.9);
    crowd.forEach((c, i) => c.brain?.scriptGo(ring[i].x, ring[i].z, 1.2));
    const music = ctx.game.audio?.loop?.('temple-music', { position: { x: plan.x, y: ay + 1, z: plan.z } });
    ctx.onEnd(() => music?.stop?.(2));
    yield 4;
    for (let i = 0; i < crowd.length; i++) stand(crowd[i], i % 3 === 0 ? 'pray' : 'stand', faceTo(crowd[i], plan.x, plan.z));
    ctx.say(priest, 'Iuppiter Optime Maxime, accept this wine and this incense, and be kind to the city of Rome.');
    yield 5;
    stand(popa, 'work', faceTo(popa, plan.x, plan.z));
    yield 3.5;
    stand(popa, 'stand', faceTo(popa, plan.x, plan.z));
    priest.humanoid.play('interact');
    yield 3;
    ctx.say(crowd[0] ?? popa, ctx.rng.pick(['The flame burns clear. A good omen.', 'Litatum est. The gods accept.', 'Did you see the smoke rise straight? Good.']));
    yield 5;
    for (const c of crowd) ctx.release(c);
    stand(priest, 'stand', plan.face + Math.PI);
    yield 4;
    flame.visible = false;
    yield 2;
  },
};

// ---------------------------------------------------------------- senator's procession

export const procession: VignetteDef = {
  id: 'procession',
  when: 'day',
  weight: 2,
  cooldown: 180,
  plan(ctx) {
    // Cross the player's view from one side to the other, ~12–20 m ahead.
    const a = anchorAhead(ctx, 12, 20, 2.5, 0.5);
    if (!a) return null;
    const side = Math.atan2(ctx.look.x, ctx.look.z) + Math.PI / 2;
    const sx = Math.sin(side);
    const sz = Math.cos(side);
    const from = ctx.snap(a.x - sx * 26, a.z - sz * 26, 5);
    const to = ctx.snap(a.x + sx * 26, a.z + sz * 26, 5);
    if (!from || !to) return null;
    return { x: a.x, z: a.z, face: side, data: { from, to } };
  },
  *run(ctx, plan) {
    const { from, to } = plan.data as { from: { x: number; z: number }; to: { x: number; z: number } };
    const start = hiddenPoint(ctx, from.x, from.z, 0, 8) ?? from;
    const lead = ctx.spawn('senator', start.x, start.z, Math.atan2(to.x - start.x, to.z - start.z));
    if (!lead) return;
    ctx.cast(lead);
    // The senator brings his own escort; top it up to a proper train of clients.
    const clients: Npc[] = [...lead.followers];
    for (let i = clients.length; i < 4; i++) {
      const c = ctx.spawn('client', start.x - Math.sin(plan.face) * (1.5 + i), start.z - Math.cos(plan.face) * (1.5 + i));
      if (!c) break;
      c.leader = lead;
      lead.followers.push(c);
      clients.push(c);
    }
    lead.brain?.scriptGo(plan.x, plan.z, 1.05);
    yield () => !!lead.brain?.arrived || Math.hypot(lead.position.x - plan.x, lead.position.z - plan.z) < 8;
    if (clients[0]) ctx.say(clients[0], ctx.rng.pick(['Make way! Make way for the senator!', 'Way there! Way for Gaius Calpurnius!', 'Stand aside, citizens!']));
    const gawker = ctx.free(lead.position.x, lead.position.z, 12, (n) => !!n.role?.gawks)[0];
    yield* walk(ctx, lead, to.x, to.z, 1.05, 40);
    if (gawker) ctx.say(gawker, ctx.rng.pick(['Another senator. Another dozen hangers-on.', 'Wonder what he wants from the Senate today.']));
    // Then they go on their way (the clients keep following him).
    yield 1;
  },
};

// ---------------------------------------------------------------- crier at the Rostra

const ANNOUNCEMENTS = [
  'Hear me, Quirites! By order of the aediles: no carts in the streets between sunrise and the tenth hour!',
  'Hear me! Games at the Ludus Magnus — twelve pairs, with venationes, on the coming market day!',
  'Lost, from the shop of Verus: a bronze pot! Sixty-five sesterces to whoever brings it back!',
  'Hear me, Quirites! The grain ships from Alexandria have reached Puteoli. The dole is assured!',
  'Hear me! Caesar\'s new forum stands open — his column will be dedicated with games and largesse!',
];

export const crier: VignetteDef = {
  id: 'crier',
  when: 'day',
  weight: 2,
  cooldown: 160,
  plan(ctx) {
    const r = ctx.pois(ctx.player.x, ctx.player.z, 50, ['rostra', 'monument', 'curia', 'forum'])[0];
    if (r) {
      const s = ctx.snap(r.x - Math.sin(r.face) * 2, r.z - Math.cos(r.face) * 2, 4);
      if (s) return { x: s.x, z: s.z, face: r.face + Math.PI };
    }
    const a = anchorAhead(ctx, 8, 18, 2.5);
    return a ? { x: a.x, z: a.z, face: Math.atan2(ctx.player.x - a.x, ctx.player.z - a.z) } : null;
  },
  *run(ctx, plan) {
    // Cerdo the praeco (docs/CONTENT.md §2.D) when he is about; otherwise any loud citizen.
    const cerdo = namedNear(ctx, 'npc-cerdo', plan.x, plan.z, 50);
    const praeco = cerdo ? ctx.cast(cerdo) : recruit(ctx, plan.x, plan.z, 30, (n) => n.role?.id === 'citizen' || n.role?.id === 'idler', 'citizen');
    if (!praeco) return;
    if (!cerdo) praeco.name = 'Crier';
    yield* walk(ctx, praeco, plan.x, plan.z, 1.4);
    stand(praeco, 'talk', plan.face);
    const listeners = onlookers(ctx, plan.x, plan.z, 20, 7, (n) => n !== praeco);
    const ring = arc(plan.x, plan.z, plan.face + Math.PI, 4.5, listeners.length, 1.6);
    listeners.forEach((l, i) => l.brain?.scriptGo(ring[i].x, ring[i].z, 1.3));
    const lines = ctx.rng.shuffle([...ANNOUNCEMENTS]).slice(0, 2);
    ctx.say(praeco, lines[0]);
    yield 5;
    for (const l of listeners) stand(l, 'stand', faceTo(l, plan.x, plan.z));
    ctx.say(praeco, lines[1]);
    yield 5.5;
    for (let i = 0; i < listeners.length; i++) if (i % 2 === 0) stand(listeners[i], 'cheer', faceTo(listeners[i], plan.x, plan.z));
    if (listeners[0]) ctx.say(listeners[0], ctx.rng.pick(['Io! Io!', 'About time!', 'Games! Did you hear that?']));
    yield 4;
    for (const l of listeners) ctx.release(l);
    yield 2;
  },
};

// ---------------------------------------------------------------- dice on the steps

export const dice: VignetteDef = {
  id: 'dice',
  when: 'day',
  weight: 2,
  cooldown: 200,
  plan(ctx) {
    const s = ctx.pois(ctx.player.x, ctx.player.z, 40, 'steps')[0];
    if (s) {
      const p = ctx.snap(s.x - Math.sin(s.face) * 2.5, s.z - Math.cos(s.face) * 2.5, 3);
      if (p) return { x: p.x, z: p.z, face: s.face };
    }
    const a = anchorAhead(ctx, 7, 16, 2);
    return a ? { x: a.x, z: a.z, face: 0 } : null;
  },
  *run(ctx, plan) {
    const players: Npc[] = [];
    for (let i = 0; i < 3; i++) {
      const p = recruit(ctx, plan.x, plan.z, 30, (n) => (n.role?.id === 'idler' || n.role?.id === 'citizen' || n.role?.id === 'artisan') && !players.includes(n), 'idler');
      if (p) players.push(p);
    }
    if (players.length < 2) return;
    const seats = arc(plan.x, plan.z, ctx.rng.next() * Math.PI * 2, 0.75, players.length, Math.PI * 2 * (1 - 1 / players.length));
    yield* walkAll(ctx, players.map((p, i) => [p, seats[i].x, seats[i].z, 1.2] as [Npc, number, number, number]));
    players.forEach((p, i) => stand(p, 'sitGround', seats[i].face));
    yield 3;
    for (let round = 0; round < 3; round++) {
      const thrower = players[round % players.length];
      thrower.humanoid.play('throw');
      yield 1.2;
      if (round === 1) {
        stand(thrower, 'cheer', null);
        ctx.say(thrower, 'Venus! The throw of Venus! Pay up!');
      } else ctx.say(thrower, ctx.rng.pick(['The dog again! Curse these bones.', 'Senio. Not bad, not good.', 'Your throw. And no loaded tali this time.']));
      yield 3.5;
      stand(thrower, 'sitGround', null);
    }
    // Gambling is for the Saturnalia: everyone scatters when the aediles' man (Dento) or a soldier walks by.
    const dento = namedNear(ctx, 'npc-dento', plan.x, plan.z, 45);
    const law = dento ?? ctx.free(plan.x, plan.z, 30, (n) => !!n.role?.guard)[0];
    if (law) {
      ctx.say(players[0], dento ? 'Dento! The aediles\' man! Hide the bones!' : 'Quick, the cohort! Hide the bones!');
      yield 0.8;
      for (const p of players) {
        const dx = p.position.x - law.position.x;
        const dz = p.position.z - law.position.z;
        const d = Math.hypot(dx, dz) || 1;
        p.brain?.scriptGo(p.position.x + (dx / d) * 9, p.position.z + (dz / d) * 9, 2.6);
      }
      yield 3;
    }
    yield 2;
  },
};
