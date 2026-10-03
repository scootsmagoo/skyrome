/** Toggle with ` (backquote): fps, draw calls, position, time. */
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

  lateUpdate(dt: number) {
    const { input, stats, time } = this.game;
    if (input.pressed('debug')) {
      this.visible = !this.visible;
      this.el.style.display = this.visible ? '' : 'none';
    }
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
      `${time.formatRoman()}  ${time.hour.toFixed(2)}h`;
  }
}
