/**
 * Barter: price formulas (pure) and merchant state (game.barter).
 *
 *   barter skill = 0.8 × Mercatura + 0.2 × Rhetoric
 *   buy  = value × lerp(1.5, 1.05, skill/100) × (1 − price.buy) × (1 − faction discount), ≥ 0.9 × value
 *   sell = value × lerp(0.30, 0.65, skill/100) × (1 + price.sell), ≤ 0.9 × buy   (no arbitrage)
 *   stolen goods: only fences (or the 'barter.fence' perk) buy them; fences pay × 0.6
 *
 * `value` in the item catalogue is a fair retail price, so a skilled trader buys near it.
 */
import type { EventBus, GameEvents } from '../core/Events';
import { lerp, clamp } from '../core/math';
import type { NpcDef } from '../npc/types';
import { BARTER } from './data/balance';
import type { FactionSystem } from './factions';
import type { InventoryImpl } from './inventory';
import type { ItemDb } from './items';
import type { CharacterSheetImpl } from './sheet';
import type { ItemDef, ItemStack } from './types';
import './events';

export interface PriceContext {
  mercatura: number;
  rhetoric: number;
  /** price.buy modifier (fraction off). */
  buyMod?: number;
  /** price.sell modifier (fraction more). */
  sellMod?: number;
  /** Faction / friendship discount (fraction off buying). */
  discount?: number;
  /** The merchant is a fence. */
  fence?: boolean;
  /** Player flags: 'barter.fence' (sell stolen anywhere), 'barter.fenceFull' (full price). */
  flags?: ReadonlySet<string> | { has(f: string): boolean };
}

export function barterSkill(mercatura: number, rhetoric: number): number {
  return clamp(mercatura * BARTER.wMerc + rhetoric * BARTER.wRhet, 0, 100);
}

/** Price rounded to the nearest as, at least one as for anything with value. */
export function roundPrice(d: number): number {
  if (!(d > 0)) return 0;
  return Math.max(BARTER.round, Math.round(d / BARTER.round) * BARTER.round);
}

export function buyFactor(ctx: PriceContext): number {
  const s = barterSkill(ctx.mercatura, ctx.rhetoric) / 100;
  const f = lerp(BARTER.buyMax, BARTER.buyMin, s) * Math.max(0, 1 - (ctx.buyMod ?? 0)) * Math.max(0, 1 - (ctx.discount ?? 0));
  return Math.max(BARTER.buyFloor, f);
}

export function sellFactor(ctx: PriceContext): number {
  const s = barterSkill(ctx.mercatura, ctx.rhetoric) / 100;
  const f = lerp(BARTER.sellMin, BARTER.sellMax, s) * (1 + (ctx.sellMod ?? 0));
  return Math.min(f, buyFactor(ctx) * BARTER.sellCapOfBuy);
}

/** What the player pays for one item. */
export function buyPrice(value: number, ctx: PriceContext): number {
  return roundPrice(value * buyFactor(ctx));
}

/**
 * What a merchant pays for one item, or null when they refuse: quest items, worthless items,
 * stolen goods to a non-fence, or an item type the merchant doesn't deal in.
 */
export function sellPrice(def: ItemDef, ctx: PriceContext, opts: { stolen?: boolean; buys?: readonly string[] } = {}): number | null {
  if (def.questItem || def.type === 'quest' || !(def.value > 0)) return null;
  const sellsStolenAnywhere = !!ctx.flags?.has('barter.fence');
  if (opts.stolen && !ctx.fence && !sellsStolenAnywhere) return null;
  if (opts.buys && !ctx.fence && !opts.buys.includes(def.type)) return null;
  let p = def.value * sellFactor(ctx);
  if (opts.stolen && !ctx.flags?.has('barter.fenceFull')) p *= BARTER.fenceMult;
  // Never pay more than the merchant would charge.
  return Math.min(roundPrice(p), buyPrice(def.value, ctx));
}

// ------------------------------------------------------------------ merchant state

export interface MerchantState {
  stock: ItemStack[];
  denarii: number;
  /** Game hours (GameTime.totalHours) of the next restock. */
  restockAt: number;
}

export interface BarterDeps {
  items: ItemDb;
  inventory: InventoryImpl;
  sheet: CharacterSheetImpl;
  npcs?: { get(id: string): NpcDef | undefined };
  factions?: FactionSystem;
  events?: EventBus<GameEvents>;
  /** Game clock in hours. */
  hours?: () => number;
}

export interface TradeResult {
  ok: boolean;
  price: number;
  reason?: 'unknown' | 'not-merchant' | 'no-stock' | 'no-money' | 'merchant-poor' | 'refused' | 'not-owned';
}

export class BarterSystem {
  private readonly merchants = new Map<string, MerchantState>();

  constructor(private readonly deps: BarterDeps) {}

