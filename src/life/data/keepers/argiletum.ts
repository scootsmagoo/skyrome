/**
 * The Argiletum (SHOPS, §4.2 #16-17): the bookseller with titles on his door-posts, and the cobbler.
 * (The Subura's other shops are in subura.ts.)
 */
import { defineLife } from '../../types';
import { stock } from './_shops';

export default defineLife({
  keepers: [
    {
      id: 'keeper-argiletum-librarius',
      district: 'dist-subura',
      station: 'st-argiletum-librarius',
      member: 0,
      name: 'Gaius Atrectus Volumen',
      title: 'Bookseller',
      barks: ['Books! New copies, clean hands, the titles on the door-posts!', 'A book for every taste and a taste for every book!'],
      shop: {
        vendor: 'librarius',
        stock: stock(['liber-martialis', 1], ['liber-celsus', 1], ['liber-columella', 1], ['liber-fasti', 1], ['liber-vitruvius', 1], ['liber-satyricon', 1], ['tabula-cerata', 6]),
      },
      talk: {
        greet: '(He is half hidden behind a door-post plastered with the titles of his stock, and a boy beside him is copying out a page in a fine slanting hand.) Come in and read the door. If you can’t read the door, I can recommend someone who writes letters.',
        topics: [
          { ask: 'Why are the titles on the door-posts?', say: 'So a man can choose without coming in. The street is too narrow and the customers are too shy. They stand in the road and read, and if the title pleases them they come in. If it doesn’t, they go away reading something else. Either way my door is a good one.' },
          { ask: 'Who copies the books?', say: 'My boy there, and three more at the back. A good copyist makes a roll in a day. A bad one makes it in half a day and I can tell. They are slaves and educated ones, which is why they cost more than the books.' },
          { ask: 'What sells?', say: 'Short poems, short speeches, short anything. A man will buy a long book to own and a short book to read. The satires sell better than the histories, and a good dirty story sells better than both.' },
        ],
        news: 'What are people reading?',
      },
      period: 'The Argiletum and Vicus Sandalarium booksellers, titles on door-posts (Martial 1.117, 1.3; Horace Ep. 1.20) [A]; copying by educated slaves (librarii) [A]; the keeper [G]',
    },
    {
      id: 'keeper-argiletum-sutor',
      district: 'dist-subura',
      station: 'st-argiletum-sutor',
      member: 0,
      name: 'Lucius Sentius Calceus',
      title: 'Cobbler',
      barks: ['Shoes for every foot! Soles, straps, hobnails!', 'A good sole is a good day. A bad sole is the Subura.'],
      shop: {
        vendor: 'vestiarius',
        stock: stock(['soleae', 8], ['calcei', 4], ['carbatinae', 5], ['caligae', 3]),
      },
      talk: {
        greet: '(A man sits on the ground with a last between his knees, an awl in one hand and three nails between his teeth. He talks round them.) Mm. Hold on. There. Shoes?',
        topics: [
          { ask: 'What do you make?', say: 'Soleae for the street, carbatinae for the country, calcei for the toga, and caligae for the soldier. Four feet for four kinds of walking. I could tell your trade by your sole. Most people I could tell by the mud.' },
          { ask: 'Why work on the ground?', say: 'I have to sit somewhere. A man on a stool is a man whose back is gone by forty. A man on the ground has a long way to fall and a short way to the floor. The Vicus Sandalarius is not far, and every shoemaker there does the same.' },
          { ask: 'How long does a pair last?', say: 'A season of Subura mud, a month of Palatine marble, a year of idle sitting. The soldier’s boot lasts a campaign and then it is on a cobbler like me to put it right. They send them in sacks.' },
        ],
        news: 'What do the feet say?',
      },
      period: 'Shoemakers (sutores, sandalarii) of the Argiletum and the Vicus Sandalarius; soleae, calcei, carbatinae, caligae [A]; the keeper [G]',
    },
  ],
});
