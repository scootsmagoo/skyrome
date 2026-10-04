/**
 * Fallback bridge from the dialogue engine (src/dialogue) to the UI dialogue panel (src/ui), used
 * only when nobody else opened the panel for a conversation an NPC started. The integrator may
 * wire its own; NpcManager checks for an open 'dialogue' modal before using this.
 */
import type { DialogueSystem } from '../dialogue/DialogueSystem';
import type { DialogueChoiceView, DialogueLine, DialogueView, Unsubscribe } from '../ui/types';

export class EngineDialogueView implements DialogueView {
  private readonly fallbackId: string;

  constructor(
    private readonly engine: DialogueSystem,
    npcId: string,
    readonly npcName: string,
    readonly npcTitle?: string,
  ) {
    this.fallbackId = npcId;
  }

  get npcId() {
    return this.engine.view?.npcId ?? this.fallbackId;
  }

  get line(): DialogueLine {
    const v = this.engine.view;
    if (!v) return { speaker: 'npc', text: '' };
    if (v.speaker === 'player') return { speaker: 'player', text: v.text };
    if (v.speaker === 'npc') return { speaker: 'npc', text: v.text };
    return { speaker: 'narrator', name: v.speakerName, text: v.text };
  }

  get choices(): readonly DialogueChoiceView[] {
    const v = this.engine.view;
    if (!v) return [];
    return v.choices.map((c) => ({
      text: c.text,
      disabled: !c.enabled,
      tag: c.tag ? { kind: c.kind === 'bribe' ? 'bribe' : c.kind === 'check' ? 'skill' : 'action', label: c.tag } : undefined,
    }));
  }

  get ended() {
    return !this.engine.active;
  }

  choose(index: number) {
    this.engine.choose(index);
  }

  advance() {
    this.engine.advance();
  }

  end() {
    if (this.engine.active) this.engine.end();
  }

  onChange(fn: () => void): Unsubscribe {
    return this.engine.onChange(() => fn());
  }
}
