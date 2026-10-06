/**
 * Gameplay settings owned by the game flow (declaration-merged into SettingsData, all optional so
 * old saves of the settings stay valid) and the three control presets of GDD §4.3.
 *
 *   Mouse     click/right-click or F/Q · hold block · hold sprint · scroll fully in → first person
 *   Trackpad  F/Q only (clicks never attack unless opted in) · toggle block and sprint ·
 *             look ×1.6 with 0.08 s smoothing · auto-recenter · lock-on suggested · light aim assist
 *   Keyboard  arrow-key look · toggles · auto-lock · strong aim assist · auto-recenter
 *
 * Choosing a preset writes its values into the individual settings; the player can then change
 * any of them (the preset stays as a label). Other modules read the settings directly:
 * combat reads `blockToggle`, `powerHoldS`, `lockOnMode`, `aimAssist`, `difficulty`.
 */
import type { Difficulty } from '../rpg/data/tuning';
import type { SettingsData } from '../core/Settings';

export type ControlPreset = 'mouse' | 'trackpad' | 'keyboard';
export type LockOnMode = 'manual' | 'suggest' | 'auto';
export type AimAssist = 'off' | 'light' | 'strong';

declare module '../core/Settings' {
  interface SettingsData {
    /** GDD §4.3 control preset (a guess until the player picks one). */
    controlPreset?: ControlPreset;
    /** The player has chosen a preset in the first-launch picker (or in Settings). */
    presetPicked?: boolean;
    /** The preset whose values were last written into the rows (see `settingsFixups`). */
    presetApplied?: ControlPreset;
    /** Difficulty (§6.12); v0.1 offers tiro / normalis / difficilis. */
    difficulty?: Difficulty;
    /** Sprint key toggles instead of being held. */
    sprintToggle?: boolean;
    /** Sneak while held instead of toggling. */
    sneakHold?: boolean;
    /** Mouse clicks attack and block (off by default in the Trackpad preset). */
    clickAttacks?: boolean;
    /** Scrolling fully in enters first person (Mouse preset). */
    zoomToFirstPerson?: boolean;
    /** Third-person camera swings behind you after 1.5 s without look input while moving. */
    autoRecenter?: boolean;
    /** Pointer-look smoothing in seconds (0 = raw). */
    lookSmoothing?: number;
    /** Power-attack hold threshold in seconds (0.2–0.6). */
    powerHoldS?: number;
    lockOnMode?: LockOnMode;
    aimAssist?: AimAssist;
  }
}

export const DIFFICULTY_CHOICES: { value: Difficulty; label: string }[] = [
  { value: 'tiro', label: 'Tiro (easy)' },
  { value: 'normalis', label: 'Normalis' },
  { value: 'difficilis', label: 'Difficilis (hard)' },
];

export interface PresetInfo {
  id: ControlPreset;
  label: string;
  latin: string;
  blurb: string;
  /** Short lines for the picker. */
  points: string[];
}

export const PRESETS: PresetInfo[] = [
  {
    id: 'mouse',
    label: 'Mouse',
    latin: 'Mus',
    blurb: 'A mouse with two buttons and a wheel.',
    points: ['Click to attack, right-click to block (or F / Q)', 'Hold to block and to sprint', 'Scroll in all the way for first person'],
  },
  {
    id: 'trackpad',
    label: 'Trackpad',
    latin: 'Tabula tactilis',
    blurb: 'A Mac laptop trackpad. Recommended for MacBooks.',
    points: ['F attacks, Q blocks: taps on the trackpad never swing', 'Q and Shift toggle; the camera recenters itself', 'V switches first and third person'],
  },
  {
    id: 'keyboard',
    label: 'Keyboard only',
    latin: 'Claviatura',
    blurb: 'No pointer at all: the arrow keys turn the camera.',
    points: ['Arrow keys look (150° a second)', 'Toggles for block and sprint; X locks on', 'Strong aim assist'],
  },
];

