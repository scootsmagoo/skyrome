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

/**
 * The day's recipient, and what the walk is worth (asses, by distance from the Velia). `hail` and
 * `thanks` are said where the recipient's own talk has no life lines (src/life/jobs/handover.ts).
 */
const ROUTES: { id: string; npc: string; who: string; text: string; journal: string; pay: number; hail: string; thanks: string }[] = [
  {
    id: 'philetus',
    npc: 'npc-philetus',
    who: 'Philetus, who keeps the Temple of Castor in the Forum',
    hail: '(Philetus sees the seal before he sees you.) The house of Vettius Rufinus? For me? Give it here, carefully: that is a senator’s wax, not yours.',
    thanks: '(He turns the letter over twice and does not open it in front of you.) It came whole. Take this for your legs; the house said you would be owed it.',
    text: 'Carry the letter to Philetus at the Temple of Castor',
    journal: 'The letter was for Marcus Pomponius Philetus, who keeps the Temple of Castor in the Forum.',
    pay: 4,
  },
  {
    id: 'zethus',
    npc: 'npc-zethus',
    who: 'Zethus, the magistrate of the Vicus Tuscus, at its crossroads shrine',
    hail: '(Zethus squints at the seal.) Rufinus’ ring. I know it. For the magistrate of the street, or for Zethus the freedman? Both, I expect.',
    thanks: '(He tucks it into his belt with the wax unbroken.) Arrived, and whole. Here: the house pays its errands, and I pay for the house.',
    text: 'Carry the letter to Zethus, magistrate of the Vicus Tuscus',
    journal: 'The letter was for Marcus Lucretius Zethus, the magistrate of the Vicus Tuscus, who keeps its crossroads shrine.',
    pay: 6,
  },
  {
    id: 'dama',
    npc: 'npc-dama',
    who: 'Dama, at the Inn at the Starting Gates by the Circus',
    hail: '(Dama wipes his hands on his apron before he will touch it.) A letter? For me? From a senator’s house? Either I’m in luck or I’m in trouble.',
    thanks: '(He holds it at arm’s length, unopened, and counts some asses into your hand.) For the walk. I’ll read it sitting down. Whatever it says, it says it to me.',
    text: 'Carry the letter to Dama at the Inn at the Starting Gates',
    journal: 'The letter was for Lucius Novius Dama, who keeps the inn by the starting gates of the Circus. A long walk for a short letter.',
    pay: 8,
  },
];

const variants: JobStep[][] = ROUTES.map((r) => [
  {
    id: r.id,
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
    talk: {
      offer: '(The doorkeeper holds up a folded tablet, tied with thread and sealed in red wax.) You there. The master has a letter that wants carrying, and you have legs. The man it is for pays a few asses for the walk. Well?',
      taken: (g) => {
        const r = ROUTES[Number(g.quests?.state(JOB_ID)?.vars.variant) || 0] ?? ROUTES[0];
        return `(The letter is pressed into your hand.) For ${r.who}. Mind the seal: it is the master’s wax, not yours.`;
      },
      steps: Object.fromEntries(ROUTES.map((r) => [r.id, { hail: r.hail, thanks: r.thanks }])),
    },
    done: 'I handed over the letter with its seal unbroken, and the fee came with it, as the doorkeeper had promised: a client’s errand, a client’s wage.',
    failed: 'Night fell with the patron’s letter still undelivered, and a slave of the house came to take it back from me without a word.',
  },
);
