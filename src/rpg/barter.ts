/**
 * Barter (docs/GDD.md §7.3–7.4): price formulas (pure) and merchant state (game.barter).
 *
 *   buy  = value × max(1.05, 1.60 − 0.50 × mercatura/100 − disposition/200 − price.buy)
 *   sell = value × min(0.90, 0.35 + 0.35 × mercatura/100 + disposition/200 + price.sell)
 *   fence: stolen goods sell at sell × 0.5 (Receptator perk × 0.7); other vendors refuse them
 *
 * Disposition runs −20…+20 (Fama with the vendor's faction /10, origin traits, haggling, gifts).
 * Market days (nundinae, every 8th day) give −10% at stall vendors (every vendor with the Nundinae
 * perk). Haggling is one Rhetoric check per vendor per day: −10% buy / +10% sell on success, +5%
 * and −5 disposition on failure. Prices are quantized to the quadrans; a vendor never buys an item
 * for more than they would sell it.
 */
import type { EventBus, GameEvents } from '../core/Events';
import { clamp } from '../core/math';
import type { NpcDef } from '../npc/types';
import { rollSkillCheck, traitDisposition } from './checks';
import { BARTER, XP } from './data/balance';
import type { FactionSystem } from './factions';
import { isQuestItem, type InventoryImpl } from './inventory';
import type { ItemDb } from './items';
import type { CharacterSheetImpl } from './sheet';
import type { ItemDef, ItemStack } from './types';
import './events';

export interface PriceContext {
  mercatura: number;
  /** −20…+20. */
  disposition?: number;
  /** price.buy / price.sell modifiers. */
  buyMod?: number;
  sellMod?: number;
  /** Extra fractional discount on buying (market day, haggle won, trait). */
  buyDiscount?: number;
  /** Extra fractional bonus on selling (haggle won). */
  sellBonus?: number;
  /** The vendor is a fence (receptator). */
  fence?: boolean;
  /** The Receptator perk: fences pay the full fence rate. */
  fencePerk?: boolean;
}

/** Fractional price → quantized to the quadrans (at least one quadrans for anything with value). */
export function roundPrice(d: number): number {
  if (!(d > 0)) return 0;
  return Math.max(BARTER.round, Math.round(d / BARTER.round) * BARTER.round);
}

export function buyFactor(ctx: PriceContext): number {
  const disp = clamp(ctx.disposition ?? 0, -BARTER.dispositionMax, BARTER.dispositionMax);
  const f = Math.max(BARTER.buyFloor, BARTER.buyBase - BARTER.buyMerc * (ctx.mercatura / 100) - disp / 200 - (ctx.buyMod ?? 0));
  return f * Math.max(0, 1 - (ctx.buyDiscount ?? 0));
}

export function sellFactor(ctx: PriceContext): number {
  const disp = clamp(ctx.disposition ?? 0, -BARTER.dispositionMax, BARTER.dispositionMax);
  const f = Math.min(BARTER.sellCap, BARTER.sellBase + BARTER.sellMerc * (ctx.mercatura / 100) + disp / 200 + (ctx.sellMod ?? 0)) * (1 + (ctx.sellBonus ?? 0));
  // No buy-low/sell-high loops, whatever the discounts.
  return Math.min(f, buyFactor(ctx) * 0.95);
}

/** What the player pays for one item. */
export function buyPrice(value: number, ctx: PriceContext): number {
  return roundPrice(value * buyFactor(ctx));
}

/**
 * What a vendor pays for one item, or null when they refuse: quest items, worthless items, stolen
 * goods to anyone but a fence, or a type the vendor doesn't deal in.
 */
export function sellPrice(def: ItemDef, ctx: PriceContext, opts: { stolen?: boolean; buys?: readonly string[] } = {}): number | null {
  if (isQuestItem(def) || !(def.value > 0)) return null;
  if (opts.stolen && !ctx.fence) return null;
  if (opts.buys && !ctx.fence && !opts.buys.includes(def.type)) return null;
  let p = def.value * sellFactor(ctx);
  if (opts.stolen) p *= ctx.fencePerk ? BARTER.fencePerkMult : BARTER.fenceMult;
  return Math.min(roundPrice(p), buyPrice(def.value, ctx));
}

