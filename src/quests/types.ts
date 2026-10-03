/**
 * Quest contracts. Quests are TypeScript modules (src/quests/content/*.ts, discovered by glob)
 * that default-export a QuestDef built with defineQuest(). Logic lives in event handlers so
 * quests can react to anything in the game; only the *state* (stage, objective counts, vars)
 * is saved, never the definitions.
 */
import type { Game } from '../core/Game';
import type { GameEvents } from '../core/Events';

export type QuestCategory = 'main' | 'faction' | 'misc' | 'radiant' | 'arena';

/** Where a compass/map marker should point. */
export type MarkerTarget =
  | { kind: 'npc'; id: string }
  | { kind: 'location'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'point'; x: number; y: number; z: number };

export interface ObjectiveDef {
  id: string;
  text: string;
  target?: MarkerTarget;
  /** Count needed (kill 3, collect 5). Default 1. */
  count?: number;
  optional?: boolean;
  /** Not shown until revealed. */
  hidden?: boolean;
}

export interface QuestStageDef {
  /** Journal entry appended when this stage starts (first person, past tense, like Skyrim's). */
  journal: string;
  objectives?: ObjectiveDef[];
  /** Runs when the stage begins (spawn NPCs, give items, set flags). */
  onEnter?: (q: QuestContext) => void;
  /** Ends the quest when reached. */
  end?: 'complete' | 'fail';
  /** Advance to this stage automatically once every non-optional objective of this stage is done. */
  next?: string;
}

export interface Reward {
  xp?: number;
  denarii?: number;
  items?: { id: string; count?: number }[];
  reputation?: { faction: string; amount: number }[];
  /** Skill XP (use units). */
  skills?: { id: string; amount: number }[];
  /** GDD §5.1 `reward.skillXp`: one level's worth (xpToNext at the current level) per entry, in a skill the quest exercised. */
  skillXp?: (string | { id: string; levels?: number })[];
  /** GDD §9.1: the faction rank the quest grants — the next one, or a named rank (it waits for skill gates). */
  rank?: { faction: string; rank?: string };
}

type HandlerMap = {
  [K in keyof GameEvents]?: (q: QuestContext, e: GameEvents[K]) => void;
};

export interface QuestDef {
  id: string;
  title: string;
  latin?: string;
  category: QuestCategory;
  faction?: string;
  /** NPC id of the quest giver (for the journal). */
  giver?: string;
  /** One-line description for the journal list. */
  summary: string;
  /** Stage id → stage. The quest starts at `start`. */
  stages: Record<string, QuestStageDef>;
  /** Event handlers active while the quest is running (and, with `listenBeforeStart`, before). */
  on?: HandlerMap;
  /** Handlers that may start the quest; run while the quest is NOT started. */
  triggers?: HandlerMap;
  rewards?: Reward;
  /** Start automatically at new game. */
  autoStart?: boolean;
  /** `on` handlers also run before the quest starts (e.g. count items picked up early). */
  listenBeforeStart?: boolean;
  /** May be started again after it ends (radiant/arena quests); triggers stay live. */
  repeatable?: boolean;
}

/** Runtime view handed to quest handlers. */
export interface QuestContext {
  readonly game: Game;
  readonly def: QuestDef;
  readonly stage: string;
  readonly running: boolean;
  /** Finished, completed or failed. */
  readonly done: boolean;
  /** Free-form saved variables (numbers/strings/booleans only). */
  readonly vars: Record<string, number | string | boolean>;
  start(stage?: string): void;
  setStage(stage: string): void;
  /** Advance an objective's counter; returns true when it completes. */
  progress(objectiveId: string, amount?: number): boolean;
  completeObjective(objectiveId: string): void;
  isObjectiveDone(objectiveId: string): boolean;
  reveal(objectiveId: string): void;
  complete(): void;
  fail(): void;
  giveReward(r: Reward): void;
  /** Other quests' state, e.g. q.quest('mq01').stage. `done` = finished (completed or failed). */
  quest(id: string): { stage: string; running: boolean; done: boolean; failed: boolean; completed?: boolean } | undefined;
  /** Global saved flags shared by all quests and dialogue. */
  flag(name: string): number | string | boolean | undefined;
  setFlag(name: string, value: number | string | boolean): void;
  notify(text: string): void;
}

export function defineQuest(def: QuestDef): QuestDef {
  return def;
}

// ------------------------------------------------------------------ events quests listen to

declare module '../core/Events' {
  interface GameEvents {
    'quest:started': { questId: string };
    'quest:stage': { questId: string; stage: string };
    'quest:objective': { questId: string; objectiveId: string; done: boolean };
    'quest:completed': { questId: string };
    'quest:failed': { questId: string };
    /** Actor died. `killerId` is 'player' when the player dealt the final blow. */
    'actor:killed': { victimId: string; killerId?: string; tags?: string[] };
    'actor:yielded': { actorId: string; byId?: string };
    'item:added': { itemId: string; count: number; source?: string; silent?: boolean; stolen?: boolean };
    'item:removed': { itemId: string; count: number; reason?: 'sold' | 'dropped' | 'used' | 'given' | 'quest' };
    'location:entered': { locationId: string };
    'location:discovered': { locationId: string; name: string };
    'dialogue:started': { npcId: string; dialogueId: string };
    'dialogue:node': { npcId: string; dialogueId: string; nodeId: string };
    'dialogue:ended': { npcId: string; dialogueId: string };
    'crime:committed': { crime: string; victimId?: string; witnessed: boolean; bounty: number; jurisdiction?: string };
    'player:levelup': { level: number };
    'skill:levelup': { skill: string; level: number };
  }
}
