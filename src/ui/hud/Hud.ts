/**
 * The in-game HUD: compass, resource bars, crosshair and interaction prompt, enemy/boss bars,
 * sneak eye, notifications, banners, subtitles, hit indicator and the clock readout.
 * Reads state each frame from the game and `ui.sources`; never owns game state.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { codeLabel } from '../../core/Input';
import type { Interactions } from '../../interaction/Interactions';
import { h, setClass, setText } from '../dom';
import { formatClock, romanHour } from '../format';
import { UI_ICONS, iconSvg } from '../icons';
import type { MapLocation, UISources } from '../types';
import { BossBar, ResourceBar, TargetBar } from './Bars';
import { Compass, type CompassItem } from './Compass';
import { bearingOfDir, bearingTo, relativeBearing } from './compassMath';
import { Banners, HitIndicator, Notifications, Subtitles } from './Feed';
import { QUEST_GUIDE_CSS, QuestGuide, type GuideTarget } from './QuestGuide';
import { MINIMAP_CSS, Minimap } from './minimap/Minimap';
import './hud.css';

const dir = new THREE.Vector3();

/** Undiscovered locations appear on the compass within this range (game m); discovered ones farther. */
const NEARBY_UNDISCOVERED = 110;
const NEARBY_DISCOVERED = 260;
const MAX_LOCATIONS = 6;

export class Hud {
  readonly el: HTMLElement;
  readonly compass = new Compass();
  readonly health = new ResourceBar('health');
  readonly stamina = new ResourceBar('stamina');
  readonly pietas = new ResourceBar('pietas');
  readonly target = new TargetBar();
  readonly boss = new BossBar();
  readonly notes = new Notifications();
  readonly banners = new Banners();
  readonly subtitles = new Subtitles();
  readonly hits = new HitIndicator();
  readonly guide = new QuestGuide();
  readonly minimap: Minimap;
  /** The tracked quest's next required objective (refreshed with the compass markers). */
  private guideTarget: GuideTarget | null = null;
  /** The door on the way, when the objective is in another place (reused). */
  private readonly doorTarget: GuideTarget = { questTitle: '', text: '', x: 0, y: 0, z: 0, npc: false };

  private crosshair: HTMLElement;
  private prompt: HTMLElement;
  private promptName: HTMLElement;
  private promptVerb: HTMLElement;
  private promptKey: HTMLElement;
  private promptDetail: HTMLElement;
  private sneak: HTMLElement;
  private sneakLabel: HTMLElement;
  private sneakEye: HTMLElement;
  private clock: HTMLElement;
  private clockHour: HTMLElement;
  private clockDate: HTMLElement;
  private clockPlace: HTMLElement;
  private hint: HTMLElement;
  private barWrap: Record<'health' | 'stamina' | 'pietas', HTMLElement>;

  private visible = true;
  private markerTimer = 0;
  private items: CompassItem[] = [];
  private hintTime = 0;
  /** Held by the clock key or forced by screenshots. */
  clockVisible = false;
  heading = 0;

