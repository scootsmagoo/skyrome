/**
 * Dialogue for the v0.1 vendors: the arms dealer on the Sacra Via (barter and repairs), Vibia
 * Sabina of the Cockerel (food, drink, a room and the rumor mill, with a Rhetoric check about the
 * knife-men), the baker, the fuller (cleaning removes `sordidus`), the barber, the astrologer by the
 * Circus and the pearl seller of the Porticus Margaritaria.
 */
import { completed, rumor } from '../../content/talk';
import { defineDialogue } from '../types';

const aper = defineDialogue({
  id: 'npc-annius-aper',
  npcs: ['npc-annius-aper'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: 'Marcus Annius Aper, from Bilbilis on the Salo. Iron, steel and the best steel. The gladiators buy from me, the soldiers buy from me, and the men who rob them both buy from me too.',
      choices: [
        { text: 'Show me your wares.', end: true, effects: (c) => c.openService('barter') },
        { text: 'Can you repair my gear?', end: true, effects: (c) => c.openService('repair') },
        { text: 'What makes Bilbilis steel so good?', goto: 'steel', once: true },
        { text: 'A courier was knifed at the Porta Capena this morning.', if: (c) => completed(c, 'mq-01-madida-capena'), goto: 'courier', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    steel: {
      text: 'The Salo. Coldest river in Spain, straight off the mountains. You quench a blade in it and it sings. Martial’s from my town, you know. Writes poems about it. Nobody reads them in Bilbilis, we’re all too busy forging.',
      next: 'greet',
    },
    courier: {
      text: '(He picks up a pugio and turns it in the light.) Knifed, you say. A pugio, short, in under the ribs? Cheap work. Good knives, cheap men. Half the pugiones in the Velabrum came off my table. I don’t ask what they’re for.',
      next: 'greet',
    },
  },
});

const sabina = defineDialogue({
  id: 'npc-vibia-sabina',
  npcs: ['npc-vibia-sabina'],
  start: (c) => (c.memory.met ? 'again' : 'greet'),
  nodes: {
    greet: {
      text: 'Welcome to the Cockerel! Wine for an as, better for two, Falernian for four. Sit, sit, nobody bites here except the bread. I’m Sabina. I own the place, and I own the bench you’re about to sit on.',
      effects: (c) => (c.memory.met = true),
      next: 'again',
    },
    again: {
      text: 'What’ll it be?',
      choices: [
        { text: 'Food and drink.', end: true, effects: (c) => c.openService('barter') },
        { text: 'A bed for the night. [4 as.]', end: true, effects: (c) => c.openService('rent') },
        { text: 'What’s the news?', goto: 'news' },
        { text: 'The two knife-men from the Porta Capena: Calvus and Sorex. Do they drink here?', if: (c) => !!c.flag('mq01.knowsNames') || completed(c, 'mq-01-madida-capena'), check: { skill: 'rhetoric', difficulty: 25, pass: 'knifemen', fail: 'shrug' }, once: true },
        { text: 'Vale.', end: true },
      ],
    },
    news: {
      text: (c) => rumor(c),
      next: 'again',
    },
    knifemen: {
      text: '(She refills your cup without being asked.) Calvus and Sorex. When they have money, and last night they had money. A big man paid for them: a trainer, scars on his arms like ladders. Not one of the Ludus Magnus lot; they don’t drink with grassatores. Those two sleep in the burned taberna down the street, the one that went up at the Kalends. You didn’t hear it from me.',
      effects: (c) => (c.setFlag('mq01.trainerLead', true), c.setFlag('hideout.known', true)),
      next: 'again',
    },
    shrug: {
      text: 'Everybody drinks here, love. I don’t ask names, I ask for money.',
      next: 'again',
    },
  },
});

const philetus = defineDialogue({
  id: 'npc-philetus',
  npcs: ['npc-philetus'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: 'Philetus, baker. Up since the third watch. Bread for the Forum, honey cakes for the gods, and nothing for free.',
      choices: [
        { text: 'Bread and honey cakes.', end: true, effects: (c) => c.openService('barter') },
        { text: 'Is it a good trade?', goto: 'trade', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    trade: {
      text: 'The emperor likes bakers. Feed Rome for three years with a mill that grinds a hundred modii a day, and a man with the wrong kind of freedom can become a full citizen. That’s Trajan’s edict. I’m in my second year. Buy a loaf.',
      next: 'greet',
    },
  },
});

const niger = defineDialogue({
  id: 'npc-sextus-niger',
  npcs: ['npc-sextus-niger'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: 'Sextus Niger, fuller. Clean as a Vestal’s conscience, four asses a tunic. The smell? That’s the smell of clean.',
      choices: [
        { text: 'Clean my clothes. [4 as.]', enabled: (c) => c.denarii() >= 0.25, goto: 'cleaned', effects: (c) => (c.pay(0.25), c.game.standing?.setCleanliness('normal')) },
        { text: 'What do you sell?', end: true, effects: (c) => c.openService('barter') },
        { text: 'What’s in the vats?', goto: 'vats', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    cleaned: {
      text: '(He dunks, treads, wrings, brushes and chalks your clothes while you stand in a borrowed tunic.) There. Fit for a salutatio. Mind the gutters on the way home.',
      end: true,
    },
    vats: {
      text: 'Urine, fuller’s earth and feet. Mine. Old Vespasian taxed the urine, and when his son complained he held a coin under his nose: “It doesn’t smell.” Mine does. Everything here does.',
      next: 'greet',
    },
  },
});

const thallus = defineDialogue({
  id: 'npc-thallus',
  npcs: ['npc-thallus'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: 'A shave, citizen? Sit, sit. Gossip is free; the razor is two asses.',
      choices: [
        { text: 'A shave. [2 as.]', enabled: (c) => c.denarii() >= 0.125, goto: 'shaved', effects: (c) => c.pay(0.125) },
        { text: 'Just the gossip.', goto: 'gossip' },
        { text: 'That amulet on your stall…', end: true, effects: (c) => c.openService('barter') },
        { text: 'Vale.', end: true },
      ],
    },
    shaved: {
      text: '(He works fast, chattering the whole time, and only nicks you once.) There. A face like the emperor’s. Well, like his nephew’s.',
      next: 'gossip',
    },
    gossip: {
      text: (c) => rumor(c),
      choices: [
        { text: 'More.', goto: 'gossip' },
        { text: 'Vale.', end: true },
      ],
    },
  },
});

const abdes = defineDialogue({
  id: 'npc-abdes',
  npcs: ['npc-abdes'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: 'Abdes the Chaldaean! I foretold the death of Domitian. Afterwards, but still. Your stars, citizen? Your fortune, your journeys, your wife?',
      choices: [
        { text: 'Read my stars. [10 den.]', enabled: (c) => c.denarii() >= 10, goto: 'stars', effects: (c) => c.pay(10) },
        { text: 'What do you sell?', end: true, effects: (c) => c.openService('barter') },
        { text: 'Can you cast the emperor’s horoscope?', goto: 'treason', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    stars: {
      text: '(He chalks circles on a board, mutters, rubs out a planet and puts it somewhere better.) Jupiter rising in your house of action, Mars on the cusp. Today, strike first. Tomorrow, the gods have other plans. One as extra and I tell you what they are. No? Wise.',
      effects: (c) => void c.game.player?.sheet?.applyCondition('omen-faustum'),
      end: true,
    },
    treason: {
      text: '(The colour leaves his face.) Lower your voice! That is maiestas, friend. The emperor’s nativity is not for sale, not here, not today, not by me. (He looks around, then lower still.) …Ask me again some other year.',
      effects: (c) => c.setFlag('genitura.asked', true),
      end: true,
    },
  },
});

const helpis = defineDialogue({
  id: 'npc-iulia-helpis',
  npcs: ['npc-iulia-helpis'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: 'Iulia Helpis, margaritaria. Pearls from the Red Sea, gems from India, and a few honest pieces of glass, which I always tell you are glass. Mostly.',
      choices: [
        { text: 'Show me.', end: true, effects: (c) => c.openService('barter') },
        { text: 'What is the most expensive pearl in Rome?', goto: 'pearl', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    pearl: {
      text: 'The one that isn’t here anymore. Cleopatra dissolved one in vinegar and drank it to win a bet with Antony. Ten million sesterces, Pliny says. I keep vinegar for salads.',
      next: 'greet',
    },
  },
});

export default [aper, sabina, philetus, niger, thallus, abdes, helpis];
