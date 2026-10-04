/**
 * Inventory: item stacks, denarii, equipment slots with two-handed rules, weight and encumbrance,
 * item condition (GDD §6.3), and use/read. Works for the player (with a sheet: carry capacity,
 * remedies, equipment modifiers and flags) and for NPC containers (without).
 *
 * Stacks are keyed by item, stolen owner and condition (to the percent): a worn gladius and a new
 * one are separate stacks. Equipping picks the best-condition copy unless told otherwise; wear()
 * and repair() move the equipped copy between conditions. Coins (items tagged 'coin') turn into
 * denarii when picked up (§7.1). Quest items weigh nothing and cannot be dropped or sold (§8.6).
 */
import type { EventBus, GameEvents } from '../core/Events';
import { CARRY, COMBAT } from './data/tuning';
import { isTwoHanded, slotOf, type ItemDb } from './items';
import { roundQuadrans } from './money';
import type { CharacterSheetImpl } from './sheet';
import { skillXpToNext } from './sheet';
import type { EquipSlot, Inventory, ItemDef, ItemStack } from './types';
import './events';

export interface InventoryOptions {
  events?: EventBus<GameEvents>;
  sheet?: CharacterSheetImpl;
  /** Base capacity when there is no sheet. */
  maxWeight?: number;
}

export interface AddOptions {
  stolenFrom?: string;
  /** No HUD toast (the event still fires so quests can count). */
  silent?: boolean;
  /** Where it came from ('loot', 'quest', 'barter'…), passed on in 'item:added'. */
  source?: string;
  /** Condition 0..1 for arms and armor (default 1). */
  condition?: number;
}

/** Custom "use" for misc items (keys, curse tablets…). Return true if it was used. */
export type UseHandler = (def: ItemDef, inv: InventoryImpl) => boolean;

interface Equipped {
  itemId: string;
  /** Condition to the percent: the key of the stack this copy comes from. */
  condition: number;
  stolenFrom?: string;
  /**
   * Unrounded condition (wear builds up below 1% per hit: 15 damage is 0.15%); saved with the
   * inventory. The copy moves to another stack only when the rounded percent changes.
   */
  exact?: number;
}

const roundQ = roundQuadrans;
/** Conditions are kept to the percent. */
const clamp01 = (c: number) => Math.max(0, Math.min(1, c));
const normCond = (c: number | undefined) => clamp01(Math.round((c ?? 1) * 100) / 100);
const condOf = (s: ItemStack) => s.condition ?? 1;

export class InventoryImpl implements Inventory {
  private _stacks: ItemStack[] = [];
  private _denarii = 0;
  private _equipped: Partial<Record<EquipSlot, Equipped>> = {};
  private readonly readBooks = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly useHandlers = new Map<string, UseHandler>();
  private readonly events?: EventBus<GameEvents>;
  readonly sheet?: CharacterSheetImpl;
  private baseMaxWeight: number;

  constructor(
    readonly items: ItemDb,
    opts: InventoryOptions = {},
  ) {
    this.events = opts.events;
    this.sheet = opts.sheet;
    this.baseMaxWeight = opts.maxWeight ?? CARRY.base;
  }

  // ---------------------------------------------------------------- queries

  get denarii() {
    return this._denarii;
  }
  get stacks(): readonly ItemStack[] {
    return this._stacks;
  }
  /** slot → item id. */
  get equipment(): Readonly<Partial<Record<EquipSlot, string>>> {
    const out: Partial<Record<EquipSlot, string>> = {};
    for (const [slot, e] of Object.entries(this._equipped)) if (e) out[slot as EquipSlot] = e.itemId;
    return out;
  }

  /** Total carried weight (kg). Quest items weigh nothing; worn light armor is weightless with Unburdened. */
  get weight(): number {
    let w = 0;
    for (const s of this._stacks) {
      const d = this.items.get(s.itemId);
      if (d && !isQuestItem(d)) w += d.weight * s.count;
    }
    if (this.sheet?.hasFlag('perk-light-armor-unburdened')) {
      for (const e of Object.values(this._equipped)) {
        const d = e ? this.items.get(e.itemId) : undefined;
        if (d?.armor?.weightClass === 'light') w -= d.weight;
      }
    }
    return Math.max(0, w);
  }

  get maxWeight(): number {
    return this.sheet ? this.sheet.carryCapacity() : this.baseMaxWeight;
  }

  /** Over the limit: walk only, no sprinting or fast travel (§3.3). */
  get overEncumbered(): boolean {
    return this.weight > this.maxWeight + 1e-9;
  }

