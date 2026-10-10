/**
 * Market day (SHOPS, §4.3). On every 8th elapsed day (the nundinae, barter.isMarketDay) four keepers
 * set up at the Forum Boarium and the Forum Holitorium, each under a banner on a pole: a country woman
 * with honey and cheese, a herb-woman, a potter and a cloth-seller. Their stations are manned only on
 * market days (`marketDay`), and they are stalls, so the 10% market-day discount applies (vendors).
 * Each station has the keeper and one customer: eight extra people a market, no more.
 */
import { defineLife } from '../../types';
import type { StationDef } from '../../../npc/crowd/stations';
import { look, stock } from './_shops';

/** The country people come in at dawn and are gone by the sixth hour. */
const MARKET = ['salutatio', 'morning', 'midday'] as const;

/** A market stall at one of the two fora: the keeper behind a table under a banner, one customer. */
const stall = (id: string, landmark: string, side: number, label: string, barks: string, dressing: 'stall-food' | 'stall-cloth' | 'stall-pots', customer: 'citizen-woman' | 'citizen', out = -1.6): StationDef => ({
  id,
  landmark,
  gap: 2,
  when: MARKET,
  marketDay: true,
  members: [
    { role: customer === 'citizen' ? 'merchant' : 'farmer', out, side, loop: 'stand', face: 'out', prop: null, label, barks },
    { role: customer, out: out + 1.2, side: side + 0.9, loop: 'talk', face: 'in', prop: customer === 'citizen-woman' ? 'basket' : null },
  ],
  dressing: [
    { kind: dressing, out: out + 0.7, side },
    { kind: 'banner', out, side: side - 1.6 },
  ],
});

