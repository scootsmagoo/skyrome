/**
 * Barks: one-liners spoken in passing, shown as subtitles with the speaker's name (GDD §15.1;
 * every bark is subtitled, §4.5). Latin interjections come with an English gloss in the same line.
 * Sources: society.md §7 (greetings, oaths, insults, proverbs), §3.5 (Juvenal 3, Martial 12.57).
 *
 * Tables are keyed by situation and role; named NPCs' own `NpcDef.barks` take precedence for
 * greetings and ambient lines. `BarkDirector` rations them: one subtitle every few seconds, each
 * speaker at most every ~30 s, and no line repeated until a dozen others have been heard.
 */
import type { Rng } from '../core/Rng';
import type { DayPhase } from './crowd/budget';

export type BarkKind = 'greet' | 'ambient' | 'shoved' | 'weapon' | 'flee' | 'gawk' | 'guard' | 'brushoff' | 'vendor' | 'crime' | 'sordidus' | 'lautus';

type Table = Record<string, readonly string[]>;

/** Greetings and lines said to the player passing close by, per bark table. */
const GREET: Table = {
  citizen: ['Salve! Good day to you.', 'Salve, friend.', 'Quid agis? Keeping well?', 'Vale. Mind the crowds.', 'Fine day for it, eh?'],
  woman: ['Salve.', 'Good day.', 'Ecastor, what a crowd today.'],
  senator: ['Hm.', 'Make way, if you please.', 'Out of my light, fellow.'],
  client: ['Salve! Have you seen my patron?', 'Make way for our patron!'],
  matron: ['Salve.', 'Mind my stola, please.'],
  slave: ['Pardon, domine.', 'Excuse me, sir.', 'Salve, domine.'],
  merchant: ['Salve lucrum! Welcome, profit — and welcome, you.', 'Something for your lady, domine?', 'Best prices on the Sacra Via!'],
  worker: ['Salve.', 'Mind the dust.', 'Good day for work, bad day for my back.'],
  soldier: ['Move along, citizen.', 'Keep the peace.', 'Eyes front.', 'Salve. No trouble today, eh?'],
  vigil: ['Who goes there? Ah. Carry on.', 'Mind your lamps tonight — no fires.', 'Late to be out, citizen.'],
  priest: ['The gods keep you.', 'Favete linguis — keep holy silence near the temple.', 'Pax deorum, friend.'],
  vestal: ['…'],
  idler: ['Salve! Fancy a throw of the bones?', 'Ave, stranger. Sit, if you like.'],
  beggar: ['An as, domine? Just one.', 'Spare a coin for a shipwrecked sailor?', 'Bless you, bless you.'],
  child: ['Look, a soldier!', 'Salve! Are you a gladiator?', 'Race you to the fountain!'],
  elder: ['Salve, young one.', 'Mind an old man, would you.'],
  foreigner: ['Chaire! Er — salve.', 'Salve. Is this the way to the Forum?', 'So many people!'],
  reveler: ['Bene sit tibi! Your health!', 'Propino tibi! I drink to you!', 'Salve, salve, salve!'],
  carter: ['Out of the way! Wheels!', 'Mind the mule.'],
  farmer: ['Salve! Fresh from Aricia, these.', 'Mind the basket, friend.', 'Salve. Is the market open yet?'],
  traveller: ['Salve! Is this Rome, then? It looks bigger from the hills.', 'Salve. Which way to the Forum?', 'Forty miles on foot. My feet are Roman now.'],
  portitor: ['Anything to declare? Everything has a duty.', 'Goods in? Two and a half in the hundred.', 'Salve. Open the bundle, please.'],
  sortilega: ['Your palm, stranger? The Circus knows your fate.', 'Sit, sit. The stars are cheap today.', 'I see a long road behind you. And a short purse.'],
  argentarius: ['Change! Good silver, honest weight!', 'Denarii for sestertii, fair rates!', 'A loan, domine? Interest by the month.'],
  tibicen: ['Favete linguis! Hold your tongue while the flute plays.', 'Hush now — the priest is at the altar.'],
  scriba: ['A letter, domine? Greek or Latin, a sestertius a page.', 'Petitions, contracts, love letters — neat hand, no questions.', 'Your will, sir? Best get it written while you can.'],
  margaritarius: ['Pearls from the Red Sea, domina. Real ones — bite them.', 'Emeralds from Egypt! Sardonyx from India!', 'For your wife, domine? Or for someone else\'s?'],
  piperarius: ['Pepper! Black and long, straight from the Horrea Piperataria.', 'Cinnamon, malabathrum, ginger — the whole of the East in a sack.'],
  librarius: ['New Martial, domine — the latest book, five denarii, pumice-smooth.', 'Read the first lines before you buy. Everyone does.', 'Livy in a hundred and forty-two rolls. I\'ll deliver.'],
  sutor: ['Soles mended while you wait!', 'Calcei, soleae, boots for the road — your size by tomorrow.'],
  thermopolium: ['Hot wine with honey! Chickpeas! Sausage in the pot!', 'Calda! Calda! Hot water and wine, an as a cup.', 'Lentils and leeks, still hot. Sit, eat.'],
  tonsor: ['A shave, domine? Steady hand, no blood. Well — little blood.', 'Sit, sit. The razor\'s sharp and the news is fresh.'],
  magister: ['Quiet, boys! Again: A, B, C…', 'Sing the twelve times! Louder, or the ferula sings instead.'],
  fullo: ['Mind your toga, citizen — we\'ll have it white as the Vestals\'.', 'Out of the way of the vats!'],
  pistor: ['Fresh bread! Hot from the oven!', 'Panis siligineus — white as snow! Or the brown, cheaper.', 'Loaves for the house, domina?'],
  vinarius: ['Falernian! Well — near enough.', 'Wine from Campania, wine from Sabinum, wine from wherever you like.', 'A jug for the house? Watered to your taste.'],
  ostiarius: ['Wait your turn, citizen. The master receives at dawn.', 'Names, please. Clients on the left.'],
  caseus: ['Smoked cheese of the Velabrum! Smells like the fire that made it!', 'Cheese from Luna, cheese from the Alps — taste first.'],
  lanius: ['Pork! Fresh this morning!', 'Tripe and sausage — cheap and filling.'],
  factio: ['Greens! The Greens! Prasina!', 'The Blues ride like old women.'],
  libelli: ['Today\'s card! Every pair, every name! An as!', 'Cushions for the stone seats! You\'ll thank me by the tenth pair!'],
  nauta: ['Salve. We pull the awning over the whole Colosseum, you know. By hand.', 'Fleet of Misenum. Best sailors that never see the sea.'],
  balneator: ['A quadrans for the baths, citizen. Doors open at the eighth hour.', 'Leave your clothes with the capsarius — or lose them.'],
  botularius: ['Sausages! Hot sausages! Botuli!', 'Something to eat after the sweat room?'],
  piscator: ['Mullet from Ostia! Still wet!', 'Oysters from the Lucrine lake! Eel! Bream!'],
  frumentum: ['Token, citizen. Your tessera. Next.', 'Five modii a month, by Caesar\'s grace. Next!'],
  saepta: ['Corinthian bronze, domine — the real alloy, look at the colour.', 'Silk from the Seres, by way of Alexandria.', 'Tortoiseshell couches! Citrus-wood tables!'],
  haruspex: ['The liver is clear. The gods consent.', 'Stand back, please. The entrails speak softly.'],
  gladiator: ['Ave. Come to watch the barley-eaters sweat?', 'Mind the palus, friend. It hits back.', 'Salve. Got a coin for a man who might die on the Ides?'],
  rudis: ['Off the sand, citizen! The editor is watching.', 'Back to the stands with you.', 'Out of the way — this is a fight, not a promenade.'],
};

