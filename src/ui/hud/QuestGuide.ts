/**
 * Where to go next, Skyrim-style and unmissable:
 * - the world marker: a gold chevron with the distance floating over the tracked quest's next
 *   target (over a person's head, or above a place), drawn on top of everything so it shows
 *   through buildings; it rides the screen edge when the target is off to the side, and fades
 *   out once you are there;
 * - the objective tracker (top right): the quest's name and what to do now, with the distance.
 *   Settings → Interface → Objective tracker turns the panel off.
 */
import * as THREE from 'three';
import { h, setClass, setText } from '../dom';
import { UI_ICONS, iconSvg } from '../icons';
import { formatDistance } from './Compass';

export interface GuideTarget {
  questTitle: string;
  text: string;
  /** Counted objectives: "2 / 3". */
  progress?: string;
  x: number;
  /** Ground (or feet) height at the target; the marker floats above it. */
  y: number;
  z: number;
  npc: boolean;
}

const v = new THREE.Vector3();

export class QuestGuide {
  readonly marker: HTMLElement;
  readonly tracker: HTMLElement;
  private markerDist: HTMLElement;
  private trackTitle: HTMLElement;
  private trackText: HTMLElement;
  private trackDist: HTMLElement;
  private alpha = 0;

  constructor() {
    this.markerDist = h('div', { class: 'dist' });
    const chevron = h('div', { class: 'chev' });
    chevron.innerHTML = iconSvg(UI_ICONS.questMarker);
    this.marker = h('div', { class: 'hud-qmark' }, chevron, this.markerDist);
    this.trackTitle = h('div', { class: 'title' });
    this.trackText = h('div', { class: 'text' });
    this.trackDist = h('span', { class: 'dist' });
    const mark = h('span', { class: 'icon' });
    mark.innerHTML = iconSvg(UI_ICONS.questMarker);
    this.tracker = h('div', { class: 'hud-tracker' }, this.trackTitle, h('div', { class: 'line' }, mark, this.trackText, this.trackDist));
  }

  update(dt: number, target: GuideTarget | null, cam: THREE.Camera, viewW: number, viewH: number, player: { x: number; z: number }, trackerOn: boolean) {
    setClass(this.tracker, 'is-on', !!target && trackerOn);
    if (!target) {
      this.alpha = 0;
      this.marker.style.opacity = '0';
      return;
    }
    const d = Math.hypot(target.x - player.x, target.z - player.z);
    const dist = formatDistance(d);
    setText(this.trackTitle, target.questTitle);
    setText(this.trackText, target.progress ? `${target.text} (${target.progress})` : target.text);
    setText(this.trackDist, dist);
    setText(this.markerDist, dist);

    // Over a head (NPC) or well above a place; a little higher far away so it clears roofs.
    const lift = target.npc ? 2.35 : 3 + Math.min(12, d * 0.04);
    v.set(target.x, target.y + lift, target.z).project(cam);
    const behind = v.z > 1;
    let sx = (v.x * 0.5 + 0.5) * viewW;
    let sy = (-v.y * 0.5 + 0.5) * viewH;
    if (behind) {
      // Behind the camera the projection is mirrored: put it on the nearer bottom side instead.
      sx = viewW - sx;
      sy = viewH;
    }
    // Off screen: ride the edge, so it always points the way.
    const m = 46;
    const edge = behind || sx < m || sx > viewW - m || sy < m * 1.6 || sy > viewH - m * 2.4;
    sx = Math.max(m, Math.min(viewW - m, sx));
    sy = Math.max(m * 1.6, Math.min(viewH - m * 2.4, sy));
    setClass(this.marker, 'is-edge', edge);
    // Once you are there (a few metres), it fades: the prompt or the arrival takes over.
    const want = d < 3.5 ? 0 : d < 7 ? (d - 3.5) / 3.5 : 1;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 6);
    this.marker.style.opacity = this.alpha.toFixed(3);
    // Nearer reads bigger, within limits.
    const scale = Math.max(0.75, Math.min(1.25, 40 / Math.max(20, d) + 0.6));
    this.marker.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
  }
}

export const QUEST_GUIDE_CSS = `
.hud-qmark { position: absolute; left: 0; top: 0; pointer-events: none; display: flex; flex-direction: column; align-items: center;
  opacity: 0; transform-origin: 50% 100%; will-change: transform; z-index: 4; }
.hud-qmark .chev { width: 2.1rem; height: 2.1rem; color: var(--sr-gold, #d6b46a);
  filter: drop-shadow(0 0 6px rgba(255, 196, 80, 0.9)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.9)); animation: hud-qmark-bob 1.6s ease-in-out infinite; }
.hud-qmark .chev svg { width: 100%; height: 100%; }
.hud-qmark .dist { font-family: var(--sr-display); font-size: 0.82rem; letter-spacing: 0.06em; color: #f5e6c4;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95), 0 0 6px rgba(0, 0, 0, 0.7); margin-top: 0.1rem; }
.hud-qmark.is-edge .chev { animation: none; opacity: 0.9; }
@keyframes hud-qmark-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }

.hud-tracker { position: absolute; right: 1.2rem; top: 5.4rem; max-width: min(24rem, 34vw); text-align: right; pointer-events: none;
  opacity: 0; transition: opacity 0.3s; }
.hud-tracker.is-on { opacity: 1; }
.hud-tracker .title { font-family: var(--sr-display); font-size: 0.78rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sr-gold, #d6b46a);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9); }
.hud-tracker .line { display: flex; align-items: baseline; justify-content: flex-end; gap: 0.4rem; margin-top: 0.15rem;
  font-family: var(--sr-body); font-size: 1.02rem; color: #f3ead6; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.6); }
.hud-tracker .icon { width: 0.9rem; height: 0.9rem; color: var(--sr-gold, #d6b46a); flex: none; align-self: center; }
.hud-tracker .icon svg { width: 100%; height: 100%; }
.hud-tracker .dist { color: #d9c9a4; font-size: 0.9rem; white-space: nowrap; }
`;
