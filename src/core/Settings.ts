/** User settings persisted in localStorage (best effort — storage can be unavailable). */

export interface SettingsData {
  fov: number;
  lookSensitivity: number;
  invertY: boolean;
  /** Cap on devicePixelRatio (Retina screens are expensive). */
  maxPixelRatio: number;
  /** Multiplier on the pixel ratio (0.5..1). */
  renderScale: number;
  antialias: boolean;
  shadows: 'off' | 'low' | 'high';
  viewDistance: number;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  /** Hold-to-block vs. toggle-to-block (trackpad comfort). */
  blockToggle: boolean;
  /** Show Latin names next to English ones. */
  latinNames: boolean;
  showFps: boolean;
  /** Bigger HUD text. */
  uiScale: number;
  /**
   * Frame-rate cap (frames per second; 0 = as fast as the display refreshes). A MacBook's 120 Hz
   * display would otherwise draw every frame twice as often for no visible gain — and run hot.
   */
  maxFps: number;
}

export const DEFAULT_SETTINGS: SettingsData = {
  fov: 70,
  lookSensitivity: 1,
  invertY: false,
  maxPixelRatio: 1.5,
  renderScale: 1,
  antialias: true,
  shadows: 'high',
  viewDistance: 900,
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  blockToggle: false,
  latinNames: true,
  showFps: false,
  uiScale: 1,
  maxFps: 60,
};

const KEY = 'skyrome.settings.v1';

export class Settings {
  private listeners = new Set<(s: SettingsData) => void>();
  private constructor(public data: SettingsData) {}

  static load(): Settings {
    let stored: Partial<SettingsData> = {};
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      /* private mode etc. */
    }
    return new Settings({ ...DEFAULT_SETTINGS, ...stored });
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    this.data = { ...this.data, [key]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
    for (const fn of this.listeners) fn(this.data);
  }

  onChange(fn: (s: SettingsData) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