/** Overheard chatter. Generic lines first; role and district lines are mixed in. */
const AMBIENT: Table = {
  tibicen: ['The flute must not stop. One wrong note, one ill word, and they start again.'],
  scriba: ['Third will today. Rome is dying faster than I can write.', 'He wants it to sound like Cicero. On his budget, Ennius.'],
  librarius: ['Martial again. Everyone wants Martial and nobody wants to pay for him.', 'The copyists are on book three. Book three!'],
  thermopolium: ['The aediles were round about the hot water again.', 'Tavern-keepers, they say. As if Caesar never ate.'],
  tonsor: ['…and then the praetor\'s wife — hold still — the praetor\'s wife said…', 'Every man in Rome comes through a barber\'s chair. I hear everything.'],
  magister: ['Since before dawn. The cocks haven\'t crowed and I\'m hoarse.', 'Their fathers pay me at the Ides. If they remember.'],
  fullo: ['Urine and fuller\'s earth. You get used to it. Mostly.', 'Caesar taxes the urine now, did you know? Pecunia non olet.'],
  pistor: ['Up since the second watch. The donkey too, poor beast.', 'The dole\'s grain is good, but the bread\'s ours.'],
  vinarius: ['The wine\'s honest. The water — that\'s the Aqua Marcia, best in Rome.'],
  ostiarius: ['Every morning, the same faces. Same togas. Same hopes.'],
  factio: ['Scorpus would\'ve won that by a length.', 'They say the Greens bribed the starter.', 'Four horses and a fool — the Blues\' whole team.'],
  libelli: ['Big crowd today. The Thracian\'s on.', 'Caesar\'s games — they say ten thousand pairs this year.'],
  nauta: ['The awning\'s down when the wind\'s up. Then they blame us for the sun.'],
  balneator: ['The furnaces were lit at dawn. Hottest caldarium in Rome.', 'Trajan\'s baths. Apollodorus built them. Big enough to get lost in.'],
  frumentum: ['Two hundred thousand on the list. All of them in this queue, it feels.', 'Next month the ships come from Egypt. If they come.'],
  haruspex: ['The Etruscans knew. A lobe out of place and the war goes badly.'],
  gladiator: ['Hordearii, they call us. Barley-eaters. Try fighting on barley.', 'Three hundred cuts at the post before the doctor lets us eat.', 'Next munus I\'m on the card. Against a retiarius, they say.', 'Glaucus says I parry like a drunk Gaul.', 'The bath after the drill is the only good hour of the day.'],
  rudis: ['Feet! Watch his feet!', 'Break! Break, I said!', 'Clean, now. The editor wants a clean fight.', 'Up, up — he\'s not done yet.'],
  citizen: [
    'They say Caesar will march east before winter. Parthia, this time.',
    'Bread\'s gone up again. The baker swears it\'s the grain ships.',
    'They\'re dedicating Caesar\'s column any day now. His whole Dacian war, carved in marble.',
    'Here everything costs money. Even a nod from a great man\'s door-slave costs a tip.',
    'My rent for a year in this dark hole would buy a house at Sora.',
    'Who can sleep in a rented room? Carts all night, bakers before dawn.',
    'The Greens will win at the Circus. Mark me.',
    'Manus manum lavat — one hand washes the other. That\'s how it works here.',
    'Festina lente, my father used to say. Hurry slowly.',
  ],
  woman: ['The fuller ruined my good tunic. Urine and all, and still a stain.', 'Ecastor, the price of oil!', 'My sister swears by the Bona Dea for her fevers.'],
  senator: ['The Senate sits again. Tedious.', 'Pliny writes from Bithynia about aqueducts. Aqueducts!', 'Three clients and not one of them could find my litter.'],
  client: ['The sportula was a pittance this morning.', 'Up before dawn for a nod and a few coins.'],
  matron: ['Ecastor! Such manners in the street.', 'The Vestals looked radiant at the rite.'],
  slave: ['Heavy amphora, light pay — none, actually.', 'My master wants it before the sixth hour.', 'Faster, faster, the cook says. As if I had wings.'],
  merchant: ['Pearls from the Red Sea! Real ones!', 'Pepper, fresh from the Horrea Piperataria!', 'Salve lucrum — welcome, profit!'],
  worker: ['Another block for Caesar\'s forum.', 'My back is older than I am.', 'Ligurian marble. Heavier than the Senate\'s speeches.'],
  soldier: ['Quiet day. Too quiet.', 'Third watch again tonight.', 'Keep your purse inside your tunic, citizen.'],
  vigil: ['Bucket, blanket and a long night.', 'Smell that? No — just someone\'s supper.', 'Fourth watch. Then sleep.'],
  priest: ['The auspices were favourable this morning.', 'The gods are patient. Mostly.'],
  vestal: ['Vesta\'s fire burns. Rome endures.'],
  idler: ['Venus! The throw of Venus!', 'The dog again! Curse these bones.', 'I\'ve been sitting on these steps since the Ides.'],
  beggar: ['An as, an as for an old soldier…', 'The gods see who gives.'],
  child: ['Tag! You\'re it!', 'I saw a real gladiator yesterday!'],
  elder: ['In my day the Forum was cleaner.', 'I remember when Domitian… no, best not.', 'Fires, collapsing roofs, poets reciting in August. Savage city.'],
  foreigner: ['The Syrian Orontes flows into the Tiber now, they say. Good for business.', 'Rome! So much noise.', 'Where in all this marble do they keep the scribes?'],
  reveler: ['Hic! To the Greens!', 'One more cup! Just one!', 'Where are you from? Whose sour wine and beans are you full of?'],
  carter: ['Di te perdant, beast — move!', 'Marble for the new forum, and not a moment past dawn.'],
  farmer: [
    'Cabbages from my own field, and the Velabrum men want them for nothing.',
    'Up at the second watch to walk in. The city sleeps till the first hour.',
    'Eggs, cheese and a kid goat. Not bad for a morning.',
    'My brother sells at the Macellum. I sell at the gate. He pays rent.',
  ],
  traveller: [
    'Brundisium to Rome in nine days. My mule did better than I did.',
    'The inn at Aricia had fleas the size of denarii.',
    'They say you can buy anything in Rome. Even justice, if you can find the seller.',
    'Is it always this loud? It\'s not even dawn.',
  ],
  portitor: ['Wine, oil, a slave girl — everything pays at the gate.', 'You\'d be amazed what people hide in a cabbage.'],
  sortilega: ['Chaldean stars, Phrygian augury, Etruscan livers. One price.', 'The Greens win on the Ides. Trust me.'],
  argentarius: ['Rates from Puteoli this morning: silver steady, gold up.', 'Clipped coin. I can always tell.'],
};