  constructor(
    private readonly game: Game,
    private readonly sources: UISources,
  ) {
    if (typeof document !== 'undefined' && !document.getElementById('hud-quest-guide')) document.head.appendChild(h('style', { id: 'hud-quest-guide' }, QUEST_GUIDE_CSS + MINIMAP_CSS));
    this.minimap = new Minimap(game, sources);
    this.crosshair = h('div', { class: 'hud-crosshair' }, h('i', { class: 'dot' }), h('i', { class: 'ring' }));
    this.promptName = h('div', { class: 'name' });
    this.promptKey = h('span', { class: 'sr-key' });
    this.promptVerb = h('span', { class: 'verb' });
    this.promptDetail = h('div', { class: 'detail' });
    this.prompt = h('div', { class: 'hud-prompt' }, this.promptName, h('div', { class: 'action' }, this.promptKey, this.promptVerb), this.promptDetail);
    this.sneakEye = h('div', { class: 'eye' });
    this.sneakEye.innerHTML = iconSvg(UI_ICONS.eye);
    this.sneakLabel = h('div', { class: 'label' });
    this.sneak = h('div', { class: 'hud-sneak' }, h('span', { class: 'bracket' }, '['), this.sneakEye, h('span', { class: 'bracket' }, ']'), this.sneakLabel);
    this.clockHour = h('div', { class: 'hour' });
    this.clockDate = h('div', { class: 'date' });
    this.clockPlace = h('div', { class: 'place' });
    this.clock = h('div', { class: 'hud-clock' }, this.clockHour, this.clockDate, this.clockPlace);
    this.hint = h('div', { class: 'hud-hint' });

    this.barWrap = {
      pietas: h('div', { class: 'hud-res pietas' }, this.pietas.el),
      health: h('div', { class: 'hud-res health' }, this.health.el),
      stamina: h('div', { class: 'hud-res stamina' }, this.stamina.el),
    };

    this.el = h(
      'div',
      { class: 'sr-hud-root' },
      // Top center stacks instead of overlapping: compass, enemy bar, then banners.
      h('div', { class: 'hud-top' }, this.compass.el, this.target.el, this.banners.el),
      this.notes.el,
      this.minimap.el,
      this.guide.marker,
      this.guide.tracker,
      this.hits.el,
      this.crosshair,
      this.sneak,
      this.prompt,
      this.clock,
      this.subtitles.el,
      this.boss.el,
      this.barWrap.pietas,
      this.barWrap.health,
      this.barWrap.stamina,
      this.hint,
    );
  }

  /** What the compass and the chevron point at: the objective, or the door on the quest route's way to it. */
  private lead(gt: GuideTarget | null): GuideTarget | null {
    const r = this.game.questRoute;
    const leg = gt && r && r.legs.length > 1 ? r.legs[0] : null;
    if (!gt || !r || !leg || !leg.door || leg.cell !== r.place || !leg.line.n) return gt;
    const k = (leg.line.n - 1) * 3;
    const d = this.doorTarget;
    d.key = gt.key;
    d.questTitle = gt.questTitle;
    d.text = gt.text;
    d.progress = gt.progress;
    d.target = gt.target;
    d.x = leg.line.pts[k];
    d.z = leg.line.pts[k + 2];
    const y = leg.line.pts[k + 1];
    d.y = Number.isNaN(y) ? (this.game.heightmap?.heightAt(d.x, d.z) ?? 0) : y;
    return d;
  }

  /** The tracked quest's next required objective (live position for a person), or null. */
  get objective(): Readonly<GuideTarget> | null {
    return this.guideTarget;
  }

  setVisible(v: boolean) {
    if (v === this.visible) return;
    this.visible = v;
    setClass(this.el, 'is-hidden', !v);
    // Messages that arrived or were showing under a menu get their full time once it closes.
    if (v) {
      this.notes.resume();
      this.banners.resume();
    }
  }

  /** Flash a resource bar: a cost was refused (no stamina to attack or dodge, §15.1). */
  flashBar(kind: 'health' | 'stamina' | 'pietas') {
    this[kind].flash();
  }

  /** Brief hint for mouse-look when the pointer isn't captured (trackpad players use arrows). */
  showLookHint() {
    const b = this.game.input.bindings;
    this.hint.replaceChildren(
      h('span', null, 'Click the view to look with the mouse'),
      h('span', { class: 'sep' }, '·'),
      h('span', null, 'or turn with '),
      h('span', { class: 'sr-key sr-key-sm' }, codeLabel(b.lookLeft[0] ?? 'ArrowLeft')),
      h('span', { class: 'sr-key sr-key-sm' }, codeLabel(b.lookRight[0] ?? 'ArrowRight')),
    );
    this.hintTime = 7;
  }

