/**
 * Street vignettes: a scuffle, a dog stealing a sausage, a pot thrown from a window, a thief
 * running through the crowd, a hawker with a tray.
 */
import * as THREE from 'three';
import { Quadruped, makePot, makeSausage, makeShards } from '../props';
import type { Npc } from '../Npc';
import { anchorAhead, arc, faceTo, hiddenPoint, onlookers, recruit, stand, walk, walkAll } from './kit';
import type { Cue, VignetteContext, VignetteDef } from './types';

const BRAWLERS = new Set(['citizen', 'artisan', 'porter', 'idler', 'reveler', 'foreigner']);
const isBrawler = (n: Npc) => !!n.role && BRAWLERS.has(n.role.id) && n.humanoid.appearance.sex === 'male';
const isGuard = (n: Npc) => !!n.role?.guard;

// ---------------------------------------------------------------- scuffle (Juvenal 3.278–301)

const INSULTS_A = ['Where are you from? Whose sour wine and beans are you full of?', 'You stepped on my foot, furcifer!', 'That\'s my place in the line, asine!', 'Say that about the Greens again. Go on.'];
const INSULTS_B = ['Abi in malam crucem! Go hang yourself!', 'Who are you calling a donkey, caudex?', 'Vappa! You flat-wine nobody!', 'Di te perdant! I\'ll knock your teeth in!'];

export const scuffle: VignetteDef = {
  id: 'scuffle',
  when: 'any',
  weight: 3,
  cooldown: 90,
  plan(ctx) {
    const a = anchorAhead(ctx, 9, 20, 2.5);
    return a ? { x: a.x, z: a.z, face: 0 } : null;
  },
  *run(ctx, plan) {
    const a = recruit(ctx, plan.x, plan.z, 30, isBrawler, 'citizen');
    const b = a && recruit(ctx, plan.x, plan.z, 30, (n) => n !== a && isBrawler(n), 'artisan');
    if (!a || !b) return;
    const side = ctx.rng.next() * Math.PI;
    const sx = Math.cos(side) * 0.75;
    const sz = Math.sin(side) * 0.75;
    yield* walkAll(ctx, [
      [a, plan.x - sx, plan.z - sz, 1.5],
      [b, plan.x + sx, plan.z + sz, 1.5],
    ]);
    stand(a, 'talk', faceTo(a, b.position.x, b.position.z));
    stand(b, 'talk', faceTo(b, a.position.x, a.position.z));
    ctx.say(a, ctx.rng.pick(INSULTS_A));
    yield 2.6;
    ctx.say(b, ctx.rng.pick(INSULTS_B));
    // A few people stop to watch.
    const watchers = onlookers(ctx, plan.x, plan.z, 18, 5, (n) => n !== a && n !== b);
    const ring = arc(plan.x, plan.z, ctx.rng.next() * Math.PI * 2, 4.5, Math.max(1, watchers.length), Math.PI * 1.6);
    watchers.forEach((w, i) => w.brain?.scriptGo(ring[i].x, ring[i].z, 1.6));
    yield 2.2;
    a.humanoid.play('attackLight1');
    yield 0.35;
    b.humanoid.play('hitFront');
    if (watchers[0]) ctx.say(watchers[0], 'A fight! A fight!');
    for (const w of watchers) stand(w, 'cheer', faceTo(w, plan.x, plan.z));
    yield 1.4;
    b.humanoid.play('attackLight2');
    yield 0.35;
    a.humanoid.play('stagger');
    yield 1.6;
    const guard = ctx.free(plan.x, plan.z, 45, isGuard)[0];
    if (guard) {
      ctx.cast(guard);
      ctx.say(guard, 'Halt! Break it up, in the name of the Prefect!');
      yield* walk(ctx, guard, plan.x + sx * 3, plan.z + sz * 3, 3.6, 12);
      stand(guard, 'guard', faceTo(guard, plan.x, plan.z));
      ctx.say(a, 'He started it!');
      yield 1.8;
      ctx.say(guard, 'Move along, the both of you. Now.');
      yield 1.2;
    } else {
      a.humanoid.play('attackLight3');
      yield 0.4;
      b.humanoid.play('knockdown');
      ctx.say(watchers[1] ?? a, 'Habet! Down he goes!');
      yield 3.2;
    }
    // Part ways.
    a.brain?.scriptGo(plan.x - sx * 16, plan.z - sz * 16, 1.4);
    b.brain?.scriptGo(plan.x + sx * 16, plan.z + sz * 16, 1.2);
    for (const w of watchers) ctx.release(w);
    yield 6;
  },
};

