/**
 * What the shopkeepers and teachers of the content bible do when a conversation asks for a service
 * ('dialogue:service' with barter, train, heal, repair or rent: "Show me your wares", "Teach me",
 * "Treat my wounds", "A room for the night"). Nobody else answers that event, so without this the
 * three v0.1 vendors (the arms dealer, the popina, the aedituus) would talk and never trade (AC-16):
 *
 *   barter   a BarterView over game.barter (stock, purses, the §7.4 prices, stolen goods refused unless
 *            the merchant fences) for UIManager.openBarter
 *   train    one lesson from the NPC's `trainer` (cost and caps of GDD §5.1), as a toast
 *   repair   everything worn is repaired at the smith's price (the arms dealer, GDD §7.3)
 *   heal     the physician: wounds treated for 2 denarii
 *   rent     a room (4 asses): sleep until the sixth hour
 *
 * Opening the panel waits one microtask so the conversation's own panel has closed first.
 */
import type { Game } from '../core/Game';
import { roundPrice } from '../rpg/barter';
import { sleep } from '../rpg/rest';
import type { EquipSlot } from '../rpg/types';
import type { BarterView, Deal, TradeItem } from '../ui/types';
import { treatWounds } from './talk';

type Service = 'barter' | 'train' | 'heal' | 'repair' | 'rent';

function toast(game: Game, text: string, kind: 'info' | 'warning' | 'skill' = 'info') {
  game.events.emit('rpg:notify', { text, kind });
}

/** The BarterView for one merchant. Prices and purses come from BarterSystem; the panel only shows them. */
export function barterViewFor(game: Game, npcId: string): BarterView | null {
  const barter = game.barter;
  const inv = game.player?.inventory;
  const npc = game.npcs?.get(npcId);
  if (!barter || !inv || !npc || !barter.merchant(npcId)) return null;

  const playerGoods = (): TradeItem[] =>
    inv
      .list((def) => !def.questItem)
      .map(({ def, stack, equipped }) => {
        const stolen = !!stack.stolenFrom;
        const count = stack.count - (equipped && !stolen ? 1 : 0);
        const price = barter.sellPrice(npcId, def.id, stolen);
        const refuse = price === null ? (stolen ? 'Stolen goods' : 'Does not buy this') : undefined;
        return { itemId: def.id, def, count, price: price ?? 0, stolen: stolen || undefined, equipped: equipped || undefined, refuse };
      })
      .filter((t) => t.count > 0);

  const merchantGoods = (): TradeItem[] =>
    (barter.merchant(npcId)?.stock ?? []).flatMap((s) => {
      const def = game.items?.get(s.itemId);
      const price = barter.buyPrice(npcId, s.itemId);
      return def && price !== null ? [{ itemId: def.id, def, count: s.count, price }] : [];
    });

  return {
    merchantName: npc.name,
    merchantTitle: npc.title,
    merchantDenarii: () => barter.merchant(npcId)?.denarii ?? 0,
    playerDenarii: () => inv.denarii,
    playerGoods,
    merchantGoods,
    playerLoad: () => ({ weight: inv.weight, max: inv.maxWeight }),
    onChange: (fn) => inv.onChange(fn),
    commit: (deal: Deal) => {
      const m = barter.merchant(npcId);
      if (!m) return { ok: false, reason: 'This person does not trade.' };
      // Check the whole deal first: nothing changes hands unless all of it can.
      let buyTotal = 0;
      let sellTotal = 0;
      for (const l of deal.buy) {
        const stock = m.stock.find((s) => s.itemId === l.itemId)?.count ?? 0;
        const unit = barter.buyPrice(npcId, l.itemId);
        if (unit === null || stock < l.count) return { ok: false, reason: 'The merchant does not have that much.' };
        buyTotal += roundPrice(unit * l.count) || 0;
      }
      for (const l of deal.sell) {
        const clean = inv.count(l.itemId, { stolen: false }) - (inv.isEquipped(l.itemId) ? 1 : 0);
        const stolen = inv.count(l.itemId, { stolen: true });
        const takeStolen = Math.max(0, l.count - Math.max(0, clean));
        const unit = barter.sellPrice(npcId, l.itemId);
        const unitStolen = takeStolen ? barter.sellPrice(npcId, l.itemId, true) : null;
        if (l.count > Math.max(0, clean) + stolen || unit === null) return { ok: false, reason: 'You do not have that to sell.' };
        if (takeStolen && unitStolen === null) return { ok: false, reason: 'Stolen goods: no honest merchant will touch them.' };
        sellTotal += roundPrice(unit * Math.min(l.count, Math.max(0, clean))) + (takeStolen ? roundPrice((unitStolen ?? 0) * takeStolen) : 0);
      }
      if (inv.denarii + sellTotal + 1e-9 < buyTotal) return { ok: false, reason: 'You cannot afford that.' };
      if (m.denarii + buyTotal + 1e-9 < sellTotal) return { ok: false, reason: 'The merchant cannot pay that much.' };
      // Sell first (it brings in the money), then buy.
      for (const l of deal.sell) {
        const clean = Math.max(0, inv.count(l.itemId, { stolen: false }) - (inv.isEquipped(l.itemId) ? 1 : 0));
        const fromClean = Math.min(l.count, clean);
        if (fromClean > 0) {
          const r = barter.sell(npcId, l.itemId, fromClean);
          if (!r.ok) return { ok: false, reason: r.reason ?? 'The merchant refuses.' };
        }
        let rest = l.count - fromClean;
        for (const s of inv.stacks.filter((x) => x.itemId === l.itemId && x.stolenFrom)) {
          if (rest <= 0) break;
          const n = Math.min(rest, s.count);
          const r = barter.sell(npcId, l.itemId, n, s.stolenFrom);
          if (!r.ok) return { ok: false, reason: r.reason ?? 'The merchant refuses.' };
          rest -= n;
        }
      }
      for (const l of deal.buy) {
        const r = barter.buy(npcId, l.itemId, l.count);
        if (!r.ok) return { ok: false, reason: r.reason ?? 'The merchant refuses.' };
      }
      return { ok: true };
    },
  };
}

