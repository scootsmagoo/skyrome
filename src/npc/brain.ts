/**
 * NpcBrain: what a person is doing right now. A small task machine on top of the schedule:
 *
 *   schedule slot (archetype × Roman hour, or a named NPC's own entries)
 *     → task: goto a spot → idle there in a loop (sit, lean, work, sweep, talk, pray, guard…)
 *             wander between nearby places, chat with a passer-by, follow a patron, patrol a beat
 *             leave (walk off and vanish in a doorway or out of sight)
 *     ↑ reactions pre-empt: flee from a fight, gawk at it, or (guards) step in.
 *
 * The brain only decides *where to go* and *how to stand*; `NpcManager` turns its desired velocity
 * into steering and locomotion.
 */
import type * as THREE from 'three';
import type { Actor, IdleLoop } from '../actors/Actor';
import type { Game } from '../core/Game';
import type { Rng } from '../core/Rng';
import type { NavService } from '../ai/life/nav';
import type { MoverEvent } from '../ai/life/mover';
import { hyp, type Vec2 } from '../ai/life/steering';
import type { BarkKind } from './barks';
import type { DayPhase } from './crowd/budget';
import type { Npc } from './Npc';
import { activeScheduleEntry, archetypeSlot, type ArchetypeSlot, type LifeActivity, type PlaceKind, type SunTimes } from './schedules';
import type { LifeSpot, SpotIndex } from './spots';
import { newRecover, recoverStep, STAND_OFF, type LooseLoad, type RecoverState } from './loads';

/** World services a brain needs (provided by NpcManager; faked in tests). */
export interface LifeContext {
  readonly game: Game;
  readonly rng: Rng;
  readonly nav: NavService;
  readonly spots: SpotIndex;
  /** Manager clock (s). */
  readonly now: number;
  readonly hour: number;
  readonly sun: SunTimes;
  readonly phase: DayPhase;
  readonly playerPos: THREE.Vector3 | null;
  /** A walkable wander target near the NPC, or null. */
  wanderTarget(npc: Npc, radius: number, minR?: number): Vec2 | null;
  /** Where to walk to leave: a door (despawn on arrival) or a point out of sight. */
  exitTarget(npc: Npc): { x: number; z: number; door: boolean } | null;
  /** Resolve a location id (named NPC schedules) to a game point. */
  resolveLocation(id: string): { x: number; z: number; radius: number } | null;
  despawn(npc: Npc): void;
  bark(npc: Npc, kind: BarkKind, urgent?: boolean): boolean;
  isVisible(x: number, y: number, z: number): boolean;
  /** Free ambient NPCs near a point for a chat. */
  chatPartner(npc: Npc): Npc | null;
  /** Combat module hook (guards). */
  engage(guard: Npc, target: Actor | null): void;
  /** The next leg of a walk along the street the NPC is on (lanes), or null when not near one. */
  travelTarget?(npc: Npc): Vec2 | null;
  /** How likely a wandering NPC here walks on along the street rather than browsing (0..1). */
  travelChance?(npc: Npc): number;
  /** Temple cellae are shut today (the Lemuria): priests stand at the doors instead of praying. */
  templesShut?(): boolean;
  /** Guards stay out of this fight (a quest's scripted fight): they watch instead of engaging. */
  guardsStandDown?(aggressor: Actor | null): boolean;
  /** Can the player walk to this point (nav grid; true where the grid doesn't know)? */
  reachable?(x: number, z: number): boolean;
  /** Put an NPC at a point at once (out of sight only); false when there is no floor there. */
  warp?(npc: Npc, x: number, z: number): boolean;
}

export type TaskKind = 'idle' | 'goto' | 'follow' | 'flee' | 'gawk' | 'respond' | 'leave' | 'converse' | 'script' | 'recover';

export interface Task {
  kind: TaskKind;
  x: number;
  z: number;
  speed: number;
  loop: IdleLoop | null;
  /** Heading to face when idle (null = keep). */
  face: number | null;
  /** Deadline on the manager clock (Infinity = until done). */
  until: number;
  /** For an idle that follows a walk: how long to stay once there (s). */
  duration?: number;
  spot?: LifeSpot | null;
  /** Follow-up once this one finishes. */
  then?: Task | null;
  /** Despawn on arrival (doors). */
  despawn?: boolean;
  partner?: Npc | null;
  /** Danger source for flee/gawk/respond. */
  dangerX?: number;
  dangerZ?: number;
  /** For 'recover': the fallen load being fetched and the progress of fetching it. */
  load?: LooseLoad;
  recover?: RecoverState;
}

