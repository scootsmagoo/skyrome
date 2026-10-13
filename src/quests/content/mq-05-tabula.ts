/**
 * mq-05-tabula "The Board" (docs/STORY.md chapter 5). Main quest, 13 May AD 113: Pudens hires the
 * player at the Castra Peregrina on the Caelian, and shows them the conspiracy board. End of Act I.
 *
 *   summons   go to the Castra Peregrina                                  → followed (near the camp)
 *   followed  the water-carrier's warning; the man in the dark cloak attacks → search (he dies)
 *   search    search his body: the couriers' own tablet                     → gate
 *   gate      show the guard Gratus's token (Mardonius walks you in)        → pudens
 *   pudens    speak to Pudens; accept his offer (acceptEnd). Optional: Gratus in the infirmary,
 *             Bitus in the cell (if he was spared)                         → board
 *   board     look at the board on Pudens's table (the journal's Board page) → done
 *   done      the banner "End of Act I"; end 'complete'
 *
 * Starts when mq-04 completes (12 May). Pudens said "tomorrow": the camp sees visitors from first
 * light on 13 May until dark (`camp open`, kept in the flag mq05-camp-open for the gate and Pudens).
 * The calendar steps onto 13 May at the first midnight (or at once when mq-04 ended after midnight).
 *
 * The ambush happens on any approach: within 45 m of the Arch of Dolabella or 70 m of the camp's
 * centre (its walls stand 36–45 m out), whichever comes first. Staging (Pudens in his office, Gratus
 * in the infirmary, a spared Bitus in the cell, Mardonius by the gate) is applied on each stage
 * entry, on 'location:entered', on the 0.5 s poll until the camp's spots exist, and on 'save:loaded'.
 */
import * as THREE from 'three';
import type { IdleLoop } from '../../actors/Actor';
import type { Game } from '../../core/Game';
import { BOARD_FLAG } from '../../game/board/board';
import { actorExists, hint, hourOf, say, spawnEnemyAt, stage, streetPoint, unstage } from '../../content/director';
import { SICARIUS_PROFILE } from '../../content/profiles';
import { Sequence, stageTicker } from '../../content/sequence';
import { CAMP_OPEN_FLAG, WATER_CARRIER_WARNING } from '../../dialogue/content/tabula';
import { defineQuest, type QuestContext, type QuestStageDef } from '../types';

export const QUEST_ID = 'mq-05-tabula';

const SICARIUS = 'npc-sicarius-caelius';
const TABLET = 'quest-tabula-sicarii';
const BOARD_EXAMINE = 'mq05-board';
const PUDENS_SUMUP = 'Four groups, three men in each. Unmask enough of them to break three groups, and we’ll know enough to stop October. Start wherever you like.';

/** The camp's places (content/places.ts; the builder's spots replace the fallbacks). */
const GATE = 'peregrina-gate-front';
const PRINCIPIA_GATE = 'peregrina-principia-gate';
const OFFICE = 'peregrina-commander';
const INFIRMARY = 'peregrina-valetudinarium';
const CELL = 'peregrina-carcer';
const ARCH = 'arch-dolabella';
const CAMP = 'castra-peregrina';
/** How near the ambush comes: the arch, or the camp's centre. */
const NEAR_ARCH = 45;
const NEAR_CAMP = 70;

const firstLight = (h: number) => h >= 5.5 && h < 19.5;
const base = (id: string) => id.split('~')[0];
const BEFORE_GATE = new Set(['summons', 'followed', 'search', 'gate']);

// Per game (not saved): the poll and the board's interaction.
const polls = new WeakMap<Game, () => void>();
const boardOffs = new WeakMap<Game, () => void>();

// ------------------------------------------------------------------ places and staging

function where(g: Game, id: string): THREE.Vector3 | null {
  const p = g.locations?.get(id)?.position;
  return p ? new THREE.Vector3(p.x, p.y ?? 0, p.z) : null;
}

/** Heading from a point toward a place (a person in a room faces out into the court). */
function facing(g: Game, from: THREE.Vector3, toward: string): number {
  const t = where(g, toward);
  return t ? Math.atan2(t.x - from.x, t.z - from.z) : 0;
}

/** Stage a named NPC at a camp spot, facing the principia's gate. */
function stageAtSpot(g: Game, npc: string, spot: string, loop: IdleLoop | null): boolean {
  const p = where(g, spot);
  return !!p && stage(g, npc, p, facing(g, p, PRINCIPIA_GATE), loop);
}

