/**
 * Dialogue for the colourful Romans of the v0.1 core: Juvenal (a Rhetoric check: make him say one
 * good thing about Rome), a Vestal, the senator Vettius (a Rhetoric check for a patron, the seed of
 * the Clientela line), and a shared graph for the lictor, the haruspex (a paid quest hint), the
 * Cynic, the crier, the schoolmaster, the matron, the old soldier, the awning sailor, the Dacian
 * captive, the recruiting centurion and the dice idler.
 */
import { female, rotate } from '../../content/talk';
import { defineDialogue, type DialogueContext } from '../types';

/** Juvenal Satire 3, paraphrased (docs/research/society.md §7.7). */
const JUVENAL = [
  'Fires, falling roofs, a thousand dangers in this savage city, and poets reciting in August.',
  'What can I do in Rome? I cannot lie. I cannot praise a bad book and beg for a copy. I cannot read the stars of a man’s father for him.',
  'Here everything costs money. Even a nod from a great man’s door-slave costs a tip.',
  'Most invalids here die of sleeplessness. Who can sleep in a rented room, with the carts all night and the drovers cursing?',
  'Your rent for a year in this dark hole would buy a house at Sora, with a garden.',
  'Make your will before you go out to dinner. Every open window at night is a death waiting for you.',
];

