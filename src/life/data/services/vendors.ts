/**
 * Services crew, life lines for existing named people (docs/design/world-life.md §4.4). Each one
 * reaches the person's own conversation through one `lifeChoices('<npc>')` spread in
 * src/dialogue/content/vendors.ts.
 *
 *  - Tryphon the barber (Basilica Paulli): haircut 2 as, shave 1 as; free once Hilara is home.
 *    (Not Tryphon the bookseller of the Vicus Tuscus: Appendix A.3.)
 *  - Cerinthus the fuller (Velabrum): laundry, 3 as.
 *  - Euhodus the arms dealer: mending, and nothing else (Appendix A.5: he is protected).
 *  - Arruns the haruspex and Zenon the astrologer: an omen and a nativity.
 *
 * The pallet behind the Silver Pig is rented in Chreste's own conversation (she sets the flag
 * `pallet-until` to the day the rent runs out), and Cerdo's news reads the 'cry' picks there too.
 */
import { AS } from '../../../rpg/money';
import { defineLife } from '../../types';

/** Three lines of a nativity: the body, the purse, the warning. One of each, drawn by the day. */
const BODY = [
  'Mars sits kindly in your third house: you will be stubborn, and for once it will be useful.',
  'The Moon crosses your sixth house: expect tired feet, a good dinner, and a quarrel before it.',
  'Jupiter looks on your second house: you will be forgiven something you have not yet done.',
  'Venus rises behind you: you will be liked, which is not the same as being trusted.',
  'Mercury is quick in your fifth house: a letter, a message, a word said too soon.',
];
const PURSE = [
  'Saturn watches your money. Count it twice, spend it once.',
  'A coin comes to you from a friend, and a debt from a cousin. They balance, roughly.',
  'The stars favour a bargain today. They do not say which of you gets it.',
  'Your purse is lighter by evening, and the weight goes into a good cause or a bad cup.',
  'A small gain at the market, a small loss at the door. Net: nothing, with feeling.',
];
const WARNING = [
  'Beware a man with a fine toga and a poor memory.',
  'Do not lend fire to a neighbour on the ghost nights.',
  'Beware the third door on the left, and the second cup on the right.',
  'Watch the water. Not the river: the cup. Someone has been generous.',
  'Beware of a stranger who knows your name. He has read it somewhere.',
];

export default defineLife({
  services: [
    {
      npc: 'npc-tryphon',
      services: [
        {
          id: 'haircut',
          text: 'A haircut',
          price: 2 * AS,
          gate: { notFlag: 'hilara-returned' },
          effects: [{ kind: 'condition', id: 'tonsus' }, { kind: 'rumour' }],
          result: ['(Snip, snip, a comb through the curls, and the mirror held up at the end.) There. A new man, or at least a tidier one. And while I work, they say:', '(He sets the shears down with a flourish.) Now you look like someone who has been to the Forum on purpose. And I heard, this very morning:'],
        },
        {
          id: 'shave',
          text: 'A shave',
          price: AS,
          gate: { notFlag: 'hilara-returned' },
          effects: [{ kind: 'condition', id: 'tonsus' }, { kind: 'rumour' }],
          result: ['(A hot cloth, a quick razor, a pass of alum for the nicks.) There. Smooth as a magistrate’s promise. And listen:', '(He wipes the razor on his apron.) Hold still. There. Not a drop of blood, for once. And this I heard from the last chair:'],
        },
        {
          id: 'haircut-free',
          text: 'A haircut, on the house',
          daily: true,
          gate: { flag: 'hilara-returned' },
          effects: [{ kind: 'condition', id: 'tonsus' }, { kind: 'rumour' }],
          result: ['(He will not hear of payment.) After what you did for the aedile’s man and his hound? Sit, sit. Not an as. And while I trim:', '(Snip, snip.) For the man who found Hilara, the best chair in the Basilica. And listen to this:'],
        },
        {
          id: 'shave-free',
          text: 'A shave, on the house',
          daily: true,
          gate: { flag: 'hilara-returned' },
          effects: [{ kind: 'condition', id: 'tonsus' }, { kind: 'rumour' }],
          result: ['(The razor flashes.) For the finder of Hilara, a shave for nothing. Mind you don’t laugh. And:', '(A hot cloth, a steady hand.) On the house, always, for you. Here is something for the road:'],
        },
      ],
    },
    {
      npc: 'npc-cerinthus',
      services: [
        {
          id: 'laundry',
          text: 'Wash my clothes',
          price: 3 * AS,
          effects: [{ kind: 'clean', to: 'normal' }],
          result: ['(He takes the tunic, dunks it, treads it in the vat, hangs it in the sun, and hands you a damp but remarkably clean one.) Urine and fuller’s earth, then the treading, then the sun. You’ll smell like a senator. A clean one.', 'There. Smells like rain on a good day. Wring it out before you put it on.'],
        },
      ],
    },
    {
      // Euhodus is protected (coniuratio-masked): he mends arms, and that is all.
      npc: 'npc-euhodus',
      services: [
        {
          id: 'mend',
          text: 'Mend my arms',
          effects: [{ kind: 'repair' }],
          result: ['(He runs a thumb along each edge and sucks his teeth.) Repairs while you wait. Waiting is extra, but I’ll waive it for you. This is what it costs:', '(A whetstone, a few taps of the hammer.) Good as new, or near enough. The bill:'],
        },
      ],
    },
    {
      npc: 'npc-arruns',
      services: [
        {
          id: 'signs',
          text: 'Ask for the day’s omen',
          price: 1,
          daily: true,
          effects: [{ kind: 'omen' }, { kind: 'skillXp', skill: 'religio', amount: 10 }],
          result: ['(He bends over the liver on his board, tilting it to the light with the air of a man at his prayers.)', '(He squints at the liver, turns it, turns it back.) The gods do not shout, but they do write.'],
        },
      ],
    },
    {
      npc: 'npc-zenon',
      services: [
        {
          id: 'nativity',
          text: 'Cast my nativity',
          price: 12 * AS,
          daily: true,
          effects: [{ kind: 'skillXp', skill: 'religio', amount: 5 }],
          result: (game) => {
            const d = game.time.dayIndex;
            return `(He spins the bronze sphere and mutters over a table of numbers.) ${BODY[d % BODY.length]} ${PURSE[(d * 3 + 1) % PURSE.length]} ${WARNING[(d * 7 + 2) % WARNING.length]} (He pockets your coin with a flourish.) Confidence is half the horoscope.`;
          },
        },
      ],
    },
  ],
});
