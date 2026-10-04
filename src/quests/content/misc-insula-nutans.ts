/**
 * misc-insula-nutans "The Leaning Insula" (docs/CONTENT.md §3.3.3; GDD §11.1; v0.1 Should). Misc
 * quest, persuasion and investigation with a timed evacuation.
 *
 * Iulia Prima lives on the third floor of an insula on the Vicus Tuscus whose walls crack and whose
 * floors slope; the landlord's man, Callistus, props it with oak and tells everyone to sleep easy.
 *
 *   start     find proof the building is failing: three of the five signs (examine points)     → callistus
 *   callistus confront Callistus: he offers ten denarii to forget it                           → aedile | bribed (fail)
 *   aedile    report to the aediles' man, Dento, at the Rostra (Persuade, or Fabrica)         → evacuate
 *   evacuate  warn four households before the first watch                                      → done
 *   done      the back of the insula came down in the first watch and nobody was under it
 *
 * The signs, each an "Examine" point in the insula: the bulging ground-floor wall behind the taberna
 * (a Fabrica 25 reading counts double), the bowed oak prop on the stair, the crack on the top floor
 * you can put a hand into, and a coin that rolls the length of Prima's floor (the comic fourth; the
 * bible's fifth is the Fabrica reading). At sunset (the first watch) the rear wall and the stair fall
 * (a scripted beat). Households: Prima's own, the cobbler on the ground floor, the old couple on the
 * stair and the Syrian family under the roof; with the aediles' order in hand (flag 'dento-order')
 * the tenants go without a check.
 */
import { beat, placeExamine, removeExamine } from '../../content/director';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-insula-nutans';

interface Sign {
  id: string;
  at: string;
  label: string;
  verb: string;
  weight: number;
  note: string;
}

const SIGNS: Sign[] = [
  { id: 'nutans-taberna', at: 'insula-nutans-taberna', label: 'The ground-floor wall', verb: 'Examine', weight: 1, note: 'The wall behind the taberna bulges like a stomach after a banquet. Rubble and mortar, and not a course of brick to hold it together.' },
  { id: 'nutans-scalae', at: 'insula-nutans-scalae', label: 'The propped stair', verb: 'Examine', weight: 1, note: 'An oak prop under the stair, bowed in the middle. Someone has chalked a date on it and then another date, and then the word “soon”.' },
  { id: 'nutans-tectum', at: 'insula-nutans-tectum', label: 'The crack in the top floor', verb: 'Examine', weight: 1, note: 'A crack in the plaster you can put your hand into. Daylight comes through it.' },
  { id: 'nutans-cenaculum', at: 'insula-nutans-cenaculum', label: 'Prima’s floor', verb: 'Examine', weight: 1, note: 'You set down a coin. It rolls the whole length of the room, bumps the far wall, and does not come back.' },
];

const FOUND = 'found';

function found(q: QuestContext): string[] {
  const v = q.vars[FOUND];
  return typeof v === 'string' && v ? v.split(',') : [];
}

function placeSigns(q: QuestContext) {
  const done = found(q);
  for (const s of SIGNS) if (!done.includes(s.id)) placeExamine(q.game, { id: s.id, at: s.at, verb: s.verb, label: s.label, height: 1.1 });
}

function clearSigns() {
  for (const s of SIGNS) removeExamine(s.id);
}

function noteSign(q: QuestContext, id: string) {
  const s = SIGNS.find((x) => x.id === id);
  if (!s || q.stage !== 'start' || found(q).includes(id)) return;
  q.vars[FOUND] = [...found(q), id].join(',');
  q.notify(s.note);
  let weight = s.weight;
  // A smith's eye (Fabrica 25) reads the wall for what it is, and counts double.
  if (id === 'nutans-taberna' && (q.game.player?.sheet?.skillLevel('fabrica') ?? 0) >= 25) {
    weight = 2;
    q.setFlag('nutans-fabrica', true);
    q.notify('Rubble core, no bonding course: cheap work. You could say as much to a magistrate.');
  }
  q.vars.evidence = (Number(q.vars.evidence) || 0) + weight;
  q.progress('evidence', weight);
}

function warnOnce(q: QuestContext, npcId: string) {
  const warned = typeof q.vars.warnedList === 'string' ? q.vars.warnedList.split(',').filter(Boolean) : [];
  if (warned.includes(npcId)) return;
  q.vars.warnedList = [...warned, npcId].join(',');
  q.progress('warn');
}

