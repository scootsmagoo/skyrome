/**
 * Festus' family on the night of the Lemuria (mq-03-lemuria, docs/STORY.md chapter 3): his mother
 * Helpis, his father Fuscus (a veteran who makes lamps), and his twin Gemellus, hiding in Tryphon's
 * back room in his dead brother's cloak. Node ids the quest reacts to:
 *
 *   npc-helpis    stay (tell), tryphon (a clue: where Gemellus works)
 *   npc-gemellus  keyEnd (the key is given in g3 / g4)
 */
import { completed, rotate, stage } from '../../content/talk';
import { defineDialogue, type DialogueContext } from '../types';

const MQ3 = 'mq-03-lemuria';

const giveKey = (c: DialogueContext) => {
  if (!c.hasItem('quest-clavis-cifrae')) c.giveItem('quest-clavis-cifrae');
};

// ------------------------------------------------------------------ Helpis

const helpis = defineDialogue({
  id: 'npc-helpis',
  npcs: ['npc-helpis'],
  priority: 90,
  start: (c) => {
    const s = stage(c, MQ3);
    if (s === 'start' || s === 'family') return 'h0';
    if (s === 'rite') return 'hush';
    if (s === 'clues') return 'c0';
    if (s === 'gemellus' || s === 'warn') return 'g0';
    return completed(c, MQ3) ? 'after' : 'greet';
  },
  nodes: {
    h0: {
      text: '(A grey-haired woman in a dark palla opens the door before you can knock. She looks at your face, then past you, at the empty street.) You’re not from the camp. They’d send two men in good cloaks. You’ve come from the road. Say it.',
      choices: [
        { text: 'Festus is dead. He was killed at the Capena Gate this morning. I was with him.', goto: 'h1' },
        { text: 'He asked me to tell you it was quick. It was.', if: (c) => !!c.flag('promised-festus'), goto: 'h2' },
        { text: 'He was carrying this. A letter to you.', if: (c) => c.hasItem('quest-epistula-festi'), goto: 'h3' },
      ],
    },
    h1: { speaker: 'player', text: '(She sits down on the stair and for a long time says nothing.)', next: 'h4' },
    h2: { text: 'Quick. He would say that. He lied to me to the last, my good boy.', next: 'h4' },
    h3: {
      text: '(She reads it with her lips moving, twice.) “A little jar of Falernian.” He never had the money for Falernian.',
      effects: (c) => {
        c.takeItem('quest-epistula-festi');
        c.setFlag('letter-given', true);
        c.changeDisposition(10);
      },
      next: 'h4',
    },
    h4: {
      text: 'And his brother is gone since the Ides of April. No word, nothing. My husband says the house is full of ghosts. (She looks up at you.) What else did you come for? Nobody walks into the Velabrum at night just to bring bad news.',
      choices: [{ text: 'Festus’ tablet is written in a cipher. His centurion says only Gemellus can read it.', goto: 'h5' }],
    },
    h5: { text: 'The boys’ game. Letters moved along, so their father couldn’t read their notes. Gemellus would know it in his sleep. If anyone could find him.', next: 'h6' },
    h6: {
      text: 'Tonight is the Lemuria. At midnight Fuscus will send the dead out of this house, as his father did. Stay, if you will. Keep silent, whatever you see. Then we’ll talk about my sons.',
      choices: [{ text: 'I’ll stay.', goto: 'stay' }],
    },
    stay: { speaker: 'player', text: '(Helpis goes in to light the lamps. Midnight is still some hours off: press T to wait.)', end: true },
    hush: { text: '(She puts a finger to her lips.) Not now. Not until it’s done.', end: true },
    // ---- after the rite
    c0: {
      text: '(She grips your arm.) You saw it too. At the end of the street. Festus’ cloak. (Her voice drops.) Ghosts don’t need cloaks.',
      choices: [
        { text: 'Where would Gemellus hide, if he were hiding?', goto: 'tryphon' },
        { text: 'I’ll look around the door.', end: true },
      ],
    },
    tryphon: {
      text: 'When he was small, on the roof; Fuscus has looked. Now… he copies books for Tryphon, by the statue of Vertumnus at the Forum end of the Vicus Tuscus. He has a key to the back room. He always had ink on his hands.',
      end: true,
    },
    g0: { text: 'Tryphon’s, by the statue of Vertumnus. Bring him home to me, if you can. Or bring me word that he’s alive.', end: true },
    after: {
      text: (c) => rotate(c, 'helpisAfter', ['There’s a cypress branch on the door for nine days. Then we light the lamps again.', 'Thank you for coming yourself. Festus would have liked that.', 'Gemellus eats now. That’s something.']),
      end: true,
    },
    greet: { text: 'Lamps, two for an as. My husband makes them; I sell them. Mind the step.', end: true },
  },
});

// ------------------------------------------------------------------ Fuscus

