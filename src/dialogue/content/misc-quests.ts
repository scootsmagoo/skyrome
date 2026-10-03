/**
 * Dialogue for the v0.1 misc quests: the Meta Sudans brawl (Hilarus, Crispus and Bucco), Black
 * Beans (Gemellus, Chloe, Pomponia), the Leaning Insula (Rufina, Saturninus) and What Venus Hides
 * (Eros the money-changer, Mus the sewer-runner). Every quest has a Rhetoric route with the odds shown.
 */
import { completed, lemuriaWindow, notStarted, objectiveDone, outcome, running, stage } from '../../content/talk';
import { defineDialogue } from '../types';

const RIXA = 'misc-meta-sudans-rixa';
const FABAE = 'misc-lemuria-fabae';
const NUTANS = 'misc-insula-nutans';
const VENUS = 'misc-venus-cloacina';

// ------------------------------------------------------------------ Brawl at the Fountain

const hilarus = defineDialogue({
  id: 'npc-hilarus',
  npcs: ['npc-hilarus'],
  start: (c) => {
    const o = outcome(c, RIXA);
    if (o === 'won') return 'champion';
    if (o === 'calmed') return 'talker';
    if (o) return 'after';
    return 'greet';
  },
  nodes: {
    greet: {
      text: 'Callinicus! The small shields for ever! (The old man grabs your arm.) You! You look like a person of taste. Tell these scutarii what a parmula is worth.',
      choices: [
        { text: 'What is the argument?', goto: 'story' },
        { text: 'Vale.', end: true },
      ],
    },
    story: {
      text: 'Thirty years I have cheered the parmularii: the small-shield men, the thraeces. Under Domitian a man was thrown to the dogs in the arena for a joke about thraeces. Now we have the Best of Princes and I can say what I like! And those big oafs, the scutarii, say Ferox the murmillo will squash my Callinicus flat. Crispus there wants an apology. From me!',
      choices: [
        { text: 'I’ll talk to Crispus.', end: true },
        { text: 'Leave me out of it.', end: true },
      ],
    },
    champion: {
      text: 'My champion! You should be on the sand yourself! Callinicus will hear of this!',
      end: true,
    },
    talker: {
      text: 'You talked them round! With words! Thirty years, and nobody ever did that.',
      end: true,
    },
    after: {
      text: 'Ah, well. There are other games, and other fountains.',
      end: true,
    },
  },
});

