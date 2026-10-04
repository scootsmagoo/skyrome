/**
 * Vendors and service people (docs/CONTENT.md §2.D): the arms dealer, the popina keeper and the
 * aedituus (the three v0.1 vendors), then the physician, barber, crier, vicomagister, cake-seller,
 * fuller, diviners, baker, perfumer, innkeeper, banker and clothier. Each has their own voice and
 * something to ask about; trade opens the barter panel (`openService('barter')`).
 *
 * Node ids quests react to: npc-philetus 'strongrooms' (mq-02: Castor's keeper sends you to the
 * loculi); npc-chreste 'hideoutRumour' (mq-01: reveals the knife-men's hideout).
 */
import { person } from '../../content/people';
import { completed, female, rotate, rumor, shut, stage, treat } from '../../content/talk';
import { defineDialogue, type DialogueContext } from '../types';

const MQ2 = 'mq-02-tabella';

// ------------------------------------------------------------------ Euhodus (arms)

const euhodus = person({
  id: 'npc-euhodus',
  greet: '(A heavy man with three gold rings, a faded-madder cloak and a scale in his hand.) Salve, salve! Tiberius Claudius Euhodus, arms and armour, new and renewed. Come in, come in, mind the stack, it falls on customers only when they’re rich. Iron from Noricum, steel from Bilbilis, prices from heaven!',
  again: ['Iron from Noricum, steel from Bilbilis, prices from heaven.', 'Parthia! Every recruit needs a sword, and every sword needs me.', 'Repairs while you wait. Waiting is extra.', 'Yes, my friend? Something to buy, something to mend, or something to confess?'],
  topics: [
    { ask: 'Business must be good, with a war coming.', say: 'Good? Magnificent. The contractors want blades for the East, the recruits want blades for the boasting, and the wives want blades for the husbands. It’s a very good spring for the contractors. (He laughs a little too loudly.) Don’t write that down.' },
    { ask: 'Do you sell army plate?', say: 'No segmentata. I don’t sell army plate. Officially. Officially, plate belongs to the legions and the cohorts, and I am a humble dealer in civilian steel. Mail? Mail is for anybody who can pay for it.' },
    { ask: 'What is the Ludus Magnus like?', say: 'Practice arms are wood. They’re wood because real arms cost money and the emperor is a careful man. But when a gladiator buys his freedom, his first purchase is always a real sword. They come here. I sharpen the dreams.', once: true },
  ],
  trade: { ask: 'Show me your wares.', service: 'barter' },
  persuade: {
    ask: 'Surely a friend of the Ludus gets a better price.',
    dc: 25,
    pass: 'Ha! A man who knows the customs. All right, all right: the Ludus and I are old friends. (He winks.) A little off for you, my friend. Don’t tell the others.',
    fail: 'A friend of the Ludus? The Ludus owes me eleven hundred sesterces. Everybody’s a friend until the bill comes.',
    reward: (c) => c.changeDisposition(8),
    once: true,
  },
});

// ------------------------------------------------------------------ Chreste (the Silver Pig)

