/**
 * mq-06-sacculus "The Purse" (docs/STORY.md chapter 6). Main quest, Act II, from 13 May AD 113 at
 * the player's own pace: the first group on Pudens's board, the money behind the plot.
 *
 *   lead     find out who "…NARIVS AVIT…" is (Primigenius, keeper of the Horrea Agrippiana)  → names
 *   names    prove Euhodus (the arrow, or his shop boy's ledger page), Hermogenes (the drachm,
 *            or his clerk Lycus's tablets) and what Avitus keeps in his sealed bays (Primigenius
 *            opens one by day once shown proof, or the night porter for a bribe); any order → avitus
 *   avitus   face Avitus in his counting-room: he pays and runs, or calls two knife-men; then
 *            arrest, let run or kill                                                   → report
 *   report   report to Pudens at the Castra Peregrina (optional: Avitus's papers)       → done
 *   done     the banner "The Purse is broken"; end 'complete'
 *
 * Starts from Pudens ("The Purse", node sLead: stage `lead`) or from Primigenius naming the three
 * men (node hNames: stage `names`). Each man proven sets `board:<id>` and `board-how:<id>` (the
 * board, game/board/board.ts). Staging (Avitus in his counting-room) and the two interactions (the
 * sacks in the bay, the counting-room's chest) are applied on stage entry, on the 0.5 s poll until
 * the warehouse's spots exist, and on 'save:loaded'.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { howFlag } from '../../game/board/board';
import { actorExists, hint, hourOf, say, spawnEnemyAt, stage, unstage } from '../../content/director';
import { AVITUS_KNIFE_PROFILE } from '../../content/profiles';
import { giveItem, hasItem } from '../../content/questkit';
import { stageTicker } from '../../content/sequence';
import { defineQuest, type QuestContext, type QuestStageDef } from '../types';

export const QUEST_ID = 'mq-06-sacculus';

const AVITUS = 'npc-avitus';
const KNIVES = ['sica-aviti-1', 'sica-aviti-2'];
const KNIFE_KIND = 'grassator';
const DRACHM = 'quest-drachma-parthica';
const PAPERS = 'quest-chartae-aviti';
const SACKS = 'mq06-sacks';
const CHEST = 'mq06-chest';

/** The warehouse's places (the Horrea Agrippiana's builder or content/places.ts). */
const GATE = 'agrippiana-gate';
const BAYS = 'agrippiana-bays';
const OFFICE = 'agrippiana-office';
const CAMP = 'castra-peregrina';

/** How each man was proven: the line under his face on the board. */
const HOW: Record<string, string> = {
  arrow: 'His own fletching, on the arrow from Gratus’s shoulder.',
  ledger: 'A page of his order-book, from his shop boy.',
  drachm: 'He had a ready price for Parthian silver.',
  lycus: 'His clerk’s tablets: Eastern silver, for Pinarius.',
  bays: 'Knives in the army’s wheat, in his sealed bays.',
};

const base = (id: string) => id.split('~')[0];
const daytime = (h: number) => h >= 6 && h < 19;

// Per game (not saved): the poll and the two interactions.
const polls = new WeakMap<Game, () => void>();
const marks = new WeakMap<Game, Map<string, () => void>>();

// ------------------------------------------------------------------ places, staging, interactions

function where(g: Game, id: string): THREE.Vector3 | null {
  const p = g.locations?.get(id)?.position;
  return p ? new THREE.Vector3(p.x, p.y ?? 0, p.z) : null;
}

/** Heading from a point toward another place. */
function facing(g: Game, from: THREE.Vector3, toward: string): number {
  const t = where(g, toward);
  return t ? Math.atan2(t.x - from.x, t.z - from.z) : 0;
}

/** An "examine" spot (the sacks, the chest) at a place; replaced if it already exists. */
function mark(g: Game, key: string, place: string, label: string, verb: string) {
  let m = marks.get(g);
  if (!m) marks.set(g, (m = new Map()));
  if (m.has(key)) return;
  const p = where(g, place);
  const inter = g.interactions as unknown as { add?(t: object): unknown } | undefined;
  if (!p || !inter?.add) return;
  const pos = new THREE.Vector3(p.x, p.y + 0.8, p.z);
  const off = inter.add({
    id: `content:${key}`,
    reach: 2.8,
    position: () => pos,
    verb: () => verb,
    label: () => label,
    interact: (gg: Game) => gg.events.emit('content:interact', { id: key }),
  });
  if (typeof off === 'function') m.set(key, off as () => void);
}

