/**
 * What the people of Rome talk about in May 113, and how each kind of person answers
 * (docs/research/folk.md). Every unnamed NPC is offered a handful of these, picked by who they are
 * (persona.ts): who they are and what they do, a question or two about their own life, and one or
 * two about the city. The same question gets a different answer from a senator, a slave and a
 * beggar.
 *
 * Money in the lines: 1 denarius = 4 sestertii = 16 asses. A pound loaf is 2 asses, a cup of house
 * wine 1 as (Hedone's tavern at Pompeii: one as, two for the better, four for Falernian), a
 * labourer's day 3–4 sestertii, the client's sportula 100 quadrantes (6¼ sestertii, Martial), a
 * legionary's pay 1,200 sestertii a year, the grain dole five modii a month for citizens with a
 * token, freedom taxed at a twentieth of a slave's price (the vicesima libertatis).
 */
import { vary, type Persona } from './persona';

/** "born in Smyrna", "born a slave in this very house". */
function born(p: Persona): string {
  return p.origin.startsWith('born') ? p.origin : `born in ${p.origin.replace(/^here, in /, '')}`;
}

export type Group = 'elite' | 'plebs' | 'slave' | 'poor' | 'foreign' | 'rural' | 'soldier' | 'religious' | 'child' | 'reveler' | 'gladiator';

export function groupOf(p: Persona): Group {
  switch (p.status) {
    case 'elite':
      return 'elite';
    case 'slave':
      return 'slave';
    case 'poor':
      return 'poor';
    case 'foreign':
      return 'foreign';
    case 'rural':
      return 'rural';
    case 'soldier':
    case 'watch':
      return 'soldier';
    case 'religious':
    case 'vestal':
      return 'religious';
    case 'child':
      return 'child';
    case 'reveler':
      return 'reveler';
    case 'gladiator':
      return 'gladiator';
    default:
      return 'plebs';
  }
}

export interface TopicContext {
  hour: number;
  lemuria: boolean;
}

export interface Topic {
  id: string;
  kind: 'self' | 'work' | 'life' | 'city';
  /** What the player asks. */
  ask: string | ((p: Persona) => string);
  /** Who can be asked this (default: everyone). */
  who?: (p: Persona, t: TopicContext) => boolean;
  answer: (p: Persona, t: TopicContext) => string;
}

type Lines = Partial<Record<Group, readonly string[]>> & { all?: readonly string[] };

/** The line for this person's group (or the shared one), the same every time they say it. */
function by(p: Persona, key: string, lines: Lines): string {
  const g = groupOf(p);
  return vary(p, key, lines[g] ?? lines.all ?? lines.plebs ?? ['…']);
}

const isG = (...gs: Group[]) => (p: Persona) => gs.includes(groupOf(p));
const notG = (...gs: Group[]) => (p: Persona) => !gs.includes(groupOf(p));

// ---------------------------------------------------------------- self

const WHO: Topic = {
  id: 'who',
  kind: 'self',
  ask: 'Who are you?',
  answer: (p) => {
    switch (p.status) {
      case 'elite':
        return vary(p, 'who', [
          `(A look that measures your tunic, your shoes and your purse.) ${p.name}. If you have to ask, you are not from here.`,
          `${p.name}. ${p.female ? 'My husband sits in the Senate' : 'I sit in the Senate'}, and my family sat there when yours were herding goats. No offence.`,
          `${p.name}, and I am late. Walk with me if you must talk.`,
        ]);
      case 'slave':
        return vary(p, 'who', [
          `${p.name}. I belong to ${p.master}. ${p.origin.startsWith('born') ? `I was ${p.origin}` : `I was brought from ${p.origin}`}, and I’m ${p.tradeLabel} now.`,
          `Me? ${p.name}, ${p.tradeLabel} in ${p.master}’s household. Don’t keep me long, they count the hours.`,
          `${p.name}. My mother named me; my master kept the name. I’m ${p.master}’s, ${p.tradeLabel} in his house.`,
        ]);
      case 'freed':
        return vary(p, 'who', [
          `${p.name}, ${p.female ? 'freedwoman' : 'freedman'}. Freed, you hear? I was ${born(p)}${p.origin.startsWith('born') ? '' : ', a slave'}, and now I have three names and a vote. I’m ${p.tradeLabel}.`,
          `${p.name}. I carry my old master’s name, ${p.master}’s, and I carry it well. ${p.tradeLabel[0].toUpperCase()}${p.tradeLabel.slice(1)}, and I work for myself now.`,
          `${p.short}, they call me in the street. ${p.name} on the tax roll, if you please. ${p.tradeLabel[0].toUpperCase()}${p.tradeLabel.slice(1)}.`,
        ]);
      case 'poor':
        return vary(p, 'who', [
          `Who was I, you mean. ${p.short ? `${p.short}. ` : ''}Now I’m the man by the wall with the cup. An as, friend?`,
          `Nobody. Nobody has a name on these steps. Spare a coin and I’ll pray to whichever god you like.`,
          `${p.short || 'Nobody'}. I sleep ${p.home}. Don’t look at me like that, it could be you next winter.`,
        ]);
      case 'foreign':
        return vary(p, 'who', [
          `${p.name}, of ${p.origin}. ${p.tradeLabel[0].toUpperCase()}${p.tradeLabel.slice(1)}. Rome is a city of strangers, and I am one of the stranger ones.`,
          `${p.name}. From ${p.origin}, far from here. I came for the money, like everyone. I’m ${p.tradeLabel}.`,
          `My name is ${p.name}; Romans say it wrong, so say it however you like. ${p.tradeLabel[0].toUpperCase()}${p.tradeLabel.slice(1)}, from ${p.origin}.`,
        ]);
      case 'rural':
        return vary(p, 'who', [
          p.trade === 'farmer' ? `${p.name}. From ${p.origin}. I bring vegetables in before dawn and I’m out again before the city wakes up properly.` : `${p.name}, from ${p.origin}. ${p.tradeLabel[0].toUpperCase()}${p.tradeLabel.slice(1)}, in Rome for a few days, gods help me.`,
          `${p.short}, from ${p.origin}. ${p.female ? 'A countrywoman' : 'A countryman'}. Is it that obvious? It’s the boots.`,
        ]);
      case 'soldier':
      case 'watch':
        return vary(p, 'who', [
          `${p.name}, ${p.tradeLabel}. And you are? I ask the questions in this street.`,
          `${p.short}. ${p.tradeLabel[0].toUpperCase()}${p.tradeLabel.slice(1)}, from ${p.origin}. ${p.status === 'watch' ? 'Buckets by night, sleep by day.' : 'Twelve years’ service, eight to go.'}`,
        ]);
      case 'vestal':
        return '(Her attendant answers for her.) The Lady is a Vestal Virgin, citizen. You may speak, but keep a respectful distance.';
      case 'religious':
        return vary(p, 'who', [`${p.name}. I serve at the temple, as my father did.`, `${p.name}, a priest. The gods keep us busy, even when men forget them.`]);
      case 'child':
        return vary(p, 'who', [`I’m ${p.name}! I’m seven. Nearly eight. Who are you?`, `${p.name}. My mother says don’t talk to strangers. You’re a stranger. But you look nice.`]);
      case 'elder':
        return vary(p, 'who', [
          `${p.name}. I was ${born(p)} in the reign of Claudius, and I’ve outlived five emperors and most of my friends.`,
          `${p.name}. Old. ${p.trade === 'veteran' ? 'Twenty-five years with the Fifth Legion. Now I sit in the sun and complain.' : 'I worked; now I sit in the sun and complain.'}`,
        ]);
      case 'reveler':
        return vary(p, 'who', [`${p.short}! ${p.short}, son of… somebody. Have a drink with me! No? Then I’ll have yours.`, `Me? I’m a citizen of Rome and a friend of Bacchus! ${p.name}. Bene sit tibi!`]);
      case 'gladiator':
        return vary(p, 'who', [`${p.name}. Of the Ludus Magnus. You’ll see the name on the walls one day, or on a tombstone.`, `${p.name}, gladiator. Don’t stand so close; people think you’re buying.`]);
      default:
        return vary(p, 'who', [
          `${p.name}. ${p.tradeLabel[0].toUpperCase()}${p.tradeLabel.slice(1)}, ${born(p)}. I live ${p.home}.`,
          `${p.short}, mostly. ${p.name}, when the censor asks. I’m ${p.tradeLabel}.`,
          `${p.name}, citizen of Rome, which these days means I get my grain and I don’t get much else. ${p.tradeLabel[0].toUpperCase()}${p.tradeLabel.slice(1)}.`,
        ]);
    }
  },
};

