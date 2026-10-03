/**
 * Save games (game.save). Modules register Saveables under a key; a save file is
 *   { format: 'skyrome-save', version, meta, data: { [key]: saveable.save() } }
 * stored per slot. Slots: 'quick' (F5 / F9), 'auto1'..'auto3' (rotating), 'manual-N'.
 * An index of slot metadata makes the load menu cheap. Loading never throws: corrupt or
 * newer-version files are refused with an error, and a failing section is skipped with a warning.
 *
 * Built-in saveables: 'time' (GameTime) and 'player' (position, heading, camera, view mode).
 */
import type { Game, System } from '../core/Game';
import '../rpg/events';
import { createDefaultStorage } from './storage';
import type { LoadResult, Saveable, SaveFile, SaveKind, SaveMeta, SaveResult, SaveStorage } from './types';

declare module '../core/Game' {
  interface Game {
    save: SaveSystem;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    'save:saved': { slot: string; meta: SaveMeta };
    'save:loaded': { slot: string; meta: SaveMeta };
    'save:error': { slot: string; error: string };
  }
}

export const SAVE_FORMAT = 'skyrome-save';
/** Bump when the shape of saved data changes, and register a migration from the old version. */
export const SAVE_VERSION = 1;
export const AUTOSAVE_SLOTS = 3;

interface SaveIndex {
  slots: Record<string, SaveMeta>;
  autoCounter: number;
  manualCounter: number;
}

export interface SaveSystemOptions {
  storage?: SaveStorage;
  /** Key prefix in storage. */
  prefix?: string;
  /** Register the 'time' and 'player' saveables (default true). */
  builtins?: boolean;
}

type Migration = (file: SaveFile) => SaveFile;

export class SaveSystem implements System {
  readonly name = 'save';
  readonly priority = 1100;
  readonly storage: SaveStorage;
  readonly prefix: string;
  /** Real seconds played (not counting pauses). */
  playTime = 0;
  /** Gate for saving (e.g. not in combat). Dialogue blocks saving by default. */
  canSave: () => boolean = () => !this.game.dialogue?.active;
  /** Minimum real seconds between autosaves. */
  autosaveMinInterval = 60;
  /** Location name for metadata. */
  locationName: () => string | undefined = () => this.game.locations?.current()?.name;
  /** Character level for metadata. */
  levelOf: () => number | undefined = () => this.game.player?.sheet?.level;
  private readonly saveables: { key: string; s: Saveable }[] = [];
  private readonly migrations = new Map<number, Migration>();
  private lastAutosave = -Infinity;
  private busy: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly game: Game,
    opts: SaveSystemOptions = {},
  ) {
    this.storage = opts.storage ?? createDefaultStorage();
    this.prefix = opts.prefix ?? 'skyrome.save.';
    if (opts.builtins !== false) this.registerBuiltins();
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
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
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

  /** Parse and validate a save file's text. Never throws. */
  parse(text: string | null): { file?: SaveFile; error?: string } {
    if (!text) return { error: 'empty save' };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { error: 'corrupt save (not valid JSON)' };
    }
    const f = raw as Partial<SaveFile>;
    if (!f || typeof f !== 'object' || f.format !== SAVE_FORMAT || typeof f.version !== 'number' || !f.data || typeof f.data !== 'object') return { error: 'not a Skyrome save' };
    if (f.version > SAVE_VERSION) return { error: `save is from a newer version (${f.version} > ${SAVE_VERSION})` };
    let file = f as SaveFile;
    try {
      for (let v = file.version; v < SAVE_VERSION; v++) {
        const m = this.migrations.get(v);
        if (m) file = m(file);
        file = { ...file, version: v + 1 };
      }
    } catch (err) {
      return { error: `migration failed: ${String(err)}` };
    }
    file.meta = { ...(file.meta ?? ({} as SaveMeta)), version: file.version };
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
    return { warnings };
  }

  // ---------------------------------------------------------------- slots (async)

  async save(slot: string, opts: { name?: string; kind?: SaveKind; force?: boolean } = {}): Promise<SaveResult> {
    return this.serial(async () => {
      if (!opts.force && !this.canSave()) return this.fail(slot, 'cannot save right now');
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

  /** Save to the next rotating autosave slot (rate-limited unless forced). */
  async autosave(opts: { force?: boolean } = {}): Promise<SaveResult> {
    if (!opts.force && this.playTime - this.lastAutosave < this.autosaveMinInterval) return { ok: false, error: 'too soon' };
    const idx = await this.readIndex();
    const slot = `auto${(idx.autoCounter % AUTOSAVE_SLOTS) + 1}`;
    const r = await this.save(slot, { kind: 'auto' });
    if (r.ok) {
      this.lastAutosave = this.playTime;
      const after = await this.readIndex();
      after.autoCounter = idx.autoCounter + 1;
      await this.writeIndex(after);
    }
    return r;
  }

  /** New manual slot ('manual-1', 'manual-2', …). */
  async saveNew(name?: string): Promise<SaveResult> {
    const idx = await this.readIndex();
    const slot = `manual-${idx.manualCounter + 1}`;
    const r = await this.save(slot, { kind: 'manual', name });
    if (r.ok) {
      const after = await this.readIndex();
      after.manualCounter = idx.manualCounter + 1;
      await this.writeIndex(after);
    }
    return r;
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

  /** Resolves once queued save/load operations (e.g. from F5/F9) have finished. */
  idle(): Promise<void> {
    return this.busy.then(() => {});
  }

  async delete(slot: string) {
    await this.serial(async () => {
      await this.storage.remove(this.slotKey(slot)).catch(() => {});
      const idx = await this.readIndex();
      delete idx.slots[slot];
      await this.writeIndex(idx);
    });
  }

  // ---------------------------------------------------------------- system

  lateUpdate(dt: number) {
    if (!this.game.paused) this.playTime += dt;
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
    const blank: SaveIndex = { slots: {}, autoCounter: 0, manualCounter: 0 };
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
      const m = /^manual-(\d+)$/.exec(slot);
      if (m) idx.manualCounter = Math.max(idx.manualCounter, Number(m[1]));
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
