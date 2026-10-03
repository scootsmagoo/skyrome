/**
 * The player's character sheet: skills that improve by use, character levels fed by skill
 * level-ups (Skyrim's model), perks, modifiers and timed effects (food, remedies, blessings,
 * diseases, poisons). Pure logic; emits events when given an EventBus.
 *
 *   skill XP to next level  = base + mult × L^exp           (SKILL_CURVE)
 *   char XP per skill level = the new skill level           (LEVEL_CURVE.skillXpMult)
 *   char XP to next level   = 75 + 25 × L                   (L1 → 100, L10 → 325)
 *   each character level    = +1 perk point and +10 to a chosen resource (chooseLevelUp)
 */
import type { EventBus, GameEvents } from '../core/Events';
import { CARRY, LEVEL_CURVE, REGEN, RESOURCES, SKILL_CURVE } from './data/balance';
import { CONDITIONS } from './data/conditions';
import { PERKS, SKILLS } from './data/skills';
import type { CharacterSheet, ConditionDef, Effect, ModifierId, PerkDef, ResourceId, SkillDef, SkillId } from './types';
import { RESOURCE_IDS, VitalsImpl } from './vitals';
import './events';

export interface ActiveEffect {
  source: string;
  effect: Effect;
  /** Seconds left; Infinity = until cured. */
  remaining: number;
}

export interface SheetOptions {
  skills?: readonly SkillDef[];
  perks?: readonly PerkDef[];
  conditions?: readonly ConditionDef[];
  events?: EventBus<GameEvents>;
  /** Starting skill level (default SKILL_CURVE.start). */
  startSkill?: number;
}

const MODIFIER_IDS = new Set<string>([
  'damage.blades', 'damage.spear', 'damage.blunt', 'damage.ranged', 'damage.unarmed', 'damage.power', 'damage.sneak',
  'block.mitigation', 'block.staminaCost', 'armor.light', 'armor.heavy', 'stamina.regen', 'stamina.attackCost',
  'stamina.sprintCost', 'health.regen', 'health.max', 'stamina.max', 'pietas.max', 'pietas.regen', 'carry.max',
  'speed.move', 'price.buy', 'price.sell', 'persuade.chance', 'stealth.noise', 'stealth.visibility', 'lockpick.ease',
  'pickpocket.chance', 'potion.strength', 'blessing.duration', 'xp.mult',
]);
const isResource = (t: string): t is ResourceId => t === 'health' || t === 'stamina' || t === 'pietas';

/** XP ("use units") needed to raise a skill from `level` to `level + 1`. */
export function skillXpToNext(level: number, difficulty = 1): number {
  return difficulty * (SKILL_CURVE.base + SKILL_CURVE.mult * Math.pow(level, SKILL_CURVE.exp));
}

/** Character XP needed to go from `level` to `level + 1`. */
export function levelXpToNext(level: number): number {
  return LEVEL_CURVE.base + LEVEL_CURVE.perLevel * level;
}

export class CharacterSheetImpl implements CharacterSheet {
  readonly vitals: VitalsImpl;
  private _level = 1;
  private _xp = 0;
  private _perkPoints = 0;
  private _pendingLevelUps = 0;
  private readonly _perks = new Set<string>();
  private readonly skills = new Map<SkillId, { level: number; xp: number }>();
  private readonly skillDefs = new Map<SkillId, SkillDef>();
  private readonly perkDefs = new Map<string, PerkDef>();
  private readonly conditionDefs = new Map<string, ConditionDef>();
  private readonly picks: Record<ResourceId, number> = { health: 0, stamina: 0, pietas: 0 };
  private effects: ActiveEffect[] = [];
  private readonly modSources = new Map<string, Partial<Record<ModifierId, number>>>();
  private readonly flagSources = new Map<string, readonly string[]>();
  private modCache: Map<string, number> | null = null;
  private flagCache: Set<string> | null = null;
  /** Trainer sessions used since the last character level. */
  trainedThisLevel = 0;
  readonly events?: EventBus<GameEvents>;