const task = (kind: TaskKind, o: Partial<Task> = {}): Task => ({ kind, x: 0, z: 0, speed: 1.3, loop: null, face: null, until: Infinity, ...o });

export class NpcBrain {
  task: Task | null = null;
  /** Current schedule activity (debug, tests). */
  activity: LifeActivity = 'wander';
  /** Seconds until the next periodic re-think (schedule changes). */
  private thinkT = 0;
  private slotKey = '';
  private slot: ArchetypeSlot | null = null;
  /** Set when the task's mover arrived this step (vignettes poll it). */
  arrived = false;
  /** Last mover event (debug). */
  lastEvent: MoverEvent = 'none';
  /** Reaction lock (s): ignore new alarms until then. */
  private alarmUntil = 0;
  private loopSet: IdleLoop | null | undefined = undefined;
  /** Named NPC: the active schedule entry's location id. */
  private namedAt = '';

  constructor(readonly npc: Npc) {}

  /** Replace the current task (releases claimed spots). */
  setTask(t: Task | null, ctx: LifeContext) {
    if (this.task?.spot && this.task.spot !== t?.spot) ctx.spots.release(this.npc.id);
    // A load still in the hand when the recover task ends (a fright, a fight) goes where it is carried.
    if (this.task?.kind === 'recover' && t?.kind !== 'recover') ctx.game.looseLoads?.seat(this.npc);
    this.task = t;
    this.arrived = false;
    this.applyLoop(null);
    if (t && (t.kind === 'goto' || t.kind === 'flee' || t.kind === 'gawk' || t.kind === 'respond' || t.kind === 'leave')) {
      this.npc.mover.setGoal(t.x, t.z, t.speed, t.kind === 'goto' && t.then?.kind === 'idle' ? 0.45 : 0.9);
    } else {
      this.npc.mover.clear();
    }
  }

  private applyLoop(loop: IdleLoop | null) {
    if (this.loopSet === loop) return;
    this.loopSet = loop;
    this.npc.setLoop(loop);
  }

  // ---------------------------------------------------------------- per fixed step

