/**
 * The Column's people on the morning of 12 May AD 113 (mq-04-columna, docs/STORY.md chapter 4,
 * docs/design/mq-04-columna.md §4): Pudens, chief of the couriers, who takes the archer's fate and
 * the official story; Bitus, the archer, who talks once he is spared; and Crito, Caesar's physician,
 * who kneels by Gratus on the stair and in the court. Quests react to node ids, not to texts:
 *
 *   npc-bitus    bitusEnd (the archer is taken down)
 *   npc-pudens   summonsEnd (the summons to the Castra Peregrina; the quest completes)
 *   npc-crito    c0 (climb), c1 (aftermath: gives quest-sagitta-dacica once)
 *
 * Gratus's morning and wounded lines are in main-quest.ts (postEnd, w0).
 */
import { female, hourNow, stage } from '../../content/talk';
import { defineDialogue, type DialogueContext } from '../types';

const MQ4 = 'mq-04-columna';

/** Pudens's word for the player: "my boy", "my girl", or "my friend" when the sex is unknown. */
const term = (c: DialogueContext) => (!c.game.standing?.sex ? 'my friend' : female(c) ? 'my girl' : 'my boy');

/** A question asked is not offered again in this NPC's conversations (saved in its memory). */
const notAsked = (key: string) => (c: DialogueContext) => !c.memory[`q:${key}`];
const asking = (key: string) => (c: DialogueContext) => {
  c.memory[`q:${key}`] = true;
};

/** Give an item once, and only if the catalogue and the bag allow it (a second give would stack). */
const giveOnce = (memoryKey: string, id: string) => (c: DialogueContext) => {
  if (c.memory[memoryKey]) return;
  c.memory[memoryKey] = true;
  if (!c.hasItem(id)) c.giveItem(id);
};

// ------------------------------------------------------------------ Bitus

