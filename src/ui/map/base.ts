/**
 * The map's static layers, shared by the big map (MapRenderer) and the minimap's tiles: paper,
 * terrain (hill shading, tint, contours), water, the city's blocks and streets, aqueducts, roads,
 * bridges, walls and landmark footprints. No labels, markers or scale bar: those are overlays.
 *
 * Everything vector is turned into Path2D once per data object and kept (WeakMaps), with a plan
 * box per path, so a redraw (or a 128 m minimap tile) only strokes and fills what it can see. The
 * city fabric (1,800 blocks, 1,800 streets) is bucketed into 160 m squares for the same reason.
 */
import { parchmentTile } from '../textures';
import type { MapDataSource, MapFabric, MapLandmark, MapLine, MapShape } from '../types';
import { contourSegments, flatShade, heightRange, hillshade, sampleHeights } from './terrain';
import type { MapView } from './view';
import { rotateLocal } from './view';

export const INK = '#2e2013';
export const INK_2 = '#5d4529';
const WATER = '#9db3a6';
const WATER_EDGE = '#55736d';
export const LAND = '#e7d8b6';

/** A path with its plan box (game m). */
interface Boxed {
  path: Path2D;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

interface TerrainCache {
  shade: HTMLCanvasElement;
  tint: HTMLCanvasElement;
  x0: number;
  z0: number;
  w: number;
  h: number;
  contours: Path2D;
  index: Path2D;
}

/** Terrain per map source: building it samples ~160k heights (a ~200 ms stall), so do it once. */
const TERRAIN = new WeakMap<MapDataSource, TerrainCache | null>();

export function terrainFor(d: MapDataSource): TerrainCache | null {
  let t = TERRAIN.get(d);
  if (t === undefined) {
    t = buildTerrain(d);
    TERRAIN.set(d, t);
  }
  return t;
}

function buildTerrain(d: MapDataSource): TerrainCache | null {
  if (!d.heightAt) return null;
  const b = d.bounds;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const cell = span / 420;
  const gw = Math.ceil((b.maxX - b.minX) / cell) + 1;
  const gh = Math.ceil((b.maxZ - b.minZ) / cell) + 1;
  const grid = sampleHeights(d.heightAt.bind(d), b.minX, b.minZ, gw, gh, cell);
  const [lo, hi] = heightRange(grid);
  const shade = hillshade(grid, 315, 38, 2.4);
  const flat = flatShade(38);

  const shadeC = document.createElement('canvas');
  shadeC.width = gw;
  shadeC.height = gh;
  const tintC = document.createElement('canvas');
  tintC.width = gw;
  tintC.height = gh;
  const si = shadeC.getContext('2d')!.createImageData(gw, gh);
  const ti = tintC.getContext('2d')!.createImageData(gw, gh);
  for (let i = 0; i < gw * gh; i++) {
    const s = shade[i] - flat;
    const o = i * 4;
    if (s < 0) {
      si.data[o] = 74; si.data[o + 1] = 48; si.data[o + 2] = 24;
      si.data[o + 3] = Math.min(150, -s * 420);
    } else {
      si.data[o] = 255; si.data[o + 1] = 250; si.data[o + 2] = 232;
      si.data[o + 3] = Math.min(110, s * 300);
    }
    const t = hi > lo ? (grid.data[i] - lo) / (hi - lo) : 0;
    ti.data[o] = 176; ti.data[o + 1] = 128; ti.data[o + 2] = 64;
    ti.data[o + 3] = Math.max(0, t - 0.12) * 95;
  }
  shadeC.getContext('2d')!.putImageData(si, 0, 0);
  tintC.getContext('2d')!.putImageData(ti, 0, 0);

  const interval = d.contourInterval ?? 3;
  const contours = new Path2D();
  const index = new Path2D();
  for (let lv = Math.ceil(lo / interval) * interval; lv < hi; lv += interval) {
    const segs = contourSegments(grid, lv);
    const isIndex = Math.round(lv / interval) % 5 === 0;
    const p = isIndex ? index : contours;
    for (let k = 0; k < segs.length; k += 4) {
      p.moveTo(segs[k], segs[k + 1]);
      p.lineTo(segs[k + 2], segs[k + 3]);
    }
  }
  return { shade: shadeC, tint: tintC, x0: b.minX - cell / 2, z0: b.minZ - cell / 2, w: gw * cell, h: gh * cell, contours, index };
}

export const STYLE: Record<MapLandmark['style'], { fill: string; stroke: string }> = {
  temple: { fill: 'rgba(146, 58, 38, 0.42)', stroke: 'rgba(94, 32, 18, 0.9)' },
  public: { fill: 'rgba(132, 96, 58, 0.34)', stroke: 'rgba(80, 56, 30, 0.85)' },
  arena: { fill: 'rgba(122, 88, 56, 0.42)', stroke: 'rgba(78, 52, 28, 0.9)' },
  palace: { fill: 'rgba(104, 60, 88, 0.34)', stroke: 'rgba(70, 36, 60, 0.85)' },
  garden: { fill: 'rgba(108, 136, 72, 0.26)', stroke: 'rgba(78, 104, 52, 0.6)' },
  monument: { fill: 'rgba(70, 48, 26, 0.85)', stroke: 'rgba(46, 32, 19, 1)' },
  camp: { fill: 'rgba(96, 84, 64, 0.36)', stroke: 'rgba(62, 52, 36, 0.9)' },
  domestic: { fill: 'rgba(132, 100, 64, 0.22)', stroke: 'rgba(90, 66, 40, 0.6)' },
};

// ------------------------------------------------------------------ cached paths

const LINES = new WeakMap<MapLine, Boxed>();
const SHAPES = new WeakMap<MapShape, Boxed>();

function boxedLine(l: MapLine): Boxed {
  let b = LINES.get(l);
  if (!b) {
    b = boxPoints(linePath(l.points), l.points);
    LINES.set(l, b);
  }
  return b;
}

function boxedShape(sh: MapShape): Boxed {
  let b = SHAPES.get(sh);
  if (!b) {
    const path = shapePath(sh);
    if (sh.kind === 'poly') b = boxPoints(path, sh.points);
    else {
      const r = sh.kind === 'rect' ? Math.hypot(sh.w, sh.d) / 2 : sh.kind === 'ellipse' ? Math.max(sh.rx, sh.rz) : sh.kind === 'stadium' ? sh.length / 2 : sh.r;
      b = { path, x0: sh.x - r, z0: sh.z - r, x1: sh.x + r, z1: sh.z + r };
    }
    SHAPES.set(sh, b);
  }
  return b;
}

function boxPoints(path: Path2D, pts: readonly (readonly [number, number])[]): Boxed {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { path, x0, z0, x1, z1 };
}

/** The visible plan rectangle (game m), grown by `pad` m. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const sees = (r: Rect, b: Boxed, pad = 0) => b.x1 + pad >= r.x0 && b.x0 - pad <= r.x1 && b.z1 + pad >= r.z0 && b.z0 - pad <= r.z1;

// ------------------------------------------------------------------ the city fabric

const BUCKET = 160;

interface FabricBucket {
  box: Boxed;
  blocks: Path2D;
  gardens: Path2D;
  plazas: Path2D;
  /** Streets by width class (m, rounded up to 0.5). */
  streets: Map<number, Path2D>;
}

