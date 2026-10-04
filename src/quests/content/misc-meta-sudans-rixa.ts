/**
 * misc-meta-sudans-rixa "Brawl at the Fountain" (docs/CONTENT.md §3.3.1; GDD §11.1, §6.9; v0.1 Must,
 * AC-09). Misc quest, combat, non-lethal.
 *
 * By the Meta Sudans the murmillo fans (the scutarii, led by the butcher Bassulus) and the thraex
 * fans (the parmularii, led by the tanner Anicetus) shout about the day's bouts (Suet. Dom. 10,
 * Marcus Aurelius Med. 1.5 [A]). It starts on the way back from the Ludus, between the eleventh hour
 * and the second watch, once lud-01 is done.
 *
 *   start   take a side, calm them (Rhetoric), or walk away                  → rixa | done-peace | done-walked
 *   rixa    knock out or make yield the other side's three brawlers (fists)  → after | after (beaten)
 *   after   the watch arrives: Verecundus before sunset, Primigenius after   → done
 *
 * A rixa is non-lethal by rule: fists and the caestus always knock out. Drawing a blade turns it into
 * assault (crime 'vis', bounty 40) and fails the quest; so does killing anyone. If the player yields
 * (Y) they lose a tenth of the purse and the fight ends. The first punch is the player's if they took
 * a side (they egged it on); it is the other side's if the Rhetoric check failed and a cup flew.
 * Without a combat module the brawl is over in a few punches.
 */
import { beat, fight, hint, say, spawnEnemy } from '../../content/director';
import { addFoe, beatFoe, isPlayer } from '../../content/questkit';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-meta-sudans-rixa';

type Side = 'scutarii' | 'parmularii';
const OTHER: Record<Side, Side> = { scutarii: 'parmularii', parmularii: 'scutarii' };
/** The rival leader (a collegium bruiser with the caestus) and the two drunk toughs of each side. */
const LEADER: Record<Side, string> = { scutarii: 'npc-bassulus', parmularii: 'npc-anicetus' };
const TOUGHS: Record<Side, [string, string]> = { scutarii: ['rixa-scut-a', 'rixa-scut-b'], parmularii: ['rixa-parm-a', 'rixa-parm-b'] };
/** Where the fight happens: the street before the fountain (its centre is masonry), where the fans stand. */
const ARENA = 'meta-sudans:front';

function sideOf(q: QuestContext): Side {
  return q.flag('rixa-side') === 'parmularii' ? 'parmularii' : 'scutarii';
}

function foeIds(q: QuestContext): string[] {
  const o = OTHER[sideOf(q)];
  return [LEADER[o], ...TOUGHS[o]];
}

function startBrawl(q: QuestContext, firstPunchIsPlayers: boolean) {
  if (q.stage !== 'start') return;
  q.setFlag('threw-first-punch', firstPunchIsPlayers);
  q.completeObjective('choose');
  q.setStage('rixa');
}