  /** Decide the desired velocity for this step (before steering). */
  step(dt: number, ctx: LifeContext, out: Vec2) {
    out.x = out.z = 0;
    const npc = this.npc;
    this.arrived = false;
    if (npc.dead) return;
    if (npc.talking) {
      this.applyLoop('talk');
      if (ctx.playerPos) npc.turnToward(npc.headingTo(ctx.playerPos.x, ctx.playerPos.z), 5, dt);
      return;
    }
    if (npc.isFighting()) {
      // The combat module drives fighters; we only stop walking.
      this.applyLoop(null);
      return;
    }
    this.thinkT -= dt;
    if (!npc.scripted && (!this.task || ctx.now > this.task.until || this.thinkT <= 0)) {
      if (!this.task || ctx.now > this.task.until) this.next(ctx);
      else this.recheck(ctx);
      this.thinkT = 1 + ctx.rng.next() * 1.5;
    }
    const t = this.task;
    if (!t) return;

    switch (t.kind) {
      case 'idle':
      case 'converse': {
        this.applyLoop(t.loop);
        let face = t.face;
        if (t.kind === 'converse' && t.partner) face = npc.headingTo(t.partner.position.x, t.partner.position.z);
        if (face !== null) npc.turnToward(face, 4, dt);
        if (t.kind === 'converse') {
          const pt = t.partner?.brain?.task;
          const engaged = pt && (pt.partner === npc || pt.then?.partner === npc);
          if (!t.partner || t.partner.dead || !engaged) t.until = Math.min(t.until, ctx.now + 0.5);
        }
        return;
      }
      case 'follow': {
        const leader = npc.leader;
        if (!leader || leader.dead || !ctx.game.actors.get(leader.id)) {
          npc.leader = null;
          this.setTask(null, ctx);
          return;
        }
        // Walk a little behind and to the side of the leader.
        const idx = Math.max(0, leader.followers.indexOf(npc));
        const back = 1.4 + Math.floor(idx / 2) * 1.1;
        const side = (idx % 2 ? 1 : -1) * 0.75;
        const h = leader.heading;
        const fx = Math.sin(h);
        const fz = Math.cos(h);
        const tx = leader.position.x - fx * back - fz * side;
        const tz = leader.position.z - fz * back + fx * side;
        const d = hyp(tx - npc.position.x, tz - npc.position.z);
        const ls = hyp(leader.velocity.x, leader.velocity.z);
        if (d < 0.5 && ls < 0.2) {
          this.applyLoop(leader.brain?.task?.kind === 'idle' ? 'stand' : null);
          npc.turnToward(leader.heading, 3, dt);
          npc.mover.clear();
          return;
        }
        this.applyLoop(null);
        if (!npc.mover.active || hyp(npc.mover.goalX - tx, npc.mover.goalZ - tz) > 1) npc.mover.setGoal(tx, tz, 1, 0.35);
        npc.mover.speed = Math.min(npc.walkSpeed * 1.8, Math.max(0.6, ls + d * 0.8));
        this.lastEvent = npc.mover.update(dt, npc.position.x, npc.position.z, ctx.nav, out);
        if (this.lastEvent === 'stuck') this.unstickRequested = true;
        return;
      }
      case 'recover': {
        this.stepRecover(t, dt, ctx, out);
        return;
      }
      case 'script': {
        // A vignette sets x/z/speed (moving) or loop/face (standing).
        if (npc.mover.active) {
          this.applyLoop(null);
          this.lastEvent = npc.mover.update(dt, npc.position.x, npc.position.z, ctx.nav, out);
          if (this.lastEvent === 'arrived' || this.lastEvent === 'failed' || this.lastEvent === 'blocked') this.arrived = true;
          if (this.lastEvent === 'stuck') {
            this.arrived = true;
            npc.mover.clear();
          }
        } else {
          this.applyLoop(t.loop);
          if (t.face !== null) npc.turnToward(t.face, 4, dt);
        }
        return;
      }
      default: {
        // goto / flee / gawk / respond / leave
        this.applyLoop(null);
        const ev = npc.mover.update(dt, npc.position.x, npc.position.z, ctx.nav, out);
        this.lastEvent = ev;
        if (ev === 'arrived') {
          this.arrived = true;
          this.onArrive(ctx);
        } else if (ev === 'failed' || ev === 'blocked') {
          if (t.kind === 'leave' && !ctx.isVisible(npc.position.x, npc.position.y + 1, npc.position.z)) ctx.despawn(npc);
          // No way there: stand a moment before choosing again. Choosing at once sends a crowd
          // with unreachable goals (seen on the Circus seating) into a storm of failing path
          // searches, the most expensive kind (~10 ms a frame).
          else if (ev === 'failed') this.setTask(task('idle', { loop: 'stand', until: ctx.now + 1.5 + ctx.rng.next() * 2.5 }), ctx);
          else this.setTask(null, ctx);
        } else if (ev === 'stuck') {
          this.unstickRequested = true;
        }
        // Leaving people vanish as soon as nobody is looking.
        if (t.kind === 'leave' && npc.unseenFor > 1.5 && npc.distToPlayer > 25) ctx.despawn(npc);
      }
    }
  }

