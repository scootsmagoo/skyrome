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

export type BarkKind = 'greet' | 'ambient' | 'shoved' | 'weapon' | 'flee' | 'gawk' | 'guard' | 'brushoff' | 'vendor';

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
};

/** Overheard chatter. Generic lines first; role and district lines are mixed in. */
const AMBIENT: Table = {
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
};

/** Lines tied to a district (mixed into ambient chatter there). */
const DISTRICT: Table = {
  'dist-forum-romanum': [
    'Another case at the Basilica Julia. An inheritance, of course.',
    'Money-changers rattling their coins again.',
    'Somebody\'s cut a new gaming board into the steps.',
    'The Rostra\'s quiet today. No speeches, thank the gods.',
  ],
  'dist-velia': ['Pearls, pepper and perfume — the Sacra Via has everything but bargains.', 'The Colossus shines like a second sun this morning.'],
  'dist-vallis-colossei': ['The Ludus Magnus is drilling again. Hear the shields?', 'Celadus the thraex — the girls\' heartthrob, they write on the walls.', 'The Meta Sudans is sweating today.'],
  'dist-subura': ['Mind the pots from the windows.', 'Noise all night in the Subura. All night!'],
  'dist-fora-imperialia': ['Look at that column. Carved all the way up!', 'They say the libraries have Greek on one side and Latin on the other.'],
};

/** Lines tied to a phase of the day. */
const PHASE: Partial<Record<DayPhase, readonly string[]>> = {
  salutatio: ['The salutatio queue went round the block this morning.', 'Up before dawn for a patron\'s nod. Again.'],
  midday: ['Prandium, then a nap. That\'s the law, isn\'t it?', 'Too hot for the Forum. The baths, then.'],
  evening: ['Off to the baths before they close.', 'Cena at the patron\'s tonight. Leftovers, if I\'m lucky.'],
  night: ['Make your will before you go out to dinner, they say.', 'Lemuria. Black beans at midnight, and never look back.', 'Mind the carts — the drovers don\'t stop for anyone.'],
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
  'Sheathe that blade! This is the Forum!',
  'Put that away before the cohort sees it.',
  'Di immortales — he\'s armed!',
  'Easy, friend. Easy.',
];
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
}

/** Candidate lines for a situation. */
export function barkLines(ctx: BarkContext): readonly string[] {
  switch (ctx.kind) {
    case 'greet':
      return ctx.own?.length ? ctx.own : (GREET[ctx.table] ?? GREET.citizen);
    case 'ambient': {
      if (ctx.own?.length) return ctx.own;
      const lines = [...(AMBIENT[ctx.table] ?? AMBIENT.citizen)];
      if (ctx.district && DISTRICT[ctx.district] && ctx.table !== 'vestal') lines.push(...DISTRICT[ctx.district]);
      if (ctx.phase && PHASE[ctx.phase] && ctx.table !== 'vestal') lines.push(...PHASE[ctx.phase]!);
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
  }
}

export interface BarkSink {
  (text: string, speaker: string): void;
}

/** Rations subtitles. Times are in seconds of `now` (advance with `tick`). */
export class BarkDirector {
  /** Minimum gap between any two barks. */
  gap = 3.2;
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
