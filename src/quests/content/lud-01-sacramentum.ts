/**
 * lud-01-sacramentum "The Oath" (docs/CONTENT.md §3.2.1; GDD §9.2, §6.10, §13.2 boss-nereus, §17.2
 * step 4). Ludus Magnus line, v0.1 Must.
 *
 *   start   sign on with Glaucus: a paid guest (default) or the gladiator's oath (Infamia +20)   → kit
 *   kit     draw a rudis and a shield (scutum, parmula, or your own) from Successus               → bout1
 *   bout1   Pullus, a nervous tiro (parry, riposte, dodge, lock-on)                               → bout2
 *   bout2   Auctus, a thraex who hooks round the shield; afterwards he names the Mouse            → bout3
 *   bout3   Nereus the retiarius (boss-nereus, a lusio): the net, the crowd, the yield            → missio
 *   missio  Nereus kneels, ad digitum: spare him (Mitte!) or strike the yielded man              → done
 *   done    Glaucus pays the purse; Hermippus patches you up and tells you to rest until dusk
 *
 * A lusio uses practice arms (§6.10): 0 HP is a knockout, never a death, and a loss means the
 * Saniarium with `injured` for one game hour (a lusio rule, [design] in the bible), then the bout
 * can be tried again. The bouts begin when Asiaticus the referee is told "Ready". A bout is won when
 * the foe yields or drops ('actor:yielded' / 'actor:killed' with practice arms = a knockout). If the
 * player yields to Nereus the missio roll decides (favor ≥ 50: spared; 30–49: even; below: one in ten;
 * Tiro always): spared means half the purse and the quest ends; refused means the doctor stops the bout
 * and the bout waits an hour. Practice arms are stored by the armory whenever the player leaves the
 * Ludus and restored on re-entry. The kit items come from src/rpg/data/items/content.ts.
 *
 * Without a combat module the referee calls each bout on points, so the quest can be played through.
 */
import { beat, hint, moveActor, fight, say } from '../../content/director';
import { AUCTUS_PROFILE, NEREUS_PROFILE, PULLUS_PROFILE } from '../../content/profiles';
import { addFoe, beatFoe, giveItem, hasItem, isPlayer, takeItem } from '../../content/questkit';
import { arenaPurse, missioChance, startingFavor } from '../../rpg/arena';
import type { CombatProfile } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'lud-01-sacramentum';

interface Bout {
  stage: string;
  objective: string;
  npc: string;
  archetype: string;
  name: string;
  profile: CombatProfile;
  boss?: string;
}

const BOUTS: Bout[] = [
  { stage: 'bout1', objective: 'win1', npc: 'npc-pullus', archetype: 'murmillo', name: 'Pullus', profile: PULLUS_PROFILE },
  { stage: 'bout2', objective: 'win2', npc: 'npc-auctus', archetype: 'thraex', name: 'Auctus', profile: AUCTUS_PROFILE },
  { stage: 'bout3', objective: 'nereus', npc: 'npc-nereus', archetype: 'retiarius', name: 'Nereus', profile: NEREUS_PROFILE, boss: 'boss-nereus' },
];
const BOUT_STAGES = ['kit', 'bout1', 'bout2', 'bout3', 'missio'];
const ISSUED = ['rudis', 'scutum-ludi', 'parmula-ludi'];

function boutOf(q: QuestContext): Bout | undefined {
  return BOUTS.find((b) => b.stage === q.stage);
}

const hoursNow = (q: QuestContext) => q.game.time?.totalHours ?? 0;

// ------------------------------------------------------------------ the armory

function issueKit(q: QuestContext, shield: 'scutum-ludi' | 'parmula-ludi' | 'own') {
  if (!hasItem(q, 'rudis')) giveItem(q, 'rudis');
  if (shield !== 'own' && !hasItem(q, 'scutum-ludi') && !hasItem(q, 'parmula-ludi')) giveItem(q, shield);
  q.vars.kit = shield;
  q.completeObjective('draw');
}

/** The armory keeps its arms: stored when the player leaves the Ludus, back on re-entry (§3.2.1). */
function stashKit(q: QuestContext) {
  const held = ISSUED.filter((id) => hasItem(q, id));
  if (!held.length) return;
  for (const id of held) takeItem(q, id);
  q.vars.stash = held.join(',');
  rearmOwn(q);
  q.notify('At the gate the armory slave takes back the practice arms, and you take up your own again. Successus will have his ready when you return.');
}