/** Trade XP for one transaction (§5.4): 1 + value/10 (max 50), fencing ×1.5. */
export function tradeXp(value: number, fenced = false): number {
  return Math.min(XP.mercatura.max, XP.mercatura.base + value / XP.mercatura.valueDiv) * (fenced ? XP.mercatura.fenceMult : 1);
}

// ------------------------------------------------------------------ merchant state

/** Vendor kinds whose customers are the plebs (street-wise trait) and stall vendors (market days). */
const PLEBEIAN = new Set(['popina', 'caupona', 'pistor', 'macellarius', 'fullo', 'tonsor']);
const STALLS = new Set(['pistor', 'macellarius', 'popina']);

export type VendorGrade = keyof typeof BARTER.haggle.difficulty;

export interface MerchantState {
  stock: ItemStack[];
  denarii: number;
  /** Game hours (GameTime.totalHours) of the next restock. */
  restockAt: number;
  /** Haggle outcome for one game day. */
  haggle?: { day: number; buy: number; sell: number };
  /** Disposition changes (failed haggles, gifts). */
  dispositionDelta: number;
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
  /** District Fama of where the vendor stands (optional). */
  districtFama?: (npcId: string) => number;
  rng?: { next(): number };
}

export interface TradeResult {
  ok: boolean;
  price: number;
  reason?: 'unknown' | 'not-merchant' | 'no-stock' | 'no-money' | 'merchant-poor' | 'refused' | 'not-owned';
}

export class BarterSystem {
  private readonly merchants = new Map<string, MerchantState>();
  /** Extra disposition per NPC (install wires the dialogue memory: threats, gifts). */
  extraDisposition?: (npcId: string) => number;

  constructor(private readonly deps: BarterDeps) {}

  private day(): number {
    return Math.floor((this.deps.hours?.() ?? 0) / 24);
  }

  /** Market day: every 8th elapsed day (nundinae). */
  isMarketDay(): boolean {
    return this.day() % BARTER.nundinaeEvery === BARTER.nundinaeEvery - 1;
  }

  /** The vendor kind from the NPC's tags (GDD §7.3 ids: popina, armorum-negotiator, argentarius…). */
  vendorKind(npc: NpcDef | undefined): string | undefined {
    return npc?.tags?.find((t) => t.startsWith('vendor:'))?.slice(7);
  }

  /**
   * −20…+20: Fama with the vendor's faction and district /10, origin traits (street-wise +10 at
   * plebeian vendors = −5% prices; Caesar's countryman, old wound…), haggles, gifts and threats.
   */
  disposition(npcId: string): number {
    const npc = this.deps.npcs?.get(npcId);
    const fama = npc?.faction ? (this.deps.factions?.reputation(npc.faction) ?? 0) : 0;
    let d = fama / 10 + (this.deps.districtFama?.(npcId) ?? 0) / 10 + (this.merchants.get(npcId)?.dispositionDelta ?? 0);
    if (this.deps.sheet.hasFlag('trait-street-wise') && PLEBEIAN.has(this.vendorKind(npc) ?? '')) d += 10;
    d += traitDisposition(this.deps.sheet, npc) + (this.extraDisposition?.(npcId) ?? 0);
    return clamp(d, -BARTER.dispositionMax, BARTER.dispositionMax);
  }

  /** Price context for trading with an NPC (and optionally for one item). */
  context(npcId?: string, def?: ItemDef): PriceContext {
    const { sheet } = this.deps;
    const npc = npcId ? this.deps.npcs?.get(npcId) : undefined;
    const m = npcId ? this.merchants.get(npcId) : undefined;
    const haggle = m?.haggle && m.haggle.day === this.day() ? m.haggle : undefined;
    let buyDiscount = haggle?.buy ?? 0;
    if (this.isMarketDay() && (STALLS.has(this.vendorKind(npc) ?? '') || sheet.hasFlag('perk-mercatura-nundinae'))) buyDiscount += BARTER.nundinaeDiscount;
    if (def?.tags?.includes('bilbilis') && sheet.hasFlag('trait-caesars-countryman')) buyDiscount += 0.2;
    return {
      mercatura: sheet.skillLevel('mercatura'),
      disposition: npcId ? this.disposition(npcId) : 0,
      buyMod: sheet.modifier('price.buy'),
      sellMod: sheet.modifier('price.sell'),
      buyDiscount,
      sellBonus: haggle?.sell ?? 0,
      fence: !!npc?.services?.includes('fence') || this.vendorKind(npc) === 'receptator',
      fencePerk: sheet.hasFlag('perk-mercatura-fence'),
    };
  }