const bitus = defineDialogue({
  id: 'npc-bitus',
  npcs: ['npc-bitus'],
  priority: 90,
  start: () => 'b0',
  nodes: {
    b0: {
      text: 'So. You climbed all of it. One hundred and eighty-five steps; I counted them in the dark.',
      choices: [
        { text: 'Who are you?', if: notAsked('bwho'), effects: asking('bwho'), goto: 'bwho' },
        { text: 'Why?', if: notAsked('bwhy'), effects: asking('bwhy'), goto: 'bwhy' },
        { text: 'Who paid you?', if: notAsked('bpaid'), effects: asking('bpaid'), goto: 'bpaid' },
        { text: 'Who were you shooting at?', if: notAsked('btarget'), effects: asking('btarget'), goto: 'btarget' },
        { text: 'Get up. Pudens’s men are coming.', goto: 'bitusEnd' },
      ],
    },
    bwho: {
      text: 'Bitus, son of Dida. From the hills above Sarmizegetusa, when there were hills and a Sarmizegetusa. I carried stone for this forum for six years. Nobody looks at a captive with a rope on his shoulder.',
      next: 'bmore',
    },
    bwhy: {
      text: 'Walk down your Column and count my people. They’re on it a thousand times: burning our own houses, drinking poison, carrying our king’s head to your Caesar on a dish. Your stone says we lost. I wanted it to say one more thing.',
      next: 'bmore',
    },
    bpaid: {
      text: 'Mucapor gave me the bow: a falx-man at the Ludus Dacicus. The silver was from a man with Syrian rings who smelled of pepper. Take this; Mucapor’s men know it. If you go asking for him, take more friends than you have.',
      effects: giveOnce('gaveTessera', 'quest-tessera-mucaporis'),
      next: 'bmore',
    },
    btarget: {
      text: 'Not Caesar. They were clear. The centurion in the grey cloak, the one going about asking questions at the pepper house. Caesar, they said, is for later.',
      effects: (c) => c.setFlag('mq04-bitus-target', true),
      next: 'bmore',
    },
    bmore: {
      text: '(He waits, sullen, for you to be done.)',
      choices: [
        { text: 'Who are you?', if: notAsked('bwho'), effects: asking('bwho'), goto: 'bwho' },
        { text: 'Why?', if: notAsked('bwhy'), effects: asking('bwhy'), goto: 'bwhy' },
        { text: 'Who paid you?', if: notAsked('bpaid'), effects: asking('bpaid'), goto: 'bpaid' },
        { text: 'Who were you shooting at?', if: notAsked('btarget'), effects: asking('btarget'), goto: 'btarget' },
        { text: 'Get up. Pudens’s men are coming.', goto: 'bitusEnd' },
      ],
    },
    bitusEnd: {
      text: 'Do what you like with me. I’ve seen Rome from the top. It’s smaller than they say.',
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Pudens

const pudens = defineDialogue({
  id: 'npc-pudens',
  npcs: ['npc-pudens'],
  priority: 90,
  start: (c) => {
    const s = stage(c, MQ4);
    return s === 'aftermath' || s === 'aftermath-killed' ? 'p0' : 'pout';
  },
  nodes: {
    p0: {
      text: (c) => {
        const t = term(c);
        const intro = `So you’re Gratus’s stray. Titus Aufidius Pudens. I keep the couriers, and the couriers keep the secrets. Gratus says you brought Festus’s tablet all the way in from the gate, and then climbed my emperor’s column for him.`;
        return c.flag('bitus-fate') === 'killed'
          ? `${intro} …and you left me a dead Dacian. Dead men are poor company and worse witnesses.`
          : `${intro} …and you brought me a live Dacian. Do you know how rare that is, ${t}? A live one talks.`;
      },
      choices: [
        { text: 'Will Gratus live?', if: notAsked('pgratus'), effects: asking('pgratus'), goto: 'pgratus' },
        { text: 'The archer wasn’t shooting at Caesar.', if: (c) => !!c.flag('mq04-bitus-target') && notAsked('ptarget')(c), effects: asking('ptarget'), goto: 'ptarget' },
        { text: 'What happens now?', goto: 'pomen' },
      ],
    },
    pmore: {
      text: (c) => `Anything else, ${term(c)}?`,
      choices: [
        { text: 'Will Gratus live?', if: notAsked('pgratus'), effects: asking('pgratus'), goto: 'pgratus' },
        { text: 'The archer wasn’t shooting at Caesar.', if: (c) => !!c.flag('mq04-bitus-target') && notAsked('ptarget')(c), effects: asking('ptarget'), goto: 'ptarget' },
        { text: 'What happens now?', goto: 'pomen' },
      ],
    },
    pgratus: {
      text: 'Crito says so, and Crito is Caesar’s own doctor, so he had better be right. A hand lower and you’d be talking to Gratus’s ghost, and the Lemuria is over.',
      next: 'pmore',
    },
    ptarget: {
      text: (c) => `No. He wasn’t. Gratus has been telling me for a month that my camp leaks. Today I believe him. Keep that to yourself, ${term(c)}. Especially from my camp.`,
      next: 'pmore',
    },
    pomen: {
      text: 'Now? Now you listen carefully, because this is what happened. There was no arrow. A centurion of mine was taken ill in the sun, and at the same moment a hawk was seen over the Column. The augurs are already calling it a fine omen for the Parthian war. That is what you saw. Say it back to me.',
      choices: [
        { text: 'A hawk over the Column. A fine omen.', goto: 'psummons' },
        { text: 'Rome will hear the truth anyway.', goto: 'pwarn' },
      ],
    },
    pwarn: {
      text: 'Rome will hear forty truths by nightfall. Ours will be the one with a temple attached.',
      next: 'psummons',
    },
    psummons: {
      text: 'Come to the Castra Peregrina tomorrow, on the Caelian. Show the guard Gratus’s token. We’ll talk about what you are going to be. And take this; it opens doors that are none of your business.',
      effects: giveOnce('gaveRing', 'anulus-peregrinorum'),
      next: 'summonsEnd',
    },
    summonsEnd: { speaker: 'player', text: '(Pudens turns back to the litter where Gratus lies.)', end: true },
    // Outside mq-04 (Pudens is only staged during the aftermath).
    pout: { text: (c) => `Tomorrow, ${term(c)}. The Castra Peregrina.`, end: true },
  },
});

// ------------------------------------------------------------------ Crito

const C1_TEXT = 'Under the collarbone, through the muscle, missed the great vessel by a finger. He’ll live, if he lies still, which he won’t.';

const crito = defineDialogue({
  id: 'npc-crito',
  npcs: ['npc-crito'],
  priority: 90,
  start: (c) => {
    const s = stage(c, MQ4);
    if (s === 'climb') return 'c0';
    if (s === 'aftermath' || s === 'aftermath-killed') return c.memory.gaveArrow ? 'c1again' : 'c1';
    return 'cOut';
  },
  nodes: {
    c0: {
      text: 'He can’t talk. Press here… harder. Good. Go and do what he told you.',
      end: true,
    },
    c1: { text: C1_TEXT, next: 'c1gift' },
    c1gift: {
      speaker: 'player',
      text: '(Crito puts the arrow in your hand. Barbed. Red bands on the shaft. Dacian.)',
      effects: (c) => {
        c.memory.gaveArrow = true;
        if (!c.hasItem('quest-sagitta-dacica')) c.giveItem('quest-sagitta-dacica');
      },
      end: true,
    },
    c1again: { text: C1_TEXT, end: true },
    cOut: { text: 'Not now, citizen. Every man in this Forum wants something from me today.', end: true },
  },
});

export default [bitus, pudens, crito];