// ---------------------------------------------------------------- dog and sausage

export const dogSausage: VignetteDef = {
  id: 'dog',
  when: 'day',
  weight: 2,
  cooldown: 150,
  plan(ctx) {
    const a = anchorAhead(ctx, 8, 18, 2);
    return a ? { x: a.x, z: a.z, face: 0 } : null;
  },
  *run(ctx, plan) {
    const seller = recruit(ctx, plan.x, plan.z, 25, (n) => n.role?.id === 'merchant', 'merchant');
    if (!seller) return;
    yield* walk(ctx, seller, plan.x, plan.z, 1.4);
    stand(seller, 'stand', faceTo(seller, ctx.player.x, ctx.player.z));
    ctx.say(seller, 'Sausages! Hot sausages! An as apiece!');
    // The dog comes from out of sight.
    const start = hiddenPoint(ctx, plan.x, plan.z, 14, 22);
    if (!start) return;
    const dog = new Quadruped('dog');
    const y0 = ctx.floorY(start.x, start.z) ?? ctx.player.y;
    dog.root.position.set(start.x, y0, start.z);
    ctx.addObject(dog.root);
    const sausage = makeSausage();
    const tray = new THREE.Vector3();
    const hand = seller.humanoid.getSocket('handR');
    hand.add(sausage);
    ctx.onEnd(() => sausage.removeFromParent());
    yield* runDog(ctx, dog, () => {
      seller.humanoid.getSocket('chest').getWorldPosition(tray);
      return { x: seller.position.x + Math.sin(seller.heading) * 0.6, z: seller.position.z + Math.cos(seller.heading) * 0.6 };
    }, 2.2, 20);
    // Snatch!
    dog.mouth.add(sausage);
    sausage.position.set(0, 0, 0);
    seller.humanoid.play('hitFront');
    ctx.say(seller, 'Hey! Stop that dog! My sausage!');
    const away = { x: dog.root.position.x + (dog.root.position.x - seller.position.x) * 8, z: dog.root.position.z + (dog.root.position.z - seller.position.z) * 8 };
    const flee = ctx.snap(away.x, away.z, 6) ?? away;
    seller.brain?.scriptGo(flee.x, flee.z, 3.4);
    const bystander = ctx.free(plan.x, plan.z, 15, (n) => !!n.role?.gawks)[0];
    yield* runDog(ctx, dog, () => flee, 6.5, 6);
    if (bystander) ctx.say(bystander, 'Ha! That dog eats better than I do.');
    seller.brain?.scriptStand('talk', null);
    yield 1;
    ctx.say(seller, 'Di te perdant, cur! Every day the same dog!');
    yield* runDog(ctx, dog, () => ({ x: flee.x + (flee.x - plan.x), z: flee.z + (flee.z - plan.z) }), 6.5, 5);
    yield 2;
  },
};

/** Move a quadruped toward a (moving) target at a speed until close or out of time. */
export function* runDog(ctx: VignetteContext, q: Quadruped, target: () => { x: number; z: number }, speed: number, timeout: number): Generator<Cue, void, unknown> {
  const t0 = ctx.now;
  for (;;) {
    const t = target();
    const p = q.root.position;
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5 || ctx.now - t0 > timeout) {
      q.animate(ctx.dt, 0);
      return;
    }
    const step = Math.min(d, speed * ctx.dt);
    let nx = p.x + (dx / d) * step;
    let nz = p.z + (dz / d) * step;
    const g = ctx.nav.grid;
    if (g && g.ready(nx, nz) && !g.walkable(nx, nz)) {
      // Slide along whichever axis is free.
      if (g.walkable(nx, p.z)) nz = p.z;
      else if (g.walkable(p.x, nz)) nx = p.x;
      else {
        nx = p.x;
        nz = p.z;
      }
    }
    const y = ctx.floorY(nx, nz);
    p.set(nx, y ?? p.y, nz);
    q.root.rotation.y = Math.atan2(dx, dz);
    q.animate(ctx.dt, speed);
    yield 0;
  }
}

// ---------------------------------------------------------------- pot from a window (Juvenal 3.268–77)

