/**
 * Street vignettes: a scuffle, a dog stealing a sausage, a pot thrown from a window, a thief
 * running through the crowd (catchable once the opening is done: "Fur!"), a hawker with a tray
 * the player can buy from.
 */
import * as THREE from 'three';
import type { Interactable } from '../../interaction/Interactions';
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
      // A first-floor window: the wall must still be there 5 m up.
      const hi = ctx.wallProbe(ctx.player.x, py + 5, ctx.player.z, dx, dz, hit.dist + 1.5);
      if (!hi || Math.abs(hi.dist - hit.dist) > 1.2) continue;
      // Land between the player and the wall, a little to the side.
      const land = Math.max(1.6, Math.min(hit.dist - 0.8, 3.5));
      const x = ctx.player.x + dx * land + dz * 0.8;
      const z = ctx.player.z + dz * land - dx * 0.8;
      return { x, z, face: a, data: { wx: ctx.player.x + dx * (hit.dist - 0.35), wz: ctx.player.z + dz * (hit.dist - 0.35), top: py + 6 } };
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

/** The opening (mq-01-madida-capena): before it is done a thief can't be caught (STORY rule 2). */
const OPENING = 'mq-01-madida-capena';
/** Close enough to grab the thief (m); a swing at him lands within this (m), roughly in front. */
const CATCH_R = 1.7;
const SWING_R = 2.4;
/** Walk this far from the victim with the purse and it's kept (m). */
const KEEP_R = 25;

/**
 * A thief snatches a purse and runs (world-life §4.9 "Fur!"). Once the opening is done he can be
 * caught: close in on him, or swing at him, and he goes down on one knee (the yield pose) and gives
 * the purse up — E on him takes it. Returning it to the victim (E on them) earns 2–6 asses and Fama
 * +1 with the plebs; walking off with it is theft (furtum) if anyone sees. The thief is out of the
 * combat module's reach (`staged`, as a tableau's figures are): the blow that catches him isn't an
 * assault on a passer-by. Before the opening he simply gets away, as he always did.
 */
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
    const catchable = !!ctx.game.quests?.status(OPENING)?.done;
    let swung = false;
    if (catchable) {
      const staged = fur as Npc & { staged?: boolean };
      staged.staged = true;
      ctx.onEnd(() => {
        staged.staged = false;
      });
      // The player's swing at him (the combat module can't strike a staged figure: this is the hit).
      const off = ctx.game.events.on('combat:swing', (e) => {
        const p = ctx.game.player;
        if (!p || e.attackerId !== p.id) return;
        const dx = fur.position.x - p.position.x;
        const dz = fur.position.z - p.position.z;
        if (Math.hypot(dx, dz) <= SWING_R + e.reach && Math.cos(Math.atan2(dx, dz) - p.heading) > 0.5) swung = true;
      });
      ctx.onEnd(off);
    }
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
    // From the first stride he can be caught (after the opening): grabbed, or a swing at him (a
    // swing before he stole anything doesn't count).
    swung = false;
    const caught = () => catchable && (swung || near(ctx, fur, CATCH_R));
    const t0 = ctx.now;
    yield () => caught() || ctx.now - t0 > 1;
    const guard = ctx.free(plan.x, plan.z, 40, isGuard)[0];
    if (!caught()) {
      victim.brain?.scriptGo(far.x, far.z, 3.2);
      if (guard) {
        ctx.cast(guard);
        ctx.say(guard, 'Hold there! You!');
        guard.brain?.scriptGo(far.x, far.z, 4.6);
      }
    } else if (guard) ctx.cast(guard);
    if (!catchable) {
      yield 4;
      victim.brain?.scriptStand('talk', null);
      ctx.say(victim, ctx.rng.pick(GONE));
      yield 6;
      return;
    }
    yield () => caught() || !!fur.brain?.arrived || ctx.now - t0 > 15;
    if (!caught()) {
      // He got away.
      victim.brain?.scriptStand('talk', null);
      ctx.say(victim, ctx.rng.pick(GONE));
      yield 6;
      return;
    }
    yield* purseBack(ctx, fur, victim, guard);
  },
};

const GONE = ['Gone. Gods curse him, gone.', 'Homo trium litterarum! A man of three letters — F, U, R!'];

