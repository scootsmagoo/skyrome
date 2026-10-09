/**
 * The procedural garment lofts (belts, skirts, togas, cloaks, armour pieces) are shaped around a
 * TorsoProfile: half-width, depth and centre line by height. For the realistic bodies that profile is
 * measured from the body itself, so the lofts sit on the sculpted torso instead of on the procedural one.
 */
import { TorsoProfile, type Levels } from '../../build/body';
import type { Ctx } from '../../build/common';
import type { TorsoMeasure } from './paint';

/** Standoff (m) added to the measured torso: the lofts are loose or sit over a layer of painted cloth. */
const MARGIN = 0.018;

export class MeasuredProfile extends TorsoProfile {
  constructor(ctx: Ctx, L: Levels, private readonly measure: TorsoMeasure) {
    super(ctx, L);
  }

  override at(y: number) {
    const base = super.at(y);
    const m = this.measure;
    if (m.y1 < 0 || y < m.y0 || y > m.y1) return base;
    const t = m.at(y);
    // Never narrower than a sliver.
    return { a: Math.max(0.05, t.a + MARGIN), bf: Math.max(0.04, t.bf + MARGIN), bb: Math.max(0.04, t.bb + MARGIN), zc: t.zc, n: base.n };
  }
}
