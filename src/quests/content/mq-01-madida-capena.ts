/**
 * mq-01-madida-capena "The Dripping Gate" (docs/STORY.md chapter 1; GDD §10.3 #1, §17.2 steps 1–2).
 * Main quest, auto-started with the new game at the Porta Capena, 11 May AD 113, 04:30.
 *
 *   start   on the cart: Festus, a courier, is being followed and asks you to walk him in   → gate
 *   gate    walk through the Capena Gate beside him                                         → ambush
 *   ambush  a hooded man knifes Festus and runs off with his satchel; fight the other two   → dying
 *   dying   Festus gives you his sealed tablet: Gratus, the strongrooms under Castor        → done
 *   done    the chapter ends; mq-02-tabella takes the tablet on to the Forum
 *
 * Nothing in the opening is random: Festus says he is followed before the knives come out, the
 * killer is seen running off with the satchel, and the street muggers stay home while Act I's first
 * night runs (combat/danger.ts). The tutorial pair (A: a light chain; B: waits three seconds, then a
 * long power attack) teaches R/F/Q. The quest listens to 'actor:killed' / 'actor:yielded' (a kill,
 * a knockout or a yield counts), 'dialogue:node' (Festus: cartEnd, dyingEnd; Dromo: sawIt) and
 * 'location:entered' (the arch). Without combat or NPCs (dev scenes, tests) every step still
 * completes from events alone.
 */
import { actorExists, beat, hint, holdPose, moveActor, runner, say, scriptedDeath, spawnEnemy, walkTo } from '../../content/director';
import { mq01GrassatorProfile } from '../../content/profiles';
import { addFoe, beatFoe, giveItem, hasItem, isPlayer } from '../../content/questkit';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'mq-01-madida-capena';
const GRASSATORES = ['mq01-grassator-a', 'mq01-grassator-b'] as const;
/** Arriving at any of these means the player walked on without the courier's last words. */
const FORUM_PLACES = ['miliarium-aureum', 'rostra', 'temple-saturn', 'basilica-julia', 'basilica-aemilia', 'temple-castor-pollux', 'curia-julia', 'temple-vesta', 'castor-loculi'];

function giveTablet(q: QuestContext) {
  if (!hasItem(q, 'quest-tabella-signata')) giveItem(q, 'quest-tabella-signata');
}

/** Festus falls in the road and lies there, alive, until his last words. */
function festusDown(q: QuestContext) {
  holdPose(q.game, 'npc-festus', 'sleep');
}

/**
 * The courier dies without his last words (the player walked on to the Forum): the tablet is the
 * player's all the same (he pressed it on them as they fought), and the journal repeats what he
 * said under the arch, so the thread never stops here.
 */
