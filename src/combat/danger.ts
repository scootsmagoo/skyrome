/**
 * World danger (docs/GDD.md §13.3, docs/CONTENT.md §5.2 spawn bands): after dark the night band of
 * the Circus valley, the Velabrum and the Capena–Colosseum road brings out grassatores. A pair waits
 * by the street ahead of you; when you come near they step out and demand your purse ("Purse or
 * blood, friend"). Pay, and they melt back into the dark; refuse, walk on or draw steel, and it's a
 * fight (they flee at low health, §13.1). One encounter at a time, each street at most once a night
 * (counted once they step out), never during the story's opening night (Act I, chapters 1–3),
 * never while you are fighting, talking or in a menu, never in the
 * first 20 s of a game or the 20 s after a fight. A pair you walk past without meeting slips away
 * and frees the way for the next street.
 *
 *   game.combat.danger.enabled           off with the setting `combatStreetDanger: false`
 *   game.combat.danger.trigger(siteId)   stage one now (dev, tests: ?scene=rome&danger=<site id>)
 */
import * as THREE from 'three';
import type { Actor, IdleLoop } from '../actors/Actor';
import type { Game } from '../core/Game';
import { ROADS, type P2 } from '../data/atlas';
import { toGame } from '../world/coords';
import { ChoiceView } from './choice';
import type { Combatant } from './Combatant';
import type { CombatSystem } from './CombatSystem';
import { dist2D } from './geometry';

/** A place where muggers lurk at night: a point along an atlas street (t = 0 … 1 along it). */
export interface DangerSite {
  id: string;
  /** Where the player hears of it ("the street under the Palatine"). */
  where: string;
  road: string;
  t: number;
}

/** The v0.1 night sites (CONTENT.md §5.2: 2 pairs on the Circus north street, 1 on the Vicus Tuscus; §13.3 night band 2). */
export const DANGER_SITES: DangerSite[] = [
  { id: 'circus-north-capena', where: 'the street under the Palatine', road: 'street-north-of-circus', t: 0.78 },
  { id: 'circus-north-velabrum', where: 'the street under the Palatine', road: 'street-north-of-circus', t: 0.3 },
  { id: 'vicus-tuscus-south', where: 'the Vicus Tuscus', road: 'vicus-tuscus', t: 0.72 },
  { id: 'capena-colosseum', where: 'the road to the amphitheatre', road: 'road-between-palatine-and-caelian', t: 0.45 },
];

/** The muggers' night: dusk to first light (docs/GDD.md §17.2: dawn breaks at 06:10 on the first morning). */
export const NIGHT = { dusk: 19.5, firstLight: 6 + 10 / 60 };

/** Night for the muggers (the §13.3 night band, up to first light). */
export function isNight(hour: number): boolean {
  return hour < NIGHT.firstLight || hour >= NIGHT.dusk;
}

/** A point along a polyline of atlas points (real metres) at fraction t, in game metres, with the street's direction. */
export function roadPoint(points: readonly P2[], t: number): { x: number; z: number; dx: number; dz: number } {
  const g = points.map(([x, z]) => toGame(x, z));
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < g.length; i++) {
    const l = Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let want = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i] || i === lens.length - 1) {
      const f = lens[i] > 0 ? Math.min(1, want / lens[i]) : 0;
      const [ax, az] = g[i];
      const [bx, bz] = g[i + 1];
      const dx = (bx - ax) / (lens[i] || 1);
      const dz = (bz - az) / (lens[i] || 1);
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, dx, dz };
    }
    want -= lens[i];
  }
  const [x, z] = g[0];
  return { x, z, dx: 1, dz: 0 };
}

/** What the muggers ask: a quarter of the purse, at least 3 denarii, never more than you have. */
export function muggerPrice(purse: number): number {
  if (purse <= 0) return 0;
  return Math.min(purse, Math.max(3, Math.ceil(purse * 0.25)));
}

/** Where a site may come alive (m from the player): far enough not to see them arrive, near enough to meet them. */
export const SITE_BAND = { min: 40, max: 170, unseen: 80 };

