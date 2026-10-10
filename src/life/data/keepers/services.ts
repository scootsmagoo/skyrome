/**
 * Services crew, keepers (docs/design/world-life.md §4.4, §4.5): the bath attendants of the Baths
 * of Titus and of Trajan, and the doorkeeper at the salutatio on the Velia.
 *
 * The baths open at the bell of the eighth hour (Martial 14.163, 10.48). Before it the attendant
 * refuses and nothing is charged; the bath, the tip and the rub-down are one option each, so a
 * poor player sees what each costs. Mixed bathing was banned only later (Hadrian), so there is no
 * rule about it here.
 *
 * The salutatio is at the door of a fictional senator, Gaius Vettius Rufinus, who is never seen
 * to speak (Appendix A.1: the old post at Pliny's shut house is gone). The sportula was 100
 * quadrantes, 25 asses (Martial 1.59, 3.7). The job `job-cliens-epistula` (JOBS crew) is offered
 * by this doorkeeper: add `jobs: ['job-cliens-epistula']` here when that job has merged.
 */
import { AS, QUADRANS } from '../../../rpg/money';
import { defineLife } from '../../types';
import type { OptionDef } from '../../types';

/** The bell rings at the eighth hour; the doors shut at the eleventh. */
const BELL = [{ from: 'h8', to: 'h11' }] as const;
const NOT_YET = 'Not until the bell, at the eighth hour.';

/** The three ways in: the plain bath, with a tip for the cloakroom slave, and with a rub-down. */
const bathOptions = (): OptionDef[] => [
  {
    id: 'bathe',
    text: 'Bathe',
    price: QUADRANS,
    needs: { gate: { hours: [...BELL] }, why: NOT_YET },
    effects: [{ kind: 'bathe' }, { kind: 'rumour' }],
    result: [
      'In you go. Mind the slaves with the strigils, and mind your cloak: the thieves of the changing room wait for the careless.',
      'An hour in the steam, a plunge in the cold pool, and the oil scraped off with a curved iron. You come out new.',
    ],
  },
  {
    id: 'bathe-tip',
    text: 'Bathe, and tip the cloakroom slave',
    price: QUADRANS + AS,
    needs: { gate: { hours: [...BELL] }, why: NOT_YET },
    effects: [{ kind: 'bathe', tip: true }, { kind: 'rumour' }],
    result: [
      'The slave at the pegs bows to your coin, and your cloak is exactly where you left it. An as well spent.',
      'He holds your things on his own arm and watches them like a hen. An hour later you are clean and nothing is missing.',
    ],
  },
  {
    id: 'bathe-massage',
    text: 'Bathe, with a rub-down',
    price: QUADRANS + 3 * AS,
    needs: { gate: { hours: [...BELL] }, why: NOT_YET },
    effects: [{ kind: 'bathe', tip: true, massage: true }, { kind: 'rumour' }],
    result: [
      'The masseur kneads you like a baker with a stubborn loaf, then slaps you off the table. You walk out ten years younger.',
      'Oil, the strigil, a thumb in every knot. You could run to Ostia.',
    ],
  },
];