  /** Movement speed multiplier from encumbrance (1 normally). */
  speedMultiplier(): number {
    return this.overEncumbered ? CARRY.overSpeed : 1;
  }

  /**
   * How many of an item are carried. `stolen` true/false counts only stolen/clean stacks;
   * `stolenFrom` counts exactly what remove() with the same filter would take (an owner's stolen
   * stacks, or null for clean ones).
   */
  count(itemId: string, opts: { stolen?: boolean; stolenFrom?: string | null } = {}): number {
    let n = 0;
    for (const s of this._stacks) {
      if (s.itemId !== itemId) continue;
      if (opts.stolen === true && !s.stolenFrom) continue;
      if (opts.stolen === false && s.stolenFrom) continue;
      if (opts.stolenFrom !== undefined && (s.stolenFrom ?? null) !== opts.stolenFrom) continue;
      n += s.count;
    }
    return n;
  }

  has(itemId: string, count = 1) {
    return this.count(itemId) >= count;
  }

  hasStolen(): boolean {
    return this._stacks.some((s) => !!s.stolenFrom);
  }

  /** Stacks joined with their definitions, for UI lists. `equipped` marks the stack the worn copy comes from. */
  list(filter?: (def: ItemDef, stack: ItemStack) => boolean): { def: ItemDef; stack: ItemStack; equipped: boolean }[] {
    const out: { def: ItemDef; stack: ItemStack; equipped: boolean }[] = [];
    for (const stack of this._stacks) {
      const def = this.items.get(stack.itemId);
      if (!def || (filter && !filter(def, stack))) continue;
      const equipped = Object.values(this._equipped).some((e) => !!e && sameCopy(e, stack));
      out.push({ def, stack, equipped });
    }
    return out;
  }

  // ---------------------------------------------------------------- add / remove

  add(itemId: string, count = 1, opts: AddOptions = {}) {
    count = Math.floor(count);
    if (count <= 0) return;
    const def = this.items.get(itemId);
    if (!def) {
      console.warn(`[inventory] unknown item "${itemId}"`);
      return;
    }
    if (def.tags?.includes('coin')) {
      this.events?.emit('item:added', { itemId, count, source: opts.source, silent: opts.silent, stolen: !!opts.stolenFrom });
      this.addDenarii(def.value * count);
      return;
    }
    const wearable = !!(def.armor || def.weapon || def.shield);
    this.addToStack(itemId, count, opts.stolenFrom || undefined, wearable ? normCond(opts.condition) : 1);
    this.events?.emit('item:added', { itemId, count, source: opts.source, silent: opts.silent, stolen: !!opts.stolenFrom });
    this.changed();
  }

  private addToStack(itemId: string, count: number, stolenFrom: string | undefined, condition: number) {
    const s = this._stacks.find((x) => x.itemId === itemId && x.stolenFrom === stolenFrom && condOf(x) === condition);
    if (s) s.count += count;
    else {
      const stack: ItemStack = { itemId, count };
      if (stolenFrom) stack.stolenFrom = stolenFrom;
      if (condition < 1) stack.condition = condition;
      this._stacks.push(stack);
    }
  }

  /**
   * Remove items. Without `stolenFrom`, clean stacks go first, then stolen; worse condition first;
   * the equipped copy goes last. Returns false (removing nothing) if there aren't enough.
   */
  remove(itemId: string, count = 1, opts: { stolenFrom?: string | null; reason?: GameEvents['item:removed']['reason'] } = {}): boolean {
    count = Math.floor(count);
    if (count <= 0) return true;
    const pool = this._stacks
      .filter((s) => s.itemId === itemId && (opts.stolenFrom === undefined || (s.stolenFrom ?? null) === opts.stolenFrom))
      .sort((a, b) => Number(!!a.stolenFrom) - Number(!!b.stolenFrom) || condOf(a) - condOf(b));
    if (pool.reduce((n, s) => n + s.count, 0) < count) return false;
    const worn = Object.values(this._equipped).filter((e): e is Equipped => !!e && e.itemId === itemId);
    let left = count;
    // First pass keeps one copy per equipped slot; the second takes what's still needed.
    for (const keepWorn of [true, false]) {
      for (const s of pool) {
        if (!left) break;
        const reserved = keepWorn ? worn.filter((e) => sameCopy(e, s)).length : 0;
        const take = Math.min(left, Math.max(0, s.count - reserved));
        s.count -= take;
        left -= take;
      }
    }
    this._stacks = this._stacks.filter((s) => s.count > 0);
    // Re-point or unequip slots whose copy is gone.
    for (const [slot, e] of Object.entries(this._equipped) as [EquipSlot, Equipped | undefined][]) {
      if (!e || this._stacks.some((s) => sameCopy(e, s))) continue;
      const other = this.bestStack(e.itemId);
      if (other) this._equipped[slot] = { itemId: e.itemId, condition: condOf(other), stolenFrom: other.stolenFrom };
      else this.unequip(slot);
    }
    this.events?.emit('item:removed', { itemId, count, reason: opts.reason });
    this.changed();
    return true;
  }

