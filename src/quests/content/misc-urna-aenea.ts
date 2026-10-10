/**
 * misc-urna-aenea "The Bronze Pot" (docs/design/world-life.md §4.8 Q2, QUESTS I). Misc quest,
 * talk and a little nerve; no fighting unless the player starts it.
 *
 * A bronze pot has gone from Primus's coppersmith's shop in the Vicus Tuscus. His notice offers 65
 * sesterces for it and 20 more for the thief, in the words of a real Pompeian one (CIL IV 64) [A].
 * Offered by Cerdo's cry, a painted notice and Primus himself, after mq-01. Nothing here takes the
 * tracker from the main quest (QuestSystem.start sees to that).
 *
 *   start        question Felix, the apprentice: Rhetoric DC 25, or the dicers' word at the Silver Pig that
 *                "the coppersmith's boy owes thirty asses"        → fence
 *   fence        Crispina has the pot: pay her 10 den., frighten her (Rhetoric DC 40), or report her to the
 *                optio of the vigiles (the pot is confiscated and returned, the reward smaller)  → return
 *   return       bring the pot to Primus: 65 HS (16¼ den.), 40 HS by the vigiles' road            → thief
 *   thief        name Felix (+20 HS) or cover for him (better still if his 30 as at the dice are paid)
 *                                                                      → done-named | done-cover(-paid)
 *
 * Crispina stays afterwards as Rome's fence (keeper-subura-receptatrix, vendor kind receptator): receivers
 * (receptatores) were punished like the thieves [P]. Fama plebs +3. The quest's nodes are written in
 * src/life/data/keepers/quests-f.ts (Primus, Felix, Crispina) and src/dialogue/content/misc-life-f.ts
 * (Cnaeus at the dice, the optio).
 */
import { hasItem, takeItem } from '../../content/questkit';
import type { ItemDef } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-urna-aenea';
const PRIMUS = 'keeper-tuscus-aerarius';
const FELIX = 'keeper-tuscus-aerarius-felix';
const CRISPINA = 'keeper-subura-receptatrix';
const CNAEUS = 'npc-cnaeus-aleator';
const OPTIO = 'npc-optio-vigilum';
const POT = 'olla-aenea';

/** A conversation node was reached. */
const hit = (e: { dialogueId: string; nodeId: string }, dialogue: string, node: string) => e.dialogueId === dialogue && e.nodeId === node;

/** In denarii: 65 sesterces, 40 sesterces (the vigiles' road), 20 sesterces (the thief). */
const PAY = 65 / 4;
const PAY_VIGILES = 40 / 4;
const PAY_THIEF = 20 / 4;

export const items: ItemDef[] = [
  {
    id: POT,
    name: 'Primus’s Bronze Pot',
    latin: 'urna aenea',
    type: 'quest',
    questItem: true,
    weight: 3,
    value: 0,
    icon: '🏺',
    description: 'A big bronze pot for the dyers’ vats, scoured and wrapped in sacking. Primus’s mark is cut under the rim: a little hammer.',
  },
];

