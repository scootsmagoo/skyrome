/**
 * Faction membership, Fama (reputation, −100…+100) and ranks (game.factions) — GDD §3.4, §9.1.
 * A rank needs its Fama threshold and, for top ranks, skills (every gate must pass; a gate listing
 * several skills needs any one). Capstone ranks are granted by their quest (grantRank). Some
 * factions take only citizens; some exclude each other (Greens vs Blues).
 */
import type { EventBus, GameEvents } from '../core/Events';
import { FACTIONS, REPUTATION_MAX, REPUTATION_MIN } from './data/factions';
import type { FactionDef, FactionRank } from './types';
import './events';

export type JoinBlocker = 'unknown' | 'member' | 'not-joinable' | 'citizens-only' | 'exclusive';

export class FactionSystem {
  private readonly defs = new Map<string, FactionDef>();
  private readonly rep = new Map<string, number>();
  private readonly members = new Set<string>();
  /** Ranks granted by quests (capstones, invitations). */
  private readonly granted = new Map<string, string>();
  /** Multiplier on positive Fama gains (the Laudatio perk sets this through install). */
  gainMultiplier: () => number = () => 1;
  /** Skill lookup for skill-gated ranks; without it gates are ignored. */
  skillLevel?: (id: string) => number;
  /** Citizenship check for citizens-only factions; without it everyone may join. */
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

  /** Fama with a faction (−100…+100). */
  reputation(id: string): number {
    return this.rep.get(id) ?? 0;
  }

  isMember(id: string) {
    return this.members.has(id);
  }

  joined(): string[] {
    return [...this.members];
  }

  private sortedRanks(id: string): FactionRank[] {
    return [...(this.defs.get(id)?.ranks ?? [])].sort((a, b) => a.minReputation - b.minReputation);
  }

  /** Current rank (members only): the highest earned by Fama and skills, or granted by a quest. */
  rank(id: string): FactionRank | undefined {
    if (!this.members.has(id)) return undefined;
    const ranks = this.sortedRanks(id);
    let best: FactionRank | undefined;
    for (const r of ranks) if (!r.questOnly && this.qualifies(id, r)) best = r;
    const g = this.granted.get(id);
    const granted = g ? ranks.find((r) => r.id === g) : undefined;
    if (granted && (!best || ranks.indexOf(granted) > ranks.indexOf(best))) best = granted;
    return best ?? ranks[0];
  }

  /** 0-based rank index, or -1 when not a member. */
  rankIndex(id: string): number {
    const r = this.rank(id);
    return r ? this.sortedRanks(id).indexOf(r) : -1;
  }

  /** The next rank up and what it still needs (Fama, skill gates not met, or a quest). */
  nextRank(id: string): { rank: FactionRank; reputation: number; skills: { skill: string | string[]; level: number }[]; quest: boolean } | undefined {
    const ranks = this.sortedRanks(id);
    const cur = this.rank(id);
    const next = ranks[cur ? ranks.indexOf(cur) + 1 : 0];
    if (!next) return undefined;
    return { rank: next, reputation: Math.max(0, next.minReputation - this.reputation(id)), skills: (next.requires ?? []).filter((g) => !this.gatePasses(g)), quest: !!next.questOnly };
  }

  private gatePasses(g: { skill: string | string[]; level: number }): boolean {
    if (!this.skillLevel) return true;
    const skills = Array.isArray(g.skill) ? g.skill : [g.skill];
    return skills.some((s) => this.skillLevel!(s) >= g.level);
  }

  private qualifies(id: string, r: FactionRank): boolean {
    return this.reputation(id) >= r.minReputation && (r.requires ?? []).every((g) => this.gatePasses(g));
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
    this.events?.emit('faction:joined', { factionId: id });
    this.events?.emit('rpg:notify', { text: `Joined ${d.name}`, kind: 'faction' });
    return true;
  }

  leave(id: string) {
    if (!this.members.delete(id)) return;
    this.granted.delete(id);
    this.events?.emit('faction:left', { factionId: id });
  }

  /** A quest promotes the player (capstones such as rudiarius, eques, the speculatores' invitation). */
  grantRank(id: string, rankId: string): boolean {
    const r = this.defs.get(id)?.ranks.find((x) => x.id === rankId);
    if (!r) return false;
    if (!this.members.has(id)) this.members.add(id);
    this.granted.set(id, rankId);
    this.events?.emit('faction:rank', { factionId: id, rankId: r.id, title: r.title });
    return true;
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
    if (after && before && after !== before) {
      this.events?.emit('faction:rank', { factionId: id, rankId: after.id, title: after.title });
      this.events?.emit('rpg:notify', { text: `${this.defs.get(id)!.name}: you are now ${after.title}`, kind: 'faction' });
    }
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
    return { rep: Object.fromEntries(this.rep), members: [...this.members], granted: Object.fromEntries(this.granted) };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as { rep?: Record<string, number>; members?: string[]; granted?: Record<string, string> };
    this.rep.clear();
    this.members.clear();
    this.granted.clear();
    for (const [k, v] of Object.entries(d.rep ?? {})) if (typeof v === 'number' && Number.isFinite(v)) this.rep.set(k, Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, v)));
    for (const m of Array.isArray(d.members) ? d.members : []) if (this.defs.has(m)) this.members.add(m);
    for (const [k, v] of Object.entries(d.granted ?? {})) if (this.defs.get(k)?.ranks.some((r) => r.id === v)) this.granted.set(k, v);
  }
}
