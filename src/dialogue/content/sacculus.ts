/**
 * mq-06-sacculus, "The Purse" (docs/STORY.md chapter 6): the money behind the plot. Quests react to
 * node ids, not to texts:
 *
 *   npc-pudens              sLead (the Purse's lead: the quest starts), sDrachm (the drachm handed
 *                           back), sDone (the report is over: the quest completes)
 *   npc-horrearius           hNames (Avitus named, and his two visitors), hOpen (a bay opened by day)
 *   npc-ianitor-horreorum   nOpen (a bay opened at night, for a bribe)
 *   npc-euhodus             eConfessEnd (he gives up the buyer: unmasked by the arrow)
 *   npc-puer-euhodi               fLedger (the boy brings out the ledger page: Euhodus unmasked)
 *   npc-hermogenes          hgOthers (his ready price for Parthian silver: unmasked by the drachm)
 *   npc-lycus               lTablets (the clerk's tablets: Hermogenes unmasked)
 *   npc-avitus              aTake (he pays, and runs: no fight), aFight (he calls his knife-men),
 *                           aArrested / aRun / aKill (the player's choice once the knife-men are down)
 *
 * Pudens's, Euhodus's and Hermogenes's nodes are merged into their own dialogues
 * (dialogue/content/columna.ts, vendors.ts) through PUDENS_SACCULUS, EUHODUS_SACCULUS and
 * HERMOGENES_SACCULUS. The flags the quest keeps: `board:<member>` and `board-how:<member>` (the
 * board), `mq06-bay-open`, `mq06-knives-found`, `mq06-knives-dead`, `mq06-avitus-fate`.
 */
import { hourOf } from '../../content/director';
import { completed, female, notStarted, stage } from '../../content/talk';
import { defineDialogue, type DialogueChoice, type DialogueContext, type DialogueNode } from '../types';
import { AURUM_CHOICES, MQ7 } from './aurum';

export const MQ6 = 'mq-06-sacculus';
const MQ5 = 'mq-05-tabula';
const DRACHM = 'quest-drachma-parthica';
const ARROW = 'quest-sagitta-dacica';

const running = (c: DialogueContext) => c.quest(MQ6)?.running === true;
const unmasked = (c: DialogueContext, id: string) => c.flag(`board:${id}`) === true;
const fate = (c: DialogueContext) => c.flag('mq06-avitus-fate');
/** Pudens's word for the player, as in Chapter 5. */
const term = (c: DialogueContext) => (!c.game.standing?.sex ? 'my friend' : female(c) ? 'my girl' : 'my boy');
const sirOrMadam = (c: DialogueContext) => (female(c) ? 'madam' : 'sir');
const notAsked = (key: string) => (c: DialogueContext) => !c.memory[`q6:${key}`];
const asking = (key: string) => (c: DialogueContext) => {
  c.memory[`q6:${key}`] = true;
};
/** Daytime at the warehouse: the keeper's hours (the porter has the night). */
const daytime = (c: DialogueContext) => {
  const h = hourOf(c.game);
  return h >= 6 && h < 19;
};

// ------------------------------------------------------------------ Pudens (merged into his dialogue in columna.ts)

/** Pudens's entry node once Act II has begun (after mq-05), or null. */
export function pudensSacculusStart(c: DialogueContext): string | null {
  if (!completed(c, MQ5)) return null;
  const s = stage(c, MQ6);
  if (s === 'report') return 'sR0';
  if (s) return !c.hasItem(DRACHM) && !c.memory.drachmBack ? 'sDrachmBack' : 'sBusy';
  if (c.quest(MQ7)?.running) return 'sBusy';
  return completed(c, MQ6) ? 'sAfter' : 'sHub';
}

/** The board's four groups: the Purse and the Eastern Gold lead somewhere (Chapters 8–9 come later). */
const groups = (): DialogueChoice[] => [
  { text: 'The Purse: the money men.', if: (c) => notStarted(c, MQ6), goto: 'sLead' },
  ...AURUM_CHOICES,
  { text: 'The Dacian Blades.', if: notAsked('falx'), effects: asking('falx'), goto: 'sFalx' },
  { text: 'The Toga.', if: notAsked('toga'), effects: asking('toga'), goto: 'sToga' },
  { text: 'Later.', end: true },
];