/**
 * Lines tied to a district (mixed into ambient chatter there, by day). The first lines of each
 * district are from the content bible (docs/CONTENT.md §8.1).
 */
const DISTRICT: Table = {
  'dist-forum-romanum': [
    'Three days the judges have slept through my case. Today they snored in my favour.',
    'Change! Denarii for sestertii, sestertii for asses, asses for nothing!',
    "Who's the one in the purple? Don't point. Never point.",
    'I came to sue my brother-in-law and stayed for the gossip.',
    'A senator fell off the Rostra this morning. Pushed, they say. Tripped, I say.',
    "Mind the steps. They're older than your grandfather and twice as slippery.",
    'Another case at the Basilica Julia. An inheritance, of course.',
    "Somebody's cut a new gaming board into the steps.",
  ],
  'dist-fora-imperialia': [
    "Garlands up, scaffolds down, and if anyone drops a hammer on Caesar, it wasn't me.",
    "A hundred feet. Hundred and eighty-five steps inside, they say. Don't ask how I know.",
    'Every soldier on it has a face. Mine would look better in marble.',
    'Dacian prisoners cut half this stone. Now they can watch themselves losing, all the way up.',
    "Mind the paint! It's for the gods, not your elbow!",
  ],
  'dist-velia': [
    'Pearls! Red Sea pearls! Tears of the sea at the price of a farm!',
    'Pepper from India, cinnamon from the end of the world, and change from me.',
    "The Colossus wears the Sun's face now. The old one had Nero's. I prefer the Sun's.",
    "Smell that? That's the Piperataria. You can't afford it, but breathing's free.",
    'Jewels for the lady, rings for the knight, glass for everyone else.',
  ],
  'dist-vallis-colossei': [
    'Nereus! Nereus! Thirty-one and never touched!',
    'I sat behind a sailor at the last games. He rigged the awning and dripped on me all afternoon.',
    'My wife made me promise not to bet. So I promised.',
    "Drink from the Meta, citizen. The water's sweating for you.",
    "Hear that clacking? Wooden swords. They start at the first hour. I haven't slept past the second in three years.",
  ],
  'dist-circus-maximus': [
    'Greens for ever! Blues for the boneyard!',
    'Your future, citizen? One denarius for the past, two for the future, five if you want it good.',
    'They say Trajan made the Circus five thousand seats bigger, and still I stand.',
    'Figs! Figs from Caunus! Eat them before the races, cry after!',
  ],
  'dist-velabrum-boarium': [
    'Oil! Sabine oil! Venafran for the rich!',
    'Mind the cattle, mind the dung, mind your purse.',
    'Silk from the Seres, perfume from Arabia, rats from the river, all on one street.',
    "The Tiber's low this year. Thank the gods and the curators, in that order.",
    'Fishermen at dawn, dockers at noon, drunks at dusk. The Velabrum never sleeps alone.',
  ],
  'dist-porta-capena': [
    'The gate weeps again. The aqueduct men say it\'s fixed. It drips on them too.',
    'Mind the drip — that\'s Aqua Marcia, the coldest water in Rome, straight down your neck.',
    'Carts out by dawn, or the aediles fine you. Out! Out!',
    'Egeria\'s grove is all Jews and beggars now, with a basket and a bundle of hay for furniture.',
    'Mercury\'s spring is just there. Merchants wash their lies off in it on the Ides.',
  ],
  'dist-subura': ['Mind the pots from the windows.', 'Noise all night in the Subura. All night!'],
};

