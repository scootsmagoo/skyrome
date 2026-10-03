/**
 * NPC definition registry (game.npcs): lookup only — no AI, no spawning. Content files in
 * src/npc/content/*.ts default-export NpcDef[] (or a single NpcDef). Files whose name starts with
 * '_' are examples, loaded only with includeExamples.
 */
import type { NpcDef, Service } from './types';

declare module '../core/Game' {
  interface Game {
    npcs: NpcRegistry;
  }
}

export function loadNpcContent(includeExamples = false): NpcDef[] {
  const mods = import.meta.glob<{ default?: NpcDef | NpcDef[] }>('./content/*.ts', { eager: true });
  const out: NpcDef[] = [];
  for (const [path, mod] of Object.entries(mods)) {
    const file = path.split('/').pop()!;
    if (file.startsWith('_') && !includeExamples) continue;
    const d = mod.default;
    if (d) out.push(...(Array.isArray(d) ? d : [d]));
  }
  return out;
}

export class NpcRegistry {
  private readonly map = new Map<string, NpcDef>();

  constructor(defs: readonly NpcDef[] = []) {
    this.add(defs);
  }

  add(defs: NpcDef | readonly NpcDef[]) {
    for (const d of Array.isArray(defs) ? defs : [defs as NpcDef]) {
      if (this.map.has(d.id) && this.map.get(d.id) !== d) console.warn(`[npcs] "${d.id}" defined twice; the last one wins`);
      this.map.set(d.id, d);
    }
  }

  get(id: string): NpcDef | undefined {
    return this.map.get(id);
  }

  has(id: string) {
    return this.map.has(id);
  }

  all(): NpcDef[] {
    return [...this.map.values()];
  }

  byFaction(faction: string): NpcDef[] {
    return this.all().filter((d) => d.faction === faction);
  }

  byTag(tag: string): NpcDef[] {
    return this.all().filter((d) => d.tags?.includes(tag));
  }

  withService(service: Service): NpcDef[] {
    return this.all().filter((d) => d.services?.includes(service));
  }

  /** NPCs whose home or any schedule entry is at a location. */
  at(locationId: string): NpcDef[] {
    return this.all().filter((d) => d.home === locationId || d.schedule?.some((s) => s.at === locationId));
  }

  /** Display name, or undefined for unknown ids. */
  name(id: string): string | undefined {
    return this.map.get(id)?.name;
  }

  get size() {
    return this.map.size;
  }
}