export interface SiteCheck {
  night: boolean;
  dist: number;
  /** Cosine between the way the player is going (moving, else looking) and the way to the site. */
  ahead: number;
  /** Cosine between the camera's view and the way to the site. */
  facing: number;
  usedTonight: boolean;
  /** Recently walked past without meeting them. */
  cooling?: boolean;
  busy: boolean;
}

/**
 * Should a site come alive now? Pure, for tests: night, nothing else going on, not used tonight,
 * 40–170 m AHEAD of the player (within 60° of the way they are going, so they walk into it), and
 * out of sight: 80 m or more off in the dark, or off to the side of the view.
 */
export function siteReady(o: SiteCheck): boolean {
  if (!o.night || o.usedTonight || o.cooling || o.busy) return false;
  if (o.dist < SITE_BAND.min || o.dist > SITE_BAND.max) return false;
  if (o.ahead < 0.5) return false;
  return o.dist >= SITE_BAND.unseen || o.facing < Math.cos(35 * (Math.PI / 180));
}

/** Demand within this distance; give up when the player stays farther than `giveUp` for `giveUpS`. */
export const MUGGING = { stepOut: 14, demand: 5, close: 3, giveUp: 15, giveUpS: 3, passed: 15 };

type Phase = 'lurk' | 'approach' | 'demand' | 'leave' | 'fight' | 'over';

interface Encounter {
  site: DangerSite;
  at: { x: number; y: number; z: number };
  pair: Combatant[];
  phase: Phase;
  since: number;
  price: number;
  /** Closest the player has come while they lurk (walked past = a lot farther again). */
  minD: number;
  /** Since when the player has been out of their reach during the approach. */
  farSince: number | null;
}

const tmp = new THREE.Vector3();

export class StreetDanger {
  enabled = true;
  /** Seconds of play before the first encounter can come. */
  graceSeconds = 20;
  /** Seconds of quiet after any fight before muggers can come. */
  breatherSeconds = 20;
  private enc: Encounter | null = null;
  private used = new Map<string, number>();
  /** Sites walked past without meeting the pair: not again until this time (game.elapsed). */
  private cooling = new Map<string, number>();
  private nextCheck = 0;
  private playingSince: number | null = null;
  private lastBusyAt = -Infinity;
  /** The player's way over the last check (a 1 s position delta), for "ahead". */
  private lastPos = { x: NaN, z: NaN, at: 0 };
  private travel = { x: 0, z: 0, speed: 0 };

  constructor(
    private readonly game: Game,
    private readonly combat: CombatSystem,
  ) {}

  /** The active encounter's site id and phase (debug, tests). */
  get state(): { site: string; phase: Phase; pair: string[] } | null {
    const e = this.enc;
    return e ? { site: e.site.id, phase: e.phase, pair: e.pair.map((c) => c.id) } : null;
  }

  /** Stage an encounter at a site right now, ignoring the clock and the distance rules. */
  trigger(siteId: string, near?: { x: number; z: number }): boolean {
    const site = DANGER_SITES.find((s) => s.id === siteId);
    if (!site) return false;
    this.clear();
    return this.spawn(site, near);
  }

  private night(): boolean {
    return isNight(this.game.time.hour);
  }

  /** A night is the game day of its evening (so 04:30 belongs to the night that began at dusk). */
  private nightKey(): number {
    return Math.floor((this.game.time.totalHours - 12) / 24);
  }

  private playing(): boolean {
    const flow = (this.game as unknown as { flow?: { state?: string } }).flow;
    return !flow || flow.state === 'playing';
  }

  /**
   * The opening night of the story (Act I, chapters 1–3: the gate, the tablet, the Lemuria): the
   * muggers stay home, so every fight in it belongs to the story (docs/STORY.md rule 2).
   */
  private storyNight(): boolean {
    const q = this.game.quests;
    if (!q?.status) return false;
    return ['mq-01-madida-capena', 'mq-02-tabella', 'mq-03-lemuria'].some((id) => !!q.status(id)?.running);
  }

  private busy(): boolean {
    const g = this.game;
    if (this.combat.core.playerInCombat || !this.playing() || this.storyNight()) return true;
    if (g.ui?.top) return true;
    // Another fight nearby (a quest's, the watch's).
    return this.combat.core.list.some((c) => !c.isPlayer && c.active && !!c.target);
  }