function festusDiesUnheard(q: QuestContext) {
  if (q.stage !== 'dying') return;
  giveTablet(q);
  q.notify('Festus died under the arch behind you. His sealed tablet is in your belt: he pushed it at you as he fell. “Gratus,” he had said. “Castor.”');
  q.setFlag('festus-dead', true);
  scriptedDeath(q.game, 'npc-festus', 'npc-mus');
  q.completeObjective('talk-dying');
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
  summary: 'Rome, before dawn on 11 May 113. A courier who was being followed asked me to walk him through the Porta Capena. He was knifed beside me, and his sealed tablet is in my hands.',
  autoStart: true,
  stages: {
    start: {
      journal: 'I came to Rome in the last watch of the night, on a wine cart up the Appian Way. A courier called Festus shared the cart and the cold. Ahead of us the aqueduct arches dripped over the Capena Gate.',
      objectives: [{ id: 'talk-festus', text: 'Talk to Festus, the courier', target: { kind: 'npc', id: 'npc-festus' } }],
      onEnter: (q) => {
        // The shareable build may start far from the gate: say where the story is.
        const gate = q.game.landmarks?.get('porta-capena')?.position;
        const p = q.game.player?.position;
        const far = !!gate && !!p && Math.hypot(gate.x - p.x, gate.z - p.z) > 80;
        hint(
          q.game,
          far
            ? 'Click the view to look around (or use the arrow keys). W A S D to walk, Shift to sprint. The story starts at the Porta Capena: follow the gold marker.'
            : 'Walk with W A S D (look with the arrow keys or the trackpad). Press E to talk. The gold marker always shows your next step.',
        );
      },
      next: 'gate',
    },
    gate: {
      journal: 'Festus carried a sealed tablet for his centurion, and he was sure we had been followed since Bovillae: two riders who never passed the cart and never fell back. He asked me to walk through the gate with him. Two are harder to knife than one, he said.',
      objectives: [{ id: 'walk-gate', text: 'Walk through the Capena Gate with Festus', target: { kind: 'location', id: 'courier-ambush' } }],
      onEnter: (q) => {
        walkTo(q.game, 'npc-festus', 'courier-ambush', 1.2, { x: -1.5 });
        if (q.game.locations?.isInside?.('courier-ambush')) q.completeObjective('walk-gate');
      },
      next: 'ambush',
    },
    ambush: {
      journal: 'Under the dripping arch three men stepped out of the dark. A hooded man with a curved blade put his knife into Festus, snatched his satchel and ran off up the valley. The other two came for me. Whatever they wanted, it was not in the satchel.',
      objectives: [{ id: 'fight', text: 'Fight off the attackers', count: 2, target: { kind: 'location', id: 'courier-ambush' } }],
      onEnter: (q) => {
        q.setFlag('festus-dead', false);
        if (!q.game.locations?.isInside?.('courier-ambush') || !actorExists(q.game, 'npc-festus')) moveActor(q.game, 'npc-festus', 'courier-ambush', { x: -1.5 });
        festusDown(q);
        beat(q.game, QUEST_ID, 'courier-knifed', { actors: ['npc-festus', 'npc-mus'], at: 'courier-ambush' });
        // The killer is seen: Mus, hooded, the sica in his hand, off up the valley with the satchel.
        runner(q.game, 'grassator', 'courier-ambush', 'astrologi-circi', { id: 'mq01-hooded-man', npc: 'npc-mus', name: 'Hooded man' }, { x: 2, z: -2 });
        q.setFlag('mus-has-satchel', true);
        say(q.game, 'Hooded man', 'Got the bag! Finish it!');
        let spawned = 0;
        (['a', 'b'] as const).forEach((which, i) => {
          const id = GRASSATORES[i];
          // Where the world (or the content's fallback) says each one waits; else around the ambush.
          const spot = `capena-grassator-${which}`;
          const at = q.game.locations?.get(spot) ? spot : 'courier-ambush';
          const offset = at === spot ? {} : { x: i ? 2.5 : -0.5, z: i ? -1.5 : 2.5 };
          const placed = spawnEnemy(q.game, 'grassator', at, { id, name: which === 'a' ? 'Grassator with a knife' : 'Grassator with a cudgel', tags: [QUEST_ID, 'mq01-grassator'], quest: QUEST_ID, profile: mq01GrassatorProfile(which) }, offset);
          addFoe(q, 'foes', placed);
          if (placed) spawned++;
        });
        if (spawned) {
          setTimeout?.(() => q.stage === 'ambush' && say(q.game, 'Grassator', 'The tablet’s not in the bag! Kill the stranger, then search the soldier!'), 2200);
          hint(q.game, 'R readies your weapon, F attacks (hold for a power attack), Q blocks (tap it just before a blow lands to parry), X locks on to a foe.');
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
      journal: 'When the last of them was down, Festus was still breathing. He lay in the road under the arch with the water falling on his face.',
      objectives: [
        { id: 'talk-dying', text: 'Hear Festus’ last words', target: { kind: 'npc', id: 'npc-festus' } },
        { id: 'ask-dromo', text: 'Ask the carter what he saw', optional: true, target: { kind: 'npc', id: 'npc-dromo' } },
      ],
      onEnter: (q) => {
        festusDown(q);
        beat(q.game, QUEST_ID, 'courier-dying', { actors: ['npc-festus'], at: 'courier-ambush' });
        // No courier in the world to talk to (dev scenes, tests without NPCs): his tablet is in his belt.
        if (!actorExists(q.game, 'npc-festus')) {
          giveTablet(q);
          q.notify('You take a sealed tablet from the dead courier’s belt.');
          q.setFlag('clue-curved-blade', true);
          q.completeObjective('talk-dying');
          return;
        }
        // He calls you over himself, a moment after the fight.
        setTimeout?.(() => {
          if (q.stage === 'dying' && !q.game.dialogue?.active && !q.isObjectiveDone('talk-dying')) q.game.dialogue?.start('npc-festus');
        }, 1800);
      },
      next: 'done',
    },
    done: {
      journal: 'Festus died under the dripping arch as the sky went grey behind me. His tablet was in my belt and his last words in my head. Gratus, his centurion, in the strongrooms under the Temple of Castor, in the Forum. Nobody else.',
      onEnter: (q) => {
        q.game.standing?.addFame('dist-circus-maximus', 5);
      },
      end: 'complete',
    },
  },
  on: {
    // "The cart dialogue opens by itself when the scene starts" (§3.1.1): a new game begins with
    // Festus speaking first. Quick starts (agents, tests) and loads stay quiet.
    'game:started': (q, e) => {
      if (e.kind !== 'new' || q.stage !== 'start' || typeof setTimeout !== 'function') return;
      const open = () => {
        // The shareable build's welcome card first (any key closes it).
        if (typeof document !== 'undefined' && document.querySelector('.welcome-shade')) return void setTimeout(open, 700);
        if (q.stage === 'start' && !q.game.dialogue?.active && !q.isObjectiveDone('talk-festus')) q.game.dialogue?.start('npc-festus');
      };
      setTimeout(open, 2500);
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-festus') {
        if (e.nodeId === 'cartEnd') q.completeObjective('talk-festus');
        if (e.nodeId === 'd1' && q.stage === 'dying') giveTablet(q);
        if (e.nodeId === 'dyingEnd' && q.stage === 'dying') {
          q.setFlag('festus-dead', true);
          scriptedDeath(q.game, 'npc-festus', 'npc-mus');
          q.completeObjective('talk-dying');
        }
      }
      if (e.dialogueId === 'npc-dromo' && e.nodeId === 'sawIt') q.completeObjective('ask-dromo');
    },
    'location:exited': (q, e) => {
      // "If the player runs more than 40 m away, the grassatores give up": they have lost him.
      if (q.stage === 'ambush' && e.locationId === 'capena-fight-area') {
        q.notify('The knife-men give up the chase. Back at the arch, Festus is lying in the road.');
        beat(q.game, QUEST_ID, 'grassatores-flee', { actors: [...GRASSATORES], at: 'capena-fight-area' });
        ambushOver(q);
      }
    },
    'location:entered': (q, e) => {
      // Walking off from the cart before talking: Festus comes along (he wants company).
      if (q.stage === 'start' && e.locationId === 'courier-ambush') {
        q.completeObjective('talk-festus');
      }
      if (q.stage === 'gate' && e.locationId === 'courier-ambush') q.completeObjective('walk-gate');
      // Safety net: the player walked on to the Forum without the courier's last words.
      if (q.stage === 'dying' && FORUM_PLACES.includes(e.locationId)) festusDiesUnheard(q);
    },
    'actor:killed': (q, e) => {
      if (q.stage === 'ambush' && beatFoe(q, 'foes', e.victimId, GRASSATORES)) q.progress('fight');
      if (isPlayer(e.victimId)) q.setFlag('mq01-player-died', true);
    },
    'actor:yielded': (q, e) => {
      if (q.stage === 'ambush' && beatFoe(q, 'foes', e.actorId, GRASSATORES)) q.progress('fight');
    },
    'save:loaded': (q) => {
      if (q.stage === 'ambush' || q.stage === 'dying') festusDown(q);
    },
  },
  rewards: {},
});
