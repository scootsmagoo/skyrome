import * as THREE from 'three';
import { it } from 'vitest';
import { temple } from '../src/arch/classical/temple';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
function tris(b: MeshBuilder) {
  let n = 0;
  b.build('t').traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += m.geometry.getAttribute('position').count / 3;
  });
  return n;
}
it('temple variants', () => {
  for (const [order, detail, fluted] of [['ionic', 'high', true], ['ionic', 'high', false], ['ionic', 'low', false], ['corinthian', 'high', false], ['corinthian', 'high', true], ['doric', 'high', false]] as const) {
    const b = new MeshBuilder();
    temple(b, { order, detail, fluted, front: 6, sides: 11, width: 9, plan: 'peripteral' });
    console.log(order, detail, fluted, tris(b));
  }
});