/** Mardonius waits beside the guard, 1.6 m to the side of the gate. */
function stageMardonius(g: Game): boolean {
  const gate = where(g, GATE);
  const inner = where(g, PRINCIPIA_GATE);
  if (!gate || !inner) return false;
  const d = new THREE.Vector3(inner.x - gate.x, 0, inner.z - gate.z).normalize();
  const p = { x: gate.x - d.z * 1.6, y: gate.y, z: gate.z + d.x * 1.6 };
  return stage(g, 'npc-mardonius', p, Math.atan2(-d.x, -d.z), 'lean');
}

/** Stage this quest's people for the current stage. False until the camp's spots exist. */
function applyStaging(q: QuestContext): boolean {
  const g = q.game;
  if (!where(g, OFFICE)) return false;
  if (q.stage === 'done') return true;
  stageAtSpot(g, 'npc-pudens', OFFICE, 'stand');
  stageAtSpot(g, 'npc-gratus', INFIRMARY, 'stand');
  if (q.flag('bitus-fate') === 'spared') stageAtSpot(g, 'npc-bitus-vinctus', CELL, 'sitGround');
  if (BEFORE_GATE.has(q.stage) && !q.vars.walkedIn) stageMardonius(g);
  return true;
}

function stageNow(q: QuestContext) {
  if (q.vars.staged === q.stage) return;
  if (applyStaging(q)) q.vars.staged = q.stage;
}

// ------------------------------------------------------------------ the day

function stepCalendar(q: QuestContext) {
  if (q.vars.calDone) return;
  q.vars.calDone = true;
  (q.game as unknown as { calendar?: { stepToAnchor?(): boolean } }).calendar?.stepToAnchor?.();
}

/** The calendar already shows 13 May or later (a save from before this chapter existed, or a step taken). */
function pastTheColumn(g: Game): boolean {
  const d = (g as unknown as { calendar?: { date?(): { month: number; day: number } } }).calendar?.date?.();
  return !!d && (d.month > 4 || (d.month === 4 && d.day >= 13));
}

/** The camp sees visitors from first light on 13 May until dark: mirrored into a flag for the dialogue. */
function campOpen(q: QuestContext): boolean {
  return (!!q.vars.calDone || pastTheColumn(q.game)) && firstLight(hourOf(q.game));
}

function syncOpen(q: QuestContext) {
  const open = campOpen(q);
  if (q.flag(CAMP_OPEN_FLAG) !== open) q.setFlag(CAMP_OPEN_FLAG, open);
}

/** At the gate while the camp is shut: say when to come (once per visit). */
function hintShut(q: QuestContext) {
  const why = q.vars.calDone ? 'dark' : 'tomorrow';
  if (campOpen(q) || q.vars.hintedShut === why) return;
  q.vars.hintedShut = why;
  hint(q.game, q.vars.calDone ? 'Pudens sees visitors from first light. Press T to wait until about 06:00.' : 'Pudens said tomorrow: the camp opens to you at first light on 13 May. Press T to wait.');
}

// ------------------------------------------------------------------ the follower

function playerAt(g: Game): THREE.Vector3 | null {
  const p = g.player?.position;
  return p ? new THREE.Vector3(p.x, p.y, p.z) : null;
}

/** Near enough to the camp for the man in the dark cloak to make his move. */
function nearCamp(g: Game): boolean {
  const p = playerAt(g);
  if (!p || g.interiors?.current?.()) return false;
  const arch = where(g, ARCH);
  const camp = where(g, CAMP);
  return (!!arch && Math.hypot(p.x - arch.x, p.z - arch.z) < NEAR_ARCH) || (!!camp && Math.hypot(p.x - camp.x, p.z - camp.z) < NEAR_CAMP);
}

/** Unit vector from the player toward the camp (the way they are walking). */
function ahead(g: Game, p: THREE.Vector3): THREE.Vector3 {
  const t = where(g, ARCH) ?? where(g, CAMP);
  const d = t ? new THREE.Vector3(t.x - p.x, 0, t.z - p.z) : new THREE.Vector3(0, 0, -1);
  return d.lengthSq() > 1e-6 ? d.normalize() : new THREE.Vector3(0, 0, -1);
}

