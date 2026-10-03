/**
 * installRpg(game): wires the RPG rules, quests, dialogue, NPC/location registries and saving
 * onto a Game. Call after setupPlayer() (it also works without a player or NPCs — dev scenes).
 *
 *   game.player.sheet / game.player.inventory   character sheet & inventory
 *   game.items, game.npcs, game.locations        registries
 *   game.factions, game.standing, game.crime     society: reputation, Dignitas/Fama/Infamia, law
 *   game.devotion                                patron deity, invocations, prayer (pietas)
 *   game.barter                                  merchants
 *   game.quests, game.dialogue, game.save        engines
 *   game.rpg                                     all of the above in one object (debugging)
 *
 * Also adds the 'rpg' system (effects, regen, sprint stamina), hooks the PlayerController's
 * canSprint/speedMultiplier (composing with any hooks already installed), and wires the hourly
 * checks (lapsed bounties, overdue vows), vows to quest outcomes and cleanliness to its condition.
 */
import type { Game, System } from '../core/Game';
import { DialogueSystem, dialogueModules } from '../dialogue/DialogueSystem';
import { loadNpcContent, NpcRegistry } from '../npc/registry';
import type { LocationDef, NpcDef } from '../npc/types';
import type { PlayerController } from '../player/PlayerController';
import { QuestSystem, questModules } from '../quests/QuestSystem';
import { SaveSystem } from '../save/SaveSystem';
import type { SaveStorage } from '../save/types';
import { LocationRegistry } from '../world/locations';
import { BarterSystem } from './barter';
import { persuasionPoints } from './checks';
import { CrimeSystem } from './crime';
import { COMBAT, STAMINA_COSTS } from './data/balance';
import { FACTIONS } from './data/factions';
import { ITEMS } from './data/items';
import { BACKGROUNDS, COMMON_KIT } from './data/skills';
import { Devotion } from './devotion';
import { FactionSystem } from './factions';
import { InventoryImpl } from './inventory';
import { ItemDb } from './items';
import { CharacterSheetImpl } from './sheet';
import { Standing } from './standing';
import type { BackgroundDef, ItemDef } from './types';
import './events';

declare module '../player/Player' {
  interface Player {
    sheet: CharacterSheetImpl;
    inventory: InventoryImpl;
  }
}

declare module '../core/Game' {
  interface Game {
    items: ItemDb;
    factions: FactionSystem;
    standing: Standing;
    devotion: Devotion;
    crime: CrimeSystem;
    barter: BarterSystem;
    rpg: RpgServices;
  }
}

export interface RpgServices {
  items: ItemDb;
  sheet: CharacterSheetImpl;
  inventory: InventoryImpl;
  factions: FactionSystem;
  standing: Standing;
  devotion: Devotion;
  crime: CrimeSystem;
  barter: BarterSystem;
  npcs: NpcRegistry;
  locations: LocationRegistry;
  quests: QuestSystem;
  dialogue: DialogueSystem;
  save: SaveSystem;
}

export interface RpgOptions {
  /** Load '_'-prefixed example content (quests, dialogue, NPCs) — dev scenes and tests. */
  examples?: boolean;
  /** Save storage (default: localStorage + IndexedDB). */
  storage?: SaveStorage;
  /** Start a new game now (default true): reset state, apply origin/kit, start autoStart quests. */
  newGame?: boolean;
  /** Origin id from BACKGROUNDS for the new game; default: none (a plain citizen with a tunic and a few coins). */
  background?: string;
}

/** Kit without an origin. */
export const DEFAULT_KIT = { items: [{ id: 'tunica', equip: true }, { id: 'soleae', equip: true }, { id: 'panis', count: 2 }], denarii: 10 };

