/**
 * Dialogue for the Ludus Magnus (lud-01-sacramentum): the procurator (sign on as a paid guest or
 * swear the oath, the explicit crossroad of GDD §9.1), Glaucus the doctor (starts each practice
 * bout, trains Blades), Bassus at the armory (rudis plus scutum or parmula), Eudemus the medicus,
 * Nereus (missio), and the recruits Pullus and Callinicus.
 * Node ids the quest reacts to: procurator 'offer' / 'signedGuest' / 'signedOath' / 'paid'; Bassus
 * 'issueScutum' / 'issueParmula'; Glaucus 'fight1'…'fight3'; Nereus 'mitte' / 'iugula'; Eudemus 'patched'.
 */
import { completed, female, objectiveDone, outcome, questVar, running, stage, treat } from '../../content/talk';
import { defineDialogue, type DialogueContext } from '../types';

const LUD = 'lud-01-sacramentum';
const signed = (c: DialogueContext) => objectiveDone(c, LUD, 'sign');
const bout = (c: DialogueContext) => Number(questVar(c, LUD, 'bout')) || 0;

const procurator = defineDialogue({
  id: 'npc-attius-celer',
  npcs: ['npc-attius-celer'],
  start: (c) => {
    const s = stage(c, LUD);
    if (s === 'purse') return 'purse';
    if (s === 'start' && !signed(c)) return 'greet';
    if (!running(c, LUD) && !completed(c, LUD)) return 'greet';
    return 'busy';
  },
  nodes: {
    greet: {
      text: 'Sextus Attius Celer, procurator of the Ludus Magnus, the emperor’s school. If you came to gawp, the balconies cost an as. If you came to fight, you are a fool or you are broke.',
      choices: [
        { text: 'I want to fight.', goto: 'offer' },
        { text: 'I’m looking for a man who hires knives.', goto: 'knives', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    knives: {
      text: 'Then you are in the wrong building, or the right one. Half the men in here could hire out a knife. Sign on and ask in the barracks. Nobody talks to tourists.',
      choices: [
        { text: 'Then I’ll sign on.', goto: 'offer' },
        { text: 'Vale.', end: true },
      ],
    },
    offer: {
      text: (c) =>
        `${female(c) ? 'A woman? It is legal, it is rare, and the crowd will either love you or eat you. Gladiatrices fill the benches. ' : ''}Two ways in. As a paid guest: practice bouts with practice arms, a purse by the crowd’s mood, and you walk out a free citizen with your good name. Or you swear the oath. “To be burned, bound, beaten and killed by the sword.” Then you belong to the school: better bouts, ranks, a share of the glory. And Infamia for life. No gold ring, ever, and decent people cross the street.`,
      choices: [
        { text: 'As a paid guest.', goto: 'signedGuest' },
        { text: 'I’ll swear the oath. [Infamia +20; join the Ludus as a tiro; it blocks equestrian rank]', goto: 'oathConfirm' },
        { text: 'Let me think about it.', end: true },
      ],
    },
    oathConfirm: {
      text: 'Say it after me, then. “Uri, vinciri, verberari, ferroque necari.” To be burned, bound, beaten and killed with the sword. There is no unsaying it.',
      choices: [
        { text: '“Uri, vinciri, verberari, ferroque necari.”', goto: 'signedOath', effects: (c) => void c.game.factions?.join('ludus-magnus') },
        { text: 'No. As a guest.', goto: 'signedGuest' },
      ],
    },
    signedGuest: {
      text: 'A guest, then. Your name on the roll, your purse at the end. Bassus at the armory will give you a rudis and a shield. Glaucus will try to kill you with them. Don’t let him.',
      effects: (c) => c.setFlag('lud.guest', true),
      end: true,
    },
    signedOath: {
      text: 'Then you are ours. Here: twenty denarii, the oath money. Spend it before Glaucus finds out you have it. Bassus at the armory, then Glaucus at the posts.',
      effects: (c) => c.receive(20),
      end: true,
    },
    busy: {
      text: 'Bouts are Glaucus’ business; money is mine. Something to buy? Arena kit, at the emperor’s prices, which are not low.',
      choices: [
        { text: 'Show me your wares.', end: true, effects: (c) => c.openService('barter') },
        { text: 'Vale.', end: true },
      ],
    },
    purse: {
      text: (c) => `(He counts on an abacus without looking at it.) Three bouts, ${questVar(c, LUD, 'spared') === true ? 'missio granted to the crowd’s liking, ' : ''}the balconies in a good mood. ${Number(questVar(c, LUD, 'losses')) > 0 ? 'Less the doctor’s time. ' : ''}Here is your purse. The armory wants its kit back.`,
      choices: [{ text: 'My thanks.', goto: 'paid' }],
    },
    paid: {
      text: 'Come back when there are real games. Guests who draw a crowd draw a purse.',
      end: true,
    },
  },
});

const glaucus = defineDialogue({
  id: 'npc-glaucus',
  npcs: ['npc-glaucus'],
  start: (c) => {
    const s = stage(c, LUD);
    if (bout(c)) return 'fighting';
    if (s === 'start') return 'notSigned';
    if (s === 'armory') return 'noKit';
    if (s === 'bout1') return 'ready1';
    if (s === 'bout2') return 'ready2';
    if (s === 'bout3') return 'ready3';
    if (s === 'missio') return 'missioHint';
    if (s === 'purse' || completed(c, LUD)) return 'after';
    return 'greet';
  },
  nodes: {
    greet: {
      text: '(A grey-haired man with a face like a mended pot watches the recruits hack at the posts.) Glaucus. I teach men to die well, and some of them learn to live instead. What do you want?',
      choices: [
        { text: 'Teach me. [Training: Blades]', end: true, effects: (c) => c.openService('train') },
        { text: 'Who are you?', goto: 'who', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    who: {
      text: 'Thracian. Born by the Hebrus, sold at nine, on the sand at fifteen. Forty-two bouts. The emperor gave me the wooden sword at the Dacian triumph games, and now I teach his school to hold a shield.',
      next: 'greet',
    },
    notSigned: {
      text: 'Not on the roll, not on my sand. The procurator’s office is by the gate.',
      end: true,
    },
    noKit: {
      text: 'Practice arms only on my sand. Bassus at the armory. Go.',
      end: true,
    },
    ready1: {
      text: 'Pullus. A recruit, like you: good arms, no head. Practice arms knock you down, they don’t cut. Block, then hit him while his arm is out. Ready?',
      choices: [
        { text: 'Ready.', enabled: (c) => c.hasItem('rudis'), goto: 'fight1' },
        { text: 'Teach me first. [Training: Blades]', end: true, effects: (c) => c.openService('train') },
        { text: 'Not yet.', end: true },
      ],
    },
    ready2: {
      text: 'Callinicus. A thraex: the curved sica comes round your shield, low. His parmula is small and he makes it big. Don’t chase him. Ready?',
      choices: [
        { text: 'Ready.', enabled: (c) => c.hasItem('rudis'), goto: 'fight2' },
        { text: 'Not yet.', end: true },
      ],
    },
    ready3: {
      text: '(He hands you a scrap of papyrus.) A recruit wrote these notes. Read them. Then go and get netted. Nereus has won thirty-one times with real steel; with wood he’s worse, because he’s bored. Ready?',
      effects: (c) => {
        if (!c.memory.gaveNotes) {
          c.memory.gaveNotes = true;
          c.giveItem('libellus-tironis');
        }
      },
      choices: [
        { text: 'Ready.', enabled: (c) => c.hasItem('rudis'), goto: 'fight3' },
        { text: 'Not yet.', end: true },
      ],
    },
    fight1: { text: 'Pullus! A guest for you. Begin!', end: true },
    fight2: { text: 'Callinicus! Begin!', end: true },
    fight3: { text: 'Nereus! Your guest. Begin!', end: true },
    fighting: {
      text: 'Fight! Don’t talk to me, talk to him!',
      end: true,
    },
    missioHint: {
      text: 'He’s asking. Look at the balconies, look at him, and decide. Your bout, your call.',
      end: true,
    },
    after: {
      text: (c) => {
        if (outcome(c, LUD) === 'done' || stage(c, LUD) === 'purse') {
          if (questVar(c, LUD, 'spared') === true) return 'You gave him missio. Good. The crowd will remember that, and so will he.';
          if (questVar(c, LUD, 'spared') === false) return 'You’d have cut his throat with a wooden sword. The balconies loved it. I didn’t.';
        }
        return 'Still standing. That puts you ahead of most guests.';
      },
      choices: [
        { text: 'Teach me. [Training: Blades]', end: true, effects: (c) => c.openService('train') },
        { text: 'The knife-men at the Porta Capena were paid by a trainer with scarred arms.', if: (c) => !!(c.flag('mq01.trainerLead') || c.flag('mq01.festusLead')) || running(c, 'mq-02-tabella'), goto: 'lead', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    lead: {
      text: '(He stops watching the posts.) Scarred like ladders? That’s half the trainers in Rome. But there’s one I threw out at the Kalends. Not one of mine: from the Dacian school next door. Came in to sell knives to my boys. If he hires grassatores, he does it on the Vicus Tuscus, in the Cockerel. (He goes back to the posts.) You didn’t hear it from me.',
      effects: (c) => c.setFlag('lud01.lead', true),
      end: true,
    },
  },
});

const bassus = defineDialogue({
  id: 'npc-bassus',
  npcs: ['npc-bassus'],
  start: (c) => {
    const s = stage(c, LUD);
    if (s === 'armory') return 'issue';
    if (s && ['bout1', 'bout2', 'bout3'].includes(s) && !c.hasItem('rudis')) return 'reissue';
    return 'greet';
  },
  nodes: {
    issue: {
      text: 'New guest? Rudis first. (He hands you a wooden sword worn smooth by a hundred hands.) It’s wood, but it will break your teeth. Now the shield. A scutum: the big curved one, slow and safe. Or a parmula: the little thraex square, quick and dangerous. Choose.',
      choices: [
        { text: 'The scutum.', goto: 'issueScutum' },
        { text: 'The parmula.', goto: 'issueParmula' },
      ],
    },
    reissue: {
      text: 'Lost your kit at the gate? It came back to me. It always does. Scutum or parmula?',
      choices: [
        { text: 'The scutum.', goto: 'issueScutum' },
        { text: 'The parmula.', goto: 'issueParmula' },
      ],
    },
    issueScutum: {
      text: 'Sensible. Sensible men live longer and bore the crowd. Bring it back with all its pieces.',
      end: true,
    },
    issueParmula: {
      text: 'Brave, or foolish. Same thing on the sand. Bring it back with all its pieces.',
      end: true,
    },
    greet: {
      text: 'Bassus, armory. Nothing leaves without my mark, and nothing comes back without a dent.',
      choices: [
        { text: 'What is the rudis for, really?', goto: 'rudis', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    rudis: {
      text: 'Practice, mostly. But when a man has fought long enough and well enough, the emperor hands him one in the arena, and then he is free. A wooden sword is the most valuable thing in this building.',
      next: 'greet',
    },
  },
});

const eudemus = defineDialogue({
  id: 'npc-eudemus',
  npcs: ['npc-eudemus'],
  start: (c) => (stage(c, LUD) === 'purse' && !c.memory.patchedFree ? 'free' : 'greet'),
  nodes: {
    free: {
      text: 'Sit. Show me. (He probes, tuts and binds.) Nothing broken. Bruises like a painted wall. This one is on the emperor. Now rest until evening: wait somewhere quiet, and drink water, not wine.',
      effects: (c) => {
        c.memory.patchedFree = true;
        treat(c);
      },
      next: 'patched',
    },
    greet: {
      text: 'Eudemus, medicus of the school. I sew men up so that they can be cut again. You need something?',
      choices: [
        { text: 'Treat my wounds. [2 den.]', enabled: (c) => c.denarii() >= 2, goto: 'patched', effects: (c) => (c.pay(2), treat(c)) },
        { text: 'I want bandages and remedies.', end: true, effects: (c) => c.openService('barter') },
        { text: 'Where did you learn medicine?', goto: 'medicine', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    medicine: {
      text: 'Alexandria, then Pergamon, then here, because the emperor’s gladiators pay better than philosophers. Celsus says a surgeon needs a steady hand and a heart without pity. I have the hand.',
      next: 'greet',
    },
    patched: {
      text: 'There. Keep it clean. If it smells, come back.',
      end: true,
    },
  },
});

const nereus = defineDialogue({
  id: 'npc-nereus',
  npcs: ['npc-nereus'],
  start: (c) => {
    const s = stage(c, LUD);
    if (s === 'missio') return 'kneeling';
    if (s === 'bout3' && bout(c)) return 'fighting';
    if (questVar(c, LUD, 'spared') === true) return 'friendly';
    if (questVar(c, LUD, 'spared') === false) return 'cold';
    return 'greet';
  },
  nodes: {
    kneeling: {
      text: '(Nereus is down on one knee, his net trampled into the sand, one finger raised. The balconies roar, half “Mitte!”, half “Iugula!”. He looks up at you and waits.)',
      choices: [
        { text: '“Mitte!” Let him go. [Grant missio]', goto: 'mitte' },
        { text: '“Iugula!” [Refuse missio]', goto: 'iugula' },
      ],
    },
    mitte: {
      text: '(The balconies cheer. Nereus gets up slowly, picks up his net and touches it to his forehead in your direction.) Thirty-one and one. I will remember the one.',
      effects: (c) => c.changeDisposition(10),
      end: true,
    },
    iugula: {
      text: '(You raise the wooden sword. Glaucus is between you before it comes down.) “Practice arms, tiro! This is a lusio, not a butcher’s yard!” (Nereus looks at you for a long moment, and spits in the sand.)',
      effects: (c) => c.changeDisposition(-10),
      end: true,
    },
    fighting: {
      text: '(The net turns once, twice…)',
      end: true,
    },
    greet: {
      text: '(He doesn’t stop coiling the net.) Fish come to the net. You came to the Ludus. Same thing.',
      choices: [
        { text: 'Thirty-one wins?', goto: 'wins', once: true },
        { text: 'How do you beat a net?', goto: 'net', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    wins: {
      text: 'Thirty-one. Two missio. One I don’t talk about. The crowd loves a retiarius when he wins and hates him when he loses: no helmet, so they see your face either way.',
      next: 'greet',
    },
    net: {
      text: 'You don’t beat the net. You beat the man before he throws it. Watch the hand. Step on the second turn. (He smiles.) Or don’t, and I’ll see you on the ground.',
      next: 'greet',
    },
    friendly: {
      text: 'You. The guest who let me walk off. Come back when the Ludus fights for real; I’ll ask them to pair us.',
      choices: [
        { text: 'The knife-men at the Porta Capena: who hires them?', goto: 'lead', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    lead: {
      text: 'Ask at the Cockerel on the Vicus Tuscus. The grassatores drink there, and so does a big man from the Dacian school who isn’t welcome here any more. They sleep in the burned taberna down the street.',
      effects: (c) => (c.setFlag('lud01.lead', true), c.setFlag('hideout.known', true)),
      end: true,
    },
    cold: {
      text: '(He turns his back on you and goes on coiling the net.)',
      end: true,
    },
  },
});

const recruits = defineDialogue({
  id: 'npc-ludus-gladiators',
  npcs: ['npc-pullus', 'npc-callinicus'],
  start: (c) => (c.npcId === 'npc-pullus' ? 'pullus' : 'callinicus'),
  nodes: {
    pullus: {
      text: (c) => (objectiveDone(c, LUD, 'pullus') ? 'You hit like a mule kicks. No hard feelings. Ow.' : 'Pullus. Three weeks a tiro. My arm is lead. Glaucus says it will be iron by the Kalends, if I live.'),
      choices: [
        { text: 'Why did you sign the oath?', goto: 'pullusWhy', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    pullusWhy: {
      text: 'Debts. My father’s, then mine. Here they feed you twice a day and nobody comes for the rent. And if I live five years, I walk out with a name. Who in the Subura has a name?',
      end: true,
    },
    callinicus: {
      text: (c) => (objectiveDone(c, LUD, 'callinicus') ? 'Low and round, I said. You listened. Most don’t.' : 'Callinicus, thraex. The parmularii at the Meta Sudans sing my name. Badly.'),
      choices: [
        { text: 'There’s a brawl brewing at the Meta Sudans over you.', if: (c) => running(c, 'misc-meta-sudans-rixa'), goto: 'rixa', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    rixa: {
      text: 'Over me? (He laughs.) Tell Hilarus to save his voice for the arena. And tell Crispus that Ferox is slow on the left.',
      end: true,
    },
  },
});

export default [procurator, glaucus, bassus, eudemus, nereus, recruits];
