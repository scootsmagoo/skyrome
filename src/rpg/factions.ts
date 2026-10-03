/** Faction membership, reputation and ranks (game.factions). */
import type { EventBus, GameEvents } from '../core/Events';
import { FACTIONS, REPUTATION_MAX, REPUTATION_MIN } from './data/factions';
import type { FactionDef, FactionRank } from './types';
import './events';

export class FactionSystem {
  private readonly defs = new Map<string, FactionDef>();
  private readonly rep = new Map<string, number>();
  private readonly members = new Set<string>();
  /** Multiplier on positive reputation gains (the Clientela perk sets this through install). */
  gainMultiplier: () => number = () => 1;

  constructor(
    defs: readonly FactionDef[] = FACTIONS,
    private readonly events?: EventBus<GameEvents>,
  ) {
    for (const d of defs) this.defs.set(d.id, d);
  }

  def(id: string) {
    return this.defs.get(id);
  }

  all(): FactionDef[] {
    return [...this.defs.values()];
  }

  reputation(id: string): number {
    return this.rep.get(id) ?? 0;
  }

  isMember(id: string) {
    return this.members.has(id);
  }

  joined(): string[] {
    return [...this.members];
  }

  /** Current rank (members only), the highest whose threshold is met. */
  rank(id: string): FactionRank | undefined {
    if (!this.members.has(id)) return undefined;
    const ranks = this.defs.get(id)?.ranks ?? [];
    let best: FactionRank | undefined;
    for (const r of ranks) if (this.reputation(id) >= r.minReputation && (!best || r.minReputation >= best.minReputation)) best = r;
    return best ?? ranks[0];
  }

  /** 0-based rank index, or -1 when not a member. */
  rankIndex(id: string): number {
    const r = this.rank(id);
    if (!r) return -1;
    return [...(this.defs.get(id)?.ranks ?? [])].sort((a, b) => a.minReputation - b.minReputation).indexOf(r);
  }

  join(id: string): boolean {
    const d = this.defs.get(id);
    if (!d || this.members.has(id) || !d.ranks.length) return false;
    this.members.add(id);
    this.events?.emit('faction:joined', { factionId: id });
    this.events?.emit('rpg:notify', { text: `Joined ${d.name}`, kind: 'faction' });
    return true;
  }

  leave(id: string) {
    if (!this.members.delete(id)) return;
    this.events?.emit('faction:left', { factionId: id });
  }

  addReputation(id: string, amount: number) {
    if (!this.defs.has(id) || !amount) return;
    if (amount > 0) amount *= this.gainMultiplier();
    const before = this.rank(id);
    const value = Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, this.reputation(id) + amount));
    const delta = value - this.reputation(id);
    this.rep.set(id, value);
    this.events?.emit('faction:reputation', { factionId: id, amount: value, delta });
    const after = this.rank(id);
    if (after && after !== before && before) {
      this.events?.emit('faction:rank', { factionId: id, rankId: after.id, title: after.title });
      this.events?.emit('rpg:notify', { text: `${this.defs.get(id)!.name}: you are now ${after.title}`, kind: 'faction' });
    }
  }

  /** True if members of a and b fight on sight. */
  areEnemies(a: string, b: string): boolean {
    return !!(this.defs.get(a)?.enemies?.includes(b) || this.defs.get(b)?.enemies?.includes(a));
  }

  /** Hostile to the player: listed as an enemy of 'player', or reputation at −500 or worse. */
  hostileToPlayer(id: string): boolean {
    return !!this.defs.get(id)?.enemies?.includes('player') || this.reputation(id) <= -500;
  }

  serialize() {
    return { rep: Object.fromEntries(this.rep), members: [...this.members] };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as { rep?: Record<string, number>; members?: string[] };
    this.rep.clear();
    this.members.clear();
    for (const [k, v] of Object.entries(d.rep ?? {})) if (typeof v === 'number' && Number.isFinite(v)) this.rep.set(k, v);
    for (const m of Array.isArray(d.members) ? d.members : []) if (this.defs.has(m)) this.members.add(m);
  }
}
