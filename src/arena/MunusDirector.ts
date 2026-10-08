/**
 * The games in the Flavian Amphitheatre (munus.ts has the programme and the card): on a games
 * day the stands fill from dawn, the plaza crowd streams in through the arches, practice pairs
 * warm the house up in the morning, and after the midday interval the cornu calls pair after
 * pair onto the sand: they walk in from the Porta Triumphalis, salute the editor's box, fight
 * until one raises a finger, and the crowd and the editor decide. In the evening the house
 * empties out into the plaza.
 *
 * Bouts are staged only while the player is near (they are real combatants); the stands are one
 * instanced crowd (spectators.ts). Ambient people keep off the sand and out of the cavea.
 *
 *   game.munus.status()         today's show, the phase, the current pair
 *   game.munus.nextBout()       call the next pair now (dev)
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { Rng } from '../core/Rng';
import type { Combatant } from '../combat/Combatant';
import type { NpcManager } from '../npc/NpcManager';
import type { Npc } from '../npc/Npc';
import type { CrowdRoleId } from '../npc/crowd/roles';
import { romanPosition, sunTimes } from '../npc/schedules';
import type { Zone } from '../audio/Ambience';
import type { PlacedLandmark } from '../world/landmarks/buildLandmarks';
import { COLOS, colosseumLayout, type ColosseumLayout } from '../world/landmarks/builders/colos-colosseum';
import { LUDUS_ARENA, ludusReach } from '../world/landmarks/builders/colos-ludus';
import { randomAppearance } from '../actors/avatar/variants';
import { attendance, boutsIn, introduce, munusOn, munusPhase, pairOf, STANTES_AFTER, verdictFor, type MunusDay, type MunusPhase, type Pair, type Verdict } from './munus';
import { ArenaCrowd, caveaSeats } from './spectators';

declare module '../core/Game' {
  interface Game {
    munus: MunusDirector;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    /** A bout in the amphitheatre ended (winner null: both sent off standing). */
    'munus:bout': { winner: string | null; loser: string | null; verdict: Verdict | 'killed' | null; lusio: boolean };
  }
}

type BoutState = 'idle' | 'enter' | 'salute' | 'fight' | 'decide' | 'exit';

interface Fighter {
  c: Combatant;
  name: string;
  /** Where to stand at the start (world). */
  mark: THREE.Vector3;
  gone: boolean;
}

interface Bout {
  pair: Pair;
  state: BoutState;
  a: Fighter;
  b: Fighter;
  t: number;
  /** When the current state's wait ends (director clock). */
  until: number;
  loser: Fighter | null;
  winner: Fighter | null;
  verdict: Verdict | null;
  /** The dead are carried off once nobody looks. */
  deadSince: number;
  /** The summa rudis: shadows the pair with his staff, steps in at the end. */
  referee: Npc | null;
}

/** Bouts (real combatants) only while the player is this close to the arena (m). */
const STAGE_R = 190;
/** …and everything is cleared beyond this. */
const CLEAR_R = 260;
/** The stands are built and drawn within this range. */
const CROWD_R = 520;

export class MunusDirector implements System {
  readonly name = 'munus';
  readonly priority = 62;
  enabled = true;
  private placed: PlacedLandmark | null = null;
  private layout: ColosseumLayout | null = null;
  private toLocal = new THREE.Matrix4();
  private crowd: ArenaCrowd | null = null;
  private zone: Zone | null = null;
  private clock = 0;
  private tick = 0;
  private rng = new Rng('munus');
  private day: MunusDay | null = null;
  private dayKey = '';
  private pos = 0;
  phase: MunusPhase = 'closed';
  private fill = 0;
  private excite = 0;
  private roar = 0;
  private lastRoarSound = -10;
  private bout: Bout | null = null;
  private nextBoutAt = 0;
  private boutNo = 0;
  private center = new THREE.Vector3();
  private arches: THREE.Vector3[] = [];
  private outside: THREE.Vector3[] = [];
  private entering = new Set<Npc>();
  private leaving = new Map<Npc, THREE.Vector3>();
  private offs: (() => void)[] = [];
  private tmp = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private lp = new THREE.Vector3();
  private lc = new THREE.Vector3();

