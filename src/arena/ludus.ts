/**
 * Practice bouts on the Ludus Magnus' sand during the drill hours (hours 1–6 and 8–10): a pair of
 * tirones with wooden arms walks in from the gate, fights until one gives up or the doctor calls
 * time, and walks off; the next pair follows. The school's own drills (the pali, the named
 * gladiators) are stations and schedules; this adds the sparring.
 *
 * It stands down whenever the player's own Ludus bout (lud-01) is on, the player is on the sand,
 * or the player is fighting.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { Rng } from '../core/Rng';
import type { Combatant } from '../combat/Combatant';
import { romanPosition, sunTimes } from '../npc/schedules';
import { LUDUS_ARENA } from '../world/landmarks/builders/colos-ludus';
import type { PlacedLandmark } from '../world/landmarks/buildLandmarks';
import { pairOf, type Pair } from './munus';

/** Sparring only while the player is this close to the practice arena (m). */
const NEAR = 75;
/** The doctor calls time after this long (s). */
const TIME = 50;

const DOCTOR = ['Again! Shield up, tiro!', 'Feet! Where are your feet?', 'You parry with the eyes!', 'Enough. Water, then again.', 'Better. Now do it without thinking.', 'Who taught you that? Forget it.'];

interface Spar {
  pair: Pair;
  a: Combatant;
  b: Combatant;
  state: 'enter' | 'fight' | 'exit';
  t: number;
  until: number;
}

/** Drill hours (Roman day positions): hours 1–6 and 8–10. */
export function drillTime(pos: number): boolean {
  return (pos >= 0.3 && pos < 5) || (pos >= 7.1 && pos < 9.6);
}

export class LudusSparring implements System {
  readonly name = 'ludusSparring';
  readonly priority = 63;
  enabled = true;
  private placed: PlacedLandmark | null = null;
  private center = new THREE.Vector3();
  private marks: THREE.Vector3[] = [];
  private gate = new THREE.Vector3();
  private rot = 0;
  private spar: Spar | null = null;
  private clock = 0;
  private nextAt = 8;
  private n = 0;
  private tick = 0;
  private lastSay = -20;
  private rng = new Rng('ludus-sparring');

  constructor(private readonly game: Game) {}

  private setup(): boolean {
    if (this.placed) return true;
    const p = this.game.landmarks?.get('ludus-magnus');
    const c = p?.spots.find((s) => s.id === 'ludus-arena-center');
    const a = p?.spots.find((s) => s.id === 'ludus-fighter-a');
    const b = p?.spots.find((s) => s.id === 'ludus-fighter-b');
    const g = p?.spots.find((s) => s.id === 'ludus-gate');
    if (!p || !c || !a || !b || !g) return false;
    this.placed = p;
    this.rot = p.rotationY;
    this.center.copy(c.position);
    // A little off the centre line, so the named gladiators drilling in the middle aren't in the way.
    const off = new THREE.Vector3(Math.cos(this.rot), 0, -Math.sin(this.rot)).multiplyScalar(4);
    this.marks = [a.position.clone().add(off), b.position.clone().add(off)];
    this.gate.copy(g.position);
    return true;
  }

  /** Is a point on the practice sand? */
  private onSand(x: number, z: number): boolean {
    const dx = x - this.center.x;
    const dz = z - this.center.z;
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return (lx / LUDUS_ARENA.a) ** 2 + (lz / LUDUS_ARENA.b) ** 2 < 1;
  }

  /** Is the player's own Ludus business on (a bout, the quest's bout stages)? */
  private questBusy(): boolean {
    const core = this.game.combat?.core;
    if (core?.bout && !core.bout.over) return true;
    const q = this.game.quests?.state('lud-01-sacramentum');
    return q?.status === 'running' && q.stage.startsWith('bout');
  }

  update(dt: number) {
    if (!this.enabled || !this.game.combat || !this.setup()) return;
    this.clock += dt;
    const pl = this.game.player?.position;
    if (!pl) return;
    const d = Math.hypot(pl.x - this.center.x, pl.z - this.center.z);
    const sp = this.spar;
    const t = this.game.time;
    const pos = romanPosition(t.hour, sunTimes(this.game.calendar?.date() ?? t.date()));
    const busy = this.questBusy() || this.onSand(pl.x, pl.z) || !!this.game.combat.active;
    if (sp) {
      if (d > NEAR + 30 || this.questBusy()) {
        this.end(true);
        return;
      }
      this.step(sp, dt, busy || !drillTime(pos));
      return;
    }
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 1;
    if (d < NEAR && drillTime(pos) && !busy && this.clock >= this.nextAt) this.start();
  }

