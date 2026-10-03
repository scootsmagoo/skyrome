import * as THREE from 'three';
import { it } from 'vitest';
import { column } from '../src/arch/classical/column';
import { diameterForHeight } from '../src/arch/classical/orders';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { honorificColumn } from '../src/arch/classical/monuments';
import { equestrian, armoredEmperor, togate, quadriga } from '../src/arch/classical/statues';
import { basilica } from '../src/arch/classical/basilica';
import { triumphalArch } from '../src/arch/classical/arch';
import { entablature } from '../src/arch/classical/entablature';

function tri(b: MeshBuilder) {
  const g = b.build('t');
  let n = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += m.geometry.getAttribute('position').count / 3;
  });
  return n;
}
it('measure', () => {
  const out: string[] = [];
  for (const order of ['corinthian', 'composite', 'ionic', 'tuscan'] as const)
    for (const det of ['high', 'low'] as const)
      for (const fl of [false, true]) {
        const b = new MeshBuilder();
        const H = 5.5;
        column(b, { order, D: diameterForHeight(order, H), height: H, fluted: fl, detail: det });
        out.push(`${order} ${det} fl=${fl}: ${tri(b)}`);
      }
  for (const det of ['high', 'low'] as const) {
    let b = new MeshBuilder();
    honorificColumn(b, { height: 29.78 * 0.6, D: 3.69 * 0.6, detail: det });
    out.push(`honorific ${det}: ${tri(b)}`);
    b = new MeshBuilder();
    equestrian(b, new THREE.Matrix4(), { detail: det });
    out.push(`equestrian ${det}: ${tri(b)}`);
    b = new MeshBuilder();
    armoredEmperor(b, new THREE.Matrix4(), { detail: det });
    out.push(`emperor ${det}: ${tri(b)}`);
    b = new MeshBuilder();
    togate(b, new THREE.Matrix4(), { detail: det });
    out.push(`togate ${det}: ${tri(b)}`);
    b = new MeshBuilder();
    quadriga(b, new THREE.Matrix4(), { detail: det });
    out.push(`quadriga ${det}: ${tri(b)}`);
    b = new MeshBuilder();
    triumphalArch(b, { bays: 1, span: 4, detail: det });
    out.push(`arch1 ${det}: ${tri(b)}`);
    b = new MeshBuilder();
    basilica(b, { length: 117 * 0.6, naveWidth: 25 * 0.6, aisleWidth: 7.5 * 0.6, columnHeight: 6.5, apses: 'both', detail: det });
    out.push(`basilica ${det}: ${tri(b)}`);
    b = new MeshBuilder();
    entablature(b, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)], { order: 'corinthian', columnHeight: 5.5, D: 0.55, detail: det });
    out.push(`entab10m ${det}: ${tri(b)}`);
  }
  console.log(out.join('\n'));
});
