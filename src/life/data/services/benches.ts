/**
 * The mortar benches (docs/design/world-life.md §4.6): Demetrius of Tralles in the Basilica Paulli
 * (an as a use, while he is there) and Hermippus in the Ludus infirmary (free once lud-01 is done).
 * Their conversations add "Could I use your mortar?" through `lifeChoices` (the SERVICES crew's
 * edit to dialogue/content/vendors.ts for Demetrius; the JOBS and LUDUS crew's to ludus.ts for
 * Hermippus); the card, the fee and the gate are in src/life/craft/bench.ts.
 */
import { defineLife } from '../../types';

export default defineLife({
  services: [
    { npc: 'npc-demetrius', bench: 'mortar' },
    { npc: 'npc-hermippus', bench: 'mortar' },
  ],
});