export default defineLife({
  keepers: [
    {
      id: 'keeper-thermae-titi-balneator',
      district: 'dist-vallis-colossei',
      station: 'st-thermae-titi',
      member: 0,
      name: 'Corinthus',
      title: 'Bath attendant',
      barks: ['A quadrans for the baths, citizen. Doors open at the eighth hour.', 'Leave your clothes with the capsarius, or lose them.'],
      talk: {
        greet: '(A wiry freedman with a bronze strigil on a cord and a purse that clinks with quadrantes.) Corinthus, doorkeeper of the Baths of Titus. Small beside Trajan’s, and older, and the water is hotter. A quadrans, and the bell rings at the eighth hour.',
        again: ['A quadrans, citizen. The bell at the eighth hour.', 'The furnaces were lit at dawn. The caldarium is waiting.', 'Come in, come in. Mind the wet floor.'],
        topics: [
          { ask: 'Why the eighth hour?', say: 'Because the furnace-men need the morning to heat the water. The day’s business is for the morning; the bath is for after. Everyone knows it. The bell rings, the doors open, the whole Oppian comes down the hill.' },
          { ask: 'Isn’t Trajan’s bath bigger?', say: 'Bigger! It is enormous. They say you can lose a child in it. But a man who wants a quick bath and a quiet word comes here. The Titus is for people who like to be able to find the door.' },
        ],
        news: 'What do they say in the changing room?',
      },
      services: bathOptions(),
      period: 'The bath bell at the eighth hour (Martial 14.163, 10.48) [A]; a quadrans to bathe (Horace Sat. 1.3.137; Juvenal 2.152) [A]; cloakroom thieves (Catullus 33, Digest 1.15.3) [A]',
    },
    {
      id: 'keeper-thermae-traiani-balneator',
      district: 'dist-vallis-colossei',
      station: 'st-thermae-traiani',
      member: 0,
      name: 'Philargyrus',
      title: 'Bath attendant',
      barks: ['Trajan’s baths, a quadrans! Bigger than anything in Rome!', 'Doors open at the eighth hour. Not before.'],
      talk: {
        greet: '(A big man in a damp tunic with a bunch of towels over his shoulder.) The Baths of Trajan, citizen! Apollodorus built them, the Emperor opened them, and I keep the door. A quadrans. The bell rings at the eighth hour.',
        again: ['A quadrans, and the bell rings at the eighth hour.', 'Libraries, lecture halls, gardens. And a bath, if you must.', 'Go in, go in. Don’t stand in the doorway like a statue.'],
        topics: [
          { ask: 'They say these baths are the largest ever built.', say: 'Largest in the world, I’d say, and I’ve asked sailors. Halls like temples, a pool you could sail a boat on, gardens and libraries. And the man who designed it must be proud, if a builder is ever proud.' },
          { ask: 'Do you ever get tired of the crowds?', say: 'Every day at the eighth hour I think: this is the end of me. Then they’re inside, and it’s quiet, and I sit on the step and eat a lupin. The crowd is a weather, citizen. It passes.' },
        ],
        news: 'Anything new in the baths?',
      },
      services: bathOptions(),
      period: 'The baths dedicated in June 109 (Fasti Ostienses; Apollodorus of Damascus) [A]; the bell at the eighth hour (Martial 14.163) [A]; a quadrans (Horace Sat. 1.3.137) [A]',
    },
    {
      // The doorkeeper at the salutatio. The senator, Gaius Vettius Rufinus, is fictional, and seen
      // and never heard: the clients stand in the street, the doorkeeper counts them in.
      id: 'keeper-velia-ostiarius',
      district: 'dist-velia',
      station: {
        id: 'st-life-velia-salutatio',
        lane: 'via-sacra',
        at: 0.41,
        when: ['salutatio'],
        members: [
          { role: 'attendant', out: 0.3, side: 0, loop: 'guard', face: 'out', prop: 'lantern', label: 'Doorkeeper', barks: 'ostiarius' },
          { role: 'client', out: 1.4, side: -0.8, loop: 'stand', face: 'in', prop: null },
          { role: 'client', out: 2.2, side: -0.4, loop: 'talk', face: 'in', prop: null },
          { role: 'client', out: 2.4, side: 0.8, loop: 'talk', face: 2.4, prop: null },
          { role: 'client', out: 3.2, side: 0.2, loop: 'stand', face: 'in', prop: null },
        ],
      },
      member: 0,
      name: 'Syrus',
      title: 'Doorkeeper',
      barks: ['Wait your turn, citizen. The master receives in the first hours. In a toga.', 'Names, please. Clients on the left.'],
      talk: {
        greet: '(A broad, tired slave in a plain tunic stands in the doorway with a wax tablet and a stylus.) The house of Gaius Vettius Rufinus, senator. The master receives his friends in the first hours of the day, in a toga. Names on the tablet, clients on the left, no pushing.',
        again: ['The master receives at dawn. In a toga.', 'Names on the tablet. No pushing.', 'He sees everyone, in the end. Some end later than others.'],
        topics: [
          { ask: 'What do clients get for their trouble?', say: 'The dole. A hundred quadrantes, in a little basket, if the master is generous. Some masters give a dinner instead, and the clients eat worse than the slaves. Ours gives the money. He is fair. He is also never seen after the second hour.' },
          { ask: 'Do you ever tire of the queue?', say: 'Every dawn. They come in their good togas, patched at the hem, and they look at me as if I held the key to Elysium. I hold a tablet. I check names. I let the right ones through.' },
          { ask: 'What is the master like?', say: 'You will see him in the atrium, if you wait. He sits, he nods, he does not speak much to the lower clients. The senator’s way. Do not stare at him.' },
        ],
        news: 'What’s the talk at the door?',
      },
      services: [
        {
          id: 'salutatio',
          text: 'Wait in the queue and greet the patron',
          daily: true,
          gate: { hours: [{ from: 'h1', to: 'h2' }] },
          needs: { gate: { wearing: ['toga', 'toga-fina', 'stola', 'stola-fina'] }, why: 'You are not dressed for a salutatio.' },
          effects: [
            { kind: 'hours', hours: 1 },
            { kind: 'receive', denarii: 25 * AS },
            { kind: 'skillXp', skill: 'rhetoric', amount: 5 },
            { kind: 'fama', faction: 'clientela', amount: 1 },
          ],
          result: [
            'An hour on the pavement among togas. At last the doorkeeper waves you in; the senator looks up from his tablets, nods once, and a slave puts a basket in your hand: twenty-five asses. You say the proper words.',
            'You stand in the queue, shuffle through the atrium, say “Ave, domine,” and a slave hands you the sportula with a face that has done this ten thousand times.',
          ],
        },
      ],
      period: 'The salutatio and the sportula of 100 quadrantes (Martial 1.59, 3.7, 3.36; Juvenal 1.95–126) [A]; the patron, Gaius Vettius Rufinus, is invented [G]',
    },
  ],
});
