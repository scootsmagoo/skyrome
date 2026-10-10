// Measurement DSP shared by audit.mjs (clips) and mixcheck.mjs (the whole mix): ITU-R BS.1770 K-weighting, loudness, spectrum, true peak.
export const peakOf = (a) => {
  let p = 0;
  for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i]));
  return p;
};
export const db = (x) => 20 * Math.log10(Math.max(1e-9, x));

export function kWeight(a, fs) {
  const out = new Float64Array(a.length);
  let K = Math.tan((Math.PI * 1681.974450955533) / fs);
  const Q1 = 0.7071752369554196;
  const Vh = Math.pow(10, 3.999843853973347 / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q1 + K * K;
  const p = [(Vh + (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0];
  K = Math.tan((Math.PI * 38.13547087602444) / fs);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const h = [1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = p[0] * x + p[1] * x1 + p[2] * x2 - p[3] * y1 - p[4] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const z = h[0] * y + h[1] * z1 + h[2] * z2 - h[3] * w1 - h[4] * w2;
    z2 = z1; z1 = y; w2 = w1; w1 = z;
    out[i] = z;
  }
  return out;
}
/** Loudest `seconds` (default 400 ms) K-weighted mean square, LUFS (shorter clips are averaged over the whole window). */
export function lufsMax(a, fs, seconds = 0.4) {
  const k = kWeight(a, fs);
  const win = Math.round(seconds * fs);
  const n = Math.min(k.length, win);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += k[i] * k[i];
  let best = acc;
  for (let i = n; i < k.length; i++) {
    acc += k[i] * k[i] - k[i - n] * k[i - n];
    if (acc > best) best = acc;
  }
  return -0.691 + 10 * Math.log10(Math.max(1e-12, best / win));
}
export function fftMag2(x) {
  const n = x.length;
  const re = Float64Array.from(x);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  const m = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) m[i] = re[i] * re[i] + im[i] * im[i];
  return m;
}
export function spectrum(a, fs) {
  const N = 2048;
  const p = new Float64Array(N / 2);
  for (let s = 0; ; s += N / 2) {
    const fr = new Float64Array(N);
    for (let i = 0; i < N; i++) fr[i] = (a[s + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    const m = fftMag2(fr);
    for (let i = 0; i < N / 2; i++) p[i] += m[i];
    if (s + N >= a.length) break;
  }
  const df = fs / N;
  let e = 0, ef = 0, hf = 0, tot = 0;
  for (let i = 1; i < N / 2; i++) {
    const f = i * df;
    tot += p[i];
    if (f < 60 || f > 16000) continue;
    e += p[i]; ef += p[i] * f;
    if (f > 5000) hf += p[i];
  }
  return { cen: e ? ef / e : 0, hf: tot ? hf / tot : 0, power: p };
}
export function truePeak(a) {
  // 4x oversampling with a short windowed sinc
  let pk = peakOf(a);
  const T = 8;
  for (let i = 0; i < a.length; i++) {
    for (let ph = 1; ph < 4; ph++) {
      let s = 0;
      for (let k = -T + 1; k <= T; k++) {
        const x = k - ph / 4;
        const j = i + k;
        if (j < 0 || j >= a.length) continue;
        s += (a[j] * (Math.sin(Math.PI * x) / (Math.PI * x)) * (0.5 + 0.5 * Math.cos((Math.PI * x) / T)));
      }
      pk = Math.max(pk, Math.abs(s));
    }
  }
  return pk;
}

