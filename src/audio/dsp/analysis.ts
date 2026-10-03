/**
 * Offline measurement helpers: level statistics, spectrum, centroid, pitch, loop-seam check and
 * spectrogram data. This is how sounds are verified without ears (unit tests, the sound board's
 * spectrogram view and the in-browser offline render report).
 */
import { TWO_PI } from './core';

export interface SoundStats {
  samples: number;
  seconds: number;
  peak: number;
  peakDb: number;
  rms: number;
  rmsDb: number;
  /** Mean value (DC offset). */
  dc: number;
  nan: number;
  /** Samples with |x| >= 0.999. */
  clipped: number;
  /** Seconds from the start until the level first reaches -20 dB below the peak. */
  onset: number;
  /** Seconds until the signal stays below -60 dB of the peak for good (audible length). */
  audible: number;
  /** Absolute level of the last 5 ms (should be ~0 for one-shots: no click at the end). */
  tail: number;
}

export function analyze(buf: Float32Array, rate: number): SoundStats {
  let peak = 0;
  let sum2 = 0;
  let sum = 0;
  let nan = 0;
  let clipped = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    if (!Number.isFinite(x)) {
      nan++;
      continue;
    }
    const a = Math.abs(x);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum2 += x * x;
    sum += x;
  }
  const rms = Math.sqrt(sum2 / Math.max(1, buf.length));
  let onset = 0;
  const onT = peak * 0.1;
  for (let i = 0; i < buf.length; i++)
    if (Math.abs(buf[i]) >= onT) {
      onset = i / rate;
      break;
    }
  let last = 0;
  const offT = peak * 0.001;
  for (let i = buf.length - 1; i >= 0; i--)
    if (Math.abs(buf[i]) >= offT) {
      last = i;
      break;
    }
  const tailN = Math.min(buf.length, Math.round(0.005 * rate));
  let tail = 0;
  for (let i = buf.length - tailN; i < buf.length; i++) tail = Math.max(tail, Math.abs(buf[i]));
  return {
    samples: buf.length,
    seconds: buf.length / rate,
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    dc: sum / Math.max(1, buf.length),
    nan,
    clipped,
    onset,
    audible: last / rate,
    tail,
  };
}

export const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

/** In-place radix-2 complex FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TWO_PI / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Average magnitude spectrum (Hann-windowed frames). Returns power per bin, bin width rate/size. */
export function spectrum(buf: Float32Array, size = 2048): Float64Array {
  const out = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let frames = 0;
  const hop = size / 2;
  for (let start = 0; start + size <= Math.max(buf.length, size); start += hop) {
    for (let i = 0; i < size; i++) {
      const w = 0.5 - 0.5 * Math.cos((TWO_PI * i) / (size - 1));
      re[i] = (buf[start + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) out[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
    if (start + size >= buf.length) break;
  }
  for (let k = 0; k < out.length; k++) out[k] /= Math.max(1, frames);
  return out;
}

/** Power-weighted mean frequency (Hz): a rough "brightness". */
export function spectralCentroid(buf: Float32Array, rate: number, size = 2048): number {
  const p = spectrum(buf, size);
  let num = 0;
  let den = 0;
  for (let k = 1; k < p.length; k++) {
    const f = (k * rate) / size;
    num += f * p[k];
    den += p[k];
  }
  return den > 0 ? num / den : 0;
}

/** Frequency of the strongest spectral peak (Hz), with parabolic interpolation. */
export function dominantFrequency(buf: Float32Array, rate: number, size = 8192, minHz = 30): number {
  const p = spectrum(buf, size);
  let best = 0;
  let bi = 1;
  const k0 = Math.max(1, Math.floor((minHz * size) / rate));
  for (let k = k0; k < p.length - 1; k++)
    if (p[k] > best) {
      best = p[k];
      bi = k;
    }
  const a = Math.log(p[bi - 1] + 1e-30);
  const b = Math.log(p[bi] + 1e-30);
  const c = Math.log(p[bi + 1] + 1e-30);
  const off = (0.5 * (a - c)) / (a - 2 * b + c || 1);
  return ((bi + off) * rate) / size;
}

/**
 * Fundamental frequency by normalized autocorrelation over a window (Hz, or 0 if unvoiced).
 * Good to ~0.2% for clean periodic tones (used to check string tuning).
 */
export function detectPitch(buf: Float32Array, rate: number, minHz = 50, maxHz = 2000, start = 0, len = 4096): number {
  const n = Math.min(len, buf.length - start);
  const minLag = Math.floor(rate / maxHz);
  const maxLag = Math.min(Math.floor(rate / minHz), n - 1);
  let bestLag = 0;
  let best = 0;
  const corr = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i + lag < n; i++) {
      const a = buf[start + i];
      const b = buf[start + i + lag];
      s += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    corr[lag] = s / Math.sqrt(e1 * e2 + 1e-20);
  }
  // First strong peak (avoids octave errors that the global max can give).
  const globalMax = Math.max(...Array.from(corr.slice(minLag, maxLag + 1)));
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (corr[lag] > corr[lag - 1] && corr[lag] >= corr[lag + 1] && corr[lag] > globalMax * 0.9) {
      bestLag = lag;
      best = corr[lag];
      break;
    }
  }
  if (!bestLag || best < 0.3) return 0;
  const a = corr[bestLag - 1];
  const b = corr[bestLag];
  const c = corr[bestLag + 1];
  const off = (0.5 * (a - c)) / (a - 2 * b + c || 1);
  return rate / (bestLag + off);
}

/**
 * Loop seam check: the jump between the last and the first sample compared with the typical
 * sample-to-sample difference. A seamless loop has a ratio around 1; a click shows up as ≫ 5.
 */
export function seamRatio(buf: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < buf.length; i++) sum += Math.abs(buf[i] - buf[i - 1]);
  const typical = sum / Math.max(1, buf.length - 1);
  const jump = Math.abs(buf[0] - buf[buf.length - 1]);
  return jump / Math.max(1e-9, typical);
}

/** RMS per window of `win` seconds (for loudness-over-time checks). */
export function rmsEnvelope(buf: Float32Array, rate: number, win = 0.5): number[] {
  const n = Math.max(1, Math.round(win * rate));
  const out: number[] = [];
  for (let s = 0; s < buf.length; s += n) {
    let acc = 0;
    const e = Math.min(buf.length, s + n);
    for (let i = s; i < e; i++) acc += buf[i] * buf[i];
    out.push(Math.sqrt(acc / Math.max(1, e - s)));
  }
  return out;
}

/**
 * Spectrogram as a [frames][bins] array of dB values (log-frequency friendly: caller maps bins).
 * `size` FFT points, `hop` samples between frames.
 */
export function spectrogram(buf: Float32Array, size = 1024, hop = 256): Float32Array[] {
  const frames: Float32Array[] = [];
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let start = 0; start < buf.length; start += hop) {
    for (let i = 0; i < size; i++) {
      const w = 0.5 - 0.5 * Math.cos((TWO_PI * i) / (size - 1));
      re[i] = (buf[start + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    const f = new Float32Array(size / 2);
    for (let k = 0; k < size / 2; k++) f[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-12);
    frames.push(f);
  }
  return frames;
}
