/**
 * The people of the golden path (src/npc/content/corridor.ts): the beggar under the Capena arch,
 * the shrine attendants, the street traders under the Circus, the street school, the fans of the
 * Greens and the Blues, the augur on the slope. Short, specific, a little funny: each has one or
 * two things to ask about, a small deal or kindness (a honey cake for the Lares, figs, a sausage, a
 * lamp, a cup of water), and the news of the street.
 *
 * Node ids quests may care about: npc-capito 'sawIt' (a witness to the ambush, and a second
 * source of the "hooded fighter" clue).
 */
import { completed, origin, stage } from '../../content/talk';
import { person } from '../../content/people';
import type { DialogueContext } from '../types';

const MQ1 = 'mq-01-madida-capena';
const buy = (c: DialogueContext, price: number, item: string, count = 1) => {
  if (c.pay(price)) c.giveItem(item, count);
};

const capito = person({
  id: 'npc-capito',
  greet: (c) =>
    origin(c) === 'veteranus'
      ? '(An old man with a bald head and a faded sagum looks up from the pavement and straightens, slightly.) Ave, commilito. I can smell the camp on you. Twenty-two years in the Thirteenth. An as for a man who held the line at Tapae?'
      : origin(c) === 'dacus'
        ? '(An old man on the pavement looks at you for a long moment.) You’re one of theirs. I can tell. We fought your people at Tapae. You were good. Better than the Syrians. An as, for a man who was on the other side of the same hill?'
        : '(An old man on the pavement under the arch, a soldier’s cloak older than the Dacian wars over his knees, holds out a bowl.) An as for a man who held the line at Tapae! Eh? You weren’t there. I was.',
  again: ['Mind the drip, friend. The gate cries for every soldier it ever sent out.', 'Twenty-two years in the Thirteenth, and this is what the emperor’s gratitude buys: the best draught in Rome, dripping on my neck.', 'The Dacians? Good fighters. Better than the Syrians. Say what you like about the Thracians.'],
  topics: [
    { ask: '(Give him an as.)', say: '(He tucks the coin away with a speed that suggests practice.) The gods bless your purse. The gate sees, too.', if: (c) => c.denarii() >= 1 / 16, effects: (c) => { c.pay(1 / 16); c.changeDisposition(8); } },
    { ask: 'What happened at the gate this morning?', say: 'A man was cut down here, before dawn. I saw the three of them come down the Appian from the tombs with the cart. The hooded one did the knifing. He went off up the Circus road, up on his toes like a cat. Not a Roman walk. A fighter’s.', if: (c) => completed(c, MQ1) || stage(c, MQ1) === 'dying' || stage(c, MQ1) === 'city', effects: (c) => c.setFlag('clue-hooded-fighter', true), once: true },
    { ask: 'Tell me about Tapae.', say: 'Mud, rain and Dacians in the mud. The legion stood. When they say the army is made of iron, they mean the men who stand in the mud. Trajan was there. In front. You never forget a general who stands in front.', once: true },
    { ask: 'What do you know about the gate?', say: 'The Porta Capena? The old gate of the old wall, from the days when Rome could be kept out of. The aqueduct goes over it and the gate drips for ever. The Marcia, they call it. The water of Marcius. The gate drips and the poets sneer, but a soldier knows when he’s lucky: it’s a roof.' },
  ],
  news: 'Any news?',
});

const gaudens = person({
  id: 'npc-gaudens',
  greet: '(A thin man in a short tunic with a broom of twigs, working the paving in long strokes.) Sweep, sweep, sweep. They throw it down, I sweep it up. That is Rome. Mind the heaps. Careful: the left one moves.',
  topics: [
    { ask: 'Who throws all this down?', say: 'Everyone. From the fourth floor, from the fifth, from the roof. A pot at dawn, a bone at noon, a corpse on the Kalends. The Prefect of the City says the street is clean when it is clean. The street says otherwise.' },
    { ask: 'You work for the aediles?', say: 'I belong to the aediles, citizen. “Work for” is a free man’s phrase. My name means “joyful”. My master’s a humorist.', once: true },
  ],
  news: 'What have you heard on the street?',
});

