/**
 * lud-01-sacramentum "The Oath" (GDD §9.2, §6.10, §13.2 boss-nereus, §17.2 step 4). Ludus Magnus
 * line, v0.1 Must.
 *
 * Sign on at the Ludus Magnus as a paid guest (the default: no rank, no Infamia) or swear the
 * gladiator's oath as an auctoratus (an explicit crossroad: Infamia +20, which blocks equestrian
 * rank; joins the Ludus as a tiro). Draw a rudis and a scutum or parmula from the armory (returned
 * when you leave the Ludus), then three practice bouts (lusiones with arma lusoria: 0 HP is a
 * knockout, never a death): the recruit Pullus, the thraex Callinicus, and the champion retiarius
 * Nereus with his net. When Nereus yields, the player calls missio. The procurator pays the purse
 * (base × (1 + favor/100)); the medicus patches the player up and sends him to rest until dusk.
 *
 *   start → armory → bout1 (Pullus) → bout2 (Callinicus) → bout3 (Nereus) → missio → purse → done
 *
 * Glaucus starts each bout from dialogue ('fight1'…'fight3'). A bout is won when the opponent
 * yields or drops ('actor:yielded' / 'actor:killed'); if the player yields or drops, Glaucus stops
 * it and the player may try again (losing to Nereus costs part of the purse and leaves 'injured').
 */
import { beat, fight, hint, say } from '../../content/director';
import { addFoe, beatFoe, giveItem, hasItem, isPlayer, takeItem } from '../../content/questkit';
import { arenaPurse, startingFavor } from '../../rpg/arena';
import { ITEMS } from '../../rpg/data/items';
import type { ItemDef } from '../../rpg/types';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'lud-01-sacramentum';

/** Practice shields lent by the Ludus armory: the catalogue's stats, no resale value. */
function lent(baseId: string, id: string, name: string, description: string): ItemDef {
  const base = ITEMS.find((d) => d.id === baseId);
  if (!base) throw new Error(`[content] no catalogue item "${baseId}"`);
  return { ...base, id, name, value: 0, description, tags: [...(base.tags ?? []), 'ludus-issue'] };
}

export const items: ItemDef[] = [
  lent('scutum', 'scutum-ludi', 'Ludus Scutum', 'A battered curved scutum from the armory of the Ludus Magnus, stamped LVD·MAG on the rim. It goes back to the armory when you leave.'),
  lent('parmula', 'parmula-ludi', 'Ludus Parmula', 'A small square thraex shield from the armory of the Ludus Magnus, its paint flaked to the wood. It goes back to the armory when you leave.'),
];

interface Bout {
  stage: string;
  objective: string;
  npc: string;
  archetype: string;
  name: string;
  boss?: string;
}

const BOUTS: Bout[] = [
  { stage: 'bout1', objective: 'pullus', npc: 'npc-pullus', archetype: 'murmillo', name: 'Pullus' },
  { stage: 'bout2', objective: 'callinicus', npc: 'npc-callinicus', archetype: 'thraex', name: 'Callinicus' },
  { stage: 'bout3', objective: 'nereus', npc: 'npc-nereus', archetype: 'retiarius', name: 'Nereus', boss: 'boss-nereus' },
];
const BOUT_STAGES = ['armory', 'bout1', 'bout2', 'bout3', 'missio', 'purse'];

function boutOf(q: QuestContext): Bout | undefined {
  return BOUTS.find((b) => b.stage === q.stage);
}

function issueKit(q: QuestContext, shield: 'scutum-ludi' | 'parmula-ludi') {
  if (!hasItem(q, 'rudis')) giveItem(q, 'rudis');
  if (!hasItem(q, 'scutum-ludi') && !hasItem(q, 'parmula-ludi')) giveItem(q, shield);
  q.vars.kit = shield;
  q.completeObjective('kit');
}

/** The armory takes its practice arms back (leaving the Ludus, or at the purse). */
function returnKit(q: QuestContext, why: string) {
  const shield = typeof q.vars.kit === 'string' ? q.vars.kit : '';
  if (!shield) return;
  const back = [takeItem(q, 'rudis'), takeItem(q, shield)].some(Boolean);
  q.vars.kit = '';
  if (back) q.notify(why);
}

