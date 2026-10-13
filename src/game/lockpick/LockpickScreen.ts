/**
 * The lockpicking screen (GDD §14.3): a cross-section of a Roman lift-and-slide lock, the lift
 * meter with the tumbler's set zone, the strain pips and the buttons. It owns no rules: the
 * LockMachine does (machine.ts) and the service (service.ts) turns its events into sounds,
 * inventory changes and XP. This file only draws and reads the keys.
 *
 * Controls (every one has a key, a pad button and an on-screen button):
 *   Lift   hold Space, F (the attack key), Enter (the pad's A) or the mouse button / the Lift button
 *   Slide  D (the move-right key), → (the pad's d-pad) or the Slide button
 *   Leave  Esc (the pad's B) or the Leave button
 * Presses are queued by the key events and applied at the start of the next frame, so the meter the
 * player saw is the meter that counts.
 */
import { BaseModal } from '../../ui/Modal';
import type { UIManager } from '../../ui/UIManager';
import { h, keycap, setText, svgEl } from '../../ui/dom';
import { byDevice, promptLabel } from '../../ui/prompts';
import { padButtonLabel, PAD } from '../../core/gamepad';
import { codeLabel } from '../../core/Input';
import type { Game } from '../../core/Game';
import type { LockTier } from '../../rpg/thievery';
import type { LockEvent, LockMachine } from './machine';
import './lockpick.css';

export interface LockpickView {
  label: string;
  tier: LockTier;
  /** Tumbler Sense: the meter hints (a glow and a tick) when it is inside the zone. */
  sense: boolean;
}

type Queued = 'down' | 'up' | 'slide' | 'newpick';

/** What the player is told after an event, and for how long (s). */
const FLASH_S = 1.4;
/** After the lock opens or the last pick snaps, the screen lingers this long (s). */
const LINGER_S = 0.9;

// The lock's drawing, in SVG user units.
const VB_W = 300;
const VB_H = 150;
const BOLT_Y = 86;
const BOLT_H = 26;
const PIN_LEN = 56;
const PIN_W = 20;
const RAISE = 34;
const BOLT_SLIDE = 26;

const TIER_LATIN: Record<LockTier, string> = { simplex: 'simplex', mediocris: 'mediocris', difficilis: 'difficilis', firma: 'firma' };

function pinX(i: number, n: number): number {
  const span = 196;
  const step = n > 1 ? Math.min(52, (span - PIN_W) / (n - 1)) : 0;
  const start = 28 + (span - PIN_W - step * (n - 1)) / 2;
  return start + i * step;
}

