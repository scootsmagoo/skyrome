/**
 * Dialogue of the v0.1 misc quests (docs/CONTENT.md §3.3):
 *   misc-meta-sudans-rixa   Bassulus and Anicetus (dlg-rixa)
 *   misc-lemuria-fabae      Florus and Thallusa (dlg-fabae)
 *   misc-insula-nutans      Prima, Callistus (dlg-nutans), Dento, the tenants
 *   misc-venus-cloacina     Ianuarius (dlg-cloacina), the Rex Cloacae
 * plus Antiochus and Moschus at the Column (v0.1-Could). Quests react to node ids:
 *
 *   npc-rixa     sideScutarii, sideParmularii, peace, cupThrown, walked
 *   npc-fabae    lie, persuade, truth (Thallusa), florusLie, florusPersuaded, florusTold (Florus), offer (Florus)
 *   npc-prima    offer
 *   npc-callistus confronted, bribed
 *   npc-dento    ordered
 *   npc-nutans-tenants  warned
 *   npc-ianuarius accept, done
 *   npc-rex-cloacae  fight, leave
 */
import { completed, female, lemuriaWindow, notStarted, outcome, questVar, rotate, running, stage } from '../../content/talk';
import { person } from '../../content/people';
import { defineDialogue, type DialogueContext } from '../types';

const RIXA = 'misc-meta-sudans-rixa';
const FABAE = 'misc-lemuria-fabae';
const NUTANS = 'misc-insula-nutans';
const CLOACINA = 'misc-venus-cloacina';

// ------------------------------------------------------------------ the fans at the Meta Sudans

const bassulus = (c: DialogueContext) => c.npcId === 'npc-bassulus';

const rixa = defineDialogue({
  id: 'npc-rixa',
  npcs: ['npc-bassulus', 'npc-anicetus'],
  priority: 80,
  start: (c) => {
    const s = stage(c, RIXA);
    if (s === 'start') return 'n0';
    if (s === 'rixa') return 'fighting';
    return outcome(c, RIXA) ? 'after' : 'idle';
  },
  nodes: {
    n0: {
      text: (c) =>
        bassulus(c)
          ? '(A big man in a blood-stained tunic, a painted rectangular shield tied round his arm.) You! You fought at the Ludus today. Tell this tanner the big shield wins. Scutarii!'
          : '(A thin man in a brown tunic that stinks of the tannery, a little square shield painted on a board at his neck.) Don’t listen to the butcher. Tell him Auctus was robbed! Parmularii!',
      choices: [
        { text: 'The big shield wins. Scutarii!', goto: 'sideScutarii' },
        { text: 'Auctus was robbed. Parmularii!', goto: 'sideParmularii' },
        { text: 'Both shields lost to me today. Drink to the winner, not the shield.', check: { skill: 'rhetoric', difficulty: 25, pass: 'peace', fail: 'cupThrown' } },
        { text: 'Shut up, both of you, or I’ll show you how I won.', check: { skill: 'rhetoric', difficulty: 40, kind: 'intimidate', label: 'Intimidate', pass: 'peace', fail: 'cupThrown' } },
        { text: 'Not my fight.', goto: 'walked' },
      ],
    },
    sideScutarii: { text: 'Ha! Then let’s teach them! Scutarii, to me!', effects: (c) => c.setFlag('rixa-side', 'scutarii'), end: true },
    sideParmularii: { text: 'Ha! Then let’s teach them! Parmularii, to me!', effects: (c) => c.setFlag('rixa-side', 'parmularii'), end: true },
    peace: {
      speaker: 'player',
      text: '(A pause. Then Bassulus laughs and slaps Anicetus on the back.) “The winner! Wine for the winner!”',
      effects: (c) => {
        c.game.factions?.addReputation('plebs', 3);
        c.setFlag('rixa-outcome', 'peace');
      },
      end: true,
    },
    cupThrown: {
      text: 'Who asked you? (Someone throws a cup. The brawl starts around you.)',
      effects: (c) => c.setFlag('rixa-side', bassulus(c) ? 'parmularii' : 'scutarii'),
      end: true,
    },
    walked: { text: '(They shrug, spit on their hands and start without you.)', effects: (c) => c.setFlag('rixa-outcome', 'walked'), end: true },
    fighting: { text: 'Get out of the way or get in it!', end: true },
    after: {
      text: (c) =>
        c.flag('rixa-outcome') === 'won'
          ? bassulus(c) ? 'Scutarius! Wine for the scutarius!' : 'The parmularii owe you a drink. And a cheer.'
          : 'Big shield, small shield. It doesn’t matter. It’s Rome.',
      end: true,
    },
    idle: {
      text: (c) =>
        bassulus(c)
          ? rotate(c, 'bassulusIdle', ['Big shield, big heart! Scutarii!', 'A thraex is a rat with a hat.', 'The murmillo stands. The thraex runs. Which would you marry?'])
          : rotate(c, 'anicetusIdle', ['Small shield, quick feet! Parmularii!', 'The murmillo is a fish in a pot. We eat fish.', 'Did you see Auctus today? Robbed, I tell you. Robbed!']),
      end: true,
    },
  },
});