const FAMILY: Topic = {
  id: 'family',
  kind: 'self',
  ask: 'Do you have family?',
  who: (p) => !!p.family,
  answer: (p) => {
    const f = p.family;
    switch (groupOf(p)) {
      case 'slave':
        return `${f[0].toUpperCase()}${f.slice(1)}. A slave’s family is a loan, not a gift. ${vary(p, 'fam', ['Masters sell.', 'Masters die, and heirs sell.', 'I try not to think about it.'])}`;
      case 'poor':
        return `${f[0].toUpperCase()}${f.slice(1)}.`;
      case 'soldier':
        return `${f[0].toUpperCase()}${f.slice(1)}.`;
      case 'gladiator':
        return `${f[0].toUpperCase()}${f.slice(1)}.`;
      case 'elite':
        return vary(p, 'fam', [`My family is in the consular lists, citizen. Look it up.`, `Sons at the law courts, a daughter well married, and nephews who think I will die soon. They are wrong.`]);
      default:
        return `${f[0].toUpperCase()}${f.slice(1)}. ${vary(p, 'fam', ['The gods keep them.', 'They eat more than I earn.', 'Ask me on a good day.', 'That’s what I work for.'])}`;
    }
  },
};

const HOME: Topic = {
  id: 'home',
  kind: 'self',
  ask: 'Where do you live?',
  who: notG('religious'),
  answer: (p) => {
    const h = p.home;
    switch (groupOf(p)) {
      case 'plebs':
      case 'reveler':
        return `${h[0].toUpperCase()}${h.slice(1)}. ${vary(p, 'home', [
          'The rent for one dark room would buy a house and a garden in Sora. I’ve done the sums.',
          'Sixty steps to the top. You don’t buy a full jar of water when you live up there; you buy one you can carry.',
          'The wall’s cracked from the cellar to the roof, and the landlord’s man says it’s been like that since Nero. That’s what worries me.',
          'If the stairs catch fire, the man on the ground floor walks out and the man under the tiles burns. Guess which one I am.',
        ])}`;
      case 'elite':
        return `${h[0].toUpperCase()}${h.slice(1)}. Quiet, high, and far from the stink of the Subura.`;
      case 'slave':
        return `${h[0].toUpperCase()}${h.slice(1)}. ${vary(p, 'home', ['It’s dry. That’s something.', 'I sleep when he sleeps and wake when he coughs.'])}`;
      case 'poor':
        return `${h[0].toUpperCase()}${h.slice(1)}. ${vary(p, 'home', ['I had a room once. Then the rent went up, and the roof came down.', 'In winter I go into the baths and nobody looks at me twice. In summer, anywhere.'])}`;
      default:
        return `${h[0].toUpperCase()}${h.slice(1)}.`;
    }
  },
};

// ---------------------------------------------------------------- work

