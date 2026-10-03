/**
 * Save storage backends. The default (GDD §14.13) is IndexedDB, with every access in try/catch and
 * localStorage as the fallback when IndexedDB is missing or fails (FallbackStorage), then memory.
 * HybridStorage (localStorage first, IndexedDB for big saves) is kept for callers that want it.
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
      const p = new Promise<IDBDatabase>((resolve, reject) => {
        if (!this.idb) return reject(new Error('IndexedDB unavailable'));
        const req = this.idb.open(this.dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(this.store);
        req.onsuccess = () => {
          const db = req.result;
          // A closed connection (another tab upgrading, the browser clearing storage) is reopened next time.
          const forget = () => {
            if (this.dbp === p) this.dbp = null;
          };
          db.onversionchange = () => {
            db.close();
            forget();
          };
          db.onclose = forget;
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      });
      this.dbp = p;
      p.catch(() => {
        if (this.dbp === p) this.dbp = null;
      });
    }
    return this.dbp;
  }

  /**
   * Run one request in its own transaction. It settles when the transaction does: a write that
   * the browser aborts on commit (QuotaExceededError) rejects even though its request succeeded.
   */
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      let t: IDBTransaction;
      let req: IDBRequest<T>;
      try {
        t = db.transaction(this.store, mode);
        req = fn(t.objectStore(this.store));
      } catch (err) {
        this.dbp = null; // e.g. InvalidStateError on a closed connection
        reject(err);
        return;
      }
      const fail = () => {
        let err: unknown = t.error;
        try {
          err ??= req.error; // throws while the request is still pending
        } catch {
          /* keep the transaction's error */
        }
        reject(err ?? new Error('IndexedDB transaction failed'));
      };
      req.onerror = fail;
      t.oncomplete = () => resolve(req.result);
      t.onabort = fail;
      t.onerror = fail;
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

/**
 * Primary storage with a fallback. Writes go to the primary and, if it throws, to the fallback.
 * The fallback holds a key only while its copy is the newest one: a successful primary write
 * removes the fallback's copy before it resolves, and a fallback write also tries to drop the
 * primary's older copy. Reads therefore prefer the fallback's copy, then the primary's; keys merge.
 */
export class FallbackStorage implements SaveStorage {
  constructor(
    readonly primary: SaveStorage,
    readonly fallback: SaveStorage,
  ) {}

  async read(key: string) {
    let v: string | null = null;
    try {
      v = await this.fallback.read(key);
    } catch {
      v = null;
    }
    if (v !== null) return v;
    try {
      return await this.primary.read(key);
    } catch {
      return null;
    }
  }

  async write(key: string, value: string) {
    try {
      await this.primary.write(key, value);
    } catch {
      await this.fallback.write(key, value);
      // The primary's copy (if any) is now older; best effort, reads prefer the fallback anyway.
      this.primary.remove(key).catch(() => {});
      return;
    }
    // An older copy may sit in the fallback from a time the primary failed; it must not shadow this one.
    try {
      await this.fallback.remove(key);
    } catch {
      // Can't remove it: overwrite it with the new value instead (it then still reads the newest).
      await this.fallback.write(key, value).catch(() => {});
    }
  }

  async remove(key: string) {
    await this.primary.remove(key).catch(() => {});
    await this.fallback.remove(key).catch(() => {});
  }

  async keys(prefix: string) {
    const set = new Set<string>();
    for (const s of [this.primary, this.fallback]) for (const k of await s.keys(prefix).catch(() => [] as string[])) set.add(k);
    return [...set];
  }
}

/** The browser default: IndexedDB, falling back to localStorage, then memory when storage is blocked. */
export function createDefaultStorage(): SaveStorage {
  let ls: WebStorageLike | null = null;
  try {
    ls = globalThis.localStorage ?? null;
    ls?.getItem('skyrome.probe');
  } catch {
    ls = null;
  }
  const idb = IdbSaveStorage.available() ? new IdbSaveStorage() : null;
  const local = ls ? new LocalSaveStorage(ls) : null;
  if (idb && local) return new FallbackStorage(idb, local);
  return idb ?? local ?? new MemoryStorage();
}