export function installRpg(game: Game, opts: RpgOptions = {}): RpgServices {
  const events = game.events;
  const examples = !!opts.examples;

  // Content modules may carry their own items, locations and NPCs.
  const modules = [...questModules(examples), ...dialogueModules(examples)];
  const extra = <T>(pick: (m: (typeof modules)[number]) => T[] | undefined) => modules.flatMap((m) => pick(m) ?? []);

  const items = new ItemDb(ITEMS);
  items.register(extra<ItemDef>((m) => m.items));
  const npcs = new NpcRegistry(loadNpcContent(examples));
  npcs.add(extra<NpcDef>((m) => m.npcs));
  const locations = new LocationRegistry({ events, position: () => game.player?.position ?? null });
  locations.add(extra<LocationDef>((m) => m.locations));

  const sheet = new CharacterSheetImpl({ events });
  const inventory = new InventoryImpl(items, { events, sheet });
  const factions = new FactionSystem(FACTIONS, events);
  const standing = new Standing(events, () => game.time?.totalHours ?? 0);
  factions.skillLevel = (id) => sheet.baseSkillLevel(id);
  factions.isCitizen = () => standing.isCitizen;
  const devotion = new Devotion({ sheet, inventory, events, day: () => game.time?.dayIndex ?? 0, rng: game.rng?.fork('devotion') });
  const crime = new CrimeSystem({
    events,
    inventory,
    sheet,
    factions,
    standing,
    time: game.time,
    rng: game.rng?.fork('crime'),
    // Talking a guard down: persuasion mods with a soldier (dress, Dignitas, cleanliness, Infamia).
    persuasionPoints: () => persuasionPoints('soldier', { flags: sheet, infamia: standing.infamia, cleanliness: standing.cleanliness, dignitas: { mine: standing.rank, theirs: 2 } }),
  });
  const barter = new BarterSystem({ items, inventory, sheet, npcs, factions, events, hours: () => game.time?.totalHours ?? 0, rng: game.rng?.fork('barter') });

  game.items = items;
  game.npcs = npcs;
  game.locations = locations;
  game.factions = factions;
  game.standing = standing;
  game.devotion = devotion;
  game.crime = crime;
  game.barter = barter;
  if (game.player) {
    game.player.sheet = sheet;
    game.player.inventory = inventory;
  }

  const quests = new QuestSystem(game, { includeExamples: examples });
  game.quests = quests;
  const dialogue = new DialogueSystem(game, { includeExamples: examples, flags: quests.flags });
  game.dialogue = dialogue;
  const save = new SaveSystem(game, { storage: opts.storage });
  game.save = save;

  const reg = (key: string, o: { serialize(): unknown; restore(d: unknown): void }, afterLoad?: () => void) =>
    save.register(key, { save: () => o.serialize(), load: (d) => o.restore(d), reset: () => o.restore(undefined), afterLoad });
  // Equipment re-applied by the inventory raises maxima (and current values, like Skyrim's
  // fortify items), so the saved current values are applied again once everything has loaded.
  let savedVitals: Parameters<typeof sheet.vitals.restoreState>[0];
  save.register('sheet', {
    save: () => sheet.serialize(),
    load: (d) => {
      sheet.restore(d);
      savedVitals = (d as { vitals?: typeof savedVitals } | undefined)?.vitals;
    },
    reset: () => {
      sheet.restore(undefined);
      savedVitals = undefined;
    },
    afterLoad: () => sheet.vitals.restoreState(savedVitals),
  });
  reg('inventory', inventory, () => updateArmorPenalty(sheet, inventory));
  reg('standing', standing, () => applyOriginTraits(sheet, originDef(standing.origin)));
  reg('devotion', devotion);
  reg('factions', factions);
  reg('crime', crime);
  reg('barter', barter);
  reg('quests', quests);
  reg('dialogue', dialogue);
  reg('locations', locations);

  game.addSystem(locations);
  game.addSystem(save);
  game.addSystem(new RpgSystem(game, sheet));
  hookPlayerController(game, sheet, inventory);
  for (const e of ['item:equipped', 'item:unequipped', 'perk:taken'] as const) events.on(e, () => updateArmorPenalty(sheet, inventory));
  // Hourly: city bounties under 40 lapse after 7 quiet days; unpaid vows break after 3 (§14.1, §14.6).
  events.on('time:hour', () => {
    crime.checkLapse();
    devotion.checkVows();
  });
  // A vow lasts until its quest ends (§14.6).
  events.on('quest:completed', (e) => devotion.resolveVow(e.questId, true));
  events.on('quest:failed', (e) => devotion.resolveVow(e.questId, false));
  // Cleanliness (§14.8) shows as a condition: lautus (+10% stamina regeneration) or sordidus.
  events.on('standing:cleanliness', (e) => syncCleanliness(sheet, e.cleanliness));
  // Disposition toward the player also counts in barter (origin traits, what happened in dialogue).
  barter.extraDisposition = (npcId) => (dialogue.memoryOf(npcId)._disp as number | undefined) ?? 0;

  const services: RpgServices = { items, sheet, inventory, factions, standing, devotion, crime, barter, npcs, locations, quests, dialogue, save };
  game.rpg = services;
  if (opts.newGame !== false) startNewGame(services, { background: opts.background });
  return services;
}

/** Mirror Standing's cleanliness on the sheet as the lautus / sordidus condition. */
function syncCleanliness(sheet: CharacterSheetImpl, c: 'lautus' | 'normal' | 'sordidus') {
  sheet.cure('state:lautus');
  sheet.cure('state:sordidus');
  if (c !== 'normal') sheet.applyCondition(c);
}

function originDef(id: string | null | undefined): BackgroundDef | undefined {
  return id ? BACKGROUNDS.find((b) => b.id === id) : undefined;
}