const WORK_LINES: Record<string, readonly string[]> = {
  pistor: ['Bread, from before the second watch. The donkey turns the mill, I knead and fire, and by dawn half the street has been and gone. Two asses a loaf, and the bran bread for less.', 'The ovens never cool. Neither do I. White bread for the rich, brown for the rest, and the dole grain for whoever brings it to be baked.'],
  tonsor: ['A shave, a trim, the news. Every man in Rome comes through a barber’s chair, so I hear everything first. A razor in my hand, and a senator’s throat. Think on that.', 'Beards, mostly, and the tongues that go with them. The Greeks want theirs kept; the Romans want them gone.'],
  fullo: ['We tread the cloth in vats of water, fuller’s earth and urine. Yes, urine; it’s collected from the pots in the street. Caesar Vespasian taxed it, and it still doesn’t smell.', 'Cleaning togas. A citizen must wear his toga to the games and the courts, and he wants it white. We bleach it with sulphur and brush it till the nap stands up.'],
  librarius: ['Books. My copyists turn out a hundred copies of a new Martial in a week, and the poets complain they never see a sesterce of it.', 'Scrolls, new and secondhand. Titles on the door-posts, the first lines on the outside, and no reading for free at my table.'],
  sutor: ['Shoes. Calcei for the togate, soleae for the house, boots for the road. Every man in Rome wears out a pair a season on these stones.', 'Mending. Nobody in the Argiletum buys new shoes if a cobbler can save the old ones.'],
  thermopolium: ['Hot food, hot wine, a counter on the street. People in an insula can’t cook upstairs; the aediles fear fire. So they eat at counters like mine.', 'Lentils, chickpeas, sausage in the pot and wine mixed with hot water. An as for the house wine, two for the better, four for Falernian, and nobody ever orders the Falernian.'],
  vinarius: ['Wine. Campanian, Sabine, Spanish for the poor and Falernian for the liars. The jars come up from Ostia on the barges.', 'Selling wine by the jug. Watered to taste, and the taste is mine.'],
  caseus: ['Cheese. Smoked here in the Velabrum, over the fires. Martial wrote about it, they tell me. He didn’t pay for it.'],
  lanius: ['Butchering. Pork mostly; Romans would eat a pig from the ears to the tail and then sell the tail. The beef comes from the sacrifices.'],
  piscator: ['Fish. Mullet, eel, oysters from the Lucrine lake for the rich. The poor get garum and smell it from here.'],
  balneator: ['I keep the baths. A quadrans to get in, men in the afternoon, women in the morning in the old places; in Trajan’s new baths there’s room for everyone, gods help me.'],
  magister: ['I teach the boys their letters before cockcrow, under the awning. Twelve times twelve and the Aeneid, book one. Their fathers pay me at the Ides, if they remember.'],
  scriba: ['I write for those who can’t. Letters, petitions, contracts, curses. A sestertius a page. The curses cost extra.'],
  margaritarius: ['Pearls from the Red Sea and India. A good pearl for a lady’s ear costs more than a farm. The matrons don’t care. The husbands do.'],
  piperarius: ['Pepper, ginger, cinnamon, malabathrum. It comes from India by Alexandria and it costs more by the pound than a slave by the day.'],
  saepta: ['Fine goods in the Saepta: Corinthian bronze, citrus-wood tables, tortoiseshell. People walk round for hours, handle everything, and buy two cups for an as.'],
  nauta: ['Sailor of the fleet at Misenum. Here in Rome we work the great awning over the amphitheatre. Ropes, pulleys and a lot of shouting.'],
  libelli: ['Selling the programme for the games: every pair, every name. When there are no games I sell cushions. Stone seats, you understand.'],
  botularius: ['Sausages, hot, by the baths. People come out of the hot room starving. Seneca complained about men like me shouting all day. Seneca is dead.'],
  frumentum: ['I check the tokens at the grain dole. Two hundred thousand names, five modii each a month, and every one of them thinks he should go first.'],
  haruspex: ['I read the livers of the victims, as the Etruscans taught. The gods write on the inside of a sheep. Few people can read it.'],
  tibicen: ['I play the pipes at the sacrifices, so no ill-omened word is heard. If I stop, they start again from the beginning. So I don’t stop.'],
  ostiarius: ['I keep the door of a great house. Clients at dawn, creditors at noon, and nobody at all after dark. I know every face in the queue.'],
  portitor: ['Customs, at the gate. Two and a half in the hundred on everything that comes in to sell. Everybody hates me. Everybody pays.'],
  sortilega: ['I tell fortunes. A palm, the stars, the lots. The poor girls want husbands, the rich ones want lovers, and the men want horses to win.'],
  argentarius: ['Money-changing. Greek drachms, Egyptian silver, old coins of Nero’s that weigh less than they should. And loans, by the month.'],
  factio: ['Work? I shout for the Greens. That’s a living, if you bet right.'],
  smith: ['Iron. Nails for the builders, hinges, knives, the odd sword for a man who shouldn’t have one. The emperor’s works eat nails by the cartload.'],
  carpenter: ['Timber. Roof beams, scaffolding, the frames for the emperor’s arches. Every new insula needs a forest, and every fire makes me rich.'],
  mason: ['I cut stone for the emperor’s works. Travertine from Tibur, marble from Luna, and the Column was mine as much as anyone’s. My chisel, his name.'],
  potter: ['Pots, lamps, cups. The clay comes up the river. A lamp for an as, with a gladiator on it for two.'],
  tanner: ['Hides. The tanneries are across the river, because of the smell. I go home and my wife sends me back to the baths.'],
  dyer: ['Dyeing cloth. Madder for red, woad for blue, saffron for the rich. Purple? Purple is for Caesar and for people with more money than sense.'],
  lampmaker: ['Lamps. Clay, a nozzle, a picture on top. Gladiators sell, and Venus, and the emperor’s face if it’s a festival.'],
  oil: ['Oil from Spain and Africa. For lamps, for cooking, for the baths. A city of a million people burns a river of it.'],
  wine: ['Wine, by the jar or the jug. Campanian for the decent, Spanish for the poor, and vinegar for the soldiers, who can’t tell.'],
  cloth: ['Cloth. Wool from Tarentum, linen from Egypt, silk from the ends of the world for the ladies who can afford to be seen through.'],
  fruit: ['Figs, apples, cherries from Lucullus’ own trees, they say. Up at dawn, sold out by noon.'],
  pottery: ['Pots and lamps from Arretium and Gaul. Red, shiny, cheap. Every kitchen in Rome is my customer.'],
  perfume: ['Perfume, in the Vicus Tuscus. Rose, nard, myrrh. Half the senators in Rome smell like my shop, and the other half smell like their slaves.'],
  merchant: ['A bit of everything. Whatever comes off the barges at the Emporium and doesn’t smell too bad.'],
  weaver: ['I spin and weave, at home, like my mother and hers. A good wife works wool, they say. A poor one sells it.'],
  midwife: ['I deliver babies. In the Subura that’s every night of the week. I’ve lost some; you don’t forget them.'],
  seamstress: ['Sewing and mending. Tunics, the hems of togas, the patches nobody admits to.'],
  laundress: ['Washing, at the fountain, until the aedile’s men chase us off. Then at the next fountain.'],
  nurse: ['I nurse other women’s babies. The rich don’t feed their own. I’ve fed half the little senators on the Caelian.'],
  barmaid: ['I pour wine and I don’t sit on anyone’s knee, whatever the wall says. The wall is a liar.'],
  greens: ['Cabbages, leeks, lettuce. My man grows them outside the walls and I sell them inside.'],
  porter: ['I carry. Amphorae, sacks, my master’s accounts. Forty pounds on the shoulder up five flights of stairs.', 'Carrying. Whatever my master sells, I carry, and whatever he buys, I carry home.'],
  stevedore: ['I carry sacks off the barges at the Emporium. Three sestertii a day, and a free man’s right to be paid late.', 'Grain, oil, wine, marble: if it comes up the Tiber, it comes up on my back. A free man’s back, which is the same as a slave’s, only nobody feeds it.'],
  litter: ['I carry my master’s litter with seven others. Eight of us, and he still complains about the bumps.'],
  water: ['Water, up the stairs, all day. The fountains are free; the stairs are not.'],
  pedisequus: ['I walk behind my master. Carry his things, clear the way, hold his sandals at dinner. Some days I just walk behind him.'],
  ornatrix: ['I dress my mistress’s hair. Three hours each morning, and if one curl falls, I hear about it.'],
  cook: ['I cook. For forty people some days. The master’s guests eat dormice; I eat what comes back.'],
  copyist: ['I copy books. Ten hours a day, the same words, and my eyes are going.'],
  clerk: ['I keep accounts for a merchant at the Emporium. Columns of figures, in and out. Mostly out.'],
  dole: ['Work? I have the grain dole and a patron. Mornings at his door, afternoons at the baths, evenings at the tavern. It’s a living.', 'Whatever comes. Carrying, sweeping, shouting at games for whoever pays. The grain dole keeps me from starving; the rest keeps me in wine.'],
  client: ['I’m a client. Every morning at my patron’s door in my toga, for the greeting and a little basket of coins. Then I walk behind him to the Forum and clap when he speaks.'],
  carter: ['Carts, by night. No wheels in the city by day, so I bring in the stone and the wine when decent people sleep.'],
  farmer: ['I grow vegetables outside the walls and sell them in the markets before the sun’s high. The city eats everything we grow, and still wants more.'],
  tutor: ['I teach Greek to the sons of rich Romans. They need Greek to be educated, and they despise the Greeks who teach them. It pays well.'],
  doctor: ['I’m a doctor. Greek, of course; Romans don’t trust a Roman doctor. They don’t trust a Greek one either, but they come.'],
  astrologer: ['I read the stars. Caesar has banished us from Rome twice, and twice we’ve come back. The stars, it seems, have a sense of humour.'],
  trader: ['I trade. Whatever is cheap where I come from and dear where I’m going. Today that’s Rome.'],
  pilgrim: ['I came to see the city. The Capitol, the temples, the games. My village will never believe me.'],
  courier: ['I carry letters for a merchant house. Not the imperial post, gods no. Those men get knifed.'],
  senator: ['My work? Rome. The courts, the Senate, the care of my clients. And the war, now; everyone is busy with the war.'],
  matron: ['I run a household of sixty people. My husband thinks he does.'],
  priest: ['I serve the god. Sacrifices at dawn, the temple doors, the vows people make and forget.'],
  vestal: ['She keeps the sacred fire, citizen. If it goes out, Rome is in danger. It does not go out.'],
  soldier: ['Keeping the peace in the city. Riots, thieves, the games, the grain ships. The Praetorians guard Caesar; we guard everyone else.'],
  vigil: ['The night watch. Fires, mostly; thieves, sometimes. Buckets, axes, a siphon if we’re lucky. Sleep in the day, like an owl.'],
  beggar: ['I ask. By the bridge, by the temples, wherever the pious walk. A coin for a man who had a trade once.'],
  child: ['Work? I’m a child! I fetch water. And I go to school when Father pays the master.'],
  veteran: ['I was a soldier. Now I have a little farm’s worth of money, a bad knee and a lot of stories. Do you want one?'],
  gladiator: ['I fight. Practice at the post every morning, a bout when the editor pays. The rest of the time I eat barley and wait.'],
  idler: ['Work? I’m a gentleman of leisure. I have the dole, a patron, and the steps of the Basilica Julia. What more does a man need?'],
  reveler: ['Work? It’s the evening, friend! Nobody works in the evening. Except the tavern-keepers, gods bless them.'],
};

const WORK: Topic = {
  id: 'work',
  kind: 'work',
  ask: (p) => (groupOf(p) === 'child' ? 'What do you do all day?' : groupOf(p) === 'poor' ? 'How do you get by?' : 'What do you do?'),
  answer: (p) => vary(p, 'work', WORK_LINES[p.trade] ?? WORK_LINES.dole),
};

