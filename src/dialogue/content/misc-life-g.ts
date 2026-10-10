/**
 * Dialogue of the QUESTS II crew's side quests (docs/design/world-life.md §4.8 Q4-Q6). Quests react to
 * node ids (the first line is the dialogue id, then the nodes):
 *
 *   dlg-tess-eutychus   eAccept                                   (misc-tesserae-falsae)
 *   dlg-tess-curator    cAccept, cGive                            the curator of the dole (a keeper)
 *   dlg-tess-lucrio     lPersuaded, lStakeWin, lFollow
 *   dlg-tess-crispina   sSell                                     the fence (the QUESTS I crew's keeper, if she exists)
 *   dlg-merc-clerk      mAccept, mTold, mGive, mReport            (misc-mercuralia)
 *   dlg-merc-lucius     lShort, lSqueezed, lWarned                Lucius Septimius (a keeper)
 *   dlg-daos            dAccept, dFree                            (misc-servus-aesculapii)
 *   dlg-daos-witnesses  aProof, pProof, cProof
 *   dlg-daos-steward    sPersuaded, sBribed, sFight
 *
 * The keepers' own conversations (src/life/keepers.ts, priority 10) stay underneath: a quest dialogue
 * here, at a higher priority, answers only while its quest has something to say and returns '' the
 * rest of the time, so the shop and the small talk are never lost.
 */
import { between } from '../../content/hours';
import { LIFE } from '../../life/registry';
import { completed, hourNow, notStarted, outcome, questVar, rotate, stage } from '../../content/talk';
import { defineDialogue, type DialogueChoice, type DialogueContext } from '../types';

const TESS = 'misc-tesserae-falsae';
const MERC = 'misc-mercuralia';
const SERVUS = 'misc-servus-aesculapii';
const OPENING = 'mq-01-madida-capena';

const CURATOR = 'keeper-minucia-curator';
const LUCRIO = 'npc-lucrio-plumbarius';
const EUTYCHUS = 'npc-eutychus-libertus';
const CRISPINA = 'keeper-subura-receptatrix';
const CLERK = 'npc-clericus-aedilium';
const LUCIUS = 'keeper-boarium-olearius';
const DAOS = 'npc-daos';
const STEWARD = 'npc-stichus-actor';
const MEN = ['npc-daos-man-a', 'npc-daos-man-b'];

const MOULDS = 'forma-tesserarum';
const MEASURE = 'mensura-aedilicia';

const opened = (c: DialogueContext) => completed(c, OPENING);
/** Throws lost at Lucrio's table today (the count starts again with each game day). */
const lostToday = (c: DialogueContext): number => (c.memory._lostDay === c.game.time.dayIndex ? Number(c.memory._lost) || 0 : 0);
const proofs = (c: DialogueContext): string[] => {
  const v = questVar(c, SERVUS, 'proofs');
  return typeof v === 'string' && v ? v.split(',') : [];
};

// ------------------------------------------------------------------ Forged Tokens: Eutychus

