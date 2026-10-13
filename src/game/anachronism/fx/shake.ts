/**
 * Camera shake for the guns' recoil and blasts, added on top of the placed camera after the camera
 * rig (a priority-101 lateUpdate). Combat has its own shake in the rig; this is independent and
 * follows the same setting (Settings → combat shake: off / third person only / on).
 */
import type { Game } from '../../../core/Game';

export class Shake {
  private trauma = 0;
  private t = 0;

  constructor(private readonly game: Game) {}

  /** Add trauma 0..1 (it adds up, and the shake goes as its square). `blast`: blasts shake even in first person's "third only" setting. */
  add(amount: number, _blast = 0) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  apply(dt: number) {
    const g = this.game;
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.trauma <= 0) return;
    const mode = g.settings.data.combatShake ?? 'third';
    if (mode === 'off') return;
    const first = g.player?.viewMode === 'first';
    const amp = first ? (mode === 'third' ? 0 : 0.6) : 1;
    if (amp === 0) return;
    const a = this.trauma * this.trauma * amp;
    const t = this.t;
    const n = (f: number, o: number) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 1.73 + o * 2.1) * 0.4;
    const cam = g.camera;
    cam.position.x += n(31, 0) * a * 0.07;
    cam.position.y += n(29, 1.7) * a * 0.07;
    cam.position.z += n(27, 3.1) * a * 0.07;
    cam.rotation.x += n(23, 0.5) * a * 0.025;
    cam.rotation.y += n(21, 2.3) * a * 0.02;
    cam.rotation.z += n(19, 4.1) * a * 0.03;
  }
}
