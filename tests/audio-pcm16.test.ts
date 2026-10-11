import { describe, expect, it } from 'vitest';
import { packPcm, unpackPcm } from '../src/audio/pcm16';

describe('16-bit PCM stash', () => {
  it('round-trips within half a 16-bit step', () => {
    const d = new Float32Array(1000);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.37) * 0.9 * Math.exp(-i / 400);
    d[1] = 1;
    d[2] = -1;
    const p = packPcm(d);
    expect(p).toBeInstanceOf(Int16Array);
    expect(p.byteLength).toBe(d.byteLength / 2);
    const out = new Float32Array(d.length);
    unpackPcm(p, out);
    for (let i = 0; i < d.length; i++) expect(Math.abs(out[i] - d[i])).toBeLessThanOrEqual(0.5 / 32767 + 1e-7);
    expect(out[1]).toBe(1);
    expect(out[2]).toBe(-1);
  });

  it('keeps PCM that leaves [-1, 1] as floats, untouched', () => {
    const d = new Float32Array([0.2, 1.2, -0.5]);
    const p = packPcm(d);
    expect(p).toBe(d);
    const out = new Float32Array(3);
    unpackPcm(p, out);
    expect(Array.from(out)).toEqual(Array.from(d));
  });
});
