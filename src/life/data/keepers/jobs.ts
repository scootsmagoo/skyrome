/**
 * The people who give the jobs work (docs/design/world-life.md §4.7, the JOBS crew): the tally
 * clerk and the storekeeper at the river port, and the baker of the Subura; and the two things the
 * jobs use: the heap of amphorae on the quay and the Subura popina's counter, where the first
 * basket of the bread round is left before the popina opens.
 *
 * The jobs themselves are quests (src/quests/content/job-*.ts); their posts are in
 * src/life/jobs/posts.ts. The practice bout is offered by Asiaticus in his own conversation and the
 * patron's letter by the doorkeeper at the Velia (the SERVICES crew's keeper).
 */
import { jobStep, ST_HORREUM, ST_TABULARIUS } from '../../jobs/posts';
import { defineLife } from '../../types';

const PORTER = 'job-portus-saccarius';
const BREAD = 'job-subura-pistor';

/** What shouldering each load feels like (the porter's steps take1…take3). */
const SHOULDER: Record<string, string> = {
  take1: 'You get an amphora of oil up onto your shoulder. It weighs as much as a child and holds still about as well.',
  take2: 'Up goes the second. The oil sloshes; your knees complain.',
  take3: 'The last jar. Thallus makes a mark on his tablet as you stagger off.',
};

