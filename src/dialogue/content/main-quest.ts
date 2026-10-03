/**
 * Dialogue for the v0.1 main-quest thread: the courier Festus (mq-01), the carter Dama, the
 * grassatores, the aedituus of Castor (the Lemuria rule, AC-18) and Gavius Silo at the strongrooms
 * (mq-02). Quests react to node ids: festus 'walk' / 'lastWords'; aedituus 'strongrooms' /
 * 'closed'; contact 'tablet' / 'ludus' / 'delivered' / 'drachm'.
 */
import { completed, dusk, objectiveDone, shut, stage } from '../../content/talk';
import { defineDialogue, type DialogueContext } from '../types';

const MQ1 = 'mq-01-madida-capena';
const MQ2 = 'mq-02-tabella';

const festus = defineDialogue({
  id: 'npc-festus',
  npcs: ['npc-festus'],
  start: (c) => {
    const s = stage(c, MQ1);
    if (s === 'start') return c.memory.met ? 'again' : 'greet';
    if (s === 'ambush') return 'fighting';
    if (s === 'tablet') return 'dying';
    return 'dead';
  },
  nodes: {
    greet: {
      text: '(The courier keeps one hand inside his cloak and his eyes on the arches.) You rode in on the marble. Good. Stay by the cart and keep your voice down. Sound carries under the aqueduct.',
      effects: (c) => (c.memory.met = true),
      choices: [
        { text: 'Who are you?', goto: 'who', once: true },
        { text: 'What are you carrying?', goto: 'carrying', once: true },
        { text: 'You keep watching the arches. What is it?', goto: 'warn' },
        { text: 'Let’s walk on, then.', goto: 'walk' },
      ],
    },
    again: {
      text: 'The Forum is up the valley, past the Circus and under the palace. Walk with me as far as the Circus, at least.',
      choices: [
        { text: 'Who are you?', goto: 'who', once: true },
        { text: 'What are you carrying?', goto: 'carrying', once: true },
        { text: 'You keep watching the arches. What is it?', goto: 'warn' },
        { text: 'Let’s walk on.', goto: 'walk' },
      ],
    },
    who: {
      text: 'A courier of the emperor’s post. Eleven days from Brundisium by the Appia, changing horses at every station. Festus. That is all you need, and more than I should say.',
      next: 'again',
    },
    carrying: {
      text: 'Grain accounts. Letters from a governor to his mother. Nothing a man would knife you for. (He doesn’t believe it either.)',
      next: 'again',
    },
    warn: {
      text: 'Two men followed the cart from the tombs. I thought I lost them at the gate. If they come, stay behind me. And if I fall, you take what is in my satchel to Castor. Swear it.',
      choices: [
        { text: 'By Hercules, I swear it.', if: (c) => c.game.standing?.sex !== 'female', goto: 'sworn' },
        { text: 'By Castor, I swear it.', if: (c) => c.game.standing?.sex === 'female', goto: 'sworn' },
        { text: 'I didn’t come to Rome to die for a satchel.', goto: 'walk' },
      ],
    },
    sworn: {
      text: '(He almost smiles.) Then we walk. Keep left, under the arches, where the water drips. Nobody stands in the drip.',
      next: 'walk',
    },
    walk: {
      text: '(He nods at the dark arches ahead and walks on beside the cart.)',
      end: true,
    },
    fighting: {
      text: '(The courier is on his knees, a hand pressed to his side.) Behind you!',
      end: true,
    },
    dying: {
      text: '(Festus lies in the gutter water, very pale. He pushes a sealed tablet into your hands.) Castor… the strongrooms. Not the god’s house. Below it. Tell them… the Column.',
      choices: [
        { text: 'Who did this?', goto: 'whoDid', once: true },
        { text: 'I’ll take it to Castor.', goto: 'lastWords' },
        { text: 'Hold on. I’ll get help.', goto: 'lastWords' },
      ],
    },
    whoDid: {
      text: 'Hired knives… grassatores… paid by a man… a trainer, with ladders of scars on his arms… (He coughs, and there is blood.)',
      choices: [
        { text: 'I’ll take it to Castor.', goto: 'lastWords' },
        { text: 'Hold on. I’ll get help.', goto: 'lastWords' },
      ],
    },
    lastWords: {
      text: 'My purse… for the ferryman. And for you. (His grip loosens. Gaius Marius Festus is dead. You close his eyes.)',
      effects: (c) => {
        if (!c.hasItem('quest-tabella-signata')) c.giveItem('quest-tabella-signata');
        if (!c.hasItem('evectio-festi')) c.giveItem('evectio-festi');
        c.setFlag('mq01.festusLead', true);
      },
      end: true,
    },
    dead: {
      text: '(The courier is dead. Someone has put a coin in his mouth for the ferryman.)',
      end: true,
    },
  },
});

