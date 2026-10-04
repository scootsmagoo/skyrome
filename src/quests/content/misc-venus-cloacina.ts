/**
 * misc-venus-cloacina "What Venus Hides" (docs/CONTENT.md §3.3.4, §5.3 boss-rex-cloacae; GDD §11.1,
 * §12.4; v0.1 Should). Misc quest, sewer delve and boss.
 *
 * Ianuarius, the public slave who looks after the drains, swears someone has been lifting the grate
 * beside the little round shrine of Venus Cloacina in the Forum. After the second watch a bath-thief
 * lifts it and drops a bundle of stolen clothes down. The delve itself belongs to the interior cell
 * `dun-cloaca-maxima` (the world side builds it; it is v0.2 Must, "a 3-room form is enough" for
 * v0.1). Until that interior exists the quest stages the gang's landing at the old lady's mouth, the
 * outfall on the Tiber (`cloaca-maxima-outlet`, an atlas landmark): three cloacarii, then the Rex.
 * When the world registers the place `dun-cloaca-maxima` the descent objective accepts that too.
 *
 *   start    watch the shrine after the second watch                              → descend
 *   descend  go down into the Cloaca (the outfall, or the interior)              → rex
 *   rex      three cloacarii, then Saturninus, the Rex Cloacae                    → cache
 *   cache    search the Rex's cache (the Parthian drachm) and climb out           → done
 *   done     report to Ianuarius
 *
 * The Rex yields at 0 (he fights to the end, he has nowhere to go) and surrenders if the sluice is
 * opened first or the player talks him down (Persuade or Intimidate 55); the combat/world side
 * reports those as 'actor:yielded'. His cache (`cista-regis-cloacae`) is a container the installer
 * places at the landing.
 */
import { beat, fight, hint, say, spawnEnemy } from '../../content/director';
import { REX_CLOACAE_PROFILE } from '../../content/profiles';
import { addFoe, beatFoe, beatenCount } from '../../content/questkit';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-venus-cloacina';
const GANG = ['cloaca-gang-a', 'cloaca-gang-b', 'cloaca-gang-c'] as const;
const REX = ['npc-rex-cloacae', 'npc-rex-cloacae~foe'];
const LANDING = 'cloaca-maxima-outlet';

const hour = (q: QuestContext) => q.game.time?.hour ?? 12;
/** After the second watch begins and before it is nearly dawn. */
const bathThievesAbout = (q: QuestContext) => hour(q) >= 21.55 || hour(q) < 2.45;

function watched(q: QuestContext) {
  if (q.stage === 'start' && bathThievesAbout(q) && q.game.locations?.isInside?.('shrine-venus-cloacina')) {
    beat(q.game, QUEST_ID, 'cloacarius-grate', { actors: ['cloaca-thief'], at: 'shrine-venus-cloacina' });
    say(q.game, 'Ianuarius’ grate', '(Iron scrapes. A shape drops a bundle through the grate and climbs after it.)');
    q.completeObjective('watch');
  }
}

