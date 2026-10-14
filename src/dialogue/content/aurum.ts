/**
 * mq-07-aurum, "The Eastern Gold" (docs/STORY.md chapter 7): the Parthian silver, and the leak in
 * the couriers' camp. Quests react to node ids, not to texts:
 *
 *   npc-pudens              gLead (the Eastern Gold's lead: the quest starts), gLion (who "the Lion"
 *                           is likely to be: the Mithras cave), gDone (the report is over)
 *   npc-clerk-piperataria   kMalchus (the clerk points out Malchus)
 *   npc-malchus             mMet (met: the three objectives), mStars (his Chaldaean named),
 *                           mPrices (the Mercatura check passed: his pepper is too cheap)
 *   npc-zenon               zTraced (the copyist names the Chaldaean, and gives a star table)
 *   npc-asclepiodotus       cAlone (he leaves the room: his table can be looked at)
 *   npc-gemellus            gmRead (the star table read: the Chaldaean unmasked)
 *   npc-cassius-ursus       uTells (the Father's account: Mardonius unmasked by the cave)
 *   npc-mardonius           mdDraw (at the feast: he draws a knife)
 *
 * Pudens's, Zenon's, Gemellus's and Mardonius's nodes are merged into their own dialogues
 * (columna.ts, vendors.ts, marii.ts, tabula.ts). The flags the quest keeps: `board:<member>` and
 * `board-how:<member>`, `mq07-pepper-cheap`, `mq07-chaldaean-named`, `mq07-cave-known`,
 * `mq07-cipher-read`, `mq07-saw-nativity`, `mq07-mardonius-fate`.
 */
import { hourOf } from '../../content/director';
import { completed, female, notStarted, stage } from '../../content/talk';
import { defineDialogue, type DialogueChoice, type DialogueContext, type DialogueNode } from '../types';

export const MQ7 = 'mq-07-aurum';
const MQ5 = 'mq-05-tabula';
const DRACHM = 'quest-drachma-parthica';
const TABLE = 'quest-tabula-siderum';
const NATIVITY = 'quest-genitura-caesaris';

const running = (c: DialogueContext) => c.quest(MQ7)?.running === true;
const unmasked = (c: DialogueContext, id: string) => c.flag(`board:${id}`) === true;
const fate = (c: DialogueContext) => c.flag('mq07-mardonius-fate');
const term = (c: DialogueContext) => (!c.game.standing?.sex ? 'my friend' : female(c) ? 'my girl' : 'my boy');
const night = (c: DialogueContext) => {
  const h = hourOf(c.game);
  return h >= 19 || h < 4;
};

// ------------------------------------------------------------------ Pudens (merged into his dialogue in columna.ts)

/** Pudens's entry node for this chapter's report, or null (his hub is the Purse's: sacculus.ts). */
export function pudensAurumStart(c: DialogueContext): string | null {
  return stage(c, MQ7) === 'report' ? 'gR0' : null;
}

/** The Eastern Gold's choices on Pudens's hub (sacculus.ts groups()). */
export const AURUM_CHOICES: DialogueChoice[] = [
  { text: 'The Eastern Gold: the silver and the pepper.', if: (c) => completed(c, MQ5) && notStarted(c, MQ7), goto: 'gLead' },
  { text: 'Malchus’s ledger pays “the Lion”. Who would that be?', if: (c) => running(c) && !c.flag('mq07-cave-known') && !unmasked(c, 'mardonius'), goto: 'gLion' },
];

