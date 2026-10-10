/**
 * misc-servus-aesculapii "Free by the God's Hand" (docs/design/world-life.md §4.8 Q6; GDD §14.11).
 * Claudius ruled that a slave abandoned in the temple of Aesculapius on the Tiber Island because he
 * was sick was free if he recovered, and that a master who killed such a slave answered for murder
 * (Suetonius, Claudius 25.2 [A]). The case is invented [G]; the player helps a man win his freedom.
 *
 * Daos, an old Syrian cook, was left on the island when he fell sick. He lived. Now his master's
 * steward wants him back, and will be on the Pons Fabricius at the third hour to collect him.
 *
 *   start    (a notice read first) find Daos on the Tiber Island                           → proofs
 *   proofs   gather two of three proofs: the temple attendant's memory of him being brought in,
 *            a fellow patient who saw the master's men leave him, the carter who brought him → bridge
 *   bridge   at the third hour face the steward: persuade him (Rhetoric 55, -15 for each proof),
 *            bribe him (10 den.), or fight his two men with fists                           → report | fight
 *   fight    knock out or make yield his two men (fists; steel fails the quest)             → report
 *   report   tell Daos he is free: his Syrian amulet (amuletum-syrium), Pietas +5, Fama plebs +3
 *
 * Offered by: a talk rumour and a notice on board-ceres (src/life/data/rumours/quests-g.ts), and by Daos.
 * Never takes the tracker from a running main quest.
 */
import { between } from '../../content/hours';
import { fight, say, stage, unstage } from '../../content/director';
import { addFoe, beatFoe, isPlayer } from '../../content/questkit';
import { atReal } from '../../content/places';
import type { LocationDef } from '../../npc/types';
import type { ItemDef } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-servus-aesculapii';
export const AMULET = 'amuletum-syrium';
export const DAOS = 'npc-daos';
export const STEWARD = 'npc-stichus-actor';
export const MEN = ['npc-daos-man-a', 'npc-daos-man-b'] as const;
const WITNESSES = ['attendant', 'patient', 'carter'] as const;
type Witness = (typeof WITNESSES)[number];

// ------------------------------------------------------------------ places and items

export const locations: LocationDef[] = [
  // The island (the builder's spots of the temple of Aesculapius, world-space, read from the built landmark):
  // Daos on a bench by the well, the attendant between the altar and the porch, the patients in the sleeping porch.
  { id: 'island-daos', name: 'Daos’ Bench on the Island', position: { x: -308.7, y: 6.6, z: 142.1 }, radius: 7, discoverable: false },
  { id: 'island-attendant', name: 'The Temple Attendant’s Post', position: { x: -325.5, y: 6.6, z: 135 }, radius: 6, discoverable: false },
  { id: 'island-patients', name: 'The Sleeping Porch', position: { x: -314.5, y: 6.6, z: 134.3 }, radius: 6, discoverable: false },
  // The Pons Fabricius (atlas pons-fabricius, a → b, 62 m): centred between the Campus bridgehead and the crown of the deck.
  { id: 'pons-fabricius', name: 'Fabrician Bridge', latin: 'Pons Fabricius', position: { x: -299.9, y: 6.5, z: 90.3 }, radius: 20, mapMarker: 'bridge' as const, discoverable: false },
  // The carter waits on the road to the bridgehead, on the Campus side (atlas street-pons-fabricius).
  { id: 'carter-bridgehead', name: 'The Carters’ Stand at the Bridge', position: atReal(-496, 112, 11), radius: 6, discoverable: false },
];

/** Where Stichus and his men wait: the Campus foot of the bridge, on solid ground (ground 6.4 m). */
const BRIDGEHEAD = { x: -294, z: 79.8 };

export const items: ItemDef[] = [
  {
    id: AMULET, name: 'Daos’ Syrian Amulet', latin: 'amuletum Syrium', type: 'misc', slot: 'neck', weight: 0.05, value: 0, questItem: true, icon: '◎', equipFlags: ['amulet'],
    description: 'A little disc of black stone on a cord, cut with a many-rayed god of the Orontes whom Daos calls only “the Lord”. He wore it through the fever. Worn, it turns aside a bad omen and a curse tablet.',
    tags: ['amulet'],
  },
];

// ------------------------------------------------------------------ helpers

const proofsOf = (q: QuestContext): string[] => {
  const v = q.vars.proofs;
  return typeof v === 'string' && v ? v.split(',') : [];
};