const crispus = defineDialogue({
  id: 'npc-crispus',
  npcs: ['npc-crispus', 'npc-bucco'],
  start: (c) => {
    const s = stage(c, RIXA);
    if (s === 'brawl') return 'fighting';
    if (s === 'start' || s === 'choice') return 'square';
    const o = outcome(c, RIXA);
    if (o === 'won') return 'beaten';
    if (o === 'calmed') return 'friend';
    if (o === 'lost') return 'gloat';
    if (o === 'assault') return 'afraid';
    return notStarted(c, RIXA) ? 'square' : 'greet';
  },
  nodes: {
    greet: {
      text: 'Ferox the Gaul will flatten that little Thracian like a fig. Big shields, big men.',
      end: true,
    },
    square: {
      text: '(A big man in a blue tunic looms over you.) You with the old goat? Then you can apologise for him. Or we settle it the old way: fists. No blades. This is the Meta Sudans, not the arena.',
      choices: [
        { text: 'Fists, then.', goto: 'brawl' },
        { text: 'Fight over gladiators? Save it for the games. I’ll buy the wine.', check: { skill: 'rhetoric', difficulty: 40, pass: 'calmed', fail: 'insulted' } },
        { text: 'Look at me. Do you really want this?', check: { skill: 'rhetoric', difficulty: 40, kind: 'intimidate', pass: 'cowed', fail: 'scorned' } },
        { text: 'Here, for the wine. All of you.', bribe: { amount: 3, goto: 'calmed' } },
        { text: 'Not my fight.', end: true },
      ],
    },
    brawl: {
      text: 'Hah! Bucco, the guest wants to dance! Come on, then!',
      end: true,
    },
    insulted: {
      text: 'You want to buy MY wine? I buy my own wine! Come here!',
      end: true,
    },
    scorned: {
      text: 'Do I want this? (He laughs.) Bucco! He’s asking if we want this!',
      end: true,
    },
    calmed: {
      text: '(Crispus scratches his head.) …Well. If you’re buying. Hilarus! The guest is buying! Ferox and Callinicus can settle it on the sand.',
      end: true,
    },
    cowed: {
      text: '(Crispus looks at your hands, and your face, and decides.) …Another day, Thracian-lover. Another day.',
      end: true,
    },
    fighting: {
      text: 'Talk later! Punch now!',
      end: true,
    },
    beaten: {
      text: '(Crispus is still wet to the waist.) Good fists. You should fight for the murmillones.',
      end: true,
    },
    friend: {
      text: 'My friend who buys the wine! Big shields for ever!',
      end: true,
    },
    gloat: {
      text: 'Ha! The guest who knelt! No hard feelings: your money bought a good round.',
      end: true,
    },
    afraid: {
      text: '(He backs away with his hands up.) Steel? Over a gladiator? You’re mad.',
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Black Beans

const gemellus = defineDialogue({
  id: 'npc-fabius-gemellus',
  npcs: ['npc-fabius-gemellus'],
  start: (c) => {
    const s = stage(c, FABAE);
    if (s === 'truth') return objectiveDone(c, FABAE, 'chloe') ? 'decide' : 'waiting';
    if (s) return 'waiting';
    const o = outcome(c, FABAE);
    if (o === 'exposed') return 'afterExposed';
    if (o === 'appeased') return 'afterAppeased';
    if (o === 'charity') return 'afterCharity';
    return 'greet';
  },
  nodes: {
    greet: {
      text: '(An old man in a long-sleeved tunic is counting black beans into a dish, one at a time, his lips moving.) Not now. Not today. Do you know what day it is?',
      choices: [
        { text: 'The Lemuria.', goto: 'trouble' },
        { text: 'What’s wrong, grandfather?', goto: 'trouble' },
        { text: 'Vale.', end: true },
      ],
    },
    trouble: {
      text: 'Every year I do it right. Midnight. Barefoot. No knot on me. I wash my hands, I put the beans in my mouth and throw them behind me without looking back, nine times: “These I send; with these I redeem me and mine.” And every morning, every year, the beans are gone. Every one. My father’s shade is hungry and angry with me, and I don’t know what I have done.',
      choices: [
        { text: 'I’ll keep watch at midnight.', if: (c) => lemuriaWindow(c), goto: 'accept' },
        { text: 'Maybe the birds eat them.', goto: 'birds', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    birds: {
      text: 'At midnight? In a courtyard with a roof over half of it? (He gives you a long look.) Birds.',
      next: 'trouble',
    },
    accept: {
      text: 'You would? (He presses a twist of cloth into your hand.) Then take these. At midnight, throw them behind you with me, and don’t look back. And watch.',
      effects: (c) => c.giveItem('fabae-nigrae', 9),
      end: true,
    },
    waiting: {
      text: (c) => (stage(c, FABAE) === 'start' ? 'Midnight. In the courtyard. And don’t whistle.' : 'Did you see? Did you see them?'),
      choices: [{ text: 'Not yet.', end: true }],
    },
    decide: {
      text: '(He grabs your sleeve.) Well? Was it them? Was it my father?',
      choices: [
        { text: 'It was your slave girl, Chloe. She took the beans.', goto: 'exposed' },
        { text: 'The shades took what was theirs. Your rite is answered.', check: { skill: 'rhetoric', difficulty: 25, kind: 'lie', label: 'Lie', pass: 'appeased', fail: 'doubt' } },
        { text: 'The beans feed a starving widow under your stairs. Feed the living, and your dead will be content.', check: { skill: 'rhetoric', difficulty: 40, pass: 'charity', fail: 'angry' } },
      ],
    },
    doubt: {
      text: '(He squints at you.) You’re lying. I can see it in your face. Tell me what you saw.',
      choices: [
        { text: 'It was Chloe.', goto: 'exposed' },
        { text: 'The beans feed a starving widow under your stairs. Feed the living, and your dead will be content.', check: { skill: 'rhetoric', difficulty: 40, pass: 'charity', fail: 'angry' } },
      ],
    },
    angry: {
      text: 'A widow? Under MY stairs? Eating MY father’s beans? (He is shaking.) Tell me who took them.',
      choices: [
        { text: 'It was Chloe.', goto: 'exposed' },
        { text: 'The shades took what was theirs.', check: { skill: 'rhetoric', difficulty: 25, kind: 'lie', label: 'Lie', pass: 'appeased', fail: 'doubt' } },
      ],
    },
    exposed: {
      text: 'Chloe? CHLOE! (He goes inside shouting. You hear a slap, and crying.) …Here. For your trouble. (He doesn’t look at you.)',
      end: true,
    },
    appeased: {
      text: '(He sits down hard and laughs and cries at once.) They took them. They took them! Father… Thank you, stranger. Thank the gods.',
      end: true,
    },
    charity: {
      text: '(He is quiet for a long time.) …My father fed half the Velabrum in the bad year and never told my mother. A house that feeds the hungry for its dead has nothing to fear from them. Chloe! Bread, and the good blanket. Bring the old woman in.',
      end: true,
    },
    afterExposed: {
      text: '(He won’t meet your eyes.) The beans stay where I throw them, now.',
      end: true,
    },
    afterAppeased: {
      text: 'My father rests. I feel it in my knees. Thank you, friend.',
      end: true,
    },
    afterCharity: {
      text: 'Pomponia sleeps by my hearth now. She snores like a fuller’s mallet. My father would have laughed.',
      end: true,
    },
  },
});

const chloe = defineDialogue({
  id: 'npc-chloe',
  npcs: ['npc-chloe'],
  start: (c) => {
    const s = stage(c, FABAE);
    if (s === 'ghost' || s === 'truth') return objectiveDone(c, FABAE, 'chloe') ? 'again' : 'caught';
    const o = outcome(c, FABAE);
    if (o === 'exposed') return 'hurt';
    if (o === 'appeased') return 'grateful';
    if (o === 'charity') return 'glad';
    return 'greet';
  },
  nodes: {
    greet: {
      text: 'Yes, domine? The master is inside.',
      end: true,
    },
    caught: {
      text: '(The girl freezes on the stairs with her hands full of black beans.) Please. Please don’t tell him.',
      choices: [{ text: 'Who are the beans for?', goto: 'confess' }],
    },
    confess: {
      text: 'For Pomponia. She sleeps under the stairs. Her son died in the fire at the Kalends and the landlord put her out. The master throws food to the dead every year while the living starve on his stairs. She thinks the dead bring it. I let her think it.',
      choices: [
        { text: 'I won’t tell him.', goto: 'promised' },
        { text: 'That is for your master to decide.', end: true },
      ],
    },
    promised: {
      text: '(She nods, and runs up the stairs.)',
      effects: (c) => c.setFlag('lemuria.promised', true),
      end: true,
    },
    again: {
      text: 'Please. She is old, and she has nobody.',
      end: true,
    },
    hurt: {
      text: '(There is a red mark on her cheek. She won’t look at you.)',
      end: true,
    },
    grateful: {
      text: '(She squeezes your hand quickly and goes back to her work.) Thank you.',
      end: true,
    },
    glad: {
      text: 'She’s inside, by the fire. The master sat with her all morning talking about his father.',
      end: true,
    },
  },
});

const pomponia = defineDialogue({
  id: 'npc-pomponia',
  npcs: ['npc-pomponia'],
  start: (c) => {
    const s = stage(c, FABAE);
    if (s === 'ghost' || s === 'truth' || outcome(c, FABAE) === 'charity') return 'beans';
    return 'greet';
  },
  nodes: {
    greet: {
      text: 'Bless you, child. Have you a crust?',
      choices: [
        { text: 'Here, some bread.', if: (c) => c.hasItem('panis'), goto: 'fed', effects: (c) => (c.takeItem('panis'), c.changeDisposition(5)) },
        { text: 'What do you find in the spring by the gate?', goto: 'spring', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    fed: {
      text: 'Bless you. Bless your house and your dead.',
      end: true,
    },
    spring: {
      text: 'In Mercury’s spring? Things people throw. Coins, sometimes, bless them. Lead, mostly: curses. Here, take this one, it’s no good to me. Somebody hates a carter.',
      effects: (c) => c.giveItem('defixio-capena'),
      end: true,
    },
    beans: {
      text: '(The old woman is chewing slowly.) The kind ones bring them. Every ghost night. I never see them. But I know him.',
      choices: [
        { text: 'Who brings them?', goto: 'thumb' },
        { text: 'Vale.', end: true },
      ],
    },
    thumb: {
      text: 'An old man. Crooked thumb, so. (She bends her own.) Smells of fuller’s earth, like the vats on the Vicus. He sets them on my step and says nothing. A kind old man.',
      choices: [
        { text: '(Say nothing.)', end: true },
        { text: 'Gemellus’ father was a fuller.', goto: 'thumb2' },
      ],
    },
    thumb2: {
      text: 'Was he? (She smiles with three teeth.) Then it’s him. Of course it is.',
      end: true,
    },
  },
});

// ------------------------------------------------------------------ The Leaning Insula

const rufina = defineDialogue({
  id: 'npc-rufina',
  npcs: ['npc-rufina'],
  start: (c) => {
    const s = stage(c, NUTANS);
    if (s === 'warn') return 'warn';
    if (s === 'evacuated') return 'gone';
    if (s) return 'waiting';
    const o = outcome(c, NUTANS);
    if (o === 'fallen') return 'afterFallen';
    if (o === 'shored') return 'afterShored';
    return 'greet';
  },
  nodes: {
    greet: {
      text: '(A woman with a weaver’s calloused fingers is staring up at the front of her insula.) Do you hear it? Listen. It creaks. It never used to creak.',
      choices: [
        { text: 'What’s wrong with it?', goto: 'problem' },
        { text: 'Vale.', end: true },
      ],
    },
    problem: {
      text: 'The stairs have come away from the wall. There’s a crack in the shop below like a mouth. The back wall bulges, and Saturninus, the agent, plasters it over and says “Sleep soundly.” There’s a sour old poet who reads in the baths, Juvenal, who says exactly that: the agent patches the crack and tells you to sleep soundly with the ruin hanging over your head.',
      choices: [
        { text: 'I’ll take a look.', goto: 'accept' },
        { text: 'Vale.', end: true },
      ],
    },
    accept: {
      text: 'Would you? The stairwell, the shop, and the back wall. Look with fresh eyes, and tell me I’m a fool.',
      end: true,
    },
    waiting: {
      text: 'Well? Am I a fool?',
      choices: [{ text: 'Not yet.', end: true }],
    },
    warn: {
      text: '(She reads your face.) He won’t, will he.',
      choices: [
        { text: 'Get everyone out tonight. All of them.', goto: 'warned' },
        { text: 'Not yet.', end: true },
      ],
    },
    warned: {
      text: 'Tonight. All of them. Gods, the family on the fourth floor have six children… I’ll go door to door. Thank you.',
      end: true,
    },
    gone: {
      text: 'They’re out, all of them. Now I stand here and listen to it creak, and pray it’s only my nerves.',
      end: true,
    },
    afterFallen: {
      text: 'We’re alive. My loom is under a ton of brick, and we’re alive. Keep that fascinum I gave you. You have earned the luck.',
      end: true,
    },
    afterShored: {
      text: 'It has stopped talking at night. I still listen.',
      end: true,
    },
  },
});

const saturninus = defineDialogue({
  id: 'npc-saturninus',
  npcs: ['npc-saturninus'],
  start: (c) => (stage(c, NUTANS) === 'agent' ? 'confront' : 'greet'),
  nodes: {
    greet: {
      text: 'Saturninus, agent for the owner of the Fulvian block. Flats to let from the Kalends of July. Bring your own props, ha!',
      end: true,
    },
    confront: {
      text: 'Cracks? Every wall in Rome has cracks. It’s called character. What do you want?',
      choices: [
        { text: 'The stair has left the wall, the beam is propped on a ship’s mast, and someone plastered the party wall last week. When it falls the owner loses the rents, and you lose your head.', check: { skill: 'rhetoric', difficulty: 40, pass: 'agrees', fail: 'refuses' } },
        { text: 'Shore it up today, or I come back for you when it falls.', check: { skill: 'rhetoric', difficulty: 40, kind: 'intimidate', pass: 'agrees', fail: 'refuses' } },
        { text: 'Here are ten denarii. Buy the props.', bribe: { amount: 10, goto: 'agrees' } },
        { text: 'Never mind.', end: true },
      ],
    },
    agrees: {
      text: '(He sighs.) …Fine. Props. Timbers for the party wall. A builder I owe money to. And the third floor out for a few nights. The owner will have my hide.',
      end: true,
    },
    refuses: {
      text: '(He laughs.) Every wall in Rome has cracks. Off you go.',
      end: true,
    },
  },
});

// ------------------------------------------------------------------ What Venus Hides

const eros = defineDialogue({
  id: 'npc-eros-nummularius',
  npcs: ['npc-eros-nummularius'],
  start: (c) => {
    const s = stage(c, VENUS);
    if (s === 'packet') return c.hasItem('drachma-parthica') ? 'packet' : 'waiting';
    if (s) return 'waiting';
    if (completed(c, VENUS)) return 'after';
    return 'greet';
  },
  nodes: {
    greet: {
      text: 'Honest weight! Asses for sesterces, sesterces for denarii, denarii for gold. Look at the scales, friend, not at me.',
      choices: [
        { text: 'Anything odd lately?', if: (c) => notStarted(c, VENUS), goto: 'odd' },
        { text: 'Vale.', end: true },
      ],
    },
    odd: {
      text: '(He lowers his voice.) Twice now, at dusk, a thin young fellow comes out of nowhere by the shrine of Cloacina, the little round one, leans over the drain grate as if he’s praying, and drops something in. Nobody prays to a drain. I want to know what, and I am too fat to stand out there at night. Watch for me? There’s coin in it.',
      choices: [
        { text: 'I’ll watch.', goto: 'accept' },
        { text: 'Not my business.', end: true },
      ],
    },
    accept: {
      text: 'After dusk. Stand where you can see the grate. And whatever he drops, I want to see it first.',
      end: true,
    },
    waiting: {
      text: 'After dusk, by the Cloacina. I’ll be at home by then, behind three locks.',
      end: true,
    },
    packet: {
      text: '(He weighs the coin on his fingertip, then on his scales, then bites it.) Parthian. An Arsacid drachm, King Osroes, good silver. With a war coming, nobody in Rome should be paid in this, and somebody under the Forum is. I’ll give you eight denarii for it, and no questions.',
      choices: [
        { text: 'Done. Eight denarii.', goto: 'sold' },
        { text: 'I’ll keep it.', goto: 'kept' },
        { text: 'I know a man at the strongrooms who will want to see this.', if: (c) => running(c, 'mq-02-tabella') || completed(c, 'mq-02-tabella'), goto: 'toSilo' },
      ],
    },
    sold: {
      text: '(The coin vanishes into his belt.) And the lead token you can keep. REX. (He snorts.) The sewer-runners have a king. Of course they do.',
      end: true,
    },
    kept: {
      text: 'Then keep it out of sight. And the token too. REX: the sewer-runners have a king. Of course they do.',
      end: true,
    },
    toSilo: {
      text: 'Silo? (He goes pale.) Then I never saw it, and you never showed me. Good day.',
      end: true,
    },
    after: {
      text: 'My friend of the drain! Any more Parthian silver? No? Good. Keep it that way.',
      end: true,
    },
  },
});

const mus = defineDialogue({
  id: 'npc-mus',
  npcs: ['npc-mus'],
  start: () => 'snarl',
  nodes: {
    snarl: {
      text: 'Back off! The Rex will have your eyes!',
      end: true,
    },
  },
});

export default [hilarus, crispus, gemellus, chloe, pomponia, rufina, saturninus, eros, mus];
