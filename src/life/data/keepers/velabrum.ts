/**
 * The Velabrum and the Vicus Tuscus (SHOPS, §4.2 #4-6): the smoked-cheese stall, the silk-seller
 * and the oil-seller. Golden-path shops: the player walks the Vicus Tuscus on the way to the Forum.
 */
import { defineLife } from '../../types';
import { stock } from './_shops';

export default defineLife({
  keepers: [
    {
      id: 'keeper-velabrum-casearius',
      district: 'dist-velabrum-boarium',
      station: 'st-velabrum-caseus',
      member: 0,
      name: 'Lucius Volusius Fumus',
      title: 'Cheese-seller',
      barks: ['Smoked cheese of the Velabrum! Smoked over a beech fire, not a dung fire!', 'Honey, figs, olives! The Velabrum feeds the city and the city forgets to say thank you.'],
      shop: {
        vendor: 'macellarius',
        stock: stock(['caseus', 10], ['olivae', 8], ['ficus', 8], ['mel', 4]),
      },
      talk: {
        greet: '(A man who smells pleasantly of woodsmoke, with a knife in one hand and a rind in the other.) Taste first. The Velabrum smokes its cheese in the old way. You will not get that anywhere else this side of Gaul.',
        topics: [
          { ask: 'Why smoked?', say: 'It keeps. A cheese that keeps is a cheese you can sell in August, and in August this city smells like a drain with ambitions. Smoke makes the rind hard and the inside sweet. A poet once wrote a line about it. I forget the line. I remember the sale.' },
          { ask: 'Where does the cheese come from?', say: 'Sheep and cows from the hills above the city, and I won’t say which hill. A man has to have some secrets. The honey is from the Sabine country, the figs from wherever the fig-man is lying this week.' },
          { ask: 'The Velabrum.', say: 'It used to be a marsh, they say, the river came right up here. Now it is the best street in the city for food. You can buy anything here that grows, and a few things that only look like it.' },
        ],
        news: 'What is the Velabrum saying?',
      },
      period: 'Martial 11.52 and 13.32 (Velabrum smoked cheese); the Velabrum as the city’s food-quarter [A]; the keeper [G]',
    },
    {
      id: 'keeper-tuscus-vestiarius',
      district: 'dist-velabrum-boarium',
      station: 'st-tuscus-vestarius',
      member: 0,
      name: 'Quintus Plotius Sericus',
      title: 'Silk-seller',
      barks: ['Fine cloth from the east, from Cos, from Tyre! Touch it, but wash first!', 'The Vicus Tuscus has dressed the city for three hundred years.'],
      shop: {
        vendor: 'vestiarius',
        stock: stock(['tunica-linea', 3], ['palla-fina', 2], ['stola-fina', 2], ['pallium', 3], ['tunica', 4]),
      },
      talk: {
        greet: '(A slim man in a spotless tunic, who looks at your hands before he looks at your face.) Welcome to the Vicus Tuscus. Please do not lean on the silk. It has been to Cos and back and it is nervous.',
        topics: [
          { ask: 'Silk. Is it really spun by worms?', say: 'By caterpillars, if you will. The cloth comes from the far east, from a people the sailors call the Seres. It passes through a dozen hands before it reaches mine, and each hand takes its cut. Ask me what I pay and I will tell you it is a shame.' },
          { ask: 'Who buys fine cloth?', say: 'Matrons, freedwomen who have done well, and men who want the matrons to think so. The senators send their stewards and the stewards steal a little. I have learnt to price for the stewards.' },
          { ask: 'What should I wear to a patron’s door?', say: 'A clean toga, if you have the right to it. Failing that, the whitest tunic you can afford and a manner that suggests the toga is at the fuller’s. Clients are judged by their linen long before they open their mouths.' },
        ],
        news: 'What is the talk on the Vicus Tuscus?',
      },
      period: 'The vicus Tuscus as the cloth and luxury street (Horace Sat. 2.3.228; Plautus Curc. 482) [A]; Coan and eastern silk in Rome [A]; the keeper [G]',
    },
    {
      id: 'keeper-tuscus-olearius',
      district: 'dist-velabrum-boarium',
      station: 'st-tuscus-velabrum',
      member: 0,
      name: 'Aulus Caecilius Oleaster',
      title: 'Oil-seller',
      barks: ['Oil from Baetica! Green, new, the best this side of the sea!', 'Oil for the lamp, oil for the salad, oil for the bath. Oil for the gods, if they ask nicely.'],
      shop: {
        vendor: 'macellarius',
        stock: stock(['oleum', 8], ['olivae', 8], ['acetum', 5]),
      },
      talk: {
        greet: '(Amphorae stand in rows behind him, their stamped handles turned outward like a row of signatures.) Oil! Baetican, pressed green. Read the stamp if you do not trust me. You will not trust me, so read the stamp.',
        topics: [
          { ask: 'What are the stamps?', say: 'The estate, the shipper, the weight and the consul’s year. You can follow an amphora from the tree to the table if you can read a handle. Every one that comes up the river from Ostia has been counted six times by six officials. Then I count it again.' },
          { ask: 'Baetican oil?', say: 'From Spain, up the Baetis. They send so much that the amphorae pile up on the bank of the Tiber and have built a hill of their own. Nobody throws the sherds away. They stack them. It is a monument to oil.' },
          { ask: 'How much does a lamp burn?', say: 'A small lamp, a night’s evening, an as’ worth, no more. If your landlord tells you otherwise he is selling you the lamp. Do not buy the lamp from the landlord.' },
        ],
        news: 'What has the river brought?',
      },
      period: 'Baetican oil in stamped amphorae (Dressel 20) and the Monte Testaccio dump, begun in the early empire [A]; the Vicus Tuscus and the Velabrum as the oil and wine market [P]; the keeper [G]',
    },
  ],
});
