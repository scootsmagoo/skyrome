/**
 * mq-01-madida-capena "The Dripping Gate" (GDD §10.3 #1, §17.2 step 1–2). Main quest, v0.1 Must.
 *
 * Dawn, 11 May 113. The player comes in with the last night cart under the leaking aqueduct arch
 * of the Porta Capena (Juvenal's "madidam Capenam", 3.11). The courier C. Marius Festus walks
 * beside the cart; two grassatores knife him; the player fights them off (attack, block, the view
 * toggle), takes his sealed tablet from his dying hands and walks up the Circus valley to the
 * Forum.
 *
 *   start   speak with the courier (or walk on under the arches)    → ambush
 *   ambush  beat the two grassatores (killed, knocked out or yielded) → tablet
 *   tablet  take the sealed tablet from the dying courier           → forum
 *   forum   walk to the Forum Romanum (optional: pray at a compitum, read his warrant) → done
 *
 * Events: 'dialogue:node' (npc-festus), 'location:entered' (courier-ambush, the Forum),
 * 'actor:killed' / 'actor:yielded' (the grassatores), 'item:added' (the tablet), 'view:changed',
 * 'devotion:act' (compitum), 'book:read' (the warrant). Without a combat module the knife-men run
 * when the player shouts, so the thread stays playable.
 */
import { actorExists, beat, fight, hint, say, wieldedSkill } from '../../content/director';
import { addFoe, beatFoe, beatenCount, foes, giveItem, hasItem, isPlayer } from '../../content/questkit';
import type { ItemDef } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'mq-01-madida-capena';
const GRASSATORES = ['npc-sorex', 'npc-calvus'] as const;
/** Arriving anywhere here means "in the Forum". */
const FORUM_PLACES = ['miliarium-aureum', 'rostra', 'temple-saturn', 'basilica-julia', 'basilica-aemilia', 'temple-castor-pollux', 'curia-julia', 'temple-vesta'];

export const items: ItemDef[] = [
  {
    id: 'quest-tabella-signata',
    name: 'The Courier’s Sealed Tablet',
    latin: 'tabella signata',
    type: 'quest',
    questItem: true,
    weight: 0.3,
    value: 0,
    icon: '▭',
    description: 'Two wax tablets bound face to face with linen cord, the knot sealed in red wax with an eagle and a crown of oak. The seal is unbroken. C. Marius Festus died for it.',
    tags: ['tablet', 'sealed'],
  },
];

function startAmbush(q: QuestContext) {
  if (q.stage === 'start') q.setStage('ambush');
}

