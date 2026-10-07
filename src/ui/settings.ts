/**
 * UI-owned settings (added to SettingsData by declaration merging, all optional so core defaults
 * stay valid) and live application of settings changes to the running game.
 */
import type { Game } from '../core/Game';
import { DEFAULT_BINDINGS, codeLabel, sanitizeBindings, type Action, type Bindings } from '../core/Input';
import type { SettingsData } from '../core/Settings';

/** Short names for binding repair messages (the Controls screen has the full labels). */
const ACTION_NAMES: Partial<Record<Action, string>> = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump',
  interact: 'Interact', attack: 'Attack', block: 'Block', readyWeapon: 'Ready weapon', toggleView: 'First / third person',
  pause: 'Pause', menu: 'Character menu',
};

/** Keys the UI handles itself (not gameplay actions in core Input). */
export type UiAction = 'wait' | 'clock';

export const DEFAULT_UI_BINDINGS: Record<UiAction, string[]> = {
  wait: ['KeyT'],
  // H swaps the camera shoulder (GDD §4.2); hold O (hora) shows the time.
  clock: ['KeyO'],
};

declare module '../core/Settings' {
  interface SettingsData {
    /** Compass reads SEP/ORI/MER/OCC instead of N/E/S/W. */
    compassLatin?: boolean;
    /** Show NPC barks and dialogue as subtitles. */
    subtitles?: boolean;
    /** 'auto' fades the resource bars when full; 'always' keeps them on screen. */
    hudBars?: 'auto' | 'always';
    crosshair?: boolean;
    /** The objective tracker (top right): the tracked quest and what to do next (default on). */
    objectiveTracker?: boolean;
    /** Player rebinds of core actions (merged over DEFAULT_BINDINGS). */
    bindings?: Partial<Bindings>;
    uiBindings?: Partial<Record<UiAction, string[]>>;
  }
}

/**
 * The smallest window, in rem, the interface is laid out for (1280×720 at about 133%). Larger
 * interface sizes on smaller windows are scaled down to this so nothing overlaps or overflows.
 */
export const UI_MIN_REM = { w: 60, h: 34 } as const;

/** Root font size in px for an interface scale on a window of vw×vh CSS px. */
export function uiFontPx(scale: number, vw: number, vh: number): number {
  const s = Math.max(0.7, Math.min(1.6, scale || 1));
  const fit = Math.min(vw / UI_MIN_REM.w, vh / UI_MIN_REM.h);
  return Math.max(11, Math.min(16 * s, fit));
}

export function uiBindings(data: SettingsData): Record<UiAction, string[]> {
  return { ...DEFAULT_UI_BINDINGS, ...(data.uiBindings ?? {}) };
}

/** Applies settings to the game now and whenever they change. Returns an unsubscribe. */
export function bindSettings(game: Game, applyUiScale: (s: number) => void): () => void {
  let prev: Partial<SettingsData> = {};
  const apply = (s: SettingsData) => {
    const changed = <K extends keyof SettingsData>(k: K) => prev[k] !== s[k];
    if (changed('uiScale')) applyUiScale(s.uiScale);
    if (changed('lookSensitivity')) game.input.sensitivity = 0.0022 * s.lookSensitivity;
    if (changed('invertY')) game.input.invertY = s.invertY;
    if ((changed('renderScale') || changed('maxPixelRatio')) && 'renderScale' in prev) game.resize();
    if (changed('shadows') && 'shadows' in prev) {
      const on = s.shadows !== 'off';
      if (game.renderer.shadowMap.enabled !== on) {
        game.renderer.shadowMap.enabled = on;
        game.scene.traverse((o) => {
          const m = (o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] }).material;
          if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
          else if (m) m.needsUpdate = true;
        });
      }
    }
    if (changed('viewDistance')) {
      const world = (game as { world?: { distanceScale: number } }).world;
      if (world) world.distanceScale = s.viewDistance / 900;
    }
    if (changed('showFps') && 'showFps' in prev) {
      // DebugOverlay only reads the setting at startup; flip its visibility live.
      const dbg = game.getSystem('debugOverlay') as unknown as { visible: boolean; el?: HTMLElement } | undefined;
      if (dbg) {
        dbg.visible = s.showFps;
        if (dbg.el) dbg.el.style.display = s.showFps ? '' : 'none';
      }
    }
    if (changed('bindings')) {
      // Saved bindings are repaired before use: an essential action (move, jump, interact, attack,
      // block, view, pause…) can never be left without a key, whatever the saved file says.
      const { bindings, repaired } = sanitizeBindings(s.bindings as Partial<Record<string, unknown>> | undefined);
      game.input.setBindings(bindings);
      if (repaired.length) {
        // Persist every action the repair changed (the restored one AND any it took a key back
        // from), so the saved set is healthy and the next load is a no-op.
        const merged = { ...DEFAULT_BINDINGS, ...(s.bindings ?? {}) } as Bindings;
        const next = { ...(s.bindings ?? {}) } as Partial<Bindings>;
        for (const a of Object.keys(bindings) as Action[]) {
          if (JSON.stringify(bindings[a]) !== JSON.stringify(merged[a] ?? [])) next[a] = bindings[a];
        }
        const what = repaired.map((r) => `${r.codes.map(codeLabel).join(' / ')} → ${ACTION_NAMES[r.action] ?? r.action}`).join(', ');
        // After this apply returns: persisting re-enters apply (it is a settings change).
        queueMicrotask(() => {
          game.settings.set('bindings', next);
          setTimeout(() => game.events.emit('ui:notify', { text: `Controls repaired: ${what}`, kind: 'info' }), 1500);
        });
      }
    }
    prev = { ...s };
  };
  apply(game.settings.data);
  return game.settings.onChange(apply);
}

/** Persist one action's bindings (core action) and apply them. */
export function setActionBindings(game: Game, action: Action, codes: string[]) {
  const cur = { ...(game.settings.data.bindings ?? {}) };
  cur[action] = codes;
  game.settings.set('bindings', cur);
}

export function setUiActionBindings(game: Game, action: UiAction, codes: string[]) {
  const cur = { ...(game.settings.data.uiBindings ?? {}) };
  cur[action] = codes;
  game.settings.set('uiBindings', cur);
}
