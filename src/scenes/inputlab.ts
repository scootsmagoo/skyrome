/**
 * Input lab (?scene=inputlab, GDD §4.1 and AC-24): shows, live, every raw input event (keys, mouse
 * buttons, wheel deltas, Safari gesture events, pointer-lock changes) next to the game actions
 * they produce through core Input, so the owner can check the Mac trackpad pitfalls:
 *
 *   ✓ the click that captures the pointer never attacks
 *   ✓ a momentum flick gives one zoom step, not a burst
 *   ✓ a pinch never zooms the page (it zooms the camera)
 *   ✓ P / L (quicksave / quickload) and N (walk) work; Caps Lock toggles once per press if bound
 *
 * The preset buttons (1 Mouse · 2 Trackpad · 3 Keyboard) apply the control presets live.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { DEFAULT_BINDINGS, codeLabel, type Action } from '../core/Input';
import { MeshBuilder, placeAndRegister } from '../gfx/MeshBuilder';
import { controlState, presetValues, type ControlPreset } from '../game/settings';
import { basicLights } from './common';
import type { SceneDef } from './types';

const CSS = `
.il { position:absolute; inset:0; pointer-events:none; font:14px/1.35 'EB Garamond', Georgia, serif; color:#f4ebd8; }
.il .col { position:absolute; top:12px; bottom:12px; overflow:hidden; background:rgba(12,9,6,.86); border:1px solid rgba(214,176,98,.35); border-radius:6px; padding:10px 12px; pointer-events:auto; }
.il .left { left:12px; width:31%; }
.il .right { right:12px; width:37%; }
.il h2 { margin:0 0 6px; font:600 13px Cinzel, serif; letter-spacing:.14em; text-transform:uppercase; color:#e6c67e; }
.il .log { font:12px/1.35 ui-monospace, Menlo, monospace; white-space:pre; color:#dacdb2; }
.il .log .k { color:#e6c67e; } .il .log .w { color:#8cc1e6; } .il .log .m { color:#e3897b; } .il .log .g { color:#a7d48a; }
.il .acts { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; margin-bottom:8px; }
.il .act { padding:3px 6px; border:1px solid rgba(214,176,98,.25); border-radius:3px; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.il .act.down { background:#7d1f1a; border-color:#e6c67e; }
.il .act.flash { box-shadow:0 0 0 2px #e6c67e inset; }
.il .checks div { margin:2px 0; } .il .ok { color:#95c46e; } .il .bad { color:#e46450; } .il .dim { color:#a99a7e; }
.il .presets { display:flex; gap:6px; margin:6px 0 10px; }
.il .presets button { flex:1; min-height:36px; background:rgba(40,29,20,.9); color:#f4ebd8; border:1px solid rgba(214,176,98,.45); border-radius:4px; font:14px 'EB Garamond', serif; cursor:pointer; }
.il .presets button.on { border-color:#e6c67e; background:#7d1f1a; }
.il .center { position:absolute; left:calc(31% + 24px); right:calc(37% + 24px); top:50%; transform:translateY(-50%); text-align:center; color:#f4ebd8; text-shadow:0 1px 3px #000; pointer-events:none; }
.il .center .big { font:600 20px Cinzel, serif; letter-spacing:.08em; color:#e6c67e; }
`;

const ACTIONS = Object.keys(DEFAULT_BINDINGS) as Action[];

interface LabState {
  lines: { cls: string; text: string }[];
  wheelEvents: number;
  gestureEvents: number;
  zoomSteps: { in: number; out: number };
  /** Per-gesture tally: wheel events and the steps they produced. */
  lastGesture: { events: number; steps: number; t: number };
  lockClickAttacked: boolean | null;
  lockedAt: number;
  /** Clicks made while the pointer was free, and how many of them attacked. */
  freeClicks: number;
  freeClickAt: number;
  freeClickAttacks: number;
  presses: Partial<Record<Action, number>>;
  pageZoom: number;
}

class InputLab implements System {
  readonly name = 'inputLab';
  readonly priority = 900;
  private flash = new Map<Action, number>();
  private chips = new Map<Action, HTMLElement>();
  private acc = 0;

  constructor(
    private readonly game: Game,
    private readonly s: LabState,
    private readonly els: { log: HTMLElement; acts: HTMLElement; checks: HTMLElement; center: HTMLElement; presets: HTMLElement },
  ) {
    for (const a of ACTIONS) {
      const el = document.createElement('div');
      el.className = 'act';
      el.title = a;
      this.chips.set(a, el);
      els.acts.appendChild(el);
    }
  }

