/**
 * A small kit for the many people who need a real conversation but not a quest: a greeting, a few
 * things to ask about, the news of the street, an optional trade (barter, healing, training) and
 * an optional Rhetoric check. `person()` builds an ordinary DialogueDef from such a spec, so every
 * named Roman on the golden path can be talked to and each one has something of their own to say.
 *
 * Quest graphs (Festus, Glaucus, Mus…) are written out by hand in src/dialogue/content/*.ts.
 */
import type { DialogueChoice, DialogueContext, DialogueDef, DialogueNode, SkillCheck, Text } from '../dialogue/types';
import { rotate, rumor } from './talk';

export interface Topic {
  /** The player's line. */
  ask: Text;
  /** The NPC's answer. */
  say: Text;
  /** Visible only when true. */
  if?: (c: DialogueContext) => boolean;
  /** Offered once per conversation partner (saved in the NPC's memory). */
  once?: boolean;
  effects?: (c: DialogueContext) => void;
}

export interface Trade {
  /** The player's line ("Show me your wares."). */
  ask: Text;
  service: 'barter' | 'heal' | 'train' | 'repair' | 'rent';
  if?: (c: DialogueContext) => boolean;
  /** Offer the daily haggle (GDD §7.4, a Rhetoric check against the vendor's grade); default: for barter. */
  haggle?: boolean;
}

export interface Persuasion {
  ask: Text;
  /** Rhetoric tier (10 · 25 · 40 · 55 · 70 · 85) and the approach. */
  dc: 10 | 25 | 40 | 55 | 70 | 85;
  kind?: SkillCheck['kind'];
  pass: Text;
  fail: Text;
  /** Runs when the check passes. */
  reward?: (c: DialogueContext) => void;
  once?: boolean;
  if?: (c: DialogueContext) => boolean;
}

export interface PersonSpec {
  /** Dialogue id (by convention the NPC id, as in NpcDef.dialogue). */
  id: string;
  /** NPC ids it applies to (default: [id]). */
  npcs?: string[];
  priority?: number;
  /** First greeting; later visits rotate through `again` (default "Back again?"-style lines). */
  greet: Text;
  again?: readonly string[];
  topics?: Topic[];
  /** Label of the "what's the news?" choice: the rumor mill of src/content/talk.ts answers. */
  news?: string;
  trade?: Trade;
  persuade?: Persuasion;
  /** Extra hub choices (before the farewell) and the nodes they lead to. */
  choices?: DialogueChoice[];
  nodes?: Record<string, DialogueNode>;
  /** The player's farewell line (default "Vale."). */
  bye?: string;
}

const AGAIN = ['Yes? I have a moment.', 'Back again? Ask, then.', 'Quid vis?', 'Well?'];

/** Build a DialogueDef from a PersonSpec. */
export function person(spec: PersonSpec): DialogueDef {
  const topics = spec.topics ?? [];
  const again = spec.again ?? AGAIN;
  const nodes: Record<string, DialogueNode> = {};
  const hubChoices = () => {
    const out: NonNullable<DialogueNode['choices']> = [];
    topics.forEach((t, i) => out.push({ text: t.ask, if: t.if, once: t.once, goto: `t${i}` }));
    if (spec.news) out.push({ text: spec.news, goto: 'news' });
    if (spec.trade) out.push({ text: spec.trade.ask, if: spec.trade.if, end: true, effects: (c) => c.openService(spec.trade!.service) });
    if (spec.trade && spec.trade.service === 'barter' && spec.trade.haggle !== false) {
      out.push({
        text: 'Let’s talk about the price. (Haggle)',
        if: spec.trade.if,
        goto: 'haggle',
        effects: (c) => {
          const r = c.game.barter?.haggle(c.npcId);
          c.memory._haggle = !r?.ok ? 'done' : r.pass ? 'pass' : 'fail';
        },
      });
    }
    if (spec.persuade) {
      const p = spec.persuade;
      out.push({ text: p.ask, if: p.if, once: p.once, check: { skill: 'rhetoric', difficulty: p.dc, kind: p.kind, pass: 'persuadePass', fail: 'persuadeFail' } });
    }
    out.push(...(spec.choices ?? []));
    out.push({ text: spec.bye ?? 'Vale.', end: true });
    return out;
  };
  // One node serves the greeting and every return to the hub: the effect runs before the text is
  // rendered, so it can tell the first visit from the later ones.
  nodes.hub = {
    text: (c) => (c.memory._hello ? (typeof spec.greet === 'function' ? spec.greet(c) : spec.greet) : rotate(c, '_again', again)),
    effects: (c) => {
      c.memory._hello = !c.memory.met;
      c.memory.met = true;
    },
    choices: hubChoices(),
  };
  topics.forEach((t, i) => {
    nodes[`t${i}`] = { text: t.say, effects: t.effects, next: 'hub' };
  });
  Object.assign(nodes, spec.nodes);
  if (spec.news) nodes.news = { text: (c) => rumor(c), next: 'hub' };
  if (spec.trade && spec.trade.service === 'barter' && spec.trade.haggle !== false) {
    nodes.haggle = {
      text: (c) =>
        c.memory._haggle === 'pass'
          ? 'Ha! You drive a hard bargain. All right: a friend’s price, today only. Don’t tell the others.'
          : c.memory._haggle === 'fail'
            ? 'Haggle? In my shop? The price is the price, and today it is a little more, for the insult.'
            : 'We have haggled once today, and my wife says that is plenty. Tomorrow.',
      next: 'hub',
    };
  }
  if (spec.persuade) {
    nodes.persuadePass = { text: spec.persuade.pass, effects: spec.persuade.reward, next: 'hub' };
    nodes.persuadeFail = { text: spec.persuade.fail, next: 'hub' };
  }
  return { id: spec.id, npcs: spec.npcs ?? [spec.id], priority: spec.priority, start: () => 'hub', nodes };
}
