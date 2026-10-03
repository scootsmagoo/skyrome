/**
 * installRpg(game): wires the RPG rules, quests, dialogue, NPC/location registries and saving
 * onto a Game. Call after setupPlayer() (it also works without a player or NPCs — dev scenes).
 *
 *   game.player.sheet / game.player.inventory   character sheet & inventory
 *   game.items, game.npcs, game.locations        registries
 *   game.factions, game.crime, game.barter       society
 *   game.quests, game.dialogue, game.save        engines
 *   game.rpg                                     all of the above in one object (debugging)
 *
 * Also adds the 'rpg' system (effects, regen, sprint stamina) and hooks the PlayerController's
 * canSprint/speedMultiplier (composing with any hooks already installed).
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
import { CrimeSystem } from './crime';
import { STAMINA_COSTS } from './data/balance';
import { FACTIONS } from './data/factions';
import { ITEMS } from './data/items';
import { BACKGROUNDS } from './data/skills';
import { FactionSystem } from './factions';
import { InventoryImpl } from './inventory';
import { ItemDb } from './items';
import { CharacterSheetImpl } from './sheet';
import type { ItemDef } from './types';
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
  /** Start a new game now (default true): reset state, apply background/kit, start autoStart quests. */
  newGame?: boolean;
  /** Background id from BACKGROUNDS for the new game; default: none (plain tunic and a few coins). */
  background?: string;
}

/** Kit without a background. */
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
  factions.gainMultiplier = () => (sheet.hasFlag('rhetoric.clients') ? 1.25 : 1);
  const crime = new CrimeSystem({ events, inventory, sheet, time: game.time, rng: game.rng?.fork('crime') });
  const barter = new BarterSystem({ items, inventory, sheet, npcs, factions, events, hours: () => game.time?.totalHours ?? 0 });

  game.items = items;
  game.npcs = npcs;
  game.locations = locations;
  game.factions = factions;
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

  const reg = (key: string, o: { serialize(): unknown; restore(d: unknown): void }) => save.register(key, { save: () => o.serialize(), load: (d) => o.restore(d), reset: () => o.restore(undefined) });
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
  reg('inventory', inventory);
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

  const services: RpgServices = { items, sheet, inventory, factions, crime, barter, npcs, locations, quests, dialogue, save };
  game.rpg = services;
  if (opts.newGame !== false) startNewGame(services, { background: opts.background });
  return services;
}

/** Reset the player and world state for a new game and start autoStart quests. */
export function startNewGame(s: RpgServices, opts: { background?: string } = {}) {
  s.sheet.restore(undefined);
  s.inventory.restore(undefined);
  s.factions.restore(undefined);
  s.crime.restore(undefined);
  s.barter.restore(undefined);
  s.dialogue.restore(undefined);
  const bg = opts.background ? BACKGROUNDS.find((b) => b.id === opts.background) : undefined;
  if (opts.background && !bg) console.warn(`[rpg] unknown background "${opts.background}"`);
  const kit = bg ? bg.kit : DEFAULT_KIT.items;
  if (bg) for (const [id, bonus] of Object.entries(bg.skills)) s.sheet.setSkill(id, s.sheet.skillLevel(id) + (bonus ?? 0));
  for (const k of kit) {
    s.inventory.add(k.id, k.count ?? 1, { silent: true, source: 'start' });
    if (k.equip) s.inventory.equip(k.id);
  }
  s.inventory.addDenarii(bg ? bg.denarii : DEFAULT_KIT.denarii);
  s.quests.newGame();
}

/** Per-step RPG upkeep: timed effects, regeneration and sprint stamina. */
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
  // Once exhausted, sprinting waits until 15% stamina is back (no stutter at zero).
  let winded = false;
  const prevSprint = pc.canSprint;
  pc.canSprint = () => {
    const st = sheet.vitals.stamina;
    if (st.current <= 0.5) winded = true;
    else if (winded && st.current >= st.max * 0.15) winded = false;
    return prevSprint() && !winded && !inv.overEncumbered;
  };
  const prevSpeed = pc.speedMultiplier;
  pc.speedMultiplier = () => prevSpeed() * inv.speedMultiplier() * Math.max(0.2, 1 + sheet.modifier('speed.move'));
}