/** Night lines for every district (docs/CONTENT.md §8.1 "Night"). */
const NIGHT: readonly string[] = [
  "Light! Who's got a light? My slave ran off with the lantern.",
  "Hush. Listen. That's the bakers starting, so it's the fourth watch. Go home.",
  "A cart ran over a man's foot on the Clivus. He's suing the mule.",
  'Make your will before you go out to dinner, they say.',
];

/** The Lemuria (docs/CONTENT.md §8.1; the first elapsed day, 11 May). */
const LEMURIA: readonly string[] = [
  "Black beans tonight. Nine handfuls. And don't look back, whatever you hear.",
  "The temples are shut. The gods don't want to see the dead, and the dead don't want to see the priests.",
  "My grandmother walks tonight. She'll want her good shawl back.",
  'Not a night to marry, not a night to sell, not a night to be out after the second watch.',
  "If someone calls your name tonight, don't answer. It's never a creditor. Usually.",
];

/** By class (docs/CONTENT.md §8.1 "By class"), keyed by bark table. */
const CLASS: Table = {
  senator: [
    'Clients at dawn, the Senate at the third hour, the baths at the ninth. Being important is exhausting.',
    'Carry me round the dung, not through it.',
    'Parthia is a question of honour. And of trade routes.',
    'Did you hear from Pliny? Nobody has, since winter.',
  ],
  matron: ['Ecastor, the price of a decent cook!', 'Carry me round the dung, not through it.'],
  citizen: [
    "Bread's up a quadrans. War's coming, they say. Bread always knows first.",
    'Rent on the Kalends, dues on the Kalends, debts on the Kalends. I hate the Kalends.',
    "Did you see the elephant? There's no elephant. I just wanted you to look.",
    'I was a slave in Antioch. Now I own a shop in Rome. The gods have a sense of humour.',
    "My patron gets my respect and three days' work a year. He wants more of both.",
  ],
  elder: ['Twenty years in the same flat and the stairs get longer every year.'],
  woman: [
    "My husband's at the baths, my slave's at the market, I'm the only one working in this house.",
    "Mind your hands, citizen. My husband's a vigil and his brother's a gladiator.",
    "Edepol, if that fuller ruins one more palla, I'll full him.",
  ],
  slave: [
    'Yes, master. Coming, master. Gone, master.',
    "Twelve years, and I've saved half my price. The other half is in the master's head.",
    "Don't look at me. If you look at me I'll have to talk, and if I talk I'll be late.",
  ],
  soldier: ["Commilito! Were you at Tapae? Who wasn't.", 'The East! Sand, Parthians and no wine. I miss it already.', "Pay's late, boots are tight, the optio has a vine stick. Life is good."],
  foreigner: [
    'Every Roman wants a Greek doctor and nobody wants a Greek neighbour.',
    "Silk, glass, pepper: it all comes through Antioch, and Antioch doesn't care who's emperor.",
    "My grandfather's on that column. Third turn. The one who isn't running.",
    'Isis heals, Rome taxes. Both are very thorough.',
  ],
  idler: [
    'They say Hadrian is still in Athens, playing the Greek.',
    "No letters from Pliny in Bithynia since the winter. That's not like Pliny.",
    "There'll be games for the Column. Eighteen days, a hundred pairs. Or eight days and ten pairs. Someone's lying.",
    'The emperor walked through the Forum yesterday on his own feet, like a citizen. My cousin touched his cloak.',
  ],
  vigil: ['Water in the flats! Lamps out! Water in the flats!', "Quis est? Who's there? A citizen, at this hour? A brave one or a stupid one."],
  carter: ["Out of the road! Lime for the Pantheon, and I don't stop for drunks!"],
  reveler: ["Make way for a poet... no, wait, I'm going to be sick."],
};

