/**
 * The player's character sheet (docs/GDD.md §3.3, §5): skills that rise by use, character levels
 * fed by skill level-ups, perks, modifiers and timed effects (food, remedies, wine, blessings,
 * diseases, poisons, bleeding). Pure logic; emits events when given an EventBus.
 *
 *   skill XP to next level   = round(difficulty × (L + 5)^1.5)      (L10 → 58, L50 → 408)
 *   char XP per skill level  = the new skill level
 *   char XP to next level    = 25 × (n + 2)                         (L1 → 75, L2 → 100)
 *   each character level     = +1 perk point and +10 to a chosen pool (chooseLevelUp)
 *   each skill level gained  = +0.2 to the skill's governing pool max
 *
 * A taken perk's id is a flag (hasFlag('perk-blades-punctim')). Effects of kind 'flag' set a flag
 * for their duration; 'fortify' on a skill id raises that skill; 'condition' applies a named
 * condition; `percent` effects scale with the pool's max. Skill XP is multiplied by
 * 1 + xp.mult + xp.<skill> (+10% with an 'xp.<skill>' flag).
 */
import type { EventBus, GameEvents } from '../core/Events';
import { CARRY, LEVEL_CURVE, REGEN, RESOURCES, SKILL_CURVE, TRAINING, XP } from './data/tuning';
import { CONDITIONS, POISONED } from './data/conditions';
import { PERKS } from './data/perks';
import { SKILLS } from './data/skills';
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
  /** Starting skill level (default SKILL_CURVE.start = 10). */
  startSkill?: number;
}

export type TrainerGrade = keyof typeof TRAINING.caps;

const MODIFIER_IDS = new Set<string>([
  'damage.blades', 'damage.spear', 'damage.blunt', 'damage.ranged', 'damage.unarmed', 'damage.power', 'damage.sneak',
  'block.mitigation', 'block.staminaCost', 'armor.light', 'armor.heavy', 'stamina.regen', 'stamina.attackCost',
  'stamina.sprintCost', 'health.regen', 'health.max', 'stamina.max', 'pietas.max', 'pietas.regen', 'carry.max',
  'speed.move', 'price.buy', 'price.sell', 'persuade.chance', 'stealth.noise', 'stealth.visibility', 'lockpick.ease',
  'pickpocket.chance', 'potion.strength', 'blessing.duration', 'xp.mult', 'damage.taken', 'luck', 'crit.chance',
  'stamina.regenCombat', 'poise.max', 'bandage.strength', 'food.strength', 'poison.resist', 'fire.resist', 'arena.favor',
  'arena.missio', 'attack.speed',
]);
const isModifier = (t: string) => MODIFIER_IDS.has(t) || t.startsWith('xp.');
const isResource = (t: string): t is ResourceId => t === 'health' || t === 'stamina' || t === 'pietas';

/** XP needed to raise a skill from `level` to `level + 1` (GDD §5.2). */
export function skillXpToNext(level: number, difficulty = 1): number {
  return Math.round(difficulty * Math.pow(level + SKILL_CURVE.offset, SKILL_CURVE.exp));
}