/**
 * Back to the player's own arms once the practice ones are gone: what they held before the first
 * bout (remembered by `equipKit`), else the first weapon they carry. Hands are never left empty.
 */
function rearmOwn(q: QuestContext) {
  const inv = q.game.player?.inventory;
  if (!inv) return;
  const own = (v: unknown) => (typeof v === 'string' && v && !ISSUED.includes(v) && inv.count(v) ? v : null);
  const main = own(q.vars.ownMain) ?? inv.list((d) => !!d.weapon && !ISSUED.includes(d.id))[0]?.def.id ?? null;
  if (main && !inv.equipped('mainHand')) inv.equip(main);
  const off = own(q.vars.ownOff);
  if (off && !inv.equipped('offHand')) inv.equip(off);
  q.vars.ownMain = '';
  q.vars.ownOff = '';
}

function unstashKit(q: QuestContext) {
  const stash = typeof q.vars.stash === 'string' ? q.vars.stash : '';
  if (!stash) return;
  for (const id of stash.split(',')) giveItem(q, id);
  q.vars.stash = '';
  q.notify('Successus hands you back your practice arms.');
}

// ------------------------------------------------------------------ the bouts

function equipKit(q: QuestContext) {
  const inv = q.game.player?.inventory;
  // Remember the player's own arms (once), to give them back when the practice ones go.
  const main = inv?.equipped('mainHand');
  const off = inv?.equipped('offHand');
  if (main && !ISSUED.includes(main) && !q.vars.ownMain) q.vars.ownMain = main;
  if (off && !ISSUED.includes(off) && !q.vars.ownOff) q.vars.ownOff = off;
  if (inv?.count('rudis')) inv.equip('rudis');
  const shield = typeof q.vars.kit === 'string' ? q.vars.kit : '';
  if (shield && shield !== 'own' && inv?.count(shield)) inv.equip(shield);
}

function startBout(q: QuestContext, n: number) {
  const b = BOUTS[n - 1];
  if (!b || q.stage !== b.stage || q.vars.bout) return;
  equipKit(q);
  q.vars.bout = n;
  const actor = fight(q.game, b.npc, b.archetype, 'ludus-arena-center', { practice: true, quest: QUEST_ID, tags: [QUEST_ID, 'lusio', `lud01-${b.name.toLowerCase()}`], name: b.name, boss: b.boss, profile: b.profile }, { z: -6 });
  if (!actor) {
    // No combat module in this build: the referee calls the bout on points.
    q.notify(`Asiaticus watches you spar with ${b.name} and calls it for you.`);
    winBout(q, b, false);
    return;
  }
  addFoe(q, b.stage, actor);
  beat(q.game, QUEST_ID, 'bout-start', { actors: [b.npc], at: 'ludus-arena-center' });
  say(q.game, 'Asiaticus', n === 3 ? 'Nereus! Retiarius! Victor of thirty-one! Begin!' : `${b.name}! Practice arms! Begin!`);
  if (n === 1) hint(q.game, 'Press X to lock on. Q just before his blow lands parries; strike at once to riposte. Space (or Option) with a direction dodges.');
  if (n === 3) hint(q.game, 'Watch the net: when Nereus twirls it, step aside. If it catches you, keep your shield up and press E or F to struggle free.');
}

function winBout(q: QuestContext, b: Bout, ko: boolean) {
  q.vars.bout = 0;
  if (b.stage === 'bout3') {
    q.vars.nereusKO = ko;
    q.completeObjective(b.objective);
    return;
  }
  // The practice-bout fee (§7.2): 3 denarii a bout for a guest.
  q.giveReward({ denarii: 3 });
  q.completeObjective(b.objective);
}