export const fallingPot: VignetteDef = {
  id: 'pot',
  when: 'any',
  weight: 2,
  cooldown: 200,
  plan(ctx) {
    // A tall wall within a few metres of the player.
    const base = Math.atan2(ctx.look.x, ctx.look.z);
    const py = ctx.floorY(ctx.player.x, ctx.player.z) ?? ctx.player.y;
    for (let i = 0; i < 10; i++) {
      const a = base + (i / 10 - 0.5) * 2.4;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const hit = ctx.wallProbe(ctx.player.x, py + 1.5, ctx.player.z, dx, dz, 12);
      if (!hit || hit.dist < 3) continue;
      const hi = ctx.wallProbe(ctx.player.x, py + 7.5, ctx.player.z, dx, dz, hit.dist + 1.5);
      if (!hi || Math.abs(hi.dist - hit.dist) > 1.2) continue;
      // Land between the player and the wall, a little to the side.
      const land = Math.max(1.6, Math.min(hit.dist - 0.8, 3.5));
      const x = ctx.player.x + dx * land + dz * 0.8;
      const z = ctx.player.z + dz * land - dx * 0.8;
      return { x, z, face: a, data: { wx: ctx.player.x + dx * (hit.dist - 0.35), wz: ctx.player.z + dz * (hit.dist - 0.35), top: py + 8.5 } };
    }
    return null;
  },
  *run(ctx, plan) {
    const d = plan.data as { wx: number; wz: number; top: number };
    const pot = makePot();
    pot.position.set(d.wx, d.top, d.wz);
    ctx.addObject(pot);
    const ground = ctx.floorY(plan.x, plan.z) ?? ctx.player.y;
    ctx.say('A voice from above', ctx.rng.pick(['Cave! Below!', 'Out of the way down there!', '…']));
    let vy = 0;
    const vx = (plan.x - d.wx) / 1.25;
    const vz = (plan.z - d.wz) / 1.25;
    while (pot.position.y > ground + 0.12) {
      vy -= 9.81 * ctx.dt;
      pot.position.x += vx * ctx.dt;
      pot.position.z += vz * ctx.dt;
      pot.position.y += vy * ctx.dt;
      pot.rotation.x += ctx.dt * 4;
      pot.rotation.z += ctx.dt * 2.5;
      yield 0;
    }
    pot.removeFromParent();
    ctx.sfx('lock.break', { x: plan.x, y: ground, z: plan.z });
    const n = 9;
    const shards = makeShards(n);
    ctx.addObject(shards);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const parts = Array.from({ length: n }, () => ({
      p: new THREE.Vector3(plan.x, ground + 0.1, plan.z),
      v: new THREE.Vector3((ctx.rng.next() - 0.5) * 4, 1.5 + ctx.rng.next() * 2, (ctx.rng.next() - 0.5) * 4),
      r: new THREE.Euler(ctx.rng.next() * 3, ctx.rng.next() * 3, 0),
    }));
    // Everyone near flinches; someone shouts up at the window.
    const near = ctx.free(plan.x, plan.z, 7);
    for (const c of near.slice(0, 3)) c.humanoid.play('hitBack');
    const t0 = ctx.now;
    while (ctx.now - t0 < 0.9) {
      for (let i = 0; i < n; i++) {
        const pt = parts[i];
        pt.v.y -= 9.81 * ctx.dt;
        pt.p.addScaledVector(pt.v, ctx.dt);
        if (pt.p.y < ground + 0.01) {
          pt.p.y = ground + 0.01;
          pt.v.set(pt.v.x * 0.4, 0, pt.v.z * 0.4);
        }
        m.compose(pt.p, q.setFromEuler(pt.r), s);
        shards.setMatrixAt(i, m);
      }
      shards.instanceMatrix.needsUpdate = true;
      yield 0;
    }
    const shouter = near[0] ?? ctx.free(plan.x, plan.z, 14)[0];
    if (shouter) ctx.say(shouter, ctx.rng.pick(['Make your will before you go out to dinner, friend!', 'Di immortales! You nearly killed us!', 'Vae tibi! Woe to you up there!']));
    else ctx.say('A voice from above', 'Sorry!');
    yield 12;
  },
};

// ---------------------------------------------------------------- thief (Fur!)

