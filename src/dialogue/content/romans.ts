/**
 * The colourful Romans of the v0.1 core (docs/CONTENT.md §2.B and §2.E): Juvenal (a Rhetoric check
 * to make him say one good thing about Rome), Apollodorus at the Forum of Trajan, the Vestalis
 * Maxima, the senator Vettius (a check for a patron, the seed of the Clientela line), the dice
 * idler, the pearl-seller and his climbing son, the cattle dealer and the Tiber diver, and the
 * night vigil Primigenius. Trajan himself has no dialogue (§2.B: he is only ever overheard).
 */
import { person } from '../../content/people';
import { completed, female, hourNow, origin, rotate, running } from '../../content/talk';
import { defineDialogue } from '../types';

/** Juvenal's manner, paraphrased from Satire 3 (docs/research/society.md §7.7); he is drafting, never quoting. */
const JUVENAL = [
  'Fires, falling roofs, a thousand dangers in this savage city, and poets reciting in August.',
  'What can I do in Rome? I cannot lie. I cannot praise a bad book and beg for a copy.',
  'Here everything costs money. Even a nod from a great man’s door-slave costs a tip.',
  'Most invalids here die of sleeplessness. Who can sleep in a rented room, with the carts all night and the drovers cursing?',
  'Your rent for a year in this dark hole would buy a house at Sora, with a garden.',
  'Make your will before you go out to dinner. Every open window at night is a death waiting for you.',
];

const juvenal = defineDialogue({
  id: 'npc-iuvenalis',
  npcs: ['npc-iuvenalis'],
  priority: 60,
  start: () => 'hub',
  nodes: {
    hub: {
      text: (c) =>
        !c.memory.met
          ? (hourNow(c) < 8 ? '(A thin man with a sour mouth, a split toe in his shoe and a wax tablet he is scribbling on.) I was a client at dawn, a pedestrian at noon and a target at night. It is a full day. What do you want?' : '(A thin man with a sour mouth looks up from the steps.) Another one. Everybody in this city wants something. What do you want?')
          : rotate(c, '_hub', ['In Rome even the smoke from your neighbour’s kitchen costs you a tip.', 'They’ve built a column a hundred feet high so the rich can look down on us from even further away.', 'If you want honesty, try the gladiators. At least they admit they’ll kill you.', 'Another Greek. Another Syrian. Another cook who calls himself a philosopher.']),
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'What’s wrong with Rome?', goto: 'complaint' },
        { text: 'Rome is the greatest city on earth. Say one good thing about it.', check: { skill: 'rhetoric', difficulty: 40, pass: 'good', fail: 'bad' }, once: true },
        { text: 'Are you a poet?', goto: 'poet', once: true },
        { text: 'Any gossip?', goto: 'gossip' },
        { text: 'Vale.', end: true },
      ],
    },
    complaint: {
      text: (c) => rotate(c, 'complaint', JUVENAL),
      choices: [
        { text: 'Go on.', goto: 'complaint' },
        { text: 'Enough.', goto: 'hub' },
      ],
    },
    good: {
      text: '(He thinks for a long time.) …The figs. The figs are good. (He pushes a scrap of used papyrus at you.) Take this before I burn it. If you can find anything good in it, you’re a better poet than I am.',
      effects: (c) => {
        if (!c.hasItem('schedae-iuvenalis')) c.giveItem('schedae-iuvenalis');
        c.changeDisposition(10);
      },
      next: 'hub',
    },
    bad: { text: 'There. You see? You can’t either.', next: 'hub' },
    poet: { text: 'A poet? I am a man who writes down what everyone sees and nobody says. They will read me when I’m dead, and not before. Probably not then either.', next: 'hub' },
    gossip: { text: 'Everything that’s said in the popina is repeated here by the second hour, with the vowels worse. The Column tomorrow, Parthia next. Gossip is what Rome does instead of thinking.', next: 'hub' },
  },
});