function unmark(g: Game, key?: string) {
  const m = marks.get(g);
  if (!m) return;
  for (const [k, off] of [...m]) {
    if (key && k !== key) continue;
    off();
    m.delete(k);
  }
}

/** Put this stage's people and interactions where they belong. False until the spots exist. */
function applyStaging(q: QuestContext): boolean {
  const g = q.game;
  if (!where(g, OFFICE)) return false;
  if (q.flag('mq06-bay-open') && !q.flag('mq06-knives-found')) mark(g, SACKS, BAYS, 'The heavy sacks', 'Cut open');
  if (q.stage === 'avitus') {
    if (!q.flag('mq06-avitus-fate') && !q.vars.avitusGone) {
      const p = where(g, OFFICE)!;
      stage(g, AVITUS, p, facing(g, p, BAYS), 'stand');
    }
  }
  if ((q.stage === 'avitus' || q.stage === 'report') && q.flag('mq06-avitus-fate') && !q.vars.papers) mark(g, CHEST, OFFICE, 'Avitus’s chest', 'Search');
  return true;
}

function stageNow(q: QuestContext) {
  if (q.vars.staged === q.stage) return;
  if (applyStaging(q)) q.vars.staged = q.stage;
}

function restage(q: QuestContext) {
  q.vars.staged = '';
  stageNow(q);
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
        if (q.running && q.vars.staged !== q.stage) stageNow(q);
      },
    }),
  );
}

function stopPoll(g: Game) {
  polls.get(g)?.();
  polls.delete(g);
}

// ------------------------------------------------------------------ the three men

const unmasked = (q: QuestContext, id: string) => q.flag(`board:${id}`) === true;

/** A man proven: his face on the board, the line saying how, a word on screen. */
function unmask(q: QuestContext, id: 'euhodus' | 'hermogenes' | 'pinarius-avitus', how: keyof typeof HOW, name: string, objective: string) {
  if (unmasked(q, id)) return;
  q.setFlag(`board:${id}`, true);
  q.setFlag(howFlag(id), HOW[how]);
  q.completeObjective(objective);
  q.game.events.emit('ui:notify', { text: `Unmasked on the board: ${name}.`, kind: 'quest' });
  allThree(q);
}

/** All three proven: on to Avitus himself. */
function allThree(q: QuestContext) {
  if (q.stage !== 'names') return;
  if (unmasked(q, 'euhodus') && unmasked(q, 'hermogenes') && unmasked(q, 'pinarius-avitus')) q.setStage('avitus');
}

/** A bay is open (Primigenius by day, the porter by night): the sacks can be looked at. */
function bayOpened(q: QuestContext, by: 'keeper' | 'porter') {
  if (q.flag('mq06-bay-open')) return;
  q.setFlag('mq06-bay-open', true);
  q.vars.bayBy = by;
  restage(q);
}

// ------------------------------------------------------------------ Avitus

/** Before the fight: whoever opened the bay warns the player (and the leak, if Mardonius was told). */
function warn(q: QuestContext) {
  if (q.vars.warned) return;
  q.vars.warned = true;
  const who = q.vars.bayBy === 'porter' ? 'Night porter' : 'Primigenius';
  say(q.game, who, 'He’ll know a seal’s been cut by now. He keeps two hired knives in his counting-room, men of the Mouse’s sort.', 6);
  if (q.flag('mq05-told-mardonius') === true) {
    setTimeout(() => say(q.game, who, 'And a man came from the Caelian yesterday, asking what you look like.', 5), 6200);
  }
}

/** The two knife-men come out of the back room, either side of the counting-room. */
function spawnKnives(q: QuestContext) {
  const g = q.game;
  if (q.vars.knivesSpawned || q.flag('mq06-knives-dead')) return;
  const p = where(g, OFFICE) ?? (g.player?.position ? new THREE.Vector3(g.player.position.x, g.player.position.y, g.player.position.z) : null);
  if (!p) return;
  const h = facing(g, p, BAYS);
  KNIVES.forEach((id, i) => {
    const side = i === 0 ? 1 : -1;
    const at = { x: p.x + Math.cos(h) * side * 2.2 - Math.sin(h) * 1.5, y: p.y, z: p.z - Math.sin(h) * side * 2.2 - Math.cos(h) * 1.5 };
    spawnEnemyAt(g, KNIFE_KIND, at, { id, name: 'Hired knife', profile: AVITUS_KNIFE_PROFILE, quest: QUEST_ID, tags: [QUEST_ID, 'avitus-knife'], aggro: 30 });
  });
  q.vars.knivesSpawned = true;
}