/** A witness agrees to speak; the second moves the quest on, a third eases the steward's persuasion. */
function addProof(q: QuestContext, who: Witness) {
  const have = proofsOf(q);
  if (have.includes(who)) return;
  have.push(who);
  q.vars.proofs = have.join(',');
  q.setFlag('daos-proofs', have.length);
  if (q.stage === 'proofs') q.progress('proofs');
  else if (have.length >= 3) q.completeObjective('more');
}

/** Third hour to about the fifth: the steward is on the bridge. */
const bridgeHours = (q: QuestContext) => between(q.game.time?.hour ?? 12, 'h3', 'h5');

function stageSteward(q: QuestContext) {
  const heading = Math.PI * 0.85;
  stage(q.game, STEWARD, { x: BRIDGEHEAD.x, z: BRIDGEHEAD.z }, heading, 'stand');
  MEN.forEach((id, i) => stage(q.game, id, { x: BRIDGEHEAD.x + (i ? 1.6 : -1.6), z: BRIDGEHEAD.z + 1.2 }, heading, 'stand'));
}

function clearSteward(q: QuestContext) {
  for (const id of [STEWARD, ...MEN]) unstage(q.game, id);
}

/** Steward and men are down to the quest: the player fists them, or is beaten. */
function startBrawl(q: QuestContext) {
  say(q.game, 'Stichus', 'Take him, then! Break his teeth if you must; the master pays for teeth!');
  const game = q.game as { combat?: { core?: { setHostile(a: string, b: string): void } } };
  game.combat?.core?.setHostile('daos-men', 'player');
  let spawned = 0;
  MEN.forEach((id, i) => {
    const f = fight(q.game, id, 'collegium-bruiser', 'pons-fabricius', { brawl: true, team: 'daos-men', tags: [QUEST_ID], quest: QUEST_ID }, { x: i ? 2 : -2, z: 3 });
    addFoe(q, 'foes', f);
    if (f) spawned++;
  });
  if (!spawned) {
    // No combat module in this build: two punches and they sit down hard.
    q.notify('A few punches, and the steward’s two men sit down hard in the road.');
    q.progress('ko', 2);
  }
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Free by the God’s Hand',
  latin: 'Servus Aesculapii',
  category: 'misc',
  giver: DAOS,
  summary: 'A sick slave was left on the Tiber Island to die. He got up. His master’s steward wants him back.',
  stages: {
    start: {
      journal: 'A notice at the Temple of Ceres said that a slave left at the temple of Aesculapius on the Tiber Island to die had recovered, and that by the edict of the deified Claudius he was free. Somebody had better tell his master’s steward that. The notice said where to find him.',
      objectives: [{ id: 'daos', text: 'Find Daos on the Tiber Island, by the temple of Aesculapius', target: { kind: 'npc', id: DAOS } }],
      next: 'proofs',
    },
    proofs: {
      journal: 'Daos was an old Syrian cook. His master’s household left him on the island when the fever took him, with a purse for the god’s fee and not a word after. He lived. Now the steward, Stichus, would come to the Fabrician Bridge at the third hour to take him back. By Claudius’s edict a slave left to die at the god’s house is free if he recovers, but an edict needs witnesses. I needed two of three: the temple attendant, a fellow patient, and the carter who brought him.',
      objectives: [
        { id: 'proofs', text: 'Gather two witnesses: the temple attendant, a fellow patient, the carter at the bridge', count: 2, target: { kind: 'location', id: 'island-attendant' } },
      ],
      next: 'bridge',
    },
    bridge: {
      journal: 'I had two witnesses’ word. At the third hour the steward would be on the Fabrician Bridge with two men to collect Daos.',
      objectives: [
        { id: 'face', text: 'Face the steward on the Fabrician Bridge at the third hour (about 07:15 to 09:30)', target: { kind: 'location', id: 'pons-fabricius' } },
        { id: 'more', text: 'A third witness would make him easier to persuade', optional: true, target: { kind: 'location', id: 'island-patients' } },
      ],
      onEnter: (q) => {
        if (proofsOf(q).length >= 3) q.completeObjective('more');
        if (bridgeHours(q)) stageSteward(q);
      },
    },
    fight: {
      journal: 'The steward had a better answer than any edict: two large men. I put my hand to my belt and then took it away again. Fists, then. Nobody dies for a cook.',
      objectives: [{ id: 'ko', text: 'Knock out or make yield the steward’s two men (fists)', count: 2, target: { kind: 'location', id: 'pons-fabricius' } }],
      onEnter: (q) => startBrawl(q),
      next: 'report',
    },
    report: {
      journal: 'Stichus gave way. Daos belongs to nobody but himself, and to the god. All that was left was to tell him.',
      objectives: [{ id: 'free', text: 'Tell Daos he is free', target: { kind: 'npc', id: DAOS } }],
      onEnter: (q) => {
        clearSteward(q);
      },
    },
    done: {
      journal: 'Daos wept, which embarrassed us both, and then he took the little black stone off his neck and put it in my hand. “For the road,” he said. “The Lord keeps what he is given.” I wear it on a cord. He was cooking again, he said, but for himself.',
      onEnter: (q) => {
        q.game.devotion?.gainPietas(5);
        q.giveReward({ items: [{ id: AMULET }], reputation: [{ faction: 'plebs', amount: 3 }], skills: [{ id: 'rhetoric', amount: 10 }] });
      },
      end: 'complete',
    },
    fail: {
      journal: 'Steel on the Fabrician Bridge, and a man down who should not have been. The steward took Daos by the arm while I was still explaining. The god’s house cannot protect a man from a crime in the road.',
      onEnter: (q) => clearSteward(q),
      end: 'fail',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'dlg-daos' && e.nodeId === 'dAccept') q.start('proofs');
    },
  },
  on: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'dlg-daos') {
        if (e.nodeId === 'dAccept' && q.stage === 'start') q.completeObjective('daos');
        if (e.nodeId === 'dFree' && q.stage === 'report') {
          q.completeObjective('free');
          q.setStage('done');
        }
      }
      if (e.dialogueId === 'dlg-daos-witnesses') {
        if (e.nodeId === 'aProof') addProof(q, 'attendant');
        if (e.nodeId === 'pProof') addProof(q, 'patient');
        if (e.nodeId === 'cProof') addProof(q, 'carter');
      }
      if (e.dialogueId === 'dlg-daos-steward' && q.stage === 'bridge') {
        const way: Record<string, [string, string]> = { sPersuaded: ['persuaded', 'report'], sBribed: ['bribed', 'report'], sFight: ['fought', 'fight'] };
        const w = way[e.nodeId];
        if (w) {
          q.setFlag('daos-method', w[0]);
          q.completeObjective('face');
          q.setStage(w[1]);
        }
      }
    },
    'location:entered': (q, e) => {
      if (e.locationId === 'pons-fabricius' && q.stage === 'bridge' && bridgeHours(q)) stageSteward(q);
    },
    // He keeps the hour wherever the player is: the people placer brings him to the bridge when they come near.
    'time:hour': (q) => {
      if (q.stage !== 'bridge') return;
      if (bridgeHours(q)) stageSteward(q);
      else clearSteward(q);
    },
    'actor:killed': (q, e) => {
      if (isPlayer(e.victimId)) {
        // Beaten senseless on the bridge: they leave you in the road; come back another day.
        if (q.stage === 'fight') {
          q.notify('They left you lying in the road. The steward will be back at the third hour.');
          q.setStage('bridge');
        }
        return;
      }
      if ([DAOS, STEWARD].includes(e.victimId) && ['bridge', 'fight', 'report'].includes(q.stage)) return q.setStage('fail');
      if (q.stage !== 'fight') return;
      if (beatFoe(q, 'foes', e.victimId, MEN)) {
        // Fists always knock out; a death here means steel was drawn.
        if (e.tags?.includes('dead')) return q.setStage('fail');
        q.progress('ko');
      }
    },
    'actor:yielded': (q, e) => {
      if (q.stage !== 'fight') return;
      if (isPlayer(e.actorId)) {
        const inv = q.game.player?.inventory;
        if (inv) inv.spendDenarii(Math.round(inv.denarii * 0.1 * 16) / 16);
        q.notify('They left you lying in the road. The steward will be back at the third hour.');
        return q.setStage('bridge');
      }
      if (beatFoe(q, 'foes', e.actorId, MEN)) q.progress('ko');
    },
    'crime:committed': (q, e) => {
      if (q.stage === 'fight' && (e.crime === 'homicidium' || e.crime === 'caedes-supplicis')) q.setStage('fail');
    },
    'save:loaded': (q) => {
      if (q.stage === 'bridge' && bridgeHours(q)) stageSteward(q);
    },
  },
});