/** The water-carrier stops the player a few steps ahead and says his piece. */
function warn(q: QuestContext) {
  const g = q.game;
  const p = playerAt(g);
  if (!p || q.vars.warned) return;
  q.vars.warned = true;
  const d = ahead(g, p);
  const at = streetPoint(g, { x: p.x + d.x * 3.5, y: p.y, z: p.z + d.z * 3.5 });
  stage(g, 'npc-aquarius-caelius', at, Math.atan2(p.x - at.x, p.z - at.z), 'stand');
  say(g, 'Water-carrier', WATER_CARRIER_WARNING, 6);
}

/** The man in the dark cloak, 12 m behind the player, closing in. */
function spawnSicarius(q: QuestContext) {
  const g = q.game;
  const p = playerAt(g);
  if (!p || q.vars.sicariusSpawned || q.flag('mq05-sicarius-dead')) return;
  const d = ahead(g, p);
  const at = streetPoint(g, { x: p.x - d.x * 12, y: p.y, z: p.z - d.z * 12 });
  if (spawnEnemyAt(g, 'sicarius', at, { id: SICARIUS, npc: SICARIUS, name: 'Man in a dark cloak', profile: SICARIUS_PROFILE, quest: QUEST_ID, tags: [QUEST_ID, 'sicarius'], aggro: 30 })) q.vars.sicariusSpawned = true;
}

function startFollower(q: QuestContext) {
  if (q.stage !== 'summons' || !nearCamp(q.game)) return;
  q.setStage('followed');
}

// ------------------------------------------------------------------ the board

/** The board on Pudens's table: an interaction just behind where he stands. */
function placeBoard(q: QuestContext) {
  const g = q.game;
  if (boardOffs.has(g)) return;
  const office = where(g, OFFICE);
  const inter = g.interactions as unknown as { add?(t: object): unknown } | undefined;
  if (!office || !inter?.add) return;
  const h = facing(g, office, PRINCIPIA_GATE);
  const pos = new THREE.Vector3(office.x - Math.sin(h) * 0.8, office.y + 0.95, office.z - Math.cos(h) * 0.8);
  const off = inter.add({
    id: `content:${BOARD_EXAMINE}`,
    reach: 2.8,
    position: () => pos,
    verb: () => 'Look at',
    label: () => 'The board',
    interact: (gg: Game) => gg.events.emit('content:interact', { id: BOARD_EXAMINE }),
  });
  if (typeof off === 'function') boardOffs.set(g, off as () => void);
}

function removeBoard(g: Game) {
  boardOffs.get(g)?.();
  boardOffs.delete(g);
}

/** Open the journal's Board page, if there is a UI. */
function showBoard(g: Game) {
  const ui = (g as unknown as { ui?: { openMenu?(tab: string): { showBoard?(): void } | undefined } }).ui;
  ui?.openMenu?.('journal')?.showBoard?.();
}

// ------------------------------------------------------------------ the poll

function ensurePoll(q: QuestContext) {
  const g = q.game;
  if (polls.has(g)) return;
  let acc = 0;
  polls.set(
    g,
    stageTicker(g).add({
      update(dt: number) {
        if (g.paused) return;
        acc += dt;
        if (acc < 0.5) return;
        acc -= 0.5;
        tick(q);
      },
    }),
  );
}

function stopPoll(g: Game) {
  polls.get(g)?.();
  polls.delete(g);
}

function tick(q: QuestContext) {
  if (!q.running) return;
  if (q.vars.staged !== q.stage) stageNow(q);
  syncOpen(q);
  startFollower(q);
  if (q.stage === 'followed') spawnSicarius(q);
}

/** Run `fn` after `seconds` of game time, if the quest is still in the stage it was set in. */
function afterIn(q: QuestContext, seconds: number, fn: () => void) {
  const at = q.stage;
  new Sequence(q.game)
    .at(seconds, () => {
      if (q.running && q.stage === at) fn();
    })
    .start();
}

/** Mardonius takes over from the guard: his talk opens once, a moment after the gate's. */
function openMardonius(q: QuestContext) {
  const g = q.game;
  if (q.vars.mardoniusOpened || !actorExists(g, 'npc-mardonius')) return;
  if (g.dialogue?.active) return afterIn(q, 1.5, () => openMardonius(q));
  q.vars.mardoniusOpened = true;
  g.dialogue?.start('npc-mardonius');
}