  constructor(opts: SheetOptions = {}) {
    this.events = opts.events;
    for (const s of opts.skills ?? SKILLS) this.skillDefs.set(s.id, s);
    for (const p of opts.perks ?? PERKS) this.perkDefs.set(p.id, p);
    for (const c of opts.conditions ?? CONDITIONS) this.conditionDefs.set(c.id, c);
    const start = opts.startSkill ?? SKILL_CURVE.start;
    for (const id of this.skillDefs.keys()) this.skills.set(id, { level: start, xp: 0 });
    this.vitals = new VitalsImpl({
      health: RESOURCES.base.health,
      stamina: RESOURCES.base.stamina,
      pietas: RESOURCES.base.pietas,
      regenRate: (id, v) => v.get(id).max * regenFraction(id, v.inCombat) * Math.max(0, 1 + this.modifier(`${id}.regen` as ModifierId)),
    });
  }

  // ---------------------------------------------------------------- levels

  get level() {
    return this._level;
  }
  get xp() {
    return this._xp;
  }
  get xpToNext() {
    return levelXpToNext(this._level);
  }
  get levelProgress() {
    return Math.min(1, this._xp / levelXpToNext(this._level));
  }
  get perkPoints() {
    return this._perkPoints;
  }
  /** Level-ups waiting for a health/stamina/pietas choice. */
  get pendingLevelUps() {
    return this._pendingLevelUps;
  }
  get perks(): ReadonlySet<string> {
    return this._perks;
  }
  levelPicks(): Readonly<Record<ResourceId, number>> {
    return this.picks;
  }

  /** Add character XP directly (skill level-ups and quest rewards). */
  addXp(amount: number) {
    if (!(amount > 0)) return;
    this._xp += amount;
    while (this._level < LEVEL_CURVE.maxLevel && this._xp >= levelXpToNext(this._level)) {
      this._xp -= levelXpToNext(this._level);
      this._level++;
      this._perkPoints += LEVEL_CURVE.perkPointsPerLevel;
      this._pendingLevelUps++;
      this.trainedThisLevel = 0;
      this.events?.emit('player:levelup', { level: this._level });
      this.events?.emit('player:levelChoice', { level: this._level, pending: this._pendingLevelUps });
      this.notify(`Level ${this._level}! Choose health, stamina or pietas.`, 'level');
    }
    if (this._level >= LEVEL_CURVE.maxLevel) this._xp = Math.min(this._xp, levelXpToNext(this._level));
  }

  /** Resolve one pending level-up: +10 (RESOURCES.perLevelPick) to the chosen resource. */
  chooseLevelUp(resource: ResourceId): boolean {
    if (this._pendingLevelUps <= 0) return false;
    this._pendingLevelUps--;
    this.picks[resource]++;
    this.recomputeMaxes();
    return true;
  }

  // ---------------------------------------------------------------- skills

  skillDefsList(): SkillDef[] {
    return [...this.skillDefs.values()];
  }

  skillLevel(id: SkillId): number {
    return this.skills.get(id)?.level ?? 0;
  }

  skillXp(id: SkillId): number {
    return this.skills.get(id)?.xp ?? 0;
  }

  skillProgress(id: SkillId): number {
    const s = this.skills.get(id);
    if (!s || s.level >= SKILL_CURVE.max) return 0;
    return Math.min(1, s.xp / skillXpToNext(s.level, this.skillDefs.get(id)?.difficulty));
  }

  useSkill(id: SkillId, amount: number) {
    const s = this.skills.get(id);
    if (!s || !(amount > 0) || s.level >= SKILL_CURVE.max) return;
    s.xp += amount * Math.max(0, 1 + this.modifier('xp.mult'));
    const diff = this.skillDefs.get(id)?.difficulty;
    while (s.level < SKILL_CURVE.max && s.xp >= skillXpToNext(s.level, diff)) {
      s.xp -= skillXpToNext(s.level, diff);
      s.level++;
      this.onSkillLevel(id, s.level);
    }
    if (s.level >= SKILL_CURVE.max) s.xp = 0;
  }

  /** Raise a skill by whole levels (skill books, trainers). Grants character XP like normal level-ups. */
  raiseSkill(id: SkillId, levels = 1) {
    const s = this.skills.get(id);
    if (!s) return;
    for (let i = 0; i < levels && s.level < SKILL_CURVE.max; i++) {
      s.level++;
      const need = skillXpToNext(s.level, this.skillDefs.get(id)?.difficulty);
      s.xp = Math.min(s.xp, need * 0.999);
      this.onSkillLevel(id, s.level);
    }
  }

