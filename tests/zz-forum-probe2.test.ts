import { it } from 'vitest';
import { capitalPieces } from '../src/arch/classical/capitals';
it('probe2', () => {
  const out: string[] = [];
  for (const order of ['corinthian', 'ionic', 'composite', 'doric', 'tuscan'] as const) for (const d of ['high', 'low'] as const) {
    const pcs = capitalPieces(order, { D: 0.87, d: 0.74, height: 1.0, detail: d });
    let n = 0; for (const p of pcs) n += (p.geometry.index ? p.geometry.index.count : p.geometry.getAttribute('position').count) / 3;
    out.push(`${order} cap ${d}: ${n}`);
  }
  console.log(out.join('\n'));
});
