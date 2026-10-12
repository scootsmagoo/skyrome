/**
 * Naming controls in prompts and hints for the device the player is using (`input.device`): the
 * keyboard key, the controller's button (✕ on a PlayStation pad, A on an Xbox one), or nothing on
 * a touch screen, where the on-screen button carries its own label.
 */
import type { Game } from '../core/Game';
import { codeLabel, type Action, type InputDevice } from '../core/Input';
import { padButtonFor, padButtonLabel } from '../core/gamepad';

/** The device in hand (keyboard where the game has no real input: headless tests' stand-ins). */
function deviceOf(game: Game): InputDevice {
  const d = (game.input as Partial<Game['input']> | undefined)?.device;
  return d === 'gamepad' || d === 'touch' ? d : 'keyboard';
}

/** The on-screen touch buttons' names (ui/touch uses them as its labels). */
export const TOUCH_NAMES: Readonly<Partial<Record<Action, string>>> = {
  attack: 'Attack', block: 'Block', jump: 'Jump', dodge: 'Dodge', interact: 'Use',
  readyWeapon: 'Draw', sprint: 'Run', sneak: 'Sneak', toggleView: 'View', lockOn: 'Lock', map: 'Map',
};

/** The key or button that does `action` ('' on touch, or when nothing does). */
export function promptLabel(game: Game, action: Action): string {
  const device = deviceOf(game);
  if (device === 'touch') return '';
  if (device === 'gamepad') {
    const b = padButtonFor(action);
    return b === undefined ? '' : padButtonLabel(b, game.gamepad?.family ?? 'generic');
  }
  const code = (game.input as Partial<Game['input']> | undefined)?.bindings?.[action]?.find((c) => !c.startsWith('Wheel')) ?? '';
  return code ? codeLabel(code) : '';
}

/** What to call the control for `action` in a sentence: the key, the pad button, or the on-screen button's name. */
export function controlName(game: Game, action: Action): string {
  return deviceOf(game) === 'touch' ? TOUCH_NAMES[action] ?? '' : promptLabel(game, action);
}

/** Pick the text written for the device in hand. */
export function byDevice<T>(game: Game, texts: { keyboard: T; gamepad: T; touch: T }): T {
  return texts[deviceOf(game)];
}