  constructor(
    private readonly game: Game,
    private readonly pop: NpcManager | null,
  ) {
    this.offs.push(
      game.events.on('combat:hit', (e) => {
        const b = this.bout;
        if (!b || b.state !== 'fight') return;
        const ids = [b.a.c.id, b.b.c.id];
        if (!ids.includes(e.attackerId) || !ids.includes(e.targetId)) return;
        if (e.parried) this.cheer(0.12, 0.35);
        else if (e.blocked) this.cheer(0.05, 0.1);
        else this.cheer(e.power ? 0.22 : 0.12, e.power ? 0.7 : 0.35);
      }),
    );
  }

  // ---------------------------------------------------------------- setup (lazy: landmarks build after install)

  private setup(): boolean {
    if (this.placed) return true;
    const placed = this.game.landmarks?.get('colosseum');
    if (!placed) return false;
    this.placed = placed;
    this.layout = colosseumLayout();
    placed.object.updateMatrixWorld(true);
    this.toLocal.copy(placed.object.matrixWorld).invert();
    this.center.copy(this.spot('colos-arena-center') ?? placed.position);
    // Arch mouths of the numbered entrances (the axial four are for the emperor, the editor, the
    // fighters and the dead), and points out on the plaza in front of each.
    const L = this.layout;
    for (let k = 0; k < COLOS.bays; k++) {
      if (k % 20 === 0) continue;
      const t = L.centres[k];
      // On the threshold, outside: the ground-floor arcade is not on the crowd's nav grid.
      this.arches.push(this.world(L.oval.point(t, COLOS.xF + 0.8), 0.05));
      this.outside.push(this.world(L.oval.point(t, COLOS.xF + 14), 0.05));
    }
    // Nobody strolls on the sand or picnics in the cavea between shows; the Ludus court is the
    // school's own.
    const inner = COLOS.xF - 8;
    const a = L.oval.a;
    const b = L.oval.b;
    const m = this.toLocal;
    const p = new THREE.Vector3();
    this.offs.push(
      this.pop?.addNoGo((x, z) => {
        p.set(x, 0, z).applyMatrix4(m);
        return (p.x / (a + inner)) ** 2 + (p.z / (b + inner)) ** 2 < 1;
      }) ?? (() => {}),
    );
    const ludus = this.game.landmarks?.get('ludus-magnus');
    const lc = ludus?.spots.find((s) => s.id === 'ludus-arena-center');
    if (ludus && lc) {
      const rot = ludus.rotationY;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const r = ludusReach();
      this.offs.push(
        this.pop?.addNoGo((x, z) => {
          const dx = x - lc.position.x;
          const dz = z - lc.position.z;
          // World → local (rotation.y = rot): lx = dx cos − dz sin, lz = dx sin + dz cos.
          const lx = dx * c - dz * s;
          const lz = dx * s + dz * c;
          return (lx / (LUDUS_ARENA.a + r)) ** 2 + (lz / (LUDUS_ARENA.b + r)) ** 2 < 1;
        }) ?? (() => {}),
      );
    }
    if (this.pop) {
      const prev = this.pop.crowdBoost;
      this.pop.crowdBoost = (x, z) => (prev ? prev(x, z) : 1) * this.boostAt(x, z);
    }
    const amb = this.game.audio?.ambience;
    if (amb) this.zone = amb.addZone({ center: this.center, radius: 46, fade: 70, layers: [{ id: 'arena', volume: 0 }], name: 'amphitheatre' });
    return true;
  }

  private world(p: readonly [number, number], y: number): THREE.Vector3 {
    return new THREE.Vector3(p[0], y, p[1]).applyMatrix4(this.placed!.object.matrixWorld);
  }

  private spot(id: string): THREE.Vector3 | null {
    const s = this.placed?.spots.find((x) => x.id === id);
    return s ? s.position.clone() : null;
  }

