/** Draws a log-frequency spectrogram plus waveform of a buffer into a canvas (sound-board view). */
import { spectrogram } from '../dsp/analysis';

const MIN_HZ = 40;
const MAX_HZ = 16000;

/** Dark → ember → gold → white: matches the game's palette. */
function color(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  const stops: [number, number, number, number][] = [
    [0, 14, 10, 8],
    [0.35, 92, 28, 22],
    [0.6, 196, 92, 36],
    [0.8, 232, 184, 90],
    [1, 255, 248, 230],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
  }
  return [255, 248, 230];
}

export function drawSpectrogram(canvas: HTMLCanvasElement, data: Float32Array, rate: number, title = '') {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  const waveH = Math.round(H * 0.22);
  const specH = H - waveH;
  g.fillStyle = '#0e0a08';
  g.fillRect(0, 0, W, H);
  // Limit analysis length for very long buffers (beds): first 6 s.
  const buf = data.length > rate * 6 ? data.subarray(0, rate * 6) : data;
  const size = 1024;
  const hop = Math.max(64, Math.floor(buf.length / W));
  const frames = spectrogram(buf, size, hop);
  let max = -Infinity;
  for (const f of frames) for (let k = 1; k < f.length; k++) if (f[k] > max) max = f[k];
  const img = g.createImageData(W, specH);
  const logMin = Math.log(MIN_HZ);
  const logMax = Math.log(Math.min(MAX_HZ, rate / 2));
  for (let y = 0; y < specH; y++) {
    const hz = Math.exp(logMax - ((logMax - logMin) * y) / (specH - 1));
    const k = Math.min(size / 2 - 1, Math.max(1, Math.round((hz * size) / rate)));
    for (let x = 0; x < W; x++) {
      const fi = Math.min(frames.length - 1, Math.floor((x / W) * frames.length));
      const db = frames[fi]?.[k] ?? -120;
      const [r, gg, b] = color((db - (max - 80)) / 80);
      const o = (y * W + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Frequency grid.
  g.font = '10px ui-monospace, Menlo, monospace';
  g.fillStyle = 'rgba(243,234,216,0.55)';
  g.strokeStyle = 'rgba(243,234,216,0.12)';
  for (const hz of [100, 300, 1000, 3000, 10000]) {
    const y = Math.round(((logMax - Math.log(hz)) / (logMax - logMin)) * (specH - 1));
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(W, y + 0.5);
    g.stroke();
    g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, 3, y - 2);
  }
  // Waveform.
  g.fillStyle = '#16110d';
  g.fillRect(0, specH, W, waveH);
  g.strokeStyle = '#d9b35a';
  g.beginPath();
  const per = buf.length / W;
  for (let x = 0; x < W; x++) {
    let lo = 0;
    let hi = 0;
    const s = Math.floor(x * per);
    const e = Math.min(buf.length, Math.floor((x + 1) * per));
    for (let i = s; i < e; i++) {
      if (buf[i] < lo) lo = buf[i];
      if (buf[i] > hi) hi = buf[i];
    }
    const mid = specH + waveH / 2;
    g.moveTo(x + 0.5, mid - hi * (waveH / 2));
    g.lineTo(x + 0.5, mid - lo * (waveH / 2) + 1);
  }
  g.stroke();
  if (title) {
    g.fillStyle = 'rgba(243,234,216,0.9)';
    g.font = '11px ui-monospace, Menlo, monospace';
    g.fillText(`${title} · ${(buf.length / rate).toFixed(2)} s`, W - g.measureText(title).width - 70, 12);
  }
}
