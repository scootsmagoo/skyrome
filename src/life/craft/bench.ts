/**
 * The mortar bench (docs/design/world-life.md §4.6): "Could I use your mortar?" at Demetrius's in
 * the Basilica Paulli (an as a use) or Hermippus's in the Ludus infirmary (free once lud-01 is done)
 * opens a card in the conversation panel that lists every mortar recipe. The ones the player can
 * make are enabled; the ones without the goods say "You need …" and the ones above the player's
 * Medicina level are greyed out with their level ("Medicina 20"). Nothing is hidden. Making one
 * takes the inputs and the fee, passes the recipe's hours (the screen dims as in Wait), gives the
 * output and Medicina XP, and fires 'life:crafted'.
 *
 *   game.lifeCraft.open(owner)           sit at the bench of a person (false: refused or no bench)
 *   game.lifeCraft.make(recipe, owner)   make one batch now; { ok, text }
 *   game.lifeCraft.fee(owner)            what the bench costs (denarii)
 *   game.lifeCraft.states(owner)         each recipe with its state (tests and the console)
 */
import type { Game } from '../../core/Game';
import type { DialogueChoice, DialogueDef, DialogueNode } from '../../dialogue/types';
import { skipTime } from '../../rpg/clock';
import { AS } from '../../rpg/money';
import { passes } from '../gates';
import { priceText } from '../effects';
import { registerBench } from '../talk';
import type { Gate, Recipe } from '../types';
import { makeState, whyNot, type MakeState } from './rules';

declare module '../../core/Game' {
  interface Game {
    lifeCraft: LifeCraft;
  }
}

export interface LifeCraft {
  open(owner: string): boolean;
  make(recipeId: string, owner: string): { ok: boolean; text: string };
  fee(owner: string): number;
  states(owner: string): { recipe: Recipe; state: MakeState; line: string }[];
}

/** Whose bench it is: the fee, who may use it and what is said at the card. */
interface Site {
  name: string;
  fee: number;
  /** Who may use it; `refuse` is said otherwise. */
  allow?: Gate;
  refuse?: string;
  intro: readonly string[];
  /** Said after a making. */
  made: readonly string[];
}

const SITES: Record<string, Site> = {
  'npc-demetrius': {
    name: 'Demetrius’s mortar',
    fee: AS,
    intro: [
      '(Demetrius slides a worn marble mortar across the bench and a bronze spatula after it.) An as for the use of it, and for the use of my eye on your hands. Mind the honey; it is dearer than the doctor.',
      '(He clears a corner of the bench between the scales and the cupping glasses.) The mortar is yours for an as. What are we grinding?',
    ],
    made: ['(He glances into the mortar, nods, and goes back to his scales.) Better than most apprentices.', '“Not bad,” says Demetrius, without looking up. “Keep it from the damp.”'],
  },
  'npc-hermippus': {
    name: 'The infirmary mortar',
    fee: 0,
    allow: { questDone: 'lud-01-sacramentum' },
    refuse: '(Hermippus holds the mortar to his chest.) Not yet, lad. When Glaucus has your name in his book you may grind in my infirmary. Until then, I do not hand my mortar to strangers.',
    intro: [
      '(Hermippus waves you to the bench by the window.) The mortar is free to the Ludus. The vinegar and the honey are not. Grind.',
      '(Hermippus moves a bowl of bloody rags aside.) Make room. Nothing in here is clean, but the mortar is.',
    ],
    made: ['(He sniffs it and grunts, which is his highest praise.)', '“A fighter will thank you for that,” says Hermippus. “Not aloud.”'],
  },
};

const DEFAULT_SITE: Site = { name: 'The mortar', fee: 0, intro: ['A marble mortar and a bronze pestle.'], made: ['Done.'] };

const DIALOGUE = 'life:bench';

/** Dim the screen as Wait does (the same veil as the other life options). */
export function dimScreen(game: Game) {
  const layer = game.ui?.overlayLayer;
  if (!layer || typeof document === 'undefined') return;
  const veil = document.createElement('div');
  veil.className = 'wt-veil';
  layer.appendChild(veil);
  setTimeout(() => {
    veil.classList.add('is-out');
    setTimeout(() => veil.remove(), 700);
  }, 650);
}

/** What the last making said, per owner (the card reads it). */
const said = new Map<string, string>();
let turn = 0;