  /** Drop items on the ground (quest items can't be dropped). */
  drop(itemId: string, count = 1): boolean {
    const def = this.items.get(itemId);
    if (!def || isQuestItem(def)) return false;
    return this.remove(itemId, count, { reason: 'dropped' });
  }

  /** Take every stolen stack out (confiscation). Returns what was removed. */
  removeAllStolen(): ItemStack[] {
    const stolen = this._stacks.filter((s) => s.stolenFrom).map((s) => ({ ...s }));
    for (const s of stolen) this.remove(s.itemId, s.count, { stolenFrom: s.stolenFrom!, reason: 'quest' });
    return stolen;
  }

  /** Mark stolen goods as clean (bought back, pardoned). */
  launder(itemId: string, count = Infinity) {
    let left = count;
    for (const s of [...this._stacks]) {
      if (s.itemId !== itemId || !s.stolenFrom || left <= 0) continue;
      const n = Math.min(left, s.count);
      s.count -= n;
      left -= n;
      this.addToStack(itemId, n, undefined, condOf(s));
    }
    this._stacks = this._stacks.filter((s) => s.count > 0);
    for (const e of Object.values(this._equipped)) if (e?.itemId === itemId) e.stolenFrom = undefined;
    this.changed();
  }

  // ---------------------------------------------------------------- money

  addDenarii(amount: number) {
    if (!(amount > 0)) return;
    this._denarii = roundQ(this._denarii + amount);
    this.events?.emit('denarii:changed', { amount: this._denarii, delta: amount });
    this.changed();
  }

  spendDenarii(amount: number): boolean {
    if (!(amount >= 0)) return false;
    if (amount === 0) return true;
    if (this._denarii + 1e-9 < amount) return false;
    this._denarii = Math.max(0, roundQ(this._denarii - amount));
    this.events?.emit('denarii:changed', { amount: this._denarii, delta: -amount });
    this.changed();
    return true;
  }

  // ---------------------------------------------------------------- equipment

  equipped(slot: EquipSlot): string | undefined {
    return this._equipped[slot]?.itemId;
  }

  /** Condition 0..1 of what is in a slot (undefined if empty). */
  conditionOf(slot: EquipSlot): number | undefined {
    return this._equipped[slot]?.condition;
  }

  isEquipped(itemId: string): boolean {
    return Object.values(this._equipped).some((e) => e?.itemId === itemId);
  }

  private bestStack(itemId: string, condition?: number): ItemStack | undefined {
    const pool = this._stacks.filter((s) => s.itemId === itemId && (condition === undefined || condOf(s) === normCond(condition)));
    return pool.sort((a, b) => Number(!!a.stolenFrom) - Number(!!b.stolenFrom) || condOf(b) - condOf(a))[0];
  }

  /**
   * Equip an item into its slot (the best-condition copy unless `condition` picks one). A two-handed
   * weapon clears the off hand; a shield or torch in the off hand clears a two-handed weapon.
   */
  equip(itemId: string, opts: { condition?: number } = {}): boolean {
    const def = this.items.get(itemId);
    const stack = this.bestStack(itemId, opts.condition);
    if (!def || !stack) return false;
    const slot = slotOf(def);
    if (!slot) return false;
    const cur = this._equipped[slot];
    if (cur && sameCopy(cur, stack)) return true;
    if (slot === 'mainHand' && isTwoHanded(def) && this._equipped.offHand) this.unequip('offHand');
    if (slot === 'offHand' && isTwoHanded(this.items.get(this._equipped.mainHand?.itemId ?? ''))) this.unequip('mainHand');
    if (cur) this.unequip(slot);
    this._equipped[slot] = { itemId, condition: condOf(stack), stolenFrom: stack.stolenFrom };
    this.sheet?.setModifierSource(`equip:${slot}`, def.equipModifiers);
    this.sheet?.setFlagSource(`equip:${slot}`, def.equipFlags);
    this.events?.emit('item:equipped', { itemId, slot });
    this.changed();
    return true;
  }

