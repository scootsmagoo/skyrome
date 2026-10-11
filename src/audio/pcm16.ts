/**
 * 16-bit storage for PCM that waits to be played (AudioEngine's stash of pre-baked one-shots and
 * decoded recordings): half the bytes of float PCM, and the AudioBuffer (always float) is only made
 * when the sound first plays. 16 bits is CD depth: the rounding sits 96 dB under full scale.
 */

/** Pack float PCM to 16 bits; PCM with a sample outside [-1, 1] (or not finite) stays float. */
export function packPcm(d: Float32Array): Int16Array | Float32Array {
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (!(v >= -1 && v <= 1)) return d;
  }
  const out = new Int16Array(d.length);
  // Rounded to nearest (floor of + 0.5: as Math.round, several times faster in this loop).
  for (let i = 0; i < d.length; i++) out[i] = Math.floor(d[i] * 32767 + 0.5);
  return out;
}

/** Write packed (or float) PCM into `out` as floats. */
export function unpackPcm(p: Int16Array | Float32Array, out: Float32Array) {
  if (p instanceof Float32Array) {
    out.set(p);
    return;
  }
  for (let i = 0; i < p.length; i++) out[i] = p[i] / 32767;
}
