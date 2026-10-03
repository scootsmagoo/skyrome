/**
 * Faction membership, ranks and Fama (game.factions) — docs/GDD.md §9.1 and §3.4.
 *
 *   - Ranks are granted by quest completion (promote / grantRank). A rank with skill gates (every
 *     gate must pass; a gate naming several skills needs any one) waits as a pending promotion
 *     until you reach the skill — checkPromotions() applies it.
 *   - Fama (−100…+100 per faction: the `fama.<id>` tracks) no longer gates rank by default; a
 *     rank with a non-zero minReputation still asks for it.
 *   - Some factions take only citizens; non-citizens may be capped (the Clientela: amicus); some
 *     exclude each other (Greens vs Blues); some cost Infamia to join (the gladiator's oath +20).
 */
import type { EventBus, GameEvents } from '../core/Events';
import { FACTIONS, REPUTATION_MAX, REPUTATION_MIN } from './data/factions';
import type { FactionDef, FactionRank } from './types';
import './events';

export type JoinBlocker = 'unknown' | 'member' | 'not-joinable' | 'citizens-only' | 'exclusive';

export interface PromotionNeeds {
  rank: FactionRank;
  /** Skill gates not yet met. */
  skills: { skill: string | string[]; level: number }[];
  /** Fama still missing (only for ranks that ask for it). */
  reputation: number;
  /** Capped as a non-citizen. */
  citizenship: boolean;
}

export class FactionSystem {
  private readonly defs = new Map<string, FactionDef>();
  private readonly rep = new Map<string, number>();
  private readonly members = new Set<string>();
  /** Rank index held, per faction. */
  private readonly held = new Map<string, number>();
  /** Rank index granted by a quest but waiting for its gates. */
  private readonly pending = new Map<string, number>();
  /** Multiplier on positive Fama gains (the Laudatio perk sets this through install). */
  gainMultiplier: () => number = () => 1;
  /** Skill lookup for gated ranks; without it gates are ignored. */
  skillLevel?: (id: string) => number;
  /** Citizenship check (citizens-only factions, non-citizen caps); without it everyone counts as a citizen. */
  isCitizen?: () => boolean;

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

  /** Fama with a faction (−100…+100), the `fama.<id>` track. */
  reputation(id: string): number {
    return this.rep.get(id) ?? 0;
  }

  isMember(id: string) {
    return this.members.has(id);
  }

  joined(): string[] {
    return [...this.members];
  }

  private ranks(id: string): FactionRank[] {
    return this.defs.get(id)?.ranks ?? [];
  }

  /** Current rank (members only; joining gives the first). */
  rank(id: string): FactionRank | undefined {
    if (!this.members.has(id)) return undefined;
    const ranks = this.ranks(id);
    return ranks[Math.min(this.held.get(id) ?? 0, ranks.length - 1)];
  }

  /** 0-based rank index, or -1 when not a member. */
  rankIndex(id: string): number {
    return this.members.has(id) ? (this.held.get(id) ?? 0) : -1;
  }

  /** A promotion granted by a quest that waits for its skill gates, if any. */
  pendingRank(id: string): FactionRank | undefined {
    const i = this.pending.get(id);
    return i === undefined ? undefined : this.ranks(id)[i];
  }

  private gatePasses(g: { skill: string | string[]; level: number }): boolean {
    if (!this.skillLevel) return true;
    return [g.skill].flat().some((s) => this.skillLevel!(s) >= g.level);
  }

  /** What a rank still needs from you (empty lists and zeros when you qualify). */
  needs(id: string, rankId: string): PromotionNeeds | undefined {
    const ranks = this.ranks(id);
    const i = ranks.findIndex((r) => r.id === rankId);
    if (i < 0) return undefined;
    const rank = ranks[i];
    const cap = this.defs.get(id)?.nonCitizenMaxRank;
    const capIndex = cap ? ranks.findIndex((r) => r.id === cap) : -1;
    return {
      rank,
      skills: (rank.requires ?? []).filter((g) => !this.gatePasses(g)),
      reputation: Math.max(0, (rank.minReputation ?? 0) - this.reputation(id)),
      citizenship: capIndex >= 0 && i > capIndex && !!this.isCitizen && !this.isCitizen(),
    };
  }

  private qualifies(id: string, rankIndex: number): boolean {
    const n = this.needs(id, this.ranks(id)[rankIndex]?.id ?? '');
    return !!n && !n.skills.length && n.reputation <= 0 && !n.citizenship;
  }

  /** The next rank up and what it needs (all ranks are granted by quests). */
  nextRank(id: string): (PromotionNeeds & { quest: true }) | undefined {
    const next = this.ranks(id)[this.rankIndex(id) + 1];
    if (!next) return undefined;
    return { ...this.needs(id, next.id)!, quest: true };
  }

  joinBlocker(id: string): JoinBlocker | null {
    const d = this.defs.get(id);
    if (!d) return 'unknown';
    if (this.members.has(id)) return 'member';
    if (!d.ranks.length) return 'not-joinable';
    if (d.citizensOnly && this.isCitizen && !this.isCitizen()) return 'citizens-only';
    if (d.exclusiveWith?.some((x) => this.members.has(x))) return 'exclusive';
    return null;
  }

  join(id: string): boolean {
    if (this.joinBlocker(id)) return false;
    const d = this.defs.get(id)!;
    this.members.add(id);
    this.held.set(id, 0);
    this.events?.emit('faction:joined', { factionId: id });
    this.events?.emit('rpg:notify', { text: `Joined ${d.name}`, kind: 'faction' });
    return true;
  }