/** After the brawl the watch arrives (dlg-rixa-law): Verecundus by day, Primigenius after sunset. */
const rixaLaw = defineDialogue({
  id: 'npc-rixa-law',
  npcs: ['npc-verecundus', 'npc-primigenius'],
  priority: 90,
  start: (c) => (stage(c, RIXA) === 'after' ? 'law0' : ''),
  nodes: {
    law0: {
      text: 'Brawling at the Meta. In front of the amphitheatre. Who started it?',
      choices: [
        { text: 'I did.', if: (c) => !!c.flag('threw-first-punch'), goto: 'lawFine' },
        { text: 'They did. Ask anyone.', if: (c) => !c.flag('threw-first-punch'), goto: 'lawClear' },
        { text: 'Fans being fans, officer. Nobody’s hurt.', check: { skill: 'rhetoric', difficulty: 25, pass: 'lawClear', fail: 'lawFine' } },
      ],
    },
    lawFine: { text: 'Ten denarii for the peace of the city. Pay, or walk with me.', end: true },
    lawClear: { text: 'Fine. Go home. All of you.', end: true },
  },
});

// ------------------------------------------------------------------ Black Beans

const florus = (c: DialogueContext) => c.npcId === 'npc-florus';

const fabae = defineDialogue({
  id: 'npc-fabae',
  npcs: ['npc-florus', 'npc-thallusa'],
  priority: 85,
  start: (c) => {
    const s = stage(c, FABAE);
    if (florus(c)) {
      if (s === 'choice' && c.flag('fabae-decided')) return 'f0';
      if (s === 'start' || s === 'watch' || s === 'choice') return 'waiting';
      if (outcome(c, FABAE)) return 'florusAfter';
      return 'offer';
    }
    if (s === 'choice') return 't0';
    return outcome(c, FABAE) ? 'thallusaAfter' : 'thallusaIdle';
  },
  nodes: {
    // ---- Florus offers the job
    offer: {
      text: '(A stocky man with a cooper’s adze at his belt and the look of someone who has been robbed by the dead.) Every Lemuria, the same. I throw the beans, nine handfuls, over the shoulder, no looking back, and by dawn: gone. The ghosts have an appetite.',
      choices: [
        { text: 'Maybe it’s not ghosts.', goto: 'offer2' },
        { text: 'Beans for the dead. How very pious.', goto: 'offer2' },
        { text: 'Vale.', end: true },
      ],
    },
    offer2: {
      text: 'Gods! You think I don’t know? My wife says the dead are hungry. I want to know how hungry. Keep watch in my stairwell tonight after the midnight rite. I’ll pay you what a widow pays a priest.',
      choices: [
        { text: 'I’ll watch your stairwell.', goto: 'accept' },
        { text: 'Not tonight.', end: true },
      ],
    },
    accept: { text: 'Then bless you. Come to my door before midnight. Bring your own bread; I’ve none to spare. The dead eat everything.', end: true },
    waiting: { text: (c) => (stage(c, FABAE) === 'start' ? 'After the rite, citizen. Midnight. Nine handfuls, and then you watch.' : 'Well? Did you see?'), end: true },
    // ---- Thallusa at the lean-to (dlg-fabae)
    t0: {
      speaker: 'npc',
      text: 'Don’t tell the master. He’ll sell me, and they’ll starve before the Kalends. The dead don’t eat beans, citizen. The living do.',
      choices: [
        { text: 'Your secret is safe.', goto: 'lie' },
        { text: 'I’ll tell him the truth, but I’ll make him listen.', goto: 'persuade' },
        { text: 'He’s your master. He has a right to know.', goto: 'truth' },
        { text: '(Give her 5 denarii.)', enabled: (c) => c.denarii() >= 5, goto: 'gift', effects: (c) => { if (c.pay(5)) c.game.devotion?.gainPietas(5); } },
      ],
    },
    gift: { text: '…For the children. Thank you. I’ll pray for you at every crossroads.', next: 't0' },
    lie: { text: 'The gods see you.', effects: (c) => (c.setFlag('fabae', 'lie'), c.setFlag('fabae-decided', true)), end: true },
    persuade: { text: 'Then may Mercury lend you his tongue.', effects: (c) => (c.setFlag('fabae', 'persuade'), c.setFlag('fabae-decided', true)), end: true },
    truth: { speaker: 'player', text: '(She says nothing. She picks up the smallest child.)', effects: (c) => (c.setFlag('fabae', 'truth'), c.setFlag('fabae-decided', true)), end: true },
    thallusaIdle: { text: (c) => rotate(c, 'thallusaIdle', ['Yes, master. No, master. The ghosts, master.', 'Little ones, eat slowly. Slowly, I said.']), end: true },
    thallusaAfter: { text: 'The gods keep you. Come to the compitum, if you ever want to see a child eat bread.', end: true },
    // ---- Florus, afterwards (the three endings)
    f0: {
      text: 'Well? Ghosts or thieves?',
      choices: [
        { text: 'Ghosts. Hungry ones. Throw more beans next year.', if: (c) => c.flag('fabae') === 'lie', goto: 'florusLie' },
        { text: 'Your beans feed your slave’s grandchildren. Feed them on purpose, and the dead will thank you twice.', if: (c) => c.flag('fabae') === 'persuade', check: { skill: 'rhetoric', difficulty: 40, pass: 'florusPersuaded', fail: 'florusTold' } },
        { text: 'Thallusa takes them for her grandchildren.', if: (c) => c.flag('fabae') === 'truth', goto: 'florusTold' },
      ],
    },
    florusLie: { text: 'Gods! I knew it. Nine handfuls next year.', effects: (c) => (c.receive(5), c.game.devotion?.gainPietas(5)), end: true },
    florusPersuaded: {
      text: '…Pious, you mean? Feeding the living for the dead’s sake. My father would have liked that. He never fed anyone.',
      effects: (c) => {
        c.receive(15);
        c.game.devotion?.gainPietas(10);
        c.game.standing?.addFame('dist-velabrum-boarium', 5);
        c.setFlag('florus-feeds-family', true);
      },
      end: true,
    },
    florusTold: {
      text: 'My beans! For the dead! She’ll be on the auction block by the Nones— (He stops.) …No. Not in Lemuria. Not with my father listening.',
      effects: (c) => {
        c.receive(10);
        if (c.flag('fabae') === 'truth') c.game.standing?.addFame('dist-velabrum-boarium', -5);
      },
      end: true,
    },
    florusAfter: { text: (c) => rotate(c, 'florusAfter', ['Oak for wine, chestnut for oil, pine for fools.', 'My father haunts me. He haunted me alive, too.', 'Every Lemuria, the same. But this year I threw an extra handful.']), end: true },
  },
});

