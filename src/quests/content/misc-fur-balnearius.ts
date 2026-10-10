/**
 * misc-fur-balnearius "The Bath Thief" (docs/design/world-life.md §4.8 Q3, QUESTS I). Misc quest, three
 * endings, one of them ambiguous.
 *
 * Bathing at the Baths of Titus without the tip can cost the player their cloak (rest.bathe's 15 %,
 * src/life/effects.ts): the quest starts on 'life:option' with `detail.stolen` once mq-02 is done, or
 * from a hooked notice or rumour before the player has lost anything. Sabinus is the capsarius, the
 * cloakroom attendant at the baths' side door (13:10–16:45); the prefect of the watch heard cases
 * against capsarii who stole clothes at the baths (Digest 1.15.3.5) [A]; curse tablets against bath
 * thieves survive from Bath in Britain, and were put in graves [A, outside Rome].
 *
 *   start     ask Sabinus, who shrugs                                               → watch
 *   watch     at the next bathing hour (9th to 11th) be at the cloakroom door; a slave comes out with a
 *             bundle                                                                  → follow
 *   follow    follow him to Crispina's doorway; she tells who sends the cloaks: Sabinus, one a day → choose
 *   choose    (a) confront Sabinus: Rhetoric DC 40, or fists (stage fight)     → done-confront (5 den.)
 *             (b) report him to the optio of the vigiles at the night post       → done-report (8 den.)
 *             (c) have a curse tablet (defixio) written and push it into a tomb's libation pipe
 *                 outside the Porta Capena (stage curse): three days later Sabinus is sick and the
 *                 cloak hangs on the player's peg again; nobody says why                → done-curse
 *
 * (a) and (b) bring the cloak back (the player's own, or a spare if the quest began from a notice).
 * The tracker never moves off a running main quest (QuestSystem.start).
 */
import * as THREE from 'three';
import { fight, groundAt, hint, placePosition, release, stage, unstage, walkTo } from '../../content/director';
import { hasItem, takeItem } from '../../content/questkit';
import { between } from '../../content/hours';
import type { Game } from '../../core/Game';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-fur-balnearius';
const SABINUS = 'npc-sabinus-capsarius';
const SLAVE = 'npc-servus-balnei';
const CRISPINA = 'keeper-subura-receptatrix';
const OPTIO = 'npc-optio-vigilum';
const ONESIMUS = 'keeper-capena-plumbarius';
const DOOR = 'baths-titus:front';
const TABLET = 'defixio-furtum';
const MAIN_DONE = 'mq-02-tabella';
/** Game hours until the fever takes: three days. */
const CURSE_HOURS = 72;

/** A conversation node was reached. */
const hit = (e: { dialogueId: string; nodeId: string }, dialogue: string, node: string) => e.dialogueId === dialogue && e.nodeId === node;

// ------------------------------------------------------------------ the libation pipe (a persistent prompt)

let off: (() => void) | null = null;

function placePipe(game: Game, q: QuestContext) {
  removePipe();
  const inter = game.interactions;
  // At the letter-cutter's tomb on the Via Appia (his post), the round monument 4 m back toward the gate; else by the cart stand.
  const post = game.life?.whereIs?.(ONESIMUS)?.look;
  const base = post ? groundAt(game, { x: post.x - 2.2, z: post.z - 3.0 }) : placePosition(game, 'capena-extra');
  if (!inter?.add || !base) return;
  const p = new THREE.Vector3(base.x, base.y + 0.9, base.z);
  off = inter.add({
    id: 'content:bath-libation',
    reach: 2.6,
    position: () => p,
    verb: () => 'Push a tablet into the pipe',
    label: () => 'Libation pipe of a tomb',
    interact: (g) => {
      if (!hasItem(q, TABLET)) {
        g.events.emit('rpg:notify', { text: 'You have nothing to push into it. Onesimus, who cuts letters among the tombs, writes tablets for a denarius.', kind: 'info' });
        return;
      }
      g.events.emit('content:interact', { id: 'bath-libation' });
    },
  }) as () => void;
}

function removePipe() {
  off?.();
  off = null;
}

// ------------------------------------------------------------------ the cloakroom door

