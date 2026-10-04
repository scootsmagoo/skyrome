/**
 * Keys that act directly on the character outside combat and menus (GDD §4.2):
 * - Z invokes your patron god (spends Pietas; see Devotion.invoke).
 * - 1–8 use a consumable. Until slots can be assigned in the inventory, slot N is the Nth
 *   consumable you carry in a stable order: healing first (bandages, remedies), then stamina, then
 *   food and drink, then the rest, by name. So 1 is always your best heal.
 */
import type { Game, System } from '../core/Game';
import { HOTBAR_ACTIONS } from '../core/Input';
import type { ItemDef } from '../rpg/types';

interface InventoryLike {
  list(filter?: (def: ItemDef) => boolean): { def: ItemDef; stack: { count: number } }[];
  use(itemId: string): boolean;
  count(itemId: string): number;
}
interface DevotionLike {
  invoke(): { ok: boolean; reason?: 'no-patron' | 'no-pietas' | 'used-today'; deity?: { name: string } };
}

/** Sort rank of a consumable for the hotbar (lower first). Pure. */
export function hotbarRank(def: ItemDef): number {
  const tags = def.tags ?? [];
  const effects = def.effects ?? [];
  if (tags.includes('bandage')) return 0;
  if (tags.includes('medicine')) return 1;
  // Food and drink come after real healing even when they restore a little health.
  if (tags.includes('food') || tags.includes('drink')) return 3;
  if (effects.some((e) => e.target === 'health')) return 1;
  if (effects.some((e) => e.target === 'stamina')) return 2;
  return 4;
}

/** The consumables slots 1–8 use, in order. Pure given the inventory. */
export function hotbarItems(inv: InventoryLike): ItemDef[] {
  const seen = new Set<string>();
  const items: ItemDef[] = [];
  for (const { def, stack } of inv.list((d) => d.type === 'consumable' && !!d.effects?.length)) {
    if (stack.count < 1 || seen.has(def.id)) continue;
    seen.add(def.id);
    items.push(def);
  }
  items.sort((a, b) => hotbarRank(a) - hotbarRank(b) || a.name.localeCompare(b.name));
  return items.slice(0, HOTBAR_ACTIONS.length);
}

export class QuickActions implements System {
  readonly name = 'quickActions';
  readonly priority = -5;

  constructor(
    private readonly game: Game,
    private readonly playing: () => boolean,
  ) {}

  update() {
    const { input } = this.game;
    if (!input.enabled || !this.playing()) return;
    if (input.pressed('invoke')) this.invoke();
    HOTBAR_ACTIONS.forEach((a, i) => {
      if (input.pressed(a)) this.useSlot(i);
    });
  }

  private notify(text: string) {
    this.game.events.emit('ui:notify', { text, kind: 'info' });
  }

  private invoke() {
    const devotion = (this.game as Game & { devotion?: DevotionLike }).devotion;
    if (!devotion) return;
    const r = devotion.invoke();
    if (r.ok) return; // Devotion announces the invocation itself.
    const who = r.deity?.name ?? 'your patron';
    if (r.reason === 'no-patron') this.notify('You have no patron god yet. Choose one at a temple.');
    else if (r.reason === 'no-pietas') this.notify(`Not enough Pietas to call on ${who}.`);
    else if (r.reason === 'used-today') this.notify(`${who} has already answered you today.`);
  }

  private useSlot(i: number) {
    const inv = (this.game.player as unknown as { inventory?: InventoryLike }).inventory;
    if (!inv) return;
    const def = hotbarItems(inv)[i];
    if (!def) {
      this.notify(`Nothing to use on ${i + 1}: carry food, drink or bandages.`);
      return;
    }
    if (inv.use(def.id)) this.notify(`${def.name} (${inv.count(def.id)} left)`);
  }
}
