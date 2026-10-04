/**
 * Generic dialogue: the night watch and the urban cohorts, and the '*' fallback for every unnamed
 * citizen in the crowd (GDD §15.2: rumors, directions in the Roman manner, and a Rhetoric check).
 * Greetings follow the hour and the festival: on the Lemuria day people are jumpy after dark.
 * Sources for the lines: docs/CONTENT.md §8.1 (barks and rumours), Juvenal 3.
 */
import { todaysFestivals } from '../../content/director';
import { completed, hourNow, rotate, rumor } from '../../content/talk';
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

const citizen = defineDialogue({
  id: 'citizens',
  npcs: ['*'],
  priority: -50,
  start: (c) => {
    if (night(c)) return todaysFestivals(c.game).includes('fest-lemuria') ? 'lemuriaNight' : 'night';
    return 'greet';
  },
  nodes: {
    greet: {
      text: (c) => rotate(c, '_greet', ['Salve. Quid novi?', 'Ave. You look lost. Everyone looks lost in this city.', 'Mind the carts. They come through at night, but the drivers are still drunk at noon.', 'Yes? I have a minute. Half a minute.']),
      choices: [
        { text: 'What’s the news?', goto: 'news' },
        { text: 'Which way to…', goto: 'directions' },
        { text: 'You look like you hear things. What do people say about the courier knifed at the Porta Capena?', if: (c) => completed(c, 'mq-01-madida-capena') || !!c.flag('festus-dead'), check: { skill: 'rhetoric', difficulty: 25, pass: 'secret', fail: 'clam' }, once: true },
        { text: 'I’ll make it worth your while to talk. (Bribe)', bribe: { amount: 0.25, goto: 'news' }, once: true },
        { text: 'Vale.', end: true },
      ],
    },
    news: {
      text: (c) => rumor(c),
      choices: [
        { text: 'Anything else?', goto: 'news' },
        { text: 'Vale.', end: true },
      ],
    },
    directions: {
      text: 'Where to?',
      choices: [...PLACES.map((p) => ({ text: p.label, goto: `to-${p.id}` })), { text: 'Never mind.', end: true }],
    },
    ...Object.fromEntries(PLACES.map((p) => [`to-${p.id}`, { text: p.how, end: true }])),
    secret: {
      text: '(They glance round and lower their voice.) Grassatores. Hired men. They say a gladiator trained them, a thraex, and that they sleep in the taberna that burned at the Kalends, off the Vicus Tuscus. But you didn’t hear it from me.',
      effects: (c) => (c.setFlag('hideout-known', true), c.setFlag('clue-curved-blade', true)),
      end: true,
    },
    clam: { text: 'Me? I hear nothing. I see nothing. I sell onions.', end: true },
    night: { text: 'Who’s that? Stay back! … Oh. Gods, you scared me. Go home, friend, the knife-men are out.', end: true },
    lemuriaNight: { text: '(They make the sign with the thumb in the middle of the fingers.) Don’t whistle. Don’t look behind you. It’s the Lemuria. Go home and bang a pan.', end: true },
  },
});

export default [vigiles, urbaniciani, citizen];