// ---------------------------------------------------------------- life (by kind of person)

const LIFE: Topic[] = [
  // ---- slaves
  {
    id: 'freedom',
    kind: 'life',
    ask: 'Will you ever be free?',
    who: isG('slave'),
    answer: (p) =>
      vary(p, 'freedom', [
        `I keep a little purse. My peculium. Tips, a bit from the market, what I make on my own time. ${p.master} says when I reach the price, he’ll free me. Then I pay a twentieth of it to the treasury for the privilege.`,
        'At thirty, maybe, if I’m good, and if he doesn’t die first and leave me to his nephew. Masters free the ones they like. I am very likeable.',
        `Free? Then I’d have to pay rent. (${p.female ? 'She' : 'He'} laughs, but not much.) Yes. One day. In his will, he says. He says a lot of things.`,
        'My master freed old Eros last Saturnalia, cap and all. Eros cried. Then he opened a shop and got rich, and now he owns two slaves of his own. That’s Rome.',
      ]),
  },
  {
    id: 'master',
    kind: 'life',
    ask: 'What is your master like?',
    who: isG('slave'),
    answer: (p) =>
      vary(p, 'master', [
        `${p.master}? He doesn’t beat us unless he’s lost at dice. So, often.`,
        'Fair, as masters go. He feeds us the same bread his clients get, and he knows our names. Not all of them do.',
        'I mustn’t say. Slaves who talk about their masters end up in the mill, turning it with the donkeys.',
        'His wife is the master, really. He just signs.',
      ]),
  },
  // ---- the freed
  {
    id: 'wasSlave',
    kind: 'life',
    ask: 'Were you a slave once?',
    who: (p) => p.status === 'freed',
    answer: (p) =>
      vary(p, 'wasSlave', [
        `Twenty years in ${p.master}’s house. He freed me in his will, the gods keep his shade, and I still go to his son’s door in the mornings. ${p.female ? 'A freedwoman' : 'A freedman'} owes a patron that.`,
        'I bought myself. Eighteen hundred sesterces, coin by coin. When the praetor touched me with the rod, I nearly fainted. My son will be a citizen born, and he’ll never know.',
        'Yes, and I’ll tell you what slavery taught me: count everything, and smile at everyone. That’s how you get rich in Rome.',
      ]),
  },
  // ---- the plebs
  {
    id: 'dole',
    kind: 'life',
    ask: 'Do you get the grain dole?',
    who: (p) => groupOf(p) === 'plebs' && !p.female,
    answer: (p) =>
      vary(p, 'dole', [
        'Five modii a month, at the Porticus Minucia, with my token. It’s not enough to live on and too much to give up. My wife bakes half and we sell the rest.',
        p.status === 'freed' ? 'Freedmen get it too, if they’re on the list. I am. I paid a clerk to make sure I stayed there.' : 'Every month. Bread and games, the poets sneer. Let them try living without the bread.',
        'Caesar’s grain. I bow to the ships from Egypt every spring like they were gods. Without them this city starves in a month.',
      ]),
  },
  {
    id: 'patron',
    kind: 'life',
    ask: 'Do you have a patron?',
    who: (p) => groupOf(p) === 'plebs' && (p.trade === 'client' || p.trade === 'dole' || p.trade === 'clerk'),
    answer: (p) =>
      vary(p, 'patron', [
        'At his door before dawn, in my toga, with forty others. If he nods at me, it’s a good day. Then the sportula: a hundred quadrantes in a little basket. That’s my breakfast, my bath and my wine.',
        'A great man on the Esquiline. He doesn’t know my name, but his steward does. I walk behind his litter and cheer when he speaks in court.',
        'Had one. He died, and his heir cut the clients by half. I wasn’t in the half they kept.',
      ]),
  },
  // ---- the poor
  {
    id: 'fall',
    kind: 'life',
    ask: 'How did you come to this?',
    who: isG('poor'),
    answer: (p) =>
      vary(p, 'fall', [
        'A fire. The insula went up in a night, with my tools and my savings in it. The landlord built it again and doubled the rent.',
        'I was a soldier. Twenty-five years, and the discharge money went on a farm that the floods took. Now I have a diploma and a cup.',
        'Debt. One bad loan, then another to pay the first. In the end they took the shop, and I was lucky they didn’t take me.',
        'I fell from a scaffold on the emperor’s baths. The leg never healed. Masons need two good legs.',
      ]),
  },
  {
    id: 'charity',
    kind: 'life',
    ask: 'Do people help you?',
    who: isG('poor'),
    answer: (p) =>
      vary(p, 'charity', [
        'The pious do, by the temples, on festival days. The rich throw coins from their litters so they don’t have to look.',
        'The dole is for citizens with a token. I lost mine with my room. Without a roof you’re nobody to the clerks.',
        'Sometimes a baker gives me yesterday’s bread. Sometimes the vigiles move me on. It evens out.',
      ]),
  },
  // ---- the elite
  {
    id: 'senate',
    kind: 'life',
    ask: 'What is happening in the Senate?',
    who: (p) => groupOf(p) === 'elite',
    answer: (p) =>
      vary(p, 'senate', [
        'Vows for Caesar’s safe journey east. Honours for the Column. And a trial for extortion: a former governor who robbed his province blind. We shall see how much of it he shares with his judges.',
        'The Senate decrees, and Caesar decides. It is a better arrangement than the last one, believe me; under Domitian we decreed and then we died.',
        'Nothing that concerns you, and very little that concerns us. The war is decided on the Palatine.',
      ]),
  },
  {
    id: 'elitecity',
    kind: 'life',
    ask: 'What do you think of the city?',
    who: (p) => groupOf(p) === 'elite',
    answer: (p) =>
      vary(p, 'elitecity', [
        'Crowded, filthy and magnificent. I go to my villa at Tibur when the heat comes, and so does anyone who matters.',
        'Too many Greeks, too many Syrians, and not enough Romans who remember what that word means.',
        'Trajan builds well. The baths, the markets, the forum. He knows that a full belly and a fine portico keep the plebs quieter than any guard.',
      ]),
  },
  // ---- foreigners
  {
    id: 'whyRome',
    kind: 'life',
    ask: 'What brought you to Rome?',
    who: isG('foreign'),
    answer: (p) =>
      vary(p, 'whyRome', [
        `Money. In ${p.origin} a man of learning is a man of learning. In Rome he is a man of learning with a salary.`,
        'A ship, a cousin and a bad decision. The cousin is doing well. The decision is still being considered.',
        'Everything comes to Rome in the end: grain, gods, slaves, and fools like me. The Orontes flows into the Tiber, as your satirists say.',
      ]),
  },
  {
    id: 'romans',
    kind: 'life',
    ask: 'How do the Romans treat you?',
    who: isG('foreign'),
    answer: (p) =>
      vary(p, 'romans', [
        'They hire us to teach their sons, cure their wives, cook their dinners and read their stars, and then they complain that the city is full of Greeks.',
        'Well enough, if you pay. Badly, if you don’t. Like everywhere, but louder.',
        'They call us clever, which is not a compliment here. A clever man, to a Roman, is one who has just cheated him.',
      ]),
  },
  // ---- the countryside
  {
    id: 'harvest',
    kind: 'life',
    ask: 'How is the harvest?',
    who: isG('rural'),
    answer: (p) =>
      vary(p, 'harvest', [
        'Good, if the rain holds and the soldiers don’t requisition the mules. They’re buying mules for the war, you know, at any price.',
        'The vines look well. The beans don’t. The landlord’s steward will take his share either way.',
        'Late frost in March. We prayed to Robigo and the corn came through. The gods listen, if you ask properly.',
      ]),
  },
  {
    id: 'cityFolk',
    kind: 'life',
    ask: 'What do you make of the city?',
    who: isG('rural'),
    answer: (p) =>
      vary(p, 'cityFolk', [
        'Noise! Everyone shouting at once, and nobody listens. At home I can hear a hare in the field.',
        'You pay for water here? You pay for a bed the size of a coffin? I sell my cabbages and I go home.',
        'The temples are beautiful. The people are thieves. Both things are true.',
      ]),
  },
  // ---- soldiers and the watch
  {
    id: 'served',
    kind: 'life',
    ask: 'Where have you served?',
    who: isG('soldier'),
    answer: (p) =>
      p.status === 'watch'
        ? vary(p, 'served', ['Six years with the vigiles. After six years a freedman of the watch becomes a citizen. That’s why most of us are here.', 'Every street in the Fifth Region. I know which stairs burn and which landlords lie.'])
        : vary(p, 'served', ['Dacia, both wars. I saw Sarmizegetusa burn. You can see it on the Column, if you have good eyes: fourth turn from the bottom, the man with the torch.', 'Germany first, then the cohorts here. The city is worse: in Germany you know who your enemy is.']),
  },
  {
    id: 'parthiaSoldier',
    kind: 'life',
    ask: 'Will you go east to the war?',
    who: (p) => p.status === 'soldier',
    answer: (p) =>
      vary(p, 'parthiaSoldier', [
        'The urban cohorts stay in Rome. The legions go. Some of us have put in for transfers; there’s silver in a war, if you live.',
        'If Caesar wants me. He took Dacia; Parthia is bigger, and hotter, and further. I’ve heard the arrows come from everywhere at once.',
      ]),
  },
  // ---- priests
  {
    id: 'omens',
    kind: 'life',
    ask: 'What do the omens say?',
    who: isG('religious'),
    answer: (p) =>
      vary(p, 'omens', [
        'The auspices for the dedication were favourable. The birds flew right. What the birds meant, the augurs will tell you after the fact.',
        'A dog ran through the Forum with a human hand in its mouth last month. They said the same before Vespasian. Make of that what you will.',
        'Tonight the dead walk, and tomorrow Caesar dedicates his Column. The gods are watching Rome closely this week.',
      ]),
  },
  // ---- children
  {
    id: 'play',
    kind: 'life',
    ask: 'What are you playing?',
    who: isG('child'),
    answer: (p) =>
      vary(p, 'play', [
        'Nuts! You line them up and knock them down. I’ve won forty from my brother.',
        'Knucklebones. If you throw a Venus you win. I never throw a Venus.',
        'Gladiators! I’m the murmillo and Lucius is the net-man, but he cries when I win.',
        'Hoops, down the Clivus Suburanus. The carters shout at us. It’s the best part.',
      ]),
  },
  {
    id: 'school',
    kind: 'life',
    ask: 'Do you go to school?',
    who: isG('child'),
    answer: (p) =>
      vary(p, 'school', [
        'Before the sun’s up, under the awning. The master hits us with the ferula when we get the sums wrong. I get them wrong a lot.',
        'My sister doesn’t go. She says she’ll marry rich and not need letters. I think she’s right.',
        'Sometimes. When Father has the fee. Twelve times twelve is a hundred and forty-four. See?',
      ]),
  },
  // ---- elders
  {
    id: 'oldDays',
    kind: 'life',
    ask: 'What was Rome like when you were young?',
    who: (p) => p.status === 'elder',
    answer: (p) =>
      vary(p, 'oldDays', [
        'I saw the great fire under Nero. Six days. The whole valley where the amphitheatre is now was ash and the Golden House rose over it. Now Trajan is filling it with baths for the people. Things go round.',
        'The year of four emperors. Galba, Otho, Vitellius, Vespasian, all in one year, and the Capitol burned in the middle of it. After that, nothing scares me.',
        'I was at the opening of the amphitheatre under Titus. A hundred days of games. A hundred! I still have the token.',
        'Domitian. We don’t say the name. You learned to look at the floor and keep your opinions behind your teeth.',
      ]),
  },
  // ---- revelers
  {
    id: 'bestWine',
    kind: 'life',
    ask: 'Where’s the best wine?',
    who: isG('reveler'),
    answer: (p) =>
      vary(p, 'bestWine', [
        'Falernian, if you can find a real one. Most of it was grown last year behind a tavern in the Subura.',
        'The Silver Pig, on the Vicus Tuscus. Chreste waters it, but she waters it honestly.',
        'Wherever you’re buying! Ha! An as for the house wine, two for the good. I’ve had both. I’ve had all of them.',
      ]),
  },
  // ---- gladiators
  {
    id: 'death',
    kind: 'life',
    ask: 'Are you afraid of dying?',
    who: isG('gladiator'),
    answer: (p) =>
      vary(p, 'death', [
        'Every bout. Then the horn blows and there’s no room in your head for it.',
        'Most of us don’t die. A good man is expensive; the editor wants his money back. The crowd shouts Iugula, and then they let you go.',
        'I swore to be burned, bound, beaten and killed by the sword. After that, the rest is just waiting.',
      ]),
  },
];

