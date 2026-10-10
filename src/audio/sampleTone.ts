/**
 * Per-sound tone correction for the recorded clips (October 2026 audit, docs/research/audio-audit.md).
 *
 * The recordings come from many libraries and several are harsh: grass, sand, marble and splashes
 * hiss above 5 kHz, coin and lock sounds are nearly all treble, the metal clash rings at 8 kHz. A
 * tone is a short list of biquads run over each clip before it is levelled (samples.ts), so the
 * loudness rules still hold afterwards. The data is pure: scripts/sfx/audit.mjs imports this file
 * (node --experimental-strip-types) to measure exactly what the game plays, so keep it free of
 * imports.
 */

export interface ToneStage {
  type: 'lp' | 'hp' | 'hs' | 'ls' | 'pk';
  /** Corner / centre frequency (Hz). */
  f: number;
  /** Quality factor (shelves and peaks: bandwidth; default 0.707). */
  q?: number;
  /** Gain (dB) of shelves and peaks. */
  g?: number;
}

const lp = (f: number, q = 0.707): ToneStage => ({ type: 'lp', f, q });
const hp = (f: number, q = 0.707): ToneStage => ({ type: 'hp', f, q });
const hs = (f: number, g: number): ToneStage => ({ type: 'hs', f, g });
const ls = (f: number, g: number): ToneStage => ({ type: 'ls', f, g });
const pk = (f: number, g: number, q = 1): ToneStage => ({ type: 'pk', f, g, q });

/** Footsteps: a leather sole on a hard floor should never hiss. */
const stepTone = (surface: string, stages: ToneStage[]): [string, ToneStage[]][] => [
  [`step.${surface}.walk`, stages],
  [`step.${surface}.sneak`, stages],
  [`land.${surface}`, stages],
];

export const SAMPLE_TONE: Record<string, ToneStage[]> = Object.fromEntries([
  ...stepTone('stone', [lp(7000)]),
  ...stepTone('marble', [hs(4000, -2.5), lp(6200)]),
  ...stepTone('cobbles', [hs(4500, -2), lp(6500)]),
  ...stepTone('grass', [hs(3000, -3.5), lp(4600), ls(220, 2)]),
  ...stepTone('gravel', [hs(3500, -2), lp(5600)]),
  ...stepTone('sand', [hs(3000, -3), lp(4800), ls(200, 2)]),
  ...stepTone('water', [hs(3000, -3), lp(5000), ls(200, 1)]),
  ['gear.hobnail', [hs(3500, -5), lp(5200)]],
  // Combat
  ['clash.metal', [hs(4500, -11), pk(2400, 2, 0.8), lp(5200), ls(250, 2)]],
  ['weapon.draw', [hs(3500, -10), lp(5000)]],
  ['swing.slow', [hs(3000, -5), lp(5200)]],
  ['swing.medium', [hs(3000, -5), lp(5200)]],
  ['arrow.whoosh', [hs(3000, -6), lp(5200)]],
  ['arrow.impact.stone', [hs(3000, -5), lp(5200)]],
  // Foley
  ['armor.jingle', [hs(3500, -7), lp(6000), ls(300, 2)]],
  ['coin.clink', [hs(4000, -9), lp(6200), ls(400, 3)]],
  ['lock.click', [hs(3500, -6), lp(6000)]],
  ['lock.turn', [hs(3000, -9), lp(5200), ls(300, 3)]],
  ['lock.open', [hs(3000, -9), lp(5200), ls(300, 3)]],
  ['item.pickup', [hs(3500, -8), lp(5600), ls(300, 2)]],
  ['chest.close', [hs(3000, -5), lp(5500)]],
  ['door.close', [lp(6000)]],
  // Interface
  ['ui.hover', [hs(3000, -7), lp(5200)]],
  ['ui.click', [hs(3000, -7), lp(5200)]],
  ['ui.page', [hs(3000, -9), lp(5200), ls(300, 2)]],
  // Events cut from the dawn chorus
  ['amb.birdcall', [hs(4500, -3), lp(8000)]],
]);

interface Coef {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook biquad, normalised by a0. */
export function toneCoef(s: ToneStage, rate: number): Coef {
  const f = Math.min(s.f, rate * 0.45);
  const w = (2 * Math.PI * f) / rate;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const q = s.q ?? 0.707;
  const A = Math.pow(10, (s.g ?? 0) / 40);
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  if (s.type === 'lp' || s.type === 'hp') {
    const al = sw / (2 * q);
    a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
    if (s.type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; } else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  } else if (s.type === 'pk') {
    const al = sw / (2 * q);
    b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A;
    a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
  } else {
    // shelves, slope 1
    const al = (sw / 2) * Math.SQRT2;
    const tsa = 2 * Math.sqrt(A) * al;
    if (s.type === 'hs') {
      b0 = A * (A + 1 + (A - 1) * cw + tsa);
      b1 = -2 * A * (A - 1 + (A + 1) * cw);
      b2 = A * (A + 1 + (A - 1) * cw - tsa);
      a0 = A + 1 - (A - 1) * cw + tsa;
      a1 = 2 * (A - 1 - (A + 1) * cw);
      a2 = A + 1 - (A - 1) * cw - tsa;
    } else {
      b0 = A * (A + 1 - (A - 1) * cw + tsa);
      b1 = 2 * A * (A - 1 - (A + 1) * cw);
      b2 = A * (A + 1 - (A - 1) * cw - tsa);
      a0 = A + 1 + (A - 1) * cw + tsa;
      a1 = -2 * (A - 1 + (A + 1) * cw);
      a2 = A + 1 + (A - 1) * cw - tsa;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Run a clip through a sound's tone stages in place (a sound with no entry is left alone). */
export function applyTone(buf: Float32Array, rate: number, id: string): Float32Array {
  const stages = SAMPLE_TONE[id];
  if (!stages) return buf;
  for (const st of stages) {
    const c = toneCoef(st, rate);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i];
      const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      buf[i] = y;
    }
  }
  return buf;
}