// ------------------------------------------------------------------ the Leaning Insula

const prima = defineDialogue({
  id: 'npc-prima',
  npcs: ['npc-prima'],
  priority: 80,
  start: (c) => {
    const s = stage(c, NUTANS);
    if (s && ['start', 'callistus', 'aedile', 'evacuate'].includes(s)) return `p-${s}`;
    if (outcome(c, NUTANS) === 'done') return 'thanks';
    if (outcome(c, NUTANS) === 'bribed' || outcome(c, NUTANS) === 'collapsed') return 'cursed';
    return 'offer';
  },
  nodes: {
    offer: {
      text: '(A slight woman in a blue-green tunic, a grey palla over her head, stands on the stair with a distaff and a look that could crack plaster.) Another crack. Sleep easy, says Callistus. I’ll sleep easy in my tomb. Children! Away from that wall!',
      choices: [
        { text: 'This wall is cracked?', goto: 'o1' },
        { text: 'Vale.', end: true },
      ],
    },
    o1: {
      text: 'From the cellar to the roof. The floors slope. The props are oak and the oak is bowing. My husband built half the Forum; he couldn’t afford to live in a wall that stands. Callistus says it has been like this since Domitian. I say that’s exactly the trouble.',
      choices: [
        { text: 'Let me look.', goto: 'offerAccept' },
        { text: 'It’s not my business.', end: true },
      ],
    },
    offerAccept: { text: 'Then look. Find me something I can carry to the aediles. The ground-floor wall behind the taberna, the bowed prop on the stair, the crack in the top flat you can put a hand into. Find three, and I’ll find the nerve.', end: true },
    'p-start': { text: 'The wall behind the taberna, the prop on the stair, the crack on the top floor. Three, and we have something to show. Please hurry; it’s getting worse.', end: true },
    'p-callistus': { text: 'You found enough? Then take it to Callistus. He’ll laugh. Let him.', end: true },
    'p-aedile': { text: 'Dento, the aediles’ man, in the Forum by the Rostra. He hates scandal more than he hates work. Tell him everything.', end: true },
    'p-evacuate': { text: 'They won’t believe me. They won’t believe you. But they will move, if it’s dusk and the plaster’s coming down. Hurry!', end: true },
    thanks: {
      text: '(Her eyes are red but her voice is steady.) The back of the insula came down in the first watch, and nobody was under it. You did that. Take this: my husband’s fascinum. He wore it every day he worked on the Forum. It never helped. It might help you.',
      effects: (c) => {
        if (!c.flag('prima-fascinum')) {
          c.giveItem('fascinum');
          c.setFlag('prima-fascinum', true);
        }
      },
      end: true,
    },
    cursed: { text: '(She turns her back. A child coughs, somewhere in the dust.)', end: true },
  },
});