  /** Set a skill without granting XP (character creation, debug). */
  setSkill(id: SkillId, level: number) {
    const s = this.skills.get(id);
    if (!s) return;
    s.level = Math.max(0, Math.min(SKILL_CURVE.max, Math.round(level)));
    s.xp = 0;
  }

  /** Zero the in-progress XP of the `n` skills with the most progress (jail time). Returns their ids. */
  loseProgress(n: number): SkillId[] {
    const ranked = [...this.skills.entries()].filter(([, s]) => s.xp > 0).sort((a, b) => b[1].xp - a[1].xp);
    const lost = ranked.slice(0, Math.max(0, n)).map(([id, s]) => {
      s.xp = 0;
      return id;
    });
    return lost;
  }

  private onSkillLevel(id: SkillId, level: number) {
    this.events?.emit('skill:levelup', { skill: id, level });
    this.notify(`${this.skillDefs.get(id)?.name ?? id} increased to ${level}`, 'skill');
    this.addXp(level * LEVEL_CURVE.skillXpMult);
  }

  // ---------------------------------------------------------------- perks

  perkDef(id: string) {
    return this.perkDefs.get(id);
  }

  perkDefsList(): PerkDef[] {
    return [...this.perkDefs.values()];
  }

  /** Why a perk can't be taken, or null if it can. */
  perkBlocker(id: string): 'unknown' | 'taken' | 'points' | 'level' | 'prerequisite' | null {
    const p = this.perkDefs.get(id);
    if (!p) return 'unknown';
    if (this._perks.has(id)) return 'taken';
    if (this.skillLevel(p.skill) < p.requiresLevel) return 'level';
    if (p.requiresPerk && !this._perks.has(p.requiresPerk)) return 'prerequisite';
    if (this._perkPoints <= 0) return 'points';
    return null;
  }

  canTakePerk(id: string): boolean {
    return this.perkBlocker(id) === null;
  }

  takePerk(id: string): boolean {
    if (!this.canTakePerk(id)) return false;
    this._perks.add(id);
    this._perkPoints--;
    this.invalidate();
    this.events?.emit('perk:taken', { perkId: id });
    return true;
  }

  /** Grant a perk without spending a point (quests, debug). */
  grantPerk(id: string) {
    if (!this.perkDefs.has(id) || this._perks.has(id)) return;
    this._perks.add(id);
    this.invalidate();
  }

  grantPerkPoints(n: number) {
    this._perkPoints += Math.max(0, n);
  }

  // ---------------------------------------------------------------- modifiers & flags

  modifier(id: ModifierId): number {
    if (!this.modCache) this.rebuildCaches();
    return this.modCache!.get(id) ?? 0;
  }

  hasFlag(flag: string): boolean {
    if (!this.flagCache) this.rebuildCaches();
    return this.flagCache!.has(flag);
  }

  /** Named modifier source (equipment slot, faction bonus…); null removes it. */
  setModifierSource(source: string, mods: Partial<Record<ModifierId, number>> | null | undefined) {
    if (mods && Object.keys(mods).length) this.modSources.set(source, mods);
    else this.modSources.delete(source);
    this.invalidate();
  }

  setFlagSource(source: string, flags: readonly string[] | null | undefined) {
    if (flags && flags.length) this.flagSources.set(source, flags);
    else this.flagSources.delete(source);
    this.invalidate();
  }

  private rebuildCaches() {
    const mods = new Map<string, number>();
    const add = (k: string, v: number) => mods.set(k, (mods.get(k) ?? 0) + v);
    const flags = new Set<string>();
    for (const id of this._perks) {
      const p = this.perkDefs.get(id);
      if (!p) continue;
      for (const [k, v] of Object.entries(p.modifiers ?? {})) add(k, v as number);
      for (const f of p.flags ?? []) flags.add(f);
    }
    for (const m of this.modSources.values()) for (const [k, v] of Object.entries(m)) add(k, v as number);
    for (const fl of this.flagSources.values()) for (const f of fl) flags.add(f);
    for (const a of this.effects) {
      const e = a.effect;
      if ((e.kind === 'modifier' || e.kind === 'fortify') && MODIFIER_IDS.has(e.target)) add(e.target, e.amount);
    }
    this.modCache = mods;
    this.flagCache = flags;
  }

