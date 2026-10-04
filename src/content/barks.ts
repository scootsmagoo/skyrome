/**
 * Street barks for v0.1: lines NPCs say in passing, shown as subtitles (GDD §15.1) with the
 * speaker's name. Four tables, all plain data:
 *
 *   DISTRICT_BARKS   per v0.1 district (§12.1), day and night
 *   ARCHETYPE_BARKS  per schedule archetype (§14.7: tabernarius, vigil, gladiator…)
 *   FESTIVAL_BARKS   the Lemuria (9/11/13 May) and the eve of the Column (11 May)
 *   REACTION_BARKS   to the player: filthy, a woman in a toga, a drawn blade, a bounty, news of quests
 *
 * `pickBark()` chooses one line for a context with a seeded RNG, so the NPC/crowd module only
 * says "this NPC in this district at this hour, with these reactions". Juvenal and Martial set the
 * voice (GDD §2.3); paraphrases are marked in comments with their source.
 */
import { LANDMARK_BY_ID } from '../data/atlas';
import { toGame } from '../world/coords';

export type DistrictId =
  | 'dist-forum-romanum'
  | 'dist-capitolium'
  | 'dist-palatium'
  | 'dist-fora-imperialia'
  | 'dist-velia'
  | 'dist-vallis-colossei'
  | 'dist-circus-maximus'
  | 'dist-velabrum-boarium'
  | 'dist-forum-holitorium';

/** When a line fits: 'day' 6–19, 'night' 20–5, 'dawn' 4–7, 'dusk' 18–21; omitted = any time. */
export type BarkTime = 'day' | 'night' | 'dawn' | 'dusk';

export interface BarkLine {
  text: string;
  when?: BarkTime;
  /** Only for speakers of this sex (oaths: men swear by Hercules, women by Castor). */
  sex?: 'male' | 'female';
}

export const DISTRICTS: { id: DistrictId; name: string; latin: string; anchors: string[] }[] = [
  { id: 'dist-forum-romanum', name: 'Forum Romanum', latin: 'Forum Romanum', anchors: ['miliarium-aureum', 'rostra', 'basilica-julia', 'basilica-aemilia', 'temple-castor-pollux', 'temple-vesta', 'curia-julia', 'temple-saturn', 'carcer-tullianum'] },
  { id: 'dist-capitolium', name: 'Capitoline Hill', latin: 'Capitolium', anchors: ['temple-jupiter-capitolinus', 'asylum', 'temple-juno-moneta', 'tarpeian-rock'] },
  { id: 'dist-palatium', name: 'Palatine', latin: 'Palatium', anchors: ['domus-flavia', 'domus-augustana', 'domus-tiberiana', 'casa-romuli', 'temple-apollo-palatinus', 'temple-magna-mater'] },
  { id: 'dist-fora-imperialia', name: 'Imperial Fora', latin: 'Fora Caesarum', anchors: ['forum-trajan', 'basilica-ulpia', 'column-trajan', 'markets-trajan', 'forum-augustus', 'forum-caesar', 'forum-nerva', 'templum-pacis'] },
  { id: 'dist-velia', name: 'Velia and the upper Sacra Via', latin: 'Velia', anchors: ['arch-titus', 'colossus-sol', 'velia-vestibule', 'horrea-piperataria', 'porticus-margaritaria'] },
  { id: 'dist-vallis-colossei', name: 'Colosseum valley', latin: 'Vallis Amphitheatri', anchors: ['colosseum', 'meta-sudans', 'ludus-magnus', 'baths-titus', 'curiae-veteres'] },
  { id: 'dist-circus-maximus', name: 'Circus Maximus and the Porta Capena', latin: 'Circus Maximus', anchors: ['circus-maximus', 'obelisk-circus-maximus', 'pulvinar', 'arch-titus-circus', 'porta-capena'] },
  { id: 'dist-velabrum-boarium', name: 'Velabrum and the Forum Boarium', latin: 'Velabrum', anchors: ['forum-boarium', 'temple-portunus', 'temple-hercules-victor', 'ara-maxima', 'horrea-agrippiana', 'portus-tiberinus', 'sant-omobono-temples'] },
  { id: 'dist-forum-holitorium', name: 'Forum Holitorium and the Tiber Island', latin: 'Forum Holitorium', anchors: ['forum-holitorium', 'theatre-marcellus', 'temple-aesculapius', 'temple-janus-holitorium', 'temple-spes'] },
];

/** The v0.1 district nearest to a game-space point (by its anchor landmarks), or null when nothing is within 250 m. */
export function districtAt(x: number, z: number): DistrictId | null {
  let best: DistrictId | null = null;
  let bestD = 250;
  for (const d of DISTRICTS) {
    for (const id of d.anchors) {
      const lm = LANDMARK_BY_ID[id];
      if (!lm) continue;
      const [gx, gz] = toGame(lm.center[0], lm.center[1]);
      const dist = Math.hypot(gx - x, gz - z);
      if (dist < bestD) (bestD = dist), (best = d.id);
    }
  }
  return best;
}

