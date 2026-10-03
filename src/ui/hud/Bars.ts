/**
 * Resource bars (health/stamina/pietas), the enemy target bar and the boss bar. Bars deplete
 * toward their center like Skyrim's and leave a fading 'trail' showing recent loss.
 */
import { h, setClass, setText } from '../dom';
import type { BossView, TargetView } from '../types';

const SHOW_AFTER_CHANGE = 2.6; // seconds a bar stays visible after its value changes

export class ResourceBar {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private trail: HTMLElement;
  private shown = -1;
  private trailValue = 1;
  private trailHold = 0;
  private lastFrac = -1;
  private sinceChange = 99;
  private flashT = 0;

  constructor(readonly kind: 'health' | 'stamina' | 'pietas' | 'enemy' | 'boss') {
    this.fill = h('i', { class: 'fill' });
    this.trail = h('i', { class: 'trail' });
    this.el = h('div', { class: `hud-bar ${kind}` }, h('div', { class: 'track' }, this.trail, this.fill), h('b', { class: 'cap l' }), h('b', { class: 'cap r' }));
  }

  /** Returns true when the value changed recently (used for auto-fading). */
  set(frac: number, dt: number): boolean {
    frac = Math.max(0, Math.min(1, frac));
    if (Math.abs(frac - this.lastFrac) > 0.0005) {
      if (frac < this.lastFrac) this.trailHold = 0.45;
      this.sinceChange = 0;
      this.lastFrac = frac;
    } else this.sinceChange += dt;
    // The trail waits a moment, then catches up.
    if (frac >= this.trailValue) this.trailValue = frac;
    else if (this.trailHold > 0) this.trailHold -= dt;
    else this.trailValue = Math.max(frac, this.trailValue - dt * 0.6);
    if (Math.abs(this.shown - frac) > 0.0005) {
      this.fill.style.transform = `scaleX(${frac.toFixed(4)})`;
      this.shown = frac;
    }
    this.trail.style.transform = `scaleX(${this.trailValue.toFixed(4)})`;
    setClass(this.el, 'is-low', this.kind === 'health' && frac < 0.25);
    return this.sinceChange < SHOW_AFTER_CHANGE;
  }

  /** Flash the bar (a cost was refused, §15.1). Keeps it visible while flashing. */
  flash() {
    this.flashT = 0.7;
    this.el.classList.remove('is-flash');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add('is-flash');
  }

  /** Seconds of flash left; ticks down. */
  flashing(dt: number): boolean {
    if (this.flashT <= 0) return false;
    this.flashT -= dt;
    if (this.flashT <= 0) this.el.classList.remove('is-flash');
    return true;
  }

  reset(frac: number) {
    this.lastFrac = frac;
    this.trailValue = frac;
    this.shown = -1;
    this.set(frac, 0);
  }
}

export class TargetBar {
  readonly el: HTMLElement;
  private name: HTMLElement;
  private tier: HTMLElement;
  private bar = new ResourceBar('enemy');
  private linger = 0;
  private lastName = '';

  constructor() {
    this.name = h('span', { class: 'name' });
    this.tier = h('span', { class: 'tier' });
    this.el = h('div', { class: 'hud-target' }, h('div', { class: 'label' }, this.name, this.tier), this.bar.el);
  }

  update(t: TargetView | null, dt: number) {
    if (t) {
      if (t.name !== this.lastName) {
        this.bar.reset(t.health);
        this.lastName = t.name;
      }
      setText(this.name, t.name);
      setText(this.tier, t.tier ?? '');
      this.bar.set(t.health, dt);
      this.linger = 1.6;
    } else {
      this.linger -= dt;
      if (this.linger <= 0) this.lastName = '';
    }
    setClass(this.el, 'is-visible', this.linger > 0);
  }
}

export class BossBar {
  readonly el: HTMLElement;
  private name: HTMLElement;
  private title: HTMLElement;
  private bar = new ResourceBar('boss');
  private active = false;
  private pips: HTMLElement;
  private pipKey = '';

  constructor() {
    this.name = h('div', { class: 'name' });
    this.title = h('div', { class: 'title' });
    this.pips = h('div', { class: 'pips' });
    this.bar.el.appendChild(this.pips);
    this.el = h('div', { class: 'hud-boss' }, h('div', { class: 'label' }, this.name, this.title), this.bar.el);
  }

  update(b: BossView | null, dt: number) {
    if (b) {
      if (!this.active) this.bar.reset(b.health);
      setText(this.name, b.name);
      setText(this.title, b.title ?? '');
      this.bar.set(b.health, dt);
      // Phase pips where the fight changes, dimmed once passed. The bar shrinks toward its centre,
      // so a health fraction f sits at both edges of the fill: 50 % ± f/2.
      const phases = b.phases ?? [];
      const key = phases.join(',');
      if (key !== this.pipKey) {
        this.pipKey = key;
        this.pips.replaceChildren(...phases.flatMap((f) => [50 - f * 50, 50 + f * 50].map((x) => h('i', { class: 'pip', style: `left:${x.toFixed(2)}%` }))));
      }
      phases.forEach((f, i) => {
        for (const k of [0, 1]) setClass(this.pips.children[i * 2 + k] as HTMLElement, 'is-passed', b.health <= f);
      });
    }
    this.active = !!b;
    setClass(this.el, 'is-visible', this.active);
  }
}
