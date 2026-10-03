import { it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import { localFootprint } from '../src/world/landmarks/footprint';

const IDS = 'miliarium-aureum umbilicus-urbis rostra comitium-lapis-niger curia-julia janus-geminus temple-saturn temple-vespasian-titus temple-concord temple-divus-augustus basilica-julia basilica-aemilia temple-divus-julius arch-augustus arch-tiberius lacus-curtius equus-domitiani-site temple-castor-pollux lacus-juturnae temple-vesta regia atrium-vestae domitianic-vestibule porticus-margaritaria horrea-agrippiana shrine-venus-cloacina lacus-servilius volcanal tabularium porticus-dei-consentes carcer-tullianum fornix-fabianus arch-titus velia-vestibule colossus-sol horrea-piperataria temple-jupiter-stator'.split(' ');

it('probe3', () => {
  const S = 0.6;
  const b = atlas.CORE_BOUNDS;
  const lb = { minX: b.minX - 350, maxX: b.maxX + 350, minZ: b.minZ - 350, maxZ: b.maxZ + 350 };
  const hm = buildHeightmap({ ...atlas, bounds: { minX: -400, maxX: 700, minZ: -300, maxZ: 500 } } as any, { spacing: 2, pads: landmarkPads(lb) });
  const out: string[] = [];
  for (const id of IDS) {
    const lm = atlas.LANDMARK_BY_ID[id];
    const gx = lm.center[0] * S, gz = lm.center[1] * S;
    const base = hm.heightAt(gx, gz);
    const th = (lm.rotation * Math.PI) / 180;
    const cos = Math.cos(th), sin = Math.sin(th);
    // local (facade -z) -> world: atlas footprintPolygon uses tr(lx,lz) = [cx + lx cos - lz sin, cz + lx sin + lz cos]
    const g = (lx: number, lz: number) => hm.heightAt(gx + (lx * cos - lz * sin) * S, gz + (lx * sin + lz * cos) * S) - base;
    const fp = localFootprint(lm as any);
    let hw = 2, hd = 2;
    if (fp.kind === 'rect') { hw = fp.w / 2; hd = fp.d / 2; } else if (fp.kind === 'circle') { hw = hd = fp.r; }
    const samples = [[-hw, -hd], [0, -hd], [hw, -hd], [-hw, 0], [hw, 0], [-hw, hd], [0, hd], [hw, hd]].map(([x, z]) => g(x, z).toFixed(2));
    const front = g(0, -hd - 10).toFixed(2);
    out.push(`${id.padEnd(24)} rot=${String(lm.rotation).padStart(3)} base=${(base / S).toFixed(1)}m(y${base.toFixed(2)}) elev=${lm.baseElevation} corners[FL,F,FR,L,R,BL,B,BR]=${samples.join(',')} front10=${front}`);
  }
  console.log(out.join('\n'));
});
