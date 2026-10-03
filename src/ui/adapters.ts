/**
 * Thin adapters from the engine contracts (src/rpg, src/dialogue, src/quests) to the UI read
 * models. The integrator wires them once, e.g.:
 *
 *   game.ui.provide({
 *     vitals: () => game.player.sheet.vitals,
 *     character: () => characterViewFrom(game.player.sheet, { name, skills: SKILLS, perks: PERKS }),
 *     inventory: () => inventoryViewFrom(game.player.inventory, getItemDef, { onDrop }),
 *   });
 */
import type { SkillCheck } from '../dialogue/types';
import type { MarkerTarget } from '../quests/types';
import type { CharacterSheet, EquipSlot, Inventory, ItemDef, PerkDef, SkillDef } from '../rpg/types';
import { formatMoney, skillCheckChance } from './format';
import type { BookView, CharacterView, DialogueTag, EffectView, FactionView, InventoryEntry, InventoryView, MapQuestMarker, QuestLogView } from './types';

export interface CharacterViewOptions {
  name: string;
  title?: string;
  skills: SkillDef[];
  perks: PerkDef[];
  factions?: () => FactionView[];
  bounties?: () => { authority: string; amount: number }[];
  stats?: () => { label: string; value: string }[];
  armorRating?: () => number;
  /** Turn an active effect into a display row (defaults to source + effect kind). */
  describeEffect?: (source: string, e: CharacterSheet['activeEffects'][number]['effect']) => EffectView;
}

export function characterViewFrom(sheet: CharacterSheet, o: CharacterViewOptions): CharacterView {
  return {
    name: o.name,
    title: o.title,
    get level() { return sheet.level; },
    get levelProgress() { return sheet.levelProgress; },
    get perkPoints() { return sheet.perkPoints; },
    vitals: sheet.vitals,
    skills: () => o.skills.map((def) => ({ def, level: sheet.skillLevel(def.id), progress: sheet.skillProgress(def.id) })),
    perks: (skillId) => o.perks.filter((p) => !skillId || p.skill === skillId).map((def) => ({ def, taken: sheet.perks.has(def.id), available: sheet.canTakePerk(def.id) })),
    takePerk: (id) => sheet.takePerk(id),
    effects: () =>
      sheet.activeEffects.map((a) =>
        o.describeEffect?.(a.source, a.effect) ?? { source: a.source, description: `${a.effect.kind} ${a.effect.target} ${a.effect.amount}`, remaining: a.remaining, kind: 'other' as const },
      ),
    factions: () => o.factions?.() ?? [],
    bounties: o.bounties,
    stats: o.stats,
    armorRating: o.armorRating,
  };
}

export interface InventoryViewOptions {
  /** Spawn a dropped item in the world (the inventory itself only removes it). */
  onDrop?: (itemId: string, count: number) => void;
  /** Book text for the reader. */
  book?: (itemId: string) => BookView | null;
  armorRating?: () => number;
}

export function inventoryViewFrom(inv: Inventory, itemDef: (id: string) => ItemDef | undefined, o: InventoryViewOptions = {}): InventoryView {
  return {
    get denarii() { return inv.denarii; },
    get weight() { return inv.weight; },
    get maxWeight() { return inv.maxWeight; },
    entries: () => {
      const bySlot = new Map<string, EquipSlot>();
      for (const [slot, id] of Object.entries(inv.equipment)) if (id) bySlot.set(id, slot as EquipSlot);
      const out: InventoryEntry[] = [];
      for (const s of inv.stacks) {
        const def = itemDef(s.itemId);
        if (def) out.push({ itemId: s.itemId, def, count: s.count, equipped: bySlot.get(s.itemId), stolen: !!s.stolenFrom });
      }
      return out;
    },
    toggleEquip: (id) => {
      const def = itemDef(id);
      if (!def?.slot) return false;
      if (inv.equipped(def.slot) === id) {
        inv.unequip(def.slot);
        return true;
      }
      return inv.equip(id);
    },
    use: (id) => inv.use(id),
    drop: (id, count) => {
      if (!inv.remove(id, count)) return false;
      o.onDrop?.(id, count);
      return true;
    },
    read: o.book,
    armorRating: o.armorRating,
    onChange: (fn) => inv.onChange(fn),
  };
}

/** '[Rhetoric 40]' tag with success odds per the dialogue contract's rule. */
export function skillCheckTag(check: SkillCheck, skillLevel: number, skillName: string): DialogueTag {
  return { kind: 'skill', label: `${check.label ? `${check.label} · ` : ''}${skillName} ${check.difficulty}`, chance: skillCheckChance(skillLevel, check.difficulty) };
}

/** '[25 denarii]' bribe tag. */
export function bribeTag(amount: number): DialogueTag {
  return { kind: 'bribe', label: `${formatMoney(amount)} ${amount === 1 ? 'denarius' : 'denarii'}` };
}

/** Map quest markers from a quest log: the first open objective with a resolvable target. */
export function questMarkersFrom(log: QuestLogView, resolve: (t: MarkerTarget) => { x: number; z: number } | null): MapQuestMarker[] {
  const out: MapQuestMarker[] = [];
  for (const q of log.quests()) {
    if (q.state !== 'active') continue;
    const o = q.objectives.find((x) => !x.done && x.target);
    const p = o?.target ? resolve(o.target) : null;
    if (p) out.push({ questId: q.id, label: q.title, x: p.x, z: p.z, tracked: q.tracked });
  }
  return out;
}
