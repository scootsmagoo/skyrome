import { afterAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { WORLD_SCALE } from '../src/world/coords';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import { bridgeLayoutFor } from '../src/world/bridges';
import { BRIDGE_STYLES } from '../src/world/bridges/specs';
import { setTerrainProfile } from '../src/world/terrain/profile';

const S = WORLD_SCALE;

/** Phase 4b B6: the Pons Cestius comes down to both banks on steps within a few metres of the atlas ends. */
describe('Pons Cestius approaches', () => {
  afterAll(() => setTerrainProfile('v2'));
  for (const prof of ['v2', 'v1'] as const) {
    it(`lands near both atlas ends (${prof})`, () => {
      setTerrainProfile(prof);
      const bounds = { minX: -720, maxX: -260, minZ: 80, maxZ: 620 };
      const hm = buildHeightmap({ ...atlas, bounds } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
      const br = atlas.BRIDGES.find((b) => b.id === 'pons-cestius')!;
      const { layout, length } = bridgeLayoutFor(br as never, hm, atlas.RIVERS[0] as never);
      expect(BRIDGE_STYLES['pons-cestius'].stairGrade).toBeGreaterThan(0.3);
      // The ramp feet are within 8 m of the atlas ends (the 0.19 ramps ran 18 m past the street end).
      expect(layout.start).toBeGreaterThan(-8);
      expect(layout.end).toBeLessThan(length + 8);
      void S;
    });
  }
});
