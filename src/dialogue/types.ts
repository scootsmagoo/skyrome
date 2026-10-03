/**
 * Dialogue contracts. A DialogueDef is a node graph attached to one or more NPCs.
 * Conditions/effects are functions so content can query anything (quests, flags, inventory).
 * Files: src/dialogue/content/*.ts default-export DialogueDef(s) (discovered by glob).
 */
import type { Game } from '../core/Game';

export interface DialogueContext {
  readonly game: Game;
  readonly npcId: string;
  /** Saved per-NPC dialogue memory (e.g. greeted: true). */
  readonly memory: Record<string, number | string | boolean>;
  flag(name: string): number | string | boolean | undefined;
  setFlag(name: string, value: number | string | boolean): void;
  /** `done` = finished (completed or failed); `completed` = finished successfully. */
  quest(id: string): { stage: string; running: boolean; done: boolean; failed: boolean; completed?: boolean } | undefined;
  startQuest(id: string, stage?: string): void;
  setQuestStage(id: string, stage: string): void;
  skill(id: string): number;
  hasItem(id: string, count?: number): boolean;
  giveItem(id: string, count?: number): void;
  takeItem(id: string, count?: number): boolean;
  denarii(): number;
  pay(amount: number): boolean;
  /** The NPC's disposition toward the player (−20…+20: origin traits and what happened between you). */
  disposition(): number;
  changeDisposition(delta: number): void;
  receive(amount: number): void;
  /** Make the NPC hostile / start combat. */
  attack(): void;
  /** Open barter / training / services UI. */
  openService(service: 'barter' | 'train' | 'heal' | 'repair' | 'rent'): void;
}

export type Text = string | ((c: DialogueContext) => string);

export interface SkillCheck {
  skill: string;
  /** The DC (GDD §14.5): Facilis 10 · Mediocris 25 · Difficilis 40 · Ardua 55 · Gravissima 70 · Herculea 85. */
  difficulty: number;
  /** Shown to the player, e.g. "Persuade", "Intimidate", "Lie". */
  label?: string;
  pass: string;
  fail: string;
  /** Who is being persuaded (default: from the NPC's tags): dress, Fama, Infamia and cleanliness count differently. */
  audience?: import('../rpg/checks').Audience;
  /**
   * The approach (§14.5): 'persuade' (default for Rhetoric), 'intimidate' (+2 per level above the
   * target, +10 armed and armored; impossible against elites; −5 disposition afterwards),
   * 'invoke-patron' (needs Clientela rank amicus-minor: +15, +15 with the perk). 'lie' is a
   * persuasion with its own retry lock. A failed check locks that approach with this NPC for 24 game hours.
   */
  kind?: 'persuade' | 'intimidate' | 'lie' | 'invoke-patron' | 'other';
}

export interface DialogueChoice {
  text: Text;
  /** Hidden unless true. */
  if?: (c: DialogueContext) => boolean;
  /** Shown but disabled unless true (e.g. not enough denarii). */
  enabled?: (c: DialogueContext) => boolean;
  goto?: string;
  check?: SkillCheck;
  /**
   * Bribe: costs denarii and always passes, unless the NPC is tagged 'incorruptible'. Without an
   * `amount` it costs DC × 0.5 den. × status (plebs 1, soldiers 2, officials 5; `dc` default 25).
   */
  bribe?: { amount?: number; dc?: number; goto: string };
  effects?: (c: DialogueContext) => void;
  /** Remove after being chosen once (per NPC memory). */
  once?: boolean;
  /** End the conversation after this choice. */
  end?: boolean;
}

export interface DialogueNode {
  /** Defaults to the NPC. 'player' renders as the player's line. */
  speaker?: 'npc' | 'player' | string;
  text: Text;
  choices?: DialogueChoice[];
  /** Continue to this node without a choice. */
  next?: string;
  effects?: (c: DialogueContext) => void;
  end?: boolean;
}

export interface DialogueDef {
  id: string;
  /** NPC ids this dialogue is attached to ('*' = generic fallback for unnamed citizens). */
  npcs: string[];
  /** Choose the entry node (greeting) each time the conversation starts. */
  start: (c: DialogueContext) => string;
  nodes: Record<string, DialogueNode>;
  /** Higher wins when several dialogues match one NPC. */
  priority?: number;
}

export function defineDialogue(def: DialogueDef): DialogueDef {
  return def;
}