export const PUDENS_SACCULUS: Record<string, DialogueNode> = {
  sHub: {
    text: (c) => `Back already, ${term(c)}. The board’s on the table. Where do you want to start?`,
    choices: groups(),
  },
  sLead: {
    text: 'The money men. Three half-names on a scraped tablet. Start with the grain: “…NARIVS AVIT…” buys wheat for the army, and a man who sells wheat for a war wants the war. Ask at the Horrea Agrippiana, on the Vicus Tuscus. Every big buyer rents a bay there.',
    effects: (c) => c.startQuest(MQ6, 'lead'),
    next: 'sDrachm',
  },
  sDrachm: {
    // (A node's effects run before its text is rendered: the effect notes whether it handed the coin over.)
    text: (c) =>
      c.memory.drachmHanded
        ? 'And take this. Gratus kept it as evidence. A banker will tell you more about a coin than I can.'
        : 'And keep that Parthian coin of yours handy. A banker will tell you more about a coin than I can.',
    effects: (c) => {
      c.memory.drachmBack = true;
      c.memory.drachmHanded = !c.hasItem(DRACHM);
      if (!c.hasItem(DRACHM)) c.giveItem(DRACHM);
    },
    end: true,
  },
  sDrachmBack: {
    text: 'You’ve started on the Purse without me, I hear. Here: Gratus kept this as evidence. A banker will tell you more about a coin than I can.',
    effects: (c) => {
      c.memory.drachmBack = true;
      if (!c.hasItem(DRACHM)) c.giveItem(DRACHM);
    },
    end: true,
  },
  sFalx: {
    text: 'Mucapor and his Dacians. The Dacian school keeps its gate shut to strangers this month. Start with the money; the knives will keep.',
    next: 'sHub',
  },
  sToga: {
    text: 'Nothing on him yet. Bring me the others, and he’ll show himself.',
    next: 'sHub',
  },
  sBusy: {
    text: (c) =>
      stage(c, MQ6) && stage(c, MQ6) !== 'done'
        ? `The Purse first, ${term(c)}. Three men: the grain, the arms, the bank. Bring me proof on all three.`
        : `How goes it, ${term(c)}? Bring me proof, and I’ll pin it up.`,
    choices: groups(),
  },
  sR0: {
    speaker: 'player',
    text: '(You tell Pudens all of it: the bank, the knives, the wheat. He listens, and eats a fig.)',
    next: 'sR1',
  },
  sR1: {
    text: 'Euhodus and Hermogenes we leave where they are. They know Avitus, and nobody above him. Arrest them, and the men at the top know we’re close. A watched man is worth more than a jailed one.',
    next: 'sR2',
  },
  sR2: {
    text: (c) =>
      fate(c) === 'arrested'
        ? 'And Avitus is in my cells. Good. He’s the one who knows the men above. He’ll talk; fat men do.'
        : fate(c) === 'killed'
          ? 'And Avitus is dead. A dead man can’t name his friends. Let’s hope his papers can.'
          : 'And Avitus is on a boat to Ostia. Then he’s warning them now. Next time, bring me the man, not his money.',
    next: 'sR3',
  },
  sR3: {
    text: (c) =>
      c.hasItem('quest-chartae-aviti')
        ? '(He reads the papers twice, and stops at one line.) Chrysogonus. A chancery man. Why does a wheat dealer pay a scribe for his handwriting? I don’t like that at all. (He pins it under the Toga himself.)'
        : 'You didn’t bring his papers? Pity. A grain man’s accounts tell you who he’s afraid of.',
    next: 'sDone',
  },
  sDone: {
    text: 'One group broken. Here, your pay. Two more, and we stop October.',
    end: true,
  },
  sAfter: {
    text: (c) => `The Purse is broken, ${term(c)}. The others will take longer.`,
    choices: groups(),
  },
};

// ------------------------------------------------------------------ Euhodus (merged into his dialogue in vendors.ts)

