/**
 * The player's combat input (docs/GDD.md §4.2, §6.1). Reads actions, never raw keys, once per
 * rendered frame (input edges live for one frame), and turns them into verbs on the core:
 *
 *   F tap            light attack (3-hit chain; presses during a swing are buffered 0.25 s)
 *   F hold ≥ 0.35 s  power attack; direction latched from WASD within 0.25 s before the threshold
 *                    ("simple power": the movement at release); auto-release at 1.0 s
 *   F while guarding shield bash · F while sprinting: sprint attack
 *   Q                block, hold or toggle (§4.2 rule in guardInput.ts); every press is a parry try
 *   Space / Option   dodge (Space only in combat with a weapon drawn); WASD direction or a backstep
 *   X                tap: lock on / cycle; hold 0.5 s: release
 *   R                draw / sheathe (F with the weapon sheathed draws it and swings; Q draws it)
 *   hold Y 1 s       yield · hold E (arena) salute / take the crowd's gifts · hold F on a knocked-out
 *                    body: finish it · F or E while netted: struggle
 */
import type { Game } from '../core/Game';
import type { Combatant } from './Combatant';
import type { CombatCore } from './CombatCore';
import { GuardInput } from './guardInput';
import { TIMING } from './timing';
import type { CombatSettings } from './settings';

export interface PlayerCombatHost {
  readonly game: Game;
  readonly core: CombatCore;
  readonly playerC: Combatant | null;
  settings(): CombatSettings;
  canJump(): boolean;
  acquireLock(): boolean;
  cycleLock(dir?: 1 | -1): void;
  setLock(t: Combatant | null): void;
  suggestLock(): void;
  playerYield(): void;
  /** Hold E in a bout: salute or gifts; returns the label if available. */
  arenaHoldLabel(): string | null;
  arenaHoldE(): void;
  /** A knocked-out body in front within reach and no enemy close, or null. */
  finishable(): Combatant | null;
  finishBody(c: Combatant): void;
}

type Dir = 'none' | 'forward' | 'sideways' | 'back';

export class PlayerCombat {
  readonly guard = new GuardInput();
  /** HUD: a hold in progress. */
  hold: { progress: number; label: string } | null = null;
  private attackDownAt = -1;
  private charging = false;
  private bufferedAt = -Infinity;
  private lastMove = { x: 0, z: 0, at: -Infinity };
  private lockDownAt = -1;
  private lockReleased = false;
  private yieldDownAt = -1;
  private yieldDone = false;
  private holdEAt = -1;
  private holdEDone = false;
  private finishing: Combatant | null = null;
  private finishAt = -1;
  /** F pressed with the weapon sheathed: swing as soon as it is out (game time of the press). */
  private swingAfterDraw = -Infinity;

  constructor(private readonly host: PlayerCombatHost) {}

  /** Once per rendered frame (after the PlayerController read look/jump). */
  update() {
    const { game, core } = this.host;
    const c = this.host.playerC;
    const input = game.input;
    const t = game.elapsed;
    this.hold = null;
    if (!c || !c.active || !input.enabled) {
      this.attackDownAt = -1;
      this.charging = false;
      this.finishing = null;
      if (c && !c.active) this.guard.reset();
      if (c) core.setGuard(c, false);
      return;
    }
    const S = this.host.settings();
    this.guard.setToggle(S.blockToggle);
    const axes = input.moveAxes();
    if (axes.x || axes.z) this.lastMove = { x: axes.x, z: axes.z, at: t };

    // Netted: struggle; the shield can still be raised (no parry).
    if (c.entangled(core.now)) {
      if (input.pressed('attack') || input.pressed('interact')) core.struggle(c);
      this.attackDownAt = -1;
      this.charging = false;
      this.blockInput(t, c, false);
      return;
    }

    if (input.pressed('readyWeapon')) {
      const drawing = !c.drawn;
      if (core.setDrawn(c, drawing) && drawing) this.host.suggestLock();
    }
    this.blockInput(t, c, true);
    if (input.pressed('parry')) core.pressParry(c);
    if (input.pressed('dodge') || (input.pressed('jump') && !this.host.canJump())) this.dodge(c);
    this.attackInput(t, c, S);
    this.lockInput(t, c);
    this.yieldInput(t);
    this.arenaInput(t);
  }

  private blockInput(t: number, c: Combatant, canParry: boolean) {
    const { game, core } = this.host;
    const input = game.input;
    if (input.pressed('block')) {
      if (!c.drawn) core.setDrawn(c, true);
      this.guard.press(t);
      if (canParry) core.pressParry(c);
    }
    if (input.released('block')) this.guard.release(t);
    core.setGuard(c, this.guard.guard && c.drawn);
  }

  /** A parry landed: in toggle mode it never changes the guard (§4.2). */
  onParried() {
    this.guard.parried();
  }

