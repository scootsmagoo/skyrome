import { describe, expect, it } from 'vitest';
import { LANDMARKS, LANDMARK_BY_ID } from '../src/data/atlas';
import { atlasLocations, displayLatin, displayName, hillLocation, iconFor, landmarkLocation, lowlandLocations, mapName, markerFor, namedHills } from '../src/game/locations';
import { allSightings, landmarkSightings, nextSighting, sightRadius } from '../src/game/discovery';
import { toGame } from '../src/world/coords';
import { AtlasMapSource, landmarkShape, mapLandmarks, mapLabels } from '../src/game/mapSource';
import { footstepSurface } from '../src/game/audio';
import { WORLD_SCALE } from '../src/world/coords';

describe('atlas landmarks as discoverable locations (AC-12)', () => {
  const defs = atlasLocations();

  it('turns every atlas landmark into a location with a radius and a map marker', () => {
    expect(defs).toHaveLength(LANDMARKS.length);
    for (const d of defs) {
      expect(d.radius).toBeGreaterThanOrEqual(6);
      expect(Number.isFinite(d.position.x) && Number.isFinite(d.position.z)).toBe(true);
      expect(d.mapMarker).toBeTruthy();
    }
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
  });

  it('keeps the Latin name for the banner and converts to game meters', () => {
    const castor = landmarkLocation(LANDMARK_BY_ID['temple-castor-pollux']);
    expect(castor.latin).toBeTruthy();
    expect(castor.latin).not.toBe(castor.name);
    expect(castor.discoverable).toBe(true);
    const gate = landmarkLocation(LANDMARK_BY_ID['porta-capena'], () => 9.6);
    expect(gate.mapMarker).toBe('gate');
    expect(gate.position).toEqual({ x: 507 * WORLD_SCALE, y: 9.6, z: 955 * WORLD_SCALE });
    expect(landmarkLocation(LANDMARK_BY_ID.colosseum).mapMarker).toBe('arena');
  });

  it('maps categories to markers and icons', () => {
    expect(markerFor('temple')).toBe('temple');
    expect(markerFor('basilica')).toBe('forum');
    expect(markerFor('prison')).toBe('dungeon');
    expect(iconFor('theatre')).toBe('theatre');
    expect(iconFor('column')).toBe('monument');
    expect(iconFor('baths')).toBe('baths');
  });
});

describe('player-facing names (no atlas notes)', () => {
  it('strips parentheticals and slashes from banner names and Latin lines', () => {
    expect(displayName('The Subura (district anchor)')).toBe('The Subura');
    expect(displayName("Rostra (Speakers' Platform)")).toBe('Rostra');
    expect(displayLatin('Equus Domitiani (removed)')).toBe('Equus Domitiani');
    expect(displayLatin('Asylum / Inter duos lucos')).toBe('Asylum');
    expect(displayLatin('Forum Transitorium / Forum Nervae')).toBe('Forum Transitorium');
    expect(displayLatin('(Vatican necropolis)')).toBeUndefined();
    expect(displayLatin("Porticus Margaritaria (? = 'Horrea Vespasiani')")).toBe('Porticus Margaritaria');
    expect(displayLatin('Tabularium', 'Tabularium')).toBeUndefined();
  });

  it('keeps descriptive glosses on the map but drops research notes', () => {
    expect(mapName('Domus Augustana (private palace)')).toBe('Domus Augustana (private palace)');
    expect(mapName('The Subura (district anchor)')).toBe('The Subura');
    expect(mapName("Site of Domitian's Colossal Horse")).toBe("Site of Domitian's Colossal Horse");
    expect(mapName('Naumachia of Augustus (site)')).toBe('Naumachia of Augustus');
    expect(mapName('Pantheon of Agrippa (burned; rebuilding begins)')).toBe('Pantheon of Agrippa');
  });

  it('no registered location shows a parenthesis, a slash or a note', () => {
    for (const d of [...atlasLocations(), ...namedHills().map((h) => hillLocation(h)), ...lowlandLocations()]) {
      expect(d.name, d.id).not.toMatch(/[()]/);
      expect(d.name, d.id).not.toMatch(/anchor/i);
      if (d.latin) expect(d.latin, d.id).not.toMatch(/[()/?]/);
    }
    for (const l of mapLandmarks()) {
      expect(l.name, l.id).not.toMatch(/anchor|\(removed\)|\(site\)/i);
      if (l.latin) expect(l.latin, l.id).not.toMatch(/[()/]/);
    }
  });

  it('the Subura is a district, not a circle over the whole Forum', () => {
    const subura = landmarkLocation(LANDMARK_BY_ID.subura);
    expect(subura.name).toBe('The Subura');
    const toForum = Math.hypot(subura.position.x, subura.position.z);
    expect(subura.radius).toBeLessThan(toForum - 50);
  });
});

describe('the hills as places', () => {
  it('registers the named hills with their Latin names, not the terraces', () => {
    const hills = namedHills();
    const ids = hills.map((h) => h.id);
    expect(ids).toContain('palatine');
    expect(ids).toContain('aventine');
    expect(ids).toContain('caelian');
    expect(ids.some((id) => id.includes('-t'))).toBe(false);
    const pal = hillLocation(hills.find((h) => h.id === 'palatine')!);
    expect(pal.latin).toBe('Mons Palatinus');
    expect(pal.mapMarker).toBeUndefined();
    expect(pal.radius).toBeGreaterThanOrEqual(20);
  });
});

