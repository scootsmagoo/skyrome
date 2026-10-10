/**
 * Parchment-style map renderer (Canvas 2D). The static layers (base.ts: terrain computed once per
 * data source, water, the city's blocks and streets, roads, footprints) are shared with the
 * minimap; this adds the quest route, labels, pins, the player and the scale bar. Everything is
 * vector-drawn on each redraw, so it stays crisp at any zoom. Rendering is on demand
 * (`requestRender`), not per frame.
 */
import { toRoman } from '../../core/GameTime';
import { drawIcon, LOCATION_ICONS, UI_ICONS } from '../icons';
import type { MapDataSource, MapLabel, MapLocation, MapShape } from '../types';
import { INK, INK_2, drawMapBase, terrainFor } from './base';
import { drawRoute } from './route';
import { clampView, fitScale, niceScaleBar, worldToScreen, zoomAt, type MapView } from './view';

/** Roman pace (passus) in meters. */
const PASSUS = 1.48;

/** Build a source's terrain ahead of time (UIManager does it behind the title/loading screen). */
export function prewarmMapTerrain(d: MapDataSource) {
  terrainFor(d);
}

/** The city's own blocks and streets fade in between these zooms (px per game m). */
const FABRIC_FROM = 0.42;
const FABRIC_FULL = 0.75;

export class MapRenderer {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  view: MapView = { cx: 0, cz: 0, scale: 0.3 };
  vw = 800;
  vh = 600;
  private dpr = 1;
  private raf = 0;
  /** Selected location id (gold ring + label). */
  selected: string | null = null;
  focusQuestId: string | null = null;
  latin = true;
  /** Draw the quest route (Settings → Interface → Route on the maps). */
  showRoute = true;
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
    this.requestRender();
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

  // ------------------------------------------------------------------ drawing

  render() {
    const { ctx, view: v, dpr, data: d } = this;
    const s = v.scale;
    // Zoomed in, the city's real streets and blocks take over from the atlas's street lines.
    const fabric = d.fabric ? Math.max(0, Math.min(1, (s - FABRIC_FROM) / (FABRIC_FULL - FABRIC_FROM))) : 0;
    drawMapBase(ctx, d, v, this.vw, this.vh, dpr, { paper: true, roads: fabric > 0.5 ? 'vias' : 'all', fabric, contours: true });

    // ---------------------------------------------------------------- screen-space overlays
    const route = this.showRoute ? (d.route?.() ?? null) : null;
    if (route) {
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.vw / 2 - v.cx * s), dpr * (this.vh / 2 - v.cz * s));
      drawRoute(ctx, route, null, s, { width: 4.2, casing: 2.4 });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.drawLabels();
    this.drawMarkers();
    this.drawScaleBar();
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