export const PUDENS_AURUM: Record<string, DialogueNode> = {
  gLead: {
    text: 'The silver, and the pepper. Gratus asked questions at the Pepper Warehouses on the Sacred Way, and he took an arrow a week later. Somebody there didn’t like his questions. Go and smell some pepper.',
    effects: (c) => c.startQuest(MQ7, 'lead'),
    next: 'gLead2',
  },
  gLead2: {
    text: '(He lowers his voice.) And mind what you say in this camp. Someone here talks.',
    end: true,
  },
  gLion: {
    text: '(He frowns.) “Lion”? That’s a grade in the Mithras caves: Raven, Bride, Soldier, Lion… Half my couriers go down to one under the Subura, off the Vicus Patricius. Soldiers’ god. The Father of that cave is an old centurion, Cassius Ursus. Straight as a spear. Ask him who his Lions are.',
    effects: (c) => c.setFlag('mq07-cave-known', true),
    end: true,
  },
  gR0: {
    speaker: 'player',
    text: '(You tell Pudens all of it: the silver under the pepper, the star tables, the cave, and Mardonius.)',
    next: 'gR1',
  },
  gR1: {
    text: '(He listens to the end, and for once he doesn’t reach for a fig.) One of mine. Fifteen years.',
    next: 'gR2',
  },
  gR2: {
    text: 'The Capena gate, at dawn. Festus told me that himself, in a letter only I read. So Mardonius read my letters too.',
    next: 'gR3',
  },
  gR3: {
    text: (c) =>
      fate(c) === 'taken'
        ? 'And he’s in my cells. He’ll talk. They all do, eventually. And I’ll be the one listening.'
        : fate(c) === 'father'
          ? 'And you left him to the Father. The god’s justice. Fine. It’s faster than mine.'
          : 'And he’s dead. Then we’ll never know who else he sold.',
    next: 'gR4',
  },
  gR4: {
    text: '“October. The courier will say which gate.” They still need the road Caesar takes out of the city. That’s what Mardonius was for. Someone else will try to find it now.',
    next: 'gDone',
  },
  gDone: {
    text: (c) => `Two groups broken, ${term(c)}. Here’s your pay. One more, and we stop October.`,
    end: true,
  },
};

// ------------------------------------------------------------------ Zenon (merged into his dialogue in vendors.ts)

export const ZENON_AURUM = {
  choices: [
    {
      text: 'Who do you copy star tables for?',
      if: (c: DialogueContext) => running(c) && !c.flag('mq07-chaldaean-named-zenon') && !unmasked(c, 'asclepiodotus'),
      goto: 'zAsk',
    },
  ] as DialogueChoice[],
  nodes: {
    zAsk: {
      text: '(He stops polishing his sphere.) I copy for many. Astrologers are lazy, and I have a fine hand. Why?',
      choices: [
        { text: 'A man who copies for traitors goes to the islands with them. Tell me, and you stay here.', check: { skill: 'rhetoric', difficulty: 25, kind: 'intimidate', label: 'Intimidate', pass: 'zTraced', fail: 'zNo' } },
        { text: 'You’re a careful man. Careful men keep a copy. Show me, and I keep your name out of it.', check: { skill: 'rhetoric', difficulty: 25, label: 'Persuade', pass: 'zTraced', fail: 'zNo' } },
        { text: 'Never mind.', goto: 'hub' },
      ],
    },
    zTraced: {
      text: '(He looks round, and drops his voice.) A Chaldaean from Seleucia. Asclepiodotus. He pays in Syrian silver and reads for great houses, in fine rooms on the Clivus Victoriae. And one of the nativities I copied for him was… Caesar’s. (He presses a leaf into your hand.) The strangest of his tables. The numbers don’t fit any sky I know.',
      effects: (c) => {
        c.setFlag('mq07-chaldaean-named', true);
        c.setFlag('mq07-chaldaean-named-zenon', true);
        if (!c.hasItem(TABLE)) c.giveItem(TABLE);
      },
      end: true,
    },
    zNo: { text: 'I copy horoscopes, not names. Saturn in the eighth, citizen. Go carefully.', end: true },
  } as Record<string, DialogueNode>,
};

// ------------------------------------------------------------------ Gemellus (merged into his dialogue in marii.ts)

/** Gemellus's entry node when the player brings him a star table to read, or null. */
export function gemellusAurumStart(c: DialogueContext): string | null {
  return running(c) && !c.flag('mq07-cipher-read') && (c.hasItem(TABLE) || c.hasItem(NATIVITY)) ? 'gm0' : null;
}