export function installLifeBench(game: Game) {
  // A new Game starts with a clean bench (the module-level maps would outlive it).
  said.clear();
  turn = 0;
  // The card asks for the states several times a render; they are worked out once per opening and per making.
  const cache = new Map<string, { recipe: Recipe; state: MakeState; line: string }[]>();
  const site = (owner: string): Site => SITES[owner] ?? DEFAULT_SITE;
  const recipes = (): Recipe[] => (game.life?.data.recipes ?? []).filter((r) => r.bench === 'mortar');
  const itemName = (id: string) => game.items?.get(id)?.name.toLowerCase() ?? id;
  const have = () => {
    const inv = game.player?.inventory;
    const sheet = game.player?.sheet;
    return { count: (i: string) => inv?.count(i) ?? 0, level: sheet?.skillLevel('medicina') ?? 0 };
  };
  const allowed = (owner: string) => passes(site(owner).allow, game);
  const poor = (owner: string) => (game.player?.inventory?.denarii ?? 0) + 1e-9 < site(owner).fee;

  const states = (owner: string) => {
    let list = cache.get(owner);
    if (!list) {
      list = recipes().map((recipe) => {
        const state = makeState(recipe, have());
        return { recipe, state, line: state.ok ? '' : whyNot(state, itemName) };
      });
      cache.set(owner, list);
    }
    return list;
  };

  const make = (recipeId: string, owner: string): { ok: boolean; text: string } => {
    const r = recipes().find((x) => x.id === recipeId);
    if (!r) return { ok: false, text: 'No such recipe.' };
    if (!allowed(owner)) return { ok: false, text: site(owner).refuse ?? 'Not here.' };
    const st = makeState(r, have());
    if (!st.ok) return { ok: false, text: whyNot(st, itemName) + '.' };
    if (poor(owner)) return { ok: false, text: 'You haven’t the money for the use of the mortar.' };
    const inv = game.player?.inventory;
    const sheet = game.player?.sheet;
    if (!inv) return { ok: false, text: 'You have nothing to grind.' };
    const fee = site(owner).fee;
    if (fee > 0) inv.spendDenarii(fee);
    for (const i of r.inputs) inv.remove(i.item, i.count, { reason: 'given' });
    skipTime(game.time, game.events, r.hours);
    inv.add(r.output.item, r.output.count, { source: 'craft' });
    if (r.skill) sheet?.useSkill(r.skill, r.xp);
    cache.clear();
    game.events.emit('life:crafted', { recipe: r.id, item: r.output.item, count: r.output.count });
    dimScreen(game);
    const out = game.items?.get(r.output.item)?.name ?? r.output.item;
    const line = site(owner).made;
    const text = `${r.output.count > 1 ? `${r.output.count} × ` : ''}${out}. ${line[turn++ % line.length]}`;
    said.set(owner, text);
    return { ok: true, text };
  };

  game.lifeCraft = {
    open: (owner) => {
      said.delete(owner);
      cache.clear();
      return !!game.dialogue?.start(`bench:${owner}`, { name: site(owner).name, dialogueId: DIALOGUE });
    },
    make,
    fee: (owner) => site(owner).fee,
    states,
  };

  registerBench('mortar', (g, owner) => g.lifeCraft.open(owner));
  game.dialogue?.register(benchCard(game, site, allowed, recipes, states, make));
}

// ------------------------------------------------------------------ the card

function benchCard(
  game: Game,
  site: (owner: string) => Site,
  allowed: (owner: string) => boolean,
  recipes: () => Recipe[],
  states: (owner: string) => { recipe: Recipe; state: MakeState; line: string }[],
  make: (recipeId: string, owner: string) => { ok: boolean; text: string },
): DialogueDef {
  const owner = (c: { npcId: string }) => c.npcId.replace(/^bench:/, '');
  // One choice per recipe, in the data's order; the list is read when the card opens.
  const choices: DialogueChoice[] = [];
  for (let i = 0; i < 8; i++) {
    const at = (c: { npcId: string }) => states(owner(c))[i];
    choices.push({
      text: (c) => {
        const s = at(c);
        if (!s) return '…';
        const out = game.items?.get(s.recipe.output.item)?.name ?? s.recipe.output.item;
        const fee = site(owner(c)).fee;
        const label = `${s.recipe.name} (${s.recipe.output.count > 1 ? `${s.recipe.output.count} × ` : ''}${out}${fee > 0 ? `, ${priceText(fee)}` : ''})`;
        return s.state.ok ? label : `${label} — ${s.line}`;
      },
      if: (c) => !!at(c),
      enabled: (c) => !!at(c)?.state.ok && game.player?.inventory?.denarii !== undefined && (game.player.inventory.denarii + 1e-9 >= site(owner(c)).fee),
      effects: (c) => void make(at(c)!.recipe.id, owner(c)),
      goto: 'card',
    });
  }
  choices.push({ text: 'That is enough grinding.', end: true });

  const nodes: Record<string, DialogueNode> = {
    refused: { text: (c) => site(owner(c)).refuse ?? 'Not here.', end: true },
    card: {
      text: (c) => {
        const o = owner(c);
        const said1 = said.get(o);
        const s = site(o);
        const intro = said1 ? `${said1}\n\nWhat next?` : s.intro[turn % s.intro.length];
        return `${intro}${recipes().length ? '' : '\n\n(There is nothing to make here yet.)'}`;
      },
      choices,
    },
  };
  return { id: DIALOGUE, npcs: [], start: (c) => (allowed(owner(c)) ? 'card' : 'refused'), nodes };
}
