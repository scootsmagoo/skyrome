/**
 * mq-03-lemuria "Beans for the Dead" (docs/STORY.md chapter 3; GDD §10.3 #3; CONTENT.md §3.1.3).
 * Main quest, the night of 11 May (the Lemuria): Festus' family, the midnight rite, his twin.
 *
 *   start     go to the Marii's house in the Velabrum                                   → family
 *   family    tell Helpis, Festus' mother; she asks you to stay for the rite            → rite
 *   rite      wait for midnight at the house; the rite plays; a figure in Festus' cloak → clues
 *   clues     two of three: the beans gathered up, the missing cloak, ink on the doorpost → gemellus
 *   gemellus  find Gemellus in Tryphon's back room on the Vicus Tuscus; get the key       → warn
 *   warn      the message read: warn Gratus at the strongrooms                            → done
 *   done      "Tomorrow, the Column." (Act I continues with mq-04, not yet built)
 *
 * The rite is Ovid's (Fasti 5.429–44): barefoot, hands washed, nine handfuls of black beans thrown
 * behind without looking, bronze clashed, "Manes exite paterni!". The ghost has a natural
 * explanation (Gemellus in his brother's cloak), and one detail is left unexplained in the journal
 * (GDD §2.4). Hooks: npc-helpis 'stay' / 'tryphon', npc-gemellus 'keyEnd' (and the item
 * 'quest-clavis-cifrae'), npc-gratus 'warnEnd', 'content:interact' for the three clues.
 */
import { hint, holdPose, isLemuriaMidnight, placeExamine, release, removeExamine, runner, say } from '../../content/director';
import { giveItem, hasItem } from '../../content/questkit';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'mq-03-lemuria';

const CLUES = [
  { id: 'clue-beans', at: 'insula-mariorum', verb: 'Look at', label: 'The doorstep', height: 0.4, offset: { x: 1.2, z: 0.6 } },
  { id: 'clue-cloak', at: 'insula-mariorum', verb: 'Look at', label: 'An empty peg by the door', height: 1.5, offset: { x: -1.4, z: 0.4 } },
  { id: 'clue-ink', at: 'insula-mariorum', verb: 'Look at', label: 'The doorpost', height: 1.4, offset: { x: 0.4, z: -1.1 } },
] as const;

const CLUE_TEXT: Record<string, string> = {
  'clue-beans': 'The beans Fuscus threw are gone from the doorstep: picked up, carefully, one by one. Ghosts are supposed to eat them where they lie.',
  'clue-cloak': 'An empty peg. Helpis says Festus’ old brown cloak has hung there since the Saturnalia. It is gone.',
  'clue-ink': 'Ink on the doorpost, at a man’s shoulder: the smudge of a hand that holds a pen all day.',
};

function placeClues(q: QuestContext) {
  for (const c of CLUES) if (!q.vars[c.id]) placeExamine(q.game, c);
}

function clearClues() {
  for (const c of CLUES) removeExamine(c.id);
}

/** The rite: Fuscus at his door, the beans, the bronze, and a figure at the end of the street. */
function playRite(q: QuestContext) {
  if (q.vars.riteStarted) return;
  q.vars.riteStarted = true;
  holdPose(q.game, 'npc-marius-fuscus', 'pray');
  holdPose(q.game, 'npc-helpis', 'stand');
  const lines: [number, string, string][] = [
    [0, 'Fuscus', '(Barefoot, he makes the sign against the dead: thumb between his fingers.)'],
    [5, 'Fuscus', '(He washes his hands at the basin, three times.)'],
    [10, 'Fuscus', 'Haec ego mitto; his redimo meque meosque fabis.'],
    [15, 'Fuscus', '(He throws black beans behind him without looking: once, twice… nine times.)'],
    [21, 'Fuscus', 'These I send. With these beans I redeem me and mine.'],
    [27, 'Fuscus', '(He clashes a bronze pot, over and over.)'],
    [33, 'Fuscus', 'Manes exite paterni! Ghosts of my fathers, go out!'],
  ];
  const run = (fn: () => void, s: number) => (typeof setTimeout === 'function' ? setTimeout(fn, s * 1000) : fn());
  for (const [t, who, text] of lines) run(() => q.stage === 'rite' && say(q.game, who, text, 5), t);
  // At the ninth throw: a figure in Festus' brown cloak at the end of the street, gone at once.
  run(() => {
    if (q.stage !== 'rite') return;
    runner(q.game, 'grassator', 'insula-mariorum', 'taberna-tryphonis', { id: 'mq03-figure', npc: 'npc-gemellus', name: 'A figure in a brown cloak' }, { x: 9, z: 3 }, 8);
    q.notify('Someone in a brown courier’s cloak stands at the end of the street, and then is gone.');
  }, 18);
  run(() => {
    if (q.stage !== 'rite') return;
    release(q.game, 'npc-marius-fuscus');
    release(q.game, 'npc-helpis');
    q.completeObjective('wait');
  }, 40);
}

