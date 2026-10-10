/**
 * The Circus valley (SHOPS, docs/design/world-life.md §4.2 #1-3): the cook-shop under the arcades,
 * the fortune-teller, the potter and lamp-seller. The golden path walks past all three.
 */
import { AS } from '../../../rpg/money';
import { defineLife } from '../../types';
import { condition, look, stock } from './_shops';

export default defineLife({
  keepers: [
    {
      id: 'keeper-circus-popina',
      district: 'dist-circus-maximus',
      station: 'st-circus-popina',
      member: 0,
      name: 'Gaius Cassius Bulbus',
      title: 'Popina keeper',
      barks: ['Hot puls! Hot sausage! Out of the draught, under the arch!', 'A cup of wine and a bowl of beans for the price of a bad seat!'],
      shop: {
        vendor: 'popina',
        stock: stock(['puls', 12], ['botulus', 8], ['lupini', 10], ['panis', 10], ['vinum', 14], ['posca', 10]),
      },
      talk: {
        greet: '(A broad man with a wet cloth over one shoulder and a ladle in the other hand.) In out of the wind! Bulbus keeps the best bean-pot under the Circus, and no, I won’t say who told you otherwise.',
        topics: [
          { ask: 'Is it always this crowded?', say: 'On a race day you cannot get a bowl for love or money, and on a day with no race I get the men who make the race happen. Charioteers’ grooms, stable-boys, the man who rakes the sand. They eat like they run: all at once, and late.' },
          { ask: 'What is in the pot?', say: 'Beans, spelt, a bone, an onion if the onion man is honest. Puls is what built this city, friend. Your grandfather ate it, and he died of old age, so don’t sneer.' },
          { ask: 'The fortune-teller across the way.', say: 'Keep your coins in your belt, I say, but half my customers have been to her first and come to me to forget what she told them. Good for business. I wish her long life.' },
        ],
        news: 'What do the grooms say?',
      },
      services: [
        {
          id: 'calda',
          text: 'A hot cup',
          price: 2 * AS,
          effects: [{ kind: 'restore', target: 'stamina', amount: 10 }, ...condition('calefactus')],
          result: ['(He ladles hot water into wine and passes it over the counter.) Calda. Drink it slowly or burn your tongue. Your choice.', 'There. The warmest thing you will be handed all day.'],
        },
      ],
      period: 'Popinae with counters and dolia sunk in them, Pompeii and Ostia [A]; Horace Sat. 1.6.113 (leeks, chickpeas and fritters at a stall) [A]; the keeper [G]',
    },
    {
      id: 'keeper-circus-sortilega',
      district: 'dist-circus-maximus',
      station: 'st-circus-sortilega',
      member: 0,
      name: 'Phryne of Antioch',
      title: 'Fortune-teller',
      get appearance() {
        return look('keeper-circus-sortilega', 'plebeian-woman');
      },
      barks: ['Your lot, your fate, two asses! The Circus girl knows her lot!', 'Draw and be told. I only read what is written.'],
      talk: {
        greet: '(A woman sits on a folded cloak, a clay bowl of wooden lots between her knees.) Sit, if you want to hear it. Stand, if you only want to look. Either way the lots are the same.',
        topics: [
          { ask: 'How do the lots work?', say: 'You draw one, I read what is cut into it. I do not make the future. I only say what the wood says. If you do not like it, take it up with the wood.' },
          { ask: 'Who comes to you?', say: 'Girls from the Subura who want to know about a man. Men who want to know about a horse. Both ask the same question: will it win? And I say the same thing: the gods have not told me yet.' },
          { ask: 'Is it true what they say about your kind?', say: 'That we are cheats? Some of us. The magistrates have thrown us out of the city more than once, and we come back in the next dry season. People like to be told. I like to be paid. We have an understanding.' },
        ],
        news: 'Anything in the lots for the city?',
      },
      services: [
        {
          id: 'lot',
          text: 'Draw a lot',
          price: 2 * AS,
          daily: true,
          effects: [{ kind: 'omen' }],
          result: ['(She shakes the bowl, and a sliver of wood jumps out onto your knee.) Hm. Yes. That is what I thought it would say.', '(She turns the lot over twice before she speaks.) It says what it says. What it means is your affair.'],
        },
      ],
      period: 'Juvenal 6.582-91 (the plebeian girl asks her fate at the Circus; sortilegi); fortune-tellers expelled from Rome and returning (Tacitus Ann. 2.32) [A]; the keeper [G]',
    },
    {
      id: 'keeper-circus-figulus',
      district: 'dist-circus-maximus',
      station: 'st-circus-figlinae',
      member: 0,
      name: 'Titus Fabricius Tegula',
      title: 'Potter and lamp-seller',
      barks: ['Lamps! Mould-made, no bubbles, a night’s oil in every one!', 'Cups, bowls, lamps! Drop one and it is yours.'],
      shop: {
        vendor: 'figulus',
        stock: stock(['lucerna', 12], ['vasa-arretina', 3]),
      },
      talk: {
        greet: '(Grey clay dust up to the elbows, and a broom he has clearly not been using.) Lamps, cups, bowls! If it holds oil or wine I made it or I know the man who did.',
        topics: [
          { ask: 'Where do you fire your pots?', say: 'The kilns are up the valley, past the last of the tombs. The clay comes from the Vatican bank across the river, and the best of it goes to the brickmakers. I get what the brickmakers do not want. It is a living.' },
          { ask: 'What makes a good lamp?', say: 'A good mould, a clean wick-hole and an even glaze. Cheap ones smoke and stink of rancid oil. Mine smoke a little less. I am not a liar, only a potter.' },
          { ask: 'Who buys lamps?', say: 'Everybody who is afraid of the dark, and in this city that is everybody after the first watch. And the temples. The temples buy a thousand at a time for the festivals. I wish I were a temple.' },
        ],
        news: 'What is being said at the kilns?',
      },
      period: 'Mould-made clay lamps (lucernae) of the early empire; Arretine ware [A]; potters’ and brickmakers’ quarters beyond the walls, Tiber clay [P]; the keeper [G]',
    },
  ],
});
