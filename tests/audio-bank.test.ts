/**
 * Bakes every sound in the bank (all variants) in Node and checks it the way an ear would:
 * not silent, no NaN, no clipping, sensible length, no click at the end, brightness in range,
 * and beds loop without a seam.
 */
import { describe, expect, it } from 'vitest';
import { BED_RMS, LOOPS, SOUNDS, bakeRate, bakeTimes, getVariants, loopSoundIds } from '../src/audio/bank';
import { analyze, seamRatio, spectralCentroid } from '../src/audio/dsp/analysis';

const rows: string[] = [];

describe('sound bank', () => {
  it('has the expected catalogue', () => {
    expect(SOUNDS.size).toBeGreaterThan(80);
    for (const id of ['step.stone.walk', 'step.water.run', 'clash.metal', 'block.shield', 'vox.death.f', 'door.open', 'stinger.questStart', 'stinger.levelUp', 'bed.crowd', 'amb.swifts', 'amb.owl'])
      expect(SOUNDS.has(id), id).toBe(true);
    for (const l of LOOPS.values()) for (const id of loopSoundIds(l)) expect(SOUNDS.has(id), `${l.id} → ${id}`).toBe(true);
  });

  for (const def of SOUNDS.values()) {
    it(`bakes ${def.id}`, () => {
      const vars = getVariants(def.id)!;
      expect(vars.length).toBe(def.variants);
      const rate = bakeRate(def);
      vars.forEach((buf, v) => {
        const s = analyze(buf, rate);
        const tag = `${def.id}#${v}`;
        expect(s.nan, tag).toBe(0);
        expect(s.peak, tag).toBeLessThanOrEqual(1);
        expect(s.clipped, tag).toBe(0);
        expect(s.rms, `${tag} silent`).toBeGreaterThan(def.kind === 'bed' ? BED_RMS * 0.8 : 0.005);
        expect(Math.abs(s.dc), `${tag} dc`).toBeLessThan(0.02);
        if (def.kind === 'oneshot') {
          expect(s.tail, `${tag} click at end`).toBeLessThan(0.01);
          if (def.expect?.dur) {
            expect(s.audible, `${tag} audible length`).toBeGreaterThanOrEqual(def.expect.dur[0]);
            expect(s.audible, `${tag} audible length`).toBeLessThanOrEqual(def.expect.dur[1] + 0.02);
          }
        } else {
          expect(seamRatio(buf), `${tag} loop seam`).toBeLessThan(8);
          expect(s.seconds).toBeGreaterThan(4);
        }
        if (def.expect?.centroid && v === 0) {
          const c = spectralCentroid(buf, rate);
          expect(c, `${tag} centroid`).toBeGreaterThanOrEqual(def.expect.centroid[0]);
          expect(c, `${tag} centroid`).toBeLessThanOrEqual(def.expect.centroid[1]);
        }
        if (v === 0)
          rows.push(
            `${def.id.padEnd(24)} ${String(def.variants).padStart(2)}  ${s.seconds.toFixed(2).padStart(5)}s  audible ${s.audible.toFixed(2).padStart(5)}s  peak ${s.peakDb.toFixed(1).padStart(6)}  rms ${s.rmsDb.toFixed(1).padStart(6)}  centroid ${spectralCentroid(buf, rate).toFixed(0).padStart(5)} Hz  bake ${(bakeTimes.get(def.id) ?? 0).toFixed(0).padStart(4)} ms`,
          );
      });
    });
  }

  it('prints the table', () => {
    if (process.env.AUDIO_TABLE) console.log('\n' + rows.join('\n'));
    let total = 0;
    for (const t of bakeTimes.values()) total += t;
    if (process.env.AUDIO_TABLE) console.log(`total bake ${total.toFixed(0)} ms`);
    expect(rows.length).toBe(SOUNDS.size);
  });
});
