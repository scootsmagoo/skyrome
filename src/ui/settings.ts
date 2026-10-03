/**
 * UI-owned settings (added to SettingsData by declaration merging, all optional so core defaults
 * stay valid) and live application of settings changes to the running game.
 */
import type { Game } from '../core/Game';
import { DEFAULT_BINDINGS, type Action, type Bindings } from '../core/Input';
import type { SettingsData } from '../core/Settings';

/** Keys the UI handles itself (not gameplay actions in core Input). */
export type UiAction = 'wait' | 'clock';

export const DEFAULT_UI_BINDINGS: Record<UiAction, string[]> = {
  wait: ['KeyT'],
  clock: ['KeyH'],
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
    /** Player rebinds of core actions (merged over DEFAULT_BINDINGS). */
    bindings?: Partial<Bindings>;
    uiBindings?: Partial<Record<UiAction, string[]>>;
  }
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
    if (changed('bindings')) game.input.setBindings({ ...DEFAULT_BINDINGS, ...(s.bindings ?? {}) });
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