const chreste = defineDialogue({
  id: 'npc-chreste',
  npcs: ['npc-chreste'],
  priority: 60,
  start: () => 'hub',
  nodes: {
    hub: {
      text: (c) =>
        !c.memory.met
          ? '(A stocky woman in a faded saffron tunic wields a ladle like a sceptre.) Sit or move, the step isn’t free! Vibia Chreste, keeper of the Silver Pig: an as for the house wine, two for the better, four if you want to remember Campania. Hot chickpeas! Lupins!'
          : rotate(c, '_hub', ['An as for the house wine, two for the better, four if you want to remember Campania.', 'Hot chickpeas! Lupins! Sit or move, the step isn’t free!', 'Dice in my popina and the aedile’s men will drink for free. On you.', 'Drink, eat, or make room. I run a house, not a temple.']),
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'What are you serving?', end: true, effects: (c) => c.openService('barter') },
        { text: 'What’s the word on the street?', goto: 'news' },
        { text: 'You must hear everything here. Anything about the courier killed at the Porta Capena?', if: (c) => completed(c, 'mq-01-madida-capena') || !!c.flag('festus-dead'), goto: 'courier', once: true },
        { text: 'Hear anything about knife-men in the Velabrum?', goto: 'hideoutRumour', once: true },
        { text: 'A cup on the house for a traveller?', check: { skill: 'rhetoric', difficulty: 25, pass: 'free', fail: 'notFree' }, once: true },
        { text: 'Vale.', end: true },
      ],
    },
    news: { text: (c) => rumor(c), next: 'hub' },
    courier: {
      text: 'A courier at the gate, before dawn. I heard it from the carter, who heard it from his mule. Dromo’s telling it at the Starting Gates by now, with a few more knives. They say it was gladiators. I say it was men who needed a purse. Same thing.',
      next: 'hub',
    },
    hideoutRumour: {
      text: 'Knife-men in the burned taberna, so they say. Back along the Vicus Tuscus, the one with the collapsed upper floor. I say nothing. I sell wine. (She lowers her voice.) On ghost night you pay before midnight. After midnight the dead pay, and the dead are terrible at it.',
      effects: (c) => c.setFlag('hideout-known', true),
      next: 'hub',
    },
    free: { text: '(She snorts, fills a cup from the cheap jar and thumps it down.) One. And only because you didn’t cry about it.', effects: (c) => c.giveItem('vinum'), next: 'hub' },
    notFree: { text: 'On the house? The house is a business, traveller, not a charity.', next: 'hub' },
  },
});

// ------------------------------------------------------------------ Philetus (aedituus of Castor)

const closedGreeting = (c: DialogueContext) => shut(c) && stage(c, MQ2) !== undefined && ['start', 'loculi'].includes(stage(c, MQ2)!);

const philetus = defineDialogue({
  id: 'npc-philetus',
  npcs: ['npc-philetus'],
  priority: 70,
  start: (c) => (shut(c) ? (closedGreeting(c) ? 'n0' : 'shut') : 'open'),
  nodes: {
    // ---- the Lemuria: the doors are shut (AC-18); the strongrooms are not (dlg-mq02-philetus)
    n0: {
      text: 'The doors are shut, citizen. The Lemures walk tonight, and the gods do not receive on the days of the dead.',
      choices: [
        { text: 'I’m looking for the strongrooms.', goto: 'strongrooms' },
        { text: 'Can I make an offering anyway?', goto: 'n2' },
        { text: 'Ghosts? Do you believe that?', goto: 'n3' },
      ],
    },
    strongrooms: { text: 'Ah, the bankers’ cellars. Down the west side, under the podium, the little doors. They’re not the god’s; they don’t close for him.', end: true },
    n2: { text: 'At the crossroads shrines, yes. The Lares are always at home. Here, come back tomorrow.', next: 'n0' },
    n3: { text: 'I believe the doors are shut. The rest is between you and your grandfather.', next: 'n0' },
    shut: {
      text: 'The Lemures walk tonight. The god’s doors stay shut. Come back tomorrow. (He touches the black wool fillet hung across the bronze.) Twins, both divine, both horsemen, both patient. Unlike my visitors.',
      choices: [
        { text: 'The strongrooms?', goto: 'strongrooms' },
        { text: 'Make an offering?', goto: 'n2' },
        { text: 'Vale.', end: true },
      ],
    },
    // ---- an ordinary day: the temple is open
    open: {
      text: (c) =>
        !c.memory.met
          ? '(A slight freedman with a ring of bronze keys, a willow wreath on his head.) Marcus Pomponius Philetus, keeper of the house of Castor and Pollux. Twins, both divine, both horsemen, both patient. Unlike my visitors.'
          : rotate(c, '_open', ['An offering for the Dioscuri? A cake will do. A coin will do better.', 'The strongrooms? Down the side, under the podium. They’re not the god’s; they’re the bankers’.', 'Twins, both divine, both horsemen, both patient.']),
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'I would make an offering to the Twins.', goto: 'offer' },
        { text: 'What do you sell?', end: true, effects: (c) => c.openService('barter') },
        { text: 'Teach me. (Rites)', end: true, effects: (c) => c.openService('train') },
        { text: 'Where are the strongrooms?', goto: 'strongrooms2' },
        { text: 'Vale.', end: true },
      ],
    },
    strongrooms2: { text: 'Down the side, under the podium. They’re not the god’s; they’re the bankers’. Chrysippus keeps the door, and counts everything aloud.', next: 'open' },
    offer: {
      text: 'What will you give the Twins? A honey cake is enough; the gods are not greedy. A denarius is generous.',
      choices: [
        { text: 'A honey cake (libum).', enabled: (c) => c.hasItem('libum'), goto: 'blessed', effects: (c) => void c.game.devotion?.prayAtTemple('temple-castor-pollux', { itemId: 'libum' }) },
        { text: 'A pinch of incense (tus).', enabled: (c) => c.hasItem('tus'), goto: 'blessed', effects: (c) => void c.game.devotion?.prayAtTemple('temple-castor-pollux', { itemId: 'tus' }) },
        { text: 'A denarius.', enabled: (c) => c.denarii() >= 1, goto: 'blessed', effects: (c) => void c.game.devotion?.prayAtTemple('temple-castor-pollux', { denarii: 1 }) },
        { text: 'Not now.', goto: 'open' },
      ],
    },
    blessed: { text: '(He takes the offering into the pronaos, says the words, and a little smoke goes up. Outside, a gust lifts the dust in the Forum like hooves.) The Twins ride with you. Go swiftly.', end: true },
  },
});