const apollodorus = person({
  id: 'npc-apollodorus',
  greet: '(A short man with a measuring rod and a wax tablet, marble dust in his greying curls.) A hundred feet of Luna marble and they ask me if it will fall down. Apollodorus of Damascus. Measure twice. Carve once. Pray never.',
  again: ['The frieze climbs like the army did: slowly, and in the rain.', 'Domes? Domes are for people who draw pumpkins.', 'Measure twice. Carve once. Pray never.', 'Well? Are you here to criticise or to carry?'],
  topics: [
    { ask: 'Will the Column stand?', say: 'It will outlive the emperor, the Senate and the people who sneer at the architect. A hundred feet of drums, a stair inside, a platform on top. It stands because I know how a thing stands.' },
    { ask: 'What do you think of the Forum of Trajan?', say: 'The finest forum in the world. The Basilica Ulpia with the apse, the libraries on either side, the Column between them. The rest of Rome has been building for eight hundred years. I built this in six. (He glances at the Quirinal.) I took half a hill away, you know.', once: true },
  ],
});

const vestalis = person({
  id: 'npc-vestalis-maxima',
  greet: '(A slight woman in white with the infula and six braids, her face composed.) The fire does not care who you are. Neither do I. Stand back, citizen. The goddess is not a sight for gawkers.',
  again: ['Twenty-seven of rush, as our fathers made them.', 'The fire does not care who you are. Neither do I.', 'Stand back, citizen. The goddess is not a sight for gawkers.'],
  topics: [
    { ask: 'What do the Vestals do?', say: 'We keep the fire of Rome burning in the round house of Vesta, and it does not go out. We keep the wills of great men, and the sacred things that no one sees. On the Vestalia the storeroom opens to the matrons, barefoot, and to no one else.' },
    { ask: 'Is it true a condemned man is spared if he meets a Vestal?', say: 'If it is truly by chance, yes. Truly. (She looks at you steadily.) It is not something that can be arranged.' },
  ],
});

const vettius = defineDialogue({
  id: 'npc-patron-vettius',
  npcs: ['npc-patron-vettius'],
  priority: 60,
  start: () => 'hub',
  nodes: {
    hub: {
      text: (c) => (!c.memory.met ? '(An old senator with a face like a walnut, a dozen clients trailing behind him.) Sextus Vettius Crispinus. If you are another client, the salutatio is at dawn at my house in the Carinae, and you are late. If you are not, what do you want?' : rotate(c, '_hub', ['Wars are paid for twice: once in silver and once in sons.', 'In my father’s day a senator walked. Now he is carried, and calls it progress.', 'Sit, sit. The young stand too much.'])),
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'What do you think of the war?', goto: 'war', once: true },
        { text: 'I am looking for a patron.', check: { skill: 'rhetoric', difficulty: 55, pass: 'patron', fail: 'notYet' }, once: true },
        { text: 'Vale.', end: true },
      ],
    },
    war: { text: 'Armenia is the pretext and Parthia is a sea. Crassus thought it would pay for itself, too; his head ended up as a prop in a Greek play. But the princeps is a soldier and the Senate is a choir. We will sing the vows on the Capitol and pay for it all.', next: 'hub' },
    patron: {
      text: (c) => `Are you? (He looks at you properly for the first time.) Come to the salutatio in proper dress, ${female(c) ? 'a stola and a palla' : 'a toga'}, three mornings running, and we shall see. I do not take clients off the street. But I might take one off the Forum.`,
      effects: (c) => c.setFlag('clientela-vettius', true),
      end: true,
    },
    notYet: { text: 'Everybody is. (He walks on, and the clients close behind him like water.)', end: true },
  },
});

const talarius = person({
  id: 'npc-talarius',
  greet: '(A shabby man crouched on the basilica steps over a scratched board and a handful of knucklebones.) Venus! Venus, by the gods! No, it’s the Dog again. Dice are illegal, citizen. That’s why the stakes are so low.',
  again: ['Stand in front of me. The aedile’s man is looking.', 'Dice are illegal, citizen. That’s why the stakes are so low.', 'Venus! Venus, by the gods! No, it’s the Dog again.'],
  topics: [
    { ask: 'Do you win much?', say: 'I win every time, in my head. In my purse it’s more, ah, a philosophical position. A man doesn’t gamble to win. He gambles to be the sort of man who might.' },
    { ask: 'Can I play?', say: 'A throw for an as. The Dog is the worst, Venus the best. Don’t look at the aedile’s man, he’s only looking at your purse.' },
  ],
});