const day = (text: string): BarkLine => ({ text, when: 'day' });
const night = (text: string): BarkLine => ({ text, when: 'night' });
const dawn = (text: string): BarkLine => ({ text, when: 'dawn' });
const any = (text: string): BarkLine => ({ text });

export const DISTRICT_BARKS: Record<DistrictId, BarkLine[]> = {
  'dist-forum-romanum': [
    day('Quid novi? They say the Column is finished. A hundred feet of Dacians going round and round.'),
    day('Read the Daily Acts! Who married, who died, who was struck by lightning!'),
    day('The Hundred Judges are sitting in the Basilica Julia. Four courts at once, and every advocate shouting.'),
    day('Optimus princeps, they call him. Walks among the people like a citizen, they say. I’ve never seen him.'),
    day('The doors of Janus are open. War, then. Parthia.'),
    day('Pepper from India, the real thing! Smell it. No, don’t touch it.'),
    day('Money changed! Asses for sesterces, sesterces for denarii, honest weight!'),
    day('Ten on the dice? Come on, the aediles are at lunch.'),
    day('Mind the Lacus Curtius. A man rode into a hole there. Or it was lightning. Or a Sabine. Depends who you ask.'),
    day('Make way, make way for the senator!'),
    dawn('Salutatio’s over and here they come, every client in Rome, trailing after his patron.'),
    night('Nobody in the Forum after dark but the vigiles, the rats and us.'),
    night('Hear that? Carts. All night long, carts. And they wonder why no one sleeps.'),
    night('Keep to the lamplight, friend.'),
  ],
  'dist-capitolium': [
    day('Mind the geese. Sacred birds. They saved the Capitol from the Gauls and they’ve never let anyone forget it.'),
    day('They’re writing the vows for the emperor’s safe return already, and he hasn’t even left.'),
    day('Gold on Jupiter’s roof. Domitian paid for it. Twelve thousand talents, they say. Gods, what a sum.'),
    night('The Capitol shuts at dusk. Down you go.'),
  ],
  'dist-palatium': [
    day('Move along. The palace is not for sightseers.'),
    day('Romulus’ hut. They keep re-thatching it, and it keeps catching fire.'),
    day('From up here you see the whole Circus. The emperor watches the races from that box.'),
    night('Move along, citizen. Now.'),
  ],
  'dist-fora-imperialia': [
    day('Tomorrow they dedicate the Column! Every Dacian in Rome is either hiding or carving.'),
    day('The roof of the Basilica Ulpia is gilded bronze. Gilded!'),
    day('Apollodorus built it. Apollodorus builds everything. Apollodorus will build my tomb at this rate.'),
    day('Scaffolds coming down tonight. Stand clear unless you want a beam on your head.'),
    night('All that marble, white as bone in the dark.'),
  ],
  'dist-velia': [
    day('Pearls! Red Sea pearls for the lady who has everything!'),
    day('Pepper, myrrh, malabathrum, cheaper out here than inside the warehouse!'),
    day('Look up. The Colossus. Nero’s face, once. Now it’s the Sun’s. They only changed the hair.'),
    day('My grandfather saw them carry the candlestick of Jerusalem under that arch.'),
    night('Every jeweller’s shutter down and a dog under every one.'),
  ],
  'dist-vallis-colossei': [
    day('Nereus! Did you see him last autumn? Thirty-one wins!'),
    day('Ferox the Gaul will gut that fish-man like a mullet.'),
    day('The sailors from Misenum rig the awnings. Don’t buy dice off them.'),
    day('The Meta Sudans is sweating today. Must be the heat. Or the water.'),
    day('Fifty thousand seats and I still end up behind a pillar.'),
    night('Hear the beasts in the Morning School? A lion, they say. I’m going the long way round.'),
    night('The Ludus is locked at night. They lock the gladiators in. Or the rest of us out.'),
  ],
  'dist-circus-maximus': [
    day('Greens! Greens for ever!'),
    day('The Blues will bury them, you watch!'),
    day('Your stars, citizen? One as, and I’ll tell you whether your wife is faithful.'),
    day('Spare an as for an old soldier? I left a leg in Dacia.'),
    // Juvenal 3.11: "madidam Capenam", the dripping gate under the aqueduct.
    any('Dripping Capena. Mind your head: the aqueduct leaks on everyone, emperor or carter.'),
    dawn('Carts out by dawn or they’re fined. That one’s late.'),
    night('Carts coming through! Out of the way, unless you want to be flat as a honey cake.'),
  ],
  'dist-velabrum-boarium': [
    day('Fresh bread! Still warm! Don’t squeeze it.'),
    day('The fullers’ vats. Mind the smell. Yes, it cleans. No, I don’t want to talk about it.'),
    day('Oil! Baetican oil, the best on the river!'),
    day('Cattle coming through! Watch your feet!'),
    // Ara Maxima: no flies or dogs enter (Pliny NH 10.79), women barred from the rite (Gellius 11.6, Propertius 4.9).
    day('No flies at Hercules’ altar, they say, and no dogs. And no women at the rite.'),
    day('Ships from Ostia! The barges are in, the porters are drunk, the usual.'),
    night('The Velabrum after dark? The knife-men work in pairs here.'),
    night('Bar the door, boy. Bar it twice.'),
  ],
  'dist-forum-holitorium': [
    day('Leeks from Aricia! Ask anyone, the best leeks are from Aricia!'),
    day('Cabbages! Fat as a senator’s purse!'),
    day('The sick sleep in Aesculapius’ temple on the island. Some of them wake up cured.'),
    night('Even the cabbages are asleep. Go home.'),
  ],
};