// ---------------------------------------------------------------- the city (anyone, in their own voice)

const CITY: Topic[] = [
  {
    id: 'prices',
    kind: 'city',
    ask: 'How are prices?',
    who: notG('child', 'religious'),
    answer: (p) =>
      by(p, 'prices', {
        plebs: ['A pound loaf for two asses. A cup of wine for one. A room under the tiles for more than a farm in Sabine country. A labourer earns three sestertii a day. Do the sums yourself.', 'Up, since the talk of war. Mules doubled. Oil’s up. Only promises are cheap, and the politicians are selling.'],
        slave: ['Ask my master. I only know what he spends on me, and that’s nothing.', 'A good slave goes for two thousand sesterces at the Saepta. A good mule for less. Think about that.'],
        poor: ['Everything costs more than nothing, and nothing is what I have.'],
        elite: ['I have a steward for that.', 'Grain prices are steady while the Egyptian ships come in. If they stop, watch the plebs.'],
        foreign: ['Rome is dear. In my city a fish is a fish. Here a fish is a performance.'],
        rural: ['In the city everything’s dear except my vegetables. Funny, that.'],
        soldier: ['Twelve hundred sesterces a year, and the centurion takes his share for leave. Prices are always too high on a soldier’s pay.'],
        reveler: ['Wine’s an as a cup. Two if you want to remember it. Four if you want to forget it.'],
        gladiator: ['I’m fed. What do I care about prices?'],
      }),
  },
  {
    id: 'column',
    kind: 'city',
    ask: 'What do you think of the Column?',
    answer: (p) =>
      by(p, 'column', {
        plebs: ['A hundred feet of the Dacian war wound round and round, and nobody can see past the fourth turn. But it’s ours. Tomorrow the emperor dedicates it.', 'They say his ashes will go in the base when he dies. A soldier’s tomb, in the middle of the Forum. That’s a man who knows how to be remembered.'],
        slave: ['I carried stone for it, the year before last. My shoulder remembers the Column very well.'],
        poor: ['Very tall. You can’t eat a column.'],
        elite: ['Apollodorus is a genius and knows it, which is tiresome. But it is a remarkable thing. The libraries on either side are the real treasure.'],
        foreign: ['In Antioch they talk about it. A carved war you walk round. Only Romans would want to read a war.'],
        rural: ['I walked round it twice and got dizzy. Is that the emperor on every turn? He must be very busy.'],
        soldier: ['I’m on it. Well, a man like me. Third turn, building a camp. We built a lot of camps.'],
        religious: ['It will be dedicated tomorrow, with sacrifice. May the gods find it pleasing.'],
        child: ['Can you climb it? Lucius says there’s a stair inside. I want to go up it!'],
        reveler: ['To the Column! (He drinks.) To every one of its hundred feet!'],
        gladiator: ['There’ll be games for it. That’s what matters to me.'],
      }),
  },
  {
    id: 'parthia',
    kind: 'city',
    ask: 'Is there going to be a war?',
    who: notG('child'),
    answer: (p) =>
      by(p, 'parthia', {
        plebs: ['With Parthia. Everyone says so. King Osroes put his own man on the throne of Armenia, and Trajan won’t have it. The recruiters are already in the Forum.', 'The doors of Janus are open, aren’t they? There’s always a war somewhere. This one’s just further away.'],
        slave: ['A war means captives. Captives mean slaves. I hope the Parthians are better cooks than the last lot.'],
        poor: ['A war means veterans, and veterans mean more of us on the steps.'],
        elite: ['Armenia is the pretext. Glory is the reason. Caesar is sixty and wants to stand where Alexander stood. I pray he comes back.'],
        foreign: ['My people trade with Parthia. Silk, pepper, horses. A war is very bad for business, and very good for prices.'],
        rural: ['They want our mules. And our sons. The mules they pay for.'],
        soldier: ['The legions are marching to Syria. You can smell it.'],
        religious: ['The doors of Janus are open. When Rome goes to war, the gods must be asked first, and thanked after.'],
        reveler: ['War! To war! No, to wine. War tomorrow.'],
        gladiator: ['Captives make good gladiators. More Dacians, now Parthians. The Ludus will be full.'],
      }),
  },
  {
    id: 'emperor',
    kind: 'city',
    ask: 'What do you think of Caesar?',
    who: notG('child'),
    answer: (p) =>
      by(p, 'emperor', {
        plebs: ['Trajan? Best of them, in my lifetime. Builds baths, feeds us, walks in the Forum like a man. Likes his wine, they say, but never so much he forgets a promise.', 'He gave us the grain, the baths and the games. He took Dacia and its gold. I’d die for him, if it came to it. Let’s hope it doesn’t.'],
        slave: ['They say he was kind to his slaves in Spain. They say a lot of things about emperors.'],
        poor: ['Caesar feeds the poor children of Italy, did you know? Money to the towns, for the little ones. Not for old men, though.'],
        elite: ['A soldier, and honest, and he leaves the Senate its dignity. After Domitian, that is everything.', 'He lets us speak. You have no idea how strange that still feels.'],
        foreign: ['A good emperor is one who leaves my city alone. This one builds harbours and roads. I approve.'],
        rural: ['He’s Spanish, you know. A provincial! And he’s the best of them. My grandfather wouldn’t have believed it.'],
        soldier: ['A soldier’s emperor. He marches on foot with the legions and eats what we eat. We’d follow him to the end of the world. We might have to.'],
        religious: ['May the gods preserve him. We sacrifice for his safety every day.'],
        reveler: ['To Caesar! Long may he… whatever emperors do!'],
        gladiator: ['He paid for ten thousand gladiators after Dacia. A hundred and twenty-three days of games. He’s my kind of emperor.'],
      }),
  },
  {
    id: 'heir',
    kind: 'city',
    ask: 'Who will rule after Trajan?',
    who: notG('child', 'religious'),
    answer: (p) =>
      by(p, 'heir', {
        plebs: ['(Quieter.) He has no son and he’s named no one. Hadrian, says one; he’s married to Caesar’s grandniece. Servianus, says another. Don’t ask it so loud.', '(He looks round.) Ask that in the wrong tavern and a man in a good cloak buys you a drink, and you never come home. No idea, friend. Long live Caesar.'],
        slave: ['Ask that again where I can’t hear you.'],
        poor: ['Whoever it is will want to be loved for a year. Then we’ll see.'],
        elite: ['A question that ends careers, citizen. Hadrian has Plotina’s favour. The marshals have the army. Caesar has said nothing at all, which is the most dangerous thing of all.'],
        foreign: ['Not my city, not my question. But in the East they say the young one, Hadrian. He loves everything Greek.'],
        rural: ['Who knows? As long as he leaves the farms alone.'],
        soldier: ['Whoever the legions cheer for. That’s how it has always gone. Next question.'],
        reveler: ['Me! Vote for me! I’ll give everyone wine!'],
        gladiator: ['Whoever pays for the games.'],
      }),
  },
  {
    id: 'games',
    kind: 'city',
    ask: 'Do you go to the games?',
    who: notG('religious'),
    answer: (p) =>
      by(p, 'games', {
        plebs: ['Every day Caesar gives them. Free seats, if you get there before the sun. I’m for the thraeces; small shield, big heart. Celadus, now there was a thraex.', 'When I can. The morning hunts, the pairs in the afternoon. You haven’t lived until fifty thousand people shout Mitte at once.'],
        slave: ['When my master goes, I hold his cushion. I watch over his shoulder. It’s the best day of the month.'],
        poor: ['The seats are free. Up at the top, in the wood. It’s warm when it’s full.'],
        elite: ['I sit on the podium because I must. One pair is very like another, but one must be seen.'],
        foreign: ['Once. Your crowd frightened me more than the gladiators.'],
        rural: ['I saw a lion once. A real lion! My village thinks I’m lying.'],
        soldier: ['On duty. We stand at the vomitoria and stop the Greens killing the Blues on the way out.'],
        child: ['Father took me! A retiarius caught a man in his net like a fish! I want to be a retiarius.'],
        reveler: ['After the games is when it gets good. Everyone’s thirsty.'],
        gladiator: ['I go every day. From the other side of the wall.'],
      }),
  },
  {
    id: 'races',
    kind: 'city',
    ask: 'Greens or Blues?',
    who: notG('religious', 'gladiator'),
    answer: (p) =>
      by(p, 'races', {
        plebs: ['Greens! Always Greens. My father was Green, his father was Green. A Blue in my family would be like a Parthian.', 'Blues, and don’t start. The Greens bribed the starter at the last races. Everybody knows it.'],
        slave: ['My master is Green, so I’m Green. Secretly, Red. Nobody is Red. That’s why I like them.'],
        poor: ['Whoever wins, the bakers sell more bread. I’m for the bakers.'],
        elite: ['I do not follow the factions. (A pause.) The Greens.'],
        foreign: ['In Antioch we have the same madness. I thought I’d left it behind.'],
        rural: ['Horses should pull ploughs. But the Greens have a grey that could outrun Mercury.'],
        soldier: ['We stand between them. That’s the only side I take.'],
        child: ['Greens! Green! Green!'],
        reveler: ['Greens! No, Blues! Whoever’s buying!'],
      }),
  },
  {
    id: 'baths',
    kind: 'city',
    ask: 'Which baths do you go to?',
    who: notG('religious'),
    answer: (p) =>
      by(p, 'baths', {
        plebs: ['Trajan’s new ones on the Oppian, when I can get in. A quadrans, and you’re as clean as a senator, in the same water. That’s Rome.', 'The old ones by the Circus. The new ones are too big; you need a map to find the hot room.'],
        slave: ['When my master goes, I carry his oil and strigil and guard his clothes from the thieves in the changing room. Sometimes I get in after.'],
        poor: ['In winter, any of them, for the warmth. The attendants throw me out of the good ones.'],
        elite: ['My own, at home. One does not bathe with the Subura.'],
        foreign: ['The baths are the best thing in Rome. Better than the temples. Don’t tell the priests.'],
        rural: ['A bath every day? In the country we wash for festivals and funerals.'],
        soldier: ['After the night watch, the baths at the eighth hour. It’s the only time I feel human.'],
        child: ['The pool is cold! I jump in and scream. Everyone looks.'],
        reveler: ['The baths, then dinner, then the tavern, then the baths again. That’s a day.'],
        gladiator: ['Massage after training. The rubbers at the Ludus have hands like hammers.'],
      }),
  },
  {
    id: 'fire',
    kind: 'city',
    ask: 'Are you afraid of fire?',
    who: notG('child', 'religious'),
    answer: (p) =>
      by(p, 'fire', {
        plebs: ['Every night. Somebody upstairs knocks over a lamp, and the whole insula goes up like kindling. The vigiles come with buckets, and the landlord comes with a new lease.', 'I keep a jar of water by the door, like the prefect says. And I know which way to jump.'],
        slave: ['My master is. He makes us check the lamps twice. If the house burns because of a slave, the slave is flogged, and that’s if he’s lucky.'],
        poor: ['Fire is how I ended up out here. So yes.'],
        elite: ['I own two insulae in the Subura. Of course I am. I insure nothing, and I pray a great deal.'],
        foreign: ['In my city the houses are stone and low. Here they build a hill of wood and put people in it.'],
        rural: ['A farm fire takes a barn. A city fire takes a street. I sleep in the country.'],
        soldier: ['That’s the watch’s job, not ours. They’re mostly freedmen; brave men, for all that.'],
        reveler: ['The only fire I fear is a dry cup!'],
        gladiator: ['The Ludus is stone. Mostly.'],
      }),
  },
  {
    id: 'sleep',
    kind: 'city',
    ask: 'Can anyone sleep in this city?',
    who: notG('child', 'religious', 'elite'),
    answer: (p) =>
      by(p, 'sleep', {
        plebs: ['No. Carts all night, because they’re banned by day. Drovers swearing, the bakers before dawn, the schoolmaster before the bakers. In Rome, insomnia kills more men than fever.', 'If you can afford a quiet room. I can’t. I sleep in the afternoon, between the shouting.'],
        slave: ['I sleep across my master’s door. I sleep very lightly.'],
        poor: ['On the stone, with one eye open for thieves and the other for the vigiles.'],
        foreign: ['Romans live at night and work at night and shout at night. I have learned to sleep in the day, like a cat.'],
        rural: ['Not a wink. A cart came under my window at midnight with a load of marble and the driver singing. Singing!'],
        soldier: ['Soldiers sleep anywhere. Even here.'],
        reveler: ['Sleep? It’s barely the second watch!'],
        gladiator: ['The Ludus locks us in at night. It’s the quietest room in Rome.'],
      }),
  },
  {
    id: 'gods',
    kind: 'city',
    ask: 'Do you believe in omens?',
    answer: (p) =>
      by(p, 'gods', {
        plebs: ['I believe in not taking chances. A crow on the left, I go home. Thunder from the right, I buy a lottery token.', 'I pray at the crossroads shrine every Kalends and keep a lamp lit for the Lares. Does it work? I’m still alive, aren’t I?'],
        slave: ['We pray to the household gods with the family. And to our own gods, when nobody’s looking. Mine came from Phrygia with me.'],
        poor: ['The gods are for those who can afford a sacrifice. I pray for free, and get what I pay for.'],
        elite: ['Omens are a matter for the augurs and the state. Privately? I read Lucretius, and I keep my opinions private.'],
        foreign: ['My gods came with me: Isis, Serapis, the Mother. Rome has room for every god. It just wants them to pay their taxes.'],
        rural: ['In the country you’d be a fool not to. The gods are in every field and every spring.'],
        soldier: ['Every soldier believes in something. Mars, Mithras, his sword. Some of us take the bull’s oath, underground. Don’t ask me more.'],
        religious: ['The gods speak through the birds, the entrails and the lightning, to those who know how to listen. Most do not.'],
        child: ['There’s a ghost in our stairwell! Mother says it’s just the wind. It isn’t.'],
        reveler: ['Bacchus! The only god who answers prayers on the same night!'],
        gladiator: ['Nemesis, before every bout. She decides. The editor just agrees.'],
      }),
  },
  {
    id: 'lemuria',
    kind: 'city',
    ask: 'What will you do for the Lemuria tonight?',
    who: (p, t) => t.lemuria && groupOf(p) !== 'religious',
    answer: (p) =>
      by(p, 'lemuria', {
        plebs: ['At midnight, barefoot, I’ll throw black beans over my shoulder nine times and bang the pots. “With these beans I redeem me and mine.” My father did it. His father did it. The ghosts must be sick of beans by now.', 'Stay in. The temples are shut, no weddings, nothing new begun. These are days for the dead. Go home early, friend.'],
        slave: ['The master does the rite. We stay out of the way and don’t look behind us. Nobody looks behind them tonight.'],
        poor: ['Sleep by the fire at the crossroads with the others. The dead don’t bother you if you’re poor enough. Nothing to haunt.'],
        elite: ['My father’s rite, in the old way. Every great house does it. One does not abandon the customs of the ancestors because one has read the philosophers.'],
        foreign: ['Your ghosts are hungry for beans? Ours want honey and wine. Romans are a practical people, even dead.'],
        rural: ['Same as at home. The beans, the bronze, and don’t whistle in the dark.'],
        soldier: ['Walk my beat. Half the city is banging pots at midnight. Very bad for the nerves.'],
        child: ['Mother says if you look behind you, the Lemures take you! I won’t look. I won’t.'],
        reveler: ['Drink to the dead! They can’t drink, poor souls. More for us.'],
        gladiator: ['Every gladiator knows a few ghosts by name. I’ll pour them a cup.'],
      }),
  },
  {
    id: 'water',
    kind: 'city',
    ask: 'Is the water good here?',
    who: notG('elite', 'religious'),
    answer: (p) =>
      by(p, 'water', {
        plebs: ['The best in the world. Eleven aqueducts, and Trajan’s new one over the river for Transtiberim. The Marcia is coldest; drink from the fountains it feeds.', 'Free, at the fountains. Carrying it up five flights is the expensive part.'],
        slave: ['I carry it. Ask me how heavy it is, not how good.'],
        poor: ['Free, at the fountain. The only thing in Rome that is.'],
        foreign: ['Better than at home. You Romans build water roads across the sky. That is your genius, not your poets.'],
        rural: ['Cold and clean and comes out of a lion’s mouth! At home it comes out of a well and tastes of frog.'],
        soldier: ['Fine. It’s the wine I worry about.'],
        child: ['I drink straight from the lion’s mouth! Mother says don’t.'],
        reveler: ['Water? Mix a little with your wine. A little.'],
        gladiator: ['We get the same water as Caesar. It’s the only thing we get the same.'],
      }),
  },
  {
    id: 'foreigners',
    kind: 'city',
    ask: (p) => (groupOf(p) === 'foreign' ? 'Are there many of your people here?' : 'What do you think of all the foreigners?'),
    who: notG('child', 'religious'),
    answer: (p) =>
      by(p, 'foreigners', {
        plebs: ['Greeks, Syrians, Jews, Egyptians, Gauls. Half the city came from somewhere else. My grandfather came from Campania and they called him a foreigner.', 'They work hard and they talk fast. I don’t mind them. I mind the rent.'],
        slave: ['I’m a foreigner too, friend. We’re most of the city. The Romans just own us.'],
        poor: ['The Syrians at the bridge share their bread. The Romans don’t. Make of that what you like.'],
        elite: ['Rome is the world’s sewer now; everything flows into it. (He sighs.) But the best doctors are Greek. One makes allowances.'],
        foreign: ['Thousands. We have our streets, our gods, our cookshops. In Transtiberim you can go a whole day without hearing Latin.'],
        rural: ['I’d never seen an Egyptian before this week. Very polite. Sold me a charm against the evil eye.'],
        soldier: ['The cohorts are full of them. Thracians, Pannonians, Spaniards. A man’s a Roman when he holds the line.'],
        reveler: ['Foreigners buy wine too! Welcome, all of you!'],
        gladiator: ['The Ludus is all foreigners. Thracians, Gauls, Dacians, Germans. Sand doesn’t ask where you’re from.'],
      }),
  },
  {
    id: 'christiani',
    kind: 'city',
    ask: 'Have you heard of the Christians?',
    who: (p) => ['elite', 'foreign', 'plebs'].includes(groupOf(p)) && (p.mood === 'gossip' || p.status === 'elite' || p.status === 'foreign'),
    answer: (p) =>
      by(p, 'christiani', {
        plebs: ['The Jews’ odd cousins? Nero burned some of them, after the great fire; my grandfather saw it. They meet before dawn and sing to a dead man. Harmless, I suppose.'],
        elite: ['Pliny wrote to Caesar about them from Bithynia. A stubborn superstition: they meet before dawn, sing to their Christus as to a god, and refuse to sacrifice to the emperor’s image. Caesar told him not to hunt them, nor to accept anonymous accusations. Sensible.'],
        foreign: ['In my city there are a few. Quiet people. They share their meals and won’t eat temple meat. The butchers hate them.'],
      }),
  },
  {
    id: 'doctors',
    kind: 'city',
    ask: 'Where would I find a doctor?',
    who: notG('child'),
    answer: (p) =>
      by(p, 'doctors', {
        plebs: ['The Greeks in the Subura, if you can pay. The temple of Aesculapius on the island, if you can’t; sleep in the portico and the god sends a dream. Diaulus was a doctor; now he’s an undertaker. Same work, Martial says.', 'My wife knows herbs. Cabbage for everything, like Cato said. Cabbage and prayer.'],
        slave: ['My master’s doctor is a slave too. A Greek. He’s worth more than the house.'],
        poor: ['The island. The god takes in the old and sick slaves their masters leave there. Caesar Claudius said those who recover are free. Some recover.'],
        elite: ['My physician is from Pergamon and costs more than my horses. He tells me to eat less and walk more. I pay him to say it.'],
        foreign: ['I am one. Fifty sesterces for a consultation, and I promise not to kill you.'],
        rural: ['At home the old woman by the spring. Here? Pray, I suppose.'],
        soldier: ['The medicus of the cohort. He sews you up and tells you to stop whining.'],
        religious: ['The god Aesculapius on the island, of course. Sleep in his portico and he will come to you in a dream.'],
        reveler: ['Wine is the best doctor! Ha!'],
        gladiator: ['Hermippus, at the Ludus. Vinegar, honey and silence. Mostly silence.'],
      }),
  },
  {
    id: 'love',
    kind: 'city',
    ask: 'Are you in love?',
    who: (p) => p.age !== 'old' && !['elite', 'religious', 'child', 'soldier'].includes(groupOf(p)),
    answer: (p) =>
      by(p, 'love', {
        plebs: ['There’s a girl at the fuller’s. I wrote her name on the wall by the fountain. Somebody wrote “she doesn’t care” underneath. Somebody is right.', 'Married twelve years. That’s love, isn’t it? Or habit. At my age it’s the same thing.'],
        slave: ['With the girl in the kitchen. We can’t marry, but we can wait.'],
        poor: ['I loved a woman once. She married a baker. Smart woman.'],
        foreign: ['With a Roman woman whose father would rather see me in the arena. So, yes. Badly.'],
        rural: ['With my plough mule. She’s the only one who listens.'],
        reveler: ['With everyone! With you! Have a drink!'],
        gladiator: ['The girls write my name on the walls. That’s not love. That’s a fever with a long knife.'],
      }),
  },
  {
    id: 'alimenta',
    kind: 'city',
    ask: 'Is it true Caesar feeds poor children?',
    who: (p) => ['plebs', 'poor', 'rural'].includes(groupOf(p)),
    answer: (p) =>
      by(p, 'alimenta', {
        plebs: ['In the towns of Italy, yes. He lends money to the landowners and the interest feeds the poor children. Sixteen sestertii a month for a boy, twelve for a girl. Not in Rome, though: here we have the dole.'],
        poor: ['In the towns, they say. Every child in Veleia has bread, and I have a cup. Good for the children.'],
        rural: ['In our town, yes! The magistrates hand it out. My neighbour’s boys are fat as piglets. Bless Caesar.'],
      }),
  },
  {
    id: 'flood',
    kind: 'city',
    ask: 'Does the Tiber flood?',
    who: notG('child', 'religious'),
    answer: (p) =>
      by(p, 'flood', {
        plebs: ['Every few years. The water comes up through the drains first, then into the Velabrum, the Forum Boarium, the Campus. Boats in the streets. And afterwards the fevers.', 'The old river god takes what he wants. Mostly the ground-floor shops.'],
        poor: ['When it floods, those of us under the bridges move up the hill. The rich in their gardens move to their villas.'],
        elite: ['Caesar has been talking with the engineers about the riverbanks. Good. My warehouses are on the river.'],
        foreign: ['My lodging is by the Emporium. When the Tiber rises, I sleep on the roof with the cargo.'],
        rural: ['The river? It took half my uncle’s farm at the bend. The gods are patient; rivers aren’t.'],
        soldier: ['When it floods, the cohorts row people off the roofs. Not in my contract.'],
        slave: ['Then we carry everything upstairs. Everything. The master doesn’t carry anything.'],
        reveler: ['Water! In the streets! Disgusting. Wine should flow, not water.'],
        gladiator: ['The Ludus is on high ground. We watch the Velabrum swim.'],
      }),
  },
];

