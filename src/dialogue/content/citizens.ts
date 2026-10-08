/**
 * Generic dialogue: the night watch and the urban cohorts, and the '*' dialogue for every unnamed
 * person in the crowd. Each of those is somebody (content/folk/persona.ts): a slave, a fuller, a
 * senator, a beggar by the bridge, a Greek doctor, a countrywoman with her basket. They greet you
 * in their own way, tell you who they are and what they do, and talk about their own life and the
 * city (content/folk/topics.ts), besides rumors, directions in the Roman manner and a Rhetoric
 * check. Greetings follow the hour and the festival: on the Lemuria people are jumpy after dark.
 * Sources for the lines: docs/CONTENT.md §8.1 (barks and rumours), Juvenal 3.
 */
import { todaysFestivals } from '../../content/director';
import { askText, groupOf, pronouns, topicsFor, TOPICS, type Group, type TopicContext } from '../../content/folk/topics';
import { makePersona, vary, type Persona } from '../../content/folk/persona';
import { completed, hourNow, rotate, rumors } from '../../content/talk';
import { defineDialogue, type DialogueContext } from '../types';

const night = (c: DialogueContext) => {
  const h = hourNow(c);
  return h >= 20 || h < 5;
};

const vigiles = defineDialogue({
  id: 'npc-vigiles',
  npcs: ['npc-crescens'],
  start: (c) => (night(c) ? 'halt' : 'asleep'),
  nodes: {
    asleep: { text: '(He is asleep on a bench with his helmet over his eyes. One eye opens.) We work nights, citizen. Come back when Rome is on fire.', end: true },
    halt: {
      text: 'Quis est? Halt. Who goes there at this hour?',
      choices: [
        { text: 'A citizen, going home.', goto: 'pass' },
        { text: 'Any trouble tonight?', goto: 'trouble' },
        { text: 'Knife-men near the Vicus Tuscus. Where do they hide?', goto: 'knifemen', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    pass: { text: 'Then go home, and keep water in your room. Prefect’s order.', end: true },
    trouble: {
      text: (c) => rotate(c, 'trouble', [
        'A chimney fire on the Vicus Iugarius, two muggings in the Velabrum, and a man who tried to fight the Meta Sudans. A quiet night.',
        'Somebody left a brazier on the stairs of an insula by the Circus. Somebody will be beaten with rods in the morning.',
        'It’s the Lemuria. Half the city is banging pans at midnight and the other half is swearing at them. We just walk.',
      ]),
      next: 'halt',
    },
    knifemen: {
      text: 'The burned taberna, off the Vicus Tuscus, north of the Velabrum. Grassatores: the ones the Ludus threw out, and the ones nobody wants. By day it’s the cohorts’ business and by night it’s ours, and nobody’s business is everybody’s excuse.',
      effects: (c) => c.setFlag('hideout-known', true),
      next: 'halt',
    },
  },
});

const urbaniciani = defineDialogue({
  id: 'npc-urbaniciani',
  npcs: ['npc-miles-valens', 'npc-miles-severus'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: (c) => rotate(c, '_greet', ['Move along, citizen. Nothing to see.', 'Name, trade, and where you’re going. No, the real reason.', 'No brawling below the Palatine. The emperor can hear you from up there.']),
      choices: [
        { text: 'I want to report a murder. A courier, at the Porta Capena.', if: (c) => completed(c, 'mq-01-madida-capena'), goto: 'report', once: true },
        { text: 'What happens tomorrow?', goto: 'tomorrow', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    report: { text: '(He writes on a tablet without looking at you.) A courier. A soldier’s courier, they say. Not our business: his own officers took the body before the second hour. If you know something, citizen, keep it to yourself. That’s advice.', effects: (c) => c.setFlag('mq01-reported', true), end: true },
    tomorrow: { text: 'The Column. The whole Forum of Trajan closed from dawn, double watches on every street, and every pickpocket in Italy here for the crowd. Watch your purse.', end: true },
  },
});

const PLACES: { id: string; label: string; how: string }[] = [
  { id: 'forum', label: 'The Forum?', how: 'The Forum? Follow everyone else. Up the Vicus Tuscus, between the Temple of Castor and the Basilica Julia, and you’re standing at the Golden Milestone.' },
  { id: 'ludus', label: 'The Ludus Magnus?', how: 'The gladiators’ school? Past the Colossus, past the amphitheatre, the long building on the right with the arena in its belly. Follow the clacking of wooden swords.' },
  { id: 'castor', label: 'The Temple of Castor?', how: 'The big one on the high podium at the south corner of the Forum, eight columns across the front, by the spring of Juturna. You can’t miss it, but people do.' },
  { id: 'popina', label: 'Somewhere to eat?', how: 'The Silver Pig, on the Vicus Tuscus. Chreste’s wine is honest and her chickpeas are hot. Don’t dice in front of her.' },
  { id: 'capena', label: 'The Porta Capena?', how: 'Down the valley of the Circus to the old gate under the aqueduct. Bring a hat: it drips.' },
  { id: 'meta', label: 'The Meta Sudans?', how: 'The sweating cone fountain between the Colossus and the amphitheatre. You can’t miss it. It’s the one dripping.' },
];

// ------------------------------------------------------------------ the crowd: everyone else

/** Each person in the crowd is somebody (content/folk): their persona, kept for as long as they live. */
const personas = new WeakMap<object, Persona>();
const byId = new Map<string, Persona>();

interface CrowdNpc {
  role?: { id: string };
  name: string;
  barkTable?: string;
  humanoid?: { appearance?: { sex?: string; age?: string } };
}

function personaOf(c: DialogueContext): Persona {
  const npc = (c.game as unknown as { population?: { get?(id: string): CrowdNpc | undefined } }).population?.get?.(c.npcId);
  const hit = npc ? personas.get(npc) : byId.get(c.npcId);
  if (hit) return hit;
  const app = npc?.humanoid?.appearance;
  const p = makePersona({
    id: c.npcId,
    role: npc?.role?.id ?? 'citizen',
    female: app?.sex === 'female',
    age: app?.age as 'child' | 'young' | 'adult' | 'middle' | 'old' | undefined,
    label: npc?.name,
    barks: npc?.barkTable,
  });
  if (npc) personas.set(npc, p);
  else byId.set(c.npcId, p);
  return p;
}

const tctx = (c: DialogueContext): TopicContext => ({ hour: hourNow(c), lemuria: todaysFestivals(c.game).includes('fest-lemuria') });
const offered = (c: DialogueContext, id: string) => topicsFor(personaOf(c), tctx(c)).some((t) => t.id === id);
const group = (c: DialogueContext) => groupOf(personaOf(c));

/** The greeting: by who they are, their mood, and the hour. */
function greeting(c: DialogueContext): string {
  const p = personaOf(c);
  const g = groupOf(p);
  const h = hourNow(c);
  const dark = h >= 20 || h < 5;
  const lemures = dark && todaysFestivals(c.game).includes('fest-lemuria');
  const met = !!c.memory.met;
  c.memory.met = true;
  if (met) {
    return vary(p, `again:${rotate(c, '_again', ['a', 'b', 'c'])}`, [
      `${p.short} again. What now?`,
      'You again. Rome is big, and still I keep finding you.',
      'Back? Good, or bad?',
      `Ah, the stranger. ${p.mood === 'cheerful' ? 'Salve, salve!' : 'Yes?'}`,
    ]);
  }
  if (lemures && g !== 'reveler' && g !== 'soldier') return '(They make the sign against the evil eye, thumb between the fingers.) It’s the Lemuria! Don’t creep up on people tonight. … What is it?';
  if (dark && ['plebs', 'slave', 'foreign', 'rural', 'child'].includes(g)) {
    return vary(p, 'night', ['Who’s that? Stay back! … Oh. Gods, you scared me. Speak quickly, and then go home: the knife-men are out.', '(A hand goes to the purse.) It’s late, friend. What do you want?', 'Keep your distance and your voice down. People are sleeping, or trying to.']);
  }
  const lines: Record<Group, Record<string, readonly string[]> & { all: readonly string[] }> = {
    elite: { all: ['(A long look from under a clean toga.) You may speak.', 'Well? I am expected elsewhere.', 'Citizen. Be brief.'], gossip: ['Ah, a new face. Rome has so few. What is your news?'] },
    plebs: {
      all: ['Salve. Quid novi? What’s new?', 'Yes? I have a moment. Half a moment.', 'Ave. You look lost. Everyone looks lost in this city.'],
      cheerful: ['Salve, friend! Fine day, eh? What can I do for you?', 'Ave! Never seen you before. New in Rome? Ha, I can always tell.'],
      grumpy: ['What? I’m busy. Everyone in Rome is busy except you, apparently.', 'If you’re selling something, I’m not buying.'],
      weary: ['(A long sigh.) Yes?', 'Make it quick, friend, my feet are killing me.'],
      gossip: ['Salve! Have you heard? No? Come here, come here…', 'Oh, you look like a person who likes news. I have news.'],
      wary: ['Do I know you? … No. What do you want?'],
      pious: ['The gods keep you, stranger. How can I help?'],
      proud: ['Salve, citizen. You’re speaking to a man with his own shop, so mind your manners.'],
    },
    slave: {
      all: ['Yes, domine? I’m on an errand.', 'Pardon, domine. Can I help? Quickly, if you please; they count the hours.'],
      cheerful: ['Salve, domine! You’re a kind face. Not many of those today.'],
      wary: ['(He looks to see who’s watching.) Domine?', 'I’m not to talk to strangers, domine. But go on.'],
      weary: ['(He shifts the load on his shoulder.) Domine?'],
    },
    poor: { all: ['An as, domine? Just one. The gods see who gives.', 'Bless you for stopping. Most don’t.', '(A cracked cup is held out.) Spare a coin for a man who had a trade once?'] },
    foreign: { all: ['Chaire! Er, salve. Yes?', 'Salve, friend. You speak to a stranger in Rome; I am one too.', 'Yes? I am looking for someone. Perhaps it is you?'] },
    rural: { all: ['Salve! Fresh from the country, me. Is it always this loud?', 'Mind the basket, friend. What can I do for you?'] },
    soldier: { all: ['Citizen. State your business.', 'Move along… or speak, if you must.', 'Yes? I’m on duty.'] },
    religious: { all: ['The gods keep you. What do you seek?', 'Speak softly near the temple, citizen.'] },
    child: { all: ['Who are you? Are you a gladiator?', 'Salve! Do you have any nuts? We’re playing nuts.', 'Mother says not to talk to strangers. Are you a stranger?'] },
    reveler: { all: ['Friend! My friend! Have I met you? Doesn’t matter! Bene sit tibi!', 'Propino tibi! I drink to you! Do you drink? You should drink.'] },
    gladiator: { all: ['Looking at the merchandise? Ha. What do you want?', 'You’re not from the Ludus. Fan, or buyer?'] },
  };
  const L = lines[g];
  return pronouns(p, vary(p, 'greet', L[p.mood] ?? L.all));
}

/** Things people of each kind hear first (then the city's talk, talk.ts). */
function groupRumors(p: Persona): string[] {
  switch (groupOf(p)) {
    case 'slave':
      return ['The steward in the house next door ran off with the silver last week. They’ll catch him at the coast. They always catch them at the coast.', 'There’s a slave market at the Saepta on the Nones: Dacians, still. Prices are falling. Bad news for us; masters treat a cheap slave cheaply.'];
    case 'elite':
      return ['They say Caesar will leave for the East in the autumn and take half the Senate’s sons with him as tribunes.', 'Pliny has died in Bithynia, or so the letters say. A dull man, but an honest governor. There are not many.'];
    case 'poor':
      return ['They’re giving out bread at the Temple of Ceres on the Aventine for the festival. Go early.', 'The aedile’s men are clearing beggars from the Forum before the dedication. Even the gods don’t want to see us.'];
    case 'foreign':
      return ['A ship from Alexandria came into Puteoli with the grain and a cargo of glass. The glass-sellers are fighting over it already.', 'They say the Parthian king has sent envoys with gifts. Caesar won’t see them.'];
    case 'soldier':
      return ['Two cohorts of the Praetorians are under orders for Syria. Lucky them.', 'Somebody’s been paying the street gangs in silver nobody’s seen before. The tribune’s asking questions.'];
    case 'child':
      return ['There’s a dead dog by the Cloaca! Lucius poked it.', 'A man at the games caught a man in a net like a fish!'];
    case 'rural':
      return ['They’re buying mules for the army at the Campus, any price! I’m going home for mine.'];
    case 'gladiator':
      return ['Nereus has thirty-one wins. They say he’ll get the wooden sword this year, and freedom.'];
    default:
      return [];
  }
}

// A question asked is not offered again (kept in the NPC's memory: the same choice sits on two nodes).
const TOPIC_CHOICES = TOPICS.map((t) => ({
  text: (c: DialogueContext) => askText(t, personaOf(c)),
  if: (c: DialogueContext) => !c.memory[`asked:${t.id}`] && offered(c, t.id),
  effects: (c: DialogueContext) => {
    c.memory[`asked:${t.id}`] = true;
  },
  goto: `t-${t.id}`,
}));

const HUB_CHOICES = [
  ...TOPIC_CHOICES,
  { text: 'What’s the news?', if: (c: DialogueContext) => personaOf(c).status !== 'vestal', goto: 'news' },
  { text: 'Which way to…', if: (c: DialogueContext) => personaOf(c).status !== 'vestal', goto: 'directions' },
  {
    text: 'You look like you hear things. What do people say about the courier knifed at the Porta Capena?',
    if: (c: DialogueContext) => !c.memory['asked:courier'] && (completed(c, 'mq-01-madida-capena') || !!c.flag('festus-dead')) && ['plebs', 'poor', 'reveler', 'slave'].includes(group(c)),
    check: { skill: 'rhetoric', difficulty: 25, pass: 'secret', fail: 'clam' },
    effects: (c: DialogueContext) => {
      c.memory['asked:courier'] = true;
    },
  },
  {
    text: '(Give him an as.)',
    if: (c: DialogueContext) => group(c) === 'poor' && !c.memory['asked:alms'],
    enabled: (c: DialogueContext) => c.denarii() >= 0.0625,
    effects: (c: DialogueContext) => {
      c.memory['asked:alms'] = true;
      if (c.pay(0.0625)) c.game.devotion?.gainPietas(1);
    },
    goto: 'alms',
  },
  { text: 'Vale.', end: true },
];

const citizen = defineDialogue({
  id: 'citizens',
  npcs: ['*'],
  priority: -50,
  start: () => 'greet',
  nodes: {
    greet: { text: greeting, choices: HUB_CHOICES },
    more: {
      text: (c) => {
        const p = personaOf(c);
        return vary(p, `more:${rotate(c, '_more', ['a', 'b', 'c'])}`, p.status === 'slave' ? ['Anything else, domine?', 'Is that all, domine?'] : groupOf(p) === 'elite' ? ['Is there more?', 'Well?'] : ['Anything else?', 'What else?', 'Go on.', 'And?']);
      },
      choices: HUB_CHOICES,
    },
    ...Object.fromEntries(
      TOPICS.map((t) => [
        `t-${t.id}`,
        {
          text: (c: DialogueContext) => t.answer(personaOf(c), tctx(c)),
          // Once they've told you who they are, the prompt shows their name.
          effects: t.id === 'who' ? (c: DialogueContext) => nameThem(c) : undefined,
          next: 'more',
        },
      ]),
    ),
    news: {
      text: (c) => rotate(c, '_rumor', [...groupRumors(personaOf(c)), ...rumors(c)]),
      choices: [
        { text: 'Anything else?', goto: 'news' },
        { text: 'Let’s talk about something else.', goto: 'more' },
        { text: 'Vale.', end: true },
      ],
    },
    directions: {
      text: 'Where to?',
      choices: [...PLACES.map((p) => ({ text: p.label, goto: `to-${p.id}` })), { text: 'Never mind.', goto: 'more' }],
    },
    ...Object.fromEntries(PLACES.map((p) => [`to-${p.id}`, { text: p.how, next: 'more' }])),
    secret: {
      text: '(They glance round and lower their voice.) Grassatores. Hired men. They say a gladiator trained them, a thraex, and that they sleep in the taberna that burned at the Kalends, off the Vicus Tuscus. But you didn’t hear it from me.',
      effects: (c) => (c.setFlag('hideout-known', true), c.setFlag('clue-curved-blade', true)),
      next: 'more',
    },
    clam: { text: 'Me? I hear nothing. I see nothing. I sell onions.', next: 'more' },
    alms: {
      text: (c) => vary(personaOf(c), 'alms', ['(The coin vanishes into a fold of rag.) The gods see, domine. They see.', 'Bless you. Bless your house. Bless your mule, if you have one.', 'An as! That’s bread today. Thank you.']),
      next: 'more',
    },
  },
});

/** After "Who are you?": the prompt shows their name from then on ("Hilarus", "Gaius Julius Felix"). */
function nameThem(c: DialogueContext) {
  const p = personaOf(c);
  if (p.status === 'vestal' || (p.status === 'poor' && !p.short)) return;
  const npc = (c.game as unknown as { population?: { get?(id: string): CrowdNpc | undefined } }).population?.get?.(c.npcId);
  if (npc) npc.name = p.status === 'elite' || p.status === 'citizen' || p.status === 'freed' || p.status === 'elder' ? p.name : p.short;
}

export default [vigiles, urbaniciani, citizen];