/** The first watch: the rear wall and stair fall. */
function collapse(q: QuestContext) {
  if (q.stage !== 'evacuate') return;
  q.setFlag('nutans-collapsed', true);
  beat(q.game, QUEST_ID, 'insula-collapses', { at: 'insula-nutans' });
  q.setStage(q.isObjectiveDone('warn') ? 'done' : 'collapsed');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Leaning Insula',
  latin: 'Insula Nutans',
  category: 'misc',
  giver: 'npc-prima',
  summary: 'The walls of Iulia Prima’s insula crack and the floors slope, and the landlord’s man tells everyone to sleep easy.',
  stages: {
    start: {
      journal: 'Iulia Prima lives on the third floor of an insula on the Vicus Tuscus. The walls crack, the floors slope, and the landlord’s man, Callistus, props it all up with timber and tells everyone to sleep easy.',
      objectives: [{ id: 'evidence', text: 'Find proof the building is failing', count: 3, target: { kind: 'location', id: 'insula-nutans' } }],
      onEnter: (q) => placeSigns(q),
      next: 'callistus',
    },
    callistus: {
      journal: 'I took what I had found to Callistus.',
      objectives: [{ id: 'confront', text: 'Confront Callistus', target: { kind: 'npc', id: 'npc-callistus' } }],
      onEnter: () => clearSigns(),
      next: 'aedile',
    },
    aedile: {
      journal: 'The aediles answer for walls that fall on the public. Their man in the Forum is called Dento, and he hates scandal more than he hates work.',
      objectives: [{ id: 'report', text: 'Report the building to the aediles’ man, Dento, by the Rostra', target: { kind: 'npc', id: 'npc-dento' } }],
      next: 'evacuate',
    },
    evacuate: {
      journal: 'Dento ordered the building emptied before dark. The tenants did not believe him either.',
      objectives: [
        { id: 'warn', text: 'Get the tenants out before nightfall', count: 4, target: { kind: 'location', id: 'insula-nutans' } },
      ],
      onEnter: (q) => {
        if (q.flag('dento-order')) q.notify('Dento’s order will move most of them.');
      },
    },
    done: {
      journal: 'The back of the insula came down in the first watch, and nobody was under it. Callistus has not been seen since. Prima says her husband built half the Forum and never once a wall like that.',
      onEnter: (q) => {
        q.setFlag('callistus-fled', true);
        q.giveReward({ denarii: 20, skillXp: ['rhetoric'] });
        q.game.standing?.addFame('dist-velabrum-boarium', 10);
      },
      end: 'complete',
    },
    collapsed: {
      journal: 'I was too slow. The back of the insula came down in the first watch, with people still inside. They are still digging. Prima will not look at me.',
      onEnter: (q) => q.game.standing?.addFame('dist-velabrum-boarium', -5),
      end: 'fail',
    },
    bribed: {
      journal: 'I took Callistus’ ten denarii. In the first watch the back of the insula came down. They are still digging.',
      onEnter: (q) => {
        q.game.standing?.addFame('dist-velabrum-boarium', -15);
        q.game.devotion?.losePietas(10);
        q.setFlag('nutans-bribed', true);
        // The world side stages the collapse at the first watch (two tenants die, Prima curses the player by description).
        q.setFlag('nutans-collapse-pending', true);
        clearSigns();
      },
      end: 'fail',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-prima' && e.nodeId === 'offerAccept') q.start();
    },
  },
  on: {
    'content:interact': (q, e) => {
      if (e.id.startsWith('nutans-')) noteSign(q, e.id);
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-callistus' && q.stage === 'callistus') {
        if (e.nodeId === 'confronted') q.completeObjective('confront');
        if (e.nodeId === 'bribed') q.setStage('bribed');
      }
      if (e.dialogueId === 'npc-dento' && e.nodeId === 'ordered' && q.stage === 'aedile') q.completeObjective('report');
      if (q.stage === 'evacuate') {
        if (e.dialogueId === 'npc-nutans-tenants' && e.nodeId === 'warned') warnOnce(q, e.npcId);
        if (e.dialogueId === 'npc-prima' && e.nodeId === 'p-evacuate') warnOnce(q, 'npc-prima');
      }
    },
    'time:hour': (q) => {
      if ((q.game.time?.hour ?? 0) >= 19.1) collapse(q);
    },
    'save:loaded': (q) => {
      if (q.stage === 'start') placeSigns(q);
    },
  },
});
