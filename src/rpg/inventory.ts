/**
 * Inventory: item stacks (stolen goods kept in separate stacks), denarii, equipment slots with
 * two-handed rules, weight/encumbrance, and use/read. Works for the player (with a sheet, for
 * carry capacity, remedies and equipment modifiers) and for NPC containers (without).
 */
import type { EventBus, GameEvents } from '../core/Events';
import { CARRY } from './data/balance';
import { isTwoHanded, slotOf, type ItemDb } from './items';
import type { CharacterSheetImpl } from './sheet';
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
}

/** Custom "use" for misc items (keys, curse tablets…). Return true if it was used. */
export type UseHandler = (def: ItemDef, inv: InventoryImpl) => boolean;

const round16 = (d: number) => Math.round(d * 16) / 16;

export class InventoryImpl implements Inventory {
  private _stacks: ItemStack[] = [];
  private _denarii = 0;
  private _equipment: Partial<Record<EquipSlot, string>> = {};
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
  get equipment(): Readonly<Partial<Record<EquipSlot, string>>> {
    return this._equipment;
  }

  /** Total carried weight (kg). Worn heavy/light armor counts as weightless with the matching perk. */
  get weight(): number {
    let w = 0;
    for (const s of this._stacks) w += (this.items.get(s.itemId)?.weight ?? 0) * s.count;
    if (this.sheet) {
      const heavyFree = this.sheet.hasFlag('heavy.weightless');
      const lightFree = this.sheet.hasFlag('light.weightless');
      if (heavyFree || lightFree) {
        for (const id of Object.values(this._equipment)) {
          const d = id ? this.items.get(id) : undefined;
          const wc = d?.armor?.weightClass;
          if ((wc === 'heavy' && heavyFree) || (wc === 'light' && lightFree)) w -= d!.weight;
        }
      }
    }
    return Math.max(0, w);
  }

  get maxWeight(): number {
    return this.sheet ? this.sheet.carryCapacity() : this.baseMaxWeight;
  }

  get overEncumbered(): boolean {
    return this.weight > this.maxWeight + 1e-9;
  }

  /** Movement speed multiplier from encumbrance (1 normally). */
  speedMultiplier(): number {
    return this.overEncumbered ? CARRY.overSpeed : 1;
  }