  /**
   * Fetch the load that fell off: walk to it, crouch, pick it up and put it on again (loads.ts has
   * the timing). Gives up when it is gone, broken, out of reach or taking too long.
   */
  private stepRecover(t: Task, dt: number, ctx: LifeContext, out: Vec2) {
    const npc = this.npc;
    const loads = ctx.game.looseLoads;
    const load = t.load;
    const st = t.recover;
    if (!load || !st || !loads) {
      this.setTask(null, ctx);
      return;
    }
    const lp = load.holder.position;
    const dist = hyp(lp.x - npc.position.x, lp.z - npc.position.z);
    const present = loads.has(load) && load.state === 'loose';
    if (st.phase === 'walk') {
      this.applyLoop(null);
      // Walk to a spot a hand's reach short of it (the clip's hand meets the ground ~0.3 m ahead of the feet).
      const k = dist > 0.01 ? Math.max(0, dist - STAND_OFF) / dist : 0;
      const gx = npc.position.x + (lp.x - npc.position.x) * k;
      const gz = npc.position.z + (lp.z - npc.position.z) * k;
      if (!npc.mover.active || hyp(npc.mover.goalX - gx, npc.mover.goalZ - gz) > 0.6) npc.mover.setGoal(gx, gz, Math.max(1.2, npc.walkSpeed), 0.25);
      this.lastEvent = npc.mover.update(dt, npc.position.x, npc.position.z, ctx.nav, out);
      if (this.lastEvent === 'stuck') this.unstickRequested = true;
    }
    const stalled = this.lastEvent === 'arrived' || this.lastEvent === 'failed' || this.lastEvent === 'blocked';
    const ev = recoverStep(st, dt, { dist, present, stalled: st.phase === 'walk' && stalled });
    if (ev === 'crouch') {
      npc.mover.clear();
      out.x = out.z = 0;
      npc.humanoid.play('pickupGround');
    } else if (ev === 'grab') {
      loads.collect(load, npc);
    } else if (ev === 'seat') {
      loads.seat(npc);
    }
    if (st.phase === 'crouch') {
      out.x = out.z = 0;
      // Stopped short (a crowd, a wall): shuffle up to it while going down, so the hand reaches it.
      if (st.crouchT < 0.6 && dist > STAND_OFF + 0.12) {
        out.x = ((lp.x - npc.position.x) / dist) * 0.8;
        out.z = ((lp.z - npc.position.z) / dist) * 0.8;
      }
      this.applyLoop(null);
      npc.turnToward(npc.headingTo(lp.x, lp.z), 6, dt);
    } else if (st.phase === 'done') {
      this.setTask(null, ctx);
    } else if (st.phase === 'giveup') {
      loads.abandon(load);
      npc.mover.clear();
      if (present && ctx.rng.chance(0.6)) ctx.bark(npc, 'dropped');
      this.setTask(null, ctx);
    }
  }

  /** Until when (manager clock) this NPC won't be distracted by another dropped load. */
  private noticeUntil = 0;

  /**
   * Something fell or smashed at (x, z): stop, look at it for a moment and maybe say so. The idle
   * runs out and the NPC takes up their day again. `loud` is a breakage (they look longer).
   */
  notice(ctx: LifeContext, x: number, z: number, loud: boolean) {
    const npc = this.npc;
    const k = this.task?.kind;
    if (npc.dead || npc.talking || npc.scripted || npc.isFighting() || npc.lostLoad || ctx.now < this.noticeUntil || ctx.now < this.alarmUntil) return;
    if (k === 'flee' || k === 'respond' || k === 'recover' || k === 'converse' || k === 'script') return;
    this.noticeUntil = ctx.now + 5;
    const face = Math.atan2(x - npc.position.x, z - npc.position.z);
    this.setTask(task('idle', { loop: 'stand', face, until: ctx.now + 1.8 + ctx.rng.next() * 1.8 + (loud ? 1.5 : 0) }), ctx);
    if (npc.role?.gawks && ctx.rng.chance(loud ? 0.5 : 0.25)) ctx.bark(npc, 'gawk');
  }

  /** The manager reads and clears this to unstick the NPC (AC-22). */
  unstickRequested = false;

  private onArrive(ctx: LifeContext) {
    const t = this.task!;
    if (t.despawn) {
      ctx.despawn(this.npc);
      return;
    }
    if (t.kind === 'leave') {
      if (!ctx.isVisible(this.npc.position.x, this.npc.position.y + 1, this.npc.position.z)) ctx.despawn(this.npc);
      else this.setTask(task('leave', this.leaveTarget(ctx) ?? { until: ctx.now + 2 }), ctx);
      return;
    }
    if (t.kind === 'gawk') {
      const face = Math.atan2((t.dangerX ?? t.x) - this.npc.position.x, (t.dangerZ ?? t.z) - this.npc.position.z);
      this.setTask(task('idle', { loop: ctx.rng.chance(0.5) ? 'cheer' : 'talk', face, until: ctx.now + 6 + ctx.rng.next() * 8 }), ctx);
      return;
    }
    if (t.kind === 'flee') {
      const face = Math.atan2((t.dangerX ?? t.x) - this.npc.position.x, (t.dangerZ ?? t.z) - this.npc.position.z);
      this.setTask(task('idle', { loop: 'stand', face, until: ctx.now + 4 + ctx.rng.next() * 6 }), ctx);
      return;
    }
    if (t.kind === 'respond') {
      const face = Math.atan2((t.dangerX ?? t.x) - this.npc.position.x, (t.dangerZ ?? t.z) - this.npc.position.z);
      this.setTask(task('idle', { loop: 'guard', face, until: ctx.now + 8 }), ctx);
      return;
    }
    if (t.then) {
      const nt = t.then;
      if (nt.kind === 'idle' && t.spot) nt.spot = t.spot;
      this.task = null;
      this.setTask(nt, ctx);
      if (nt.until === Infinity) nt.until = ctx.now + (nt.duration ?? 20);
      return;
    }
    this.setTask(null, ctx);
  }

