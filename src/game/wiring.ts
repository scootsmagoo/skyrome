/**
 * Plugs the engine services into the UI: HUD sources (real vitals, compass markers from tracked
 * quest objectives and discovered places), the menus (character, inventory, journal, map, saves),
 * dialogue, notifications, the wait menu, settings rows (difficulty, control preset, toggles) and
 * pause-menu quicksave/quickload. Quest marker resolvers for NPC and location ids live here too.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { bearingOf } from '../core/math';
import { LANDMARK_BY_ID } from '../data/atlas';
import type { MarkerTarget } from '../quests/types';
import { effectiveArmorRating } from '../rpg/combat-math';
import { CONDITIONS } from '../rpg/data/conditions';
import { SKILLS } from '../rpg/data/skills';
import type { RpgServices } from '../rpg/install';
import { wait as restWait } from '../rpg/rest';
import { bookFromDef, characterViewFrom, inventoryViewFrom, questMarkersFrom } from '../ui/adapters';
import type { PauseItem } from '../ui/menus/PauseMenu';
import { PAUSE_EXTRA_ITEMS } from '../ui/menus/PauseMenu';
import { SETTINGS_SECTIONS, type SettingsRow } from '../ui/menus/SettingsScreen';
import type { UIManager } from '../ui/UIManager';
import type { EffectView, NoteView, QuestLogView } from '../ui/types';
import { toGame } from '../world/coords';
import { dialogueViewFrom, notifyKindFor, questLogFrom, saveSlotsFrom } from './adapters';
import { statusLine } from './character';
import type { GameFlow } from './GameFlow';
import { withGuide } from './guide';
import { AtlasMapSource } from './mapSource';
import { DIFFICULTY_CHOICES, PRESETS } from './settings';

/** Where a quest marker points: actors, NPC homes, registered places, atlas landmarks, points. */
export function registerMarkerResolvers(game: Game) {
  const quests = game.quests;
  const landmark = (id: string) => {
    const lm = LANDMARK_BY_ID[id];
    if (!lm) return null;
    const [x, z] = toGame(lm.center[0], lm.center[1]);
    return new THREE.Vector3(x, game.heightmap?.heightAt(x, z) ?? 0, z);
  };
  const location = (id: string) => {
    const inside = game.interiors?.resolve(id);
    if (inside) return inside;
    const l = game.locations?.get(id);
    if (l) return new THREE.Vector3(l.position.x, l.position.y ?? 0, l.position.z);
    const placed = game.landmarks?.get(id);
    if (placed) return placed.position.clone();
    return landmark(id);
  };
  quests.registerResolver('location', (t) => (t.kind === 'location' ? location(t.id) : null));
  quests.registerResolver('npc', (t) => {
    if (t.kind !== 'npc') return null;
    const actor = game.actors?.get(t.id);
    if (actor) return actor.position.clone();
    // The NPC crew's population may know where a not-yet-spawned NPC is.
    const pop = (game as Game & { population?: { positionOf?: (id: string) => THREE.Vector3Like | null } }).population;
    const p = pop?.positionOf?.(t.id);
    if (p) return new THREE.Vector3(p.x, p.y, p.z);
    const home = game.npcs?.get(t.id)?.home;
    return home ? location(home) : null;
  });
}

/** Map a quest marker target to a ground position for the HUD and the map. */
function resolver(game: Game) {
  return (t: MarkerTarget) => {
    const v = game.quests?.resolveTarget(t);
    return v ? { x: v.x, y: v.y, z: v.z } : null;
  };
}

