/**
 * mq-02-tabella "The Sealed Tablet" (docs/STORY.md chapter 2; GDD §10.3 #2, §17.2 steps 3 and 5).
 * Main quest: carry the dead courier's tablet to his centurion, find his killer, deliver at dusk.
 * It is the short form of mq-02-carcer (the arrest comes in a later version).
 *
 *   start    take the tablet to the strongrooms under the Temple of Castor (ask the keeper)  → gratus
 *   gratus   Gratus hears how Festus died                                                   → ludus
 *   ludus    "a curved blade, up from under: a thraex". Ask Glaucus at the Ludus Magnus      → mus
 *   mus      Glaucus names Dizas, the Mouse: deal with him in the burned taberna             → satchel
 *   satchel  take Festus' satchel back from Mus' strongbox                                   → dusk
 *   dusk     bring Gratus the tablet after sunset                                            → done
 *   done     Festus wrote in a cipher only his twin can read; the Lemuria night (mq-03)
 *
 * Hooks (node ids and flags): npc-chrysippus 'fetch', npc-gratus 'gratusDay' / 'delivered',
 * npc-glaucus 'named' (flag 'clue-mus'; Auctus 'mus' and the street gossip set it too), npc-mus
 * 'surrender' / 'tellAll' / 'dialogue:attack', the item 'quest-sacculum-festi'. Gratus keeps the
 * strongrooms from the first hour through the night while the story needs him there.
 */
import { fight, hint, isDusk, placeExamine, removeExamine, say, spawnEnemy } from '../../content/director';
import { MUS_PROFILE } from '../../content/profiles';
import { addFoe, beatFoe } from '../../content/questkit';
import { Rng } from '../../core/Rng';
import { rollLoot } from '../../rpg/loot';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'mq-02-tabella';
const MUS = ['npc-mus', 'npc-mus~foe'];
const KNIFEMEN = ['mq02-knife-a', 'mq02-knife-b'] as const;

const BODY = { id: 'festus-body', at: 'courier-ambush', verb: 'Search', label: 'Festus’ body', height: 0.5, offset: { x: -1.5 } };

function searchBody(q: QuestContext) {
  if (q.isObjectiveDone('search')) return;
  removeExamine(BODY.id);
  const loot = rollLoot('body.npc-festus', 1, q.game.rng?.fork('body') ?? new Rng('body'));
  const inv = q.game.player?.inventory;
  for (const it of loot.items) inv?.add(it.id, it.count, { source: 'quest' });
  if (loot.denarii) inv?.addDenarii(loot.denarii);
  q.completeObjective('search');
}

function musFate(q: QuestContext, fate: 'killed' | 'spared' | 'fled', speak = true) {
  if (q.flag('mus-fate')) return;
  q.setFlag('mus-fate', fate);
  // His strongbox key: thrown at you by a beaten man, or taken from a dead one's belt.
  const inv = q.game.player?.inventory;
  if (inv && !inv.count('clavis-cellae-muris')) {
    // Only said when the player chose to spare him in the fight (not when he was left behind).
    if (fate === 'spared' && speak) say(q.game, 'Mus', 'Enough! The key, take the key! The bag’s in the box in the corner. Just let me go.');
    if (fate !== 'fled') {
      inv.add('clavis-cellae-muris', 1, { source: 'quest' });
      if (fate === 'killed') q.notify('You take a key from Mus’ belt.');
    }
  }
  q.completeObjective('hideout');
}

/**
 * Is the fighter `id` still yielded? CombatCore.releaseYielded (he got up on his own, after the
 * player wandered off or stood over him for too long) emits no event, so the live status is asked
 * for. With no combat service to ask (tests, a bare world), the yield flag is trusted.
 */
function stillYielded(q: QuestContext, id: string): boolean {
  const core = (q.game as unknown as { combat?: { core?: { get(id: string): { status?: string } | undefined } } }).combat?.core;
  if (!core) return true;
  return core.get(id)?.status === 'yielded';
}