  // ---------------------------------------------------------------- deciding

  /** Periodic check while busy: schedule changes interrupt idling or wandering. */
  private recheck(ctx: LifeContext) {
    if (this.npc.station) return;
    const key = this.scheduleKey(ctx);
    if (key !== this.slotKey && this.task && (this.task.kind === 'idle' || this.task.kind === 'goto')) {
      this.next(ctx);
    }
  }

  private scheduleKey(ctx: LifeContext): string {
    const npc = this.npc;
    if (npc.def?.schedule?.length) {
      const e = activeScheduleEntry(npc.def.schedule, ctx.hour);
      return e ? `${e.from}:${e.at}` : '';
    }
    if (npc.role) {
      const s = archetypeSlot(npc.role.archetype, ctx.hour, ctx.sun);
      return `${s.activity}:${s.place ?? ''}:${s.loop ?? ''}`;
    }
    return '';
  }

  /** Pick the next task from the schedule. */
  next(ctx: LifeContext) {
    const npc = this.npc;
    this.slotKey = this.scheduleKey(ctx);
    if (npc.lostLoad) {
      const l = npc.lostLoad;
      // Their load lies on the ground: fetch it first (unless it is gone or far off).
      const lp = l.holder.position;
      if (ctx.game.looseLoads?.has(l) && l.state === 'loose' && hyp(lp.x - npc.position.x, lp.z - npc.position.z) < 30) {
        this.activity = 'wander';
        this.setTask(task('recover', { x: lp.x, z: lp.z, load: l, recover: newRecover(), until: ctx.now + 60 }), ctx);
        return;
      }
      ctx.game.looseLoads?.abandon(l);
    }
    if (npc.leader && !npc.leader.dead) {
      this.activity = 'follow';
      this.setTask(task('follow'), ctx);
      return;
    }
    // A station post comes first: a shop's keeper (src/life) is named but stands where the station puts them.
    if (npc.station) {
      this.toPost(ctx);
      return;
    }
    if (npc.def) {
      // A keeper with the shop shut has no schedule of their own: they go home.
      if (!npc.def.schedule?.length && !npc.def.home && npc.def.tags?.includes('keeper')) {
        this.leave(ctx);
        return;
      }
      this.nextNamed(ctx);
      return;
    }
    const role = npc.role;
    const slot = role ? archetypeSlot(role.archetype, ctx.hour, ctx.sun) : ({ at: { clock: 0 }, activity: 'wander' } as ArchetypeSlot);
    this.slot = slot;
    this.activity = slot.activity;
    const rng = ctx.rng;
    switch (slot.activity) {
      case 'home':
        this.leave(ctx);
        return;
      case 'work':
      case 'idle':
        if (this.goToSpot(ctx, slot.place ?? 'open', slot.loop ?? 'stand', 60 + rng.next() * 150)) return;
        this.wander(ctx, slot.place);
        return;
      case 'visit':
        if (rng.chance(0.65) && this.goToSpot(ctx, slot.place ?? 'open', null, 15 + rng.next() * 35)) return;
        this.wander(ctx, slot.place);
        return;
      case 'patrol':
        this.patrol(ctx);
        return;
      case 'follow':
      case 'wander':
      default:
        this.wander(ctx, slot.place);
    }
  }

