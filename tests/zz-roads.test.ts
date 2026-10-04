import * as THREE from 'three';
import { it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { Rng } from '../src/core/Rng';
import { bearingToRotationY } from '../src/core/math';
import { MeshBuilder, transformCollider, type ColliderSpec } from '../src/gfx/MeshBuilder';
import { toGame, WORLD_SCALE } from '../src/world/coords';
import { builderFor } from '../src/world/landmarks/registry';
import { landmarkPads } from '../src/world/rome/buildRome';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { ColliderProbe } from './helpers/colliderProbe';
const CUSTOM_MINE = /^(pantheon|basilica-neptune|mausoleum-augustus|ara-pacis|horologium-augusti|theatre-pompey|temple-venus-victrix|porticus-pompeiana|curia-pompey|largo-argentina-temples|stadium-domitian|odeum-domitian|theatre-balbus|crypta-balbi|baths-agrippa|stagnum-agrippae|baths-nero|thermae-suranae|saepta-julia|diribitorium|porticus-minucia-frumentaria|porticus-philippi|porticus-vipsania|iseum-campense|castra-praetoria|emporium|porticus-aemilia|horrea-galbana|horrea-lolliana|monte-testaccio|pyramid-cestius|privata-traiani|temple-diana-aventine|circus-vaticanus|vatican-obelisk|naumachia-traiani|naumachia-augusti)$/;
it('roads', () => {
  const hm = buildHeightmap({ ...atlas, bounds: atlas.CITY_BOUNDS } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  const all: (ColliderSpec & { id?: string })[] = [];
  const owner: string[] = [];
  for (const lm of atlas.LANDMARKS) {
    const b = builderFor(lm as never);
    if (!b) continue;
    const key = b.handles[0];
    if (!(key.startsWith('category:') && key !== 'category:*') && !CUSTOM_MINE.test(key)) continue;
    const [gx, gz] = toGame(lm.center[0], lm.center[1]);
    const baseY = hm.heightAt(gx, gz);
    const r0 = bearingToRotationY(lm.rotation);
    const ctx = { game: {} as never, lm: lm as never, S: WORLD_SCALE, rng: new Rng(`landmark:${lm.id}`), detail: (lm.priority <= 2 ? 'high' : 'low') as 'high', builder: () => new MeshBuilder(),
      groundAt: (lx: number, lz: number) => hm.heightAt(gx + lx * Math.cos(r0) + lz * Math.sin(r0), gz - lx * Math.sin(r0) + lz * Math.cos(r0)) - baseY };
    const r = b.build(ctx);
    const o = new THREE.Object3D(); o.position.set(gx, baseY, gz); o.rotation.y = r0; o.updateMatrixWorld(true);
    for (const c of r.colliders) { if (c.kind === 'trimesh') continue; all.push(transformCollider(c, o.matrixWorld)); owner.push(lm.id); }
  }
  const probe = new ColliderProbe(all);
  // map solid → owner via index
  const idx = new Map<object, string>(); probe.solids.forEach((s, i) => idx.set(s, owner[i]));
  const hits = new Map<string, { n: number; first: [number, number] }>();
  for (const road of atlas.ROADS) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = toGame(road.points[i][0], road.points[i][1]);
      const [bx, bz] = toGame(road.points[i + 1][0], road.points[i + 1][1]);
      const L = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < L; s += 1.5) {
        const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L;
        const y = hm.heightAt(x, z);
        for (const sol of probe.at(x, z, 0.3)) {
          if (sol.top > y + 0.5 && sol.bottom < y + 1.8) {
            const k = `${road.id} x ${idx.get(sol)}`;
            const h = hits.get(k) ?? { n: 0, first: [Math.round(x), Math.round(z)] };
            h.n++; hits.set(k, h);
            break;
          }
        }
      }
    }
  }
  const rows = [...hits.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${String(v.n).padStart(4)} ${k} @${v.first}`);
  require('fs').writeFileSync('/private/tmp/claude-502/-Users-amfalony1-projects/4f031671-8987-47ad-91d1-b5c5ab477912/scratchpad/roads.txt', rows.join('\n'));
}, 600000);