export default defineLife({
  keepers: [
    {
      id: 'keeper-boarium-melaria',
      district: 'dist-velabrum-boarium',
      station: stall('st-life-boarium-rustica', 'forum-boarium', -16, 'Country woman', 'merchant', 'stall-food', 'citizen-woman'),
      member: 0,
      name: 'Vibia Rustica',
      title: 'Country woman',
      get appearance() {
        return look('keeper-boarium-melaria', 'plebeian-woman');
      },
      barks: ['Honey from the Sabine hills! Cheese, figs, all from my own farm!', 'Nundinae! Nundinae! Buy from the hand that grew it!'],
      shop: { vendor: 'macellarius', stock: stock(['mel', 6], ['caseus', 8], ['ficus', 10]) },
      talk: {
        greet: '(A broad-shouldered woman in a straw hat, her stall lined with pots of honey and rounds of white cheese.) You’re in luck, it’s market day. I walked in from the farm in the dark, so I’ll not be dragged down in the price.',
        topics: [
          { ask: 'You come from the country?', say: 'Twelve miles. We come in for the nundinae and go home at the sixth hour, and then it is eight days of work before the next. The city is loud, dirty and very good for selling honey. I do not stay a moment longer than I have to.' },
          { ask: 'Why every eighth day?', say: 'It has always been so. Eight days on the farm, and the ninth in town: the nundinae. Ask the oldest man in my village why, and he says because his father said so. On the ninth day I go to town, and I sell. That is all I need to know.' },
          { ask: 'How is the honey?', say: 'The bees have been at the thyme this year. Dark, strong, and slightly bitter at the back of the tongue. The city likes it sweeter, so I mix some lighter in for the Palatine. For you, it is the strong. Try it.' },
        ],
        news: 'What news from the country roads?',
      },
      period: 'The nundinae, the 8-day market cycle: country people (rustici) came into Rome on market days (Macrobius Sat. 1.16; Varro RR 2 pref.) [A]; the keeper [G]',
    },
    {
      id: 'keeper-holitorium-herbaria',
      district: 'dist-forum-holitorium',
      station: stall('st-life-holitorium-herbaria', 'forum-holitorium', -14, 'Herb-woman', 'merchant', 'stall-food', 'citizen-woman'),
      member: 0,
      name: 'Nonia Herbaria',
      title: 'Herb-woman',
      get appearance() {
        return look('keeper-holitorium-herbaria', 'plebeian-woman');
      },
      barks: ['Herbs for what ails you! Cheap on market day!', 'Rue! Sage! Wormwood! Bunched with my own hands!'],
      shop: { vendor: 'macellarius', stock: stock(['allium', 12], ['salvia', 8], ['ruta', 6], ['absinthium', 5]) },
      talk: {
        greet: '(A small, quick woman behind a mat of bundles tied in coloured thread.) Nundinae prices, so don’t bargain me down further. It is already cheap and I am already poor.',
        topics: [
          { ask: 'What is good for a fever?', say: 'Wormwood tea and a cool cloth, and the physician’s fee saved. If it lasts three days, see the physician, and tell him I sent you, so he knows I told you to. If it lasts longer you should not be talking to me.' },
          { ask: 'Do your herbs really work?', say: 'Some do. Some do not. Some work if you believe in them, which is a kind of working. The rue is the one I trust. It does what it says and keeps the evil eye off a house as a bonus.' },
          { ask: 'Where do you find them?', say: 'The hedges, the ditches, the sunny banks above the Tiber. A herb-woman knows where the sage grows wild as a child knows where the apples are. I do not tell. A woman has to eat.' },
        ],
        news: 'What do the market-women say?',
      },
      period: 'Herb-sellers at the Roman markets; rue, sage, wormwood, garlic in household remedies (Pliny NH 20, 22, 27) [A]; nundinae [A]; the keeper [G]',
    },
    {
      id: 'keeper-boarium-figulus',
      district: 'dist-velabrum-boarium',
      station: stall('st-life-boarium-figulus', 'forum-boarium', -9, 'Potter', 'merchant', 'stall-pots', 'citizen'),
      member: 0,
      name: 'Spurius Cornelius Olla',
      title: 'Potter',
      barks: ['Pots, lamps, cups! The kiln is a day away, but the price is a day cheaper!', 'On market day a cup costs less than it cost to make. I make it up in lamps.'],
      shop: { vendor: 'figulus', stock: stock(['lucerna', 14], ['vasa-arretina', 3]) },
      talk: {
        greet: '(A heavy man with a cart-load of clay and an air of having slept in the straw.) Market-day prices, friend. Lamps, cups, bowls. Break one, bring it back, I will tell you it was already cracked.',
        topics: [
          { ask: 'Are you a potter or a dealer?', say: 'Both. I fire in the country, the cart brings it in. A potter who sells only to the next man is a potter who dies poor. On market day I sell straight, and the difference between my price and the shop price is the whole reason I come.' },
          { ask: 'How are lamps made?', say: 'Two moulds, clay pressed in, the halves joined, a wick-hole pierced. A trained boy makes a hundred a day. The art is in the moulds, and you can only see the art if you look at the top. The rest is just clay.' },
          { ask: 'Fine cups?', say: 'The red ware. It comes from Arretium and the moulds are copied in a dozen kilns. Mine is not Arretium. It is red, though, and it holds wine, and the wine does not mind.' },
        ],
        news: 'Any news from the kilns?',
      },
      period: 'Potters selling at market; mould-made lamps and Arretine ware, early empire [A]; nundinae [A]; the keeper [G]',
    },
    {
      id: 'keeper-holitorium-pannarius',
      district: 'dist-forum-holitorium',
      station: stall('st-life-holitorium-pannarius', 'forum-holitorium', 4, 'Cloth-seller', 'merchant', 'stall-cloth', 'citizen', -6),
      member: 0,
      name: 'Decimus Livius Pannus',
      title: 'Cloth-seller',
      barks: ['Tunics! Plain, honest wool at honest prices!', 'Nundinae cloth, nundinae price. Come and touch.'],
      shop: { vendor: 'pannarius', stock: stock(['tunica', 8], ['tunica-crassa', 5], ['fasciae', 4], ['pileus', 3]) },
      talk: {
        greet: '(A small man hangs tunics from a pole as if displaying a battle trophy.) Wool! Good, plain wool. Not the Vicus Tuscus kind: the kind you can wear to work and not be sorry.',
        topics: [
          { ask: 'Why cheaper than the shops?', say: 'No rent. A pole, a pitch, a market day. The Vicus Tuscus pays for its roof and its name. I pay for the pole. We both sell cloth. Mine is the one you can buy without selling your cloak.' },
          { ask: 'Where does the wool come from?', say: 'Hill sheep, mostly. Carded and spun by country women, woven by their sisters, brought in by their husbands. Everyone has a hand in it and everyone has a cut, and the cut I get is the smallest. Still, a tunic is a tunic.' },
          { ask: 'What is the thick one?', say: 'A tunica crassa: thick, for winter, or for a man who works outside in all weathers. It is heavy and it is warm and it does not tear. Buy one, wear it for ten years, and curse me for ten more.' },
        ],
        news: 'What are people wearing?',
      },
      period: 'Cloth and clothing sold by country people at the nundinae; plain wool tunics for the plebs [A]; the keeper [G]',
    },
  ],
});