const callistus = defineDialogue({
  id: 'npc-callistus',
  npcs: ['npc-callistus'],
  priority: 80,
  start: (c) => (stage(c, NUTANS) === 'callistus' ? 'n0' : outcome(c, NUTANS) ? 'after' : 'idle'),
  nodes: {
    n0: {
      text: 'Cracks? Every wall in Rome has cracks. It’s how you know it’s a wall. Sleep easy.',
      choices: [
        { text: 'Fix it now, before you’re explaining corpses to the aediles.', check: { skill: 'rhetoric', difficulty: 40, pass: 'n1', fail: 'n2' } },
        { text: 'Fix it, or I’ll fix you.', check: { skill: 'rhetoric', difficulty: 40, kind: 'intimidate', label: 'Intimidate', pass: 'n1', fail: 'n2' } },
        { text: 'I’m taking this to the aediles.', goto: 'n3' },
      ],
    },
    n1: { text: '…I’ll send for the builders. After the Ides. Possibly.', next: 'n3' },
    n2: { text: 'Do. The aediles love a story.', next: 'n3' },
    n3: {
      text: 'Listen. Ten denarii, and you never climbed these stairs. The master is a senator; you don’t want to know which.',
      choices: [
        { text: '(Take the money.)', goto: 'bribed', effects: (c) => { c.receive(10); c.setFlag('nutans-bribed', true); } },
        { text: 'Keep it.', goto: 'confronted' },
      ],
    },
    confronted: { text: 'Suit yourself. Nobody likes a hero. They get hurt at the wrong end of the stair.', end: true },
    bribed: { text: 'A sensible person. Sleep easy.', end: true },
    after: { text: (c) => (outcome(c, NUTANS) === 'bribed' ? 'Sleep easy. Sleep easy. The master is a senator.' : '(He looks past you, at the dust, and keeps walking.)'), end: true },
    idle: {
      text: (c) => rotate(c, 'callistusIdle', ['Sleep easy, sleep easy. The props are oak.', 'The rent is due on the Kalends. The repairs are due on the Greek Kalends.', 'The master is a senator. Senators don’t do walls.']),
      end: true,
    },
  },
});