  private ensureCrowd() {
    if (this.crowd || !this.placed || !this.layout) return;
    const seats = caveaSeats(this.layout);
    this.crowd = new ArenaCrowd(seats, this.game.settings?.data.crowdDensity ?? 1);
    this.placed.object.add(this.crowd.group);
    this.crowd.group.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- the loop

  update(dt: number) {
    if (!this.enabled || !this.setup()) return;
    this.clock += dt;
    const pl = this.game.player?.position ?? null;
    const d = pl ? Math.hypot(pl.x - this.center.x, pl.z - this.center.z) : Infinity;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.5;
      this.readClock();
      this.flows(d);
    }
    // The house: fills and empties gradually (people take their time).
    const want = this.phase === 'closed' ? 0 : attendance(this.pos) * (this.day?.grand ? 1 : 0.9);
    this.fill += (want - this.fill) * Math.min(1, dt * 0.25);
    if (want === 0 && this.fill < 0.01) this.fill = 0;
    if (this.fill > 0 && d < CROWD_R) this.ensureCrowd();
    // Mood: the phase's base, a bout under way, and the swell after each blow.
    const base = this.phase === 'pompa' ? 0.55 : this.phase === 'pairs' ? 0.32 : this.phase === 'prolusio' ? 0.22 : 0.06;
    const fighting = this.bout && this.bout.state === 'fight' ? 0.2 : 0;
    this.excite = Math.max(base + fighting, this.excite - dt * 0.08);
    this.roar = Math.max(0, this.roar - dt * 0.45);
    if (this.crowd) {
      this.crowd.setFill(d < CROWD_R ? this.fill : 0);
      const b = this.bout;
      if (b && !b.a.gone && !b.b.gone) this.focus.copy(b.a.c.position).add(b.b.c.position).multiplyScalar(0.5);
      else this.focus.copy(this.center);
      const f = this.tmp.copy(this.focus).applyMatrix4(this.toLocal);
      const lp = pl ? this.lp.set(pl.x, pl.y, pl.z).applyMatrix4(this.toLocal) : null;
      const cam = this.game.camera.getWorldPosition(this.lc).applyMatrix4(this.toLocal);
      this.crowd.update(this.clock, Math.min(1, this.excite), Math.min(1, this.roar), f, lp, cam);
      // Outside and below the attic the facade hides the whole bowl: draw nobody.
      const L = this.layout!;
      const r = COLOS.xF + 1;
      const outside = (cam.x / (L.oval.a + r)) ** 2 + (cam.z / (L.oval.b + r)) ** 2 > 1;
      this.crowd.group.visible = !outside || cam.y > 24;
    }
    if (this.zone) this.zone.layers[0].volume = Math.min(1.2, this.fill * (0.55 + 0.75 * Math.min(1, this.excite + this.roar * 0.5)));
    this.stage(dt, d);
  }

  private readClock() {
    const t = this.game.time;
    const date = this.game.calendar?.date() ?? t.date();
    this.pos = romanPosition(t.hour, sunTimes(date));
    this.day = munusOn(date, t.dayIndex);
    this.dayKey = `${date.month}-${date.day}-${t.dayIndex}`;
    const phase: MunusPhase = this.day ? munusPhase(this.pos) : 'closed';
    if (phase !== this.phase) {
      const was = this.phase;
      this.phase = phase;
      this.onPhase(was, phase);
    }
  }

  private onPhase(_was: MunusPhase, now: MunusPhase) {
    if (now === 'pompa') {
      this.horn();
      this.herald('The pompa! The lictors, the trumpeters, the editor’s litter — and the gladiators in their purple cloaks, round the sand. The arms are tested before the editor.', 7);
      this.cheer(0.4, 0.8);
    }
    if (now === 'pairs') this.nextBoutAt = this.clock + 6;
    if (now === 'prolusio') this.nextBoutAt = this.clock + 10;
    if (now === 'meridies') this.herald('The midday interval: the sand is raked, and half the house goes looking for lunch.', 5);
  }

