/**
 * Modules built in parallel by other crews (combat, NPC life) are installed here when their entry
 * files exist at build time: `import.meta.glob` finds them (an empty glob is fine), and each
 * module's exported `install…(game)` functions run once, in a try/catch so a broken module can't
 * stop the game from booting. The integrator can replace this with direct calls once they land.
 *
 *   src/combat/index.ts | install.ts            → installCombat(game)        (game.combat)
 *   src/npc/population/index.ts | src/npc/install.ts | src/npc/life/index.ts
 *                                                → installPopulation / installNpcs / installNpcLife
 */
import type { Game } from '../core/Game';

type Mod = Record<string, unknown>;

const combat = import.meta.glob<Mod>(['../combat/index.ts', '../combat/install.ts']);
const npcs = import.meta.glob<Mod>(['../npc/population/index.ts', '../npc/install.ts', '../npc/life/index.ts', '../npc/life/install.ts']);

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
  const g = game as Game & { combat?: unknown; population?: unknown };
  const out: string[] = [];
  if (!g.combat) out.push(...(await run(game, combat, 'combat')));
  if (!g.population) out.push(...(await run(game, npcs, 'npc')));
  if (out.length) console.info(`[flow] installed ${out.join(', ')}`);
  return out;
}