export const GEMELLUS_AURUM: Record<string, DialogueNode> = {
  gm0: {
    text: '(Gemellus looks up from his copying.) You again. Is it over?',
    choices: [{ text: 'Not yet. Can you read this? It’s meant to be the stars.', goto: 'gm1' }],
  },
  gm1: {
    text: '(He turns the table to the lamp, and smiles for the first time since you’ve met him.) Planets for letters. Saturn is A, Jupiter B, and the houses count on. A schoolboys’ trick, very old. Festus and I had a better one.',
    next: 'gmRead',
  },
  gmRead: {
    text: '(He writes it out on his own wax.) It says: “October. The courier will say which gate.”',
    effects: (c) => c.setFlag('mq07-cipher-read', true),
    end: true,
  },
};

// ------------------------------------------------------------------ Mardonius (merged into his dialogue in tabula.ts)

/** Mardonius's entry node at the feast, or null. */
export function mardoniusAurumStart(c: DialogueContext): string | null {
  if (stage(c, MQ7) !== 'feast' || fate(c)) return null;
  return c.memory.md7 ? 'mdAgain' : 'md0';
}

export const MARDONIUS_AURUM: Record<string, DialogueNode> = {
  md0: {
    text: '(Mardonius doesn’t get up. He smiles the friendly smile from the camp gate.) I wondered when you’d come down. Sit. The god doesn’t mind one more.',
    effects: (c) => {
      c.memory.md7 = true;
    },
    next: 'md1',
  },
  md1: {
    text: 'Fifteen years carrying other men’s letters. Antioch, Alexandria, Rome. Who thanked me? The man who pays for the war has never ridden in one. The men in the East pay better, and they pay on time.',
    next: 'md2',
  },
  md2: {
    text: '(He shrugs.) Festus? I sold a road. I didn’t hold the knife.',
    choices: [
      { text: 'You’re coming to Pudens.', goto: 'mdDraw' },
      { text: 'The Father knows what you are. So does every man on these benches.', goto: 'mdDraw' },
    ],
  },
  mdAgain: {
    text: '(His hand is under his cloak.) Well?',
    choices: [{ text: 'Get up, Mardonius.', goto: 'mdDraw' }],
  },
  mdDraw: {
    text: '(The Father stands up at the end of the cave. The soldiers on the benches stand with him. Mardonius looks along the faces, and draws a knife.) Then the god can watch.',
    end: true,
  },
};

// ------------------------------------------------------------------ the clerk of the Horrea Piperataria

const clerk = defineDialogue({
  id: 'npc-clerk-piperataria',
  npcs: ['npc-clerk-piperataria'],
  priority: 90,
  start: (c) => (running(c) && !c.memory.pointed ? 'k0' : 'kIdle'),
  nodes: {
    k0: {
      text: '(A clerk with a reed pen and a cough, in air thick with pepper, cinnamon and nard.) Buying or asking?',
      choices: [
        { text: 'A man with Syrian rings. Who is he?', goto: 'kMalchus' },
        { text: 'Neither. Vale.', end: true },
      ],
    },
    kMalchus: {
      text: 'Rings on every finger? That’s Malchus, the Palmyrene. Pepper by the shipload, silk by the bolt. He’s the only one here who never haggles. His bay is that one, by the door.',
      effects: (c) => {
        c.memory.pointed = true;
      },
      end: true,
    },
    kIdle: { text: '(He coughs into his sleeve.) Pepper from India, cinnamon from the end of the world. Mind the dust.', end: true },
  },
});

// ------------------------------------------------------------------ Malchus son of Iarhai, of Palmyra

