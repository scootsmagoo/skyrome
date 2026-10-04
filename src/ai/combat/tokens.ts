/**
 * Attack tokens (§6.12, §6.13): only so many NPCs may attack one target at a time — 1 on Tiro,
 * 2 on Normal, 3 on Difficilis. An NPC needs a token to enter `engage`; the rest circle. Bosses
 * spend 2 tokens. Fairness: a token goes to whoever has been waiting longest for that target, and
 * a holder must give it back after `maxHold` seconds so the circle rotates.
 *
 * Pure logic; tests in tests/combat-ai.test.ts.
 */

interface Hold {
  target: string;
  cost: number;
  since: number;
}

interface Wait {
  target: string;
  cost: number;
  since: number;
  seen: number;
}

export class AttackTokens {
  /** Seconds a holder may keep its token before it must release it. */
  maxHold = 4.5;
  /** A waiting request is forgotten if not repeated within this long. */
  waitMemory = 0.6;
  private held = new Map<string, Hold>();
  private waiting = new Map<string, Wait>();

  /** `capacity(targetId)`: tokens available against that target. */
  constructor(public capacity: (targetId: string) => number = () => 2) {}

  /**
   * Ask for a token against `target`. Returns true if `holder` now holds one (or already did).
   * Call it repeatedly while waiting; the earliest waiter for a target is served first.
   */
  request(holder: string, target: string, cost: number, now: number): boolean {
    const h = this.held.get(holder);
    if (h && h.target === target) return true;
    if (h) this.held.delete(holder);
    for (const [id, w] of this.waiting) if (now - w.seen > this.waitMemory) this.waiting.delete(id);
    let w = this.waiting.get(holder);
    if (!w || w.target !== target) {
      w = { target, cost, since: now, seen: now };
      this.waiting.set(holder, w);
    }
    w.seen = now;
    w.cost = cost;
    const cap = this.capacity(target);
    const used = this.used(target);
    const free = cap - used;
    // A lone boss (cost 2) may still attack on Tiro (capacity 1) when nobody else holds a token.
    const lone = (c: number) => cap > 0 && used === 0 && c > cap;
    const fits = cost <= free || lone(cost);
    if (!fits) return false;
    for (const [id, o] of this.waiting) {
      if (id !== holder && o.target === target && o.since < w.since && (o.cost <= free || lone(o.cost))) return false;
    }
    this.held.set(holder, { target, cost, since: now });
    this.waiting.delete(holder);
    return true;
  }

  /** Give the token back (attack turn over, state change, death). */
  release(holder: string): void {
    this.held.delete(holder);
  }

  /** Forget a holder completely (despawn). */
  forget(holder: string): void {
    this.held.delete(holder);
    this.waiting.delete(holder);
  }

  /** Does `holder` hold a token (against `target`, if given)? */
  holds(holder: string, target?: string): boolean {
    const h = this.held.get(holder);
    return !!h && (target === undefined || h.target === target);
  }

  /** The token has been held longer than `maxHold`. */
  overdue(holder: string, now: number): boolean {
    const h = this.held.get(holder);
    return !!h && now - h.since > this.maxHold;
  }

  /** Tokens in use against a target. */
  used(target: string): number {
    let n = 0;
    for (const h of this.held.values()) if (h.target === target) n += h.cost;
    return n;
  }

  /** Ids holding tokens against a target. */
  holders(target: string): string[] {
    const out: string[] = [];
    for (const [id, h] of this.held) if (h.target === target) out.push(id);
    return out;
  }
}