/** Lines tied to a phase of the day. */
const PHASE: Partial<Record<DayPhase, readonly string[]>> = {
  salutatio: ['The salutatio queue went round the block this morning.', 'Up before dawn for a patron\'s nod. Again.'],
  midday: ['Prandium, then a nap. That\'s the law, isn\'t it?', 'Too hot for the Forum. The baths, then.'],
  evening: ['Off to the baths before they close.', 'Cena at the patron\'s tonight. Leftovers, if I\'m lucky.'],
  night: ['Mind the carts — the drovers don\'t stop for anyone.'],
  predawn: ['The carts are leaving. Dawn soon.', 'Bakers already at it. Can\'t you smell it?'],
};

const SHOVED: readonly string[] = [
  'Cave! Watch where you\'re going!',
  'Hey! Mind yourself!',
  'Edepol, you\'re a clumsy one.',
  'Do you own the street?',
  'Oof — careful!',
  'Hercle! My foot!',
  'Abi hinc! Get away!',
];
const SHOVED_SLAVE: readonly string[] = ['Pardon, domine!', 'My fault, my fault.', 'Sorry, sir!'];

const WEAPON: readonly string[] = [
  'Put that away! This is the Forum, not the arena!',
  "Watch! Watch! Somebody's drawn steel!",
  'Sheathe that blade! This is the Forum!',
  'Put that away before the cohort sees it.',
  'Di immortales — he\'s armed!',
  'Easy, friend. Easy.',
];
const CRIME: readonly string[] = ['Thief! Thief! Watch, over here!', 'I saw that. Everybody saw that.', 'Fur! Stop him!'];
const SORDIDUS: readonly string[] = ['Gods, you stink. Did you sleep in the Cloaca?', 'Wash first, talk after.'];
const LAUTUS: readonly string[] = ["Fresh from the baths? You smell like a rich man's dinner."];
const FLEE: readonly string[] = ['Help! Vigiles!', 'Run! There\'s blood!', 'Murder in the street!', 'Mehercle — out of the way!', 'Gods, not again!'];
const GAWK: readonly string[] = ['A fight! A fight!', 'Hit him! Hit him!', 'My money\'s on the big one.', 'Habet! He\'s had it!', 'Better than the games!'];
const GUARD: readonly string[] = ['Halt! In the name of the Prefect!', 'Break it up!', 'Drop your weapon!', 'Hold there!'];