function describeEffect(source: string, e: { kind: string; target: string; amount: number }): EffectView {
  const id = source.replace(/^[a-z]+:/, '').replace(/#\d+$/, '');
  const c = CONDITIONS.find((x) => x.id === id);
  const kind: EffectView['kind'] = c?.kind === 'blessing' ? 'blessing' : c?.kind === 'disease' ? 'disease' : c?.kind === 'poison' || c?.kind === 'omen' ? 'curse' : 'other';
  return { source: c?.name ?? id, description: c?.description ?? `${e.kind} ${e.target} ${e.amount}`, kind };
}

export function wireUi(game: Game, ui: UIManager, rpg: RpgServices, flow: GameFlow) {
  const { sheet, inventory, quests, save } = rpg;
  const resolve = resolver(game);
  const armor = () => effectiveArmorRating(inventory.worn(), sheet);

  const notes = (): NoteView[] =>
    inventory.list((d) => d.type === 'book' && !!d.tags?.some((t) => t === 'letter' || t === 'note' || t === 'tablet')).map(({ def }) => ({
      id: def.id,
      title: def.name,
      kind: def.tags?.includes('letter') ? 'letter' : def.tags?.includes('tablet') ? 'tablet' : 'note',
      meta: def.latin,
      open: () => bookFromDef(def) ?? { title: def.name, kind: 'note', text: def.description },
    }));
  const questEvents = ['quest:started', 'quest:stage', 'quest:objective', 'quest:completed', 'quest:failed', 'quest:tracked'] as const;
  // The journal, with the first-steps guide's entry while no quest leads the way.
  const questLog: QuestLogView = questLogFrom(quests, {
    npcName: (id) => game.npcs?.name(id),
    notes,
    subscribe: (fn) => {
      const offs = questEvents.map((e) => game.events.on(e, () => fn()));
      return () => offs.forEach((o) => o());
    },
  });
  const log = withGuide(questLog, flow.guide);

  const map = new AtlasMapSource({
    heightAt: (x, z) => game.heightmap?.heightAt(x, z) ?? 0,
    locations: () => game.locations?.all() ?? [],
    isDiscovered: (id) => !!game.locations?.isDiscovered(id),
    player: () => {
      const p = game.player;
      if (!p) return null;
      return { x: p.position.x, z: p.position.z, bearing: bearingOf(-Math.sin(p.yaw), -Math.cos(p.yaw)) };
    },
    questMarkers: () => questMarkersFrom(log, resolve),
  });

  const saves = saveSlotsFrom(save, {
    save: async (slot) => {
      const r = slot ? await save.save(slot, { kind: 'manual' }) : await save.saveNew();
      ui.flash(r.ok ? 'Game saved' : `Could not save: ${r.error}`);
    },
    load: (slot) => void flow.loadSlot(slot),
  });

  ui.provide({
    vitals: () => (flow.state === 'playing' ? sheet.vitals : null),
    character: () =>
      characterViewFrom(sheet, {
        name: flow.character.name,
        title: statusLine(flow.character),
        skills: SKILLS,
        perks: sheet.availablePerkDefs(),
        factions: () => game.factions.joined().map((id) => ({ name: game.factions.def(id)?.name ?? id, latin: game.factions.def(id)?.latin, rank: game.factions.rank(id)?.title })),
        bounties: () => game.crime.ledgers().map((l) => ({ authority: l.name, amount: game.crime.bounty(l.id) })).filter((b) => b.amount > 0),
        stats: () => [
          { label: 'Days in Rome', value: String(game.time.dayIndex + 1) },
          { label: 'Date', value: game.time.formatRoman() },
          { label: 'Difficulty', value: DIFFICULTY_CHOICES.find((d) => d.value === flow.difficulty)?.label ?? flow.difficulty },
        ],
        armorRating: armor,
        describeEffect,
      }),
    inventory: () => inventoryViewFrom(inventory, (id) => game.items.get(id), { armorRating: armor }),
    quests: () => log,
    map: () => map,
    saves: () => saves,
    resolveTarget: resolve,
    itemName: (id) => game.items.get(id)?.name,
    currentLocation: () => game.locations?.current()?.name ?? null,
    inCombat: () => !!sheet.vitals.inCombat,
    wait: (hours) => {
      const r = restWait({ sheet, standing: game.standing, inventory, time: game.time, events: game.events }, hours);
      if (!r.ok) return r.reason === 'trespassing' ? 'You cannot wait while trespassing.' : 'You cannot wait with enemies nearby.';
    },
    quitToTitle: () => flow.quitToTitle(),
    // The combat crew's views, when installed (code defensively: built in parallel).
    target: () => (game as Game & { combat?: { targetView?: () => ReturnType<NonNullable<UIManager['sources']['target']>> } }).combat?.targetView?.() ?? null,
    boss: () => (game as Game & { combat?: { bossView?: () => ReturnType<NonNullable<UIManager['sources']['boss']>> } }).combat?.bossView?.() ?? null,
    compassMarkers: () => (game as Game & { combat?: { compassMarkers?: () => ReturnType<NonNullable<UIManager['sources']['compassMarkers']>> } }).combat?.compassMarkers?.() ?? [],
    detection: () => (game as Game & { stealth?: { detection?: () => number } }).stealth?.detection?.() ?? null,
  });

  // rpg:notify toasts the UI doesn't already announce.
  game.events.on('rpg:notify', (e) => {
    const kind = notifyKindFor(e.text, e.kind);
    if (kind) ui.notify(e.text, kind);
  });

  // Conversations started by anyone (NPC crew, quests) open the dialogue panel.
  game.events.on('dialogue:started', () => {
    if (ui.isOpen('dialogue')) return;
    queueMicrotask(() => {
      if (!game.dialogue.active || ui.isOpen('dialogue')) return;
      ui.openDialogue(dialogueViewFrom(game.dialogue, { name: (id) => game.npcs?.name(id), title: (id) => game.npcs?.get(id)?.title }));
    });
  });

  addSettingsRows(flow);
  addPauseItems(flow);
}

/** Gameplay settings (difficulty) and control rows (preset, toggles) in Settings. */
function addSettingsRows(flow: GameFlow) {
  if (SETTINGS_SECTIONS.some((s) => s.id === 'gameplay')) return;
  const gameplay: SettingsRow[] = [
    { kind: 'choice', key: 'difficulty', label: 'Difficulty', options: DIFFICULTY_CHOICES.map((d) => ({ value: d.value, label: d.label })), note: 'Damage dealt and taken, parry window' },
    { kind: 'choice', key: 'lockOnMode', label: 'Lock-on', options: [{ value: 'manual', label: 'Manual (X)' }, { value: 'suggest', label: 'Suggest' }, { value: 'auto', label: 'Auto' }] },
    { kind: 'choice', key: 'aimAssist', label: 'Aim assist (ranged)', options: [{ value: 'off', label: 'Off' }, { value: 'light', label: 'Light' }, { value: 'strong', label: 'Strong' }] },
    { kind: 'choice', key: 'gore', label: 'Gore', options: [{ value: 'off', label: 'Off' }, { value: 'normal', label: 'Normal' }, { value: 'ultra', label: 'Ultra' }], note: 'Blood, and limbs and heads that come off' },
    { kind: 'choice', key: 'combatShake', label: 'Camera shake', options: [{ value: 'third', label: 'Third person' }, { value: 'on', label: 'Always' }, { value: 'off', label: 'Off' }], note: 'The jolt when blows land (first person gets a gentler share)' },
    { kind: 'toggle', key: 'combatHitStop', label: 'Hit-stop', invert: true, note: 'The world freezes for a beat when a blow lands; slow motion on a kill' },
  ];
  SETTINGS_SECTIONS.unshift({ id: 'gameplay', label: 'Gameplay', latin: 'Ludus', rows: gameplay });
  const controls = SETTINGS_SECTIONS.find((s) => s.id === 'controls');
  if (!controls) return;
  const rows: SettingsRow[] = [
    { kind: 'button', label: 'Control preset…', note: 'Mouse · Trackpad · Keyboard only (sets the rows below)', run: () => flow.openPresetPicker() },
    { kind: 'choice', key: 'controlPreset', label: 'Preset', options: PRESETS.map((p) => ({ value: p.id, label: p.label })), note: 'Changing it resets the rows below' },
    { kind: 'choice', key: 'sprintToggle', label: 'Sprinting', options: [{ value: false, label: 'Hold' }, { value: true, label: 'Toggle' }] },
    { kind: 'choice', key: 'sneakHold', label: 'Sneaking', options: [{ value: false, label: 'Toggle' }, { value: true, label: 'Hold' }] },
    { kind: 'toggle', key: 'clickAttacks', label: 'Clicks attack and block', note: 'Off for trackpads: a tap can’t be told from a click' },
    { kind: 'toggle', key: 'zoomToFirstPerson', label: 'Scroll in for first person', note: 'Otherwise V switches views' },
    { kind: 'toggle', key: 'autoRecenter', label: 'Camera recenters behind you' },
    { kind: 'slider', key: 'lookSmoothing', label: 'Look smoothing', min: 0, max: 0.2, step: 0.01, format: (v) => (v ? `${Math.round(v * 1000)} ms` : 'Off') },
    { kind: 'slider', key: 'powerHoldS', label: 'Power attack hold', min: 0.2, max: 0.6, step: 0.05, format: (v) => `${v.toFixed(2)} s` },
  ];
  // The preset first; the toggles after the blocking choice, before the bindings button.
  // (Choosing a different preset in the row rewrites the rows below: GameFlow.applyControls.)
  controls.rows.splice(0, 0, ...rows.slice(0, 2));
  const at = controls.rows.findIndex((r) => r.kind === 'button' && r.label.startsWith('Key bindings'));
  controls.rows.splice(at < 0 ? controls.rows.length : at, 0, ...rows.slice(2));
}

/** GDD §4.2: Quicksave and Quickload are also buttons in the Esc menu. */
function addPauseItems(flow: GameFlow) {
  if (PAUSE_EXTRA_ITEMS.length) return;
  const save = flow.rpg.save;
  PAUSE_EXTRA_ITEMS.push(
    (ui, menu): PauseItem => ({
      label: 'Quicksave',
      latin: 'Serva cito',
      enabled: () => !ui.isOpen('dialogue') && !ui.sources.inCombat?.() && flow.state === 'playing',
      run: () => {
        menu.close();
        void save.quicksave();
      },
    }),
    (_ui, menu): PauseItem => ({
      label: 'Quickload',
      latin: 'Repete cito',
      enabled: () => flow.state === 'playing',
      run: () => {
        menu.close();
        void save.quickload();
      },
    }),
    // A safety net for any geometry trap: back onto open ground nearby.
    (ui, menu): PauseItem => ({
      label: "I'm stuck",
      latin: 'Haereo',
      enabled: () => flow.state === 'playing' && !ui.isOpen('dialogue'),
      run: () => {
        menu.close();
        flow.unstick();
      },
    }),
  );
}

/** GDD §4.1: confirm before leaving the page while a game is in progress (not in automation). */
export function guardUnload(flow: GameFlow) {
  window.addEventListener('beforeunload', (e) => {
    if (flow.state !== 'playing' || flow.opts.quick || navigator.webdriver) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