  count(itemId: string, opts: { stolen?: boolean } = {}): number {
    let n = 0;
    for (const s of this._stacks) {
      if (s.itemId !== itemId) continue;
      if (opts.stolen === true && !s.stolenFrom) continue;
      if (opts.stolen === false && s.stolenFrom) continue;
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

  /** Stacks joined with their definitions, for UI lists. */
  list(filter?: (def: ItemDef, stack: ItemStack) => boolean): { def: ItemDef; stack: ItemStack; equipped: boolean }[] {
    const out: { def: ItemDef; stack: ItemStack; equipped: boolean }[] = [];
    for (const stack of this._stacks) {
      const def = this.items.get(stack.itemId);
      if (!def || (filter && !filter(def, stack))) continue;
      // An equipped item shows as equipped on its clean stack (or the stolen one if that's all there is).
      const equipped = this.isEquipped(stack.itemId) && (!stack.stolenFrom || this.count(stack.itemId, { stolen: false }) === 0);
      out.push({ def, stack, equipped });
    }
    return out;
  }

  // ---------------------------------------------------------------- add / remove

  add(itemId: string, count = 1, opts: AddOptions = {}) {
    count = Math.floor(count);
    if (count <= 0) return;
    if (!this.items.has(itemId)) {
      console.warn(`[inventory] unknown item "${itemId}"`);
      return;
    }
    const stolenFrom = opts.stolenFrom || undefined;
    const s = this._stacks.find((x) => x.itemId === itemId && x.stolenFrom === stolenFrom);
    if (s) s.count += count;
    else this._stacks.push(stolenFrom ? { itemId, count, stolenFrom } : { itemId, count });
    this.events?.emit('item:added', { itemId, count, source: opts.source, silent: opts.silent, stolen: !!stolenFrom });
    this.changed();
  }

  /**
   * Remove items. Without `stolenFrom`, clean stacks go first, then stolen ones. Returns false
   * (removing nothing) if there aren't enough.
   */
  remove(itemId: string, count = 1, opts: { stolenFrom?: string | null; reason?: GameEvents['item:removed']['reason'] } = {}): boolean {
    count = Math.floor(count);
    if (count <= 0) return true;
    const pool = this._stacks
      .filter((s) => s.itemId === itemId && (opts.stolenFrom === undefined || (s.stolenFrom ?? null) === opts.stolenFrom))
      .sort((a, b) => Number(!!a.stolenFrom) - Number(!!b.stolenFrom));
    if (pool.reduce((n, s) => n + s.count, 0) < count) return false;
    let left = count;
    for (const s of pool) {
      const take = Math.min(left, s.count);
      s.count -= take;
      left -= take;
      if (!left) break;
    }
    this._stacks = this._stacks.filter((s) => s.count > 0);
    if (this.count(itemId) === 0) {
      for (const slot of Object.keys(this._equipment) as EquipSlot[]) if (this._equipment[slot] === itemId) this.unequip(slot);
    }
    this.events?.emit('item:removed', { itemId, count, reason: opts.reason });
    this.changed();
    return true;
  }

  /** Take every stolen stack out (confiscation). Returns what was removed. */
  removeAllStolen(): ItemStack[] {
    const stolen = this._stacks.filter((s) => s.stolenFrom).map((s) => ({ ...s }));
    for (const s of stolen) this.remove(s.itemId, s.count, { stolenFrom: s.stolenFrom!, reason: 'quest' });
    return stolen;
  }

  /** Mark stolen goods as clean (bought back, fenced to you, pardon). */
  launder(itemId: string, count = Infinity) {
    let left = count;
    for (const s of this._stacks) {
      if (s.itemId !== itemId || !s.stolenFrom || left <= 0) continue;
      const n = Math.min(left, s.count);
      s.count -= n;
      left -= n;
      const clean = this._stacks.find((x) => x.itemId === itemId && !x.stolenFrom);
      if (clean) clean.count += n;
      else this._stacks.push({ itemId, count: n });
    }
    this._stacks = this._stacks.filter((s) => s.count > 0);
    this.changed();
  }

  // ---------------------------------------------------------------- money

  addDenarii(amount: number) {
    if (!(amount > 0)) return;
    this._denarii = round16(this._denarii + amount);
    this.events?.emit('denarii:changed', { amount: this._denarii, delta: amount });
    this.changed();
  }

  spendDenarii(amount: number): boolean {
    if (!(amount >= 0)) return false;
    if (amount === 0) return true;
    if (this._denarii + 1e-9 < amount) return false;
    this._denarii = Math.max(0, round16(this._denarii - amount));
    this.events?.emit('denarii:changed', { amount: this._denarii, delta: -amount });
    this.changed();
    return true;
  }

  // ---------------------------------------------------------------- equipment

  equipped(slot: EquipSlot): string | undefined {
    return this._equipment[slot];
  }

  isEquipped(itemId: string): boolean {
    for (const id of Object.values(this._equipment)) if (id === itemId) return true;
    return false;
  }

  /**
   * Equip an item into its slot. A two-handed weapon clears the off hand; a shield or torch in the
   * off hand clears a two-handed weapon. Returns false if the item can't be equipped.
   */
  equip(itemId: string): boolean {
    const def = this.items.get(itemId);
    if (!def || this.count(itemId) < 1) return false;
    const slot = slotOf(def);
    if (!slot) return false;
    if (this._equipment[slot] === itemId) return true;
    if (slot === 'mainHand' && isTwoHanded(def) && this._equipment.offHand) this.unequip('offHand');
    if (slot === 'offHand' && isTwoHanded(this.items.get(this._equipment.mainHand ?? ''))) this.unequip('mainHand');
    if (this._equipment[slot]) this.unequip(slot);
    this._equipment[slot] = itemId;
    this.sheet?.setModifierSource(`equip:${slot}`, def.equipModifiers);
    this.events?.emit('item:equipped', { itemId, slot });
    this.changed();
    return true;
  }

  unequip(slot: EquipSlot) {
    const itemId = this._equipment[slot];
    if (!itemId) return;
    delete this._equipment[slot];
    this.sheet?.setModifierSource(`equip:${slot}`, null);
    this.events?.emit('item:unequipped', { itemId, slot });
    this.changed();
  }

  /** Item defs of everything worn that has an armor or shield rating. */
  wornArmor(): ItemDef[] {
    const out: ItemDef[] = [];
    for (const id of Object.values(this._equipment)) {
      const d = id ? this.items.get(id) : undefined;
      if (d && (d.armor || d.shield)) out.push(d);
    }
    return out;
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
    if (def.type === 'book' || def.text) {
      const first = !this.readBooks.has(itemId);
      this.readBooks.add(itemId);
      if (first && def.teaches && this.sheet) this.sheet.raiseSkill(def.teaches, 1);
      this.events?.emit('book:read', { itemId, first, skill: first ? def.teaches : undefined });
      this.events?.emit('item:used', { itemId });
      return true;
    }
    if (def.type === 'consumable' && def.effects?.length) {
      const remedy = def.tags?.includes('medicine');
      this.sheet?.applyEffects(`item:${itemId}`, def.effects, { magnitude: remedy && this.sheet ? 1 + this.sheet.modifier('potion.strength') : 1 });
      // Eat clean food before stolen food.
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
      if (this._equipment[slot] === itemId) {
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
      equipment: { ...this._equipment },
      read: [...this.readBooks],
    };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as Partial<ReturnType<InventoryImpl['serialize']>>;
    for (const slot of Object.keys(this._equipment) as EquipSlot[]) this.sheet?.setModifierSource(`equip:${slot}`, null);
    this._equipment = {};
    this._stacks = [];
    for (const s of Array.isArray(d.stacks) ? d.stacks : []) {
      if (!s || typeof s.itemId !== 'string' || !this.items.has(s.itemId)) continue;
      const count = Math.floor(Number(s.count));
      if (!(count > 0)) continue;
      const ex = this._stacks.find((x) => x.itemId === s.itemId && x.stolenFrom === (s.stolenFrom || undefined));
      if (ex) ex.count += count;
      else this._stacks.push(s.stolenFrom ? { itemId: s.itemId, count, stolenFrom: s.stolenFrom } : { itemId: s.itemId, count });
    }
    this._denarii = typeof d.denarii === 'number' && d.denarii >= 0 ? round16(d.denarii) : 0;
    this.readBooks.clear();
    for (const b of Array.isArray(d.read) ? d.read : []) if (typeof b === 'string') this.readBooks.add(b);
    for (const [slot, id] of Object.entries(d.equipment ?? {})) {
      const def = id ? this.items.get(id) : undefined;
      if (!def || this.count(id!) < 1 || slotOf(def) !== slot) continue;
      this._equipment[slot as EquipSlot] = id;
      this.sheet?.setModifierSource(`equip:${slot}`, def.equipModifiers);
    }
    this.changed();
  }
}
