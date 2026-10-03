/**
 * misc-meta-sudans-rixa "Brawl at the Fountain" (GDD §11.1, v0.1 Must; AC-09). Misc quest.
 *
 * By the Meta Sudans the fans of the small-shield fighters (parmularii, for the thraex Callinicus)
 * and of the big-shield fighters (scutarii, for Ferox the murmillo) are shouting nose to nose
 * (the factions are attested: Suet. Dom. 10; Mart. 9.68 [A]). It ends with words (a Rhetoric
 * check), with fists (a rixa is non-lethal by rule: knock out or make yield the two scutarii, §6.9),
 * or with the player yielding (lose a tenth of the purse, the fight ends). Drawing steel turns
 * the brawl into assault (crime 'vis') and fails the quest.
 *
 *   start → choice → brawl → won | lost        (or choice → calmed;  any brawl → assault on 'vis')
 */
import { fight, hint, say } from '../../content/director';
import { addFoe, beatFoe, isPlayer } from '../../content/questkit';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-meta-sudans-rixa';
const SCUTARII = ['npc-crispus', 'npc-bucco'] as const;

function startBrawl(q: QuestContext) {
  if (q.stage === 'brawl' || q.done) return;
  q.completeObjective('talk');
  q.setStage('brawl');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Brawl at the Fountain',
  latin: 'Rixa ad Metam Sudantem',
  category: 'misc',
  giver: 'npc-hilarus',
  summary: 'Fans of the thraeces and of the murmillones are about to come to blows at the Meta Sudans.',
  stages: {
    start: {
      journal: 'At the Meta Sudans, the sweating cone of a fountain below the Colossus, a knot of men was shouting about gladiators. An old man in a yellow tunic was the loudest.',
      objectives: [{ id: 'talk', text: 'Find out what the shouting is about', target: { kind: 'npc', id: 'npc-hilarus' } }],
      next: 'choice',
    },
    choice: {
      journal: 'Hilarus is a parmularius: thirty years he has cheered the small-shield fighters, the thraeces. The scutarii, who cheer the big shields, say his Callinicus will be flattened by Ferox the Gaul. Their ringleader, a big man called Crispus, wants an apology or a fight.',
      objectives: [{ id: 'settle', text: 'Settle it with Crispus: words or fists', target: { kind: 'npc', id: 'npc-crispus' } }],
    },
    brawl: {
      journal: 'Crispus spat on his hands and his friend Bucco rolled up his sleeves. A rixa, then: fists only. Draw steel and it is assault.',
      objectives: [{ id: 'down', text: 'Knock out or make yield the two scutarii (fists only)', count: 2, target: { kind: 'location', id: 'meta-sudans-ring' } }],
      onEnter: (q) => {
        q.completeObjective('settle');
        say(q.game, 'Crispus', 'Big shields, big men! Come on, then!');
        let spawned = 0;
        SCUTARII.forEach((id, i) => {
          const actor = fight(q.game, id, 'ebrius-rixator', 'meta-sudans-ring', { brawl: true, quest: QUEST_ID, tags: [QUEST_ID, 'rixa'] }, { x: i ? 1.5 : -1.5, z: 2 });
          addFoe(q, 'foes', actor);
          if (actor) spawned++;
        });
        if (spawned) {
          hint(q.game, 'Sheathe your blade (R) and use your fists. Fists always knock out. Hold Y for a second to yield.');
        } else {
          // No combat module in this build: the crowd breaks it up after a few punches.
          q.notify('A few punches, a lot of shouting, and Crispus sits down hard in the fountain basin.');
          q.progress('down', 2);
        }
      },
      next: 'won',
    },
    won: {
      journal: 'Crispus sat in the fountain basin with water to his waist and laughed until he coughed. Bucco was asleep on the paving. The parmularii carried Hilarus round the Meta Sudans on their shoulders and pressed a share of the bets on me.',
      onEnter: (q) => {
        q.giveReward({ denarii: 6, reputation: [{ faction: 'plebs', amount: 3 }], skillXp: ['brawling'] });
        q.game.standing?.addFame('dist-vallis-colossei', 3);
        q.setFlag('rixa.won', true);
      },
      end: 'complete',
    },
    calmed: {
      journal: 'In the end nobody threw a punch. By the time I had finished, the parmularii and the scutarii were arguing about the price of wine instead, which is the same argument in a better mood.',
      onEnter: (q) => {
        q.giveReward({ reputation: [{ faction: 'plebs', amount: 5 }], skillXp: ['rhetoric'] });
        q.game.standing?.addFame('dist-vallis-colossei', 5);
        q.setFlag('rixa.calmed', true);
      },
      end: 'complete',
    },
    lost: {
      journal: 'I went down on one knee and raised a hand. The scutarii cheered, took a tenth of my purse “for the wine” and bought the whole fountain a round, me included.',
      onEnter: (q) => {
        q.giveReward({ skillXp: ['brawling'] });
        q.setFlag('rixa.lost', true);
      },
      end: 'complete',
    },
    assault: {
      journal: 'I drew steel in a fist fight. The crowd scattered screaming and someone ran for the soldiers. Whatever this was, it isn’t a brawl any more.',
      end: 'fail',
    },
  },
  triggers: {
    'location:entered': (q, e) => {
      if (e.locationId === 'meta-sudans-ring' || e.locationId === 'meta-sudans') q.start();
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-hilarus' && e.nodeId === 'story') {
        q.start();
        q.completeObjective('talk');
      }
      if (e.dialogueId === 'npc-crispus' && (e.nodeId === 'brawl' || e.nodeId === 'insulted' || e.nodeId === 'scorned')) {
        q.start();
        startBrawl(q);
      }
      if (e.dialogueId === 'npc-crispus' && (e.nodeId === 'calmed' || e.nodeId === 'cowed')) {
        q.start();
        q.completeObjective('talk');
        q.completeObjective('settle');
        q.setStage('calmed');
      }
    },
  },
  on: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-hilarus' && e.nodeId === 'story') q.completeObjective('talk');
      if (e.dialogueId !== 'npc-crispus') return;
      if (e.nodeId === 'brawl' || e.nodeId === 'insulted' || e.nodeId === 'scorned') startBrawl(q);
      if ((e.nodeId === 'calmed' || e.nodeId === 'cowed') && (q.stage === 'start' || q.stage === 'choice')) {
        q.completeObjective('talk');
        q.completeObjective('settle');
        q.setStage('calmed');
      }
    },
    'actor:killed': (q, e) => {
      if (q.stage !== 'brawl') return;
      if (isPlayer(e.victimId)) return q.setStage('lost');
      // Fists always knock out (§6.9); a death here means steel was drawn.
      if (beatFoe(q, 'foes', e.victimId, SCUTARII)) {
        if (e.tags?.includes('dead')) return q.setStage('assault');
        q.progress('down');
      }
    },
    'actor:yielded': (q, e) => {
      if (q.stage !== 'brawl') return;
      if (isPlayer(e.actorId)) return q.setStage('lost');
      if (beatFoe(q, 'foes', e.actorId, SCUTARII)) q.progress('down');
    },
    'crime:committed': (q, e) => {
      if (q.stage === 'brawl' && (e.crime === 'vis' || e.crime === 'homicidium' || e.crime === 'caedes-supplicis')) q.setStage('assault');
    },
  },
});
