/**
 * Parchment-style map renderer (Canvas 2D). Static terrain (hill shading, elevation tint,
 * contours) is computed once per data source; everything else is vector-drawn on each redraw, so
 * it stays crisp at any zoom. Rendering is on demand (`requestRender`), not per frame.
 */
import { toRoman } from '../../core/GameTime';
import { drawIcon, LOCATION_ICONS, UI_ICONS } from '../icons';
import { parchmentTile } from '../textures';
import type { MapDataSource, MapLabel, MapLandmark, MapLocation, MapShape } from '../types';
import { contourSegments, flatShade, heightRange, hillshade, sampleHeights } from './terrain';
import { clampView, fitScale, niceScaleBar, rotateLocal, worldToScreen, zoomAt, type MapView } from './view';

const INK = '#2e2013';
const INK_2 = '#5d4529';
const WATER = '#9db3a6';
const WATER_EDGE = '#55736d';
const LAND = '#e7d8b6';
/** Roman pace (passus) in meters. */
const PASSUS = 1.48;

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

const STYLE: Record<MapLandmark['style'], { fill: string; stroke: string }> = {
  temple: { fill: 'rgba(146, 58, 38, 0.42)', stroke: 'rgba(94, 32, 18, 0.9)' },
  public: { fill: 'rgba(132, 96, 58, 0.34)', stroke: 'rgba(80, 56, 30, 0.85)' },
  arena: { fill: 'rgba(122, 88, 56, 0.42)', stroke: 'rgba(78, 52, 28, 0.9)' },
  palace: { fill: 'rgba(104, 60, 88, 0.34)', stroke: 'rgba(70, 36, 60, 0.85)' },
  garden: { fill: 'rgba(108, 136, 72, 0.26)', stroke: 'rgba(78, 104, 52, 0.6)' },
  monument: { fill: 'rgba(70, 48, 26, 0.85)', stroke: 'rgba(46, 32, 19, 1)' },
  camp: { fill: 'rgba(96, 84, 64, 0.36)', stroke: 'rgba(62, 52, 36, 0.9)' },
  domestic: { fill: 'rgba(132, 100, 64, 0.22)', stroke: 'rgba(90, 66, 40, 0.6)' },
};

export class MapRenderer {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  view: MapView = { cx: 0, cz: 0, scale: 0.3 };
  vw = 800;
  vh = 600;
  private dpr = 1;
  private terrain: TerrainCache | null = null;
  private pattern: CanvasPattern | null = null;
  private raf = 0;
  /** Selected location id (gold ring + label). */
  selected: string | null = null;
  focusQuestId: string | null = null;
  latin = true;
  /** Screen px kept clear on the right for overlay controls (zoom buttons). */
  rightInset = 90;
  minScale = 0.05;
  maxScale = 6;
  private hitTargets: { loc: MapLocation; x: number; y: number }[] = [];

  constructor(private data: MapDataSource) {
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.className = 'map-canvas';
  }

  setData(d: MapDataSource) {
    if (d === this.data) return;
    this.data = d;
    this.terrain = null;
  }

  resize(w: number, h: number, dpr = window.devicePixelRatio || 1) {
    this.vw = Math.max(1, w);
    this.vh = Math.max(1, h);
    this.dpr = Math.min(2, dpr);
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.canvas.style.width = `${this.vw}px`;
    this.canvas.style.height = `${this.vh}px`;
    const fit = fitScale(this.data.bounds, this.vw, this.vh, 0);
    this.minScale = fit * 0.95;
    this.maxScale = Math.max(fit * 20, 3);
    this.view = clampView({ ...this.view, scale: Math.max(this.view.scale, this.minScale) }, this.data.bounds, this.vw, this.vh);
    this.requestRender();
  }

  /** Center on a world point at a given zoom (px per meter). */
  centerOn(x: number, z: number, scale = this.view.scale) {
    this.view = clampView({ cx: x, cz: z, scale: Math.min(this.maxScale, Math.max(this.minScale, scale)) }, this.data.bounds, this.vw, this.vh);
    this.requestRender();
  }

