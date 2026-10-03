/**
 * Barter (docs/GDD.md §7.3–7.4): price formulas (pure) and merchant state (game.barter).
 *
 *   buy  = value × max(1.05, 1.60 − 0.50 × mercatura/100 − disposition/200 − Σbuy)
 *   sell = value × min(0.90, 0.35 + 0.35 × mercatura/100 + disposition/200 + Σsell)
 *   fence: stolen goods sell at sell × 0.5 (Receptator perk × 0.7); other vendors refuse them
 *
 * Every modifier goes inside the clamps (nothing multiplies the price after them), so a vendor
 * never buys for more than 0.86 × what it sells for. Σbuy = price.buy + street-wise 0.05 at
 * plebeian vendors + Bilbilis blades 0.20 for the hispanus + market day 0.10 at stalls + the
 * Nundinae perk 0.10 + festival discounts + haggle (+0.10 / −0.05); Σsell = price.sell + haggle
 * (+0.10). Disposition (−20…+20) carries Fama (/10), origin traits, gifts and threats.
 */
import type { EventBus, GameEvents } from '../core/Events';
import { clamp } from '../core/math';
import type { NpcDef } from '../npc/types';
import { rollSkillCheck, traitDisposition } from './checks';
import { BARTER, XP } from './data/tuning';
import { VENDORS, type VendorKind } from './data/vendors';
import type { FactionSystem } from './factions';
import { isQuestItem, type InventoryImpl } from './inventory';
import type { ItemDb } from './items';
import type { CharacterSheetImpl } from './sheet';
import type { EquipSlot, ItemDef, ItemStack } from './types';
import './events';

export interface PriceContext {
  mercatura: number;
  /** −20…+20. */
  disposition?: number;
  /** price.buy / price.sell modifiers (blessings, patrons, omens). */
  buyMod?: number;
  sellMod?: number;
  /** Further Σbuy terms (market day, traits, festival, haggle). */
  buyDiscount?: number;
  /** Further Σsell terms (haggle). */
  sellBonus?: number;
  /** The vendor is a fence (receptator). */
  fence?: boolean;
  /** The Receptator perk: fences pay 70% instead of 50%. */
  fencePerk?: boolean;
}

/** Fractional price → quantized to the quadrans (at least one quadrans for anything with value). */
export function roundPrice(d: number): number {
  if (!(d > 0)) return 0;
  return Math.max(BARTER.round, Math.round(d / BARTER.round) * BARTER.round);
}

const disp = (ctx: PriceContext) => clamp(ctx.disposition ?? 0, -BARTER.dispositionMax, BARTER.dispositionMax);

export function buyFactor(ctx: PriceContext): number {
  return Math.max(BARTER.buyFloor, BARTER.buyBase - BARTER.buyMerc * (ctx.mercatura / 100) - disp(ctx) / 200 - (ctx.buyMod ?? 0) - (ctx.buyDiscount ?? 0));
}

