/** The contract every modal screen implements, plus a small base class with common plumbing. */
import type { Action } from '../core/Input';
import type { UIManager } from './UIManager';
import { h } from './dom';

export interface Modal {
  readonly id: string;
  readonly el: HTMLElement;
  /** Pause the simulation while open (default true). */
  readonly pauses?: boolean;
  /** Hide the HUD while open (default true). */
  readonly hidesHud?: boolean;
  /** Draw over the previous modal instead of hiding it (confirm dialogs). */
  readonly overlay?: boolean;
  onOpen?(ui: UIManager): void;
  onClose?(): void;
  /** Keyboard input while on top of the stack; return true when consumed. */
  onKey?(e: KeyboardEvent): boolean;
  onKeyUp?(e: KeyboardEvent): void;
  /** Esc / back. Return false to stay open (e.g. to cancel a sub-state instead). */
  onEscape?(): boolean;
  /** Menu hotkeys (Tab/I/J/M/K) while on top; return true when handled. */
  onAction?(action: Action): boolean;
  /** Every rendered frame while open (also while paused). */
  update?(dt: number): void;
}

export abstract class BaseModal implements Modal {
  abstract readonly id: string;
  readonly el: HTMLElement;
  pauses = true;
  hidesHud = true;
  protected ui!: UIManager;

  constructor(className: string) {
    this.el = h('div', { class: `sr-modal ${className}` });
    // Keep DOM focus off our widgets (Tab is a game key; we drive selection ourselves), but let
    // pointer gestures (drags, sliders) work normally.
    this.el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
  }

  onOpen(ui: UIManager) {
    this.ui = ui;
  }

  close() {
    this.ui?.close(this);
  }
}
