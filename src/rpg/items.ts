/** Item database: id → ItemDef, plus the slot rules equipment uses. */
import type { EquipSlot, ItemDef, ItemType } from './types';

export class ItemDb {
  private map = new Map<string, ItemDef>();

  constructor(defs: readonly ItemDef[] = []) {
    this.register(defs);
  }

  /** Add or replace definitions (content packs, quest items). */
  register(defs: ItemDef | readonly ItemDef[]) {
    for (const d of Array.isArray(defs) ? defs : [defs as ItemDef]) {
      if (this.map.has(d.id) && this.map.get(d.id) !== d) console.warn(`[items] "${d.id}" redefined`);
      this.map.set(d.id, d);
    }
  }

  get(id: string): ItemDef | undefined {
    return this.map.get(id);
  }

  require(id: string): ItemDef {
    const d = this.map.get(id);
    if (!d) throw new Error(`[items] unknown item "${id}"`);
    return d;
  }

  has(id: string) {
    return this.map.has(id);
  }

  all(): ItemDef[] {
    return [...this.map.values()];
  }

  byType(type: ItemType): ItemDef[] {
    return this.all().filter((d) => d.type === type);
  }

  byTag(tag: string): ItemDef[] {
    return this.all().filter((d) => d.tags?.includes(tag));
  }

  get size() {
    return this.map.size;
  }
}

/** The slot an item equips into, or undefined if it can't be equipped. */
export function slotOf(def: ItemDef): EquipSlot | undefined {
  if (def.slot) return def.slot;
  switch (def.type) {
    case 'weapon':
      return 'mainHand';
    case 'shield':
      return 'offHand';
    case 'ammo':
      return 'ammo';
    default:
      return undefined;
  }
}

export function isTwoHanded(def: ItemDef | undefined): boolean {
  return !!def?.weapon?.twoHanded;
}
