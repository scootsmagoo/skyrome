/**
 * UIManager (`game.ui`): the HUD layer, the modal stack and the policies around it.
 *
 * Policy while any modal is open:
 * - gameplay input is disabled (`game.input.enabled = false`) and pointer lock is released;
 * - the simulation pauses (`game.paused`) for menus AND dialogue: nobody can attack a player who
 *   is reading choices with gameplay input off. Esc in a conversation opens the pause menu over it
 *   (GDD §4.5: pause at any time, including in dialogue); Tab or 'Goodbye' leaves. A modal can opt
 *   out with `pauses = false`;
 * - the HUD is hidden and its message feed frozen, so a banner or notification raised meanwhile
 *   ('Quest started' from a dialogue choice) plays once the modal closes;
 * - 'ui:modal' is emitted on every open/close;
 * - Esc closes the topmost modal (or goes back one screen); Tab/I/J/M/K open or switch menus.
 * When the last modal closes, input is re-enabled one frame later so the key that closed the
 * modal (E in dialogue, Esc) can't also trigger a gameplay action.
 *
 * Losing pointer lock unexpectedly (Esc while mouse-looking, switching apps) opens the pause menu.
 * Clicking back into the canvas re-locks the pointer, and that click does nothing else (it is
 * caught here before core Input would read it as an attack).
 */
// Base tokens/components first so every component stylesheet (imported below) overrides them.
import './ui-base.css';
import type { GameEvents } from '../core/Events';
import type { Game, System } from '../core/Game';
import type { Action } from '../core/Input';
import { toRoman } from '../core/GameTime';
import { formatMoney } from './format';
import { h } from './dom';
import { Hud } from './hud/Hud';
import type { BannerOptions, NotifyKind } from './hud/Feed';
import type { Modal } from './Modal';
import { bindSettings, uiBindings, uiFontPx, type UiAction } from './settings';
import { installTextures } from './textures';
import type { BarterView, BookView, ContainerView, DialogueView, UISources } from './types';
import { MenuShell, type MenuTabId } from './menus/MenuShell';
import { prewarmMapTerrain } from './map/MapRenderer';
import { PauseMenu } from './menus/PauseMenu';
import { SettingsScreen } from './menus/SettingsScreen';
import { ControlsScreen } from './menus/ControlsScreen';
import { CreditsScreen } from './menus/CreditsScreen';
import { SaveLoadScreen } from './menus/SaveLoadScreen';
import { ConfirmDialog, type ConfirmOptions } from './menus/ConfirmDialog';
import { DialoguePanel } from './dialogue/DialoguePanel';
import { BarterScreen } from './dialogue/BarterScreen';
import { ContainerScreen } from './dialogue/ContainerScreen';
import { BookReader } from './dialogue/BookReader';
import { WaitDialog } from './dialogue/WaitDialog';

declare module '../core/Game' {
  interface Game {
    ui: UIManager;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    /** Show a top-left notification. */
    'ui:notify': { text: string; kind?: NotifyKind };
    /** Show a center banner. */
    'ui:banner': BannerOptions;
    /** Show a subtitle (NPC bark). */
    'ui:subtitle': { text: string; speaker?: string; duration?: number };
    /** The player was hit from this world position (hit-direction indicator). */
    'ui:hit': { x: number; z: number };
  }
}

const MENU_ACTIONS: Action[] = ['pause', 'menu', 'inventory', 'journal', 'map', 'skills'];
const ACTION_TAB: Partial<Record<Action, MenuTabId>> = {
  menu: 'character',
  skills: 'skills',
  inventory: 'inventory',
  journal: 'journal',
  map: 'map',
};

export type InputBlocker = 'title' | 'loading' | 'cutscene';

export class UIManager implements System {
  readonly name = 'ui';
  readonly priority = 900;
  readonly root: HTMLElement;
  readonly hud: Hud;
  readonly sources: UISources = {};
  /** Name shown in menus and saves until the character source provides one. */
  playerName = 'Peregrinus';