const eutychus = defineDialogue({
  id: 'dlg-tess-eutychus',
  npcs: [EUTYCHUS],
  priority: 80,
  start: (c) => {
    const s = stage(c, TESS);
    if (s === 'start') return 'e0';
    if (s) return 'eWait';
    const o = outcome(c, TESS);
    if (o === 'done-curator') return 'eThanks';
    if (o === 'done-sold') return 'eSold';
    return opened(c) ? 'e0' : 'eIdle';
  },
  nodes: {
    e0: {
      text: '(A freedman in a worn cloak, turning a grey lead token over and over in his fingers.) Six denarii! Six! Do you know what six denarii is, citizen? It is a month of oil and a month of bread, and the curator held it to the light like something the cat brought in.',
      choices: [
        { text: 'Show me the token.', goto: 'eToken' },
        { text: 'Who sold it to you?', goto: 'eWho' },
        { text: 'I’ll find out who is making these.', goto: 'eAccept' },
        { text: 'Vale.', end: true },
      ],
    },
    eToken: {
      text: 'Soft. See, you can mark it with a nail. The curator’s stamp is there, but it has run, like a bad seal. A real one is hard and sharp. Mine is… well. Mine is a lead button.',
      next: 'e0',
    },
    eWho: {
      text: 'A man at the dice in the Subura, by the popina on the Argiletum, after dark. A thumb as grey as a lead pipe. They call him Lucrio. He said he had a cousin on the list who could not collect, a good price for a quick sale. I am a fool.',
      next: 'e0',
    },
    eAccept: {
      speaker: 'npc',
      text: 'You? (He stops turning the token.) The curator will not listen to me. A freedman with a bad token is a freedman with a bad conscience, in his eyes. But he might talk to someone who asks quietly. He sits at the dole in the mornings. Take this: it is the only proof I have.',
      effects: (c) => {
        if (!c.memory._given && !c.hasItem('tessera-falsa')) c.giveItem('tessera-falsa');
        c.memory._given = true;
      },
      end: true,
    },
    eWait: {
      text: (c) =>
        stage(c, TESS) === 'curator'
          ? 'Have you spoken to the curator? He sits at the dole in the morning. Talk low.'
          : 'Lucrio, at the dice, in the Subura. After dark. May the gods keep your purse closed.',
      end: true,
    },
    eThanks: {
      text: 'The curator sent for me, gave me four denarii and a new token, and had the false ones broken on the step. Four of the six. I will take it. May Mercury remember your face.',
      end: true,
    },
    eSold: {
      text: (c) => rotate(c, 'eSold', ['They say the lead tokens are still about. Does it surprise you? It surprises me. I thought you were going to the curator.', 'Another lead token at the dole today. A woman, this time. The curator held it to the light.']),
      end: true,
    },
    eIdle: {
      text: (c) => rotate(c, 'eIdle', ['Five modii a month and a lead button in my pocket. Do not ask.', 'I have a token the curator says is false. I paid six denarii for it. Go away, citizen, I am composing a speech.']),
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Forged Tokens: the curator of the dole

const curator = defineDialogue({
  id: 'dlg-tess-curator',
  npcs: [CURATOR],
  priority: 60,
  start: (c) => {
    const s = stage(c, TESS);
    if (s === 'curator') return 'c0';
    if (s === 'choose') return 'cChoose';
    if (s === 'start') return 'cEutychus';
    if (s === 'lucrio' || s === 'follow' || s === 'yard') return 'cWait';
    const o = outcome(c, TESS);
    if (o === 'done-curator') return 'cAfter';
    if (o === 'done-sold') return 'cAfterSold';
    return '';
  },
  nodes: {
    cEutychus: {
      text: '(The curator does not look up from the list.) If it is about the freedman and his token, speak to him first. I cannot be seen to listen. He is on the step.',
      end: true,
    },
    c0: {
      text: '(He lays his stylus down and speaks without moving his lips.) Eutychus. A lead token with my mark half gone. It is the third this month. Somebody has a mould, and it is not mine. If I take this to the aediles they will ask how three bad tokens crossed my table. Find the mould for me, quietly. Twenty denarii, and nobody on this porch ever hears your name.',
      choices: [
        { text: 'I’ll find the mould.', goto: 'cAccept' },
        { text: 'Why not send the aediles after him?', goto: 'cWhy' },
        { text: 'Not my business.', end: true },
      ],
    },
    cWhy: { text: 'Because the aediles also ask where my own accounts are kept. A man in my office has to be above question. Find me the mould, and I can be above it.', next: 'c0' },
    cAccept: {
      text: 'Lucrio, they say. A lead-worker who dices in the Subura after dark. Do not frighten him; a frightened man melts his moulds. Bring them to me and I will break them where he can hear it.',
      end: true,
    },
    cWait: { text: 'The mould, citizen. Lucrio, in the Subura, at night. Do not come here with anything else.', end: true },
    cChoose: {
      text: '(He looks at your hands.) Well?',
      choices: [
        { text: 'Here are the moulds. Twenty denarii.', if: (c) => c.hasItem(MOULDS), goto: 'cGive' },
        { text: 'Not yet.', end: true },
      ],
    },
    cGive: {
      text: '(He turns the grey halves over, sets one on the step and breaks it with his heel, then the other. He counts out twenty denarii into your palm.) The dole will be clean for a month. Lucrio will not be at the dice tonight, nor any night. You were never here.',
      end: true,
    },
    cAfter: { text: (c) => rotate(c, 'cAfter', ['The tokens are hard and sharp again. Good.', 'You were never here. Quite right.']), end: true },
    cAfterSold: { text: 'There is a lead token in my hand this morning, with my mark half gone. Do you know anything about that? No. Of course not.', end: true },
  },
});

// ------------------------------------------------------------------ Forged Tokens: Lucrio and the fence

const lucrio = defineDialogue({
  id: 'dlg-tess-lucrio',
  npcs: [LUCRIO],
  priority: 80,
  start: (c) => {
    const s = stage(c, TESS);
    if (s === 'lucrio') return 'l0';
    if (s === 'follow' || s === 'yard' || s === 'choose') return 'lWatch';
    if (outcome(c, TESS) === 'done-sold') return 'lAfter';
    return 'lIdle';
  },
  nodes: {
    l0: {
      text: '(A man with a thumb grey to the knuckle, shaking knucklebones in a cup.) Dogs and senios! You in, or just looking? Looking costs the same as playing, friend, it just takes longer.',
      choices: [
        {
          text: 'Eutychus bought a token from you. The curator is looking for the mould. Give it to me and nobody breaks your thumbs.',
          check: { skill: 'rhetoric', difficulty: 40, label: 'Persuade', pass: 'lPersuaded', fail: 'lRefuse' },
        },
        {
          text: 'Deal me in. (Stake 2 denarii for a throw: if I win, you talk.)',
          if: (c) => lostToday(c) < 2,
          enabled: (c) => c.denarii() >= 2,
          goto: 'lThrow',
          effects: (c) => {
            c.pay(2);
            // Four tali, an even throw: the table is as honest as the cup (Augustus' rules, Suet. Aug. 71).
            c.memory._win = c.game.dialogue.rng.next() < 0.5;
            if (!c.memory._win) {
              c.memory._lost = lostToday(c) + 1;
              c.memory._lostDay = c.game.time.dayIndex;
            }
          },
        },
        { text: '(Say nothing. Sit, throw a few, and watch where he goes when he gets up.)', goto: 'lFollow' },
        { text: 'Vale.', end: true },
      ],
    },
    lThrow: {
      text: (c) =>
        c.memory._win
          ? '(Four bones in the lamp: a one, a three, a four, a six. Venus! Lucrio stares at the cup, then at you, and for a moment nobody at the table breathes.)'
          : '(Dogs. Two of them. Lucrio rakes the pot with a grin.) The gods love a loser, friend. Another?',
      choices: [
        { text: 'You owe me a word.', if: (c) => !!c.memory._win, goto: 'lStakeWin' },
        { text: 'Another time.', if: (c) => !c.memory._win, end: true },
        { text: 'Another throw.', if: (c) => !c.memory._win && lostToday(c) < 2 && c.denarii() >= 2, goto: 'l0' },
      ],
    },
    lStakeWin: {
      text: '(He swears by every god in the lead trade and then, because a man who has lost to Venus talks, he talks.) Behind the lead-workers’ row, a yard with a heap of pigs by the wall. The moulds are in a sack under the heap. Take them and be damned. I only made forty.',
      end: true,
    },
    lPersuaded: {
      text: '(He looks at the bones, at you, at the lamp, and drops his voice.) The yard behind the lead-workers’ row. A heap of pigs by the wall, and the sack is under it. You did not hear it from me, and you did not see my thumb.',
      end: true,
    },
    lRefuse: { text: 'I make pipes, friend. Pipes. You want a pipe? Come in the morning.', end: true },
    lFollow: {
      speaker: 'player',
      text: '(You sit with your back to the wall, lose a few as, and say nothing. When the lamp burns low he gathers the bones, pockets the pot and goes, and you get up and go after him.)',
      end: true,
    },
    lWatch: { text: 'What? I make pipes. Go away.', end: true },
    lAfter: { text: 'Somebody was in my yard. Somebody took my moulds. If I find him I will melt his feet.', end: true },
    lIdle: {
      text: (c) => rotate(c, 'lIdle', ['Dogs and senios, and a Venus for the man who pays!', 'Four tali, four faces, one Venus. Augustus wrote the rules himself.', 'The watch? There is no watch. There is only the dark.']),
      end: true,
    },
  },
});

/** The fence's line in Forged Tokens (exported for tests; registered only when she exists, below). */
export const crispina = defineDialogue({
  id: 'dlg-tess-crispina',
  npcs: [CRISPINA],
  priority: 60,
  start: (c) => (stage(c, TESS) === 'choose' && c.hasItem(MOULDS) ? 'sOffer' : ''),
  nodes: {
    sOffer: {
      text: '(Crispina takes the grey halves and turns them in the doorway’s lamp.) Moulds for the dole. The curator’s own mark, half cut. I can use those. Thirty denarii, and I never saw them, and you never saw me.',
      choices: [
        { text: 'Thirty. Done.', goto: 'sSell' },
        { text: 'I’ll think about it.', end: true },
      ],
    },
    sSell: { text: '(The coins are counted into your hand without a word. The moulds go into a sack, and the sack goes into the dark.)', end: true },
  },
});

// ------------------------------------------------------------------ Mercury's Water: the aediles' clerk

const clerk = defineDialogue({
  id: 'dlg-merc-clerk',
  npcs: [CLERK],
  priority: 80,
  start: (c) => {
    const s = stage(c, MERC);
    if (s === 'start') return 'mWait';
    if (s === 'spring') return 'mSpring';
    if (s === 'clerk') return 'mClerk';
    if (s === 'test') return 'mTest';
    if (s === 'choose') return 'mChoose';
    if (outcome(c, MERC)) return 'mAfter';
    return notStarted(c, MERC) && opened(c) ? 'm0' : 'mIdle';
  },
  nodes: {
    m0: {
      text: '(A neat man at a trestle beside the aediles’ album, a stylus behind his ear.) Naevius, clerk to the plebeian aediles. Weights, measures, short loaves and bad fish: this is where you complain. On the Ides of May, the Mercuralia, every merchant in Rome goes to Mercury’s spring and washes his lies away. Nobody washes his measures. That is my department.',
      choices: [
        { text: 'I’d like to see a measure proved. On the Ides.', goto: 'mAccept' },
        { text: 'What do the aediles do about the Mercuralia?', goto: 'mAlbum' },
        { text: 'Vale.', end: true },
      ],
    },
    mAlbum: { text: 'Read the album. “Merchants, on the Ides of May, to the temple of Mercury.” The aediles order it; the god gets the credit. We get the quiet.', next: 'm0' },
    mAccept: {
      text: 'Come to me on the Ides, after the spring, and I will lend you the aediles’ sextarius, the true one, bronze, stamped. Ask no merchant to fill it if you do not want to lose a customer. Return it by dusk. The aediles like to know which of their merchants fear the god. It saves a great deal of walking.',
      end: true,
    },
    mWait: { text: 'The Ides. Mercury’s spring at dawn, and my table from the third hour.', end: true },
    mSpring: {
      text: '(He glances at the sky.) The spring? Half the Forum Boarium is there before the sun, laurel in one hand and a lie in the other.',
      choices: [
        { text: 'Was Lucius Septimius at the spring?', goto: 'mTold' },
        { text: 'Vale.', end: true },
      ],
    },
    mTold: {
      text: 'The oil-dealer? Since the first light, I hear, praying louder than the rest. “Wash away the short measure.” I would pay to know which short measure he means. (He pauses.) I would, as it happens. Pay, I mean. Do you want the aediles’ vessel?',
      next: 'mClerk',
    },
    mClerk: {
      text: 'The aediles’ sextarius. Bronze, stamped, exact. It holds what it holds.',
      choices: [
        { text: 'Lend me the aediles’ sextarius.', goto: 'mGive' },
        { text: 'Later.', end: true },
      ],
    },
    mGive: { text: '(He unwraps a small bronze vessel with the aediles’ mark on its rim.) Fill it from a customer’s jar in front of other customers. Bring it back by dusk and tell me what it held.', end: true },
    mTest: { text: 'Fill it at his stall, in front of his customers. A merchant cannot refuse the aediles’ measure, not in front of people.', end: true },
    mChoose: {
      text: '(He sets his stylus down.) Well? What did it hold?',
      choices: [
        { text: 'A sixth short. Septimius’s measure is false. I’ll report him.', if: (c) => !!c.flag('merc-short'), goto: 'mReport' },
        { text: 'I’ll deal with it another way.', end: true },
      ],
    },
    mReport: {
      text: 'A sixth! On oil! (He writes it on a tablet in a small, angry hand.) The aediles will seal his measures this afternoon and shut his stall for eight days. The fine is his; a tenth of it is the informer’s, by an old custom. (He counts ten denarii into your hand.)',
      end: true,
    },
    mAfter: {
      text: (c) =>
        outcome(c, MERC) === 'done-report'
          ? 'Septimius’s stall is sealed. The aediles are pleased; the Boarium is quiet. Quiet is the aediles’ favourite thing.'
          : outcome(c, MERC) === 'missed'
            ? 'The Ides come round again. The god is patient. The aediles are not, but they are slow.'
            : 'You returned the measure. It was true. That, in my trade, is the best news there is.',
      end: true,
    },
    mIdle: { text: (c) => rotate(c, 'mIdle', ['Weights and measures by order of the aediles. Short measure is a fine; the fine is half to the informer.', 'The album is public. The archive is not.']), end: true },
  },
});

const merchants = defineDialogue({
  id: 'dlg-merc-merchants',
  npcs: ['npc-mercurialis-a', 'npc-mercurialis-b', 'npc-mercurialis-c'],
  priority: 80,
  start: () => 'w0',
  nodes: {
    w0: {
      text: (c) => rotate(c, 'w0', ['Laurel and a jar. Cheaper than a lawyer.', 'A drop on the head and a drop on the goods, and the god goes blind for a year.', 'Wash it away, Mercury. All of it. Except the profit.']),
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Mercury's Water: Lucius Septimius

const lucius = defineDialogue({
  id: 'dlg-merc-lucius',
  npcs: [LUCIUS],
  priority: 60,
  start: (c) => {
    const until = Number(c.flag('merc-sealed-until')) || 0;
    if (until > c.game.time.totalHours) return 'lSealed';
    const s = stage(c, MERC);
    if (s === 'test') return 'l0';
    if (s === 'choose') return 'lChoose';
    return '';
  },
  nodes: {
    lSealed: {
      text: '(A clay seal of the aediles is stamped across the lid of his measure. Septimius sits behind it, very still, like a man at his own funeral.) Closed. By order of the aediles. Eight days. Do not look at me. Everyone looks at me.',
      end: true,
    },
    l0: {
      text: '(A round man with oil to the elbows wipes his hands on his apron.) A customer! What will it be, citizen? Oil from the best press in Latium, honest weight, honest price.',
      choices: [
        { text: 'By the aediles’ leave, fill this sextarius from your measure.', if: (c) => c.hasItem(MEASURE), goto: 'lFill' },
        { text: 'Show me your wares.', end: true, effects: (c) => c.openService('barter') },
        { text: 'Vale.', end: true },
      ],
    },
    lFill: {
      text: '(He goes the colour of old wax. But the stall is full of watching customers, and an aedile’s vessel is an aedile’s vessel. He fills it from his own measure, slowly, and his hand does not shake until the end.)',
      next: 'lShort',
    },
    lShort: {
      speaker: 'player',
      text: '(The oil stops a finger and a half below the rim. The aediles’ vessel does not lie. Septimius’s measure is a sixth short, and the whole stall has seen it.)',
      next: 'lChoose',
    },
    lChoose: {
      text: '(Sweating.) It is the jar, citizen. The jar is chipped. A chipped jar, nothing more, a mistake any honest man could make, I am a pious man, I was at the spring this morning… What do you want?',
      choices: [
        { text: 'Fifteen denarii and I forget what I saw.', goto: 'lSqueezed' },
        {
          text: 'Mercury heard you at the spring, Lucius. He is not a blind god.',
          check: { skill: 'rhetoric', difficulty: 40, label: 'Persuade', pass: 'lWarned', fail: 'lWarnFail' },
        },
        { text: 'I am taking this to the aediles’ clerk.', goto: 'lClerk' },
        { text: 'Show me your wares.', end: true, effects: (c) => c.openService('barter') },
        { text: 'Vale.', end: true },
      ],
    },
    lSqueezed: {
      text: '(He counts out fifteen denarii with shaking fingers, one at a time, and does not look at you.) You are no better than I am. Worse. I only cheat the customers.',
      end: true,
    },
    lWarned: {
      text: '(He looks up at the empty sky, and then at you, and the colour leaves his face.) I will fill every jar true from this day. I will sell to you at what it cost me, not a quadrans more, if you swear by Mercury not to tell. (He wets his lips.) A sixth. A sixth, and I thought nobody counts.',
      end: true,
    },
    lWarnFail: { text: 'Mercury and I have an understanding. A tithe of the first jar, every year.', next: 'lChoose' },
    lClerk: { text: 'No. Citizen, please. A sixth is… A sixth is a fine I can survive. A seal is not. (But you have already turned.)', end: true },
  },
});

// ------------------------------------------------------------------ Free by the God's Hand: Daos

const daos = defineDialogue({
  id: 'dlg-daos',
  npcs: [DAOS],
  priority: 80,
  start: (c) => {
    const s = stage(c, SERVUS);
    if (s === 'start') return 'd0';
    if (s === 'proofs' || s === 'bridge') return 'dWait';
    if (s === 'fight') return 'dFight';
    if (s === 'report') return 'dFree';
    if (outcome(c, SERVUS) === 'done') return 'dAfter';
    if (outcome(c, SERVUS) === 'fail') return 'dGone';
    return completed(c, 'mq-03-lemuria') ? 'd0' : 'dIdle';
  },
  nodes: {
    d0: {
      text: '(An old man on a bench by the sleeping porch, thin as a rake, a black stone on a cord at his neck.) You are looking at me. Everyone looks at me. I am the cook who died. Forty years I cooked for the house of Aebutius Capito, and when the fever took me the master had me carried to the god’s island on a hurdle, with a purse for the god’s fee. He did not come back. Nor did I die.',
      choices: [
        { text: 'And now?', goto: 'dNow' },
        { text: 'The deified Claudius ruled that a slave left to die at the god’s house is free if he lives.', goto: 'dEdict' },
        { text: 'I’ll help you.', goto: 'dAccept' },
        { text: 'Vale.', end: true },
      ],
    },
    dNow: {
      text: 'Now the steward, Stichus, says I am a runaway. He will come to the bridge at the third hour with two big men, to take me home. Home! (He laughs; it turns into a cough.) I was left at the door of a god. I do not think I am anybody’s home.',
      next: 'd0',
    },
    dEdict: {
      text: 'So the attendant told me. Claudius, who is a god now, or says he is. A man who can read says it is the law, and a man who can swing a fist says it is not. I would like someone to say it to the steward who can do both.',
      next: 'd0',
    },
    dAccept: {
      text: 'The Lord keep you. Philo, the temple attendant, remembers me being brought. Cleon sleeps in the porch and saw the master’s men leave. Bato, the carter who brought me, drives from the bridge. Two will do, they say; three would be better.',
      end: true,
    },
    dWait: {
      text: (c) => {
        const n = proofs(c).length;
        return n >= 3 ? 'Three of them! The Lord has a good memory. The steward comes at the third hour.' : n === 2 ? 'Two have spoken. Three would frighten the steward more. But the third hour is the third hour.' : n === 1 ? 'One. Good. Philo, Cleon, Bato: any two.' : 'Philo at the temple door, Cleon in the porch, Bato at the bridge. Any two will do.';
      },
      end: true,
    },
    dFight: { text: 'Go! Please! Fists only, citizen, I cannot bury another friend.', end: true },
    dFree: {
      text: '(You tell him. He sits quite still, as if the news were a hot plate and he had been told to carry it. Then he takes the black stone from his neck and presses it into your hand.) The Lord keeps what he is given. And now I will cook for myself. I do not know yet what I like.',
      end: true,
    },
    dAfter: { text: (c) => rotate(c, 'dAfter', ['I cooked an egg this morning. For myself. I did not know I liked eggs.', 'The god’s house gave me my life, and you gave me my name.']), end: true },
    dGone: { text: 'They took him, the steward’s men. The god’s house cannot keep a man from the road.', end: true },
    dIdle: { text: (c) => rotate(c, 'dIdle', ['The god sent me out on my feet. It is something.', 'I am well. I keep telling them I am well.']), end: true },
  },
});

// ------------------------------------------------------------------ Free by the God's Hand: the witnesses

const WITNESS_OF: Record<string, { key: string; offer: string; done: string; idle: string }> = {
  'npc-philo-aedituus': { key: 'attendant', offer: 'aOffer', done: 'aDone', idle: 'aIdle' },
  'npc-cleon-aegrotus': { key: 'patient', offer: 'pOffer', done: 'pDone', idle: 'pIdle' },
  'npc-bato-carter': { key: 'carter', offer: 'cOffer', done: 'cDone', idle: 'cIdle' },
};

const witnesses = defineDialogue({
  id: 'dlg-daos-witnesses',
  npcs: Object.keys(WITNESS_OF),
  priority: 80,
  start: (c) => {
    const w = WITNESS_OF[c.npcId];
    const s = stage(c, SERVUS);
    if (!w) return '';
    if (s === 'proofs' || s === 'bridge') return proofs(c).includes(w.key) ? w.done : w.offer;
    return w.idle;
  },
  nodes: {
    // The temple attendant
    aOffer: {
      text: '(Philo, in a white tunic with the god’s serpent embroidered at the hem, rubs his chin.) The Syrian? Brought in on a hurdle on the day before the Nones of Februarius, by a carter and two men from a house on the Campus. A purse for the god’s fee and not a word after. The men were gone before the mule turned round. The priest has the tablet where I wrote it.',
      choices: [
        { text: 'Will you say so on the bridge, to the steward’s face?', goto: 'aProof' },
        { text: 'Vale.', end: true },
      ],
    },
    aProof: { text: 'On the bridge? I will stand beside you, if the steward’s men let me. The god’s attendants are not asked to speak often, but nobody has ever asked us to lie.', end: true },
    aDone: { text: 'I will be there. The third hour. Mind your elbows with those two.', end: true },
    aIdle: { text: (c) => rotate(c, 'aIdle', ['The god’s house is open to the sick, free and slave. He asks no difference.', 'A cock for the god, if you are cured. Or a hen. He is not particular.', 'There is an old Syrian cook on the bench. He should be dead. Ask him; he enjoys telling it.']), end: true },
    // A fellow patient
    pOffer: {
      text: '(Cleon looks over his shoulder.) I was here when they brought him. Two big men and a steward in a green cloak, in the morning, no breakfast. They set him down in the porch, took his sandals, and the steward said “he will be dead by the Nones, no use wasting a good bed.” They laughed. I remember that. Then the steward went away and I remember wanting to hit him.',
      choices: [
        { text: 'Say that on the bridge and a man goes free.', check: { skill: 'rhetoric', difficulty: 25, label: 'Persuade', pass: 'pProof', fail: 'pRefuse' } },
        { text: '(Give him a denarius for the road.)', bribe: { amount: 1, goto: 'pProof' } },
        { text: 'Vale.', end: true },
      ],
    },
    pProof: { text: 'The god’s house gave me back my leg. I suppose I can give it back a word. Third hour, you said? I will be there. Do not let them look at me too long.', end: true },
    pRefuse: { text: 'I am here for my leg, not for the master’s steward. Ask the attendant.', end: true },
    pDone: { text: 'Third hour, the bridge. My leg will carry me that far.', end: true },
    pIdle: { text: (c) => rotate(c, 'pIdle', ['Nine nights in this porch and the god has dreamed nothing for me.', 'They bring them in on hurdles and carry them out on their own feet. Mostly.']), end: true },
    // The carter
    cOffer: {
      text: '(Bato does not look up from the wheel.) I carried him. Two asses, paid by the steward himself, and a word: “leave him at the door, and don’t wait.” I left him at the door. I did not wait. I am a carter; I do not take sides.',
      choices: [
        { text: 'You carried a man to die. Now you can carry the truth to the bridge.', check: { skill: 'rhetoric', difficulty: 25, label: 'Persuade', pass: 'cProof', fail: 'cRefuse' } },
        { text: '(Give him two denarii for the lost fare.)', bribe: { amount: 2, goto: 'cProof' } },
        { text: 'Vale.', end: true },
      ],
    },
    cProof: { text: 'All right. All right! I carried him and I was paid to leave him. If a magistrate asks, I say so. Third hour, the bridge. The steward can glare at the mule.', end: true },
    cRefuse: { text: 'The steward pays by the month. You pay by the word. I know which one comes back.', end: true },
    cDone: { text: 'Third hour, the bridge. I will tie the mule where he can see it.', end: true },
    cIdle: { text: (c) => rotate(c, 'cIdle', ['Anywhere on the Campus for an as, anywhere on the island for two. The bridge is narrow.', 'Not before the third hour. The steward’s men have the bridge.']), end: true },
  },
});

// ------------------------------------------------------------------ Free by the God's Hand: the steward

const steward = defineDialogue({
  id: 'dlg-daos-steward',
  npcs: [STEWARD, ...MEN],
  priority: 80,
  start: (c) => {
    const s = stage(c, SERVUS);
    if (MEN.includes(c.npcId)) return s === 'bridge' ? 'mMan' : s === 'fight' ? 'mFighting' : '';
    if (s === 'bridge') return between(hourNow(c), 'h3', 'h5') ? 's0' : 'sLate';
    if (s === 'fight') return 'mFighting';
    return '';
  },
  nodes: {
    mMan: { text: 'Talk to Stichus, citizen. We are only here to carry.', end: true },
    mFighting: { text: 'Come on, then, hero!', end: true },
    sLate: { text: '(Stichus checks the shadow of the parapet.) The third hour has not come, or it has gone. I am a punctual man. Come when I am here.', end: true },
    s0: {
      text: '(A neat man in a green cloak, a wax tablet at his belt, two large men behind him.) Citizen. You have been asking questions on the island about my master’s cook. Daos belongs to Marcus Aebutius Capito and has done since the Kalends of his purchase. He ran from his work and hides among the god’s lamp-trimmers. I am here to collect him. You are in my way.',
      choices: [
        {
          text: 'The deified Claudius’s edict: a slave left sick at the god’s house is free if he recovers. I have the attendant’s word. Take it to a magistrate if you doubt me.',
          if: (c) => proofs(c).length === 2,
          check: { skill: 'rhetoric', difficulty: 25, label: 'Persuade', pass: 'sPersuaded', fail: 'sPersuadeFail' },
        },
        {
          text: 'The deified Claudius’s edict: a slave left sick at the god’s house is free if he recovers. I have three witnesses, and they are standing on the bridge.',
          if: (c) => proofs(c).length >= 3,
          check: { skill: 'rhetoric', difficulty: 10, label: 'Persuade', pass: 'sPersuaded', fail: 'sPersuadeFail' },
        },
        {
          text: 'The deified Claudius’s edict: a slave left sick at the god’s house is free if he recovers.',
          if: (c) => proofs(c).length < 2,
          check: { skill: 'rhetoric', difficulty: 55, label: 'Persuade', pass: 'sPersuaded', fail: 'sPersuadeFail' },
        },
        { text: 'Ten denarii for your trouble, Stichus. Say you could not find him.', bribe: { amount: 10, goto: 'sBribed' } },
        { text: 'Your men are big. Let us see how big.', goto: 'sFight' },
        { text: 'Another time.', end: true },
      ],
    },
    sPersuaded: {
      text: '(He looks at the witnesses, at the crowd that has quietly gathered on the bridge, and at the sky. He is a steward, not a fool.) The master will hear of this. And he will hear that a magistrate would have heard it first. Go. Tell the cook he can keep his stone.',
      end: true,
    },
    sPersuadeFail: { text: 'A slave’s edict from a dead emperor? You will have to do better than that, citizen. Or be quicker than my men.', next: 's0' },
    sBribed: {
      text: '(The coins vanish into his belt as if they never existed.) Daos? I have not found him. A man could search the island a year. Good day, citizen. I was never here.',
      end: true,
    },
    sFight: { text: 'Boys! Teach the citizen about the master’s property!', end: true },
  },
});

// Crispina is the QUESTS I crew's keeper: the quest works without her (the curator is the other ending),
// so her line is part of the content only when she is in the life data.
const hasCrispina = LIFE.keepers.some((k) => k.id === CRISPINA);

export default [eutychus, curator, lucrio, ...(hasCrispina ? [crispina] : []), clerk, merchants, lucius, daos, witnesses, steward];
