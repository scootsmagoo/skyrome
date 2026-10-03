/**
 * Activity spots near the player: where people pray, sit on steps, fill jars, listen at the
 * Rostra, stand guard, lean on a wall or keep a shop. They come from three sources, best first:
 *  1. the city's street spots (shop doors, stalls, workshops, benches, fountains, shrines, doors);
 *  2. the atlas points of interest (temple forecourts, basilica steps, fountains, the Rostra…);
 *  3. walls found by ray casts (lean spots; stand-ins for shops where there are no streets yet).
 * Spots are claimed by one NPC at a time and validated against the nav grid.
 */
import type { IdleLoop } from '../actors/Actor';
import type { Rng } from '../core/Rng';
import type { NavService } from '../ai/life/nav';
import type { StreetNav } from '../ai/life/streets';
import type { Poi, PoiKind } from './crowd/districts';
import type { PlaceKind } from './schedules';

export interface LifeSpot {
  id: string;
  kind: PlaceKind;
  x: number;
  z: number;
  /** Heading to face while idling here. */
  face: number;
  loop: IdleLoop;
  claimedBy: string | null;
  /** Name of the place (landmark) for flavour/debug. */
  place?: string;
  /** Needs a mason's block in front ('work'). */
  block?: boolean;
}

/** Ray caster used to find walls: returns the hit distance and the wall normal, or null. */
export type WallProbe = (x: number, y: number, z: number, dx: number, dz: number, max: number) => { dist: number; nx: number; nz: number } | null;

const STREET_KIND: Record<string, PlaceKind> = {
  shopDoor: 'shop',
  stall: 'stall',
  workshop: 'workshop',
  houseDoor: 'door',
  fountain: 'fountain',
  well: 'fountain',
  shrine: 'shrine',
  bench: 'steps',
};

export class SpotIndex {
  spots: LifeSpot[] = [];
  private cx = Infinity;
  private cz = Infinity;
  private age = 0;
  private claims = new Map<string, LifeSpot>();
  /** Radius of the indexed area around the player. */
  radius = 90;

  /** Rebuild if the player moved far or the index is stale. Returns true if rebuilt. */
  refresh(
    x: number,
    z: number,
    dt: number,
    nav: NavService,
    streets: StreetNav | null,
    rng: Rng,
    probe: WallProbe | null,
    floorY: (x: number, z: number) => number | null,
    pois: (x: number, z: number, r: number, kind?: PoiKind | readonly PoiKind[]) => Poi[] = () => [],
  ): boolean {
    this.age += dt;
    const moved = Math.hypot(x - this.cx, z - this.cz);
    if (moved < 25 && this.age < 12) return false;
    // Keep claimed spots (people are standing on them) and rebuild the rest.
    const keep = this.spots.filter((s) => s.claimedBy && Math.hypot(s.x - x, s.z - z) < this.radius + 30);
    const out: LifeSpot[] = [...keep];
    const ids = new Set(keep.map((s) => s.id));
    const add = (s: Omit<LifeSpot, 'claimedBy'>) => {
      if (ids.has(s.id)) return;
      if (Math.hypot(s.x - x, s.z - z) > this.radius) return;
      const g = nav.grid;
      if (g && g.ready(s.x, s.z) && !g.walkable(s.x, s.z)) return;
      ids.add(s.id);
      out.push({ ...s, claimedBy: null });
    };
    // 1. Street spots.
    if (streets) {
      for (const s of streets.spotsNear(x, z, this.radius)) {
        let kind = STREET_KIND[s.kind];
        if (!kind) continue;
        if (kind === 'shop' && s.tag && /thermopolium|popina|wine/.test(s.tag)) kind = 'tavern';
        const loop: IdleLoop = kind === 'shrine' ? 'pray' : kind === 'workshop' ? 'work' : s.kind === 'bench' ? 'sit' : kind === 'shop' ? 'stand' : 'stand';
        const face = kind === 'shrine' || kind === 'fountain' ? s.facing + Math.PI : s.facing;
        // Sitting: the root goes ~0.35 m in front of the seat line (avatar.md placement table).
        const off = loop === 'sit' ? 0.35 : 0;
        add({ id: `st:${s.id}`, kind, x: s.x + Math.sin(s.facing) * off, z: s.z + Math.cos(s.facing) * off, face, loop, place: s.tag, block: kind === 'workshop' });
      }
    }
    // 2. Atlas points of interest.
    for (const p of pois(x, z, this.radius)) this.fromPoi(p, rng, add);
    // 3. Walls: lean spots and stand-in shop fronts.
    if (probe && nav.grid) {
      let found = 0;
      for (let i = 0; i < 70 && found < 18; i++) {
        const c = nav.grid.randomWalkable(() => rng.next(), x, z, this.radius * 0.8, 3, 6);
        if (!c) continue;
        const y = floorY(c.x, c.z);
        if (y === null) continue;
        const a = rng.next() * Math.PI * 2;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        const hit = probe(c.x, y + 1.2, c.z, dx, dz, 6);
        if (!hit || hit.dist < 0.6) continue;
        const sx = c.x + dx * (hit.dist - 0.3);
        const sz = c.z + dz * (hit.dist - 0.3);
        if (!nav.grid.walkable(sx, sz)) continue;
        // The wall must also be there at head height and at knee height (not a low step or a beam).
        if (!probe(c.x, y + 0.6, c.z, dx, dz, hit.dist + 0.4) || !probe(c.x, y + 1.8, c.z, dx, dz, hit.dist + 0.4)) continue;
        const face = Math.atan2(hit.nx, hit.nz);
        const kind: PlaceKind = found % 3 === 0 ? 'stall' : found % 3 === 1 ? 'shop' : 'door';
        add({ id: `w:${Math.round(sx)}:${Math.round(sz)}`, kind, x: sx, z: sz, face, loop: kind === 'door' ? 'lean' : 'stand' });
        // A lean spot at the same wall for idlers.
        add({ id: `wl:${Math.round(sx)}:${Math.round(sz)}`, kind: 'open', x: sx + Math.cos(face) * 1.2, z: sz - Math.sin(face) * 1.2, face, loop: 'lean' });
        found++;
      }
    }
    this.spots = out;
    this.cx = x;
    this.cz = z;
    this.age = 0;
    return true;
  }

