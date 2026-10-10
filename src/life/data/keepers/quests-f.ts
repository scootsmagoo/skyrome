/**
 * The people of the first three side quests who stand at station posts (docs/design/world-life.md
 * §4.8, QUESTS I): Primus the coppersmith and his apprentice Felix in the Vicus Tuscus
 * (misc-urna-aenea), Crispina the fence in the Subura (misc-urna-aenea, misc-fur-balnearius),
 * who stays as Rome's fence once the quests are done, and Onesimus the letter-cutter among the tombs
 * outside the Porta Capena (misc-fur-balnearius). Their quest lines are choices in their talk:
 * each is gated on its quest and hands the story to src/quests/content/misc-*.ts through the
 * 'dialogue:node' events of the nodes below (the dialogue id is the keeper's id).
 *
 * Node ids the quests listen for, by keeper:
 *   keeper-tuscus-aerarius          urnaAccept, urnaReturned, urnaNamed, urnaCover
 *   keeper-tuscus-aerarius-felix    felixConfession
 *   keeper-subura-receptatrix       potBought, potScared, bundleTold
 *   keeper-capena-plumbarius        tabletBought
 */
import { defineLife } from '../../types';
import { completed, notStarted, stage } from '../../../content/talk';
import type { DialogueContext } from '../../../dialogue/types';

const POT = 'misc-urna-aenea';
const BATH = 'misc-fur-balnearius';
const OPENING = 'mq-01-madida-capena';

/** Primus's dialogue, Felix's and Crispina's are in the keepers' own ids. */
export const PRIMUS = 'keeper-tuscus-aerarius';
export const FELIX = 'keeper-tuscus-aerarius-felix';
export const CRISPINA = 'keeper-subura-receptatrix';
export const ONESIMUS = 'keeper-capena-plumbarius';

const at = (c: DialogueContext, s: string) => stage(c, POT) === s;
const potStage = (c: DialogueContext, ...ss: string[]) => ss.includes(stage(c, POT) ?? '');

