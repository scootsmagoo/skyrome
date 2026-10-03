import { it } from 'vitest';
import { makeTree, TREE_SPECIES } from '../src/arch/vegetation/species';
import { makeProp } from '../src/arch/props/props';
it('tree tris', () => {
  const t = (ps: any[]) => ps.reduce((s, p) => s + (p.geometry.index ? p.geometry.index.count : p.geometry.getAttribute('position').count) / 3, 0);
  for (const sp of TREE_SPECIES) {
    const m = makeTree(sp, 0);
    console.log(sp, 'near', t(m.near), 'parts', m.near.length, 'far', t(m.far), 'h', m.height.toFixed(1), 'r', m.radius.toFixed(1), m.near.map((p: any) => p.material).join(','));
  }
  for (const k of ['cart', 'amphora_stack', 'stall_fruit', 'bench_masonry', 'altar', 'statue_pedestal', 'herm', 'trough', 'crate', 'dolium', 'handcart'] as const) {
    const m = makeProp(k);
    console.log(k, m.parts.length, t(m.parts));
  }
});
