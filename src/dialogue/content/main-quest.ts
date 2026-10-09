/**
 * The main quest's people in Act I (docs/STORY.md): Festus on the cart and dying in the road, the
 * carter Dromo, Chrysippus who keeps the strongrooms of Castor, Gratus (by day, at dusk and through
 * the Lemuria night), Mus in the burned taberna, and the optio Verecundus. Each scene says plainly
 * who wants what, why, and where to go next. Quests react to node ids, not to texts:
 *
 *   npc-festus      cartEnd (talk-festus), d1 (the tablet), dyingEnd
 *   npc-dromo       sawIt (ask-dromo)
 *   npc-chrysippus  fetch (Gratus comes out)
 *   npc-gratus      gratusDay (mq-02 talk), delivered (mq-02 give), warnEnd (mq-03 warn),
 *                   postEnd (mq-04 briefing), w0 (mq-04 wounded)
 *   npc-mus         surrender, tellAll, attack
 *   npc-verecundus  report
 */
import { completed, dusk, hourNow, origin, rotate, running, stage } from '../../content/talk';
import { defineDialogue, type DialogueChoice, type DialogueContext } from '../types';

const MQ1 = 'mq-01-madida-capena';
const MQ2 = 'mq-02-tabella';
const MQ3 = 'mq-03-lemuria';
const MQ4 = 'mq-04-columna';

/** Gratus's questions are asked once each (saved in his memory); the hub choices hide once asked. */
const asked = (key: string) => (c: DialogueContext) => !c.memory[`q:${key}`];
const ask = (key: string) => (c: DialogueContext) => {
  c.memory[`q:${key}`] = true;
};

// ------------------------------------------------------------------ Festus

