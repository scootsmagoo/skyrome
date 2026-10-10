/**
 * The city at work (docs/research/trades.md): shops, workshops and the daily routines of AD 113,
 * as stations (stations.ts) that are manned at their hours and walked away from when they end.
 *
 *  - Before dawn: bakers at their mills and ovens (Martial 12.57: the bakers and the
 *    schoolmasters won't let you sleep). (The clients' salutatio at a patron's door on the Velia is a
 *    life station, src/life: the old post at Pliny's shut house is gone, world-life.md Appendix A.1.)
 *  - Morning: sacrifices before the temples, schoolmasters under the awnings with their boys,
 *    barbers in the street, the grain dole at the Porticus Minucia, booksellers in the Argiletum,
 *    fullers treading cloth, smiths, scribes and letter-writers by the courts.
 *  - Afternoon: the baths open at the eighth hour, and the crowd waits at the doors.
 *  - Evening and night: the thermopolia and popinae, dice and drink; the watch.
 *
 * Offsets are authored for the street's frontage and settled onto open ground at spawn time
 * (StationHost.settle), so a post that lands in a shopfront steps out to the pavement.
 */
import type { DayPhase } from './budget';
import type { StationDef } from './stations';

const MORNING: readonly DayPhase[] = ['salutatio', 'morning'];
const WORKDAY: readonly DayPhase[] = ['salutatio', 'morning', 'afternoon'];
const SHOP: readonly DayPhase[] = ['salutatio', 'morning', 'midday', 'afternoon'];
const SHOP_LATE: readonly DayPhase[] = ['morning', 'midday', 'afternoon', 'evening'];
const BATHS: readonly DayPhase[] = ['midday', 'afternoon'];
const EVENING: readonly DayPhase[] = ['evening', 'night'];
const NIGHT: readonly DayPhase[] = ['night', 'predawn'];
/** The Ludus drills: hours 1–6 and 8–10 (gladiatorDay in npc/content/ludus.ts). */
const DRILL: readonly DayPhase[] = ['salutatio', 'morning', 'afternoon'];