  private hudLayer: HTMLElement;
  private modalLayer: HTMLElement;
  readonly overlayLayer: HTMLElement;
  private stack: Modal[] = [];
  private blockers = new Set<InputBlocker>();
  private enableCountdown = -1;
  private pausedByUi = false;
  private wasLocked = false;
  private expectUnlock = false;
  private autoPausedAt = 0;
  private offs: (() => void)[] = [];
  private pendingObjectives = new Set<string>();
  private shownObjectives = new Set<string>();
  private menuShell: MenuShell | null = null;
  private lookHints = 0;
  private mapWarm = false;
  private uiScale = 1;

  constructor(
    readonly game: Game,
    parent: HTMLElement,
  ) {
    this.hudLayer = h('div', { class: 'sr-hud' });
    this.modalLayer = h('div', { class: 'sr-modals' });
    this.overlayLayer = h('div', { class: 'sr-overlays' });
    this.root = h('div', { class: 'sr-ui' }, this.hudLayer, this.modalLayer, this.overlayLayer);
    parent.appendChild(this.root);
    this.hud = new Hud(game, this.sources);
    this.hudLayer.appendChild(this.hud.el);

    void installTextures();
    this.offs.push(bindSettings(game, (s) => this.applyUiScale(s)));
    this.offs.push(game.settings.onChange((s) => (this.hud.subtitles.enabled = s.subtitles !== false)));
    this.hud.subtitles.enabled = game.settings.data.subtitles !== false;

    const onKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
    const onMouseDown = (e: MouseEvent) => this.onMouseDown(e);
    const onLock = () => this.onPointerLockChange();
    const onResize = () => this.applyUiScale(this.uiScale);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    // Capture phase on window runs before core Input's listener on the canvas itself.
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerlockchange', onLock);
    this.offs.push(() => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onLock);
    });
    this.wireEvents();
  }

  // ------------------------------------------------------------------ sources

  /** Register (or replace) data sources. */
  provide(s: Partial<UISources>) {
    Object.assign(this.sources, s);
    this.menuShell?.refresh();
  }

  // ------------------------------------------------------------------ modal stack

  get top(): Modal | undefined {
    return this.stack[this.stack.length - 1];
  }

  get modalCount() {
    return this.stack.length;
  }

  isOpen(id: string): boolean {
    return this.stack.some((m) => m.id === id);
  }

  open(m: Modal) {
    if (this.stack.includes(m)) return;
    if (!m.overlay) this.top?.el.classList.add('is-covered');
    this.stack.push(m);
    this.modalLayer.appendChild(m.el);
    m.onOpen?.(this);
    this.refreshState();
    this.game.events.emit('ui:modal', { open: true, id: m.id });
  }

  close(m: Modal | undefined = this.top) {
    if (!m) return;
    const i = this.stack.indexOf(m);
    if (i < 0) return;
    this.stack.splice(i, 1);
    m.el.remove();
    m.onClose?.();
    if (m === this.menuShell) this.menuShell = null;
    this.top?.el.classList.remove('is-covered');
    this.refreshState();
    this.game.events.emit('ui:modal', { open: false, id: m.id });
  }

  closeAll() {
    while (this.stack.length) this.close(this.top);
  }

  /** Esc/back on the top modal. */
  back() {
    const top = this.top;
    if (top && top.onEscape?.() !== false) this.close(top);
  }

  /** Block gameplay input without a modal (title screen, loading). */
  block(reason: InputBlocker, on: boolean) {
    if (on) this.blockers.add(reason);
    else this.blockers.delete(reason);
    this.refreshState();
  }

  get blocked() {
    return this.blockers.size > 0;
  }

  private refreshState() {
    const { game } = this;
    const blocked = this.stack.length > 0 || this.blockers.size > 0;
    if (blocked) {
      game.input.enabled = false;
      this.enableCountdown = -1;
      if (document.pointerLockElement) {
        this.expectUnlock = true;
        game.input.exitPointerLock();
      }
    } else if (!game.input.enabled) {
      this.enableCountdown = 1;
    }
    const wantPause = this.stack.some((m) => m.pauses !== false);
    if (wantPause && !game.paused) {
      game.paused = true;
      this.pausedByUi = true;
    } else if (!wantPause && this.pausedByUi) {
      game.paused = false;
      this.pausedByUi = false;
    }
    const hideHud = this.stack.some((m) => m.hidesHud !== false) || this.blockers.has('title') || this.blockers.has('loading');
    this.hud.setVisible(!hideHud);
  }

  // ------------------------------------------------------------------ screens

  /** Open the tabbed menu at a tab (or switch tabs if it's already open). */
  openMenu(tab: MenuTabId = 'character') {
    if (this.menuShell && this.stack.includes(this.menuShell)) {
      this.menuShell.show(tab);
      return this.menuShell;
    }
    this.menuShell = new MenuShell(tab);
    this.open(this.menuShell);
    return this.menuShell;
  }

  openPause() {
    if (this.isOpen('pause')) return;
    this.open(new PauseMenu());
  }

  openSettings() {
    this.open(new SettingsScreen());
  }

  openControls() {
    this.open(new ControlsScreen());
  }

  openCredits() {
    this.open(new CreditsScreen());
  }

  openSaves(mode: 'save' | 'load') {
    this.open(new SaveLoadScreen(mode));
  }

  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => this.open(new ConfirmDialog(opts, resolve)));
  }

  openDialogue(view: DialogueView): DialoguePanel {
    const existing = this.stack.find((m) => m instanceof DialoguePanel) as DialoguePanel | undefined;
    if (existing) this.close(existing);
    const p = new DialoguePanel(view);
    this.open(p);
    return p;
  }

  openBarter(view: BarterView) {
    this.open(new BarterScreen(view));
  }

  openContainer(view: ContainerView) {
    this.open(new ContainerScreen(view));
  }

  openBook(book: BookView) {
    this.open(new BookReader(book));
  }

  /** Wait/rest (T). Refused in combat, like saving. */
  openWait() {
    if (this.isOpen('wait')) return;
    if (this.sources.inCombat?.()) {
      this.flash('You cannot wait with enemies nearby.');
      return;
    }
    this.open(new WaitDialog());
  }

  // ------------------------------------------------------------------ feed

  notify(text: string, kind: NotifyKind = 'info') {
    this.hud.notes.push(text, kind);
  }

  banner(opts: BannerOptions) {
    this.hud.banners.push(opts);
  }

  subtitle(text: string, speaker?: string, duration?: number) {
    this.hud.subtitles.show(text, speaker, duration);
  }

  hitFrom(x: number, z: number) {
    this.hud.hits.add(x, z);
    // Being struck ends any conversation (normally impossible: dialogue pauses the world, but a
    // dialogue outcome can start a fight before the engine ends the conversation).
    const talk = this.stack.find((m) => m.id === 'dialogue');
    if (talk) this.close(talk);
  }

  /** A short centered message over menus ('Game saved'). */
  flash(text: string) {
    const el = h('div', { class: 'sr-flash' }, text);
    this.overlayLayer.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  // ------------------------------------------------------------------ frame

  lateUpdate(dt: number) {
    if (this.enableCountdown >= 0 && --this.enableCountdown < 0) {
      if (this.stack.length === 0 && this.blockers.size === 0) {
        this.game.input.enabled = true;
        // Remind about mouse-look a couple of times per session, not after every menu.
        if (!this.game.input.pointerLocked && this.lookHints < 2) {
          this.lookHints++;
          this.hud.showLookHint();
        }
      }
    }
    this.flushObjectives();
    this.prewarmMap();
    this.hud.update(dt);
    this.top?.update?.(dt);
  }

  /**
   * Build the map's terrain shading while the title or loading screen is up, so the first press of
   * M doesn't stall the game (it samples ~160k terrain heights). Cached per map source after that.
   */
  private prewarmMap() {
    if (this.mapWarm || !(this.isOpen('title') || this.blockers.has('title') || this.blockers.has('loading'))) return;
    const data = this.sources.map?.();
    if (!data) return;
    this.mapWarm = true;
    const run = () => prewarmMapTerrain(data);
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(run, { timeout: 3000 });
    else setTimeout(run, 200);
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    this.closeAll();
    this.root.remove();
  }

  // ------------------------------------------------------------------ input

  /** Which menu action (core binding) or UI action a key code maps to. */
  actionFor(code: string): Action | UiAction | null {
    const b = this.game.input.bindings;
    for (const a of MENU_ACTIONS) if (b[a]?.includes(code)) return a;
    const ub = uiBindings(this.game.settings.data);
    for (const a of Object.keys(ub) as UiAction[]) if (ub[a].includes(code)) return a;
    return null;
  }

  private onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const top = this.top;
    let handled = false;
    if (top) {
      handled = top.onKey?.(e) ?? false;
      if (!handled) {
        const action = this.actionFor(e.code);
        if (action === 'pause') {
          // Ignore the Esc that also released pointer lock and auto-opened the pause menu.
          if (!e.repeat && performance.now() - this.autoPausedAt > 350) this.back();
          handled = true;
        } else if (action && !e.repeat && action !== 'clock' && action !== 'wait') {
          handled = top.onAction ? top.onAction(action) : false;
          if (!handled && action === 'menu') {
            this.back();
            handled = true;
          }
        }
      }
    } else if (this.blockers.size === 0) {
      const action = this.actionFor(e.code);
      if (action && !e.repeat) {
        handled = true;
        if (action === 'pause') this.openPause();
        else if (action === 'wait') this.openWait();
        else if (action === 'clock') this.hud.clockVisible = true;
        else if (ACTION_TAB[action as Action]) this.openMenu(ACTION_TAB[action as Action]);
        else handled = false;
      } else if (action) handled = true;
    }
    if (handled) {
      e.preventDefault();
      // Keep core Input (a later window listener) from also seeing keys the UI consumed.
      e.stopImmediatePropagation();
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    if (this.actionFor(e.code) === 'clock') this.hud.clockVisible = false;
    // Every open screen hears releases, not just the top one: a key held on the map must still be
    // released if a confirm dialog opened over it in the meantime.
    for (const m of [...this.stack]) m.onKeyUp?.(e);
  }

  /** A click on the 3D view without pointer lock only re-captures the mouse; it never attacks. */
  private onMouseDown(e: MouseEvent) {
    const { game } = this;
    if (e.target !== game.canvas || game.input.pointerLocked) return;
    if (this.stack.length > 0 || this.blockers.size > 0) return;
    game.input.requestPointerLock();
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  private onPointerLockChange() {
    const locked = document.pointerLockElement === this.game.canvas;
    if (!locked && this.wasLocked && !this.expectUnlock && this.stack.length === 0 && this.blockers.size === 0) {
      this.autoPausedAt = performance.now();
      this.openPause();
    }
    if (!locked) this.expectUnlock = false;
    this.wasLocked = locked;
  }

  /**
   * The interface scale sets the root font size (everything is in rem), limited to what fits the
   * window: see `uiFontPx`. `effectiveUiScale` is what the player actually gets.
   */
  private applyUiScale(scale: number) {
    this.uiScale = scale;
    const px = uiFontPx(scale, window.innerWidth, window.innerHeight);
    document.documentElement.style.fontSize = `${px.toFixed(2)}px`;
    document.documentElement.style.setProperty('--sr-ui-scale', (px / 16).toFixed(3));
  }

  /** The interface scale in effect (the setting, limited by the window size). */
  get effectiveUiScale(): number {
    return uiFontPx(this.uiScale, window.innerWidth, window.innerHeight) / 16;
  }

  // ------------------------------------------------------------------ game events → HUD

  private wireEvents() {
    const ev = this.game.events;
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.offs.push(ev.on(k, fn));

    on('ui:notify', (e) => this.notify(e.text, e.kind));
    on('ui:banner', (e) => this.banner(e));
    on('ui:subtitle', (e) => this.subtitle(e.text, e.speaker, e.duration));
    on('ui:hit', (e) => this.hitFrom(e.x, e.z));

    on('location:discovered', (e) => {
      const loc = this.sources.map?.()?.locations().find((l) => l.id === e.locationId);
      const latin = loc?.latin;
      this.banner({ kind: 'location', title: latin ?? e.name, subtitle: latin && latin !== e.name ? e.name : undefined });
    });
    const questTitle = (id: string) => this.sources.quests?.()?.quests().find((q) => q.id === id);
    on('quest:started', (e) => {
      const q = questTitle(e.questId);
      this.banner({ kind: 'quest-start', title: q?.title ?? e.questId, subtitle: q?.latin });
      this.pendingObjectives.add(e.questId);
    });
    on('quest:stage', (e) => this.pendingObjectives.add(e.questId));
    on('quest:objective', (e) => {
      if (!e.done) return;
      const o = questTitle(e.questId)?.objectives.find((x) => x.id === e.objectiveId);
      if (o) this.notify(`Completed: ${o.text}`, 'quest');
    });
    on('quest:completed', (e) => {
      const q = questTitle(e.questId);
      this.banner({ kind: 'quest-complete', title: q?.title ?? e.questId, subtitle: q?.latin });
    });
    on('quest:failed', (e) => {
      const q = questTitle(e.questId);
      this.banner({ kind: 'quest-fail', title: q?.title ?? e.questId });
    });
    on('player:levelup', (e) => {
      this.banner({ kind: 'level', title: `Level ${e.level}`, subtitle: `Gradus ${toRoman(e.level)}` });
    });
    on('skill:levelup', (e) => {
      const def = this.sources.character?.()?.skills().find((s) => s.def.id === e.skill)?.def;
      this.notify(`${def?.name ?? capitalize(e.skill)} increased to ${e.level}`, 'skill');
    });
    on('item:added', (e) => {
      if (e.source === 'silent' || e.source === 'barter' || e.source === 'container') return;
      const name = this.sources.itemName?.(e.itemId) ?? e.itemId;
      this.notify(e.count > 1 ? `${name} (${e.count}) added` : `${name} added`, 'item');
    });
    on('item:removed', (e) => {
      if (e.reason !== 'given' && e.reason !== 'quest') return;
      const name = this.sources.itemName?.(e.itemId) ?? e.itemId;
      this.notify(e.count > 1 ? `${name} (${e.count}) removed` : `${name} removed`, 'item');
    });
    on('crime:committed', (e) => {
      if (e.witnessed && e.bounty > 0) this.notify(`Crime witnessed — bounty of ${formatMoney(e.bounty, true)}`, 'warning');
    });
  }

  /** New objectives of quests that just started/advanced appear as notifications. */
  private flushObjectives() {
    if (!this.pendingObjectives.size) return;
    const log = this.sources.quests?.();
    if (log) {
      for (const q of log.quests()) {
        if (!this.pendingObjectives.has(q.id) || q.state !== 'active') continue;
        for (const o of q.objectives) {
          const key = `${q.id}:${o.id}`;
          if (o.done || this.shownObjectives.has(key)) continue;
          this.shownObjectives.add(key);
          this.notify(o.text, 'quest');
        }
      }
    }
    this.pendingObjectives.clear();
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Create the UI, attach it as `game.ui` and register it as a system. */
export function installUI(game: Game, uiRoot: HTMLElement): UIManager {
  const ui = new UIManager(game, uiRoot);
  game.ui = ui;
  game.addSystem(ui);
  return ui;
}