  unequip(slot: EquipSlot) {
    const e = this._equipped[slot];
    if (!e) return;
    delete this._equipped[slot];
    this.sheet?.setModifierSource(`equip:${slot}`, null);
    this.sheet?.setFlagSource(`equip:${slot}`, null);
    this.events?.emit('item:unequipped', { itemId: e.itemId, slot });
    this.changed();
  }

  /** Item defs of everything worn with an armor or shield rating. */
  wornArmor(): ItemDef[] {
    return this.worn().filter((w) => w.def.armor || w.def.shield).map((w) => w.def);
  }

  /** Worn items with their condition. */
  worn(): { slot: EquipSlot; def: ItemDef; condition: number }[] {
    const out: { slot: EquipSlot; def: ItemDef; condition: number }[] = [];
    for (const [slot, e] of Object.entries(this._equipped) as [EquipSlot, Equipped | undefined][]) {
      const def = e ? this.items.get(e.itemId) : undefined;
      if (e && def) out.push({ slot, def, condition: e.condition });
    }
    return out;
  }

  /**
   * Change the condition of the equipped copy in a slot by `delta` (wear: negative; repair:
   * positive). Small changes add up in the copy's unrounded condition; the copy moves to another
   * stack when the condition to the percent changes. Returns the condition to the percent.
   */
  adjustCondition(slot: EquipSlot, delta: number): number | undefined {
    const e = this._equipped[slot];
    if (!e || !delta || !Number.isFinite(delta)) return e?.condition;
    const exact = clamp01((e.exact ?? e.condition) + delta);
    const to = normCond(exact);
    if (to === e.condition) {
      e.exact = exact;
      return to;
    }
    const from = this._stacks.find((s) => sameCopy(e, s));
    if (!from) return e.condition;
    from.count--;
    this._stacks = this._stacks.filter((s) => s.count > 0);
    this.addToStack(e.itemId, 1, e.stolenFrom, to);
    e.condition = to;
    e.exact = exact;
    this.changed();
    return to;
  }

  /** −1% condition per 100 damage absorbed or dealt (§6.3). Returns the new condition. */
  wear(slot: EquipSlot, damage: number) {
    return this.adjustCondition(slot, -Math.max(0, damage) * COMBAT.wearPerDamage);
  }

  repair(slot: EquipSlot, amount: number) {
    return this.adjustCondition(slot, Math.max(0, amount));
  }

  // ---------------------------------------------------------------- use

  registerUseHandler(itemIdOrTag: string, fn: UseHandler) {
    this.useHandlers.set(itemIdOrTag, fn);
  }

  hasRead(itemId: string) {
    return this.readBooks.has(itemId);
  }

  /** Use a consumable or read a book. Returns true if it was consumed/read. */
  use(itemId: string): boolean {
    const def = this.items.get(itemId);
    if (!def || this.count(itemId) < 1) return false;
    const custom = this.useHandlers.get(itemId) ?? def.tags?.map((t) => this.useHandlers.get(t)).find(Boolean);
    if (custom) {
      const ok = custom(def, this);
      if (ok) this.events?.emit('item:used', { itemId });
      return ok;
    }
    const sheet = this.sheet;
    if (def.type === 'book' || def.text) {
      const first = !this.readBooks.has(itemId);
      this.readBooks.add(itemId);
      if (first && def.teaches && sheet) {
        sheet.raiseSkill(def.teaches, 1);
        // Alexandrian learning: +50% from Greek skill books (half a level's XP on top).
        if (def.tags?.includes('greek') && sheet.hasFlag('trait-alexandrian-learning')) {
          sheet.useSkill(def.teaches, 0.5 * skillXpToNext(sheet.baseSkillLevel(def.teaches), sheet.skillDef(def.teaches)?.difficulty));
        }
      }
      this.events?.emit('book:read', { itemId, first, skill: first ? def.teaches : undefined });
      this.events?.emit('item:used', { itemId });
      return true;
    }
    if (def.type === 'consumable' && def.effects?.length) {
      if (sheet) {
        // Remedies: potion.strength (Aesculapius' blessing); bandages: Celsus' Method ×1.5 and
        // bandage.strength (Aesculapius as patron); food: food.strength (Ceres).
        let magnitude = def.tags?.includes('medicine') ? 1 + sheet.modifier('potion.strength') : 1;
        if (def.tags?.includes('bandage')) magnitude *= (sheet.hasFlag('perk-medicina-celsus') ? 1.5 : 1) * (1 + sheet.modifier('bandage.strength'));
        if (def.tags?.includes('food')) magnitude *= 1 + sheet.modifier('food.strength');
        sheet.applyEffects(`item:${itemId}`, def.effects, { magnitude });
        if (itemId === 'theriaca' && sheet.hasFlag('perk-medicina-theriaca')) sheet.applyEffects('item:theriaca-immunity', [{ kind: 'flag', target: 'poison.immune', amount: 1, duration: 180 }]);
      }
      this.remove(itemId, 1, { reason: 'used' });
      this.events?.emit('item:used', { itemId });
      return true;
    }
    return false;
  }