  /** Walk to a free spot of a kind and idle there. */
  goToSpot(ctx: LifeContext, kind: PlaceKind, loop: IdleLoop | null, duration: number, radius = 45): boolean {
    const npc = this.npc;
    const kinds: PlaceKind[] = [kind];
    // Stand-ins: no shops yet → stalls → walls; no tavern → shops; no workshop → anywhere open.
    if (kind === 'tavern') kinds.push('shop', 'stall');
    if (kind === 'shop') kinds.push('stall');
    if (kind === 'workshop') kinds.push('stall', 'open');
    if (kind === 'forum') kinds.push('rostra', 'steps');
    if (kind === 'curia' || kind === 'rostra') kinds.push('open');
    const s = ctx.spots.find(kinds, npc.position.x, npc.position.z, radius, ctx.rng, npc.position.y);
    if (!s) return false;
    ctx.spots.claim(s, npc.id);
    let l = loop ?? s.loop;
    // The Lemuria day: temple doors stay shut, so nobody prays before them (the compita stay open).
    if (s.kind === 'temple' && l === 'pray' && ctx.templesShut?.()) l = 'stand';
    // The idle's `until` is set on arrival (now + duration).
    const idle = task('idle', { loop: l, face: s.face, spot: s, duration });
    this.setTask(task('goto', { x: s.x, z: s.z, speed: npc.walkSpeed, spot: s, then: idle }), ctx);
    return true;
  }

  /**
   * Station members: walk to the post (pushed off it, or walking in), then stand there in its loop.
   * A post boxed in by its own stall can't be walked to: out of sight the member steps onto it,
   * in view he waits beside it.
   */
  private toPost(ctx: LifeContext) {
    const npc = this.npc;
    const st = npc.station!;
    this.activity = 'idle';
    const idle = task('idle', { loop: st.loop, face: st.face, until: ctx.now + 20 + ctx.rng.next() * 20 });
    if (hyp(st.x - npc.position.x, st.z - npc.position.z) <= 0.7) {
      this.setTask(idle, ctx);
      return;
    }
    if (ctx.reachable && !ctx.reachable(st.x, st.z)) {
      if (!ctx.isVisible(npc.position.x, npc.position.y + 1, npc.position.z) && ctx.warp?.(npc, st.x, st.z)) {
        this.setTask(idle, ctx);
        return;
      }
      const a = ctx.nav.snap(st.x, st.z, 3);
      const face = Math.atan2(st.x - npc.position.x, st.z - npc.position.z);
      const wait = task('idle', { loop: 'stand', face, duration: 3 + ctx.rng.next() * 3 });
      if (hyp(a.x - npc.position.x, a.z - npc.position.z) <= 0.9) {
        wait.until = ctx.now + (wait.duration ?? 4);
        this.setTask(wait, ctx);
      } else this.setTask(task('goto', { x: a.x, z: a.z, speed: npc.walkSpeed, then: wait }), ctx);
      return;
    }
    this.setTask(task('goto', { x: st.x, z: st.z, speed: npc.walkSpeed, then: { ...idle, until: Infinity, duration: 20 + ctx.rng.next() * 20 } }), ctx);
  }

  /** Walk on along the street (lanes); false when there is no street here. */
  travel(ctx: LifeContext): boolean {
    const t = ctx.travelTarget?.(this.npc);
    if (!t) return false;
    this.activity = 'wander';
    const pause = ctx.rng.chance(0.15) ? task('idle', { loop: ctx.rng.pick<IdleLoop | null>(['stand', 'talk', null]), duration: 2 + ctx.rng.next() * 4 }) : null;
    this.setTask(task('goto', { x: t.x, z: t.z, speed: this.npc.walkSpeed, then: pause }), ctx);
    return true;
  }