function lawOnTheWay(q: QuestContext) {
  q.setStage('after');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Brawl at the Fountain',
  latin: 'Rixa ad Metam',
  category: 'misc',
  giver: 'npc-bassulus',
  summary: 'The fans of the murmillones and the thraeces are about to come to blows at the Meta Sudans.',
  stages: {
    start: {
      journal: 'At the Sweating Post the murmillo’s fans and the thraex’s fans were shouting about shields. Big ones or small ones. Then someone mentioned my bout.',
      objectives: [{ id: 'choose', text: 'Talk to the fans', target: { kind: 'npc', id: 'npc-bassulus' } }],
    },
    rixa: {
      journal: 'Fists, not blades: a brawl is a brawl. Draw iron and it becomes assault.',
      objectives: [{ id: 'ko', text: 'Knock out or make yield the other side’s brawlers', count: 3, target: { kind: 'location', id: 'meta-sudans' } }],
      onEnter: (q) => {
        const side = sideOf(q);
        const other = OTHER[side];
        say(q.game, other === 'scutarii' ? 'Bassulus' : 'Anicetus', other === 'scutarii' ? 'Big shields, big men! Come on, then!' : 'Small shields, quick feet! Come on, then!');
        beat(q.game, QUEST_ID, 'brawl-start', { actors: [LEADER[side], LEADER[other]], at: 'meta-sudans' });
        let spawned = 0;
        // The rival leader (already standing at the fountain by his schedule) fights with the caestus:
        // the NPC is engaged where he is, or spawned with his look if he is not in the world.
        const leader = fight(q.game, LEADER[other], 'collegium-bruiser', ARENA, { brawl: true, tags: [QUEST_ID, `rixa-${other}`], quest: QUEST_ID }, { x: 0, z: 3 });
        addFoe(q, 'foes', leader);
        if (leader) spawned++;
        // His two toughs are drunks with fists (non-lethal).
        TOUGHS[other].forEach((id, i) => {
          const f = spawnEnemy(q.game, 'ebrius-rixator', ARENA, { id, name: 'Drunken fan', brawl: true, tags: [QUEST_ID, `rixa-${other}`], quest: QUEST_ID }, { x: i ? 2.5 : -2.5, z: 3 });
          addFoe(q, 'foes', f);
          if (f) spawned++;
        });
        // Two allies on the player's side, if they took one.
        if (q.flag('rixa-outcome') !== 'walked') {
          TOUGHS[side].forEach((id, i) => spawnEnemy(q.game, 'ebrius-rixator', ARENA, { id, name: 'Your fan', brawl: true, hostile: false, tags: [QUEST_ID, 'rixa-ally'], quest: QUEST_ID }, { x: i ? 2 : -2, z: -2 }));
        }
        if (spawned) hint(q.game, 'Sheathe your blade (R) and use your fists: fists always knock out. Drawing a blade turns this into assault. Hold Y for a second to yield.');
        else {
          // No combat module in this build: the crowd breaks it up after a few punches.
          q.notify('A few punches, a lot of shouting, and the other side’s big man sits down hard in the fountain basin.');
          q.progress('ko', 3);
        }
      },
      next: 'after',
    },
    after: {
      journal: 'The watch arrived when it was over, as the watch always does.',
      objectives: [{ id: 'law', text: 'Deal with the patrol', target: { kind: 'npc', id: 'npc-verecundus' } }],
      onEnter: (q) => {
        q.setFlag('rixa-outcome', q.vars.beaten ? 'beaten' : 'won');
      },
      next: 'done',
    },
    done: {
      journal: 'The winners bought me Falernian and told me I was a true scutarius (or a true parmularius). I have never had a cheaper friendship or a better one.',
      onEnter: (q) => {
        const beaten = q.flag('rixa-outcome') === 'beaten';
        q.setFlag('rixa-outcome', beaten ? 'beaten' : 'won');
        if (!beaten) {
          q.giveReward({ items: [{ id: 'vinum-falernum' }], denarii: 5, skills: [{ id: 'brawling', amount: 12 }] });
          q.game.standing?.addFame('dist-vallis-colossei', 5);
        }
      },
      end: 'complete',
    },
    'done-peace': {
      journal: 'Nobody hit anybody, and both sides went home disappointed. Rome has few greater achievements.',
      onEnter: (q) => {
        q.giveReward({ skills: [{ id: 'rhetoric', amount: 15 }] });
        q.game.factions?.addReputation('plebs', 3);
      },
      end: 'complete',
    },
    'done-walked': {
      journal: 'I left them to it. By the time I reached the Colossus the shouting had become something louder. I did not turn round.',
      end: 'complete',
    },
    fail: {
      journal: 'Blood at a brawl. The fans scattered and the watch came looking for me.',
      end: 'fail',
    },
  },
  triggers: {
    'location:entered': (q, e) => {
      const h = q.game.time?.hour ?? 12;
      if (e.locationId === 'meta-sudans' && q.game.quests?.status('lud-01-sacramentum')?.completed && h >= 16.7 && h < 21.6) q.start();
    },
  },
  on: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-rixa' && q.stage === 'start') {
        if (e.nodeId === 'sideScutarii' || e.nodeId === 'sideParmularii') startBrawl(q, true);
        if (e.nodeId === 'cupThrown') startBrawl(q, false);
        if (e.nodeId === 'peace') {
          q.completeObjective('choose');
          q.setStage('done-peace');
        }
        if (e.nodeId === 'walked') {
          q.completeObjective('choose');
          q.setStage('done-walked');
        }
      }
      if (e.dialogueId === 'npc-rixa-law' && q.stage === 'after') {
        if (e.nodeId === 'lawFine') {
          q.game.crime?.commit('rixa', { witnessed: true, identified: true });
          q.completeObjective('law');
        }
        if (e.nodeId === 'lawClear') q.completeObjective('law');
      }
    },
    // Leaving the valley with the watch unspoken to: they never saw the player. No fine.
    'location:exited': (q, e) => {
      if (q.stage === 'after' && e.locationId === 'meta-sudans') {
        q.notify('You slip away before the patrol gets round the fountain.');
        q.completeObjective('law');
      }
    },
    'actor:killed': (q, e) => {
      if (q.stage !== 'rixa') return;
      if (isPlayer(e.victimId)) {
        q.vars.beaten = true;
        return lawOnTheWay(q);
      }
      // Fists always knock out (§6.9); a death here means steel was drawn.
      if (beatFoe(q, 'foes', e.victimId, foeIds(q))) {
        if (e.tags?.includes('dead')) return q.setStage('fail');
        q.progress('ko');
      }
    },
    'actor:yielded': (q, e) => {
      if (q.stage !== 'rixa') return;
      if (isPlayer(e.actorId)) {
        // Lose a tenth of the purse (§3.3.1) and the fight ends.
        const inv = q.game.player?.inventory;
        if (inv) inv.spendDenarii(Math.round(inv.denarii * 0.1 * 16) / 16);
        q.vars.beaten = true;
        return lawOnTheWay(q);
      }
      if (beatFoe(q, 'foes', e.actorId, foeIds(q))) q.progress('ko');
    },
    'crime:committed': (q, e) => {
      if (q.stage === 'rixa' && (e.crime === 'vis' || e.crime === 'homicidium' || e.crime === 'caedes-supplicis')) q.setStage('fail');
    },
  },
});