const hilario = person({
  id: 'npc-hilario',
  greet: '(A man in a sea-green cloak with a tray of pearls.) Pearls from the Red Sea, the price of a farm, the weight of a tear. Marcus Valerius Hilario. Look, but don’t breathe on them.',
  topics: [{ ask: 'I heard you have a son.', say: 'Pusio. My son will be an eques. If he lives, which he won’t, the way he climbs. Last week it was the Colossus. If you see him, tell him I’ll skin him.' }],
});

const pusio = person({
  id: 'npc-pusio',
  greet: '(A boy of fifteen with a gold bulla at his throat and scraped knees.) I bet you I can touch his crown. I bet you anything. I’m not scared. I’m just thinking. Up here.',
  again: ['Don’t tell my father. He’ll tell my mother. She’ll tell the whole Sacred Way.', 'I bet you I can touch his crown.', 'The Colossus, I mean. Not the emperor. The emperor’s too far.'],
  topics: [{ ask: 'The Colossus is a hundred feet tall.', say: '(He grins.) And there’s a scaffold. And a rope. And no one looks up at night.' }],
});

const lurco = person({
  id: 'npc-lurco',
  greet: '(A heavy man with a fat purse on a strap and two bruisers at his heels.) Bulls from Campania, heifers from Etruria, prices from heaven! Lurco, cattle dealer. Mind the dung. It’s worth more than you.',
  again: ['Bulls from Campania, heifers from Etruria, prices from heaven!', 'That slave? Cost me a fortune in doctors. Well, in one doctor. Well, in the god.', 'Mind the dung. It’s worth more than you.'],
  topics: [{ ask: 'Your name means “glutton”.', say: 'My father had a sense of humour and no imagination. Plautus did the same joke before he did.' }],
});

const mergus = person({
  id: 'npc-mergus',
  greet: '(A lean man with a rope round his waist and river-water in his hair.) Father Tiber gives back everything. Eventually. In pieces. Mergus, diver. Want to see the bottom? Hold your breath and your tongue.',
  topics: [{ ask: 'What do you find down there?', say: 'Amphorae, daggers, a good many coins, a donkey once. The river keeps secrets and gives some of them back. The people who throw things in don’t think of the divers.' }],
});

const primigenius = person({
  id: 'npc-primigenius',
  greet: '(A young freedman in a paenula with a lantern on a pole and a ready smile.) Quis est? Oh. Just you. Walk on. Fourth year in the watch. Two more and I’m a citizen. Two more!',
  again: ['Lamp out? Good. Lamp lit? Mind it.', 'Beans tonight, friend. Ghosts about. Stay in.', 'Quis est? Oh. Just you. Walk on.'],
  topics: [
    { ask: 'Any trouble tonight?', say: 'A pot dropped from a window. A drunk who fought a wall and lost. And knife-men, as always, in the burned taberna off the Vicus Tuscus: they come and go like fleas. We can’t go in; the cohorts say it’s theirs, the cohorts say it’s ours. The Prefect says go away.', once: true, effects: (c) => c.setFlag('hideout-known', true) },
    { ask: 'How do you become a citizen?', say: 'Six years in the vigiles, by the Lex Visellia. The prefect gives it to us for the water we carry. They call us the bucket-men. I don’t mind.' },
  ],
});


/** The emperor is never addressed (docs/CONTENT.md §2.B): the cordon answers. */
const traianus = defineDialogue({
  id: 'npc-traianus',
  npcs: ['npc-traianus'],
  priority: 100,
  start: () => 'cordon',
  nodes: {
    cordon: {
      speaker: 'player',
      text: (c) => rotate(c, '_cordon', ['(A praetorian in a toga steps across your path, a hand under his cloak.) “Back, citizen. Twenty-five paces. Caesar is walking.”', '(Two lictors with laurelled fasces turn their heads. Nobody speaks. Somebody, a long way off, says “Ave, optime princeps!”)']),
      end: true,
    },
  },
});

export default [traianus, juvenal, apollodorus, vestalis, vettius, talarius, hilario, pusio, lurco, mergus, primigenius];
