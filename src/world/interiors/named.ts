/**
 * The hand-built interiors of the named places (docs/modules/interiors.md, "Named cells"), picked up
 * by the installer (install.ts) like the Column's: `registerNamedInteriors` registers each cell that
 * has a way in. The Column's own cells are in columna.ts.
 */
import type { Game } from '../../core/Game';
import { armsCell, armsFront } from './named/arms';
import { asclepiodotusCell, asclepiodotusFront } from './named/asclepiodotus';
import { installCellCast } from './named/cast';
import { castorLoculi } from './named/castor';
import { collapsaCell, collapsaFront } from './named/collapsa';
import { registerNamed, type NamedCell } from './named/common';
import { NamedFronts, type FrontSpec } from './named/front';
import { ludusCellae } from './named/ludus';
import { mithraeumCell, mithraeumFront } from './named/mithraeum';
import { peregrinaCell, peregrinaFront } from './named/peregrina';
import { piperatariaCell, piperatariaFront } from './named/piperataria';
import { popinaCell, popinaFront } from './named/popina';
import { registerAemiliaStrongbox } from './named/shops';

/** The named cells, in slot order. */
export const NAMED_CELLS: NamedCell[] = [castorLoculi, ludusCellae, popinaCell, armsCell, collapsaCell, piperatariaCell, mithraeumCell, asclepiodotusCell, peregrinaCell];

/** The cells whose street door is hung by the door finder (named/front.ts) rather than at a fixed doorway. */
export const NAMED_FRONTS: FrontSpec[] = [popinaFront, armsFront, collapsaFront, piperatariaFront, mithraeumFront, asclepiodotusFront, peregrinaFront];

export function registerNamedInteriors(game: Game): void {
  for (const cell of NAMED_CELLS) registerNamed(game, cell);
  registerAemiliaStrongbox(game);
  installCellCast(game);
  if (game.namedFronts) return;
  const fronts = game.addSystem(new NamedFronts(game));
  game.namedFronts = fronts;
  for (const f of NAMED_FRONTS) fronts.add(f);
}