  /** Every frame: advance the encounter; once a second, maybe start one. */
  update() {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    if (!this.playing()) this.playingSince = null;
    else this.playingSince ??= g.elapsed;
    const e = this.enc;
    if (e) {
      this.advance(e);
      return;
    }
    if (!this.enabled || !this.combat.settings().streetDanger) return;
    if (g.elapsed < this.nextCheck) return;
    this.nextCheck = g.elapsed + 1;
    this.trackTravel(p.position.x, p.position.z, g.elapsed);
    const busy = this.busy();
    if (busy) this.lastBusyAt = g.elapsed;
    if (this.playingSince === null || g.elapsed - this.playingSince < this.graceSeconds) return;
    if (g.elapsed - this.lastBusyAt < this.breatherSeconds) return;
    const night = this.night();
    if (!night) return;
    const key = this.nightKey();
    g.camera.getWorldDirection(tmp);
    const cl = Math.hypot(tmp.x, tmp.z) || 1;
    const cam = { x: tmp.x / cl, z: tmp.z / cl };
    // The way the player is going: moving, else looking.
    const way = this.travel.speed > 0.8 ? this.travel : cam;
    for (const site of DANGER_SITES) {
      const pt = this.sitePoint(site);
      if (!pt) continue;
      const dx = pt.x - p.position.x;
      const dz = pt.z - p.position.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      const facing = (cam.x * dx + cam.z * dz) / dist;
      const ahead = (way.x * dx + way.z * dz) / dist;
      const cooling = (this.cooling.get(site.id) ?? -Infinity) > g.elapsed;
      if (!siteReady({ night, dist, ahead, facing, usedTonight: this.used.get(site.id) === key, cooling, busy })) continue;
      if (this.watchNear(pt)) continue;
      if (this.spawn(site)) return;
      // No room beside the street there (buildings): try again in a while.
      this.cooling.set(site.id, g.elapsed + 30);
    }
  }

  private trackTravel(x: number, z: number, now: number) {
    const l = this.lastPos;
    const dt = now - l.at;
    if (Number.isFinite(l.x) && dt > 0.2) {
      const dx = x - l.x;
      const dz = z - l.z;
      const d = Math.hypot(dx, dz);
      this.travel.speed = d / dt;
      if (d > 1e-3) {
        this.travel.x = dx / d;
        this.travel.z = dz / d;
      }
    }
    l.x = x;
    l.z = z;
    l.at = now;
  }

  private sitePoint(site: DangerSite): { x: number; z: number; dx: number; dz: number } | null {
    const road = ROADS.find((r) => r.id === site.road);
    return road ? roadPoint(road.points, site.t) : null;
  }

  /** §13.1: grassatores avoid anyone with a vigil within 20 m. */
  private watchNear(pt: { x: number; z: number }): boolean {
    for (const a of this.game.actors.near({ x: pt.x, y: 0, z: pt.z }, 20)) {
      const def = this.game.npcs?.get(a.id) ?? (a as Actor & { def?: { faction?: string } }).def;
      if (def?.faction === 'vigiles' || a.id.startsWith('vigil')) return true;
    }
    return false;
  }

  /** A ground point on (or just beside) the street, clear of buildings. */
  private groundAt(x: number, z: number): number | null {
    const g = this.game;
    const terrainY = g.terrain?.heightAt?.(x, z);
    const hit = g.physics.groundHeight(x, z, (terrainY ?? 40) + 30, 200);
    if (hit === null) return terrainY ?? null;
    // Something solid well above the ground (a building, a wall): not here.
    if (terrainY !== undefined && hit > terrainY + 0.9) return null;
    return hit;
  }