export default defineLife({
  keepers: [
    // ---------------------------------------------------------------- Primus, the coppersmith
    {
      id: PRIMUS,
      district: 'dist-velabrum-boarium',
      station: {
        // A coppersmith's shop on the Vicus Tuscus, between the silk-sellers and the oil. The Vicus
        // Tuscus was a street of shops (Horace, Sat. 2.3.228).
        id: 'st-life-tuscus-aerarius',
        lane: 'vicus-tuscus',
        at: 0.42,
        when: ['salutatio', 'morning', 'afternoon'],
        members: [
          { role: 'artisan', out: -3.4, side: 0, loop: 'work', face: 'out', prop: null, label: 'Coppersmith', barks: 'worker' },
        ],
        dressing: [
          { kind: 'anvil', out: -2.9, side: 0 },
          { kind: 'stall-pots', out: -2.7, side: -1.6 },
        ],
      },
      member: 0,
      name: 'Primus',
      title: 'Coppersmith',
      appearance: {
        sex: 'male', age: 'middle', build: 'heavy', height: 1.66, skin: '#b07d58',
        hair: { style: 'receding', color: '#4a3a2a' }, beard: 'stubble',
        garments: [{ kind: 'tunica-short', color: '#7a6248' }, { kind: 'apron', color: '#5a4632' }],
        footwear: 'barefoot', weapon: 'hammer',
      },
      barks: ['Pots, pans, braziers, all in bronze! Mended while you wait!', 'Bronze doesn’t rust, citizen. It just gets honest.', 'If you see a pot that isn’t mine, it’s mine.'],
      shop: {
        vendor: 'faber-ferrarius',
        stock: [{ id: 'patina', count: 3 }, { id: 'lucerna', count: 4 }, { id: 'clavus', count: 12 }, { id: 'malleus', count: 1 }],
        purse: 30,
      },
      talk: {
        greet: '(A thick-armed man with a hammer in his fist and a burn scar up one wrist.) Primus, coppersmith. Pots, pans, braziers, the lamp you dropped. If it’s bronze I’ll beat it back into shape.',
        topics: [
          { ask: 'How is trade?', say: 'Bronze goes up, patience goes down. Everyone wants a brazier in May and nobody wants to pay for one till the frost.' },
          { ask: 'Who works for you?', say: 'My boy Felix, when he’s awake. A good pair of hands and a bad head for anything but dice.' },
        ],
        news: 'Any news on the Vicus Tuscus?',
        choices: [
          // The offer: a hooked notice and Cerdo's cry bring the player here.
          {
            text: 'That notice by your shop: a bronze pot?',
            if: (c) => completed(c, OPENING) && notStarted(c, POT),
            goto: 'urnaOffer',
          },
          {
            text: 'About your pot…',
            if: (c) => potStage(c, 'start', 'fence'),
            goto: 'urnaWaiting',
          },
          {
            text: 'I have your pot.',
            if: (c) => at(c, 'return') && c.hasItem('olla-aenea'),
            goto: 'urnaReturned',
          },
          {
            text: 'About the thief…',
            if: (c) => at(c, 'thief'),
            goto: 'urnaThief',
          },
        ],
        nodes: {
          urnaOffer: {
            text: '(He wipes his hands on his apron and points a hammer at a board nailed to his doorpost.) Gone! A bronze pot, a good one, the big one for the dyers’ vats. Walked out of my shop between one hour and the next, and I was here the whole time. Sixty-five sesterces to whoever brings it back, twenty more for the one who took it. That is a lot of sesterces.',
            choices: [
              { text: 'I’ll look into it.', goto: 'urnaAccept' },
              { text: 'Sixty-five? For a pot?', goto: 'urnaAsk' },
              { text: 'Not my business.', goto: 'hub' },
            ],
          },
          urnaAsk: {
            text: 'It’s the dyers’ pot and the dyers are the sort who send a man round with a stick. Find it, and I keep my teeth. Sixty-five.',
            choices: [
              { text: 'I’ll look into it.', goto: 'urnaAccept' },
              { text: 'I’ll think about it.', goto: 'hub' },
            ],
          },
          urnaAccept: {
            text: 'Good. Ask my boy Felix; he was minding the front when it went. He swears he saw nothing, which is more than I’d swear for him. And watch your purse on the Vicus Tuscus. The honest men here would sell their shadows.',
            next: 'hub',
          },
          urnaWaiting: {
            text: (c) => (at(c, 'start') ? 'Felix is round the side. Ask him. Politely first.' : 'Well? Any word of it? My hammer is itching.'),
            next: 'hub',
          },
          urnaReturned: {
            text: '(He turns the pot over, looks inside, knocks it with a knuckle, and a smile breaks over his face.) That’s her! That’s the one. Not a dent. Here: your sixty-five, counted out. Now, whoever took her…',
            next: 'urnaThief',
          },
          urnaThief: {
            text: 'Who took her, then? Twenty more sesterces for a name. A man needs to know whose hand to watch.',
            choices: [
              { text: 'It was Felix, your apprentice.', goto: 'urnaNamed' },
              { text: 'I never found who took it. It was gone when I got there.', goto: 'urnaCover' },
              { text: 'Let me think.', goto: 'hub' },
            ],
          },
          urnaNamed: {
            text: '(The smile goes out of him. He sets the pot down very gently.) Felix. Of course. The dice. Here, your twenty, and I’ll have a word with the boy. A short one. With the flat of the hammer.',
            next: 'hub',
          },
          urnaCover: {
            text: 'Gone when you got there. Pity. A thief like that will be back, you know, once he’s run out of luck. Well. Sixty-five is sixty-five. Drink my health.',
            next: 'hub',
          },
        },
      },
      period: 'A bronze pot lost from a shop, CIL IV 64 (Pompeii); coppersmiths (aerarii) of the Vicus Tuscus [A, G]. The Vicus Tuscus a street of shops, Hor. Sat. 2.3.228 [A]',
    },
    // ---------------------------------------------------------------- Felix, the apprentice
    {
      id: FELIX,
      district: 'dist-velabrum-boarium',
      station: {
        // The apprentice minds the front 2.6 m up the street from the anvil (a station of his own: the
        // validator wants one keeper per new station).
        id: 'st-life-tuscus-discipulus',
        lane: 'vicus-tuscus',
        at: 0.4275,
        when: ['salutatio', 'morning', 'afternoon'],
        members: [{ role: 'attendant', out: -3.2, side: 0, loop: 'stand', face: 'out', prop: null, label: 'Apprentice' }],
      },
      member: 0,
      name: 'Felix',
      title: 'Coppersmith’s apprentice',
      appearance: {
        sex: 'male', age: 'young', build: 'slight', height: 1.6, skin: '#c4936d',
        hair: { style: 'curly-short', color: '#2a2018' }, beard: 'none',
        garments: [{ kind: 'tunica-short', color: '#b8a98c' }],
        footwear: 'barefoot',
      },
      barks: ['Pots, pans, braziers. Primus is inside. Or somewhere.', 'Don’t ask me, I’m only the boy.'],
      talk: {
        greet: '(A lanky youth rubbing a rag over a ladle, who looks anywhere but at you.) Felix. I mind the front. Primus is the master.',
        topics: [
          { ask: 'Do you like the work?', say: 'Bronze is hot and the master’s hammer is heavier than it looks. But it’s a trade, they say. A trade is a life.' },
          { ask: 'What do you do on your evenings?', say: 'Sleep. Mostly. A little talk at the Silver Pig. Nothing anyone could mind.' },
        ],
        choices: [
          {
            text: 'The missing pot, Felix. Tell me about it.',
            if: (c) => at(c, 'start'),
            goto: 'felixAsk',
          },
        ],
        nodes: {
          felixAsk: {
            text: 'The pot? I didn’t see. The master was out the back and I was sweeping and… a man came in, a big man, asking for a nail, and when I looked round… I don’t know. I didn’t see. Honest.',
            choices: [
              { text: 'You’ve been white since I asked. Tell me the truth, Felix.', check: { skill: 'rhetoric', difficulty: 25, kind: 'persuade', label: 'Press him', pass: 'felixCracks', fail: 'felixHolds' } },
              { text: 'Thirty asses at the dice. Does that sound familiar?', if: (c) => !!c.flag('felix-debt-known'), goto: 'felixCracks' },
              { text: 'I’ll come back.', goto: 'hub' },
            ],
          },
          felixHolds: {
            text: 'I don’t know what you mean. I was sweeping. Please go away, the master will wonder.',
            next: 'hub',
          },
          felixCracks: {
            text: '(He looks at the hammer on the bench, at the street, at his own feet, and his shoulders drop.) All right. All right! I owe thirty asses to a man at the Silver Pig. Thirty! He said the boy of a coppersmith could find thirty. I took the pot when the master was out. It went… it went to a woman in the Subura, in a doorway. Crispina. She pays quick and she doesn’t look at your face.',
            next: 'felixConfession',
          },
          felixConfession: {
            text: 'Don’t tell him. Please. I’ll pay it back, I swear I will. Every as. Just don’t tell him until I’ve… until I can…',
            next: 'hub',
          },
        },
      },
      period: 'Apprentices (discipuli) in the trades; dicing in the popinae, tolerated though illegal (Martial 4.14, 5.84) [A]',
    },
    // ---------------------------------------------------------------- Crispina, the fence
    {
      id: CRISPINA,
      district: 'dist-subura',
      station: {
        // A doorway in the Subura where a woman buys what nobody asks about. Her post is open from
        // the ninth hour (the bath thief's bundle arrives by afternoon), through the evening and
        // the night.
        id: 'st-life-subura-receptatrix',
        lane: 'argiletum',
        at: 0.86,
        when: ['afternoon', 'evening', 'night'],
        members: [{ role: 'citizen', out: -3.3, side: 0, loop: 'lean', face: 'out', prop: null, label: 'Crispina' }],
        dressing: [{ kind: 'stool', out: -2.8, side: 1.2 }],
      },
      member: 0,
      name: 'Crispina',
      title: 'Receiver of odds and ends',
      appearance: {
        sex: 'female', age: 'middle', build: 'average', height: 1.58, skin: '#b88a64',
        hair: { style: 'bun', color: '#3a2c22' },
        garments: [{ kind: 'tunica-long', color: '#6e4e5a' }, { kind: 'palla', color: '#4a3a46' }],
        footwear: 'soleae',
      },
      tags: ['plebs', 'fence'],
      barks: ['Odds and ends, citizen. I don’t ask where they’ve been.', 'Spare cloaks? Spare lamps? I’ve room.', 'Pass on. Or don’t. I have all night.'],
      shop: {
        vendor: 'receptator',
        stock: [
          { id: 'vitrum', count: 3 },
          { id: 'vasa-arretina', count: 2 },
          { id: 'argentum', count: 1 },
          { id: 'tali', count: 2 },
          { id: 'cucullus', count: 2 },
        ],
      },
      talk: {
        greet: '(A woman in a good palla leans in a doorway, one hand on the jamb, watching the street as a cat watches a mouse hole.) Crispina. I buy and I sell. I don’t ask, and I’d take it kindly if you didn’t.',
        topics: [
          { ask: 'What do you buy?', say: 'Odds and ends. Whatever someone wants gone before dark. A pot, a lamp, a cloak, a pair of earrings that got lonely. I pay half what it’s worth; for half the trouble.' },
          { ask: 'Isn’t it risky?', say: 'Receiving stolen goods earns the same penalty as stealing them, they say. I say a doorway is a doorway, and a woman standing in it is waiting for her husband. I have a great many husbands.' },
        ],
        news: 'Anything I should hear?',
        choices: [
          {
            text: 'A coppersmith’s apprentice sold you a pot. A big bronze one.',
            if: (c) => at(c, 'fence'),
            goto: 'potAsk',
          },
          {
            text: 'A slave brought you a bundle from the Baths of Titus.',
            if: (c) => stage(c, BATH) === 'follow',
            goto: 'bundleAsk',
          },
        ],
        nodes: {
          potAsk: {
            text: '(She doesn’t move from the doorway.) A pot. A man might say I know of a pot. I paid for it, fair, to a boy with the sweats. Ten denarii and it goes back to its master, nobody the wiser. Ten denarii, I’m not unreasonable, I paid him nearly two.',
            choices: [
              { text: 'Ten denarii. Here.', enabled: (c) => c.denarii() >= 10, goto: 'potBought' },
              { text: 'You’ll hand it over. Or I’ll make a lot of noise about what you do in this doorway.', check: { skill: 'rhetoric', difficulty: 40, kind: 'intimidate', label: 'Intimidate', pass: 'potScared', fail: 'potRefused' } },
              { text: 'I’ll be back.', goto: 'hub' },
            ],
          },
          potBought: {
            text: '(She counts it, twice, with her thumb, and a boy comes out of the dark with a bronze pot in his arms, wrapped in sacking.) A pleasure, citizen. Come again, with goods or with coin. Not with the vigiles.',
            effects: (c) => {
              if (c.pay(10)) c.giveItem('olla-aenea');
            },
            next: 'hub',
          },
          potScared: {
            text: '(Her eyes narrow, but her voice is level.) Another time I’d make you pay for that. Take it, and don’t take that tone to the doorway of anyone who has friends. Boy! The pot. The big one.',
            effects: (c) => c.giveItem('olla-aenea'),
            next: 'hub',
          },
          potRefused: {
            text: 'Noise? In the Subura? Citizen, noise is what we have instead of drains. Ten denarii, or go and find a vigil with a long memory.',
            next: 'hub',
          },
          bundleAsk: {
            text: '(She doesn’t even pretend.) A slave. From the Titus. With a bundle. Yes, citizen. Sabinus brings me one a day; a good cloak, in good wool, never more than one, because a man who takes two is a fool. I give him a fair half. If you say my name to him I’ll say yours to the prefect of the watch.',
            next: 'bundleTold',
          },
          bundleTold: {
            text: 'I don’t sell out my sellers, citizen, but a man who steals from the baths and keeps his place there is a man who’s grown careless. Do what you like with him. I’d rather he were punished than caught; punishment is slower.',
            next: 'hub',
          },
        },
      },
      period: 'Receivers of stolen goods (receptatores) were punished like the thieves (Digest 47.16) [P]; doorway pawnbrokers [G]',
    },
    // ---------------------------------------------------------------- Onesimus, who writes tablets
    {
      id: ONESIMUS,
      district: 'dist-porta-capena',
      station: {
        // A letter-cutter among the first tombs on the Via Appia, 40 m outside the gate (the road
        // is lined with tombs: "siste viator et lege" is painted on one of them).
        id: 'st-life-capena-plumbarius',
        lane: 'via-appia',
        at: 0.02,
        when: ['salutatio', 'morning', 'midday', 'afternoon'],
        members: [{ role: 'artisan', out: 3.4, side: 0, loop: 'work', face: 'in', prop: null, label: 'Letter-cutter' }],
        dressing: [{ kind: 'stool', out: 3.0, side: 1.2 }],
      },
      member: 0,
      name: 'Onesimus',
      title: 'Letter-cutter of the tombs',
      appearance: {
        sex: 'male', age: 'old', build: 'slight', height: 1.6, skin: '#c4986f',
        hair: { style: 'bald', color: '#8a8580' }, beard: 'short',
        garments: [{ kind: 'tunica', color: '#9a8d72' }, { kind: 'apron', color: '#6e644e' }],
        footwear: 'soleae', weapon: 'hammer',
      },
      tags: ['plebs', 'faber', 'dignitas:libertus'],
      barks: ['Epitaphs cut, names scratched, curses by the line.', 'Lead is cheap. Grudges are cheaper.'],
      talk: {
        greet: '(An old man with a mallet and a chisel and a lump of lead, squatting among the tombs, his bald head freckled with stone dust.) Onesimus. Epitaphs cut, names scratched, small curses by the line. Nothing grand. Mercury hears the cheap ones too.',
        topics: [
          { ask: 'Do the tablets work?', say: 'They work as well as the man who pays for them believes. And Mercury takes his time. Three days is quick, in my experience; a year is the usual.' },
          { ask: 'Who buys them?', say: 'Merchants, mostly. The wronged and the cheated: they want a name written down somewhere that isn’t a courtroom. Bath thieves, bad debtors, a husband who left.' },
        ],
        choices: [
          {
            text: 'I need a curse tablet written against a bath thief. (1 den.)',
            if: (c) => stage(c, BATH) === 'choose' && !c.hasItem('defixio-furtum'),
            enabled: (c) => c.denarii() >= 1,
            goto: 'tabletBought',
            effects: (c) => {
              if (c.pay(1)) c.giveItem('defixio-furtum');
            },
          },
        ],
        nodes: {
          tabletBought: {
            text: '(He scratches the name on a sheet of lead, in reverse, letter by letter, then folds it and puts a nail through it.) There. Mercury, Hermes, whoever. “Let him not sleep, nor eat, nor drink, until he brings it back.” Push it into the libation pipe of any tomb by the road, citizen: the dead carry messages. They have nothing else to do.',
            next: 'hub',
          },
        },
      },
      period: 'Curse tablets (defixiones) against bath thieves survive from Bath in Britain, and were put in graves [A, outside Rome]; the Via Appia lined with tombs [A]',
    },
  ],
  // Tryphon's offer of the Hilara reward is a life line in his one ServiceSet, with his haircuts
  // (../services/vendors.ts): one set per NPC. The notices and rumours are in ../rumours/quests-f.ts.
});