const mancinus = person({
  id: 'npc-mancinus',
  greet: '(A man black to the elbows leans on a donkey laden with sacks.) Charcoal! Beech charcoal for the kitchen, oak for the forge. Every kitchen in Rome burns my charcoal and blames the smoke on me. Mancinus. The donkey’s name is Cicero. He talks a lot and carries nothing.',
  topics: [
    { ask: 'Why is the street so dark?', say: 'Because the lamps are out and the sun isn’t up. The Romans light the Forum for the rich. The poor have the fourth watch, and the stars. And my charcoal, if they can afford a fire.' },
    { ask: 'Is it dangerous to carry charcoal?', say: 'Only to the neighbours. A brazier forgotten on a stair has killed more Romans than the Dacians. The vigiles beat the landlords. The landlords beat their tenants. I just sell the charcoal.' },
  ],
  news: 'Heard anything?',
});

const epagathus = person({
  id: 'npc-epagathus',
  greet: '(A man in an ochre tunic and a clean apron stands among rows of little clay lamps.) Lamps! Clay lamps with a gladiator on the lid! Lamps with Venus on the lid, for the discreet! Epagathus. Light is cheap. Darkness costs you teeth.',
  topics: [
    { ask: 'Buy a lamp. (1 as.)', say: '(He wraps it in a rag and presses it into your hand.) One as for the lamp, and the wick’s free, because I’m not a thief. Oil you buy from the man with the skin on his donkey.', if: (c) => c.denarii() >= 1 / 16, effects: (c) => buy(c, 1 / 16, 'lucerna') },
    { ask: 'Do you sell many on the Lemuria?', say: 'On the Lemuria nights nobody buys a lamp. They all light every lamp they own. Funny, that. I’ve made more on the ghost nights than the Saturnalia.', once: true },
  ],
});

const cornix = person({
  id: 'npc-cornix',
  greet: '(A broad man crouches under a tilted cart with a wheel off its axle.) Hold the wheel, will you? No, the other wheel. No, THAT one. The aedile’s men will fine me for blocking the road. I will fine the wheel.',
  topics: [
    { ask: 'What are you carrying?', say: 'Marble for the Forum of Trajan! Marble that weighs more than the emperor’s conscience. They told me carts are for the night. They didn’t tell the wheel.' },
    { ask: 'Do you know a carter named Dromo?', say: 'Dromo! He’s afraid of his own mules. A fine man to have beside you in a fight, if the fight is in another city.', if: (c) => completed(c, MQ1), once: true },
  ],
  choices: [
    { text: 'Heave the wheel for him.', if: (c) => !c.memory.wheelDone, check: { skill: 'athletics', difficulty: 10, pass: 'lifted', fail: 'dropped' } },
  ],
  nodes: {
    lifted: { text: '(You get your shoulder under the axle and heave. The wheel slides home with a crunch.) By Hercules! A man with a back! (He presses two denarii into your hand.) Wine on me tonight, friend, at the Starting Gates.', effects: (c) => { c.receive(2); c.memory.wheelDone = true; }, next: 'hub' },
    dropped: { text: '(The wheel slides off the axle with a crash. Cornix closes his eyes and counts to ten in Greek.) …Thank you. You may stand over there and watch.', next: 'hub' },
  },
});

