/**
 * The minimap (GTA-style, bottom left): a disc of the city round the player that turns with the
 * view (or keeps north up), with the player's arrow, the quest route, the objective (pinned to the
 * rim when it is farther), other open objectives, foes, and nearby places, doors, tradespeople and
 * quest givers. Inside an interior cell it shows the cell's plan instead: its walking line at the
 * player's level, its doors and the route through it.
 *
 * Cost: the map is tiles rendered once from the big map's own layers (tiles.ts); a redraw (about
 * 12 a second, or at once on a sharp turn) draws a few tiles, a line and a handful of icons into
 * one canvas, allocating nothing. Between redraws a turning view rotates the canvas with a CSS
 * transform, so turning stays smooth at no cost. Points of interest refresh twice a second.
 */
import type { Game } from '../../../core/Game';
import { codeLabel } from '../../../core/Input';
import type { Service } from '../../../npc/types';
import { h, setClass, setText } from '../../dom';
import { drawIcon, LOCATION_ICONS, UI_ICONS, iconSvg, type IconDef } from '../../icons';
import { drawRoute } from '../../map/route';
import type { MapDataSource, MapIconKind, MapRouteView, UISources } from '../../types';
import type { CompassItem } from '../Compass';
import type { GuideTarget } from '../QuestGuide';
import { MapTiles } from './tiles';
import { angleDelta, clampToRim, discTransform, miniView, setMiniView, tileRange, toDisc, type XY } from './minimapMath';

/** Game metres from the centre to the rim in the city. */
const RADIUS_M = 80;
/** Tile size in game metres. */
const TILE_M = 128;
/** Redraws per second (plus one at once after a sharp turn). */
const REDRAW_HZ = 12;
const SHARP_TURN = 18;
/** Points of interest refresh interval (s). */
const POI_EVERY = 0.5;

type PoiKind = 'place' | 'door' | 'service' | 'giver';

interface Poi {
  kind: PoiKind;
  x: number;
  z: number;
  icon: IconDef;
}

const SERVICE_ICON: Partial<Record<Service, MapIconKind>> = {
  innkeeper: 'tavern',
  priest: 'temple',
  trainer: 'arena',
  lanista: 'arena',
};

/** A door: an arch with a dark opening (24-unit grid like the other icons). */
const DOOR_ICON: IconDef = { paths: [{ d: 'M5 22 V10 A7 7 0 0 1 19 10 V22 Z M8.6 22 V11 A3.4 3.4 0 0 1 15.4 11 V22 Z' }] };

export class Minimap {
  readonly el: HTMLElement;
  private disc: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private arrow: HTMLElement;
  private label: HTMLElement;
  private keyHint: HTMLElement;
  private ro: ResizeObserver | null = null;
  private size = 0;
  private dpr = 1;
  private tiles: MapTiles | null = null;
  private tilesFor: MapDataSource | null = null;
  private fabricFor: unknown = null;
  private shown = false;
  private timer = 1;
  private drawnHeading = 0;
  private cssTurn = 0;
  private arrowTurn = NaN;
  private poiTimer = 1;
  private readonly pois: Poi[] = [];
  private poiCount = 0;
  private givers = new Set<string>();
  private giversAt = -1;
  private clock = 0;
  private cell: string | null = null;
  private cellRoute: { x: number; y: number; z: number }[] = [];
  private cellDoors: { x: number; y: number; z: number }[] = [];
  private cellRadius = 5;
  private cellBg: CanvasGradient | null = null;
  private cellBgSize = 0;
  private readonly v = miniView();
  private readonly p: XY = { x: 0, y: 0 };
  private readonly range = [0, 0, 0, 0];
  private readonly m = [1, 0, 0, 1, 0, 0];
  /**
   * Costs (scripts read them): redraws and the last one's ms, tiles rendered, and while
   * `game.profiling` is on the CPU ms per frame of the whole minimap, smoothed and peak.
   */
  readonly stats = { redraws: 0, lastMs: 0, tiles: 0, frameMs: 0, peakMs: 0 };

