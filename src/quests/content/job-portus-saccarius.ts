/**
 * job-portus-saccarius "Porter at the River Port" (docs/design/world-life.md §4.7): Thallus, the
 * tally clerk on the quay by the harbour office, hires the player for a load of Spanish oil. Three
 * times: shoulder an amphora from the heap off the barge (act.portus.amphorae), carry it down the
 * quay to the storeroom door under the HORREA sign and hand it to Daphnus the storekeeper. The jar
 * is heavy: the player walks at a porter's pace and can't sprint or jump while carrying it
 * (src/life/jobs/runtime.ts). 12 asses, a labourer's day [P]; twice a day, while the port works,
 * after the opening. Given up after six game hours: the jar goes back and nothing is paid.
 */
import { defineJob } from '../../life/jobs/defineJob';
import { stationTarget, ST_HORREUM, ST_TABULARIUS } from '../../life/jobs/posts';
import type { JobStep } from '../../life/types';
import type { ItemDef } from '../../rpg/types';
import { AS } from '../../rpg/money';

export const JOB_ID = 'job-portus-saccarius';
export const AMPHORA = 'quest-amphora-olei';

/** The job's goods: a quest item (it can't be sold or dropped); 'heavy' slows the bearer. */
export const items: ItemDef[] = [
  {
    id: AMPHORA,
    name: 'Amphora of Oil',
    latin: 'amphora olearia',
    type: 'quest',
    questItem: true,
    weight: 0,
    value: 0,
    icon: '⚱',
    description: 'A fat, round-bellied jar of Baetican olive oil, stamped on the handle by the estate that filled it. Heavy enough that you can only walk with it.',
    tags: ['job', 'heavy', 'carry:amphora'],
  },
];

const HEAP = stationTarget(ST_TABULARIUS, { dressing: 0 });
const DOOR = stationTarget(ST_HORREUM, { member: 0 });

const take = (n: number, journal: string): JobStep => ({
  id: `take${n}`,
  text: n === 1 ? 'Shoulder an amphora from the heap by the tally clerk' : 'Fetch the next amphora from the quay',
  target: HEAP,
  done: { use: 'act.portus.amphorae' },
  journal,
});

const carry = (n: number, journal: string): JobStep => ({
  id: `carry${n}`,
  text: `Carry the amphora to Daphnus at the storeroom door (${n} of 3)`,
  target: DOOR,
  done: { deliver: { item: AMPHORA, count: 1, to: 'keeper-portus-horrearius' } },
  give: [{ item: AMPHORA, count: 1 }],
  journal,
});

export default defineJob(
  {
    id: JOB_ID,
    title: 'Porter at the River Port',
    latin: 'Saccarius',
    summary: 'Carry three amphorae of oil from the quay to the storeroom door for Thallus, the tally clerk of the river port.',
    giver: 'keeper-portus-tabularius',
    // Offered while Thallus is at his post (the port's working day); after the opening (defineJob).
    offer: {},
    daily: 2,
    // A load left half carried is given up by the evening, and the jar goes back to the quay.
    limitHours: 6,
    pay: 12 * AS,
    steps: [
      take(1, 'Thallus, the tally clerk at the river port, took me on as a porter: three amphorae of Spanish oil from the barge to the storeroom door, twelve asses for the lot.'),
      carry(1, 'I got the first amphora onto my shoulder. It weighed as much as a child, and I could only walk with it.'),
      take(2, 'Daphnus the storekeeper took the first jar at the door and scratched a line on his tablet. Two more were waiting on the quay.'),
      carry(2, 'The second amphora went up onto my shoulder. My back had already made up its mind about the work.'),
      take(3, 'Two jars in. Thallus watched me walk back for the last one and made a note of his own.'),
      carry(3, 'The last amphora. The quay seemed longer than it had in the morning.'),
    ],
    period: 'Saccarii at the river ports [A]; a labourer’s wage of about 12 asses a day [P]',
  },
  {
    done: 'Daphnus counted three jars in, Thallus counted three jars out, and for once the numbers agreed. I was paid twelve asses.',
    failed: 'I left the oil half carried, and Thallus found someone else’s shoulders. Nobody pays for half a load.',
  },
);
