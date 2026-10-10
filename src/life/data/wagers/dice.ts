/**
 * The two dice tables (docs/design/world-life.md §4.5): Augustus's own rules, from his letter to
 * Tiberius in Suetonius (Augustus 71): each thrower puts a denarius into the pot for every dog
 * (the one) or senio (the six), and whoever throws Venus (four different faces) takes the pot.
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
      period: 'Augustus’s rules, Suetonius Aug. 71 [A]; dice under the lamps of a popina: Juvenal 8.172–176 [A]; gambling tolerated, not legal: Martial 4.14, 5.84 [A]',
    },
    {
      id: 'wgr.tali.forum',
      game: 'tali',
      stakes: STAKES,
      bank: 3,
      watchRadius: 18,
      period: 'Gaming boards scratched into the Basilica Julia steps [A, the Forum Romanum]; Augustus’s rules, Suetonius Aug. 71 [A]',
    },
  ],
});