/** Character XP needed to go from `level` to `level + 1` (GDD §5.3). */
export function levelXpToNext(level: number): number {
  return LEVEL_CURVE.perLevel * (level + LEVEL_CURVE.offset);
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
  /** Governing-pool growth from skill level-ups (+0.2 each). */
  private readonly growth: Record<ResourceId, number> = { health: 0, stamina: 0, pietas: 0 };
  private effects: ActiveEffect[] = [];
  private readonly modSources = new Map<string, Partial<Record<ModifierId, number>>>();
  private readonly flagSources = new Map<string, readonly string[]>();
  private modCache: Map<string, number> | null = null;
  private flagCache: Set<string> | null = null;
  private skillBonusCache: Map<string, number> | null = null;
  /** Trainer lessons taken since the last character level (max TRAINING.perLevel). */
  trainedThisLevel = 0;
  /**
   * Game systems that have shipped (GDD §5.5 PerkDef.requiresSystem): perks needing any other are
   * hidden — 'unavailable' to take and left out of availablePerkDefs(). null = everything ships.
   */
  shippedSystems: ReadonlySet<string> | null = null;
  readonly events?: EventBus<GameEvents>;
  private readonly startSkill: number;

  constructor(opts: SheetOptions = {}) {
    this.events = opts.events;
    for (const s of opts.skills ?? SKILLS) this.skillDefs.set(s.id, s);
    for (const p of opts.perks ?? PERKS) this.perkDefs.set(p.id, p);
    for (const c of opts.conditions ?? CONDITIONS) this.conditionDefs.set(c.id, c);
    this.startSkill = opts.startSkill ?? SKILL_CURVE.start;
    for (const id of this.skillDefs.keys()) this.skills.set(id, { level: this.startSkill, xp: 0 });
    this.vitals = new VitalsImpl({
      health: RESOURCES.base.health,
      stamina: RESOURCES.base.stamina,
      pietas: RESOURCES.base.pietas,
      // Mars: +10% stamina regeneration in combat (stamina.regenCombat).
      regenRate: (id, v) =>
        REGEN[id] * (v.inCombat ? REGEN.combat[id] : 1) * Math.max(0, 1 + this.modifier(`${id}.regen` as ModifierId) + (v.inCombat && id === 'stamina' ? this.modifier('stamina.regenCombat') : 0)),
    });
    this.vitals.set('pietas', RESOURCES.startCurrent.pietas);
    // Mithras's Invictus: once, a killing blow leaves you at 1 health.
    this.vitals.preventDeath = () => this.consumeFlag('invictus');
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
  }

  /** Resolve one pending level-up: +10 to the chosen pool (stamina also adds carry weight). */
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

  skillDef(id: SkillId) {
    return this.skillDefs.get(id);
  }

  /** Effective skill: base level plus temporary fortification (Falernian, Charis…). */
  skillLevel(id: SkillId): number {
    const base = this.skills.get(id)?.level ?? 0;
    if (!this.skillBonusCache) this.rebuildCaches();
    return Math.max(0, base + (this.skillBonusCache!.get(id) ?? 0));
  }

  /** The trained level, without temporary bonuses. */
  baseSkillLevel(id: SkillId): number {
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

  /**
   * Award skill XP (GDD §5.4 amounts, e.g. XP.blades.light = 4). `dummy`: training dummies and
   * sparring give half, and nothing above level 30. xp.mult and xp.<skill> flags apply.
   */
  useSkill(id: SkillId, amount: number, opts: { dummy?: boolean } = {}) {
    const s = this.skills.get(id);
    if (!s || !(amount > 0) || s.level >= SKILL_CURVE.max) return;
    if (opts.dummy) {
      if (s.level >= XP.dummyMaxLevel) return;
      amount *= XP.dummyMult;
    }
    s.xp += amount * Math.max(0, 1 + this.modifier('xp.mult') + this.modifier(`xp.${id}`) + (this.hasFlag(`xp.${id}`) ? 0.1 : 0));
    const diff = this.skillDefs.get(id)?.difficulty;
    while (s.level < SKILL_CURVE.max && s.xp >= skillXpToNext(s.level, diff)) {
      s.xp -= skillXpToNext(s.level, diff);
      s.level++;
      this.onSkillLevel(id, s.level);
    }
    if (s.level >= SKILL_CURVE.max) s.xp = 0;
  }

  /** Raise a skill by whole levels (skill books, trainers): character XP and pool growth as usual. */
  raiseSkill(id: SkillId, levels = 1) {
    const s = this.skills.get(id);
    if (!s) return;
    for (let i = 0; i < levels && s.level < SKILL_CURVE.max; i++) {
      s.level++;
      s.xp = Math.min(s.xp, skillXpToNext(s.level, this.skillDefs.get(id)?.difficulty) - 1e-6);
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

  /**
   * Zero the in-progress XP (never levels) of `n` skills: random ones with progress when `rng` is
   * given (a day in the Carcer, §14.1), else those with the most progress. Returns their ids.
   */
  loseProgress(n: number, rng?: { next(): number }): SkillId[] {
    const pool = [...this.skills.entries()].filter(([, s]) => s.xp > 0).sort((a, b) => b[1].xp - a[1].xp);
    const out: SkillId[] = [];
    for (let i = 0; i < n && pool.length; i++) {
      const k = rng ? Math.min(pool.length - 1, Math.floor(rng.next() * pool.length)) : 0;
      const [id, s] = pool.splice(k, 1)[0];
      s.xp = 0;
      out.push(id);
    }
    return out;
  }

  private onSkillLevel(id: SkillId, level: number) {
    const attr = this.skillDefs.get(id)?.attribute;
    if (attr) this.growth[attr] += RESOURCES.governingPerSkillLevel;
    this.recomputeMaxes();
    this.events?.emit('skill:levelup', { skill: id, level });
    this.notify(`${this.skillDefs.get(id)?.name ?? id} increased to ${level}`, 'skill');
    this.addXp(level * LEVEL_CURVE.skillXpMult);
  }

  // ---------------------------------------------------------------- trainers (§5.1)

  trainingCost(id: SkillId): number {
    return TRAINING.cost(this.baseSkillLevel(id));
  }

  /** Why a lesson can't be had, or null. */
  trainingBlocker(id: SkillId, grade: TrainerGrade): 'unknown' | 'cap' | 'lessons' | null {
    if (!this.skills.has(id)) return 'unknown';
    if (this.baseSkillLevel(id) >= TRAINING.caps[grade]) return 'cap';
    if (this.trainedThisLevel >= TRAINING.perLevel) return 'lessons';
    return null;
  }

  /** Take a lesson (the caller charges trainingCost first). */
  train(id: SkillId, grade: TrainerGrade): boolean {
    if (this.trainingBlocker(id, grade)) return false;
    this.trainedThisLevel++;
    this.raiseSkill(id, 1);
    return true;
  }

  // ---------------------------------------------------------------- perks

  perkDef(id: string) {
    return this.perkDefs.get(id);
  }

  perkDefsList(): PerkDef[] {
    return [...this.perkDefs.values()];
  }

  /** Perks the player can see: those whose system has shipped. */
  availablePerkDefs(): PerkDef[] {
    return this.perkDefsList().filter((p) => this.perkShipped(p));
  }

  private perkShipped(p: PerkDef): boolean {
    return !p.requiresSystem || !this.shippedSystems || this.shippedSystems.has(p.requiresSystem);
  }

  /** Why a perk can't be taken, or null if it can. */
  perkBlocker(id: string): 'unknown' | 'unavailable' | 'taken' | 'points' | 'level' | 'prerequisite' | null {
    const p = this.perkDefs.get(id);
    if (!p) return 'unknown';
    if (this._perks.has(id)) return 'taken';
    if (!this.perkShipped(p)) return 'unavailable';
    if (this.baseSkillLevel(p.skill) < p.requiresLevel) return 'level';
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

  /** Named modifier source (equipment slot, origin trait, patron…); null removes it. */
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
    const skillBonus = new Map<string, number>();
    for (const id of this._perks) {
      const p = this.perkDefs.get(id);
      if (!p) continue;
      flags.add(id);
      for (const [k, v] of Object.entries(p.modifiers ?? {})) add(k, v as number);
      for (const f of p.flags ?? []) flags.add(f);
    }
    for (const m of this.modSources.values()) for (const [k, v] of Object.entries(m)) add(k, v as number);
    for (const fl of this.flagSources.values()) for (const f of fl) flags.add(f);
    for (const a of this.effects) {
      const e = a.effect;
      if ((e.kind === 'modifier' || e.kind === 'fortify') && isModifier(e.target)) add(e.target, e.amount);
      else if (e.kind === 'fortify' && this.skillDefs.has(e.target)) skillBonus.set(e.target, (skillBonus.get(e.target) ?? 0) + e.amount);
      else if (e.kind === 'flag') flags.add(e.target);
    }
    this.modCache = mods;
    this.flagCache = flags;
    this.skillBonusCache = skillBonus;
  }

  private invalidate() {
    this.modCache = null;
    this.flagCache = null;
    this.skillBonusCache = null;
    this.recomputeMaxes();
  }

  /** Pool maxima: (base + picks × 10 + skill growth + `<pool>.max` modifiers + fortify effects) × (1 + percent fortifies). */
  recomputeMaxes() {
    for (const id of RESOURCE_IDS) {
      let max = RESOURCES.base[id] + this.picks[id] * RESOURCES.perLevelPick + this.growth[id] + this.modifier(`${id}.max` as ModifierId);
      let pct = 0;
      for (const a of this.effects) {
        if (a.effect.kind !== 'fortify' || a.effect.target !== id) continue;
        if (a.effect.percent) pct += a.effect.amount;
        else max += a.effect.amount;
      }
      max *= Math.max(0, 1 + pct / 100);
      if (Math.abs(this.vitals.get(id).max - max) > 1e-9) this.vitals.setMax(id, max);
    }
  }

  /** An effect's amount in pool points (percent effects scale with the pool's max). */
  private points(e: Effect): number {
    return e.percent && isResource(e.target) ? (e.amount * this.vitals.get(e.target).max) / 100 : e.amount;
  }

  /** Carry capacity in kg: 50 + 5 per stamina level-up + carry.max (Hercules, perks). */
  carryCapacity(): number {
    return CARRY.base + this.picks.stamina * CARRY.perStaminaPick + this.modifier('carry.max');
  }

  // ---------------------------------------------------------------- effects

  get activeEffects(): readonly ActiveEffect[] {
    return this.effects;
  }

  /**
   * Apply effects from a source ('item:panis', 'blessing:benedictio-mars', 'injury:cruentus'…). Instant kinds
   * (restore, cure, condition, damage without duration) act now; timed ones replace any earlier
   * effects from the same source. `magnitude` scales amounts (remedy strength), `durationMult` durations.
   */
  applyEffects(source: string, effects: readonly Effect[], opts: { magnitude?: number; durationMult?: number } = {}) {
    const mag = opts.magnitude ?? 1;
    const dmul = opts.durationMult ?? 1;
    let timed = false;
    for (const raw of effects) {
      if (raw.kind === 'cure') {
        this.cure(raw.target);
        continue;
      }
      if (raw.kind === 'condition') {
        this.applyCondition(raw.target);
        continue;
      }
      const e: Effect = { ...raw, amount: raw.amount * mag };
      if (e.duration === undefined || e.duration <= 0) {
        if ((e.kind === 'restore' || e.kind === 'regen') && isResource(e.target)) this.vitals.restore(e.target, this.points(e));
        else if (e.kind === 'damage' && isResource(e.target)) this.vitals.drain(e.target, this.points(e));
        continue;
      }
      if (!timed) {
        this.effects = this.effects.filter((a) => a.source !== source);
        timed = true;
      }
      this.effects.push({ source, effect: e, remaining: e.duration * dmul });
    }
    if (timed) {
      this.invalidate();
      this.events?.emit('effect:added', { source });
    }
  }

  /**
   * Remove effects: a kind ('poison', 'disease', 'injury', 'omen', 'state') or an exact condition
   * source ('disease:febris' — with all its stacks). Returns how many effect sources were removed.
   */
  cure(target: string): number {
    const prefix = target.includes(':') ? null : `${target}:`;
    const removed = new Set<string>();
    this.effects = this.effects.filter((a) => {
      const hit = prefix
        ? a.source.startsWith(prefix) || (target === 'poison' && a.effect.kind === 'damage' && a.source.startsWith('item:'))
        : a.source === target || a.source.startsWith(`${target}#`);
      if (hit) removed.add(a.source);
      return !hit;
    });
    if (removed.size) this.invalidate();
    return removed.size;
  }

  /** Use up a timed flag effect (one-shot invocations). Returns true if one was active. */
  consumeFlag(flag: string): boolean {
    const i = this.effects.findIndex((a) => a.effect.kind === 'flag' && a.effect.target === flag);
    if (i < 0) return false;
    const source = this.effects[i].source;
    this.effects.splice(i, 1);
    this.invalidate();
    if (!this.effects.some((a) => a.source === source)) this.events?.emit('effect:expired', { source });
    return true;
  }

  removeEffectsFrom(source: string) {
    const before = this.effects.length;
    this.effects = this.effects.filter((a) => a.source !== source);
    if (before !== this.effects.length) this.invalidate();
  }

  conditionDef(id: string) {
    return this.conditionDefs.get(id);
  }

  /** Active stacks of a condition (0 if absent). 'veneno' counts active poisons. */
  conditionStacks(id: string): number {
    if (id === POISONED) return new Set(this.effects.filter((a) => a.source.startsWith('poison:')).map((a) => a.source)).size;
    const c = this.conditionDefs.get(id);
    if (!c) return 0;
    const base = `${c.kind}:${id}`;
    return new Set(this.effects.filter((a) => a.source === base || a.source.startsWith(`${base}#`)).map((a) => a.source)).size;
  }

  hasCondition(id: string): boolean {
    return this.conditionStacks(id) > 0;
  }

  /**
   * Catch a disease, take a poison or a wound, fall under an ill omen, change state, or receive a
   * blessing. Diseases are blocked by 'disease.immune'; poisons by 'poison.immune', halved by the
   * 'poison.resist' flag (theriac) and reduced by the poison.resist modifier (Isis); stackable
   * conditions (bleeding ×3) add a stack or refresh the oldest. Blessings have two slots (§14.6):
   * one temple blessing (two with 'religio.twoBlessings') and the Lares favor; a new one replaces
   * the old in its slot, and 'blessing.duration' lengthens them.
   */
  applyCondition(id: string): boolean {
    const c = this.conditionDefs.get(id);
    if (!c) return false;
    let source = `${c.kind}:${id}`;
    if (c.kind === 'disease' && this.hasFlag('disease.immune')) return false;
    if (c.kind === 'poison' && this.hasFlag('poison.immune')) return false;
    if (c.maxStacks && c.maxStacks > 1) {
      const stacks = [...new Set(this.effects.filter((a) => a.source === source || a.source.startsWith(`${source}#`)).map((a) => a.source))];
      if (stacks.length >= c.maxStacks) {
        // Refresh the stack closest to running out.
        const oldest = stacks.sort((x, y) => this.remainingOf(x) - this.remainingOf(y))[0];
        source = oldest;
      } else if (stacks.length) {
        let n = 2;
        while (stacks.includes(`${source}#${n}`)) n++;
        source = `${source}#${n}`;
      }
    }
    if (c.kind === 'blessing') {
      const slot = c.slot ?? 'temple';
      const keep = slot === 'temple' && this.hasFlag('religio.twoBlessings') ? 1 : 0;
      const sameSlot = (src: string) => src.startsWith('blessing:') && src !== source && (this.conditionDefs.get(src.slice(9))?.slot ?? 'temple') === slot;
      const blessings = [...new Set(this.effects.filter((a) => sameSlot(a.source)).map((a) => a.source))];
      for (const s of blessings.slice(0, Math.max(0, blessings.length - keep))) this.effects = this.effects.filter((a) => a.source !== s);
      this.applyEffects(source, c.effects, { durationMult: 1 + this.modifier('blessing.duration') });
    } else if (c.kind === 'poison') {
      const resist = (this.hasFlag('poison.resist') ? 0.5 : 1) * Math.max(0, 1 - this.modifier('poison.resist'));
      this.applyEffects(source, c.effects, { magnitude: resist });
    } else {
      this.applyEffects(source, c.effects);
    }
    if (c.kind !== 'state' && c.kind !== 'injury') this.notify(c.kind === 'disease' ? `You have contracted ${c.name}.` : c.kind === 'omen' ? `You are ${c.name.toLowerCase()}.` : c.name, 'effect');
    return true;
  }

  private remainingOf(source: string): number {
    let r = Infinity;
    for (const a of this.effects) if (a.source === source) r = Math.min(r, a.remaining);
    return r;
  }

  /** Advance timed effects and vitals regeneration. Call at a fixed rate. */
  tick(dt: number) {
    if (!(dt > 0)) return;
    if (this.effects.length) {
      let expired: string[] | null = null;
      for (const a of this.effects) {
        const e = a.effect;
        if (isResource(e.target)) {
          // Never tick past the end of the effect.
          const t = Math.min(dt, a.remaining);
          if (e.kind === 'regen') this.vitals.restore(e.target, this.points(e) * t);
          else if (e.kind === 'damage') this.vitals.drain(e.target, this.points(e) * t);
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
      growth: { ...this.growth },
      trainedThisLevel: this.trainedThisLevel,
      // Infinity does not survive JSON: store -1 for "until cured".
      effects: this.effects.map((a) => ({ source: a.source, effect: { ...a.effect, duration: finiteOr(a.effect.duration) }, remaining: finiteOr(a.remaining) })),
      vitals: this.vitals.serialize(),
    };
  }

  /** Load a snapshot; `undefined` resets to a new character (skills 10, pietas 25/50). */
  restore(data: unknown) {
    const d = (data ?? {}) as Partial<ReturnType<CharacterSheetImpl['serialize']>>;
    this._level = posInt(d.level, 1) || 1;
    this._xp = num(d.xp, 0);
    this._perkPoints = posInt(d.perkPoints, 0);
    this._pendingLevelUps = posInt(d.pendingLevelUps, 0);
    this.trainedThisLevel = posInt(d.trainedThisLevel, 0);
    this._perks.clear();
    for (const p of Array.isArray(d.perks) ? d.perks : []) if (this.perkDefs.has(p)) this._perks.add(p);
    for (const [id, s] of this.skills) {
      const saved = d.skills?.[id];
      s.level = saved ? Math.min(SKILL_CURVE.max, posInt(saved.level, this.startSkill)) : this.startSkill;
      s.xp = saved ? num(saved.xp, 0) : 0;
    }
    for (const id of RESOURCE_IDS) {
      this.picks[id] = posInt(d.picks?.[id], 0);
      this.growth[id] = num(d.growth?.[id], 0);
    }
    this.effects = (Array.isArray(d.effects) ? d.effects : [])
      .filter((a) => a && typeof a.source === 'string' && a.effect)
      .map((a) => ({ source: a.source, effect: { ...a.effect, duration: infiniteIfNeg(a.effect.duration) }, remaining: infiniteIfNeg(a.remaining) ?? 0 }));
    this.invalidate();
    if (d.vitals) this.vitals.restoreState(d.vitals);
    else {
      this.vitals.revive();
      this.vitals.set('pietas', RESOURCES.startCurrent.pietas);
    }
  }

  private notify(text: string, kind: 'skill' | 'level' | 'effect') {
    this.events?.emit('rpg:notify', { text, kind });
  }
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
