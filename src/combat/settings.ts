/**
 * Combat settings (added to SettingsData by declaration merging; all optional with defaults).
 * The Settings screen can expose them; `blockToggle` (hold or toggle block) is a core setting.
 */
import type { SettingsData } from '../core/Settings';
import type { Difficulty } from '../rpg/data/tuning';

declare module '../core/Settings' {
  interface SettingsData {
    /** §6.12 difficulty; v0.1 ships tiro, normalis and difficilis. Default normalis. */
    combatDifficulty?: Difficulty;
    /** "Simple power" (§6.1): the power direction is the current movement, or overhead. */
    combatSimplePower?: boolean;
    /** Power-attack hold threshold in seconds, 0.2–0.6 (§4.3). Default 0.35. */
    combatPowerHold?: number;
    /** Accessibility: parry window in seconds (null or 0 = by difficulty, §4.5). */
    combatParryWindow?: number | null;
    /** Camera shake: 'third' (third person only, the default per §4.4), 'on' or 'off'. */
    combatShake?: 'on' | 'off' | 'third';
    /** Lock-on: 'manual' (X), 'suggest' (drawing with a hostile within 8 m locks on), 'auto' (§4.3). Default 'suggest'. */
    combatLockOn?: 'manual' | 'suggest' | 'auto';
    /** Space always jumps and never dodges; Option still dodges (§4.2). */
    combatSpaceAlwaysJumps?: boolean;
    /** Hit-stop (§6.5). Default on. */
    combatHitStop?: boolean;
    /** Reduce flashing (§4.5): the unblockable cue glows instead of pulsing. */
    reduceFlashing?: boolean;
    /** World danger (§13.3): muggers lurk in the streets at night. Default on. */
    combatStreetDanger?: boolean;
  }
}

/**
 * The game flow's own settings (src/game/settings.ts) that combat follows: the Gameplay difficulty
 * and the control preset's power-hold and lock-on values. Read structurally so this module never
 * depends on the flow being present; they take precedence over the older `combat…` keys. Dev
 * scenes use `CombatSystem.override()` (never persisted) instead of writing settings.
 */
type FlowSettings = { difficulty?: Difficulty; powerHoldS?: number; lockOnMode?: 'manual' | 'suggest' | 'auto' };

export interface CombatSettings {
  difficulty: Difficulty;
  simplePower: boolean;
  powerHold: number;
  parryWindow: number | null;
  shake: 'on' | 'off' | 'third';
  lockOn: 'manual' | 'suggest' | 'auto';
  spaceAlwaysJumps: boolean;
  hitStop: boolean;
  reduceFlashing: boolean;
  blockToggle: boolean;
  streetDanger: boolean;
}

/** Read the combat settings with their defaults. */
export function combatSettings(s: SettingsData): CombatSettings {
  const flow = s as SettingsData & FlowSettings;
  const hold = flow.powerHoldS ?? s.combatPowerHold ?? 0.35;
  return {
    difficulty: flow.difficulty ?? s.combatDifficulty ?? 'normalis',
    simplePower: !!s.combatSimplePower,
    powerHold: Math.min(0.6, Math.max(0.2, Number.isFinite(hold) ? hold : 0.35)),
    parryWindow: s.combatParryWindow && s.combatParryWindow > 0 ? s.combatParryWindow : null,
    shake: s.combatShake ?? 'third',
    lockOn: flow.lockOnMode ?? s.combatLockOn ?? 'suggest',
    spaceAlwaysJumps: !!s.combatSpaceAlwaysJumps,
    hitStop: s.combatHitStop !== false,
    reduceFlashing: !!s.reduceFlashing,
    blockToggle: !!s.blockToggle,
    streetDanger: s.combatStreetDanger !== false,
  };
}
