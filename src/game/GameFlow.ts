/**
 * The game flow (game.flow): title → character creation → loading → spawn at the Porta Capena on
 * 11 May 113 at 04:30 (GDD §2.1, §3.1, §17.2) → play; Continue / Load from the save system; the
 * quickload confirmation; quit to title; the calendar and the control settings.
 *
 *   state      'boot' → 'title' → 'creation' → 'spawning' → 'playing'
 *   events     'flow:state' on every change; 'game:started' once the player has control
 *   timings    `timings.startToSpawnMs` (AC-01: under 20 s from pressing Start)
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { ITEMS } from '../rpg/data/items';
import { startNewGame, type RpgServices } from '../rpg/install';
import { showLoading, showTitle, type TitleScreen } from '../ui';
import type { UIManager } from '../ui/UIManager';
import { LANDMARK_BY_ID } from '../data/atlas';
import { toGame } from '../world/coords';
import { spawnAtLandmark } from '../world/rome/buildRome';
import { ordinalOf, Calendar } from './calendar';
import { defaultName, kitWorn, lookById, normalizeSpec, type CharacterSpec } from './character';
import { CreationScreen } from './CreationScreen';
import { CreationStage } from './CreationStage';
import { PlayerLook } from './PlayerLook';
import { PresetPicker } from './PresetPicker';
import { controlState, guessPreset, presetValues, type ControlPreset } from './settings';
import type { GameAudio } from './audio';

export type FlowState = 'boot' | 'title' | 'creation' | 'spawning' | 'playing';

declare module '../core/Game' {
  interface Game {
    flow: GameFlow;
    calendar: Calendar;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    'flow:state': { state: FlowState };
    /** The player has control: after a new game, a load, or the quick start. */
    'game:started': { kind: 'new' | 'load' | 'quick' };
  }
}

/** GDD §2.1: 11 May AD 113, 04:30 local solar time. */
export const START_DATE = { year: 113, month: 4, day: 11 };
export const START_HOUR = 4.5;
/** A golden early-morning light for the title and the creation stage. */
export const TITLE_HOUR = 6.1;
/** The title camera circles the Colosseum valley. */
export const TITLE_VISTA = { landmark: 'colosseum', radius: 150, height: 58 };
/** The main quest's first quest (§10.3), started on a new game if the content exists. */
export const FIRST_QUEST = 'mq-01-madida-capena';

