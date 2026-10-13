/**
 * `?diag=1`: a small live status panel for debugging on a phone, where there is no console. It
 * refreshes on its own timer (not the game loop), so it keeps reporting when the loop is stuck:
 * the loading step, whether the game is ready and drawing frames, input and device, the camera and
 * the player, the renderer, and the last errors and console warnings. Off unless asked for.
 */

interface DiagGame {
  running?: boolean;
  isIdle?(): boolean;
  paused?: boolean;
  camera?: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } };
  player?: { position: { x: number; y: number; z: number }; yaw?: number; pitch?: number };
  input?: { enabled: boolean; device: string };
  ui?: { top?: { id: string }; blockers?: Set<string> };
  renderer?: { info: { render: { calls: number; frame: number }; programs?: unknown[] }; getContext(): WebGL2RenderingContext };
  stats?: { fps: number };
  settings?: { data: { graphics?: string; graphicsApplied?: { tier: string } } };
}

const on = typeof location !== 'undefined' && new URLSearchParams(location.search).get('diag') === '1';

if (on && typeof window !== 'undefined') {
  const t0 = performance.now();
  const log: string[] = [];
  const keep = (s: string) => {
    log.push(`${((performance.now() - t0) / 1000).toFixed(1)}s ${s.slice(0, 160)}`);
    if (log.length > 8) log.shift();
  };
  window.addEventListener('error', (e) => keep(`ERR ${e.message} ${e.filename?.split('/').pop() ?? ''}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => keep(`REJ ${(e.reason as Error)?.message ?? String(e.reason)}`));
  window.addEventListener('webglcontextlost', () => keep('WEBGL CONTEXT LOST'), true);
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      keep(`${level === 'error' ? 'E' : 'W'} ${args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`);
      orig(...args);
    };
  }
  // Frames the browser gives the page (independent of the game's own loop).
  let rafs = 0;
  const tick = () => {
    rafs++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const panel = document.createElement('pre');
  panel.style.cssText =
    'position:fixed;left:4px;top:40px;z-index:100001;margin:0;padding:6px 8px;max-width:96vw;white-space:pre-wrap;' +
    'font:11px/1.3 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.72);color:#e7f0d0;pointer-events:none;';
  const f = (v: number | undefined) => (v === undefined || v === null ? '-' : Number.isFinite(v) ? v.toFixed(2) : String(v));
  const v3 = (p?: { x: number; y: number; z: number }) => (p ? `${f(p.x)},${f(p.y)},${f(p.z)}` : '-');
  let lastFrame = -1;
  let lastCalls = '';
  setInterval(() => {
    if (!panel.isConnected && document.body) document.body.appendChild(panel);
    const sk = (window as unknown as { __skyrome?: { game?: DiagGame; ready?: boolean; error?: string } }).__skyrome;
    const g = sk?.game;
    const r = g?.renderer;
    const frame = r?.info.render.frame ?? -1;
    const drawing = frame !== lastFrame;
    lastFrame = frame;
    let lost = '?';
    try {
      lost = r ? String(r.getContext().isContextLost()) : '-';
    } catch {
      /* no context */
    }
    if (r) lastCalls = String(r.info.render.calls);
    const step = document.querySelector('.ld-label')?.textContent?.trim() ?? '';
    const touch = document.querySelector('.touch-root');
    panel.textContent = [
      `t ${((performance.now() - t0) / 1000).toFixed(0)}s  raf ${rafs}  step "${step}"`,
      `ready ${!!sk?.ready}  err ${sk?.error ?? '-'}  running ${g?.running ?? '-'}  paused ${g?.paused ?? '-'}`,
      `idle ${g?.isIdle?.() ?? '-'}  focus ${document.hasFocus()}  hidden ${document.hidden}`,
      `frame ${frame} ${drawing ? '(drawing)' : '(STILL)'}  calls ${lastCalls}  fps ${f(g?.stats?.fps)}  lost ${lost}  progs ${r?.info.programs?.length ?? '-'}`,
      `input ${g?.input?.enabled ?? '-'} ${g?.input?.device ?? '-'}  modal ${g?.ui?.top?.id ?? '-'}  block ${g?.ui?.blockers ? [...g.ui.blockers].join(',') || '-' : '-'}  touchUI ${touch ? !touch.classList.contains('is-hidden') : '-'}`,
      `tier ${g?.settings?.data.graphicsApplied?.tier ?? g?.settings?.data.graphics ?? '-'}  cam ${v3(g?.camera?.position)} rot ${v3(g?.camera?.rotation)}`,
      `player ${v3(g?.player?.position)} yaw ${f(g?.player?.yaw)} pitch ${f(g?.player?.pitch)}`,
      ...log,
    ].join('\n');
  }, 500);
}

export {};