const festus = defineDialogue({
  id: 'npc-festus',
  npcs: ['npc-festus'],
  priority: 100,
  start: (c) => {
    const s = stage(c, MQ1);
    if (s === 'dying') return 'd0';
    if (s === 'ambush') return 'fighting';
    if (s === 'start') return c.memory.met ? 'again' : 'n0';
    if (s === 'gate') return 'walking';
    return 'dead';
  },
  nodes: {
    // ---- on the cart, before dawn
    n0: {
      text: '(A man in a travel-stained courier’s cloak sits up as the cart jolts.) Awake? Good. The carter swears we’ll be through the gate before the cocks start. First time in Rome?',
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
    n1v: { text: 'Then you’ll find it grown. A new forum, new baths, and a column with your whole war carved on it. They dedicate it tomorrow.', next: 'n2' },
    n1d: { speaker: 'player', text: '(Festus is quiet for a moment.)', next: 'n1d2' },
    n1d2: { text: 'Then I won’t tell you about the column they dedicate tomorrow. You’ll see it soon enough. I’m sorry.', effects: (c) => c.changeDisposition(5), next: 'n2' },
    n1h: { text: 'Corduba! The emperor’s own people. They’ll treat you like a cousin, and charge you like one.', next: 'n2' },
    n2: {
      text: 'Festus. I ride for the imperial post: a frumentarius, a soldier who carries Caesar’s letters. (He glances back down the dark road, and not for the first time.)',
      choices: [
        { text: 'What are you carrying?', once: true, goto: 'n3' },
        { text: 'You keep looking back down the road.', once: true, goto: 'n4' },
        { text: 'Who’s waiting for you in Rome?', once: true, goto: 'n5' },
        { text: 'We’re nearly at the gate.', goto: 'ask' },
      ],
    },
    n3: {
      text: '(He touches his belt, not the satchel on his shoulder.) A sealed tablet for my centurion. It came from the East by ship to Brundisium, and I’ve ridden nine days to have it here before the dedication. What’s in it is his business. I’m paid not to know.',
      next: 'n2',
    },
    n4: {
      text: 'Two riders. They joined the road at Bovillae and they’ve kept our pace ever since: never passed us, never fell behind. Men on good horses don’t trot behind a wine cart for twenty miles. Not unless they’re waiting for something.',
      effects: (c) => c.setFlag('festus-followed', true),
      next: 'n2',
    },
    n5: {
      text: 'My mother and father, in the Velabrum. And my brother, if he’s ever home. My twin, Gemellus. He copies books, and people mix us up. He hates it.',
      effects: (c) => c.setFlag('festus-mentioned-twin', true),
      next: 'n2',
    },
    ask: {
      text: 'Then do me a favour. Walk through the gate with me. Two are harder to knife than one, and I’d rather not find out alone why those riders are so patient. There’s a denarius in it, and a cup of wine after.',
      choices: [
        { text: 'I’ll walk with you.', goto: 'cartEnd' },
        { text: 'Keep your denarius. I’ll walk with you anyway.', goto: 'cartEnd', effects: (c) => c.changeDisposition(5) },
      ],
    },
    again: {
      text: 'The gate’s just ahead, under the aqueduct. Walk with me? I don’t like the road behind us.',
      choices: [
        { text: 'What are you carrying?', once: true, goto: 'n3' },
        { text: 'Let’s go.', goto: 'cartEnd' },
      ],
    },
    cartEnd: { text: '(He climbs down and loosens the knife at his belt.) Good. Keep to the left under the arch. Nobody stands in the drip.', end: true },
    walking: { text: 'Stay close. Through the arch and we’re in the city, and as safe as anyone is in Rome.', end: true },

    // ---- in the road, under the arch (the knife-men are on you)
    fighting: { speaker: 'player', text: '(Festus is down in the road, a hand pressed to his side.) “Behind you!”', end: true },

    // ---- dying
    d0: { text: '(Festus lies in the road with water from the arch dripping on his face.) You’re alive. Good. Listen, I haven’t long.', next: 'd1' },
    d1: {
      text: '(He pushes a sealed wax tablet into your hand.) Take it. They knew my road and my hour, and only my own camp knew those. So don’t take it to the camp.',
      effects: (c) => {
        if (!c.hasItem('quest-tabella-signata')) c.giveItem('quest-tabella-signata');
      },
      next: 'd1b',
    },
    d1b: {
      text: 'Gratus. My centurion. He keeps an office in the strongrooms under the Temple of Castor, in the Forum. Give it to him and to nobody else. Only Gratus.',
      choices: [
        { text: 'Who did this to you?', goto: 'd2' },
        { text: 'Why trust me?', goto: 'd2b' },
        { text: 'I’ll take it to Gratus.', goto: 'd3' },
      ],
    },
    d2: {
      text: 'The hooded one. A curved blade, once, up from under, the way gladiators finish a man. He grabbed my satchel and ran, the fool. There’s nothing in it but a spare tunic.',
      effects: (c) => c.setFlag('clue-curved-blade', true),
      next: 'd3',
    },
    d2b: { text: 'Because you stayed. Anyone else in this city would have run.', next: 'd3' },
    d3: {
      text: 'And my mother… The Marii, lamp-makers, in the Velabrum. Tell her it was quick. Lie, if you have to.',
      effects: (c) => c.setFlag('festus-family-known', true),
      choices: [
        { text: 'I’ll tell her myself.', goto: 'dyingEnd', effects: (c) => c.setFlag('promised-festus', true) },
        { text: 'Rest now.', goto: 'dyingEnd' },
      ],
    },
    dyingEnd: { speaker: 'player', text: '(Festus does not answer. The water from the arch keeps falling on his face. Your next step is the Forum: Gratus, under the Temple of Castor.)', end: true },

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
    if (s === 'dying') return 'n0';
    if (s === 'ambush') return 'hiding';
    if (s === 'start' || s === 'gate') return 'night';
    return completed(c, MQ1) ? 'after' : 'greet';
  },
  nodes: {
    night: {
      text: 'Last cart before dawn, and they give me marble for the Forum of Trajan! My axle sings like a Greek, Mehercle. (He jerks his chin at the courier.) That one rode with me from Bovillae and kept looking back the whole way. I don’t like a passenger who watches the road.',
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
        { text: 'Go home, Dromo.', end: true },
      ],
    },
    n1: {
      text: 'Three of them, waiting under the arch like they knew the hour. The one who did the knifing wore a hood and walked like a fighter, up on his toes. He took the soldier’s bag and ran up the valley, toward the Circus.',
      effects: (c) => c.setFlag('clue-hooded-fighter', true),
      next: 'sawIt',
    },
    sawIt: { text: '(He wipes his hands on his tunic.) That’s all I know. All of it. I swear by Mercury and by my mules.', next: 'n0' },
    n2: { text: 'Up the valley, under the palace, with the Circus on your left. At the far end the Vicus Tuscus takes you straight into the Forum. You can’t miss it: it’s where all the shouting is.', next: 'n0' },
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

const showSeal = (c: DialogueContext) => c.hasItem('quest-tabella-signata');

const chrysippus = defineDialogue({
  id: 'npc-chrysippus',
  npcs: ['npc-chrysippus'],
  priority: 70,
  start: (c) => (stage(c, MQ2) === 'start' ? 'n0' : completed(c, MQ2) || running(c, MQ3) ? 'after' : 'idle'),
  nodes: {
    n0: {
      text: '(A thin man with a ring of keys at his belt looks up from a ledger.) The strongrooms of Castor. Deposits on the left, withdrawals on the right. Which are you?',
      choices: [
        { text: 'I’m looking for a man called Gratus. A centurion.', goto: 'n1' },
        { text: '(Show him the seal on Festus’ tablet.)', if: showSeal, goto: 'n4' },
      ],
    },
    n1: {
      text: 'Then you’re asking the wrong man. Who keeps a box down here, and who doesn’t, is between them and me. That’s what they pay me for.',
      choices: [
        { text: '(Show him the seal on Festus’ tablet.)', if: showSeal, goto: 'n4' },
        { text: 'A courier was killed at the Capena Gate this morning. With his last breath he sent me to Gratus.', check: { skill: 'rhetoric', difficulty: 25, pass: 'n2', fail: 'n3' } },
        { text: 'For your trouble. (Bribe)', bribe: { amount: 6, goto: 'n2' } },
      ],
    },
    n2: { text: '(He looks at you for a long moment.) …Wait here. Touch nothing.', next: 'fetch' },
    n3: { text: 'People die in Rome every morning, friend. Good day.', next: 'n3b' },
    n3b: { speaker: 'player', text: '(A door opens behind him. A grey-haired man with a soldier’s belt steps out of the dark.) “Who said courier?”', next: 'fetch' },
    n4: { speaker: 'player', text: '(Chrysippus looks at the wax: a horseman with a raised spear, the couriers’ seal. He goes pale.) “Wait here.”', next: 'fetch' },
    fetch: { speaker: 'player', text: '(He hurries into the back, his keys jangling like a goat’s bells. Gratus is coming.)', end: true },
    after: {
      text: 'Lockers by the month, a denarius a month, paid in advance. The keepers answer for the lockers, not for what’s in them. Mind the step. Eleven steps. I counted them in the year of Nerva.',
      choices: [
        { text: 'What is kept here?', goto: 'what', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    what: { text: 'Bankers’ cash. Widows’ wills. Men’s secrets they don’t want at home. The temple shuts for the Lemuria. The money doesn’t. Money never sleeps.', next: 'after' },
    idle: {
      text: 'Deposits on the left, withdrawals on the right, complaints to the gods. (He doesn’t look up from his ledger.) Eleven steps. Mind them.',
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Gratus

/** The mq-04 briefing's questions (each asked once); the last one is the hook to the post. */
const d12Choices: DialogueChoice[] = [
  { text: 'What’s the plan?', if: asked('d12plan'), effects: ask('d12plan'), goto: 'd12plan' },
  { text: 'Who else knows what the message said?', if: asked('d12who'), effects: ask('d12who'), goto: 'd12who' },
  { text: 'What if the bow isn’t on the Column?', if: asked('d12else'), effects: ask('d12else'), goto: 'd12else' },
  { text: 'Where do you want me?', goto: 'd12post' },
];

const gratus = defineDialogue({
  id: 'npc-gratus',
  npcs: ['npc-gratus'],
  priority: 90,
  start: (c) => {
    // mq-04 (the Column): the briefing, the post, the wounded centurion, the aftermath.
    const s4 = stage(c, MQ4);
    if (s4 === 'dawn' || s4 === 'post') return 'd12a';
    if (s4 === 'ceremony') return 'd12cer';
    if (s4 === 'climb' || s4 === 'archer') return c.memory.w0said ? 'w0again' : 'w0';
    if (s4 === 'aftermath' || s4 === 'aftermath-killed') return 'a0';
    if (completed(c, MQ4)) return 'mq4after';
    const s2 = stage(c, MQ2);
    if (s2 === 'gratus') return 'day0';
    if (s2 === 'ludus') return 'toLudus';
    if (s2 === 'mus' || s2 === 'satchel') return 'toMus';
    if (s2 === 'dusk') return !dusk(c) ? 'notYet' : c.hasItem('quest-tabella-signata') ? 'dusk0' : 'noTablet';
    const s3 = stage(c, MQ3);
    if (s3 === 'warn') return 'warn0';
    if (s3) return 'waitKey';
    return completed(c, MQ3) ? 'after' : 'idle';
  },
  nodes: {
    // ---- the morning of 12 May (mq-04): the briefing, the post, the wounded centurion
    d12a: {
      text: 'You came. Good. Nobody in my camp slept, and I trust half of them.',
      choices: d12Choices,
    },
    d12more: { text: 'Anything else?', choices: d12Choices },
    d12plan: {
      text: 'Men on both library roofs and in the gallery. The praetorians round Caesar, thirty paces deep: Similis wouldn’t let me nearer. Apollodorus had the Column’s door sealed with lead at first light, after his men swept the stair. There’s nobody up there but the statue.',
      next: 'd12more',
    },
    d12who: {
      text: 'You, me, Pudens: he’s my chief, the princeps of the Peregrini. And whoever sold Festus’s road. I told Pudens last night. He said, “Then let them shoot, and we’ll see who hands them the bow.” He has a sense of humour, Pudens.',
      next: 'd12more',
    },
    d12else: {
      text: 'Then I’m a fool on the wrong roof. The message said a high place. Look up. There’s nothing higher in Rome today.',
      next: 'd12more',
    },
    d12post: {
      text: 'Stand at the Column’s door. Nobody goes in or out. You know the faces of the Mouse’s kind now. If anything feels wrong, shout, and don’t wait for my leave.',
      next: 'postEnd',
    },
    postEnd: { speaker: 'player', text: '(You take the centurion’s meaning.)', end: true },
    d12cer: {
      text: (c) => `Caesar comes at the second hour. Your post is the door.${hourNow(c) < 6 ? ' Wait. Watch. It’s early yet.' : ''}`,
      end: true,
    },
    w0: {
      text: 'On top. He’s on the top. The seal… Go! Alive if you can. I want the hand that paid him.',
      effects: (c) => {
        c.memory.w0said = true;
      },
      end: true,
    },
    w0again: {
      speaker: 'npc-crito',
      text: '(Crito looks up from his knees without letting go of the pressure.) He can’t talk. Go and do what he told you.',
      end: true,
    },
    a0: {
      text: 'Did you get him?',
      choices: [
        { text: 'He’s alive, and Pudens’s men have him.', if: (c) => c.flag('bitus-fate') === 'spared', once: true, goto: 'a1' },
        { text: 'He’s dead.', if: (c) => c.flag('bitus-fate') === 'killed', once: true, goto: 'a2' },
        { text: 'He wasn’t aiming at Caesar. He was aiming at you.', if: (c) => c.flag('bitus-fate') === 'spared' && !!c.flag('mq04-bitus-target'), once: true, goto: 'a3' },
        { text: 'Rest.', end: true },
      ],
    },
    a1: { text: 'Good. A dead man tells nothing.', end: true },
    a2: { text: 'Then he can’t tell us who paid. Pity.', end: true },
    a3: {
      text: 'At me? … Then someone in my own camp told them which centurion was asking about pepper. Tell Pudens. Tell him exactly that.',
      end: true,
    },
    mq4after: {
      text: 'The Column is dedicated, and I am still on my feet. Pudens will send for you when he is ready. Walk on.',
      end: true,
    },

    // ---- by day: Festus' news, and what to do about it
    day0: {
      text: '(A grey-haired man in a soldier’s belt comes out of the back, wiping ink from his fingers.) Chrysippus says you have something with Festus’ seal on it. Don’t take it out. Where’s Festus?',
      choices: [{ text: 'Dead. Knifed under the Capena Gate before dawn. He sent me to you with his tablet.', goto: 'day1' }],
    },
    day1: {
      text: '(He is quiet for a moment.) Nine days on the road, and they kill him at the gate. How?',
      choices: [
        { text: 'Three men were waiting under the arch. A hooded one with a curved blade stabbed him once, up from under, and ran off with his satchel.', goto: 'day2' },
        { text: 'He said two riders had followed his cart since Bovillae.', if: (c) => !!c.flag('festus-followed'), once: true, goto: 'day1b' },
      ],
    },
    day1b: { text: 'Then they knew he was coming, and from where. That makes it worse, not better. Go on: how did he die?', next: 'day1' },
    day2: {
      text: 'Waiting for him. Under the arch. At the very hour he came in. (He says the next part slowly.) Festus’ road and his hour were known in one place only: our camp, on the Caelian. Someone there sold him.',
      next: 'day3',
    },
    day3: {
      text: 'So I can’t take that tablet from you here. Half the informers in Rome drink on these steps. If they see me take it, whoever paid for Festus knows it reached me. Keep it in your belt. Bring it back after sunset, when the Forum is empty and the lamps are lit.',
      choices: [
        { text: 'Who are you, exactly?', once: true, goto: 'who' },
        { text: 'And until sunset?', goto: 'day4' },
      ],
    },
    who: { text: 'Aulus Vettulenus Gratus, centurion of the frumentarii. Caesar’s couriers: we carry his letters, and sometimes we read other people’s. Festus was one of mine. The best rider in the camp.', next: 'day3' },
    day4: {
      text: 'Until sunset, do something for Festus. A curved blade, up from under: that’s how a thraex finishes a man on his knees. A gladiator’s stroke. The Ludus Magnus, the gladiator school beside the Amphitheatre, trains Caesar’s thraeces. Ask for Glaucus, their chief trainer. He knows every man who ever held a curved sword in this city. Get me a name.',
      choices: [
        { text: 'Why me?', goto: 'day5' },
        { text: 'I’ll go to the Ludus.', goto: 'gratusDay' },
      ],
    },
    day5: { text: 'Because nobody in Rome knows your face yet. Because you stayed with him when anyone else would have run. And because I’ll pay you.', next: 'gratusDay' },
    gratusDay: { speaker: 'player', text: '(Gratus turns back into the dark of the strongrooms. Next: Glaucus, at the Ludus Magnus beside the Amphitheatre.)', end: true },

    // ---- while you hunt
    toLudus: { text: 'Not here, not now. The Ludus Magnus, past the Amphitheatre: ask for Glaucus. Come back after sunset.', end: true },
    toMus: {
      text: (c) =>
        c.hasItem('quest-sacculum-festi')
          ? 'You have his satchel. Good. Keep it, and the tablet, until the lamps are lit.'
          : 'The Mouse? Then find him before he hears you’re asking. And bring back what he took from Festus. After sunset, here.',
      end: true,
    },
    notYet: { text: 'The lamps aren’t lit. Wait until the Forum empties; I’ll be here. (Press T to wait until after sunset.)', end: true },
    noTablet: { text: 'Where is the tablet? …You didn’t lose it. Tell me you didn’t lose it.', end: true },

    // ---- at dusk: the tablet
    dusk0: {
      text: 'You came back. Most don’t. Give it here.',
      choices: [{ text: '(Give him the tablet.)', goto: 'dusk1', effects: (c) => void c.takeItem('quest-tabella-signata') }],
    },
    dusk1: { speaker: 'player', text: '(He checks the seal against the lamp, breaks it, and reads. His face doesn’t change, which tells you something.)', next: 'dusk2' },
    dusk2: {
      text: 'Addressed to our chief, Pudens, and written in Festus’ own cipher: letters that make no words. He didn’t trust the camp’s codes either. He was right not to.',
      choices: [
        { text: 'I have his satchel. Mus had it, and there’s a coin in it you should see.', if: (c) => c.hasItem('quest-sacculum-festi'), goto: 'dusk2s' },
        { text: 'Can you read it?', goto: 'dusk3' },
      ],
    },
    dusk2s: {
      text: '(He turns the coin over under the lamp.) A drachm of King Osroes. Parthian silver, in a Roman knife-man’s bag. So that’s who paid for Festus. Or who paid the men who paid.',
      effects: (c) => {
        c.takeItem('quest-sacculum-festi');
        c.takeItem('quest-drachma-parthica');
        c.receive(25);
        c.game.standing?.addFame('dist-forum-romanum', 5);
        c.setFlag('gratus-has-drachm', true);
      },
      next: 'dusk3',
    },
    dusk3: {
      text: 'No. Festus had a twin, Gemellus, a copyist. As boys they wrote each other notes in a cipher of their own, and Festus used it for anything he didn’t want the camp to read. Only Gemellus can read this. And Gemellus has been missing since the Ides of April.',
      next: 'dusk4',
    },
    dusk4: {
      text: 'Tonight is the Lemuria. At midnight every family in Rome throws black beans to send its dead away, and Festus’ family will be up for it: the Marii, lamp-makers, in the Velabrum. Go to them. You promised him you’d tell his mother. And find out where his brother has gone. When you have the key, bring it here. I’ll wait all night.',
      next: 'dusk5',
    },
    dusk5: {
      text: 'Take this: my token. It will get you into our camp on the Caelian when the time comes. And this, for Festus’ family. See that they get some of it.',
      effects: (c) => {
        c.giveItem('quest-tessera-peregrina');
        c.receive(25);
      },
      choices: [
        { text: 'I promised him I’d tell his mother.', if: (c) => !!c.flag('promised-festus'), goto: 'dusk6' },
        { text: 'I’ll go to the Marii.', goto: 'delivered' },
      ],
    },
    dusk6: { text: 'Then keep your promise. Tonight of all nights.', next: 'delivered' },
    delivered: { speaker: 'player', text: '(Gratus locks the tablet in a strongbox and turns the key. Next: the Marii’s house in the Velabrum.)', end: true },

    // ---- the Lemuria night
    waitKey: { text: 'Have you found the brother? Find Gemellus, find the key. The dedication is at dawn.', end: true },
    warn0: {
      text: 'You’re back, and you look like a man who’s read something. Well?',
      choices: [{ text: '(Show him Festus’ message, read with Gemellus’ key.)', goto: 'warn1' }],
    },
    warn1: {
      text: '(He reads it twice under the lamp.) “At the dedication, a bow in the high place.” Tomorrow Caesar dedicates his Column and stands at its foot before all Rome. The high place is the Column itself: there’s a viewing platform at the top, a hundred feet up.',
      next: 'warn2',
    },
    warn2: {
      text: (c) =>
        c.flag('gratus-has-drachm')
          ? '“Money from the East, through the Pepper Warehouses.” The same Parthian silver that paid your Mouse. Somebody on the Via Sacra is changing it into Roman knives.'
          : '“Money from the East, through the Pepper Warehouses.” Parthian silver, changed into Roman knives somewhere on the Via Sacra.',
      next: 'warn3',
    },
    warn3: {
      text: 'I’ll have men on every roof around Trajan’s Forum, and two on the Column’s stair. And you: be in the Forum of Trajan at dawn. You’ve earned the right to see this through.',
      next: 'warnEnd',
    },
    warnEnd: { speaker: 'player', text: '(Gratus pinches out the lamp. “Tomorrow, the Column.”)', end: true },

    // ---- around it
    idle: {
      text: (c) => rotate(c, 'gratusIdle', ['Walk on. If you need me you’ll know where.', 'Every seal in Rome tells a story. Most of them lie.', 'Daylight is for honest men and fools.', 'Festus was the best rider in the camp. Remember that, if anyone asks.']),
      end: true,
    },
    after: { text: 'Tomorrow will want everyone’s eyes. Festus was the best rider in the camp. Remember that, if anyone asks.', end: true },
  },
});

// ------------------------------------------------------------------ Mus

const mus = defineDialogue({
  id: 'npc-mus',
  npcs: ['npc-mus'],
  priority: 90,
  start: (c) => (c.memory.beaten || c.flag('mus-fate') ? 'beaten' : 'n0'),
  nodes: {
    n0: {
      text: '(A wiry man with a torn ear sits on an upturned amphora, a curved sica across his knees.) Who sent you? Glaucus? Tell him the Mouse still bites. Thirty-one bouts, and he threw me out for a cloak.',
      choices: [
        { text: 'You knifed a courier at the Capena Gate this morning. I was there.', goto: 'n1' },
        { text: 'Hand over the courier’s satchel, and run while you still can.', check: { skill: 'rhetoric', difficulty: 25, kind: 'intimidate', label: 'Intimidate', pass: 'surrender', fail: 'attack' } },
        { text: 'Somebody paid you for that courier. Who?', check: { skill: 'rhetoric', difficulty: 40, pass: 'tellAll', fail: 'attack' } },
        { text: '(Draw steel.)', goto: 'attack' },
      ],
    },
    n1: { text: 'You? (He laughs and stands.) Then you saw how it’s done. The bag’s in my box, and the box is mine. Come and take it.', next: 'attack' },
    surrender: {
      text: '…All right! All right. (He throws you a key.) For the box in the corner. The bag’s in it. I was never here.',
      effects: (c) => {
        if (!c.hasItem('clavis-cellae-muris')) c.giveItem('clavis-cellae-muris');
        c.memory.beaten = true;
      },
      end: true,
    },
    tellAll: {
      text: 'A man paid me in strange silver, at the Pepper Warehouses on the Via Sacra. He wanted the courier dead and his letters burned. He never gave a name; men like that never do. Now take the key and get out of my cellar.',
      effects: (c) => c.setFlag('clue-piperataria', true),
      next: 'surrender',
    },
    attack: { text: 'Up from under, then.', effects: (c) => c.attack(), end: true },
    beaten: {
      text: '(Dizas sits against the wall with his hands up.) The mice eat what the lions leave. Go on. The key’s yours, and the box with it.',
      effects: (c) => {
        if (!c.hasItem('clavis-cellae-muris')) c.giveItem('clavis-cellae-muris');
      },
      end: true,
    },
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
    report: { text: '(He writes on a tablet without looking at you.) A courier. A soldier’s courier, they say. Not our business: his own people took the body before the second hour. If you know something, citizen, keep it to yourself. That’s advice.', effects: (c) => c.setFlag('mq01-reported', true), next: 'idle' },
    tomorrow: { text: 'The Column. The Forum of Trajan closed from dawn, double watches on every street, and every pickpocket in Italy here for the crowd. Watch your purse.', next: 'idle' },
  },
});

export default [festus, dromo, chrysippus, gratus, mus, verecundus];
