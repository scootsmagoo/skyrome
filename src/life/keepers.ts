/**
 * Keepers (docs/design/world-life.md §3.3): the named people who stand at station posts — the
 * wine-seller, the barber, the bath attendant. At install each KeeperDef becomes
 *
 *  - an NpcDef (no `home`, no `schedule`: only its station spawns it; tagged `keeper` and
 *    `vendor:<kind>` for a shop, so barter keys its merchant state by the keeper's id),
 *  - a person() conversation at priority 10 (a quest's dialogue for them takes over at 50+), with
 *    the life lines of talk.ts (services, bench, dice, jobs),
 *  - a binding on its station post: NpcManager.stationLife.keeperFor puts the keeper there instead
 *    of the ambient member, and a station defined inline ('st-life-…') is registered.
 *
 * The station's hours (`when`) are the shop's hours. While it is shut with the player near, the
 * stall stays out with its shutters up and the counter says "Closed · opens at the third hour"; a
 * dead keeper's shop is shut for good ("Closed. The keeper is dead."), with no successor.
 */
import * as THREE from 'three';
import type { Appearance } from '../actors/appearance';
import { randomAppearance } from '../actors/avatar/variants';
import { person } from '../content/people';
import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import type { Interactable } from '../interaction/Interactions';
import { dayPhase, type DayPhase } from '../npc/crowd/budget';
import { CROWD_ROLES } from '../npc/crowd/roles';
import { memberHeading, registerStations, STATIONS, stationAnchor, stationPoint, type StationDef, type StationDressing } from '../npc/crowd/stations';
import type { StationLife } from '../npc/NpcManager';
import { sunTimes, type SunTimes } from '../npc/schedules';
import type { NpcDef } from '../npc/types';
import { VENDORS } from '../rpg/data/vendors';
import { hash32 } from './rumours';
import { lifeChoices } from './talk';
import type { KeeperDef } from './types';

/** The phases of the Roman day in order, and the hour each begins at (crowd/budget.ts dayPhase). */
const PHASES: readonly DayPhase[] = ['salutatio', 'morning', 'midday', 'afternoon', 'evening', 'night', 'predawn'];
const OPENS: Record<DayPhase, string> = {
  salutatio: 'at the first hour',
  morning: 'at the third hour',
  midday: 'at the seventh hour',
  afternoon: 'at the ninth hour',
  evening: 'at the eleventh hour',
  night: 'at the first watch',
  predawn: 'at the fourth watch',
};

/** When a station with these hours next opens after `phase`: "at the third hour" (null: never). */
export function opensAfter(when: readonly DayPhase[], phase: DayPhase): string | null {
  const i = PHASES.indexOf(phase);
  for (let k = 1; k <= PHASES.length; k++) {
    const p = PHASES[(i + k) % PHASES.length];
    if (when.includes(p)) return OPENS[p];
  }
  return null;
}

/** How far from a shut post its counter prompt shows (m). */
const PROMPT_R = 60;

export interface KeeperRt {
  def: KeeperDef;
  station: StationDef;
  member: number;
  npc: NpcDef;
  /** The counter's "Closed" prompt (made on first need) and where it stands. */
  prompt: Interactable | null;
  at: THREE.Vector3 | null;
  registered: boolean;
  text: string;
}

export class Keepers {
  readonly list: KeeperRt[] = [];
  private readonly byId = new Map<string, KeeperRt>();
  private readonly byPost = new Map<string, KeeperRt>();
  private readonly byStation = new Map<string, KeeperRt[]>();
  /** Shutters per keeper station (made once). */
  private readonly closed = new Map<string, readonly StationDressing[]>();
  private sun: SunTimes | null = null;
  private sunDay = -1;

  constructor(
    private readonly game: Game,
    defs: readonly KeeperDef[],
    /** Is this keeper dead (shut for good)? */
    private readonly dead: (id: string) => boolean,
  ) {
    // Stations defined inline (a coppersmith's new post, the market stalls) join the city's.
    registerStations(defs.flatMap((k) => (typeof k.station === 'string' ? [] : [k.station])));
    for (const def of defs) {
      const station = typeof def.station === 'string' ? STATIONS.find((s) => s.id === def.station) : def.station;
      if (!station) {
        console.warn(`[life] keeper ${def.id}: no station '${String(def.station)}'`);
        continue;
      }
      const member = def.member ?? 0;
      if (!station.members[member]) {
        console.warn(`[life] keeper ${def.id}: station ${station.id} has no member ${member}`);
        continue;
      }
      const post = `${station.id}#${member}`;
      if (this.byPost.has(post)) {
        console.warn(`[life] keeper ${def.id}: ${post} is already ${this.byPost.get(post)!.def.id}'s`);
        continue;
      }
      const rt: KeeperRt = { def, station, member, npc: keeperNpc(def, station, member), prompt: null, at: null, registered: false, text: '' };
      this.list.push(rt);
      this.byId.set(def.id, rt);
      this.byPost.set(post, rt);
      const same = this.byStation.get(station.id);
      if (same) same.push(rt);
      else this.byStation.set(station.id, [rt]);
    }
    for (const [id, rts] of this.byStation) this.closed.set(id, shuttersFor(rts));
  }