/** The settings a preset sets (GDD §4.3 table). Pure. */
export function presetValues(preset: ControlPreset): Partial<SettingsData> {
  switch (preset) {
    case 'mouse':
      return {
        controlPreset: 'mouse', lookSensitivity: 1, lookSmoothing: 0, blockToggle: false, sprintToggle: false,
        clickAttacks: true, zoomToFirstPerson: true, autoRecenter: false, powerHoldS: 0.35, lockOnMode: 'manual', aimAssist: 'off',
      };
    case 'trackpad':
      return {
        controlPreset: 'trackpad', lookSensitivity: 1.6, lookSmoothing: 0.08, blockToggle: true, sprintToggle: true,
        clickAttacks: false, zoomToFirstPerson: false, autoRecenter: true, powerHoldS: 0.35, lockOnMode: 'suggest', aimAssist: 'light',
      };
    case 'keyboard':
      return {
        controlPreset: 'keyboard', lookSensitivity: 1, lookSmoothing: 0, blockToggle: true, sprintToggle: true,
        clickAttacks: false, zoomToFirstPerson: false, autoRecenter: true, powerHoldS: 0.35, lockOnMode: 'auto', aimAssist: 'strong',
      };
  }
}

/** Default preset guess for the first-launch picker: a Mac without a fine pointer → Trackpad. */
export function guessPreset(env: { platform?: string; userAgent?: string; maxTouchPoints?: number }): ControlPreset {
  const mac = /Mac/i.test(env.platform ?? '') || /Macintosh/i.test(env.userAgent ?? '');
  return mac ? 'trackpad' : 'mouse';
}

/**
 * The settings writes that keep the Settings screen honest (what it shows is what the game does).
 * Pure. `guess` is the preset for a first launch.
 * - A preset not yet written into the rows (first launch, a new choice in the Preset row, or the
 *   Controls "Defaults", which unsets the preset) writes every row it owns, including the ones the
 *   core settings pre-fill (look sensitivity 1, hold-to-block) that would otherwise disagree.
 * - Settings saved before `presetApplied` existed keep the player's rows if they picked a preset.
 * - A row reset to unset takes the preset's value; difficulty defaults to Normalis, gore to Ultra.
 */
export function settingsFixups(d: Partial<SettingsData>, guess: ControlPreset): Partial<SettingsData> {
  const preset = d.controlPreset ?? guess;
  const vals = presetValues(preset) as Record<string, unknown>;
  const cur = d as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (d.presetApplied === undefined && d.presetPicked && d.controlPreset) out.presetApplied = d.controlPreset;
  else if (d.presetApplied !== preset || d.controlPreset === undefined) {
    out.presetApplied = preset;
    for (const [k, v] of Object.entries(vals)) if (cur[k] !== v) out[k] = v;
  }
  for (const [k, v] of Object.entries(vals)) if (cur[k] === undefined && !(k in out)) out[k] = v;
  if (d.difficulty === undefined) out.difficulty = 'normalis';
  // Written out so Settings shows what the game does (an unset choice row shows its first option).
  if (d.gore === undefined) out.gore = 'ultra';
  return out as Partial<SettingsData>;
}

/** What the input/camera/controller should do for a settings snapshot. Pure (unit-tested). */
export interface ControlState {
  ignoredCodes: string[];
  lookSmoothing: number;
  sprintMode: 'hold' | 'toggle';
  sneakMode: 'hold' | 'toggle';
  zoomToFirstPerson: boolean;
  autoRecenterDelay: number;
}

export function controlState(s: Partial<SettingsData>): ControlState {
  const preset = s.controlPreset ?? 'mouse';
  const clicks = s.clickAttacks ?? preset === 'mouse';
  return {
    ignoredCodes: clicks ? [] : ['Mouse0', 'Mouse2'],
    lookSmoothing: Math.max(0, Math.min(0.3, s.lookSmoothing ?? (preset === 'trackpad' ? 0.08 : 0))),
    sprintMode: (s.sprintToggle ?? preset !== 'mouse') ? 'toggle' : 'hold',
    sneakMode: s.sneakHold ? 'hold' : 'toggle',
    zoomToFirstPerson: s.zoomToFirstPerson ?? preset === 'mouse',
    autoRecenterDelay: (s.autoRecenter ?? preset !== 'mouse') ? 1.5 : 0,
  };
}
