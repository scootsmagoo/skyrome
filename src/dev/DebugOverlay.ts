/**
 * Toggle with ` (backquote): fps, draw calls, position, time, and the systems costing the most
 * CPU per frame (the game's per-system profiler runs while the overlay is shown).
 */
import type { Game, System } from '../core/Game';

export class DebugOverlay implements System {
  readonly name = 'debugOverlay';
  readonly priority = 1000;
  private el: HTMLDivElement;
  private acc = 0;
  visible: boolean;

  constructor(private readonly game: Game, parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    parent.appendChild(this.el);
    this.visible = game.settings.data.showFps || new URLSearchParams(location.search).has('debug');
    this.el.style.display = this.visible ? '' : 'none';
  }

  /** The game's profiler runs exactly while the overlay is shown (or a perf script turned it on). */
  private syncProfiling() {
    if (this.visible) this.game.profiling = true;
    else if (this.profiledByMe) this.game.profiling = false;
    this.profiledByMe = this.visible;
  }
  private profiledByMe = false;

  lateUpdate(dt: number) {
    const { input, stats, time } = this.game;
    if (input.pressed('debug')) {
      this.visible = !this.visible;
      this.el.style.display = this.visible ? '' : 'none';
    }
    this.syncProfiling();
    if (!this.visible) return;
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const p = this.game.player;
    const pos = p ? p.position : null;
    this.el.textContent =
      `${stats.fps.toFixed(0)} fps  ${stats.frameMs.toFixed(1)} ms  cpu ${stats.cpuMs.toFixed(1)} ms\n` +
      `draws ${stats.drawCalls}  tris ${(stats.triangles / 1000).toFixed(0)}k  geo ${stats.geometries}  tex ${stats.textures}\n` +
      (pos ? `pos ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}  ${p.viewMode}  ${p.grounded ? 'grounded' : 'air'}\n` : '') +
      `${time.formatRoman()}  ${time.hour.toFixed(2)}h` +
      this.topSystems();
  }

  private topSystems(): string {
    const top = [...this.game.profile].sort((a, b) => b[1] - a[1]).slice(0, 6).filter(([, ms]) => ms >= 0.05);
    return top.length ? '\n' + top.map(([k, ms]) => `${ms.toFixed(2).padStart(5)} ms  ${k}`).join('\n') : '';
  }
}