const BRUSHOFF: Table = {
  citizen: ['Salve. Busy day — some other time.', 'I\'ve nothing to say to you, friend.', 'Ask at the Forum, not me.'],
  woman: ['I don\'t know you, sir.', 'Good day.'],
  senator: ['My clients handle petitions.', 'Do I know you? I think not.'],
  client: ['Not now — my patron needs me.'],
  matron: ['Speak to my steward.', 'Ecastor — the nerve!'],
  slave: ['I can\'t stop, domine. My master\'s waiting.', 'Not my place to say, sir.'],
  merchant: ['Buying? No? Then out of my light.', 'Come back with coin, friend.'],
  worker: ['Can\'t talk. Foreman\'s watching.'],
  soldier: ['Move along, citizen.', 'If you have a complaint, take it to the station.'],
  vigil: ['Go home, citizen. Mind your lamp.'],
  priest: ['Come to the temple at the proper hour.', 'The gods hear you. I am busy.'],
  vestal: ['The Vestal does not answer. Her attendant waves you away.'],
  idler: ['Sit, if you\'re playing. If not, you\'re in my light.'],
  beggar: ['Bless you, bless you… an as?'],
  child: ['Mama says not to talk to strangers!'],
  elder: ['Eh? Speak up.'],
  foreigner: ['Sorry, my Latin… not good.'],
  reveler: ['Shhh. Shhh! The world\'s spinning.'],
  carter: ['No time! Dawn\'s coming.'],
  farmer: ['I\'ve cabbages to sell, not stories.', 'Ask a Roman. I just got here.'],
  traveller: ['Sorry, friend — I\'m new here myself.', 'Long road. Let me be.'],
  portitor: ['Pay the duty or stand aside.', 'Next!'],
  sortilega: ['Cross my palm first.', 'The stars are silent for the stingy.'],
  argentarius: ['Come back with coin.', 'Business only, domine.'],
};

const VENDOR: readonly string[] = [
  'Hot chickpeas! Lupins! An as a handful!',
  'Sausages! Hot sausages!',
  'Garum from Hispania, the real stuff!',
  'Sulphur matches! Who needs a light?',
  'Fresh bread, still warm!',
  'Figs from Tusculum! Sweet as honey!',
];

