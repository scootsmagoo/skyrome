/**
 * Bets on the games (docs/design/world-life.md §4.5): the bookmaker by the Flavian Amphitheatre takes
 * a bet on one fighter of the next pair and pays 1.8× if he wins (the stake back if both are sent
 * off standing). The runtime is src/life/wager/munus.ts; bets are settled by `munus:bout`.
 */
import { defineLife } from '../../types';

export default defineLife({
  wagers: [
    {
      id: 'wgr.munus.colos',
      game: 'munus',
      // A quarter, a half, one and four denarii.
      stakes: [0.25, 0.5, 1, 4],
      // What he will lay in a game day (net of stakes) before he stops taking bets.
      bank: 10,
      odds: 1.8,
      period: 'A man at the gladiators asks for the programme and lays a bet: Ovid, Ars Amatoria 1.167–170 [A]; the odds [G]',
    },
  ],
});
