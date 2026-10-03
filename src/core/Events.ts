/**
 * Typed event bus.
 *
 * Modules add their own events by augmenting `GameEvents` (declaration merging), so nobody
 * has to edit this file to introduce a new event:
 *
 *   declare module '../core/Events' {
 *     interface GameEvents { 'quest:started': { questId: string } }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GameEvents {
  /** Fired once after every system has been initialised and the first frame is about to run. */
  'game:ready': {};
  /** Camera view mode changed. */
  'view:changed': { mode: 'first' | 'third' };
  /** A UI layer that wants exclusive input opened or closed (menus, dialogue, map...). */
  'ui:modal': { open: boolean; id: string };
  /** In-game hour ticked over (0..23). */
  'time:hour': { hour: number; day: number };
}

type Listener<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private listeners = new Map<keyof E, Set<Listener<any>>>();

  on<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => this.off(type, fn);
  }

  once<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof E>(type: K, fn: Listener<E[K]>): void {
    this.listeners.get(type)?.delete(fn);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] listener for "${String(type)}" threw`, err);
      }
    }
  }
}