export const EUHODUS_SACCULUS = {
  choices: [
    {
      text: 'Show him the Dacian arrow.',
      if: (c: DialogueContext) => running(c) && c.hasItem(ARROW) && !unmasked(c, 'euhodus') && !c.memory.q6arrow,
      effects: (c: DialogueContext) => {
        c.memory.q6arrow = true;
      },
      goto: 'eArrow',
    },
  ] as DialogueChoice[],
  nodes: {
    eArrow: {
      text: '(He turns the arrow in his fingers, and goes pale.) The red bands, that’s Dacian paint. But this… grey goose, cut short. That’s my fletching. I sold three hundred of those.',
      choices: [
        { text: 'Who to? Tell me, and I’ll tell nobody it was you.', check: { skill: 'rhetoric', difficulty: 40, label: 'Persuade', pass: 'eConfess', fail: 'eDeny' } },
        { text: 'Never mind.', end: true },
      ],
    },
    eConfess: {
      text: '(He looks at the door, then back.) Pinarius took them. Bows, arrows, two hundred sicae, sent in grain sacks. Paid in good coin, but it was changed at Hermogenes’ table: his stamp was on the bags.',
      next: 'eConfessEnd',
    },
    eConfessEnd: { text: 'I sell knives. I don’t ask whose throat. Now buy something, or go.', end: true },
    eDeny: { text: 'Plenty of men buy arrows. I don’t keep a list of their enemies. Good day to you.', end: true },
  } as Record<string, DialogueNode>,
};

// ------------------------------------------------------------------ Hermogenes (merged into his dialogue in vendors.ts)

export const HERMOGENES_SACCULUS = {
  choices: [
    {
      text: 'Change a Parthian drachm for me.',
      if: (c: DialogueContext) => running(c) && c.hasItem(DRACHM) && !unmasked(c, 'hermogenes'),
      goto: 'hgDrachm',
    },
  ] as DialogueChoice[],
  nodes: {
    hgDrachm: {
      text: '(He weighs it on his finger and doesn’t look up.) Parthian. One denarius and a quarter, by weight, as for the others.',
      choices: [
        { text: 'What others?', goto: 'hgOthers' },
        { text: 'I’ll keep it.', end: true },
      ],
    },
    hgOthers: {
      text: '(His hand stops on the coin. He gives it back to you.) I change what I’m given. My table is closed for accounts. Good day.',
      end: true,
    },
  } as Record<string, DialogueNode>,
};

// ------------------------------------------------------------------ Primigenius, keeper of the Horrea Agrippiana

const successus = defineDialogue({
  id: 'npc-horrearius',
  npcs: ['npc-horrearius'],
  priority: 90,
  start: (c) => {
    // The keeper can start the Purse himself: before Pudens has sent the player, any time after the board is open.
    if (!c.memory.named && (running(c) || (notStarted(c, MQ6) && completed(c, MQ5)))) return 'h0';
    if (running(c) && !c.flag('mq06-bay-open') && (unmasked(c, 'euhodus') || unmasked(c, 'hermogenes')) && daytime(c)) return 'hProof';
    return 'hIdle';
  },
  nodes: {
    h0: {
      text: '(An old freedman sits at the gate with a stack of tally tablets.) Primigenius, keeper of this warehouse. Cloth on the left, cloth on the right, and only one man’s grain at the back. What do you want?',
      choices: [
        { text: 'Who is Pinarius?', goto: 'hName' },
        { text: 'Nothing. Vale.', end: true },
      ],
    },
    hName: {
      text: 'Pinarius? Sextus Pinarius Avitus. He has the contract to feed the army for the Syrian war. He bought up all the old wheat he could find this spring, and the price doubled.',
      next: 'hBays',
    },
    hBays: {
      text: 'He rents three bays at the back and keeps them sealed. His own porters do the carrying, not mine. I don’t like a sealed bay.',
      choices: [{ text: 'Who comes to see him?', goto: 'hNames' }],
    },
    hNames: {
      text: 'Two men, regular as the Nones. Euhodus, who sells arms on the Sacred Way: his sign’s by the Meta Sudans. And a banker, Hermogenes, from the shops at the Basilica Aemilia.',
      effects: (c) => {
        c.memory.named = true;
        // Arrived here before asking Pudens: this starts the Purse.
        if (notStarted(c, MQ6)) c.startQuest(MQ6, 'names');
      },
      end: true,
    },
    hProof: {
      text: 'You again. Found something?',
      choices: [
        { text: 'Show him what you found on Avitus’s friends.', goto: 'hOpen' },
        { text: 'Not yet.', end: true },
      ],
    },
    hOpen: {
      text: '(He reads it, and his face hardens.) That’s enough for me. For the army’s sake. (He takes a knife to the seal on the nearest bay.) Go and look. I didn’t see you.',
      end: true,
    },
    hIdle: {
      text: (c) => (fate(c) ? 'The back bays are empty now. The army will want its wheat from someone else.' : 'Cloth on the left, cloth on the right. Mind the porters.'),
      end: true,
    },
  },
});