  /** The merchant's live stock and purse (refreshed every 2 game days; Argentarius doubles purses). */
  merchant(npcId: string): MerchantState | undefined {
    const npc = this.deps.npcs?.get(npcId);
    let m = this.merchants.get(npcId);
    const now = this.deps.hours?.() ?? 0;
    if (!npc?.vendor) return m;
    if (!m || now >= m.restockAt) {
      const purse = npc.vendor.denarii * (this.deps.sheet.hasFlag('perk-mercatura-argentarius') ? 2 : 1);
      m = { stock: npc.vendor.stock.map((s) => ({ itemId: s.id, count: s.count })), denarii: purse, restockAt: now + BARTER.restockHours, haggle: m?.haggle, dispositionDelta: m?.dispositionDelta ?? 0 };
      this.merchants.set(npcId, m);
    }
    return m;
  }

  buyPrice(npcId: string, itemId: string): number | null {
    const def = this.deps.items.get(itemId);
    return def ? buyPrice(def.value, this.context(npcId, def)) : null;
  }

  sellPrice(npcId: string, itemId: string, stolen = false): number | null {
    const def = this.deps.items.get(itemId);
    if (!def) return null;
    return sellPrice(def, this.context(npcId, def), { stolen, buys: this.deps.npcs?.get(npcId)?.vendor?.buys });
  }

  /** Haggle once per vendor per day (§7.4): a Rhetoric check against the vendor's grade. */
  haggle(npcId: string, grade: VendorGrade = 'shop', rng = this.deps.rng ?? { next: Math.random }): { ok: boolean; pass?: boolean; chance?: number } {
    const m = this.merchant(npcId);
    if (!m || m.haggle?.day === this.day()) return { ok: false };
    const H = BARTER.haggle;
    const bonus = this.deps.sheet.hasFlag('perk-mercatura-argentarius') ? 15 : 0;
    const r = rollSkillCheck(this.deps.sheet.skillLevel('rhetoric') + bonus, H.difficulty[grade], rng, this.deps.sheet.modifier('persuade.chance'));
    if (r.pass) {
      m.haggle = { day: this.day(), buy: H.success, sell: H.success };
      this.deps.sheet.useSkill('rhetoric', XP.rhetoric.haggle);
    } else {
      m.haggle = { day: this.day(), buy: -H.failure, sell: -H.failure };
      m.dispositionDelta += H.failureDisposition;
    }
    return { ok: true, pass: r.pass, chance: r.chance };
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
    this.deps.sheet.useSkill('mercatura', tradeXp(this.deps.items.get(itemId)!.value * count));
    this.deps.events?.emit('barter:trade', { npcId, itemId, count, price, kind: 'buy' });
    return { ok: true, price };
  }

  /** Sell `count` items. Clean stacks first unless `stolenFrom` picks a stolen stack. */
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
    this.deps.sheet.useSkill('mercatura', tradeXp(this.deps.items.get(itemId)!.value * count, stolen));
    this.deps.events?.emit('barter:trade', { npcId, itemId, count, price, kind: 'sell' });
    return { ok: true, price };
  }

  serialize() {
    return Object.fromEntries([...this.merchants].map(([id, m]) => [id, { ...m, stock: m.stock.map((s) => ({ ...s })) }]));
  }

  restore(data: unknown) {
    this.merchants.clear();
    for (const [id, m] of Object.entries((data ?? {}) as Record<string, MerchantState>)) {
      if (!m || !Array.isArray(m.stock)) continue;
      this.merchants.set(id, {
        stock: m.stock.filter((s) => s && typeof s.itemId === 'string' && s.count > 0).map((s) => ({ itemId: s.itemId, count: s.count })),
        denarii: Number(m.denarii) || 0,
        restockAt: Number(m.restockAt) || 0,
        haggle: m.haggle && typeof m.haggle.day === 'number' ? { day: m.haggle.day, buy: Number(m.haggle.buy) || 0, sell: Number(m.haggle.sell) || 0 } : undefined,
        dispositionDelta: Number(m.dispositionDelta) || 0,
      });
    }
  }
}
