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
import type { MarkerTarget } from '../../quests/types';
import { formatDistance } from './Compass';
import { placeMarker, screenMarker, type MarkerBox } from './markerMath';

export interface GuideTarget {
  /** Which objective this is (`q:<quest>:<objective>`): the quest route replans when it changes. */
  key?: string;
  questTitle: string;
  text: string;
  /** Counted objectives: "2 / 3". */
  progress?: string;
  x: number;
  /** Ground (or feet) height at the target; the marker floats above it. */
  y: number;
  z: number;
  npc: boolean;
  /** The person to ride on: the HUD follows this actor's live position every frame. */
  actorId?: string;
  /** The objective's marker target (the quest route reads it to find interior cells). */
  target?: MarkerTarget;
}

const v = new THREE.Vector3();
/** Room kept clear at the screen edges (px): the compass on top, the bars and the minimap below. */
const BOX: MarkerBox = { left: 46, right: 46, top: 74, bottom: 110 };

export class QuestGuide {
  readonly marker: HTMLElement;
  readonly tracker: HTMLElement;
  private markerDist: HTMLElement;
  private trackTitle: HTMLElement;
  private trackText: HTMLElement;
  private trackDist: HTMLElement;
  private chevron: HTMLElement;
  private alpha = 0;
  private place = screenMarker();
  private angle = 0;

  constructor() {
    this.markerDist = h('div', { class: 'dist' });
    const chevron = h('div', { class: 'chev' });
    chevron.innerHTML = iconSvg(UI_ICONS.questMarker);
    this.chevron = chevron;
    this.marker = h('div', { class: 'hud-qmark' }, chevron, this.markerDist);
    this.trackTitle = h('div', { class: 'title' });
    this.trackText = h('div', { class: 'text' });
    this.trackDist = h('span', { class: 'dist' });
    const mark = h('span', { class: 'icon' });
    mark.innerHTML = iconSvg(UI_ICONS.questMarker);
    this.tracker = h('div', { class: 'hud-tracker' }, this.trackTitle, h('div', { class: 'line' }, mark, this.trackText, this.trackDist));
  }

  update(dt: number, target: GuideTarget | null, cam: THREE.Camera, viewW: number, viewH: number, player: { x: number; y?: number; z: number }, trackerOn: boolean) {
    setClass(this.tracker, 'is-on', !!target && trackerOn);
    if (!target) {
      this.alpha = 0;
      this.marker.style.opacity = '0';
      return;
    }
    // In 3D: a landing up a stair is "1 m" away on the plan but a dozen metres up.
    const d = Math.hypot(target.x - player.x, player.y === undefined ? 0 : target.y - player.y, target.z - player.z);
    const dist = formatDistance(d);
    setText(this.trackTitle, target.questTitle);
    setText(this.trackText, target.progress ? `${target.text} (${target.progress})` : target.text);
    setText(this.trackDist, dist);
    setText(this.markerDist, dist);

    // Over a head (NPC) or well above a place; a little higher far away so it clears roofs.
    const lift = target.npc ? 2.35 : 3 + Math.min(12, d * 0.04);
    // Camera space, not the projected depth: with the reversed depth buffer a point behind the
    // camera projects to z < 0, so `project().z > 1` never caught it and the marker showed a target
    // behind you mirrored straight ahead (markerMath.ts has the story).
    v.set(target.x, target.y + lift, target.z).applyMatrix4(cam.matrixWorldInverse);
    const pm = cam.projectionMatrix.elements;
    const at = placeMarker(this.place, v.x, v.y, v.z, pm[0], pm[5], pm[8], pm[9], viewW, viewH, BOX);
    setClass(this.marker, 'is-edge', at.edge);
    // On the edge the chevron turns to point the way (a target behind points left or right).
    const angle = Math.round(at.angle);
    if (angle !== this.angle) {
      this.angle = angle;
      const svg = this.chevron.firstElementChild as HTMLElement | null;
      if (svg) svg.style.transform = angle ? `rotate(${angle}deg)` : '';
    }
    const sx = at.x;
    const sy = at.y;
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
.hud-qmark .chev svg { width: 100%; height: 100%; transition: transform 0.15s; }
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
