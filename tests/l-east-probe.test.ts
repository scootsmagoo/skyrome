import { it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { WORLD_SCALE } from '../src/world/coords';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import { deckAt, layoutBridge } from '../src/world/bridges/layout';
import { styleFor } from '../src/world/bridges/specs';
import { setTerrainProfile } from '../src/world/terrain/profile';

const S = WORLD_SCALE;

for (const prof of ['v2', 'v1'] as const) {
  it(`probe cestius ${prof}`, () => {
    setTerrainProfile(prof);
    const bounds = { minX: -720, maxX: -260, minZ: 80, maxZ: 620 };
    const hm = buildHeightmap({ ...atlas, bounds } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
    const waterY = hm.waterLevelY;
    const out: string[] = [`profile ${prof} waterY ${waterY.toFixed(2)}`];
    for (const id of ['pons-cestius', 'pons-fabricius']) {
      const br = atlas.BRIDGES.find((b) => b.id === id)!;
      const ax = br.a[0] * S, az = br.a[1] * S;
      const bx = br.b[0] * S, bz = br.b[1] * S;
      const length = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / length, uz = (bz - az) / length;
      const ground = (u: number) => hm.heightAt(ax + ux * u, az + uz * u);
      const st = styleFor(br.id, br.arches, br.length ?? length / S);
      const L = layoutBridge({ length, ground, waterY, S, arches: st, deckAbove: st.deckAbove, grade: 0.19 });
      out.push(`${id}: A=(${ax.toFixed(1)},${az.toFixed(1)}) B=(${bx.toFixed(1)},${bz.toFixed(1)}) len ${length.toFixed(1)} start ${L.start} end ${L.end} crown ${L.crown[1].toFixed(2)} arcade ${L.arcade.map((v) => v.toFixed(1)).join('..')}`);
      for (let u = L.start - 20; u <= L.end + 20; u += 4) {
        const x = ax + ux * u, z = az + uz * u;
        out.push(`  u ${u.toFixed(1).padStart(6)} x ${x.toFixed(1).padStart(7)} z ${z.toFixed(1).padStart(6)} ground ${ground(u).toFixed(2).padStart(6)} deck ${deckAt(L.deck, u).toFixed(2).padStart(6)}`);
      }
      // Across the deck at both ends: the ground 6 m either side of the axis.
      for (const u of [L.start, L.end]) {
        const x = ax + ux * u, z = az + uz * u;
        const px = -uz, pz = ux;
        out.push(`  end u ${u.toFixed(1)}: ground across ${[-8, -4, 0, 4, 8].map((v) => hm.heightAt(x + px * v, z + pz * v).toFixed(2)).join(' ')}`);
      }
    }
    // The B6 spot and the island.
    for (const [x, z] of [[-358.2, 190.8], [-345.7, 158], [-340, 160], [-330, 150]]) out.push(`  spot ${x},${z}: ground ${hm.heightAt(x, z).toFixed(2)}`);
    require('node:fs').appendFileSync('/private/tmp/claude-502/-Users-amfalony1-projects/4f031671-8987-47ad-91d1-b5c5ab477912/scratchpad/cestius.txt', out.join('\n') + '\n');
  });
}