export default defineQuest({
  id: QUEST_ID,
  title: 'The Bronze Pot',
  latin: 'Urna Aenea',
  category: 'misc',
  giver: PRIMUS,
  summary: 'A coppersmith in the Vicus Tuscus has lost a bronze pot. Sixty-five sesterces for the pot, twenty more for the thief.',
  stages: {
    start: {
      journal: 'A bronze pot, the big one for the dyers’ vats, had walked out of Primus the coppersmith’s shop in the Vicus Tuscus. Sixty-five sesterces for the pot and twenty more for the thief, said the notice. His apprentice Felix had been minding the front when it went.',
      objectives: [
        { id: 'felix', text: 'Question Felix, the coppersmith’s apprentice', target: { kind: 'npc', id: FELIX } },
        { id: 'dice', text: 'Hear what the dicers at the Silver Pig say (optional)', target: { kind: 'npc', id: CNAEUS }, optional: true },
      ],
      next: 'fence',
    },
    fence: {
      journal: 'Felix, grey in the face, confessed. He owed thirty asses to a dicer at the Silver Pig and had sold the pot to Crispina, a woman who buys odds and ends from a doorway off the Argiletum from the afternoon on.',
      objectives: [{ id: 'crispina', text: 'Get the pot back from Crispina (a Subura doorway, afternoon to night)', target: { kind: 'npc', id: CRISPINA } }],
      next: 'return',
    },
    return: {
      journal: 'I had the bronze pot in my hands, wrapped in sacking.',
      objectives: [{ id: 'primus', text: 'Bring the pot back to Primus', target: { kind: 'npc', id: PRIMUS } }],
      next: 'thief',
    },
    thief: {
      journal: 'Primus paid for the pot and asked for a name. Felix owed thirty asses at the Silver Pig, and the pot had paid for part of it. Whether to tell was mine to say.',
      objectives: [{ id: 'choose', text: 'Tell Primus who took it, or keep Felix’s secret', target: { kind: 'npc', id: PRIMUS } }],
    },
    'done-named': {
      journal: 'I told Primus that Felix had taken the pot. He paid me the twenty sesterces for the name and went round the side of the shop with his hammer in his hand. I did not stay to see.',
      end: 'complete',
    },
    'done-cover': {
      journal: 'I told Primus I had never found who took it. Felix will have a debt over his head for a while, and a pot on his conscience, whatever that is worth.',
      end: 'complete',
    },
    'done-cover-paid': {
      journal: 'I told Primus I had never found who took it, and I paid Felix’s thirty asses at the Silver Pig myself. Felix said not a word to me about it. He began sweeping the front of the shop with an air of great virtue.',
      end: 'complete',
    },
    'fail-primus': {
      journal: 'Primus is dead, and nobody will pay for his pot now.',
      end: 'fail',
    },
    'fail-felix': {
      journal: 'Felix is dead. Whatever he knew about the pot died with him.',
      end: 'fail',
    },
  },
  triggers: {
    // Primus's offer, accepted in his talk (the notice's "Note it down" and Cerdo's cry also start it).
    'dialogue:node': (q, e) => {
      if (hit(e, PRIMUS, 'urnaAccept')) q.start();
    },
  },
  on: {
    'dialogue:node': (q, e) => {
      // The dice table: the coppersmith's boy owes thirty asses (an optional way to break Felix).
      if (hit(e, CNAEUS, 'cnaeusDebt') && q.stage === 'start') q.completeObjective('dice');
      // Felix confesses (Rhetoric, or the debt thrown in his face).
      if (hit(e, FELIX, 'felixConfession') && q.stage === 'start') q.completeObjective('felix');
      // Crispina, the three roads to the pot.
      if (q.stage === 'fence') {
        if (hit(e, CRISPINA, 'potBought')) road(q, 'bought');
        if (hit(e, CRISPINA, 'potScared')) road(q, 'scared');
        if (hit(e, OPTIO, 'reportPotDone')) road(q, 'vigiles');
      }
      // Primus gets his pot back and pays.
      if (hit(e, PRIMUS, 'urnaReturned') && q.stage === 'return' && takeItem(q, POT)) {
        q.giveReward({ denarii: q.flag('urna-road') === 'vigiles' ? PAY_VIGILES : PAY });
        q.completeObjective('primus');
      }
      // The thief: a name for twenty sesterces, or silence.
      if (q.stage === 'thief') {
        if (hit(e, PRIMUS, 'urnaNamed')) {
          q.setFlag('felix-named', true);
          q.giveReward({ denarii: PAY_THIEF, reputation: [{ faction: 'plebs', amount: 3 }] });
          q.completeObjective('choose');
          q.setStage('done-named');
        }
        if (hit(e, PRIMUS, 'urnaCover')) {
          q.giveReward({ reputation: [{ faction: 'plebs', amount: 3 }] });
          q.completeObjective('choose');
          q.setStage(q.flag('felix-debt-paid') ? 'done-cover-paid' : 'done-cover');
        }
      }
    },
    'actor:killed': (q, e) => {
      if (e.victimId === PRIMUS) q.setStage('fail-primus');
      else if (e.victimId === FELIX && q.stage === 'start') q.setStage('fail-felix');
      // Crispina dead before the pot is back: it is on her, among the rest.
      else if (e.victimId === CRISPINA && q.stage === 'fence') road(q, 'looted');
    },
  },
});

/** The pot is in the player's hands by whichever road: remember it, then on to Primus. */
function road(q: QuestContext, how: string) {
  q.setFlag('urna-road', how);
  if (!hasItem(q, POT)) q.game.player?.inventory?.add(POT, 1, { source: 'quest' });
  q.completeObjective('crispina');
}