/** By schedule archetype (GDD §14.7). */
export const ARCHETYPE_BARKS: Record<string, BarkLine[]> = {
  tabernarius: [day('Come in, come in, look, it costs nothing to look!'), day('Fixed prices. Well. Fairly fixed.'), day('Salve lucrum! Welcome, profit!'), dawn('Shutters up! Hours’ worth of customers waiting!')],
  faber: [day('Mind the sparks!'), day('If it’s broken, I can fix it. If it’s cursed, try the temple.'), day('Bronze, iron, lead. Not gold. Gold is for other people.')],
  patronus: [day('Walk behind me, not beside me.'), day('Remind me of that man’s name. No, his wife’s.'), dawn('The salutatio is over. To the Forum.')],
  cliens: [dawn('Up before dawn for a basket of coins and a nod. What a life.'), day('My patron says the vote will go his way. My patron says a lot of things.'), day('A hundred quadrantes. That’s what my morning is worth.')],
  // Ecastor ("by Castor") was a women's oath, mehercle a men's (Gellius 11.6).
  matrona: [
    { text: 'Ecastor, the price of linen!', when: 'day', sex: 'female' },
    { text: 'Walk faster, girl, and keep your eyes down.', when: 'day', sex: 'female' },
    { text: 'My husband says the war will be short. My husband says many things.', when: 'day', sex: 'female' },
  ],
  'servus-baiulus': [day('Make way! Heavy load!'), day('Not mine, citizen. Not mine to sell, not mine to carry, and yet here I am carrying it.'), day('Mind your back!')],
  'miles-urbanus': [day('Move along. Nothing to see.'), day('Keep your blade in its sheath in the Forum, citizen.'), day('Another riot at the Circus and we’ll all be on double watches.')],
  vigil: [night('Water in every flat! The prefect’s order!'), night('Lamps out, braziers out, or I’ll be back with a rod.'), night('Smoke? Where? Show me.'), night('Quiet night. That’s when I worry.')],
  sacerdos: [day('Favete linguis! Hold your tongues for the rite.'), day('An offering? A honey cake will do. The god is not greedy.'), day('The omens were fair this morning. Mostly fair.')],
  gladiator: [day('Hah! Again!'), day('My arm is lead. Again, he says. Always again.'), day('If you want an autograph, find a wall.')],
  otiosus: [day('Six, and a dog! I win!'), day('Sit, friend. Nobody in this basilica is doing any work.'), day('I’ve been on these steps since the consulship of Pompey. Or it feels like it.')],
  mendicus: [any('An as, for the love of the gods.'), any('Bread, citizen? Just the crust.'), day('I was rich once. Then I lent money to a senator.')],
  plaustrarius: [night('Hup! Hup! Move, you misbegotten mule!'), night('Out of the road!'), dawn('Out by dawn, out by dawn, or the aediles have my wheels.')],
  grassator: [night('Nice cloak.'), night('Where are you going so late, friend?'), night('Lost? Let us help you.')],
  puer: [day('Race you to the fountain!'), day('My father says you’re a foreigner.'), day('I know a short cut! One as!')],
};

/** Festival ambience (§14.10). Ids follow the calendar's festival ids. */
export const FESTIVAL_BARKS: Record<string, BarkLine[]> = {
  // Ovid, Fasti 5.419–492: the Lemuria, temples shut (485–486), no weddings in May (490).
  'fest-lemuria': [
    day('The temples are shut today. It’s the Lemuria. Pray at the crossroads if you must pray.'),
    day('No weddings in May, and certainly not today.'),
    day('Black beans, two asses a bag. You’ll want them tonight!'),
    night('Beans, nine times, and don’t look back.'),
    night('Don’t whistle tonight. They hear it.'),
    night('Bang the bronze! Ghosts of my fathers, go out!'),
    night('My grandmother saw a lemur once. It was my grandfather. He wanted his sandals back.'),
    night('Who’s there? … Nobody. Nobody’s there.'),
  ],
  'fest-columna-eve': [
    day('Tomorrow the Column! They say the emperor himself will be there at dawn.'),
    day('Garlands for Venus Genetrix! Her temple is rededicated tomorrow too.'),
    day('A hundred Roman feet, and a stair inside, a hundred and eighty-five steps!'),
    day('Carved all the way up, the whole war. You can’t see the top half, mind. Only the gods can.'),
  ],
};

