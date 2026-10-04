/**
 * Adapters from the engine services (QuestSystem, SaveSystem, DialogueSystem, rpg notifications)
 * to the UI read models in src/ui/types.ts. Each takes only the small slice of the engine it needs,
 * so the tests can drive them with fakes.
 */
import type { DialogueView as EngineDialogueView } from '../dialogue/DialogueSystem';
import type { QuestView as EngineQuestView } from '../quests/QuestSystem';
import type { NotifyKind as RpgNotifyKind } from '../rpg/events';
import type { SaveMeta } from '../save/types';
import type { NotifyKind } from '../ui/hud/Feed';
import type { DialogueChoiceView, DialogueTag, DialogueView, NoteView, ObjectiveView, QuestLogView, QuestView, SaveSlot, SaveSlotsView } from '../ui/types';

// ------------------------------------------------------------------ quests

export interface QuestSource {
  list(): EngineQuestView[];
  track(id: string | null): void;
}

export interface QuestLogOptions {
  /** NPC id → display name (journal "giver"). */
  npcName?: (id: string) => string | undefined;
  /** Letters and notes the player carries (journal Notes tab). */
  notes?: () => NoteView[];
  /** Subscribe to quest changes (events); returns an unsubscribe. */
  subscribe?: (fn: () => void) => () => void;
}

/** One engine quest → the journal's view: current-stage objectives and finished ones. */
export function questViewFrom(q: EngineQuestView, npcName?: (id: string) => string | undefined): QuestView {
  const objectives: ObjectiveView[] = q.objectives
    .filter((o) => o.active || o.done)
    .map((o) => ({
      id: o.id,
      text: o.text,
      done: o.done,
      optional: o.optional || undefined,
      count: o.needed > 1 ? o.needed : undefined,
      progress: o.needed > 1 ? o.count : undefined,
      target: o.target,
    }));
  return {
    id: q.id,
    title: q.title,
    latin: q.latin,
    category: q.category,
    giver: q.giver ? (npcName?.(q.giver) ?? q.giver) : undefined,
    summary: q.summary,
    state: q.status === 'running' ? 'active' : q.status,
    tracked: q.tracked,
    entries: q.journal.map((j) => j.text),
    objectives,
  };
}

export function questLogFrom(src: QuestSource, o: QuestLogOptions = {}): QuestLogView {
  return {
    quests: () => src.list().map((q) => questViewFrom(q, o.npcName)),
    setTracked: (id, tracked) => src.track(tracked ? id : null),
    notes: () => o.notes?.() ?? [],
    onChange: o.subscribe,
  };
}

// ------------------------------------------------------------------ saves

export interface SaveSource {
  list(): Promise<SaveMeta[]>;
  delete(slot: string): Promise<void>;
}

/** SaveMeta → the save screen's row. */
export function saveSlotFrom(m: SaveMeta): SaveSlot {
  const t = Date.parse(m.savedAt);
  return {
    id: m.slot,
    name: m.name ?? (m.kind === 'quick' ? 'Quicksave' : m.kind === 'auto' ? 'Autosave' : 'Save'),
    level: m.level ?? 1,
    location: m.location ?? 'Rome',
    gameDate: m.gameDate,
    savedAt: Number.isFinite(t) ? t : 0,
    playTime: m.playTime ?? 0,
    kind: m.kind,
  };
}

export interface SaveSlotsHooks {
  /** Save into a slot (or a new manual slot when omitted). */
  save(slot?: string): Promise<void> | void;
  /** Load a slot through the game flow (it closes menus and rebuilds the player). */
  load(slot: string): Promise<void> | void;
  thumbnail?: (slot: string) => string | undefined;
}

export function saveSlotsFrom(src: SaveSource, hooks: SaveSlotsHooks): SaveSlotsView {
  return {
    list: async () => (await src.list()).map((m) => ({ ...saveSlotFrom(m), thumbnail: hooks.thumbnail?.(m.slot) })),
    save: (slot) => hooks.save(slot),
    load: (slot) => hooks.load(slot),
    remove: (slot) => src.delete(slot),
  };
}

// ------------------------------------------------------------------ dialogue

export interface DialogueSource {
  readonly view: EngineDialogueView | null;
  readonly active: boolean;
  choose(i: number): unknown;
  advance(): unknown;
  end(): void;
  onChange(fn: (v: EngineDialogueView | null) => void): () => void;
}

/** "Persuade 60%" → { kind: 'skill', label: 'Persuade', chance: 0.6 }. */
export function dialogueTagFrom(tag: string | undefined, kind: EngineDialogueView['choices'][number]['kind']): DialogueTag | undefined {
  if (!tag) return undefined;
  const m = /^(.*?)\s*(\d{1,3})%$/.exec(tag);
  const k: DialogueTag['kind'] = kind === 'bribe' ? 'bribe' : kind === 'check' ? (/intimidat/i.test(tag) ? 'intimidate' : 'skill') : 'action';
  return m ? { kind: k, label: `${m[1]} ${m[2]}%`, chance: Number(m[2]) / 100 } : { kind: k, label: tag };
}

/**
 * The dialogue panel's view over game.dialogue. The panel closes when the engine's session ends;
 * the last line stays readable meanwhile.
 */
export function dialogueViewFrom(src: DialogueSource, names: { name?: (id: string) => string | undefined; title?: (id: string) => string | undefined } = {}): DialogueView {
  let last = src.view;
  const off = src.onChange((v) => {
    if (v) last = v;
  });
  const cur = () => src.view ?? last;
  return {
    get npcId() {
      return cur()?.npcId ?? '';
    },
    get npcName() {
      const v = cur();
      return (v && (names.name?.(v.npcId) ?? (v.speaker === 'npc' ? v.speakerName : undefined))) ?? v?.speakerName ?? '';
    },
    get npcTitle() {
      const v = cur();
      return v ? names.title?.(v.npcId) : undefined;
    },
    get line() {
      const v = cur();
      if (!v) return { speaker: 'npc' as const, text: '' };
      if (v.speaker === 'player') return { speaker: 'player' as const, text: v.text };
      if (v.speaker === 'npc') return { speaker: 'npc' as const, text: v.text };
      return { speaker: 'npc' as const, name: v.speakerName, text: v.text };
    },
    get choices(): DialogueChoiceView[] {
      const v = src.view;
      if (!v) return [];
      return v.choices.map((c) => ({ text: c.text, disabled: !c.enabled, tag: dialogueTagFrom(c.tag, c.kind) }));
    },
    get ended() {
      return !src.active;
    },
    choose: (i) => void src.choose(i),
    advance: () => void src.advance(),
    end: () => {
      off();
      src.end();
    },
    onChange: (fn) => src.onChange(() => fn()),
  };
}

// ------------------------------------------------------------------ notifications

/**
 * Which rpg:notify toasts the HUD shows, and as what. The UI already announces discoveries,
 * quest starts/ends, skill-ups and level-ups with banners, so those are skipped here.
 */
export function notifyKindFor(text: string, kind: RpgNotifyKind | undefined): NotifyKind | null {
  switch (kind) {
    case 'location':
    case 'skill':
      return null;
    case 'quest':
      return /^Quest (started|completed|failed):/.test(text) ? null : 'quest';
    case 'item':
      return 'item';
    case 'crime':
    case 'warning':
      return 'warning';
    case 'level':
      return 'skill';
    default:
      return 'info';
  }
}
