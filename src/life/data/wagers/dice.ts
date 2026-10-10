/**
 * The two dice tables (docs/design/world-life.md §4.5). Suetonius (Augustus 71) has Augustus writing
 * to Tiberius about his dice: a thrower paid a denarius into the pot for each dog (the one) or senio
 * (the six), and whoever threw Venus took the pot [A]. The game plays that scheme with stakes of 1 to 4
 * asses a die and a daily bank; the stakes, the bank and the rest of the mechanics are the game's own [G].
 * The runtime is src/life/wager/tali.ts; the keepers who play are in ../keepers/games.ts.
 */
import { AS } from '../../../rpg/money';
import { defineLife } from '../../types';

const STAKES = [AS, 2 * AS, 3 * AS, 4 * AS];

export default defineLife({
  wagers: [
    {
      id: 'wgr.tali.subura',
      game: 'tali',
      stakes: STAKES,
      bank: 3,
      watchRadius: 18,
      period: 'Dog/six pays in, Venus takes the pot: Suetonius Aug. 71 [A]; stakes and bank are the game’s [G]; dice under the lamps of a popina: Juvenal 8.172–176 [A]; gambling tolerated, not legal: Martial 4.14, 5.84 [A]',
    },
    {
      id: 'wgr.tali.forum',
      game: 'tali',
      stakes: STAKES,
      bank: 3,
      watchRadius: 9,
      period: 'Gaming boards scratched into the Basilica Julia steps [A, the Forum Romanum]; dog/six pays in, Venus takes the pot: Suetonius Aug. 71 [A]; stakes and bank are the game’s [G]',
    },
  ],
});