/** The player has decided (or Avitus is dead): to the report. */
function decided(q: QuestContext, fate: 'arrested' | 'ran' | 'killed') {
  if (q.flag('mq06-avitus-fate')) return;
  q.setFlag('mq06-avitus-fate', fate);
  q.completeObjective('face');
  if (fate !== 'killed') {
    q.vars.avitusGone = true;
    unstage(q.game, AVITUS);
  }
  q.setStage('report');
}

// ------------------------------------------------------------------ the quest

const drachmObjective = { id: 'drachm', text: 'Collect the Parthian drachm from Pudens', optional: true, hidden: true, target: { kind: 'npc' as const, id: 'npc-pudens' } };

/** Without the drachm (Gratus kept it), Pudens has it for the player: an optional objective. */
function offerDrachm(q: QuestContext) {
  if (hasItem(q, DRACHM)) q.completeObjective('drachm');
  else q.reveal('drachm');
}

const lead: QuestStageDef = {
  journal:
    'Pudens sent me after the money first. Three half-names on a scraped tablet, and the first of them buys wheat for the army. Every big buyer rents a bay at the Horrea Agrippiana, on the Vicus Tuscus.',
  objectives: [{ id: 'name', text: 'Find out who “…NARIVS AVIT…” is', target: { kind: 'npc', id: 'npc-horrearius' } }, drachmObjective],
  onEnter: (q) => {
    ensurePoll(q);
    offerDrachm(q);
    stageNow(q);
  },
};

const names: QuestStageDef = {
  journal:
    'Sextus Pinarius Avitus has the army’s grain contract, and three sealed bays at the back of the Horrea Agrippiana. Two men come to see him, regular as the Nones: Euhodus, who sells arms on the Sacred Way, and Hermogenes, a banker at the Basilica Aemilia. Three half-names, three men.',
  objectives: [
    { id: 'euhodus', text: 'Prove what Euhodus sells, and to whom', target: { kind: 'npc', id: 'npc-euhodus' } },
    { id: 'hermogenes', text: 'Prove what Hermogenes changes, and for whom', target: { kind: 'npc', id: 'npc-hermogenes' } },
    { id: 'bays', text: 'Find out what Avitus keeps in his sealed bays', target: { kind: 'location', id: BAYS } },
    drachmObjective,
  ],
  onEnter: (q) => {
    ensurePoll(q);
    q.completeObjective('name');
    offerDrachm(q);
    // Proven before this stage (a save, or a quick player): count it now.
    if (unmasked(q, 'euhodus')) q.completeObjective('euhodus');
    if (unmasked(q, 'hermogenes')) q.completeObjective('hermogenes');
    if (unmasked(q, 'pinarius-avitus')) q.completeObjective('bays');
    restage(q);
    allThree(q);
  },
};

const avitus: QuestStageDef = {
  journal:
    'Hermogenes changes the Parthian silver, Euhodus buys the knives with it, and Avitus hides them in the army’s wheat. All three are proven. Avitus stands in his counting-room by the bays, and by now he knows a seal has been cut.',
  objectives: [{ id: 'face', text: 'Face Avitus', target: { kind: 'npc', id: AVITUS } }],
  onEnter: (q) => {
    ensurePoll(q);
    restage(q);
    warn(q);
  },
};

const report: QuestStageDef = {
  journal: 'It was over at the Horrea Agrippiana. Pudens would want to hear it from me, at the Castra Peregrina.',
  objectives: [
    { id: 'report', text: 'Report to Pudens', target: { kind: 'npc', id: 'npc-pudens' } },
    { id: 'papers', text: 'Search Avitus’s counting-room', optional: true, target: { kind: 'location', id: OFFICE } },
  ],
  onEnter: (q) => {
    ensurePoll(q);
    if (q.vars.papers) q.completeObjective('papers');
    restage(q);
    if (!daytime(hourOf(q.game))) hint(q.game, 'Pudens sees visitors by day. Press T to wait until morning.');
  },
};

const done: QuestStageDef = {
  journal:
    'The Purse is broken: the grain, the arms and the bank. Pudens leaves Euhodus and Hermogenes in their shops, watched. One group of four, and he wants three before October.',
  onEnter: (q) => {
    const g = q.game;
    unmark(g);
    unstage(g, AVITUS);
    stopPoll(g);
    g.events.emit('ui:banner', { kind: 'generic', label: 'Act II', title: 'The Purse is broken', subtitle: 'One of four. Pudens wants three.', duration: 7 });
  },
  end: 'complete',
};