  private fromPoi(p: Poi, rng: Rng, add: (s: Omit<LifeSpot, 'claimedBy'>) => void) {
    const fwdX = Math.sin(p.face); // toward the building
    const fwdZ = Math.cos(p.face);
    const sideX = -fwdZ;
    const sideZ = fwdX;
    const at = (n: number, back: number, side: number) => ({ x: p.x - fwdX * back + sideX * side, z: p.z - fwdZ * back + sideZ * side, n });
    switch (p.kind) {
      case 'temple':
      case 'shrine':
      case 'vesta': {
        for (let i = 0; i < 6; i++) {
          const a = at(i, 1 + (i % 2) * 1.6, (i - 2.5) * 1.3);
          add({ id: `${p.id}:pray${i}`, kind: 'temple', x: a.x, z: a.z, face: p.face, loop: i % 3 === 2 ? 'stand' : 'pray', place: p.name });
        }
        if (p.kind === 'shrine') {
          const a = at(9, 0.5, 0);
          add({ id: `${p.id}:shrine`, kind: 'shrine', x: a.x, z: a.z, face: p.face, loop: 'pray', place: p.name });
        }
        break;
      }
      case 'steps': {
        for (let i = 0; i < 8; i++) {
          const a = at(i, 0.8, (i - 3.5) * 2.4);
          add({ id: `${p.id}:step${i}`, kind: 'steps', x: a.x, z: a.z, face: p.face + Math.PI, loop: i % 4 === 3 ? 'talk' : 'sitGround', place: p.name });
        }
        break;
      }
      case 'fountain': {
        for (let i = 0; i < 4; i++) {
          const ang = p.face + (i / 4) * Math.PI * 2;
          const r = 1.6;
          const x = p.x + Math.sin(ang) * r;
          const z = p.z + Math.cos(ang) * r;
          add({ id: `${p.id}:f${i}`, kind: 'fountain', x, z, face: Math.atan2(p.x - x, p.z - z), loop: 'stand', place: p.name });
        }
        break;
      }
      case 'rostra': {
        for (let i = 0; i < 10; i++) {
          const a = at(i, 4 + (i % 3) * 1.8, (i - 4.5) * 1.6);
          add({ id: `${p.id}:l${i}`, kind: 'rostra', x: a.x, z: a.z, face: p.face, loop: i % 4 === 0 ? 'talk' : 'stand', place: p.name });
        }
        break;
      }
      case 'curia': {
        for (const s of [-1, 1]) {
          const a = at(0, -0.5, s * 2.5);
          add({ id: `${p.id}:g${s}`, kind: 'curia', x: a.x, z: a.z, face: p.face + Math.PI, loop: 'guard', place: p.name });
        }
        for (let i = 0; i < 4; i++) {
          const a = at(i, 3 + i, (i - 1.5) * 2);
          add({ id: `${p.id}:t${i}`, kind: 'forum', x: a.x, z: a.z, face: p.face, loop: 'talk', place: p.name });
        }
        break;
      }
      case 'baths': {
        for (let i = 0; i < 4; i++) {
          const a = at(i, 2, (i - 1.5) * 2.2);
          add({ id: `${p.id}:b${i}`, kind: 'baths', x: a.x, z: a.z, face: p.face + Math.PI, loop: 'stand', place: p.name });
        }
        break;
      }
      case 'forum':
      case 'market': {
        for (let i = 0; i < 10; i++) {
          const ang = rng.next() * Math.PI * 2;
          const r = Math.sqrt(rng.next()) * p.radius;
          add({ id: `${p.id}:o${i}`, kind: p.kind === 'market' ? 'stall' : 'forum', x: p.x + Math.cos(ang) * r, z: p.z + Math.sin(ang) * r, face: rng.next() * Math.PI * 2, loop: i % 2 ? 'talk' : 'stand', place: p.name });
        }
        break;
      }
      case 'arch':
      case 'monument': {
        for (let i = 0; i < 2; i++) {
          const a = at(i, 2.5, (i - 0.5) * 3);
          add({ id: `${p.id}:m${i}`, kind: 'open', x: a.x, z: a.z, face: p.face, loop: 'stand', place: p.name });
        }
        break;
      }
    }
  }

  /** A free spot of a kind near a point (random among the nearest few), or null. */
  find(kind: PlaceKind | readonly PlaceKind[], x: number, z: number, r: number, rng: Rng): LifeSpot | null {
    const kinds = Array.isArray(kind) ? kind : [kind];
    const cand: [number, LifeSpot][] = [];
    for (const s of this.spots) {
      if (s.claimedBy || !kinds.includes(s.kind)) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d <= r) cand.push([d, s]);
    }
    if (!cand.length) return null;
    cand.sort((a, b) => a[0] - b[0]);
    return rng.pick(cand.slice(0, 4))[1];
  }

  claim(s: LifeSpot, id: string) {
    this.release(id);
    s.claimedBy = id;
    this.claims.set(id, s);
  }

  release(id: string) {
    const s = this.claims.get(id);
    if (s && s.claimedBy === id) s.claimedBy = null;
    this.claims.delete(id);
  }

  claimedBy(id: string): LifeSpot | undefined {
    return this.claims.get(id);
  }
}