function applyOriginTraits(sheet: CharacterSheetImpl, bg: BackgroundDef | undefined) {
  sheet.setModifierSource('origin', bg?.modifiers);
  sheet.setFlagSource('origin', bg ? [...(bg.traitId ? [bg.traitId] : []), ...(bg.flags ?? [])] : null);
}

/**
 * GDD §6.3 heavy-armor penalties while the body piece is heavy: stamina regeneration −15% (removed
 * by Well Fitted), sprint cost +25% (Cingulum), footsteps louder (Silent Hobnails).
 */
export function updateArmorPenalty(sheet: CharacterSheetImpl, inv: InventoryImpl) {
  const body = inv.equipped('body');
  const heavy = body ? inv.items.get(body)?.armor?.weightClass === 'heavy' : false;
  if (!heavy) {
    sheet.setModifierSource('armor-penalty', null);
    sheet.setFlagSource('armor-penalty', null);
    return;
  }
  const P = COMBAT.heavyPenalty;
  const mods: Record<string, number> = {};
  if (!sheet.hasFlag('perk-heavy-armor-well-fitted')) mods['stamina.regen'] = P.staminaRegen;
  if (!sheet.hasFlag('perk-heavy-armor-cingulum')) mods['stamina.sprintCost'] = P.sprintCost;
  sheet.setModifierSource('armor-penalty', mods);
  sheet.setFlagSource('armor-penalty', sheet.hasFlag('perk-stealth-silent-hobnails') ? null : ['heavy-armor.noisy']);
}

/**
 * Reset the player and world state for a new game and start autoStart quests. With an origin
 * (GDD §3.2): skills 10 + bonuses, legal status, trait, kit (signature weapon at 70%), coin and the
 * common kit of §3.5. Without one: a plain citizen with a tunic and 10 den.
 */
export function startNewGame(s: RpgServices, opts: { background?: string } = {}) {
  s.sheet.restore(undefined);
  s.inventory.restore(undefined);
  s.factions.restore(undefined);
  s.standing.restore(undefined);
  s.devotion.restore(undefined);
  s.crime.restore(undefined);
  s.barter.restore(undefined);
  s.dialogue.restore(undefined);
  const bg = originDef(opts.background);
  if (opts.background && !bg) console.warn(`[rpg] unknown origin "${opts.background}"`);
  if (bg) {
    for (const [id, bonus] of Object.entries(bg.skills)) s.sheet.setSkill(id, s.sheet.baseSkillLevel(id) + (bonus ?? 0));
    s.standing.setOrigin(bg.status ?? 'civis');
    s.standing.origin = bg.id;
    s.standing.debt = bg.debt ?? 0;
  }
  applyOriginTraits(s.sheet, bg);
  const kit: { id: string; count?: number; equip?: boolean; condition?: number }[] = bg ? [...bg.kit, ...COMMON_KIT] : DEFAULT_KIT.items;
  for (const k of kit) {
    if (!s.items.has(k.id)) continue; // e.g. the courier's tablet before the main quest exists
    s.inventory.add(k.id, k.count ?? 1, { silent: true, source: 'start', condition: k.condition });
    if (k.equip) s.inventory.equip(k.id);
  }
  s.inventory.addDenarii(bg ? bg.denarii : DEFAULT_KIT.denarii);
  updateArmorPenalty(s.sheet, s.inventory);
  s.quests.newGame();
}

/** Per-step RPG upkeep: timed effects, regeneration and sprint stamina (8/s, §6.6). */
class RpgSystem implements System {
  readonly name = 'rpg';
  readonly priority = 5; // after PlayerController (-10) has set sprinting for this step

  constructor(
    private readonly game: Game,
    private readonly sheet: CharacterSheetImpl,
  ) {}

  fixedUpdate(dt: number) {
    this.sheet.tick(dt);
    if (this.game.player?.sprinting) {
      this.sheet.vitals.drain('stamina', STAMINA_COSTS.sprint * dt * Math.max(0, 1 - this.sheet.modifier('stamina.sprintCost')));
    }
  }
}

function hookPlayerController(game: Game, sheet: CharacterSheetImpl, inv: InventoryImpl) {
  const pc = game.getSystem?.<PlayerController>('playerController');
  if (!pc) return;
  // §6.6: at 0 stamina you cannot sprint until 15 has regenerated (no stutter at zero).
  let winded = false;
  const prevSprint = pc.canSprint;
  pc.canSprint = () => {
    const st = sheet.vitals.stamina;
    if (st.current <= 0.5) winded = true;
    else if (winded && st.current >= Math.min(st.max, STAMINA_COSTS.exhaustedUntil)) winded = false;
    return prevSprint() && !winded && !inv.overEncumbered;
  };
  const prevSpeed = pc.speedMultiplier;
  pc.speedMultiplier = () => prevSpeed() * inv.speedMultiplier() * Math.max(0.2, 1 + sheet.modifier('speed.move'));
}