function hasSatchel(q: QuestContext): boolean {
  return !!q.game.player?.inventory?.count('quest-sacculum-festi');
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Sealed Tablet',
  latin: 'Tabella Signata',
  category: 'main',
  giver: 'npc-festus',
  summary: 'Carry the dead courier’s sealed tablet to his centurion, Gratus, under the Temple of Castor, and find the man who killed him.',
  stages: {
    start: {
      journal: 'Festus’ tablet was in my belt. His centurion, Gratus, keeps an office in the strongrooms under the Temple of Castor, in the Forum: up the valley of the Circus, under the palace, then through the Velabrum and along the Vicus Tuscus.',
      objectives: [
        { id: 'castor', text: 'Ask for Gratus at the strongrooms under the Temple of Castor, in the Forum', target: { kind: 'npc', id: 'npc-chrysippus' } },
        { id: 'search', text: 'Search Festus’ body', optional: true, target: { kind: 'location', id: 'courier-ambush' } },
      ],
      onEnter: (q) => {
        placeExamine(q.game, BODY);
        hint(q.game, 'Follow the gold marker to the Forum. J opens your journal, M the map.');
      },
      next: 'gratus',
    },
    gratus: {
      journal: 'The keeper of the strongrooms, Chrysippus, keeps his clients’ names to himself. But he knew the couriers’ seal on Festus’ tablet, a horseman with a raised spear, and he went into the back for Gratus.',
      objectives: [{ id: 'talk', text: 'Tell Gratus how Festus died', target: { kind: 'npc', id: 'npc-gratus' } }],
      onEnter: (q) => removeExamine(BODY.id),
      next: 'ludus',
    },
    ludus: {
      journal: 'Gratus is a centurion of the frumentarii, Caesar’s couriers. Only their own camp knew Festus’ road and his hour, so someone in the camp sold him. Gratus would not take the tablet in the Forum by daylight, where anyone might see: I was to keep it until after sunset. Meanwhile he wanted the killer’s name. A curved blade, a stroke up from under: that is how a thraex finishes a man. The Ludus Magnus trains the thraeces, and its chief trainer, Glaucus, knows them all.',
      objectives: [{ id: 'ask', text: 'Ask Glaucus at the Ludus Magnus who fights with a curved blade', target: { kind: 'npc', id: 'npc-glaucus' } }],
      onEnter: (q) => {
        if (q.flag('clue-mus')) q.completeObjective('ask');
      },
      next: 'mus',
    },
    mus: {
      journal: 'Glaucus knew the stroke at once. Dizas, called the Mouse: a thraex of his until last winter, when he was thrown out for stealing from the infirmary. Now he runs knife-men out of a burned taberna off the Vicus Tuscus.',
      objectives: [{ id: 'hideout', text: 'Find Mus in the burned taberna off the Vicus Tuscus', target: { kind: 'npc', id: 'npc-mus' } }],
      onEnter: (q) => {
        if (q.flag('mus-fate')) q.completeObjective('hideout');
      },
      next: 'satchel',
    },
    satchel: {
      journal: 'Mus was dealt with. Festus’ satchel would be in his strongbox, in the corner of the burned taberna, and his key would open it.',
      objectives: [{ id: 'satchel', text: 'Open Mus’ strongbox with his key and take Festus’ satchel', target: { kind: 'location', id: 'taberna-collapsa' } }],
      onEnter: (q) => {
        if (hasSatchel(q)) q.completeObjective('satchel');
        else hint(q.game, 'Mus’ key opens his strongbox. Look for it in the corner of the burned taberna.');
      },
      next: 'dusk',
    },
    dusk: {
      journal: 'I had Festus’ satchel. In it, under a scraped wax tablet, was a silver coin with a bearded king in a tiara: Parthian money. Gratus had said to come back after sunset, when the Forum was empty.',
      objectives: [{ id: 'give', text: 'Give Gratus the tablet after sunset, at the strongrooms of Castor', target: { kind: 'npc', id: 'npc-gratus' } }],
      onEnter: (q) => {
        if (!isDusk(q.game)) hint(q.game, 'The sun sets a little after 19:00. Press T to wait.');
      },
      next: 'done',
    },
    done: {
      journal: 'Gratus broke the seal by lamplight and swore softly. The tablet was written in Festus’ own cipher, and only his twin brother, Gemellus, could read it. Gemellus had not been seen since the Ides of April. It was the night of the Lemuria, when the dead walk and families throw black beans to send them away. Festus’ family would be up at midnight, and I had promised him I would tell his mother.',
      onEnter: (q) => {
        q.setFlag('mq02-delivered', true);
        if (q.flag('mus-fate') === 'spared') q.setFlag('mus-informant', true);
      },
      end: 'complete',
    },
  },
  triggers: {
    'quest:completed': (q, e) => {
      if (e.questId === 'mq-01-madida-capena') q.start();
    },
  },
  on: {
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-chrysippus' && e.nodeId === 'fetch') q.completeObjective('castor');
      if (e.dialogueId === 'npc-gratus' && e.nodeId === 'gratusDay') q.completeObjective('talk');
      if (e.dialogueId === 'npc-gratus' && e.nodeId === 'delivered') q.completeObjective('give');
      if (e.dialogueId === 'npc-mus' && (e.nodeId === 'surrender' || e.nodeId === 'tellAll')) musFate(q, 'fled');
    },
    'flag:changed': (q, e) => {
      if (e.name === 'clue-mus' && e.value === true && q.stage === 'ludus') q.completeObjective('ask');
    },
    // The fight in the burned taberna: Mus and two knife-men.
    'dialogue:attack': (q, e) => {
      if (e.npcId !== 'npc-mus' || q.flag('mus-fate')) return;
      addFoe(q, 'musfoes', fight(q.game, 'npc-mus', 'grassator', 'taberna-collapsa', { quest: QUEST_ID, tags: [QUEST_ID, 'mus'], name: 'Mus · the Mouse', yieldAt: 0.2, profile: MUS_PROFILE }));
      KNIFEMEN.forEach((id, i) => addFoe(q, 'musfoes', spawnEnemy(q.game, 'grassator', 'taberna-collapsa', { id, name: 'Knife-man', tags: [QUEST_ID, 'mus'], quest: QUEST_ID }, { x: i ? 3 : -3, z: 2 })));
    },
    'actor:killed': (q, e) => {
      if (MUS.includes(e.victimId)) musFate(q, 'killed');
      beatFoe(q, 'musfoes', e.victimId, KNIFEMEN);
    },
    'actor:yielded': (q, e) => {
      // Mus yields at 20% (GDD §6.9). Provisional: nothing is decided until the player chooses
      // (combat:yieldChoice), kills him, or walks out of the hideout (location:exited below).
      if (MUS.includes(e.actorId) && !q.flag('mus-fate')) {
        q.vars.musYielded = true;
        q.vars.musYieldedId = e.actorId;
      }
    },
    'combat:yieldChoice': (q, e) => {
      if (!MUS.includes(e.actorId)) return;
      if (e.choice === 'kill') musFate(q, 'killed');
      else musFate(q, 'spared');
    },
    'location:exited': (q, e) => {
      // Leaving his corner, or the taberna, with him yielded and undecided: he is spared. Walking out
      // of the corner into the taberna counts too; the taberna itself counts only once the player is out of it.
      if (e.locationId !== 'taberna-collapsa' && e.locationId !== 'mus-latebra') return;
      if (!q.vars.musYielded || q.flag('mus-fate')) return;
      // Got up again (released by the combat module) before the player left: not spared.
      if (!stillYielded(q, String(q.vars.musYieldedId))) return;
      const inTaberna = !!q.game.locations?.isInside?.('taberna-collapsa');
      if (e.locationId === 'mus-latebra' || !inTaberna) musFate(q, 'spared', false);
    },
    'item:added': (q, e) => {
      if (e.itemId === 'quest-sacculum-festi') q.completeObjective('satchel');
    },
    'content:interact': (q, e) => {
      if (e.id === BODY.id) searchBody(q);
    },
    'time:hour': (q) => {
      if (q.stage === 'dusk' && isDusk(q.game) && q.game.locations?.isInside?.('castor-loculi')) hint(q.game, 'The lamps are lit. Gratus is waiting among the strongboxes.');
    },
    'save:loaded': (q) => {
      if (q.stage === 'start' && !q.isObjectiveDone('search')) placeExamine(q.game, BODY);
    },
  },
  rewards: { skills: [{ id: 'rhetoric', amount: 10 }] },
});
