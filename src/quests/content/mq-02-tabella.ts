/**
 * mq-02-tabella "The Tablet" (GDD §10.3 #2, v0.1 stand-in for mq-02-carcer; §17.2 steps 3 and 5).
 * Main quest, v0.1 Must.
 *
 * The courier's last word was Castor. On the Lemuria the god's house is shut (the aedituus explains,
 * AC-18), but the strongrooms in the podium open from outside it. Their keeper, Gavius Silo, is
 * Pudens' man: he will not take a dead courier's tablet from a stranger in daylight. "The man who
 * knifed Festus trained at the Ludus Magnus. Make yourself useful there. Come back at dusk." At
 * dusk the tablet goes into locker XIV and the journal ends: "Tomorrow, the Column."
 *
 *   start     go to the Temple of Castor                        → aedituus
 *   aedituus  ask the aedituus (the cella is shut)              → contact
 *   contact   show the tablet at the strongrooms                → dusk
 *   dusk      (optional) prove yourself at the Ludus; return after sunset → end
 *   end       the tablet is in locker XIV. "Tomorrow, the Column."
 *
 * Starts when mq-01 completes (or if the player walks up to the strongrooms with the tablet first).
 */
import { hint } from '../../content/director';
import { giveItem, takeItem } from '../../content/questkit';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'mq-02-tabella';

function toContact(q: QuestContext) {
  q.completeObjective('castor');
  q.completeObjective('ask');
  if (q.stage === 'start' || q.stage === 'aedituus') q.setStage('contact');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Tablet',
  latin: 'Tabella',
  category: 'main',
  giver: 'npc-festus',
  summary: 'Deliver the dead courier’s sealed tablet to the strongrooms under the Temple of Castor.',
  stages: {
    start: {
      journal: '“Castor,” the courier said. The Temple of Castor and Pollux stands at the south side of the Forum, by the spring where the Twins watered their horses after Lake Regillus. Its podium is said to hold strongrooms where men of means keep their valuables.',
      objectives: [{ id: 'castor', text: 'Go to the Temple of Castor in the Forum', target: { kind: 'location', id: 'temple-castor-pollux' } }],
      onEnter: (q) => {
        if (q.game.locations?.isInside?.('temple-castor-pollux')) q.completeObjective('castor');
      },
      next: 'aedituus',
    },
    aedituus: {
      journal: 'The great bronze doors of the temple were shut. It is the Lemuria: the gods’ houses close while the dead walk. An old custodian was sweeping the steps.',
      objectives: [{ id: 'ask', text: 'Ask the aedituus about the strongrooms', target: { kind: 'npc', id: 'npc-aedituus-castoris' } }],
      next: 'contact',
    },
    contact: {
      journal: 'The aedituus pointed me down the side of the podium: the strongrooms open from the street, not from the shrine, so they keep their hours even on the Lemuria.',
      objectives: [{ id: 'contact', text: 'Show the sealed tablet at the strongrooms', target: { kind: 'npc', id: 'npc-castor-contact' } }],
    },
    dusk: {
      journal: 'The keeper of the strongrooms, a hard-faced man named Gavius Silo, looked at the seal for a long time and did not touch it. “Not in daylight, and not from a stranger. The man who knifed Festus trained at the Ludus Magnus; their sort talk in the barracks. Make yourself useful there. Come back after sunset.”',
      objectives: [
        { id: 'ludus', text: 'Make yourself useful at the Ludus Magnus', optional: true, target: { kind: 'location', id: 'ludus-gate' } },
        { id: 'deliver', text: 'Bring the tablet back to the strongrooms after sunset', target: { kind: 'npc', id: 'npc-castor-contact' } },
      ],
      onEnter: (q) => {
        if (q.quest('lud-01-sacramentum')?.completed) q.completeObjective('ludus');
        hint(q.game, 'Press T to wait. The sun sets at the end of the twelfth hour, a little after 19:00.');
      },
      next: 'end',
    },
    end: {
      journal: 'At dusk Silo broke nothing and read nothing. He laid the tablet in locker fourteen, pressed the number into a receipt and gave it to me. Then, quietly, without looking up: “Tomorrow, the Column.”',
      onEnter: (q) => {
        takeItem(q, 'quest-tabella-signata');
        giveItem(q, 'chirographum-castoris');
        q.setFlag('mq02.delivered', true);
        if (q.quest('lud-01-sacramentum')?.completed) q.giveReward({ denarii: 15 });
      },
      end: 'complete',
    },
  },
  triggers: {
    'quest:completed': (q, e) => {
      if (e.questId === 'mq-01-madida-capena') q.start();
    },
    'dialogue:node': (q, e) => {
      // The player found the strongrooms with the tablet before mq-01 was over (or skipped it).
      if (e.dialogueId === 'npc-castor-contact' && e.nodeId === 'tablet') {
        q.start('contact');
        q.setStage('dusk');
      }
    },
  },
  on: {
    'location:entered': (q, e) => {
      if (e.locationId === 'temple-castor-pollux' || e.locationId === 'castor-steps') q.completeObjective('castor');
      if (e.locationId === 'ludus-gate' || e.locationId === 'ludus-magnus') q.completeObjective('ludus');
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-aedituus-castoris' && (e.nodeId === 'strongrooms' || e.nodeId === 'closed')) {
        q.completeObjective('ask');
      }
      if (e.dialogueId !== 'npc-castor-contact') return;
      if (e.nodeId === 'tablet' && (q.stage === 'start' || q.stage === 'aedituus' || q.stage === 'contact')) {
        toContact(q);
        q.completeObjective('contact');
        q.setStage('dusk');
      }
      if (e.nodeId === 'delivered' && q.stage === 'dusk') q.completeObjective('deliver');
    },
    'quest:completed': (q, e) => {
      if (e.questId === 'lud-01-sacramentum') q.completeObjective('ludus');
    },
  },
  rewards: { denarii: 25, skillXp: ['rhetoric'] },
});
