import { describe, it } from 'vitest';
import { fillBlock, planLots } from '../src/arch/fabric/blockFiller';
import type { Polygon } from '../src/arch/fabric/types';

const block: Polygon = [[0, 0], [60, 0], [62, 45], [3, 48]];
const slope = (x: number, z: number) => 0.05 * x - 0.03 * z + Math.sin(x / 9) * 0.4;

function tris(r: ReturnType<typeof fillBlock>) {
  const g = r.builder.build('x');
  let t = 0;
  g.traverse((o: any) => { if (o.isMesh) t += o.geometry.getAttribute('position').count / 3; });
  return { t, meshes: g.children.length };
}

describe('bench', () => {
  it('times', () => {
    for (const detail of ['full', 'mid', 'low'] as const) {
      const t0 = performance.now();
      let info: any;
      for (let i = 0; i < 5; i++) {
        const r = fillBlock(block, { heightAt: slope, seed: 9 + i, wealth: 0.4, density: 0.8, detail });
        const t1 = performance.now();
        info = tris(r);
        (info as any).buildMs = performance.now() - t1;
      }
      console.log(detail, ((performance.now() - t0) / 5).toFixed(1), 'ms/block', JSON.stringify(info));
    }
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) planLots(block, { seed: i, wealth: 0.4, density: 0.8 });
    console.log('planLots', ((performance.now() - t0) / 50).toFixed(2), 'ms');
  });
});
