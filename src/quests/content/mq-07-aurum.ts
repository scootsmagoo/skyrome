/**
 * mq-07-aurum "The Eastern Gold" (docs/STORY.md chapter 7). Main quest, Act II, from 13 May AD 113
 * at the player's own pace: the second group on Pudens's board, where the Parthian silver comes in,
 * and who in the couriers' camp is selling its secrets.
 *
 *   lead     find the man with Syrian rings at the Horrea Piperataria (Malchus)          → names
 *   names    prove Malchus (the Mercatura check and a cut sack in his storeroom, or his ledger
 *            from his strongbox), Asclepiodotus (a star table from Zenon or from his own table,
 *            read by Gemellus) and Mardonius (the Father of the Mithras cave, or the letter in
 *            his locked box at the camp's barracks); any order                            → feast
 *   feast    the night feast in the cave of Mithras under the Subura: Mardonius talks, draws,
 *            fights and yields; take him to Pudens, leave him to the Father, or kill him   → report
 *   report   report to Pudens at the Castra Peregrina                                    → done
 *   done     the banner "The Eastern Gold is broken"; end 'complete'
 *
 * Starts from Pudens ("The Eastern Gold", node gLead: stage `lead`). Each man proven sets
 * `board:<id>` and `board-how:<id>` (game/board/board.ts). The places are interior cells
 * (world/interiors/named: `piperataria-bay`, `domus-asclepiodoti`, `mithraeum-subura`,
 * `peregrina-barracks`); the quest's own interactions inside them (the sack, the nativity) and the
 * feast's people are put back on stage entry, on the 0.5 s poll and on 'save:loaded'.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { howFlag } from '../../game/board/board';
import { actorExists, hint, hourOf, say, spawnEnemyAt, stage, unstage } from '../../content/director';
import { AVITUS_KNIFE_PROFILE } from '../../content/profiles';
import { giveItem, hasItem } from '../../content/questkit';
import { stageTicker } from '../../content/sequence';
import { defineQuest, type QuestContext, type QuestStageDef } from '../types';
import { holdCast } from '../../world/interiors/named/cast';

export const QUEST_ID = 'mq-07-aurum';

const MARDONIUS = 'npc-mardonius';
const MALCHUS = 'npc-malchus';
const CHALDAEAN = 'npc-asclepiodotus';
const KNIVES = ['sica-mardonii-1', 'sica-mardonii-2'];
const LEDGER = 'quest-rationes-malchi';
const TABLE = 'quest-tabula-siderum';
const NATIVITY = 'quest-genitura-caesaris';
const LETTER = 'quest-epistula-mardonii';
const SACK = 'mq07-sack';
const TABLE_MARK = 'mq07-nativity';

/** The cells (world/interiors/named) and their spots. */
const BAY = 'piperataria-bay';
const FLAT = 'domus-asclepiodoti';
const CAVE = 'mithraeum-subura';
const CAMP = 'castra-peregrina';

/** How each man was proven: the line under his face on the board. */
const HOW: Record<string, string> = {
  pepper: 'Parthian drachms under the pepper, in his own sacks.',
  ledger: 'His ledger: silver for Hermogenes, and 500 “to the Lion”.',
  cipher: 'His star tables are a cipher; Gemellus read them.',
  cave: 'The Father of the Mithras cave named him.',
  letter: 'His own letter, selling Festus’s road.',
};

const base = (id: string) => id.split('~')[0];
const daytime = (h: number) => h >= 6 && h < 19;
const feastHours = (h: number) => h >= 19 || h < 4;

// Per game (not saved): the poll and the interactions.
const polls = new WeakMap<Game, () => void>();
const marks = new WeakMap<Game, Map<string, () => void>>();

// ------------------------------------------------------------------ places, staging, interactions

/** A spot inside a cell, in the world (builds the cell if needed); null until the cell exists. */
function spotOf(g: Game, cell: string, spot: string): { position: THREE.Vector3; heading: number } | null {
  try {
    return g.interiors?.spot(cell, spot) ?? null;
  } catch {
    return null;
  }
}