  private spawn(site: DangerSite, near?: { x: number; z: number }): boolean {
    let pt = this.sitePoint(site);
    if (!pt) return false;
    if (near) pt = { ...pt, x: near.x, z: near.z };
    // Two men a step apart beside the street, facing along it.
    const side = { x: -pt.dz, z: pt.dx };
    const spots: { x: number; y: number; z: number }[] = [];
    for (const [along, across] of [
      [0, 1.4],
      [1.6, 0.9],
      [-1.6, 0.9],
      [0, -1.4],
      [2.5, 0],
    ]) {
      const x = pt.x + pt.dx * along + side.x * across;
      const z = pt.z + pt.dz * along + side.z * across;
      const y = this.groundAt(x, z);
      if (y !== null) spots.push({ x, y: y + 0.05, z });
      if (spots.length === 2) break;
    }
    if (spots.length < 2) return false;
    const heading = Math.atan2(-side.x, -side.z);
    const pair = spots.map((s, i) =>
      this.combat.spawnEnemy('grassator', s, {
        id: `danger-${site.id}-${i}`,
        kit: i,
        heading,
        aggro: 0,
        group: `danger-${site.id}`,
        tags: ['grassator', 'street-danger'],
        lod: 'auto',
      }),
    );
    // Lurking: the danger director moves them until the talking is over.
    for (const [i, c] of pair.entries()) {
      c.driven = false;
      this.idle(c, i ? 'lean' : 'stand');
    }
    const p = this.game.player?.position;
    this.enc = { site, at: spots[0], pair, phase: 'lurk', since: this.game.elapsed, price: 0, minD: p ? dist2D(spots[0], p) : Infinity, farSince: null };
    return true;
  }

  /** The avatar's idle loop (lurking against a wall), or null for the normal stance. */
  private idle(c: Combatant, loop: IdleLoop | null) {
    const av = (c.body as unknown as { actor?: Actor }).actor?.avatar as { setIdleLoop?: (l: IdleLoop | null) => void } | null | undefined;
    av?.setIdleLoop?.(loop);
  }

  /** Steer the lurkers toward the player (fixed step, while they aren't fighting yet). */
  fixedUpdate(dt: number) {
    const e = this.enc;
    const p = this.game.player;
    if (!e || !p) return;
    if (e.phase !== 'approach' && e.phase !== 'leave' && e.phase !== 'demand' && e.phase !== 'lurk') return;
    for (const c of e.pair) {
      if (!c.active || c.driven) continue;
      const body = c.body;
      let wx = 0;
      let wz = 0;
      const dx = p.position.x - c.position.x;
      const dz = p.position.z - c.position.z;
      const d = Math.hypot(dx, dz) || 1;
      if (e.phase === 'approach' && d > 2.4) {
        // A brisk walk, hurrying when the mark is getting away.
        const v = d > 6 ? 3.4 : 2.2;
        wx = (dx / d) * v;
        wz = (dz / d) * v;
      } else if (e.phase === 'leave') {
        wx = (-dx / d) * 2.4;
        wz = (-dz / d) * 2.4;
      }
      if (e.phase === 'approach' || e.phase === 'demand') body.heading = Math.atan2(dx, dz);
      else if (e.phase === 'leave') body.heading = Math.atan2(-dx, -dz);
      body.move({ x: wx, z: wz }, dt, 8);
    }
  }

  private advance(e: Encounter) {
    const g = this.game;
    const p = g.player;
    const pc = this.combat.playerC;
    if (!p || !pc) return;
    const alive = e.pair.filter((c) => c.active);
    const lead = alive[0];
    // Over: everyone down or gone, or the player far away.
    const far = dist2D(e.at, p.position) > 200;
    if (!lead || (far && e.phase !== 'fight') || (far && !this.combat.core.playerInCombat)) {
      this.finish(e);
      return;
    }
    const d = dist2D(lead.position, p.position);
    const M = MUGGING;
    switch (e.phase) {
      case 'lurk':
        // They step out when you come near and they can see you; at dawn they slip away.
        if (!this.night() && d > 40) return this.finish(e, true);
        // Struck first while they wait: it's a fight.
        if (e.pair.some((c) => c.lastHitBy === pc.id)) return this.fight(e);
        if (d < M.stepOut && this.combat.core.sight(lead, pc)) {
          e.phase = 'approach';
          e.since = g.elapsed;
          e.farSince = null;
          // The street is spent for tonight once they have stepped out.
          this.used.set(e.site.id, this.nightKey());
          g.events.emit('ui:subtitle', { speaker: 'Grassator', text: 'You there. A word, friend.', duration: 2.5 });
          return;
        }
        // Walked past (or turned back): they slip away, and the next street ahead may have its pair.
        e.minD = Math.min(e.minD, d);
        if (d > e.minD + M.passed && d > 30) {
          this.cooling.set(e.site.id, g.elapsed + 120);
          return this.finish(e, true);
        }
        return;
      case 'approach':
        if (e.pair.some((c) => c.lastHitBy === pc.id) || pc.drawn) return this.fight(e, pc.drawn ? 'Steel, is it? Then blood.' : undefined);
        // The demand only face to face; a mark who keeps out of reach isn't worth the chase.
        if (d <= M.close || (d <= M.demand && g.elapsed - e.since > 8)) return this.demand(e);
        if (d > M.giveUp) {
          e.farSince ??= g.elapsed;
          if (g.elapsed - e.farSince > M.giveUpS) {
            g.events.emit('ui:subtitle', { speaker: 'Grassator', text: 'Run, then. The night is long.', duration: 2.5 });
            return this.finish(e, true);
          }
        } else e.farSince = null;
        return;
      case 'demand':
        // Walked off, or drew a blade, without an answer: they take that as a no.
        if (d > 9 || pc.drawn || e.pair.some((c) => c.lastHitBy === pc.id)) return this.fight(e, 'Then blood it is.');
        return;
      case 'leave':
        if (d > 30) this.finish(e, true);
        return;
      case 'fight':
        if (!alive.some((c) => c.target)) e.phase = 'over';
        return;
      case 'over':
        if (d > 40 || alive.every((c) => c.status !== 'active')) this.finish(e);
        return;
    }
  }