// ------------------------------------------------------------------ the rest of the trades

const demetrius = person({
  id: 'npc-demetrius',
  greet: '(A slight Greek with a short beard and a case of bronze instruments.) Demetrius of Tralles, physician. Wine for the wound, honey for the scar, and two denarii for me. Archigenes charges a senator’s fee. I charge a baker’s. Choose.',
  topics: [
    { ask: 'Who is Archigenes?', say: 'The fashionable man. Apamea, a villa on the Quirinal, and a smile that costs fifty denarii. He is very good and I have never forgiven him.' },
    { ask: 'Any advice for a fighter?', say: 'Clean the cut before you bind it, and don’t listen to the man who says to pour in oil. That is a cook’s idea of medicine.' },
  ],
  trade: { ask: 'Show me your remedies.', service: 'barter' },
  choices: [{ text: 'Treat my wounds. (2 den.)', enabled: (c) => c.denarii() >= 2, goto: 'healed', effects: (c) => { if (c.pay(2)) treat(c); } }],
  nodes: { healed: { text: '(He works with a quick, dry competence.) There. Don’t thank me; thank Aesculapius. He sends the patients.', next: 'hub' } },
});

const tryphon = person({
  id: 'npc-tryphon',
  greet: '(A slight man with oiled curls and a razor that catches the light.) A shave, citizen? You look like a mourner, or a philosopher, or worse, a Greek. Sit still. My razor is fast and my tongue is faster.',
  topics: [
    { ask: 'They say the emperor shaves himself.', say: 'They say a lot of things. They say he shaves with a Dacian dagger. They say he doesn’t shave at all, and that Plotina trims him with a pair of golden shears. I say a man’s chin is his own business, but this is a barber’s shop.' },
    { ask: 'Have you seen a lost dog? A Molossian bitch.', say: 'Hilara! The aedile’s man’s bitch? Her notice is on the pier outside, twenty sesterces to whoever brings her to me. She answers to nothing. If you find her, bring her. If you can’t, bring me an excuse.' },
  ],
  news: 'What’s the gossip?',
});

const cerdo = person({
  id: 'npc-cerdo',
  greet: '(A heavy man with a voice that could stop a legion.) HEAR, QUIRITES! … Oh. One citizen. Lucius Seius Cerdo, public crier. I only shout for groups. For you: a murmur.',
  again: ['Hear, Quirites! A bronze pot has walked out of a shop in the Vicus Tuscus. Sixty-five sesterces for its return, more for the thief!', 'Lost: a Molossian bitch answering to Hilara. She answers to nothing. Reward.', 'Tomorrow, the gods willing, Caesar dedicates his column. The Forum will be closed to carts from the fourth hour.', 'The Lemures walk tonight! The temples are shut! The taverns are not!'],
  topics: [{ ask: 'What are you announcing today?', say: 'The Column! Tomorrow, the first hour, Caesar and the Senate and the whole city. A hundred feet of marble, and the war carved on it like a ribbon. And a lost dog. People care more about the dog.' }],
  news: 'Anything I should know?',
});