/** The player is down or yields: the bout stops (the Saniarium, `injured` for an hour), or the missio roll. */
function loseBout(q: QuestContext) {
  const n = Number(q.vars.bout) || 0;
  if (!n) return;
  q.vars.bout = 0;
  const b = BOUTS[n - 1];
  beat(q.game, QUEST_ID, 'bout-stopped', { actors: [b.npc], at: 'ludus-arena-center' });
  const inSaniarium = () => {
    moveActor(q.game, 'player', 'ludus-saniarium');
    q.game.player?.sheet?.applyCondition('injured');
    q.vars.cureAt = hoursNow(q) + 1;
  };
  if (n !== 3) {
    inSaniarium();
    q.notify('Asiaticus stops the bout. You wake in the Saniarium, injured. “Again, when you can stand.”');
    return;
  }
  // Nereus: the crowd decides (§6.10).
  const favor = typeof q.flag('arena.favor') === 'number' ? (q.flag('arena.favor') as number) : startingFavor(q.game.factions?.reputation('plebs') ?? 0);
  q.setFlag('lud01-favor', Math.round(favor));
  const tiro = q.game.settings?.data?.difficulty === 'tiro';
  const spared = (q.game.rng?.fork?.('missio')?.next() ?? 0.5) < missioChance(favor, { tiro });
  inSaniarium();
  if (spared) {
    q.vars.halfPurse = true;
    q.notify('You raise a finger first, and the benches let you live. You wake in the Saniarium, injured.');
    q.setStage('done');
  } else {
    q.vars.losses = (Number(q.vars.losses) || 0) + 1;
    q.vars.retryAfter = hoursNow(q) + 1;
    q.notify('“The doctor stops the bout.” You wake in the Saniarium, injured. Asiaticus will not start another for an hour.');
  }
}