  /** Register the keepers with the world: NPC definitions, conversations, the station hooks. */
  install() {
    const g = this.game;
    g.npcs?.add(this.list.map((k) => k.npc));
    for (const k of this.list) g.dialogue?.register(keeperDialogue(k.def));
    if (g.population) g.population.stationLife = this.stationLife();
  }

  get(id: string): KeeperRt | undefined {
    return this.byId.get(id);
  }

  /** The phase of the Roman day now (the crowd's own rule). */
  phase(): DayPhase {
    const t = this.game.time;
    if (!this.sun || this.sunDay !== t.dayIndex) {
      this.sunDay = t.dayIndex;
      this.sun = sunTimes(t.date());
    }
    return dayPhase(t.hour, this.sun);
  }

  /** The keeper is at their post now (station on duty, keeper alive). */
  isOpen(id: string): boolean {
    const k = this.byId.get(id);
    if (!k || this.dead(id)) return false;
    if (k.station.marketDay && !this.game.barter?.isMarketDay()) return false;
    return k.station.when.includes(this.phase());
  }

  /** "at the first hour" while shut; null when open, unknown, or shut for good. */
  opensAt(id: string): string | null {
    const k = this.byId.get(id);
    if (!k || this.dead(id) || this.isOpen(id)) return null;
    if (k.station.marketDay && !this.game.barter?.isMarketDay()) return 'on the next market day';
    return opensAfter(k.station.when, this.phase());
  }

  /** The keeper's post (game x, z), or null while the station has no anchor yet. */
  postOf(id: string): { x: number; z: number } | null {
    const k = this.byId.get(id);
    const a = k ? stationAnchor(k.station) : null;
    if (!k || !a) return null;
    const m = k.station.members[k.member];
    return stationPoint(a, m.out, m.side);
  }

  /** Where to stand to talk to the keeper (2.6 m in front of the post) and the post itself. */
  standFor(id: string): { stand: { x: number; z: number }; look: { x: number; z: number } } | null {
    const k = this.byId.get(id);
    const a = k ? stationAnchor(k.station) : null;
    if (!k || !a) return null;
    const m = k.station.members[k.member];
    const look = stationPoint(a, m.out, m.side);
    const h = memberHeading(a, k.station, m);
    return { stand: { x: look.x + Math.sin(h) * 2.6, z: look.z + Math.cos(h) * 2.6 }, look };
  }

  /** What the stations and the markers ask of the life module (NpcManager.stationLife). */
  stationLife(): StationLife {
    return {
      keeperFor: (def, i) => this.byPost.get(`${def.id}#${i}`)?.def.id ?? null,
      // Shut for good when every keeper of the station is dead (a baker can bake without his seller).
      shut: (def) => this.byStation.get(def.id)?.every((k) => this.dead(k.def.id)) ?? false,
      // Market stalls are simply not there on other days: no shutters.
      closedDressing: (def) => (def.marketDay ? null : (this.closed.get(def.id) ?? null)),
      postOf: (id) => this.postOf(id),
    };
  }

  /** Life interactables now registered (the counters' "Closed" prompts). */
  get registered(): number {
    let n = 0;
    for (const k of this.list) if (k.registered) n++;
    return n;
  }

  /**
   * The counters of shut shops near the player say why (2 Hz): "Closed · opens at the third hour",
   * or "Closed. The keeper is dead."
   */
  tick(px: number, pz: number) {
    const ia = this.game.interactions;
    if (!ia) return;
    for (const k of this.list) {
      const a = stationAnchor(k.station);
      const near = !!a && Math.hypot(a.x - px, a.z - pz) < PROMPT_R;
      // Market stalls aren't there on other days, so neither is a counter to read.
      const want = near && !this.isOpen(k.def.id) && (!k.station.marketDay || this.dead(k.def.id) || !!this.game.barter?.isMarketDay());
      if (want) {
        k.text = this.dead(k.def.id) ? 'Closed. The keeper is dead.' : `Closed · opens ${this.opensAt(k.def.id) ?? 'another day'}`;
        if (!k.registered && this.place(k)) {
          ia.add(k.prompt!);
          k.registered = true;
        }
      } else if (k.registered) {
        ia.remove(k.prompt!);
        k.registered = false;
      }
    }
  }