  private wander(ctx: LifeContext, place?: PlaceKind) {
    const npc = this.npc;
    const rng = ctx.rng;
    // Walk on down the street most of the time (people pass through; streets carry traffic).
    if (ctx.travelChance && rng.chance(ctx.travelChance(npc)) && this.travel(ctx)) return;
    // A chat with someone nearby.
    if (rng.chance(0.22)) {
      const p = ctx.chatPartner(npc);
      if (p && p.brain) {
        const mx = (npc.position.x + p.position.x) / 2;
        const mz = (npc.position.z + p.position.z) / 2;
        const dur = ctx.now + 8 + rng.next() * 14;
        const mine = task('converse', { loop: 'talk', partner: p, until: dur });
        const theirs = task('converse', { loop: 'talk', partner: npc, until: dur });
        const off = 0.6;
        const dx = npc.position.x - p.position.x;
        const dz = npc.position.z - p.position.z;
        const d = hyp(dx, dz) || 1;
        this.setTask(task('goto', { x: mx + (dx / d) * off, z: mz + (dz / d) * off, speed: npc.walkSpeed, then: mine }), ctx);
        p.brain.setTask(task('goto', { x: mx - (dx / d) * off, z: mz - (dz / d) * off, speed: p.walkSpeed, then: theirs }), ctx);
        return;
      }
    }
    // Browse a place of the slot's kind now and then, or drift to where people gather.
    if (place && rng.chance(0.3) && this.goToSpot(ctx, place, null, 6 + rng.next() * 14, 35)) return;
    if (rng.chance(0.25) && this.goToSpot(ctx, rng.pick<PlaceKind>(['forum', 'steps', 'rostra', 'fountain', 'temple', 'open']), rng.pick<IdleLoop | null>([null, 'stand', 'talk']), 5 + rng.next() * 15, 30)) return;
    const target = ctx.wanderTarget(npc, 26, 6);
    if (!target) {
      this.setTask(task('idle', { loop: rng.chance(0.5) ? 'stand' : 'talk', until: ctx.now + 3 + rng.next() * 5 }), ctx);
      return;
    }
    const pause = rng.chance(0.45) ? task('idle', { loop: rng.pick<IdleLoop | null>([null, 'stand', 'talk', 'stand']), duration: 2 + rng.next() * 7 }) : null;
    this.setTask(task('goto', { x: target.x, z: target.z, speed: npc.walkSpeed, then: pause }), ctx);
  }

  private patrol(ctx: LifeContext) {
    const npc = this.npc;
    const target = ctx.wanderTarget(npc, 34, 14);
    const halt = ctx.rng.chance(0.35) ? task('idle', { loop: 'guard', duration: 3 + ctx.rng.next() * 6 }) : null;
    if (!target) {
      this.setTask(task('idle', { loop: 'guard', until: ctx.now + 5 }), ctx);
      return;
    }
    this.setTask(task('goto', { x: target.x, z: target.z, speed: npc.walkSpeed, then: halt }), ctx);
  }

  private leaveTarget(ctx: LifeContext): Partial<Task> | null {
    const e = ctx.exitTarget(this.npc);
    if (!e) return null;
    return { x: e.x, z: e.z, speed: this.npc.walkSpeed * 1.05, despawn: e.door };
  }

  /** Go home: walk to a door or out of sight and despawn. */
  leave(ctx: LifeContext) {
    this.activity = 'home';
    const t = this.leaveTarget(ctx);
    if (!t) {
      if (!ctx.isVisible(this.npc.position.x, this.npc.position.y + 1, this.npc.position.z)) ctx.despawn(this.npc);
      else this.setTask(task('idle', { loop: 'stand', until: ctx.now + 3 }), ctx);
      return;
    }
    this.setTask(task('leave', t), ctx);
  }

  /** Named NPCs follow their own schedule entries (clock hours, location ids). */
  private nextNamed(ctx: LifeContext) {
    const npc = this.npc;
    const def = npc.def!;
    const e = activeScheduleEntry(def.schedule, ctx.hour);
    const at = e?.at ?? def.home;
    const loc = at ? ctx.resolveLocation(at) : null;
    this.namedAt = at ?? '';
    const activity = e?.activity ?? 'stand';
    if (!loc) {
      this.wander(ctx);
      return;
    }
    const d = hyp(loc.x - npc.position.x, loc.z - npc.position.z);
    const r = Math.min(loc.radius, 4);
    if (activity === 'wander' || activity === 'patrol') {
      this.activity = activity === 'patrol' ? 'patrol' : 'wander';
      if (d > loc.radius + 8) {
        this.setTask(task('goto', { x: loc.x, z: loc.z, speed: npc.walkSpeed }), ctx);
        return;
      }
      const tx = loc.x + (ctx.rng.next() - 0.5) * 2 * Math.max(4, loc.radius * 0.6);
      const tz = loc.z + (ctx.rng.next() - 0.5) * 2 * Math.max(4, loc.radius * 0.6);
      const p = ctx.nav.snap(tx, tz, 4);
      const pause = task('idle', { loop: activity === 'patrol' ? 'guard' : 'stand', duration: 3 + ctx.rng.next() * 8 });
      this.setTask(task('goto', { x: p.x, z: p.z, speed: npc.walkSpeed, then: pause }), ctx);
      return;
    }
    this.activity = 'idle';
    const loop: IdleLoop = activity === 'travel' ? 'stand' : activity;
    if (d <= r + 0.6) {
      this.setTask(task('idle', { loop, until: ctx.now + 30 + ctx.rng.next() * 30 }), ctx);
      return;
    }
    const p = ctx.nav.snap(loc.x + (ctx.rng.next() - 0.5) * r, loc.z + (ctx.rng.next() - 0.5) * r, 4);
    const idle = task('idle', { loop, duration: 60 });
    this.setTask(task('goto', { x: p.x, z: p.z, speed: npc.walkSpeed, then: idle }), ctx);
  }

