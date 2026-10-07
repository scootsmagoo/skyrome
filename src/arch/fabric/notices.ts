/**
 * Painted notices (dipinti) on the street walls of the apartment blocks: red or black letters
 * brushed on a whitewashed panel (an album), as the walls of Rome and Pompeii were covered with.
 * The texts follow real ones in form (CIL IV and VI), fitted to Rome in AD 113: no election
 * notices — Rome's magistrates were chosen by the Senate by now — but games, rooms to let, a
 * reward for a lost pot, the charioteers' factions, good wishes, and the famous warning to people
 * who relieve themselves against the wall (CIL VI 13740, from Rome).
 */
import * as THREE from 'three';
import type { Rng } from '../../core/Rng';
import { paintedSign } from '../common/inscription';
import type { Draw } from './draw';

/** [lines, ink]: red for the sign-painters' notices, black (charcoal and soot) for the rest. */
export const NOTICES: readonly (readonly [readonly string[], string])[] = [
  [['CACATOR', 'CAVE MALVM'], '#1d1712'],
  [['LOCANTVR', 'CENACVLA', 'EX K IVL'], '#9a3a24'],
  [['GLADIATORVM PARIA XX', 'PVGNABVNT', 'VENATIO VELA ERVNT'], '#9a3a24'],
  [['VRNA AENEA PERIIT', 'QVI RETTVLERIT', 'DABVNTVR HS LXV'], '#9a3a24'],
  [['VINCAS PRASINE'], '#2b4a2a'],
  [['NIKA VENETE'], '#24395e'],
  [['IMP TRAIANO', 'FELICITER'], '#9a3a24'],
  [['QVISQVIS AMAT', 'VALEAT'], '#1d1712'],
  [['TABERNA', 'LOCATVR'], '#9a3a24'],
  [['MVNVS', 'PARIA XXX', 'VELA ERVNT'], '#9a3a24'],
  [['SALVE', 'LVCRVM'], '#9a3a24'],
  [['FVR', 'CAVE'], '#1d1712'],
];

/**
 * Maybe paint a notice on the wall beside a narrow door. `F` is the facade frame (outer face at
 * z = 0, street toward −z); the free wall runs from `x0` to `x1`, the notice centred around
 * `y` (eye height above the street).
 */
export function wallNotice(F: Draw, rng: Rng, x0: number, x1: number, y: number): boolean {
  const pick = NOTICES[rng.int(0, NOTICES.length - 1)];
  const [lines, ink] = pick;
  const longest = Math.max(...lines.map((l) => l.length));
  const w = Math.min(x1 - x0 - 0.1, 0.42 + longest * 0.055);
  if (w < 0.6) return false;
  const h = 0.16 + lines.length * 0.15;
  const cx = (x0 + x1) / 2 + rng.range(-0.05, 0.05) * (x1 - x0 - w);
  // The panel's front faces −z at z = 0 and its body reaches back 4 cm: stand it just proud.
  const at = F.m.clone().multiply(new THREE.Matrix4().makeTranslation(cx, y, -0.045));
  paintedSign(F.b, [...lines], w, h, at, { ink });
  return true;
}