const dento = defineDialogue({
  id: 'npc-dento',
  npcs: ['npc-dento'],
  priority: 80,
  start: (c) => (stage(c, NUTANS) === 'aedile' ? 'report' : 'idle'),
  nodes: {
    report: {
      text: (c) => `Short measure? … No. The Leaning Insula, you say. (He sighs like a man being asked to lift something.) I’ve eleven walls to inspect and a toga to keep clean. ${Number(questVar(c, NUTANS, 'evidence')) >= 4 ? 'You’ve brought … a good deal of evidence, citizen.' : 'What have you got?'}`,
      choices: [
        { text: 'The ground-floor wall is rubble with no bonding course. Cheap work. I’ve seen better in a pigsty.', if: (c) => !!c.flag('nutans-fabrica'), goto: 'ordered' },
        { text: 'I’ve found more than three cracks, and the owner’s man tried to pay me off. Do you want that on your aedile’s tablet?', if: (c) => Number(questVar(c, NUTANS, 'evidence')) >= 4 && !c.flag('nutans-fabrica'), check: { skill: 'rhetoric', difficulty: 10, pass: 'ordered', fail: 'refused' } },
        { text: 'It will fall on the public. The aediles answer for that.', if: (c) => Number(questVar(c, NUTANS, 'evidence')) < 4 && !c.flag('nutans-fabrica'), check: { skill: 'rhetoric', difficulty: 25, pass: 'ordered', fail: 'refused' } },
        { text: 'The Prefect of the City has taken an interest in the insula. (A lie.)', check: { skill: 'rhetoric', difficulty: 40, kind: 'lie', label: 'Lie', pass: 'ordered', fail: 'refused' } },
        { text: 'For the paperwork. (Bribe)', bribe: { amount: 5, goto: 'ordered' } },
      ],
    },
    ordered: { text: '…All right, all right. I’ll see the order cut. Empty it before dark. The tenants won’t believe it; they never do. (He writes, grimacing.) If it falls down, it’s my aedile’s fault. If it’s my aedile’s fault, it’s mine.', effects: (c) => c.setFlag('dento-order', true), end: true },
    refused: { text: 'It’s late, citizen, and a wall has never yet fallen on the day it was reported. Come back with something I can read.', end: true },
    idle: {
      text: (c) => rotate(c, 'dentoIdle', ['Short measure? Show me. No, show me with witnesses.', 'Taverns, brothels, weights and walls. The aediles do everything, and I do it for them.', 'If it falls down, it’s my aedile’s fault. If it’s my aedile’s fault, it’s mine.']),
      end: true,
    },
  },
});

/** The tenants who must be warned (the evacuation: four households, one of them Prima's own). */
const tenants = defineDialogue({
  id: 'npc-nutans-tenants',
  npcs: ['npc-sutor-nutans', 'npc-senes-nutans', 'npc-syri-nutans'],
  priority: 80,
  start: (c) => (stage(c, NUTANS) === 'evacuate' ? (c.memory.warned ? 'gone' : c.npcId === 'npc-syri-nutans' ? 'syri' : 'warn') : 'idle'),
  nodes: {
    warn: {
      text: (c) => (c.npcId === 'npc-sutor-nutans' ? '(A cobbler at his last, his mouth full of nails.) Out? Out of where? I’ve eleven pairs to finish by the Ludi. What wall?' : '(An old couple on the stair, a lamp and a bundle between them.) The aedile’s man says empty the building? Wife, did you hear? He says the wall will fall.'),
      choices: [
        { text: 'The aediles ordered it. Out, before dark.', if: (c) => !!c.flag('dento-order'), goto: 'warned' },
        { text: 'It’s coming down. Take what matters and go.', check: { skill: 'rhetoric', difficulty: 10, pass: 'warned', fail: 'unconvinced' } },
      ],
    },
    unconvinced: { text: 'Every wall in Rome has a crack. I’m not leaving my last.', next: 'warn' },
    syri: {
      text: '(A man in a long striped tunic, his wife behind him, two children clinging to her skirts. He speaks little Latin and holds up both hands.) Wall? What wall? We stay.',
      choices: [
        { text: '(Point at the crack, then at the children, then at the street.) Out. Now.', check: { skill: 'rhetoric', difficulty: 10, pass: 'warned', fail: 'unconvinced2' } },
        { text: '(Show him the aediles’ order.)', if: (c) => !!c.flag('dento-order'), goto: 'warned' },
      ],
    },
    unconvinced2: { text: '(He shakes his head, but looks at the crack twice.) We… stay.', next: 'syri' },
    warned: { text: '…All right. All right. Gods keep you.', effects: (c) => (c.memory.warned = true), end: true },
    gone: { text: 'We’re going. Leave us.', end: true },
    idle: { text: (c) => rotate(c, 'tenantIdle', ['The stairs are a bit steep, but you get used to them.', 'It creaks. Houses creak. Don’t they?', 'Mind the third step. It’s not a step so much as a suggestion.']), end: true },
  },
});

// ------------------------------------------------------------------ What Venus Hides

