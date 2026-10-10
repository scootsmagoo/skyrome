/**
 * The Subura (SHOPS, §4.2 #10-15): the popina, the bread at the bakery door, the wine shop, the
 * smith, the street barber and the fuller. Most are on the Argiletum, the Clivus Suburanus and the
 * Vicus Patricius. The old "thermopolium" label is the popina of AD 113 (Appendix A.2).
 */
import { AS } from '../../../rpg/money';
import { defineLife } from '../../types';
import { condition, stock } from './_shops';

export default defineLife({
  keepers: [
    {
      id: 'keeper-subura-popina',
      district: 'dist-subura',
      station: 'st-subura-thermopolium',
      member: 0,
      name: 'Aulus Vettienus Dolium',
      title: 'Popina keeper',
      barks: ['Hot beans, hot wine, a dry seat! The Subura eats here!', 'Calda! Wine with hot water, two asses, the only warmth in the Subura you can trust!'],
      shop: {
        vendor: 'popina',
        stock: stock(['puls', 14], ['cicer', 12], ['lupini', 12], ['botulus', 10], ['panis', 12], ['vinum', 16], ['posca', 10]),
      },
      talk: {
        greet: '(A man with a belly like a wine-jar leans on a counter set with sunk pots. Steam rises from three of them.) In, in, shut the door on the night. Dolium’s popina: whatever is in the pot, it is hot.',
        topics: [
          { ask: 'Why Dolium?', say: 'The big jar in the counter. I was born next to one, I have worked beside one all my life, and I’m built like one. The name was given me by a customer who has never paid his bill. I forgive him. It is a good name.' },
          { ask: 'Who eats here?', say: 'Fullers on their way home, porters who have already eaten, women whose husbands have eaten elsewhere. By night: boatmen, dice-throwers, a vigil or two who pretend they came for a wash. Half the Subura has no kitchen of its own. I am the kitchen.' },
          { ask: 'Any trouble?', say: 'There is always trouble, but it usually has the courtesy to leave before I have to ask. A man who can’t hold his wine goes out in a cart. A man who can’t pay goes out without one. And the vigiles come for their wine and call it an inspection.' },
        ],
        news: 'What is being said over the counter?',
      },
      services: [
        {
          id: 'calda',
          text: 'A hot cup',
          price: 2 * AS,
          effects: [{ kind: 'restore', target: 'stamina', amount: 10 }, ...condition('calefactus')],
          result: ['(Wine and hot water, a pinch of something from the shelf.) Calda. Hold it with both hands. The cup is cheap and the heat is not.', 'There. That will keep the cold out until the next watch.'],
        },
      ],
      period: 'Popinae of Pompeii and Ostia, with sunk dolia and counters (the Thermopolium of Asellina, Regio IX) [A]; “popina” is the word of AD 113 [A]; the keeper [G]',
    },
    {
      id: 'keeper-subura-pistor',
      district: 'dist-subura',
      station: 'st-subura-pistrinum',
      member: 1,
      name: 'Gnaeus Popidius Panicus',
      title: 'Bread-seller',
      barks: ['Bread! Fresh from the oven, the first in the Subura!', 'Come early or come hungry. The loaves are gone by sunrise!'],
      shop: {
        vendor: 'pistor',
        stock: stock(['panis', 24], ['libum', 6]),
      },
      talk: {
        greet: '(Flour to the elbow, and a broad face red from the oven.) You’re early, or I’m late. Either way the bread is warm. Take it before the Subura’s other mouths arrive.',
        topics: [
          { ask: 'Why so early?', say: 'The dough has to rise, the oven has to heat, and the bread has to be sold before the schoolmaster’s boys come by on their way to be shouted at. A baker who sleeps past the fourth watch is a baker who sells stale loaves.' },
          { ask: 'Who turns the mill?', say: 'The donkey, mostly, and I am not sure he does it by choice. Round and round, blindfolded, so he cannot be giddy. I feed him well and speak kindly. It’s more than the owner of the next mill does for his men.' },
          { ask: 'What is a libum?', say: 'A little cake of cheese and flour and an egg, baked on bay leaves. Old Cato wrote the recipe down, to be offered to the household gods. I sell it to the Subura instead, and the gods have never complained.' },
        ],
        news: 'What do the early customers talk about?',
      },
      period: 'Pistrinum with a donkey mill and oven (Pompeii, Region VII, the bakery of Modestus) [A]; the bakers up before dawn (Martial 12.57) [A]; Cato Agr. 75, libum [A]; the keeper [G]',
    },
    {
      id: 'keeper-subura-vinarius',
      district: 'dist-subura',
      station: 'st-subura-vinarius',
      member: 0,
      name: 'Sextus Pompeius Hedone',
      title: 'Wine-seller',
      barks: ['An as for the house wine, two for the better!', 'Taste before you buy. Then buy.'],
      shop: {
        vendor: 'vinarius',
        stock: stock(['vinum', 14], ['vinum-melius', 8], ['vinum-falernum', 2], ['mulsum', 5], ['acetum', 4]),
      },
      talk: {
        greet: '(A thin man with wine-dark hands and a ladle tied to his belt.) Salve! Hedone’s, the best cellar on the Vicus Longus. An as for the house, two for the better, four if you want to remember Campania.',
        topics: [
          { ask: 'Where does the wine come from?', say: 'The house wine? The hills behind Tibur, in a cart, at night. The better one comes up the river from Ostia in amphorae with a Spanish stamp. The Falernian comes with a story. I tell it for free.' },
          { ask: 'Busy street.', say: 'The Subura never sleeps, and when it does it snores. By day the carts may not come in, so the porters carry everything, and by night the carts come in and nobody sleeps. Good for wine.' },
          { ask: 'Why Hedone?', say: 'It is Greek for pleasure, and it was not my choice. My master gave it to me and my freedom followed. I kept the name. Nobody forgets a wine-seller called Pleasure, and a man called Pleasure pours a kinder cup than one called Sorrow.' },
        ],
        news: 'What’s the word in the Subura?',
      },
      period: 'Wine-shop price lists: Hedone’s, CIL IV 1679 [A, Pompeii]; the carts-by-night rule of the Tabula Heracleensis [A]; the keeper [G]',
    },
    {
      id: 'keeper-subura-faber',
      district: 'dist-subura',
      station: 'st-subura-faber-ferrarius',
      member: 0,
      name: 'Marcus Licinius Malleolus',
      title: 'Smith',
      barks: ['Nails, blades, tools, mended while you wait!', 'If it’s iron and it’s broken, bring it. If it’s bronze, bring it to the other man.'],
      shop: {
        vendor: 'faber-ferrarius',
        stock: stock(['clavus', 30], ['ferrum', 8], ['pugio', 3], ['fustis', 4], ['instrumentum-fabri', 2]),
      },
      talk: {
        greet: '(He does not look up from the anvil until the blow is done.) A moment. Iron doesn’t wait for conversation. There. Now. What’s broken?',
        topics: [
          { ask: 'What do you make?', say: 'Nails, mostly. A city this size goes through nails like a priest through incense. Hinges, hooks, hobnails for the soldiers’ boots, and the odd blade when I’m asked politely. Blades are what get talked about. Nails are what pay.' },
          { ask: 'Is the work hard?', say: 'It’s hot and it’s loud, and I’ll be deaf by fifty. My father was deaf by forty. But there will always be iron and there will always be something that needs to be hit. A man could do worse.' },
          { ask: 'Where does the iron come from?', say: 'Spain, Noricum, Elba, in bars that come up the river. I buy what the dealer says is good and then I find out. The Noric is best. The rest is what it is.' },
        ],
        news: 'What do the soldiers say when they come in?',
      },
      services: [
        {
          id: 'repair',
          text: 'Mend my arms',
          effects: [{ kind: 'repair' }],
          result: ['(He takes the weapon, runs a thumb along it, and grunts.) A job for a morning. Wait.', '(A few blows, a quench, a whetstone.) There. Better than it was.'],
        },
      ],
      period: 'Roman smiths: iron from Noricum, Spain and Elba, the fabri ferrarii (Pliny NH 34) [A]; the forge on the Clivus Suburanus, the smith’s trade in Rome [P]; the keeper [G]',
    },
    {
      id: 'keeper-subura-tonsor',
      district: 'dist-subura',
      station: 'st-subura-tonsor',
      member: 1,
      name: 'Eutychus',
      title: 'Barber',
      barks: ['Shaves, trims, a quick hair! Come under the razor!', 'A barber knows everything. A good barber says nothing.'],
      talk: {
        greet: '(A cheerful, round-faced man wipes a razor on his thumb and looks at your hair the way a farmer looks at a field.) Come, sit. You look like a man who has met a stiff wind. Or a bad barber.',
        topics: [
          { ask: 'Is it safe, a razor in the street?', say: 'It has been done since before my grandfather’s time. We scrape, we trim, we pull out an annoying hair or two, and the street watches and offers advice. Some of it is even sound. I wouldn’t take any of it.' },
          { ask: 'How do you keep the razor so sharp?', say: 'A good strop and a good hand. A bad barber nicks the ear and sells a bandage. A good one doesn’t, and sells you the shave again next week. It’s better business.' },
          { ask: 'Do you hear much?', say: 'Barbers, bath-attendants and tavern-keepers are the ears of the city. Only the first of us cut your hair while we listen. I try to keep a straight face. It helps with the razor too.' },
        ],
        news: 'Anything new from the stool?',
      },
      services: [
        {
          id: 'haircut',
          text: 'A haircut',
          price: 2 * AS,
          daily: true,
          effects: [...condition('tonsus'), { kind: 'rumour' }],
          result: ['(Comb, shears, a quick snip, and a cloth round your neck.) There. A man of consequence. Hold still, and listen: I heard this just before you came.', '(The shears click twice around your ears.) Now you look as if you pay your debts. And here’s a thing I heard:'],
        },
        {
          id: 'shave',
          text: 'A shave',
          price: AS,
          daily: true,
          effects: [...condition('tonsus'), { kind: 'rumour' }],
          result: ['(Hot water, a razor, a firm hand.) Done. A smooth face is the best suit a man can wear. And speaking of faces, I heard this:', '(He scrapes slowly, once, twice, and wipes the blade on a rag.) Handsome. Word on the stool this morning:'],
        },
      ],
      period: 'Street barbers (tonsores) cutting hair in public (Martial 7.61: Domitian had cleared the stalls, and the barbers came back; Plautus Aul. 1.2) [A]; the keeper [G]',
    },
    {
      id: 'keeper-subura-fullo',
      district: 'dist-subura',
      station: 'st-subura-fullonica',
      member: 1,
      name: 'Lucius Stephanus Calcator',
      title: 'Fuller',
      barks: ['Cloaks cleaned, togas whitened! Leave it with me!', 'Urine, fuller’s earth and a sound pair of legs: that is the whole secret.'],
      shop: {
        vendor: 'fullo',
        stock: stock(['tunica', 6], ['tunica-crassa', 4], ['linteum', 8]),
      },
      talk: {
        greet: '(A sturdy man with his tunic hitched up and his calves a strange, scoured pink.) Don’t mind the smell. It’s what pays. Nothing in Rome is as white as a fuller’s toga, or as honest as his invoice.',
        topics: [
          { ask: 'What is that smell?', say: 'Urine. Collected in jars at every corner, and a good thing too: the whole city leaves it for us. It cleans wool better than any other thing under the sun. I don’t mind the smell, I mind the pay. The pay is poor, and the smell is free.' },
          { ask: 'Why all the treading?', say: 'You stand in the vat and you stamp. It takes the grease out and the stiffness in. Then the fuller’s earth, then the rinse, then the carding, then the sulphur frame for the white. Every toga you see has been through here at least once.' },
          { ask: 'Do you do togas?', say: 'Every toga in the Subura, and the fine ones from the Palatine too, when the owner’s steward sneaks them down in a basket. I won’t say whose. A fuller who tells is a fuller without work.' },
        ],
        news: 'What do you hear from the vats?',
      },
      services: [
        {
          id: 'laundry',
          text: 'Wash my clothes',
          price: 3 * AS,
          effects: [{ kind: 'clean', to: 'normal' }],
          result: ['(He takes your things at arm’s length, and hands you a borrowed cloth.) Back in an hour. Hang about, or don’t.', '(The vat, the tread, the earth, the sun.) There. Clean as a priest’s conscience.'],
        },
      ],
      period: 'Fullonicae: treading cloth in vats with urine and fuller’s earth, sulphur-whitening on frames (Pompeii, the Fullery of Stephanus, Region I; Pliny NH 35.196-8) [A]; the keeper [G]',
    },
  ],
});
