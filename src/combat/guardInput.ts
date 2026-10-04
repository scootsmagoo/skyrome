/**
 * The block key (§4.2): hold mode and toggle mode, and when a press is a parry attempt.
 *
 * - Every press opens the parry window and raises the guard at once.
 * - Hold mode: the guard is up while the key is held.
 * - Toggle mode (Trackpad and Keyboard-only presets): on release, a press shorter than 0.18 s
 *   restores the guard to what it was before the press (a tap is a parry attempt only, so a
 *   guarded player never drops the guard by trying to parry); a press of 0.18 s or more toggles it.
 * - A parry that lands never changes the guard state.
 *
 * Times are seconds on any monotonic clock. Pure logic; tests in tests/combat-input.test.ts.
 */
import { TIMING } from './timing';

export class GuardInput {
  /** Logical guard state: raised or not. */
  guard = false;
  private pressAt: number | null = null;
  private before = false;
  private parryLanded = false;

  constructor(public toggle = false) {}

  /** The block key went down at `t`. Always a parry attempt. */
  press(t: number): void {
    if (this.pressAt !== null) return;
    this.pressAt = t;
    this.before = this.guard;
    this.parryLanded = false;
    this.guard = true;
  }

  /** The block key came up at `t`. */
  release(t: number): void {
    if (this.pressAt === null) return;
    const held = t - this.pressAt;
    this.pressAt = null;
    if (!this.toggle) this.guard = false;
    else if (this.parryLanded || held < TIMING.togglePress) this.guard = this.before;
    else this.guard = !this.before;
  }

  /** A parry landed during the current press: on release the guard returns to its earlier state. */
  parried(): void {
    if (this.pressAt !== null) this.parryLanded = true;
  }

  /** The key is down. */
  get held(): boolean {
    return this.pressAt !== null;
  }

  setToggle(on: boolean): void {
    if (on === this.toggle) return;
    this.toggle = on;
    if (!on && this.pressAt === null) this.guard = false;
  }

  /** Drop the guard (stagger, sheathing, death); a held key keeps nothing raised until pressed again. */
  reset(): void {
    this.guard = false;
    this.pressAt = null;
    this.parryLanded = false;
  }
}