export function sellFactor(ctx: PriceContext): number {
  return Math.min(BARTER.sellCap, BARTER.sellBase + BARTER.sellMerc * (ctx.mercatura / 100) + disp(ctx) / 200 + (ctx.sellMod ?? 0) + (ctx.sellBonus ?? 0));
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

/**
 * Trade XP for one transaction (§5.4): 1 + value/10 (max 50), fencing ×1.5; nothing under 1 den.;
 * `repeats` earlier sales of the same item to the same vendor today halve it each time.
 */
export function tradeXp(value: number, fenced = false, repeats = 0): number {
  const M = XP.mercatura;
  if (value < M.minValue) return 0;
  return Math.min(M.max, M.base + value / M.valueDiv) * (fenced ? M.fenceMult : 1) * Math.pow(M.repeatMult, Math.max(0, repeats));
}

/** Repair cost at a smith or the arms dealer (§7.2 #39): 10% of the value per 25% of condition restored. */
export function repairCost(value: number, condition: number, to = 1): number {
  return roundPrice(value * BARTER.repairPerQuarter * (Math.max(0, to - clamp(condition, 0, 1)) / 0.25));
}

// ------------------------------------------------------------------ merchant state

export type VendorGrade = keyof typeof BARTER.haggle.difficulty;

export interface MerchantState {
  stock: ItemStack[];
  denarii: number;
  /** Game hours (GameTime.totalHours) of the next restock. */
  restockAt: number;
  /** Haggle outcome for one game day: Σbuy and Σsell terms. */
  haggle?: { day: number; buy: number; sell: number };
  /** Disposition changes (failed haggles, gifts). */
  dispositionDelta: number;
  /** Trade XP diminishing returns: item → transactions today. */
  xpLog?: { day: number; counts: Record<string, number> };
}

/** A Faenus Nauticum cargo loan: the outcome is rolled when you invest (§5.5). */
export interface Investment {
  id: number;
  npcId: string;
  stake: number;
  /** Game hours when it can be collected. */
  dueAt: number;
  outcome: 'gain' | 'loss';
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
  /** Festival discounts on buying today (the Mercuralia 0.10). */
  festivalDiscount?: () => number;
  /** The player's sex (a woman in a toga loses disposition, §3.7). */
  sex?: () => 'male' | 'female';
  rng?: { next(): number };
}

export interface TradeResult {
  ok: boolean;
  price: number;
  reason?: 'unknown' | 'not-merchant' | 'no-stock' | 'no-money' | 'merchant-poor' | 'refused' | 'not-owned' | 'no-repair' | 'nothing-to-repair' | 'no-perk' | 'too-much';
}

export class BarterSystem {
  private readonly merchants = new Map<string, MerchantState>();
  private investments: Investment[] = [];
  private nextInvestment = 1;
  /** Extra disposition per NPC (install wires the dialogue memory: threats, gifts). */
  extraDisposition?: (npcId: string) => number;

  constructor(private readonly deps: BarterDeps) {}

  private hours(): number {
    return this.deps.hours?.() ?? 0;
  }

  private day(): number {
    return Math.floor(this.hours() / 24);
  }

  /** Market day: every 8th elapsed day (nundinae). */
  isMarketDay(): boolean {
    return this.day() % BARTER.nundinaeEvery === BARTER.nundinaeEvery - 1;
  }

  /** The vendor kind id from the NPC's tags (`vendor:popina`, §7.3). */
  vendorKind(npc: NpcDef | undefined): string | undefined {
    return npc?.tags?.find((t) => t.startsWith('vendor:'))?.slice(7);
  }

  /** The §7.3 vendor kind of an NPC, if any. */
  vendorDef(npcId: string): VendorKind | undefined {
    const kind = this.vendorKind(this.deps.npcs?.get(npcId));
    return kind ? VENDORS[kind] : undefined;
  }

  /** −20…+20: Fama with the vendor's faction and district /10, origin traits, haggles, gifts and threats. */
  disposition(npcId: string): number {
    const npc = this.deps.npcs?.get(npcId);
    const fama = npc?.faction ? (this.deps.factions?.reputation(npc.faction) ?? 0) : 0;
    let d = fama / 10 + (this.deps.districtFama?.(npcId) ?? 0) / 10 + (this.merchants.get(npcId)?.dispositionDelta ?? 0);
    d += traitDisposition(this.deps.sheet, npc, this.deps.sex?.()) + (this.extraDisposition?.(npcId) ?? 0);
    return clamp(d, -BARTER.dispositionMax, BARTER.dispositionMax);
  }

  /** Price context for trading with an NPC (and optionally for one item). */
  context(npcId?: string, def?: ItemDef): PriceContext {
    const { sheet } = this.deps;
    const npc = npcId ? this.deps.npcs?.get(npcId) : undefined;
    const vendor = npcId ? this.vendorDef(npcId) : undefined;
    const m = npcId ? this.merchants.get(npcId) : undefined;
    const haggle = m?.haggle && m.haggle.day === this.day() ? m.haggle : undefined;
    let buy = haggle?.buy ?? 0;
    if (this.isMarketDay() && vendor?.stall) buy += BARTER.marketDay;
    if (this.isMarketDay() && sheet.hasFlag('perk-mercatura-nundinae')) buy += BARTER.nundinaePerk;
    if (vendor?.plebeian && sheet.hasFlag('trait-street-wise')) buy += BARTER.streetWise;
    if (def?.tags?.includes('bilbilis') && sheet.hasFlag('trait-caesars-countryman')) buy += BARTER.bilbilis;
    buy += this.deps.festivalDiscount?.() ?? 0;
    return {
      mercatura: sheet.skillLevel('mercatura'),
      disposition: npcId ? this.disposition(npcId) : 0,
      buyMod: sheet.modifier('price.buy'),
      sellMod: sheet.modifier('price.sell'),
      buyDiscount: buy,
      sellBonus: haggle?.sell ?? 0,
      fence: !!npc?.services?.includes('fence') || !!vendor?.fence,
      fencePerk: sheet.hasFlag('perk-mercatura-fence'),
    };
  }

  /** The merchant's live stock and purse (refreshed every 2 game days; Argentarius doubles purses). */
  merchant(npcId: string): MerchantState | undefined {
    const npc = this.deps.npcs?.get(npcId);
    let m = this.merchants.get(npcId);
    const now = this.hours();
    if (!npc?.vendor) return m;
    if (!m || now >= m.restockAt) {
      const purse = npc.vendor.denarii * (this.deps.sheet.hasFlag('perk-mercatura-argentarius') ? 2 : 1);
      m = { stock: npc.vendor.stock.map((s) => ({ itemId: s.id, count: s.count })), denarii: purse, restockAt: now + BARTER.restockHours, haggle: m?.haggle, dispositionDelta: m?.dispositionDelta ?? 0, xpLog: m?.xpLog };
      this.merchants.set(npcId, m);
    }
    return m;
  }

  /** What the vendor buys: its NpcDef, else its §7.3 kind. */
  private buysOf(npcId: string): readonly string[] | undefined {
    return this.deps.npcs?.get(npcId)?.vendor?.buys ?? this.vendorDef(npcId)?.buys;
  }

  buyPrice(npcId: string, itemId: string): number | null {
    const def = this.deps.items.get(itemId);
    return def ? buyPrice(def.value, this.context(npcId, def)) : null;
  }

  sellPrice(npcId: string, itemId: string, stolen = false): number | null {
    const def = this.deps.items.get(itemId);
    if (!def) return null;
    return sellPrice(def, this.context(npcId, def), { stolen, buys: this.buysOf(npcId) });
  }

  /** Haggle once per vendor per day (§7.4): a Rhetoric check against the vendor's grade (default from its kind). */
  haggle(npcId: string, grade?: VendorGrade, rng = this.deps.rng ?? { next: Math.random }): { ok: boolean; pass?: boolean; chance?: number } {
    const m = this.merchant(npcId);
    if (!m || m.haggle?.day === this.day()) return { ok: false };
    const H = BARTER.haggle;
    const dc = H.difficulty[grade ?? this.vendorDef(npcId)?.grade ?? 'shop'];
    const bonus = this.deps.sheet.hasFlag('perk-mercatura-argentarius') ? H.argentarius : 0;
    const r = rollSkillCheck(this.deps.sheet.skillLevel('rhetoric') + bonus, dc, rng, this.deps.sheet.modifier('persuade.chance'));
    if (!r.pass && this.deps.sheet.consumeFlag('fortuna.nextRoll')) r.pass = true;
    if (r.pass) {
      m.haggle = { day: this.day(), buy: H.success, sell: H.success };
      this.deps.sheet.useSkill('rhetoric', XP.rhetoric.haggle);
    } else {
      m.haggle = { day: this.day(), buy: H.failure, sell: 0 };
      m.dispositionDelta += H.failureDisposition;
    }
    return { ok: true, pass: r.pass, chance: r.chance };
  }

  /** Trade XP for this transaction with diminishing returns on same-day repeats. */
  private tradeXpFor(m: MerchantState, itemId: string, value: number, fenced: boolean): number {
    if (!m.xpLog || m.xpLog.day !== this.day()) m.xpLog = { day: this.day(), counts: {} };
    const repeats = m.xpLog.counts[itemId] ?? 0;
    m.xpLog.counts[itemId] = repeats + 1;
    return tradeXp(value, fenced, repeats);
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
    this.deps.sheet.useSkill('mercatura', this.tradeXpFor(m, itemId, this.deps.items.get(itemId)!.value * count, false));
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
    this.deps.sheet.useSkill('mercatura', this.tradeXpFor(m, itemId, this.deps.items.get(itemId)!.value * count, stolen));
    this.deps.events?.emit('barter:trade', { npcId, itemId, count, price, kind: 'sell' });
    return { ok: true, price };
  }

  /** Whether an NPC repairs arms and armor (the arms dealer and the smith, §7.3; or the 'smith' service). */
  repairs(npcId: string): boolean {
    return !!this.vendorDef(npcId)?.repairs || !!this.deps.npcs?.get(npcId)?.services?.includes('smith');
  }

  /** Price to repair what is worn in a slot to full condition here. */
  repairPrice(slot: EquipSlot): number | null {
    const inv = this.deps.inventory;
    const id = inv.equipped(slot);
    const cond = inv.conditionOf(slot);
    const def = id ? this.deps.items.get(id) : undefined;
    if (!def || cond === undefined || cond >= 1) return null;
    return repairCost(def.value, cond);
  }

  /** Repair the item worn in a slot to 100% (the arms dealer repairs at the smith's price). */
  repair(npcId: string, slot: EquipSlot): TradeResult {
    if (!this.repairs(npcId)) return { ok: false, price: 0, reason: 'no-repair' };
    const price = this.repairPrice(slot);
    if (price === null) return { ok: false, price: 0, reason: 'nothing-to-repair' };
    const inv = this.deps.inventory;
    if (!inv.spendDenarii(price)) return { ok: false, price, reason: 'no-money' };
    inv.repair(slot, 1);
    const m = this.merchant(npcId);
    if (m) m.denarii += price;
    this.deps.events?.emit('barter:trade', { npcId, itemId: inv.equipped(slot)!, count: 1, price, kind: 'buy' });
    return { ok: true, price };
  }

  // ---------------------------------------------------------------- Faenus Nauticum (perk-mercatura-nauticum)

  /** Largest cargo stake a banker accepts: 20% of their purse. */
  maxStake(npcId: string): number {
    return Math.floor((this.merchant(npcId)?.denarii ?? 0) * BARTER.nauticum.stakeCap);
  }

  /** Invest in a cargo with a banker; the outcome is rolled now (reloading can't change it). */
  invest(npcId: string, stake: number, rng = this.deps.rng ?? { next: Math.random }): TradeResult & { investment?: Investment } {
    if (!this.deps.sheet.hasFlag('perk-mercatura-nauticum')) return { ok: false, price: 0, reason: 'no-perk' };
    if (this.vendorDef(npcId)?.id !== 'argentarius') return { ok: false, price: 0, reason: 'not-merchant' };
    if (!(stake > 0) || stake > this.maxStake(npcId)) return { ok: false, price: stake, reason: 'too-much' };
    if (!this.deps.inventory.spendDenarii(stake)) return { ok: false, price: stake, reason: 'no-money' };
    const N = BARTER.nauticum;
    const investment: Investment = { id: this.nextInvestment++, npcId, stake, dueAt: this.hours() + N.days * 24, outcome: rng.next() < N.successChance ? 'gain' : 'loss' };
    this.investments.push(investment);
    return { ok: true, price: stake, investment: { ...investment } };
  }

  /** Cargoes in flight (the outcome stays hidden in the UI until collected). */
  pendingInvestments(): Omit<Investment, 'outcome'>[] {
    return this.investments.map(({ outcome: _o, ...rest }) => rest);
  }

  /** Collect matured cargoes: +40% on success, nothing on a loss. Returns the denarii received. */
  collectInvestments(): number {
    const now = this.hours();
    let paid = 0;
    this.investments = this.investments.filter((i) => {
      if (now < i.dueAt) return true;
      if (i.outcome === 'gain') paid += roundPrice(i.stake * (1 + BARTER.nauticum.gain));
      return false;
    });
    if (paid > 0) this.deps.inventory.addDenarii(paid);
    return paid;
  }

  serialize() {
    return {
      merchants: Object.fromEntries([...this.merchants].map(([id, m]) => [id, { ...m, stock: m.stock.map((s) => ({ ...s })) }])),
      investments: this.investments.map((i) => ({ ...i })),
      nextInvestment: this.nextInvestment,
    };
  }

  restore(data: unknown) {
    this.merchants.clear();
    const d = (data ?? {}) as { merchants?: Record<string, MerchantState>; investments?: Investment[]; nextInvestment?: number };
    // Older saves stored the merchants map at the top level.
    const merchants = d.merchants ?? (d.investments === undefined ? ((data as Record<string, MerchantState> | undefined) ?? {}) : {});
    for (const [id, m] of Object.entries(merchants)) {
      if (!m || !Array.isArray(m.stock)) continue;
      this.merchants.set(id, {
        stock: m.stock.filter((s) => s && typeof s.itemId === 'string' && s.count > 0).map((s) => ({ itemId: s.itemId, count: s.count })),
        denarii: Number(m.denarii) || 0,
        restockAt: Number(m.restockAt) || 0,
        haggle: m.haggle && typeof m.haggle.day === 'number' ? { day: m.haggle.day, buy: Number(m.haggle.buy) || 0, sell: Number(m.haggle.sell) || 0 } : undefined,
        dispositionDelta: Number(m.dispositionDelta) || 0,
        xpLog: m.xpLog && typeof m.xpLog.day === 'number' ? { day: m.xpLog.day, counts: { ...m.xpLog.counts } } : undefined,
      });
    }
    this.investments = (Array.isArray(d.investments) ? d.investments : [])
      .filter((i) => i && typeof i.stake === 'number' && typeof i.dueAt === 'number' && (i.outcome === 'gain' || i.outcome === 'loss'))
      .map((i) => ({ ...i }));
    this.nextInvestment = typeof d.nextInvestment === 'number' ? d.nextInvestment : this.investments.length + 1;
  }
}