// ------------------------------------------------------------------ the night porter

const ianitor = defineDialogue({
  id: 'npc-ianitor-horreorum',
  npcs: ['npc-ianitor-horreorum'],
  priority: 90,
  start: (c) => (running(c) && !c.flag('mq06-bay-open') && !daytime(c) ? 'n0' : 'nIdle'),
  nodes: {
    n0: {
      text: '(A big man with a lantern and a club.) Warehouse is shut. Nobody goes to the back, and especially not to Pinarius’s bays.',
      choices: [
        { text: 'Here’s for your trouble. Look the other way.', bribe: { amount: 15, goto: 'nOpen' } },
        { text: 'Just passing.', end: true },
      ],
    },
    nOpen: { text: '(He pockets the coins and turns to the wall.) I saw nothing. Cut quick, and put the cord back.', end: true },
    nIdle: { text: 'Nothing to see at the back. Move along.', end: true },
  },
});

// ------------------------------------------------------------------ Felix, Euhodus's shop boy

const felix = defineDialogue({
  id: 'npc-puer-euhodi',
  npcs: ['npc-puer-euhodi'],
  priority: 90,
  start: (c) => (running(c) && !unmasked(c, 'euhodus') && !c.memory.gave ? 'f0' : 'fIdle'),
  nodes: {
    f0: {
      text: '(A boy of about thirteen is sweeping between the racks.) Master’s at the forge in the back. You want him?',
      choices: [
        { text: 'Your master keeps an order-book. Bring me the page for Pinarius.', goto: 'fAsk' },
        { text: 'No. Vale.', end: true },
      ],
    },
    fAsk: {
      text: 'And get beaten? He counts the pages.',
      choices: [
        { text: 'A few coins for your trouble.', bribe: { amount: 10, goto: 'fLedger' } },
        { text: 'He beats you anyway. This could stop him.', check: { skill: 'rhetoric', difficulty: 25, label: 'Persuade', pass: 'fLedger', fail: 'fNo' } },
        { text: 'Forget it.', end: true },
      ],
    },
    fLedger: {
      text: '(He slips into the back and comes out with a page torn from a wax-book, quick as a mouse.) Here. You didn’t get it from me.',
      effects: (c) => {
        c.memory.gave = true;
        c.giveItem('quest-rationes-euhodi');
      },
      end: true,
    },
    fNo: { text: 'He doesn’t beat me that much. Go on, before he hears you.', end: true },
    fIdle: { text: '(He goes on sweeping.) Master’s in the back.', end: true },
  },
});

// ------------------------------------------------------------------ Lycus, Hermogenes's clerk