  private invalidate() {
    this.modCache = null;
    this.flagCache = null;
    this.recomputeMaxes();
  }

  /** Resource maxima: base + level picks × 10 + `<res>.max` modifiers + fortify effects. */
  recomputeMaxes() {
    for (const id of RESOURCE_IDS) {
      let max = RESOURCES.base[id] + this.picks[id] * RESOURCES.perLevelPick + this.modifier(`${id}.max` as ModifierId);
      for (const a of this.effects) if (a.effect.kind === 'fortify' && a.effect.target === id) max += a.effect.amount;
      if (Math.abs(this.vitals.get(id).max - max) > 1e-9) this.vitals.setMax(id, max);
    }
  }

  /** Carry capacity in kg. */
  carryCapacity(): number {
    return CARRY.base + this.picks.stamina * CARRY.perStaminaPick + this.modifier('carry.max');
  }

  // ---------------------------------------------------------------- effects

  get activeEffects(): readonly ActiveEffect[] {
    return this.effects;
  }

  /**
   * Apply effects from a source ('item:potio', 'blessing:mars', 'disease:febris'…). Instant kinds
   * (restore, cure, damage without duration) act now; timed ones replace any earlier effects from
   * the same source. `magnitude` scales amounts (remedy strength), `durationMult` durations.
   */
  applyEffects(source: string, effects: readonly Effect[], opts: { magnitude?: number; durationMult?: number } = {}) {
    const mag = opts.magnitude ?? 1;
    const dmul = opts.durationMult ?? 1;
    let timed = false;
    for (const raw of effects) {
      const e: Effect = { ...raw, amount: raw.amount * (raw.kind === 'cure' ? 1 : mag) };
      if (e.kind === 'cure') {
        this.cure(e.target);
        continue;
      }
      const instant = e.duration === undefined || e.duration <= 0;
      if (instant) {
        if (e.kind === 'restore' || e.kind === 'regen') {
          if (isResource(e.target)) this.vitals.restore(e.target, e.amount);
        } else if (e.kind === 'damage') {
          if (isResource(e.target)) this.vitals.drain(e.target, e.amount);
        }
        continue;
      }
      if (!timed) {
        this.effects = this.effects.filter((a) => a.source !== source);
        timed = true;
      }
      this.effects.push({ source, effect: e, remaining: e.duration! * dmul });
    }
    if (timed) {
      this.invalidate();
      this.events?.emit('effect:added', { source });
    }
  }

  /** Remove effects: 'poison', 'disease', or an exact source like 'disease:febris'. */
  cure(target: string): number {
    const before = this.effects.length;
    const prefix = target.includes(':') ? null : `${target}:`;
    this.effects = this.effects.filter((a) => {
      if (prefix) {
        if (a.source.startsWith(prefix)) return false;
        if (target === 'poison' && a.effect.kind === 'damage') return false;
        return true;
      }
      return a.source !== target;
    });
    const removed = before - this.effects.length;
    if (removed) this.invalidate();
    return removed;
  }

  removeEffectsFrom(source: string) {
    const before = this.effects.length;
    this.effects = this.effects.filter((a) => a.source !== source);
    if (before !== this.effects.length) this.invalidate();
  }

  conditionDef(id: string) {
    return this.conditionDefs.get(id);
  }

  hasCondition(id: string): boolean {
    const c = this.conditionDefs.get(id);
    return !!c && this.effects.some((a) => a.source === `${c.kind}:${id}`);
  }

  /**
   * Catch a disease, take a poison or receive a blessing. Diseases are blocked by 'disease.immune',
   * poisons halved by 'poison.resist', blessings last longer with 'blessing.duration' and replace
   * the previous blessing (two may be held with 'religio.twoBlessings').
   */
  applyCondition(id: string): boolean {
    const c = this.conditionDefs.get(id);
    if (!c) return false;
    const source = `${c.kind}:${id}`;
    if (c.kind === 'disease') {
      if (this.hasFlag('disease.immune')) return false;
      this.applyEffects(source, c.effects);
      this.notify(`You have contracted ${c.name}.`, 'effect');
    } else if (c.kind === 'poison') {
      this.applyEffects(source, c.effects, { magnitude: this.hasFlag('poison.resist') ? 0.5 : 1 });
    } else {
      const keep = this.hasFlag('religio.twoBlessings') ? 1 : 0;
      const blessings = [...new Set(this.effects.filter((a) => a.source.startsWith('blessing:') && a.source !== source).map((a) => a.source))];
      for (const s of blessings.slice(0, Math.max(0, blessings.length - keep))) this.effects = this.effects.filter((a) => a.source !== s);
      this.applyEffects(source, c.effects, { durationMult: 1 + this.modifier('blessing.duration') });
      this.notify(`${c.name}`, 'effect');
    }
    return true;
  }