describe('discovery on sight (AC-12)', () => {
  const sightings = allSightings();
  const gate = LANDMARK_BY_ID['porta-capena'];
  const [gx, gz] = toGame(gate.center[0], gate.center[1]);

  it('sees tier-1 landmarks from further away than tier 3, and the gate as you arrive', () => {
    expect(sightRadius(LANDMARK_BY_ID['domus-augustana'])).toBeGreaterThan(landmarkLocation(LANDMARK_BY_ID['domus-augustana']).radius + 40);
    expect(sightRadius(gate)).toBeGreaterThanOrEqual(22);
    expect(sightings.some((s) => s.id === 'domus-aurea-buried')).toBe(false);
  });

  it('the Porta Capena comes first at the spawn, then the hill above it', () => {
    const seen = new Set<string>();
    const first = nextSighting(gx - 7, gz - 8, sightings, (id) => seen.has(id));
    expect(first?.id).toBe('porta-capena');
  });

  it('walking the Circus valley under the Palatine finds a place every few dozen metres', () => {
    // The golden path's street along the Circus (GDD §17.2), game meters.
    const route: [number, number][] = [[298, 565], [249, 503], [170, 448], [98, 394], [20, 335], [-50, 280], [-44, 262], [-27, 187], [27, 84], [48, 60], [10, 8]];
    const seen = new Set<string>();
    const found: number[] = [];
    let walked = 0;
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1];
      const [bx, bz] = route[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d < len; d += 5, walked += 5) {
        const s = nextSighting(ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len, sightings, (id) => seen.has(id));
        if (s) {
          seen.add(s.id);
          found.push(walked);
        }
      }
    }
    expect(seen.has('palatine')).toBe(true);
    expect(seen.has('circus-maximus')).toBe(true);
    expect(seen.has('area-velabrum')).toBe(true);
    expect(found.length).toBeGreaterThanOrEqual(15);
    // About half a minute at a run (4.4 m/s) at most between two new places.
    let gap = found[0];
    for (let i = 1; i < found.length; i++) gap = Math.max(gap, found[i] - found[i - 1]);
    expect(gap).toBeLessThan(150);
  });
});

describe('the map from the atlas', () => {
  it('draws every above-ground landmark with finite shapes', () => {
    const lms = mapLandmarks();
    expect(lms.length).toBe(LANDMARKS.filter((l) => l.siting !== 'underground').length);
    for (const l of lms) {
      for (const s of l.shapes) {
        const nums = s.kind === 'poly' ? s.points.flat() : Object.values(s).filter((v): v is number => typeof v === 'number');
        expect(nums.every(Number.isFinite), l.id).toBe(true);
      }
    }
  });

  it('keeps the atlas rotation convention for rectangles', () => {
    const lm = LANDMARK_BY_ID['temple-castor-pollux'];
    const s = landmarkShape(lm);
    expect(s.kind).toBe('rect');
    if (s.kind === 'rect') {
      expect(s.rot).toBe(lm.rotation);
      expect(s.x).toBeCloseTo(lm.center[0] * WORLD_SCALE);
    }
  });

  it('labels the hills and the Tiber', () => {
    const labels = mapLabels();
    expect(labels.some((l) => l.kind === 'hill')).toBe(true);
    expect(new Set(labels.filter((l) => l.kind === 'hill').map((l) => l.text)).size).toBe(labels.filter((l) => l.kind === 'hill').length);
    expect(labels.some((l) => l.kind === 'water' && l.text === 'Tiberis')).toBe(true);
  });

  it('lists places with live discovery and the player', () => {
    const discovered = new Set(['colosseum']);
    const src = new AtlasMapSource({
      locations: () => atlasLocations(),
      isDiscovered: (id) => discovered.has(id),
      player: () => ({ x: 1, z: 2, bearing: 90 }),
    });
    const locs = src.locations();
    expect(locs.find((l) => l.id === 'colosseum')?.discovered).toBe(true);
    expect(locs.find((l) => l.id === 'porta-capena')?.discovered).toBe(false);
    expect(locs.find((l) => l.id === 'porta-capena')?.icon).toBe('gate');
    expect(src.player()).toEqual({ x: 1, z: 2, bearing: 90 });
    // Buried places can't be found, so they are neither listed nor counted.
    expect(locs.some((l) => l.id === 'domus-aurea-buried')).toBe(false);
    expect(locs.length).toBe(LANDMARKS.filter((l) => l.siting !== 'underground').length);
    expect(src.roads.some((r) => r.rank === 'via')).toBe(true);
    expect(src.rivers[0].width).toBeGreaterThan(20);
    expect(src.bounds.maxX).toBeGreaterThan(src.bounds.minX);
  });
});

describe('footstep surfaces', () => {
  it('maps terrain surfaces, and anything built above the ground is stone', () => {
    expect(footstepSurface('grass', 0)).toBe('grass');
    expect(footstepSurface('paved', 0)).toBe('stone');
    expect(footstepSurface('sand', 0)).toBe('gravel');
    expect(footstepSurface('water', 0)).toBe('water');
    expect(footstepSurface('gravel', 0)).toBe('gravel');
    expect(footstepSurface('mud', 0)).toBe('dirt');
    expect(footstepSurface('rock', 0)).toBe('stone');
    expect(footstepSurface('dirt', 0)).toBe('dirt');
    expect(footstepSurface('grass', 0.6)).toBe('stone');
    expect(footstepSurface(null, 0)).toBe('stone');
  });
});
