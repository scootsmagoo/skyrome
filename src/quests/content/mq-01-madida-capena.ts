/**
 * mq-01-madida-capena "The Dripping Gate" (docs/CONTENT.md §3.1.1; GDD §10.3 #1, §17.2 steps 1–2).
 * Main quest, v0.1 Must, auto-started with the new game at the Porta Capena, 11 May AD 113, 04:30.
 *
 *   start   climb down at the cart stand outside the gate, talk to Festus      → gate
 *   gate    walk through the Capena Gate (the arch drips)                      → ambush
 *   ambush  Mus knifes Festus and runs; fight the two grassatores              → dying
 *   dying   the courier presses his sealed tablet into your hand              → city
 *   city    up the Circus valley and through the Velabrum to the Forum         → done
 *   done    the Golden Milestone; mq-02-tabella begins
 *
 * What the player does where: V, R/F/Q are taught by the two tutorial thugs (the bible's pair: A
 * opens with a light chain, B waits three seconds, then a long power attack). The quest listens to
 * 'actor:killed' / 'actor:yielded' (a kill, a knockout or a yield counts), 'dialogue:node' (Festus:
 * cartEnd, dyingEnd; Dromo: sawIt; Capito, Chreste and the vigiles reveal the hideout through the
 * flag 'hideout-known'), 'location:entered' (the arch, the Forum), 'devotion:act' (a compitum) and
 * 'barter:trade' (the Silver Pig). Without a combat module (dev scenes, tests) the knife-men run off
 * when the player shouts and the thread stays playable.
 */
import { beat, hint, moveActor, placeExamine, removeExamine, say, scriptedDeath, spawnEnemy, actorExists } from '../../content/director';
import { mq01GrassatorProfile } from '../../content/profiles';
import { addFoe, beatFoe, beatenCount, giveItem, hasItem, isPlayer } from '../../content/questkit';
import { Rng } from '../../core/Rng';
import { rollLoot } from '../../rpg/loot';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'mq-01-madida-capena';
const GRASSATORES = ['mq01-grassator-a', 'mq01-grassator-b'] as const;
/** Arriving at any of these means "in the Forum" (the bible asks for the Golden Milestone; the Forum around it counts). */
const FORUM_PLACES = ['miliarium-aureum', 'rostra', 'temple-saturn', 'basilica-julia', 'basilica-aemilia', 'temple-castor-pollux', 'curia-julia', 'temple-vesta'];

const BODY = { id: 'festus-body', at: 'courier-ambush', verb: 'Search', label: 'The courier’s body', height: 0.5, offset: { x: -1.5 } };

function searchBody(q: QuestContext) {
  if (q.isObjectiveDone('search')) return;
  removeExamine(BODY.id);
  const loot = rollLoot('body.npc-festus', 1, q.game.rng?.fork('body') ?? new Rng('body'));
  const inv = q.game.player?.inventory;
  for (const it of loot.items) inv?.add(it.id, it.count, { source: 'quest' });
  if (loot.denarii) inv?.addDenarii(loot.denarii);
  q.completeObjective('search');
}

function giveTablet(q: QuestContext) {
  if (!hasItem(q, 'quest-tabella-signata')) giveItem(q, 'quest-tabella-signata');
}

