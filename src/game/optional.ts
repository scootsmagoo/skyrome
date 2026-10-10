/**
 * Modules built in parallel by other crews (combat, NPC life) are installed here when their entry
 * files exist at build time: `import.meta.glob` finds them (an empty glob is fine), and each
 * module's exported `install…(game)` functions run once, in a try/catch so a broken module can't
 * stop the game from booting. The integrator can replace this with direct calls once they land.
 *
 *   src/combat/index.ts | install.ts            → installCombat(game)        (game.combat)
 *   src/npc/population/index.ts | src/npc/install.ts | src/npc/life/index.ts
 *                                                → installPopulation / installNpcs / installNpcLife
 *   src/content/install.ts                       → installContent(game)       (game.content: shrines, wall texts,
 *                                                  street containers, lamps along the golden path; docs/modules/content.md)
 *   src/life/install.ts                          → installLife(game)          (game.life: shops and keepers, services,
 *                                                  notice boards, rumours; after the NPCs and the content; docs/modules/life.md)
 */
import type { Game } from '../core/Game';

type Mod = Record<string, unknown>;

const combat = import.meta.glob<Mod>(['../combat/index.ts', '../combat/install.ts']);
const npcs = import.meta.glob<Mod>(['../npc/population/index.ts', '../npc/install.ts', '../npc/life/index.ts', '../npc/life/install.ts']);
const content = import.meta.glob<Mod>(['../content/install.ts']);
const life = import.meta.glob<Mod>(['../life/install.ts']);

async function run(game: Game, mods: Record<string, () => Promise<Mod>>, label: string): Promise<string[]> {
  const done: string[] = [];
  for (const [path, load] of Object.entries(mods)) {
    try {
      const mod = await load();
      for (const [name, fn] of Object.entries(mod)) {
        if (!/^install[A-Z]/.test(name) || typeof fn !== 'function') continue;
        await (fn as (g: Game) => unknown)(game);
        done.push(`${label}:${name}`);
      }
    } catch (err) {
      console.error(`[flow] optional ${label} module ${path} failed to install`, err);
    }
    if (done.length) break; // index.ts and install.ts usually export the same function
  }
  return done;
}

export async function installOptionalModules(game: Game): Promise<string[]> {
  const g = game as Game & { combat?: unknown; population?: unknown; content?: unknown; life?: unknown };
  const out: string[] = [];
  if (!g.combat) out.push(...(await run(game, combat, 'combat')));
  if (!g.population) out.push(...(await run(game, npcs, 'npc')));
  if (!g.content) out.push(...(await run(game, content, 'content')));
  // The life of the city stands on the NPCs (keepers at stations) and the content (rumours, places).
  if (!g.life) out.push(...(await run(game, life, 'life')));
  if (out.length) console.info(`[flow] installed ${out.join(', ')}`);
  return out;
}