export const thief: VignetteDef = {
  id: 'thief',
  when: 'day',
  weight: 2,
  cooldown: 160,
  plan(ctx) {
    const a = anchorAhead(ctx, 10, 22, 1.5);
    return a ? { x: a.x, z: a.z, face: 0 } : null;
  },
  *run(ctx, plan) {
    const victim = recruit(ctx, plan.x, plan.z, 25, (n) => n.role?.id === 'merchant' || n.role?.id === 'matron' || n.role?.id === 'senator', 'merchant');
    if (!victim) return;
    const start = hiddenPoint(ctx, plan.x, plan.z, 4, 10) ?? plan;
    const fur = ctx.spawn('citizen', start.x, start.z);
    if (!fur) return;
    ctx.cast(fur);
    fur.name = 'Thief';
    yield* walkAll(ctx, [
      [victim, plan.x, plan.z, 1.3],
      [fur, plan.x + 1, plan.z + 0.5, 1.3],
    ], 15);
    fur.humanoid.play('pickup');
    yield 0.8;
    // Run off through the crowd, away from the player.
    const dx = plan.x - ctx.player.x;
    const dz = plan.z - ctx.player.z;
    const d = Math.hypot(dx, dz) || 1;
    const far = ctx.snap(plan.x + (dx / d) * 40 + (-dz / d) * 10, plan.z + (dz / d) * 40 + (dx / d) * 10, 8) ?? { x: plan.x + (dx / d) * 40, z: plan.z + (dz / d) * 40 };
    fur.brain?.scriptGo(far.x, far.z, 5.2);
    ctx.say(victim, 'Fur! Fur! Stop, thief! My purse!');
    victim.humanoid.play('hitFront');
    yield 1;
    victim.brain?.scriptGo(far.x, far.z, 3.2);
    const guard = ctx.free(plan.x, plan.z, 40, isGuard)[0];
    if (guard) {
      ctx.cast(guard);
      ctx.say(guard, 'Hold there! You!');
      guard.brain?.scriptGo(far.x, far.z, 4.6);
    }
    yield 4;
    victim.brain?.scriptStand('talk', null);
    ctx.say(victim, ctx.rng.pick(['Gone. Gods curse him, gone.', 'Homo trium litterarum! A man of three letters — F, U, R!']));
    yield 6;
  },
};

// ---------------------------------------------------------------- hawker

export const hawker: VignetteDef = {
  id: 'hawker',
  when: 'day',
  weight: 3,
  cooldown: 70,
  plan(ctx) {
    const a = anchorAhead(ctx, 6, 16, 1.5);
    return a ? { x: a.x, z: a.z, face: 0 } : null;
  },
  *run(ctx, plan) {
    const v = recruit(ctx, plan.x, plan.z, 30, (n) => n.role?.id === 'merchant' && n.prop?.kind === 'tray', 'merchant');
    if (!v) return;
    v.name = 'Hawker';
    yield* walk(ctx, v, plan.x, plan.z, 1.3);
    stand(v, 'talk', faceTo(v, ctx.player.x, ctx.player.z));
    ctx.say(v, ctx.rng.pick(['Hot chickpeas! Lupins! An as a handful!', 'Fresh bread, still warm!', 'Figs from Tusculum! Sweet as honey!', 'Sulphur matches! Who needs a light?']));
    ctx.sfx('amb.calls', v.position);
    const buyers = ctx.free(plan.x, plan.z, 16, (n) => n.role?.id !== 'senator' && n.role?.id !== 'vestal').slice(0, 2).map((b) => ctx.cast(b));
    const spots = arc(plan.x, plan.z, v.heading, 1.2, buyers.length, 1.4);
    buyers.forEach((b, i) => b.brain?.scriptGo(spots[i].x, spots[i].z, 1.2));
    yield 6;
    for (const b of buyers) {
      stand(b, 'stand', faceTo(b, v.position.x, v.position.z));
      b.humanoid.play('interact');
    }
    if (buyers[0]) ctx.say(buyers[0], ctx.rng.pick(['Two handfuls. And don\'t give me the burnt ones.', 'An as? Robbery. Here.']));
    yield 3;
    v.humanoid.play('interact');
    ctx.sfx('coin.clink', v.position);
    yield 2;
    for (const b of buyers) ctx.release(b);
    ctx.say(v, 'Gratias! Come back tomorrow!');
    yield 3;
  },
};