function startBout(q: QuestContext, n: number) {
  const b = BOUTS[n - 1];
  if (!b || q.stage !== b.stage) return;
  const inv = q.game.player?.inventory;
  if (inv?.count('rudis')) inv.equip('rudis');
  const shield = typeof q.vars.kit === 'string' ? q.vars.kit : '';
  if (shield && inv?.count(shield)) inv.equip(shield);
  const actor = fight(q.game, b.npc, b.archetype, 'ludus-arena-center', { practice: true, quest: QUEST_ID, tags: [QUEST_ID, 'lusio'], name: b.name, boss: b.boss }, { z: -6 });
  q.vars.bout = n;
  if (!actor) {
    // No combat module in this build: Glaucus calls the bout on points.
    q.notify(`Glaucus watches you spar with ${b.name} and calls it for you.`);
    winBout(q, b, false);
    return;
  }
  addFoe(q, b.stage, actor);
  beat(q.game, QUEST_ID, 'bout-start', { actors: [b.npc], at: 'ludus-arena-center' });
  say(q.game, 'Glaucus', n === 3 ? 'Nereus! A guest for you. Practice arms. Begin!' : `${b.name}! Practice arms. Begin!`);
  if (n === 1) hint(q.game, 'Press X to lock on. Q just before his blow lands parries; strike at once to riposte. Space (or Option) dodges.');
  if (n === 3) hint(q.game, 'Watch the net: when Nereus twirls it, step aside. If it catches you, keep your shield up and press keys to struggle free.');
}

function winBout(q: QuestContext, b: Bout, ko: boolean) {
  q.vars.bout = 0;
  if (b.stage === 'bout3') q.vars.nereusKO = ko;
  q.completeObjective(b.objective);
  // A knocked-out Nereus can't ask for missio: there is nothing to decide.
  if (b.stage === 'bout3' && ko && q.stage === 'missio') q.completeObjective('missio');
}

function loseBout(q: QuestContext) {
  const n = Number(q.vars.bout) || 0;
  if (!n) return;
  q.vars.bout = 0;
  beat(q.game, QUEST_ID, 'bout-stopped', { actors: [BOUTS[n - 1].npc], at: 'ludus-arena-center' });
  if (n === 3) {
    q.vars.losses = (Number(q.vars.losses) || 0) + 1;
    q.game.player?.sheet?.applyCondition('injured');
    q.notify('Glaucus stops the bout. You wake in the Saniarium, injured. The purse will be lighter.');
  } else {
    q.notify('Glaucus stops the bout. “Again, when you can stand.”');
  }
}

/** The guest's purse: base × (1 + favor/100) (§6.10), less 8 den. for each loss to Nereus. */
export function lusioPurse(q: QuestContext): number {
  const fama = q.game.factions?.reputation('plebs') ?? 0;
  const favor = typeof q.flag('arena.favor') === 'number' ? (q.flag('arena.favor') as number) : startingFavor(fama);
  const losses = Math.min(2, Number(q.vars.losses) || 0);
  return Math.max(10, Math.round(arenaPurse(25, favor)) - 8 * losses);
}