  /** Price context for trading with an NPC. */
  context(npcId?: string): PriceContext {
    const { sheet, factions } = this.deps;
    const npc = npcId ? this.deps.npcs?.get(npcId) : undefined;
    let discount = 0;
    if (npc?.faction && factions?.isMember(npc.faction)) discount = Math.min(BARTER.factionCap, BARTER.factionPerRank * (factions.rankIndex(npc.faction) + 1));
    return {
      mercatura: sheet.skillLevel('mercatura'),
      rhetoric: sheet.skillLevel('rhetoric'),
      buyMod: sheet.modifier('price.buy'),
      sellMod: sheet.modifier('price.sell'),
      discount,
      fence: !!npc?.services?.includes('fence'),
      flags: { has: (f: string) => sheet.hasFlag(f) },
    };
  }

  /** The merchant's live stock and purse (restocked on schedule). */
  merchant(npcId: string): MerchantState | undefined {
    const npc = this.deps.npcs?.get(npcId);
    let m = this.merchants.get(npcId);
    const now = this.deps.hours?.() ?? 0;
    if (!npc?.vendor) return m;
    if (!m || now >= m.restockAt) {
      m = { stock: npc.vendor.stock.map((s) => ({ itemId: s.id, count: s.count })), denarii: npc.vendor.denarii, restockAt: now + BARTER.restockHours };
      this.merchants.set(npcId, m);
    }
    return m;
  }

  buyPrice(npcId: string, itemId: string): number | null {
    const def = this.deps.items.get(itemId);
    return def ? buyPrice(def.value, this.context(npcId)) : null;
  }

  sellPrice(npcId: string, itemId: string, stolen = false): number | null {
    const def = this.deps.items.get(itemId);
    if (!def) return null;
    return sellPrice(def, this.context(npcId), { stolen, buys: this.deps.npcs?.get(npcId)?.vendor?.buys });
  }

  buy(npcId: string, itemId: string, count = 1): TradeResult {
    const m = this.merchant(npcId);
    if (!m) return { ok: false, price: 0, reason: 'not-merchant' };
    const stack = m.stock.find((s) => s.itemId === itemId);
    if (!stack || stack.count < count) return { ok: false, price: 0, reason: 'no-stock' };
    const unit = this.buyPrice(npcId, itemId);
    if (unit === null) return { ok: false, price: 0, reason: 'unknown' };
    const price = roundPrice(unit * count) || 0;
    if (!this.deps.inventory.spendDenarii(price)) return { ok: false, price, reason: 'no-money' };
    stack.count -= count;
    m.stock = m.stock.filter((s) => s.count > 0);
    m.denarii += price;
    this.deps.inventory.add(itemId, count, { source: 'barter' });
    this.train(price);
    this.deps.events?.emit('barter:trade', { npcId, itemId, count, price, kind: 'buy' });
    return { ok: true, price };
  }

  /** Sell `count` items. Clean stacks are sold first unless `stolenFrom` picks a stolen stack. */
  sell(npcId: string, itemId: string, count = 1, stolenFrom?: string): TradeResult {
    const m = this.merchant(npcId);
    if (!m) return { ok: false, price: 0, reason: 'not-merchant' };
    const inv = this.deps.inventory;
    const stolen = !!stolenFrom;
    if (inv.count(itemId, { stolen }) < count) return { ok: false, price: 0, reason: 'not-owned' };
    const unit = this.sellPrice(npcId, itemId, stolen);
    if (unit === null) return { ok: false, price: 0, reason: 'refused' };
    const price = roundPrice(unit * count) || 0;
    if (m.denarii + 1e-9 < price) return { ok: false, price, reason: 'merchant-poor' };
    inv.remove(itemId, count, { stolenFrom: stolenFrom ?? null, reason: 'sold' });
    inv.addDenarii(price);
    m.denarii -= price;
    const s = m.stock.find((x) => x.itemId === itemId);
    if (s) s.count += count;
    else m.stock.push({ itemId, count });
    this.train(price);
    this.deps.events?.emit('barter:trade', { npcId, itemId, count, price, kind: 'sell' });
    return { ok: true, price };
  }

  private train(price: number) {
    this.deps.sheet.useSkill('mercatura', price * BARTER.xpPerDenarius);
  }

  serialize() {
    return Object.fromEntries([...this.merchants].map(([id, m]) => [id, { stock: m.stock.map((s) => ({ ...s })), denarii: m.denarii, restockAt: m.restockAt }]));
  }

  restore(data: unknown) {
    this.merchants.clear();
    for (const [id, m] of Object.entries((data ?? {}) as Record<string, MerchantState>)) {
      if (!m || !Array.isArray(m.stock)) continue;
      this.merchants.set(id, {
        stock: m.stock.filter((s) => s && typeof s.itemId === 'string' && s.count > 0).map((s) => ({ itemId: s.itemId, count: s.count })),
        denarii: Number(m.denarii) || 0,
        restockAt: Number(m.restockAt) || 0,
      });
    }
  }
}