/** An "examine" interaction at a world point; kept until `unmark`. */
function markAt(g: Game, key: string, at: THREE.Vector3, label: string, verb: string) {
  let m = marks.get(g);
  if (!m) marks.set(g, (m = new Map()));
  if (m.has(key)) return;
  const inter = g.interactions as unknown as { add?(t: object): unknown } | undefined;
  if (!inter?.add) return;
  const pos = new THREE.Vector3(at.x, at.y + 0.8, at.z);
  const off = inter.add({
    id: `content:${key}`,
    reach: 2.6,
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

/** The feast's three guests on their benches (the Father and the soldiers are the cave's own). */
function stageFeast(q: QuestContext): boolean {
  const g = q.game;
  if (q.flag('mq07-mardonius-fate')) return true;
  const seats: [string, string][] = [
    [MARDONIUS, 'feast-mardonius'],
    [MALCHUS, 'feast-malchus'],
    [CHALDAEAN, 'feast-chaldaean'],
  ];
  let ok = true;
  // The Chaldaean is at the feast tonight, not at his own table (named/cast.ts seats him there otherwise).
  holdCast(g, CHALDAEAN);
  for (const [id, spot] of seats) {
    const s = spotOf(g, CAVE, spot);
    if (!s) {
      ok = false;
      continue;
    }
    stage(g, id, s.position, s.heading, 'sit');
  }
  return ok;
}

/** Put this stage's interactions and people where they belong. False until the places exist. */
function applyStaging(q: QuestContext): boolean {
  const g = q.game;
  let ok = true;
  if (q.flag('mq07-pepper-cheap') && !q.flag('mq07-silver-found')) {
    const s = spotOf(g, BAY, 'sacks');
    if (s) markAt(g, SACK, s.position, 'Malchus’s pepper sacks', 'Cut open');
    else ok = false;
  }
  if (q.vars.alone && !hasItem(q, NATIVITY) && !q.flag('mq07-saw-nativity')) {
    const s = spotOf(g, FLAT, 'table');
    if (s) markAt(g, TABLE_MARK, s.position, 'The Chaldaean’s table', 'Look');
    else ok = false;
  }
  if (q.stage === 'feast' && feastHours(hourOf(g)) && g.interiors?.current() === CAVE) ok = stageFeast(q) && ok;
  return ok;
}

function stageNow(q: QuestContext) {
  if (q.vars.staged === `${q.stage}:${feastHours(hourOf(q.game))}`) return;
  if (applyStaging(q)) q.vars.staged = `${q.stage}:${feastHours(hourOf(q.game))}`;
}

function restage(q: QuestContext) {
  q.vars.staged = '';
  stageNow(q);
}

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
        if (q.running) stageNow(q);
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
function unmask(q: QuestContext, id: 'mercator-piperis' | 'asclepiodotus' | 'mardonius', how: keyof typeof HOW, name: string, objectives: string[]) {
  for (const o of objectives) q.completeObjective(o);
  if (unmasked(q, id)) return;
  q.setFlag(`board:${id}`, true);
  q.setFlag(howFlag(id), HOW[how]);
  q.game.events.emit('ui:notify', { text: `Unmasked on the board: ${name}.`, kind: 'quest' });
  // Proven before Malchus was met (the ledger from his strongbox at night, say): on to `names`, which counts what is done.
  if (q.stage === 'lead') {
    q.setStage('names');
    return;
  }
  allThree(q);
}

/** All three proven: the feast. */
function allThree(q: QuestContext) {
  if (q.stage !== 'names') return;
  if (unmasked(q, 'mercator-piperis') && unmasked(q, 'asclepiodotus') && unmasked(q, 'mardonius')) q.setStage('feast');
}

/** Objectives that appear as the player learns things. */
function reveal(q: QuestContext) {
  if (q.stage !== 'names') return;
  if (q.flag('mq07-chaldaean-named')) q.reveal('chaldaean');
  if (hasItem(q, TABLE) || hasItem(q, NATIVITY)) q.reveal('cipher');
  if (q.flag('mq07-cave-known')) {
    q.completeObjective('lion');
    q.reveal('cave');
  }
}

// ------------------------------------------------------------------ the feast

/** Into the cave at night: the knife-men on the stair if Mardonius was warned, the Father's word. */
function feastArrive(q: QuestContext) {
  const g = q.game;
  if (q.stage !== 'feast' || q.flag('mq07-mardonius-fate') || !feastHours(hourOf(g))) return;
  restage(q);
  if (q.flag('mq05-told-mardonius') === true && !q.vars.knivesSpawned && !q.flag('mq07-knives-dead')) {
    KNIVES.forEach((id, i) => {
      const s = spotOf(g, CAVE, `stair-${i + 1}`);
      if (!s) return;
      spawnEnemyAt(g, 'grassator', s.position, { id, name: 'Hired knife', profile: AVITUS_KNIFE_PROFILE, quest: QUEST_ID, tags: [QUEST_ID, 'mardonius-knife'], aggro: 25 });
    });
    q.vars.knivesSpawned = true;
    say(g, 'Cassius Ursus', 'He’s sent men to my door. To the god’s door.', 5);
  } else if (!q.vars.feastSaid) {
    q.vars.feastSaid = true;
    say(g, 'Cassius Ursus', 'There. All three, at the end of the benches. Go on; we’re with you.', 5);
  }
  q.reveal('confront');
}

/** Mardonius draws: he fights the player, and yields when beaten (the yield panel decides). */
function draw(q: QuestContext) {
  const combat = q.game.combat as unknown as { engage?(a: string, o: object): boolean } | undefined;
  combat?.engage?.(MARDONIUS, { yieldAt: 0.3, name: 'Mardonius', quest: QUEST_ID, tags: [QUEST_ID] });
}

/** The player has decided: the other two are seized by the soldiers; on to the report. */
function decided(q: QuestContext, fate: 'taken' | 'father' | 'killed') {
  const g = q.game;
  if (q.flag('mq07-mardonius-fate')) return;
  q.setFlag('mq07-mardonius-fate', fate);
  q.completeObjective('confront');
  const line = fate === 'taken' ? 'Take him up to the street. The couriers can have him.' : fate === 'father' ? 'Leave him to us. The god’s house keeps its own accounts.' : 'It’s done. The god saw it.';
  say(g, 'Cassius Ursus', line, 5);
  setTimeout(() => say(g, 'Cassius Ursus', 'And these two: my men will walk them to the Caelian. Your Pudens will want the Chaldaean alive.', 5), 5200);
  // He's gone from the camp gate for good (NpcManager.isGone): in Pudens's cells, gone with the Father, or dead.
  q.setFlag(`gone:${MARDONIUS}`, true);
  if (fate !== 'killed') unstage(g, MARDONIUS);
  unstage(g, MALCHUS);
  unstage(g, CHALDAEAN);
  holdCast(g, CHALDAEAN, false);
  // The Chaldaean and Malchus are in Pudens's cells now: gone from the flat and the warehouse.
  q.setFlag(`gone:${CHALDAEAN}`, true);
  q.setFlag(`gone:${MALCHUS}`, true);
  q.setFlag('mq07-malchus-taken', true);
  q.setStage('report');
}

// ------------------------------------------------------------------ the quest

const lead: QuestStageDef = {
  journal:
    'Pudens sent me after the silver: the Pepper Warehouses on the Sacred Way, where Gratus asked questions a week before the arrow. Somewhere there is a man with Syrian rings who smells of pepper.',
  objectives: [{ id: 'find', text: 'Find the man with Syrian rings', target: { kind: 'npc', id: MALCHUS } }],
  onEnter: (q) => {
    ensurePoll(q);
    restage(q);
  },
};

const names: QuestStageDef = {
  journal:
    'Malchus son of Iarhai, of Palmyra: pepper by the shipload, silk by the bolt, and too pleased to see a stranger. His stars are read by a Chaldaean, and somebody he pays is called “the Lion”.',
  objectives: [
    { id: 'malchus', text: 'Prove what Malchus brings in under the pepper', target: { kind: 'npc', id: MALCHUS } },
    { id: 'chaldaean', text: 'Find the Chaldaean who reads Malchus’s stars', hidden: true, target: { kind: 'location', id: 'asclepiodotus-door' } },
    { id: 'cipher', text: 'Ask Gemellus to read the star table', hidden: true, target: { kind: 'npc', id: 'npc-gemellus' } },
    { id: 'lion', text: 'Find out who in the camp is “the Lion”', target: { kind: 'npc', id: 'npc-pudens' } },
    { id: 'cave', text: 'Ask the Father of the Mithras cave about his Lions', hidden: true, target: { kind: 'location', id: 'mithraeum-door' } },
  ],
  onEnter: (q) => {
    ensurePoll(q);
    q.completeObjective('find');
    // Proven before this stage (a save, or a quick player): count it now.
    if (unmasked(q, 'mercator-piperis')) q.completeObjective('malchus');
    if (unmasked(q, 'asclepiodotus')) {
      q.completeObjective('chaldaean');
      q.completeObjective('cipher');
    }
    if (unmasked(q, 'mardonius')) {
      q.completeObjective('lion');
      q.completeObjective('cave');
    }
    reveal(q);
    restage(q);
    allThree(q);
  },
};

const feast: QuestStageDef = {
  journal:
    'Malchus brings the silver in under his pepper, Asclepiodotus carries the orders as star tables, and Mardonius, the friendly courier at our gate, sold Festus’s road. All three meet at the night feasts of a Mithras cave under the Subura.',
  objectives: [
    { id: 'feast', text: 'Go down to the cave of Mithras at night', target: { kind: 'location', id: 'mithraeum-door' } },
    { id: 'confront', text: 'Face Mardonius', hidden: true, target: { kind: 'npc', id: MARDONIUS } },
  ],
  onEnter: (q) => {
    ensurePoll(q);
    restage(q);
    // Mardonius is at the cave from now on, not at the camp gate.
    if (!feastHours(hourOf(q.game))) hint(q.game, 'The feast is at night. Press T to wait until dark.');
  },
};

const report: QuestStageDef = {
  journal: 'It was over under the Subura. Pudens would want to hear it from me, at the Castra Peregrina: one of his own.',
  objectives: [{ id: 'report', text: 'Report to Pudens', target: { kind: 'npc', id: 'npc-pudens' } }],
  onEnter: (q) => {
    ensurePoll(q);
    unmark(q.game);
    if (!daytime(hourOf(q.game))) hint(q.game, 'Pudens sees visitors by day. Press T to wait until morning.');
  },
};

const done: QuestStageDef = {
  journal:
    'The Eastern Gold is broken: the silver, the stars and the leak. Pudens has the Chaldaean in his cells, and the road out of the city is still what they want. October is coming.',
  onEnter: (q) => {
    const g = q.game;
    unmark(g);
    unstage(g, MALCHUS);
    unstage(g, CHALDAEAN);
    stopPoll(g);
    const purse = ['pinarius-avitus', 'euhodus', 'hermogenes'].every((id) => q.flag(`board:${id}`) === true);
    g.events.emit('ui:banner', { kind: 'generic', label: 'Act II', title: 'The Eastern Gold is broken', subtitle: purse ? 'Two of four. Pudens wants three.' : 'One of four. Pudens wants three.', duration: 7 });
  },
  end: 'complete',
};

export default defineQuest({
  id: QUEST_ID,
  title: 'The Eastern Gold',
  latin: 'Aurum Parthicum',
  category: 'main',
  giver: 'npc-pudens',
  summary: 'Where the Parthian silver comes into Rome: a pepper merchant, a Chaldaean, and a courier of the camp.',
  stages: {
    start: lead,
    lead,
    names,
    feast,
    report,
    done,
  },
  on: {
    'dialogue:node': (q, e) => {
      const { dialogueId: d, nodeId: n } = e;
      if (d === 'npc-malchus' && n === 'mMet' && q.stage === 'lead') q.setStage('names');
      if (d === 'npc-asclepiodotus' && n === 'cAlone') {
        q.vars.alone = true;
        restage(q);
      }
      if (q.stage === 'names' || q.stage === 'lead') {
        if (d === 'npc-gemellus' && n === 'gmRead') unmask(q, 'asclepiodotus', 'cipher', 'Asclepiodotus', ['chaldaean', 'cipher']);
        if (d === 'npc-cassius-ursus' && n === 'uTells') unmask(q, 'mardonius', 'cave', 'Mardonius', ['lion', 'cave']);
      }
      if (d === 'npc-mardonius' && n === 'mdDraw' && q.stage === 'feast') draw(q);
      if (d === 'npc-pudens' && n === 'gDone' && q.stage === 'report') {
        q.completeObjective('report');
        q.setStage('done');
      }
      reveal(q);
    },
    'content:interact': (q, e) => {
      const g = q.game;
      if (e.id === SACK) {
        q.setFlag('mq07-silver-found', true);
        unmark(g, SACK);
        say(g, 'You', '(A hand’s depth under the pepper, your fingers find coin. Parthian drachms, the king’s face on every one.)', 6);
        unmask(q, 'mercator-piperis', 'pepper', 'Malchus son of Iarhai', ['malchus']);
      }
      if (e.id === TABLE_MARK) {
        unmark(g, TABLE_MARK);
        q.setFlag('mq07-saw-nativity', true);
        say(g, 'You', '(Caesar’s nativity, in a fine Greek hand. October is marked, and one word: “the departure”.)', 6);
        if (!hasItem(q, NATIVITY)) giveItem(q, NATIVITY);
      }
    },
    'item:added': (q, e) => {
      if (e.itemId === LEDGER) unmask(q, 'mercator-piperis', 'ledger', 'Malchus son of Iarhai', ['malchus']);
      if (e.itemId === LETTER) unmask(q, 'mardonius', 'letter', 'Mardonius', ['lion', 'cave']);
      reveal(q);
    },
    'interior:entered': (q, e) => {
      if (e.id === CAVE) {
        // (by day the cave is empty but for the Father: the feast is at night)
        if (q.stage === 'feast' && feastHours(hourOf(q.game))) {
          q.completeObjective('feast');
          feastArrive(q);
        }
      }
      restage(q);
    },
    'combat:yieldChoice': (q, e) => {
      if (base(e.actorId) !== MARDONIUS || q.stage !== 'feast') return;
      decided(q, e.choice === 'arrest' ? 'taken' : e.choice === 'kill' ? 'killed' : 'father');
    },
    'actor:killed': (q, e) => {
      const id = base(e.victimId);
      if (KNIVES.includes(id)) {
        q.vars.knivesKilled = Number(q.vars.knivesKilled ?? 0) + 1;
        if (Number(q.vars.knivesKilled) >= KNIVES.length) {
          q.setFlag('mq07-knives-dead', true);
          q.game.events.emit('ui:notify', { text: 'The knife-men are down. Mardonius is on the benches.', kind: 'quest' });
        }
      }
      if (id === MARDONIUS && q.stage === 'feast') decided(q, 'killed');
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
      if (q.stage === 'feast' && q.vars.knivesSpawned && !q.flag('mq07-knives-dead') && !KNIVES.some((id) => actorExists(g, id))) q.setFlag('mq07-knives-dead', true);
      reveal(q);
      restage(q);
    },
  },
  rewards: { denarii: 150, skillXp: ['rhetoric', 'locks-seals'] },
});
