/**
 * Services crew, the four notice boards (docs/design/world-life.md §4.5). Each stands on a painted
 * board the landmark builders already made, and takes over its "Read" prompt (`replaces`). Their
 * notices come from the CITY VOICE crew's rumours (src/life/data/rumours/notices.ts, `kind:
 * 'notice'`, `boards: ['board-…']`); a hooked notice offers "Note it down", which starts a quest.
 *
 * The boards give nothing until mq-01 is done, so the opening keeps its own notices (the Hilara
 * notice and the Subura board are painted into the first day), and `docs/STORY.md` rule 2 holds.
 *
 *  - board-subura: the compitum board of the Subura (capfora-nerva, spot 'notice')
 *  - board-forum:  the herald's painted notice in the Forum of Caesar (spot 'praeco-notice')
 *  - board-ceres:  the aediles' album on the podium of the Temple of Ceres (spot 'temple-ceres-album')
 *  - board-meta (the builder's own playbill text prompt beside it is a different interactable and stays):   the games-programme wall at the Meta Sudans (spot 'meta-sudans-playbill')
 */
import { defineLife } from '../../types';

const AFTER_OPENING = { questDone: 'mq-01-madida-capena' };

export default defineLife({
  activities: [
    {
      id: 'act.subura.board',
      name: 'Notice board of the vicus',
      verb: 'Read the notices',
      at: { landmarkSpot: 'subura:notice', replaces: 'capfora:subura:notice' },
      gate: AFTER_OPENING,
      intro: 'Red letters on whitewash, painted over and over: the magistri’s list, a lease, a lost animal, a vote.',
      board: 'board-subura',
      period: 'Painted notices (programmata, edicta) on Pompeii’s walls; the vicomagistri’s boards at the compita [A, Pompeii]',
    },
    {
      id: 'act.forum.board',
      name: 'Notice board in the Forum of Caesar',
      verb: 'Read the notices',
      at: { landmarkSpot: 'forum-caesar:praeco-notice', replaces: 'capfora:forum-caesar:praeco-notice' },
      gate: AFTER_OPENING,
      intro: 'A board on two posts by the herald’s stand, whitewashed afresh every few days and as soon covered. The big letters are the dedication; the small ones are everyone else’s business.',
      board: 'board-forum',
      period: 'The praeco’s announcements and painted albums in the fora [A]; the board itself [G]',
    },
    {
      id: 'act.ceres.board',
      name: 'The aediles’ album',
      verb: 'Read the notices',
      at: { landmarkSpot: 'temple-ceres-album', replaces: 'palcirc:temple-ceres-album' },
      gate: AFTER_OPENING,
      intro: 'The whitened album on the podium wall of the Temple of Ceres, where the aediles of the plebs have their edicts painted: markets, weights, the grain, the streets.',
      board: 'board-ceres',
      period: 'The aediles of the plebs kept their archive at the Temple of Ceres (Livy 3.55.7) [A]; the album [G]',
    },
    {
      id: 'act.meta.board',
      name: 'The games-wall at the Meta Sudans',
      verb: 'Read the notices',
      at: { landmarkSpot: 'meta-sudans-playbill', replaces: 'colos:meta-sudans-playbill' },
      gate: AFTER_OPENING,
      intro: 'Where the crowd for the amphitheatre goes by, a whitewashed stretch of wall carries the programme and everything else that people want a crowd to read.',
      board: 'board-meta',
      period: 'Painted games notices, “vela erunt” (CIL IV 1180, 3884) [A, Pompeii]; the wall at the Meta [G]',
    },
  ],
});