  update(dt: number) {
    const { game, sources } = this;
    const cam = game.camera;
    cam.getWorldDirection(dir);
    const heading = (this.heading = bearingOfDir(dir.x, dir.z));
    const p = game.player ? game.player.root.position : cam.position;

    // ---- compass (marker list refreshed at 8 Hz; positions every frame)
    this.markerTimer -= dt;
    if (this.markerTimer <= 0) {
      this.markerTimer = 0.125;
      this.items = this.collectMarkers(p.x, p.z);
    }
    // A marker on a person moves with them, not at the marker list's 8 Hz.
    const gt = this.guideTarget;
    const who = gt?.actorId ? game.actors?.get(gt.actorId) : undefined;
    if (gt && who) {
      gt.x = who.position.x;
      gt.y = who.position.y;
      gt.z = who.position.z;
    }
    // Behind a door (an interior, or out of one): the compass and the chevron lead to the door first.
    const shown = this.lead(gt);
    if (shown !== gt) {
      for (const it of this.items) {
        if (it.kind !== 'quest' || !it.primary) continue;
        it.x = shown!.x;
        it.y = shown!.y;
        it.z = shown!.z;
      }
    }
    this.compass.update(heading, p.x, p.z, this.items, !!game.settings.data.compassLatin, p.y);
    // ---- minimap (its key shows or hides it; Settings → Interface has the rest)
    if (game.input.pressed('minimap')) {
      const on = !this.minimap.enabled;
      game.settings.set('minimap', on);
      game.events.emit('ui:notify', { text: on ? 'Minimap shown' : 'Minimap hidden', kind: 'info' });
    }
    setClass(this.el, 'has-minimap', this.minimap.enabled);
    this.minimap.update(dt, heading, p.x, p.y, p.z, shown, this.items, this.visible);
    const canvas = game.renderer.domElement;
    this.guide.update(dt, shown, cam, canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, p, game.settings.data.objectiveTracker !== false);

    // ---- resource bars
    const vitals = sources.vitals?.() ?? null;
    const combat = sources.inCombat?.() ?? false;
    const always = game.settings.data.hudBars === 'always';
    for (const id of ['health', 'stamina', 'pietas'] as const) {
      const wrap = this.barWrap[id];
      if (!vitals) {
        setClass(wrap, 'is-visible', false);
        continue;
      }
      const r = vitals[id];
      const frac = r.max > 0 ? r.current / r.max : 0;
      const changed = this[id].set(frac, dt);
      const flashing = this[id].flashing(dt);
      setClass(wrap, 'is-visible', always || combat || changed || flashing || frac < 0.995);
    }

    this.target.update(sources.target?.() ?? null, dt);
    this.boss.update(sources.boss?.() ?? null, dt);

    // ---- crosshair & interaction prompt
    const interactions = game.interactions as Interactions | undefined; // not every scene installs it
    const focus = game.input.enabled ? (interactions?.focus ?? null) : null;
    setClass(this.crosshair, 'is-focus', !!focus);
    setClass(this.crosshair, 'is-hidden', game.settings.data.crosshair === false && !focus);
    if (focus) {
      const illegal = focus.illegal?.() ?? false;
      setText(this.promptName, focus.label());
      setText(this.promptVerb, focus.verb());
      setText(this.promptKey, codeLabel(game.input.bindings.interact[0] ?? 'KeyE'));
      const detail = focus.detail?.() ?? '';
      setText(this.promptDetail, detail);
      setClass(this.promptDetail, 'is-empty', !detail);
      setClass(this.prompt, 'is-illegal', illegal);
    }
    setClass(this.prompt, 'is-visible', !!focus);

    // ---- sneak eye
    const sneaking = !!game.player?.sneaking;
    setClass(this.sneak, 'is-visible', sneaking);
    if (sneaking) {
      const det = Math.max(0, Math.min(1, sources.detection?.() ?? 0));
      this.sneakEye.style.transform = `scaleY(${(0.22 + det * 0.78).toFixed(3)})`;
      this.sneak.style.setProperty('--det', det.toFixed(3));
      setText(this.sneakLabel, det > 0.85 ? 'Detected' : det > 0.35 ? 'Caution' : 'Hidden');
      setClass(this.sneak, 'is-detected', det > 0.85);
    }

    // ---- clock
    setClass(this.clock, 'is-visible', this.clockVisible);
    if (this.clockVisible) {
      const rh = romanHour(game.time.hour);
      setText(this.clockHour, `${rh.latin} · ${formatClock(game.time.hour)}`);
      // Market days (the nundinae, every 8th day) are named on the date line (world-life.md §4.3).
      setText(this.clockDate, game.barter?.isMarketDay() ? `${game.time.formatRoman()} · Nundinae` : game.time.formatRoman());
      setText(this.clockPlace, sources.currentLocation?.() ?? '');
    }

    // ---- feed: frozen while a menu or conversation hides the HUD, so nothing that happens there
    // (a quest started from dialogue, a skill raised by a book) expires unseen.
    if (this.visible) {
      this.notes.update(dt);
      this.banners.update(dt);
      this.subtitles.update(dt);
      this.hits.update(dt, (x, z) => relativeBearing(heading, bearingTo(p.x, p.z, x, z)));
    }

    if (this.hintTime > 0) {
      this.hintTime -= dt;
      if (game.input.pointerLocked) this.hintTime = 0;
    }
    setClass(this.hint, 'is-visible', this.hintTime > 0);
  }