export interface FlowOptions {
  /** Skip the title and creation (agents, tests): `?quick=1`, or `?at=<landmark>`. */
  quick?: boolean;
  /** Spawn near this atlas landmark instead of the Porta Capena (quick mode). */
  at?: string | null;
  /** Start hour override (quick mode). */
  hour?: number | null;
  /** Character for the quick start. */
  character?: Partial<CharacterSpec>;
  audio?: GameAudio;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frames = (n: number) => new Promise<void>((r) => {
  let i = 0;
  const f = () => (++i >= n ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});

export class GameFlow implements System {
  readonly name = 'flow';
  readonly priority = 1050;
  state: FlowState = 'boot';
  character: CharacterSpec;
  readonly look: PlayerLook;
  readonly calendar: Calendar;
  readonly timings = { bootMs: 0, startPressedAt: 0, spawnedAt: 0, startToSpawnMs: 0 };
  private title: TitleScreen | null = null;
  private stage: CreationStage | null = null;
  private capsHinted = false;

  constructor(
    readonly game: Game,
    readonly ui: UIManager,
    readonly rpg: RpgServices,
    readonly opts: FlowOptions = {},
  ) {
    this.character = normalizeSpec(opts.character ?? { origin: 'civis-suburanus', sex: 'male' });
    this.look = game.addSystem(new PlayerLook(game, lookById(this.character.look, this.character.sex)));
    // The calendar: dates count from 11 May; the displayed date obeys the pridie clamp (§14.10).
    const t = game.time;
    t.start.year = START_DATE.year;
    t.start.month = START_DATE.month;
    t.start.day = START_DATE.day;
    const questDone = (id: string) => !!rpg.quests.status(id)?.done;
    this.calendar = new Calendar(START_DATE.year, ordinalOf(START_DATE.month, START_DATE.day), questDone, t.dayIndex);
    game.calendar = this.calendar;
    t.formatRoman = () => this.calendar.formatRoman();
    t.formatModern = () => {
      const h = t.hour;
      return `${this.calendar.formatModern()} · ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    };
    rpg.hooks.templesClosed = () => this.calendar.isFestival('fest-lemuria');
    rpg.hooks.festivalDiscount = () => (this.calendar.isFestival('fest-mercuralia') ? 0.1 : 0);
    rpg.hooks.vowMult = () => (this.calendar.isFestival('fest-ludi-augustales') ? 1.5 : 1);
    this.registerSaveables();
    // Nothing is saved outside a game in progress (title, creation, loading).
    rpg.save.addBlocker(() => (this.state === 'playing' ? null : 'Not in a game'));
    // Quickload always asks first (GDD §4.2); F9/L and the pause menu both come here.
    rpg.save.quickload = () => this.confirmQuickload();
    this.applyControls();
    game.settings.onChange(() => this.applyControls());
    this.watchCapsLock();
  }

  // ------------------------------------------------------------------ settings → input

  /** Apply the control settings (preset, toggles, smoothing…) to input, controller and camera. */
  applyControls() {
    const g = this.game;
    const s = controlState(g.settings.data);
    g.input.ignoredCodes.clear();
    for (const c of s.ignoredCodes) g.input.ignoredCodes.add(c);
    g.input.lookSmoothing = s.lookSmoothing;
    const pc = g.getSystem<import('../player/PlayerController').PlayerController>('playerController');
    if (pc) {
      pc.sprintMode = s.sprintMode;
      pc.sneakMode = s.sneakMode;
      pc.autoRecenterDelay = s.autoRecenterDelay;
    }
    const rig = g.getSystem<import('../player/CameraRig').CameraRig>('cameraRig');
    if (rig) rig.zoomToFirstPerson = s.zoomToFirstPerson;
  }

  /** Apply a preset's values (Settings, the first-launch picker). */
  choosePreset(p: ControlPreset) {
    const vals = presetValues(p);
    for (const [k, v] of Object.entries(vals)) this.game.settings.set(k as never, v as never);
  }

  private watchCapsLock() {
    // GDD §4.2: walking is N; a Caps Lock press gets a one-time hint (it latches on a Mac).
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'CapsLock' || this.capsHinted || this.state !== 'playing') return;
      if (this.game.input.bindings.walkToggle.includes('CapsLock')) return;
      this.capsHinted = true;
      this.ui.notify('Walk / run is N. Caps Lock latches on a Mac — you can add it in Controls.', 'info');
    });
  }

  // ------------------------------------------------------------------ state

  setState(s: FlowState) {
    if (this.state === s) return;
    this.state = s;
    this.game.events.emit('flow:state', { state: s });
  }

  get difficulty() {
    return this.game.settings.data.difficulty ?? 'normalis';
  }

  update() {
    this.calendar.sync(this.game.time.dayIndex);
  }

  // ------------------------------------------------------------------ title

  /** The title over the live city (first launch: the control preset picker first). */
  async showTitle() {
    this.setState('title');
    const g = this.game;
    g.time.restore({ totalHours: TITLE_HOUR });
    (g as Game & { sky?: { invalidate?: () => void } }).sky?.invalidate?.();
    const canContinue = !!(await this.rpg.save.latest().catch(() => null));
    const lm = LANDMARK_BY_ID[TITLE_VISTA.landmark];
    const [cx, cz] = lm ? toGame(lm.center[0], lm.center[1]) : [0, 0];
    const cy = g.heightmap ? g.heightmap.heightAt(cx, cz) : 0;
    this.title = showTitle(g, {
      onNewGame: () => this.openCreation(),
      onContinue: () => this.continueLatest(),
      canContinue,
      orbitCenter: new THREE.Vector3(cx, cy, cz),
      orbitRadius: TITLE_VISTA.radius,
      orbitHeight: TITLE_VISTA.height,
      orbitSpeed: 0.03,
      version: 'Pre-alpha · v0.1 in progress · runs in your browser',
    });
    if (!g.settings.data.controlPreset) this.openPresetPicker();
  }

  openPresetPicker() {
    const guess = g_guess();
    this.ui.open(new PresetPicker(this.game.settings.data.controlPreset ?? guess, (p) => this.choosePreset(p)));
  }

  /** Pause menu → Quit to Title. */
  quitToTitle() {
    this.ui.closeAll();
    this.removeStage();
    void this.showTitle();
  }

  // ------------------------------------------------------------------ creation

  /** New Game: open character creation over the city (the title fades out behind it). */
  openCreation() {
    this.setState('creation');
    const g = this.game;
    g.time.restore({ totalHours: TITLE_HOUR });
    const spawn = this.spawnPoint();
    g.player.teleport(spawn.position, spawn.heading);
    g.player.setViewMode('third');
    g.world?.refreshAll?.();
    const initial = normalizeSpec({ origin: 'civis-suburanus', sex: 'male' });
    initial.extra = 'denarii';
    this.preview(initial);
    this.stage = g.addSystem(new CreationStage(g));
    const screen = new CreationScreen({
        initial,
        onChange: (spec) => this.preview(spec),
        onDone: (spec) => void this.beginNewGame(spec),
        onCancel: () => {
          this.ui.closeAll();
          this.removeStage();
          void this.showTitle();
        },
    });
    this.ui.open(screen);
    // The avatar stands centred in the space right of the panel.
    this.stage.screenX = () => screen.panelRight();
  }

  /** Dress the turntable avatar in the origin's kit. */
  private preview(spec: CharacterSpec) {
    this.character = normalizeSpec(spec);
    const items = (id: string) => this.game.items?.get(id) ?? ITEMS.find((i) => i.id === id);
    this.look.setLook(lookById(this.character.look, this.character.sex), kitWorn(this.character.origin, items));
  }

  private removeStage() {
    if (this.stage) this.game.removeSystem(this.stage);
    this.stage = null;
  }

  /** Start pressed: fade, loading screen, new game state, spawn at the Porta Capena, play. */
  async beginNewGame(spec: CharacterSpec) {
    this.timings.startPressedAt = performance.now();
    this.setState('spawning');
    const veil = this.veil();
    await sleep(450);
    this.ui.closeAll();
    this.removeStage();
    const loading = showLoading(this.ui.root.parentElement ?? document.body, { bindings: this.game.input.bindings, title: 'SKYROME' });
    loading.progress(0.2, 'Leaving the Via Appia…');
    veil.remove();
    this.ui.block('loading', true);
    await frames(2);
    this.newGameState(spec);
    loading.progress(0.6, 'The last cart before dawn…');
    await this.spawnAt(this.spawnPoint());
    loading.progress(1, 'Porta Capena');
    await frames(3);
    this.ui.block('loading', false);
    await loading.done();
    this.enterPlay('new');
  }

  /** Reset every system to a fresh game for this character (GDD §2.1 start time). */
  newGameState(spec: CharacterSpec) {
    const g = this.game;
    this.character = normalizeSpec(spec);
    startNewGame(this.rpg, { background: this.character.origin, sex: this.character.sex, extra: this.character.extra });
    g.time.restore({ totalHours: START_HOUR });
    this.calendar.restore(undefined, { ordinal: ordinalOf(START_DATE.month, START_DATE.day), elapsed: g.time.dayIndex });
    (g as Game & { sky?: { invalidate?: () => void } }).sky?.invalidate?.();
    this.look.setLook(lookById(this.character.look, this.character.sex), null);
    this.ui.playerName = this.character.name;
    this.rpg.dialogue.playerName = this.character.name.split(',')[0];
    this.startFirstQuest();
    this.opts.audio?.attachPlayer(this.character.sex, this.gear());
  }

  private startFirstQuest() {
    const q = this.rpg.quests;
    const id = q.get(FIRST_QUEST) ? FIRST_QUEST : q.all().find((d) => d.id.startsWith('mq-01'))?.id;
    if (!id) return;
    if (!q.status(id)?.running && !q.status(id)?.done) q.start(id);
    q.track(id);
  }

  private gear(): 'none' | 'cloth' | 'armor' {
    const body = this.game.player?.inventory?.equipped('body');
    const def = body ? this.game.items.get(body) : undefined;
    return def?.armor?.weightClass === 'heavy' ? 'armor' : 'cloth';
  }

  // ------------------------------------------------------------------ spawn

  /** GDD §2.1: just outside the Porta Capena on the Via Appia, facing the city. */
  spawnPoint(at: string | null = null): { position: THREE.Vector3; heading: number } {
    const g = this.game;
    if (at) {
      const s = spawnAtLandmark(g, at, 18);
      if (s) return s;
      console.warn(`[flow] unknown landmark "${at}" for &at=; spawning at the Porta Capena`);
    }
    const placed = g.landmarks?.get('porta-capena');
    const spot = placed?.spots.find((s) => s.id === 'spawn-capena' || s.id.endsWith('spawn-capena'));
    if (spot) return { position: spot.position.clone(), heading: spot.heading ?? placed!.rotationY + Math.PI };
    return spawnAtLandmark(g, 'porta-capena', 16) ?? { position: new THREE.Vector3(0, 10, 0), heading: 0 };
  }

  /** Teleport, face the way the spawn faces, refresh culling and let a frame or two settle. */
  async spawnAt(spawn: { position: THREE.Vector3; heading: number }) {
    const g = this.game;
    const p = g.player;
    p.teleport(spawn.position, spawn.heading);
    p.yaw = spawn.heading + Math.PI;
    p.pitch = -0.12;
    p.setViewMode('third');
    p.sneaking = false;
    g.world?.refreshAll?.();
    this.look.apply(true);
    await frames(2);
  }

  /** Hand control to the player. */
  enterPlay(kind: 'new' | 'load' | 'quick') {
    this.setState('playing');
    this.timings.spawnedAt = performance.now();
    if (this.timings.startPressedAt) this.timings.startToSpawnMs = Math.round(this.timings.spawnedAt - this.timings.startPressedAt);
    this.game.events.emit('game:started', { kind });
  }

  /** Agents and tests: no menus, the default (or given) character, spawn now. */
  async quickStart() {
    this.timings.startPressedAt = performance.now();
    this.setState('spawning');
    const spec = normalizeSpec(this.opts.character ?? { origin: 'civis-suburanus', sex: 'male' });
    if (!this.opts.character?.name) spec.name = defaultName(spec.origin, spec.sex);
    this.newGameState(spec);
    if (this.opts.hour != null && Number.isFinite(this.opts.hour)) this.game.time.restore({ totalHours: this.opts.hour });
    await this.spawnAt(this.spawnPoint(this.opts.at ?? null));
    this.enterPlay('quick');
  }

  // ------------------------------------------------------------------ saves

  /** Title → Continue: the most recent save. */
  async continueLatest() {
    const latest = await this.rpg.save.latest();
    if (latest) await this.loadSlot(latest.slot, { fromTitle: true });
  }

  /** Load a slot from anywhere (title, pause menu, quickload). */
  async loadSlot(slot: string, opts: { fromTitle?: boolean } = {}) {
    const fromTitle = opts.fromTitle || this.state === 'title' || this.state === 'creation';
    this.setState('spawning');
    if (!opts.fromTitle) this.ui.closeAll();
    this.removeStage();
    const r = await this.rpg.save.load(slot);
    if (!r.ok) {
      this.ui.flash(`Could not load: ${r.error ?? 'unknown error'}`);
      if (fromTitle) await this.showTitle();
      else this.setState('playing');
      return false;
    }
    this.game.world?.refreshAll?.();
    this.look.apply(true);
    this.opts.audio?.attachPlayer(this.character.sex, this.gear());
    this.enterPlay('load');
    return true;
  }

  private async confirmQuickload() {
    if (this.state !== 'playing') return { ok: false, error: 'not in a game' };
    const has = (await this.rpg.save.list()).some((m) => m.slot === 'quick');
    if (!has) {
      this.ui.flash('There is no quicksave yet (F5 or P).');
      return { ok: false, error: 'no quicksave' };
    }
    const ok = await this.ui.confirm({ title: 'Quickload', text: 'Load your quicksave? Progress since then will be lost.', yes: 'Load', no: 'Stay' });
    if (!ok) return { ok: false, error: 'cancelled' };
    const done = await this.loadSlot('quick');
    return { ok: done };
  }

  private registerSaveables() {
    const save = this.rpg.save;
    save.register('character', {
      save: () => ({ ...this.character }),
      load: (d) => {
        this.character = normalizeSpec(d as Partial<CharacterSpec>);
        this.look.setLook(lookById(this.character.look, this.character.sex), null);
        this.ui.playerName = this.character.name;
        this.rpg.dialogue.playerName = this.character.name.split(',')[0];
      },
    });
    save.register('calendar', {
      save: () => this.calendar.serialize(),
      load: (d) => this.calendar.restore(d, { ordinal: ordinalOf(START_DATE.month, START_DATE.day), elapsed: this.game.time.dayIndex }),
      reset: () => this.calendar.restore(undefined, { ordinal: ordinalOf(START_DATE.month, START_DATE.day), elapsed: this.game.time.dayIndex }),
    });
    // Save files carry the character's name (the save list shows it).
    const snap = save.snapshot.bind(save);
    save.snapshot = (meta = {}) => snap({ ...meta, name: meta.name ?? this.character.name });
  }

  // ------------------------------------------------------------------ helpers

  /** A black veil over everything that fades in (for the Start transition). */
  private veil(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;transition:opacity .4s ease;pointer-events:auto;z-index:60';
    this.ui.overlayLayer.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
    return el;
  }
}

function g_guess(): ControlPreset {
  try {
    return guessPreset({ platform: navigator.platform, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
  } catch {
    return 'mouse';
  }
}