const fuscus = defineDialogue({
  id: 'npc-marius-fuscus',
  npcs: ['npc-marius-fuscus'],
  priority: 90,
  start: (c) => {
    const s = stage(c, MQ3);
    if (s === 'rite') return 'rite';
    if (s === 'clues' || s === 'gemellus' || s === 'warn' || completed(c, MQ3)) return 'after';
    return s ? 'before' : 'greet';
  },
  nodes: {
    before: { text: '(An old man with a soldier’s back and lamp-black on his fingers.) My wife will talk to you. I make lamps. I don’t make conversation.', end: true },
    rite: { speaker: 'player', text: '(Fuscus doesn’t look at you. He mustn’t, not tonight.)', end: true },
    after: { text: '(He turns an unfinished lamp over in his hands.) I saw nothing. You saw nothing. The dead went out of my house, as they should.', end: true },
    greet: {
      text: (c) => rotate(c, 'fuscusGreet', ['Lamps, two for an as. They burn as long as anyone’s prayers.', 'Twenty-five years with the Fifth Macedonian, and now I make lamps. Better lamps than the legion made soldiers.']),
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Gemellus

const gemellus = defineDialogue({
  id: 'npc-gemellus',
  npcs: ['npc-gemellus'],
  priority: 95,
  start: (c) => (c.hasItem('quest-clavis-cifrae') || completed(c, MQ3) ? 'later' : 'g0'),
  nodes: {
    g0: {
      text: '(A young man in a brown courier’s cloak too big for him backs against a shelf of scrolls. He has Festus’ face.) Don’t. If you’re one of the knife-men, do it quietly. If you’re from the camp, I’m not him. I’m the other one.',
      choices: [
        { text: 'Your brother is dead. I was with him when it happened.', goto: 'g1' },
        { text: 'He wrote to your mother: “four is still the number.”', if: (c) => !!c.flag('letter-given') || c.hasItem('quest-epistula-festi'), goto: 'g3' },
        { text: 'Festus gave me his tablet before he died. It’s in your cipher. Help me finish what he started.', check: { skill: 'rhetoric', difficulty: 25, pass: 'g3', fail: 'g2' } },
        { text: 'Give me the key, or I tell the whole Velabrum where you sleep.', check: { skill: 'rhetoric', difficulty: 25, kind: 'intimidate', label: 'Intimidate', pass: 'g4', fail: 'g2' } },
      ],
    },
    g1: { text: 'I know. The whole Velabrum knew by noon. (He pulls the brown cloak tighter.) I went to watch the house tonight. I wanted to see her. I didn’t dare come nearer than the end of the street.', next: 'g2' },
    g2: {
      text: 'Why should I trust you? Festus trusted people. Look where it got him.',
      choices: [
        { text: 'Because the man who paid for his death is still out there, and tomorrow is the dedication.', goto: 'g3' },
        { text: 'Because I’m all you’ve got.', goto: 'g3' },
      ],
    },
    g3: {
      text: 'Four. Every letter moved four along; X wraps round to D. We did it as boys so Father couldn’t read our notes. (He takes a child’s wax tablet out of the cloak.) Festus sent me a copy of the dispatch too, in case. Here. I’ve read it. I wish I hadn’t.',
      effects: giveKey,
      next: 'g5',
    },
    g4: {
      text: '…Four along. Four. (He throws you a child’s wax tablet.) Take it and go.',
      effects: (c) => {
        giveKey(c);
        c.changeDisposition(-10);
      },
      next: 'g5',
    },
    g5: {
      text: 'Do you want to know why I hid? In April a man brought me a letter to copy, from the palace. It was in Caesar’s style but not in his hand, and it named the wrong man. He paid too much. Then I saw him watching our door. So I ran.',
      choices: [
        { text: 'Who was the man?', goto: 'g5b', once: true },
        { text: 'What should I tell your mother?', goto: 'g6' },
      ],
    },
    g5b: { text: 'A freedman, by his ring. Ink on his fingers like mine, but expensive ink. I don’t know his name. I’d know his face.', effects: (c) => c.setFlag('gemellus-saw-forger', true), next: 'g5' },
    g6: {
      text: 'What will you tell her?',
      choices: [
        { text: 'That you’re alive. She deserves that.', goto: 'g7', effects: (c) => c.setFlag('gemellus-revealed', true) },
        { text: 'Nothing, if you don’t want me to.', goto: 'g8', effects: (c) => c.setFlag('gemellus-revealed', false) },
      ],
    },
    g7: { text: 'Then I’ll go home. Before she finds me herself.', next: 'keyEnd' },
    g8: { text: 'Thank you. When it’s over, I’ll go home. When it’s over.', next: 'keyEnd' },
    keyEnd: { speaker: 'player', text: '(With the key, Festus’ message reads in three lines. Next: warn Gratus at the strongrooms of Castor.)', end: true },
    later: { text: 'Four is still the number. Go on, before someone sees you with me.', end: true },
  },
});

export default [helpis, fuscus, gemellus];
