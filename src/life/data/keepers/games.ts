/**
 * The games (docs/design/world-life.md §4.5): two dice tables and, by the Flavian Amphitheatre,
 * the programme-seller and the bookmaker. Dice and bets run in src/life/wager (tali.ts, munus.ts);
 * the wagers themselves are in ../wagers/. The dicers sit at the crowd's own stations, so they come
 * and go with its hours (the Subura in the evening and at night, the Basilica Julia steps by day).
 */
import { AS } from '../../../rpg/money';
import { priceText } from '../../effects';
import { collectOwed, lastCollectText, owedNow } from '../../wager/bets';
import { gamesToday, programmeText } from '../../wager/programme';
import { defineLife } from '../../types';

export default defineLife({
  keepers: [
    {
      id: 'keeper-subura-aleator',
      district: 'dist-subura',
      station: 'st-subura-alea',
      member: 0,
      name: 'Phrixus',
      title: 'Dicer',
      barks: ['Four bones and a quiet corner!', 'Venus pays the pot, friend. Who’ll throw her?', 'Keep your voice down; the watch has ears and no sense of humour.'],
      wager: 'wgr.tali.subura',
      talk: {
        greet: '(A thin freedman squats over a ring scratched in the paving, four knucklebones clicking in his fist.) Evening. We play Augustus’s way, so nobody can say the old man’s rules were not good enough for him. Deal yourself in, or move along; the draught is bad for the bones.',
        topics: [
          { ask: 'What are the rules?', say: 'Four bones each, thrown in turn. A dog (the one) or a senio (the six) costs you a stake into the middle for each bone that shows it. Venus, four different faces, takes the pot. The god Augustus himself wrote it to Tiberius, so it is practically law. Practically.' },
          { ask: 'What about the watch?', say: 'The vigiles walk by with their buckets and look at the sky. Dice are against the law. So we are not dicing; we are praying to the bones. But if one of them stops and stares, the bones go in the sleeve and you never saw me.' },
          { ask: 'Does anyone ever win?', say: 'Venus comes about once in twenty-six throws, and there are three of us throwing. Do the sum. Then do the other sum, the one where I am a poor man.' },
        ],
        news: 'Heard anything on the Vicus Longus?',
      },
      closed: [],
      period: 'Dice under the lamps of a popina: Juvenal 8.172–176 [A]; Augustus’s rules, Suetonius Aug. 71 [A]; tolerated but illegal: Martial 4.14, 5.84 [A]',
    },
    {
      id: 'keeper-forum-aleator',
      district: 'dist-forum-romanum',
      station: 'st-forum-tabulae',
      member: 0,
      name: 'Mnester',
      title: 'Gamer on the Basilica steps',
      barks: ['Care for a throw on the steps?', 'The boards were cut for the lawyers. The lawyers lost.', 'Four bones, a pot, and a bit of luck.'],
      wager: 'wgr.tali.forum',
      talk: {
        greet: '(A heavy man in a patched tunic sits on the warm Basilica step beside a gaming board someone scratched into the stone before either of you was born.) Salve. Waiting for a case, or running from one? Either way, the bones will pass the time.',
        topics: [
          { ask: 'Whose boards are these?', say: 'Everyone’s. Litigants scratch them into the steps while the court sits on their case. Some cases have taken longer than the Flavians did. The boards are older than I am, and I am not young.' },
          { ask: 'How do the bones pay?', say: 'Dogs and senios put a stake in the pot; Venus empties it. A pot grows nicely when nobody throws her. There was a month I never did, and I ate on credit.' },
        ],
        news: 'What’s the talk on the steps?',
      },
      closed: [],
      period: 'Gaming boards scratched into the steps of the Basilica Julia [A, the Forum Romanum]; Augustus’s rules, Suetonius Aug. 71 [A]',
    },
    {
      id: 'keeper-colos-libellio',
      district: 'dist-vallis-colossei',
      station: 'st-colos-libelli',
      member: 0,
      name: 'Sosibius',
      title: 'Programme-seller',
      barks: ['Programmes! Who fights, who dies, who has the palm!', 'An as for the whole bill!', 'Get your programme before the pairs!'],
      talk: {
        greet: '(A lean man with a bundle of wax-blotted scrolls under one arm and a pen behind his ear.) Programmes! The whole bill, in the editor’s own order, for one as. Cheaper than a seat and you read it before the sun gets to the sand.',
        topics: [
          { ask: 'Who fights today?', say: 'It is all in the bill. Pairs with iron after the midday interval, novices with wooden arms before. The names change with the lanistae, and the lanistae change their minds. Buy one and see.' },
          { ask: 'Who writes the programme?', say: 'The painters who letter the walls put it up for the editor: who gives the games, how many pairs, the awnings. I copy the fair copy. My hand is good.' },
        ],
        news: 'Anything new on the games?',
      },
      services: [
        {
          id: 'programme',
          text: 'Buy a programme',
          price: AS,
          gate: { if: (g) => !!gamesToday(g) },
          effects: [],
          result: (g) => `(He tears a strip from his scroll and presses it into your hand.) ${programmeText(g)}`,
        },
      ],
      closed: [],
      period: 'Programmes and gladiators’ bills: Ovid Ars Amatoria 1.167–170; painted notices of the games, “vela erunt” (CIL IV 1180, Pompeii) [A, a Pompeian parallel]',
    },
    {
      id: 'keeper-colos-sponsor',
      district: 'dist-vallis-colossei',
      station: {
        id: 'st-life-colos-sponsor',
        landmark: 'meta-sudans',
        gap: 6,
        when: ['morning', 'midday', 'afternoon'],
        members: [{ role: 'merchant', out: 0.6, side: 7.4, loop: 'stand', face: 'out', prop: null, label: 'Bookmaker', barks: 'libelli' }],
        dressing: [{ kind: 'table', out: 1.3, side: 7.4 }],
      },
      member: 0,
      name: 'Gaius Nonius Faustinus',
      title: 'Bookmaker',
      barks: ['A bet on the sand, citizen? I pay on the palm!', 'Murmillo against thraex! Name your man!', 'Back your man, and may Fortuna look on.'],
      wager: 'wgr.munus.colos',
      talk: {
        greet: '(A well-fed man with a wax tablet, a purse and a boy to carry the purse.) A little wager on the gladiators, citizen? Name your man before the pair goes out, and I pay on the palm. I do not take bets after the trumpet; that is for fools and the dead.',
        topics: [
          { ask: 'How does it work?', say: 'Buy a programme from Sosibius, pick your man from the next pair, and put up a stake: a quarter denarius to four. If he wins, I pay you nearly twice what you put up. If he loses, I thank you. If the editor sends them both off standing, you get your stake back, and we both complain.' },
          { ask: 'Is it legal?', say: 'At the games? Everyone bets at the games. Ovid says a man asks the girl next to him for her programme and bets to start a conversation. Betting is what the stands are for.' },
        ],
        news: 'Who is the favourite today?',
        choices: [
          {
            text: (c) => `Collect my winnings. (${priceText(owedNow(c.game))})`,
            if: (c) => owedNow(c.game) > 0,
            effects: (c) => void collectOwed(c.game, 'keeper-colos-sponsor'),
            goto: 'collected',
          },
        ],
        nodes: { collected: { text: () => lastCollectText(), next: 'hub' } },
      },
      closed: [],
      period: 'Betting at the games: Ovid Ars Amatoria 1.167–170 [A]; Roman sponsio, a wager laid by stipulation [A]; the odds [G]',
    },
  ],
});