const dama = defineDialogue({
  id: 'npc-dama',
  npcs: ['npc-dama'],
  start: (c) => {
    const s = stage(c, MQ1);
    if (s === 'start') return 'night';
    if (s === 'ambush') return 'hiding';
    if (s === 'tablet' || s === 'forum' || c.hasItem('defixio-capena')) return 'after';
    return 'greet';
  },
  nodes: {
    night: {
      text: 'Last cart before dawn, and they give me marble for the Forum of Trajan. Marble! My axle sings like a Greek. (He jerks his chin at the courier.) That one walked beside me from the tombs. Paid in silver, said nothing. I don’t like men who say nothing.',
      choices: [
        { text: 'Why is everything so wet?', goto: 'madida', once: true },
        { text: 'Why do the carts only come at night?', goto: 'carts', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    madida: {
      text: 'The aqueduct, friend. The water runs right over the gate and leaks on everybody, emperor or carter. Madida Capena, the poets call it: the dripping gate. The poets don’t drive under it.',
      next: 'night',
    },
    carts: {
      text: 'Law. No wheels in the city by day, except for temple carts and builders’ wagons for the emperor’s works. So we come at night and wake the whole city instead. The aediles call that order.',
      next: 'night',
    },
    hiding: {
      text: '(The carter is under his cart with his arms over his head.) I see nothing! I see nothing!',
      end: true,
    },
    after: {
      text: 'Gods below, they cut him like a ham. I saw nothing, you hear? I drive a cart. Carts don’t see.',
      choices: [
        { text: 'You saw them. Who were they?', check: { skill: 'rhetoric', difficulty: 25, pass: 'names', fail: 'nothing' } },
        { text: 'You’ll tell me who they were, or you’ll be under the cart for good.', check: { skill: 'rhetoric', difficulty: 25, kind: 'intimidate', pass: 'names', fail: 'nothing' } },
        { text: 'About this curse tablet with your name on it…', if: (c) => c.hasItem('defixio-capena'), goto: 'curse' },
        { text: 'Vale.', end: true },
      ],
    },
    names: {
      text: '…Fine. The bald one is Calvus. The little one with the ferret face, they call Sorex. They drink at the Cockerel on the Vicus Tuscus when they have money. Now leave me out of it.',
      effects: (c) => c.setFlag('mq01.knowsNames', true),
      end: true,
    },
    nothing: {
      text: 'Nothing. I saw nothing, and I’ll go on seeing it.',
      end: true,
    },
    greet: {
      text: 'Out of the road, I’m resting. Carts by night, sleep by day. That’s the law.',
      choices: [
        { text: 'About this curse tablet with your name on it…', if: (c) => c.hasItem('defixio-capena'), goto: 'curse' },
        { text: 'Vale.', end: true },
      ],
    },
    curse: {
      text: '(He goes grey.) Where did you get that? Mercury’s spring? Give it here. Give it here and I’ll pay. Two denarii! It was that wine-seller from Bovillae, wasn’t it? His wine WAS sour!',
      choices: [
        { text: 'Here. Two denarii.', goto: 'thanks', effects: (c) => (c.takeItem('defixio-capena'), c.receive(2)) },
        { text: 'Keep your money. Burn it.', goto: 'thanks', effects: (c) => (c.takeItem('defixio-capena'), c.changeDisposition(10)) },
        { text: 'I think I’ll keep it.', end: true, effects: (c) => c.changeDisposition(-10) },
      ],
    },
    thanks: {
      text: '(He breaks the lead into pieces with his heel and throws them in the gutter.) My axle will stop squealing now. You watch.',
      end: true,
    },
  },
});

const grassatores = defineDialogue({
  id: 'npc-grassatores',
  npcs: ['npc-sorex', 'npc-calvus'],
  start: (c) => (stage(c, MQ1) === 'ambush' && !c.memory.yielded ? 'threat' : 'beaten'),
  nodes: {
    threat: {
      text: 'Walk away, friend. This is between us and him.',
      end: true,
    },
    beaten: {
      text: '(He is on his knees with his hands up.) Mercy! It was only work! A man paid us!',
      effects: (c) => (c.memory.yielded = true),
      choices: [
        { text: 'Who paid you?', check: { skill: 'rhetoric', difficulty: 25, pass: 'paid', fail: 'lies' } },
        { text: 'Talk, or I finish this.', check: { skill: 'rhetoric', difficulty: 10, kind: 'intimidate', pass: 'paid', fail: 'lies' } },
        { text: 'Get out of my sight.', end: true },
      ],
    },
    paid: {
      text: 'A big man. Trainer’s scars on his arms, like ladders. Not a Ludus Magnus man, they don’t drink with us. He gave us silver at the Cockerel and said: the courier, before dawn, take the satchel. That’s all, by Hercules, that’s all!',
      effects: (c) => c.setFlag('mq01.trainerLead', true),
      end: true,
    },
    lies: {
      text: 'I don’t know! I don’t know anything!',
      end: true,
    },
  },
});

const aedituus = defineDialogue({
  id: 'npc-aedituus-castoris',
  npcs: ['npc-aedituus-castoris'],
  start: (c) => {
    const s = stage(c, MQ2);
    if ((s === 'start' || s === 'aedituus') && shut(c)) return 'closedGreet';
    return 'greet';
  },
  nodes: {
    closedGreet: {
      text: '(The old man leans on his broom.) The god’s house is shut, friend. It is the Lemuria: the doors of every temple stay closed while the dead walk. Come back after the thirteenth.',
      choices: [
        { text: 'I’m looking for the strongrooms.', goto: 'strongrooms' },
        { text: 'I would make an offering to the Twins.', goto: 'offer' },
        { text: 'What is the Lemuria?', goto: 'lemuria', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    greet: {
      text: 'Salve. Tiberius Claudius Hyginus, keeper of the house of the Twins. Castor and Pollux watered their horses at that spring, the evening they brought Rome the news of Lake Regillus.',
      choices: [
        { text: 'I would make an offering to the Twins.', goto: 'offer' },
        { text: 'What do you sell?', end: true, effects: (c) => c.openService('barter') },
        { text: 'Where are the strongrooms?', goto: 'strongrooms' },
        { text: 'What is the Lemuria?', goto: 'lemuria', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    hub: {
      text: 'Anything else? I have steps to sweep, and they are older than both of us.',
      choices: [
        { text: 'I would make an offering to the Twins.', goto: 'offer' },
        { text: 'What do you sell?', end: true, effects: (c) => c.openService('barter') },
        { text: 'Where are the strongrooms?', goto: 'strongrooms' },
        { text: 'Vale.', end: true },
      ],
    },
    strongrooms: {
      text: 'Below. (He points down the side of the podium with his broom.) The lockers open from the street, not from the shrine, so the Lemuria doesn’t shut them. The keeper sits by the door: Gavius Silo. Not a warm man. Bankers keep their gold there, and widows their wills.',
      next: 'hub',
    },
    lemuria: {
      text: 'Three nights in May the dead of every house come home hungry: the ninth, the eleventh, the thirteenth. At midnight the father throws them black beans and bangs the bronze until they go. The gods’ houses close. The Lares at the crossroads stay open; they are used to everybody.',
      next: 'hub',
    },
    offer: {
      text: (c) => (shut(c) ? 'Not today. The Lemuria. The god will not hear you through a shut door, and I will not open it. Pray at a crossroads shrine; the Lares don’t mind the dead.' : 'What will you give the Twins? A honey cake is enough; the gods are not greedy. A denarius is generous.'),
      choices: [
        { text: 'I understand.', if: (c) => shut(c), goto: 'closed' },
        { text: 'A honey cake (libum).', if: (c) => !shut(c), enabled: (c) => c.hasItem('libum'), goto: 'blessed', effects: (c) => void c.game.devotion?.prayAtTemple('temple-castor-pollux', { itemId: 'libum' }) },
        { text: 'A denarius.', if: (c) => !shut(c), enabled: (c) => c.denarii() >= 1, goto: 'blessed', effects: (c) => void c.game.devotion?.prayAtTemple('temple-castor-pollux', { denarii: 1 }) },
        { text: 'Not now.', if: (c) => !shut(c), goto: 'hub' },
      ],
    },
    closed: {
      text: 'And the strongrooms are open, if that is your business. Below, along the side of the podium.',
      next: 'hub',
    },
    blessed: {
      text: '(He takes the offering into the pronaos, says the words, and a little smoke goes up. Outside, a gust lifts the dust in the Forum like hooves.) The Twins ride with you. Go swiftly.',
      end: true,
    },
  },
});

const contact = defineDialogue({
  id: 'npc-castor-contact',
  npcs: ['npc-castor-contact'],
  start: (c) => {
    const s = stage(c, MQ2);
    if (s === 'dusk') {
      if (!c.hasItem('quest-tabella-signata')) return 'noTablet';
      return dusk(c) ? 'dusk' : 'notYet';
    }
    if (completed(c, MQ2)) return 'after';
    if (c.hasItem('quest-tabella-signata')) return 'tablet';
    return 'greet';
  },
  nodes: {
    greet: {
      text: 'Deposits by daylight. Lockers by the month, a denarius a month, paid in advance. The keepers answer for the lockers, not for what is in them.',
      choices: [
        { text: 'Who keeps things here?', goto: 'who', once: true },
        { text: 'I found this coin under the Cloacina grate.', if: (c) => hasDrachm(c), goto: 'drachm' },
        { text: 'Vale.', end: true },
      ],
    },
    who: {
      text: 'Bankers. Widows. Men with wills to hide from their sons. Men who don’t want to keep their papers at home. Why?',
      next: 'greet',
    },
    tablet: {
      text: '(He looks at the seal for a long time and does not touch it.) Where did you get this? … Festus. (He says the name like a man counting.) Not here, not in daylight, and not from a stranger.',
      choices: [
        { text: 'He died in my arms at the Porta Capena. His last word was Castor.', goto: 'ludus' },
        { text: 'Take it now. I’ve carried a dead man’s secret far enough.', check: { skill: 'rhetoric', difficulty: 55, pass: 'list', fail: 'refuse' } },
      ],
    },
    list: {
      text: '(A thin smile.) Festus chose well. No: I still won’t take it in daylight. But I’ll tell you this much for nothing. It isn’t a letter. It’s a list.',
      effects: (c) => c.setFlag('mq02.list', true),
      next: 'ludus',
    },
    refuse: {
      text: 'No.',
      next: 'ludus',
    },
    ludus: {
      text: (c) =>
        `Listen, then. The men who knifed him were hired. ${c.flag('mq01.trainerLead') || c.flag('mq01.festusLead') ? 'A trainer, you say, with ladders of scars.' : 'Someone with silver hired them.'} Trainers drink with gladiators, and gladiators talk in the barracks of the Ludus Magnus. Make yourself useful there: find a name, or at least be seen. Come back after sunset and I will take the tablet. (He looks past you.) Now go.`,
      end: true,
    },
    notYet: {
      text: 'The sun is still up. After sunset. (He doesn’t look at you again.)',
      choices: [
        { text: 'I found this coin under the Cloacina grate.', if: (c) => hasDrachm(c), goto: 'drachm' },
        { text: 'Vale.', end: true },
      ],
    },
    noTablet: {
      text: 'Where is the tablet? … You didn’t lose it. Tell me you didn’t lose it.',
      end: true,
    },
    dusk: {
      text: 'You came back. Good. Give it here.',
      choices: [
        { text: 'Here.', goto: 'delivered' },
        { text: 'First tell me who you are.', goto: 'whoSilo', once: true },
      ],
    },
    whoSilo: {
      text: 'A keeper of lockers. (A pause.) And a man who keeps other things for a man on the Caelian who keeps couriers. That is more than Festus knew about me. Give it here.',
      choices: [{ text: 'Here.', goto: 'delivered' }],
    },
    delivered: {
      text: (c) =>
        `${completed(c, 'lud-01-sacramentum') ? 'I hear a guest put Nereus on his knees this afternoon. Useful, as I said. (He adds coins to the receipt.) ' : ''}Locker fourteen. Here is your receipt; don’t lose it. (Quietly, without looking up:) Tomorrow, the Column.`,
      end: true,
    },
    after: {
      text: 'You again. Lockers by the month, a denarius a… no. For you: ask me one thing.',
      choices: [
        { text: 'What happens tomorrow?', goto: 'tomorrow', once: true },
        { text: 'I found this coin under the Cloacina grate.', if: (c) => hasDrachm(c), goto: 'drachm' },
        { text: 'Vale.', end: true },
      ],
    },
    tomorrow: {
      text: 'Tomorrow the emperor dedicates his Column, the whole city crowds into his Forum, and men like me watch the roofs. Go and sleep.',
      end: true,
    },
    drachm: {
      text: '(He turns the silver coin over twice, and for the first time since you met him he looks worried.) Parthian. Under the Forum. Of course it is. (He counts coins into your hand.) Forget you saw it.',
      end: true,
    },
  },
});

function hasDrachm(c: DialogueContext): boolean {
  return c.hasItem('drachma-parthica') && stage(c, 'misc-venus-cloacina') === 'packet' && !objectiveDone(c, 'misc-venus-cloacina', 'eros');
}

export default [festus, dama, grassatores, aedituus, contact];