const juvenal = defineDialogue({
  id: 'npc-iuvenalis',
  npcs: ['npc-iuvenalis'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: (c) =>
        (c.game.time?.hour ?? 12) < 8
          ? '(A thin man with a sour mouth watches a loaded cart go out through the gate.) My friend is leaving Rome for Cumae. A sensible man. The only one. What do you want?'
          : '(A thin man with a sour mouth looks up from the steps.) Another one. Everybody in this city wants something. What do you want?',
      choices: [
        { text: 'What’s wrong with Rome?', goto: 'complaint' },
        { text: 'Rome is the greatest city on earth. Say one good thing about it.', check: { skill: 'rhetoric', difficulty: 40, pass: 'good', fail: 'bad' }, once: true },
        { text: 'Are you a poet?', goto: 'poet', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    complaint: {
      text: (c) => rotate(c, 'complaint', JUVENAL),
      choices: [
        { text: 'Go on.', goto: 'complaint' },
        { text: 'Enough.', goto: 'greet' },
      ],
    },
    good: {
      text: '(He thinks for a long time.) …The figs. The figs are good. (He pushes a scrap of papyrus at you.) Take this before I burn it. If you can find anything good in it, you’re a better poet than I am.',
      effects: (c) => {
        if (!c.hasItem('schedae-iuvenalis')) c.giveItem('schedae-iuvenalis');
        c.changeDisposition(10);
      },
      end: true,
    },
    bad: {
      text: 'There. You see? You can’t either.',
      next: 'greet',
    },
    poet: {
      text: 'A poet? I am a man who writes down what everyone sees and nobody says. They will read me when I’m dead, and not before. Probably not then either.',
      next: 'greet',
    },
  },
});

const vestal = defineDialogue({
  id: 'npc-vestalis-laeta',
  npcs: ['npc-vestalis-laeta'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: '(A woman in white, her hair bound in the six braids and woollen bands of Vesta.) Peace be on you. Do you need something of the goddess?',
      choices: [
        { text: 'What do the Vestals do?', goto: 'duty', once: true },
        { text: 'Is it true a condemned man is spared if he meets a Vestal?', goto: 'spared', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    duty: {
      text: 'We keep the fire of Rome burning in the round house of Vesta, and it does not go out. We keep the wills of great men, and the sacred things that no one sees. On the Vestalia the storeroom opens to the matrons, barefoot, and to no one else.',
      next: 'greet',
    },
    spared: {
      text: 'If it is truly by chance, yes. Truly. (She looks at you steadily.) It is not something that can be arranged.',
      effects: (c) => c.setFlag('vestalis.asked', true),
      next: 'greet',
    },
  },
});

const vettius = defineDialogue({
  id: 'npc-patron-vettius',
  npcs: ['npc-patron-vettius'],
  start: () => 'greet',
  nodes: {
    greet: {
      text: '(An old senator with a face like a walnut, a dozen clients trailing behind him.) Sextus Vettius Crispinus. If you are another client, the salutatio is at dawn at my house in the Carinae, and you are late. If you are not, what do you want?',
      choices: [
        { text: 'What do you think of the war?', goto: 'war', once: true },
        { text: 'I am looking for a patron.', check: { skill: 'rhetoric', difficulty: 55, pass: 'patron', fail: 'notYet' }, once: true },
        { text: 'Vale.', end: true },
      ],
    },
    war: {
      text: 'Armenia is the pretext and Parthia is a sea. Crassus thought it would pay for itself, too; his head ended up as a prop in a Greek play. But the princeps is a soldier and the Senate is a choir. We will sing the vows on the Capitol and pay for it all.',
      next: 'greet',
    },
    patron: {
      text: (c) => `Are you? (He looks at you properly for the first time.) Come to the salutatio in proper dress, ${female(c) ? 'a stola and a palla' : 'a toga'}, three mornings running, and we shall see. I do not take clients off the street. But I might take one off the Forum.`,
      effects: (c) => c.setFlag('clientela.vettius', true),
      end: true,
    },
    notYet: {
      text: 'Everybody is. (He walks on, and the clients close behind him like water.)',
      end: true,
    },
  },
});

/** A paid hint (§7.2: a haruspex reading points at the next step of the tracked quest). */
function haruspicy(c: DialogueContext): string {
  const q = c.game.quests;
  const id = q?.tracked;
  const next = id ? q.objectives(id).find((o) => o.active && !o.done && !o.optional) : undefined;
  if (!next) return '(He reads the liver for a long time.) Calm. Nothing is asked of you today. Go to the baths.';
  return `(He turns the liver to the light and traces a vein with his finger.) The left lobe is swollen toward the place of the gods of the road. The gods say: “${next.text}.” And soon. (He wipes his hands.) Two denarii well spent.`;
}

const romans = defineDialogue({
  id: 'npc-romans',
  npcs: ['npc-lictor-vestae', 'npc-arruns', 'npc-hippias', 'npc-cerdo', 'npc-eutyches', 'npc-caecilia-paulina', 'npc-mamercus', 'npc-tychicus', 'npc-bitus', 'npc-flavius-draco', 'npc-gnatho'],
  start: (c) => c.npcId.replace(/^npc-/, ''),
  nodes: {
    'lictor-vestae': {
      text: 'Step aside for the Virgin of Vesta, citizen. Whatever you want, want it from a distance.',
      end: true,
    },
    arruns: {
      text: 'Arruns, haruspex, of a Tarquinian family older than your gods. A liver read, two denarii. A sheep’s, not yours.',
      choices: [
        { text: 'Read the omens for me. [2 den.]', enabled: (c) => c.denarii() >= 2, goto: 'liver', effects: (c) => c.pay(2) },
        { text: 'Sell me an amulet.', end: true, effects: (c) => c.openService('barter') },
        { text: 'Vale.', end: true },
      ],
    },
    liver: {
      text: haruspicy,
      end: true,
    },
    hippias: {
      text: 'You! Yes, you, in the good sandals. What do you own?',
      choices: [
        { text: 'My clothes. My purse. My sword.', goto: 'owned' },
        { text: 'Nothing, Cynic. Same as you.', goto: 'nothing' },
      ],
    },
    owned: {
      text: 'No. They own you. Throw the purse in the Tiber and be free. (He holds out his hand.) Or throw it to me; I’m closer.',
      end: true,
    },
    nothing: {
      text: '(He laughs, delighted.) Then sit in the sun with me, brother, and let the senators walk round us.',
      end: true,
    },
    cerdo: {
      text: 'Hear, citizens! (He drops to a normal man’s voice.) You want the details? Tomorrow at the first hour, the Column: the emperor, then the Senate, then the priests, then the rest of us behind the soldiers. Venus Genetrix gets her temple back the same day. Bring a stool.',
      end: true,
    },
    eutyches: {
      text: 'Here to learn your letters? No? Then move, you’re blocking the light.',
      choices: [
        { text: 'What are you teaching them?', goto: 'virgil' },
        { text: 'Vale.', end: true },
      ],
    },
    virgil: {
      text: 'Virgil. Always Virgil. “Arma virumque cano.” They will chant it on their deathbeds without understanding a word, as Romans should.',
      end: true,
    },
    'caecilia-paulina': {
      text: (c) =>
        female(c) && c.game.player?.sheet?.hasFlag('dress.stola')
          ? '(The matron with the tower of curls inclines her head.) Salve, sister. Have you seen the pearls today? Robbery. Pure robbery.'
          : '(A matron with an elaborate tower of curls looks you up and down.) Do I know you? Then do not speak to me in the street. My husband is an eques.',
      end: true,
    },
    mamercus: {
      text: (c) =>
        c.game.standing?.origin === 'veteranus'
          ? '(The old man squints at your scars, and grins.) Commilito! A brother from the Dacian war! Which cohort? Doesn’t matter. Sit, sit.'
          : 'An as for a man who held the line at Tapae? (He holds out a bowl.)',
      choices: [
        { text: 'Here’s an as.', enabled: (c) => c.denarii() >= 1 / 16, goto: 'alms', effects: (c) => (c.pay(1 / 16), c.changeDisposition(5)) },
        { text: 'Tell me about Tapae.', goto: 'tapae', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    alms: {
      text: 'Jupiter and Mars keep you. And keep your legs.',
      end: true,
    },
    tapae: {
      text: 'Rain, mud, Dacians on the hills, and Jupiter throwing lightning at them, they say. We won. I lost a leg in the next year’s mud, to a Dacian I never saw. The emperor gave me land. I sold it. Don’t ask.',
      end: true,
    },
    tychicus: {
      text: 'Misenum fleet, awning crew. We rig the velarium over the amphitheatre: canvas the size of a forum, and if one rope goes, fifty thousand Romans get sunburned. Then they blame the sailors.',
      end: true,
    },
    bitus: {
      text: (c) =>
        c.game.standing?.origin === 'dacus'
          ? '(He answers in Dacian, low and fast, and for a moment he smiles.) You too? Then you know. They carved our king at the top of that thing. Taller than he was.'
          : '(He looks at you, then at the overseer, and says nothing.)',
      choices: [
        { text: 'Do you speak Latin?', goto: 'latin', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    latin: {
      text: 'Enough. Rope. Stone. Faster. (He looks up at the Column.) They carved my king near the top. Taller than he was.',
      end: true,
    },
    'flavius-draco': {
      text: 'Titus Flavius Draco, centurion, recruiting for the East. You have two arms and two legs. Interested?',
      choices: [
        { text: 'Tell me about the war.', goto: 'east', once: true },
        { text: 'Not today.', end: true },
      ],
    },
    east: {
      text: 'The King of Kings put his own man on the throne of Armenia without asking Rome. The princeps will take him off it. Twenty years’ service, a fair wage, land at the end. And the East is full of gold.',
      end: true,
    },
    gnatho: {
      text: 'Sit, sit! Knucklebones, a quadrans a throw. The aediles are at lunch.',
      choices: [
        { text: 'One throw. [1 quadrans]', enabled: (c) => c.denarii() >= 1 / 64, goto: 'throw', effects: (c) => c.pay(1 / 64) },
        { text: 'Dice are illegal outside the Saturnalia.', goto: 'illegal', once: true },
        { text: 'Vale.', end: true },
      ],
    },
    throw: {
      // Every third throw is a Venus (all four different), which pays double; the rest are dogs (four ones).
      effects: (c) => {
        const n = (typeof c.memory.throws === 'number' ? c.memory.throws : 0) + 1;
        c.memory.throws = n;
        c.memory.venus = n % 3 === 0;
        if (c.memory.venus) c.receive(2 / 64);
      },
      text: (c) =>
        c.memory.venus
          ? '(The four bones tumble: one, three, four, six. All different.) Venus! The best throw! You win. Again?'
          : '(The four bones tumble: four ones.) The dog! The worst throw. My quadrans. Again?',
      choices: [
        { text: 'Again. [1 quadrans]', enabled: (c) => c.denarii() >= 1 / 64, goto: 'throw', effects: (c) => c.pay(1 / 64) },
        { text: 'Enough.', end: true },
      ],
    },
    illegal: {
      text: 'So is everything worth doing. Sit.',
      end: true,
    },
  },
});

export default [juvenal, vestal, vettius, romans];