function descended(q: QuestContext) {
  if (q.stage === 'descend') q.completeObjective('enter');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'What Venus Hides',
  latin: 'Quod Cloacina Celat',
  category: 'misc',
  giver: 'npc-ianuarius',
  summary: 'Someone has been lifting the grate beside the shrine of Venus Cloacina, and the old drain has a king.',
  stages: {
    start: {
      journal: 'Ianuarius, a public slave who looks after the drains, swears someone has been lifting the grate beside the little shrine of Venus Cloacina, the Venus of the sewer, in the middle of the Forum.',
      objectives: [{ id: 'watch', text: 'Watch the shrine of Venus Cloacina at night', target: { kind: 'location', id: 'shrine-venus-cloacina' } }],
      onEnter: (q) => {
        watched(q);
        if (!bathThievesAbout(q)) hint(q.game, 'Press T to wait until the second watch, after about 21:30.');
      },
      next: 'descend',
    },
    descend: {
      journal: 'Ianuarius gave me his key and a torch, and the blessing of “the old lady”, as he calls the Cloaca.',
      objectives: [{ id: 'enter', text: 'Go down into the Cloaca Maxima', target: { kind: 'location', id: LANDING } }],
      next: 'rex',
    },
    rex: {
      journal: 'In a chamber where three drains meet, a man in a stolen toga sat on a throne of bath-house benches and called himself king.',
      objectives: [
        { id: 'gang', text: 'Fight through the Rex’s lookouts', count: 3, target: { kind: 'location', id: LANDING } },
        { id: 'boss', text: 'Defeat or outwit the Rex Cloacae', target: { kind: 'location', id: LANDING } },
      ],
      onEnter: (q) => {
        let spawned = 0;
        GANG.forEach((id, i) => {
          const f = spawnEnemy(q.game, 'cloacarius', LANDING, { id, name: 'Cloacarius', tags: [QUEST_ID, 'cloacarius'], quest: QUEST_ID }, { x: (i - 1) * 3, z: 4 });
          addFoe(q, 'gang', f);
          if (f) spawned++;
        });
        if (!spawned) {
          // No combat module: the lookouts bolt and the king is alone.
          q.notify('The lookouts bolt down the side drains.');
          q.progress('gang', 3);
          startBoss(q);
        }
      },
      next: 'cache',
    },
    cache: {
      journal: 'His treasure was mostly other people’s clothes. Not all of it.',
      objectives: [
        { id: 'loot', text: 'Search the Rex’s cache', target: { kind: 'location', id: LANDING } },
        { id: 'out', text: 'Report to Ianuarius', target: { kind: 'npc', id: 'npc-ianuarius' } },
      ],
      next: 'done',
    },
    done: {
      journal: 'Ianuarius counted his grates twice and pronounced the old lady satisfied.',
      onEnter: (q) => {
        q.giveReward({ skillXp: ['athletics'] });
      },
      end: 'complete',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-ianuarius' && e.nodeId === 'accept') q.start();
    },
  },
  on: {
    'time:hour': (q) => watched(q),
    'location:entered': (q, e) => {
      if (e.locationId === 'shrine-venus-cloacina') watched(q);
      if (e.locationId === LANDING || e.locationId === 'dun-cloaca-maxima') descended(q);
    },
    'actor:killed': (q, e) => {
      if (q.stage !== 'rex') return;
      if (beatFoe(q, 'gang', e.victimId, GANG)) {
        q.progress('gang');
        if (beatenCount(q, 'gang') >= 3) startBoss(q);
        return;
      }
      if (REX.includes(e.victimId)) rexFell(q, 'killed');
    },
    'actor:yielded': (q, e) => {
      if (q.stage !== 'rex') return;
      if (beatFoe(q, 'gang', e.actorId, GANG)) {
        q.progress('gang');
        if (beatenCount(q, 'gang') >= 3) startBoss(q);
        return;
      }
      if (REX.includes(e.actorId)) rexFell(q, 'spared');
    },
    // The Rex's heap of stolen goods is a container (src/content/containers.ts, kind cista-regis-cloacae).
    'content:opened': (q, e) => {
      if (e.kind === 'cista-regis-cloacae') q.completeObjective('loot');
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-ianuarius' && e.nodeId === 'd0' && q.stage === 'cache') q.completeObjective('out');
      if (e.dialogueId === 'npc-rex-cloacae' && e.nodeId === 'leave' && q.stage === 'rex') {
        q.setFlag('rex-cloacae-fate', 'parleyed');
        q.completeObjective('gang');
        q.completeObjective('boss');
      }
    },
  },
});

/** The lookouts are down: the Rex stands up from his throne. */
function startBoss(q: QuestContext) {
  if (q.isObjectiveDone('boss') || q.vars.bossSpawned) return;
  q.vars.bossSpawned = true;
  say(q.game, 'Saturninus', 'Welcome to my kingdom. Mind the floor; it moves.');
  const placed = fight(q.game, 'npc-rex-cloacae', 'cloacarius', LANDING, { quest: QUEST_ID, tags: [QUEST_ID, 'boss-rex-cloacae'], name: 'Saturninus · Rex Cloacae', boss: 'boss-rex-cloacae', profile: REX_CLOACAE_PROFILE }, { z: 8 });
  if (!placed) {
    q.notify('The Rex surrenders his crown of grate-iron without a fight.');
    rexFell(q, 'spared');
  }
}

function rexFell(q: QuestContext, fate: 'killed' | 'spared') {
  q.setFlag('rex-cloacae-fate', fate);
  q.completeObjective('gang');
  q.completeObjective('boss');
}