  /** What the inventory screen does on Enter/click: equip/unequip equipment, otherwise use. */
  activate(itemId: string): boolean {
    const def = this.items.get(itemId);
    if (!def) return false;
    const slot = slotOf(def);
    if (slot && def.type !== 'consumable' && def.type !== 'book') {
      if (this._equipped[slot]?.itemId === itemId) {
        this.unequip(slot);
        return true;
      }
      return this.equip(itemId);
    }
    return this.use(itemId);
  }

  // ---------------------------------------------------------------- change notification

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (err) {
        console.error('[inventory] listener threw', err);
      }
    }
  }

  // ---------------------------------------------------------------- persistence

  serialize() {
    return {
      stacks: this._stacks.map((s) => ({ ...s })),
      denarii: this._denarii,
      equipped: Object.fromEntries(Object.entries(this._equipped).map(([k, e]) => [k, { ...e }])) as Record<string, Equipped>,
      read: [...this.readBooks],
    };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as Partial<ReturnType<InventoryImpl['serialize']>> & { equipment?: Record<string, string> };
    for (const slot of Object.keys(this._equipped) as EquipSlot[]) {
      this.sheet?.setModifierSource(`equip:${slot}`, null);
      this.sheet?.setFlagSource(`equip:${slot}`, null);
    }
    this._equipped = {};
    this._stacks = [];
    for (const s of Array.isArray(d.stacks) ? d.stacks : []) {
      if (!s || typeof s.itemId !== 'string' || !this.items.has(s.itemId)) continue;
      const count = Math.floor(Number(s.count));
      if (!(count > 0)) continue;
      this.addToStack(s.itemId, count, s.stolenFrom || undefined, normCond(typeof s.condition === 'number' ? s.condition : 1));
    }
    this._denarii = typeof d.denarii === 'number' && d.denarii >= 0 ? roundQ(d.denarii) : 0;
    this.readBooks.clear();
    for (const b of Array.isArray(d.read) ? d.read : []) if (typeof b === 'string') this.readBooks.add(b);
    // Older saves stored slot → id.
    const equipped: Record<string, Partial<Equipped> | undefined> = d.equipped ?? Object.fromEntries(Object.entries(d.equipment ?? {}).map(([k, id]) => [k, { itemId: id }]));
    for (const [slot, e] of Object.entries(equipped)) {
      const def = e?.itemId ? this.items.get(e.itemId) : undefined;
      if (!e || !def || slotOf(def) !== slot) continue;
      const exact = this._stacks.find((s) => s.itemId === def.id && (e.condition === undefined || condOf(s) === normCond(e.condition)) && (e.stolenFrom === undefined || s.stolenFrom === e.stolenFrom));
      const stack = exact ?? this.bestStack(def.id);
      if (!stack) continue;
      const cond = condOf(stack);
      // The unrounded wear survives only on the very copy it belongs to.
      const precise = typeof e.exact === 'number' && Number.isFinite(e.exact) && normCond(e.exact) === cond ? clamp01(e.exact) : undefined;
      this._equipped[slot as EquipSlot] = { itemId: def.id, condition: cond, stolenFrom: stack.stolenFrom, ...(precise !== undefined ? { exact: precise } : {}) };
      this.sheet?.setModifierSource(`equip:${slot}`, def.equipModifiers);
      this.sheet?.setFlagSource(`equip:${slot}`, def.equipFlags);
    }
    this.changed();
  }
}

function sameCopy(e: Equipped, s: ItemStack): boolean {
  return e.itemId === s.itemId && e.condition === condOf(s) && (e.stolenFrom ?? undefined) === (s.stolenFrom ?? undefined);
}

/** Quest items (GDD §8.6): ids starting 'quest-', type 'quest' or flagged questItem. */
export function isQuestItem(def: ItemDef): boolean {
  return !!def.questItem || def.type === 'quest' || def.id.startsWith('quest-');
}
