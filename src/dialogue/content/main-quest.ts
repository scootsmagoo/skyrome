/**
 * The main-quest thread of v0.1 (docs/CONTENT.md §3.1.1–§3.1.2): Festus on the cart, Festus
 * dying, the carter Dromo (mq-01); Philetus at the shut doors is in vendors.ts. Chrysippus, Gratus
 * (day and dusk), Mus in the burned taberna and the optio Verecundus (mq-02, and the law after the
 * brawl) follow. Quests react to node ids, not to texts:
 *
 *   npc-festus      cartEnd (talk-festus), warned, dyingEnd (the tablet is his last gift)
 *   npc-dromo       sawIt (ask-dromo)
 *   npc-chrysippus  fetch (Gratus comes out)
 *   npc-gratus      gratusDay (the clue), dusk → delivered
 *   npc-mus         surrender, attack, tellAll
 *   npc-verecundus  lawFine / lawClear (misc-meta-sudans-rixa)
 */
import { completed, female, hourNow, origin, outcome, rotate, running, stage } from '../../content/talk';
import { defineDialogue, type DialogueContext } from '../types';

const MQ1 = 'mq-01-madida-capena';
const MQ2 = 'mq-02-tabella';

// ------------------------------------------------------------------ Festus

const festus = defineDialogue({
  id: 'npc-festus',
  npcs: ['npc-festus'],
  priority: 100,
  start: (c) => {
    const s = stage(c, MQ1);
    if (s === 'dying') return 'd0';
    if (s === 'ambush') return 'fighting';
    if (s === 'start' || s === 'gate') return c.memory.met ? 'again' : 'n0';
    return 'dead';
  },
  nodes: {
    // ---- on the cart (dlg-mq01-festus-cart)
    n0: {
      text: 'Awake? Good. The carter swears we’ll be through the gate before the cocks start. First time in Rome?',
      effects: (c) => {
        c.memory.met = true;
      },
      choices: [
        { text: 'First time.', goto: 'n1' },
        { text: 'I was born in the Subura. I’m coming home.', if: (c) => origin(c) === 'civis-suburanus', goto: 'n1s' },
        { text: 'The last time I saw it was the triumph. Six years ago.', if: (c) => origin(c) === 'veteranus', goto: 'n1v' },
        { text: 'The first time, I came in chains.', if: (c) => origin(c) === 'dacus', goto: 'n1d' },
        { text: 'First time. I carry a letter for a lady from Corduba.', if: (c) => origin(c) === 'hispanus', goto: 'n1h' },
      ],
    },
    n1: { text: 'Then hold on to your purse and your hat. Rome takes both and says thank you.', next: 'n2' },
    n1s: { text: 'Then you know the rules better than I do. Don’t walk under windows after dark.', next: 'n2' },
    n1v: { text: 'Then you’ll find it grown. A new forum, new baths, and a column with your whole war carved on it.', next: 'n2' },
    n1d: { speaker: 'player', text: '(Festus is quiet for a moment.)', next: 'n1d2' },
    n1d2: { text: 'Then I won’t tell you about the column. You’ll see it soon enough. I’m sorry.', effects: (c) => c.changeDisposition(5), next: 'n2' },
    n1h: { text: 'Corduba! The emperor’s own people. They’ll treat you like a cousin, and charge you like one.', next: 'n2' },
    n2: {
      text: 'I carry letters for the imperial post. Don’t ask me what’s in them. I’m paid not to know.',
      choices: [
        { text: 'Who do you carry them for?', once: true, goto: 'n3' },
        { text: 'Is it dangerous work?', once: true, goto: 'n4' },
        { text: 'Who’s waiting for you in Rome?', once: true, goto: 'n5' },
        { text: 'Rest. We’re nearly there.', goto: 'cartEnd' },
      ],
    },
    n3: { text: 'For a camp on the Caelian. Men who read other men’s letters for a living. Tonight I’m only a tired soldier on a wine cart.', next: 'n2' },
    n4: { text: 'On the road, no. Near home, sometimes. Rome is the only city where I sleep with my boots on.', next: 'n2' },
    n5: {
      text: 'My mother, my father, and my brother, if he’s ever home. My twin. He copies books in the Velabrum. People mix us up; he hates it.',
      effects: (c) => c.setFlag('festus-mentioned-twin', true),
      next: 'n2',
    },
    again: {
      text: 'The gate is just ahead, under the arches. Walk with me. I like to see a street before I step into it.',
      choices: [
        { text: 'What are you carrying?', goto: 'n2' },
        { text: 'Let’s go.', goto: 'cartEnd' },
      ],
    },
    cartEnd: { text: '(He nods at the dark arches ahead and walks on beside the cart.) Keep left, under the arch. Nobody stands in the drip.', end: true },

    // ---- in the road, under the arch (the knife-men are on you)
    fighting: { text: '(The courier is on his knees, a hand pressed to his side.) Behind you!', end: true },

    // ---- dying (dlg-mq01-festus-dying)
    d0: { text: 'Stranger… no, don’t press it. It’s deep.', next: 'd1' },
    d1: {
      text: 'Take this. Sealed. The strongrooms under Castor’s temple, in the Forum. Ask for Gratus. Only Gratus.',
      effects: (c) => {
        if (!c.hasItem('quest-tabella-signata')) c.giveItem('quest-tabella-signata');
      },
      choices: [
        { text: 'Who did this to you?', goto: 'd2' },
        { text: 'I’ll take it to him.', goto: 'd3' },
        { text: 'Why trust me?', goto: 'd2b' },
      ],
    },
    d2: {
      text: 'Hired knives. The one behind me fought like a gladiator. Curved blade. They took my satchel; let them have it. They didn’t get the tablet.',
      effects: (c) => c.setFlag('clue-curved-blade', true),
      next: 'd3',
    },
    d2b: { text: 'Because you stayed. Everyone else in this city would have run.', next: 'd3' },
    d3: {
      text: 'Tell my mother… tell her it was quick. Lie, if you have to. The Marii, behind the Vicus Tuscus, in the Velabrum.',
      effects: (c) => c.setFlag('festus-family-known', true),
      choices: [
        { text: 'I’ll tell her myself.', goto: 'dyingEnd', effects: (c) => c.setFlag('promised-festus', true) },
        { text: 'Rest now.', goto: 'dyingEnd' },
      ],
    },
    dyingEnd: { speaker: 'player', text: '(Festus does not answer. The water from the arch keeps falling on his face.)', end: true },

    // ---- afterwards
    dead: { speaker: 'player', text: '(The courier is dead. Someone has put a coin in his mouth for the ferryman.)', end: true },
  },
});

