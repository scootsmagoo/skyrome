/**
 * mq-04-columna "One Hundred Feet" (docs/design/mq-04-columna.md §1.2, §2.1, §3.8; docs/STORY.md chapter 4).
 * Main quest, 12 May AD 113: the dedication of Trajan's Column, and the archer on its top.
 *
 *   dawn              be in the Forum of Trajan at first light                         → post
 *   post              Gratus's briefing in the Column court (dialogue postEnd)         → ceremony
 *   ceremony          take the post at the Column's door; the dedication plays; the arrow → climb (onShot)
 *   climb             enter the stair (two knife-men on the landings); the top          → archer
 *   archer            stop Bitus: spare (→ aftermath) or kill (→ aftermath-killed)
 *   aftermath         go down to Gratus; speak to Pudens (summonsEnd)                  → done
 *   aftermath-killed  the same objectives, after a kill
 *   done              the banner; end 'complete'
 *
 * The quest starts from mq-03-lemuria at 'dawn'. `start` is the same stage object as `dawn`, so the
 * registry finds its entry stage. Staging (NpcManager.stage) goes by column-local points
 * (columnFrame.ts): it is applied on each stage entry, on 'location:entered', on the 0.5 s poll
 * until the Column is placed in the world, and again on 'save:loaded'. The dedication
 * (src/content/dedication.ts) plays the ceremony; its onShot moves the quest to climb. Delays use
 * the game-time Sequence, each guarded by the stage it was set in, so pause and load are safe.
 *
 * Hooks: npc-gratus 'postEnd' and 'w0' (auto-opened 1.5 s after the shot), npc-bitus 'bitusEnd',
 * npc-pudens 'summonsEnd', the flag 'mq04-apollodorus-door', the examines 'mq04-seal' and
 * 'mq04-chamber', the interior events, and combat:yieldChoice / actor:yielded / actor:killed for
 * npc-bitus and mq04-dacian-a / mq04-dacian-b. The dialogue itself gives the arrow (Crito) and the
 * courier's ring (Pudens); the quest gives neither, so nothing is given twice.
 */
import type { IdleLoop } from '../../actors/Actor';
import type { Game } from '../../core/Game';
import { createDedication, type Dedication } from '../../content/dedication';
import { actorExists, hint, holdPose, hourOf, placeExamine, placePosition, removeExamine, say, spawnEnemyAt, stage, unstage, walkTo } from '../../content/director';
import { BITUS_PROFILE, DACIAN_KNIFE_PROFILE } from '../../content/profiles';
import { addFoe, beatFoe, giveItem, hasItem } from '../../content/questkit';
import { Sequence, stageTicker } from '../../content/sequence';
import { COLUMN_LOCAL, columnHeading, columnLocalToWorld, columnWorldToLocal } from '../../world/landmarks/columnFrame';
import { defineQuest, type QuestContext, type QuestStageDef } from '../types';

export const QUEST_ID = 'mq-04-columna';

const BITUS = 'npc-bitus';
/** The bone token the archer carries (given by his dialogue when spared, looted when killed). */
const TOKEN = 'quest-tessera-mucaporis';
/** The Dacian arrow Crito pulled from Gratus (given once, by the first talk with Crito or Pudens in aftermath). */
const ARROW = 'quest-sagitta-dacica';
/** The courier's ring (spec §1.2 item 7). Pudens's psummons gives it; done only gives it if the player no longer has it. */
const RING = 'anulus-peregrinorum';
const STAIR_FOES = [
  { id: 'mq04-dacian-a', landing: 'landing-1' },
  { id: 'mq04-dacian-b', landing: 'landing-2' },
] as const;

const SEAL_TEXT = 'The lead seal has been cut through and pressed back together to look whole. Someone has been inside since dawn.';
const CHAMBER_TEXT = 'A square room cut into the pedestal, with a marble shelf and nothing on it. The workmen call it the tomb. Nobody says whose.';
const CRITO_LINE = 'Lay him flat. Press there. No, harder. Good.';
const BITUS_TAKEN = 'Pudens’s men came up the stair and took Bitus down in chains.';

