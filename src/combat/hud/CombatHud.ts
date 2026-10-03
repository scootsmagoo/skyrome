/**
 * The combat parts of the HUD that the UI module doesn't draw (docs/GDD.md §15.1): the lock-on
 * bracket, the arena crowd-favor meter with the missio chant, the cinnabar edge pulse that
 * telegraphs an unblockable attack (§6.4), the net prompt, sand in the eyes, hold rings (yield,
 * salute, finishing a body) and a centre message. Plain DOM over the canvas, mounted inside the
 * UI's HUD root when there is one (so it hides with the HUD under menus).
 */
import './combat-hud.css';

export interface CombatHudState {
  /** Lock-on bracket position in CSS px, or null. */
  lock: { x: number; y: number } | null;
  /** Arena bout favor 0–100 and the crowd's chant. */
  favor: { value: number; chant: 'mitte' | 'iugula' | null } | null;
  /** Entangled: 0..1 of the net time left, or null. */
  net: number | null;
  blind: boolean;
  hold: { progress: number; label: string } | null;
}

function el(tag: string, cls: string, ...kids: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  for (const k of kids) e.append(k);
  return e;
}

const RING = 2 * Math.PI * 18;

export class CombatHud {
  readonly el: HTMLElement;
  private lock = el('div', 'cb-lock', el('i', 'tl'), el('i', 'tr'), el('i', 'bl'), el('i', 'br'), el('i', 'dot'));
  private favor: HTMLElement;
  private favorFill: HTMLElement;
  private favorValue: HTMLElement;
  private favorDelta: HTMLElement;
  private chant: HTMLElement;
  private edge = el('div', 'cb-edge');
  private blind = el('div', 'cb-blind');
  private netMesh = el('div', 'cb-netmesh');
  private net: HTMLElement;
  private netBar: HTMLElement;
  private hold: HTMLElement;
  private holdFg: SVGCircleElement;
  private holdLabel: HTMLElement;
  private msg: HTMLElement;
  private msgBig: HTMLElement;
  private msgSmall: HTMLElement;
  private msgT = 0;
  private deltaT = 0;
  private edgeT = 0;
  private lastFavor = -1;

  constructor(
    parent: HTMLElement,
    keys: { attack: string; interact: string },
  ) {
    this.favorFill = el('i', 'fill');
    const track = el('div', 'track', this.favorFill);
    for (const f of [30, 50]) {
      const t = el('i', 'tick');
      t.style.bottom = `${f}%`;
      track.append(t);
    }
    this.favorValue = el('div', 'value', '30');
    this.favorDelta = el('div', 'delta');
    this.chant = el('div', 'chant');
    this.favor = el('div', 'cb-favor', el('div', 'col', el('div', 'label', 'FAVOR · POPVLI'), track), this.favorValue, this.favorDelta, this.chant);

    this.netBar = el('i', '');
    this.net = el(
      'div',
      'cb-net',
      el('div', 'title', 'IRRETITVS'),
      el('div', 'hint', 'Caught in the net — press ', el('span', 'cb-key', keys.attack), ' or ', el('span', 'cb-key', keys.interact), ' to struggle free'),
      el('div', 'bar', this.netBar),
    );

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    const bg = document.createElementNS(ns, 'circle');
    const fg = document.createElementNS(ns, 'circle');
    for (const c of [bg, fg]) {
      c.setAttribute('cx', '20');
      c.setAttribute('cy', '20');
      c.setAttribute('r', '18');
    }
    bg.setAttribute('class', 'bg');
    fg.setAttribute('class', 'fg');
    fg.setAttribute('stroke-dasharray', `${RING}`);
    svg.append(bg, fg);
    this.holdFg = fg;
    this.holdLabel = el('div', 'label');
    this.hold = el('div', 'cb-hold');
    this.hold.append(svg, this.holdLabel);

    this.msgBig = el('div', 'big');
    this.msgSmall = el('div', 'small');
    this.msg = el('div', 'cb-msg', this.msgBig, this.msgSmall);

    this.el = el('div', 'cb-hud', this.blind, this.netMesh, this.edge, this.lock, this.favor, this.net, this.hold, this.msg);
    parent.appendChild(this.el);
  }

  /** The unblockable telegraph. `calm`: reduce-flashing (a steady glow instead of a pulse). */
  pulseUnblockable(calm: boolean) {
    this.edge.classList.toggle('is-calm', calm);
    this.edge.classList.remove('is-on');
    void this.edge.offsetWidth;
    this.edge.classList.add('is-on');
    this.edgeT = 0.8;
  }

  message(big: string, small = '', seconds = 3) {
    this.msgBig.textContent = big;
    this.msgSmall.textContent = small;
    this.msgT = seconds;
  }

  update(s: CombatHudState, dt: number) {
    // Lock-on bracket.
    this.lock.classList.toggle('is-on', !!s.lock);
    if (s.lock) this.lock.style.transform = `translate(${s.lock.x.toFixed(1)}px, ${s.lock.y.toFixed(1)}px)`;

    // Favor.
    this.favor.classList.toggle('is-on', !!s.favor);
    if (s.favor) {
      const v = Math.round(s.favor.value);
      this.favorFill.style.height = `${Math.max(0, Math.min(100, s.favor.value)).toFixed(1)}%`;
      if (v !== Math.round(this.lastFavor)) {
        if (this.lastFavor >= 0) {
          const d = v - Math.round(this.lastFavor);
          this.favorDelta.textContent = d > 0 ? `+${d}` : `${d}`;
          this.favorDelta.className = `delta is-on ${d > 0 ? 'up' : 'down'}`;
          this.deltaT = 1.2;
        }
        this.favorValue.textContent = String(v);
      }
      this.lastFavor = s.favor.value;
      const chant = s.favor.chant;
      this.chant.classList.toggle('is-on', !!chant);
      this.chant.classList.toggle('iugula', chant === 'iugula');
      this.chant.textContent = chant === 'mitte' ? 'MITTE!' : chant === 'iugula' ? 'IVGVLA!' : '';
    } else this.lastFavor = -1;
    if (this.deltaT > 0) {
      this.deltaT -= dt;
      if (this.deltaT <= 0) this.favorDelta.classList.remove('is-on');
    }

    // Net, sand.
    this.net.classList.toggle('is-on', s.net !== null);
    this.netMesh.classList.toggle('is-on', s.net !== null);
    if (s.net !== null) this.netBar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.net)).toFixed(3)})`;
    this.blind.classList.toggle('is-on', s.blind);

    // Hold ring.
    this.hold.classList.toggle('is-on', !!s.hold);
    if (s.hold) {
      this.holdFg.setAttribute('stroke-dashoffset', `${(RING * (1 - Math.max(0, Math.min(1, s.hold.progress)))).toFixed(2)}`);
      this.holdLabel.textContent = s.hold.label;
    }

    if (this.edgeT > 0) {
      this.edgeT -= dt;
      if (this.edgeT <= 0) this.edge.classList.remove('is-on');
    }
    if (this.msgT > 0) this.msgT -= dt;
    this.msg.classList.toggle('is-on', this.msgT > 0);
  }

  dispose() {
    this.el.remove();
  }
}
