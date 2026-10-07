import './styles.css';
import { Game } from './core/Game';
import { DebugOverlay } from './dev/DebugOverlay';
import { GraphicsGovernor } from './core/graphics';
import { enableCompressedTextures } from './gfx/materials';
import { setLeafyCanopies } from './arch/vegetation/materials';
import { AUDIT, analyzeArea, auditRecordCount } from './dev/audit/geomAudit';
import type { SceneDef } from './scenes/types';

const sceneModules = import.meta.glob<{ default: SceneDef }>('./scenes/*.ts');

declare global {
  interface Window {
    /** Automation hooks: `ready` once the scene is up (Rome: the title, or play with &quick=1). */
    __skyrome?: { game: Game; scene: string; ready: boolean; error?: string; readyMs?: number };
  }
}

async function boot() {
  const app = document.getElementById('app')!;
  const params = new URLSearchParams(location.search);
  const available = Object.keys(sceneModules)
    .map((p) => p.replace('./scenes/', '').replace('.ts', ''))
    .filter((n) => n !== 'types' && n !== 'common');
  const requested = params.get('scene') ?? (available.includes('rome') ? 'rome' : 'sandbox');
  const sceneName = available.includes(requested) ? requested : 'sandbox';

  const game = await Game.create(app, { seed: Number(params.get('seed') ?? 113) });
  window.__skyrome = { game, scene: sceneName, ready: false };
  enableCompressedTextures(game.renderer);
  // Geometry audit hooks for scripts/crawl.mjs (?audit).
  if (AUDIT) (window as unknown as { __audit: unknown }).__audit = { analyzeArea, auditRecordCount };
  {
    const s = game.settings.data;
    const tier = s.graphics && s.graphics !== 'auto' ? s.graphics : s.graphicsApplied?.tier;
    setLeafyCanopies(tier !== 'low');
  }

  const ui = document.createElement('div');
  ui.className = 'ui-root';
  app.appendChild(ui);
  game.addSystem(new DebugOverlay(game, ui));
  game.addSystem(new GraphicsGovernor(game));

  const mod = await sceneModules[`./scenes/${sceneName}.ts`]();
  await mod.default.setup(game, ui);
  game.start();
  window.__skyrome.readyMs = Math.round(performance.now());
  window.__skyrome.ready = true;
}

boot().catch((err) => {
  console.error(err);
  const el = document.createElement('div');
  el.className = 'boot-error';
  el.textContent = `Skyrome failed to start.\n\n${err?.stack ?? err}`;
  document.body.appendChild(el);
  if (window.__skyrome) window.__skyrome.error = String(err);
  else (window as any).__skyrome = { ready: false, error: String(err) };
});