export const TRADES: readonly StationDef[] = [
  // ================================================================ the Ludus Magnus
  // Tirones cut at the four pali in the court corners while the doctor calls the drill.
  ...[1, 2, 3, 4].map(
    (i): StationDef => ({
      id: `st-ludus-palus-${i}`,
      spot: `ludus-palus-${i}`,
      when: DRILL,
      members: [{ role: 'gladiator', out: 0, side: 0, loop: 'drill', face: 'out', prop: null, label: 'Tiro' }],
    }),
  ),
  {
    // The midday meal in the mess: barley porridge and beans (the hordearii, Pliny NH 18.72).
    id: 'st-ludus-mess',
    spot: 'ludus-ludus-mess',
    when: ['midday'],
    members: [
      { role: 'gladiator', out: 1.2, side: -0.8, loop: 'sitGround', face: 1.2, prop: null },
      { role: 'gladiator', out: 1.4, side: 0.9, loop: 'sitGround', face: -1.2, prop: null },
      { role: 'gladiator', out: 2.4, side: 0, loop: 'talk', face: 3.1, prop: null },
    ],
  },
  {
    // The school's smith keeps the arms in order.
    id: 'st-ludus-smithy',
    spot: 'ludus-ludus-smithy',
    when: WORKDAY,
    members: [{ role: 'artisan', out: 1.3, side: 0, loop: 'work', face: 3.14, prop: null, label: 'Smith', barks: 'worker' }],
    dressing: [{ kind: 'anvil', out: 1.85, side: 0 }],
  },
  {
    // A gladiator at the little shrine of Nemesis before the drill.
    id: 'st-ludus-nemesis',
    spot: 'ludus-ludus-shrine-nemesis',
    when: ['salutatio'],
    members: [{ role: 'gladiator', out: 1.1, side: 0, loop: 'pray', face: 3.14, prop: null }],
  },

  // ================================================================ the Forum and the Via Sacra
  {
    // The morning sacrifice at the altar before the Temple of Divus Julius: the priest at the
    // altar, the flute-player (tibicen) who drowns out ill-omened words, onlookers.
    id: 'st-forum-sacrificium',
    landmark: 'temple-divus-julius',
    gap: 4,
    when: MORNING,
    members: [
      { role: 'priest', out: 0.6, side: 0, loop: 'pray', face: 'in', prop: null, label: 'Priest' },
      { role: 'citizen', out: 0.9, side: 1.6, loop: 'stand', face: -1.2, prop: null, label: 'Tibicen', barks: 'tibicen' },
      { role: 'citizen', out: 2.8, side: -1.2, loop: 'stand', face: 'in', prop: null },
      { role: 'matron', out: 3.0, side: 0.6, loop: 'pray', face: 'in', prop: null },
    ],
    dressing: [{ kind: 'altar', out: -0.4, side: 0 }],
  },
  {
    // Letter-writers and scribes for hire by the courts of the Basilica Julia.
    id: 'st-forum-scriba',
    landmark: 'basilica-julia',
    gap: 2,
    when: SHOP,
    members: [
      { role: 'foreigner', out: 0.3, side: 6.2, loop: 'sit', face: 'out', prop: null, label: 'Scribe', barks: 'scriba', seat: true },
      { role: 'citizen', out: 1.6, side: 6.2, loop: 'talk', face: 'in', prop: null },
    ],
    dressing: [{ kind: 'scrolls', out: 0.95, side: 6.2 }],
  },
  {
    // Litigants and advocates arguing outside the centumviral court.
    id: 'st-forum-advocati',
    landmark: 'basilica-julia',
    gap: 2.5,
    when: ['morning'],
    members: [
      { role: 'senator', out: 0.8, side: -10, loop: 'talk', face: 1.4, prop: null, label: 'Advocate' },
      { role: 'client', out: 0.6, side: -8.6, loop: 'talk', face: -1.6, prop: 'scroll' },
      { role: 'citizen', out: 1.8, side: -9.2, loop: 'stand', face: 3.0, prop: null, label: 'Litigant' },
    ],
  },
  {
    // Pearl and jewel dealers of the Porticus Margaritaria on the Via Sacra.
    id: 'st-sacra-margaritarii',
    landmark: 'porticus-margaritaria',
    gap: 2,
    when: SHOP_LATE,
    members: [
      { role: 'merchant', out: 0.2, side: 0, loop: 'stand', face: 'out', prop: null, label: 'Pearl-dealer', barks: 'margaritarius' },
      { role: 'matron', out: 1.5, side: 0.3, loop: 'talk', face: 'in', prop: null },
      { role: 'attendant', out: 2.1, side: 1.2, loop: 'stand', face: 'in', prop: 'basket' },
    ],
    dressing: [{ kind: 'table', out: 0.75, side: 0 }],
  },
  {
    // Pepper and spices from the Horrea Piperataria (Domitian's spice warehouse on the Via Sacra).
    id: 'st-sacra-piperatarii',
    landmark: 'horrea-piperataria',
    gap: 2,
    when: SHOP,
    members: [
      { role: 'merchant', out: 0.2, side: 2, loop: 'stand', face: 'out', prop: null, label: 'Spice-dealer', barks: 'piperarius' },
      { role: 'porter', out: 0.8, side: 3.6, loop: 'stand', face: -1.57, prop: 'sack' },
      { role: 'citizen-woman', out: 1.5, side: 2.2, loop: 'talk', face: 'in', prop: 'basket' },
    ],
    dressing: [{ kind: 'stall-pots', out: 0.8, side: 2 }],
  },

  // ================================================================ the Argiletum and the Subura
  {
    // Booksellers of the Argiletum (Martial 1.3, 1.117): titles posted on the door-posts, a
    // copyist at work, a customer unrolling a book to read the first lines.
    id: 'st-argiletum-librarius',
    lane: 'argiletum',
    at: 0.14,
    when: SHOP_LATE,
    members: [
      { role: 'merchant', out: 3.6, side: 0, loop: 'stand', face: 'in', prop: null, label: 'Bookseller', barks: 'librarius' },
      { role: 'porter', out: 3.8, side: 1.4, loop: 'sit', face: 'in', prop: 'scroll', label: 'Copyist', seat: true },
      { role: 'foreigner', out: 2.2, side: -0.4, loop: 'stand', face: 'out', prop: 'scroll', label: 'Reader' },
    ],
    dressing: [{ kind: 'scrolls', out: 2.9, side: 0 }],
  },
  {
    // Cobblers: the Argiletum and the Vicus Sandalarius were the shoemakers' streets.
    id: 'st-argiletum-sutor',
    lane: 'argiletum',
    at: 0.3,
    when: WORKDAY,
    members: [
      { role: 'artisan', out: -3.4, side: 0, loop: 'sitGround', face: 'out', prop: null, label: 'Cobbler', barks: 'sutor' },
      { role: 'citizen', out: -2.2, side: 0.8, loop: 'stand', face: 'in', prop: null },
    ],
  },
  {
    // A thermopolium: hot food and spiced wine at the counter, all day and into the night.
    id: 'st-subura-thermopolium',
    lane: 'argiletum',
    at: 0.52,
    when: ['morning', 'midday', 'afternoon', 'evening', 'night'],
    members: [
      { role: 'merchant', out: 4.2, side: 0, loop: 'stand', face: 'in', prop: null, label: 'Thermopolium keeper', barks: 'thermopolium' },
      { role: 'artisan', out: 2.5, side: -0.6, loop: 'talk', face: 'out', prop: null },
      { role: 'porter', out: 2.6, side: 0.8, loop: 'stand', face: 'out', prop: null },
    ],
    dressing: [{ kind: 'counter', out: 3.4, side: 0 }],
  },
  {
    // Dice after dark outside a popina (Juvenal 8.172: a sailor, a thief, a runaway, coffin-makers).
    id: 'st-subura-alea',
    lane: 'argiletum',
    at: 0.7,
    when: EVENING,
    members: [
      { role: 'reveler', out: -3, side: -0.6, loop: 'sitGround', face: 1.57, prop: null, label: 'Dicer' },
      { role: 'reveler', out: -3, side: 0.7, loop: 'sitGround', face: -1.57, prop: null, label: 'Dicer' },
      { role: 'reveler', out: -2, side: 0, loop: 'cheer', face: 3.14, prop: 'torch' },
      { role: 'idler', out: -3.8, side: 0.2, loop: 'drunk', face: 0, prop: null },
    ],
  },
  {
    // A barber at work in the street (Martial 7.61: Domitian cleared the stalls, but the barbers
    // came back), a customer on the stool under the razor, the next one waiting.
    id: 'st-subura-tonsor',
    lane: 'clivus-suburanus',
    at: 0.2,
    when: ['salutatio', 'morning', 'midday'],
    members: [
      { role: 'citizen', out: 3.2, side: 0, loop: 'sit', face: 'out', prop: null, label: 'Customer', seat: true },
      { role: 'artisan', out: 3.0, side: 0.75, loop: 'talk', face: -1.57, prop: null, label: 'Barber', barks: 'tonsor' },
      { role: 'idler', out: 3.4, side: -1.6, loop: 'lean', face: 'out', prop: null },
    ],
  },
  {
    // A schoolmaster (ludi magister) under an awning with his boys from before dawn (Martial
    // 9.68: "the roosters haven't crowed and your savage voice is already roaring").
    id: 'st-subura-ludus-litterarius',
    lane: 'clivus-suburanus',
    at: 0.45,
    when: MORNING,
    members: [
      { role: 'elder', out: 3.4, side: 0, loop: 'talk', face: 'in', prop: 'scroll', label: 'Schoolmaster', barks: 'magister' },
      { role: 'child', out: 2.0, side: -1.2, loop: 'sitGround', face: 'out', prop: null, label: 'Schoolboy' },
      { role: 'child', out: 2.0, side: -0.2, loop: 'sitGround', face: 'out', prop: null, label: 'Schoolboy' },
      { role: 'child', out: 2.0, side: 0.8, loop: 'sitGround', face: 'out', prop: null, label: 'Schoolboy' },
      { role: 'child', out: 1.3, side: 0.3, loop: 'sitGround', face: 'out', prop: null, label: 'Schoolboy' },
    ],
  },
  {
    // A fullonica: fullers treading the cloth in the vats (saltus fullonicus), sheets drying.
    id: 'st-subura-fullonica',
    lane: 'vicus-patricius',
    at: 0.25,
    when: WORKDAY,
    members: [
      { role: 'attendant', out: 3.4, side: 0, loop: 'drunk', face: 'out', prop: null, label: 'Fuller', barks: 'fullo' },
      { role: 'artisan', out: 2.4, side: 1.6, loop: 'stand', face: 'in', prop: null, label: 'Fuller' },
    ],
    dressing: [{ kind: 'vats', out: 3.4, side: 0, turn: Math.PI }],
  },
  {
    // A pistrinum: the donkey turns the mill, the oven glows, loaves are sold at the door from
    // before dawn (Pompeii's bakeries; the tomb of Eurysaces the baker at the Porta Maggiore).
    id: 'st-subura-pistrinum',
    lane: 'vicus-patricius',
    at: 0.5,
    when: ['predawn', 'salutatio', 'morning'],
    members: [
      { role: 'artisan', out: 4.4, side: 1.4, loop: 'work', face: 'in', prop: null, label: 'Baker', barks: 'pistor' },
      { role: 'merchant', out: 2.6, side: -1.4, loop: 'stand', face: 'out', prop: null, label: 'Bread-seller', barks: 'pistor' },
      { role: 'citizen-woman', out: 1.5, side: -1.2, loop: 'stand', face: 'in', prop: 'basket' },
    ],
    dressing: [
      { kind: 'mill', out: 3.6, side: -3.2 },
      { kind: 'oven', out: 4.6, side: 2.6, turn: Math.PI },
      { kind: 'stall-food', out: 2.0, side: -1.4 },
    ],
  },
  {
    // A wine shop in the Subura with its amphorae out on the street.
    id: 'st-subura-vinarius',
    lane: 'vicus-longus',
    at: 0.3,
    when: SHOP_LATE,
    members: [
      { role: 'merchant', out: 3.4, side: 0.6, loop: 'stand', face: 'in', prop: null, label: 'Wine-seller', barks: 'vinarius' },
      { role: 'porter', out: 2.4, side: 1.6, loop: 'stand', face: 'out', prop: 'amphora' },
    ],
    dressing: [{ kind: 'amphorae', out: 3.6, side: -0.8 }],
  },
  {
    // The smith's forge on the Clivus Suburanus.
    id: 'st-subura-faber-ferrarius',
    lane: 'clivus-suburanus',
    at: 0.7,
    when: WORKDAY,
    members: [
      { role: 'artisan', out: -3.4, side: 0, loop: 'work', face: 'out', prop: null, label: 'Smith', barks: 'worker' },
      { role: 'attendant', out: -3.2, side: 1.4, loop: 'stand', face: -1.57, prop: null, label: 'Smith’s boy' },
    ],
    dressing: [
      { kind: 'anvil', out: -2.9, side: 0 },
      { kind: 'brazier', out: -3.6, side: -1.4 },
    ],
  },
  // ================================================================ the river: Velabrum, Boarium, Holitorium
  {
    // Smoked cheese of the Velabrum (Martial 11.52, 13.32).
    id: 'st-velabrum-caseus',
    lane: 'street-velabrum-pons-aemilius',
    at: 0.3,
    when: SHOP,
    members: [
      { role: 'merchant', out: 3.4, side: 0, loop: 'stand', face: 'in', prop: null, label: 'Cheese-seller', barks: 'caseus' },
      { role: 'citizen', out: 2.0, side: 0.4, loop: 'talk', face: 'out', prop: null },
    ],
    dressing: [
      { kind: 'stall-food', out: 2.7, side: 0 },
      { kind: 'brazier', out: 3.6, side: 1.6 },
    ],
  },
  {
    // The vegetable market (Forum Holitorium): farmers from the Campagna with their greens.
    id: 'st-holitorium-holitores',
    landmark: 'forum-holitorium',
    gap: 2,
    when: ['predawn', 'salutatio', 'morning'],
    members: [
      { role: 'farmer', out: -2, side: -3, loop: 'stand', face: 'out', prop: null, label: 'Greengrocer', barks: 'merchant' },
      { role: 'farmer', out: -2, side: 2.6, loop: 'stand', face: 'out', prop: null, label: 'Greengrocer', barks: 'merchant' },
      { role: 'citizen-woman', out: -0.8, side: -2.8, loop: 'talk', face: 'in', prop: 'basket' },
      { role: 'attendant', out: -0.6, side: 2.4, loop: 'stand', face: 'in', prop: 'basket' },
    ],
    dressing: [
      { kind: 'stall-food', out: -1.4, side: -3 },
      { kind: 'stall-food', out: -1.4, side: 2.6 },
    ],
  },
  {
    // Butchers at the cattle market (Forum Boarium), and a drover with his mule.
    id: 'st-boarium-lanii',
    landmark: 'forum-boarium',
    gap: 2,
    when: ['salutatio', 'morning', 'midday'],
    members: [
      { role: 'artisan', out: -2.2, side: 0, loop: 'work', face: 'out', prop: null, label: 'Butcher', barks: 'lanius' },
      { role: 'citizen', out: -0.8, side: 0.6, loop: 'talk', face: 'in', prop: null },
      { role: 'carter', out: -1.6, side: 5.2, loop: 'stand', face: 1.57, prop: null, label: 'Drover' },
    ],
    dressing: [{ kind: 'anvil', out: -1.7, side: 0 }],
  },
  {
    // Porters unloading amphorae at the river harbour (Portus Tiberinus).
    id: 'st-portus-saccarii',
    landmark: 'portus-tiberinus',
    gap: 3,
    when: WORKDAY,
    members: [
      { role: 'porter', out: 0.4, side: -2, loop: 'stand', face: 1.2, prop: 'amphora', label: 'Dock porter' },
      { role: 'porter', out: 1.2, side: -0.6, loop: 'stand', face: 'in', prop: 'sack', label: 'Dock porter' },
      { role: 'merchant', out: 1.0, side: 1.6, loop: 'talk', face: 3.14, prop: 'scroll', label: 'Tally clerk', barks: 'merchant' },
    ],
    dressing: [{ kind: 'amphorae', out: -0.4, side: 0.6 }],
  },

  // ================================================================ the Circus valley
  {
    // Fans of the Greens and the Blues arguing the last race (Juvenal 11.197–202; Pliny Ep. 9.6).
    id: 'st-circus-factiones',
    lane: 'street-north-of-circus',
    at: 0.36,
    when: ['morning', 'midday', 'afternoon'],
    members: [
      { role: 'citizen', out: -3.4, side: -0.6, loop: 'talk', face: 1.2, prop: null, label: 'Fan of the Greens', barks: 'factio' },
      { role: 'idler', out: -3.2, side: 0.7, loop: 'talk', face: -1.6, prop: null, label: 'Fan of the Blues', barks: 'factio' },
      { role: 'artisan', out: -4.2, side: 0, loop: 'cheer', face: 0, prop: null },
    ],
  },

  // ================================================================ the Colosseum valley
  {
    // Sellers of the day's programme (libelli) and cushions by the Meta Sudans.
    id: 'st-colos-libelli',
    landmark: 'meta-sudans',
    gap: 6,
    when: ['salutatio', 'morning', 'midday', 'afternoon'],
    members: [
      { role: 'merchant', out: 0.4, side: -2, loop: 'stand', face: 'out', prop: 'scroll', label: 'Programme-seller', barks: 'libelli' },
      { role: 'merchant', out: 0.6, side: 2.4, loop: 'stand', face: 'out', prop: 'tray', label: 'Hawker', barks: 'libelli' },
    ],
  },
  {
    // Sailors of the Misenum fleet off duty by their barracks (they work the Colosseum's awning).
    id: 'st-misenates',
    landmark: 'castra-misenatium',
    gap: 2,
    when: ['midday', 'afternoon', 'evening'],
    members: [
      { role: 'porter', out: 0.6, side: -0.8, loop: 'sitGround', face: 1.0, prop: null, label: 'Sailor of the fleet', barks: 'nauta' },
      { role: 'porter', out: 1.6, side: 0.4, loop: 'talk', face: 3.0, prop: null, label: 'Sailor of the fleet', barks: 'nauta' },
      { role: 'porter', out: 0.8, side: 1.4, loop: 'lean', face: 'out', prop: null, label: 'Sailor of the fleet', barks: 'nauta' },
    ],
  },
  {
    // The Baths of Trajan open at the eighth hour: the crowd waits for the bell (Martial 14.163).
    id: 'st-thermae-traiani',
    landmark: 'baths-trajan',
    gap: 3,
    when: BATHS,
    members: [
      { role: 'attendant', out: 0.4, side: 0, loop: 'guard', face: 'out', prop: null, label: 'Bath attendant', barks: 'balneator' },
      { role: 'citizen', out: 1.8, side: -1.2, loop: 'talk', face: 'in', prop: null },
      { role: 'citizen', out: 2.4, side: 0.2, loop: 'stand', face: 'in', prop: 'sack' },
      { role: 'idler', out: 2.0, side: 1.6, loop: 'talk', face: 'in', prop: null },
      { role: 'merchant', out: 3.4, side: -3, loop: 'stand', face: 'in', prop: 'tray', label: 'Sausage-seller', barks: 'botularius' },
    ],
  },
  {
    // The Baths of Titus, smaller and older, open at the same hour.
    id: 'st-thermae-titi',
    landmark: 'baths-titus',
    gap: 3,
    when: BATHS,
    members: [
      { role: 'attendant', out: 0.4, side: 0, loop: 'guard', face: 'out', prop: null, label: 'Bath attendant', barks: 'balneator' },
      { role: 'citizen', out: 1.6, side: 0.8, loop: 'talk', face: 'in', prop: null },
      { role: 'elder', out: 2.0, side: -0.6, loop: 'stand', face: 'in', prop: null },
    ],
  },
  {
    // Fish and meat at the Macellum Liviae on the Esquiline.
    id: 'st-macellum-liviae',
    landmark: 'macellum-liviae',
    gap: 2,
    when: ['salutatio', 'morning', 'midday'],
    members: [
      { role: 'merchant', out: 0.2, side: 0, loop: 'stand', face: 'out', prop: null, label: 'Fishmonger', barks: 'piscator' },
      { role: 'matron', out: 1.4, side: 0.2, loop: 'talk', face: 'in', prop: null },
      { role: 'attendant', out: 2.0, side: 1.2, loop: 'stand', face: 'in', prop: 'basket' },
    ],
    dressing: [{ kind: 'stall-food', out: 0.7, side: 0 }],
  },
  {
    // Wine by the Markets of Trajan (the Via Biberatica: "drinking street", in medieval memory).
    id: 'st-biberatica-vinum',
    lane: 'via-biberatica',
    at: 0.45,
    when: SHOP_LATE,
    members: [
      { role: 'merchant', out: 2.6, side: 0, loop: 'stand', face: 'in', prop: null, label: 'Wine-seller', barks: 'vinarius' },
      { role: 'citizen', out: 1.6, side: 0.8, loop: 'talk', face: 'out', prop: null },
    ],
    dressing: [{ kind: 'amphorae', out: 2.9, side: -1.3 }],
  },

  // ================================================================ the Campus Martius
  {
    // The grain dole (frumentatio) at the Porticus Minucia: citizens with their tokens queue for
    // the monthly five modii, an official checks the list, porters carry the sacks.
    id: 'st-minucia-frumentatio',
    landmark: 'porticus-minucia-frumentaria',
    gap: 2,
    when: ['morning'],
    members: [
      { role: 'merchant', out: 0.2, side: 0, loop: 'sit', face: 'out', prop: null, label: 'Curator of the dole', barks: 'frumentum', seat: true },
      { role: 'citizen', out: 1.4, side: 0, loop: 'stand', face: 'in', prop: null },
      { role: 'citizen', out: 2.3, side: 0.1, loop: 'stand', face: 'in', prop: null },
      { role: 'elder', out: 3.2, side: -0.1, loop: 'stand', face: 'in', prop: null },
      { role: 'citizen', out: 4.1, side: 0.2, loop: 'talk', face: 'in', prop: null },
      { role: 'citizen-woman', out: 5.0, side: 0, loop: 'stand', face: 'in', prop: 'basket' },
      { role: 'porter', out: 0.8, side: 2.2, loop: 'stand', face: -1.57, prop: 'sack' },
    ],
    dressing: [{ kind: 'table', out: 0.75, side: 0 }],
  },
  {
    // Luxury dealers in the Saepta Julia (Martial 9.59: Mamurra tries everything, buys two cups).
    id: 'st-saepta-mercatores',
    landmark: 'saepta-julia',
    gap: 2,
    when: SHOP_LATE,
    members: [
      { role: 'merchant', out: 0.2, side: -3, loop: 'stand', face: 'out', prop: null, label: 'Dealer in Corinthian bronzes', barks: 'saepta' },
      { role: 'senator', out: 1.4, side: -3, loop: 'talk', face: 'in', prop: null },
      { role: 'merchant', out: 0.2, side: 3, loop: 'stand', face: 'out', prop: null, label: 'Silk merchant', barks: 'saepta' },
    ],
    dressing: [
      { kind: 'table', out: 0.75, side: -3 },
      { kind: 'stall-cloth', out: 0.75, side: 3 },
    ],
  },
  {
    // The Baths of Agrippa: oil-sellers and bathers at the door from the eighth hour.
    id: 'st-thermae-agrippae',
    landmark: 'baths-agrippa',
    gap: 3,
    when: BATHS,
    members: [
      { role: 'attendant', out: 0.4, side: 0, loop: 'guard', face: 'out', prop: null, label: 'Bath attendant', barks: 'balneator' },
      { role: 'merchant', out: 1.6, side: -2.4, loop: 'sitGround', face: 'out', prop: null, label: 'Oil-seller', barks: 'merchant' },
      { role: 'citizen', out: 2.0, side: 0.6, loop: 'talk', face: 'in', prop: null },
    ],
  },

  // ================================================================ the Capitol
  {
    // A haruspex reads the entrails at the Capitoline altar; a client waits for the answer.
    id: 'st-capitolium-haruspex',
    landmark: 'temple-jupiter-capitolinus',
    gap: 6,
    when: MORNING,
    members: [
      { role: 'priest', out: 0.6, side: 0, loop: 'pray', face: 'in', prop: null, label: 'Haruspex', barks: 'haruspex' },
      { role: 'senator', out: 2.2, side: 0.8, loop: 'stand', face: 'in', prop: null },
      { role: 'attendant', out: 1.2, side: -1.6, loop: 'stand', face: 1.2, prop: null, label: 'Victimarius' },
    ],
    dressing: [{ kind: 'altar', out: -0.4, side: 0 }],
  },

  // ================================================================ the Aventine and the Emporium
  {
    // The Emporium below the Aventine: amphorae coming up from the Tiber barges.
    id: 'st-emporium-saccarii',
    landmark: 'emporium',
    gap: 3,
    when: WORKDAY,
    members: [
      { role: 'porter', out: 0.4, side: -1.6, loop: 'stand', face: 'in', prop: 'amphora', label: 'Dock porter' },
      { role: 'porter', out: 1.0, side: 1.0, loop: 'stand', face: 'out', prop: 'sack', label: 'Dock porter' },
      { role: 'merchant', out: 1.8, side: 0, loop: 'talk', face: 'in', prop: 'scroll', label: 'Shipper', barks: 'merchant' },
    ],
    dressing: [
      { kind: 'amphorae', out: -0.2, side: 0 },
      { kind: 'cart', out: 3.8, side: 4, turn: 1.57 },
    ],
  },

  // ================================================================ the watch at night
  {
    // The vigiles' station house of the First Cohort: the night watch with its buckets and axes.
    id: 'st-vigiles-i',
    landmark: 'statio-vigiles-i',
    gap: 2,
    when: NIGHT,
    members: [
      { role: 'vigil', out: 0.8, side: -0.8, loop: 'talk', face: 'center', prop: null },
      { role: 'vigil', out: 1.6, side: 0.6, loop: 'stand', face: 'center', prop: 'lantern' },
    ],
    dressing: [{ kind: 'brazier', out: 1.4, side: -0.2 }],
  },
  {
    id: 'st-vigiles-v',
    landmark: 'statio-vigiles-v',
    gap: 2,
    when: NIGHT,
    members: [
      { role: 'vigil', out: 0.8, side: -0.8, loop: 'talk', face: 'center', prop: null },
      { role: 'vigil', out: 1.6, side: 0.6, loop: 'stand', face: 'center', prop: 'lantern' },
    ],
    dressing: [{ kind: 'brazier', out: 1.4, side: -0.2 }],
  },
];