/** The ambush is over: the knife-men are down, fled or given up. */
function ambushOver(q: QuestContext) {
  if (q.stage === 'ambush') q.progress('fight', 2);
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
      journal: 'I came to Rome in the fourth watch of the night, on the last wine cart up the Appian Way. A courier called Festus shared the cart and the cold. Ahead of us the aqueduct arches dripped over the Capena Gate. At the cart stand outside the walls I climbed down to stretch my legs.',
      objectives: [
        { id: 'talk-festus', text: 'Talk to the courier', optional: true, target: { kind: 'npc', id: 'npc-festus' } },
        { id: 'dismount', text: 'Walk on toward the Capena Gate', target: { kind: 'location', id: 'porta-capena' } },
      ],
      onEnter: (q) => hint(q.game, 'Walk with W (look with the arrow keys or the trackpad). Press E to talk to the courier. The compass at the top shows where to go.'),
      next: 'gate',
    },
    gate: {
      journal: 'Festus walked ahead to stretch his legs. Under the arch the water fell like thin rain. “The gate weeps for every stranger,” he said.',
      objectives: [{ id: 'walk-gate', text: 'Walk through the Capena Gate', target: { kind: 'location', id: 'courier-ambush' } }],
      onEnter: (q) => {
        if (q.game.locations?.isInside?.('courier-ambush')) q.completeObjective('walk-gate');
      },
      next: 'ambush',
    },
    ambush: {
      journal: 'Three men came out of the dark under the arch. One of them knifed Festus before he could draw. The other two came for me.',
      objectives: [{ id: 'fight', text: 'Fight off the attackers', count: 2, target: { kind: 'location', id: 'courier-ambush' } }],
      onEnter: (q) => {
        q.setFlag('festus-dead', false);
        moveActor(q.game, 'npc-festus', 'courier-ambush', { x: -1.5 });
        beat(q.game, QUEST_ID, 'courier-knifed', { actors: ['npc-festus', 'npc-mus'], at: 'courier-ambush' });
        beat(q.game, QUEST_ID, 'mus-flees', { actors: ['npc-mus'], at: 'astrologi-circi' });
        q.setFlag('mus-has-satchel', true);
        say(q.game, 'Grassator', 'Hold him! Get the satchel!');
        let spawned = 0;
        (['a', 'b'] as const).forEach((which, i) => {
          const id = GRASSATORES[i];
          const placed = spawnEnemy(q.game, 'grassator', 'courier-ambush', { id, name: which === 'a' ? 'Grassator with a knife' : 'Grassator with a cudgel', tags: [QUEST_ID, 'mq01-grassator'], quest: QUEST_ID, profile: mq01GrassatorProfile(which) }, { x: i ? 2.5 : -0.5, z: i ? -1.5 : 2.5 });
          addFoe(q, 'foes', placed);
          if (placed) spawned++;
        });
        if (spawned) {
          hint(q.game, 'R readies your weapon, F attacks (hold for a power attack), Q blocks (tap it just before a blow lands to parry), V switches view, X locks on.');
        } else {
          // No combat module in this build: the knife-men run when the player shouts.
          say(q.game, 'You', 'Vigiles! Vigiles!');
          q.notify('The knife-men run into the dark.');
          q.progress('fight', 2);
        }
      },
      next: 'dying',
    },
    dying: {
      journal: 'Festus was still alive when I knelt beside him. He pushed a sealed tablet into my hand.',
      objectives: [
        { id: 'talk-dying', text: 'Speak to the dying courier', target: { kind: 'npc', id: 'npc-festus' } },
        { id: 'ask-dromo', text: 'Ask the carter what he saw', optional: true, target: { kind: 'npc', id: 'npc-dromo' } },
      ],
      onEnter: (q) => {
        beat(q.game, QUEST_ID, 'courier-dying', { actors: ['npc-festus'], at: 'courier-ambush' });
        // No courier in the world to talk to (dev scenes, tests without NPCs): his dispatch is in his satchel.
        if (!actorExists(q.game, 'npc-festus')) {
          giveTablet(q);
          q.notify('You take a sealed tablet from the dead courier’s belt.');
          q.setFlag('clue-curved-blade', true);
          q.completeObjective('talk-dying');
        }
      },
      next: 'city',
    },
    city: {
      journal: 'Festus died under the dripping arch with the sun coming up behind me. His last words sent me to the strongrooms under the Temple of Castor, in the Forum. The way led up the valley of the Circus, under the walls of the palace.',
      objectives: [
        { id: 'circus', text: 'Follow the valley past the Circus Maximus', optional: true, target: { kind: 'location', id: 'circus-maximus' } },
        { id: 'forum', text: 'Reach the Forum and the Golden Milestone', target: { kind: 'location', id: 'miliarium-aureum' } },
        { id: 'lares', text: 'Pray at a crossroads shrine on the way', optional: true, target: { kind: 'location', id: 'compitum-capenae' } },
        { id: 'popina', text: 'Eat or drink at the Silver Pig on the Vicus Tuscus', optional: true, target: { kind: 'location', id: 'popina-vici-tusci' } },
        { id: 'search', text: 'Search the courier’s body', optional: true, target: { kind: 'location', id: 'courier-ambush' } },
        { id: 'hideout', text: 'Find the knife-men’s hideout', optional: true, hidden: true, target: { kind: 'location', id: 'taberna-collapsa' } },
      ],
      onEnter: (q) => {
        if (q.game.locations?.isInside?.('miliarium-aureum')) q.completeObjective('forum');
        if (q.flag('hideout-known')) q.reveal('hideout');
        placeExamine(q.game, BODY);
        hint(q.game, 'Your journal (J) tracks the tablet. Press M for the map.');
      },
      next: 'done',
    },
    done: {
      journal: 'I stood at the Golden Milestone, where they say every road in Italy ends. Mine had ended there too, for now. Festus’ tablet was still sealed in my belt.',
      onEnter: (q) => {
        removeExamine(BODY.id);
        q.game.standing?.addFame('dist-circus-maximus', 5);
      },
      end: 'complete',
    },
  },
  on: {
    // "The cart dialogue opens by itself when the scene starts" (§3.1.1): a new game begins with Festus
    // asking whether this is the first time in Rome. Quick starts (agents, tests) and loads stay quiet.
    'game:started': (q, e) => {
      if (e.kind !== 'new' || q.stage !== 'start' || typeof setTimeout !== 'function') return;
      setTimeout(() => {
        if (q.stage === 'start' && !q.game.dialogue?.active && !q.isObjectiveDone('talk-festus')) q.game.dialogue?.start('npc-festus');
      }, 2500);
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-festus') {
        if (e.nodeId === 'cartEnd') {
          q.completeObjective('talk-festus');
          q.completeObjective('dismount');
        }
        if (e.nodeId === 'd1' && q.stage === 'dying') giveTablet(q);
        if (e.nodeId === 'dyingEnd' && q.stage === 'dying') {
          q.completeObjective('talk-dying');
          q.setFlag('festus-dead', true);
          scriptedDeath(q.game, 'npc-festus', 'npc-mus');
        }
      }
      if (e.dialogueId === 'npc-dromo' && e.nodeId === 'sawIt') q.completeObjective('ask-dromo');
    },
    'location:exited': (q, e) => {
      if (q.stage === 'start' && (e.locationId === 'spawn-capena' || e.locationId === 'capena-extra')) q.completeObjective('dismount');
      // "If the player runs more than 40 m away, the grassatores give up": they have lost him.
      if (q.stage === 'ambush' && e.locationId === 'capena-fight-area') {
        q.notify('The knife-men give up the chase. Back at the arch, a man is dying.');
        beat(q.game, QUEST_ID, 'grassatores-flee', { actors: [...GRASSATORES], at: 'capena-fight-area' });
        ambushOver(q);
      }
      // Walking off after beating one leaves the other gone (thugs flee at 15%).
      if (q.stage === 'ambush' && e.locationId === 'courier-ambush' && beatenCount(q, 'foes') >= 1) ambushOver(q);
    },
    'location:entered': (q, e) => {
      if ((q.stage === 'start' || q.stage === 'gate') && e.locationId === 'courier-ambush') {
        q.completeObjective('dismount');
        q.completeObjective('walk-gate');
      }
      if (q.stage === 'city') {
        if (e.locationId === 'circus-maximus') q.completeObjective('circus');
        if (FORUM_PLACES.includes(e.locationId)) q.completeObjective('forum');
        if (e.locationId === 'taberna-collapsa') q.completeObjective('hideout');
      }
    },
    'flag:changed': (q, e) => {
      if (e.name === 'hideout-known' && e.value === true && q.stage === 'city') q.reveal('hideout');
    },
    'actor:killed': (q, e) => {
      if (q.stage === 'ambush' && beatFoe(q, 'foes', e.victimId, GRASSATORES)) q.progress('fight');
      if (isPlayer(e.victimId)) q.setFlag('mq01-player-died', true);
    },
    'actor:yielded': (q, e) => {
      if (q.stage === 'ambush' && beatFoe(q, 'foes', e.actorId, GRASSATORES)) q.progress('fight');
    },
    'content:interact': (q, e) => {
      if (e.id === BODY.id) searchBody(q);
    },
    'devotion:act': (q, e) => {
      if (e.act === 'compitum') q.completeObjective('lares');
    },
    'barter:trade': (q, e) => {
      if (e.npcId === 'npc-chreste' && e.kind === 'buy') q.completeObjective('popina');
    },
    'save:loaded': (q) => {
      if (q.stage === 'city' && !q.isObjectiveDone('search')) placeExamine(q.game, BODY);
    },
  },
  rewards: {},
});