const FABRIC = new WeakMap<MapFabric, FabricBucket[]>();

function fabricBuckets(f: MapFabric): FabricBucket[] {
  let out = FABRIC.get(f);
  if (out) return out;
  const map = new Map<number, FabricBucket>();
  const bucket = (x: number, z: number): FabricBucket => {
    const k = (Math.floor(x / BUCKET) + 512) * 1024 + (Math.floor(z / BUCKET) + 512);
    let b = map.get(k);
    if (!b) map.set(k, (b = { box: { path: new Path2D(), x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity }, blocks: new Path2D(), gardens: new Path2D(), plazas: new Path2D(), streets: new Map() }));
    return b;
  };
  const grow = (b: FabricBucket, pts: Float32Array, pad: number) => {
    for (let i = 0; i < pts.length; i += 2) {
      b.box.x0 = Math.min(b.box.x0, pts[i] - pad);
      b.box.x1 = Math.max(b.box.x1, pts[i] + pad);
      b.box.z0 = Math.min(b.box.z0, pts[i + 1] - pad);
      b.box.z1 = Math.max(b.box.z1, pts[i + 1] + pad);
    }
  };
  const trace = (p: Path2D, pts: Float32Array, close: boolean) => {
    for (let i = 0; i < pts.length; i += 2) (i ? p.lineTo(pts[i], pts[i + 1]) : p.moveTo(pts[i], pts[i + 1]));
    if (close) p.closePath();
  };
  const mid = (pts: Float32Array): [number, number] => {
    const i = (pts.length >> 2) << 1;
    return [pts[i], pts[i + 1]];
  };
  for (const s of f.streets) {
    if (s.pts.length < 4) continue;
    const b = bucket(...mid(s.pts));
    const w = Math.ceil(s.width * 2) / 2;
    let p = b.streets.get(w);
    if (!p) b.streets.set(w, (p = new Path2D()));
    trace(p, s.pts, false);
    grow(b, s.pts, s.width / 2);
  }
  for (const pl of f.plazas) {
    if (pl.pts.length < 6) continue;
    const b = bucket(...mid(pl.pts));
    trace(b.plazas, pl.pts, true);
    grow(b, pl.pts, 0);
  }
  for (const bl of f.blocks) {
    if (bl.pts.length < 6) continue;
    const b = bucket(...mid(bl.pts));
    trace(bl.garden ? b.gardens : b.blocks, bl.pts, true);
    grow(b, bl.pts, 0);
  }
  out = [...map.values()];
  FABRIC.set(f, out);
  return out;
}

