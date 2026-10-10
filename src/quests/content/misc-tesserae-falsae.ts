/**
 * misc-tesserae-falsae "Forged Tokens" (docs/design/world-life.md §4.8 Q4; phase 2 side quest).
 * The grain dole at the Porticus Minucia was given by lead token (tessera frumentaria) [A/P]; the
 * forgery is invented [G].
 *
 * On a morning at the dole the freedman Eutychus is turned away with a token the curator says is
 * false. He paid six denarii for it "to a man with a lead-stained thumb who dices in the Subura".
 * The curator cannot be seen to ask, so he asks the player to find the mould.
 *
 *   start      (a notice read first) talk to Eutychus                                   → curator
 *   curator    tell the curator; he asks for the mould quietly                            → lucrio
 *   lucrio     find Lucrio at the dice table in the evening: persuade him (Rhetoric 40),
 *              stake him at tali, or follow him home                                      → yard | follow
 *   follow     follow Lucrio to his yard                                                  → yard
 *   yard       take the moulds (forma-tesserarum); theft if someone sees                  → choose
 *   choose     give them to the curator (20 den., Fama plebs +5; Lucrio is taken away), or
 *              sell them to Crispina the fence if she exists (30 den., Infamia +5; the
 *              false tokens are still about)                                              → done-curator | done-sold
 *
 * Offered by: the curator's notice on board-subura, a talk rumour and Eutychus himself (src/life/data
 * rumours/quests-g.ts). Never takes the tracker from a running main quest (QuestSystem.start).
 *
 * Flags: tess-scene (the scene at the dole was shown), tess-consent (Lucrio told where the moulds are:
 * taking them is no theft), tess-lucrio-taken, tokens-still-about (read by a rumour).
 */
import { between } from '../../content/hours';
import { placeExamine, release, removeExamine, say, walkTo } from '../../content/director';
import { giveItem, hasItem, takeItem } from '../../content/questkit';
import { STATIONS, stationAnchor, stationPoint } from '../../npc/crowd/stations';
import type { LocationDef } from '../../npc/types';
import type { ItemDef } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-tesserae-falsae';
export const MOULDS = 'forma-tesserarum';
const CURATOR = 'keeper-minucia-curator';
const LUCRIO = 'npc-lucrio-plumbarius';
const EUTYCHUS = 'npc-eutychus-libertus';
/** The fence of the Subura, if the QUESTS I crew's keeper exists (optional). */
export const CRISPINA = 'keeper-subura-receptatrix';
/** Her line is content only when she exists (src/dialogue/content/misc-life-g.ts), so it is named by constant. */
const FENCE_DIALOGUE = 'dlg-tess-crispina';
const FENCE_SELLS = 'sSell';

// ------------------------------------------------------------------ places

/** A point `out` m in front of and `side` m to the right of a station's anchor. */
function post(stationId: string, out: number, side: number): { x: number; z: number } {
  const def = STATIONS.find((s) => s.id === stationId);
  const a = def && stationAnchor(def);
  if (!a) throw new Error(`[quests-g] no station ${stationId}`);
  return stationPoint(a, out, side);
}

/** The Argiletum, 82% along: the lead-workers' row, a little past the dice table. */
function yardPoint(): { x: number; z: number } {
  const a = stationAnchor({ id: 'tess-yard-anchor', lane: 'argiletum', at: 0.86, when: [], members: [] });
  if (!a) throw new Error('[quests-g] no Argiletum lane');
  return stationPoint(a, 3.5, 0);
}

export const locations: LocationDef[] = (() => {
  const dole = post('st-minucia-frumentatio', 2.4, 4.2);
  const dice = post('st-subura-alea', -3.4, 2.4);
  const yard = yardPoint();
  return [
    { id: 'minucia-dole', name: 'The Grain Dole', latin: 'frumentatio', position: dole, radius: 14, mapMarker: 'market' as const, discoverable: false },
    { id: 'lucrio-dice', name: 'The Dice Table in the Subura', position: dice, radius: 5, discoverable: false },
    { id: 'lucrio-yard', name: 'The Lead-worker’s Yard', position: yard, radius: 5, discoverable: false },
  ];
})();

// ------------------------------------------------------------------ items

export const items: ItemDef[] = [
  {
    id: MOULDS, name: 'Moulds for Dole Tokens', latin: 'formae tesserarum', type: 'quest', questItem: true, weight: 0, value: 0, icon: '◫',
    description: 'Two halves of a baked-clay mould, still grey with lead. Pour a little metal in, press, and out comes a grain token with the curator’s mark half gone.',
    tags: ['evidence', 'forgery'],
  },
  {
    id: 'tessera-falsa', name: 'False Grain Token', latin: 'tessera falsa', type: 'quest', questItem: true, weight: 0, value: 0, icon: '◆',
    description: 'A lead token for the dole, a little too soft, the mark on it smeared. Eutychus paid six denarii for it.',
    tags: ['evidence'],
  },
];