const trophimus = person({
  id: 'npc-trophimus',
  greet: '(A young freedman in a clean white tunic with a purple hem sweeps the steps of a little roadside altar.) Lares of the crossroads, keep this street and this lamp. Trophimus, attendant of the shrine. A pinch of incense costs an as. The Lares keep the receipts.',
  topics: [
    { ask: 'How do I pray here?', say: 'Stand at the altar and say what you mean. The Lares are the neighbourhood; they like neighbours. Press E at the shrine. Once a day each altar gives you its blessing, and you’ll walk lighter for it.', once: true },
    { ask: 'Whose shrine is this?', say: 'The crossroads. Every vicus has one: the Lares Compitales and the Genius of Caesar, and four magistrates who keep it clean and the lamp lit. I do the sweeping. The magistrates do the dinners.' },
  ],
  news: 'Anything on the street?',
});

const latinus = person({
  id: 'npc-latinus',
  greet: '(A man with a white-powdered face, one yellow sock and a patched tunic bows with a flourish.) Citizens, matrons, and whatever the Greeks are: a tragedy in one act, entitled My Purse. Latinus, mime. I do Jupiter and the cuckolded husband. The crowd likes the husband.',
  topics: [
    { ask: '(Throw him an as.)', say: '(He catches it in his teeth, bows, and does an impeccable impression of a jealous senator tripping over his own toga, and then of the emperor reading a letter.) Throw two and I’ll be Trajan. Throw three and I’ll be somebody you can criticise.', if: (c) => c.denarii() >= 1 / 16, effects: (c) => { c.pay(1 / 16); c.changeDisposition(8); } },
    { ask: 'Is it safe to do the emperor?', say: 'The divine Augustus banned the mimes who mocked living men. Trajan hasn’t, yet. So I do him fondly: a bluff soldier, a loving husband, a man who doesn’t know what to do with a Column. Everybody cheers.' },
  ],
});

const caunea = person({
  id: 'npc-caunea',
  greet: '(A stocky woman in a saffron tunic and an apron stands by a pyramid of dried figs.) Figs! Figs from Caunus! Eat them before the races, cry after! A fig for you, citizen, and one for your mother.',
  topics: [
    { ask: 'Buy figs. (2 as.)', say: '(She counts out a handful and wraps them in a leaf.) Good luck with the chariots. Greens or Blues? Both buy figs. I am for whoever pays.', if: (c) => c.denarii() >= 0.125, effects: (c) => buy(c, 0.125, 'ficus', 2) },
    { ask: 'Why “Caunean figs”?', say: 'It’s a joke from the old days. A man at Brundisium heard a seller cry “Cauneas!” and thought it meant “cave ne eas”: “don’t go.” He didn’t sail, and the ship sank. Now every fig seller cries it, and nobody sails without a fig. You see how a trade is built.', once: true },
  ],
  news: 'What do the racing fans say?',
});

const niger = person({
  id: 'npc-niger',
  greet: '(A big bald man in a stained apron turns sausages on a charcoal pan.) Hot sausages! Lucanian, spiced, and nobody asks what’s in them! Sextus Niger. Pork, pepper and a secret. The secret is more pork.',
  topics: [
    { ask: 'Buy a sausage. (2 as.)', say: '(He wraps it in a leaf, still hissing.) A dog stole one of these yesterday. He came back for another. That’s a recommendation.', if: (c) => c.denarii() >= 0.125, effects: (c) => buy(c, 0.125, 'botulus') },
    { ask: 'What do you hear at the Circus?', say: 'Chariots at noon, sausages at dawn. A man should be fed before he loses his money. They say Hierax and Aquilo have a score to settle. They always say that.' },
  ],
});