function hourNow(game: Game): number {
  return game.time?.hour ?? 12;
}

/** The slave comes out with a bundle when the player is at the door in the bathing hours. */
function maybeWatch(q: QuestContext) {
  if (q.stage !== 'watch' || !between(hourNow(q.game), 'h9', 'h11')) return;
  const door = q.game.locations?.get(DOOR)?.position;
  const p = q.game.player?.position;
  if (door && p && Math.hypot(p.x - door.x, p.z - door.z) > 22) return;
  q.completeObjective('door');
}

function cloakId(q: QuestContext): string {
  const id = q.flag('bath-stolen-cloak');
  return typeof id === 'string' && id ? id : 'paenula';
}

/** The cloak comes back to the player. */
function returnCloak(q: QuestContext) {
  q.game.player?.inventory?.add(cloakId(q), 1, { source: 'quest' });
  q.setFlag('bath-stolen-cloak', '');
}

function tidy(q: QuestContext) {
  removePipe();
  release(q.game, SLAVE);
  unstage(q.game, SLAVE);
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Bath Thief',
  latin: 'Fur Balnearius',
  category: 'misc',
  giver: SABINUS,
  summary: 'A cloak a day goes from the pegs at the Baths of Titus.',
  stages: {
    start: {
      journal: 'Cloaks go missing from the pegs at the Baths of Titus, a cloak a day, they say. Sabinus the capsarius keeps the cloakroom at the baths’ side door. He was the man to ask.',
      objectives: [{ id: 'ask', text: 'Ask Sabinus, the cloakroom attendant (side door, 8th to 11th hour)', target: { kind: 'npc', id: SABINUS } }],
      next: 'watch',
    },
    watch: {
      journal: 'Sabinus shrugged. He said the pegs were the pegs and the gods looked after them. But someone was carrying cloaks out of that door, and I meant to see who. At the next bathing hour I would stand by the cloakroom door and wait (T).',
      objectives: [{ id: 'door', text: 'Watch the cloakroom door at the Baths of Titus (9th to 11th hour)', target: { kind: 'location', id: DOOR } }],
      next: 'follow',
    },
    follow: {
      journal: 'A slave came out of the side door with a bundle under his arm and walked off with the air of a man who had somewhere to be. I went after him.',
      objectives: [{ id: 'bundle', text: 'Follow the slave to Crispina’s doorway, off the Argiletum', target: { kind: 'npc', id: CRISPINA } }],
      onEnter: (q) => {
        const g = q.game;
        const door = g.locations?.get(DOOR)?.position;
        q.notify('A slave slips out of the cloakroom door with a bundle under his arm.');
        // Put him at the door (stage spawns him), let him go (a posed NPC can't walk), then send him off.
        if (door) {
          stage(g, SLAVE, door, 0, 'stand');
          unstage(g, SLAVE);
        }
        const post = g.life?.whereIs?.(CRISPINA)?.look;
        if (post) walkTo(g, SLAVE, { x: post.x, z: post.z }, 2.4);
      },
      next: 'choose',
    },
    choose: {
      journal: 'Crispina told me where the cloaks go: Sabinus sends her one a day, never more. A confrontation, the vigiles, or a god. I had three roads to choose from.',
      objectives: [{ id: 'deal', text: 'Deal with Sabinus: confront him, report him to the vigiles, or have a curse tablet written', target: { kind: 'npc', id: SABINUS } }],
      onEnter: (q) => {
        tidy(q);
        placePipe(q.game, q);
      },
    },
    fight: {
      journal: 'I told Sabinus I would have my cloak back, and not by asking. He put up his hands as a man does who has never fought for anything.',
      objectives: [{ id: 'ko', text: 'Knock Sabinus down, or make him yield (fists)', target: { kind: 'npc', id: SABINUS } }],
      onEnter: (q) => {
        removePipe();
        const id = fight(q.game, SABINUS, 'ebrius-rixator', DOOR, { brawl: true, tags: [QUEST_ID], quest: QUEST_ID }, { x: 0, z: 1.5 });
        if (id) hint(q.game, 'Sheathe your blade (R) and use your fists: fists always knock out. Drawing a blade turns this into assault.');
      },
    },
    curse: {
      journal: 'I had Sabinus’s name and Mercury’s scratched on a lead tablet and pushed it into the libation pipe of a tomb outside the Porta Capena. Nothing happened. Nothing is supposed to happen for a while.',
      objectives: [{ id: 'wait', text: 'Wait three days (T)' }],
      onEnter: (q) => {
        removePipe();
        takeItem(q, TABLET);
        q.vars.curseAt = q.game.time?.totalHours ?? 0;
      },
    },
    'done-confront': {
      journal: 'Sabinus gave the cloak back, white to the lips, and five denarii from his own pouch on top of it, so that I would say nothing to anyone. I said nothing. I walked out of the Titus in my own cloak.',
      onEnter: (q) => {
        returnCloak(q);
        q.giveReward({ denarii: 5 });
      },
      end: 'complete',
    },
    'done-report': {
      journal: 'The optio wrote it all down on a wax tablet and sent two of his men round to the Titus. They came back with the cloak, and eight denarii that the prefect of the watch had Sabinus pay for the trouble. They say he is cleaning latrines now.',
      onEnter: (q) => {
        returnCloak(q);
        q.giveReward({ denarii: 8 });
      },
      end: 'complete',
    },
    'done-curse': {
      journal: 'Three days later I heard that Sabinus was in his bed with a fever, and when I went by the Titus my cloak was hanging on my peg as if it had never been gone. Nobody said why. I did not ask.',
      onEnter: (q) => {
        returnCloak(q);
        q.setFlag('bath-curse-ending', true);
      },
      end: 'complete',
    },
    'fail-dead': {
      journal: 'I killed a man over a cloak. Whatever Mercury thinks of that, the vigiles will think it too.',
      end: 'fail',
    },
  },
  triggers: {
    // The theft itself: the cloak taken from the peg at the baths, once the opening nights are over.
    'life:option': (q, e) => {
      const stolen = e.detail?.stolen;
      if (typeof stolen !== 'string' || !stolen) return;
      if (!q.quest(MAIN_DONE)?.done) return;
      q.setFlag('bath-stolen-cloak', stolen);
      q.start();
    },
  },
  on: {
    'dialogue:node': (q, e) => {
      if (hit(e, SABINUS, 'sabShrug') && q.stage === 'start') q.completeObjective('ask');
      if (q.stage === 'choose') {
        if (hit(e, SABINUS, 'sabConfesses')) q.setStage('done-confront');
        if (hit(e, SABINUS, 'sabFight')) q.setStage('fight');
        if (hit(e, OPTIO, 'reportSabinusDone')) q.setStage('done-report');
        // Onesimus has the tablet written (he gives it in his own dialogue).
        if (hit(e, ONESIMUS, 'tabletBought')) q.notify('Onesimus scratches the name on the lead sheet and hands it over: now to a tomb by the road.');
      }
      if (hit(e, CRISPINA, 'bundleTold') && q.stage === 'follow') q.completeObjective('bundle');
    },
    'content:interact': (q, e) => {
      if (e.id === 'bath-libation' && q.stage === 'choose' && hasItem(q, TABLET)) q.setStage('curse');
    },
    'location:entered': (q, e) => {
      if (e.locationId === DOOR) maybeWatch(q);
    },
    'time:hour': (q) => {
      maybeWatch(q);
      if (q.stage === 'curse') {
        const since = typeof q.vars.curseAt === 'number' ? q.vars.curseAt : 0;
        if ((q.game.time?.totalHours ?? 0) - since >= CURSE_HOURS) {
          q.completeObjective('wait');
          q.setStage('done-curse');
        }
      }
    },
    'actor:yielded': (q, e) => {
      if (q.stage === 'fight' && e.actorId.split('~')[0] === SABINUS) q.setStage('done-confront');
    },
    'actor:killed': (q, e) => {
      if (e.victimId.split('~')[0] !== SABINUS) return;
      if (q.stage === 'fight' && !e.tags?.includes('dead')) q.setStage('done-confront');
      else if (q.stage === 'choose' || q.stage === 'fight' || q.stage === 'curse') q.setStage('fail-dead');
    },
    'save:loaded': (q) => {
      if (q.stage === 'choose') placePipe(q.game, q);
    },
  },
});