const ianuarius = defineDialogue({
  id: 'npc-ianuarius',
  npcs: ['npc-ianuarius'],
  priority: 80,
  start: (c) => {
    const s = stage(c, CLOACINA);
    if (s === 'cache') return 'd0';
    if (s) return 'busy';
    return completed(c, CLOACINA) ? 'after' : 'greet';
  },
  nodes: {
    greet: {
      text: '(A stocky man in leather leggings to the thigh with a long iron hook and a lantern.) The old lady’s been here since the kings. She’ll outlast the lot of us. Someone’s been lifting my grate. My grate!',
      choices: [
        { text: 'Tell me about the grate.', goto: 'n0' },
        { text: 'Vale.', end: true },
      ],
    },
    n0: {
      text: 'My grate! The one by the little Venus. Scratches on the iron, and the bolt oiled, and I never oil it. Someone’s using my lady as a front door.',
      choices: [
        { text: 'I’ll watch it tonight.', goto: 'accept' },
        { text: 'What’s down there?', goto: 'n2' },
      ],
    },
    n2: { text: 'The oldest drain in the world. Kings built it. Venus guards the gate. And lately, somebody’s kingdom.', next: 'n0' },
    accept: {
      text: 'Second watch is when the bath-thieves come home. Take my key if you go down. And a torch. The rats respect a torch.',
      effects: (c) => {
        if (!c.hasItem('clavis-cloacae')) c.giveItem('clavis-cloacae');
        if (!c.hasItem('fax')) c.giveItem('fax', 2);
      },
      end: true,
    },
    busy: { text: 'Mind the rats. And the king. They say there’s a king down there, can you imagine.', end: true },
    after: { text: 'The old lady’s quiet. Bless you, whoever you are. Mind the grate when you pass.', end: true },
    d0: {
      text: 'You came up out of her mouth in one piece? Then she let you out. She doesn’t always.',
      effects: (c) => {
        if (!c.flag('cloacina-paid')) {
          c.receive(30);
          c.game.standing?.addFame('dist-forum-romanum', 10);
          c.setFlag('cloacina-paid', true);
        }
      },
      end: true,
    },
  },
});

const rex = defineDialogue({
  id: 'npc-rex-cloacae',
  npcs: ['npc-rex-cloacae'],
  priority: 80,
  start: () => 'n0',
  nodes: {
    n0: {
      text: 'Welcome to my kingdom. Leave the way you came and keep your purse, or stay and lose both.',
      choices: [
        { text: 'You’ll hand over the stolen clothes and the king’s crown, or I’ll take them.', check: { skill: 'rhetoric', difficulty: 55, kind: 'intimidate', label: 'Intimidate', pass: 'leave', fail: 'fight' } },
        { text: 'The curators want their drain back. Surrender, and you’ll live.', check: { skill: 'rhetoric', difficulty: 55, pass: 'leave', fail: 'fight' } },
        { text: '(Draw steel.)', goto: 'fight' },
      ],
    },
    leave: { text: 'Above, Caesar. Below, me. Take the key and go, and tell the old lady I paid my rent.', effects: (c) => c.setFlag('rex-cloacae-fate', 'parleyed'), end: true },
    fight: { text: 'Open the sluice and we’ll all go swimming!', effects: (c) => c.attack(), end: true },
  },
});

// ------------------------------------------------------------------ the Column (v0.1-Could)

const antiochus = person({
  id: 'npc-antiochus',
  greet: '(A slight man with marble dust in his grey-flecked curls and a drill bow.) Four hundred soldiers on that spiral, and one of them is my brother. Antiochus of Aphrodisias. Marble remembers everything. That’s the trouble with it.',
  topics: [
    { ask: 'You carved the frieze?', say: 'I carve faces. The master wants a hundred identical faces. The army didn’t have identical faces. Mine is a good one. It’s the third from the left on the fourth turn, and he is not going to survive the recut.' },
    { ask: 'Your brother?', say: 'Philon. A carter, once. He joined the army to see the world and the world gave him a spear. He’s carved in the marble now, and the foreman wants him recut by dawn.', once: true },
  ],
});

const moschus = person({
  id: 'npc-moschus',
  greet: '(A heavy man with a chalk line and a mallet.) Recut by dawn. Those are the orders, and orders don’t have brothers. The dedication waits for no chisel.',
  topics: [{ ask: 'What are you recutting?', say: 'A face. One of four hundred. Too individual, they say. Every face the same height, every shield the same size. That’s discipline. That’s Rome.' }],
});


export default [rixa, rixaLaw, fabae, prima, callistus, dento, tenants, ianuarius, rex, antiochus, moschus];
