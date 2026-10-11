/**
 * Surface-look and pop-in audit, run IN THE PAGE by scripts/audit/surface.mjs (needs `?audit=1`,
 * src/dev/audit/geomAudit.ts). Installs window.__surf with three measurements:
 *
 *   census(cx, cz, radius)   The walkable top surface on a 1 m grid round a point: which material
 *                            covers each cell (city paving, cover, plaza, landmark floor) or the
 *                            terrain's own dominant splat layer where nothing covers it. From it:
 *                            the seams between different materials (length in m, by pair, with the
 *                            tint contrast and texture-repeat ratio of the pair), the "same stuff,
 *                            two renderers" seams (the terrain's dirt next to the city's dirt mesh),
 *                            holes (terrain showing through inside the paving), slivers (patches of
 *                            a material under 3 m²) and the patchwork index (seam metres per 100 m²).
 *   settle(ms, lookAt)       Stand still after a teleport with a pinned camera and sample frames
 *                            every 100 ms: any pixel change while nothing moves is pop-in. Returns
 *                            the per-sample change (fraction of pixels that changed by > 12/255),
 *                            and every streaming / culling / texture / shadow event meanwhile.
 *   walk(route, opts)        Run the player along a street (kinematic, the real streamer and
 *                            registry do their work), with a pinned first-person camera, sampling
 *                            a small frame every `sampleMs` and logging every visibility flip of a
 *                            street cell, a block level, a registry entry (landmarks, dressing tiles)
 *                            and every texture upload, program compile or shadow-budget switch,
 *                            with the distance at which it happened. Returns the series, the events
 *                            and a filmstrip (PNG data URL) of the sampled frames.
 */
