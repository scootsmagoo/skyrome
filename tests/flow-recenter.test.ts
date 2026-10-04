import { describe, expect, it } from 'vitest';
import { approachAngle, wrapAngle } from '../src/core/math';
import type { Game } from '../src/core/Game';
import type { Player } from '../src/player/Player';
import { PlayerController, RECENTER_MAX_RATE, recenterYaw } from '../src/player/PlayerController';

/** A controller over a fake input and a fake player that moves exactly as wished (no physics). */
function rig(keys: { x: number; z: number }) {
  const input = {
    enabled: true,
    lookActive: false,
    look: { yaw: 0, pitch: 0 },
    keys,
    consumeLook() {
      const l = this.look;
      this.look = { yaw: 0, pitch: 0 };
      this.lookActive = l.yaw !== 0 || l.pitch !== 0;
      return l;
    },
    moveAxes() {
      return this.keys;
    },
    pressed: () => false,
    down: () => false,
  };
  const player = {
    yaw: Math.PI, // camera looks south (+z)…
    pitch: 0,
    heading: 0, // …behind a character facing south
    viewMode: 'third',
    combatStance: false,
    sneaking: false,
    walkMode: false,
    sprinting: false,
    grounded: true,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    turnToward(h: number, rate: number, dt: number) {
      this.heading = approachAngle(this.heading, h, rate * dt);
    },
    locomote(wish: { x: number; z: number }, dt: number) {
      this.velocity.x = wish.x;
      this.velocity.z = wish.z;
      this.position.x += wish.x * dt;
      this.position.z += wish.z * dt;
    },
  };
  const pc = new PlayerController({ input } as unknown as Game, player as unknown as Player);
  pc.autoRecenterDelay = 1.5;
  const dt = 1 / 60;
  const run = (seconds: number, each?: () => void) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      pc.update(dt);
      pc.fixedUpdate(dt);
      each?.();
    }
  };
  return { input, player, pc, run };
}

describe('third-person auto-recenter (GDD §4.3)', () => {
  it('swings the camera behind the character, no faster than the max rate', () => {
    let yaw = 0;
    const heading = 1.2; // the camera belongs at heading + π
    const dt = 1 / 60;
    let maxStep = 0;
    for (let i = 0; i < 900; i++) {
      const next = recenterYaw(yaw, heading, dt);
      maxStep = Math.max(maxStep, Math.abs(next - yaw));
      yaw = next;
    }
    expect(Math.abs(wrapAngle(yaw - (heading + Math.PI)))).toBeLessThan(1e-3);
    expect(maxStep).toBeLessThanOrEqual(RECENTER_MAX_RATE * dt + 1e-9);
  });

  it('W+D held for 5 s: the camera turns at most the 45° to get behind, and the path stays straight', () => {
    const { player, run } = rig({ x: 1, z: -1 });
    const yaw0 = player.yaw;
    const path: { x: number; z: number }[] = [];
    let maxStep = 0;
    let prevYaw = player.yaw;
    run(5, () => {
      path.push({ x: player.position.x, z: player.position.z });
      maxStep = Math.max(maxStep, Math.abs(wrapAngle(player.yaw - prevYaw)));
      prevYaw = player.yaw;
    });
    const turned = Math.abs(wrapAngle(player.yaw - yaw0));
    expect(turned).toBeGreaterThan(0.3); // it did recenter…
    expect(turned).toBeLessThanOrEqual(Math.PI / 4 + 1e-3); // …by no more than the diagonal
    expect(maxStep).toBeLessThanOrEqual(RECENTER_MAX_RATE / 60 + 1e-9);
    // Straight line: every point after the first turn lies on the line from there to the end.
    const a = path[30];
    const b = path[path.length - 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    expect(len).toBeGreaterThan(15);
    for (const p of path.slice(30)) {
      const off = Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / len;
      expect(off).toBeLessThan(0.05);
    }
    // The camera ends up behind the character.
    expect(Math.abs(wrapAngle(player.yaw - (player.heading + Math.PI)))).toBeLessThan(0.02);
  });

  it('releasing D after the swing runs on along the camera (the same direction)', () => {
    const { input, player, run } = rig({ x: 1, z: -1 });
    run(6);
    const dir = Math.atan2(player.velocity.x, player.velocity.z);
    input.keys = { x: 0, z: -1 };
    run(0.5);
    expect(Math.abs(wrapAngle(Math.atan2(player.velocity.x, player.velocity.z) - dir))).toBeLessThan(0.02);
  });

  it('does not count time standing still: a pause then a diagonal waits the full delay', () => {
    const { input, player, run } = rig({ x: 0, z: 0 });
    run(3);
    input.keys = { x: 1, z: -1 };
    const yaw0 = player.yaw;
    run(1.2);
    expect(player.yaw).toBe(yaw0);
  });

  it('look input cancels the swing and restarts the delay', () => {
    const { input, player, run } = rig({ x: 1, z: -1 });
    run(1.4);
    input.look = { yaw: 0.01, pitch: 0 };
    run(1 / 60);
    const yaw0 = player.yaw;
    run(1.3);
    expect(player.yaw).toBe(yaw0);
  });

  it('never acts on pure strafing or backing up, nor in first person', () => {
    for (const keys of [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 1 }]) {
      const { player, run } = rig(keys);
      const yaw0 = player.yaw;
      run(4);
      expect(player.yaw, JSON.stringify(keys)).toBe(yaw0);
    }
    const { player, run } = rig({ x: 1, z: -1 });
    player.viewMode = 'first';
    const yaw0 = player.yaw;
    run(4);
    expect(player.yaw).toBe(yaw0);
  });

  it('anything else turning the camera (lock-on, teleport, a script) drops the latch', () => {
    const { player, run } = rig({ x: 1, z: -1 });
    run(2.5); // the swing has started and latched the input
    player.yaw = 0; // someone else points the camera north
    run(1 / 60);
    // W+D is now read against the new camera: north-east.
    const dir = Math.atan2(player.velocity.x, player.velocity.z);
    expect(Math.abs(wrapAngle(dir - (Math.PI - Math.PI / 4)))).toBeLessThan(0.05);
  });

  it('is off when the delay is 0 (Mouse preset)', () => {
    const { player, pc, run } = rig({ x: 1, z: -1 });
    pc.autoRecenterDelay = 0;
    const yaw0 = player.yaw;
    run(4);
    expect(player.yaw).toBe(yaw0);
  });
});
