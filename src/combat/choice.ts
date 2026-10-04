/**
 * A one-line decision as a dialogue panel (the UI's DialogueView): the yield choice over a kneeling
 * foe, a mugger's demand. Each option runs its action and closes the panel.
 */
import type { DialogueChoiceView, DialogueLine, DialogueView } from '../ui/types';

export interface ChoiceOption {
  text: string;
  act: () => void;
  disabled?: boolean;
  reason?: string;
}

/** A tiny DialogueView for one choice. */
export class ChoiceView implements DialogueView {
  readonly line: DialogueLine;
  readonly choices: DialogueChoiceView[];
  ended = false;
  private fns = new Set<() => void>();

  constructor(
    readonly npcId: string,
    readonly npcName: string,
    readonly npcTitle: string | undefined,
    text: string,
    private readonly opts: ChoiceOption[],
    /** Called once when the panel closes without a choice (Esc). */
    private readonly onDismiss?: () => void,
    /** Who says the line: the narrator (default) or the NPC. */
    speaker: DialogueLine['speaker'] = 'narrator',
  ) {
    this.line = { speaker, text };
    this.choices = opts.map((o) => ({ text: o.text, disabled: o.disabled, disabledReason: o.reason }));
  }

  private chosen = false;

  choose(i: number) {
    const o = this.opts[i];
    if (!o || o.disabled || this.ended) return;
    this.chosen = true;
    o.act();
    this.end();
  }

  advance() {}

  end() {
    if (this.ended) return;
    this.ended = true;
    if (!this.chosen) this.onDismiss?.();
    for (const f of [...this.fns]) f();
  }

  onChange(fn: () => void) {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
}
