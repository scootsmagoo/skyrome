/**
 * One worked example of every life type (docs/design/world-life.md §3.2; docs/modules/life.md walks
 * through them). The '_' keeps this file out of the game: tests load it, and the dev build loads it
 * with `?lifex=1` (the LIFE-CORE acceptance shots). An example gives way to real data with the same
 * id or station post (registry.ts `withExamples`), so the example wine-seller steps aside once the
 * SHOPS crew's keeper-subura-vinarius exists.
 *
 * Copy a block into your own file under src/life/data/<lane>/ and change it; never import this.
 */
import { AS } from '../../rpg/money';
import { defineLife } from '../types';

export default defineLife({
  // ---------------------------------------------------------------- a keeper (SHOPS, SERVICES)
  keepers: [
    {
      // keeper-<district>-<trade>; it is also the NpcDef id and the merchant id (barter state).
      id: 'keeper-example-vinarius',
      district: 'dist-subura',
      // An existing station (crowd/trades.ts); its hours (`when`) are the shop's hours.
      station: 'st-subura-vinarius',
      // The ambient member who becomes this person (0: the "Wine-seller" behind the amphorae).
      member: 0,
      name: 'Sextus Pompeius Hedone',
      title: 'Wine-seller',
      barks: ['An as for the house wine, two for the better!', 'Taste before you buy. Then buy.'],
      // vendor is a VENDORS kind (rpg/data/vendors.ts, or vendors-life.ts); purse defaults to the kind's.
      shop: {
        vendor: 'popina',
        stock: [
          { id: 'vinum', count: 12 },
          { id: 'vinum-melius', count: 6 },
          { id: 'vinum-falernum', count: 2 },
          { id: 'mulsum', count: 4 },
          { id: 'acetum', count: 3 },
        ],
      },
      // The conversation: a person() spec without id, npcs or priority (content/people.ts). With a
      // shop, `trade` defaults to "Show me your wares." (barter) and haggling comes with it.
      talk: {
        greet: '(A thin man with wine-dark hands and a ladle tied to his belt.) Salve! Hedone’s, the best cellar on the Vicus Longus. An as for the house, two for the better, four if you want to remember Campania.',
        topics: [
          { ask: 'Where does the wine come from?', say: 'The house wine? The hills behind Tibur, in a cart, at night. The better one comes up the river from Ostia in amphorae with a Spanish stamp. The Falernian comes with a story. I tell it for free.' },
          { ask: 'Busy street.', say: 'The Subura never sleeps, and when it does it snores. By day the carts may not come in, so the porters carry everything, and by night the carts come in and nobody sleeps. Good for wine.' },
        ],
        news: 'What’s the word in the Subura?',
      },
      // Things to do with the keeper, in the panel (lifeChoices adds them to the conversation).
      services: [
        {
          id: 'taste',
          text: 'Pour me a taste',
          price: AS,
          daily: true,
          effects: [
            { kind: 'restore', target: 'stamina', amount: 20 },
            { kind: 'rumour' },
          ],
          result: ['(He pours a thumb’s depth into a clay cup.) Well? Tell your friends. And did you hear this:', 'There. Now you know why they come back. Here’s something else for nothing:'],
        },
      ],
      // Put up while the post is shut and the player is near (the stall stays out, shutters go up).
      closed: [{ kind: 'shutters', out: 4.3, side: 0.2 }],
      period: 'Hedone’s price list from the Pompeii popina (CIL IV 1679) [A, Pompeii]; the Subura wine trade [P]',
    },
  ],

  // ---------------------------------------------------------------- a service set (SERVICES)
  // Life lines for an existing named NPC: their hand-written dialogue spreads
  // `...lifeChoices('npc-cerinthus').choices` (and merges `.nodes`).
  services: [
    {
      npc: 'npc-cerinthus',
      services: [
        {
          id: 'laundry',
          text: 'Wash my clothes',
          price: 3 * AS,
          effects: [{ kind: 'clean', to: 'normal' }],
          result: 'Leave them with me. Urine and fuller’s earth, then the treading, then the sun. You’ll smell like a senator. A clean one.',
        },
      ],
    },
  ],

  // ---------------------------------------------------------------- things (SERVICES, everyone)
  activities: [
    {
      // act.<place>.<what>. A card in the conversation panel: an intro and the options.
      id: 'act.example.card',
      name: 'Bench outside the wine shop',
      verb: 'Sit',
      // A piece of a station's dressing (#0 of st-subura-vinarius is the heap of amphorae).
      at: { station: 'st-subura-vinarius', dressing: 0 },
      reach: 2.6,
      open: [{ from: 'h3', to: 'v2' }],
      closedText: 'The bench is stacked against the shutters for the night.',
      intro: ['A bench against the wall, sticky with old wine. The street goes by at knee height.', 'The bench is free. Across the street a fuller’s boy is shouting at a mule.'],
      options: [
        {
          id: 'drink',
          text: 'Sit with a cup and watch the street',
          price: AS,
          effects: [{ kind: 'hours', hours: 1 }, { kind: 'restore', target: 'stamina', amount: 'full' }],
          result: 'An hour goes by: a funeral, two arguments, a man selling sulphur matches for broken glass. The cup is empty.',
        },
      ],
      period: 'Benches outside tabernae: Pompeii, Via dell’Abbondanza [A, Pompeii]',
    },
    {
      // A notice board: today's notices for this board become the choices. On a builder's spot it
      // replaces that spot's "Read" prompt (the painted vicus notice in the Subura).
      id: 'act.example.board',
      name: 'Notice board of the vicus',
      verb: 'Read the notices',
      at: { landmarkSpot: 'subura:notice', replaces: 'capfora:subura:notice' },
      gate: { questDone: 'mq-01-madida-capena' },
      intro: 'Red letters on whitewash, painted over and over: the aedile’s list, a lease, a lost dog.',
      board: 'board-subura',
      period: 'Painted notices (programmata, edicta) on Pompeii’s walls [A, Pompeii]',
    },
  ],

  // ---------------------------------------------------------------- a recipe (CRAFT)
  recipes: [
    {
      id: 'rec.mortar.posca',
      bench: 'mortar',
      name: 'Mix posca',
      skill: 'medicina',
      minLevel: 0,
      inputs: [
        { item: 'acetum', count: 1 },
        { item: 'aqua', count: 1 },
      ],
      output: { item: 'posca', count: 2 },
      hours: 0.25,
      xp: 10,
      period: 'Posca, the soldier’s drink (Plutarch, Cato 1) [A]; simplified [G]',
    },
  ],

  // ---------------------------------------------------------------- a wager (CRAFT and GAMES)
  wagers: [
    {
      id: 'wgr.tali.subura',
      game: 'tali',
      // Per die showing a 1 or a 6, in denarii: 1 to 4 asses.
      stakes: [AS, 2 * AS, 3 * AS, 4 * AS],
      bank: 3,
      watchRadius: 18,
      period: 'Augustus’s rules, Suetonius Aug. 71 [A]; dicing tolerated, not legal (Martial 4.14, 5.84) [A]',
    },
  ],

  // ---------------------------------------------------------------- the city's voice (CITY VOICE)
  rumours: [
    { id: 'rum.example.wine-carts', kind: 'talk', districts: ['dist-subura'], text: 'Hedone swears his house wine comes from Tibur. It comes from the cart that comes from Tibur, which is not the same thing.', period: '[G]' },
    { id: 'rum.example.crier-games', kind: 'cry', text: 'Hear, Quirites! For the Column of the Best of Princes: games in the Flavian amphitheatre, pairs of gladiators, awnings against the sun!', gate: { questNotStarted: 'mq-04-columna' }, period: 'Painted games notices, “vela erunt” (CIL IV 1180) [A, Pompeii]' },
    {
      id: 'rum.example.lease',
      kind: 'notice',
      boards: ['board-subura', 'board-forum'],
      latin: 'LOCANTVR · EX · K · IVL · TABERNAE · CVM · PERGVLIS',
      text: 'To let from the Kalends of July, in the insula of Gnaeus Alleius: shops with their upper rooms, fine flats, a house. Ask for Primus, his slave.',
      period: 'The Insula Arriana Polliana lease, CIL IV 138 [A, Pompeii]; moved to Rome [G]',
    },
    { id: 'rum.example.lost-ass', kind: 'notice', boards: ['board-subura'], text: 'A grey she-ass, branded on the left haunch, went astray by the Subura fountain. Whoever brings her to the fuller Cerinthus gets 4 sesterces.', period: 'Lost-and-found notices [A, Pompeii]; this one [G]' },
    { id: 'rum.example.aedile', kind: 'notice', boards: ['board-subura', 'board-ceres'], latin: 'AEDILES · EDICVNT', text: 'The aediles give notice: no cart in the city from sunrise to the tenth hour, builders’ carts excepted. Shopkeepers keep the pavement clear.', period: 'Tabula Heracleensis on carts by day [A]' },
    { id: 'rum.example.vote', kind: 'notice', boards: ['board-subura'], latin: 'VICINI · ROGANT', text: 'The neighbours ask: make Lucius Ceius Secundus magister of the vicus. He is a good man.', period: 'Electoral programmata, “vicini rogant” [A, Pompeii]; the name [G]' },
    { id: 'rum.example.wall', kind: 'notice', boards: ['board-subura', 'board-forum'], hook: 'misc-insula-nutans', text: 'A carpenter who knows oak wanted, to look at a cracked wall in the insula by the Vicus Tuscus. Ask for the widow Prima on the second floor.', period: '[G]' },
    { id: 'rum.example.drain', kind: 'notice', boards: ['board-subura'], hook: 'misc-venus-cloacina', text: 'Ianuarius, keeper of the drains, asks whoever is lifting the grate by the shrine of Venus Cloacina to stop. He has oiled the bolt.', period: '[G]' },
    { id: 'rum.example.fullers', kind: 'notice', boards: ['board-subura'], latin: 'FVLLONES · VNIVERSI', text: 'The fullers, all of them, ask you to keep your pots off their sheets. A sheet is a week’s work.', period: 'Fullers’ programmata, “fullones universi” (CIL IV 7164) [A, Pompeii]' },
    { id: 'rum.example.cook', kind: 'notice', boards: ['board-subura'], text: 'Wanted at the cook-shop under the Circus arches: a boy who can carry and keep his fingers out of the pots. Four asses a day and his dinner.', weight: 0.5, period: '[G]' },
  ],
});
