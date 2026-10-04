/**
 * The ground the Colosseum-valley builders pave outside their atlas footprints (the amphitheatre's
 * plaza out to the cippi, the porches and forecourts of the two imperial baths) lies on the flat
 * building pad (`PAD_EXTRA` in buildRome.ts), so nothing is buried, nothing floats and the terrain
 * dressing (grass, kerbs) stays off the paving.
 */
import { describe, expect, it } from 'vitest';
import { COLOS, colosseumLayout } from '../src/world/landmarks/builders/colos-colosseum';
import { ctxFor } from './colos-ctx';

describe('building pads under the paved ground', () => {
  it('the Colosseum plaza, facade to kerb, is level with the arena pad (bar the arc under the Baths of Titus)', () => {
    const { oval } = colosseumLayout();
    const g = ctxFor('colosseum').groundAt;
    let worst = 0;
    let level = 0;
    const n = 160;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      // Parameters 4.4–5.3 face the terrace of the Baths of Titus (north): its foot meets the plaza
      // rim there and the paving stops at a kerb (ovalPaving's maxRise) instead of climbing it.
      if (t > 4.4 && t < 5.3) continue;
      for (let x = COLOS.xF + 0.85; x <= COLOS.xF + COLOS.cippi + 1.8; x += 0.9) {
        const [px, pz] = oval.point(t, x);
        worst = Math.max(worst, Math.abs(g(px, pz)));
      }
      level++;
    }
    expect(level).toBeGreaterThan(130);
    expect(worst).toBeLessThan(0.08);
  });

  it('the forecourt and porch of the Baths of Titus are level', () => {
    const g = ctxFor('baths-titus').groundAt;
    const hd = 36;
    // (east of x = 5 the platform of the Baths of Trajan rises: that is its own pad)
    for (const x of [-18, -12, -6, 0, 4]) for (let z = -hd - 14; z <= -hd; z += 2) expect(Math.abs(g(x, z)), `(${x}, ${z})`).toBeLessThan(0.08);
  });

  it('the approach to the Baths of Trajan porch is level', () => {
    const g = ctxFor('baths-trajan').groundAt;
    const zF = -66;
    for (const x of [-12, -6, 0, 6, 12]) for (let z = zF - 14; z <= zF; z += 2) expect(Math.abs(g(x, z)), `(${x}, ${z})`).toBeLessThan(0.08);
  });
});