// ------------------------------------------------------------------ helpers

const done = (q: QuestContext, id: string) => !!q.quest(id)?.done;

/** The yard's examine point, put out while the moulds are still there. */
function placeYard(q: QuestContext) {
  placeExamine(q.game, { id: 'tess-moulds', at: 'lucrio-yard', verb: 'Search', label: 'Lead-worker’s yard', height: 0.9, reach: 3 });
}

/** The scene at the dole: Eutychus turned away with a lead token (subtitles, a line at a time). */
function doleScene(q: QuestContext) {
  const lines: [string, string][] = [
    ['Curator of the dole', 'Hold it to the light, freedman. Lead, and bad lead: the mark is half gone. This is not one of mine.'],
    ['Eutychus', 'I paid six denarii for it! Six! A man in the Subura swore it was good!'],
    ['Curator of the dole', 'Then you were robbed twice. Step aside. Next!'],
  ];
  lines.forEach(([who, text], i) => {
    if (typeof setTimeout === 'function' && i) setTimeout(() => say(q.game, who, text, 4), i * 3600);
    else say(q.game, who, text, 4);
  });
}

/** Keep a named NPC out of the world (the population module's holdNamed; a no-op without it). */
function hold(q: QuestContext, id: string) {
  // Deliberately unguarded and the release is dropped: the hold is permanent, and a load may have rebuilt
  // the population, so it is taken again on every save:loaded. Repeat holds of one id only stack harmlessly.
  q.game.population?.holdNamed?.(id);
}

