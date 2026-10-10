/**
 * Dialogue of the first three phase-2 side quests (docs/design/world-life.md §4.8, QUESTS I). The
 * keepers' own lines (Primus, Felix, Crispina) are in src/life/data/keepers/quests-f.ts; these are
 * the other people. The quests react to node ids:
 *
 *   npc-fuscus-carcerum          fuscusLead                                   misc-hilara
 *   misc-hilara-tryphon          hilaraReturned (Tryphon takes the dog)       misc-hilara
 *   npc-cnaeus-aleator           cnaeusDebt, cnaeusPay                        misc-urna-aenea
 *   npc-optio-vigilum            reportPotDone, reportSabinusDone             misc-urna-aenea, misc-fur-balnearius
 *   npc-sabinus-capsarius        sabShrug, sabConfesses, sabFight             misc-fur-balnearius
 */
import { person } from '../../content/people';
import { rotate, stage } from '../../content/talk';
import { hilaraNear } from '../../quests/content/misc-hilara';
import { defineDialogue, type DialogueContext } from '../types';

const HILARA = 'misc-hilara';
const POT = 'misc-urna-aenea';
const BATH = 'misc-fur-balnearius';
const TRYPHON = 'npc-tryphon';

const inStage = (c: DialogueContext, quest: string, ...stages: string[]) => stages.includes(stage(c, quest) ?? '');
/** Felix's debt at the dice: 30 asses, in denarii. */
const DEBT = 30 / 16;

// ------------------------------------------------------------------ Fuscus at the Inn at the Starting Gates

const fuscus = person({
  id: 'npc-fuscus-carcerum',
  greet: '(A thin lad with straw in his hair and a bucket in each hand.) Salve! Horses? Fuscus. I feed them, I water them, I clean up after them. Mind the dung. The Greens’ colts are kicking and the Reds’ are sulking, so it’s a normal day.',
  topics: [
    { ask: 'What goes on behind the starting gates?', say: 'Stalls, straw, a smell you stop noticing, and a hundred men who each know exactly how to win a race. At night the stray dogs come for the scraps. We throw things. They come anyway.' },
    { ask: 'Do the chariot teams stay here?', say: 'The four factions have their stables out beyond the walls. Here we only keep the colts that are being tried, and a few old horses that nobody has the heart to send away.' },
  ],
  news: 'Any word from the Circus?',
  choices: [
    {
      text: 'I’m looking for a lost dog: a big Molossian bitch, Hilara. Seen her?',
      if: (c) => inStage(c, HILARA, 'start'),
      goto: 'fuscusLead',
    },
    {
      text: 'About that Molossian bitch…',
      if: (c) => inStage(c, HILARA, 'hunt', 'follow'),
      goto: 'fuscusAgain',
    },
  ],
  nodes: {
    fuscusLead: {
      text: 'The big Molossian with the bronze bulla at her neck? I know her! She runs with the stray pack behind the gates, the yard just there where the straw goes. But not by day: at dusk they come out, all four of them, when the stable-lads go to supper. She’ll go to no one. Not to me, and I’ve tried with a bucket of scraps. But a sausage, a good smoked one, from the cook-shops: that she’ll take from a stranger’s hand. And nothing else.',
      next: 'hub',
    },
    fuscusAgain: {
      text: 'Dusk, in the yard behind the gates, and bring a sausage. A big smoked one: the cook-shops under the Circus arches sell them. Don’t run at her, she won’t follow if you run.',
      next: 'hub',
    },
  },
});

// ------------------------------------------------------------------ Tryphon takes the dog (Hilara's return)