export default defineQuest({
  id: QUEST_ID,
  title: 'The Oath',
  latin: 'Sacramentum',
  category: 'faction',
  faction: 'ludus-magnus',
  giver: 'npc-attius-celer',
  summary: 'Sign on at the Ludus Magnus and fight three practice bouts, the last against Nereus the retiarius.',
  stages: {
    start: {
      journal: 'The Ludus Magnus, the emperor’s own gladiator school beside the amphitheatre, takes paying guests for practice bouts, and the men who sweat on its sand know every knife-man in Rome. Its procurator signs on newcomers by the gate.',
      objectives: [
        { id: 'go', text: 'Go to the Ludus Magnus', target: { kind: 'location', id: 'ludus-gate' } },
        { id: 'sign', text: 'Sign on with the procurator', target: { kind: 'npc', id: 'npc-attius-celer' } },
      ],
      onEnter: (q) => {
        const loc = q.game.locations;
        if (loc?.isInside?.('ludus-magnus') || loc?.isInside?.('ludus-gate')) q.completeObjective('go');
      },
      next: 'armory',
    },
    armory: {
      journal: 'My name is on the Ludus roll. Bassus, the armorer, issues practice arms to newcomers: a wooden sword, the rudis, and a shield of my choosing. The arms go back to him when I leave the school.',
      objectives: [{ id: 'kit', text: 'Draw a rudis and a shield from the armory', target: { kind: 'npc', id: 'npc-bassus' } }],
      next: 'bout1',
    },
    bout1: {
      journal: 'Glaucus, the school’s doctor, a Thracian with a face like a mended pot, put me on the sand against Pullus, a recruit with fair hair and a sore arm. Practice arms. “Show me you can block, tiro.”',
      objectives: [{ id: 'pullus', text: 'Beat Pullus in a practice bout (ask Glaucus to begin)', target: { kind: 'npc', id: 'npc-glaucus' } }],
      next: 'bout2',
    },
    bout2: {
      journal: 'Pullus went down and laughed about it. Next Glaucus called Callinicus, a thraex, all hooked sword and small square shield. “He comes in low and round. Watch the parmula, not the face.”',
      objectives: [{ id: 'callinicus', text: 'Beat Callinicus the thraex in a practice bout', target: { kind: 'npc', id: 'npc-glaucus' } }],
      next: 'bout3',
    },
    bout3: {
      journal: 'Then the school went quiet and the balconies filled. Nereus the retiarius, victor of thirty-one, came out with a net over his shoulder and a blunted trident. Glaucus said, “Nobody beats him. Last as long as you can.”',
      objectives: [{ id: 'nereus', text: 'Face Nereus the retiarius', target: { kind: 'npc', id: 'npc-glaucus' } }],
      next: 'missio',
    },
    missio: {
      journal: 'Nereus went down on one knee and raised a finger, ad digitum, the way gladiators ask for mercy. On the balconies they were shouting. In a lusio the decision is the winner’s.',
      objectives: [{ id: 'missio', text: 'Grant Nereus missio, or refuse it', target: { kind: 'npc', id: 'npc-nereus' } }],
      onEnter: (q) => {
        if (q.vars.nereusKO) q.completeObjective('missio');
      },
      next: 'purse',
    },
    purse: {
      journal: 'It was over. The procurator wanted to see me about money, and the medicus wanted to see me about blood.',
      objectives: [
        { id: 'purse', text: 'Collect your purse from the procurator', target: { kind: 'npc', id: 'npc-attius-celer' } },
        { id: 'medicus', text: 'Let the medicus look at you', optional: true, target: { kind: 'npc', id: 'npc-eudemus' } },
      ],
      next: 'done',
    },
    done: {
      journal: 'Sextus Attius Celer counted coins into my hand while Bassus took back his rudis and his shield. In the barracks they were already telling the story of the guest who faced Nereus. Somebody there knows the man who knifed Festus.',
      onEnter: (q) => {
        returnKit(q, 'Bassus takes back the rudis and the shield.');
        q.giveReward({ denarii: lusioPurse(q) });
        q.setFlag('lud01.done', true);
      },
      end: 'complete',
    },
  },
  triggers: {
    'dialogue:node': (q, e) => {
      if ((e.dialogueId === 'npc-castor-contact' && e.nodeId === 'ludus') || (e.dialogueId === 'npc-attius-celer' && e.nodeId === 'offer')) q.start();
    },
    'location:entered': (q, e) => {
      if (e.locationId === 'ludus-gate') q.start();
    },
  },
  on: {
    'location:entered': (q, e) => {
      if (e.locationId === 'ludus-gate' || e.locationId === 'ludus-magnus') q.completeObjective('go');
    },
    'location:exited': (q, e) => {
      if (e.locationId === 'ludus-magnus' && BOUT_STAGES.includes(q.stage)) returnKit(q, 'At the gate the armory slave takes back the practice kit. Bassus will issue it again.');
    },
    'dialogue:node': (q, e) => {
      if (e.dialogueId === 'npc-attius-celer') {
        if (e.nodeId === 'signedGuest' || e.nodeId === 'signedOath') {
          q.vars.oath = e.nodeId === 'signedOath';
          q.completeObjective('go');
          q.completeObjective('sign');
        }
        if (e.nodeId === 'paid' && q.stage === 'purse') q.completeObjective('purse');
      }
      if (e.dialogueId === 'npc-bassus') {
        if (e.nodeId === 'issueScutum') issueKit(q, 'scutum-ludi');
        if (e.nodeId === 'issueParmula') issueKit(q, 'parmula-ludi');
      }
      if (e.dialogueId === 'npc-glaucus') {
        if (e.nodeId === 'fight1') startBout(q, 1);
        if (e.nodeId === 'fight2') startBout(q, 2);
        if (e.nodeId === 'fight3') startBout(q, 3);
      }
      if (e.dialogueId === 'npc-nereus' && q.stage === 'missio') {
        if (e.nodeId === 'mitte') {
          q.vars.spared = true;
          q.game.devotion?.sparedYielded();
          q.game.standing?.addFame('dist-vallis-colossei', 2);
          q.game.factions?.addReputation('plebs', 3);
          q.completeObjective('missio');
        }
        if (e.nodeId === 'iugula') {
          q.vars.spared = false;
          q.game.factions?.addReputation('ludus-magnus', -5);
          q.completeObjective('missio');
        }
      }
      if (e.dialogueId === 'npc-eudemus' && e.nodeId === 'patched' && q.stage === 'purse') q.completeObjective('medicus');
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
    reputation: [{ faction: 'ludus-magnus', amount: 10 }, { faction: 'plebs', amount: 5 }],
    skillXp: ['blades', 'shield'],
  },
});