/** Stage directions follow the speaker: "(He laughs.)" from a woman reads "(She laughs.)". */
export function pronouns(p: Persona, text: string): string {
  return p.female ? text.replace(/\(He /g, '(She ').replace(/\(His /g, '(Her ') : text;
}

export const TOPICS: readonly Topic[] = [WHO, WORK, FAMILY, HOME, ...LIFE, ...CITY].map((t) => {
  const answer = t.answer;
  return { ...t, answer: (p: Persona, c: TopicContext) => pronouns(p, answer(p, c)) };
});
export const TOPIC_BY_ID: Record<string, Topic> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

/**
 * The topics this person will talk about: who they are and what they do always; then, picked for
 * them (the same every time), two from their own life (their family, their home, their freedom, the
 * dole…) and two about the city. A Vestal and her attendant say only a little.
 */
export function topicsFor(p: Persona, t: TopicContext): Topic[] {
  const ok = (x: Topic) => !x.who || x.who(p, t);
  const W = (list: Topic[]) => list.map((x) => TOPIC_BY_ID[x.id]);
  if (p.status === 'vestal') return W([WHO, WORK]);
  const life = [FAMILY, HOME, ...LIFE].filter(ok);
  const city = CITY.filter(ok);
  const pick = (list: Topic[], n: number, key: string): Topic[] => {
    const own = list.filter((x) => LIFE.includes(x));
    const out: Topic[] = [];
    // A slave asked about freedom, a beggar about how he fell: their own subject first.
    if (own.length && key === 'life') out.push(own[pickIndex(p, `${key}:own`, own.length)]);
    const rest = list.filter((x) => !out.includes(x));
    while (out.length < n && rest.length) out.push(rest.splice(pickIndex(p, `${key}:${out.length}`, rest.length), 1)[0]);
    return out;
  };
  const tonight = t.lemuria && city.find((x) => x.id === 'lemuria');
  const cityPicks = pick(city.filter((x) => x.id !== 'lemuria'), tonight ? 1 : 2, 'city');
  return W([WHO, WORK, ...pick(life, 2, 'life'), ...(tonight ? [tonight] : []), ...cityPicks]);
}

function pickIndex(p: Persona, key: string, n: number): number {
  let h = p.seed ^ 0x9e3779b9;
  for (let k = 0; k < key.length; k++) h = Math.imul(h ^ key.charCodeAt(k), 2654435761) >>> 0;
  return h % n;
}

/** The text of a question for this person. */
export function askText(topic: Topic, p: Persona): string {
  return typeof topic.ask === 'function' ? topic.ask(p) : topic.ask;
}
