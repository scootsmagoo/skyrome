/**
 * Rumours that offer the QUESTS II crew's side quests (docs/design/world-life.md §4.8 Q4-Q6): a talk
 * rumour, a painted notice and, for the first two, the crier's call. A hooked rumour is dropped once
 * its quest has started; the ones gated on a running quest are leads; the one gated on a flag reacts
 * to how the quest ended. No hook shows before mq-01 is done (the life runtime), and the island
 * case waits for the Lemuria night to be over (§4.11).
 */
import { defineLife } from '../../types';

export default defineLife({
  rumours: [
    // ---------------------------------------------------------------- Forged Tokens
    {
      id: 'rum.quests-g.tokens-talk',
      kind: 'talk',
      districts: ['dist-subura', 'dist-forum-holitorium', 'dist-forum-romanum'],
      hook: 'misc-tesserae-falsae',
      text: 'A freedman was turned away from the grain dole this morning with a lead token. The curator held it up to the light and said bad mould. Bad mould or bad friends, I say. Somebody in the Subura is pouring lead.',
      period: 'The grain dole by token [A/P]; the forgery is invented [G]',
    },
    {
      id: 'rum.quests-g.tokens-notice',
      kind: 'notice',
      boards: ['board-subura'],
      hook: 'misc-tesserae-falsae',
      latin: 'TESSERAE · FALSAE · FRANGENTUR',
      text: 'Grain tokens bought from anyone but the curator are false and will be broken. Whoever knows who is selling them may speak to the curator of the dole at the Porticus Minucia, in the morning, quietly.',
      period: 'Painted notices (programmata, edicta) on Pompeii’s walls [A, Pompeii]',
    },
    {
      id: 'rum.quests-g.tokens-cry',
      kind: 'cry',
      hook: 'misc-tesserae-falsae',
      text: 'Citizens of the list! The dole is given by the curator’s token and no other. A false token is lead, and lead breaks. Speak to the curator!',
      period: 'The crier [G]',
    },
    {
      id: 'rum.quests-g.tokens-lead',
      kind: 'talk',
      districts: ['dist-subura'],
      gate: { questRunning: 'misc-tesserae-falsae' },
      text: 'A lead-worker with a grey thumb dices by the popina on the Argiletum every evening. Wins when he is careless and loses when he is careful, which is the wrong way round for a dicer.',
      period: 'Dice after dark; gambling tolerated and scolded (Martial 4.14, 5.84) [A]',
    },
    {
      id: 'rum.quests-g.tokens-again',
      kind: 'talk',
      districts: ['dist-subura', 'dist-forum-holitorium'],
      gate: { flag: 'tokens-still-about' },
      text: 'Lead tokens at the dole again. The curator held one up to the light yesterday and said nothing at all. Somebody’s moulds went somewhere, I say, and I would not look in the Subura, where the fence keeps her back room.',
      period: 'Receivers of stolen goods (receptatores) were punished like thieves [P]',
    },

    // ---------------------------------------------------------------- Mercury's Water
    {
      id: 'rum.quests-g.mercury-talk',
      kind: 'talk',
      hook: 'misc-mercuralia',
      text: 'On the Ides every merchant in Rome will be at Mercury’s spring by the Capena Gate with a laurel branch and a jar, begging forgiveness. Fadia the perfumer goes early. The aediles’ clerk says some have more to be forgiven than others.',
      period: 'The Mercuralia (Ovid, Fasti 5.673-692) [A]',
    },
    {
      id: 'rum.quests-g.mercury-notice',
      kind: 'notice',
      boards: ['board-ceres', 'board-forum'],
      hook: 'misc-mercuralia',
      latin: 'MERCATORES · IDIBVS · MAIIS · AD · AQVAM · MERCVRII',
      text: 'The plebeian aediles remind merchants: on the Ides of May to the spring of Mercury. Measures will be proved by the aediles’ clerk at the Temple of Ceres. A false measure is a fine, and a tenth of the fine is the informer’s.',
      period: 'The aediles policed markets and measures [A]; painted edicta [A, Pompeii]',
    },
    {
      id: 'rum.quests-g.mercury-cry',
      kind: 'cry',
      hook: 'misc-mercuralia',
      text: 'Mercuralia on the Ides! Laurel and a jar for Mercury’s spring! Merchants, have your measures proved!',
      period: 'The crier [G]',
    },
    {
      id: 'rum.quests-g.mercury-septimius',
      kind: 'talk',
      districts: ['dist-velabrum-boarium'],
      gate: { questRunning: 'misc-mercuralia' },
      text: 'The oil-dealer at the cattle market has a very good price this year. A suspiciously good price. A man who can see through a jar says the jar is a sixth smaller than the sign.',
      period: 'The fraud is invented [G]',
    },

    // ---------------------------------------------------------------- Free by the God's Hand
    {
      id: 'rum.quests-g.daos-talk',
      kind: 'talk',
      districts: ['dist-forum-holitorium', 'dist-velabrum-boarium'],
      hook: 'misc-servus-aesculapii',
      gate: { questDone: 'mq-03-lemuria' },
      text: 'A slave left to die on the Island has got up and walked, they say. A Syrian cook. Now his master’s steward wants him back, and the god’s attendants say that is not how the god’s house works.',
      period: 'Claudius’ edict on slaves abandoned at the temple of Aesculapius (Suet. Claud. 25.2) [A]; the case is invented [G]',
    },
    {
      id: 'rum.quests-g.daos-notice',
      kind: 'notice',
      boards: ['board-ceres'],
      hook: 'misc-servus-aesculapii',
      gate: { questDone: 'mq-03-lemuria' },
      latin: 'SERVVS · AESCVLAPII · LIBER',
      text: 'By the edict of the deified Claudius a slave left sick at the temple of Aesculapius who recovers is free. A cook named Daos, on the Island, would be glad of witnesses to his arrival.',
      period: 'Claudius’ edict (Suet. Claud. 25.2) [A]; painted notices [A, Pompeii]',
    },
    {
      id: 'rum.quests-g.daos-witnesses',
      kind: 'talk',
      districts: ['dist-forum-holitorium', 'dist-velabrum-boarium'],
      gate: { questRunning: 'misc-servus-aesculapii' },
      text: 'Philo the temple attendant writes down every patient who is brought in. The carter Bato drives from the bridge. The patient with the bad leg sleeps in the porch and notices everything, and says so to anyone who gives him a denarius.',
      period: 'Incubation in the porches of Aesculapius [A]',
    },
  ],
});