/** Colours of the fabric layer (the big map is light; the minimap wants more contrast). */
export interface FabricStyle {
  street: string;
  streetEdge: string;
  plaza: string;
  block: string;
  blockEdge: string;
  garden: string;
}

export const FABRIC_MAP: FabricStyle = {
  street: 'rgba(244, 234, 210, 0.9)',
  streetEdge: 'rgba(120, 90, 56, 0.35)',
  plaza: 'rgba(240, 228, 198, 0.85)',
  block: 'rgba(150, 112, 70, 0.30)',
  blockEdge: 'rgba(96, 68, 40, 0.45)',
  garden: 'rgba(120, 146, 82, 0.22)',
};

function drawFabric(ctx: CanvasRenderingContext2D, f: MapFabric, r: Rect, px: (n: number) => number, st: FabricStyle, alpha: number) {
  const visible = fabricBuckets(f).filter((b) => sees(r, b.box));
  if (!visible.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Street casings, then the surfaces, so crossings merge.
  for (const pass of [0, 1]) {
    for (const b of visible) {
      for (const [w, p] of b.streets) {
        ctx.strokeStyle = pass ? st.street : st.streetEdge;
        ctx.lineWidth = pass ? w : w + px(1.4);
        ctx.stroke(p);
      }
    }
  }
  ctx.fillStyle = st.plaza;
  for (const b of visible) ctx.fill(b.plazas);
  ctx.fillStyle = st.garden;
  for (const b of visible) ctx.fill(b.gardens);
  ctx.fillStyle = st.block;
  ctx.strokeStyle = st.blockEdge;
  ctx.lineWidth = px(0.8);
  for (const b of visible) {
    ctx.fill(b.blocks);
    ctx.stroke(b.blocks);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ the base

export interface BaseOptions {
  /** Parchment grain (else a flat land colour). */
  paper: boolean;
  /** Atlas road lines: all, only the vias, or none (the fabric shows the real streets). */
  roads: 'all' | 'vias' | 'none';
  /** The city fabric's opacity (0 = off). */
  fabric: number;
  fabricStyle?: FabricStyle;
  /** Contour lines (busy on a small map). */
  contours: boolean;
}

const PATTERNS = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();

/**
 * Draw the static map for a view (`v.scale` in CSS px per game m) on a vw×vh CSS px area at `dpr`.
 * Leaves the transform at screen px (dpr applied).
 */
export function drawMapBase(ctx: CanvasRenderingContext2D, d: MapDataSource, v: MapView, vw: number, vh: number, dpr: number, o: BaseOptions) {
  const s = v.scale;
  const world = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (vw / 2 - v.cx * s), dpr * (vh / 2 - v.cz * s));
  const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const px = (n: number) => n / s; // screen px → world units
  const r: Rect = { x0: v.cx - vw / 2 / s, x1: v.cx + vw / 2 / s, z0: v.cz - vh / 2 / s, z1: v.cz + vh / 2 / s };

  // Paper (world-anchored grain, constant on-screen size).
  screen();
  let pattern = PATTERNS.get(ctx);
  if (o.paper && pattern === undefined) {
    pattern = ctx.createPattern(parchmentTile(), 'repeat');
    PATTERNS.set(ctx, pattern);
  }
  if (o.paper && pattern) {
    const ox = (0 - v.cx) * s + vw / 2;
    const oy = (0 - v.cz) * s + vh / 2;
    pattern.setTransform(new DOMMatrix().translate(ox % 384, oy % 384));
    ctx.fillStyle = pattern;
  } else ctx.fillStyle = LAND;
  ctx.fillRect(0, 0, vw, vh);

  world();
  const t = terrainFor(d);
  if (t) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(t.tint, t.x0, t.z0, t.w, t.h);
    ctx.drawImage(t.shade, t.x0, t.z0, t.w, t.h);
    if (o.contours) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(110, 76, 40, 0.22)';
      ctx.lineWidth = px(0.8);
      ctx.stroke(t.contours);
      ctx.strokeStyle = 'rgba(110, 76, 40, 0.42)';
      ctx.lineWidth = px(1.15);
      ctx.stroke(t.index);
    }
  }

  // Gardens first (under everything built).
  for (const lm of d.landmarks) if (lm.style === 'garden') drawLandmark(ctx, lm, px, r);

  // Water.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const rv of d.rivers) {
    const b = boxedLine(rv);
    if (!sees(r, b, rv.width)) continue;
    ctx.strokeStyle = WATER_EDGE;
    ctx.lineWidth = rv.width + px(3);
    ctx.stroke(b.path);
    ctx.strokeStyle = WATER;
    ctx.lineWidth = rv.width;
    ctx.stroke(b.path);
    // Flow lines.
    ctx.strokeStyle = 'rgba(240, 248, 240, 0.35)';
    ctx.lineWidth = px(0.9);
    ctx.setLineDash([px(10), px(14)]);
    ctx.stroke(b.path);
    ctx.setLineDash([]);
  }
  for (const isl of d.islands ?? []) {
    const b = boxedShape(isl);
    if (!sees(r, b)) continue;
    ctx.fillStyle = LAND;
    ctx.fill(b.path);
    ctx.strokeStyle = WATER_EDGE;
    ctx.lineWidth = px(1.4);
    ctx.stroke(b.path);
  }

  // The city's streets and squares (zoomed in), under the monuments.
  const fabric = o.fabric > 0.01 ? (d.fabric?.() ?? null) : null;
  if (fabric) drawFabric(ctx, fabric, r, px, o.fabricStyle ?? FABRIC_MAP, o.fabric);

  // Aqueducts: a line with arch ticks.
  for (const a of d.aqueducts ?? []) {
    const b = boxedLine(a);
    if (!sees(r, b, 10)) continue;
    ctx.strokeStyle = 'rgba(70, 50, 30, 0.75)';
    ctx.lineWidth = px(1.2);
    ctx.stroke(b.path);
    ctx.lineWidth = px(5);
    ctx.setLineDash([px(1.2), px(4.5)]);
    ctx.lineCap = 'butt';
    ctx.stroke(b.path);
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  }

  // Roads: cased vias, thin streets.
  if (o.roads === 'all') {
    for (const rd of d.roads) {
      if (rd.rank !== 'street') continue;
      const b = boxedLine(rd);
      if (!sees(r, b, 10)) continue;
      ctx.strokeStyle = 'rgba(105, 76, 46, 0.5)';
      ctx.lineWidth = px(Math.max(0.8, Math.min(2.2, 5 * s)));
      ctx.stroke(b.path);
    }
  }
  if (o.roads !== 'none') {
    const viaW = Math.max(2.2, Math.min(7, 9 * s));
    for (const rd of d.roads) {
      if (rd.rank !== 'via') continue;
      const b = boxedLine(rd);
      if (!sees(r, b, 10)) continue;
      ctx.strokeStyle = 'rgba(92, 64, 36, 0.85)';
      ctx.lineWidth = px(viaW + 1.6);
      ctx.stroke(b.path);
      ctx.strokeStyle = '#f0e2c0';
      ctx.lineWidth = px(viaW);
      ctx.stroke(b.path);
    }
  }

  // Bridges.
  for (const br of d.bridges ?? []) {
    const b = boxedLine(br);
    if (!sees(r, b, 10)) continue;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(60, 40, 22, 0.95)';
    ctx.lineWidth = px(Math.max(4, Math.min(9, 12 * s)) + 2);
    ctx.stroke(b.path);
    ctx.strokeStyle = '#efe0bd';
    ctx.lineWidth = px(Math.max(4, Math.min(9, 12 * s)) - 1);
    ctx.stroke(b.path);
    ctx.lineCap = 'round';
  }

  // City walls.
  for (const w of d.walls ?? []) {
    const b = boxedLine(w);
    if (!sees(r, b, 10)) continue;
    ctx.strokeStyle = 'rgba(70, 40, 24, 0.55)';
    ctx.lineWidth = px(2.2);
    ctx.setLineDash([px(9), px(4)]);
    ctx.stroke(b.path);
    ctx.setLineDash([]);
  }

  // Built footprints.
  for (const lm of d.landmarks) if (lm.style !== 'garden') drawLandmark(ctx, lm, px, r);
  screen();
}

