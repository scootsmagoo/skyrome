/**
 * EXAMPLE DIALOGUE (dev scenes and tests only) for the example quest in
 * src/quests/content/_example.ts: the scribe Eutychus, the banker Sextus, and a '*' fallback for
 * unnamed citizens. Shows greetings chosen by quest state, a hub, a once-choice, a Rhetoric
 * check, a bribe, conditions on items and flags, effects, and quest hand-offs via node ids.
 */
import { defineDialogue, type DialogueContext } from '../types';

const letterState = (c: DialogueContext) => c.quest('ex-letter');

const scriba = defineDialogue({
  id: 'ex-scriba',
  npcs: ['ex-scriba'],
  start: (c) => {
    const q = letterState(c);
    if (q?.running) return q.stage === 'reply' ? 'return' : 'waiting';
    if (q?.done) return 'after';
    return c.memory.met ? 'again' : 'greet';
  },
  nodes: {
    greet: {
      text: 'Salve, stranger. You have the look of someone with legs and no employer. I have a letter and no legs to spare — the Prefect’s clerks want three copies of everything by noon.',
      effects: (c) => (c.memory.met = true),
      choices: [
        { text: 'What letter?', goto: 'offer' },
        { text: 'Who are you?', goto: 'who', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    again: {
      text: 'Back again? The letter has not delivered itself.',
      choices: [
        { text: 'Tell me about the letter.', goto: 'offer' },
        { text: 'Vale.', end: true },
      ],
    },
    who: {
      text: 'Gaius Valerius Eutychus: scribe, freedman of the Valerii, servant of whoever pays. I copy contracts and petitions for people who cannot write — which is most of Rome.',
      next: 'again',
    },
    offer: {
      text: 'A sealed tablet for Sextus Aelius, the banker, at his table in the Basilica Aemilia — just across the Forum. Fifteen denarii when you bring back his answer. And the seal stays unbroken.',
      choices: [
        { text: 'I’ll take it.', goto: 'accept' },
        { text: 'Fifteen, for a walk across the Forum? I want something in advance.', once: true, check: { skill: 'rhetoric', difficulty: 20, pass: 'advance', fail: 'noAdvance' } },
        { text: 'Not today.', goto: 'decline' },
      ],
    },
    advance: {
      text: 'Ha! A negotiator. Very well — two denarii now, the rest when you return.',
      effects: (c) => c.receive(2),
      next: 'accept',
    },
    noAdvance: {
      text: 'In advance? I am a scribe, not a fool.',
      choices: [
        { text: 'Fine. I’ll take it.', goto: 'accept' },
        { text: 'Then find someone else.', goto: 'decline' },
      ],
    },
    accept: {
      text: 'Here. Mind the seal — and mind the pickpockets by the Rostra.',
      end: true,
    },
    decline: {
      text: 'Then may Mercury send me someone with ambition.',
      end: true,
    },
    waiting: {
      text: 'Why are you still here? The Basilica Aemilia is right there — the long hall with the shops along its front.',
      choices: [
        { text: 'Anything else you need?', goto: 'figs', once: true },
        { text: 'Here are your figs.', if: (c) => c.hasItem('ficus', 3) && !!c.quest('ex-letter')?.running && !c.flag('ex-figs-given'), goto: 'figsGiven', effects: (c) => (c.takeItem('ficus', 3), c.setFlag('ex-figs-given', true)) },
        { text: 'I’m going.', end: true },
      ],
    },
    figs: {
      text: 'Since you ask… if you pass a fig seller, bring me three dried figs. I have not eaten since dawn. I will pay, of course.',
      end: true,
    },
    return: {
      text: 'You’re back! Did Sextus answer?',
      choices: [
        { text: 'Here is his reply.', if: (c) => c.hasItem('ex-reply'), goto: 'thanks', effects: (c) => void c.takeItem('ex-reply') },
        { text: 'Here are your figs.', if: (c) => c.hasItem('ficus', 3) && !c.flag('ex-figs-given'), goto: 'figsGiven', effects: (c) => (c.takeItem('ficus', 3), c.setFlag('ex-figs-given', true)) },
        { text: 'Not yet.', end: true },
      ],
    },
    figsGiven: {
      text: 'Figs! You are a better citizen than half the Senate. Here, two denarii for your trouble.',
      next: 'hub',
    },
    hub: {
      text: (c) => (letterState(c)?.stage === 'reply' ? 'Now — the reply?' : 'Now — the letter?'),
      choices: [
        { text: 'Here is Sextus’s reply.', if: (c) => c.hasItem('ex-reply'), goto: 'thanks', effects: (c) => void c.takeItem('ex-reply') },
        { text: 'I’m on my way.', end: true },
      ],
    },
    thanks: {
      text: 'Gods be thanked — he will wait until the Ides. Here: fifteen denarii, as promised. You have a future in this city.',
      end: true,
    },
    after: {
      text: 'Ah, my messenger. If I need another letter carried, I will look for you.',
      end: true,
    },
  },
});

const sextus = defineDialogue({
  id: 'ex-sextus',
  npcs: ['ex-sextus'],
  start: (c) => {
    const q = letterState(c);
    if (q?.running && q.stage === 'start' && c.hasItem('ex-letter')) return 'letter';
    return 'greet';
  },
  nodes: {
    greet: {
      text: 'Sextus Aelius, argentarius. Loans at one per cent a month, exchange at fair rates. Unless you have business, you are standing in my light.',
      choices: [
        { text: 'Who built this basilica?', goto: 'lore', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    lore: {
      text: 'Aemilius Paullus rebuilt it with Caesar’s gold — Caesar bought half the Senate the same way. Bankers have kept their tables under this roof for two hundred years.',
      choices: [{ text: 'Vale.', end: true }],
    },
    letter: {
      text: (c) => (c.flag('ex-letter-opened') ? 'Eutychus sent you? … This seal has been broken. Did you read it?' : 'A letter from Eutychus? Give it here.'),
      choices: [
        { text: 'Here.', if: (c) => !c.flag('ex-letter-opened'), goto: 'delivered', effects: (c) => void c.takeItem('ex-letter') },
        { text: 'It was broken when he gave it to me.', if: (c) => !!c.flag('ex-letter-opened'), effects: (c) => void c.takeItem('ex-letter'), check: { skill: 'rhetoric', difficulty: 35, label: 'Lie', pass: 'delivered', fail: 'suspicious' } },
        { text: 'Five denarii says you’ll tell me what this is about.', once: true, bribe: { amount: 5, goto: 'gossip' } },
      ],
    },
    gossip: {
      text: 'Hm. Eutychus borrowed four hundred sesterces at the Kalends to pay a gambling debt — knucklebones, in a tavern on the Vicus Tuscus. The letter will say he cannot pay. They always say that.',
      next: 'letter',
    },
    suspicious: {
      text: 'Then I will trust you as far as I trust Eutychus — which is to the edge of this table.',
      next: 'delivered',
    },
    delivered: {
      text: 'Well. Well, well. Wait here… Take this reply to Eutychus. And you saw nothing.',
      end: true,
    },
  },
});

const citizen = defineDialogue({
  id: 'ex-citizen',
  npcs: ['*'],
  priority: -100,
  start: () => 'hello',
  nodes: {
    hello: {
      text: (c) => (c.memory._talks === 1 ? 'Ave. Mind the carts — they come through at night, but the drivers are still drunk at noon.' : 'Still here? The Forum is that way.'),
      end: true,
    },
  },
});

export default [scriba, sextus, citizen];
