/**
 * misc-mercuralia "Mercury's Water" (docs/design/world-life.md §4.8 Q5; GDD §11.1, seed `misc-mercuralia`).
 * On the Ides of May (15 May) Rome's merchants went to Mercury's spring by the Porta Capena, dipped a
 * laurel branch, sprinkled themselves and their goods, and begged the god to wash away their past lies
 * and to look away from the next ones (Ovid, Fasti 5.673-692 [A]). The aediles policed markets and
 * measures [A]. The fraud is invented [G].
 *
 * OFFERED from the opening day on (a notice on board-ceres, a rumour, Cerdo's cry, the aediles' clerk,
 * Fadia's old topic), but it plays out ONLY on the Ides: the calendar holds the date on the eve of the
 * Column until mq-04 is done, so 15 May can only be reached after it. Before then the quest waits in
 * `start` with its journal line. If the Ides pass with the quest unplayed it fails ("offered again a
 * year later", GDD §11.1 - beyond this game's window).
 *
 *   start    wait for the Ides, then go to the spring                                       → spring
 *   spring   dawn to the third hour: merchants with jars and laurel; overhear Lucius
 *            Septimius pray to wash away "the short measure" (or hear it from the clerk)     → clerk
 *   clerk    borrow the aediles' standard measure from their clerk at the Temple of Ceres    → test
 *   test     have Septimius fill it at his stall in the Forum Boarium: a sixth short         → choose
 *   choose   report him (clerk: 10 den.; his stall sealed 8 days), squeeze him (15 den.,
 *            Infamia +3) or warn him that Mercury sees (Rhetoric 40: Pietas +5, he sells to
 *            the player at cost)                                                             → done-*
 *
 * Flags: merc-short (the measure was tested), merc-sealed-until (game hours), merc-squeezed,
 * septimius-at-cost. The rite itself ("Dip a laurel and sprinkle yourself") is a life activity
 * (src/life/data/keepers/quests-g.ts, act.capena.mercury-rite).
 */
import { ordinalOf } from '../../game/calendar';
import { stage, unstage, say } from '../../content/director';
import { giveItem, takeItem } from '../../content/questkit';
import type { LocationDef } from '../../npc/types';
import type { ItemDef } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-mercuralia';
export const MEASURE = 'mensura-aedilicia';
export const LUCIUS = 'keeper-boarium-olearius';
export const CLERK = 'npc-clericus-aedilium';
/** Merchants who come to the spring on the Ides (no schedule: staged by the quest, only on the day). */
export const MERCHANTS = ['npc-mercurialis-a', 'npc-mercurialis-b', 'npc-mercurialis-c'] as const;
const IDES = ordinalOf(4, 15);
/** The crowd round the spring: a place registered when the day comes (placeCrowd). */
const CROWD = 'mercury-spring-crowd';

// ------------------------------------------------------------------ places and items

export const locations: LocationDef[] = [
  // The aediles' clerk, at the foot of the podium of the Temple of Ceres, by the painted album: the builder's own
  // `temple-ceres-clerk` spot (world-space, read from the built landmark; the people placer snaps to the street).
  { id: 'aediles-clerk', name: 'The Aediles’ Clerk', position: { x: -117.9, y: 7.2, z: 355.2 }, radius: 6, discoverable: false },
];

export const items: ItemDef[] = [
  {
    id: MEASURE, name: 'The Aediles’ Standard Measure', latin: 'sextarius aedilicius', type: 'quest', questItem: true, weight: 0, value: 0, icon: '⚱',
    description: 'A bronze sextarius stamped by the plebeian aediles, kept by their clerk beside the album. Whatever it holds, it holds exactly; that is the whole point of it.',
    tags: ['measure'],
  },
];

// ------------------------------------------------------------------ helpers

/** Ordinal of the calendar date (the flow's calendar, held on the eve of the Column; else the clock). */
function todayOrdinal(q: QuestContext): number {
  const d = q.game.calendar?.date() ?? q.game.time.date();
  return ordinalOf(d.month, d.day);
}

const hour = (q: QuestContext) => q.game.time?.hour ?? 12;
/** Dawn to the third hour: when the merchants are at the spring. */
const springHours = (q: QuestContext) => hour(q) >= 4.9 && hour(q) < 7.3;

/**
 * The crowd at the spring is a place of its own, wider than the spring (fons-mercurii, radius 4): put where
 * the world has the spring (the Porta Capena builder moves it from its fallback in content/places.ts).
 */