  constructor(
    private readonly game: Game,
    private readonly sources: UISources,
  ) {
    this.canvas = h('canvas', { class: 'mm-map' }) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.disc = h('div', { class: 'mm-disc' }, this.canvas);
    this.arrow = h('div', { class: 'mm-arrow' });
    this.arrow.innerHTML = iconSvg(UI_ICONS.playerArrow);
    this.label = h('div', { class: 'mm-label' });
    this.keyHint = h('span', { class: 'mm-key' });
    this.el = h('div', { class: 'hud-minimap' }, this.disc, h('div', { class: 'mm-rim' }), this.arrow, this.label, this.keyHint);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(this.el);
    }
  }

  /** Is it on (Settings → Interface → Minimap, or its key)? */
  get enabled(): boolean {
    return this.game.settings.data.minimap !== false;
  }

  private measure() {
    const w = this.el.clientWidth;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    if (w === this.size && dpr === this.dpr) return;
    this.size = w;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = this.canvas.width;
    this.tiles?.dispose();
    this.tiles = null;
    this.timer = 1;
  }

  /**
   * Per frame: `heading` is the view's compass bearing; `objective` what the compass leads to (the
   * tracked step, or the door on the way to it; null: none); `items` the compass's markers (other
   * objectives, foes).
   */
  update(dt: number, heading: number, px: number, py: number, pz: number, objective: GuideTarget | null, items: readonly CompassItem[], hudVisible: boolean) {
    if (!this.game.profiling) {
      this.frame(dt, heading, px, py, pz, objective, items, hudVisible);
      return;
    }
    const t0 = performance.now();
    this.frame(dt, heading, px, py, pz, objective, items, hudVisible);
    const ms = performance.now() - t0;
    this.stats.frameMs = this.stats.frameMs * 0.98 + ms * 0.02;
    this.stats.peakMs = Math.max(this.stats.peakMs * 0.999, ms);
  }

  private frame(dt: number, heading: number, px: number, py: number, pz: number, objective: GuideTarget | null, items: readonly CompassItem[], hudVisible: boolean) {
    const on = this.enabled && hudVisible;
    if (on !== this.shown) {
      this.shown = on;
      setClass(this.el, 'is-on', on);
      if (on) {
        this.timer = 1;
        this.poiTimer = 1;
        if (!this.size) this.measure();
      } else if (!this.enabled) {
        // Switched off (not just hidden under a menu): give the tiles' memory back.
        this.tiles?.dispose();
        this.tiles = null;
      }
    }
    if (!on || !this.size) return;
    this.clock += dt;
    const northUp = !!this.game.settings.data.minimapNorthUp;
    // The arrow: up when the map turns with the view; turned by the heading when north is up.
    const arrowTurn = northUp ? Math.round(heading) : 0;
    if (arrowTurn !== this.arrowTurn) {
      this.arrowTurn = arrowTurn;
      this.arrow.style.transform = arrowTurn ? `rotate(${arrowTurn}deg)` : '';
    }
    this.poiTimer += dt;
    if (this.poiTimer >= POI_EVERY) {
      this.poiTimer = 0;
      this.collectPois(px, pz);
    }
    this.timer += dt;
    const turn = northUp ? 0 : angleDelta(this.drawnHeading, heading);
    if (this.timer >= 1 / REDRAW_HZ || Math.abs(turn) > SHARP_TURN) {
      this.timer = 0;
      this.redraw(heading, northUp, px, py, pz, objective, items);
      this.drawnHeading = northUp ? 0 : heading;
      this.setTurn(0);
    } else this.setTurn(Math.round(turn * 4) / 4);
  }

  /** Between redraws: turn the drawn canvas to the live heading. */
  private setTurn(deg: number) {
    if (deg === this.cssTurn) return;
    this.cssTurn = deg;
    this.canvas.style.transform = deg ? `rotate(${deg}deg)` : '';
  }

  // ------------------------------------------------------------------ drawing

  private redraw(heading: number, northUp: boolean, px: number, py: number, pz: number, objective: GuideTarget | null, items: readonly CompassItem[]) {
    const t0 = performance.now();
    const { ctx, v, p, dpr } = this;
    const S = this.canvas.width;
    const half = this.size / 2;
    const cell = this.game.interiors?.current() ?? null;
    if (cell !== this.cell) this.enterCell(cell);
    const radiusM = cell ? this.cellRadius : RADIUS_M;
    setMiniView(v, px, pz, heading, northUp, half / radiusM, half, half, half);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    const route = this.game.settings.data.routeOnMaps !== false ? this.route() : null;
    if (cell) this.drawCell(py, route);
    else this.drawCity(px, pz, radiusM, route);

    // Screen-space marks, in CSS px scaled to the device.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!cell) this.drawPois();
    for (const it of items) {
      if (it.kind === 'enemy') {
        toDisc(v, it.x, it.z, p);
        if (Math.hypot(p.x - half, p.y - half) > half - 4) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = '#b3261e';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(255, 240, 220, 0.9)';
        ctx.stroke();
      } else if (it.kind === 'quest' && !it.primary) this.drawObjective(it.x, it.z, false);
    }
    // The objective, or the door on the way to it (the HUD hands over whichever the compass shows).
    if (objective) this.drawObjective(objective.x, objective.z, true);
    this.drawNorth();
    this.stats.redraws++;
    this.stats.lastMs = performance.now() - t0;
  }

  private route(): MapRouteView | null {
    const r = this.game.questRoute;
    return r && r.legs.length ? r : null;
  }

  private drawCity(px: number, pz: number, radiusM: number, route: MapRouteView | null) {
    const { ctx, v, dpr, m } = this;
    const data = this.sources.map?.() ?? null;
    ctx.fillStyle = '#e7d8b6';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (data) {
      // New data, or the city's plan arrived after the first tiles: start the tiles again.
      const fabric = data.fabric?.() ?? null;
      if (data !== this.tilesFor || fabric !== this.fabricFor || !this.tiles) {
        this.tiles?.dispose();
        this.tilesFor = data;
        this.fabricFor = fabric;
        this.tiles = new MapTiles(data, TILE_M, (this.size / 2 / RADIUS_M) * dpr);
      }
      const tiles = this.tiles;
      discTransform(v, dpr, m);
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.imageSmoothingEnabled = true;
      const r = tileRange(px, pz, radiusM * 1.05, TILE_M, this.range);
      // The player's own tile first, so a fresh start fills from the middle out.
      tiles.get(Math.floor(px / TILE_M), Math.floor(pz / TILE_M));
      // Each tile overlaps its neighbours by about a pixel: turned and filtered, edge to edge
      // tiles would show hairline seams.
      const e = 0.7 / (v.scale * dpr);
      for (let iz = r[2]; iz <= r[3]; iz++) {
        for (let ix = r[0]; ix <= r[1]; ix++) {
          const c = tiles.get(ix, iz);
          if (c) ctx.drawImage(c, ix * TILE_M - e, iz * TILE_M - e, TILE_M + 2 * e, TILE_M + 2 * e);
        }
      }
      // A fresh view renders its tiles over a few redraws; then one at a time as you walk.
      tiles.pump(tiles.pending > 4 ? 2 : 1);
      this.stats.tiles = tiles.rendered;
      if (route) drawRoute(ctx, route, null, v.scale * dpr, { width: 3.4 * dpr, casing: 1.5 * dpr });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Inside a cell: its walking line near the player's level, its doors, the route through it. */
  private drawCell(py: number, route: MapRouteView | null) {
    const { ctx, v, dpr, m } = this;
    const S = this.canvas.width;
    if (!this.cellBg || this.cellBgSize !== S) {
      const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S / 2);
      g.addColorStop(0, '#3a2d1f');
      g.addColorStop(1, '#1d150e');
      this.cellBg = g;
      this.cellBgSize = S;
    }
    ctx.fillStyle = this.cellBg;
    ctx.fillRect(0, 0, S, S);
    discTransform(v, dpr, m);
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    const r = this.cellRoute;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // The floor you walk: full strength at your level, faint a turn of the stair away.
    for (const band of [1, 0]) {
      ctx.beginPath();
      for (let i = 1; i < r.length; i++) {
        const near = Math.abs((r[i].y + r[i - 1].y) / 2 - py) < 2.4;
        if (near !== !!band) continue;
        ctx.moveTo(r[i - 1].x, r[i - 1].z);
        ctx.lineTo(r[i].x, r[i].z);
      }
      ctx.strokeStyle = band ? 'rgba(236, 222, 190, 0.85)' : 'rgba(236, 222, 190, 0.16)';
      ctx.lineWidth = 0.95;
      ctx.stroke();
    }
    if (route) drawRoute(ctx, route, this.cell, v.scale * dpr, { width: 3 * dpr, casing: 1.2 * dpr });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e6c67e';
    for (const d of this.cellDoors) {
      if (Math.abs(d.y - py) > 3) continue;
      toDisc(v, d.x, d.z, this.p);
      drawIcon(ctx, DOOR_ICON, this.p.x, this.p.y, 14);
    }
  }

  private drawPois() {
    const { ctx, v, p } = this;
    const lim = this.size / 2 - 7;
    for (let i = 0; i < this.poiCount; i++) {
      const poi = this.pois[i];
      toDisc(v, poi.x, poi.z, p);
      if (Math.hypot(p.x - v.cx, p.y - v.cy) > lim) continue;
      const giver = poi.kind === 'giver';
      ctx.beginPath();
      ctx.arc(p.x, p.y, giver ? 7.5 : 7, 0, Math.PI * 2);
      ctx.fillStyle = giver ? '#2e2013' : 'rgba(246, 238, 218, 0.95)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = giver ? '#e6c67e' : 'rgba(46, 32, 19, 0.85)';
      ctx.stroke();
      ctx.fillStyle = giver ? '#e6c67e' : poi.kind === 'door' ? '#7d1f1a' : '#2e2013';
      ctx.strokeStyle = ctx.fillStyle;
      drawIcon(ctx, poi.icon, p.x, p.y, giver ? 11 : 10.5);
    }
  }

  /** The objective's chevron, pinned to the rim (and turned outward) when it is beyond it. */
  private drawObjective(x: number, z: number, primary: boolean) {
    const { ctx, v, p } = this;
    toDisc(v, x, z, p);
    const rim = this.size / 2 - (primary ? 9 : 7);
    const out = clampToRim(v, p, rim);
    const size = primary ? 17 : 11;
    ctx.save();
    ctx.translate(p.x, p.y);
    // The chevron points down at its target; on the rim it points outward, toward it.
    if (out) ctx.rotate(Math.atan2(p.y - v.cy, p.x - v.cx) - Math.PI / 2);
    ctx.shadowColor = 'rgba(30, 18, 6, 0.85)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = primary ? '#e2b44a' : '#cfa863';
    drawIcon(ctx, UI_ICONS.questMarker, 0, out ? 0 : -size * 0.35, size);
    ctx.restore();
  }

  /** A small N on the rim at north. */
  private drawNorth() {
    const { ctx, v, p } = this;
    toDisc(v, v.px, v.pz - 1000, p);
    clampToRim(v, p, this.size / 2 - 8);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 14, 9, 0.85)';
    ctx.fill();
    ctx.font = '700 8.5px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e6c67e';
    ctx.fillText('N', p.x, p.y + 0.5);
  }

  // ------------------------------------------------------------------ data

  private enterCell(cell: string | null) {
    this.cell = cell;
    this.cellRoute = [];
    this.cellDoors = [];
    const it = this.game.interiors;
    const def = cell ? it?.get(cell) : undefined;
    setText(this.label, def?.name ?? '');
    setClass(this.el, 'is-inside', !!cell);
    if (!it || !def || !cell) return;
    this.cellRoute = it.routeWorld(cell).map((q) => ({ x: q.x, y: q.y, z: q.z }));
    for (const d of def.doors ?? []) {
      if (d.from !== cell) continue;
      const at = typeof d.at === 'function' ? d.at(this.game) : d.at;
      const w = at ? it.toWorld(cell, at) : null;
      if (w) this.cellDoors.push({ x: w.x, y: w.y, z: w.z });
    }
    // Fit the cell: its bounds' plan half-diagonal, with a margin.
    const b = def.bounds;
    this.cellRadius = Math.max(4, Math.min(30, Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) * 0.55));
  }

  /** Places you have found, interior doors, tradespeople and quest givers within the disc. */
  private collectPois(px: number, pz: number) {
    const reach = RADIUS_M * 1.15;
    const r2 = reach * reach;
    let n = 0;
    const add = (kind: PoiKind, x: number, z: number, icon: IconDef) => {
      if ((x - px) ** 2 + (z - pz) ** 2 > r2) return;
      let poi = this.pois[n];
      if (!poi) this.pois[n] = poi = { kind, x, z, icon };
      poi.kind = kind;
      poi.x = x;
      poi.z = z;
      poi.icon = icon;
      n++;
    };
    for (const l of this.sources.map?.()?.locations() ?? []) if (l.discovered) add('place', l.x, l.z, LOCATION_ICONS[l.icon] ?? LOCATION_ICONS.landmark);
    const it = this.game.interiors;
    if (it) {
      for (const def of it.all()) {
        for (const d of def.doors ?? []) {
          if (d.from !== null) continue;
          const at = typeof d.at === 'function' ? d.at(this.game) : d.at;
          if (at) add('door', at.x, at.z, DOOR_ICON);
        }
      }
    }
    // Quest givers: people whose quests you have not started (refreshed every few seconds).
    if (this.clock - this.giversAt > 4 || this.giversAt < 0) {
      this.giversAt = this.clock;
      this.givers.clear();
      const q = this.game.quests;
      if (q) {
        for (const def of q.all()) {
          if (!def.giver || def.category === 'main' || def.autoStart) continue;
          if ((q.state(def.id)?.status ?? 'inactive') === 'inactive') this.givers.add(def.giver);
        }
      }
    }
    for (const npc of this.game.population?.list ?? []) {
      const def = npc.def;
      if (!def || npc.dead) continue;
      const x = npc.position.x;
      const z = npc.position.z;
      if (this.givers.has(def.id)) add('giver', x, z, GIVER_ICON);
      else if (def.vendor || def.services?.length) add('service', x, z, LOCATION_ICONS[SERVICE_ICON[def.services?.[0] as Service] ?? 'shop']);
    }
    this.poiCount = n;
    // The key that toggles it, for the hint under the disc.
    setText(this.keyHint, codeLabel(this.game.input.bindings.minimap?.[0] ?? ''));
  }

  dispose() {
    this.ro?.disconnect();
    this.tiles?.dispose();
  }
}

