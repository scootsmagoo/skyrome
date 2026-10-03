/**
 * Title screen over the live scene: the camera slowly orbits while the logotype and menu sit on
 * top. New Game fades to black, runs the callback, and hands control to the player.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap } from '../dom';
import { laurelRule, spqrCrest } from '../motifs';
import { NavList } from '../nav';
import './screens.css';

export interface TitleOptions {
  onNewGame(): void | Promise<void>;
  /** Shown (enabled) when provided and `canContinue` isn't false. */
  onContinue?: () => void | Promise<void>;
  canContinue?: boolean;
  /** Load: defaults to the save list when a saves source exists. */
  onLoad?: () => void;
  /** Point the camera orbits (default: the player, or the origin). */
  orbitCenter?: THREE.Vector3Like;
  orbitRadius?: number;
  orbitHeight?: number;
  /** Radians per second (default 0.035). */
  orbitSpeed?: number;
  version?: string;
}

const look = new THREE.Vector3();

/** Lates after the CameraRig (100) so it overrides the player camera while the title is up. */
class TitleOrbit implements System {
  readonly name = 'titleOrbit';
  readonly priority = 101;
  angle: number;
  constructor(
    private readonly game: Game,
    private readonly center: THREE.Vector3,
    private readonly radius: number,
    private readonly height: number,
    private readonly speed: number,
  ) {
    this.angle = game.player ? game.player.yaw + 0.6 : 0.6;
  }
  lateUpdate(dt: number) {
    this.angle += dt * this.speed;
    const cam = this.game.camera;
    cam.position.set(this.center.x + Math.sin(this.angle) * this.radius, this.center.y + this.height, this.center.z + Math.cos(this.angle) * this.radius);
    look.set(this.center.x, this.center.y + this.height * 0.35, this.center.z);
    cam.lookAt(look);
  }
}

export class TitleScreen extends BaseModal {
  readonly id = 'title';
  override pauses = false;
  private nav = new NavList({ onActivate: (i) => void this.items[i].run(), wrap: true });
  private items: { label: string; run: () => void | Promise<void>; enabled: boolean }[] = [];
  private orbit: TitleOrbit | null = null;
  private busy = false;

  constructor(private readonly opts: TitleOptions) {
    super('title-screen');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const { game } = ui;
    const p = game.player?.root.position;
    const center = new THREE.Vector3().copy((this.opts.orbitCenter as THREE.Vector3) ?? p ?? new THREE.Vector3());
    this.orbit = game.addSystem(new TitleOrbit(game, center, this.opts.orbitRadius ?? 16, this.opts.orbitHeight ?? 5.5, this.opts.orbitSpeed ?? 0.035));

    const canContinue = !!this.opts.onContinue && this.opts.canContinue !== false;
    const hasLoad = !!this.opts.onLoad || !!ui.sources.saves;
    this.items = [
      { label: 'Continue', run: () => this.start(this.opts.onContinue!), enabled: canContinue },
      { label: 'New Game', run: () => this.start(this.opts.onNewGame), enabled: true },
      { label: 'Load', run: () => (this.opts.onLoad ? this.opts.onLoad() : ui.openSaves('load')), enabled: hasLoad },
      { label: 'Settings', run: () => ui.openSettings(), enabled: true },
      { label: 'Credits', run: () => ui.openCredits(), enabled: true },
    ];
    const rows = this.items.map((it) =>
      h('div', { class: `title-item${it.enabled ? '' : ' is-disabled'}` }, h('i', { class: 'leaf l' }), h('span', null, it.label), h('i', { class: 'leaf r' })),
    );
    for (const r of rows) {
      const [l, rr] = r.querySelectorAll('.leaf');
      l.innerHTML = rr.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2 C17.4 6 17.4 16 12 22 C6.6 16 6.6 6 12 2 Z" fill="currentColor"/></svg>';
    }
    const crest = h('div', { class: 'title-crest' });
    crest.innerHTML = spqrCrest(140);
    const rule = h('div', { class: 'title-rule' });
    rule.innerHTML = laurelRule(320, 32);
    this.el.replaceChildren(
      h('div', { class: 'title-vignette' }),
      h(
        'div',
        { class: 'title-col' },
        crest,
        h('h1', { class: 'title-logo' }, 'SKYROME'),
        h('div', { class: 'title-sub' }, 'ROMA · A·D·CXIII'),
        rule,
        h('div', { class: 'title-tag' }, 'Urbs aeterna te exspectat', h('span', { class: 'en' }, 'The eternal city awaits you')),
        h('nav', { class: 'title-items' }, rows),
      ),
      h('div', { class: 'title-foot' }, h('div', { class: 'sr-hints' }, h('span', { class: 'sr-hint' }, keycap('↑↓'), 'Select'), h('span', { class: 'sr-hint' }, keycap('Enter'), 'Choose')), h('div', { class: 'title-ver' }, this.opts.version ?? 'Pre-alpha · runs in your browser')),
      h('div', { class: 'title-fade' }),
    );
    this.nav.set(rows, false);
    // Continue is the default when available, otherwise New Game.
    this.nav.select(canContinue ? 0 : 1, false);
  }

  onClose() {
    if (this.orbit) this.ui.game.removeSystem(this.orbit);
    this.orbit = null;
  }

  private async start(fn: () => void | Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.el.classList.add('is-starting');
    await wait(700);
    await fn();
    // Put the camera back behind the player, then fade the world in from black.
    if (this.orbit) this.ui.game.removeSystem(this.orbit);
    this.orbit = null;
    const veil = h('div', { class: 'title-veil' });
    this.ui.overlayLayer.appendChild(veil);
    this.close();
    requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('is-out')));
    setTimeout(() => veil.remove(), 1400);
  }

  onKey(e: KeyboardEvent) {
    if (e.code === 'Tab') return true;
    return this.nav.handleKey(e);
  }

  onEscape() {
    return false;
  }

  onAction() {
    return true;
  }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Show the title screen over the running scene. Requires installUI() first. */
export function showTitle(game: Game, opts: TitleOptions): TitleScreen {
  const t = new TitleScreen(opts);
  game.ui.open(t);
  return t;
}