  setView(v: MapView) {
    this.view = clampView({ ...v, scale: Math.min(this.maxScale, Math.max(this.minScale, v.scale)) }, this.data.bounds, this.vw, this.vh);
    this.requestRender();
  }

  zoomBy(factor: number, sx = this.vw / 2, sy = this.vh / 2) {
    this.view = clampView(zoomAt(this.view, factor, sx, sy, this.vw, this.vh, this.minScale, this.maxScale), this.data.bounds, this.vw, this.vh);
    this.requestRender();
  }

  requestRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }

  /** Discovered location under a screen point. */
  hitTest(sx: number, sy: number): MapLocation | null {
    let best: MapLocation | null = null;
    let bestD = 18 * 18;
    for (const t of this.hitTargets) {
      const d = (t.x - sx) ** 2 + (t.y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = t.loc;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ terrain cache

  private buildTerrain(): TerrainCache | null {
    const d = this.data;
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

  // ------------------------------------------------------------------ drawing

  render() {
    const { ctx, view: v, dpr, data: d } = this;
    const s = v.scale;
    this.terrain ??= this.buildTerrain();
    const world = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.vw / 2 - v.cx * s), dpr * (this.vh / 2 - v.cz * s));
    const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const px = (n: number) => n / s; // screen px → world units

    // Paper (world-anchored grain, constant on-screen size).
    screen();
    this.pattern ??= ctx.createPattern(parchmentTile(), 'repeat');
    if (this.pattern) {
      const [ox, oy] = worldToScreen(v, this.vw, this.vh, 0, 0);
      this.pattern.setTransform(new DOMMatrix().translate(ox % 384, oy % 384));
      ctx.fillStyle = this.pattern;
    } else ctx.fillStyle = LAND;
    ctx.fillRect(0, 0, this.vw, this.vh);

    world();
    const t = this.terrain;
    if (t) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(t.tint, t.x0, t.z0, t.w, t.h);
      ctx.drawImage(t.shade, t.x0, t.z0, t.w, t.h);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(110, 76, 40, 0.22)';
      ctx.lineWidth = px(0.8);
      ctx.stroke(t.contours);
      ctx.strokeStyle = 'rgba(110, 76, 40, 0.42)';
      ctx.lineWidth = px(1.15);
      ctx.stroke(t.index);
    }

    // Gardens first (under everything built).
    for (const lm of d.landmarks) if (lm.style === 'garden') this.drawLandmark(lm, px);

    // Water.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of d.rivers) {
      const path = linePath(r.points);
      ctx.strokeStyle = WATER_EDGE;
      ctx.lineWidth = r.width + px(3);
      ctx.stroke(path);
      ctx.strokeStyle = WATER;
      ctx.lineWidth = r.width;
      ctx.stroke(path);
      // Flow lines.
      ctx.strokeStyle = 'rgba(240, 248, 240, 0.35)';
      ctx.lineWidth = px(0.9);
      ctx.setLineDash([px(10), px(14)]);
      ctx.stroke(path);
      ctx.setLineDash([]);
    }
    for (const isl of d.islands ?? []) {
      const p = shapePath(isl);
      ctx.fillStyle = LAND;
      ctx.fill(p);
      ctx.strokeStyle = WATER_EDGE;
      ctx.lineWidth = px(1.4);
      ctx.stroke(p);
    }

    // Aqueducts: a line with arch ticks.
    for (const a of d.aqueducts ?? []) {
      const p = linePath(a.points);
      ctx.strokeStyle = 'rgba(70, 50, 30, 0.75)';
      ctx.lineWidth = px(1.2);
      ctx.stroke(p);
      ctx.lineWidth = px(5);
      ctx.setLineDash([px(1.2), px(4.5)]);
      ctx.lineCap = 'butt';
      ctx.stroke(p);
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
    }

    // Roads: cased vias, thin streets.
    for (const r of d.roads) {
      if (r.rank !== 'street') continue;
      ctx.strokeStyle = 'rgba(105, 76, 46, 0.5)';
      ctx.lineWidth = px(Math.max(0.8, Math.min(2.2, 5 * s)));
      ctx.stroke(linePath(r.points));
    }
    const viaW = Math.max(2.2, Math.min(7, 9 * s));
    for (const r of d.roads) {
      if (r.rank !== 'via') continue;
      const p = linePath(r.points);
      ctx.strokeStyle = 'rgba(92, 64, 36, 0.85)';
      ctx.lineWidth = px(viaW + 1.6);
      ctx.stroke(p);
      ctx.strokeStyle = '#f0e2c0';
      ctx.lineWidth = px(viaW);
      ctx.stroke(p);
    }

    // Bridges.
    for (const b of d.bridges ?? []) {
      const p = linePath(b.points);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(60, 40, 22, 0.95)';
      ctx.lineWidth = px(Math.max(4, Math.min(9, 12 * s)) + 2);
      ctx.stroke(p);
      ctx.strokeStyle = '#efe0bd';
      ctx.lineWidth = px(Math.max(4, Math.min(9, 12 * s)) - 1);
      ctx.stroke(p);
      ctx.lineCap = 'round';
    }

    // City walls.
    for (const w of d.walls ?? []) {
      const p = linePath(w.points);
      ctx.strokeStyle = 'rgba(70, 40, 24, 0.55)';
      ctx.lineWidth = px(2.2);
      ctx.setLineDash([px(9), px(4)]);
      ctx.stroke(p);
      ctx.setLineDash([]);
    }

    // Built footprints.
    for (const lm of d.landmarks) if (lm.style !== 'garden') this.drawLandmark(lm, px);

    // ---------------------------------------------------------------- screen-space overlays
    screen();
    this.drawLabels();
    this.drawMarkers();
    this.drawScaleBar();
  }

  private drawLandmark(lm: MapLandmark, px: (n: number) => number) {
    const { ctx } = this;
    const st = STYLE[lm.style];
    for (const sh of lm.shapes) {
      const p = shapePath(sh);
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
        ctx.fill(shapePath(inner));
        ctx.stroke(shapePath(inner));
        if (sh.kind === 'stadium') {
          // The spina down the middle of a circus.
          const sp = shapePath({ kind: 'rect', x: sh.x, z: sh.z, w: sh.length * 0.62, d: Math.max(px(2), sh.width * 0.06), rot: sh.rot ?? 0 });
          ctx.fillStyle = st.stroke;
          ctx.fill(sp);
        }
      }
    }
  }

  private drawLabels() {
    const { ctx, view: v, data: d } = this;
    const s = v.scale;
    type Box = [number, number, number, number];
    const placed: Box[] = [];
    // Pins, quest markers and the player arrow are obstacles labels must avoid.
    const obstacles: Box[] = [];
    const pin = (x: number, z: number, r: number, up = 0) => {
      const [sx, sy] = worldToScreen(v, this.vw, this.vh, x, z);
      obstacles.push([sx - r, sy - r - up, sx + r, sy + r]);
    };
    for (const l of d.locations()) if (l.discovered) pin(l.x, l.z, 12);
    for (const q of d.questMarkers()) pin(q.x, q.z, 11, 22);
    const pl = d.player();
    if (pl) pin(pl.x, pl.z, 14);
    const hits = (b: Box, list: Box[]) => list.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const free = (x0: number, y0: number, x1: number, y1: number) => {
      const b: Box = [x0, y0, x1, y1];
      if (hits(b, placed) || hits(b, obstacles)) return false;
      placed.push(b);
      return true;
    };
    const halo = (text: string, x: number, y: number, color: string, haloColor = 'rgba(236, 222, 190, 0.9)', width = 3) => {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = haloColor;
      ctx.lineWidth = width;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelSize = (kind: MapLabel['kind']) => {
      const base = kind === 'region' ? 26 : kind === 'hill' ? 16 : kind === 'water' ? 17 : 13;
      return Math.max(10, Math.min(base * 1.6, base * Math.sqrt(s / 0.35)));
    };
    const onScreen = (x: number, y: number, m = 200) => x > -m && y > -60 && x < this.vw + m && y < this.vh + 60;

    // 1. District names and the river: large and faint, a background layer that never collides.
    for (const l of d.labels) {
      if (l.kind !== 'region' && l.kind !== 'water') continue;
      const [x, y] = worldToScreen(v, this.vw, this.vh, l.x, l.z);
      if (!onScreen(x, y)) continue;
      const size = labelSize(l.kind);
      ctx.save();
      ctx.translate(x, y);
      if (l.angle) ctx.rotate((l.angle * Math.PI) / 180);
      if (l.kind === 'water') {
        ctx.font = `italic 500 ${size}px 'EB Garamond', serif`;
        spacedText(ctx, l.text, 0, 0, size * 0.24, 'rgba(46, 80, 78, 0.92)', 'rgba(170, 196, 186, 0.7)', 2.5);
      } else {
        ctx.font = `600 ${size}px Cinzel, serif`;
        spacedText(ctx, l.text, 0, 0, size * 0.42, 'rgba(84, 52, 26, 0.38)', 'rgba(236, 222, 190, 0.35)', 2);
      }
      ctx.restore();
    }

    // 2. Landmark names, biggest first, never overlapping each other or a pin: each tries its center,
    //    then just below, then just above.
    const sized = d.landmarks
      .filter((lm) => lm.style !== 'garden')
      .map((lm) => ({ lm, area: lm.shapes.reduce((a, sh) => a + shapeArea(sh), 0) }))
      .sort((a, b) => b.area - a.area);
    for (const { lm, area } of sized) {
      if (lm.labelMinZoom && s < lm.labelMinZoom) continue;
      // Only label things that are reasonably large on screen (or when zoomed in).
      if (Math.sqrt(area) * s < 22 && s < 1.2 && lm.style !== 'monument') continue;
      const c = lm.labelAt ?? shapeCenter(lm.shapes[0]);
      const [x, cy] = worldToScreen(v, this.vw, this.vh, c.x, c.z);
      if (!onScreen(x, cy, 100)) continue;
      const size = Math.max(10.5, Math.min(15, 10 + Math.sqrt(area) * s * 0.03));
      ctx.font = `600 ${size}px Cinzel, serif`;
      const text = lm.name.toUpperCase();
      const w = ctx.measureText(text).width + text.length * size * 0.06;
      const showLatin = this.latin && !!lm.latin && lm.latin !== lm.name;
      const hgt = showLatin ? size * 2.2 : size * 1.2;
      const shift = 14 + size * 0.8;
      const y = [cy, cy + shift, cy - shift - (showLatin ? size : 0)].find((yy) => free(x - w / 2 - 3, yy - size * 0.7, x + w / 2 + 3, yy - size * 0.7 + hgt));
      if (y === undefined) continue;
      spacedText(ctx, text, x, y, size * 0.06, INK, 'rgba(236, 222, 190, 0.92)', 3);
      if (showLatin) {
        ctx.font = `italic 500 ${size * 0.98}px 'EB Garamond', serif`;
        halo(lm.latin!, x, y + size * 1.05, INK_2);
      }
    }

    // 3. Hills and gardens fill the gaps that are left.
    for (const l of d.labels) {
      if (l.kind !== 'hill' && l.kind !== 'garden') continue;
      const [x, y] = worldToScreen(v, this.vw, this.vh, l.x, l.z);
      if (!onScreen(x, y)) continue;
      const size = labelSize(l.kind);
      const hill = l.kind === 'hill';
      ctx.font = hill ? `500 ${size}px Cinzel, serif` : `italic 500 ${size}px 'EB Garamond', serif`;
      const w = ctx.measureText(l.text).width + l.text.length * size * (hill ? 0.24 : 0.05);
      const withLatin = hill && !!l.latin && this.latin;
      // Rotated labels get a generous square box.
      const bw = l.angle ? Math.max(w, size * 3) * 0.75 : w;
      const bh = l.angle ? Math.max(w * 0.7, size * 2) : size * (withLatin ? 2.1 : 1.2);
      if (!free(x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2)) continue;
      ctx.save();
      ctx.translate(x, y);
      if (l.angle) ctx.rotate((l.angle * Math.PI) / 180);
      if (hill) {
        spacedText(ctx, l.text, 0, 0, size * 0.24, 'rgba(92, 58, 28, 0.66)', 'rgba(236, 222, 190, 0.45)', 2);
        if (withLatin) {
          ctx.font = `italic ${Math.round(size * 0.72)}px 'EB Garamond', serif`;
          halo(l.latin!, 0, size * 0.95, 'rgba(92, 58, 28, 0.65)', 'rgba(236, 222, 190, 0.45)', 2);
        }
      } else spacedText(ctx, l.text, 0, 0, size * 0.05, 'rgba(66, 88, 40, 0.92)', 'rgba(236, 222, 190, 0.7)', 2.5);
      ctx.restore();
    }
  }

  private drawMarkers() {
    const { ctx, view: v, data: d } = this;
    this.hitTargets = [];
    // Discovered locations.
    for (const loc of d.locations()) {
      if (!loc.discovered) continue;
      const [x, y] = worldToScreen(v, this.vw, this.vh, loc.x, loc.z);
      if (x < -20 || y < -20 || x > this.vw + 20 || y > this.vh + 20) continue;
      this.hitTargets.push({ loc, x, y });
      const sel = loc.id === this.selected;
      const r = sel ? 13 : 11;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = sel ? '#2e2013' : 'rgba(244, 234, 210, 0.95)';
      ctx.fill();
      ctx.lineWidth = sel ? 2.5 : 1.3;
      ctx.strokeStyle = sel ? '#e6c67e' : 'rgba(46, 32, 19, 0.9)';
      ctx.stroke();
      ctx.fillStyle = sel ? '#e6c67e' : '#2e2013';
      ctx.strokeStyle = ctx.fillStyle;
      drawIcon(ctx, LOCATION_ICONS[loc.icon], x, y, sel ? 17 : 15);
      if (sel) {
        ctx.font = `700 13px Cinzel, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = loc.name.toUpperCase();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(244, 234, 210, 0.95)';
        ctx.strokeText(text, x, y - 24);
        ctx.fillStyle = '#7d1f1a';
        ctx.fillText(text, x, y - 24);
      }
    }
    // Quest markers.
    for (const q of d.questMarkers()) {
      const [x, y] = worldToScreen(v, this.vw, this.vh, q.x, q.z);
      const hot = q.questId === this.focusQuestId || q.tracked;
      const r = hot ? 8 : 6.5;
      // A map pin: a round head on a point, gold with a dark rim; tracked quests are larger.
      ctx.save();
      ctx.shadowColor = 'rgba(40, 24, 10, 0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.beginPath();
      const hy = y - r * 2.3;
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - r * 0.35, y - r * 0.9, x - r, hy + r * 0.6, x - r, hy);
      ctx.arc(x, hy, r, Math.PI, 0);
      ctx.bezierCurveTo(x + r, hy + r * 0.6, x + r * 0.35, y - r * 0.9, x, y);
      ctx.fillStyle = hot ? '#e2b44a' : '#cfa863';
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#3a2412';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, hy, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = hot ? '#8f1f16' : '#3a2412';
      ctx.fill();
      if (hot) {
        ctx.font = `italic 600 14px 'EB Garamond', serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(244, 234, 210, 0.95)';
        ctx.strokeText(q.label, x, hy - r - 4);
        ctx.fillStyle = '#5a1712';
        ctx.fillText(q.label, x, hy - r - 4);
      }
    }
    // Player arrow.
    const pl = d.player();
    if (pl) {
      const [x, y] = worldToScreen(v, this.vw, this.vh, pl.x, pl.z);
      ctx.save();
      const g = ctx.createRadialGradient(x, y, 2, x, y, 26);
      g.addColorStop(0, 'rgba(168, 53, 44, 0.35)');
      g.addColorStop(1, 'rgba(168, 53, 44, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(x, y);
      ctx.rotate((pl.bearing * Math.PI) / 180);
      ctx.fillStyle = '#f6ecd6';
      drawIcon(ctx, UI_ICONS.playerArrow, 0, 0, 30);
      ctx.fillStyle = '#9c2a20';
      drawIcon(ctx, UI_ICONS.playerArrow, 0, 0, 22);
      ctx.restore();
    }
  }

  private drawScaleBar() {
    const { ctx } = this;
    const bar = niceScaleBar(this.view.scale, 110, PASSUS);
    // Bottom right, left of the zoom buttons (the legend owns the bottom left).
    const x = this.vw - this.rightInset - bar.px;
    const y = this.vh - 30;
    ctx.save();
    // Parchment backing so the bar reads over contours and roads.
    ctx.fillStyle = 'rgba(240, 228, 200, 0.82)';
    ctx.strokeStyle = 'rgba(60, 36, 14, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 52, y - 40, bar.px + 64, 60, 3);
    ctx.fill();
    ctx.stroke();
    // North arrow: a split lozenge with N above.
    const nx = x - 34;
    const ny = y - 12;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(nx, ny - 14);
    ctx.lineTo(nx + 6, ny + 4);
    ctx.lineTo(nx, ny);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9c2a20';
    ctx.beginPath();
    ctx.moveTo(nx, ny - 14);
    ctx.lineTo(nx - 6, ny + 4);
    ctx.lineTo(nx, ny);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 12px Cinzel, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = INK;
    ctx.fillText('N', nx, ny - 15);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y);
    ctx.lineTo(x + bar.px, y);
    ctx.lineTo(x + bar.px, y - 5);
    ctx.stroke();
    // Alternating segments.
    for (let i = 0; i < 4; i++) if (i % 2 === 0) ctx.fillRect(x + (bar.px / 4) * i, y - 3, bar.px / 4, 3);
    ctx.font = `600 12px Cinzel, serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${formatPaces(bar.length)} passus`, x, y - 8);
    ctx.font = `italic 12px 'EB Garamond', serif`;
    ctx.fillStyle = INK_2;
    ctx.textBaseline = 'top';
    ctx.fillText(`≈ ${Math.round(bar.length * PASSUS)} m`, x, y + 4);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ geometry helpers

function linePath(points: [number, number][]): Path2D {
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

function shapeCenter(sh: MapShape): { x: number; z: number } {
  if (sh.kind === 'poly') {
    let x = 0;
    let z = 0;
    for (const [px, pz] of sh.points) {
      x += px;
      z += pz;
    }
    return { x: x / sh.points.length, z: z / sh.points.length };
  }
  return { x: sh.x, z: sh.z };
}

function shapeArea(sh: MapShape): number {
  switch (sh.kind) {
    case 'rect': return sh.w * sh.d;
    case 'ellipse': return Math.PI * sh.rx * sh.rz;
    case 'stadium': return sh.length * sh.width;
    case 'halfDisc': return (Math.PI * sh.r * sh.r) / 2;
    case 'poly': {
      let a = 0;
      for (let i = 0; i < sh.points.length; i++) {
        const [x0, z0] = sh.points[i];
        const [x1, z1] = sh.points[(i + 1) % sh.points.length];
        a += x0 * z1 - x1 * z0;
      }
      return Math.abs(a) / 2;
    }
  }
}

/**
 * Draw text with extra letter spacing centered on (x, y): halo strokes for every glyph first, then
 * the fills, so one glyph's halo never eats into its neighbor.
 */
function spacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, fill: string, halo: string, haloWidth: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = halo;
  ctx.lineWidth = haloWidth;
  ctx.fillStyle = fill;
  for (const pass of [0, 1]) {
    let cx = x - total / 2;
    chars.forEach((c, i) => {
      if (pass === 0) ctx.strokeText(c, cx, y);
      else ctx.fillText(c, cx, y);
      cx += widths[i] + spacing;
    });
  }
  ctx.textAlign = align;
}

/** Scale-bar lengths are 1/2/5×10ⁿ paces, which read nicely as numerals: C, CC, D, M. */
function formatPaces(n: number): string {
  return Number.isInteger(n) && n >= 1 && n < 4000 ? toRoman(n) : String(n);
}
