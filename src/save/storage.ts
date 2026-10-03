/**
 * Save storage backends. The default is HybridStorage: localStorage for normal saves (fast,
 * synchronous under the hood) and IndexedDB for anything over the size guard or when
 * localStorage is full. A localStorage entry of '@idb' points at the IndexedDB copy.
 */
import type { SaveStorage } from './types';

/** In-memory storage (tests, private browsing fallback). */
export class MemoryStorage implements SaveStorage {
  readonly map = new Map<string, string>();
  async read(key: string) {
    return this.map.get(key) ?? null;
  }
  async write(key: string, value: string) {
    this.map.set(key, value);
  }
  async remove(key: string) {
    this.map.delete(key);
  }
  async keys(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
}

/** Minimal Web Storage shape (so tests can pass a fake). */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export class LocalSaveStorage implements SaveStorage {
  constructor(private readonly ls: WebStorageLike) {}
  async read(key: string) {
    return this.ls.getItem(key);
  }
  async write(key: string, value: string) {
    this.ls.setItem(key, value); // throws QuotaExceededError when full
  }
  async remove(key: string) {
    this.ls.removeItem(key);
  }
  async keys(prefix: string) {
    const out: string[] = [];
    for (let i = 0; i < this.ls.length; i++) {
      const k = this.ls.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
    return out;
  }
}

export class IdbSaveStorage implements SaveStorage {
  private dbp: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName = 'skyrome',
    private readonly store = 'saves',
    private readonly idb: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  static available(): boolean {
    return typeof globalThis.indexedDB !== 'undefined';
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        if (!this.idb) return reject(new Error('IndexedDB unavailable'));
        const req = this.idb.open(this.dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(this.store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      this.dbp.catch(() => (this.dbp = null));
    }
    return this.dbp;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(this.store, mode);
      const req = fn(t.objectStore(this.store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async read(key: string) {
    const v = await this.tx('readonly', (s) => s.get(key));
    return typeof v === 'string' ? v : null;
  }
  async write(key: string, value: string) {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async remove(key: string) {
    await this.tx('readwrite', (s) => s.delete(key));
  }
  async keys(prefix: string) {
    const all = await this.tx('readonly', (s) => s.getAllKeys());
    return all.map(String).filter((k) => k.startsWith(prefix));
  }
}

export const IDB_POINTER = '@idb';

/** localStorage first; IndexedDB for large saves or when localStorage is full. */
export class HybridStorage implements SaveStorage {
  constructor(
    private readonly local: SaveStorage,
    private readonly big: SaveStorage | null,
    /** Values longer than this (characters) go straight to `big`. ~1M chars ≈ 2 MB of localStorage. */
    readonly sizeGuard = 1_000_000,
  ) {}

  async read(key: string) {
    const v = await this.local.read(key);
    if (v === IDB_POINTER) return this.big ? this.big.read(key) : null;
    return v;
  }

  async write(key: string, value: string) {
    if (value.length > this.sizeGuard && this.big) return this.writeBig(key, value);
    try {
      await this.local.write(key, value);
      // A previous large save may still sit in IndexedDB.
      this.big?.remove(key).catch(() => {});
    } catch (err) {
      if (!this.big) throw err;
      await this.writeBig(key, value);
    }
  }

  private async writeBig(key: string, value: string) {
    await this.big!.write(key, value);
    await this.local.write(key, IDB_POINTER);
  }

  async remove(key: string) {
    await this.local.remove(key).catch(() => {});
    await this.big?.remove(key).catch(() => {});
  }

  async keys(prefix: string) {
    const set = new Set(await this.local.keys(prefix));
    if (this.big) for (const k of await this.big.keys(prefix).catch(() => [] as string[])) set.add(k);
    return [...set];
  }
}

/** The browser default: Hybrid(localStorage, IndexedDB), degrading to memory when storage is blocked. */
export function createDefaultStorage(): SaveStorage {
  let ls: WebStorageLike | null = null;
  try {
    ls = globalThis.localStorage ?? null;
    ls?.getItem('skyrome.probe');
  } catch {
    ls = null;
  }
  const big = IdbSaveStorage.available() ? new IdbSaveStorage() : null;
  if (!ls) return big ?? new MemoryStorage();
  return new HybridStorage(new LocalSaveStorage(ls), big);
}
