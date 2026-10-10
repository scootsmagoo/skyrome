/**
 * job-cliens-epistula "The Patron's Letter" (docs/design/world-life.md §4.7, §4.5 the salutatio):
 * after the morning greeting at Gaius Vettius Rufinus' door on the Velia, his doorkeeper (the
 * SERVICES crew's keeper-velia-ostiarius) gives a client a sealed letter to carry. The recipient is
 * the day's: Philetus at the Temple of Castor (4 asses), Zethus at the Vicus Tuscus shrine (6) or
 * Dama at the Inn at the Starting Gates (8), paid by the distance. Offered once a day, on one day in
 * two, after the sportula has been taken that morning (runtime.ts remembers it) and once mq-02 is
 * done (§4.11). Given up at nightfall, twelve game hours on.
 *
 * Rufinus is fictional and never speaks (STORY rule 5); the letter's seal stays unbroken.
 */
import { defineJob } from '../../life/jobs/defineJob';
import { SPORTULA } from '../../life/jobs/runtime';
import type { JobStep } from '../../life/types';
import { AS } from '../../rpg/money';

export const JOB_ID = 'job-cliens-epistula';
/** The catalogue's sealed note from a patron's house (src/rpg/data/items/quest.ts). */
export const LETTER = 'quest-epistula-patroni';

/** The day's recipient, and what the walk is worth (asses, by distance from the Velia). */
const ROUTES: { npc: string; text: string; journal: string; pay: number }[] = [
  {
    npc: 'npc-philetus',
    text: 'Carry the letter to Philetus at the Temple of Castor',
    journal: 'The letter was for Marcus Pomponius Philetus, who keeps the Temple of Castor in the Forum.',
    pay: 4,
  },
  {
    npc: 'npc-zethus',
    text: 'Carry the letter to Zethus, magistrate of the Vicus Tuscus',
    journal: 'The letter was for Marcus Lucretius Zethus, the magistrate of the Vicus Tuscus, who keeps its crossroads shrine.',
    pay: 6,
  },
  {
    npc: 'npc-dama',
    text: 'Carry the letter to Dama at the Inn at the Starting Gates',
    journal: 'The letter was for Lucius Novius Dama, who keeps the inn by the starting gates of the Circus. A long walk for a short letter.',
    pay: 8,
  },
];

const variants: JobStep[][] = ROUTES.map((r) => [
  {
    id: 'deliver',
    text: r.text,
    target: { kind: 'npc', id: r.npc },
    done: { deliver: { item: LETTER, count: 1, to: r.npc } },
    give: [{ item: LETTER, count: 1 }],
    journal: r.journal,
  },
]);

export default defineJob(
  {
    id: JOB_ID,
    title: 'The Patron’s Letter',
    latin: 'Epistula patroni',
    summary: 'Carry a sealed letter from Gaius Vettius Rufinus’ house on the Velia to the man it is addressed to.',
    giver: 'keeper-velia-ostiarius',
    // On one day in two (12 May is the first), and only after this morning's greeting at the door.
    offer: { questDone: 'mq-02-tabella', if: (g) => g.time.dayIndex % 2 === 1 && (g.life?.store.today(SPORTULA) ?? 0) > 0 },
    daily: 1,
    limitHours: 12,
    pay: 4 * AS,
    steps: variants[0],
    variants,
    period: 'The morning salutatio and the client’s small services to his patron (Martial 3.7, Juvenal 1.95–126) [A]; the letter is invented [G]',
  },
  {
    intro: 'After the morning greeting the doorkeeper at Vettius Rufinus’ house gave me a sealed letter to carry for his master, and the name of the man waiting for it.',
    pay: (q) => (ROUTES[Number(q.vars.variant) || 0]?.pay ?? 4) * AS,
    done: 'I handed over the letter with its seal unbroken, and the fee came with it, as the doorkeeper had promised: a client’s errand, a client’s wage.',
    failed: 'Night fell with the patron’s letter still undelivered, and a slave of the house came to take it back from me without a word.',
  },
);
