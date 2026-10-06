/**
 * Golden-path checkpoints for testing: `?part=<id>` boots straight into one portion of the v0.1
 * opening with the quests, items and time of day it needs, as if the player had played up to it.
 * The README's "Testing the opening" table links each one.
 */
import type { Game } from '../core/Game';
import { scriptedDeath } from '../content/director';

export interface Checkpoint {
  id: string;
  /** What the tester plays from here. */
  label: string;
  /** Landmark to start at (as `?at=`). */
  at: string;
  hour: number;
  /** A quest location to stand at after the setup (where the landmark spawn would be off the mark). */
  place?: string;
  setup(game: Game): void;
}

const MQ01 = 'mq-01-madida-capena';
const MQ02 = 'mq-02-tabella';
const LUD01 = 'lud-01-sacramentum';
const TABLET = 'quest-tabella-signata';

function tablet(game: Game) {
  const inv = game.player?.inventory;
  if (inv && !inv.count(TABLET)) inv.add(TABLET, 1, { source: 'quest' });
}

/** mq-01 played: the courier dead, the tablet in the belt, the Forum reached (mq-02 then starts by itself). */
function afterArrival(game: Game) {
  game.quests.flags.set('festus-dead', true);
  tablet(game);
  game.quests.setStage(MQ01, 'done');
}

/** Up to the Ludus: Chrysippus fetched Gratus, Auctus named the Mouse (mq-02 'mus'). */
function afterAuctus(game: Game) {
  afterArrival(game);
  game.quests.flags.set('clue-mus', true);
  game.quests.setStage(MQ02, 'mus');
}

export const CHECKPOINTS: Checkpoint[] = [
  {
    id: 'city',
    label: 'After the ambush: the walk from the Porta Capena up the Circus valley to the Forum',
    at: 'porta-capena',
    hour: 5.8,
    setup: (game) => {
      tablet(game);
      game.quests.flags.set('festus-dead', true);
      scriptedDeath(game, 'npc-festus', 'npc-mus');
      game.quests.setStage(MQ01, 'city');
    },
  },
  {
    id: 'castor',
    label: 'In the Forum with the tablet: the Temple of Castor, its keeper and Gratus',
    at: 'miliarium-aureum',
    hour: 8.5,
    setup: afterArrival,
  },
  {
    id: 'ludus',
    label: 'Gratus sends you to find the man with the curved blade: the walk to the Ludus and Auctus',
    at: 'temple-castor-pollux',
    hour: 9.4,
    setup: (game) => {
      afterArrival(game);
      game.quests.setStage(MQ02, 'gratus');
    },
  },
  {
    id: 'oath',
    label: 'At the Ludus: sign on with Glaucus, draw the practice arms, the first bout',
    at: 'ludus-magnus',
    hour: 10,
    setup: (game) => {
      afterAuctus(game);
      game.quests.start(LUD01);
    },
  },
  {
    id: 'evening',
    label: 'The bouts are won: wait for the evening (T), then the Meta Sudans on the way back',
    at: 'ludus-magnus',
    hour: 15,
    setup: (game) => {
      afterAuctus(game);
      game.quests.start(LUD01);
      game.quests.setStage(LUD01, 'done');
    },
  },
  {
    id: 'brawl',
    label: 'Evening at the Meta Sudans: the fans’ brawl (fists only)',
    at: 'meta-sudans',
    hour: 19.5,
    place: 'meta-sudans:front',
    setup: (game) => {
      afterAuctus(game);
      game.quests.start(LUD01);
      game.quests.setStage(LUD01, 'done');
      game.quests.start('misc-meta-sudans-rixa');
    },
  },
  {
    id: 'deliver',
    label: 'After sunset: back to the strongrooms and the tablet to Gratus (“Tomorrow, the Column”)',
    at: 'temple-castor-pollux',
    hour: 19.8,
    setup: (game) => {
      afterAuctus(game);
      game.quests.start(LUD01);
      game.quests.setStage(LUD01, 'done');
    },
  },
];

export function checkpoint(id: string | null | undefined): Checkpoint | null {
  return CHECKPOINTS.find((c) => c.id === id) ?? null;
}

/** Apply a checkpoint after the quick start (its autosaves settle first, like `?fight=`). */
export async function applyCheckpoint(game: Game, cp: Checkpoint) {
  const loc = cp.place ? game.locations?.get(cp.place) : null;
  if (loc && game.player) {
    // A step back from the spot itself, on walkable street.
    const nav = (game as Game & { population?: { nav?: { snap(x: number, z: number, r?: number): { x: number; z: number } } } }).population?.nav;
    const g = nav?.snap(loc.position.x, loc.position.z - 4, 6) ?? { x: loc.position.x, z: loc.position.z - 4 };
    game.player.teleport({ x: g.x, y: (game.heightmap?.heightAt(g.x, g.z) ?? loc.position.y ?? 0) + 0.3, z: g.z });
  }
  cp.setup(game);
  await game.rpg?.save.idle().catch(() => {});
}