/** Guest purse 30 den. × (1 + favor/100) (§3.2.1), half if the crowd spared the yielding player. */
export function lusioPurse(q: QuestContext): number {
  const stored = q.flag('lud01-favor');
  const favor = typeof q.flag('arena.favor') === 'number' ? (q.flag('arena.favor') as number) : typeof stored === 'number' ? stored : startingFavor(q.game.factions?.reputation('plebs') ?? 0);
  const full = arenaPurse(30, favor);
  return Math.max(5, Math.round(q.vars.halfPurse ? full / 2 : full));
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Oath',
  latin: 'Sacramentum',
  category: 'faction',
  faction: 'ludus-magnus',
  giver: 'npc-glaucus',
  summary: 'Sign on at the Ludus Magnus and fight three practice bouts, the last against Nereus the retiarius.',
  stages: {
    start: {
      journal: 'The Ludus Magnus trains Caesar’s gladiators beside the amphitheatre. Its doctor, a scarred Thracian called Glaucus, said any free person may fight on its sand: as a paid guest, or for good under the gladiator’s oath.',
      objectives: [{ id: 'sign', text: 'Sign on with Glaucus', target: { kind: 'npc', id: 'npc-glaucus' } }],
      next: 'kit',
    },
    kit: {
      journal: 'Successus, who keeps the armory, made me sign for a wooden sword and a shield as if they were his own children.',
      objectives: [{ id: 'draw', text: 'Draw a practice sword and a shield from the armory', target: { kind: 'npc', id: 'npc-successus' } }],
      onEnter: (q) => {
        if (q.flag('ludus-status') === 'auctoratus') q.notify('You are a tiro of the Ludus now.');
      },
      next: 'bout1',
    },
    bout1: {
      journal: 'My first opponent was Pullus, a boy from Capua who had sold himself to the sand. Asiaticus, the referee, shouted the lessons at both of us.',
      objectives: [{ id: 'win1', text: 'Defeat Pullus in a practice bout (tell Asiaticus you are ready)', target: { kind: 'npc', id: 'npc-asiaticus' } }],
      next: 'bout2',
    },
    bout2: {
      journal: 'Then Auctus, a thraex with eighteen wins, who fights low and hooks round your shield.',
      objectives: [{ id: 'win2', text: 'Defeat Auctus in a practice bout', target: { kind: 'npc', id: 'npc-asiaticus' } }],
      next: 'bout3',
    },
    bout3: {
      journal: 'Glaucus saved Nereus for last: a retiarius, victor of thirty-one, with a net that seemed to have no edges. The benches had filled.',
      objectives: [{ id: 'nereus', text: 'Face Nereus the retiarius', target: { kind: 'npc', id: 'npc-asiaticus' } }],
      next: 'missio',
    },
    missio: {
      journal: 'Nereus went down on one knee and raised a finger, ad digitum, the way gladiators ask for mercy. On the benches they were shouting. In a lusio nobody dies, and the decision was mine.',
      objectives: [{ id: 'missio', text: 'Decide Nereus’ missio', target: { kind: 'npc', id: 'npc-nereus' } }],
      onEnter: (q) => {
        // A knocked-out Nereus can't ask for missio: there is nothing to decide.
        if (q.vars.nereusKO) q.completeObjective('missio');
      },
      next: 'done',
    },
    done: {
      journal: 'Nereus raised one finger to the benches, and then he laughed and raised mine. Glaucus paid me in front of everyone. “Come back,” he said, “when you can do that twice.” The doctor, Hermippus, looked me over and told me to rest until the lamps were lit.',
      onEnter: (q) => {
        stashKit(q);
        q.giveReward({ denarii: lusioPurse(q) });
        q.setFlag('lud01-done', true);
        if (typeof q.flag('lud01-favor') !== 'number') q.setFlag('lud01-favor', Math.round(typeof q.flag('arena.favor') === 'number' ? (q.flag('arena.favor') as number) : startingFavor(q.game.factions?.reputation('plebs') ?? 0)));
        hint(q.game, 'Hermippus patches you up in the Saniarium. Then press T to wait until the lamps are lit.');
      },
      end: 'complete',
    },
  },
  triggers: {
    'location:entered': (q, e) => {
      const h = q.game.time?.hour ?? 12;
      if (e.locationId === 'ludus-magnus' && h >= 4.9 && h < 16.8) q.start();
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-glaucus' && e.nodeId === 'n0') q.start();
    },
  },
  on: {
    'location:entered': (q, e) => {
      if (e.locationId === 'ludus-magnus') unstashKit(q);
    },
    'location:exited': (q, e) => {
      if (e.locationId === 'ludus-magnus' && BOUT_STAGES.includes(q.stage)) {
        q.vars.bout = 0;
        stashKit(q);
      }
    },
    'time:hour': (q) => {
      // A lusio injury lasts one game hour (§3.2.1), not a day.
      if (typeof q.vars.cureAt === 'number' && hoursNow(q) >= q.vars.cureAt) {
        q.game.player?.sheet?.cure('injury:injured');
        q.vars.cureAt = 0;
      }
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-glaucus' && (e.nodeId === 'signedGuest' || e.nodeId === 'signedOath')) {
        q.vars.oath = e.nodeId === 'signedOath';
        q.completeObjective('sign');
      }
      if (e.dialogueId === 'npc-successus') {
        if (e.nodeId === 'issueScutum') issueKit(q, 'scutum-ludi');
        if (e.nodeId === 'issueParmula') issueKit(q, 'parmula-ludi');
        if (e.nodeId === 'issueOwn') issueKit(q, 'own');
      }
      if (e.dialogueId === 'npc-asiaticus') {
        if (e.nodeId === 'begin1') startBout(q, 1);
        if (e.nodeId === 'begin2') startBout(q, 2);
        if (e.nodeId === 'begin3') startBout(q, 3);
      }
      if (e.dialogueId === 'npc-nereus' && q.stage === 'missio') {
        if (e.nodeId === 'spared') {
          q.vars.spared = true;
          q.completeObjective('missio');
        }
        if (e.nodeId === 'struck') {
          q.vars.spared = false;
          q.completeObjective('missio');
        }
      }
    },
    // The arena's own yield prompt (when combat runs one) reports the same decision.
    'content:missio': (q, e) => {
      if (q.stage === 'missio') {
        q.vars.spared = e.spared;
        q.completeObjective('missio');
      }
    },
    'actor:yielded': (q, e) => {
      const b = boutOf(q);
      if (isPlayer(e.actorId)) return loseBout(q);
      if (b && beatFoe(q, b.stage, e.actorId, [b.npc])) winBout(q, b, false);
    },
    'actor:killed': (q, e) => {
      const b = boutOf(q);
      if (isPlayer(e.victimId)) return loseBout(q);
      // Practice arms knock out (§6.10): a "kill" in a lusio is a knockout.
      if (b && beatFoe(q, b.stage, e.victimId, [b.npc])) winBout(q, b, true);
    },
  },
  rewards: {
    reputation: [{ faction: 'ludus-magnus', amount: 10 }, { faction: 'plebs', amount: 3 }],
    skillXp: ['blades'],
  },
});
