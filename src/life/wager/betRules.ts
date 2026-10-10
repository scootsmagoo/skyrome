/**
 * Bets on the games (docs/design/world-life.md §4.5), pure. A bet is on one fighter of a pair; the
 * bout's end ('munus:bout') settles it: the fighter won (pays the odds), lost (nothing) or both
 * were sent off standing (the stake comes back). A bet whose pair never fought that day is void
 * and the stake comes back too. The player collects from the bookmaker.
 */
import { roundQuadrans } from '../../rpg/money';

/** A payout in whole asses (1/16 denarius): what a bookmaker counts out. */
const roundAs = (d: number) => Math.round(d * 16) / 16;

export type BetState = 'open' | 'won' | 'lost' | 'void';

export interface Bet {
  /** Who took it (the bookmaker's keeper id) and under which wager. */
  owner: string;
  wager: string;
  /** GameTime.dayIndex when it was laid. */
  day: number;
  /** The man backed, and the man he fights. */
  fighter: string;
  other: string;
  stake: number;
  state: BetState;
  /** What is owed at collection (won: stake × odds to the as; void: the stake; lost: 0). */
  pay: number;
  /** Collected: kept only until the end of the day, for the slip. */
  paid?: boolean;
}

/** What 'munus:bout' says (the director's event). */
export interface BoutEnd {
  winner: string | null;
  loser: string | null;
  verdict: string | null;
  lusio: boolean;
}

/** The pair on the sand from MunusDirector.status(): "…· Tetraites v Celadus [fight] · …". */
export function stagedPair(status: string): [string, string] | null {
  const m = / · ([^·\[\]]+?) v ([^·\[\]]+?) \[/.exec(status);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/** Settle the open bets on the pair that just finished. Returns the bets that changed. */
export function settle(bets: Bet[], pair: readonly [string, string] | null, end: BoutEnd, odds: number | ((b: Bet) => number)): Bet[] {
  const changed: Bet[] = [];
  if (end.lusio || !pair) return changed;
  for (const b of bets) {
    if (b.state !== 'open') continue;
    const on = (n: string) => n === b.fighter || n === b.other;
    if (!(on(pair[0]) && on(pair[1]))) continue;
    if (!end.winner) {
      // Both sent off standing: no winner, no loser.
      b.state = 'void';
      b.pay = b.stake;
    } else if (end.winner === b.fighter) {
      b.state = 'won';
      b.pay = roundAs(b.stake * (typeof odds === 'number' ? odds : odds(b)));
    } else {
      b.state = 'lost';
      b.pay = 0;
    }
    changed.push(b);
  }
  return changed;
}

/** Bets from an earlier day that never fought: the stake is owed back. */
export function voidStale(bets: Bet[], today: number): Bet[] {
  const out: Bet[] = [];
  for (const b of bets) {
    if (b.state === 'open' && b.day < today) {
      b.state = 'void';
      b.pay = b.stake;
      out.push(b);
    }
  }
  return out;
}

/** What the bookmaker owes now across the bets, and how many slips that is. */
export function owed(bets: readonly Bet[]): { total: number; slips: number } {
  let total = 0;
  let slips = 0;
  for (const b of bets) {
    if (b.paid || b.state === 'open' || b.state === 'lost') continue;
    total += b.pay;
    slips++;
  }
  return { total: roundQuadrans(total), slips };
}

/** What the bookmaker stands to lose on the open bets (net of the stakes he holds). */
export function exposure(bets: readonly Bet[], odds: number): number {
  let sum = 0;
  for (const b of bets) if (b.state === 'open') sum += roundAs(b.stake * odds) - b.stake;
  return roundQuadrans(sum);
}

/** What he has paid out net of stakes today: wins count (odds − 1) × stake, losses give back the stake. */
export function netPaid(b: Bet, odds: number): number {
  if (b.state === 'won') return b.pay - b.stake;
  if (b.state === 'lost') return -b.stake;
  return 0;
}

/**
 * May the bookmaker lay this stake? What he has paid out net today, plus what the open bets could
 * cost him, plus this one, must stay inside his bank for the game day.
 */
export function canLay(bets: readonly Bet[], today: number, stake: number, odds: number, bank: number): boolean {
  let net = 0;
  for (const b of bets) if (b.day === today) net += netPaid(b, odds);
  return net + exposure(bets, odds) + (roundAs(stake * odds) - stake) <= bank + 1e-9;
}