  /** The crowd near the Colosseum on a games day: more people out, streaming in and out. */
  private boostAt(x: number, z: number): number {
    if (this.phase === 'closed' || !this.placed) return 1;
    const d = Math.hypot(x - this.center.x, z - this.center.z);
    if (d > 160) return 1;
    const k = this.phase === 'gates' || this.phase === 'exit' ? 1.7 : this.phase === 'meridies' ? 1.4 : 1.15;
    return 1 + (k - 1) * Math.min(1, (160 - d) / 60);
  }

  // ---------------------------------------------------------------- flows in and out

  private nearestArch(x: number, z: number): number {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < this.arches.length; i++) {
      const d = Math.hypot(this.arches[i].x - x, this.arches[i].z - z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  }

  private flows(d: number) {
    const pop = this.pop;
    if (!pop) return;
    // Arrivals vanish inside the arches; leavers step clear of the facade and go about their day.
    for (const n of [...this.entering]) {
      if (n.dead || !pop.get(n.id)) {
        this.entering.delete(n);
        continue;
      }
      const i = this.nearestArch(n.position.x, n.position.z);
      if (Math.hypot(this.arches[i].x - n.position.x, this.arches[i].z - n.position.z) < 1.8) {
        this.entering.delete(n);
        pop.despawn(n);
      }
    }
    for (const [n, to] of [...this.leaving]) {
      if (n.dead || !pop.get(n.id)) {
        this.leaving.delete(n);
        continue;
      }
      if (Math.hypot(to.x - n.position.x, to.z - n.position.z) < 2.5) {
        this.leaving.delete(n);
        pop.undirect(n);
      }
    }
    if (d > 170 || this.phase === 'closed') return;
    const arriving = this.phase === 'gates' || this.phase === 'prolusio' || this.phase === 'pompa' || (this.phase === 'meridies' && this.pos > 6.3);
    if (arriving && this.entering.size < 10) {
      // Some of the people about the plaza turn for the nearest arch.
      for (const n of pop.near(this.center, 120)) {
        if (this.entering.size >= 10) break;
        if (!n.ambient || n.scripted || n.station || n.leader || n.followers.length || n.dead || n.isFighting() || n.brain?.activity === 'home') continue;
        if (n.role?.id === 'vigil' || n.role?.id === 'soldier' || n.role?.id === 'carter' || n.role?.id === 'beggar') continue;
        const dc = Math.hypot(n.position.x - this.center.x, n.position.z - this.center.z);
        if (dc < 50 || !this.rng.chance(0.18)) continue;
        const a = this.arches[this.nearestArch(n.position.x, n.position.z)];
        if (pop.direct(n, a.x, a.z, n.walkSpeed * 1.05, 1.2)) this.entering.add(n);
      }
    }
    const leaving = this.phase === 'exit' || (this.phase === 'meridies' && this.pos < 6.2);
    if (leaving && this.leaving.size < 14 && this.rng.chance(this.phase === 'exit' ? 0.9 : 0.35)) {
      const roles: CrowdRoleId[] = ['citizen', 'citizen', 'citizen-woman', 'idler', 'artisan', 'merchant', 'foreigner', 'child'];
      const i = this.rng.int(0, this.arches.length - 1);
      const a = this.arches[i];
      const pl = this.game.player?.position;
      if (pl && Math.hypot(a.x - pl.x, a.z - pl.z) < 6) return;
      const n = pop.spawnAmbient(this.rng.pick(roles), a.x, a.z, Math.atan2(this.outside[i].x - a.x, this.outside[i].z - a.z), { escorts: false });
      if (!n) return;
      const to = this.outside[i].clone();
      to.x += this.rng.range(-6, 6);
      to.z += this.rng.range(-6, 6);
      if (pop.direct(n, to.x, to.z, n.walkSpeed, 2)) this.leaving.set(n, to);
    }
  }

  // ---------------------------------------------------------------- bouts

  private stage(dt: number, d: number) {
    const b = this.bout;
    if (b && (d > CLEAR_R || this.phase === 'closed')) {
      this.endBout(true);
      return;
    }
    if (!b) {
      const kind = boutsIn(this.phase);
      if (kind && d < STAGE_R && this.clock >= this.nextBoutAt && this.game.combat) this.startBout(kind === 'lusio');
      return;
    }
    b.t += dt;
    if (this.tick === 0.5) this.steerReferee(b);
    const core = this.game.combat.core;
    const A = b.a.c;
    const B = b.b.c;
    switch (b.state) {
      case 'enter':
        if ((!A.march && !B.march) || this.clock > b.until) {
          // Face the editor's box for the salute.
          const box = this.spot('colos-pulvinar') ?? this.center;
          for (const f of [b.a, b.b]) f.c.march = { x: f.c.position.x, z: f.c.position.z, speed: 1, face: Math.atan2(box.x - f.c.position.x, box.z - f.c.position.z) };
          b.state = 'salute';
          b.until = this.clock + 3;
        }
        break;
      case 'salute':
        if (this.clock > b.until) {
          for (const f of [b.a, b.b]) f.c.march = null;
          this.horn();
          core.engage(A, B);
          core.engage(B, A);
          b.state = 'fight';
          b.t = 0;
          this.cheer(0.3, 0.6);
        }
        break;
      case 'fight': {
        const down = [b.a, b.b].find((f) => f.c.status !== 'active');
        if (down) {
          const other = down === b.a ? b.b : b.a;
          b.loser = down;
          b.winner = other;
          if (down.c.status === 'yielded') {
            const foughtWell = b.t > 25 && down.c.lastAttackAt > 0;
            b.verdict = verdictFor({ lusio: b.pair.lusio, foughtWell, grand: !!this.day?.grand }, this.rng.next());
            b.state = 'decide';
            b.until = this.clock + 5;
            this.cheer(0.5, 1);
            this.crowdSay(b.verdict === 'mitte' ? (b.pair.lusio ? 'Habet! Habet!' : 'Mitte! Mitte!') : 'Iugula! Iugula!');
          } else {
            // Killed or knocked senseless outright.
            b.verdict = null;
            this.cheer(0.5, 1);
            this.finish(b, down.c.status === 'dead' ? 'killed' : 'mitte');
          }
        } else if (b.t > (b.pair.lusio ? STANTES_AFTER.lusio : STANTES_AFTER.ferrum)) {
          A.target = null;
          B.target = null;
          b.verdict = 'stantes';
          this.cheer(0.5, 1);
          this.herald(`Stantes missi! ${b.a.name} and ${b.b.name} are both sent away standing — the house is on its feet.`, 5);
          this.finish(b, 'stantes');
        }
        break;
      }
      case 'decide':
        if (this.clock > b.until && b.loser && b.winner) {
          if (b.verdict === 'iugula') {
            this.herald(`The editor turns his thumb. ${b.winner.name} gives the stroke.`, 4);
            b.winner.c.view?.play('attackPower');
            b.loser.c.status = 'active';
            core.kill(b.loser.c, b.winner.c);
            this.cheer(0.4, 1);
            this.finish(b, 'iugula');
          } else {
            this.herald(b.pair.lusio ? `${b.winner.name} has it. Both walk off to the cheers.` : `Missus! ${b.loser.name} is spared. The palm to ${b.winner.name}.`, 4);
            core.releaseYielded(b.loser.c);
            this.cheer(0.3, 0.7);
            this.finish(b, 'mitte');
          }
        }
        break;
      case 'exit': {
        const gate = this.spot('colos-porta-triumphalis') ?? this.center;
        for (const f of [b.a, b.b]) {
          if (f.gone) continue;
          const c = f.c;
          if (c.status === 'dead') {
            // The dead go out by the Porta Libitinensis on a litter: here, once nobody looks.
            if (b.deadSince === 0) b.deadSince = this.clock;
            const seen = this.pop?.isVisible(c.position.x, c.position.y + 0.5, c.position.z) ?? false;
            if ((this.clock - b.deadSince > 12 && !seen) || this.clock - b.deadSince > 50) this.remove(f);
            continue;
          }
          if (c.status === 'active' && !c.target && !c.march) c.march = { x: gate.x, z: gate.z, speed: 1.4 };
          if (Math.hypot(gate.x - c.position.x, gate.z - c.position.z) < 2 || this.clock > b.until) this.remove(f);
        }
        if (b.a.gone && b.b.gone) this.endBout(false);
        break;
      }
    }
  }

  private finish(b: Bout, verdict: Verdict | 'killed') {
    b.state = 'exit';
    b.until = this.clock + 45;
    const winner = verdict === 'stantes' ? null : b.winner;
    this.game.events.emit('munus:bout', { winner: winner?.name ?? null, loser: verdict === 'stantes' ? null : (b.loser?.name ?? null), verdict, lusio: b.pair.lusio });
  }

  /** Call the next pair now (dev). */
  nextBout(lusio = false): boolean {
    if (!this.setup() || !this.game.combat) return false;
    if (this.bout) this.endBout(true);
    this.startBout(lusio);
    return !!this.bout;
  }

  private startBout(lusio: boolean) {
    const combat = this.game.combat;
    const gate = this.spot('colos-porta-triumphalis');
    if (!gate || !this.layout) return;
    this.boutNo++;
    // The last pairs of the afternoon are the stars of the bill.
    const star = !lusio && this.pos > 9.6;
    const pair = pairOf(this.dayKey, this.boutNo, lusio, star);
    const mk = (g: Pair['a'], side: number): Fighter => {
      const mark = this.world([side * 4.2, 0], 0.05);
      const from = gate.clone();
      from.x += (this.rng.next() - 0.5) * 1.2;
      from.z += (this.rng.next() - 0.5) * 1.2;
      const c = combat.spawnEnemy(g.armatura, from, {
        name: g.name,
        tier: g.tier,
        lusio,
        team: `munus:${g.name}:${this.boutNo}`,
        group: `munus:${g.name}:${this.boutNo}`,
        aggro: 0,
        hostile: false,
        tags: ['munus'],
        yieldAt: lusio ? 0.45 : 0.3,
        heading: Math.atan2(mark.x - from.x, mark.z - from.z),
        seed: `${this.dayKey}:${g.name}`,
      });
      return { c, name: g.name, mark, gone: false };
    };
    const a = mk(pair.a, -1);
    const b = mk(pair.b, 1);
    a.c.march = { x: a.mark.x, z: a.mark.z, speed: 1.5, face: Math.atan2(b.mark.x - a.mark.x, b.mark.z - a.mark.z) };
    b.c.march = { x: b.mark.x, z: b.mark.z, speed: 1.5, face: Math.atan2(a.mark.x - b.mark.x, a.mark.z - b.mark.z) };
    this.bout = { pair, state: 'enter', a, b, t: 0, until: this.clock + 40, loser: null, winner: null, verdict: null, deadSince: 0, referee: this.spawnReferee(gate) };
    this.horn();
    this.herald(`${lusio ? 'A practice pair, with wooden arms: ' : ''}${introduce(pair.a)} — against ${introduce(pair.b)}!`, 6);
    this.cheer(0.3, 0.5);
  }

  /** The summa rudis in his white tunic with the two stripes, carrying the long staff. */
  private spawnReferee(at: THREE.Vector3): Npc | null {
    const pop = this.pop;
    if (!pop) return null;
    const app = randomAppearance(new Rng(`rudis:${this.dayKey}`), 'freedman');
    app.garments = [{ kind: 'tunica', color: '#eee8da', clavi: 'narrow', trim: '#8a2a2a' }, { kind: 'balteus', color: '#3b2a1c' }];
    app.weapon = 'fustis';
    app.footwear = 'barefoot';
    const n = pop.spawnAmbient('idler', at.x, at.z, 0, { escorts: false, appearance: app, noProp: true });
    if (!n) return null;
    n.name = 'Summa rudis';
    n.barkTable = 'rudis';
    return n;
  }

  /** Keep the referee a few paces off the pair, on the editor's side; out by the gate at the end. */
  private steerReferee(b: Bout) {
    const r = b.referee;
    const pop = this.pop;
    if (!r || !pop) return;
    if (r.dead || !pop.get(r.id)) {
      b.referee = null;
      return;
    }
    let x: number;
    let z: number;
    if (b.state === 'exit') {
      const gate = this.spot('colos-porta-triumphalis') ?? this.center;
      x = gate.x;
      z = gate.z;
      if (Math.hypot(x - r.position.x, z - r.position.z) < 2.2) {
        pop.despawn(r);
        b.referee = null;
        return;
      }
    } else {
      const A = b.a.c.position;
      const B = b.b.c.position;
      const mx = (A.x + B.x) / 2;
      const mz = (A.z + B.z) / 2;
      let px = -(B.z - A.z);
      let pz = B.x - A.x;
      const l = Math.hypot(px, pz) || 1;
      px /= l;
      pz /= l;
      // The side away from the player, so he isn't in the way of the view.
      const pl = this.game.player?.position;
      if (pl && (pl.x - mx) * px + (pl.z - mz) * pz > 0) {
        px = -px;
        pz = -pz;
      }
      x = mx + px * 3.6;
      z = mz + pz * 3.6;
      if (Math.hypot(x - r.position.x, z - r.position.z) < 1.2) return;
    }
    pop.direct(r, x, z, b.state === 'fight' ? 2.2 : 1.4, 0.8);
  }

  private remove(f: Fighter) {
    if (f.gone) return;
    f.gone = true;
    this.game.combat?.despawn(f.c);
  }

  private endBout(now: boolean) {
    const b = this.bout;
    if (!b) return;
    if (now || b.a.gone || b.b.gone) {
      this.remove(b.a);
      this.remove(b.b);
    }
    if (b.referee && this.pop?.get(b.referee.id)) this.pop.despawn(b.referee);
    this.bout = null;
    this.nextBoutAt = this.clock + (b.pair.lusio ? 14 : 20) + this.rng.next() * 18;
  }

  // ---------------------------------------------------------------- the crowd's voice

  private cheer(excite: number, roar: number) {
    this.excite = Math.min(1, this.excite + excite);
    this.roar = Math.min(1.2, Math.max(this.roar, roar));
    if (roar >= 0.6 && this.clock - this.lastRoarSound > 3.5 && this.fill > 0.1) {
      this.lastRoarSound = this.clock;
      this.game.audio?.play('amb.roar', { position: this.tmp.copy(this.center).setY(this.center.y + 8), volume: Math.min(1, 0.4 + this.fill) });
    }
  }

  private horn() {
    if (this.fill > 0.05) this.game.audio?.play('amb.cornu', { position: new THREE.Vector3(this.center.x, this.center.y + 4, this.center.z) });
  }

  /** Is the player in the house (or at the arena's edge)? Only then do the herald's words show. */
  private hearing(): boolean {
    const pl = this.game.player?.position;
    if (!pl || !this.placed) return false;
    const p = this.tmp.set(pl.x, pl.y, pl.z).applyMatrix4(this.toLocal);
    const L = this.layout!;
    const r = COLOS.xF + 2;
    return (p.x / (L.oval.a + r)) ** 2 + (p.z / (L.oval.b + r)) ** 2 < 1;
  }

  private herald(text: string, duration: number) {
    if (this.hearing()) this.game.events.emit('ui:subtitle', { text, speaker: 'The herald', duration });
  }

  private crowdSay(text: string) {
    if (this.hearing()) this.game.events.emit('ui:subtitle', { text, speaker: 'The crowd', duration: 3.5 });
  }

  /** Today's show and what's on the sand (dev / console). */
  status(): string {
    const b = this.bout;
    const day = this.day ? `${this.day.grand ? 'GRAND ' : ''}munus (${this.day.occasion})` : 'no games today';
    const pair = b ? `${b.a.name} v ${b.b.name} [${b.state}${b.pair.lusio ? ', lusio' : ''}]` : 'sand empty';
    return `${day} · ${this.phase} · pos ${this.pos.toFixed(2)} · house ${(this.fill * 100).toFixed(0)}% (${this.crowd?.count ?? 0}/${this.crowd?.capacity ?? 0}) · ${pair}`;
  }

  dispose() {
    this.endBout(true);
    for (const o of this.offs) o();
    this.offs.length = 0;
    this.zone?.remove();
    this.crowd?.dispose();
    this.crowd = null;
  }
}