const zethus = defineDialogue({
  id: 'npc-zethus',
  npcs: ['npc-zethus'],
  priority: 60,
  start: () => 'hub',
  nodes: {
    hub: {
      text: (c) => (!c.memory.met ? '(A fussy old freedman in a purple-bordered toga, a broom in the crook of his arm.) Marcus Lucretius Zethus, vicomagister of the Vicus Tuscus. The Lares see the whole street. Behave as if they do.' : rotate(c, '_hub', ['A pinch of incense costs an as. Bad luck costs more.', 'We renewed our altar this January, when Celsus was consul again. Look, it’s carved.', 'The Lares see the whole street. Behave as if they do.'])),
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'What are the Lares?', goto: 'lares', once: true },
        { text: 'How do I pray here?', goto: 'pray' },
        { text: 'Teach me. (Rites)', end: true, effects: (c) => c.openService('train') },
        { text: 'Vale.', end: true },
      ],
    },
    lares: { text: 'The household spirits of every crossroads, protectors of the neighbourhood. Every vicus has its shrine, and four magistrates, myself included, to keep it clean and the lamp lit. The emperor’s Genius is honoured with them since the divine Augustus. Mind your manners at the altar.', next: 'hub' },
    pray: {
      text: 'You stand at the altar and say the words you know. The Lares favour piety, not eloquence. A pinch of incense or a honey cake helps, but the prayer is free, and the favour of the Lares comes with it: you’ll walk lighter for the next two hours. Once a day each shrine gives you its due; the gods don’t like to be nagged.',
      effects: (c) => c.setFlag('lares-explained', true),
      next: 'hub',
    },
  },
});

const fortunata = person({
  id: 'npc-fortunata',
  greet: '(A slim woman with a tray of honey cakes, an apron and bare feet.) Liba! Honey cakes for the gods and for you! One for Castor, one for Pollux, one for your stomach.',
  again: ['Shut for the dead today, but the gods still eat tomorrow.', 'Liba! Fresh honey cakes!', 'Incense for the gods, honey for the soul.'],
  topics: [{ ask: 'Why are you at the shut doors?', say: 'Because the faithful come anyway, and they’re always hungry. The gods can wait. I can’t.' }],
  trade: { ask: 'I’ll buy something.', service: 'barter' },
});

