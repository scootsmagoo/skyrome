/**
 * mq-05-tabula, "The Board" (docs/STORY.md chapter 5): the Castra Peregrina on 13 May AD 113.
 * Quests react to node ids, not to texts:
 *
 *   npc-custos-peregrinus   gateEnd (the gate opens; Mardonius takes over)
 *   npc-mardonius           mEnd (he points the way to Pudens; flag mq05-told-mardonius if told)
 *   npc-aquarius-caelius    w0 (the warning, also said by the quest when he is staged)
 *   npc-sicarius-caelius    s0 (he never talks)
 *   npc-bitus-vinctus       v1 (where Mucapor trains)
 *   npc-pudens              offer (the offer is made), bitusCell (the archer is in the cell),
 *                           acceptEnd (the player accepts: the board)
 *   npc-gratus              g5 (the visit in the infirmary)
 *
 * Pudens's and Gratus's nodes are merged into their own dialogues (dialogue/content/columna.ts,
 * main-quest.ts) through PUDENS_TABULA and GRATUS_TABULA; the other three dialogues are here.
 * The camp sees visitors from first light on 13 May until dark: the quest keeps the flag
 * `mq05-camp-open` in step, and the gate and Pudens read it.
 */
import { completed, female, stage } from '../../content/talk';
import { defineDialogue, type DialogueChoice, type DialogueContext, type DialogueNode } from '../types';

export const MQ5 = 'mq-05-tabula';
export const CAMP_OPEN_FLAG = 'mq05-camp-open';

const open = (c: DialogueContext) => c.flag(CAMP_OPEN_FLAG) === true;
/** "Tomorrow" is over once the quest has stepped the calendar onto 13 May (quest var `calDone`). */
const tomorrowCome = (c: DialogueContext) => c.game.quests?.state(MQ5)?.vars.calDone === true;
/** Pudens's word for the player: "my boy", "my girl", or "my friend" when the sex is unknown. */
const term = (c: DialogueContext) => (!c.game.standing?.sex ? 'my friend' : female(c) ? 'my girl' : 'my boy');
const notAsked = (key: string) => (c: DialogueContext) => !c.memory[`q:${key}`];
const asking = (key: string) => (c: DialogueContext) => {
  c.memory[`q:${key}`] = true;
};

// ------------------------------------------------------------------ the gate

const custos = defineDialogue({
  id: 'npc-custos-peregrinus',
  npcs: ['npc-custos-peregrinus'],
  priority: 90,
  start: (c) => {
    const s = stage(c, MQ5);
    if (s === 'summons' || s === 'followed' || s === 'search' || s === 'gate') return open(c) ? 'g0' : tomorrowCome(c) ? 'gNight' : 'gTomorrow';
    if (s || completed(c, MQ5)) return 'gIn';
    return 'gIdle';
  },
  nodes: {
    g0: {
      text: 'Halt. This is the Castra Peregrina. Token or business?',
      choices: [
        { text: 'Show him Gratus’s token.', if: (c) => c.hasItem('quest-tessera-peregrina'), goto: 'gToken' },
        { text: 'Show him Pudens’s ring.', if: (c) => c.hasItem('anulus-peregrinorum'), goto: 'gRing' },
        {
          text: 'Pudens sent for me. Ask him.',
          if: (c) => !c.hasItem('quest-tessera-peregrina') && !c.hasItem('anulus-peregrinorum'),
          check: { skill: 'rhetoric', difficulty: 40, label: 'Persuade', pass: 'gTalked', fail: 'gNo' },
        },
        { text: 'Never mind.', end: true },
      ],
    },
    gToken: { text: 'Gratus’s mark. The chief said someone would come with this.', next: 'gateEnd' },
    gRing: { text: 'The chief’s own ring. Well, well. In you go.', next: 'gateEnd' },
    gTalked: { text: 'He did say someone might come. If you’re lying, it’s your neck, not mine.', next: 'gateEnd' },
    gNo: { text: 'Everyone says Pudens sent for them. Come back with a token.', end: true },
    gateEnd: { text: 'Mardonius! Take this one to the chief.', end: true },
    gTomorrow: { text: 'The chief’s still in the Forum, cleaning up after the Column. Come back tomorrow, at first light.', end: true },
    gNight: { text: 'The chief sees nobody after dark. Come at first light.', end: true },
    gIn: { text: 'In you go. The chief’s office is across the court, on the right.', end: true },
    gIdle: { text: 'Move along, unless you’ve business with the couriers.', end: true },
  },
});

// ------------------------------------------------------------------ Mardonius