  private attackInput(t: number, c: Combatant, S: CombatSettings) {
    const { game, core } = this.host;
    const input = game.input;
    const p = game.player;
    if (input.pressed('attack')) {
      const body = this.host.finishable();
      if (body) {
        this.finishing = body;
        this.finishAt = t;
        return;
      }
      if (!c.drawn) {
        // One press draws and swings: the attack follows as soon as the weapon is out.
        core.setDrawn(c, true);
        this.host.suggestLock();
        this.attackDownAt = -1;
        this.swingAfterDraw = t;
        return;
      }
      if (c.guardActive) {
        core.startAttack(c, 'bash');
        this.attackDownAt = -1;
        return;
      }
      if (p?.sprinting && core.free(c)) {
        core.startAttack(c, 'light', { sprint: true });
        this.attackDownAt = -1;
        return;
      }
      this.attackDownAt = t;
      this.charging = false;
    }

    // Hold F on a knocked-out body: a deliberate kill (§6.9).
    if (this.finishing) {
      if (input.down('attack')) {
        const pr = (t - this.finishAt) / TIMING.holdKill;
        this.hold = { progress: pr, label: 'FINISH' };
        if (pr >= 1) {
          this.host.finishBody(this.finishing);
          this.finishing = null;
        }
      } else this.finishing = null;
      return;
    }

    if (this.attackDownAt >= 0 && input.down('attack') && !this.charging && t - this.attackDownAt >= S.powerHold) {
      if (core.free(c)) {
        this.charging = core.beginCharge(c);
        if (this.charging) core.latchDirection(c, S.simplePower ? 'none' : this.latch(this.attackDownAt + S.powerHold));
        else this.attackDownAt = -1; // refused (winded)
      }
    }
    // The core auto-releases at 1.0 s.
    if (this.charging && c.action?.kind !== 'charge') {
      this.charging = false;
      this.attackDownAt = -1;
    }
    if (input.released('attack') && this.attackDownAt >= 0) {
      if (this.charging) core.releaseCharge(c, S.simplePower ? this.current() : undefined);
      else if (!core.startAttack(c, 'light') && !c.winded) this.bufferedAt = t;
      this.attackDownAt = -1;
      this.charging = false;
    }
    if (this.swingAfterDraw > -Infinity) {
      if (t - this.swingAfterDraw > TIMING.draw + 0.6 || !c.drawn) this.swingAfterDraw = -Infinity;
      else if (core.free(c)) {
        core.startAttack(c, 'light');
        this.swingAfterDraw = -Infinity;
      }
    }
    if (this.bufferedAt > -Infinity) {
      if (t - this.bufferedAt > TIMING.buffer) this.bufferedAt = -Infinity;
      else if (core.free(c)) {
        core.startAttack(c, 'light');
        this.bufferedAt = -Infinity;
      }
    }
  }

  /** §6.1 latch: the last movement input held within 0.25 s before the hold threshold. */
  private latch(thresholdAt: number): Dir {
    if (thresholdAt - this.lastMove.at > TIMING.buffer + 0.02) return 'none';
    return axesDir(this.lastMove.x, this.lastMove.z);
  }

  private current(): Dir {
    const a = this.host.game.input.moveAxes();
    return axesDir(a.x, a.z);
  }

  private dodge(c: Combatant) {
    const { game, core } = this.host;
    const a = game.input.moveAxes();
    const yaw = game.player.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // Camera right = (-fz, fx); forward input is -z.
    const wx = -fz * a.x + fx * -a.z;
    const wz = fx * a.x + fz * -a.z;
    if (core.dodge(c, wx, wz)) this.attackDownAt = -1;
  }

  private lockInput(t: number, c: Combatant) {
    const input = this.host.game.input;
    // Locked on, the camera follows the target: the turn keys pick the next one left or right.
    if (c.lockTarget) {
      if (input.pressed('lookLeft')) this.host.cycleLock(-1);
      if (input.pressed('lookRight')) this.host.cycleLock(1);
    }
    if (input.pressed('lockOn')) {
      this.lockDownAt = t;
      this.lockReleased = false;
    }
    if (this.lockDownAt >= 0 && input.down('lockOn') && !this.lockReleased && t - this.lockDownAt >= TIMING.lockReleaseHold) {
      this.host.setLock(null);
      this.lockReleased = true;
    }
    if (this.lockDownAt >= 0 && input.released('lockOn')) {
      if (!this.lockReleased) {
        if (c.lockTarget) this.host.cycleLock();
        else this.host.acquireLock();
      }
      this.lockDownAt = -1;
    }
  }

  private yieldInput(t: number) {
    const { game, core } = this.host;
    if (!game.input.down('yield')) {
      this.yieldDownAt = -1;
      return;
    }
    const meaningful = core.playerInCombat || (!!core.bout && !core.bout.over);
    if (!meaningful) return;
    if (this.yieldDownAt < 0) {
      this.yieldDownAt = t;
      this.yieldDone = false;
    }
    const pr = (t - this.yieldDownAt) / TIMING.yieldHold;
    if (!this.yieldDone) this.hold = { progress: pr, label: 'YIELD' };
    if (pr >= 1 && !this.yieldDone) {
      this.yieldDone = true;
      this.host.playerYield();
    }
  }

  private arenaInput(t: number) {
    const input = this.host.game.input;
    const label = this.host.arenaHoldLabel();
    if (!label || !input.down('interact')) {
      this.holdEAt = -1;
      return;
    }
    if (this.holdEAt < 0) {
      this.holdEAt = t;
      this.holdEDone = false;
    }
    const pr = (t - this.holdEAt) / TIMING.holdInteract;
    if (!this.holdEDone) this.hold = { progress: pr, label };
    if (pr >= 1 && !this.holdEDone) {
      this.holdEDone = true;
      this.host.arenaHoldE();
    }
  }
}

/** Camera-relative movement axes → power direction (§6.1). */
export function axesDir(x: number, z: number): Dir {
  if (!x && !z) return 'none';
  if (Math.abs(x) > Math.abs(z)) return 'sideways';
  return z < 0 ? 'forward' : 'back';
}
