/**
 * Keepers and a thing for the QUESTS II crew's side quests (docs/design/world-life.md §4.8 Q4-Q6):
 *
 *   keeper-minucia-curator    the curator of the dole at the Porticus Minucia (Forged Tokens)
 *   keeper-boarium-olearius   Lucius Septimius, oil-dealer of the Forum Boarium (Mercury's Water)
 *   act.capena.mercury-rite   "Dip a laurel and sprinkle yourself" at Mercury's spring on the Ides
 *
 * Their quest conversations live in src/dialogue/content/misc-life-g.ts and sit on top of the talk
 * written here (a quest dialogue answers only while its quest has something to say).
 */
import { AS } from '../../../rpg/money';
import { defineLife } from '../../types';

export default defineLife({
  keepers: [
    {
      id: 'keeper-minucia-curator',
      district: 'dist-forum-holitorium',
      station: 'st-minucia-frumentatio',
      member: 0,
      name: 'Aulus Cluvius Pansa',
      title: 'Curator of the dole',
      barks: ['Tokens in hand! Lists in order! One citizen at a time!', 'Five modii. Not six. Not four and a promise.'],
      talk: {
        greet: '(A careful man at a table, a wax list in front of him and a bronze scale at his elbow.) Name, number of the ostium, token. In that order. And do not breathe on the list.',
        topics: [
          { ask: 'How does the dole work?', say: 'Every citizen on the list has a token for the month: lead, with a number and a mark, from the aediles’ own moulds. He brings it to his door in this portico, hands it over, and takes away five modii of grain. Two hundred thousand citizens. Do the sums, and then do not tell me what they come to.' },
          { ask: 'Is it only for citizens?', say: 'Only for citizens on the list, and only for the head of a house. Freedmen with the right papers are on it. Slaves and foreigners are not, however loudly they argue.' },
          { ask: 'Is the grain good?', say: 'It is grain. Alexandrian, mostly, and a few weeks off the ship. If it is not good, speak to the praefectus annonae. I am a curator, not a miracle.' },
        ],
        news: 'Any word at the dole?',
      },
      period: 'The grain dole by token at the Porticus Minucia [A/P]; the curator is invented [G]',
    },
    {
      id: 'keeper-boarium-olearius',
      district: 'dist-velabrum-boarium',
      // A new post at the cattle market, west of the butchers.
      station: {
        id: 'st-life-boarium-olearius',
        landmark: 'forum-boarium',
        gap: 2,
        when: ['salutatio', 'morning', 'midday', 'afternoon'],
        members: [
          { role: 'merchant', out: -2.2, side: -6.4, loop: 'stand', face: 'out', prop: null, label: 'Oil-dealer', barks: 'merchant' },
          { role: 'porter', out: -0.9, side: -5.2, loop: 'stand', face: 'in', prop: 'amphora', label: 'Porter' },
          { role: 'citizen', out: -0.9, side: -7.4, loop: 'talk', face: 'in', prop: null },
        ],
        dressing: [
          { kind: 'amphorae', out: -1.5, side: -5.2 },
          { kind: 'stall-pots', out: -1.6, side: -6.5 },
        ],
      },
      member: 0,
      name: 'Lucius Septimius',
      title: 'Oil-dealer',
      barks: ['Oil from the best press in Latium! Honest weight, honest price!', 'Taste it! No, taste it again. Now buy it.'],
      shop: {
        vendor: 'macellarius',
        stock: [
          { id: 'olivae', count: 12 },
          { id: 'acetum', count: 6 },
          { id: 'ficus', count: 6 },
        ],
      },
      services: [
        {
          id: 'olives-at-cost',
          text: 'A jar of olives, at cost',
          price: 2 * AS,
          gate: { flag: 'septimius-at-cost' },
          effects: [{ kind: 'give', item: 'olivae' }],
          result: ['(He fills it to the rim, twice over, and does not look at the sky.) At cost, as I swore. Not a quadrans more.', '(He weighs it in his hand, as if Mercury were watching, and tops it up.) There. Honest.'],
        },
      ],
      talk: {
        greet: '(A round man with oil to the elbows, wiping his hands on his apron.) Salve, citizen! Lucius Septimius, oil of the best press in Latium, olives from Venafrum, honest weight, honest price. Taste and see.',
        topics: [
          { ask: 'Where does the oil come from?', say: 'Venafrum, mostly, and the hills above Tibur. Up the river in jars, down the Via Salaria in carts. Spanish oil is cheaper and tastes of the boat.' },
          { ask: 'What do the aediles say about the Boarium?', say: 'The aediles? (He wipes his hands again.) The aediles are honest men. They have wives to feed. Do not ask me about aediles, citizen. Ask me about oil.' },
          { ask: 'The Mercuralia: do you go to Mercury’s spring?', say: 'Every year! A man would be mad not to. Laurel and a jar, and a few words of explanation to the god. One hopes he is a patient listener.' },
        ],
        news: 'What is the talk in the cattle market?',
      },
      period: 'Oil merchants and their measures (Pompeii, CIL IV; the aediles’ standard weights and measures) [A]; Ovid, Fasti 5.673-692, the merchant at Mercury’s spring [A]. The fraud is invented [G]',
    },
  ],

  activities: [
    {
      id: 'act.capena.mercury-rite',
      name: 'Mercury’s Spring',
      verb: 'Take the water',
      at: { place: 'fons-mercurii' },
      reach: 3.5,
      // The Mercuralia, from the first light to the third hour; the festival gate holds only on the Ides itself.
      gate: { festival: 'fest-mercuralia' },
      open: [{ from: 'h1', to: 'h3' }],
      closedText: 'The water runs on, but the merchants have gone home, and the laurel with them.',
      intro: ['A queue of merchants with jars and branches of laurel, and the water running over the stone. Everyone is talking at once in low voices, as if a bargain were being struck with somebody who was not quite there.'],
      options: [
        {
          id: 'sprinkle',
          text: 'Dip a laurel and sprinkle yourself',
          price: AS,
          daily: true,
          effects: [{ kind: 'skillXp', skill: 'religio', amount: 25 }, { kind: 'pietas', amount: 2 }],
          result: [
            'You dip the laurel, shake it over your head and over your purse, and say what you are sorry for. Not out loud. The god, they say, can hear a thought as well as a prayer.',
            'The water is cold. It runs down your neck. Whatever the god thinks, the sprinkling is done: past lies washed away, and the future ones, as the merchants say, left to his discretion.',
          ],
        },
      ],
      period: 'The Mercuralia: merchants sprinkled with laurel from the spring by the Porta Capena (Ovid, Fasti 5.673-692) [A]',
    },
  ],
});