export default defineLife({
  keepers: [
    {
      id: 'keeper-portus-tabularius',
      district: 'dist-velabrum-boarium',
      station: ST_TABULARIUS,
      member: 0,
      name: 'Thallus',
      title: 'Tally clerk of the river port',
      barks: ['Forty-one. Forty-two. Who moved forty-three?', 'Mind the jars! You break it, you’ve bought it.', 'Next load! Shoulders, not elbows!', 'Oil from Baetica, wine from Campania, and nobody can count but me.'],
      talk: {
        greet: '(A thin slave with a stylus behind each ear and wax under his nails, standing at the harbour office with a tablet.) Forty-two jars of Spanish oil off that barge and every one counted twice. Do you want something, or are you only in the way?',
        again: ['Counting. Talk while I count.', 'Still here? Then make yourself useful.', 'Forty. Forty-one. Yes?'],
        topics: [
          {
            ask: 'What comes up the river?',
            say: 'Oil from Spain in fat round jars, wine from Campania, bricks, timber, marble when someone important is building. It comes up from Ostia on barges towed by oxen along the bank: three days, if the river behaves, and the river never behaves.',
          },
          {
            ask: 'Who are the porters?',
            say: 'Saccarii. They have a guild, a shrine and opinions. They carry anything you can strap to a back. A man who turns up with his own shoulders can earn twelve asses a day here, if he doesn’t drop anything. The ones who drop things earn bruises.',
          },
          {
            ask: 'Why count everything twice?',
            say: 'The shipper counts once and the storekeeper counts once, and they never get the same number. I am paid to be the third opinion. Daphnus at the storeroom door is the fourth, and he is always wrong.',
          },
        ],
        news: 'Anything new on the river?',
      },
      jobs: [PORTER],
      period: 'Porters (saccarii) carrying cargo from river boats: the Isis Giminiana fresco from Ostia [A]; Baetican oil in Dressel 20 amphorae (Monte Testaccio) [A]; the clerk is invented [G]',
    },
    {
      id: 'keeper-portus-horrearius',
      district: 'dist-velabrum-boarium',
      station: ST_HORREUM,
      member: 0,
      name: 'Daphnus',
      title: 'Storekeeper of the horrea',
      barks: ['Third cell, back wall, necks up!', 'Crack one and it’s your wages that leak.', 'In. Counted. Next.'],
      talk: {
        greet: '(A heavy man on a stool by the storeroom door, a tablet on his knee and a key the length of a hand on his belt.) Into the cell, against the back wall, necks up. If you crack one, it’s your wages that leak.',
        again: ['In or out?', 'Counted. What else?', 'Yes, yes. Necks up.'],
        topics: [
          {
            ask: 'What’s kept in here?',
            say: 'Oil, wine, roof-tiles, a merchant’s whole life in jars. The cells belong to the owner of the horrea; the merchants rent them by the month and pay me to remember what’s whose. I remember. For a fee, I remember faster.',
          },
          {
            ask: 'Do you ever lose anything?',
            say: 'Never. Things are sometimes in a cell I haven’t looked in yet. That isn’t the same thing, whatever Thallus says.',
          },
        ],
        news: 'Heard anything on the quay?',
      },
      period: 'Horrea with rented cells and a keeper (horrearius) [A]; the cells of the river port follow the builder [G]',
    },
    {
      id: 'keeper-subura-furnarius',
      district: 'dist-subura',
      station: 'st-subura-pistrinum',
      member: 0,
      name: 'Aulus Cossutius Fortunatus',
      title: 'Baker of the Vicus Patricius',
      barks: ['The first batch is out! Where are my basket boys?', 'Shut the door, you’re letting the heat go!', 'Spes! Walk on, you old saint!'],
      talk: {
        greet: '(Flour to the elbows and a face red from the oven.) In or out, the door’s letting the heat go. The first batch is out, and the second wants its baskets carried before it goes cold.',
        again: ['Quickly, I’ve bread in.', 'Back again? Good, I’ve baskets.', 'Mind the donkey.'],
        topics: [
          {
            ask: 'When do you sleep?',
            say: 'In the afternoon, like an owl. The ovens are lit at the fourth watch so the Subura has bread when it wakes. Nobody thanks the baker; they only complain about the size of the loaf.',
          },
          {
            ask: 'What do you bake?',
            say: 'Plebeian bread, eight wedges to the loaf, an as each. Honey cakes for the gods on feast days. And for the popinae and the inns, by the basket, if someone will carry it to them.',
          },
          {
            ask: 'Who turns the mill?',
            say: 'A donkey called Spes. Blindfolded, so she doesn’t get dizzy going round. Better worker than most men, and she doesn’t drink.',
          },
        ],
        news: 'What’s the talk at the ovens?',
      },
      jobs: [BREAD],
      period: 'Bakeries with mills and ovens: Pompeii [A]; bakers working through the night (Martial 12.57) [A]; the delivery round is invented [G]',
    },
  ],

  activities: [
    {
      // The heap by the tally clerk: the porter shoulders one amphora at a time from here.
      id: 'act.portus.amphorae',
      name: 'Amphorae off the barge',
      verb: 'Shoulder an amphora',
      at: { station: ST_TABULARIUS.id, dressing: 0 },
      reach: 2.8,
      gate: { questRunning: PORTER, if: (g) => (jobStep(g, PORTER) ?? '').startsWith('take') },
      options: [
        {
          id: 'shoulder',
          text: 'Shoulder an amphora',
          effects: [],
          // Said before the job moves on, so the step is still the load being taken.
          result: (g) => SHOULDER[jobStep(g, PORTER) ?? ''] ?? SHOULDER.take1,
        },
      ],
      period: 'Saccarii carrying amphorae from boat to storeroom: the Isis Giminiana fresco from Ostia [A]',
    },
    {
      // The bread round's first basket: the popina opens at the third hour, so it waits on the counter.
      id: 'act.subura.popina-panis',
      name: 'The popina’s counter',
      verb: 'Leave the bread',
      at: { station: 'st-subura-thermopolium', dressing: 0 },
      reach: 2.8,
      gate: { questRunning: BREAD, if: (g) => jobStep(g, BREAD) === 'popina' },
      options: [
        {
          id: 'leave',
          text: 'Leave a basket of bread on the counter',
          effects: [{ kind: 'take', item: 'quest-corbis-panis' }],
          result: 'You set a basket on the counter against the shutters. The keeper will find it, still warm, when he opens at the third hour.',
        },
      ],
      period: 'Popinae served bread bought from bakers [P]; the delivery is invented [G]',
    },
  ],
});
