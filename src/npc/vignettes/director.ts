/**
 * Runs ambient vignettes near the player: picks one every 15–30 s by day (30–60 s at night),
 * at most two at a time, each type on its own cooldown; steps their scripts; and always hands the
 * cast back and removes props when a scene ends or aborts (cast member gone, player far away).
 */
import type * as THREE from 'three';
import type { Npc } from '../Npc';
import type { Cue, VignetteContext, VignetteDef, VignettePlan } from './types';

/** What the director needs from the population manager. */
export type VignetteHost = Omit<VignetteContext, 'cast' | 'release' | 'addObject' | 'onEnd'> & {
  /** Is the NPC still in the world? */
  alive(npc: Npc): boolean;
  /** Script / un-script an NPC's brain. */
  takeOver(npc: Npc): void;
  giveBack(npc: Npc): void;
  addToScene(o: THREE.Object3D): void;
  /** No vignettes now (combat, dialogue, menus). */
  busy(): boolean;
  /** No street scene is staged here (the arena sand, the stands: NpcManager's no-go areas). */
  blocked?(x: number, z: number): boolean;
};

interface Run {
  def: VignetteDef;
  plan: VignettePlan;
  gen: Generator<Cue, void, unknown>;
  wait: Cue;
  waitStart: number;
  started: number;
  cast: Set<Npc>;
  objects: THREE.Object3D[];
  ends: (() => void)[];
  ctx: VignetteContext;
}

export class VignetteDirector {
  enabled = true;
  /** Max simultaneous vignettes. */
  maxActive = 2;
  /** Interval ranges (s). */
  dayGap: [number, number] = [15, 30];
  nightGap: [number, number] = [30, 60];
  nextAt = 10;
  readonly runs: Run[] = [];
  private last = new Map<string, number>();
  /** Started count by id (stats/tests). */
  readonly started = new Map<string, number>();

  constructor(
    private readonly defs: readonly VignetteDef[],
    private readonly host: VignetteHost,
  ) {}

  get active(): readonly string[] {
    return this.runs.map((r) => r.def.id);
  }

  update() {
    const h = this.host;
    for (const r of [...this.runs]) this.step(r);
    if (!this.enabled || h.now < this.nextAt) return;
    const [a, b] = h.night ? this.nightGap : this.dayGap;
    this.nextAt = h.now + a + h.rng.next() * (b - a);
    if (this.runs.length >= this.maxActive || h.busy()) return;
    const eligible = this.defs.filter(
      (d) => (d.when === 'any' || (d.when === 'night') === h.night) && h.now - (this.last.get(d.id) ?? -1e9) >= d.cooldown && !this.runs.some((r) => r.def.id === d.id),
    );
    for (let tries = 0; tries < 3 && eligible.length; tries++) {
      const d = h.rng.weighted(eligible.map((e) => [e, e.weight] as const));
      if (this.start(d)) return;
      eligible.splice(eligible.indexOf(d), 1);
    }
  }

  /** Start a vignette now (dev/test: `at` forces the anchor). Returns false if it can't run here. */
  start(def: VignetteDef | string, at?: { x: number; z: number; face?: number }): boolean {
    const d = typeof def === 'string' ? this.defs.find((x) => x.id === def) : def;
    if (!d) return false;
    const h = this.host;
    const run = { def: d, cast: new Set<Npc>(), objects: [] as THREE.Object3D[], ends: [] as (() => void)[] } as Run;
    run.ctx = this.contextFor(run);
    const plan = d.plan(run.ctx);
    if (!plan || (!at && h.blocked?.(plan.x, plan.z))) return false;
    if (at) {
      plan.x = at.x;
      plan.z = at.z;
      if (at.face !== undefined) plan.face = at.face;
    }
    run.plan = plan;
    run.gen = d.run(run.ctx, plan);
    run.wait = 0;
    run.waitStart = h.now;
    run.started = h.now;
    this.last.set(d.id, h.now);
    this.started.set(d.id, (this.started.get(d.id) ?? 0) + 1);
    this.runs.push(run);
    this.step(run);
    return true;
  }

  /** End every running vignette. */
  stopAll() {
    for (const r of [...this.runs]) this.finish(r);
  }

  private contextFor(run: Run): VignetteContext {
    const h = this.host;
    const ctx = Object.create(h) as VignetteContext;
    ctx.cast = (n: Npc) => {
      if (!run.cast.has(n)) {
        run.cast.add(n);
        h.takeOver(n);
      }
      return n;
    };
    ctx.release = (n: Npc) => {
      if (run.cast.delete(n)) h.giveBack(n);
    };
    ctx.addObject = (o: THREE.Object3D) => {
      run.objects.push(o);
      h.addToScene(o);
      return o;
    };
    ctx.onEnd = (fn: () => void) => {
      run.ends.push(fn);
    };
    return ctx;
  }

  private step(r: Run) {
    const h = this.host;
    // Abort when a performer vanished or the player walked away.
    for (const n of r.cast) {
      if (!h.alive(n) || n.dead) {
        this.finish(r);
        return;
      }
    }
    if (Math.hypot(h.player.x - r.plan.x, h.player.z - r.plan.z) > 110 || h.now - r.started > 150) {
      this.finish(r);
      return;
    }
    for (let guard = 0; guard < 8; guard++) {
      const w = r.wait;
      if (typeof w === 'number') {
        if (w > 0 && h.now - r.waitStart < w) return;
        if (w === 0 && h.now === r.waitStart) return; // one frame
      } else if (!w() && h.now - r.waitStart < 45) {
        return;
      }
      let res: IteratorResult<Cue, void>;
      try {
        res = r.gen.next();
      } catch (err) {
        console.error(`[npc] vignette ${r.def.id} failed`, err);
        this.finish(r);
        return;
      }
      if (res.done) {
        this.finish(r);
        return;
      }
      r.wait = res.value;
      r.waitStart = h.now;
      if (typeof r.wait === 'number' && r.wait <= 0) return; // next frame
    }
  }

  private finish(r: Run) {
    const i = this.runs.indexOf(r);
    if (i >= 0) this.runs.splice(i, 1);
    try {
      r.gen.return?.();
    } catch {
      /* ignore */
    }
    for (const n of r.cast) if (this.host.alive(n)) this.host.giveBack(n);
    r.cast.clear();
    for (const o of r.objects) o.removeFromParent();
    for (const fn of r.ends) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
  }
}
