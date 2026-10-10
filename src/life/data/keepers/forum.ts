/**
 * The Forum and the Via Sacra (SHOPS, §4.2 #7-9): the letter-writer by the courts, the spice and
 * drug dealer, the pearl-dealer. The spice dealer trades and makes small talk only (Appendix A.4):
 * nothing he says touches the Pepper Warehouses, which are a main-quest lead.
 */
import { AS } from '../../../rpg/money';
import { defineLife } from '../../types';
import { stock } from './_shops';

export default defineLife({
  keepers: [
    {
      id: 'keeper-forum-scriba',
      district: 'dist-forum-romanum',
      station: 'st-forum-scriba',
      member: 0,
      name: 'Zosimus',
      title: 'Letter-writer',
      barks: ['Letters written, contracts drawn, petitions polished! A fair hand, a fair price!', 'Can’t write? Can’t read? Neither could the last man who sat on that stool, and he was a magistrate.'],
      shop: {
        vendor: 'librarius',
        stock: stock(['tabula-cerata', 8], ['stilus', 8], ['cera-signatoria', 6]),
      },
      talk: {
        greet: '(A thin Greek with ink to the wrist and a stool that has taken his shape.) Good morning. Do you want something written, something read, or something erased so it can be written better?',
        topics: [
          { ask: 'Who do you write for?', say: 'Everyone who does not write for himself. Soldiers to their mothers. Mothers to their sons in the army. Freedmen to their former masters, and former masters to their freedmen, both of them lying. I put it in good Latin. They add the lies themselves.' },
          { ask: 'What does a letter cost?', say: 'Four asses for a short one, and I do not count the words. If it takes more than a page I count the words. If it is a love letter I count twice. Love goes on longer than anyone expects.' },
          { ask: 'Do you ever read what you write?', say: 'Always, and I forget it all by supper. That is the first rule of the trade. A scribe who remembers what he has written is a scribe who ends up in front of a magistrate.' },
        ],
        news: 'What is the court saying?',
      },
      services: [
        {
          id: 'letter',
          text: 'Write a letter for me',
          price: 4 * AS,
          effects: [{ kind: 'give', item: 'epistula-signata' }],
          result: ['(He trims a reed, wets it, and writes without looking up. Then he folds the sheet, ties the thread and presses a blob of wax with his thumb.) There. Sealed, as asked. Whatever it says, I never saw it.', '(A short, quick hand. He ties it, seals it, and slides it across.) Say who it is for, and it is for them.'],
        },
      ],
      period: 'Letter-writers and scribes in the Forum and by the courts of the Basilica Julia (Horace Sat. 1.6.73-75; the librarii and scribae) [A]; the keeper [G]',
    },
    {
      id: 'keeper-sacra-piperarius',
      district: 'dist-forum-romanum',
      station: 'st-sacra-piperatarii',
      member: 0,
      name: 'Hanno the Spice-dealer',
      title: 'Spice and drug dealer',
      barks: ['Spices! Frankincense, myrrh, pepper by the pinch! A little goes a long way!', 'Poppy for the sleepless, myrrh for the dead. All sold by weight, all sold by me.'],
      shop: {
        vendor: 'seplasiarius',
        stock: stock(['piper', 6], ['piper-album', 3], ['piper-longum', 2], ['tus', 8], ['myrrha', 4], ['papaver', 5], ['mandragora', 2]),
      },
      talk: {
        greet: '(The smell reaches you before he does: cinnamon-bark, resin, something sharper underneath.) A pinch or a pound? I sell by weight, friend, and I weigh honestly. It is the only reason I am still alive.',
        topics: [
          { ask: 'What sells best?', say: 'Frankincense, by a mile. Every household burns it, every temple burns it, every funeral burns twice as much. People die on the Via Sacra so regularly that I have a standing order. Pepper is next, for those with money to burn on flavour.' },
          { ask: 'Poppy and mandrake. Is it safe?', say: 'A little eases pain and brings sleep. A lot brings a longer sleep. I sell what is asked for and I tell the buyer how much. After that it is between him and his physician. Or his heir.' },
          { ask: 'Where does it all come from?', say: 'The east, by ship and caravan. Incense from the Arab coast, pepper from the far side of the Red Sea. A pinch has been on the road longer than I have been alive. Treat it kindly.' },
        ],
        news: 'Any word from the Via Sacra?',
      },
      period: 'The seplasiarii and pigmentarii: Seplasia at Capua, the Via Sacra spice and perfume trade (Pliny NH 12-13); Red Sea trade, the Periplus of the Erythraean Sea [A]; the keeper [G]',
    },
    {
      id: 'keeper-sacra-margaritarius',
      district: 'dist-forum-romanum',
      station: 'st-sacra-margaritarii',
      member: 0,
      name: 'Publius Servilius Unio',
      title: 'Pearl-dealer',
      barks: ['Pearls! Red Sea, Persian Gulf, fit for a matron’s ear!', 'The Porticus Margaritaria: come in, look, and sigh.'],
      shop: {
        vendor: 'margaritarius',
        stock: stock(['margarita', 5], ['gemma', 3], ['lunula', 3], ['armilla-dacica', 1]),
      },
      talk: {
        greet: '(A man in a good tunic, with a cloth of black velvet laid on the table before him and nothing on it but a single pearl.) Come in. Do not touch. Look. Then, if you are the sort of person who buys, we will talk.',
        topics: [
          { ask: 'Why do pearls cost so much?', say: 'Because a man dives for them, and because a woman will pay ten times what they are worth to show her friends. The diver risks his life for a pearl. The woman risks her husband’s patience. Between them I make a living.' },
          { ask: 'Which are real?', say: 'All of mine. All of the other man’s are glass. Ask any Roman matron and she will say her pearls are real; ask her sister and she will say otherwise. I have been fooled myself, once, and the shame of it is why I check twice.' },
          { ask: 'Who wears them?', say: 'The wives of senators, the daughters of knights, and a surprising number of freedwomen with ambitions. Whole fortunes hang from one ear. The law says what a man may wear on his finger. It says nothing about his wife’s ears, and the wives know it.' },
        ],
        news: 'Who has been buying?',
      },
      period: 'The Porticus Margaritaria on the Via Sacra, the pearl-dealers (margaritarii); pearls as the great luxury of the Roman matron (Pliny NH 9.105-122) [A]; the keeper [G]',
    },
  ],
});