const malchus = defineDialogue({
  id: 'npc-malchus',
  npcs: ['npc-malchus'],
  priority: 90,
  start: (c) => {
    if (unmasked(c, 'mercator-piperis')) return 'mUnmasked';
    if (running(c)) return c.memory.met ? 'mHub' : 'm0';
    return 'mIdle';
  },
  nodes: {
    m0: {
      text: '(A big man in a long Syrian tunic, rings on every finger, smelling of pepper. He smiles too widely.) A stranger! A friend of a friend? Everyone in Rome is a friend of a friend. Malchus son of Iarhai, of Palmyra. A cup of spiced wine?',
      effects: (c) => {
        c.memory.met = true;
      },
      next: 'mMet',
    },
    mMet: {
      text: 'I could use a strong pair of legs, if you’re looking for work. A parcel to carry, now and then. (He watches you over the cup.) What is it you want, friend?',
      choices: [
        { text: 'Who reads your stars?', goto: 'mStars', once: true },
        { text: 'Let me see your prices.', goto: 'mPriceList', once: true },
        { text: 'Change me this coin.', if: (c) => c.hasItem(DRACHM), goto: 'mDrachm', once: true },
        { text: 'Nothing today.', end: true },
      ],
    },
    mHub: {
      text: 'Back again, friend? The pepper is still the best in Rome.',
      choices: [
        { text: 'Who reads your stars?', if: (c) => !c.flag('mq07-chaldaean-named'), goto: 'mStars' },
        { text: 'Let me see your prices.', if: (c) => !c.flag('mq07-pepper-cheap'), goto: 'mPriceList' },
        { text: 'Change me this coin.', if: (c) => c.hasItem(DRACHM) && !c.memory.drachm, goto: 'mDrachm' },
        { text: 'Vale.', end: true },
      ],
    },
    mStars: {
      text: '(He laughs, pleased to be asked.) My stars? A man from Seleucia reads them. Asclepiodotus. He’s the only one in Rome who can: Romans can’t read a Chaldaean table. Fine rooms on the Clivus Victoriae. Tell him Malchus sent you; he’ll charge you double.',
      effects: (c) => c.setFlag('mq07-chaldaean-named', true),
      next: 'mHub',
    },
    mPriceList: {
      text: '(He reels it off with pride: pepper, cinnamon, nard, silk by the bolt. The prices are low. Very low.)',
      choices: [
        { text: '(Work it out.)', check: { skill: 'mercatura', difficulty: 25, label: 'Mercatura', pass: 'mPrices', fail: 'mPricesNo' } },
        { text: 'Good prices.', goto: 'mHub' },
      ],
    },
    mPrices: {
      speaker: 'player',
      text: '(He sells pepper for less than it costs at Alexandria, before the sea and the customs. A man who sells at a loss makes his money somewhere else. Somewhere in those sacks.)',
      effects: (c) => c.setFlag('mq07-pepper-cheap', true),
      next: 'mHub',
    },
    mPricesNo: { speaker: 'player', text: '(Cheap pepper. Lucky Rome.)', next: 'mHub' },
    mDrachm: {
      text: '(He sees the king’s face on the coin, and the smile stays, but his eyes don’t.) Parthian. Pretty. Hermogenes at the Basilica will change it for you. I deal in pepper, friend.',
      effects: (c) => {
        c.memory.drachm = true;
      },
      next: 'mHub',
    },
    mUnmasked: { text: '(He doesn’t smile now.) We have nothing more to say, you and I.', end: true },
    mIdle: { text: 'Pepper from India, silk from the Seres. The best in Rome, friend.', end: true },
  },
});

// ------------------------------------------------------------------ Asclepiodotus, the Chaldaean