export class LockpickScreen extends BaseModal {
  readonly id = 'lockpick';
  private readonly queue: Queued[] = [];
  private readonly pins: SVGGElement[] = [];
  private bolt!: SVGGElement;
  private zoneEl = h('div', { class: 'lp-zone' });
  private markEl = h('div', { class: 'lp-mark' });
  private fillEl = h('div', { class: 'lp-fill' });
  private meterEl = h('div', { class: 'lp-meter' }, this.fillEl, this.zoneEl, this.markEl);
  private pips: HTMLElement[] = [];
  private statusEl = h('div', { class: 'lp-status' });
  private picksEl = h('span', { class: 'lp-picks' });
  private progressEl = h('span', { class: 'lp-progress' });
  private liftBtn!: HTMLButtonElement;
  private slideBtn!: HTMLButtonElement;
  private leaveBtn!: HTMLButtonElement;
  private flash = '';
  private flashLeft = 0;
  private lingerLeft = -1;
  private finished = false;
  private device = '';
  private pointerHeld = false;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly game: Game,
    private readonly machine: LockMachine,
    private readonly view: LockpickView,
    /** Called with every event the machine produced, in order (sounds, inventory, XP). */
    private readonly onEvents: (events: LockEvent[]) => void,
    /** Called once, when the screen is leaving. */
    private readonly resolve: (result: 'opened' | 'broken' | 'cancelled') => void,
  ) {
    super('lockpick-screen');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    this.build();
    // A lift must never hang on: the window losing focus or the pointer being cancelled drops it.
    const drop = () => this.queue.push('up');
    const up = (e: PointerEvent) => {
      if (this.pointerHeld && e.button === 0) {
        this.pointerHeld = false;
        this.queue.push('up');
      }
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', drop, true);
    window.addEventListener('blur', drop);
    this.offs.push(
      () => window.removeEventListener('pointerup', up, true),
      () => window.removeEventListener('pointercancel', drop, true),
      () => window.removeEventListener('blur', drop),
    );
    this.draw(true);
  }

  onClose() {
    for (const off of this.offs.splice(0)) off();
    this.machine.abortLift();
    if (!this.finished) {
      this.finished = true;
      this.machine.cancel();
      this.resolve(this.machine.result ?? 'cancelled');
    }
  }

  // ---------------------------------------------------------------- input

  /** Is this key a Lift key? The bound Jump and Attack keys count, so a rebinding is followed. */
  private isLift(code: string): boolean {
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') return true;
    const b = this.game.input?.bindings;
    return !!b && [...(b.jump ?? []), ...(b.attack ?? [])].includes(code);
  }

  /** The keys named on the Lift button: the bound Jump and Attack keys (the mouse button is in the hint). */
  private liftLabels(): string[] {
    const b = this.game.input?.bindings;
    const codes = b ? [...(b.jump ?? []), ...(b.attack ?? [])] : ['Space', 'KeyF'];
    return codes.filter((c) => !c.startsWith('Mouse') && !c.startsWith('Wheel')).map(codeLabel).filter((l, i, a) => a.indexOf(l) === i);
  }

  private isSlide(code: string): boolean {
    if (code === 'KeyD' || code === 'ArrowRight') return true;
    return !!this.game.input?.bindings?.right?.includes(code);
  }

  onKey(e: KeyboardEvent): boolean {
    if (this.finished) return true;
    if (this.isLift(e.code)) {
      if (!e.repeat) this.queue.push(this.machine.phase === 'snapped' ? 'newpick' : 'down');
      return true;
    }
    if (this.isSlide(e.code)) {
      this.queue.push('slide');
      return true;
    }
    return e.code === 'Tab';
  }

  onKeyUp(e: KeyboardEvent) {
    if (this.isLift(e.code)) this.queue.push('up');
  }

  onEscape() {
    this.leave();
    return false;
  }

  private leave() {
    if (this.finished) return;
    this.apply(this.machine.cancel());
    this.finish();
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.close();
    this.resolve(this.machine.result ?? 'cancelled');
  }

  // ---------------------------------------------------------------- frame

  update(dt: number) {
    const step = Math.min(Math.max(dt, 0), 0.1);
    const m = this.machine;
    if (!this.finished) {
      // Presses first: they were made against the meter the player last saw.
      for (const q of this.queue.splice(0)) {
        if (q === 'down') m.press();
        else if (q === 'up') this.apply(m.release());
        else if (q === 'slide') this.slideOrHint();
        else if (q === 'newpick') this.apply(m.newPick());
      }
      this.apply(m.advance(step));
      if (this.flashLeft > 0) this.flashLeft -= step;
      if (this.lingerLeft >= 0 && (this.lingerLeft -= step) < 0) this.finish();
      if (!this.finished && (m.phase === 'opened' || m.phase === 'broken') && this.lingerLeft < 0) this.lingerLeft = LINGER_S;
    }
    this.draw(false);
  }

  private slideOrHint() {
    const m = this.machine;
    if (m.phase === 'bolt') this.apply(m.slide());
    else if (m.phase === 'picking') this.say(`Set every tumbler first (${m.setCount} of ${m.tumblers}).`);
  }

  private apply(events: LockEvent[]) {
    if (!events.length) return;
    this.onEvents(events);
    for (const e of events) {
      if (e.type === 'set') this.say(this.machine.phase === 'bolt' ? 'The last tumbler clicks home.' : 'Click. The tumbler is set.');
      else if (e.type === 'strain') this.say(e.strain >= this.machine.strainToBreak ? '' : 'Scrape. The pick strains.');
      else if (e.type === 'snap') this.say(e.picksLeft > 0 ? 'The pick snaps!' : 'The last pick snaps!');
      else if (e.type === 'newpick') this.say('A fresh pick. The tumblers you set hold.');
      else if (e.type === 'opened') this.say('The bolt slides home. The lock is open.');
    }
  }

  private say(text: string) {
    this.flash = text;
    this.flashLeft = FLASH_S;
  }

  // ---------------------------------------------------------------- drawing

  private build() {
    const m = this.machine;
    const n = m.tumblers;
    const pinsMarkup = Array.from({ length: n }, (_, i) => {
      const x = pinX(i, n);
      return `<g class="lp-pin" data-i="${i}" style="transform:translate(${x}px,0)"><g class="lp-pinbody"><rect x="0" y="${BOLT_Y + BOLT_H - PIN_LEN}" width="${PIN_W}" height="${PIN_LEN}" rx="3"/><rect class="lp-pinshine" x="3" y="${BOLT_Y + BOLT_H - PIN_LEN + 3}" width="3" height="${PIN_LEN - 8}" rx="1.5"/></g></g>`;
    }).join('');
    const holes = Array.from({ length: n }, (_, i) => `<rect class="lp-boltslot" x="${pinX(i, n)}" y="${BOLT_Y}" width="${PIN_W}" height="${BOLT_H}" rx="2"/>`).join('');
    const svg = svgEl(`<svg class="lp-lock" viewBox="0 0 ${VB_W} ${VB_H}" role="img" aria-label="Cross-section of the lock">
      <rect class="lp-case" x="6" y="12" width="${VB_W - 12}" height="${VB_H - 24}" rx="6"/>
      <rect class="lp-channel" x="12" y="${BOLT_Y - 3}" width="${VB_W - 24}" height="${BOLT_H + 6}" rx="2"/>
      ${Array.from({ length: n }, (_, i) => `<rect class="lp-shaft" x="${pinX(i, n) - 3}" y="22" width="${PIN_W + 6}" height="${BOLT_Y - 22}" rx="3"/>`).join('')}
      <g class="lp-bolt"><rect class="lp-boltbar" x="18" y="${BOLT_Y}" width="214" height="${BOLT_H}" rx="3"/>${holes}<rect class="lp-boltgrip" x="232" y="${BOLT_Y + 5}" width="24" height="${BOLT_H - 10}" rx="3"/><circle class="lp-boltknob" cx="248" cy="${BOLT_Y + BOLT_H / 2}" r="4"/></g>
      ${pinsMarkup}
    </svg>`);
    this.bolt = svg.querySelector('.lp-bolt') as SVGGElement;
    this.pins.length = 0;
    svg.querySelectorAll<SVGGElement>('.lp-pin').forEach((g) => this.pins.push(g));
    // The bolt's holes are drawn over the pins' rest so a pin at rest sits in its hole; the bolt
    // paints above the pins' lower halves, which is how a raised pin clears it.
    svg.querySelectorAll('.lp-pin').forEach((g) => svg.appendChild(g));

    this.pips = Array.from({ length: m.strainToBreak }, () => h('i', { class: 'lp-pip' }));
    this.liftBtn = h('button', {
      class: 'sr-btn sr-btn-primary lp-lift',
      type: 'button',
      on: {
        pointerdown: (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          this.pointerHeld = true;
          this.queue.push(this.machine.phase === 'snapped' ? 'newpick' : 'down');
        },
      },
    });
    this.slideBtn = h('button', { class: 'sr-btn lp-slide', type: 'button', on: { click: () => this.queue.push('slide') } });
    this.leaveBtn = h('button', { class: 'sr-btn lp-leave', type: 'button', on: { click: () => this.leave() } });

    const frame = h(
      'div',
      { class: 'lp-panel sr-panel' },
      h('div', { class: 'lp-title' }, h('span', { class: 'en' }, this.view.label), h('span', { class: 'la' }, `Sera ${TIER_LATIN[this.view.tier]}`)),
      h('div', { class: 'lp-head' }, this.progressEl, h('span', { class: 'lp-pips', title: 'Strain' }, ...this.pips), this.picksEl),
      h('div', { class: 'lp-main' }, h('div', { class: 'lp-lockwrap' }, svg), h('div', { class: 'lp-meterwrap' }, this.meterEl)),
      this.statusEl,
      h('div', { class: 'lp-btns' }, this.liftBtn, this.slideBtn, this.leaveBtn),
    );
    // A press anywhere on the panel that is not a button lifts, like the mouse button of GDD §14.3.
    frame.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      this.pointerHeld = true;
      this.queue.push(this.machine.phase === 'snapped' ? 'newpick' : 'down');
    });
    this.el.replaceChildren(h('div', { class: 'sr-backdrop' }), frame);
    this.buttons(true);
  }

  /** The buttons' captions follow the device in hand and the phase of the lock. */
  private buttons(force: boolean) {
    const g = this.game;
    const dev = (g.input as { device?: string } | undefined)?.device ?? 'keyboard';
    const key = `${dev}:${this.machine.phase}:${this.machine.picks}`;
    if (!force && key === this.device) return;
    this.device = key;
    const caps = (labels: string[]) => labels.filter(Boolean).map((l) => keycap(l, 'sr-key-sm'));
    const pad = (b: number) => padButtonLabel(b, g.gamepad?.family ?? 'generic');
    const liftKeys = byDevice(g, {
      keyboard: this.liftLabels(),
      gamepad: [pad(PAD.A)],
      touch: [],
    });
    const slideKeys = byDevice(g, { keyboard: [promptLabel(g, 'right') || 'D'], gamepad: [pad(PAD.RIGHT)], touch: [] });
    const leaveKeys = byDevice(g, { keyboard: ['Esc'], gamepad: [pad(PAD.B)], touch: [] });
    const snapped = this.machine.phase === 'snapped';
    this.liftBtn.replaceChildren(...caps(liftKeys), snapped ? `New pick (${this.machine.picks})` : 'Lift (hold)');
    this.slideBtn.replaceChildren(...caps(slideKeys), 'Slide');
    this.leaveBtn.replaceChildren(...caps(leaveKeys), 'Leave');
  }

  private draw(force: boolean) {
    const m = this.machine;
    const n = m.tumblers;
    this.buttons(force);

    // Progress, strain and picks.
    const cur = Math.min(m.current + 1, n);
    setText(this.progressEl, m.phase === 'bolt' || m.phase === 'opened' ? `All ${n} tumblers set` : `Tumbler ${cur} of ${n}`);
    this.pips.forEach((p, i) => p.classList.toggle('on', i < m.strain));
    setText(this.picksEl, `Picks: ${Math.max(0, m.picks)}`);

    // The meter and the current zone.
    const z = m.zone();
    const showZone = !!z && (m.phase === 'picking' || m.phase === 'snapped');
    this.zoneEl.style.display = showZone ? '' : 'none';
    if (z) {
      this.zoneEl.style.bottom = `${z[0] * 100}%`;
      this.zoneEl.style.height = `${(z[1] - z[0]) * 100}%`;
    }
    const meter = m.meter;
    this.markEl.style.bottom = `${meter * 100}%`;
    this.fillEl.style.height = `${meter * 100}%`;
    const inZone = m.inZone;
    this.meterEl.classList.toggle('lifting', m.holding);
    this.meterEl.classList.toggle('sense', this.view.sense && inZone);
    this.zoneEl.classList.toggle('hot', this.view.sense && inZone);

    // The tumblers: set ones stand clear of the bolt, the current one follows the meter.
    const cur0 = m.current;
    this.pins.forEach((g, i) => {
      const body = g.querySelector('.lp-pinbody') as SVGGElement;
      const set = m.set[i];
      const lift = set ? RAISE : i === cur0 ? meter * RAISE : 0;
      body.style.transform = `translate(0, ${-lift}px)`;
      g.classList.toggle('set', set);
      g.classList.toggle('cur', i === cur0 && m.phase === 'picking');
      g.classList.toggle('sense', this.view.sense && inZone && i === cur0);
    });
    const slid = m.phase === 'opened';
    this.bolt.style.transform = `translate(${slid ? BOLT_SLIDE : 0}px, 0)`;
    this.bolt.classList.toggle('ready', m.phase === 'bolt');

    // The status line and the buttons' state.
    let text = this.flashLeft > 0 && this.flash ? this.flash : '';
    if (!text) {
      if (m.phase === 'bolt') text = byDevice(this.game, { keyboard: 'Every tumbler is set. Slide the bolt.', gamepad: 'Every tumbler is set. Slide the bolt.', touch: 'Every tumbler is set. Tap Slide the bolt.' });
      else if (m.phase === 'snapped') text = `The pick snapped. Take another (${m.picks} left) or leave.`;
      else if (m.phase === 'broken') text = 'The last pick has snapped. The lock holds.';
      else if (m.phase === 'opened') text = 'The lock is open.';
      else text = m.holding ? 'Release inside the gold band.' : byDevice(this.game, { keyboard: 'Hold to raise the tumbler (or hold the mouse button), then let go in the gold band.', gamepad: 'Hold to raise the tumbler, then let go in the gold band.', touch: 'Hold Lift, then let go in the gold band.' });
    }
    setText(this.statusEl, text);
    this.statusEl.classList.toggle('bad', m.phase === 'snapped' || m.phase === 'broken' || (this.flashLeft > 0 && /scrape|snap/i.test(this.flash)));
    this.statusEl.classList.toggle('good', m.phase === 'bolt' || m.phase === 'opened');
    this.liftBtn.classList.toggle('is-disabled', !(m.phase === 'picking' || m.phase === 'snapped'));
    this.slideBtn.classList.toggle('is-disabled', m.phase !== 'bolt');
    this.slideBtn.classList.toggle('lp-ready', m.phase === 'bolt');
    this.liftBtn.classList.toggle('lp-held', m.holding);
  }
}