const mardonius = defineDialogue({
  id: 'npc-mardonius',
  npcs: ['npc-mardonius'],
  priority: 90,
  start: (c) => (stage(c, MQ5) && !c.memory.walked ? 'm0' : 'mIdle'),
  nodes: {
    m0: {
      text: 'Mardonius, courier. I’ll take you across. So you’re the one who went up the Column! The whole camp is talking. What did the archer say, up there?',
      effects: (c) => {
        c.memory.walked = true;
      },
      choices: [
        { text: 'He said Caesar was for later.', effects: (c) => c.setFlag('mq05-told-mardonius', true), goto: 'mTold' },
        { text: 'Ask Pudens.', goto: 'mNot' },
      ],
    },
    mTold: { text: 'Did he now. Well. The chief’s office is across the court, the door on the right. Mind the step.', next: 'mEnd' },
    mNot: { text: 'Ha! You’ll do. The chief’s office is across the court, the door on the right.', next: 'mEnd' },
    mEnd: { speaker: 'player', text: '(Mardonius strolls back toward the gate.)', end: true },
    mIdle: { text: 'Ask me anything. I hear it all, sooner or later.', end: true },
  },
});

// ------------------------------------------------------------------ the water-carrier

const WARNING = 'Friend, the man in the dark cloak has been walking where you walk since the Colosseum. Mind yourself under the arch.';

const aquarius = defineDialogue({
  id: 'npc-aquarius-caelius',
  npcs: ['npc-aquarius-caelius'],
  priority: 90,
  start: (c) => (stage(c, MQ5) === 'followed' ? 'w0' : 'wIdle'),
  nodes: {
    w0: { text: WARNING, end: true },
    wIdle: { text: 'Water! Fresh from the arches! Two asses a jar.', end: true },
  },
});

/** The warning, said aloud by the quest when it stages the water-carrier. */
export const WATER_CARRIER_WARNING = WARNING;

// ------------------------------------------------------------------ the man in the dark cloak (he never talks)

const sicarius = defineDialogue({
  id: 'npc-sicarius-caelius',
  npcs: ['npc-sicarius-caelius'],
  priority: 90,
  start: () => 's0',
  nodes: {
    s0: { speaker: 'player', text: '(He says nothing. His eyes are on your hands.)', end: true },
  },
});

// ------------------------------------------------------------------ Bitus in the cell