function placeCrowd(q: QuestContext) {
  const spring = q.game.locations?.get('fons-mercurii');
  if (!spring) return;
  q.game.locations.add({ id: CROWD, name: 'Mercury’s Spring', latin: 'aqua Mercurii', position: { ...spring.position }, radius: 10, discoverable: false });
}

/** The spring's people: Septimius and three merchants with jars, staged round the water. */
function setScene(q: QuestContext) {
  const spot = q.game.locations?.get('fons-mercurii')?.position;
  if (!spot) return;
  // Round the basin; heading in radians toward it (Actor convention: forward = (sin h, cos h)).
  const around: [string, number, number, string][] = [
    [LUCIUS, 2.2, 1.0, 'pray'],
    [MERCHANTS[0], -1.6, 2.2, 'pray'],
    [MERCHANTS[1], 0.6, -2.4, 'stand'],
    [MERCHANTS[2], -2.6, -0.6, 'talk'],
  ];
  for (const [id, dx, dz, loop] of around) {
    const x = spot.x + dx;
    const z = spot.z + dz;
    stage(q.game, id, { x, z }, Math.atan2(spot.x - x, spot.z - z), loop as 'pray');
  }
}

function clearScene(q: QuestContext) {
  for (const id of [LUCIUS, ...MERCHANTS]) unstage(q.game, id);
}

/** The prayer at the spring: Ovid's merchant, with the invented fraud in it. */
function overhear(q: QuestContext) {
  const lines: [string, string][] = [
    ['Merchant at the spring', 'Mercury, wash from me the lies of the last year. And be a little blind to the ones I mean to tell.'],
    ['Lucius Septimius', 'Wash it away, god of the market. The short measure, the wet oil, the thumb on the scale. All of it. All! Wash it away, and I will give you the first jar of the new press.'],
  ];
  lines.forEach(([who, text], i) => {
    if (typeof setTimeout === 'function' && i) setTimeout(() => say(q.game, who, text, 5), i * 3800);
    else say(q.game, who, text, 5);
  });
  q.completeObjective('overhear');
}