/** Reactions to the player (the NPC module decides which apply: cleanliness, dress, drawn weapon, bounty, quest flags). */
export const REACTION_BARKS: Record<string, BarkLine[]> = {
  sordidus: [any('Gods, you stink. Go to the baths, or at least a fountain.'), any('Is that blood? Keep walking.'), any('Did you swim in the Cloaca?')],
  'toga-woman': [day('A woman in a toga? Shameless!'), day('In a toga? Has her husband divorced her, or is she working?')],
  'formal-dress': [day('Ave, domine.'), day('A fine toga. Someone has a patron.')],
  armed: [any('Put that away! This is the Forum, not the arena!'), any('Vigiles! No, wait, it’s day. Soldiers!')],
  bounty: [any('That’s the one the cohorts are after.'), any('Don’t look at them. Just don’t.')],
  'courier-news': [day('Did you hear? A courier knifed at the Capena gate this morning, right in the road!'), day('Knife-men at the Porta Capena, at dawn! What is the city coming to?')],
  'ludus-guest': [day('Aren’t you the new one from the Ludus?'), day('Fighting for pay? There are easier ways to die.')],
  'nereus-beaten': [day('They say a tiro put Nereus on his knees this afternoon! At practice, but still!'), day('You! You’re the one who beat Nereus! With a wooden sword!')],
  'brawl-winner': [day('There goes the brawler from the Meta Sudans.'), day('Fists like a fuller’s mallet, that one.')],
};

export interface BarkContext {
  district?: DistrictId | null;
  archetype?: string;
  /** Game hour 0..24. */
  hour: number;
  /** Active festival ids ('fest-lemuria', 'fest-columna-eve'). */
  festivals?: readonly string[];
  /** Reaction keys that apply (REACTION_BARKS). */
  reactions?: readonly string[];
  sex?: 'male' | 'female';
  /** Seeded random in [0, 1): `rng.next()` (src/core/Rng) or a function. */
  rng: { next(): number } | (() => number);
}

/** Does a line fit the hour? */
export function barkFits(line: BarkLine, hour: number, sex?: 'male' | 'female'): boolean {
  if (line.sex && sex && line.sex !== sex) return false;
  const h = ((hour % 24) + 24) % 24;
  switch (line.when) {
    case 'day':
      return h >= 6 && h < 19.5;
    case 'night':
      return h >= 20 || h < 5;
    case 'dawn':
      return h >= 4 && h < 7.5;
    case 'dusk':
      return h >= 18 && h < 21;
    default:
      return true;
  }
}

/**
 * One line for this speaker and moment, or null. Reactions weigh most (×3), then festivals (×2),
 * the speaker's archetype (×1.5) and the district (×1).
 */
export function pickBark(ctx: BarkContext): BarkLine | null {
  const pool: { line: BarkLine; w: number }[] = [];
  const add = (lines: readonly BarkLine[] | undefined, w: number) => {
    for (const line of lines ?? []) if (barkFits(line, ctx.hour, ctx.sex)) pool.push({ line, w });
  };
  for (const r of ctx.reactions ?? []) add(REACTION_BARKS[r], 3);
  for (const f of ctx.festivals ?? []) add(FESTIVAL_BARKS[f], 2);
  if (ctx.archetype) add(ARCHETYPE_BARKS[ctx.archetype], 1.5);
  if (ctx.district) add(DISTRICT_BARKS[ctx.district], 1);
  if (!pool.length) return null;
  const total = pool.reduce((s, p) => s + p.w, 0);
  let roll = (typeof ctx.rng === 'function' ? ctx.rng() : ctx.rng.next()) * total;
  for (const p of pool) {
    roll -= p.w;
    if (roll < 0) return p.line;
  }
  return pool[pool.length - 1].line;
}

/** Festivals of the v0.1 calendar by date (11 May 113 is both a Lemuria day and the eve of the Column). */
export function festivalsOn(month: number, day: number): string[] {
  const out: string[] = [];
  // GameTime months are 0-based (4 = May).
  if (month === 4 && (day === 9 || day === 11 || day === 13)) out.push('fest-lemuria');
  if (month === 4 && day === 11) out.push('fest-columna-eve');
  return out;
}