  leave(id: string) {
    if (!this.members.delete(id)) return;
    this.held.delete(id);
    this.pending.delete(id);
    this.events?.emit('faction:left', { factionId: id });
  }

  /** A quest grants the next rank (it waits if a gate isn't met). Returns the rank now held. */
  promote(id: string): FactionRank | undefined {
    if (!this.members.has(id)) return undefined;
    const next = this.rankIndex(id) + 1;
    const top = this.ranks(id).length - 1;
    const target = Math.max(next, (this.pending.get(id) ?? -1) + 1);
    if (target > top) return this.rank(id);
    return this.grantIndex(id, target);
  }

  /** A quest grants a named rank (capstones, invitations); joins if needed. Waits for gates. */
  grantRank(id: string, rankId: string): boolean {
    const i = this.ranks(id).findIndex((r) => r.id === rankId);
    if (i < 0) return false;
    if (!this.members.has(id)) {
      this.members.add(id);
      this.held.set(id, 0);
    }
    this.grantIndex(id, i);
    return true;
  }

  private grantIndex(id: string, target: number): FactionRank | undefined {
    if (target <= this.rankIndex(id)) return this.rank(id);
    if (this.qualifies(id, target)) {
      this.setRank(id, target);
      if ((this.pending.get(id) ?? -1) <= target) this.pending.delete(id);
    } else {
      this.pending.set(id, Math.max(target, this.pending.get(id) ?? -1));
      const r = this.ranks(id)[target];
      this.events?.emit('rpg:notify', { text: `${this.defs.get(id)!.name}: ${r.title} awaits — ${this.describeNeeds(id, r.id)}`, kind: 'faction' });
    }
    return this.rank(id);
  }

  private describeNeeds(id: string, rankId: string): string {
    const n = this.needs(id, rankId)!;
    const parts = n.skills.map((g) => `${[g.skill].flat().join(' or ')} ${g.level}`);
    if (n.citizenship) parts.push('citizenship');
    if (n.reputation > 0) parts.push(`${n.reputation} more Fama`);
    return parts.join(', ');
  }

  private setRank(id: string, index: number) {
    const before = this.rankIndex(id);
    this.held.set(id, index);
    if (index !== before) {
      const r = this.ranks(id)[index];
      this.events?.emit('faction:rank', { factionId: id, rankId: r.id, title: r.title });
      this.events?.emit('rpg:notify', { text: `${this.defs.get(id)!.name}: you are now ${r.title}`, kind: 'faction' });
    }
  }

  /** Apply pending promotions whose gates are now met (call after skill level-ups). Returns how many applied. */
  checkPromotions(): number {
    let n = 0;
    for (const [id, target] of [...this.pending]) {
      if (!this.members.has(id)) {
        this.pending.delete(id);
        continue;
      }
      // Rise as far as the gates allow, one rank at a time.
      let i = this.rankIndex(id);
      while (i < target && this.qualifies(id, i + 1)) i++;
      if (i > this.rankIndex(id)) {
        this.setRank(id, i);
        n++;
      }
      if (i >= target) this.pending.delete(id);
    }
    return n;
  }

  addReputation(id: string, amount: number) {
    if (!this.defs.has(id) || !amount) return;
    if (amount > 0) amount *= this.gainMultiplier();
    const value = Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, this.reputation(id) + amount));
    const delta = value - this.reputation(id);
    this.rep.set(id, value);
    this.events?.emit('faction:reputation', { factionId: id, amount: value, delta });
  }

  /** True if members of a and b fight on sight. */
  areEnemies(a: string, b: string): boolean {
    return !!(this.defs.get(a)?.enemies?.includes(b) || this.defs.get(b)?.enemies?.includes(a));
  }

  /** Hostile to the player: listed as an enemy of 'player', or Fama at −50 or worse. */
  hostileToPlayer(id: string): boolean {
    return !!this.defs.get(id)?.enemies?.includes('player') || this.reputation(id) <= -50;
  }

  serialize() {
    return { rep: Object.fromEntries(this.rep), members: [...this.members], held: Object.fromEntries(this.held), pending: Object.fromEntries(this.pending) };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as { rep?: Record<string, number>; members?: string[]; held?: Record<string, number>; pending?: Record<string, number>; granted?: Record<string, string> };
    this.rep.clear();
    this.members.clear();
    this.held.clear();
    this.pending.clear();
    for (const [k, v] of Object.entries(d.rep ?? {})) if (typeof v === 'number' && Number.isFinite(v)) this.rep.set(k, Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, v)));
    for (const m of Array.isArray(d.members) ? d.members : []) if (this.defs.has(m)) this.members.add(m);
    const idx = (id: string, v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < this.ranks(id).length ? v : undefined);
    for (const id of this.members) this.held.set(id, idx(id, d.held?.[id]) ?? 0);
    // Older saves stored granted rank ids.
    for (const [id, rankId] of Object.entries(d.granted ?? {})) {
      const i = this.ranks(id).findIndex((r) => r.id === rankId);
      if (i >= 0 && this.members.has(id)) this.held.set(id, Math.max(this.held.get(id) ?? 0, i));
    }
    for (const [id, v] of Object.entries(d.pending ?? {})) {
      const i = idx(id, v);
      if (i !== undefined && this.members.has(id)) this.pending.set(id, i);
    }
  }
}
