/**
 * Map tab: the parchment map with a title cartouche, legend + discovered-places list, zoom
 * buttons and a card for the selected place (with Fast travel when the game provides it).
 * Pointer: drag to pan, wheel/pinch to zoom, click a place. Keys: arrows/WASD pan, +/− zoom,
 * C centers on you, < > step through discovered places, F fast-travels, L toggles the legend.
 */
import type { UIManager } from '../UIManager';
import { h, keycap, setChildren } from '../dom';
import { LOCATION_ICONS, UI_ICONS, iconSvg } from '../icons';
import { MapRenderer } from '../map/MapRenderer';
import { HeldPanKeys, panBy } from '../map/view';
import type { MapDataSource, MapIconKind, MapLocation } from '../types';
import { emptyState, type Hint, type MenuTab } from './MenuShell';

const ICON_NAMES: Partial<Record<MapIconKind, string>> = {
  temple: 'Temple',
  forum: 'Forum',
  baths: 'Baths',
  arena: 'Arena / circus',
  theatre: 'Theatre',
  market: 'Market',
  gate: 'Gate',
  palace: 'Palace',
  tavern: 'Tavern',
  shop: 'Shop',
  monument: 'Monument',
  landmark: 'Landmark',
  camp: 'Fortress',
  bridge: 'Bridge',
  garden: 'Gardens',
  house: 'House',
  dungeon: 'Catacomb',
};

export class MapTab implements MenuTab {
  readonly id = 'map' as const;
  readonly label = 'Map';
  readonly el = h('div', { class: 'tab-map' });
  private ui!: UIManager;
  private data: MapDataSource | null = null;
  private renderer: MapRenderer | null = null;
  private stage = h('div', { class: 'map-stage' });
  private card = h('div', { class: 'map-card sr-panel' });
  private legend = h('div', { class: 'map-legend sr-panel' });
  private legendOpen = true;
  private ro: ResizeObserver | null = null;
  private keysHeld = new HeldPanKeys();
  /** Releases can be missed while the window is in the background: forget held keys then. */
  private onBlur = () => this.keysHeld.clear();
  private locs: MapLocation[] = [];
  private drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  private pinchBase = 1;

  constructor() {
    const zoom = h(
      'div',
      { class: 'map-zoom' },
      this.iconBtn(UI_ICONS.plus, 'Zoom in', () => this.renderer?.zoomBy(1.5)),
      this.iconBtn(UI_ICONS.minus, 'Zoom out', () => this.renderer?.zoomBy(1 / 1.5)),
      this.iconBtn(UI_ICONS.target, 'Center on you', () => this.centerOnPlayer()),
    );
    const cartouche = h(
      'div',
      { class: 'map-cartouche' },
      h('div', { class: 'c-title' }, 'VRBS · ROMA'),
      h('div', { class: 'c-sub' }, 'Imperatore Caesare Nerva Traiano Augusto'),
      h('div', { class: 'c-year' }, 'A·D·CXIII'),
    );
    this.el.append(this.stage, h('div', { class: 'map-frame' }), cartouche, this.legend, this.card, zoom);
    this.bindPointer();
  }

  private iconBtn(icon: (typeof UI_ICONS)[keyof typeof UI_ICONS], title: string, fn: () => void) {
    const b = h('button', { class: 'sr-btn sr-btn-icon', title, on: { click: fn } });
    b.innerHTML = iconSvg(icon);
    return b;
  }

