/** Save-game contracts. */

/** Anything with state worth saving. Register with game.save.register(key, saveable). */
export interface Saveable {
  /** JSON-serializable snapshot. */
  save(): unknown;
  /** Restore from a snapshot (may be from an older version; be defensive). */
  load(data: unknown): void;
  /** Return to new-game state; called on load when the file has no data for this key. */
  reset?(): void;
  /** Called after every section has loaded, for fix-ups that depend on other sections. */
  afterLoad?(): void;
}

export type SaveKind = 'quick' | 'auto' | 'manual';

export interface SaveMeta {
  slot: string;
  kind: SaveKind;
  /** Player-given name for manual saves. */
  name?: string;
  /** Real-world time (ISO 8601). */
  savedAt: string;
  /** In-game date, Roman style (GameTime.formatRoman()). */
  gameDate: string;
  /** In-game date, modern style. */
  gameDateModern?: string;
  /** Location name at save time. */
  location?: string;
  level?: number;
  /** Real seconds played. */
  playTime: number;
  version: number;
  /** Serialized size in characters. */
  size?: number;
}

export interface SaveFile {
  format: 'skyrome-save';
  version: number;
  meta: SaveMeta;
  data: Record<string, unknown>;
}

/** Async key-value storage for save files (localStorage, IndexedDB, memory). */
export interface SaveStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export interface SaveResult {
  ok: boolean;
  meta?: SaveMeta;
  error?: string;
}

export interface LoadResult {
  ok: boolean;
  meta?: SaveMeta;
  error?: string;
  /** Sections that failed to load (the rest loaded). */
  warnings?: string[];
}