const cerinthus = defineDialogue({
  id: 'npc-cerinthus',
  npcs: ['npc-cerinthus'],
  priority: 60,
  start: () => 'hub',
  nodes: {
    hub: {
      text: (c) => (!c.memory.met ? '(A stocky man grey to the knee with the dyes and ammonia of his trade.) Cerinthus, fuller of the Velabrum. Bring me your stains. I’ve a vat for everything, and you don’t want to know what’s in it.' : rotate(c, '_hub', ['Minerva’s my goddess. Urine’s my trade.', 'Non olet, said the deified Vespasian. He never smelled my yard.', 'Bring me your stains.'])),
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'Wash my tunic. (4 as.)', if: (c) => c.game.standing?.cleanliness === 'sordidus', enabled: (c) => c.denarii() >= 0.25, goto: 'washed', effects: (c) => { if (c.pay(0.25)) c.game.standing?.setCleanliness('normal'); } },
        { text: 'What do you buy?', end: true, effects: (c) => c.openService('barter') },
        { text: 'What’s in the vats?', goto: 'vats', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    washed: { text: '(He takes the tunic, dunks it, treads it, hangs it, and hands you a damp but remarkably clean one.) There. Smells like rain on a good day.', next: 'hub' },
    vats: { text: 'Stale urine, fuller’s earth, soda, and a secret I will not tell. Rome sends me its dirt, and I send it back in white. Somebody has to wash the senators.', next: 'hub' },
  },
});

const zenon = defineDialogue({
  id: 'npc-zenon',
  npcs: ['npc-zenon'],
  priority: 60,
  start: () => 'hub',
  nodes: {
    hub: {
      text: (c) => (!c.memory.met ? '(A thin Easterner with a full beard, a mantle sewn with stars and a bronze sphere in his hands.) Your nativity, citizen? Saturn in the eighth. Terrible. Ten denarii and I’ll fix it. Zenon of Seleucia, who reads the heavens for the great and the small.' : rotate(c, '_hub', ['The stars incline; they do not compel. Mostly.', 'Whose stars? Nobody’s. Everybody’s. Don’t ask.', 'Saturn in the eighth. Terrible. Ten denarii and I’ll fix it.'])),
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'Cast my nativity. (10 den.)', enabled: (c) => c.denarii() >= 10, goto: 'cast', effects: (c) => void c.pay(10) },
        { text: 'A cheap leaf of predictions. (1 as.)', enabled: (c) => c.denarii() >= 1 / 16, goto: 'leaf', effects: (c) => { if (c.pay(1 / 16)) c.giveItem('tabella-mathematici'); } },
        { text: 'Is it true the stars rule us?', goto: 'rule', once: true },
        { text: 'What will happen tomorrow?', goto: 'tomorrow', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    cast: {
      text: (c) => (female(c) ? 'A woman born under Venus rising in the second house: you will be loved, envied and misquoted. The Moon stands in your tenth house; a rise, or a fall. I’m not sure which. It’s quite visible.' : 'Mars in the third house: you will be stubborn and brave. Jupiter in the sixth: you will be forgiven. Saturn in the eighth: a journey, a loss, a letter. I’d say watch the letters.') + ' (He pockets your denarii with a flourish.) Confidence is half the horoscope.',
      next: 'hub',
    },
    leaf: { text: '(He tears a papyrus leaf from a stack and presses it into your hand.) For one as, the heavens’ cheapest advice. Don’t lend fire to a neighbour on the ghost nights.', next: 'hub' },
    rule: { text: 'The stars incline; they do not compel. (He looks over his shoulder.) Mostly. The moment I say otherwise, the Prefect of the City takes an interest. There are mathematici in exile on the islands for saying less.', next: 'hub' },
    tomorrow: { text: 'Tomorrow? The sun is in Taurus, the Moon is fast, and the emperor is going to dedicate a very tall column. I could cast the day for him, but I’m not mad.', next: 'hub' },
  },
});

/** A paid hint (§7.2: a haruspex reading points at the next step of the tracked quest). */
function haruspicy(c: DialogueContext): string {
  const q = c.game.quests;
  const id = q?.tracked;
  const next = id ? q!.objectives(id).find((o) => o.active && !o.done && !o.optional) : undefined;
  if (!next) return '(He reads the liver for a long time.) Calm. Nothing is asked of you today. Go to the baths.';
  return `(He turns the liver to the light and traces a vein with his finger.) The left lobe is swollen toward the place of the gods of the road. The gods say: “${next.text}.” And soon. (He wipes his hands.) Two denarii well spent.`;
}

const arruns = defineDialogue({
  id: 'npc-arruns',
  npcs: ['npc-arruns'],
  priority: 60,
  start: () => 'hub',
  nodes: {
    hub: {
      text: (c) => (!c.memory.met ? '(A heavy old man with a pointed leather cap and a fringed cloak, in front of a painted liver.) The liver does not lie. Men lie. Livers are honest. Arruns, who reads what the gods write on the inside. Two denarii, and the gods will whisper. Five, and they’ll speak up.' : rotate(c, '_hub', ['The liver does not lie. Men lie. Livers are honest.', 'Ask the Chaldaean whose stars he sells. Go on, ask him.', 'Two denarii, and the gods will whisper.'])),
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'Read the liver. (2 den.)', enabled: (c) => c.denarii() >= 2, goto: 'read', effects: (c) => void c.pay(2) },
        { text: 'Why do you read the liver and not the stars?', goto: 'why', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    read: { text: (c) => haruspicy(c), next: 'hub' },
    why: { text: 'The stars are Chaldaean arithmetic, a foreign sum with a foreign answer. My people read the god’s own handwriting on the entrails. Slow, honest, and a little messy. (He wipes his fingers on the cloak.) The Senate still consults us. The Senate has never consulted a Chaldaean.', next: 'hub' },
  },
});

const philadelphus = person({
  id: 'npc-philadelphus',
  greet: '(A heavy man dusted with flour, a donkey-driven mill grinding behind him.) Bread! Still warm, unlike the city. Philadelphus, baker of the Velabrum. A hundred modii a day for three years and I’m a citizen. Ninety-one to go today.',
  topics: [
    { ask: 'What is this about citizenship?', say: 'Trajan’s edict. A Latin of the Junian kind who bakes a hundred modii a day for three years is made a citizen. The divine Trajan loves bread and he loves a loophole. I have the finest loophole in Rome.' },
    { ask: 'Is it true bakers work all night?', say: 'The fourth watch is the busy one. The donkeys turn the mill, I turn the donkeys. By the first hour the Forum wakes and wakes hungry.' },
  ],
  trade: { ask: 'I’d like some bread.', service: 'barter' },
});

const fadia = person({
  id: 'npc-fadia',
  greet: '(A slim woman with henna-red hair and glass flasks at her belt.) Nard from India, myrrh from Arabia, honesty from nowhere, sadly. Fadia Musa, unguentaria. Smell that? That’s money that hasn’t been spent yet.',
  topics: [
    { ask: 'Is the nard real?', say: 'Real? Real is a strong word. Pliny says half the nard in Rome is grass in an alabaster flask. The other half is mine.' },
    { ask: 'What do you do on the Ides of May?', say: 'The Mercuralia! Every merchant sprinkles himself from Mercury’s spring by the Capena Gate with a laurel branch and begs the god’s forgiveness for his cheating. I go early. I have a great deal to be forgiven.' },
  ],
  trade: { ask: 'What do you stock?', service: 'barter' },
});

const dama = person({
  id: 'npc-dama',
  greet: '(A bald, heavy man with an apron and a rag over one shoulder.) Lucius Novius Dama, keeper of the Inn at the Starting Gates. A bed for four asses, fleas for free. Race days I triple the price and nobody notices.',
  topics: [{ ask: 'The carter is telling a story about a murder.', say: 'He’s been telling it since dawn. It gets better every cup. By tonight the courier will have been a Parthian prince and the carter will have killed all three.' }],
  trade: { ask: 'What have you got to eat and drink?', service: 'barter' },
  news: 'Anything new?',
  choices: [{ text: 'A room for the night. (4 as.)', goto: 'room', effects: (c) => c.openService('rent') }],
  nodes: { room: { text: 'A bed, a blanket, and fleas thrown in.', end: true } },
});

const hermogenes = person({
  id: 'npc-hermogenes',
  greet: '(A slight man in a citizen’s toga, a touchstone in his fingers.) Hermogenes, argentarius. One in the hundred a month. The law’s limit, and my pleasure. Plated denarii? Not at my table. Bite them yourself.',
  topics: [
    { ask: 'Do you lend to soldiers?', say: 'Letters of credit to Brundisium, Antioch, anywhere Caesar goes. Soldiers, merchants, senators, widows. A debtor is a patron with the roles reversed.' },
    { ask: 'You seem interested in everyone’s debts.', say: 'Everyone is, once they’ve got one. (He smiles very slightly.) I take an interest in people’s futures. It’s the same thing, with better manners.' },
  ],
  trade: { ask: 'I have valuables to sell.', service: 'barter' },
});

const tychicus = person({
  id: 'npc-tychicus',
  greet: '(A man in a good white tunic and a sea-green cloak.) A toga for a citizen, a palla for a lady, a hood for a man with a past. Tychicus, clothier. Dyed in Tarentum, cut in Rome, worn by the lucky.',
  topics: [
    { ask: 'Anything to be careful about when buying a toga?', say: 'The toga is sold to anyone. Wearing it is the crime. A man who isn’t a citizen in a toga, or a woman who isn’t a matron in a stola: they’ll let me sell it, and let the aediles deal with you.' },
    { ask: 'You close early?', say: 'We close early on some nights. Don’t ask which.', once: true },
  ],
  trade: { ask: 'Show me what you have.', service: 'barter' },
});

export default [euhodus, chreste, philetus, demetrius, tryphon, cerdo, zethus, fortunata, cerinthus, zenon, arruns, philadelphus, fadia, dama, hermogenes, tychicus];
