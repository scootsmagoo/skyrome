/**
 * Interactables: NPCs to talk to, doors, containers, items on the ground, shrines, beds...
 * Each frame the system picks the best target in front of the player (within reach and roughly
 * under the crosshair), exposes it for the HUD prompt, and calls `interact()` on the Interact action.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { Layer } from '../core/Physics';

declare module '../core/Game' {
  interface Game {
    interactions: Interactions;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    'interact:focus': { target: Interactable | null };
    'interact:used': { target: Interactable };
  }
}

export interface Interactable {
  readonly id: string;
  /** World position used for range/aim tests (center of the thing). */
  position(): THREE.Vector3;
  /** Max distance from the player's eye. Default 3. */
  readonly reach?: number;
  /** Verb shown in the prompt, e.g. "Talk", "Open", "Take", "Pray". */
  verb(): string;
  /** Name shown in the prompt, e.g. "Marcus Ulpius Felix". */
  label(): string;
  /** Extra prompt line, e.g. "Locked (Average)" or "Owned" in red. */
  detail?(): string | null;
  /** Owned/illegal (prompt shows in red). */
  illegal?(): boolean;
  enabled?(): boolean;
  interact(game: Game): void;
}

const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const to = new THREE.Vector3();

export class Interactions implements System {
  readonly name = 'interactions';
  readonly priority = 110; // after camera
  private items = new Set<Interactable>();
  focus: Interactable | null = null;

  constructor(private readonly game: Game) {}

  add(i: Interactable) {
    this.items.add(i);
    return () => this.items.delete(i);
  }

  remove(i: Interactable) {
    this.items.delete(i);
    if (this.focus === i) this.setFocus(null);
  }

  /** The registered interactable with this id (a module taking over another's prompt), or undefined. */
  get(id: string): Interactable | undefined {
    for (const i of this.items) if (i.id === id) return i;
    return undefined;
  }

  lateUpdate() {
    const { camera, input, physics } = this.game;
    const player = this.game.player;
    if (!player || !input.enabled) {
      this.setFocus(null);
      return;
    }
    camera.getWorldPosition(eye);
    camera.getWorldDirection(look);
    const thirdPersonExtra = player.viewMode === 'third' ? eye.distanceTo(player.root.position) * 0.6 : 0;

    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      const p = it.position();
      const reach = (it.reach ?? 3) + thirdPersonExtra;
      to.subVectors(p, eye);
      const dist = to.length();
      if (dist > reach + 1.5) continue;
      // Must also be near the player's body (third person camera is far back).
      if (p.distanceTo(player.root.position) > (it.reach ?? 3) + 1.2) continue;
      to.divideScalar(dist || 1);
      const cos = to.dot(look);
      if (cos < 0.86) continue; // ~30° cone
      const score = (1 - cos) * 10 + dist * 0.15;
      if (score < bestScore) {
        // Line of sight (ignore actors).
        const hit = physics.raycast(eye, to, Math.max(0, dist - 0.4), Layer.World);
        if (hit) continue;
        best = it;
        bestScore = score;
      }
    }
    this.setFocus(best);
    if (best && input.pressed('interact')) {
      best.interact(this.game);
      this.game.events.emit('interact:used', { target: best });
    }
  }

  private setFocus(t: Interactable | null) {
    if (t === this.focus) return;
    this.focus = t;
    this.game.events.emit('interact:focus', { target: t });
  }
}