  // ---------------------------------------------------------------- reactions

  /**
   * Something alarming at (x, z): a fight, a crime, a fire. Guards step in; the fragile flee;
   * the curious watch from a safe distance; everyone else runs.
   */
  alarm(ctx: LifeContext, x: number, z: number, kind: 'fight' | 'crime' | 'danger', aggressor: Actor | null) {
    const npc = this.npc;
    if (npc.dead || npc.talking || npc.scripted || npc.isFighting() || ctx.now < this.alarmUntil) return;
    if (npc.leader) npc.leader = null;
    const role = npc.role;
    const rng = ctx.rng;
    const dx = npc.position.x - x;
    const dz = npc.position.z - z;
    const d = hyp(dx, dz) || 1;
    this.alarmUntil = ctx.now + 6;
    if (role?.guard || npc.def?.faction === 'cohortes-urbanae' || npc.def?.faction === 'vigiles') {
      if (ctx.guardsStandDown?.(aggressor)) {
        // A scripted fight (a quest's ambush): the watch keeps its post and looks on.
        const face = Math.atan2(x - npc.position.x, z - npc.position.z);
        this.setTask(task('idle', { loop: 'guard', face, until: ctx.now + 8 + rng.next() * 4 }), ctx);
        return;
      }
      ctx.bark(npc, 'guard', true);
      const p = ctx.nav.snap(x + (dx / d) * 2.5, z + (dz / d) * 2.5, 3);
      this.setTask(task('respond', { x: p.x, z: p.z, speed: 4.2, dangerX: x, dangerZ: z, until: ctx.now + 25 }), ctx);
      ctx.engage(npc, aggressor);
      return;
    }
    if (kind !== 'danger' && role?.gawks && !role.fragile && rng.chance(0.35) && d > 5) {
      const r = 8 + rng.next() * 5;
      const p = ctx.nav.snap(x + (dx / d) * r, z + (dz / d) * r, 3);
      this.setTask(task('gawk', { x: p.x, z: p.z, speed: npc.walkSpeed * 1.4, dangerX: x, dangerZ: z, until: ctx.now + 30 }), ctx);
      if (rng.chance(0.4)) ctx.bark(npc, 'gawk', true);
      return;
    }
    // Run 25–40 m away from it.
    const r = 25 + rng.next() * 15;
    const a = Math.atan2(dz, dx) + (rng.next() - 0.5) * 0.9;
    let p = ctx.nav.snap(x + Math.cos(a) * r, z + Math.sin(a) * r, 6);
    if (hyp(p.x - x, p.z - z) < 12) p = { x: npc.position.x + (dx / d) * 15, z: npc.position.z + (dz / d) * 15 };
    this.setTask(task('flee', { x: p.x, z: p.z, speed: 3.6 + rng.next() * 1.0, dangerX: x, dangerZ: z, until: ctx.now + 20 }), ctx);
    if (rng.chance(0.3)) ctx.bark(npc, kind === 'crime' ? 'crime' : 'flee', true);
  }

  /** Hand the NPC to a vignette (scripted moves/loops). */
  script(ctx: LifeContext) {
    this.npc.scripted = true;
    this.npc.leader = null;
    this.setTask(task('script', { until: Infinity }), ctx);
  }

  /** Give the NPC back to normal life. */
  release(ctx: LifeContext) {
    this.npc.scripted = false;
    this.setTask(null, ctx);
  }

  /** Script helpers (vignettes). */
  scriptGo(x: number, z: number, speed: number, arrive = 0.5) {
    const t = this.task;
    if (!t || t.kind !== 'script') return;
    this.arrived = false;
    this.npc.mover.setGoal(x, z, speed, arrive);
  }

  scriptStand(loop: IdleLoop | null, face: number | null) {
    const t = this.task;
    if (!t || t.kind !== 'script') return;
    this.npc.mover.clear();
    t.loop = loop;
    t.face = face;
  }
}

export { task as makeTask };
