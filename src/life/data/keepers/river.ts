/**
 * The river markets (SHOPS, §4.2 #18-19): the butcher at the Forum Boarium (the cattle market) and the
 * greengrocer and herb-seller at the Forum Holitorium (the vegetable market).
 */
import { defineLife } from '../../types';
import { look, stock } from './_shops';

export default defineLife({
  keepers: [
    {
      id: 'keeper-boarium-lanius',
      district: 'dist-velabrum-boarium',
      station: 'st-boarium-lanii',
      member: 0,
      name: 'Marcus Sulpicius Lanio',
      title: 'Butcher',
      barks: ['Fresh meat! Killed this morning at the Boarium!', 'Pork, beef, a sausage that never told a lie!'],
      shop: {
        vendor: 'macellarius',
        stock: stock(['botulus', 12], ['patina', 4], ['corium', 4]),
      },
      talk: {
        greet: '(A heavy-armed man in a leather apron that was once white.) Good morning. Meat is fresh today, and the apron is not. Do not look at the apron.',
        topics: [
          { ask: 'Where does the meat come from?', say: 'The cattle come in on the hoof to the Boarium, over the Via Salaria and the Via Latina. A drover sells to a dealer, a dealer to me, and I sell to you. Each of us pretends the animal was in perfect health. It never is.' },
          { ask: 'Why is there so much pork?', say: 'The pig is the Roman’s ox. It gives the most and wants the least, and every part is good. Sausage, tripe, ham, the cheek, the ear, the foot. If I told you what goes in a botulus you would not eat one. Eat one anyway.' },
          { ask: 'What happens to the hides?', say: 'The tanners across the river take them, and the smell goes with them. I am the first to say it is a foul trade. I am also the first to say they pay on time, which is more than the cobbler does.' },
        ],
        news: 'What do the drovers say?',
      },
      period: 'The Forum Boarium as the cattle market; lanii and suarii (pork-butchers), sausage (botulus) and tripe [A]; tanners’ quarter across the Tiber [P]; the keeper [G]',
    },
    {
      id: 'keeper-holitorium-holitor',
      district: 'dist-forum-holitorium',
      station: 'st-holitorium-holitores',
      member: 0,
      name: 'Gaia Furia Holera',
      title: 'Greengrocer and herb-seller',
      get appearance() {
        return look('keeper-holitorium-holitor', 'plebeian-woman');
      },
      barks: ['Greens! Garlic, rue, sage, fresh from the Campagna this morning!', 'Herbs for the stomach, herbs for the heart, herbs for what ails you! Come early!'],
      shop: {
        vendor: 'macellarius',
        stock: stock(['allium', 14], ['salvia', 10], ['ruta', 8], ['absinthium', 6], ['cicer', 10], ['fabae', 10], ['ficus', 8]),
      },
      talk: {
        greet: '(A weathered woman among baskets of green things, tying leaves into bunches without looking at her hands.) Buy early, buy fresh. By the third hour the sun has had its say, and so have the flies.',
        topics: [
          { ask: 'What are these herbs for?', say: 'Rue for the eyes and against witchcraft, wormwood for the stomach, sage for the throat and the memory. Garlic for everything. The physicians charge a denarius for what I sell for an as, and the herbs do not care who sells them.' },
          { ask: 'Do you grow them yourself?', say: 'I grow them. I do not carry them. My sons carry them, and they are late. The farm is a day out on the Via Salaria, the cart leaves in the dark, and I am here at the fourth watch to meet them. It is the only life I know.' },
          { ask: 'Why so early?', say: 'The vegetable market opens before dawn and is finished by the third hour. After that the flies decide who gets what is left. The city eats in the morning or it eats nothing.' },
        ],
        news: 'What do the farmers say?',
      },
      period: 'The Forum Holitorium, the greengrocers’ market (holitores) beside the Tiber; rue, sage, wormwood, garlic in Roman household medicine (Pliny NH 20, 22) [A]; the keeper [G]',
    },
  ],
});
