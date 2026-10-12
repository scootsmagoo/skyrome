/**
 * Wind profiles of the plant parts (pure: no three.js materials, so tests can import it).
 *
 * A whole plant bends from its base (`sway`, × height², so a trunk barely moves and the crown
 * leans); only what carries leaves flutters on top of that (`flutter`). Bark and stems never
 * flutter, nor do the far stand-ins, whose bark and crown are one mesh.
 */
import type { TreePart, WindKind } from './species';
import type { VegProfile } from './materials';

export const WIND: Record<WindKind, VegProfile> = {
  tree: { sway: 0.00045, flutter: 0.02 },
  shrub: { sway: 0.012, flutter: 0.015 },
  reed: { sway: 0.06, flutter: 0.02 },
  flower: { sway: 0.2, flutter: 0.01 },
};

/** The material profile for a tree part: its kind's sway, and flutter only where there are leaves. */
export function windProfile(part: Pick<TreePart, 'wind' | 'material' | 'baked' | 'heads' | 'cards'>): VegProfile {
  const w = WIND[part.wind];
  const leafy = !part.baked && part.material !== 'bark';
  return { sway: w.sway, flutter: leafy ? w.flutter : 0, heads: part.heads, card: part.cards };
}