/** The thief is caught: he gives up the purse, and the player gives it back or keeps it. */
function* purseBack(ctx: VignetteContext, fur: Npc, victim: Npc, guard: Npc | undefined): Generator<Cue, void, unknown> {
  const g = ctx.game;
  const ia = g.interactions;
  const toPlayer = (n: Npc) => faceTo(n, ctx.player.x, ctx.player.z);
  stand(fur, null, toPlayer(fur));
  fur.humanoid.play('yield');
  ctx.say(fur, ctx.rng.pick(['Mercy! Take it, take it, it’s all there!', 'Don’t hit me! Here! Here’s the purse!', 'All right! All right! I only found it!']));
  if (guard) guard.brain?.scriptGo(fur.position.x + 1.4, fur.position.z, 4.6);
  victim.brain?.scriptGo(fur.position.x - 1.6, fur.position.z + 0.6, 3.2);
  // E on the kneeling thief: take back the purse.
  let taken = false;
  const at = new THREE.Vector3();
  const take: Interactable = {
    id: 'fur:purse',
    position: () => at.set(fur.position.x, fur.position.y + 0.7, fur.position.z),
    reach: 2.6,
    verb: () => 'Take back the purse',
    label: () => 'Thief',
    interact: () => {
      taken = true;
    },
  };
  ia?.add(take);
  ctx.onEnd(() => ia?.remove(take));
  const t0 = ctx.now;
  yield () => taken || ctx.now - t0 > 30 || !near(ctx, fur, KEEP_R);
  ia?.remove(take);
  // Up and away: with the watch if it came, else at a run.
  const away = ctx.snap(fur.position.x + (fur.position.x - ctx.player.x) * 6, fur.position.z + (fur.position.z - ctx.player.z) * 6, 8) ?? { x: fur.position.x + 20, z: fur.position.z };
  fur.humanoid.play('interact');
  if (guard) {
    ctx.say(guard, 'I’ll take him. To the vigiles with you, furcifer!');
    fur.brain?.scriptGo(away.x, away.z, 1.5);
    guard.brain?.scriptGo(away.x + 0.8, away.z, 1.5);
  } else {
    fur.brain?.scriptGo(away.x, away.z, 5.2);
  }
  if (!taken) {
    victim.brain?.scriptStand('talk', null);
    ctx.say(victim, 'You had him! And you let him go with my purse!');
    yield 5;
    return;
  }
  // The purse: 1–2 denarii, in asses.
  const purse = Math.round((1 + ctx.rng.next()) * 16) / 16;
  g.events.emit('rpg:notify', { text: `You took back the purse (${Math.round(purse * 16)} asses). Give it back to its owner, or keep it.`, kind: 'item' });
  yield 1;
  victim.brain?.scriptGo(ctx.player.x + 1.2, ctx.player.z + 0.4, 2.6, 0.9);
  const tv = ctx.now;
  yield () => !!victim.brain?.arrived || ctx.now - tv > 12;
  stand(victim, 'talk', toPlayer(victim));
  ctx.say(victim, 'My purse! You caught him! Is it… may I have it?');
  // E on the victim: give it back. Walking away with it is keeping it; dithering, the owner takes it
  // back. A scene torn down (a load, a teleport, the owner gone) settles nothing: no coins, no crime.
  let returned = false;
  const at2 = new THREE.Vector3();
  const give: Interactable = {
    id: 'fur:return',
    position: () => at2.set(victim.position.x, victim.position.y + 1.1, victim.position.z),
    reach: 3,
    verb: () => 'Return the purse',
    label: () => victim.name,
    interact: () => {
      returned = true;
    },
  };
  ia?.add(give);
  ctx.onEnd(() => ia?.remove(give));
  // (The director lets a wait run at most 45 s.)
  const t1 = ctx.now;
  yield () => returned || !near(ctx, victim, KEEP_R) || ctx.now - t1 > 40;
  ia?.remove(give);
  if (!returned && !near(ctx, victim, KEEP_R)) {
    keepPurse(ctx, victim, purse);
    yield 3;
    return;
  }
  if (!returned) {
    victim.humanoid.play('interact');
    ctx.say(victim, ctx.rng.pick(['Well? It’s mine. Give it here!', 'That’s my purse you’re weighing. Thank you!']));
    g.events.emit('rpg:notify', { text: `${victim.name} took the purse back out of your hand.`, kind: 'info' });
    yield 3;
    return;
  }
  // 2–6 asses for the trouble, and the street remembers.
  const as = 2 + Math.floor(ctx.rng.next() * 5);
  g.player?.inventory?.addDenarii(as / 16);
  g.factions?.addReputation('plebs', 1);
  victim.humanoid.play('interact');
  ctx.say(victim, ctx.rng.pick(['Gratias! The gods see an honest man, and so do I. Here, for your trouble.', 'All of it, every as! Here, take something for your legs.']));
  ctx.sfx('coin.clink', victim.position);
  g.events.emit('rpg:notify', { text: `${victim.name} gave you ${as} asses for your trouble. (Fama with the plebs +1)`, kind: 'item' });
  yield 4;
}