/** In through the gate (the guard's word, or walking past him): on to Pudens. */
function passGate(q: QuestContext) {
  if (!BEFORE_GATE.has(q.stage) || q.stage === 'summons' || q.stage === 'followed') return;
  q.completeObjective('gate');
  q.setStage('pudens');
}

// ------------------------------------------------------------------ the quest

const summons: QuestStageDef = {
  journal:
    'Pudens had told me to come to the Castra Peregrina, the couriers’ camp on the Caelian, the day after the Column. He had named the place out loud, in a forum full of people. Anyone could have heard him.',
  objectives: [{ id: 'camp', text: 'Go to the Castra Peregrina on the Caelian', target: { kind: 'location', id: GATE } }],
  onEnter: (q) => {
    // mq-04 ended after midnight, or the date is already past 12 May: "tomorrow" is today.
    if (hourOf(q.game) < 4) stepCalendar(q);
    if (pastTheColumn(q.game)) q.vars.calDone = true;
    ensurePoll(q);
    stageNow(q);
    syncOpen(q);
    startFollower(q);
  },
};

const followed: QuestStageDef = {
  journal: 'On the slope below the Arch of Dolabella a water-carrier stopped me. A man in a dark cloak had been walking where I walked since the Colosseum.',
  objectives: [{ id: 'follower', text: 'You are being followed', target: { kind: 'npc', id: SICARIUS } }],
  onEnter: (q) => {
    stageNow(q);
    warn(q);
    spawnSicarius(q);
  },
};

const search: QuestStageDef = {
  journal: 'He came at me under the arch with a poisoned blade, and he fought until he died. Nobody walks up the Caelian with a knife like that for a purse.',
  objectives: [{ id: 'search', text: 'Search the man in the dark cloak', target: { kind: 'npc', id: SICARIUS } }],
  onEnter: (q) => {
    stageNow(q);
    unstage(q.game, 'npc-aquarius-caelius');
    if (q.vars.searched) {
      q.completeObjective('search');
      q.setStage('gate');
    }
  },
};

const gate: QuestStageDef = {
  journal:
    'He carried a little wax tablet: THE NEW ONE. CAELIAN. BEFORE THE CAMP. The wax was red, and the frame was stamped with a horseman and a spear. The couriers’ own tablets.',
  objectives: [{ id: 'gate', text: 'Get into the camp: show the guard Gratus’s token', target: { kind: 'npc', id: 'npc-custos-peregrinus' } }],
  onEnter: (q) => {
    stageNow(q);
    syncOpen(q);
  },
};

const pudens: QuestStageDef = {
  journal: 'A courier called Mardonius walked me across the camp’s yard, friendly and full of questions. Pudens’s office was on the far side of the court, behind the shrine of the standards.',
  objectives: [
    { id: 'pudens', text: 'Speak to Pudens', target: { kind: 'npc', id: 'npc-pudens' } },
    { id: 'accept', text: 'Accept Pudens’s offer', hidden: true, target: { kind: 'npc', id: 'npc-pudens' } },
    { id: 'gratus', text: 'Visit Gratus in the infirmary', optional: true, target: { kind: 'npc', id: 'npc-gratus' } },
    { id: 'bitus', text: 'See Bitus in the cell', optional: true, hidden: true, target: { kind: 'npc', id: 'npc-bitus-vinctus' } },
  ],
  onEnter: (q) => {
    q.vars.walkedIn = true;
    unstage(q.game, 'npc-mardonius');
    q.vars.staged = '';
    stageNow(q);
  },
};

const board: QuestStageDef = {
  journal:
    'Pudens told me what the arrow was: a rehearsal. The real blow is meant for Caesar in October, when he rides out for the East. His camp leaks, so he cannot use his own men. I said I would work for him. Then he unlocked a chest and spread its tablets across the table.',
  objectives: [{ id: 'board', text: 'Look at the board', target: { kind: 'location', id: OFFICE } }],
  onEnter: (q) => {
    q.setFlag(BOARD_FLAG, true);
    stageNow(q);
    placeBoard(q);
  },
  next: 'done',
};

