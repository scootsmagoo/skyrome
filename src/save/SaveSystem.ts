/**
 * Save games (game.save) — docs/GDD.md §14.13. Modules register Saveables under a key; a file is
 *   { format: 'skyrome-save', saveVersion, generatorVersion, worldSeed, gameTime, meta, data: { [key]: … } }
 * stored per slot: 'quick' (F5 / F9), 'auto1'..'auto3' (rotating), 'manual-1'..'manual-10'.
 *
 *   - Saving is free except in combat, in dialogue or while falling (addBlocker() for more).
 *   - Autosaves: on quest stages (at most every 120 s), every 10 real minutes, and when another
 *     system asks with 'save:request' (sleep or wait, entering an interior). One that can't happen
 *     right now (in dialogue) waits until it can.
 *   - Storage: IndexedDB, with localStorage as the fallback and every access in try/catch; asks
 *     for persistent storage; export/import of JSON files guards against Safari's 7-day eviction.
 *   - Loading never throws: corrupt or newer files are refused, older ones are migrated by pure
 *     functions, and a failing section is skipped with a warning.
 *
 * Built-in saveables: 'time' (GameTime), 'player' (position, heading, camera, view mode) and
 * 'entityDeltas' (game.deltas: dead NPCs, looted containers…).
 */
import type { Game, System } from '../core/Game';
import '../rpg/events';
import { SAVE } from '../rpg/data/tuning';
import { EntityDeltas } from './deltas';
import { createDefaultStorage } from './storage';
import type { LoadResult, Saveable, SaveFile, SaveKind, SaveMeta, SaveResult, SaveStorage } from './types';

declare module '../core/Game' {
  interface Game {
    save: SaveSystem;
    deltas: EntityDeltas;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    'save:saved': { slot: string; meta: SaveMeta };
    'save:loaded': { slot: string; meta: SaveMeta };
    'save:error': { slot: string; error: string };
    /** Ask for an autosave: 'sleep' (sleep or wait), 'cell' (entered an interior), or anything else. */
    'save:request': { reason: string };
  }
}

export const SAVE_FORMAT = 'skyrome-save';
/** Bump when the shape of saved data changes, and add a migration from the old version. */
export const SAVE_VERSION = 2;
export const AUTOSAVE_SLOTS = SAVE.autosaveSlots;
export const MANUAL_SLOTS = SAVE.manualSlots;
/** Bump when procedural generators change what they produce (old deltas may then point at nothing). */
export const GENERATOR_VERSION = 1;

interface SaveIndex {
  slots: Record<string, SaveMeta>;
  autoCounter: number;
}

export interface SaveSystemOptions {
  storage?: SaveStorage;
  /** Key prefix in storage. */
  prefix?: string;
  /** Register the 'time', 'player' and 'entityDeltas' saveables (default true). */
  builtins?: boolean;
}

/** Upgrades a parsed file from one saveVersion to the next. Pure: no access to the game. */
export type Migration = (file: Record<string, unknown>) => Record<string, unknown>;

/** v1 → v2: GDD §14.13 header fields (saveVersion, generatorVersion, worldSeed, gameTime) and entity deltas. */
export function migrateV1toV2(f: Record<string, unknown>): Record<string, unknown> {
  const data = (f.data ?? {}) as Record<string, unknown>;
  const t = data.time as { totalHours?: unknown } | undefined;
  const hours = typeof t?.totalHours === 'number' && Number.isFinite(t.totalHours) ? t.totalHours : 0;
  const { version: _old, ...rest } = f;
  return { ...rest, saveVersion: 2, generatorVersion: 0, worldSeed: 0, gameTime: { totalHours: hours, elapsedDays: Math.floor(hours / 24), clamp: null }, data: { entityDeltas: {}, ...data } };
}

export const MIGRATIONS: Record<number, Migration> = { 1: migrateV1toV2 };

