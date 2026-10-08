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
const MQ03 = 'mq-03-lemuria';
const LUD01 = 'lud-01-sacramentum';
const TABLET = 'quest-tabella-signata';

function give(game: Game, id: string) {
  const inv = game.player?.inventory;
  if (inv && !inv.count(id)) inv.add(id, 1, { source: 'quest' });
}

/** Chapter 1 played: the courier dead, the tablet in the belt (mq-02 then starts by itself). */
function afterGate(game: Game) {
  game.quests.flags.set('festus-dead', true);
  game.quests.flags.set('promised-festus', true);
  give(game, TABLET);
  scriptedDeath(game, 'npc-festus', 'npc-mus');
  game.quests.setStage(MQ01, 'done');
}

/** Up to the Mouse: Gratus heard the story, Glaucus named Dizas (mq-02 'mus'). */
function afterGlaucus(game: Game) {
  afterGate(game);
  game.quests.flags.set('clue-mus', true);
  game.quests.setStage(MQ02, 'mus');
}

/** Chapter 2 played: the tablet delivered at dusk (mq-03 then starts by itself). */
function afterDelivery(game: Game) {
  afterGlaucus(game);
  game.quests.flags.set('mus-fate', 'fled');
  game.player?.inventory?.remove(TABLET, 1);
  give(game, 'quest-tessera-peregrina');
  game.quests.setStage(MQ02, 'done');
}

export const CHECKPOINTS: Checkpoint[] = [
  {
    id: 'city',
    label: 'After the ambush: the tablet to the Forum, up the Circus valley',
    at: 'porta-capena',
    hour: 5.8,
    setup: afterGate,
  },
  {
    id: 'castor',
    label: 'In the Forum with the tablet: the strongrooms of Castor, the keeper and Gratus',
    at: 'miliarium-aureum',
    hour: 8.5,
    setup: afterGate,
  },
  {
    id: 'ludus',
    label: 'Gratus sends you to the Ludus Magnus: Glaucus names the man with the curved blade',
    at: 'temple-castor-pollux',
    hour: 9.4,
    setup: (game) => {
      afterGate(game);
      game.quests.setStage(MQ02, 'ludus');
    },
  },
  {
    id: 'mouse',
    label: 'The Mouse: the burned taberna off the Vicus Tuscus, and Festus’ satchel',
    at: 'temple-castor-pollux',
    hour: 11,
    place: 'taberna-collapsa',
    setup: afterGlaucus,
  },
  {
    id: 'deliver',
    label: 'After sunset: the tablet to Gratus at the strongrooms, and the cipher',
    at: 'temple-castor-pollux',
    hour: 19.8,
    setup: (game) => {
      afterGlaucus(game);
      game.quests.flags.set('mus-fate', 'fled');
      give(game, 'quest-sacculum-festi');
      game.quests.setStage(MQ02, 'dusk');
    },
  },
  {
    id: 'lemuria',
    label: 'The Lemuria: Festus’ family in the Velabrum, the midnight rite, the twin',
    at: 'temple-castor-pollux',
    hour: 21,
    place: 'insula-mariorum',
    setup: afterDelivery,
  },
  {
    id: 'twin',
    label: 'After the rite: find Gemellus at Tryphon’s bookshop, then warn Gratus',
    at: 'temple-castor-pollux',
    hour: 0.6,
    place: 'taberna-tryphonis',
    setup: (game) => {
      afterDelivery(game);
      game.quests.setStage(MQ03, 'gemellus');
    },
  },
  {
    id: 'oath',
    label: 'Side quest at the Ludus: sign on with Glaucus, draw the practice arms, the first bout',
    at: 'ludus-magnus',
    hour: 10,
    setup: (game) => {
      afterGlaucus(game);
      game.quests.start(LUD01);
    },
  },
  {
    id: 'brawl',
    label: 'Side quest, evening at the Meta Sudans: the fans’ brawl (fists only)',
    at: 'meta-sudans',
    hour: 19.5,
    place: 'meta-sudans:front',
    setup: (game) => {
      afterGlaucus(game);
      game.quests.start(LUD01);
      game.quests.setStage(LUD01, 'done');
      game.quests.start('misc-meta-sudans-rixa');
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