/** The quest plays out on the Ides itself: it moves on when the day comes and fails when the day goes. */
function checkDay(q: QuestContext) {
  const t = todayOrdinal(q);
  // Once Septimius's measure has been tested the evidence is in hand, and the choice can wait.
  if (t > IDES && ['start', 'spring', 'clerk', 'test'].includes(q.stage)) q.setStage('missed');
  else if (t === IDES && q.stage === 'start') q.completeObjective('ides');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Mercury’s Water',
  latin: 'Aqua Mercurii',
  category: 'misc',
  giver: CLERK,
  summary: 'On the Ides of May the merchants of Rome wash their lies away at Mercury’s spring. One is washing away a real fraud.',
  stages: {
    start: {
      journal: 'On the Ides of May, the Mercuralia, every merchant in Rome went to Mercury’s spring by the Capena Gate at dawn with a laurel branch and a jar, to wash away the lies of the year. The aediles’ clerk at the Temple of Ceres lent out the standard measures that day to anyone who would use them. I meant to be there on the Ides.',
      objectives: [{ id: 'ides', text: 'Be at Mercury’s spring at dawn on the Ides of May (15 May)', target: { kind: 'location', id: 'fons-mercurii' } }],
      onEnter: (q) => checkDay(q),
      next: 'spring',
    },
    spring: {
      journal: 'The Ides. At the spring by the Capena Gate the merchants came in a queue with jars and bunches of laurel, and the water ran over their hands. One of them was praying louder than the rest.',
      objectives: [{ id: 'overhear', text: 'Go to Mercury’s spring before the third hour', target: { kind: 'location', id: 'fons-mercurii' } }],
      onEnter: (q) => {
        placeCrowd(q);
        if (springHours(q)) setScene(q);
      },
      next: 'clerk',
    },
    clerk: {
      journal: 'Lucius Septimius, the oil-dealer of the Forum Boarium, was praying to wash away “the short measure”, and he meant it. The aediles keep the true measures with their clerk beside the album at the Temple of Ceres.',
      objectives: [{ id: 'measure', text: 'Borrow the aediles’ standard measure from their clerk (Temple of Ceres)', target: { kind: 'npc', id: CLERK } }],
      next: 'test',
    },
    test: {
      journal: 'The clerk lent me the aediles’ sextarius and told me to bring it back by dusk and to say nothing about the aediles.',
      objectives: [{ id: 'test', text: 'Have Septimius fill the measure at his stall (Forum Boarium)', target: { kind: 'npc', id: LUCIUS } }],
      next: 'choose',
    },
    choose: {
      journal: 'The aediles’ vessel came back a finger and a half short of full: Septimius’s measure was a sixth short. A sixth, on every jar, since the Kalends at least.',
      objectives: [{ id: 'decide', text: 'Decide what to do about Septimius (report him to the clerk, or settle it at his stall)', target: { kind: 'npc', id: LUCIUS } }],
    },
    'done-report': {
      journal: 'I took the measure back to the clerk and told him what it had held. The aediles sealed Septimius’s measures that afternoon and shut his stall for eight days. The clerk counted ten denarii out of the fine for the informer, which is the law and an old custom.',
      onEnter: (q) => {
        takeItem(q, MEASURE);
        q.setFlag('merc-sealed-until', Math.round(q.game.time.totalHours + 8 * 24));
        q.giveReward({ denarii: 10, reputation: [{ faction: 'plebs', amount: 2 }] });
      },
      end: 'complete',
    },
    'done-squeeze': {
      journal: 'I told Septimius what his measure held and what the aediles would do about it, and then I told him what I would do for fifteen denarii. He paid. I returned the aediles’ measure to the clerk with a straight face. It is not a thing I am proud of, but I am fifteen denarii richer.',
      onEnter: (q) => {
        takeItem(q, MEASURE);
        q.setFlag('merc-squeezed', true);
        q.game.standing?.addInfamia(3);
        q.giveReward({ denarii: 15 });
      },
      end: 'complete',
    },
    'done-warn': {
      journal: 'I did not report Septimius. I told him that Mercury had heard him at the spring and was not a blind god, and that the next jar was the god’s to measure. He went the colour of old wax and filled his measure true in front of me. From then on he sold to me at cost, and looked at the sky when he did.',
      onEnter: (q) => {
        takeItem(q, MEASURE);
        q.setFlag('septimius-at-cost', true);
        q.game.devotion?.gainPietas(5);
        q.giveReward({ skills: [{ id: 'rhetoric', amount: 10 }] });
      },
      end: 'complete',
    },
    missed: {
      journal: 'The Ides came and went while I was busy elsewhere. Rome’s merchants washed their lies away at the spring without me, and no doubt told some fresh ones by noon. The aediles’ clerk said the day comes round again.',
      onEnter: (q) => {
        clearScene(q);
        takeItem(q, MEASURE);
      },
      end: 'fail',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'dlg-merc-clerk' && e.nodeId === 'mAccept') q.start();
    },
  },
  on: {
    // The date moves at midnight; waiting costs nothing. A day that passes unplayed is a day missed.
    'time:hour': (q) => {
      checkDay(q);
      if (q.stage === 'spring' && springHours(q)) setScene(q);
      // The merchants go home at the third hour.
      if (!springHours(q)) clearScene(q);
    },
    // ... or when the player walks away from the water: Septimius is wanted at his stall.
    'location:exited': (q, e) => {
      if (e.locationId === CROWD && q.stage !== 'spring') clearScene(q);
    },
    'location:entered': (q, e) => {
      if (e.locationId === 'fons-mercurii' || e.locationId === CROWD) {
        checkDay(q);
        if (q.stage === 'spring' && springHours(q)) overhear(q);
      }
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'dlg-merc-clerk') {
        // Too late for the spring: the clerk heard of it from half the Boarium.
        if (e.nodeId === 'mTold' && q.stage === 'spring') q.completeObjective('overhear');
        if (e.nodeId === 'mGive' && q.stage === 'clerk') {
          giveItem(q, MEASURE);
          q.completeObjective('measure');
        }
        if (e.nodeId === 'mReport' && q.stage === 'choose') {
          q.completeObjective('decide');
          q.setStage('done-report');
        }
      }
      if (e.dialogueId === 'dlg-merc-lucius') {
        if (e.nodeId === 'lShort' && q.stage === 'test') {
          q.setFlag('merc-short', true);
          q.completeObjective('test');
        }
        if (e.nodeId === 'lSqueezed' && q.stage === 'choose') {
          q.completeObjective('decide');
          q.setStage('done-squeeze');
        }
        if (e.nodeId === 'lWarned' && q.stage === 'choose') {
          q.completeObjective('decide');
          q.setStage('done-warn');
        }
      }
    },
    'save:loaded': (q) => {
      if (q.stage === 'spring') placeCrowd(q);
      if (q.stage === 'spring' && springHours(q)) setScene(q);
    },
  },
});