function drawLandmark(ctx: CanvasRenderingContext2D, lm: MapLandmark, px: (n: number) => number, r: Rect) {
  const st = STYLE[lm.style];
  for (const sh of lm.shapes) {
    const b = boxedShape(sh);
    if (!sees(r, b)) continue;
    const p = b.path;
    ctx.fillStyle = st.fill;
    ctx.fill(p, 'evenodd');
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = px(lm.style === 'garden' ? 0.8 : 1);
    if (lm.style === 'garden') ctx.setLineDash([px(3), px(3)]);
    ctx.stroke(p);
    ctx.setLineDash([]);
    // Arenas and circuses get a pale floor.
    if (lm.style === 'arena' && (sh.kind === 'ellipse' || sh.kind === 'stadium')) {
      const inner: MapShape = sh.kind === 'ellipse' ? { ...sh, rx: sh.rx * 0.45, rz: sh.rz * 0.4 } : { ...sh, length: sh.length * 0.88, width: sh.width * 0.62 };
      ctx.fillStyle = 'rgba(236, 220, 184, 0.9)';
      const ip = shapePath(inner);
      ctx.fill(ip);
      ctx.stroke(ip);
      if (sh.kind === 'stadium') {
        // The spina down the middle of a circus.
        const sp = shapePath({ kind: 'rect', x: sh.x, z: sh.z, w: sh.length * 0.62, d: Math.max(px(2), sh.width * 0.06), rot: sh.rot ?? 0 });
        ctx.fillStyle = st.stroke;
        ctx.fill(sp);
      }
    }
  }
}