function near(ctx: VignetteContext, n: Npc, r: number): boolean {
  return Math.hypot(n.position.x - ctx.player.x, n.position.z - ctx.player.z) < r;
}

/** The player walked off with the purse: theirs, and a theft if anyone saw (furtum). */
function keepPurse(ctx: VignetteContext, victim: Npc, purse: number) {
  const g = ctx.game;
  g.player?.inventory?.addDenarii(purse);
  const p = g.player?.position;
  const seen = p ? (g.population?.witnesses(p, 22) ?? []) : [];
  if (seen.length) {
    g.crime?.commit('furtum', { witnessed: seen, victimId: victim.id, value: purse, district: g.locations?.current()?.id });
    ctx.say(victim, 'Thief! He’s kept my purse! He’s no better than the other one!');
  }
  g.events.emit('rpg:notify', { text: `You kept the purse: ${Math.round(purse * 16)} asses.${seen.length ? ' Someone saw.' : ''}`, kind: seen.length ? 'warning' : 'item' });
}

// ---------------------------------------------------------------- hawker

/** What a hawker carries on the tray (world-life §4.9): one ware a walk, an as apiece. */
const WARES = [
  { item: 'libum', label: 'Honey cakes', cry: 'Honey cakes! Still warm, an as apiece!' },
  { item: 'lupini', label: 'Lupins', cry: 'Lupins! Hot salted lupins, an as a handful!' },
  { item: 'cicer', label: 'Hot chickpeas', cry: 'Hot chickpeas! Lupins! An as a cone!' },
] as const;

/**
 * A hawker with a tray cries his wares and sells to passers-by; the player can buy too, one click
 * on the tray (Buy, an as), as at the Palatine and Circus counters. He lingers while the player is
 * near (up to 40 s) before moving on.
 */
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
    const ware = WARES[Math.floor(ctx.rng.next() * WARES.length)];
    yield* walk(ctx, v, plan.x, plan.z, 1.3);
    // Stuck on the way (behind a wall, in a doorway): no crying wares nobody can reach.
    if (Math.hypot(v.position.x - plan.x, v.position.z - plan.z) > 3) return;
    stand(v, 'talk', faceTo(v, ctx.player.x, ctx.player.z));
    ctx.say(v, ware.cry);
    ctx.sfx('amb.calls', v.position);
    // The tray: one click buys one.
    const g = ctx.game;
    const price = () => g.items?.get(ware.item)?.value ?? 1 / 16;
    const asses = () => Math.max(1, Math.round(price() * 16));
    const at = new THREE.Vector3();
    const tray: Interactable = {
      id: 'hawker:buy',
      position: () => at.set(v.position.x + Math.sin(v.heading) * 0.45, v.position.y + 1.05, v.position.z + Math.cos(v.heading) * 0.45),
      reach: 2.8,
      verb: () => 'Buy',
      label: () => `${ware.label} (hawker)`,
      detail: () => `${asses()} ${asses() === 1 ? 'as' : 'asses'}`,
      interact: () => {
        const inv = g.player?.inventory;
        if (!inv) return;
        if (!inv.spendDenarii(price())) {
          g.events.emit('rpg:notify', { text: 'You cannot afford it.', kind: 'warning' });
          return;
        }
        inv.add(ware.item, 1, { source: 'barter' });
        v.humanoid.play('interact');
        ctx.sfx('coin.clink', v.position);
        ctx.say(v, ctx.rng.pick(['Gratias! Eat it hot.', 'One for you, and the gods bless your belly.', 'An as well spent, friend.']));
      },
    };
    g.interactions?.add(tray);
    ctx.onEnd(() => g.interactions?.remove(tray));
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
    // He stays while the player is about (a customer is a customer).
    const t0 = ctx.now;
    yield () => !near(ctx, v, 9) || ctx.now - t0 > 40;
    g.interactions?.remove(tray);
    ctx.say(v, 'Gratias! Come back tomorrow!');
    yield 3;
  },
};