const done: QuestStageDef = {
  journal:
    'Four groups of plotters, three faces in each, all of them hidden: the Purse, the Eastern Gold, the Dacian Blades and the Toga. What I had carried since the gate was pinned under them. “Start wherever you like,” Pudens said. I work for the couriers now, and nobody is to know it.',
  onEnter: (q) => {
    const g = q.game;
    removeBoard(g);
    // The spared archer stays in his cell; everyone else goes back to their own day.
    for (const id of ['npc-pudens', 'npc-gratus', 'npc-mardonius', 'npc-aquarius-caelius']) unstage(g, id);
    stopPoll(g);
    // Act II begins: the player picks a group by asking Pudens (mq-06, The Purse, is the first built).
    g.events.emit('ui:banner', { kind: 'generic', label: 'Act II', title: 'The Board', subtitle: 'Start wherever you like: ask Pudens about a group.', duration: 7 });
  },
  end: 'complete',
};

export default defineQuest({
  id: QUEST_ID,
  title: 'The Board',
  latin: 'Tabula',
  category: 'main',
  giver: 'npc-pudens',
  summary: 'Pudens, chief of the couriers, has summoned me to the Castra Peregrina on the Caelian, the day after the Column.',
  stages: {
    start: summons,
    summons,
    followed,
    search,
    gate,
    pudens,
    board,
    done,
  },
  triggers: {
    'quest:completed': (q, e) => {
      if (e.questId === 'mq-04-columna') q.start('summons');
    },
    // A save from before this chapter existed, with the Column already done: start it now.
    'save:loaded': (q) => {
      if (q.quest('mq-04-columna')?.completed) q.start('summons');
    },
  },
  on: {
    'location:entered': (q, e) => {
      if (e.locationId === GATE) {
        q.completeObjective('camp');
        hintShut(q);
      }
      if ((e.locationId === PRINCIPIA_GATE || e.locationId === OFFICE) && q.stage === 'gate') passGate(q);
      startFollower(q);
      stageNow(q);
    },
    'time:hour': (q, e) => {
      if (e.hour === 0) stepCalendar(q);
      syncOpen(q);
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-custos-peregrinus' && e.nodeId === 'gateEnd') {
        passGate(q);
        afterIn(q, 1.2, () => openMardonius(q));
      }
      if (e.dialogueId === 'npc-pudens' && q.stage === 'pudens') {
        if (e.nodeId === 'offer') {
          q.completeObjective('pudens');
          q.reveal('accept');
        }
        if (e.nodeId === 'bitusCell') q.reveal('bitus');
        if (e.nodeId === 'acceptEnd') {
          q.completeObjective('pudens');
          q.completeObjective('accept');
          q.setStage('board');
        }
      }
      if (e.dialogueId === 'npc-gratus' && e.nodeId === 'g5' && (q.stage === 'pudens' || q.stage === 'board')) q.completeObjective('gratus');
      if (e.dialogueId === 'npc-bitus-vinctus' && e.nodeId === 'v1') {
        q.reveal('bitus');
        q.completeObjective('bitus');
      }
    },
    'content:interact': (q, e) => {
      if (e.id !== BOARD_EXAMINE || q.stage !== 'board') return;
      showBoard(q.game);
      say(q.game, 'Pudens', PUDENS_SUMUP, 8);
      q.completeObjective('board');
    },
    'actor:killed': (q, e) => {
      if (base(e.victimId) !== SICARIUS) return;
      q.setFlag('mq05-sicarius-dead', true);
      if (q.stage === 'followed') {
        q.completeObjective('follower');
        q.setStage('search');
      }
    },
    'item:added': (q, e) => {
      if (e.itemId !== TABLET) return;
      q.vars.searched = true;
      if (q.stage === 'search') {
        q.completeObjective('search');
        q.setStage('gate');
      }
    },
    'save:loaded': (q) => {
      // Staging, the poll, the board and the foe are not saved: put back what this stage needs.
      const g = q.game;
      q.vars.staged = '';
      q.vars.sicariusSpawned = false;
      removeBoard(g);
      ensurePoll(q);
      syncOpen(q);
      // The body is not saved: a dead follower can no longer be searched.
      if (q.stage === 'search') {
        q.completeObjective('search');
        q.setStage('gate');
      }
      if (q.stage === 'followed') spawnSicarius(q);
      if (q.stage === 'board') placeBoard(q);
      stageNow(q);
    },
  },
  rewards: { denarii: 100, skillXp: ['rhetoric'] },
});