// ------------------------------------------------------------------ geometry helpers

export function linePath(points: readonly (readonly [number, number])[]): Path2D {
  const p = new Path2D();
  points.forEach(([x, z], i) => (i ? p.lineTo(x, z) : p.moveTo(x, z)));
  return p;
}

export function shapePath(sh: MapShape): Path2D {
  const p = new Path2D();
  const poly = (pts: [number, number][]) => {
    pts.forEach(([x, z], i) => (i ? p.lineTo(x, z) : p.moveTo(x, z)));
    p.closePath();
  };
  const rot = (sh as { rot?: number }).rot ?? 0;
  const local = (cx: number, cz: number, pts: [number, number][]) =>
    pts.map(([lx, lz]) => {
      const [rx, rz] = rotateLocal(lx, lz, rot);
      return [cx + rx, cz + rz] as [number, number];
    });
  switch (sh.kind) {
    case 'rect': {
      const w = sh.w / 2;
      const d = sh.d / 2;
      poly(local(sh.x, sh.z, [[-w, -d], [w, -d], [w, d], [-w, d]]));
      break;
    }
    case 'ellipse': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push([Math.cos(a) * sh.rx, Math.sin(a) * sh.rz]);
      }
      poly(local(sh.x, sh.z, pts));
      break;
    }
    case 'stadium': {
      const r = sh.width / 2;
      const half = sh.length / 2 - r;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 16; i++) {
        const a = -Math.PI / 2 + (i / 16) * Math.PI;
        pts.push([half + Math.cos(a) * r, Math.sin(a) * r]);
      }
      // The carceres end of a circus is straight.
      pts.push([-half - r, r], [-half - r, -r]);
      poly(local(sh.x, sh.z, pts));
      break;
    }
    case 'halfDisc': {
      // Flat side (scaena) faces local −z, i.e. the bearing `rot`; the curved cavea is behind.
      const pts: [number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI;
        pts.push([Math.cos(a) * sh.r, Math.sin(a) * sh.r]);
      }
      poly(local(sh.x, sh.z, pts));
      break;
    }
    case 'poly':
      poly(sh.points);
      break;
  }
  return p;
}
