import * as THREE from 'three';
import { it } from 'vitest';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { arcadeBay, archway, colosseumStoreys, type ArcadeSpec } from '../src/arch/classical/arch';
import { column } from '../src/arch/classical/column';
import { togate, armoredEmperor } from '../src/arch/classical/statues';
import { cavea, ellipticalArcade } from '../src/arch/classical/amphitheatre';

function tris(b: MeshBuilder) {
  const g = b.build('x');
  let n = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += m.geometry.getAttribute('position').count / 3;
  });
  return Math.round(n);
}

it('probe kit triangle counts', () => {
  const st = colosseumStoreys(0.6);
  for (const det of ['high', 'low'] as const) {
    for (let si = 0; si < 4; si++) {
      for (const cd of ['high', 'low'] as const) {
        const b = new MeshBuilder();
        const spec: ArcadeSpec = { bays: 80, bay: 4.05, pier: 1.44, depth: 1.44, storeys: st, detail: det, columnDetail: cd, masts: true };
        arcadeBay(b, spec, si, 0, new THREE.Matrix4(), { window: true });
        console.log('bay', det, 'storey', si, 'col', cd, tris(b));
      }
    }
    for (const order of ['tuscan', 'ionic', 'corinthian'] as const) {
      for (const kind of ['engaged', 'pilaster', 'free'] as const) {
        const b = new MeshBuilder();
        column(b, { order, D: 0.5, height: 5, detail: det, kind });
        console.log('column', order, kind, det, tris(b));
      }
    }
    const b = new MeshBuilder();
    archway(b, { span: 2.6, springing: 2.9, pier: 0, depth: 1.44, top: 5.3, detail: det, leftPier: false, rightPier: false });
    console.log('archway', det, tris(b));
    const s = new MeshBuilder();
    togate(s, new THREE.Matrix4(), { detail: det });
    console.log('togate', det, tris(s));
    const s2 = new MeshBuilder();
    armoredEmperor(s2, new THREE.Matrix4(), { detail: det });
    console.log('emperor', det, tris(s2));
  }
  const K = 0.6;
  const b = new MeshBuilder();
  ellipticalArcade(b, { rx: 94 * K, rz: 78 * K, bays: 80, storeys: colosseumStoreys(K), depth: 2.4 * K, corridor: 6 * K, material: 'travertine', detail: 'low', masts: true });
  console.log('elliptical arcade low', tris(b));
  const c = new MeshBuilder();
  cavea(c, { arenaRx: 43 * K, arenaRz: 27 * K, podium: 4 * K, tiers: [{ rows: 6, rise: 0.4, depth: 0.7 }, { rows: 9, rise: 0.4, depth: 0.7, wall: 1.0 }, { rows: 5, rise: 0.4, depth: 0.7, wall: 1.0 }], segments: 96, aisles: 20, topPortico: { order: 'corinthian', columnHeight: 7 }, detail: 'high' });
  console.log('cavea', tris(c), 'colliders', c.colliders.length);
});