  /** Take every prompt away (dispose, a reload of the module). */
  clear() {
    for (const k of this.list) {
      if (k.registered) this.game.interactions?.remove(k.prompt!);
      k.registered = false;
    }
  }

  /** Where the counter prompt stands: the shutters, else the stall, else the keeper's post. */
  private place(k: KeeperRt): boolean {
    if (k.prompt) return true;
    const a = stationAnchor(k.station);
    if (!a) return false;
    const m = k.station.members[k.member];
    const d = this.closed.get(k.station.id)?.[0] ?? k.station.dressing?.[0];
    const p = d ? stationPoint(a, d.out, d.side) : stationPoint(a, m.out, m.side);
    const y = this.game.population?.floorY(p.x, p.z) ?? this.game.heightmap?.heightAt(p.x, p.z);
    if (y === null || y === undefined) return false;
    const at = (k.at = new THREE.Vector3(p.x, y + 1.0, p.z));
    k.prompt = {
      id: `life:closed:${k.def.id}`,
      position: () => at,
      reach: 3.4,
      verb: () => k.text,
      label: () => k.def.title,
      interact: (g) => g.ui?.flash(k.text),
    };
    return true;
  }
}

// ------------------------------------------------------------------ building a keeper

/** The NpcDef a keeper registers (its id is also the merchant id). */
export function keeperNpc(k: KeeperDef, station: StationDef, member: number): NpcDef {
  const role = station.members[member].role;
  const kind = k.shop ? VENDORS[k.shop.vendor] : undefined;
  let look: Appearance | undefined = k.appearance;
  return {
    id: k.id,
    name: k.name,
    title: k.title,
    // Seeded from the id and fitting the member's crowd role; made when the keeper first appears.
    get appearance(): Appearance {
      if (!look) {
        const roles = CROWD_ROLES[role]?.avatar ?? ['plebeian-man'];
        look = randomAppearance(new Rng(`keeper:${k.id}`), roles[hash32(k.id) % roles.length]);
      }
      return look;
    },
    barks: k.barks,
    disposition: 'neutral',
    tags: ['keeper', ...(k.shop ? [`vendor:${k.shop.vendor}`] : []), ...(k.tags ?? ['plebs'])],
    vendor: k.shop ? { stock: k.shop.stock, denarii: k.shop.purse ?? kind?.purse ?? 40, buys: k.shop.buys } : undefined,
  };
}

/** The keeper's conversation: their person() spec, the shop's trade while open, and the life lines. */
export function keeperDialogue(k: KeeperDef) {
  const life = lifeChoices(k.id);
  const open = (c: { game: Game }) => c.game.life?.isOpen(k.id) ?? true;
  const own = k.talk.trade;
  const trade = own ? { ...own, if: (c: Parameters<NonNullable<typeof own.if>>[0]) => open(c) && (own.if?.(c) ?? true) } : k.shop ? { ask: 'Show me your wares.', service: 'barter' as const, if: open } : undefined;
  return person({
    ...k.talk,
    id: k.id,
    npcs: [k.id],
    priority: 10,
    trade,
    choices: [...(k.talk.choices ?? []), ...life.choices],
    nodes: { ...(k.talk.nodes ?? {}), ...life.nodes },
  });
}

/**
 * The shutters for a keeper station: the keepers' own `closed` lists, or else one set of shutters
 * 0.9 m behind the first keeper's back (the shop front behind the counter), facing the street.
 */
function shuttersFor(rts: readonly KeeperRt[]): readonly StationDressing[] {
  const own = rts.flatMap((k) => k.def.closed ?? []);
  if (own.length || rts.some((k) => k.def.closed)) return own;
  const k = rts[0];
  const m = k.station.members[k.member];
  // The keeper's facing in the station's (out, side) frame: a heading `f` from 'out' is (cos f, −sin f).
  const f = facingFromOut(k.station, k.member);
  return [{ kind: 'shutters', out: m.out - 0.9 * Math.cos(f), side: m.side + 0.9 * Math.sin(f), turn: f }];
}

/** A member's facing as an angle from the station's 'out' (memberHeading without an anchor). */
function facingFromOut(st: StationDef, i: number): number {
  const m = st.members[i];
  const face = m.face ?? 'out';
  if (face === 'out') return 0;
  if (face === 'in') return Math.PI;
  if (typeof face === 'number') return face;
  // 'center': toward the first dressing, else the members' centroid (a unit frame does it).
  const unit = { x: 0, z: 0, ox: 0, oz: 1 };
  return memberHeading(unit, st, m);
}