/** A quest giver: a speech scroll. */
const GIVER_ICON: IconDef = { paths: [{ d: 'M4 5 H20 V15 H11 L6 19.5 V15 H4 Z' }] };

export const MINIMAP_CSS = `
.sr-hud-root { --mm: min(11rem, 27vh); }
.hud-minimap { position: absolute; left: 1.7rem; bottom: 1.7rem; width: var(--mm); height: var(--mm); pointer-events: none;
  opacity: 0; transition: opacity 0.3s; }
.hud-minimap.is-on { opacity: 1; }
.hud-minimap .mm-disc { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; clip-path: circle(50%); background: #e7d8b6; }
.hud-minimap .mm-map { position: absolute; inset: 0; width: 100%; height: 100%; will-change: transform; }
.hud-minimap .mm-rim { position: absolute; inset: -0.2rem; border-radius: 50%; border: 0.14rem solid rgba(230, 198, 126, 0.85);
  box-shadow: 0 0 0 1px rgba(10, 7, 5, 0.85), 0 0.15rem 0.6rem rgba(0, 0, 0, 0.55), inset 0 0 0 0.12rem rgba(10, 7, 5, 0.55), inset 0 0 1.3rem rgba(40, 24, 10, 0.45); }
.hud-minimap .mm-arrow { position: absolute; left: 50%; top: 50%; width: 1.25rem; height: 1.25rem; margin: -0.625rem 0 0 -0.625rem; color: #9c2a20;
  filter: drop-shadow(0 0 1px #f6ecd6) drop-shadow(0 0 1px #f6ecd6) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7)); }
.hud-minimap .mm-arrow svg { width: 100%; height: 100%; display: block; }
.hud-minimap .mm-label { position: absolute; left: 50%; bottom: calc(100% + 0.45rem); transform: translateX(-50%); white-space: nowrap; font-family: var(--sr-display);
  font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; color: #e6c67e; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95); }
.hud-minimap .mm-key { position: absolute; right: -0.15rem; bottom: -0.15rem; min-width: 1.1rem; height: 1.1rem; padding: 0 0.2rem; border-radius: 0.2rem;
  font-family: var(--sr-display); font-size: 0.62rem; line-height: 1.1rem; text-align: center; color: #e6c67e; background: rgba(12, 8, 5, 0.82);
  border: 1px solid rgba(230, 198, 126, 0.6); opacity: 0.85; }
.hud-minimap .mm-key:empty { display: none; }
/* The bar that sat in the corner moves over beside the minimap, and narrows on a small window so it
   never reaches the health bar (centred, at most 26vw wide: its left edge is at 37vw or beyond). */
.sr-hud-root.has-minimap .hud-res.pietas { left: calc(var(--mm) + 3.6rem); width: min(15rem, 22vw, calc(37vw - var(--mm) - 4.6rem)); }
`;
