/**
 * Transient HUD messages: notifications (top-left queue), center banners (location discovered,
 * quest started/completed, level up), subtitles and the hit-direction indicator.
 */
import { h } from '../dom';
import { toInscription } from '../format';
import { laurelRule } from '../motifs';

export type NotifyKind = 'info' | 'item' | 'quest' | 'skill' | 'warning' | 'money';

export type BannerKind = 'location' | 'quest-start' | 'quest-complete' | 'quest-fail' | 'objective' | 'level' | 'skill' | 'generic';

export interface BannerOptions {
  kind?: BannerKind;
  /** Big line. Location banners render it in inscriptional capitals. */
  title: string;
  /** Small line above the title ('Quest started'); defaults per kind. */
  label?: string;
  /** Line under the title (English name, quest summary). */
  subtitle?: string;
  duration?: number;
  /** Asked when its turn comes: true skips it (an objective already done by then). */
  stale?: () => boolean;
}

const LABELS: Record<BannerKind, string> = {
  location: 'Discovered',
  'quest-start': 'Quest started',
  'quest-complete': 'Quest completed',
  'quest-fail': 'Quest failed',
  objective: 'Next',
  level: 'Level increased',
  skill: 'Skill increased',
  generic: '',
};

const MAX_NOTES = 5;
const NOTE_TIME = 4.2;
/** Seconds a note or banner stays up after a menu that covered it closes. */
const RESUME_TIME = 2.2;

export class Notifications {
  readonly el = h('div', { class: 'hud-notes' });
  private queue: { text: string; kind: NotifyKind }[] = [];
  private live: { el: HTMLElement; t: number }[] = [];

  push(text: string, kind: NotifyKind = 'info') {
    // Collapse exact duplicates arriving together ('Panis added' ×3).
    const last = this.queue[this.queue.length - 1];
    if (last && last.text === text) return;
    this.queue.push({ text, kind });
  }

  update(dt: number) {
    while (this.queue.length && this.live.length < MAX_NOTES) {
      const n = this.queue.shift()!;
      const el = h('div', { class: `hud-note ${n.kind}` }, h('i', { class: 'bullet' }), h('span', null, n.text));
      this.el.appendChild(el);
      this.live.push({ el, t: 0 });
    }
    for (const n of this.live) {
      n.t += dt;
      if (n.t > NOTE_TIME && !n.el.classList.contains('is-leaving')) n.el.classList.add('is-leaving');
    }
    const done = this.live.filter((n) => n.t > NOTE_TIME + 0.6);
    for (const n of done) n.el.remove();
    if (done.length) this.live = this.live.filter((n) => n.t <= NOTE_TIME + 0.6);
  }

  /** The HUD is visible again: notes that were on screen get at least a couple more seconds. */
  resume() {
    for (const n of this.live) {
      n.t = Math.min(n.t, NOTE_TIME - RESUME_TIME);
      n.el.classList.remove('is-leaving');
    }
  }
}

function bannerDuration(o: BannerOptions): number {
  return o.duration ?? (o.kind === 'location' ? 4.2 : o.kind === 'objective' ? 5 : 3.6);
}

const QUEST_KINDS: readonly (BannerKind | undefined)[] = ['quest-start', 'quest-complete', 'quest-fail', 'objective'];

export class Banners {
  readonly el = h('div', { class: 'hud-banner' });
  private queue: BannerOptions[] = [];
  private current: { opts: BannerOptions; t: number; el: HTMLElement } | null = null;

  /**
   * Quest news goes ahead of the places discovered on the way (a walk across the city can queue a
   * row of them), in its own order; only the latest place waiting is kept.
   */
  push(opts: BannerOptions) {
    if (QUEST_KINDS.includes(opts.kind)) {
      // Only the newest next step waits: an older one is out of date already.
      if (opts.kind === 'objective') this.queue = this.queue.filter((q) => q.kind !== 'objective');
      let i = 0;
      while (i < this.queue.length && QUEST_KINDS.includes(this.queue[i].kind)) i++;
      this.queue.splice(i, 0, opts);
      return;
    }
    if (opts.kind === 'location') this.queue = this.queue.filter((q) => q.kind !== 'location');
    this.queue.push(opts);
  }