  /** Advance timed effects and vitals regeneration. Call at a fixed rate. */
  tick(dt: number) {
    if (!(dt > 0)) return;
    if (this.effects.length) {
      let expired: string[] | null = null;
      for (const a of this.effects) {
        const e = a.effect;
        if (isResource(e.target)) {
          if (e.kind === 'regen') this.vitals.restore(e.target, e.amount * dt);
          else if (e.kind === 'damage') this.vitals.drain(e.target, e.amount * dt);
        }
        a.remaining -= dt;
        if (a.remaining <= 0) (expired ??= []).push(a.source);
      }
      if (expired) {
        this.effects = this.effects.filter((a) => a.remaining > 0);
        this.invalidate();
        for (const s of new Set(expired)) if (!this.effects.some((a) => a.source === s)) this.events?.emit('effect:expired', { source: s });
      }
    }
    this.vitals.tick(dt);
  }

  // ---------------------------------------------------------------- persistence

  serialize() {
    return {
      level: this._level,
      xp: this._xp,
      perkPoints: this._perkPoints,
      pendingLevelUps: this._pendingLevelUps,
      perks: [...this._perks],
      skills: Object.fromEntries([...this.skills].map(([id, s]) => [id, { level: s.level, xp: s.xp }])),
      picks: { ...this.picks },
      trainedThisLevel: this.trainedThisLevel,
      // Infinity does not survive JSON: store -1 for "until cured".
      effects: this.effects.map((a) => ({ source: a.source, effect: { ...a.effect, duration: finiteOr(a.effect.duration) }, remaining: finiteOr(a.remaining) })),
      vitals: this.vitals.serialize(),
    };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as Partial<ReturnType<CharacterSheetImpl['serialize']>>;
    this._level = posInt(d.level, 1);
    this._xp = num(d.xp, 0);
    this._perkPoints = posInt(d.perkPoints, 0);
    this._pendingLevelUps = posInt(d.pendingLevelUps, 0);
    this.trainedThisLevel = posInt(d.trainedThisLevel, 0);
    this._perks.clear();
    for (const p of Array.isArray(d.perks) ? d.perks : []) if (this.perkDefs.has(p)) this._perks.add(p);
    for (const [id, s] of this.skills) {
      const saved = d.skills?.[id];
      s.level = saved ? Math.min(SKILL_CURVE.max, posInt(saved.level, SKILL_CURVE.start)) : SKILL_CURVE.start;
      s.xp = saved ? num(saved.xp, 0) : 0;
    }
    for (const id of RESOURCE_IDS) this.picks[id] = posInt(d.picks?.[id], 0);
    this.effects = (Array.isArray(d.effects) ? d.effects : [])
      .filter((a) => a && typeof a.source === 'string' && a.effect)
      .map((a) => ({ source: a.source, effect: { ...a.effect, duration: infiniteIfNeg(a.effect.duration) }, remaining: infiniteIfNeg(a.remaining) ?? 0 }));
    this.invalidate();
    this.vitals.restoreState(d.vitals);
  }

  private notify(text: string, kind: 'skill' | 'level' | 'effect') {
    this.events?.emit('rpg:notify', { text, kind });
  }
}

function regenFraction(id: ResourceId, inCombat: boolean) {
  return REGEN[id] * (inCombat ? REGEN.combat[id] : 1);
}

function finiteOr(v: number | undefined): number | undefined {
  if (v === undefined) return undefined;
  return Number.isFinite(v) ? v : -1;
}
function infiniteIfNeg(v: number | undefined): number | undefined {
  if (typeof v !== 'number') return undefined;
  return v < 0 ? Infinity : v;
}
function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
function posInt(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d;
}