export default defineQuest({
  id: QUEST_ID,
  title: 'The Purse',
  latin: 'Sacculus',
  category: 'main',
  giver: 'npc-pudens',
  summary: 'The money behind the plot: a grain contractor, an arms dealer and a banker, three half-names on a scraped tablet.',
  stages: {
    start: lead,
    lead,
    names,
    avitus,
    report,
    done,
  },
  on: {
    'dialogue:node': (q, e) => {
      const { dialogueId: d, nodeId: n } = e;
      if (d === 'npc-horrearius' && n === 'hNames' && q.stage === 'lead') q.setStage('names');
      if (d === 'npc-horrearius' && n === 'hOpen') bayOpened(q, 'keeper');
      if (d === 'npc-ianitor-horreorum' && n === 'nOpen') bayOpened(q, 'porter');
      if (q.stage === 'names' || q.stage === 'lead') {
        if (d === 'npc-euhodus' && n === 'eConfessEnd') unmask(q, 'euhodus', 'arrow', 'Tiberius Claudius Euhodus', 'euhodus');
        if (d === 'npc-puer-euhodi' && n === 'fLedger') unmask(q, 'euhodus', 'ledger', 'Tiberius Claudius Euhodus', 'euhodus');
        if (d === 'npc-hermogenes' && n === 'hgOthers') unmask(q, 'hermogenes', 'drachm', 'Hermogenes', 'hermogenes');
        if (d === 'npc-lycus' && n === 'lTablets') unmask(q, 'hermogenes', 'lycus', 'Hermogenes', 'hermogenes');
      }
      if (d === 'npc-avitus' && q.stage === 'avitus') {
        if (n === 'aFight') spawnKnives(q);
        if (n === 'aTake' || n === 'aRun') decided(q, 'ran');
        if (n === 'aArrested') decided(q, 'arrested');
      }
      if (d === 'npc-pudens' && n === 'sDone' && q.stage === 'report') {
        q.completeObjective('report');
        q.setStage('done');
      }
    },
    'content:interact': (q, e) => {
      const g = q.game;
      if (e.id === SACKS) {
        q.setFlag('mq06-knives-found', true);
        unmark(g, SACKS);
        say(g, 'You', '(Three sacks are heavier than grain. Inside, wrapped in sacking: sicae, bows, and bundles of arrows.)', 6);
        unmask(q, 'pinarius-avitus', 'bays', 'Sextus Pinarius Avitus', 'bays');
      }
      if (e.id === CHEST && !q.vars.papers) {
        q.vars.papers = true;
        unmark(g, CHEST);
        if (!hasItem(q, PAPERS)) giveItem(q, PAPERS);
        q.completeObjective('papers');
      }
    },
    'item:added': (q, e) => {
      if (e.itemId === DRACHM) q.completeObjective('drachm');
      if (e.itemId === PAPERS) {
        q.vars.papers = true;
        q.completeObjective('papers');
      }
    },
    'actor:killed': (q, e) => {
      const id = base(e.victimId);
      if (KNIVES.includes(id)) {
        q.vars.knivesKilled = Number(q.vars.knivesKilled ?? 0) + 1;
        if (Number(q.vars.knivesKilled) >= KNIVES.length) {
          q.setFlag('mq06-knives-dead', true);
          hint(q.game, 'The knife-men are down. Talk to Avitus.');
        }
      }
      if (id === AVITUS) decided(q, 'killed');
    },
    'location:entered': (q, e) => {
      if (e.locationId === CAMP && q.stage === 'report' && !daytime(hourOf(q.game))) hint(q.game, 'Pudens sees visitors by day. Press T to wait until morning.');
      stageNow(q);
    },
    'save:loaded': (q) => {
      // Staging, the poll, the interactions and the knife-men are not saved: put back what this stage needs.
      const g = q.game;
      unmark(g);
      ensurePoll(q);
      // Knife-men who were fighting when the game was saved don't come back: the fight is over.
      if (q.stage === 'avitus' && q.vars.knivesSpawned && !q.flag('mq06-knives-dead') && !KNIVES.some((id) => actorExists(g, id))) q.setFlag('mq06-knives-dead', true);
      restage(q);
    },
  },
  rewards: { denarii: 150, skillXp: ['mercatura', 'rhetoric'] },
});