export class SaveSystem implements System {
  readonly name = 'save';
  readonly priority = 1100;
  readonly storage: SaveStorage;
  readonly prefix: string;
  /** Real seconds played (not counting pauses). */
  playTime = 0;
  /** Gate for saving; by default whyNot() (combat, dialogue, falling, added blockers). */
  canSave: () => boolean = () => this.whyNot() === null;
  /** Location name for metadata. */
  locationName: () => string | undefined = () => this.game.locations?.current()?.name;
  /** Character level for metadata. */
  levelOf: () => number | undefined = () => this.game.player?.sheet?.level;
  /** The world seed recorded in files. */
  worldSeed: () => number = () => (this.game as { worldSeed?: number }).worldSeed ?? 0;
  /** The pridie clamp (calendar module), recorded in gameTime. */
  calendarClamp: () => string | null = () => (this.game as { calendar?: { clamp?: string | null } }).calendar?.clamp ?? null;
  /** Result of navigator.storage.persist() (undefined until known or when unsupported). */
  persisted: boolean | undefined;
  private readonly saveables: { key: string; s: Saveable }[] = [];
  private readonly migrations = new Map<number, Migration>(Object.entries(MIGRATIONS).map(([k, m]) => [Number(k), m]));
  private readonly blockers: (() => string | null)[] = [];
  /** playTime of the last autosave of any kind (the 10-minute timer counts from here). */
  private lastAutosave = 0;
  /** playTime of the last quest-stage autosave (at most every 120 s). */
  private lastQuestAutosave = -Infinity;
  private pendingAutosave: string | null = null;
  private busy: Promise<unknown> = Promise.resolve();
  /** The autosave in flight (idle() waits for it too). */
  private autosaving: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly game: Game,
    opts: SaveSystemOptions = {},
  ) {
    this.storage = opts.storage ?? createDefaultStorage();
    this.prefix = opts.prefix ?? 'skyrome.save.';
    if (opts.builtins !== false) this.registerBuiltins();
    // §14.13 autosave triggers.
    game.events.on('quest:stage', () => this.requestAutosave('quest'));
    game.events.on('quest:completed', () => this.requestAutosave('quest'));
    game.events.on('save:request', (e) => this.requestAutosave(e.reason));
    if (!opts.storage) this.requestPersistence();
  }

  // ---------------------------------------------------------------- registry

  register(key: string, s: Saveable) {
    const i = this.saveables.findIndex((x) => x.key === key);
    if (i >= 0) {
      console.warn(`[save] saveable "${key}" replaced`);
      this.saveables[i] = { key, s };
    } else this.saveables.push({ key, s });
  }

  unregister(key: string) {
    const i = this.saveables.findIndex((x) => x.key === key);
    if (i >= 0) this.saveables.splice(i, 1);
  }

  keys(): string[] {
    return this.saveables.map((x) => x.key);
  }

  /** Register a migration that upgrades files of `fromVersion` to `fromVersion + 1`. */
  registerMigration(fromVersion: number, fn: Migration) {
    this.migrations.set(fromVersion, fn);
  }

  /** Add a reason saving is blocked (return a message, or null when saving is fine). Returns a remover. */
  addBlocker(fn: () => string | null): () => void {
    this.blockers.push(fn);
    return () => {
      const i = this.blockers.indexOf(fn);
      if (i >= 0) this.blockers.splice(i, 1);
    };
  }

  /** Why saving is blocked right now, or null: combat, dialogue, a fall, or an added blocker. */
  whyNot(): string | null {
    const g = this.game;
    if (g.dialogue?.active) return 'You cannot save during a conversation';
    if (g.player?.sheet?.vitals.inCombat) return 'You cannot save in combat';
    // A fall: airborne and dropping faster than a jump's descent.
    const body = g.player as { grounded?: boolean; velocity?: { y: number } } | undefined;
    if (body?.grounded === false && (body.velocity?.y ?? 0) < -4) return 'You cannot save while falling';
    for (const b of this.blockers) {
      const r = safeCall(b);
      if (r) return r;
    }
    return null;
  }

  // ---------------------------------------------------------------- snapshot / apply (sync)

  snapshot(meta: Partial<SaveMeta> = {}): SaveFile {
    const data: Record<string, unknown> = {};
    for (const { key, s } of this.saveables) {
      try {
        data[key] = s.save();
      } catch (err) {
        console.error(`[save] "${key}" failed to save`, err);
      }
    }
    const t = this.game.time;
    const hours = t?.totalHours ?? 0;
    return {
      format: SAVE_FORMAT,
      saveVersion: SAVE_VERSION,
      generatorVersion: GENERATOR_VERSION,
      worldSeed: this.worldSeed(),
      gameTime: { totalHours: hours, elapsedDays: Math.floor(hours / 24), date: t?.date?.(), clamp: this.calendarClamp() },
      meta: {
        slot: meta.slot ?? 'snapshot',
        kind: meta.kind ?? 'manual',
        name: meta.name,
        savedAt: new Date().toISOString(),
        gameDate: t?.formatRoman?.() ?? '',
        gameDateModern: t?.formatModern?.(),
        location: this.locationName(),
        level: this.levelOf(),
        playTime: Math.round(this.playTime),
        version: SAVE_VERSION,
      },
      data,
    };
  }

  /** Parse, validate and migrate a save file's text. Never throws. */
  parse(text: string | null): { file?: SaveFile; error?: string } {
    if (!text) return { error: 'empty save' };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { error: 'corrupt save (not valid JSON)' };
    }
    if (!raw || typeof raw !== 'object') return { error: 'not a Skyrome save' };
    let f = raw as Record<string, unknown>;
    const version = typeof f.saveVersion === 'number' ? f.saveVersion : f.version;
    if (f.format !== SAVE_FORMAT || typeof version !== 'number' || !f.data || typeof f.data !== 'object') return { error: 'not a Skyrome save' };
    if (version > SAVE_VERSION) return { error: `save is from a newer version (${version} > ${SAVE_VERSION})` };
    try {
      for (let v = version; v < SAVE_VERSION; v++) {
        const m = this.migrations.get(v);
        f = m ? m(f) : f;
        f = { ...f, saveVersion: v + 1 };
        delete f.version;
      }
    } catch (err) {
      return { error: `migration failed: ${String(err)}` };
    }
    const file = f as unknown as SaveFile;
    file.meta = { ...(file.meta ?? ({} as SaveMeta)), version: file.saveVersion };
    return { file };
  }

  /** Apply a parsed file to every saveable (missing sections are reset). */
  apply(file: SaveFile): { warnings: string[] } {
    const warnings: string[] = [];
    this.game.dialogue?.end?.();
    for (const { key, s } of this.saveables) {
      try {
        if (key in file.data) s.load(file.data[key]);
        else s.reset?.();
      } catch (err) {
        console.error(`[save] "${key}" failed to load`, err);
        warnings.push(key);
      }
    }
    for (const { key, s } of this.saveables) {
      try {
        s.afterLoad?.();
      } catch (err) {
        console.error(`[save] "${key}" afterLoad failed`, err);
        if (!warnings.includes(key)) warnings.push(key);
      }
    }
    if (typeof file.meta?.playTime === 'number') this.playTime = file.meta.playTime;
    this.lastAutosave = this.playTime;
    this.lastQuestAutosave = -Infinity;
    this.pendingAutosave = null;
    return { warnings };
  }

  // ---------------------------------------------------------------- slots (async)

  async save(slot: string, opts: { name?: string; kind?: SaveKind; force?: boolean } = {}): Promise<SaveResult> {
    return this.serial(async () => {
      const why = opts.force ? null : this.canSave() ? null : (this.whyNot() ?? 'cannot save right now');
      if (why) return this.fail(slot, why);
      const kind = opts.kind ?? kindOf(slot);
      const file = this.snapshot({ slot, kind, name: opts.name });
      let text: string;
      try {
        text = JSON.stringify(file);
      } catch (err) {
        return this.fail(slot, `could not serialize: ${String(err)}`);
      }
      file.meta.size = text.length;
      try {
        await this.storage.write(this.slotKey(slot), text);
        const idx = await this.readIndex();
        idx.slots[slot] = file.meta;
        await this.writeIndex(idx);
      } catch (err) {
        return this.fail(slot, `storage error: ${String((err as Error)?.message ?? err)}`);
      }
      this.game.events.emit('save:saved', { slot, meta: file.meta });
      this.game.events.emit('rpg:notify', { text: kind === 'quick' ? 'Quicksaved' : kind === 'auto' ? 'Autosaved' : 'Game saved', kind: 'save' });
      return { ok: true, meta: file.meta };
    });
  }

  async load(slot: string): Promise<LoadResult> {
    return this.serial(async () => {
      let text: string | null;
      try {
        text = await this.storage.read(this.slotKey(slot));
      } catch (err) {
        return this.fail(slot, `storage error: ${String(err)}`);
      }
      if (text === null) return this.fail(slot, 'no such save');
      const { file, error } = this.parse(text);
      if (!file) return this.fail(slot, error ?? 'unreadable');
      const { warnings } = this.apply(file);
      this.game.events.emit('save:loaded', { slot, meta: file.meta });
      this.game.events.emit('rpg:notify', { text: warnings.length ? `Loaded (with problems: ${warnings.join(', ')})` : 'Loaded', kind: 'save' });
      return { ok: true, meta: file.meta, warnings };
    });
  }

  quicksave() {
    return this.save('quick', { kind: 'quick' });
  }

  quickload() {
    return this.load('quick');
  }

  /**
   * Save to the next rotating autosave slot. Quest-stage autosaves ('quest') come at most every
   * 120 s; the others (sleep, interiors, the 10-minute timer) go now. `force` skips every check.
   */
  autosave(opts: { force?: boolean; reason?: string } = {}): Promise<SaveResult> {
    const quest = opts.reason === 'quest';
    if (!opts.force && quest && this.playTime - this.lastQuestAutosave < SAVE.questAutosaveInterval) return Promise.resolve({ ok: false, error: 'too soon' });
    if (quest) this.lastQuestAutosave = this.playTime;
    const run = this.autosaving.then(async (): Promise<SaveResult> => {
      const idx = await this.readIndex();
      const slot = `auto${(idx.autoCounter % AUTOSAVE_SLOTS) + 1}`;
      const r = await this.save(slot, { kind: 'auto', force: opts.force });
      if (r.ok) {
        this.lastAutosave = this.playTime;
        const after = await this.readIndex();
        after.autoCounter = idx.autoCounter + 1;
        await this.writeIndex(after);
      }
      return r;
    });
    this.autosaving = run.catch(() => {});
    return run;
  }

  /** Queue an autosave; it runs on the next frame when saving is allowed (e.g. after a conversation). */
  requestAutosave(reason: string) {
    if (reason === 'quest' && this.playTime - this.lastQuestAutosave < SAVE.questAutosaveInterval) return;
    // A more specific reason wins over the timer.
    if (!this.pendingAutosave || this.pendingAutosave === 'timer') this.pendingAutosave = reason;
  }

  /** The 10 manual slots, in order, with their metadata (null = empty). */
  async manualSlots(): Promise<{ slot: string; meta: SaveMeta | null }[]> {
    const idx = await this.readIndex();
    return Array.from({ length: MANUAL_SLOTS }, (_, i) => {
      const slot = `manual-${i + 1}`;
      return { slot, meta: idx.slots[slot] ?? null };
    });
  }

  /** Save into the first empty manual slot (fails when all 10 are used: overwrite one with save()). */
  async saveNew(name?: string): Promise<SaveResult> {
    const free = (await this.manualSlots()).find((s) => !s.meta);
    if (!free) return this.fail('manual', `all ${MANUAL_SLOTS} manual slots are used — overwrite one`);
    return this.save(free.slot, { kind: 'manual', name });
  }

  /** All saves, newest first. */
  async list(): Promise<SaveMeta[]> {
    const idx = await this.readIndex();
    return Object.values(idx.slots).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  /** The most recent save ("Continue"). */
  async latest(): Promise<SaveMeta | null> {
    return (await this.list())[0] ?? null;
  }

  /** Resolves once queued save/load operations (F5/F9, autosaves) have finished. */
  async idle(): Promise<void> {
    await this.autosaving;
    await this.busy;
  }

  async delete(slot: string) {
    await this.serial(async () => {
      await this.storage.remove(this.slotKey(slot)).catch(() => {});
      const idx = await this.readIndex();
      delete idx.slots[slot];
      await this.writeIndex(idx);
    });
  }

  // ---------------------------------------------------------------- export / import (§14.13)

  /** A slot's save file as JSON text, or null if it is missing or unreadable. */
  async exportSave(slot: string): Promise<string | null> {
    let text: string | null = null;
    try {
      text = await this.storage.read(this.slotKey(slot));
    } catch {
      return null;
    }
    return text && this.parse(text).file ? text : null;
  }

  /** Validate (and migrate) a save file's text and store it in a manual slot (default: the first empty one). */
  async importSave(text: string, slot?: string): Promise<SaveResult> {
    const { file, error } = this.parse(text);
    if (!file) return this.fail(slot ?? 'import', error ?? 'unreadable');
    const target = slot ?? (await this.manualSlots()).find((s) => !s.meta)?.slot;
    if (!target) return this.fail('import', `all ${MANUAL_SLOTS} manual slots are used — delete one first`);
    return this.serial(async () => {
      file.meta = { ...file.meta, slot: target, kind: 'manual', name: file.meta.name ?? 'Imported' };
      const out = JSON.stringify(file);
      file.meta.size = out.length;
      try {
        await this.storage.write(this.slotKey(target), out);
        const idx = await this.readIndex();
        idx.slots[target] = file.meta;
        await this.writeIndex(idx);
      } catch (err) {
        return this.fail(target, `storage error: ${String((err as Error)?.message ?? err)}`);
      }
      this.game.events.emit('rpg:notify', { text: 'Save imported', kind: 'save' });
      return { ok: true, meta: file.meta };
    });
  }

  /** Browser: download a slot as `skyrome-<slot>.json`. Returns false if there is nothing to export. */
  async downloadSave(slot: string): Promise<boolean> {
    const text = await this.exportSave(slot);
    if (!text || typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return false;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `skyrome-${slot}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  /** Browser: import a save from a File (an <input type="file"> pick). */
  async importFile(file: Blob, slot?: string): Promise<SaveResult> {
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      return this.fail('import', `could not read the file: ${String(err)}`);
    }
    return this.importSave(text, slot);
  }

  // ---------------------------------------------------------------- system

  lateUpdate(dt: number) {
    if (!this.game.paused) this.playTime += dt;
    if (!this.pendingAutosave && this.playTime - this.lastAutosave >= SAVE.periodicAutosave) this.pendingAutosave = 'timer';
    if (this.pendingAutosave && this.canSave()) {
      const reason = this.pendingAutosave;
      this.pendingAutosave = null;
      // The timer restarts now, so a refused autosave doesn't retry every frame.
      if (reason === 'timer') this.lastAutosave = this.playTime;
      void this.autosave({ reason });
    }
    const input = this.game.input;
    if (!input) return;
    if (input.pressed('quickSave')) void this.quicksave();
    else if (input.pressed('quickLoad')) void this.quickload();
  }

  // ---------------------------------------------------------------- internals

  private slotKey(slot: string) {
    return `${this.prefix}slot:${slot}`;
  }

  private async readIndex(): Promise<SaveIndex> {
    const blank: SaveIndex = { slots: {}, autoCounter: 0 };
    let text: string | null = null;
    try {
      text = await this.storage.read(`${this.prefix}index`);
    } catch {
      /* fall through to rebuild */
    }
    if (text) {
      try {
        const idx = JSON.parse(text) as SaveIndex;
        if (idx && typeof idx.slots === 'object') return { ...blank, ...idx };
      } catch {
        /* corrupt index: rebuild */
      }
    }
    return this.rebuildIndex(blank);
  }

  /** Recreate the index by scanning slot files (corrupt or missing index). */
  private async rebuildIndex(idx: SaveIndex): Promise<SaveIndex> {
    let keys: string[] = [];
    try {
      keys = await this.storage.keys(`${this.prefix}slot:`);
    } catch {
      return idx;
    }
    for (const key of keys) {
      const slot = key.slice(`${this.prefix}slot:`.length);
      try {
        const { file } = this.parse(await this.storage.read(key));
        if (file) idx.slots[slot] = { ...file.meta, slot };
      } catch {
        /* skip unreadable */
      }
    }
    return idx;
  }

  private async writeIndex(idx: SaveIndex) {
    await this.storage.write(`${this.prefix}index`, JSON.stringify(idx));
  }

  private fail(slot: string, error: string): { ok: false; error: string } {
    console.warn(`[save] ${slot}: ${error}`);
    this.game.events.emit('save:error', { slot, error });
    this.game.events.emit('rpg:notify', { text: `Save/load failed: ${error}`, kind: 'warning' });
    return { ok: false, error };
  }

  /** Run storage operations one at a time (F5 mashing). */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.busy.then(fn, fn);
    this.busy = next.catch(() => {});
    return next;
  }

  /** Ask the browser not to evict our storage (Safari evicts after 7 days without a visit). */
  private requestPersistence() {
    try {
      const st = (globalThis.navigator as Navigator | undefined)?.storage;
      if (!st?.persist) return;
      st.persist()
        .then((v) => (this.persisted = v))
        .catch(() => {});
    } catch {
      /* unsupported */
    }
  }

  private registerBuiltins() {
    const game = this.game;
    this.register('time', {
      save: () => game.time?.serialize(),
      load: (d) => {
        const t = d as { totalHours?: number; timeScale?: number } | undefined;
        if (t && typeof t.totalHours === 'number' && Number.isFinite(t.totalHours)) game.time.restore({ totalHours: t.totalHours, timeScale: t.timeScale });
      },
    });
    this.register('player', {
      save: () => {
        const p = game.player;
        if (!p) return null;
        const pos = p.position;
        return { position: [pos.x, pos.y, pos.z], heading: p.heading, yaw: p.yaw, pitch: p.pitch, viewMode: p.viewMode, zoom: p.zoom };
      },
      load: (d) => {
        const p = game.player;
        const s = d as { position?: number[]; heading?: number; yaw?: number; pitch?: number; viewMode?: 'first' | 'third'; zoom?: number } | null;
        if (!p || !s || !Array.isArray(s.position) || s.position.length !== 3 || !s.position.every(Number.isFinite)) return;
        const [x, y, z] = s.position;
        p.teleport({ x, y, z }, finite(s.heading));
        if (finite(s.yaw) !== undefined) p.yaw = s.yaw!;
        if (finite(s.pitch) !== undefined) p.pitch = s.pitch!;
        if (finite(s.zoom) !== undefined) p.zoom = s.zoom!;
        if (s.viewMode === 'first' || s.viewMode === 'third') p.setViewMode(s.viewMode);
        game.world?.refreshAll?.();
      },
    });
    const deltas = new EntityDeltas(game.events);
    game.deltas = deltas;
    this.register('entityDeltas', { save: () => deltas.serialize(), load: (d) => deltas.restore(d), reset: () => deltas.restore(undefined) });
  }
}

function kindOf(slot: string): SaveKind {
  if (slot === 'quick') return 'quick';
  if (/^auto\d+$/.test(slot)) return 'auto';
  return 'manual';
}

function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function safeCall(fn: () => string | null): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
