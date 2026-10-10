/**
 * job-ludus-lusio "A Practice Bout" (docs/design/world-life.md §4.7): after lud-01, Asiaticus the
 * referee puts the guest on the sand once a day, in drill hours, against one of the Ludus regulars
 * (src/life/jobs/lusio.ts: the same man all day). It runs on lud-01's rules without touching lud-01:
 *
 *   start   Asiaticus names the opponent; "Ready." (his node lusioBegin, src/dialogue/content/ludus.ts) → bout
 *   bout    practice arms (a rudis is lent if the guest has none), the combat module's arena bout:
 *           crowd favor, the chant, missio; nobody dies (§6.10)
 *   done    a win: the purse, 5 × (1 + favor/100) denarii (arenaPurse), paid by the arena at the
 *           horn; a draw (stans missus): 3 denarii from the school
 *   lost    the doctor stops it: the Saniarium, injured for one game hour (runtime.ts heals it), no purse
 *
 * Without a combat module Asiaticus calls the bout on points (a win at the starting favor), as he
 * does in lud-01. Given up after three game hours if the guest never steps onto the sand.
 *
 * The offer and the "Ready." are Asiaticus' own lines (his hub and the lusio node), not the generic
 * life lines of src/life/talk.ts: a lifeChoices spread in his talk would end the 'ready' step
 * without a fight, so his dialogue has none.
 */
import { beat, fight, hint, moveActor, say } from '../../content/director';
import { defineJob } from '../../life/jobs/defineJob';
import { LUSIO_DRAW, LUSIO_PURSE, lusioFoe } from '../../life/jobs/lusio';
import { LUSIO_CURE } from '../../life/jobs/runtime';
import { arenaPurse, startingFavor } from '../../rpg/arena';
import type { QuestContext } from '../types';

export const JOB_ID = 'job-ludus-lusio';
const LUD = 'lud-01-sacramentum';

/** The guest fights with wood: lend a rudis if they have none, and remember their own arms. */
function lendKit(q: QuestContext) {
  const inv = q.game.player?.inventory;
  if (!inv) return;
  const main = inv.equipped('mainHand');
  if (main && main !== 'rudis') q.vars.ownMain = main;
  if (!inv.count('rudis')) {
    inv.add('rudis', 1, { source: 'quest' });
    q.vars.lent = true;
  }
  inv.equip('rudis');
}

/** The lent rudis goes back to the armory and the guest's own sword back to hand. */
function returnKit(q: QuestContext) {
  const inv = q.game.player?.inventory;
  if (!inv) return;
  if (q.vars.lent && inv.count('rudis')) inv.remove('rudis', 1, { reason: 'quest' });
  q.vars.lent = false;
  const own = q.vars.ownMain;
  if (typeof own === 'string' && own && inv.count(own)) inv.equip(own);
  q.vars.ownMain = '';
}

/** The horn: the arena bout (purse base 5) and the day's regular on the sand. */
function startBout(q: QuestContext) {
  const g = q.game;
  const foe = lusioFoe(g.time?.dayIndex ?? 0);
  lendKit(q);
  const combat = g.combat;
  // The bout first, with the practice purse; the fighter then joins it as he spawns.
  if (combat?.startBout && (!combat.core?.bout || combat.core.bout.over)) combat.startBout({ foes: [], lusio: true, purse: LUSIO_PURSE });
  const id = fight(g, foe.id, foe.archetype, 'ludus-arena-center', { practice: true, quest: JOB_ID, tags: [JOB_ID, 'lusio'], name: foe.name, profile: foe.profile }, { z: -6 });
  if (!id) {
    // No combat module in this build: the referee calls it on points.
    q.notify(`Asiaticus watches you spar with ${foe.name} and calls it for you.`);
    q.vars.favor = startingFavor(g.factions?.reputation('plebs') ?? 0);
    q.setStage('done');
    return;
  }
  q.vars.bout = 1;
  q.vars.arena = true;
  beat(g, JOB_ID, 'bout-start', { actors: [foe.id], at: 'ludus-arena-center' });
  say(g, 'Asiaticus', `${foe.name}! Practice arms! Begin!`);
  hint(g, 'A practice bout: nobody dies. Win the crowd and the purse grows.');
}

export default defineJob(
  {
    id: JOB_ID,
    title: 'A Practice Bout',
    latin: 'Lusio',
    summary: 'Fight one practice bout a day on the sand of the Ludus Magnus, with wooden arms, for a purse the crowd decides.',
    giver: 'npc-asiaticus',
    // After lud-01, in drill hours (the gladiators drill h1–h6 and h8–h10; Asiaticus from h2).
    offer: { questCompleted: LUD, hours: [{ from: 'h2', to: 'h6' }, { from: 'h8', to: 'h10' }] },
    daily: 1,
    limitHours: 3,
    pay: 0,
    steps: [
      {
        id: 'ready',
        text: 'Tell Asiaticus you are ready',
        target: { kind: 'npc', id: 'npc-asiaticus' },
        done: { talk: 'npc-asiaticus' },
        journal: 'Asiaticus, the referee of the Ludus Magnus, put me down for a practice bout against one of the school’s regulars: wooden swords, a real crowd and real bruises.',
      },
    ],
    period: 'Practice bouts with wooden arms (arma lusoria) in the gladiatorial schools [A]; the guest’s purse follows lud-01 [G]',
  },
  {
    stages: {
      bout: {
        journal: 'The horn went, the benches leaned in, and my opponent came across the sand with his wooden sword up.',
        objectives: [{ id: 'bout', text: 'Win the practice bout', target: { kind: 'location', id: 'ludus-cavea' } }],
        onEnter: startBout,
      },
      lost: {
        journal: 'Asiaticus stopped the bout. I woke in the Saniarium with Hermippus clucking over me, and there was no purse for a guest who lost.',
        onEnter: (q) => {
          returnKit(q);
          moveActor(q.game, 'player', 'ludus-saniarium');
          q.game.player?.sheet?.applyCondition('injured');
          q.game.life?.store.set(LUSIO_CURE, (q.game.time?.totalHours ?? 0) + 1);
        },
        end: 'fail',
      },
    },
    on: {
      'dialogue:node': (q, e) => {
        if (e.dialogueId === 'npc-asiaticus' && e.nodeId === 'lusioBegin' && q.stage === 'start') {
          q.completeObjective('start');
          q.setStage('bout');
        }
      },
      'combat:bout': (q, e) => {
        if (q.stage !== 'bout' || e.phase !== 'end' || !q.vars.bout) return;
        q.vars.bout = 0;
        if (e.winner === 'foe') {
          q.setStage('lost');
          return;
        }
        q.vars.favor = e.favor;
        q.vars.draw = e.winner === 'draw';
        q.completeObjective('bout');
        q.setStage('done');
      },
    },
    // The arena pays a win's purse at the horn; the school pays a draw, or a bout called on points.
    pay: (q) => (q.vars.draw ? LUSIO_DRAW : q.vars.arena ? 0 : Math.round(arenaPurse(LUSIO_PURSE, Number(q.vars.favor) || 0))),
    end: returnKit,
    done: 'Asiaticus raised his staff to the benches and called the bout. The purse was counted into my hand in front of everyone.',
    failed: 'I never stepped onto the sand, and Asiaticus gave my bout to someone who did.',
  },
);