  show(ui: UIManager) {
    this.ui = ui;
    this.data = ui.sources.map?.() ?? null;
    if (!this.data) {
      setChildren(this.stage, emptyState('No map yet', 'The map appears once the world is loaded.'));
      return;
    }
    if (!this.renderer) {
      this.renderer = new MapRenderer(this.data);
      this.stage.replaceChildren(this.renderer.canvas);
    } else this.renderer.setData(this.data);
    this.renderer.latin = ui.game.settings.data.latinNames;
    this.locs = this.data.locations().filter((l) => l.discovered).sort((a, b) => a.name.localeCompare(b.name));
    this.renderLegend();
    this.renderCard();
    window.removeEventListener('blur', this.onBlur);
    window.addEventListener('blur', this.onBlur);
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.fitStage(false));
    this.ro.observe(this.stage);
    // Layout is known after this frame; then center on the player at a readable zoom.
    requestAnimationFrame(() => this.fitStage(true));
    void document.fonts?.ready.then(() => this.renderer?.requestRender());
  }

  hide() {
    this.ro?.disconnect();
    this.ro = null;
    this.keysHeld.clear();
    window.removeEventListener('blur', this.onBlur);
  }

  hints(): Hint[] {
    const hints: Hint[] = [
      { key: 'C', label: 'Center', run: () => this.centerOnPlayer() },
      { key: '< >', label: 'Places', run: () => this.cycle(1) },
      { key: 'L', label: 'Legend', run: () => this.toggleLegend() },
    ];
    const sel = this.selectedLoc();
    if (sel && this.ui?.sources.fastTravel) hints.push({ key: 'F', label: 'Fast travel', run: () => this.travel() });
    return hints;
  }

  private fitStage(initial: boolean) {
    const r = this.renderer;
    if (!r) return;
    const rect = this.stage.getBoundingClientRect();
    if (rect.width < 10) return;
    r.resize(rect.width, rect.height);
    if (initial) {
      const p = this.data?.player();
      if (r.focusQuestId) this.focusQuest(r.focusQuestId);
      else if (p) r.centerOn(p.x, p.z, Math.max(r.minScale, 0.62));
      else r.setView({ cx: 0, cz: 0, scale: r.minScale });
    }
  }

  private selectedLoc(): MapLocation | undefined {
    return this.locs.find((l) => l.id === this.renderer?.selected);
  }

  private renderLegend() {
    setChildren(this.legend);
    this.legend.classList.toggle('is-collapsed', !this.legendOpen);
    const head = h('div', { class: 'lg-head', on: { click: () => this.toggleLegend() } }, h('span', null, 'Legenda'), keycap('L', 'sr-key-sm'));
    if (!this.legendOpen) {
      this.legend.append(head);
      return;
    }
    const all = this.data?.locations() ?? [];
    const kinds = [...new Set(this.locs.map((l) => l.icon))];
    const iconRow = (k: MapIconKind) => {
      const i = h('span', { class: 'lg-ic' });
      i.innerHTML = iconSvg(LOCATION_ICONS[k]);
      return h('div', { class: 'lg-item' }, i, ICON_NAMES[k] ?? k);
    };
    const lineRow = (cls: string, label: string) => h('div', { class: 'lg-item' }, h('i', { class: `lg-line ${cls}` }), label);
    const placeRows = this.locs.map((l) => {
      const i = h('span', { class: 'lg-ic' });
      i.innerHTML = iconSvg(LOCATION_ICONS[l.icon]);
      return h('div', { class: `lg-place${l.id === this.renderer?.selected ? ' is-selected' : ''}`, on: { click: () => this.select(l, true) } }, i, h('span', null, l.name));
    });
    this.legend.append(
      head,
      h(
        'div',
        { class: 'lg-body' },
        h('div', { class: 'lg-grid' }, lineRow('via', 'Via (highway)'), lineRow('river', 'Tiber'), lineRow('wall', 'Servian wall'), lineRow('aqua', 'Aqueduct'), kinds.map(iconRow)),
        h('div', { class: 'lg-sub' }, `Places discovered · ${this.locs.length} of ${all.length}`),
        h('div', { class: 'lg-places sr-scroll' }, placeRows),
      ),
    );
  }

  private toggleLegend() {
    this.legendOpen = !this.legendOpen;
    this.renderLegend();
  }

  private renderCard() {
    const l = this.selectedLoc();
    this.card.classList.toggle('is-visible', !!l);
    if (!l) return;
    const ic = h('div', { class: 'mc-ic' });
    ic.innerHTML = iconSvg(LOCATION_ICONS[l.icon]);
    const canTravel = !!this.ui?.sources.fastTravel;
    setChildren(
      this.card,
      h('div', { class: 'mc-head' }, ic, h('div', null, h('div', { class: 'mc-name' }, l.name), l.latin ? h('div', { class: 'mc-la' }, l.latin) : null)),
      l.description ? h('p', { class: 'mc-desc' }, l.description) : null,
      canTravel ? h('button', { class: 'sr-btn sr-btn-primary mc-go', on: { click: () => this.travel() } }, keycap('F', 'sr-key-sm'), 'Fast travel') : null,
    );
  }

  private select(l: MapLocation | null, fly = false) {
    const r = this.renderer;
    if (!r) return;
    r.selected = l?.id ?? null;
    if (l && fly) r.centerOn(l.x, l.z, Math.max(r.view.scale, 0.9));
    r.requestRender();
    this.renderCard();
    this.renderLegend();
    (this.ui.top as { renderFooter?: () => void } | undefined)?.renderFooter?.();
  }

  private cycle(d: number) {
    if (!this.locs.length) return;
    const i = this.locs.findIndex((l) => l.id === this.renderer?.selected);
    const next = this.locs[(i + d + this.locs.length) % this.locs.length];
    this.select(next, true);
  }

  private centerOnPlayer() {
    const p = this.data?.player();
    if (p && this.renderer) this.renderer.centerOn(p.x, p.z, Math.max(this.renderer.view.scale, 0.62));
  }

  /** Called by the journal's 'Show on map'. */
  focusQuest(questId: string) {
    const r = this.renderer;
    if (!r || !this.data) return;
    r.focusQuestId = questId;
    const m = this.data.questMarkers().find((q) => q.questId === questId);
    if (m && r.vw > 10) r.centerOn(m.x, m.z, Math.max(r.view.scale, 0.8));
    r.requestRender();
  }

  private travel() {
    const l = this.selectedLoc();
    const ft = this.ui.sources.fastTravel;
    if (!l || !ft) return;
    void this.ui.confirm({ title: 'Fast travel', text: `Travel to ${l.name}?`, yes: 'Travel', no: 'Stay' }).then((ok) => {
      if (!ok) return;
      this.ui.closeAll();
      ft(l.id);
    });
  }

  onKey(e: KeyboardEvent): boolean {
    const r = this.renderer;
    if (!r) return false;
    if (this.keysHeld.down(e.code)) return true;
    if (e.repeat && !['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'].includes(e.code)) return true;
    switch (e.code) {
      case 'Equal': case 'NumpadAdd': r.zoomBy(1.25); return true;
      case 'Minus': case 'NumpadSubtract': r.zoomBy(0.8); return true;
      case 'KeyC': this.centerOnPlayer(); return true;
      case 'Comma': this.cycle(-1); return true;
      case 'Period': this.cycle(1); return true;
      case 'KeyL': this.toggleLegend(); return true;
      case 'KeyF': case 'Enter': this.travel(); return true;
    }
    return false;
  }

  update(dt: number) {
    const r = this.renderer;
    if (!r || !this.keysHeld.size) return;
    // Held keys pan smoothly; MenuShell forwards the releases (onKeyUp below).
    const { dx, dy } = this.keysHeld.direction();
    const speed = 520 * dt;
    if (dx || dy) r.setView(panBy(r.view, dx * speed, dy * speed));
  }

  onKeyUp(e: KeyboardEvent) {
    this.keysHeld.up(e.code);
  }

  private bindPointer() {
    const st = this.stage;
    st.addEventListener('pointerdown', (e) => {
      if (!this.renderer || e.button !== 0) return;
      st.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    });
    st.addEventListener('pointermove', (e) => {
      const d = this.drag;
      const r = this.renderer;
      if (!d || !r || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      st.classList.add('is-dragging');
      d.x = e.clientX;
      d.y = e.clientY;
      r.setView(panBy(r.view, dx, dy));
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      st.classList.remove('is-dragging');
      this.drag = null;
      if (!d.moved && this.renderer) {
        const rect = st.getBoundingClientRect();
        this.select(this.renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top));
      }
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    st.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = this.renderer;
        if (!r) return;
        const rect = st.getBoundingClientRect();
        // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels as larger steps.
        const k = e.ctrlKey ? 0.012 : 0.0018;
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        r.zoomBy(Math.exp(-dy * k), e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );
    // Safari pinch gestures.
    st.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      this.pinchBase = 1;
    });
    st.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const s = (e as unknown as { scale: number }).scale;
      this.renderer?.zoomBy(s / this.pinchBase);
      this.pinchBase = s;
    });
  }
}