/** Lucrio is taken away: out of the world, and kept out through a reload (the trigger below). */
function takeLucrio(q: QuestContext) {
  q.setFlag('tess-lucrio-taken', true);
  hold(q, LUCRIO);
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Forged Tokens',
  latin: 'Tesserae Falsae',
  category: 'misc',
  giver: CURATOR,
  summary: 'Someone is selling false lead tokens for the grain dole. The curator would like the mould found, quietly.',
  // Deliberate deviation from the design: repeatable keeps the triggers live after the end, so they keep
  // Lucrio out of the world once he has been taken away (holdNamed is not saved). Nothing restarts the quest.
  repeatable: true,
  stages: {
    start: {
      journal: 'I read the curator’s notice on the vicus board: tokens bought from anyone but the curator are false, and will be broken. A freedman called Eutychus had been turned away from the dole that morning with one.',
      objectives: [{ id: 'eutychus', text: 'Speak to Eutychus the freedman at the grain dole', target: { kind: 'npc', id: EUTYCHUS } }],
      next: 'curator',
    },
    curator: {
      journal: 'Eutychus had paid six denarii for his token to a man with a lead-stained thumb who dices in the Subura after dark. They call him Lucrio. The curator of the dole turned him away without a hearing, but I thought he would want to know.',
      objectives: [{ id: 'curator', text: 'Tell the curator of the dole (mornings, at the Porticus Minucia)', target: { kind: 'npc', id: CURATOR } }],
      next: 'lucrio',
    },
    lucrio: {
      journal: 'The curator could not be seen to ask, so he asked me, quietly: find the mould, and bring it to him. Twenty denarii and the thanks of every citizen who ever queued for grain.',
      objectives: [{ id: 'find', text: 'Find Lucrio at the dice table in the Subura (evenings)', target: { kind: 'npc', id: LUCRIO } }],
    },
    follow: {
      journal: 'I said nothing and watched him throw. When his lamp burned low he pocketed the dice and got up, and I went after him.',
      objectives: [{ id: 'follow', text: 'Follow Lucrio home', target: { kind: 'npc', id: LUCRIO } }],
      onEnter: (q) => {
        // He walks to his yard; with nobody to walk, the way there is enough.
        if (!walkTo(q.game, LUCRIO, 'lucrio-yard', 1.5)) q.setFlag('tess-follow-fallback', true);
      },
      next: 'yard',
    },
    yard: {
      journal: 'The moulds were in the lead-workers’ yard, under a heap of lead pigs, wrapped in a sack.',
      objectives: [{ id: 'moulds', text: 'Search the lead-worker’s yard for the moulds', target: { kind: 'location', id: 'lucrio-yard' } }],
      onEnter: (q) => {
        release(q.game, LUCRIO);
        placeYard(q);
      },
      next: 'choose',
    },
    choose: {
      journal: 'I had both halves of the mould in my bag, grey with lead. The curator would pay twenty denarii and break them. Anyone with a bad conscience and a back room would pay more.',
      objectives: [{ id: 'decide', text: 'Decide who gets the moulds', target: { kind: 'npc', id: CURATOR } }],
      onEnter: () => removeExamine('tess-moulds'),
    },
    'done-curator': {
      journal: 'I gave the moulds to the curator. He broke them on the step with a mallet, one half and then the other, and had Lucrio taken away from the dice before the next watch. The dole will be clean for a month, he said. I did not ask about the month after.',
      onEnter: (q) => {
        takeItem(q, MOULDS);
        takeLucrio(q);
        q.giveReward({ denarii: 20, reputation: [{ faction: 'plebs', amount: 5 }], skills: [{ id: 'rhetoric', amount: 8 }] });
      },
      end: 'complete',
    },
    'done-sold': {
      journal: 'I sold the moulds to Crispina for thirty denarii, no questions on either side. The dole’s lead tokens are still going about the city, I hear, and some of them are mine.',
      onEnter: (q) => {
        takeItem(q, MOULDS);
        q.setFlag('tokens-still-about', true);
        q.game.standing?.addInfamia(5);
        q.giveReward({ denarii: 30 });
      },
      end: 'complete',
    },
  },
  triggers: {
    // The scene at the dole, the first morning the player is near after the opening night.
    'location:entered': (q, e) => {
      if (e.locationId !== 'minucia-dole' || q.done || q.flag('tess-scene')) return;
      const h = q.game.time?.hour ?? 12;
      if (!done(q, 'mq-01-madida-capena') || !between(h, 'h3', 'h6')) return;
      q.setFlag('tess-scene', true);
      doleScene(q);
    },
    'dialogue:node': (q, e) => {
      // Eutychus tells his story and the player takes it up.
      if (e.dialogueId === 'dlg-tess-eutychus' && e.nodeId === 'eAccept' && !q.done) q.start('curator');
      // The curator, spoken to first by someone who knows (a notice) is handled while running.
    },
    // Lucrio stays gone after a reload.
    'save:loaded': (q) => {
      if (q.flag('tess-lucrio-taken')) hold(q, LUCRIO);
    },
  },
  on: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'dlg-tess-eutychus' && e.nodeId === 'eAccept' && q.stage === 'start') q.completeObjective('eutychus');
      if (e.dialogueId === 'dlg-tess-curator' && e.nodeId === 'cAccept' && q.stage === 'curator') q.completeObjective('curator');
      if (e.dialogueId === 'dlg-tess-lucrio' && q.stage === 'lucrio') {
        // Persuaded or beaten at the table: he tells where the moulds are, and it is no theft.
        if (e.nodeId === 'lPersuaded' || e.nodeId === 'lStakeWin') {
          q.setFlag('tess-consent', true);
          q.completeObjective('find');
          q.setStage('yard');
        }
        if (e.nodeId === 'lFollow') {
          q.completeObjective('find');
          q.setStage('follow');
        }
      }
      if (e.dialogueId === 'dlg-tess-curator' && e.nodeId === 'cGive' && q.stage === 'choose') {
        q.completeObjective('decide');
        q.setStage('done-curator');
      }
      if (e.dialogueId === FENCE_DIALOGUE && e.nodeId === FENCE_SELLS && q.stage === 'choose') {
        q.completeObjective('decide');
        q.setStage('done-sold');
      }
    },
    'location:entered': (q, e) => {
      if (e.locationId === 'lucrio-yard' && q.stage === 'follow') q.completeObjective('follow');
    },
    // The examine point in the yard: the moulds, and a theft if someone sees (unless Lucrio said where they were).
    'content:interact': (q, e) => {
      if (e.id !== 'tess-moulds' || q.stage !== 'yard') return;
      giveItem(q, MOULDS);
      if (!q.flag('tess-consent')) {
        const seen = q.game.population?.witnesses(q.game.player.position, 20) ?? [];
        if (seen.length) q.game.crime?.commit('furtum', { witnessed: seen, value: 4 });
      }
      q.completeObjective('moulds');
    },
    // Killed at the table, Lucrio still leaves a way to his yard.
    'actor:killed': (q, e) => {
      if (e.victimId === LUCRIO && (q.stage === 'lucrio' || q.stage === 'follow')) {
        q.notify('Among his things: a pass-key and the address of a yard behind the lead-workers’ row.');
        q.completeObjective(q.stage === 'lucrio' ? 'find' : 'follow');
        if (q.stage === 'lucrio') q.setStage('yard');
      }
    },
    'save:loaded': (q) => {
      if (q.stage === 'yard' && !hasItem(q, MOULDS)) placeYard(q);
    },
  },
});
