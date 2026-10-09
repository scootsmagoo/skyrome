// Shared helpers for the sound-effect pipeline (decode with ffmpeg, trim, measure).
import { execFileSync } from 'node:child_process';

export const FFMPEG = '/opt/homebrew/bin/ffmpeg';

/** Decode any audio file to mono float32 at `rate`, with optional ffmpeg audio filters. */
export function decode(path, rate, filters = '') {
  const args = ['-v', 'error', '-i', path, '-ac', '1'];
  if (filters) args.push('-af', filters);
  args.push('-ar', String(rate), '-f', 'f32le', '-');
  const buf = execFileSync(FFMPEG, args, { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export const peakOf = (a) => {
  let p = 0;
  for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i]));
  return p;
};

export const db = (x) => 20 * Math.log10(Math.max(1e-9, x));

/** Remove leading and trailing silence (threshold in dBFS relative to the clip's own peak). */
export function trim(a, rate, { headDb = -42, tailDb = -48, pre = 0.003, post = 0.02 } = {}) {
  const pk = peakOf(a);
  if (pk === 0) return a;
  const hi = pk * Math.pow(10, headDb / 20);
  const ti = pk * Math.pow(10, tailDb / 20);
  let s = 0;
  while (s < a.length && Math.abs(a[s]) < hi) s++;
  let e = a.length - 1;
  while (e > s && Math.abs(a[e]) < ti) e--;
  s = Math.max(0, s - Math.round(pre * rate));
  e = Math.min(a.length, e + 1 + Math.round(post * rate));
  return a.slice(s, e);
}

/** Linear fade in / out in place. */
export function fade(a, rate, inS, outS) {
  const ni = Math.min(a.length, Math.round(inS * rate));
  for (let i = 0; i < ni; i++) a[i] *= i / ni;
  const no = Math.min(a.length, Math.round(outS * rate));
  for (let i = 0; i < no; i++) a[a.length - 1 - i] *= i / no;
  return a;
}

export function scale(a, g) {
  for (let i = 0; i < a.length; i++) a[i] *= g;
  return a;
}

export function rmsOf(a, start = 0, end = a.length) {
  let s = 0;
  for (let i = start; i < end; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, end - start));
}

/** Spectral centroid (Hz) from a few windows (crude DFT via Goertzel-free FFT-less energy bands). */
export function centroid(a, rate) {
  // Zero-crossing + first-difference energy ratio: cheap brightness proxy that needs no FFT.
  let d = 0;
  let e = 0;
  for (let i = 1; i < a.length; i++) {
    const x = a[i] - a[i - 1];
    d += x * x;
    e += a[i] * a[i];
  }
  if (e === 0) return 0;
  // For white-ish signals sqrt(d/e) ~ 2*sin(w/2); map to an approximate frequency.
  const r = Math.min(2, Math.sqrt(d / e));
  return (2 * Math.asin(r / 2) * rate) / (2 * Math.PI);
}

/** Onsets: times (s) where the short-term envelope rises sharply from a quiet floor. */
export function onsets(a, rate, { win = 0.004, rise = 8, floorDb = -50, minGap = 0.12 } = {}) {
  const n = Math.max(1, Math.round(win * rate));
  const env = [];
  for (let i = 0; i + n <= a.length; i += n) {
    let s = 0;
    for (let j = 0; j < n; j++) s += a[i + j] * a[i + j];
    env.push(Math.sqrt(s / n));
  }
  const pk = Math.max(...env);
  const floor = pk * Math.pow(10, floorDb / 20);
  const out = [];
  let last = -9;
  for (let k = 3; k < env.length; k++) {
    const prev = Math.max(floor, (env[k - 1] + env[k - 2] + env[k - 3]) / 3);
    if (env[k] > prev * rise && env[k] > pk * 0.15 && k * win - last > minGap) {
      out.push(k * win);
      last = k * win;
    }
  }
  return out;
}
