/**
 * The Capitoline and the Imperial Fora as places (capfora crew): the walled fora are entered and
 * discovered by stepping inside their outlines, so the long narrow precincts side by side don't
 * claim each other's ground; the Subura's banner stays in the Subura; the Temple of Veiovis stands
 * clear of the Tabularium.
 */
import { describe, expect, it } from 'vitest';
import { LANDMARK_BY_ID, type Landmark } from '../src/data/atlas';
import { landmarkSightings, nextSighting } from '../src/game/discovery';
import { atlasLocations, footprintOutline, insidePolygon, isEnclosure } from '../src/game/locations';
import { toGame } from '../src/world/coords';
import { LocationRegistry } from '../src/world/locations';

const FORA = ['forum-caesar', 'forum-augustus', 'forum-nerva', 'templum-pacis'];

/** A landmark-local point (real metres from the centre, facade towards −z) in game metres. */
function at(id: string, lx = 0, lz = 0): { x: number; z: number } {
  const lm = LANDMARK_BY_ID[id];
  const th = (lm.rotation * Math.PI) / 180;
  const [x, z] = toGame(lm.center[0] + lx * Math.cos(th) - lz * Math.sin(th), lm.center[1] + lx * Math.sin(th) + lz * Math.cos(th));
  return { x, z };
}

function registry() {
  const r = new LocationRegistry();
  r.add(atlasLocations());
  return r;
}

describe('the walled fora as places', () => {
  it('are enclosures with an outline', () => {
    for (const id of FORA) {
      const lm = LANDMARK_BY_ID[id];
      expect(isEnclosure(lm), id).toBe(true);
      const loc = atlasLocations().find((d) => d.id === id)!;
      expect(loc.area?.length, id).toBe(4);
    }
  });

  it('standing in one forum is not being in its neighbour', () => {
    const r = registry();
    const fora = (p: { x: number; z: number }) => r.containing(p).map((d) => d.id).filter((id) => FORA.includes(id) || id === 'forum-trajan');
    expect(fora(at('forum-caesar'))).toEqual(['forum-caesar']);
    // Along the Forum of Caesar's NE portico, close to the Fora of Nerva and Augustus.
    expect(fora(at('forum-caesar', -30, -60))).toEqual(['forum-caesar']);
    expect(fora(at('forum-nerva'))).toEqual(['forum-nerva']);
    expect(fora(at('forum-nerva', 0, -60))).toEqual(['forum-nerva']);
    expect(fora(at('forum-augustus'))).toEqual(['forum-augustus']);
    expect(fora(at('templum-pacis'))).toEqual(['templum-pacis']);
  });

  it('is entered once and left past a small margin', () => {
    const r = new LocationRegistry();
    r.add(atlasLocations().filter((d) => d.id === 'forum-nerva'));
    const lm = LANDMARK_BY_ID['forum-nerva'];
    const w = lm.footprint.kind === 'rect' ? lm.footprint.w : 0;
    r.check(at('forum-nerva', 0, 0));
    expect(r.isInside('forum-nerva')).toBe(true);
    r.check(at('forum-nerva', w / 2 + 1.5, 0));
    expect(r.isInside('forum-nerva')).toBe(true);
    r.check(at('forum-nerva', w / 2 + 8, 0));
    expect(r.isInside('forum-nerva')).toBe(false);
  });

  it('a walk down the Forum of Caesar announces Caesar first and none of its neighbours', () => {
    const sightings = landmarkSightings();
    const seen = new Set<string>();
    for (let lz = -70; lz <= 50; lz += 5) {
      const p = at('forum-caesar', -8, lz);
      const s = nextSighting(p.x, p.z, sightings, (id) => seen.has(id));
      if (s) seen.add(s.id);
      if (seen.size === 1) expect([...seen][0]).toBe('forum-caesar');
    }
    for (const id of ['forum-nerva', 'forum-augustus', 'templum-pacis', 'forum-trajan']) expect(seen.has(id), id).toBe(false);
  });

  it('the Subura is not announced on the way into the Forum', () => {
    const sightings = landmarkSightings();
    const route = [
      [24, 120],
      [66, 6],
      [42, -73],
      [109, -50],
      [109, -101],
    ];
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1];
      const [bx, bz] = route[i];
      for (let t = 0; t <= 1; t += 0.05) {
        const s = nextSighting(ax + (bx - ax) * t, az + (bz - az) * t, sightings, (id) => id !== 'subura');
        expect(s?.id).not.toBe('subura');
      }
    }
  });
});

describe('the Temple of Veiovis', () => {
  const corners = (lm: Landmark) => footprintOutline(lm)!;
  it('stands outside the Tabularium, in the Asylum', () => {
    const v = LANDMARK_BY_ID['temple-veiovis'];
    const tab = corners(LANDMARK_BY_ID.tabularium);
    for (const [x, z] of corners(v)) expect(insidePolygon(x, z, tab)).toBe(false);
    for (const [x, z] of tab) expect(insidePolygon(x, z, corners(v))).toBe(false);
    expect(v.within).toBe('asylum');
  });
});
