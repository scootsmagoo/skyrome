/**
 * Skyrim-style compass bar. The tick/letter strip is built once and slid with a transform; markers
 * come from a pooled set of elements positioned each frame. Everything is placed in fractions of
 * the CSS variable `--cw` (the compass width, `min(34rem, 40vw)` in hud.css), so the bar scales
 * with the interface size but never crowds a narrow window.
 */
import { h, setClass } from '../dom';
import { LOCATION_ICONS, UI_ICONS, iconSvg } from '../icons';
import type { MapIconKind } from '../types';
import { COMPASS_SPAN, bearingTo, cardinalLabels, compassPosition, edgeFade, relativeBearing } from './compassMath';

/** A length of `f` compass widths. */
const cw = (f: number) => `calc(var(--cw) * ${f.toFixed(5)})`;

export interface CompassItem {
  key: string;
  kind: 'quest' | 'location' | 'enemy' | 'ally' | 'custom';
  x: number;
  z: number;
  icon?: MapIconKind;
  discovered?: boolean;
  label?: string;
  /** Quest: the tracked quest's next required objective (big, glowing, with its distance). */
  primary?: boolean;
  /** Ground height at the target, when known (the world marker floats over it). */
  y?: number;
  /** An NPC target (the world marker sits over a head, not a place). */
  npc?: boolean;
}

export class Compass {
  readonly el: HTMLElement;
  private strip: HTMLElement;
  private markerLayer: HTMLElement;
  private pool = new Map<string, HTMLElement>();
  private latin: boolean | null = null;

  constructor() {
    this.strip = h('div', { class: 'hud-compass-strip' });
    this.markerLayer = h('div', { class: 'hud-compass-markers' });
    // Markers live outside the band so its edge fade doesn't hide a quest marker pinned to the end.
    this.el = h(
      'div',
      { class: 'hud-compass' },
      h('div', { class: 'hud-compass-cap left' }),
      h('div', { class: 'hud-compass-band' }, this.strip),
      this.markerLayer,
      h('div', { class: 'hud-compass-cap right' }),
      h('div', { class: 'hud-compass-needle' }),
    );
  }

  private buildStrip(latin: boolean) {
    this.latin = latin;
    const labels = cardinalLabels(latin);
    const parts: HTMLElement[] = [];
    // −180..540 so any heading has strip on both sides.
    for (let deg = -180; deg <= 540; deg += 15) {
      const b = ((deg % 360) + 360) % 360;
      const left = cw((deg + 180) / COMPASS_SPAN);
      const label = labels.find((l) => l.bearing === b);
      if (label) parts.push(h('span', { class: `hud-compass-letter${latin ? ' latin' : ''}`, style: `left:${left}` }, label.text));
      else parts.push(h('i', { class: b % 45 === 0 ? 'hud-tick major' : 'hud-tick', style: `left:${left}` }));
    }
    this.strip.replaceChildren(...parts);
  }

  /** `heading` is the camera's compass bearing; `items` are already-resolved marker positions. */
  update(heading: number, px: number, pz: number, items: readonly CompassItem[], latin: boolean) {
    if (this.latin !== latin) this.buildStrip(latin);
    // Strip position: bearing `heading` sits at the center (half a compass width).
    this.strip.style.transform = `translate3d(${cw(0.5 - (heading + 180) / COMPASS_SPAN)},0,0)`;

    const seen = new Set<string>();
    for (const it of items) {
      const rel = relativeBearing(heading, bearingTo(px, pz, it.x, it.z));
      let pos = compassPosition(rel, COMPASS_SPAN, it.kind === 'quest');
      if (pos === null) continue;
      // A quest marker behind you rests just inside the end of the bar.
      if (it.kind === 'quest') pos = Math.max(-0.95, Math.min(0.95, pos));
      seen.add(it.key);
      let el = this.pool.get(it.key);
      if (!el) {
        el = this.makeMarker(it);
        this.pool.set(it.key, el);
        this.markerLayer.appendChild(el);
      }
      setClass(el, 'is-undiscovered', it.kind === 'location' && !it.discovered);
      if (it.primary) {
        const dist = el.querySelector('.dist');
        if (dist) dist.textContent = formatDistance(Math.hypot(it.x - px, it.z - pz));
      }
      el.style.transform = `translate3d(${cw(pos / 2)},0,0)`;
      el.style.opacity = String(it.kind === 'quest' ? 1 : edgeFade(pos));
    }
    for (const [key, el] of this.pool) {
      if (!seen.has(key)) {
        el.remove();
        this.pool.delete(key);
      }
    }
  }

  private makeMarker(it: CompassItem): HTMLElement {
    const cls = `hud-cmark ${it.kind}`;
    if (it.kind === 'enemy') return h('div', { class: cls });
    if (it.kind === 'quest') {
      // The next step is unmistakable; optional objectives stay small and quiet.
      const el = h('div', { class: `${cls} ${it.primary ? 'is-primary' : 'is-minor'}` });
      el.innerHTML = iconSvg(UI_ICONS.questMarker);
      if (it.primary) el.appendChild(h('span', { class: 'dist' }));
      return el;
    }
    const el = h('div', { class: cls });
    el.innerHTML = iconSvg(LOCATION_ICONS[it.icon ?? 'landmark']);
    return el;
  }
}

/** "40 m", "350 m", "1.2 km" (game metres). */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(1, Math.round(m / 5) * 5)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