export interface BarkContext {
  kind: BarkKind;
  /** Bark table key of the speaker (roles.ts `barks`). */
  table: string;
  district?: string;
  phase?: DayPhase;
  /** Named NPC's own lines (used for greet / ambient). */
  own?: readonly string[];
  /** The first elapsed day is a Lemuria day (11 May): add its lines at night. */
  lemuria?: boolean;
}

/** Candidate lines for a situation. */
export function barkLines(ctx: BarkContext): readonly string[] {
  switch (ctx.kind) {
    case 'greet':
      return ctx.own?.length ? ctx.own : (GREET[ctx.table] ?? GREET.citizen);
    case 'ambient': {
      if (ctx.own?.length) return ctx.own;
      const lines = [...(AMBIENT[ctx.table] ?? AMBIENT.citizen), ...(CLASS[ctx.table] ?? [])];
      if (ctx.table === 'vestal') return lines;
      const night = ctx.phase === 'night' || ctx.phase === 'predawn';
      if (ctx.district && DISTRICT[ctx.district] && !night) lines.push(...DISTRICT[ctx.district]);
      if (ctx.phase && PHASE[ctx.phase]) lines.push(...PHASE[ctx.phase]!);
      if (night) lines.push(...NIGHT);
      if (night && ctx.lemuria) lines.push(...LEMURIA, ...LEMURIA);
      return lines;
    }
    case 'shoved':
      return ctx.table === 'slave' ? SHOVED_SLAVE : SHOVED;
    case 'weapon':
      return WEAPON;
    case 'flee':
      return FLEE;
    case 'gawk':
      return GAWK;
    case 'guard':
      return GUARD;
    case 'brushoff':
      return BRUSHOFF[ctx.table] ?? BRUSHOFF.citizen;
    case 'vendor':
      return VENDOR;
    case 'crime':
      return CRIME;
    case 'sordidus':
      return SORDIDUS;
    case 'lautus':
      return LAUTUS;
  }
}

export interface BarkSink {
  (text: string, speaker: string): void;
}

/** Rations subtitles. Times are in seconds of `now` (advance with `tick`). */
export class BarkDirector {
  /** Minimum gap between any two barks (docs/CONTENT.md §8.1: one every 8 s near the player). */
  gap = 8;
  /** Minimum gap between two barks of the same speaker. */
  perSpeaker = 28;
  /** Lines remembered to avoid repeats. */
  memory = 14;
  now = 0;
  private last = -1e9;
  private bySpeaker = new Map<string, number>();
  private recent: string[] = [];
  /** Total barks spoken (stats/tests). */
  count = 0;

  constructor(public sink: BarkSink) {}

  tick(dt: number) {
    this.now += dt;
  }

  /** Could this speaker bark now? `urgent` skips the global gap (screams, guards). */
  canSpeak(id: string, urgent = false): boolean {
    if (!urgent && this.now - this.last < this.gap) return false;
    if (urgent && this.now - this.last < 0.8) return false;
    const t = this.bySpeaker.get(id);
    return t === undefined || this.now - t >= (urgent ? 6 : this.perSpeaker);
  }

  /** Pick a line not heard recently (falls back to any line). */
  pick(rng: Rng, ctx: BarkContext): string | null {
    const lines = barkLines(ctx);
    if (!lines.length) return null;
    const fresh = lines.filter((l) => !this.recent.includes(l));
    return rng.pick(fresh.length ? fresh : lines);
  }

  /** Speak a line now (no checks). */
  say(id: string, speaker: string, text: string) {
    this.last = this.now;
    this.bySpeaker.set(id, this.now);
    this.recent.push(text);
    if (this.recent.length > this.memory) this.recent.shift();
    this.count++;
    this.sink(text, speaker);
    if (this.bySpeaker.size > 400) {
      for (const [k, t] of this.bySpeaker) if (this.now - t > this.perSpeaker) this.bySpeaker.delete(k);
    }
  }

  /** Check, pick and speak. Returns the line or null. */
  bark(rng: Rng, id: string, speaker: string, ctx: BarkContext, urgent = false): string | null {
    if (!this.canSpeak(id, urgent)) return null;
    const line = this.pick(rng, ctx);
    if (!line) return null;
    this.say(id, speaker, line);
    return line;
  }
}
