import * as THREE from 'three';
import { it } from 'vitest';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { col } from '../src/world/landmarks/builders/forum-kit';
import { templeLayout } from '../src/arch/classical/temple';
function tri(b: MeshBuilder) { const g = b.build('t'); let n = 0; g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) n += m.geometry.getAttribute('position').count / 3; }); return n; }
it('probe4', () => {
  for (const tier of ['hero', 'mid', 'low'] as const) {
    const b = new MeshBuilder();
    col(b, { order: 'corinthian', D: 0.82, H: 8.88, tier, material: 'marble', kind: 'free', collide: true }, new THREE.Matrix4());
    console.log(tier, tri(b), b.colliders.length);
  }
  const L = templeLayout({ order: 'corinthian', plan: 'peripteral', front: 8, sides: 11, D: 0.82, columnHeight: 8.88, podiumHeight: 4.2, stairs: 'sides' });
  const zs = L.columns.map((c) => c.z);
  console.log('zmin', Math.min(...zs), 'count front', L.columns.filter((c) => Math.abs(c.z - Math.min(...zs)) < 1e-3).length, L.columns.length, L.columns.slice(0, 10));
});