const lycus = defineDialogue({
  id: 'npc-lycus',
  npcs: ['npc-lycus'],
  priority: 90,
  start: (c) => (running(c) && !unmasked(c, 'hermogenes') ? 'l0' : 'lIdle'),
  nodes: {
    l0: {
      text: (c) => `(A young man with a stylus behind his ear looks up from his counting.) My master is busy, ${sirOrMadam(c)}. Can I help?`,
      choices: [
        { text: 'What does Pinarius change at this table?', goto: 'lAsk' },
        { text: 'No. Vale.', end: true },
      ],
    },
    lAsk: {
      text: '(He swallows.) I only count. Silver comes in by weight, coin goes out by count. I don’t ask whose.',
      choices: [
        { text: 'You know it’s wrong, or you wouldn’t be shaking. Show me.', check: { skill: 'rhetoric', difficulty: 25, label: 'Persuade', pass: 'lTablets', fail: 'lNo' } },
        { text: 'Here. Buy yourself a better master.', bribe: { amount: 10, goto: 'lTablets' } },
        { text: 'Never mind.', end: true },
      ],
    },
    lTablets: {
      text: '(He slides two wax tablets across, and keeps his voice down.) Eastern silver, by weight, for Pinarius. Every Nones since March. My master says don’t write the names. I write them small.',
      effects: (c) => c.giveItem('quest-tabulae-lyci'),
      end: true,
    },
    lNo: { text: 'Please. I have a mother in the Subura. Go away.', end: true },
    lIdle: { text: '(He keeps counting.) Busy, busy.', end: true },
  },
});

// ------------------------------------------------------------------ Avitus

const avitus = defineDialogue({
  id: 'npc-avitus',
  npcs: ['npc-avitus'],
  priority: 90,
  start: (c) => {
    if (fate(c)) return 'aGone';
    if (c.flag('mq06-knives-dead') === true) return 'aDecide';
    if (c.memory.fought) return 'aWait';
    return c.memory.talked ? 'aOffer' : 'a0';
  },
  nodes: {
    a0: {
      text: '(A big man in a fine tunic, rings on every finger, sits among his tablets. He doesn’t get up.) So you’re the one cutting my seals. Sit. I’d rather talk than shout.',
      effects: (c) => {
        c.memory.talked = true;
      },
      next: 'a1',
    },
    a1: {
      text: 'A war is the best customer Rome has. I bought the wheat for it, every modius I could find, with Hermogenes’ money. If the war goes the way Caesar wants, I’m rich. If it’s slow, I’m ruined.',
      next: 'a2',
    },
    a2: {
      text: 'Then men came who promised me better: a new emperor who pays my price, and a debt that disappears. I didn’t ask who. I asked how much.',
      next: 'a3',
    },
    a3: { text: 'I don’t hold a knife. I hold a warehouse.', next: 'aOffer' },
    aOffer: {
      text: 'Three hundred denarii. You walk away, and I’m on the river tonight. Nobody needs to bleed.',
      choices: [
        { text: 'Take the money.', goto: 'aTake' },
        { text: 'No.', goto: 'aFight' },
        { text: 'You’re under arrest.', goto: 'aFight' },
      ],
    },
    aTake: {
      text: '(He counts it out without hurry.) A sensible friend. Rome is full of fools; it’s nice to meet the other kind.',
      effects: (c) => c.receive(300),
      end: true,
    },
    aFight: {
      text: '(He sighs, and raises his voice.) Then I’m sorry. Show our friend out.',
      effects: (c) => {
        c.memory.fought = true;
      },
      end: true,
    },
    aWait: { text: '(He watches, white-faced, and says nothing.)', end: true },
    aDecide: {
      text: '(Avitus is pale, his hands flat on the table.) Well. What now?',
      choices: [
        { text: 'You’re coming to the Castra Peregrina.', goto: 'aArrested' },
        { text: 'Get out of Rome. Tonight.', goto: 'aRun' },
        { text: 'You’ve bought your last war. (Kill him.)', goto: 'aKill' },
      ],
    },
    aArrested: { text: '(He gets up slowly.) Pudens. Of course it’s Pudens. Lead the way; I won’t run. I’m too fat to run.', end: true },
    aRun: { text: '(He doesn’t wait to be told twice. He takes one bag and leaves the rest.) You’ll regret the kindness. They won’t.', end: true },
    aKill: {
      text: '(He stands, and reaches for nothing at all.)',
      effects: (c) => c.attack(),
      end: true,
    },
    aGone: { text: '(The counting-room is quiet.)', end: true },
  },
});

export default [successus, ianitor, felix, lycus, avitus];