(() => {
  const game = window.__skyrome.game;
  const p = game.player;
  const H = (x, z) => game.heightmap.heightAt(x, z);
  const audit = window.__audit;

  // ---------------------------------------------------------------- material facts (from code)
  // Average colour each surface is normalised to (src/gfx/materialIds.ts MATERIAL_BASE for meshes,
  // src/world/terrain/groundTextures.ts GROUND_PALETTE for the terrain's layers) and the size of
  // one texture repeat (src/gfx/textures/catalog.ts MATERIAL_RECIPES.tile; Terrain.ts TERRAIN_TILE).
  const MESH = {
    paving_basalt: { c: 0x585653, tile: 3.2, src: 'photo paving_basalt' },
    paving_travertine: { c: 0xd3c8b0, tile: 6, src: 'procedural slabs' },
    cobbles: { c: 0x8a8274, tile: 1.6, src: 'photo cobbles' },
    gravel: { c: 0xa39a87, tile: 2.2, src: 'photo gravel' },
    dirt: { c: 0x8c7356, tile: 2.5, src: 'photo dirt' },
    grass: { c: 0x6f7f3e, tile: 2.6, src: 'photo grass' },
    dry_grass: { c: 0xa79a5c, tile: 2.2, src: 'photo dry_grass' },
    sand: { c: 0xc8b48a, tile: 1.8, src: 'photo sand' },
    mud: { c: 0x6a5a45, tile: 1.5, src: 'photo mud' },
    travertine: { c: 0xd3c8b0, tile: 2.4, src: 'procedural travertine' },
    marble: { c: 0xe8e4dc, tile: 2.4, src: 'photo marble' },
    tufa: { c: 0x9a8a6a, tile: 2.0, src: 'photo tufa' },
    peperino: { c: 0x6f6a62, tile: 1.6, src: 'photo peperino' },
    basalt: { c: 0x4a4846, tile: 2.0, src: 'photo basalt' },
    concrete: { c: 0x9a9388, tile: 2.2, src: 'photo concrete' },
    brick: { c: 0xa8674a, tile: 1.1, src: 'photo brick' },
    mosaic: { c: 0xb8b0a0, tile: 2.0, src: 'procedural mosaic' },
    wood: { c: 0x8a6a45, tile: 1.8, src: 'photo wood' },
  };
  const TERRAIN = {
    grass: { c: 0x75804a, tile: 3.0, src: 'terrain splat grass' },
    dry_grass: { c: 0xa49a5f, tile: 3.4, src: 'terrain splat dry_grass' },
    dirt: { c: 0x8b7a60, tile: 3.0, src: 'terrain splat dirt' },
    rock: { c: 0x9d8b6c, tile: 3.5, src: 'terrain splat rock' },
    sand: { c: 0xa89877, tile: 2.4, src: 'terrain splat sand' },
    mud: { c: 0x6a5c49, tile: 2.2, src: 'terrain splat mud' },
    gravel: { c: 0xa09885, tile: 2.2, src: 'terrain splat gravel' },
    paving_basalt: { c: 0x585653, tile: 3.2, src: 'terrain splat paving_basalt' },
    paving_travertine: { c: 0xd3c8b0, tile: 6, src: 'terrain splat paving_travertine (photo)' },
  };
  const LAYERS = ['grass', 'dry_grass', 'dirt', 'rock', 'sand', 'mud', 'gravel', 'paving_basalt', 'paving_travertine'];
  const lum = (hex) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f((hex >> 16) & 255) + 0.7152 * f((hex >> 8) & 255) + 0.0722 * f(hex & 255);
  };
  const facts = (key) => {
    if (key.startsWith('terrain:')) return TERRAIN[key.slice(8)] ?? { c: 0x808080, tile: 3, src: 'terrain' };
    const base = key.replace(/:.*$/, '');
    return MESH[base] ?? MESH[Object.keys(MESH).find((k) => base.includes(k)) ?? ''] ?? { c: 0x808080, tile: 2, src: 'mesh ' + base };
  };
  /** The look mismatch of two neighbouring surfaces: tint contrast (luminance ratio) and repeat ratio. */
  const mismatch = (a, b) => {
    const fa = facts(a), fb = facts(b);
    const la = lum(fa.c), lb = lum(fb.c);
    return { contrast: +(Math.max(la, lb) / Math.max(1e-3, Math.min(la, lb))).toFixed(2), tileRatio: +(Math.max(fa.tile, fb.tile) / Math.min(fa.tile, fb.tile)).toFixed(2), a: fa.src, b: fb.src };
  };

  // ---------------------------------------------------------------- census
  function dominantLayer(x, z) {
    const w = game.terrain.weightsAt(x, z);
    let best = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
    return LAYERS[best];
  }

  /** Materials the ground is made of (a floor of plaster, tile or wood is a building, not ground). */
  const GROUND = /^(paving_basalt|paving_travertine|cobbles|gravel|dirt|grass|dry_grass|sand|mud|travertine|marble|marble_veined|marble_giallo|marble_pavonazzetto|tufa|peperino|basalt|concrete|mosaic|brick|porphyry)$/;
  function census(cx, cz, radius) {
    const g = audit.topSurfaceGrid(cx, cz, radius, H, 1);
    const { n, x0, z0 } = g;
    const key = new Array(n * n);
    const mesh = new Uint8Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (g.mat[k] === 'terrain') key[k] = 'terrain:' + dominantLayer(x0 + i + 0.5, z0 + j + 0.5);
        else if (GROUND.test(g.mat[k])) {
          key[k] = g.mat[k];
          mesh[k] = 1;
        } else {
          key[k] = 'built'; // a floor, sill, roof or awning: a building, not ground
          mesh[k] = 2;
        }
      }
    // Regions: 4-connected components of one key.
    const comp = new Int32Array(n * n).fill(-1);
    const comps = [];
    for (let k0 = 0; k0 < n * n; k0++) {
      if (comp[k0] >= 0) continue;
      const stack = [k0];
      comp[k0] = comps.length;
      const c = { key: key[k0], area: 0, edge: false, sx: 0, sz: 0 };
      while (stack.length) {
        const k = stack.pop();
        c.area++;
        const i = k % n, j = (k / n) | 0;
        c.sx += i;
        c.sz += j;
        if (i === 0 || j === 0 || i === n - 1 || j === n - 1) c.edge = true;
        for (const o of [k - 1, k + 1, k - n, k + n]) {
          if (o < 0 || o >= n * n || Math.abs((o % n) - i) > 1) continue;
          if (key[o] === 'built') c.touchesBuilt = true; // a yard inside a block is not a hole in the paving
          if (comp[o] >= 0 || key[o] !== key[k]) continue;
          comp[o] = comps.length;
          stack.push(o);
        }
      }
      comps.push(c);
    }
    const holes = [], slivers = [];
    for (const c of comps) {
      const at = [+(x0 + c.sx / c.area + 0.5).toFixed(1), +(z0 + c.sz / c.area + 0.5).toFixed(1)];
      if (c.key === 'built') continue;
      if (!c.edge && c.key.startsWith('terrain:') && c.area <= 12 && !c.touchesBuilt) holes.push({ key: c.key, area: c.area, at });
      else if (!c.key.startsWith('terrain:') && c.area <= 3) slivers.push({ key: c.key, area: c.area, at });
    }
    // Seams: every 4-neighbour pair of different keys, by pair.
    const seams = new Map();
    let seamLen = 0, builtCells = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (mesh[k] === 1) builtCells++;
        for (const o of [i + 1 < n ? k + 1 : -1, j + 1 < n ? k + n : -1]) {
          if (o < 0 || key[o] === key[k]) continue;
          // Terrain-vs-terrain blends are the splat's own soft transitions: not seams; a wall foot is not a ground seam.
          if ((!mesh[k] && !mesh[o]) || mesh[k] === 2 || mesh[o] === 2) continue;
          seamLen++;
          const pair = [key[k], key[o]].sort().join(' | ');
          let e = seams.get(pair);
          if (!e) {
            const mm = mismatch(key[k], key[o]);
            seams.set(pair, (e = { pair, len: 0, ...mm, twins: mm.a.replace(/^.*splat /, '') === mm.b.replace(/^.*photo |^.*procedural /, ''), at: null, srcs: {} }));
          }
          e.len++;
          const px = x0 + i + 0.5 + (o === k + 1 ? 0.5 : 0), pz = z0 + j + 0.5 + (o === k + n ? 0.5 : 0);
          const s = [g.src[k] || 'terrain', g.src[o] || 'terrain'].sort().join(' | ');
          e.srcs[s] = (e.srcs[s] ?? 0) + 1;
          if (!e.at || Math.hypot(px - cx, pz - cz) < Math.hypot(e.at[0] - cx, e.at[1] - cz)) e.at = [+px.toFixed(1), +pz.toFixed(1)];
        }
      }
    const rows = [...seams.values()].map((e) => ({ ...e, srcs: Object.entries(e.srcs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, c]) => `${s} ×${c}`) })).sort((a, b) => b.len - a.len);
    // Same material drawn by two systems next to each other (the terrain's layer and a mesh of the same id).
    const twins = rows.filter((r) => {
      const [a, b] = r.pair.split(' | ');
      return a.startsWith('terrain:') !== b.startsWith('terrain:') && a.replace('terrain:', '') === b.replace('terrain:', '');
    });
    // Terrain cells that the city's class raster says it covers itself (gaps in the cover).
    let uncoveredUrban = 0;
    const covers = game.city?.coversGround;
    if (covers) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (!mesh[j * n + i] && covers.call(game.city, x0 + i + 0.5, z0 + j + 0.5)) uncoveredUrban++;
    return {
      cells: n * n, built: builtCells, regions: comps.length, seamLen, patchwork: +((seamLen * 100) / Math.max(1, builtCells)).toFixed(1),
      holes: holes.sort((a, b) => b.area - a.area).slice(0, 12), holesN: holes.length, holesArea: holes.reduce((s, h) => s + h.area, 0),
      slivers: slivers.slice(0, 12), sliversN: slivers.length, uncoveredUrban,
      seams: rows.slice(0, 20), twins: twins.slice(0, 8),
    };
  }

  // ---------------------------------------------------------------- frame capture and monitor
  const W = 320, Hh = 180;
  const cap = { want: false, data: null, raw: null };
  const origRender = game.renderFrame;
  // Read the finished frame straight from the default framebuffer (RGB; the canvas's alpha
  // channel would wash a drawImage copy out), box-filtered down to W × Hh.
  game.renderFrame = () => {
    origRender();
    if (cap.want) {
      cap.want = false;
      const gl = game.renderer.getContext();
      const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight;
      if (!cap.raw || cap.raw.length !== cw * ch * 4) cap.raw = new Uint8Array(cw * ch * 4);
      game.renderer.setRenderTarget(null);
      gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, cap.raw);
      const out = new Uint8ClampedArray(W * Hh * 4);
      const bx = cw / W, by = ch / Hh;
      for (let y = 0; y < Hh; y++) {
        const sy0 = Math.floor(y * by), sy1 = Math.floor((y + 1) * by);
        for (let x = 0; x < W; x++) {
          const sx0 = Math.floor(x * bx), sx1 = Math.floor((x + 1) * bx);
          let r = 0, g = 0, b = 0, n = 0;
          for (let sy = sy0; sy < sy1; sy++) {
            // readPixels is bottom-up: flip.
            const row = (ch - 1 - sy) * cw;
            for (let sx = sx0; sx < sx1; sx++) {
              const o = (row + sx) * 4;
              r += cap.raw[o];
              g += cap.raw[o + 1];
              b += cap.raw[o + 2];
              n++;
            }
          }
          const o = (y * W + x) * 4;
          out[o] = r / n;
          out[o + 1] = g / n;
          out[o + 2] = b / n;
          out[o + 3] = 255;
        }
      }
      cap.data = out;
    }
  };
  const grab = () =>
    new Promise((res) => {
      cap.data = null;
      cap.want = true;
      const poll = () => (cap.data ? res(cap.data) : requestAnimationFrame(poll));
      requestAnimationFrame(poll);
    });
  /** Fraction of pixels whose max channel change exceeds 12/255 (whole frame, and the lower half: the ground). */
  const diff = (a, b) => {
    if (!a || !b) return { all: 0, low: 0, far: 0 };
    let all = 0, low = 0, far = 0;
    const f0 = Math.floor(Hh * 0.38), f1 = Math.floor(Hh * 0.62);
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
        if (d > 12) {
          all++;
          if (y >= Hh / 2) low++;
          if (y >= f0 && y < f1) far++;
        }
      }
    // all: the frame; low: the lower half (the ground near the walker); far: the band about the
    // horizon (the ground and fronts at a distance, where streaming and culling show).
    return { all: +(all / (W * Hh)).toFixed(4), low: +(low / ((W * Hh) / 2)).toFixed(4), far: +(far / (W * (f1 - f0))).toFixed(4) };
  };

  // Camera pin: a system after the rig (100) that places the camera itself.
  const pin = { on: false, pos: [0, 0, 0], at: [0, 0, 0] };
  game.addSystem({
    name: 'surfPin',
    priority: 150,
    lateUpdate() {
      if (!pin.on) return;
      if (p.avatar) p.avatar.root.visible = false; // the rig shows it again in third person
      game.camera.position.set(pin.pos[0], pin.pos[1], pin.pos[2]);
      game.camera.lookAt(pin.at[0], pin.at[1], pin.at[2]);
      game.camera.updateMatrixWorld();
    },
  });

  // Monitor: visibility flips of street cells, block levels and registry entries; texture uploads,
  // programs, shadow budget. Snapshots are compared every frame while `mon.on`.
  const mon = { on: false, events: [], last: null, t0: 0, frames: 0 };
  const streamer = game.city?.streamer;
  const cellState = (c) => (c.near?.handle.visible ? 'N' : '') + (c.detail?.handle.visible ? 'D' : '') + (c.far?.visible ? 'F' : '');
  const blockState = (r) => (r.levels.full?.visible ? 'full' : r.levels.mid?.visible ? 'mid' : r.levels.low?.visible ? 'low' : r.far?.visible ? 'far' : '-');
  const camDist = (x, y, z) => Math.hypot(game.camera.position.x - x, game.camera.position.y - y, game.camera.position.z - z);
  const snapshot = () => {
    const s = { cells: streamer ? streamer.cells.map(cellState) : [], blocks: streamer ? streamer.blocks.map(blockState) : [], world: game.world.all().map((e) => e.object.visible), mid: streamer?.midShadowsOn ?? true, tex: game.renderer.info.memory.textures, progs: game.renderer.info.programs.length, terrainTextured: !!game.terrain.textures?.textured };
    return s;
  };
  game.addSystem({
    name: 'surfMon',
    priority: 160,
    lateUpdate() {
      if (!mon.on) return;
      mon.frames++;
      const t = +((performance.now() - mon.t0) / 1000).toFixed(2);
      const s = snapshot();
      const l = mon.last;
      if (l) {
        const ev = mon.events;
        if (streamer) {
          for (let i = 0; i < s.cells.length; i++)
            if (s.cells[i] !== l.cells[i]) {
              const c = streamer.cells[i];
              const cx = (c.bounds.minX + c.bounds.maxX) / 2, cz = (c.bounds.minZ + c.bounds.maxZ) / 2;
              ev.push({ t, kind: 'cell', from: l.cells[i] || '-', to: s.cells[i] || '-', d: +c.d.toFixed(0), at: [+cx.toFixed(0), +cz.toFixed(0)] });
            }
          for (let i = 0; i < s.blocks.length; i++)
            if (s.blocks[i] !== l.blocks[i]) {
              const r = streamer.blocks[i];
              ev.push({ t, kind: 'block', from: l.blocks[i], to: s.blocks[i], d: +r.d.toFixed(0), at: [+r.center.x.toFixed(0), +r.center.z.toFixed(0)] });
            }
        }
        const all = game.world.all();
        for (let i = 0; i < s.world.length && i < l.world.length; i++)
          if (s.world[i] !== l.world[i]) {
            const e = all[i];
            const c = e.sphere.center;
            ev.push({ t, kind: 'world', id: e.id, to: s.world[i] ? 'on' : 'off', d: +Math.max(0, camDist(c.x, c.y, c.z) - e.sphere.radius * (e.radiusWeight ?? 1)).toFixed(0), cull: e.cullDistance, at: [+c.x.toFixed(0), +c.z.toFixed(0)] });
          }
        if (s.mid !== l.mid) ev.push({ t, kind: 'shadows', to: s.mid ? 'mid on' : 'mid off', tris: game.stats.triangles });
        if (s.tex !== l.tex) ev.push({ t, kind: 'textures', from: l.tex, to: s.tex });
        if (s.progs !== l.progs) ev.push({ t, kind: 'programs', from: l.progs, to: s.progs });
        if (s.terrainTextured !== l.terrainTextured) ev.push({ t, kind: 'terrain', to: s.terrainTextured ? 'photos' : 'flat' });
      }
      mon.last = s;
    },
  });
  const startMon = () => {
    mon.on = true;
    mon.events = [];
    mon.last = null;
    mon.frames = 0;
    mon.t0 = performance.now();
  };
  const stopMon = () => {
    mon.on = false;
    return mon.events;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const hideUi = () => {
    document.querySelectorAll('.ui-root').forEach((e) => (e.style.visibility = 'hidden'));
    // First person: the game hides the player's own head and body (the real body's skinned meshes
    // hang off the scene, not avatar.root, so hiding the root is not enough).
    if (p.viewMode !== 'first') p.setViewMode('first');
  };
  /** Is there a collider within `dist` of `from` along `dir` (the camera inside or against a wall)? */
  const blocked = (from, dir, dist) => {
    const L = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const hit = game.physics.raycast({ x: from[0], y: from[1], z: from[2] }, { x: dir[0] / L, y: dir[1] / L, z: dir[2] / L }, dist);
    return !!hit;
  };
  const groundY = (x, z) => {
    // The walkable top at (x, z): the highest audited surface within 2.5 m over the terrain, else the terrain.
    const ty = H(x, z);
    const s = audit.surfacesAt(x, z).filter((q) => q.y >= ty - 0.1 && q.y < ty + 2.5);
    return s.length ? Math.max(ty, s[0].y) : ty;
  };

  // Which materials in the scene gained a texture or appeared (texture pop-in attribution).
  const matState = () => {
    const out = new Map();
    game.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) out.set(mm.uuid, { name: mm.name || mm.type, map: !!mm.map, ver: mm.version });
    });
    return out;
  };
  const matDiff = (a, b) => {
    const out = [];
    for (const [id, s] of b) {
      const l = a.get(id);
      if (!l) out.push({ name: s.name, change: 'new' });
      else if (l.map !== s.map) out.push({ name: s.name, change: s.map ? 'got map' : 'lost map' });
      else if (l.ver !== s.ver) out.push({ name: s.name, change: 'recompiled' });
    }
    return out;
  };

  // ---------------------------------------------------------------- settle
  async function settle(ms, lookAt) {
    hideUi();
    if (p.avatar) p.avatar.root.visible = false;
    const eye = [p.position.x, groundY(p.position.x, p.position.z) + 1.6, p.position.z];
    const dx = lookAt[0] - eye[0], dz = lookAt[1] - eye[2];
    const L = Math.max(1, Math.hypot(dx, dz));
    pin.pos = eye;
    pin.at = [eye[0] + (dx / L) * 20, eye[1] - 2.2, eye[2] + (dz / L) * 20];
    pin.on = true;
    await frames(2);
    startMon();
    const series = [];
    let prev = await grab();
    let mats = matState();
    const matEvents = [];
    const t0 = performance.now();
    let first = prev;
    while (performance.now() - t0 < ms) {
      await sleep(100);
      const cur = await grab();
      const d = diff(prev, cur);
      const t = +((performance.now() - t0) / 1000).toFixed(2);
      series.push({ t, ...d, vsFirst: diff(first, cur).all });
      if (d.all > 0.002) {
        const m2 = matState();
        for (const e of matDiff(mats, m2).slice(0, 12)) matEvents.push({ t, kind: 'material', ...e });
        mats = m2;
      }
      prev = cur;
    }
    const events = stopMon().concat(matEvents).sort((a, b) => a.t - b.t);
    pin.on = false;
    const peak = series.reduce((m, s) => (s.all > m.all ? s : m), { all: 0, low: 0, t: 0 });
    const settledAt = (() => {
      for (let i = series.length - 1; i >= 0; i--) if (series[i].all > 0.003) return series[i].t;
      return 0;
    })();
    return { series, events, peak, settledAt, eye: eye.map((v) => +v.toFixed(1)) };
  }

  // ---------------------------------------------------------------- walk
  async function walk(route, opts = {}) {
    const speed = opts.speed ?? 4.4, sampleMs = opts.sampleMs ?? 150, maxMs = opts.maxMs ?? 60000;
    hideUi();
    if (p.avatar) p.avatar.root.visible = false;
    const actorTeleport = Object.getPrototypeOf(Object.getPrototypeOf(p)).teleport;
    const pts = route.map(([x, z]) => [x, z]);
    // Start: a real teleport (primes the city as the game would on arrival).
    p.teleport({ x: pts[0][0], y: H(pts[0][0], pts[0][1]) + 0.4, z: pts[0][1] }, 0);
    await sleep(1500);
    await frames(5);
    let seg = 0, s = 0;
    let x = pts[0][0], z = pts[0][1];
    const series = [];
    const strip = [];
    let prevFrame = null;
    let look = null; // smoothed look direction (unit xz): a player turns, the camera does not snap
    let lastYaw = null;
    let lastT = performance.now();
    let lastSample = -1e9;
    const t0 = performance.now();
    pin.on = true;
    startMon();
    while (performance.now() - t0 < maxMs && seg < pts.length - 1) {
      await frames(1);
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      // Advance along the polyline.
      let step = speed * dt;
      while (step > 0 && seg < pts.length - 1) {
        const [ax, az] = pts[seg], [bx, bz] = pts[seg + 1];
        const L = Math.hypot(bx - ax, bz - az);
        const left = L - s;
        if (step < left) {
          s += step;
          step = 0;
        } else {
          step -= left;
          seg++;
          s = 0;
        }
      }
      if (seg >= pts.length - 1) break;
      const [ax, az] = pts[seg], [bx, bz] = pts[seg + 1];
      const L = Math.max(1e-3, Math.hypot(bx - ax, bz - az));
      x = ax + ((bx - ax) * s) / L;
      z = az + ((bz - az) * s) / L;
      const y = groundY(x, z);
      actorTeleport.call(p, { x, y: y + 0.05, z });
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      if (!look) look = [tx, tz];
      else {
        // Turn toward the segment at most 150°/s.
        const want = Math.atan2(tz, tx), have = Math.atan2(look[1], look[0]);
        let dA = want - have;
        while (dA > Math.PI) dA -= 2 * Math.PI;
        while (dA < -Math.PI) dA += 2 * Math.PI;
        const maxA = (150 * Math.PI / 180) * dt;
        const a = have + Math.max(-maxA, Math.min(maxA, dA));
        look = [Math.cos(a), Math.sin(a)];
      }
      const fx = look[0], fz = look[1];
      p.yaw = Math.atan2(-fx, -fz);
      pin.pos = [x, y + 1.6, z];
      pin.at = [x + fx * 30, y + 1.6 - 3.5, z + fz * 30];
      if (now - lastSample >= sampleMs) {
        lastSample = now;
        const cur = await grab();
        const d = diff(prevFrame, cur);
        const yaw = Math.atan2(fz, fx);
        let turn = lastYaw === null ? 0 : Math.abs(yaw - lastYaw);
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        lastYaw = yaw;
        const wall = blocked([x, y + 1.6, z], [fx, 0, fz], 1.5) || blocked([x, y + 1.6, z], [-fx, 0, -fz], 0.6);
        series.push({ t: +((now - t0) / 1000).toFixed(2), x: +x.toFixed(0), z: +z.toFixed(0), ...d, turn: +((turn * 180) / Math.PI).toFixed(1), wall, tris: game.stats.triangles, draws: game.stats.drawCalls, cells: streamer ? streamer.shown().cells : 0 });
        strip.push(cur);
        prevFrame = cur;
      }
    }
    const events = stopMon();
    pin.on = false;
    // Filmstrip: every sampled frame at half size, 8 per row.
    const toImage = (d) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = Hh;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d), W, Hh), 0, 0);
      return c;
    };
    const cols = 8, rows = Math.ceil(strip.length / cols), sw = W / 2, sh = Hh / 2;
    const fc = document.createElement('canvas');
    fc.width = sw * cols;
    fc.height = sh * Math.max(1, rows);
    const fctx = fc.getContext('2d');
    fctx.fillStyle = '#000';
    fctx.fillRect(0, 0, fc.width, fc.height);
    strip.forEach((d, i) => {
      fctx.drawImage(toImage(d), (i % cols) * sw, Math.floor(i / cols) * sh, sw, sh);
      fctx.fillStyle = '#ff0';
      fctx.font = '11px monospace';
      fctx.fillText(`${i} ${series[i]?.t ?? ''}s ${((series[i]?.all ?? 0) * 100).toFixed(0)}%`, (i % cols) * sw + 3, Math.floor(i / cols) * sh + 12);
    });
    // Spikes: samples whose change is well above the run's median (the camera moves at a constant speed).
    const clean = series.filter((q, i) => i > 0 && q.turn < 4 && !q.wall && !series[i - 1].wall);
    const med = (k) => {
      const v = clean.map((q) => q[k]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)] ?? 0;
    };
    const median = med('all'), medianFar = med('far');
    // (a sample taken while turning, or with the camera in a wall, changes for that reason)
    const spikes = clean.filter((q) => q.far > Math.max(0.06, medianFar * 2.2) || q.all > Math.max(0.1, median * 2)).map((q) => ({ t: q.t, x: q.x, z: q.z, all: q.all, low: q.low, far: q.far, turn: q.turn, i: series.indexOf(q) })).sort((a, b) => b.far - a.far);
    // The frames round each of the worst spikes at full capture size: i-2, i-1, i, i+1.
    const spikeStrips = {};
    for (const sp of spikes.slice(0, 4)) {
      const idx = [sp.i - 2, sp.i - 1, sp.i, sp.i + 1].filter((i) => i >= 0 && i < strip.length);
      const c = document.createElement('canvas');
      c.width = W * idx.length;
      c.height = Hh;
      const cx = c.getContext('2d');
      idx.forEach((i, k) => {
        cx.drawImage(toImage(strip[i]), k * W, 0);
        cx.fillStyle = '#ff0';
        cx.font = '12px monospace';
        cx.fillText(`${i} t=${series[i].t}s all ${(series[i].all * 100).toFixed(0)}% far ${(series[i].far * 100).toFixed(0)}% @${series[i].x},${series[i].z}`, k * W + 4, 14);
      });
      spikeStrips[sp.i] = c.toDataURL('image/png');
    }
    return { series, events, median, medianFar, clean: clean.length, spikes, spikeStrips, strip: fc.toDataURL('image/png'), frames: strip.length, end: [+x.toFixed(0), +z.toFixed(0)] };
  }

  /** Pin the camera at `pos` looking at `at` (for screenshots of a spot). */
  function look(pos, at) {
    hideUi();
    if (p.avatar) p.avatar.root.visible = false;
    pin.pos = pos;
    pin.at = at;
    pin.on = true;
  }
  function unpin() {
    pin.on = false;
  }

  window.__surf = { census, settle, walk, look, unpin, groundY, grab, snapshot, blocked };
})();
