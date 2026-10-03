import * as THREE from 'three';
import { it } from 'vitest';
import { column } from '../src/arch/classical/column';
import { temple } from '../src/arch/classical/temple';
import { tholos } from '../src/arch/classical/tholos';
import { triumphalArch, arcade } from '../src/arch/classical/arch';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
function tri(b: MeshBuilder) { const g = b.build('t'); let n = 0; g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) n += m.geometry.getAttribute('position').count / 3; }); return n; }
it('probe', () => {
  const S = 0.6;
  const out: string[] = [];
  for (const [d, f] of [['high', true], ['high', false], ['low', true], ['low', false]] as const) {
    const b = new MeshBuilder(); column(b, { order: 'corinthian', D: 1.45 * S, height: 14.8 * S, fluted: f, detail: d }); out.push(`cor ${d} fl=${f}: ${tri(b)}`);
    const b2 = new MeshBuilder(); column(b2, { order: 'ionic', D: 1.2 * S, height: 11 * S, fluted: f, detail: d }); out.push(`ion ${d} fl=${f}: ${tri(b2)}`);
    const b3 = new MeshBuilder(); column(b3, { order: 'doric', D: 0.8, height: 5.4, fluted: f, detail: d, kind: 'engaged' }); out.push(`doric engaged ${d} fl=${f}: ${tri(b3)}`);
  }
  for (const d of ['high', 'low'] as const) {
    const b = new MeshBuilder(); const r = temple(b, { order: 'corinthian', plan: 'peripteral', front: 8, sides: 11, width: 30 * S, podiumHeight: 7 * S, stairs: 'sides', detail: d }); out.push(`castor ${d}: ${tri(b)} D=${r.layout.D.toFixed(2)} H=${r.layout.H.toFixed(2)} total=${r.layout.totalHeight.toFixed(1)} sty=${JSON.stringify(r.layout.stylobate)}`);
    const t = new MeshBuilder(); const tr = tholos(t, { radius: 6.2 * S, columns: 20, baseHeight: 3 * S, detail: d }); out.push(`vesta ${d}: ${tri(t)} h=${tr.height.toFixed(1)}`);
    const a = new MeshBuilder(); const ar = triumphalArch(a, { bays: 1, span: 5.36 * S, detail: d }); out.push(`titus ${d}: ${tri(a)} w=${ar.width.toFixed(2)} d=${ar.depth.toFixed(2)} h=${ar.height.toFixed(2)}`);
    const c = new MeshBuilder(); arcade(c, { bays: 4, bay: 5 * S, pier: 1.6 * S, depth: 1.5, storeys: [{ order: 'doric', height: 9 * S }, { order: 'ionic', height: 8 * S, pedestal: 0.8 }], detail: d }); out.push(`arcade4 ${d}: ${tri(c)}`);
  }
  console.log(out.join('\n'));
});