  private start() {
    const combat = this.game.combat;
    this.n++;
    const date = this.game.calendar?.date() ?? this.game.time.date();
    const pair = pairOf(`ludus:${date.month}-${date.day}-${this.game.time.dayIndex}`, this.n, true);
    const mk = (g: Pair['a'], i: number) => {
      const from = this.gate.clone();
      from.x += this.rng.range(-0.8, 0.8);
      from.z += this.rng.range(-0.8, 0.8);
      const mark = this.marks[i];
      const other = this.marks[1 - i];
      const c = combat.spawnEnemy(g.armatura, from, {
        name: g.name,
        tier: 'thug',
        lusio: true,
        team: `spar:${g.name}:${this.n}`,
        group: `spar:${g.name}:${this.n}`,
        aggro: 0,
        hostile: false,
        tags: ['munus'],
        yieldAt: 0.5,
        heading: Math.atan2(mark.x - from.x, mark.z - from.z),
        seed: `spar:${this.n}:${g.name}`,
      });
      c.march = { x: mark.x, z: mark.z, speed: 1.4, face: Math.atan2(other.x - mark.x, other.z - mark.z) };
      return c;
    };
    this.spar = { pair, a: mk(pair.a, 0), b: mk(pair.b, 1), state: 'enter', t: 0, until: this.clock + 30 };
  }

  private step(sp: Spar, dt: number, stop: boolean) {
    const core = this.game.combat.core;
    sp.t += dt;
    if (sp.state === 'enter') {
      if ((!sp.a.march && !sp.b.march) || this.clock > sp.until) {
        if (stop) {
          this.leave(sp);
          return;
        }
        core.engage(sp.a, sp.b);
        core.engage(sp.b, sp.a);
        sp.state = 'fight';
        sp.t = 0;
        this.say();
      }
      return;
    }
    if (sp.state === 'fight') {
      const down = [sp.a, sp.b].find((c) => c.status !== 'active');
      if (down || sp.t > TIME || stop) {
        for (const c of [sp.a, sp.b]) {
          c.target = null;
          if (c.status === 'yielded') core.releaseYielded(c);
        }
        if (!stop) this.say(down ? undefined : 'Time! Enough, both of you.');
        this.leave(sp);
      } else if (this.clock - this.lastSay > 14 && this.rng.chance(dt * 0.15)) this.say();
      return;
    }
    // exit: out by the gate.
    for (const c of [sp.a, sp.b]) {
      if (c.status === 'active' && !c.target && !c.march) c.march = { x: this.gate.x, z: this.gate.z, speed: 1.3 };
    }
    const out = [sp.a, sp.b].every((c) => Math.hypot(c.position.x - this.gate.x, c.position.z - this.gate.z) < 2 || c.status !== 'active');
    if (out || this.clock > sp.until) this.end(false);
  }

  private leave(sp: Spar) {
    sp.state = 'exit';
    sp.until = this.clock + 30;
    for (const c of [sp.a, sp.b]) c.march = { x: this.gate.x, z: this.gate.z, speed: 1.3 };
  }

  /** The doctor's voice from the edge of the sand, when the player is close enough to hear it. */
  private say(line?: string) {
    const pl = this.game.player?.position;
    if (!pl || Math.hypot(pl.x - this.center.x, pl.z - this.center.z) > 32) return;
    this.lastSay = this.clock;
    this.game.events.emit('ui:subtitle', { text: line ?? this.rng.pick(DOCTOR), speaker: 'Glaucus', duration: 3 });
  }

  private end(now: boolean) {
    const sp = this.spar;
    if (!sp) return;
    for (const c of [sp.a, sp.b]) this.game.combat?.despawn(c);
    this.spar = null;
    this.nextAt = this.clock + (now ? 20 : 25 + this.rng.next() * 25);
  }

  dispose() {
    this.end(true);
  }
}