function train(game: Game, npcId: string) {
  const npc = game.npcs?.get(npcId);
  const sheet = game.player?.sheet;
  const inv = game.player?.inventory;
  if (!npc?.trainer || !sheet || !inv) return toast(game, `${npc?.name ?? 'They'} cannot teach you anything.`, 'warning');
  const grade = npc.trainer.maxLevel <= 40 ? 'common' : npc.trainer.maxLevel <= 70 ? 'expert' : 'master';
  const skill = npc.trainer.skill;
  const name = sheet.skillDef(skill)?.name ?? skill;
  const blocker = sheet.trainingBlocker(skill, grade);
  if (blocker === 'cap') return toast(game, `${npc.name} has taught you all he can in ${name}.`, 'warning');
  if (blocker === 'lessons') return toast(game, 'You have had enough lessons for one level. Practise, then come back.', 'warning');
  const cost = sheet.trainingCost(skill);
  if (!inv.spendDenarii(cost)) return toast(game, `${npc.name} asks ${cost} denarii for a lesson in ${name}. You cannot pay.`, 'warning');
  sheet.train(skill, grade);
  toast(game, `${npc.name} teaches you ${name} (${cost} denarii).`, 'skill');
}

function repair(game: Game, npcId: string) {
  const barter = game.barter;
  const inv = game.player?.inventory;
  if (!barter || !inv || !barter.repairs(npcId)) return toast(game, 'Nobody here mends arms.', 'warning');
  let total = 0;
  let mended = 0;
  for (const { slot } of inv.worn()) {
    if (barter.repairPrice(slot as EquipSlot) === null) continue;
    const r = barter.repair(npcId, slot as EquipSlot);
    if (r.ok) {
      total += r.price;
      mended++;
    } else if (r.reason === 'no-money') return toast(game, 'You cannot afford the repairs.', 'warning');
  }
  toast(game, mended ? `Repaired ${mended} piece${mended > 1 ? 's' : ''} for ${Math.round(total * 100) / 100} denarii.` : 'Nothing you carry needs mending.');
}

function heal(game: Game) {
  const inv = game.player?.inventory;
  const sheet = game.player?.sheet;
  if (!inv || !sheet) return;
  if (!inv.spendDenarii(2)) return toast(game, 'Two denarii for the physician, and you have not got them.', 'warning');
  treatWounds(game);
  toast(game, 'The physician treats your wounds (2 denarii).');
}

function rent(game: Game) {
  const inv = game.player?.inventory;
  const sheet = game.player?.sheet;
  if (!inv || !sheet || !game.time) return;
  if (!inv.spendDenarii(0.25)) return toast(game, 'A bed costs four asses. You cannot pay.', 'warning');
  const hours = Math.max(1, Math.round(((6 - game.time.hour + 24) % 24) || 8));
  const r = sleep({ sheet, standing: game.standing, inventory: inv, time: game.time, events: game.events }, hours, 'rented');
  toast(game, r.ok ? 'You sleep in a rented bed until the sixth hour.' : 'You cannot rest now.', r.ok ? 'info' : 'warning');
}

/** Answer 'dialogue:service' requests; returns the unsubscribe. */
export function installServices(game: Game): () => void {
  return game.events.on('dialogue:service', ({ npcId, service }: { npcId: string; service: Service }) => {
    switch (service) {
      case 'barter':
        queueMicrotask(() => {
          const view = barterViewFor(game, npcId);
          if (!view) return toast(game, 'They have nothing to sell you.', 'warning');
          game.ui?.openBarter(view);
        });
        break;
      case 'train':
        train(game, npcId);
        break;
      case 'repair':
        repair(game, npcId);
        break;
      case 'heal':
        heal(game);
        break;
      case 'rent':
        rent(game);
        break;
    }
  });
}