const asclepiodotus = defineDialogue({
  id: 'npc-asclepiodotus',
  npcs: ['npc-asclepiodotus'],
  priority: 90,
  start: (c) => {
    if (unmasked(c, 'asclepiodotus') || !running(c)) return 'cIdle';
    if (c.memory.alone) return 'cBack';
    return c.memory.met ? 'cAsk' : 'c0';
  },
  nodes: {
    c0: {
      text: '(An old man in a long dark robe, with a white beard combed to a point, sits among tables of circles and lines.) Asclepiodotus of Seleucia. I read for great houses. Have you a patron’s letter?',
      effects: (c) => {
        c.memory.met = true;
      },
      next: 'cAsk',
    },
    cAsk: {
      text: 'A reading costs fifty denarii. The heavens are expensive to watch.',
      choices: [
        { text: 'Fifty denarii. Read my stars.', enabled: (c) => c.denarii() >= 50, effects: (c) => { c.pay(50); }, goto: 'cReading' },
        { text: 'Malchus sent me. He said you’d charge me double, and that you’re worth it.', if: (c) => !!c.flag('mq07-chaldaean-named'), check: { skill: 'rhetoric', difficulty: 40, label: 'Persuade', pass: 'cReading', fail: 'cNo' } },
        { text: 'Not today.', end: true },
      ],
    },
    cReading: {
      text: '(He asks your hour and your day, and works for a long while, murmuring in Greek. Then a slave knocks.) Forgive me. A great house sends for me at any hour. Stay. Don’t touch the tables.',
      next: 'cAlone',
    },
    cAlone: {
      speaker: 'player',
      text: '(He goes out. You are alone with his table.)',
      effects: (c) => {
        c.memory.alone = true;
      },
      end: true,
    },
    cBack: {
      text: '(He comes back and sits as if nothing happened.) Your stars incline to a long life, if you stay out of other people’s. That will be all.',
      end: true,
    },
    cNo: { text: 'Malchus says many things. Fifty denarii, or a patron’s letter.', end: true },
    cIdle: { text: '(He doesn’t look up from his tables.) The heavens are closed today.', end: true },
  },
});

// ------------------------------------------------------------------ Cassius Ursus, the Father of the cave

const ursus = defineDialogue({
  id: 'npc-cassius-ursus',
  npcs: ['npc-cassius-ursus'],
  priority: 90,
  start: (c) => {
    if (stage(c, MQ7) === 'feast' && !fate(c)) return 'uFeast';
    if (fate(c)) return 'uAfter';
    if (running(c) && !unmasked(c, 'mardonius')) return c.memory.met ? 'uAsk' : 'u0';
    return 'uIdle';
  },
  nodes: {
    u0: {
      text: '(An old man with a soldier’s back is trimming the lamps under the painted bull.) This is the god’s house, stranger. You’re not one of his.',
      effects: (c) => {
        c.memory.met = true;
      },
      next: 'uAsk',
    },
    uAsk: {
      text: 'What do you want here?',
      choices: [
        { text: 'One of your Lions is selling Rome to the Parthians. I think you know which.', check: { skill: 'rhetoric', difficulty: 40, label: 'Persuade', pass: 'uTells', fail: 'uNo' } },
        { text: 'Pudens of the Castra Peregrina sent me. He says you’re straight as a spear.', if: (c) => completed(c, MQ5), check: { skill: 'rhetoric', difficulty: 25, label: 'Persuade', pass: 'uTells', fail: 'uNo' } },
        { text: 'Nothing. I’ll go.', end: true },
      ],
    },
    uTells: {
      text: '(He puts the lamp down.) Mardonius. A Lion of this cave. He brought guests to the god’s table: a Syrian with rings and a Chaldaean. Strangers. Uninitiated. I let it pass, for his sake. And now I hear men in the Forum calling Mithras a Persian god, a god for traitors.',
      next: 'uTells2',
    },
    uTells2: {
      text: 'The next feast is tomorrow night, at dark. They’ll be here, all three. Come down then, and I’ll let you in. The god can see it done.',
      effects: (c) => c.setFlag('mq07-feast-promised', true),
      end: true,
    },
    uNo: { text: 'The god keeps his men’s secrets. So do I. Go.', end: true },
    uFeast: {
      text: (c) => (night(c) ? '(He nods toward the far end of the benches.) There. All three. Go on; we’re with you.' : 'The feast is at dark. Come back then.'),
      end: true,
    },
    uAfter: {
      text: (c) => (fate(c) === 'father' ? 'He’s gone from the god’s house. Don’t ask me where.' : 'The cave is clean again. The god thanks you, in his way.'),
      end: true,
    },
    uIdle: { text: 'The god’s house is open to his own. Go in peace, stranger.', end: true },
  },
});

export default [clerk, malchus, asclepiodotus, ursus];