const factionFans = person({
  id: 'npc-factio-fans',
  npcs: ['npc-lucrio', 'npc-sabellus'],
  greet: (c) =>
    c.npcId === 'npc-lucrio'
      ? '(A young man in a green tunic with a lump of chalk and a smear of it on his nose.) Green wins! Green wins! Green wins, and the Blues can’t spell! Chalk’s cheaper than paint and it lasts exactly as long as the vigiles’ patience.'
      : '(A man in a blue tunic scrubs at a chalked wall with a wet rag.) Blue wins! Blue always wins, if you wait long enough and the Greens fall off. Look at that wall. A child could have chalked it better. A Green child.',
  again: (['Green wins! Blue wins! It’s all the same chalk.', 'Hierax! Aquilo! Two men in a wooden box who can’t stand each other. That is the Roman people’s faith.', 'Mind the paint.']),
  topics: [
    {
      ask: 'I back the Greens.',
      say: (c) => (c.npcId === 'npc-lucrio' ? 'Praise the gods! A man of taste! Come to the races, I’ll sit you with the right people.' : '(He wrings out the rag very slowly.) A Green. Of course you are. I’ll pray for you.'),
      effects: (c) => c.setFlag('circus-leaning', 'prasina'),
    },
    {
      ask: 'I back the Blues.',
      say: (c) => (c.npcId === 'npc-sabellus' ? 'Praise the gods! A man of taste! Come to the races, I’ll sit you with the right people.' : '(He spits chalk.) A Blue. Of course you are. The Blues like those who lose.'),
      effects: (c) => c.setFlag('circus-leaning', 'veneta'),
    },
    { ask: 'I just like the horses.', say: 'The horses! Of course. Nobody hates the horses. It’s the men on top I can’t stand.' },
  ],
});

const chaerea = person({
  id: 'npc-chaerea',
  greet: '(A thin Greek with a cane stands in a doorway before three boys on a bench.) Again! “Arma virumque cano…” Louder! The coppersmiths can hear you, so can I! Chaerea, litterator. A boy who can’t parse Virgil can’t read a contract, and a man who can’t read a contract signs it.',
  topics: [
    { ask: 'How much do you charge?', say: 'Eight asses a month per boy, and a gift at the Saturnalia. Nobody pays the gift. I have a long memory.' },
    { ask: 'What are they learning?', say: 'To read, to write, to count on their fingers like Romans, and to know that Aeneas escaped from Troy and Romulus killed his brother. Rome’s whole history in two lessons. The rest is arithmetic.' },
  ],
});

const sabinus = person({
  id: 'npc-sabinus',
  greet: '(A strong man with two big jars on a yoke sets them down and wipes his forehead.) Water! Water up the stairs, an as a jar! The fifth floor gets the fresh! Sabinus. Seven flights, ten jars, and nobody tips. That’s why I’m a philosopher.',
  topics: [
    { ask: 'A drink, please.', say: '(He fills a dipper from the jar and hands it over.) The Aqua Marcia is the best water in Rome. Also the dearest. Drink slowly. It’s cold.', effects: (c) => c.giveItem('aqua') },
    { ask: 'Do you carry water to the Palatine?', say: 'They have lead pipes. They don’t need me. I serve the top floors of the insulae, where the pipes don’t go. Rome is built in layers, citizen: the rich get the pipes and the poor get the stairs.' },
  ],
});

const dorcas = person({
  id: 'npc-dorcas',
  greet: '(A stout woman in a brown tunic holds a stick and a cup beside a small brown goat.) Milk! Milk straight from the goat, no questions, no water, no chalk! Dorcas. Hold the cup, citizen. Don’t hold the goat. She bites.',
  topics: [
    { ask: 'What is the goat called?', say: 'The little one is Pontifex. He eats everything, including sacred things. That one is Livia. She’s better behaved than her namesake, and also more productive.' },
    { ask: 'Who buys goat’s milk?', say: 'The sick, the old, and mothers whose own milk has failed. And at dawn, the baths’ masseurs: warm milk and a bit of honey, for the muscles. I’m a doctor of sorts.' },
  ],
});