function taken(q: QuestContext) {
  q.completeObjective('take-tablet');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Dripping Gate',
  latin: 'Madida Capena',
  category: 'main',
  giver: 'npc-festus',
  summary: 'Rome, before dawn on 11 May 113. A courier was knifed beside me under the Porta Capena, and his sealed tablet is in my hands.',
  autoStart: true,
  stages: {
    start: {
      journal: 'I came into Rome before dawn on the fifth day before the Ides of May, riding the tail of a carter’s load under the dripping arches of the Porta Capena. A man in a courier’s cloak walked beside the cart for the last mile, saying nothing, watching the dark.',
      objectives: [
        { id: 'talk-courier', text: 'Speak with the courier beside the cart', target: { kind: 'npc', id: 'npc-festus' } },
        { id: 'view', text: 'Switch between first and third person (V)', optional: true },
      ],
      onEnter: (q) => hint(q.game, 'Press V at any time to switch between first and third person.'),
    },
    ambush: {
      journal: 'Two men came out of the dark under the arches. One went for the courier with a knife before I could shout. Now they were coming for me.',
      objectives: [{ id: 'grassatores', text: 'Fight off the two grassatores', count: 2, target: { kind: 'location', id: 'courier-ambush' } }],
      onEnter: (q) => {
        beat(q.game, QUEST_ID, 'courier-knifed', { actors: ['npc-festus', ...GRASSATORES], at: 'courier-ambush' });
        say(q.game, 'Sorex', 'Hold him! Get the satchel!');
        let spawned = 0;
        GRASSATORES.forEach((id, i) => {
          const actor = fight(q.game, id, 'grassator', 'courier-ambush', { quest: QUEST_ID, tags: [QUEST_ID, 'grassator'], name: id === 'npc-sorex' ? 'Sorex' : 'Calvus' }, { x: i ? 2 : -2, z: i ? -1 : 1 });
          addFoe(q, 'foes', actor);
          if (actor) spawned++;
        });
        if (spawned) {
          hint(q.game, 'F attacks (hold for a power attack). Q blocks; press it just before a blow lands to parry. R readies your weapon.');
        } else {
          // No combat module in this build: the knife-men flee when the player shouts.
          say(q.game, 'You', 'Vigiles! Vigiles!');
          q.notify('The knife-men run into the dark.');
          q.progress('grassatores', 2);
        }
      },
      next: 'tablet',
    },
    tablet: {
      journal: 'The knife-men were beaten. The courier lay in the road by the cart, bleeding into the gutter water from the aqueduct.',
      objectives: [{ id: 'take-tablet', text: 'Go to the dying courier', target: { kind: 'npc', id: 'npc-festus' } }],
      onEnter: (q) => {
        beat(q.game, QUEST_ID, 'courier-dying', { actors: ['npc-festus'], at: 'courier-ambush' });
        // No courier in the world to talk to (dev scenes, tests without NPCs): take it from his satchel.
        if (!actorExists(q.game, 'npc-festus')) {
          if (!hasItem(q, 'quest-tabella-signata')) giveItem(q, 'quest-tabella-signata');
          giveItem(q, 'evectio-festi');
          q.notify('You take a sealed tablet and a warrant from the dead courier’s satchel.');
          taken(q);
        }
      },
      next: 'forum',
    },
    forum: {
      journal: 'The courier was Gaius Marius Festus. He pressed his sealed tablet into my hands and said, “Castor. The strongrooms. Not the god’s house, below it. Tell them… the Column.” Then he died in the road. The way into the city runs up the valley of the Circus Maximus, under the palace, to the Forum.',
      objectives: [
        { id: 'forum', text: 'Walk into the city, to the Forum Romanum', target: { kind: 'location', id: 'miliarium-aureum' } },
        { id: 'pray', text: 'Pray at a crossroads shrine (compitum) on the way', optional: true },
        { id: 'warrant', text: 'Read the courier’s warrant', optional: true },
      ],
      onEnter: (q) => {
        if (q.game.locations?.isInside?.('miliarium-aureum')) q.completeObjective('forum');
        hint(q.game, 'Your journal (J) tracks the tablet. The compass marks the way.');
      },
      next: 'done',
    },
    done: {
      journal: 'I stood at the Golden Milestone, where every road in the world is measured from. The city was waking around me, and I was carrying a dead man’s secret.',
      onEnter: (q) => q.giveReward({ skillXp: [wieldedSkill(q.game)] }),
      end: 'complete',
    },
  },
  on: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId !== 'npc-festus') return;
      if (e.nodeId === 'walk') q.completeObjective('talk-courier');
      if (e.nodeId === 'lastWords' && q.stage === 'tablet') {
        beat(q.game, QUEST_ID, 'courier-dies', { actors: ['npc-festus'] });
        taken(q);
      }
    },
    // The knife-men strike when the conversation ends, not in the middle of it.
    'dialogue:ended': (q, e) => {
      if (e.npcId === 'npc-festus' && q.isObjectiveDone('talk-courier')) startAmbush(q);
    },
    'location:entered': (q, e) => {
      if (e.locationId === 'courier-ambush') startAmbush(q);
      if (q.stage === 'forum' && FORUM_PLACES.includes(e.locationId)) q.completeObjective('forum');
    },
    'location:exited': (q, e) => {
      // Grassatores flee at low health (§13.1): walking off after beating one leaves the other gone.
      if (q.stage === 'ambush' && e.locationId === 'courier-ambush' && beatenCount(q, 'foes') >= 1) {
        q.notify('The other knife-man has fled.');
        q.progress('grassatores', 2);
      }
    },
    'actor:killed': (q, e) => {
      if (q.stage === 'ambush' && beatFoe(q, 'foes', e.victimId, GRASSATORES)) q.progress('grassatores');
      if (isPlayer(e.victimId)) q.setFlag('mq01.playerDied', true);
    },
    'actor:yielded': (q, e) => {
      if (q.stage === 'ambush' && beatFoe(q, 'foes', e.actorId, GRASSATORES)) q.progress('grassatores');
    },
    'item:added': (q, e) => {
      if (e.itemId === 'quest-tabella-signata' && q.stage === 'tablet') taken(q);
    },
    'view:changed': (q) => q.completeObjective('view'),
    'devotion:act': (q, e) => {
      if (e.act === 'compitum') q.completeObjective('pray');
    },
    'book:read': (q, e) => {
      if (e.itemId === 'evectio-festi') q.completeObjective('warrant');
    },
  },
  rewards: { denarii: 10 },
});

/** For tests and debug tools: the grassatores' actor ids this run is listening for. */
export function grassatorIds(q: QuestContext): string[] {
  return foes(q, 'foes');
}