const bitusVinctus = defineDialogue({
  id: 'npc-bitus-vinctus',
  npcs: ['npc-bitus-vinctus'],
  priority: 90,
  start: () => 'v0',
  nodes: {
    v0: {
      text: 'Roman. Come to look at the bird in its cage? They feed me better than the forum did.',
      choices: [
        { text: 'Where do I find Mucapor?', goto: 'v1' },
        { text: 'Nothing. Rest.', end: true },
      ],
    },
    v1: {
      text: 'At the Dacian school, by your Colosseum. He laughs with his whole face, and fights with a sickle as long as your arm. Go with friends.',
      effects: (c) => c.setFlag('mq05-bitus-mucapor', true),
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Pudens (merged into his dialogue in columna.ts)

/** The hub's questions, offered until asked. */
const hub = (): DialogueChoice[] => [
  { text: 'What was the arrow about?', if: notAsked('arrow'), effects: asking('arrow'), goto: 'tArrow' },
  { text: 'Who are “they”?', if: notAsked('who'), effects: asking('who'), goto: 'tWho' },
  { text: 'What happened to the archer?', if: (c) => c.flag('bitus-fate') === 'spared' && notAsked('bitus')(c), effects: asking('bitus'), goto: 'bitusCell' },
  { text: 'What do you want from me?', goto: 'offer' },
];

/** The offer's questions, then the answer. */
const offerChoices = (): DialogueChoice[] => [
  { text: 'You’re asking me to be a spy.', if: notAsked('spy'), effects: asking('spy'), goto: 'tSpy' },
  { text: 'Why not tell Caesar?', if: notAsked('caesar'), effects: asking('caesar'), goto: 'tCaesar' },
  { text: 'What’s in it for me?', if: notAsked('pay'), effects: asking('pay'), goto: 'tPay' },
  { text: 'I’ll work for you.', goto: 'tAccept' },
  { text: 'Not yet.', goto: 'tLater' },
];

/** Pudens's entry node in mq-05, or null when the quest is not his to answer. */
export function pudensTabulaStart(c: DialogueContext): string | null {
  const s = stage(c, MQ5);
  if (s === 'summons' || s === 'followed' || s === 'search' || s === 'gate' || s === 'pudens') {
    if (!open(c)) return tomorrowCome(c) ? 'tNight' : 'tTomorrow';
    return c.memory.offered ? 'tAgain' : 't0';
  }
  if (s === 'board') return 'tBoard';
  if (completed(c, MQ5)) return 'tAfter';
  return null;
}

export const PUDENS_TABULA: Record<string, DialogueNode> = {
  t0: {
    text: (c) => `You found your way. Sit, ${term(c)}. Eat a fig. Gratus tells me you met someone on the way up the hill.`,
    choices: [
      { text: 'Show him the knife-man’s tablet.', if: (c) => c.hasItem('quest-tabula-sicarii'), goto: 'tTablet' },
      { text: 'A man with a poisoned knife. He’s dead.', if: (c) => !c.hasItem('quest-tabula-sicarii'), goto: 'tLeak' },
    ],
  },
  tTablet: {
    text: '(Pudens turns the tablet over and goes quiet.) That’s my wax. Somebody in this camp sent that knife after you, and wrote it on my own tablets.',
    next: 'tWhyYou',
  },
  tWhyYou: {
    text: 'So now you know why I can’t use my own men for this. My men talk to each other. You talk to nobody. Nobody knows your face, and the ones who do, you just killed.',
    next: 'tHub',
  },
  tLeak: {
    text: 'Then listen. Festus’s road was known only in this camp, and someone sold it. My men talk to each other. You talk to nobody, and nobody knows your face. That’s why you’re sitting there.',
    next: 'tHub',
  },
  tHub: {
    text: (c) => `Ask what you like, ${term(c)}. Then I’ll ask you something.`,
    choices: hub(),
  },
  tArrow: {
    text: 'Your Dacian told you himself. The centurion was for now; Caesar is for later. “Later” means October, when Caesar rides out for the East and all of Rome lines the road to watch him go. That’s when they’ll try.',
    next: 'tHub',
  },
  tWho: {
    text: 'Not one man. Money from the East, men with grudges, and someone at the top who wants something money can’t buy. The kind of man who wears a toga.',
    next: 'tHub',
  },
  bitusCell: {
    text: 'Your archer is in my cell, across the court. He’s talking. Go and see him, if you want.',
    next: 'tHub',
  },
  offer: {
    text: 'I want you to work for me. Not on my rolls: you’re not a soldier and not a courier. If you’re caught, I’ve never met you. I pay well, and I pay on time.',
    effects: (c) => {
      c.memory.offered = true;
    },
    choices: offerChoices(),
  },
  tSpy: {
    text: 'Spy? Couriers carry letters. Sometimes they read them first.',
    next: 'tOffer2',
  },
  tCaesar: {
    text: 'And tell him what? That I can’t keep my own camp clean? Bring me names. Then we tell him.',
    next: 'tOffer2',
  },
  tPay: {
    text: 'Money now. And a friend in the one office in Rome that hears everything.',
    next: 'tOffer2',
  },
  tOffer2: {
    text: 'Well?',
    choices: offerChoices(),
  },
  tLater: {
    text: 'Take your time. Rome isn’t going anywhere, and neither are they.',
    end: true,
  },
  tAgain: {
    text: (c) => `Back again, ${term(c)}. Have you decided?`,
    choices: offerChoices(),
  },
  tAccept: {
    text: 'Good. Then you’d better see what you’re working for. Nobody else in this camp has seen it.',
    next: 'acceptEnd',
  },
  acceptEnd: { speaker: 'player', text: '(Pudens unlocks a chest and spreads its wax tablets across the table.)', end: true },
  tBoard: { text: 'Look at it. Take your time.', end: true },
  tTomorrow: { text: (c) => `I said tomorrow, ${term(c)}. Come at first light. I’ll have the figs out.`, end: true },
  tNight: { text: (c) => `First light, ${term(c)}. Even I sleep sometimes.`, end: true },
  tAfter: { text: (c) => `Bring me names, ${term(c)}. Half names, if that’s all you’ve got.`, end: true },
};

// ------------------------------------------------------------------ Gratus (merged into his dialogue in main-quest.ts)

/** Gratus's entry node in mq-05 (the infirmary), or null. */
export function gratusTabulaStart(c: DialogueContext): string | null {
  const s = stage(c, MQ5);
  if (s === 'pudens' || s === 'board') return 'g5';
  if (s) return 'g5after';
  if (completed(c, MQ5)) return 'g5done';
  return null;
}

export const GRATUS_TABULA: Record<string, DialogueNode> = {
  g5: {
    text: 'Crito said lie still. Crito isn’t the one they shot.',
    choices: [
      { text: 'What does Pudens want with me?', if: notAsked('g5want'), effects: asking('g5want'), goto: 'g5want' },
      { text: 'Who sold Festus?', if: notAsked('g5camp'), effects: asking('g5camp'), goto: 'g5camp' },
      { text: 'Rest. I’ll see Pudens.', end: true },
    ],
  },
  g5want: {
    text: 'He’ll offer you work, and he’ll make it sound like a favour. It isn’t one. Take it anyway: you’re in this already, and it’s safer to be in it with him.',
    next: 'g5',
  },
  g5camp: {
    text: 'Festus’s road was sold from inside these walls. I still don’t know by whom. Don’t tell anyone here more than you tell me.',
    next: 'g5',
  },
  g5after: { text: 'Go on. Pudens is waiting, and he hates waiting.', end: true },
  g5done: { text: 'So he hired you. Bring him his names, and watch your back on the Caelian.', end: true },
};

export default [custos, mardonius, aquarius, sicarius, bitusVinctus];