/** Column-local points (x, z in metres; the floor is COLUMN_LOCAL.door.y). */
type Pt = { x: number; z: number };
const GRATUS_POST: Pt = { x: 1.4, z: -4.6 };
const APOLLODORUS_POST: Pt = { x: -3.0, z: -4.4 };
const PUDENS_POST: Pt = { x: 1.0, z: -4.0 };
/** Where Crito starts the climb, before he runs to Gratus. */
const CRITO_START: Pt = { x: 0.9, z: -5.7 }; // where the dedication's Crito stood (src/content/dedication.ts)
/** Where Gratus falls if the actor cannot be read when the climb starts. */
const FALL_DEFAULT: Pt = { x: 0.2, z: -3.6 };

type Fate = 'spared' | 'killed';

// ------------------------------------------------------------------ services (read structurally)

interface Services {
  calendar?: { stepToAnchor?(): boolean };
  population?: {
    holdNamed?(id: string): () => void;
    crowdBoost?: ((x: number, z: number) => number) | null;
  };
  combat?: {
    get?(id: string): { id: string } | undefined;
    despawn?(c: unknown): void;
    core?: { get(id: string): { status?: string } | undefined };
  };
  getSystem?(name: string): { fade?(): unknown } | undefined;
}

function svc(game: Game): Services {
  return game as unknown as Services;
}

const base = (id: string) => id.split('~')[0];
const face = (from: Pt, to: Pt) => Math.atan2(to.x - from.x, to.z - from.z);
const firstLight = (h: number) => h >= 5.5 && h < 18;
const ceremonyHours = (h: number) => h >= 6 && h < 18;
const isAftermath = (s: string) => s === 'aftermath' || s === 'aftermath-killed';

// Per game (not saved): the poll, the dedication, the holds on Trajan and the crowd, the cell examines.
const polls = new WeakMap<Game, () => void>();
const dedications = new WeakMap<Game, Dedication>();
const traianusHold = new WeakMap<Game, () => void>();
const crowdBoosts = new WeakMap<Game, () => void>();
const cellExamines = new WeakMap<Game, Map<string, () => void>>();

// ------------------------------------------------------------------ small helpers