  update() {
    const input = this.game.input;
    for (const a of ACTIONS) {
      if (input.pressed(a)) {
        this.flash.set(a, 0.35);
        this.s.presses[a] = (this.s.presses[a] ?? 0) + 1;
        // An attack from a mouse button within a moment of a click made with the pointer free.
        if (a === 'attack' && (input.isHeld('Mouse0') || input.isHeld('Mouse2')) && performance.now() - this.s.freeClickAt < 200) this.s.freeClickAttacks++;
        if (a === 'zoomIn') this.s.zoomSteps.in++;
        if (a === 'zoomOut') this.s.zoomSteps.out++;
        if (a === 'zoomIn' || a === 'zoomOut') this.s.lastGesture.steps++;
        log(this.s, 'g', `action  ${a}`);
      }
    }
    // The first frames after the pointer locks: did that click attack?
    if (this.s.lockClickAttacked === null && this.s.lockedAt && performance.now() - this.s.lockedAt > 300) this.s.lockClickAttacked = false;
    if (this.s.lockClickAttacked === null && this.s.lockedAt && input.pressed('attack')) this.s.lockClickAttacked = true;
  }

  lateUpdate(dt: number) {
    const input = this.game.input;
    for (const [a, el] of this.chips) {
      const t = (this.flash.get(a) ?? 0) - dt;
      this.flash.set(a, t);
      el.classList.toggle('down', input.down(a));
      el.classList.toggle('flash', t > 0);
      el.textContent = `${a} · ${(input.bindings[a] ?? []).map(codeLabel).join(' / ') || '—'}`;
    }
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.s.pageZoom = window.visualViewport?.scale ?? 1;
    this.els.log.innerHTML = this.s.lines.map((l) => `<span class="${l.cls}">${l.text.replace(/</g, '&lt;')}</span>`).join('\n');
    const yes = (b: boolean | null, okText: string, badText: string, wait: string) =>
      b === null ? `<span class="dim">○ ${wait}</span>` : b ? `<span class="ok">✓ ${okText}</span>` : `<span class="bad">✗ ${badText}</span>`;
    const g = this.s.lastGesture;
    const p = this.s.presses;
    this.els.checks.innerHTML = [
      yes(this.s.lockClickAttacked === null ? null : !this.s.lockClickAttacked, 'The click that captured the pointer did not attack', 'The capture click attacked!', 'Click the view to capture the pointer'),
      yes(this.s.freeClickAttacks === 0 ? (this.s.freeClicks ? true : null) : false, `${this.s.freeClicks} click(s) with the pointer free: none attacked`, `${this.s.freeClickAttacks} free click(s) attacked!`, 'Click the view (pointer free)'),
      yes(p.attack ? true : null, `Attack pressed ${p.attack} time(s)`, '', 'Attack with F (or a click once captured)'),
      yes(g.events ? g.steps <= 2 : null, `Last scroll: ${g.events} wheel events → ${g.steps} zoom step(s)`, `Last scroll: ${g.events} events → ${g.steps} steps (burst)`, 'Flick two fingers on the trackpad'),
      yes(this.s.pageZoom === 1 ? (this.s.gestureEvents || this.s.wheelEvents ? true : null) : false, `Page zoom stays 100% (${this.s.gestureEvents} gesture events)`, `Page zoomed to ${Math.round(this.s.pageZoom * 100)}%`, 'Pinch on the trackpad'),
      yes(p.quickSave ? true : null, `Quicksave pressed ${p.quickSave} time(s)`, '', 'Press P (or F5)'),
      yes(p.quickLoad ? true : null, `Quickload pressed ${p.quickLoad} time(s)`, '', 'Press L (or F9)'),
      yes(p.walkToggle ? true : null, `Walk toggled ${p.walkToggle} time(s)`, '', 'Press N'),
      `<div class="dim">Zoom steps: in ${this.s.zoomSteps.in} · out ${this.s.zoomSteps.out} · wheel events ${this.s.wheelEvents}</div>`,
      `<div class="dim">Pointer ${input.pointerLocked ? '<b>captured</b> (Esc releases)' : 'free — click the view'} · Caps Lock is not walking (N is); bind it in Controls to use it</div>`,
    ].map((x) => `<div>${x}</div>`).join('');
    this.els.center.innerHTML = input.pointerLocked
      ? '<div class="big">Pointer captured</div><div>Move to look · F attacks · Esc releases</div>'
      : '<div class="big">Click here to capture the pointer</div><div>That click must not count as an attack</div>';
    const preset = this.game.settings.data.controlPreset ?? 'mouse';
    this.els.presets.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === preset));
  }
}

function log(s: LabState, cls: string, text: string) {
  const t = (performance.now() / 1000).toFixed(2).padStart(7);
  s.lines.unshift({ cls, text: `${t}  ${text}` });
  if (s.lines.length > 48) s.lines.length = 48;
}

