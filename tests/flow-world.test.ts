import { describe, expect, it } from 'vitest';
import { LANDMARKS, LANDMARK_BY_ID } from '../src/data/atlas';
import { atlasLocations, iconFor, landmarkLocation, markerFor } from '../src/game/locations';
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
    expect(footstepSurface('grass', 0.6)).toBe('stone');
    expect(footstepSurface(null, 0)).toBe('stone');
  });
});