function atForum(g: Game): boolean {
  return !!(g.locations?.isInside?.('forum-trajan') || g.locations?.isInside?.('column-trajan'));
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

/** Put a named NPC at a column-local point, posed in `loop`; false until the Column is placed in the world. */
function stageAt(g: Game, npc: string, p: Pt, heading: number, loop: IdleLoop | null): boolean {
  const w = columnLocalToWorld(g, { x: p.x, y: COLUMN_LOCAL.door.y, z: p.z });
  const h = columnHeading(g, heading);
  if (!w || h === null) return false;
  stage(g, npc, { x: w.x, y: w.y, z: w.z }, h, loop);
  return true;
}

/** Where Gratus lies: read from his actor when the climb starts (stored), else the default. */
function fallPoint(q: QuestContext): Pt {
  if (typeof q.vars.gratusX === 'number' && typeof q.vars.gratusZ === 'number') return { x: q.vars.gratusX, z: q.vars.gratusZ };
  const a = q.game.actors?.get?.('npc-gratus');
  const l = a ? columnWorldToLocal(q.game, a.position) : null;
  const near = !!l && Math.hypot(l.x - COLUMN_LOCAL.axis.x, l.z - COLUMN_LOCAL.axis.z) < 8;
  const p = near && l ? { x: l.x, z: l.z } : FALL_DEFAULT;
  q.vars.gratusX = p.x;
  q.vars.gratusZ = p.z;
  return p;
}

/** Crito kneels 0.8 m beside Gratus, on the side away from the door. */
function critoKneel(q: QuestContext): Pt {
  const f = fallPoint(q);
  return { x: f.x + 0.8, z: f.z };
}

/** Crito runs from the court to Gratus. If the population cannot walk him, he is simply there. */
function sendCrito(q: QuestContext) {
  const g = q.game;
  const k = critoKneel(q);
  const w = columnLocalToWorld(g, { x: k.x, y: COLUMN_LOCAL.door.y, z: k.z });
  if (!w || !walkTo(g, 'npc-crito', { x: w.x, y: w.y, z: w.z })) arriveCrito(q);
}

/**
 * Crito has reached Gratus: he kneels. The line is said once: in a live ceremony the dedication's own
 * Crito (dedication.ts panic) says it, so the quest stays quiet; after a load there is no dedication
 * and the quest says it.
 */
function arriveCrito(q: QuestContext) {
  const g = q.game;
  if (q.vars.critoArrived) return;
  q.vars.critoArrived = true;
  if (!holdPose(g, 'npc-crito', 'pray')) {
    const k = critoKneel(q);
    stageAt(g, 'npc-crito', k, face(k, fallPoint(q)), 'pray');
  }
  say(g, 'Crito', CRITO_LINE, 5);
}

/** The arrival check, on the poll: Crito within 1.2 m of his kneeling point (the actor's position). */
function checkCrito(q: QuestContext) {
  const g = q.game;
  if (q.vars.critoArrived || !g.actors?.get?.('npc-crito')) return;
  const kn = critoKneel(q);
  const k = columnLocalToWorld(g, { x: kn.x, y: COLUMN_LOCAL.door.y, z: kn.z });
  const a = g.actors.get('npc-crito')!.position;
  if (k && Math.hypot(a.x - k.x, a.z - k.z) < 1.2) arriveCrito(q);
}

/** Stage this quest's people for the current stage. False only when the Column is not placed yet. */
function applyStaging(q: QuestContext): boolean {
  const g = q.game;
  if (!columnLocalToWorld(g, COLUMN_LOCAL.door)) return false;
  const door: Pt = { x: COLUMN_LOCAL.door.x, z: COLUMN_LOCAL.door.z };
  const gratusFace = face(GRATUS_POST, door);
  switch (q.stage) {
    case 'dawn':
    case 'post':
      stageAt(g, 'npc-gratus', GRATUS_POST, gratusFace, 'stand');
      stageAt(g, 'npc-apollodorus', APOLLODORUS_POST, face(APOLLODORUS_POST, GRATUS_POST), 'talk');
      break;
    case 'ceremony':
      stageAt(g, 'npc-gratus', GRATUS_POST, gratusFace, 'stand');
      // The dedication holds Apollodorus once it starts (startCeremony unstages him).
      if (!q.vars.ceremonyStarted) stageAt(g, 'npc-apollodorus', APOLLODORUS_POST, face(APOLLODORUS_POST, GRATUS_POST), 'talk');
      placeSeal(q);
      break;
    case 'climb':
    case 'archer':
    case 'aftermath':
    case 'aftermath-killed': {
      const fall = fallPoint(q);
      stageAt(g, 'npc-gratus', fall, 0, 'sleep');
      const kneel = critoKneel(q);
      if (q.vars.critoArrived) stageAt(g, 'npc-crito', kneel, face(kneel, fall), 'pray');
      else if (stageAt(g, 'npc-crito', CRITO_START, face(CRITO_START, fall), 'stand')) sendCrito(q);
      if (isAftermath(q.stage)) stageAt(g, 'npc-pudens', PUDENS_POST, Math.PI, 'stand');
      break;
    }
    default:
      break;
  }
  return true;
}

/** Apply this stage's staging once; retried by the poll until the Column is placed. */
function stageNow(q: QuestContext) {
  if (q.vars.staged === q.stage) return;
  if (applyStaging(q)) q.vars.staged = q.stage;
}

function placeSeal(q: QuestContext) {
  if (q.flag('mq04-seal-seen') || q.vars.sealOn) return;
  const d = columnLocalToWorld(q.game, COLUMN_LOCAL.door);
  if (!d) return;
  if (placeExamine(q.game, { id: 'mq04-seal', at: { x: d.x, y: d.y, z: d.z }, verb: 'Look at', label: 'The seal on the door', height: 1.2 })) q.vars.sealOn = true;
}

/** (Re)place a cell examine: each entry into the stair puts it back, whatever happened to it since. */
function placeCellExamine(g: Game, id: string, spot: string, label: string) {
  removeCellExamine(g, id);
  let offs = cellExamines.get(g);
  if (!offs) cellExamines.set(g, (offs = new Map()));
  const pos = g.interiors?.spot('dun-columna', spot)?.position;
  const inter = g.interactions as unknown as { add?(t: object): unknown } | undefined;
  if (!pos || !inter?.add) return;
  const off = inter.add({
    id: `content:${id}`,
    reach: 2.5,
    position: () => pos,
    verb: () => 'Look at',
    label: () => label,
    interact: (gg: Game) => {
      removeCellExamine(gg, id);
      gg.events.emit('content:interact', { id });
    },
  });
  if (typeof off === 'function') offs.set(id, off as () => void);
}

function removeCellExamine(g: Game, id: string) {
  const offs = cellExamines.get(g);
  const off = offs?.get(id);
  offs?.delete(id);
  off?.();
}

// ------------------------------------------------------------------ the day, the calendar, the crowd

function stepCalendar(q: QuestContext) {
  if (q.vars.calDone) return;
  q.vars.calDone = true;
  svc(q.game).calendar?.stepToAnchor?.();
}

function holdTrajan(g: Game) {
  if (traianusHold.has(g)) return;
  const off = svc(g).population?.holdNamed?.('npc-traianus');
  if (off) traianusHold.set(g, off);
}

function releaseTrajan(g: Game) {
  traianusHold.get(g)?.();
  traianusHold.delete(g);
}

/** The Imperial Fora fill up for the day (×1.3 within 120 m of the forum); chained onto any boost. */
function forumCrowd(g: Game) {
  const pop = svc(g).population;
  const c = placePosition(g, 'forum-trajan');
  if (!pop || !c || crowdBoosts.has(g)) return;
  const prev = pop.crowdBoost ?? null;
  const mine = (x: number, z: number) => (prev ? prev(x, z) : 1) * (Math.hypot(x - c.x, z - c.z) < 120 ? 1.3 : 1);
  pop.crowdBoost = mine;
  crowdBoosts.set(g, () => {
    if (pop.crowdBoost === mine) pop.crowdBoost = prev;
  });
}

function releaseCrowd(g: Game) {
  crowdBoosts.get(g)?.();
  crowdBoosts.delete(g);
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
  // The dedication's own Crito stays on his tableau after 'over': stop it then, so he is not a second figure beside the staged one.
  const d = dedications.get(q.game);
  if (d && d.phase === 'over') dropDedication(q.game);
  // The Forum may not be placed yet on dawn entry: retry the crowd until it is.
  if (q.stage !== 'done' && !crowdBoosts.has(q.game)) forumCrowd(q.game);
  checkDawn(q);
  if (q.stage === 'ceremony') tryCeremony(q);
  if (q.stage === 'climb') tryLandings(q);
  if (isClimbing(q.stage)) checkCrito(q);
}

const isClimbing = (s: string) => s === 'climb' || s === 'archer' || isAftermath(s);

function checkDawn(q: QuestContext) {
  if (q.stage === 'dawn' && !q.isObjectiveDone('forum') && atForum(q.game) && firstLight(hourOf(q.game))) q.completeObjective('forum');
}

// ------------------------------------------------------------------ the ceremony

const dedicationFor = (q: QuestContext): Dedication => {
  let d = dedications.get(q.game);
  if (!d) {
    d = createDedication(q.game, { onShot: () => onShot(q) });
    dedications.set(q.game, d);
  }
  return d;
};

function dropDedication(g: Game) {
  dedications.get(g)?.stop();
  dedications.delete(g);
}

/** The arrow has gone (the dedication calls this): the stair is the next thing. */
function onShot(q: QuestContext) {
  if (q.stage === 'ceremony') q.setStage('climb');
}

/** Start the ceremony when the player is at the door between 06:00 and 18:00 (dedication.start). */
function tryCeremony(q: QuestContext) {
  const g = q.game;
  if (q.stage !== 'ceremony' || q.vars.ceremonyStarted || !ceremonyHours(hourOf(g))) return;
  const door = columnLocalToWorld(g, COLUMN_LOCAL.door);
  const p = g.player?.position;
  if (!door || !p || Math.hypot(p.x - door.x, p.z - door.z) > 3) return;
  q.vars.ceremonyStarted = true;
  q.completeObjective('post');
  unstage(g, 'npc-apollodorus');
  const d = dedicationFor(q);
  d.start();
  if (q.vars.sealEarly || q.flag('mq04-seal-seen')) d.sealSeen();
}

// ------------------------------------------------------------------ the stair

/** Gratus's wounded line: the quest opens his dialogue 1.5 s after the shot, once. */
function openGratus(q: QuestContext) {
  if (q.vars.w0Opened) return;
  if (q.game.dialogue?.active) return afterIn(q, 2, () => openGratus(q));
  q.vars.w0Opened = true;
  q.game.dialogue?.start('npc-gratus');
}

function enterStair(q: QuestContext) {
  q.completeObjective('door');
  q.reveal('land1');
  q.reveal('stairmen');
  if (!q.vars.stairFoes) {
    q.vars.stairFoes = true;
    spawnStairFoes(q, false);
  }
  placeCellExamine(q.game, 'mq04-chamber', 'chamber', 'The empty chamber');
}

/** The Dacian arrow goes to the player at the first talk with Crito or Pudens in aftermath (spec §3.8). */
function giveArrow(q: QuestContext) {
  if (q.flag('mq04-arrow-given')) return;
  q.setFlag('mq04-arrow-given', true);
  if (!hasItem(q, ARROW)) giveItem(q, ARROW);
}

/** The two knife-men on the landings. `onlyMissing`: after a load, those not down and not in the world. */
function spawnStairFoes(q: QuestContext, onlyMissing: boolean) {
  const g = q.game;
  for (const f of STAIR_FOES) {
    if (onlyMissing && (stairDown(q, f.id) || actorExists(g, f.id))) continue;
    const spot = g.interiors?.spot('dun-columna', f.landing);
    if (!spot) continue;
    const id = spawnEnemyAt(g, 'grassator', spot.position, {
      id: f.id,
      name: 'Dacian knife-man',
      profile: DACIAN_KNIFE_PROFILE,
      quest: QUEST_ID,
      tags: [QUEST_ID, 'stair'],
      aggro: 6,
    });
    addFoe(q, 'stairfoes', id);
  }
}

function stairDown(q: QuestContext, id: string): boolean {
  return String(q.vars['stairfoes:down'] ?? '').split(',').includes(id);
}

/** Landings done by walking up to them (within 3 m): the markers go on in turn. */
function tryLandings(q: QuestContext) {
  const g = q.game;
  if (!g.interiors?.isInside('dun-columna')) return;
  const p = g.player?.position;
  if (!p) return;
  const near = (spot: string) => {
    const s = g.interiors?.spot('dun-columna', spot);
    return !!s && Math.hypot(p.x - s.position.x, p.z - s.position.z) < 3 && Math.abs(p.y - s.position.y) < 3;
  };
  if (!q.isObjectiveDone('land1') && near('landing-1')) {
    q.completeObjective('land1');
    q.reveal('land2');
  } else if (q.isObjectiveDone('land1') && !q.isObjectiveDone('land2') && near('landing-2')) {
    q.completeObjective('land2');
    q.reveal('top');
  }
}

// ------------------------------------------------------------------ the archer

function spawnBitus(q: QuestContext) {
  const g = q.game;
  if (q.flag('bitus-fate') || q.vars.bitusSpawned) return;
  const spot = g.interiors?.spot('columna-summa', 'bitus');
  if (!spot) return;
  q.vars.bitusSpawned = true;
  spawnEnemyAt(g, 'sagittarius', spot.position, { id: BITUS, npc: BITUS, name: 'Bitus', profile: BITUS_PROFILE, quest: QUEST_ID, tags: [QUEST_ID, 'bitus'], aggro: 12 });
}

/** Is the archer still yielded? (CombatCore releases an undecided yield on its own, with no event.) */
function stillYielded(q: QuestContext, id: string): boolean {
  const core = svc(q.game).combat?.core;
  if (!core) return true;
  return core.get(id)?.status === 'yielded';
}

/** The archer's fate is set once: the stage moves on (unless the search for the token is still open). */
function decideFate(q: QuestContext, fate: Fate) {
  if (q.stage !== 'archer' || q.flag('bitus-fate')) return;
  q.setFlag('bitus-fate', fate);
  q.completeObjective('archer');
  if (fate === 'spared') {
    q.setStage('aftermath');
    afterIn(q, 1.2, () => openBitus(q));
    return;
  }
  q.reveal('search');
  advanceAfterKill(q);
}

function advanceAfterKill(q: QuestContext) {
  if (q.stage !== 'archer' || q.flag('bitus-fate') !== 'killed') return;
  if (!q.isObjectiveDone('search') && q.game.interiors?.isInside('columna-summa')) return;
  q.setStage('aftermath-killed');
}

/** Bitus's own talk, once he is spared and the player is still up on the platform. */
function openBitus(q: QuestContext) {
  const g = q.game;
  if (q.vars.bitusGone || q.flag('bitus-fate') !== 'spared') return;
  if (!g.interiors?.isInside('columna-summa')) return takeBitusDown(q);
  if (g.dialogue?.active) return afterIn(q, 2, () => openBitus(q));
  g.dialogue?.start(BITUS);
}

/** Pudens's men take the spared archer down the stair (the fade, then he is gone). */
function takeBitusDown(q: QuestContext) {
  const g = q.game;
  if (q.vars.bitusGone) return;
  q.vars.bitusGone = true;
  svc(g).getSystem?.('ui')?.fade?.();
  const c = svc(g).combat;
  const who = c?.get?.(BITUS);
  if (who) c?.despawn?.(who);
  q.notify(BITUS_TAKEN);
}

// ------------------------------------------------------------------ the quest

const AFTERMATH_OBJECTIVES = [
  { id: 'down', text: 'Go down to Gratus', target: { kind: 'location', id: 'column-door' } },
  { id: 'pudens', text: 'Speak to Pudens', target: { kind: 'npc', id: 'npc-pudens' } },
] as const;

const dawn: QuestStageDef = {
  journal:
    'Gratus had told me to be in the Forum of Trajan at first light. It was the day of the dedication: Caesar would stand at the foot of his Column before all Rome, and somewhere there was a bow on a high place.',
  objectives: [{ id: 'forum', text: 'Be in the Forum of Trajan at first light', target: { kind: 'location', id: 'forum-trajan' } }],
  onEnter: (q) => {
    const g = q.game;
    if (hourOf(g) < 12) stepCalendar(q);
    holdTrajan(g);
    forumCrowd(g);
    ensurePoll(q);
    stageNow(q);
    const h = hourOf(g);
    if (h < 5.5 || h >= 20) hint(g, 'Press T to wait until first light, about 05:30.');
  },
  next: 'post',
};

const post: QuestStageDef = {
  journal:
    'The Forum of Trajan was full before the sun was up: senators, soldiers, half the city on the gallery roofs. Gratus was in the little court behind the basilica, at the Column’s foot.',
  objectives: [
    { id: 'brief', text: 'Speak to Gratus in the Column court', target: { kind: 'npc', id: 'npc-gratus' } },
    { id: 'ask-door', text: 'Ask Apollodorus about the door', optional: true, target: { kind: 'npc', id: 'npc-apollodorus' } },
  ],
  onEnter: (q) => stageNow(q),
  next: 'ceremony',
};

const ceremony: QuestStageDef = {
  journal:
    'Gratus put me at the Column’s door. It had been sealed with lead at first light, after the stair was swept. Nobody was to go in or out.',
  objectives: [
    { id: 'post', text: 'Take your post at the Column’s door', target: { kind: 'location', id: 'column-door' } },
    { id: 'seal', text: 'Look at the seal on the door', optional: true, target: { kind: 'location', id: 'column-door' } },
  ],
  onEnter: (q) => {
    const g = q.game;
    q.vars.ceremonyStarted = false;
    stageNow(q);
    placeSeal(q);
    if (!ceremonyHours(hourOf(g)) && !q.vars.hintedWait) {
      q.vars.hintedWait = true;
      hint(g, 'Caesar comes at the second hour. Press T to wait until 06:00.');
    }
    tryCeremony(q);
  },
};

const climb: QuestStageDef = {
  journal:
    'The arrow came from the top of the Column and took Gratus in the shoulder. Caesar’s guards closed round him and hurried him away. The seal on the door had been cut. The archer was up there, a hundred feet over the Forum, and the only way up was the stair inside.',
  objectives: [
    { id: 'door', text: 'Enter the stair', target: { kind: 'location', id: 'column-door' } },
    { id: 'land1', text: 'Climb to the first landing', hidden: true, target: { kind: 'location', id: 'interior:dun-columna:landing-1' } },
    { id: 'land2', text: 'Climb to the second landing', hidden: true, target: { kind: 'location', id: 'interior:dun-columna:landing-2' } },
    { id: 'top', text: 'Climb the Column: stop the archer', hidden: true, target: { kind: 'location', id: 'interior:dun-columna:top' } },
    { id: 'stairmen', text: 'Deal with the men on the stair', count: 2, optional: true, hidden: true },
  ],
  onEnter: (q) => {
    const g = q.game;
    q.setFlag('columna-open', true);
    removeExamine('mq04-seal');
    q.vars.sealOn = false;
    stageNow(q);
    afterIn(q, 1.5, () => openGratus(q));
    if (g.interiors?.isInside('dun-columna')) enterStair(q);
  },
};

const archer: QuestStageDef = {
  journal:
    'One hundred and eighty-five steps in the dark, with slits of daylight to climb by. Two of his friends were waiting on the stair. At the top, a little door opened onto the sky.',
  objectives: [
    { id: 'archer', text: 'Stop the archer', target: { kind: 'npc', id: BITUS } },
    { id: 'search', text: 'Search the archer', optional: true, hidden: true, target: { kind: 'npc', id: BITUS } },
  ],
  onEnter: (q) => {
    stageNow(q);
    spawnBitus(q);
  },
};

const aftermath: QuestStageDef = {
  journal:
    'The archer was a Dacian called Bitus, son of Dida. I spared him. He said the bow came from a falx-man called Mucapor, and the silver from a man who smelled of pepper. And he said he was never sent to kill Caesar: only Gratus. Caesar, they told him, was for later.',
  objectives: [...AFTERMATH_OBJECTIVES],
  onEnter: (q) => stageNow(q),
};

const aftermathKilled: QuestStageDef = {
  journal:
    'The archer was a Dacian. He died on the platform under Caesar’s statue, with three Parthian drachms in his belt and a bone token scratched with a falx and a name: MVCAPOR.',
  objectives: [...AFTERMATH_OBJECTIVES, { id: 'search', text: 'Search the archer', optional: true, target: { kind: 'npc', id: BITUS } }],
  onEnter: (q) => stageNow(q),
};

const done: QuestStageDef = {
  journal:
    'Pudens, chief of the couriers, told me what had happened: a centurion fainted in the heat, and a hawk was seen over the Column, a fine omen for the war. Gratus will live. I am to go to the Castra Peregrina tomorrow.',
  onEnter: (q) => {
    const g = q.game;
    dropDedication(g);
    for (const id of ['npc-gratus', 'npc-crito', 'npc-pudens', 'npc-apollodorus']) unstage(g, id);
    removeExamine('mq04-seal');
    removeCellExamine(g, 'mq04-chamber');
    if (!hasItem(q, RING)) giveItem(q, RING);
    if (q.flag('bitus-fate') === 'spared') takeBitusDown(q);
    releaseTrajan(g);
    releaseCrowd(g);
    stopPoll(g);
    g.events.emit('ui:banner', { kind: 'generic', label: 'Act I continues', title: 'The Board', subtitle: 'Pudens’s offer, 13 May, comes in a future update.', duration: 7 });
  },
  end: 'complete',
};

export default defineQuest({
  id: QUEST_ID,
  title: 'One Hundred Feet',
  latin: 'Centum Pedes',
  category: 'main',
  giver: 'npc-gratus',
  summary: 'Caesar dedicates Trajan’s Column at dawn on 12 May. Gratus has put me at its door, and someone is shooting from the top.',
  stages: {
    start: dawn,
    dawn,
    post,
    ceremony,
    climb,
    archer,
    aftermath,
    'aftermath-killed': aftermathKilled,
    done,
  },
  triggers: {
    'quest:completed': (q, e) => {
      if (e.questId === 'mq-03-lemuria') q.start('dawn');
    },
  },
  on: {
    'location:entered': (q, e) => {
      if (e.locationId === 'forum-trajan' || e.locationId === 'column-trajan') checkDawn(q);
      if (e.locationId === 'column-door') {
        if (isAftermath(q.stage)) q.completeObjective('down');
        tryCeremony(q);
      }
      stageNow(q);
    },
    'time:hour': (q, e) => {
      if (q.stage === 'dawn' && e.hour === 0) stepCalendar(q);
      checkDawn(q);
      tryCeremony(q);
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-gratus' && e.nodeId === 'postEnd' && q.stage === 'post') q.completeObjective('brief');
      if (e.dialogueId === 'npc-bitus' && e.nodeId === 'bitusEnd' && q.flag('bitus-fate') === 'spared') takeBitusDown(q);
      if ((e.dialogueId === 'npc-crito' || e.dialogueId === 'npc-pudens') && isAftermath(q.stage)) giveArrow(q);
      if (e.dialogueId === 'npc-pudens' && isAftermath(q.stage)) {
        q.completeObjective('pudens');
        if (e.nodeId === 'summonsEnd') q.setStage('done');
      }
    },
    'flag:changed': (q, e) => {
      if (e.name === 'mq04-apollodorus-door' && e.value === true && (q.stage === 'dawn' || q.stage === 'post')) q.completeObjective('ask-door');
    },
    'content:interact': (q, e) => {
      if (e.id === 'mq04-chamber') {
        q.notify(CHAMBER_TEXT);
        return;
      }
      if (e.id !== 'mq04-seal' || q.stage !== 'ceremony' || q.flag('mq04-seal-seen')) return;
      q.setFlag('mq04-seal-seen', true);
      q.notify(SEAL_TEXT);
      q.completeObjective('seal');
      if (q.vars.ceremonyStarted) dedicationFor(q).sealSeen();
      else q.vars.sealEarly = true;
    },
    'interior:entered': (q, e) => {
      if (e.id === 'dun-columna' && q.stage === 'climb') enterStair(q);
      if (e.id === 'columna-summa' && q.stage === 'climb') {
        q.completeObjective('top');
        q.setStage('archer');
      }
    },
    'interior:exited': (q, e) => {
      // Out of the stair's door into the court: the player lands on the door's own spot, already
      // inside its location, so 'location:entered' never fires for it.
      if (e.id === 'dun-columna' && isAftermath(q.stage) && !q.game.interiors?.current?.()) q.completeObjective('down');
      if (e.id !== 'columna-summa' || q.stage !== 'archer') return;
      // Leaving the platform with him yielded and undecided: Pudens's men have him, so he is spared.
      if (!q.flag('bitus-fate') && q.vars.bitusYielded && stillYielded(q, BITUS)) decideFate(q, 'spared');
      else advanceAfterKill(q);
    },
    'combat:yieldChoice': (q, e) => {
      if (base(e.actorId) !== BITUS) return;
      decideFate(q, e.choice === 'kill' ? 'killed' : 'spared');
    },
    'actor:yielded': (q, e) => {
      // Provisional: the fate is decided by the player's choice (combat:yieldChoice), a kill, or leaving the platform.
      if (base(e.actorId) === BITUS && q.stage === 'archer' && !q.flag('bitus-fate')) q.vars.bitusYielded = true;
      if (beatFoe(q, 'stairfoes', e.actorId)) q.progress('stairmen');
    },
    'actor:killed': (q, e) => {
      if (base(e.victimId) === BITUS) decideFate(q, 'killed');
      if (beatFoe(q, 'stairfoes', e.victimId)) q.progress('stairmen');
    },
    'item:added': (q, e) => {
      if (e.itemId === TOKEN && q.flag('bitus-fate') === 'killed') {
        q.completeObjective('search');
        advanceAfterKill(q);
      }
    },
    'save:loaded': (q) => {
      // Staging, the poll, the crowd, the cell examines and the foes are not saved: put back what this stage needs.
      const g = q.game;
      q.vars.staged = '';
      q.vars.sealOn = false;
      q.vars.bitusSpawned = false;
      ensurePoll(q);
      holdTrajan(g);
      if (q.stage !== 'done') forumCrowd(g);
      // The body is not saved: a killed archer cannot be searched any more.
      if (q.stage === 'aftermath-killed' && !q.isObjectiveDone('search')) q.completeObjective('search');
      if (q.stage === 'ceremony') {
        q.vars.ceremonyStarted = false;
        dropDedication(g);
      }
      if (q.stage === 'climb' && g.interiors?.isInside('dun-columna')) enterStair(q);
      if (q.stage === 'climb' && q.vars.stairFoes && g.interiors?.isInside('dun-columna')) spawnStairFoes(q, true);
      if (q.stage === 'archer') spawnBitus(q);
      stageNow(q);
    },
  },
  // The courier's ring is given in done, unless the player has it: Pudens's psummons node gives it first
  // (dialogue/content/columna.ts, giveOnce 'gaveRing'), so normally nothing is given twice.
  rewards: { denarii: 80, skillXp: ['blades', 'athletics'] },
});
