/**
 * Offers and leads of the first three side quests (docs/design/world-life.md §4.8, QUESTS I): the
 * painted notices and the folk talk that bring the player to Hilara (misc-hilara), the Bronze Pot
 * (misc-urna-aenea) and the Bath Thief (misc-fur-balnearius). A rumour with a `hook` shows only
 * after mq-01 is done and disappears the moment its quest has started; a missed offer keeps coming
 * back on other days. The unhooked ones are the quests' leads and echoes.
 */
import { defineLife } from '../../types';

export default defineLife({
  rumours: [
    // ---------------------------------------------------------------- Q1. Hilara
    {
      id: 'rum.quests-f.hilara-notice',
      kind: 'notice',
      boards: ['board-forum'],
      hook: 'misc-hilara',
      latin: 'CANIS · MOLOSSA · AVFVGIT',
      text: 'Lost: a Molossian bitch named Hilara, with a bronze bulla at her neck, answering to nothing, gone since the eighth day before the Ides of May. Bring her to Tryphon the barber, in the shops of the Basilica Paulli, and have twenty sesterces.',
      period: 'Lost-and-found notices painted on walls [A, Pompeii]; Molossian hounds [A]; this notice [G]',
    },
    {
      id: 'rum.quests-f.hilara-talk',
      kind: 'talk',
      districts: ['dist-forum-romanum'],
      hook: 'misc-hilara',
      text: 'Tryphon the barber has a lost dog on his mind: a Molossian bitch called Hilara, the aedile’s man’s. Twenty sesterces to whoever fetches her. She answers to nothing, he says, which is how you know she’s a dog.',
      period: '[G]',
    },
    {
      id: 'rum.quests-f.hilara-lead',
      kind: 'talk',
      districts: ['dist-circus-maximus'],
      gate: { questRunning: 'misc-hilara' },
      weight: 4,
      text: 'A big Molossian with a bronze bulla runs with the stray pack behind the starting gates. Only at dusk, mind. By day they’re under the arches, asleep, and the stable-lads throw things.',
      period: '[G]',
    },
    // ---------------------------------------------------------------- Q2. The Bronze Pot
    {
      id: 'rum.quests-f.pot-notice',
      kind: 'notice',
      boards: ['board-forum', 'board-subura'],
      hook: 'misc-urna-aenea',
      latin: 'VRNA · AENEA · PEREIT · DE · TABERNA',
      text: 'A bronze pot has gone from this shop, in the Vicus Tuscus. Whoever brings it back gets 65 sesterces; whoever hands over the thief, 20 more. Ask for Primus the coppersmith.',
      period: 'A real Pompeian notice, “Urna aenea pereit de taberna”, CIL IV 64 [A, Pompeii]; the shop and the name [G]',
    },
    {
      id: 'rum.quests-f.pot-talk',
      kind: 'talk',
      districts: ['dist-velabrum-boarium', 'dist-forum-romanum'],
      hook: 'misc-urna-aenea',
      text: 'Primus the coppersmith in the Vicus Tuscus has lost a bronze pot out of his own shop. Sixty-five sesterces for it, twenty more for the thief. He suspects everyone but the apprentice, which is where I’d look first.',
      period: '[G]',
    },
    {
      id: 'rum.quests-f.pot-subura',
      kind: 'talk',
      districts: ['dist-subura'],
      gate: { questDone: 'mq-01-madida-capena' },
      weight: 0.5,
      text: 'There’s a woman who stands in a doorway off the Argiletum who will buy anything, from the afternoon on, and ask nothing. Don’t tell her I said so.',
      period: '[G]',
    },
    // ---------------------------------------------------------------- Q3. The Bath Thief
    {
      id: 'rum.quests-f.bath-talk',
      kind: 'talk',
      hook: 'misc-fur-balnearius',
      gate: { questDone: 'mq-02-tabella' },
      text: 'A cloak a day goes from the pegs at the Baths of Titus. The attendants shrug. A bather tips the man at the door, or he goes home in his tunic and his temper.',
      period: 'Theft of clothes at the baths (Digest 1.15.3.5, 47.17); curse tablets against bath thieves, Bath in Britain [A]',
    },
    {
      id: 'rum.quests-f.bath-notice',
      kind: 'notice',
      boards: ['board-meta', 'board-forum'],
      hook: 'misc-fur-balnearius',
      gate: { questDone: 'mq-02-tabella' },
      latin: 'BALNEVM · PALLIA · PEREVNT',
      text: 'Bathers at the Baths of Titus are warned: cloaks go from the pegs. Give your cloak to the attendant at the side door and give him an as, or go home without it.',
      period: 'The warning is [G]; the theft, Digest 1.15.3.5 (the prefect of the watch hears cases against bath thieves) [A]',
    },
    {
      id: 'rum.quests-f.bath-fever',
      kind: 'talk',
      gate: { flag: 'bath-curse-ending' },
      weight: 3,
      text: 'Sabinus, the cloakroom man at the Titus, has a fever. Three days in his bed, shaking like a wet dog and calling for somebody called Mercury. Somebody must have prayed hard.',
      period: 'Curse tablets (defixiones) sent against bath thieves [A, outside Rome]; the result is left to the reader [G]',
    },
  ],
});