function tryRite(q: QuestContext) {
  if (q.stage === 'rite' && isLemuriaMidnight(q.game) && q.game.locations?.isInside?.('insula-mariorum')) playRite(q);
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Beans for the Dead',
  latin: 'Fabae Lemurum',
  category: 'main',
  giver: 'npc-gratus',
  summary: 'Festus’ tablet is in a cipher only his missing twin can read. On the night of the Lemuria, go to his family in the Velabrum.',
  stages: {
    start: {
      journal: 'Gratus needed the key to Festus’ cipher, and only his twin, Gemellus, would know it. And I had promised Festus I would tell his mother. The Marii, lamp-makers, live in the Velabrum, behind the Vicus Tuscus.',
      objectives: [{ id: 'go', text: 'Go to the house of the Marii in the Velabrum', target: { kind: 'location', id: 'insula-mariorum' } }],
      onEnter: (q) => {
        if (q.game.locations?.isInside?.('insula-mariorum')) q.completeObjective('go');
      },
      next: 'family',
    },
    family: {
      journal: 'Festus’ mother, Helpis, opened the door before I knocked. She knew from my face.',
      objectives: [{ id: 'tell', text: 'Tell Festus’ mother what happened', target: { kind: 'npc', id: 'npc-helpis' } }],
      next: 'rite',
    },
    rite: {
      journal: 'Helpis asked me to stay for the rite at midnight and to keep silent, whatever I saw. Gemellus had been gone since the Ides of April; she said his father thought the house was full of ghosts.',
      objectives: [{ id: 'wait', text: 'Stay at the house for the midnight rite (press T to wait)', target: { kind: 'location', id: 'insula-mariorum' } }],
      onEnter: (q) => {
        q.vars.riteStarted = false;
        if (isLemuriaMidnight(q.game)) tryRite(q);
        else hint(q.game, 'Press T to wait until midnight. Stay at the house.');
      },
      next: 'clues',
    },
    clues: {
      journal: 'At midnight Fuscus walked barefoot through his door, washed his hands, and threw black beans behind him nine times without looking back: “These I send; with these beans I redeem me and mine.” Then he clashed bronze and called on the ghosts of his fathers to go out. And at the end of the street, for a moment, I saw Festus’ brown cloak. Fuscus would not speak of it. But ghosts, I thought, do not usually leave marks.',
      objectives: [{ id: 'clues', text: 'Find out who the figure was: look around the house', count: 2, target: { kind: 'location', id: 'insula-mariorum' } }],
      onEnter: (q) => placeClues(q),
      next: 'gemellus',
    },
    gemellus: {
      journal: 'Not a ghost: a man in Festus’ cloak, with ink on his hands. Gemellus copies books for Tryphon, by the statue of Vertumnus at the Forum end of the Vicus Tuscus, and he has a key to the back room.',
      objectives: [{ id: 'key', text: 'Find Gemellus in Tryphon’s bookshop on the Vicus Tuscus', target: { kind: 'npc', id: 'npc-gemellus' } }],
      onEnter: (q) => {
        clearClues();
        if (hasItem(q, 'quest-clavis-cifrae')) q.completeObjective('key');
      },
      next: 'warn',
    },
    warn: {
      journal: 'Gemellus gave me the key: every letter moved four places along, the game the twins played as boys. Festus’ message was three lines. IN DEDICATIONE ARCVS IN LOCO ALTO. EX ORIENTE PECVNIA PER HORREA PIPERATARIA. MONE GRATVM. “At the dedication, a bow in the high place. Money from the East, through the Pepper Warehouses. Warn Gratus.” The dedication was tomorrow.',
      objectives: [{ id: 'warn', text: 'Warn Gratus at the strongrooms of Castor', target: { kind: 'npc', id: 'npc-gratus' } }],
      onEnter: (q) => {
        if (!hasItem(q, 'quest-nuntius-festi')) giveItem(q, 'quest-nuntius-festi');
      },
      next: 'done',
    },
    done: {
      journal: 'Gratus read the message twice and said the high place was the Column itself. Tomorrow Caesar dedicates it, and stands at its foot before all Rome. He would put men on every roof, and I was to be in the Forum of Trajan at dawn. One thing still troubles me. Gemellus swore he never came nearer the house than the end of the street, and I believe him. Somebody gathered the beans from the doorstep, one by one. I did not ask Fuscus.',
      onEnter: (q) => {
        clearClues();
      },
      end: 'complete',
    },
  },
  triggers: {
    'quest:completed': (q, e) => {
      if (e.questId === 'mq-02-tabella') q.start();
    },
  },
  on: {
    'location:entered': (q, e) => {
      if (e.locationId !== 'insula-mariorum') return;
      if (q.stage === 'start') q.completeObjective('go');
      tryRite(q);
    },
    'time:hour': (q) => tryRite(q),
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-helpis' && e.nodeId === 'stay') q.completeObjective('tell');
      if (e.dialogueId === 'npc-helpis' && e.nodeId === 'tryphon' && q.stage === 'clues' && !q.vars.tryphon) {
        q.vars.tryphon = true;
        q.progress('clues');
      }
      if (e.dialogueId === 'npc-gratus' && e.nodeId === 'warnEnd') q.completeObjective('warn');
    },
    'content:interact': (q, e) => {
      const c = CLUES.find((x) => x.id === e.id);
      if (!c || q.stage !== 'clues' || q.vars[c.id]) return;
      q.vars[c.id] = true;
      q.notify(CLUE_TEXT[c.id]);
      q.progress('clues');
    },
    'item:added': (q, e) => {
      if (e.itemId === 'quest-clavis-cifrae') q.completeObjective('key');
    },
    'save:loaded': (q) => {
      if (q.stage === 'clues') placeClues(q);
    },
  },
  rewards: { denarii: 40, skillXp: ['rhetoric'] },
});
