/**
 * Full-screen grid of spectrograms (sounds from the bank, or offline-rendered music) — the
 * visual check used during development instead of ears. Call from the console or shot.mjs:
 *
 *   const g = await import('/src/audio/debug/gallery.ts'); g.showGallery(['clash.metal', 'bed.crowd']);
 */
import { SOUNDS, bakeRate, getVariants } from '../bank';
import type { MusicState } from '../music/styles';
import { drawSpectrogram } from './spectrogram';
import { renderMusic } from './verify';

function overlay(cols: number): HTMLDivElement {
  document.getElementById('sb-gallery')?.remove();
  const el = document.createElement('div');
  el.id = 'sb-gallery';
  el.style.cssText = `position:fixed;inset:0;z-index:50;background:#0b0907;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px;overflow:auto;font:11px ui-monospace,Menlo,monospace;color:#e9dcc0`;
  document.body.appendChild(el);
  return el;
}

function cell(parent: HTMLElement, label: string, w: number, h: number) {
  const box = document.createElement('div');
  const t = document.createElement('div');
  t.textContent = label;
  t.style.cssText = 'padding:2px 0';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.style.cssText = 'width:100%;display:block';
  box.append(t, c);
  parent.appendChild(box);
  return c;
}

export function showGallery(ids: string[], cols = 4, variant = 0) {
  const el = overlay(cols);
  for (const id of ids) {
    const def = SOUNDS.get(id);
    if (!def) continue;
    const v = getVariants(id)!;
    const data = v[Math.min(variant, v.length - 1)];
    drawSpectrogram(cell(el, `${id} #${variant} — ${def.label}`, 420, 170), data, bakeRate(def));
  }
  return ids.length;
}

/** Render music states offline and show their spectrograms (first `seconds` seconds). */
export async function showMusic(states: Exclude<MusicState, 'silence'>[], seconds = 20, cols = 2) {
  const el = overlay(cols);
  for (const s of states) {
    const { buf, row } = await renderMusic(s, seconds);
    const d = buf.getChannelData(0);
    // Downsample 48 k → 24 k for a readable time axis.
    const ds = new Float32Array(Math.floor(d.length / 2));
    for (let i = 0; i < ds.length; i++) ds[i] = (d[2 * i] + d[2 * i + 1]) / 2;
    drawSpectrogram(cell(el, `${s} — ${row.events} events, rms ${row.rmsDb.toFixed(1)} dB`, 840, 260), ds, 24000);
  }
  return states.length;
}

export function hideGallery() {
  document.getElementById('sb-gallery')?.remove();
}
