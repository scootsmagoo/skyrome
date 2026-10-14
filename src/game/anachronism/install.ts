/**
 * The anachronism cheat's console commands. Nothing else of it is loaded until one is used: the
 * guns (guns.ts) and their look and sound (fx/) come in by dynamic import.
 *
 *   anachronism [on|off]   modern guns, for this session (also `guns`)
 *   gun <pistol|rifle|shotgun|rpg|off>
 */
import type { Game } from '../../core/Game';
import { registerCommands } from '../../dev/console/commands';
import { GUN_ORDER } from './weapons';
import type { GunId } from './types';

const fxModules = import.meta.glob<{ installGunFx?: (g: Game) => void }>('./fx/index.ts');
let fxDone = false;

async function guns(game: Game, on: boolean) {
  const m = await import('./guns');
  const sys = m.enableGuns(game, on);
  if (on && !fxDone) {
    fxDone = true;
    for (const load of Object.values(fxModules)) (await load()).installGunFx?.(game);
  }
  return sys;
}

export function installAnachronism(game: Game) {
  void game;
  registerCommands(
    {
      name: 'anachronism',
      aliases: ['guns'],
      usage: '[on|off]',
      help: 'Modern guns in AD 113, for this session: F fires, Q aims, X locks on, R switches gun. Infinite ammo.',
      async run(args, ctx) {
        const want = args[0] === 'off' ? false : args[0] === 'on' ? true : !ctx.game.guns?.armed;
        await guns(ctx.game, want);
        const how = ctx.game.input.device === 'touch' ? 'Attack fires, Block aims, Lock locks on, Draw switches gun.' : ctx.game.input.device === 'gamepad' ? 'Attack fires, block aims, lock-on locks, ready switches gun.' : 'F fires, Q aims, X locks on, R switches gun.';
        return want ? `Anachronism on. ${how} Rome will not take it well.` : 'Anachronism off.';
      },
    },
    {
      name: 'gun',
      usage: '<pistol|rifle|shotgun|rpg|off>',
      help: 'Take a gun (switches the anachronism cheat on).',
      async run(args, ctx) {
        const id = args[0] as GunId | 'off' | undefined;
        if (id === 'off') {
          await guns(ctx.game, false);
          return 'Holstered.';
        }
        if (!id || !GUN_ORDER.includes(id)) return `Guns: ${GUN_ORDER.join(', ')}.`;
        const sys = await guns(ctx.game, true);
        sys.equip(id);
        return `${id} in hand.`;
      },
    },
  );
}