  private demand(e: Encounter) {
    const g = this.game;
    const inv = g.player?.inventory;
    const purse = inv?.denarii ?? 0;
    e.price = muggerPrice(purse);
    e.phase = 'demand';
    e.since = g.elapsed;
    const lead = e.pair[0];
    const ui = g.ui;
    if (!ui) return this.fight(e);
    const text = e.price > 0 ? `“Purse or blood, friend.” He weighs a knife in his hand. “${e.price} denarii and you walk on.”` : '“Purse or blood, friend.” He looks you over. “Nothing on you? Pity.”';
    ui.openDialogue(
      new ChoiceView(
        lead.id,
        lead.name,
        lead.title,
        text,
        [
          ...(e.price > 0 ? [{ text: `Pay ${e.price} denarii`, act: () => this.pay(e) }] : []),
          { text: e.price > 0 ? 'Refuse (fight)' : 'Then come and take it (fight)', act: () => this.fight(e, 'Then blood it is.') },
        ],
        () => this.fight(e, 'Then blood it is.'),
        'npc',
      ),
    );
  }

  private pay(e: Encounter) {
    const g = this.game;
    const inv = g.player?.inventory;
    if (inv && e.price > 0 && inv.spendDenarii(e.price)) {
      g.events.emit('ui:notify', { text: `You hand over ${e.price} denarii`, kind: 'warning' });
      g.events.emit('ui:subtitle', { speaker: 'Grassator', text: 'Wise. Walk on, and don’t look back.', duration: 3 });
    }
    e.phase = 'leave';
    e.since = g.elapsed;
  }

  private fight(e: Encounter, line?: string) {
    const pc = this.combat.playerC;
    if (!pc || e.phase === 'fight') return;
    if (this.game.ui?.isOpen('dialogue')) this.game.ui.close();
    if (line) this.game.events.emit('ui:subtitle', { speaker: 'Grassator', text: line, duration: 2.5 });
    e.phase = 'fight';
    for (const c of e.pair) {
      this.idle(c, null);
      if (c.active) this.combat.core.engage(c, pc);
    }
  }

  /** End the encounter; `vanish` removes the pair (they slipped away), else the bodies stay. */
  private finish(e: Encounter, vanish = false) {
    // A quiet spell before the next street's pair (as after any fight).
    if (e.phase !== 'lurk') this.lastBusyAt = this.game.elapsed;
    for (const c of e.pair) {
      if (vanish && c.status === 'active') this.combat.despawn(c);
      else if (c.status === 'active' && !c.target) c.driven = true; // the combat system's housekeeping takes them later
    }
    this.enc = null;
  }

  /** Remove the encounter (scene change, a new trigger). */
  clear() {
    const e = this.enc;
    if (!e) return;
    for (const c of e.pair) if (c.status === 'active' || c.status === 'fled') this.combat.despawn(c);
    this.enc = null;
  }
}