const hilaraReturn = defineDialogue({
  id: 'misc-hilara-tryphon',
  npcs: [TRYPHON],
  priority: 70,
  start: (c) => {
    const p = c.game.player?.position;
    return stage(c, HILARA) === 'follow' && p && hilaraNear(c.game, p.x, p.z, 14) ? 'returned' : '';
  },
  nodes: {
    returned: {
      text: '(Tryphon looks up from his razor, then at what is trotting at your heel, and the razor goes into the customer’s neck, almost.) By every god of the crossroads! Hilara! Hilara, you ungrateful animal!',
      choices: [{ text: 'She was in the yard behind the starting gates. She took a sausage.', goto: 'hilaraReturned' }],
    },
    hilaraReturned: {
      text: '(He kneels, takes her great head in both hands and tells her what he thinks of her, at some length.) The aedile’s man will be beside himself. Twenty sesterces, as the notice says, and a promise besides: you’ll never pay for a shave in Rome while this razor holds. Hilara, say thank you. No. Of course not.',
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Cnaeus, who dices at the Silver Pig

const cnaeus = person({
  id: 'npc-cnaeus-aleator',
  greet: '(A man with a worn leather cup and a hopeful look sits against the wall, shaking something that rattles.) Cnaeus, and the bones are honest. I’m not. Care for a throw, citizen? Dicing’s illegal, they say. So is a lot of what goes on at the Silver Pig.',
  topics: [
    { ask: 'Do you win?', say: 'The bones are fair, which is the problem: fair means I lose as often as I win. A smart man would stop. I’ve thought about being smart. I’ve decided against it.' },
    { ask: 'Who plays here?', say: 'Carters, porters, bakers’ boys, the odd freedman with a bad conscience. Sailors from the river, when there’s a ship in. Everyone, citizen. You’d be surprised who.' },
  ],
  news: 'Heard anything on the street?',
  choices: [
    {
      text: 'You wouldn’t know of a coppersmith’s apprentice who plays here?',
      if: (c) => inStage(c, POT, 'start') && !c.flag('felix-debt-known'),
      goto: 'cnaeusDebt',
    },
    {
      text: 'Felix’s debt: thirty asses. I’ll settle it. (30 as)',
      if: (c) => !!c.flag('felix-debt-known') && !c.flag('felix-debt-paid') && inStage(c, POT, 'start', 'fence', 'return', 'thief'),
      enabled: (c) => c.denarii() >= DEBT,
      goto: 'cnaeusPay',
      effects: (c) => {
        if (c.pay(DEBT)) c.setFlag('felix-debt-paid', true);
      },
    },
  ],
  nodes: {
    cnaeusDebt: {
      text: 'The coppersmith’s boy? Felix! Ha. Owes me thirty asses, and a couple of others a good deal more. Thirty! I told him to bring it by the Nones or I’d send a friend round to Primus’s shop to explain. He said he had a way. They always have a way, citizen.',
      effects: (c) => c.setFlag('felix-debt-known', true),
      next: 'hub',
    },
    cnaeusPay: {
      text: '(He counts the coins twice, bites one, and puts them in his belt.) Thirty. Settled, and no hard feelings. Tell the boy he can sit at my wall again. Tell him to bring better luck.',
      next: 'hub',
    },
  },
});

// ------------------------------------------------------------------ the optio of the vigiles

const optio = person({
  id: 'npc-optio-vigilum',
  greet: '(A broad man in a vigil’s leather cap, a hook on a pole leaning against the wall beside him, a bucket at his feet.) Optio Fabricius, of the Vigiles. If it’s fire, say so and run. If it’s a theft, say so and wait. If it’s a complaint, take a ticket.',
  topics: [
    { ask: 'How do the Vigiles keep watch?', say: 'Seven cohorts, a thousand men each, two regions to a cohort. Buckets, hooks, blankets and a very long night. We keep the fires down, mostly, and the thieves a little further down than that.' },
    { ask: 'Do you hear cases?', say: 'We catch them. The prefect hears them in the morning, and he hears ones against capsarii who steal at the baths, and slave-dealers who sell a lame man as a sound one. It’s a long list.' },
  ],
  news: 'What’s the night been like?',
  choices: [
    {
      text: 'I know where a stolen bronze pot is being sold: a doorway off the Argiletum.',
      if: (c) => inStage(c, POT, 'fence'),
      goto: 'reportPot',
    },
    {
      text: 'A capsarius at the Baths of Titus is stealing cloaks from the pegs.',
      if: (c) => inStage(c, BATH, 'choose'),
      goto: 'reportSabinus',
    },
  ],
  nodes: {
    reportPot: {
      text: '(He picks up a wax tablet and a stylus.) A doorway. A woman. A pot. I’ll send two lads round with a sack, and she’ll say she knows nothing, and they’ll say she knows plenty. Wait here a moment.',
      next: 'reportPotDone',
    },
    reportPotDone: {
      text: '(Two vigiles go off into the dark. They are back before the lamp on the wall needs trimming, one carrying a sack that clinks.) There it is. Confiscated, and it goes back to its owner, which you may tell him, and the owner may tell you what he thinks it’s worth now. The woman’s been warned. She’ll say she’s warned. Mind how you go.',
      next: 'hub',
    },
    reportSabinus: {
      text: 'A capsarius at the Titus. Sabinus, would that be? Mm. We’ve had that name before. The prefect likes a case like this: he can be stern and tidy at once. Tell me all of it, slowly.',
      next: 'reportSabinusDone',
    },
    reportSabinusDone: {
      text: '(He writes it all down on a wax tablet and sends two of his men to the Titus. They are back within the hour with a hooded cloak, still smelling of the baths, and a pouch.) The cloak. And eight denarii that the prefect has Sabinus pay for the trouble, by my authority. He’ll not be a capsarius much longer.',
      next: 'hub',
    },
  },
});

// ------------------------------------------------------------------ Sabinus, the capsarius

const sabinus = person({
  id: 'npc-sabinus-capsarius',
  greet: (c) =>
    c.flag('bath-curse-ending')
      ? '(A grey, sweating man in a rumpled tunic, propped against the doorpost with a blanket round him. He looks at you as one looks at something that might not be there.) The cloakroom is… I’m not well. A fever. Three days. Don’t come near.'
      : '(A slight man in a clean tunic, a ring of wooden pegs and tickets hanging from his belt.) Sabinus, capsarius. Cloaks, tunics, sandals, an as for the peg, and the gods watch over the rest. Tip the man at the door, citizen. It’s only an as.',
  topics: [
    { ask: 'Do you like the baths?', say: 'It’s a job. Warm, at least, and nobody throws things at the cloakroom. A man could have worse.' },
    { ask: 'You look unwell, Sabinus.', if: (c) => !!c.flag('bath-curse-ending'), say: '(He pulls the blanket tighter, though the sun is warm.) A fever. Three days of it, and I couldn’t tell you why. I’ve done nothing, nothing, I swear to Mercury. Do you think it was something I ate? It must have been something I ate.' },
    { ask: 'Anything lost and found?', say: 'Lost and found? Citizen, this is Rome. Found is a thing that happens to other people.' },
  ],
  choices: [
    {
      text: 'Cloaks go missing from your pegs, Sabinus.',
      if: (c) => inStage(c, BATH, 'start'),
      goto: 'sabShrug',
    },
    {
      text: 'A slave of yours carries a cloak a day to a doorway off the Argiletum. Crispina’s.',
      if: (c) => inStage(c, BATH, 'choose'),
      goto: 'sabAccuse',
    },
  ],
  nodes: {
    sabShrug: {
      text: (c) =>
        c.flag('bath-stolen-cloak')
          ? '(He spreads his hands.) Your cloak, citizen? I’m sorry. I put it on its peg myself. A hooded cloak, plain wool? Nobody’s touched the pegs, as far as I know. People forget. People lose things. Cloaks go. It’s the baths.'
          : '(He shrugs, a little too easily.) Cloaks? A cloak a day, they say. People forget where they left them. The pegs are the pegs, citizen, and I only keep the tickets. If you lose yours, the gods will have it.',
      next: 'hub',
    },
    sabAccuse: {
      text: '(He goes still, and the ring of tickets stops swaying.) I don’t know what you mean. I’m an honest man. Who’s been saying…?',
      choices: [
        { text: 'The vigiles will want to know. Tell me, and I’ll hear you.', check: { skill: 'rhetoric', difficulty: 40, kind: 'persuade', label: 'Confront', pass: 'sabConfesses', fail: 'sabDenies' } },
        { text: 'I’ll have my cloak back, and not by asking.', goto: 'sabFight' },
        { text: 'Never mind, Sabinus.', goto: 'hub' },
      ],
    },
    sabDenies: {
      text: 'You’ve no proof, citizen. And I’ve a great many friends among the bathers. Go and find some other peg to complain about.',
      next: 'hub',
    },
    sabConfesses: {
      text: '(His shoulders drop, and the ring of tickets swings.) All right. All right. Wool is warm and the pay is thin, and nobody counts a cloak a day. Crispina gives me a fair half. Here: yours. And this for your silence: five denarii, from my own purse. Say nothing to the prefect. Please.',
      next: 'hub',
    },
    sabFight: {
      text: '(He puts up his hands as a man does who has never fought for anything.) I’m a capsarius, not a boxer. Don’t. Please.',
      end: true,
    },
  },
});

// ------------------------------------------------------------------ the slave with the bundle

const servus = person({
  id: 'npc-servus-balnei',
  greet: '(He shifts the bundle under his arm and does not quite look at you.) I’m on an errand for my master. Please. I mustn’t be late.',
  topics: [
    { ask: 'What have you got there?', say: 'Laundry, citizen. Just laundry. For a woman who pays by the load.' },
    { ask: 'Who is your master?', say: 'The baths belong to the emperor, and I belong to the baths. Please, I’ll be beaten if I stand here talking.' },
  ],
});

export default [fuscus, hilaraReturn, cnaeus, optio, sabinus, servus];