const postumius = person({
  id: 'npc-postumius',
  greet: '(An old man in a purple-bordered toga, a curved staff in his hand, stands motionless with his face turned to the sky. A slave waits behind him, bored.) Silence, citizens: the augur is watching the birds.',
  again: ['Three eagles on the left, one crow on the right. The gods are divided. So is the Senate.', 'I have been taking the auspices for thirty years and the birds have never once been wrong. Only the interpreters.', 'Hush. A raven. That is either excellent news or the worst news.'],
  topics: [
    { ask: 'What are the birds saying?', say: 'They say that a day of sacrifice and feasts is coming, that the war with Parthia is not without cost, and that a man who asks the augur must stand still and be quiet. That is the hardest of the three.' },
    { ask: 'Why do you watch from here?', say: 'The Palatine has watched the sky since Romulus. From this slope you can see Aventine and Palatine both; the old story says Remus saw six vultures from the one and Romulus twelve from the other. I wonder which birds Rome has seen since.', once: true },
  ],
});

const aufidia = person({
  id: 'npc-aufidia',
  greet: '(A woman in a rust-red stola and a white palla places a honey cake on the little altar while a small boy tries to eat it.) Lares of the crossroads, keep my husband’s feet from wine and his purse from dice. Come here, Gaius. Don’t touch the shrine. The god is not a toy.',
  topics: [
    { ask: 'Do the Lares really protect the street?', say: 'They protect the people who feed them. A honey cake, a pinch of incense, the lamp lit at dusk. Pay the Lares, and they keep the knife-men to the next street. That has been my mother’s rule and her mother’s.' },
    { ask: 'May I have a honey cake for the shrine?', say: '(She breaks a small cake in two and gives you one half.) For the Lares. Don’t eat it. Put it on the altar and say what you came for. The gods hear a traveller as well as a neighbour.', if: (c) => !c.flag('aufidia-cake'), effects: (c) => { c.giveItem('libum'); c.setFlag('aufidia-cake', true); }, once: true },
  ],
  news: 'Any news from the neighbourhood?',
});

const hilarus = person({
  id: 'npc-hilarus',
  greet: '(A slight man on a short ladder reaches up with a snuffer to a bracket lamp.) Lamps out! The sun’s up, and it burns for free! Hilarus, lamp-tender of the Vicus Tuscus: a slave of the street, and the only man in Rome who is kept to put things out.',
  topics: [
    { ask: 'Do you tend the shrine lamps too?', say: 'Every crossroads lamp on the street, from the vicomagister’s shrine to the statue of Vortumnus. He pays for the oil and I carry the ladder. Zethus is fussy, but a lamp that goes out at a crossroads is a bad omen, so I don’t complain.' },
    { ask: 'Anything strange on the street at night?', say: 'The burned taberna, down toward the Velabrum. There’s a light in there some nights where there shouldn’t be, and nobody sells lamp oil down that end. I trim what I’m paid to trim and I keep my head down.', effects: (c) => c.setFlag('hideout-known', true), once: true },
  ],
  news: 'What have you heard on the street?',
});

const licinia = person({
  id: 'npc-licinia',
  greet: '(A woman in a rose-coloured tunic sits among baskets of flowers and woven rings of myrtle.) Garlands! Rose and violet for the god of the street, myrtle for the lovers! Licinia. A garland for tomorrow? The whole Forum will be hung with them.',
  topics: [
    { ask: 'Why do the garlands matter tomorrow?', say: 'The Column! The emperor dedicates it tomorrow, and Venus Genetrix gets her temple back, and everybody wants to be seen with a wreath. I’ve been up since the fourth watch. My fingers are myrtle.' },
    { ask: 'Who is Vortumnus?', say: 'The god of change. Of the seasons, of money, of a man’s mind. He turns himself into anything he likes. The statue at the end of the street is bronze, with fruit in his hand, and not one of us has ever seen him do it.' },
  ],
  news: 'Any news from the Forum?',
});

export default [hilarus, licinia, capito, gaudens, mancinus, epagathus, cornix, trophimus, latinus, caunea, niger, factionFans, chaerea, sabinus, dorcas, postumius, aufidia];