function applyPreset(game: Game, p: ControlPreset) {
  for (const [k, v] of Object.entries(presetValues(p))) game.settings.set(k as never, v as never);
  const c = controlState(game.settings.data);
  game.input.ignoredCodes.clear();
  for (const code of c.ignoredCodes) game.input.ignoredCodes.add(code);
  game.input.lookSmoothing = c.lookSmoothing;
  game.input.sensitivity = 0.0022 * game.settings.data.lookSensitivity;
}

const scene: SceneDef = {
  title: 'Input lab',
  description: 'Live keys, clicks, wheel, pinch and pointer-lock events → actions (AC-24)',
  setup(game: Game, ui: HTMLElement) {
    const b = new MeshBuilder();
    b.box('paving_travertine', 60, 1, 60, new THREE.Matrix4().makeTranslation(0, -0.5, 0), { collide: true, uvScale: 3 });
    placeAndRegister(game, 'inputlab:ground', b.build('ground'), b.colliders, { x: 0, y: 0, z: 0 });
    basicLights(game);
    game.scene.background = new THREE.Color(0x24303d);
    game.camera.position.set(0, 1.7, 6);
    game.camera.lookAt(0, 1, 0);

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.className = 'il';
    root.innerHTML = `
      <div class="col left"><h2>Raw events</h2><div class="log"></div></div>
      <div class="center"></div>
      <div class="col right">
        <h2>Checks (AC-24)</h2><div class="checks"></div>
        <h2 style="margin-top:10px">Preset</h2>
        <div class="presets"><button data-p="mouse">1 · Mouse</button><button data-p="trackpad">2 · Trackpad</button><button data-p="keyboard">3 · Keyboard</button></div>
        <h2>Actions</h2><div class="acts"></div>
      </div>`;
    ui.appendChild(root);
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    const state: LabState = { lines: [], wheelEvents: 0, gestureEvents: 0, zoomSteps: { in: 0, out: 0 }, lastGesture: { events: 0, steps: 0, t: 0 }, lockClickAttacked: null, lockedAt: 0, freeClicks: 0, freeClickAt: 0, freeClickAttacks: 0, presses: {}, pageZoom: 1 };
    const els = { log: q('.log'), acts: q('.acts'), checks: q('.checks'), center: q('.center'), presets: q('.presets') };
    root.querySelectorAll('.presets button').forEach((btn) => btn.addEventListener('click', () => applyPreset(game, (btn as HTMLElement).dataset.p as ControlPreset)));
    applyPreset(game, game.settings.data.controlPreset ?? 'trackpad');

    // Raw events, captured before anything else sees them.
    const caps = (e: KeyboardEvent) => (e.getModifierState?.('CapsLock') ? ' ⇪on' : '');
    window.addEventListener('keydown', (e) => {
      log(state, 'k', `keydown ${e.code}${e.repeat ? ' (repeat)' : ''}${e.altKey ? ' +opt' : ''}${e.metaKey ? ' +cmd' : ''}${caps(e)}`);
      if (/^Digit[123]$/.test(e.code) && !e.repeat) applyPreset(game, (['mouse', 'trackpad', 'keyboard'] as const)[Number(e.code.slice(5)) - 1]);
    }, true);
    window.addEventListener('keyup', (e) => log(state, 'k', `keyup   ${e.code}${caps(e)}`), true);
    window.addEventListener('mousedown', (e) => {
      const free = !document.pointerLockElement;
      if (free && e.target === game.canvas) {
        state.freeClicks++;
        state.freeClickAt = performance.now();
      }
      log(state, 'm', `mousedown button ${e.button}${free ? ' (pointer free)' : ''}`);
    }, true);
    window.addEventListener('mouseup', (e) => log(state, 'm', `mouseup   button ${e.button}`), true);
    window.addEventListener('wheel', (e) => {
      state.wheelEvents++;
      const now = performance.now();
      if (now - state.lastGesture.t > 300) state.lastGesture = { events: 0, steps: 0, t: now };
      state.lastGesture.events++;
      state.lastGesture.t = now;
      log(state, 'w', `wheel   dy ${e.deltaY.toFixed(1)} mode ${e.deltaMode}${e.ctrlKey ? ' ctrl (pinch)' : ''}`);
    }, { capture: true, passive: true });
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(t, (e) => {
        state.gestureEvents++;
        log(state, 'w', `${t} scale ${((e as Event & { scale?: number }).scale ?? 1).toFixed(3)}`);
      }, true);
    }
    document.addEventListener('pointerlockchange', () => {
      const locked = !!document.pointerLockElement;
      if (locked) {
        state.lockedAt = performance.now();
        state.lockClickAttacked = null;
      }
      log(state, 'm', `pointer ${locked ? 'LOCKED' : 'released'}`);
    });
    window.addEventListener('blur', () => log(state, 'k', 'window blur (keys released)'));
    game.addSystem(new InputLab(game, state, els));
    (window as { __inputlab?: LabState }).__inputlab = state;
  },
};
export default scene;