// ------------------------------------------------------------------ Dromo

const dromo = defineDialogue({
  id: 'npc-dromo',
  npcs: ['npc-dromo'],
  priority: 80,
  start: (c) => {
    const s = stage(c, MQ1);
    if (s === 'dying' || s === 'city') return 'n0';
    if (s === 'ambush') return 'hiding';
    if (s === 'start' || s === 'gate') return 'night';
    return completed(c, MQ1) ? 'after' : 'greet';
  },
  nodes: {
    night: {
      text: 'Last cart before dawn, and they give me marble for the Forum of Trajan! My axle sings like a Greek, Mehercle. (He jerks his chin at the courier.) That one rode with me from Bovillae. Paid in silver, said nothing. I don’t like men who say nothing.',
      choices: [
        { text: 'Why is everything so wet?', goto: 'wet', once: true },
        { text: 'Why do the carts only come at night?', goto: 'carts', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    wet: { text: 'The aqueduct, friend. The water runs right over the gate and leaks on everybody, emperor or carter. Madida Capena, the poets call it: the dripping gate. The poets don’t drive under it.', next: 'night' },
    carts: { text: 'Law. No wheels in the city by day, except for temple carts and builders’ wagons for the emperor’s works. So we come at night and wake the whole city instead. The aediles call that order.', next: 'night' },
    hiding: { text: '(The carter is under his cart with his arms over his head.) I see nothing! I see nothing!', end: true },
    n0: {
      text: 'Gods below, they cut him like a ham. I was under the cart, and I’m not ashamed of it.',
      choices: [
        { text: 'Did you see who did it?', goto: 'n1' },
        { text: 'Which way is the Forum?', goto: 'n2' },
        { text: 'You should tell the watch.', goto: 'n3' },
        { text: 'Go home, Dromo.', end: true },
      ],
    },
    n1: {
      text: 'Three of them. The one who did the knifing wore a hood and walked like a fighter, up on his toes. He took the soldier’s bag and ran toward the Circus.',
      effects: (c) => c.setFlag('clue-hooded-fighter', true),
      next: 'sawIt',
    },
    sawIt: { text: '(He wipes his hands on his tunic.) That’s all I know. All of it. I swear by Mercury and by my mules.', next: 'n0' },
    n2: { text: 'Up the valley, under the palace, Circus on your left. At the far end the Vicus Tuscus takes you straight into the Forum. You can’t miss it: it’s where all the shouting is.', next: 'n0' },
    n3: { text: 'The watch? The watch will ask what a slave was doing out at… oh. Carts are allowed at night. Right. Still. I’ll have a drink first.', next: 'n0' },
    greet: { text: 'Out of the road, I’m resting. Carts by night, sleep by day. That’s the law.', end: true },
    after: {
      text: (c) => rotate(c, 'dromoAfter', ['(He’s drinking, and telling it for the fourth time.) …and the hooded one walked like a fighter! A fighter, I tell you!', 'A man died at the gate. Nobody’s mule will stop there now.', 'Wine for the Velabrum, lime for the Pantheon, and corpses for the gods. Busy night.']),
      choices: [
        { text: 'The hooded one. Tell me again.', if: (c) => !c.flag('clue-hooded-fighter'), goto: 'n1' },
        { text: 'Vale.', end: true },
      ],
    },
  },
});

// ------------------------------------------------------------------ Chrysippus

const chrysippus = defineDialogue({
  id: 'npc-chrysippus',
  npcs: ['npc-chrysippus'],
  priority: 70,
  start: (c) => (stage(c, MQ2) === 'loculi' ? 'n0' : completed(c, MQ2) ? 'after' : 'idle'),
  nodes: {
    n0: {
      text: 'Deposits on the left, withdrawals on the right. Which are you?',
      choices: [
        { text: 'Neither. I’m looking for Gratus.', goto: 'n1' },
        { text: '(Show him the seal.)', if: (c) => c.hasItem('quest-tabella-signata'), goto: 'n4' },
      ],
    },
    n1: {
      text: 'Gratus? There is no Gratus. There has never been a Gratus. Who sent you?',
      choices: [
        { text: 'A courier sent me, with his last breath. Fetch him.', check: { skill: 'rhetoric', difficulty: 25, pass: 'n2', fail: 'n3' } },
        { text: 'Fetch him, or I’ll count your keys for you.', check: { skill: 'rhetoric', difficulty: 25, kind: 'intimidate', label: 'Intimidate', pass: 'n2', fail: 'n3' } },
        { text: 'For your trouble. (Bribe)', bribe: { amount: 6, goto: 'n2' } },
      ],
    },
    n2: { text: '…Wait here. Touch nothing. Nothing!', next: 'fetch' },
    n3: { text: 'Out. Out, before I call the—', next: 'n3b' },
    n3b: { speaker: 'player', text: '(A door opens behind him. A grey-haired man in a soldier’s belt steps out.) “Who said Festus?”', next: 'fetch' },
    n4: { speaker: 'player', text: '(Chrysippus goes white at the impression in the wax: a horseman with a raised spear.) “That’s… wait. Wait here.”', next: 'fetch' },
    fetch: { speaker: 'player', text: '(The keeper hurries into the back, his keys jangling like a goat’s bells.)', end: true },
    after: {
      text: 'Lockers by the month, a denarius a month, paid in advance. The keepers answer for the lockers, not for what is in them. Mind the step. Eleven steps. I counted them in the year of Nerva.',
      choices: [
        { text: 'What is kept here?', goto: 'what', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    what: { text: 'Bankers’ cash. Widows’ wills. Men’s secrets they don’t want at home. The temple is shut. The money is not. Money never sleeps.', next: 'after' },
    idle: {
      text: 'Deposits on the left, withdrawals on the right, complaints to the gods. (He doesn’t look up from his ledger.) Eleven steps. Mind them.',
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Gratus

const gratus = defineDialogue({
  id: 'npc-gratus',
  npcs: ['npc-gratus'],
  priority: 90,
  start: (c) => {
    const s = stage(c, MQ2);
    if (s === 'deliver') return c.hasItem('quest-tabella-signata') ? 'dusk0' : 'noTablet';
    if (s === 'gratus') return 'day0';
    if (s === 'mus') return 'waiting';
    return completed(c, MQ2) ? 'after' : 'idle';
  },
  nodes: {
    // ---- daylight (dlg-mq02-gratus-day)
    day0: {
      text: 'You have something of Festus’. Don’t take it out. Tell me how he died.',
      choices: [
        { text: 'Knifed under the Capena arch. Three men; one fought like a gladiator.', goto: 'day1' },
        { text: 'He said it was a curved blade.', if: (c) => !!c.flag('clue-curved-blade'), goto: 'day1c' },
        { text: 'Take the tablet and let me go.', goto: 'day2' },
      ],
    },
    day1: { text: 'A gladiator. In the Velabrum they hire the ones the Ludus throws out.', next: 'day3' },
    day1c: { text: 'Curved. A sica. Then a thraex, or a man who learned from one.', effects: (c) => c.changeDisposition(5), next: 'day3' },
    day2: { text: 'Not in daylight. A dispatch is never carried across the Forum by day. Keep it in your belt. Nobody looks twice at a stranger; everybody looks at me.', next: 'day3' },
    day3: {
      text: 'Go to the Ludus Magnus, past the amphitheatre. Ask Glaucus, the doctor there, who uses that stroke. Prove yourself useful, and come back after the lamps are lit.',
      choices: [
        { text: 'Why should I do your work for you?', goto: 'day4' },
        { text: 'I’ll go.', goto: 'gratusDay' },
      ],
    },
    day4: { text: 'Because Festus trusted you, and he was a good judge of men. And because you’ll be paid.', next: 'gratusDay' },
    gratusDay: { speaker: 'player', text: '(Gratus turns back toward the strongrooms without another word.)', end: true },
    waiting: {
      text: (c) =>
        hourNow(c) < 19
          ? 'The lamps aren’t lit. Come back when they are, and bring it with you. (He nods toward the street.) Ask at the Ludus about that stroke, if you haven’t.'
          : 'You’re early. Wait. Let the Forum empty first.',
      end: true,
    },
    // ---- dusk (dlg-mq02-gratus-dusk)
    noTablet: { text: 'Where is the tablet? …You didn’t lose it. Tell me you didn’t lose it.', end: true },
    dusk0: {
      text: 'You came back. Most don’t. The tablet.',
      choices: [{ text: '(Give him the tablet.)', goto: 'dusk1', effects: (c) => void c.takeItem('quest-tabella-signata') }],
    },
    dusk1: { speaker: 'player', text: '(He checks the seal against the lamp, then breaks it.)', next: 'dusk2' },
    dusk2: {
      text: 'Festus’ own cipher. Of course. His brother would have the key, and his brother has been missing since the Ides of April.',
      choices: [
        { text: 'I found his satchel. And the man who took it.', if: (c) => c.hasItem('quest-sacculum-festi'), goto: 'dusk3' },
        { text: 'What does it say?', goto: 'dusk4' },
      ],
    },
    dusk3: {
      text: 'Mus. Dead or running, it comes to the same thing for now. (He turns the scraped tablet over, then the silver coin.) A Parthian drachm. In a Roman knife-man’s purse. (He looks at you for a long moment.)',
      effects: (c) => {
        c.takeItem('quest-sacculum-festi');
        c.receive(25);
        c.game.standing?.addFame('dist-forum-romanum', 5);
        c.setFlag('gratus-has-drachm', true);
      },
      next: 'dusk4',
    },
    dusk4: { text: 'It says nothing until I have the key. But tomorrow is the Column, and Festus rode nine days to be here before it.', next: 'dusk5' },
    dusk5: {
      text: 'Take this token. Show it at the camp on the Caelian if you’re ever asked who you are. And take this, for the courier’s burial; see that his family get some of it.',
      effects: (c) => {
        c.giveItem('quest-tessera-peregrina');
        c.receive(25);
      },
      choices: [
        { text: 'I promised him I’d tell his mother.', if: (c) => !!c.flag('promised-festus'), goto: 'dusk6' },
        { text: 'Until tomorrow.', goto: 'delivered' },
      ],
    },
    dusk6: { text: 'Then keep your promise. Not tonight, though; tonight the Velabrum belongs to the dead.', next: 'delivered' },
    delivered: { speaker: 'player', text: '(Gratus pinches out the lamp. “Tomorrow, the Column.”)', end: true },
    // ---- around it
    idle: {
      text: (c) => rotate(c, 'gratusIdle', ['Walk on. If you need me you’ll know where.', 'Every seal in Rome tells a story. Most of them lie.', 'Daylight is for honest men and fools.', 'Festus was the best rider in the camp. Remember that, if anyone asks.']),
      end: true,
    },
    after: { text: 'You again. If you’ve nothing to carry, walk on. Tomorrow will want everyone’s eyes. Festus was the best rider in the camp. Remember that, if anyone asks.', end: true },
  },
});

// ------------------------------------------------------------------ Mus

const mus = defineDialogue({
  id: 'npc-mus',
  npcs: ['npc-mus'],
  priority: 90,
  start: (c) => (c.memory.beaten ? 'beaten' : 'n0'),
  nodes: {
    n0: {
      text: 'Who sent you? Glaucus? Tell him the Mouse still bites. Thirty-one bouts, and he threw me out for a cloak.',
      choices: [
        { text: 'I want the courier’s satchel.', goto: 'n1' },
        { text: 'Give me the satchel and run. Now.', check: { skill: 'rhetoric', difficulty: 25, kind: 'intimidate', label: 'Intimidate', pass: 'surrender', fail: 'attack' } },
        { text: 'Someone paid you to kill a courier. Who?', check: { skill: 'rhetoric', difficulty: 40, pass: 'tellAll', fail: 'attack' } },
        { text: '(Draw steel.)', goto: 'attack' },
      ],
    },
    n1: { text: 'The bag? Useless. Wax and a foreign coin. Take it off my body, if you can.', next: 'attack' },
    surrender: {
      text: '…Take it. Take the key too. I was never here.',
      effects: (c) => {
        c.giveItem('clavis-cellae-muris');
        c.setFlag('mus-fate', 'fled');
        c.memory.beaten = true;
      },
      end: true,
    },
    tellAll: {
      text: 'A man with Syrian silver, at the Pepper Warehouses. He never gave a name; men like that never do. Now get out of my cellar.',
      effects: (c) => c.setFlag('clue-piperataria', true),
      next: 'surrender',
    },
    attack: { text: 'Up from under, then.', effects: (c) => c.attack(), end: true },
    beaten: { text: '(Dizas sits against the wall with his hands up.) The mice eat what the lions leave. Go on. Take what’s yours.', end: true },
  },
});

// ------------------------------------------------------------------ Verecundus

const verecundus = defineDialogue({
  id: 'npc-verecundus',
  npcs: ['npc-verecundus'],
  priority: 60,
  start: () => 'idle',
  nodes: {
    idle: {
      text: (c) => rotate(c, 'verecundusIdle', ['Move along. Rome’s big enough for everyone if everyone moves.', 'Dice? On the basilica steps? I see nothing. I see everything.', 'No fighting in the Forum. Fight in the Subura like civilised people.', 'Before the Column, everyone’s a suspect. After it, everyone’s a hero.']),
      choices: [
        { text: 'I want to report a murder. A courier, at the Porta Capena.', if: (c) => completed(c, MQ1), goto: 'report', once: true },
        { text: 'What happens tomorrow?', goto: 'tomorrow', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    report: { text: '(He writes on a tablet without looking at you.) A courier. A soldier’s courier, they say. Not our business: his own officers took the body before the second hour. If you know something, citizen, keep it to yourself. That’s advice.', effects: (c) => c.setFlag('mq01-reported', true), next: 'idle' },
    tomorrow: { text: 'The Column. The Forum of Trajan closed from dawn, double watches on every street, and every pickpocket in Italy here for the crowd. Watch your purse.', next: 'idle' },
  },
});

export default [festus, dromo, chrysippus, gratus, mus, verecundus];