  private collectMarkers(px: number, pz: number): CompassItem[] {
    const s = this.sources;
    const out: CompassItem[] = [];
    // Tracked quest objectives.
    const log = s.quests?.();
    const map = s.map?.();
    let locations: MapLocation[] | null = null;
    const locs = () => (locations ??= map?.locations() ?? []);
    this.guideTarget = null;
    if (log) {
      for (const q of log.quests()) {
        if (!q.tracked || q.state !== 'active') continue;
        // The next step: the first required objective still open (else the first open one).
        const open = q.objectives.filter((o) => !o.done && o.target);
        const main = open.find((o) => !o.optional) ?? open[0];
        for (const o of open) {
          const t = o.target!;
          let pos: { x: number; y?: number; z: number } | null = s.resolveTarget?.(t) ?? null;
          if (!pos && t.kind === 'point') pos = { x: t.x, y: t.y, z: t.z };
          if (!pos && t.kind === 'location') {
            const id = t.id;
            const l = locs().find((x) => x.id === id);
            if (l) pos = { x: l.x, z: l.z };
          }
          if (!pos) continue;
          const primary = o === main;
          out.push({ key: `q:${q.id}:${o.id}:${primary ? 'p' : 'm'}`, kind: 'quest', x: pos.x, y: pos.y, z: pos.z, primary });
          if (primary && !this.guideTarget) {
            const y = pos.y ?? this.game.heightmap?.heightAt(pos.x, pos.z) ?? 0;
            const progress = o.count && o.count > 1 ? `${o.progress ?? 0} / ${o.count}` : undefined;
            this.guideTarget = { key: `q:${q.id}:${o.id}`, questTitle: q.title, text: o.text, progress, x: pos.x, y, z: pos.z, npc: t.kind === 'npc', actorId: t.kind === 'npc' ? t.id : undefined, target: t };
          }
        }
      }
    }
    // Nearby locations: the closest few, so a dense quarter doesn't bury the compass.
    const near = locs()
      .map((l) => ({ l, d: Math.hypot(l.x - px, l.z - pz) }))
      .filter(({ l, d }) => d > 3 && d < (l.discovered ? NEARBY_DISCOVERED : NEARBY_UNDISCOVERED))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_LOCATIONS);
    for (const { l } of near) out.push({ key: `l:${l.id}`, kind: 'location', x: l.x, z: l.z, icon: l.icon, discovered: l.discovered });
    for (const m of s.compassMarkers?.() ?? []) out.push({ key: `m:${m.id}`, kind: m.kind, x: m.x, z: m.z, icon: m.icon, discovered: m.discovered ?? true, label: m.label });
    return out;
  }
}
