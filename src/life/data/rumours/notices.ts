/**
 * Painted and scratched notices for the four boards (world-life.md §4.9, the CITY VOICE crew). Each
 * board shows today's picks (activities/boards, C's rule). Rooms to let copy the Pompeian lease
 * style (CIL IV 138) [A, Pompeii]; lost-and-found copies the Pompeian dog and slave notices; games
 * playbills show only on a show day (arena/munus.ts). Hooked notices carry a job id (docs/design/
 * world-life.md §4.7) and show only after mq-01 (STORY rule 2); the job drops them once it has
 * started. The side quests' notices are the quest crews' own (rumours/quests-f.ts, quests-g.ts).
 * Nothing here names a ruler after AD 113 or the Pepper Warehouses.
 */
import { munusOn } from '../../../arena/munus';
import type { Game } from '../../../core/Game';
import { defineLife } from '../../types';

/** A show is on today (arena/munus.ts: the season, minus the rest days). */
const showToday = (g: Game) => munusOn(g.time.date(), g.time.dayIndex) !== null;

/** After mq-01: the city has a reason to read its walls (STORY rule 2). */
const afterMq01 = { questDone: 'mq-01-madida-capena' };

export default defineLife({
  rumours: [
    // ---- games playbills (on show days only)
    { id: 'rum.notices.playbill-games', kind: 'notice', boards: ['board-meta', 'board-forum'], gate: { if: showToday }, latin: 'VELA · ERVNT', text: 'Games in the Flavian amphitheatre today, by the gift of Caesar: pairs of gladiators, a beast hunt before noon, and awnings for all the citizens. Seats by the rank of your tunic.', period: 'Painted games playbill, “vela erunt” (CIL IV 1180) [A, Pompeii]' },
    { id: 'rum.notices.playbill-card', kind: 'notice', boards: ['board-meta', 'board-subura'], gate: { if: showToday }, latin: 'MVNERA · GLADIATORVM', text: 'Pairs of gladiators on the card today. Secutor against retiarius, murmillo against thraex. Free bets at the stairs, and no bets at all within sight of the Vigiles.', period: 'Painted card of the day, the Pompeian arena notices [A, Pompeii]' },
    { id: 'rum.notices.playbill-tables', kind: 'notice', boards: ['board-ceres', 'board-forum'], gate: { if: showToday }, text: 'Dice and bones in the portico of the Basilica, every show day, for those who keep the peace. Losers are not welcome to complain to the Vigiles, who lose too.', period: 'Gaming tolerated outside the Saturnalia [A]' },
    // ---- rooms to let (the Pompeian lease style, CIL IV 138)
    { id: 'rum.notices.lease-velabrum', kind: 'notice', boards: ['board-ceres', 'board-subura'], latin: 'LOCANTVR · CVM · PERGVLIS', text: 'To let from the Kalends of July: a shop with a booth on the Velabrum, its upper rooms, and a well in the yard. Ask for Sosia, the owner’s freedwoman, at the bakery next door.', period: 'Lease notices with shop and rooms above, CIL IV 138 pattern [A, Pompeii]' },
    { id: 'rum.notices.lease-subura', kind: 'notice', boards: ['board-subura'], latin: 'CENACVLA · LOCANTVR', text: 'Upper rooms to let in the insula of Lucius Fannius, over the cook’s on the Vicus Patricius. Water from the fountain on the stair, and a window that catches the sun in winter. Apply to the porter.', period: 'Insula upper rooms, Subura [A, Pompeii]' },
    { id: 'rum.notices.lease-aventine', kind: 'notice', boards: ['board-ceres'], latin: 'DOMVS · LOCATVR', text: 'A small house to let on the Aventine for one year, with a yard, a cistern and a stable for two mules. Quiet neighbours, apart from the priests of Diana. Ask for Aulus at the temple gate.', period: 'Lease notices for houses [A, Pompeii]' },
    { id: 'rum.notices.lease-forum', kind: 'notice', boards: ['board-forum'], latin: 'TABERNA · LOCATVR', text: 'A shop with a counter and a back room under the arcade of the Basilica, to let to a respectable man. Rent paid by the quarter, in advance, to the banker opposite. No tanners, no coppersmiths, no noise.', period: 'Shops under porticoes, Forum Romanum [A]' },
    // ---- lost and found
    { id: 'rum.notices.lost-ass', kind: 'notice', boards: ['board-subura'], text: 'A grey she-ass went astray from the Subura fountain, with a rope on her neck and a red wool band on her tail. Whoever brings her to the fuller Cerinthus is paid four sesterces.', period: 'Lost-and-found notices [A, Pompeii]' },
    { id: 'rum.notices.lost-ring', kind: 'notice', boards: ['board-forum', 'board-ceres'], latin: 'ANVLVS · PERDITVS', text: 'A gold ring with a carved garnet, lost in the baths of Trajan on the eighth hour. A reward of one denarius to whoever brings it to the bath attendant. No questions asked, and none answered.', period: 'Lost-property notices in baths [A, Pompeii]' },
    { id: 'rum.notices.lost-purse', kind: 'notice', boards: ['board-meta'], text: 'A leather purse with four denarii and a wax tablet inside went missing near the Meta Sudans. Its owner forgives everybody who returns it, and he means it, this time.' },
    { id: 'rum.notices.lost-slave', kind: 'notice', boards: ['board-forum', 'board-subura'], latin: 'FVGITIVVS', text: 'A boy of about twelve, named Hyacinthus, ran from the house by the Basilica Paulli. Brown hair, bare feet, a burn on his left hand. Ten denarii to whoever hands him to the owner’s door.', period: 'Runaway slave notices (CIL IV 3 and 4) [A, Pompeii]' },
    // ---- job hooks (after mq-01, or when the job itself opens: the letter after mq-02, the bout
    // after lud-01, §4.11). The side quests' own notices are in quests-f.ts and quests-g.ts.
    { id: 'rum.notices.job-porter', kind: 'notice', boards: ['board-ceres'], gate: afterMq01, hook: 'job-portus-saccarius', latin: 'OPERARII · QVAERVNTVR', text: 'Porters wanted at the river port below the cattle market, for the oil barges, all the working day. Twelve asses for three amphorae, paid on the spot. Ask for the tally clerk at the storehouse door.', period: 'Labour notices for the Ostia and Rome trades [P]' },
    { id: 'rum.notices.job-bread', kind: 'notice', boards: ['board-subura'], gate: afterMq01, hook: 'job-subura-pistor', latin: 'PANIS · QVAERITVR', text: 'The baker by the Vicus Patricius wants a boy with quick feet to carry the morning rolls round the Subura. Six asses and a loaf for the round. Start at the fourth watch, before the grumpy customers wake.', period: 'Baker’s boys and the bread round [P]' },
    { id: 'rum.notices.job-letter', kind: 'notice', boards: ['board-forum'], gate: { questDone: 'mq-02-tabella' }, hook: 'job-cliens-epistula', text: 'A patron on the Velia needs a reliable man to carry his letters round the Forum. Good shoes, a clean tunic, and a face no one remembers. Ask at the Velia door before the sportula is gone.', period: 'Clientela, letters and the morning salutatio [A]' },
    { id: 'rum.notices.job-ludus', kind: 'notice', boards: ['board-meta'], gate: { questCompleted: 'lud-01-sacramentum' }, hook: 'job-ludus-lusio', latin: 'RVDIS · LVSIO', text: 'The Ludus wants a free man for one practice bout with wooden arms, at the drill hours, for a purse and a bath. Nobody dies in practice. Ask for Asiaticus at the gate.', period: 'Ludus practice bouts with wooden weapons [A]' },
  ],
});
