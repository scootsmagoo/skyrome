/**
 * The public crier's calls (world-life.md §4.9, the CITY VOICE crew). A 'cry' rumour is what
 * Cerdo (npc-cerdo, the public crier of the Vicus Tuscus) shouts; the crier reads one from today's
 * picks, and gates decide which calls fit the day. Market days (nundinae), games days (a show in
 * the amphitheatre, by arena/munus.ts), the Lemuria and the eve of the Mercuralia are covered.
 * Nothing here names a ruler after AD 113 or a main-quest secret (docs/STORY.md).
 */
import { munusOn } from '../../../arena/munus';
import type { Game } from '../../../core/Game';
import { defineLife } from '../../types';

/** A show is on today (arena/munus.ts: the season, minus the rest days). */
const showToday = (g: Game) => munusOn(g.time.date(), g.time.dayIndex) !== null;

export default defineLife({
  rumours: [
    { id: 'rum.cries.cerdo-hear', kind: 'cry', text: 'Hear, Quirites! The public crier calls you to the Vicus Tuscus, where the altar of the Lares is freshly painted and the magistrates are in good health!', period: 'Public crier’s calls, the cry as a formula [A, Pompeii]' },
    { id: 'rum.cries.cerdo-water', kind: 'cry', text: 'Hear, Quirites! The Aqua Traiana is running clear at the fountain by the Velia. Boil it, or drink it with your wine like a sensible citizen!' },
    { id: 'rum.cries.cerdo-lamps', kind: 'cry', text: 'Hear, Quirites! Shopkeepers keep your lamps on their hooks and your braziers in the yard. The Vigiles are walking the Vicus Tuscus tonight!' },
    { id: 'rum.cries.cerdo-carts', kind: 'cry', text: 'Hear, Quirites! No cart within the walls from sunrise to the tenth hour, builders’ carts excepted. Mind your feet, and mind the mules!', period: 'Tabula Heracleensis, carts by day [A]' },
    { id: 'rum.cries.cerdo-thief', kind: 'cry', text: 'Hear, Quirites! A purse has gone from a man’s belt in the Forum. Whoever has it, bring it back, and the Vigiles will not come to your door!', period: 'Crier’s reward for stolen goods [A, Rome]' },
    { id: 'rum.cries.market-boarium', kind: 'cry', gate: { marketDay: true }, text: 'Nundinae! Country cheese, honey and figs at the Forum Boarium! Oxen are cheaper by the pen, and the wine is cheaper by the cup!', period: 'The nundinae market day, country sellers in town [A]' },
    { id: 'rum.cries.market-holitorium', kind: 'cry', gate: { marketDay: true }, text: 'Market day! Cabbages, leeks, peas and the first cucumbers at the Holitorium! Come before the ninth hour, or fight the cooks for the last of them!' },
    { id: 'rum.cries.market-fish', kind: 'cry', gate: { marketDay: true }, text: 'Market day, Quirites! Fresh mullet from the Ostia boats, and salt fish for the poor! Ask the fishwife how fresh it is, and watch her face!' },
    { id: 'rum.cries.munus-today', kind: 'cry', gate: { if: showToday }, text: 'Hear, Quirites! Today in the Flavian amphitheatre: pairs of gladiators, a fair fight and a fair price! The awnings are up. Go early for the shade!', period: 'Games crier, “vela erunt” (CIL IV 1180) [A, Pompeii]' },
    { id: 'rum.cries.munus-favours', kind: 'cry', gate: { if: showToday }, text: 'Hear, Quirites! A show in the amphitheatre today. Bet on the Thracian if you love the sun, the Secutor if you love the shade, and the Caesar’s gift if you love the Caesar!' },
    { id: 'rum.cries.mercuralia-eve', kind: 'cry', gate: { dates: { from: [4, 14], to: [4, 14] } }, text: 'Tomorrow is the Mercuralia, Quirites! The merchants of the Velabrum keep the feast of Mercury, and the honest swear by the water. Mind your purses on the quay!', period: 'Mercuralia on 15 May, merchants’ feast [A]' },
    { id: 'rum.cries.lemuria', kind: 'cry', gate: { festival: 'fest-lemuria' }, text: 'Hear, Quirites! Lemuria: householders, rise at midnight, spit black beans over your shoulder, and do not look behind you! The dead are abroad, and they are not your business!', period: 'The Lemuria, the household rites of 9, 11 and 13 May [A]' },
    { id: 'rum.cries.games-amphora', kind: 'cry', gate: { festival: 'fest-ludi-apollinares' }, text: 'Hear, Quirites! The Apollinarian Games are on, with horses in the Circus and the good wine in the Forum! Keep your hands in your tunic, and your head out of the chariot’s way!', period: 'Ludi Apollinares, July [A]' },
  ],
});