  update(dt: number) {
    while (!this.current && this.queue.length && this.queue[0].stale?.()) this.queue.shift();
    if (!this.current && this.queue.length) {
      const opts = this.queue.shift()!;
      const kind = opts.kind ?? 'generic';
      const label = opts.label ?? LABELS[kind];
      const title = kind === 'location' ? toInscription(opts.title) : opts.title;
      const el = h(
        'div',
        { class: `hud-banner-card ${kind}` },
        label ? h('div', { class: 'label' }, label) : null,
        h('div', { class: 'title' }, title),
        opts.subtitle ? h('div', { class: 'subtitle' }, opts.subtitle) : null,
      );
      const rule = document.createElement('div');
      rule.className = 'rule';
      rule.innerHTML = laurelRule(260, 30);
      el.appendChild(rule);
      this.el.appendChild(el);
      this.current = { opts, t: 0, el };
    }
    if (this.current) {
      const c = this.current;
      c.t += dt;
      const dur = bannerDuration(c.opts);
      if (c.t > dur && !c.el.classList.contains('is-leaving')) c.el.classList.add('is-leaving');
      if (c.t > dur + 0.7) {
        c.el.remove();
        this.current = null;
      }
    }
  }

  /** The HUD is visible again: the banner on screen gets at least a couple more seconds. */
  resume() {
    const c = this.current;
    if (!c) return;
    c.t = Math.min(c.t, Math.max(0, bannerDuration(c.opts) - RESUME_TIME));
    c.el.classList.remove('is-leaving');
  }
}

export class Subtitles {
  readonly el = h('div', { class: 'hud-subtitle' });
  private t = 0;
  private dur = 0;
  enabled = true;

  show(text: string, speaker?: string, duration?: number) {
    if (!this.enabled) return;
    this.el.replaceChildren(
      speaker ? h('span', { class: 'speaker' }, speaker) : '',
      h('span', { class: 'text' }, text),
    );
    this.t = 0;
    this.dur = duration ?? Math.max(2.6, 1 + text.length * 0.055);
    this.el.classList.add('is-visible');
  }

  clear() {
    this.dur = 0;
    this.el.classList.remove('is-visible');
  }

  update(dt: number) {
    if (this.dur <= 0) return;
    this.t += dt;
    if (this.t > this.dur) this.clear();
  }
}

/** Red arcs around the crosshair pointing toward the source of damage. */
export class HitIndicator {
  readonly el = h('div', { class: 'hud-hits' });
  private arcs: { el: HTMLElement; t: number; worldX: number; worldZ: number }[] = [];

  add(worldX: number, worldZ: number) {
    if (this.arcs.length >= 4) this.arcs.shift()!.el.remove();
    const el = h('div', { class: 'hud-hit' });
    el.innerHTML = '<svg viewBox="-100 -100 200 200" aria-hidden="true"><path d="M-38 -86 A94 94 0 0 1 38 -86 L32 -74 A81 81 0 0 0 -32 -74 Z"/></svg>';
    this.el.appendChild(el);
    this.arcs.push({ el, t: 0, worldX, worldZ });
  }

  /** `bearingOf(x, z)` returns the relative bearing (degrees) of a world point from the camera. */
  update(dt: number, relBearing: (x: number, z: number) => number) {
    for (const a of this.arcs) {
      a.t += dt;
      a.el.style.transform = `rotate(${relBearing(a.worldX, a.worldZ).toFixed(1)}deg)`;
      a.el.style.opacity = String(Math.max(0, 1 - a.t / 1.4));
    }
    const dead = this.arcs.filter((a) => a.t > 1.4);
    for (const a of dead) a.el.remove();
    if (dead.length) this.arcs = this.arcs.filter((a) => a.t <= 1.4);
  }
}
