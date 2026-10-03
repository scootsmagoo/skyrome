/**
 * Dialogue engine (game.dialogue). Picks the conversation for an NPC (specific dialogues by
 * priority, then '*' fallbacks), walks the node graph and exposes a UI-facing view:
 *
 *   const v = game.dialogue.start('ex_pudens');   // { npcId, speakerName, text, choices: [{ text, enabled, tag? }] }
 *   game.dialogue.choose(0);                      // pick a visible choice
 *   game.dialogue.advance();                      // continue a node without choices (or close an ending one)
 *   game.dialogue.end();
 *
 * Skill checks pass with chance clamp((skill − difficulty + 25) / 25, 0, 1), rolled on a seeded RNG.
 * Rhetoric checks add persuasion points for the audience (dress, Fama, Infamia, cleanliness),
 * Exordium (+10 on the first check with each person) and persuade.chance; Fortuna's "Fortune's
 * Turn" makes the next roll pass. A passed check trains 10 × its difficulty tier, a failed one 2.
 * Bribes cost denarii and always pass. `once` choices and
 * per-NPC memory are saved; global flags are shared with quests (game.quests.flags).
 *
 * Choice resolution order: once-mark → bribe/check → effects → end/goto. A choice with no goto,
 * check or bribe ends the conversation.
 */
import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import { checkTier, persuasionPoints, rollSkillCheck, skillCheckChance } from '../rpg/checks';
import { XP } from '../rpg/data/balance';
import { formatDenarii } from '../rpg/money';
import type { LocationDef, NpcDef } from '../npc/types';
import { GlobalFlags, type FlagValue } from '../quests/flags';
import type { ItemDef } from '../rpg/types';
import type { DialogueChoice, DialogueContext, DialogueDef, DialogueNode, SkillCheck, Text } from './types';

declare module '../core/Game' {
  interface Game {
    dialogue: DialogueSystem;
  }
}

export type DialogueService = Parameters<DialogueContext['openService']>[0];

declare module '../core/Events' {
  interface GameEvents {
    /** A conversation asked to open barter/training/etc. with this NPC. */
    'dialogue:service': { npcId: string; service: DialogueService };
    /** A conversation turned hostile. */
    'dialogue:attack': { npcId: string };
    'dialogue:check': { npcId: string; dialogueId: string; nodeId: string; skill: string; chance: number; pass: boolean };
  }
}

export interface DialogueChoiceView {
  text: string;
  enabled: boolean;
  /** e.g. "Persuade 60%", "Bribe 5 d". */
  tag?: string;
  kind: 'normal' | 'check' | 'bribe';
}

export interface DialogueView {
  npcId: string;
  dialogueId: string;
  nodeId: string;
  /** 'npc', 'player', or another speaker's id/name. */
  speaker: string;
  speakerName: string;
  text: string;
  choices: DialogueChoiceView[];
  /** No choices and a `next` node: show "Continue" (advance()). */
  canContinue: boolean;
  /** No choices and nothing next: advance() closes the conversation. */
  willEnd: boolean;
}

export interface DialogueSystemOptions {
  defs?: readonly DialogueDef[];
  includeExamples?: boolean;
  /** Shared flags (default: game.quests.flags, else private). */
  flags?: GlobalFlags;
  rng?: { next(): number };
}

type Memory = Record<string, FlagValue>;

/** A dialogue content module: default-exports dialogue(s); may also export `items`, `locations`, `npcs`. */
export interface DialogueModule {
  default?: DialogueDef | DialogueDef[];
  items?: ItemDef[];
  locations?: LocationDef[];
  npcs?: NpcDef[];
}

/** Dialogue modules from ./content. Underscore files are examples. */
export function dialogueModules(includeExamples = false): DialogueModule[] {
  const mods = import.meta.glob<DialogueModule>('./content/*.ts', { eager: true });
  return Object.entries(mods)
    .filter(([path]) => includeExamples || !path.split('/').pop()!.startsWith('_'))
    .map(([, m]) => m);
}

export function loadDialogueContent(includeExamples = false): DialogueDef[] {
  return dialogueModules(includeExamples).flatMap((m) => (m.default ? (Array.isArray(m.default) ? m.default : [m.default]) : []));
}

interface Session {
  def: DialogueDef;
  npcId: string;
  nodeId: string;
  ctx: DialogueContext;
  view: DialogueView | null;
  /** Visible choice index → index in node.choices. */
  map: number[];
  /** Name given to start() for unnamed citizens. */
  name?: string;
  /** Skill checks rolled so far this conversation (Exordium). */
  checks: number;
}

export class DialogueSystem {
  private readonly defs = new Map<string, DialogueDef>();
  private readonly memory = new Map<string, Memory>();
  private readonly listeners = new Set<(v: DialogueView | null) => void>();
  private session: Session | null = null;
  private readonly ownFlags: boolean;
  readonly flags: GlobalFlags;
  rng: { next(): number };
  /** How the player's lines are labelled. */
  playerName = 'You';
  /** Display name for an NPC id (default: game.npcs). */
  nameOf: (npcId: string) => string | undefined = (id) => this.game.npcs?.name(id);

  constructor(
    readonly game: Game,
    opts: DialogueSystemOptions = {},
  ) {
    const shared = opts.flags ?? game.quests?.flags;
    this.ownFlags = !shared;
    this.flags = shared ?? new GlobalFlags(game.events);
    this.rng = opts.rng ?? (game.rng ? game.rng.fork('dialogue') : new Rng('dialogue'));
    for (const d of opts.defs ?? loadDialogueContent(opts.includeExamples)) this.register(d);
  }

  register(defs: DialogueDef | readonly DialogueDef[]) {
    for (const d of Array.isArray(defs) ? defs : [defs as DialogueDef]) {
      if (this.defs.has(d.id)) console.warn(`[dialogue] "${d.id}" registered twice; the last one wins`);
      this.defs.set(d.id, d);
    }
  }

  get(id: string) {
    return this.defs.get(id);
  }

  /** Candidate dialogues for an NPC: specific ones by priority, then '*' fallbacks by priority. */
  candidates(npcId: string): DialogueDef[] {
    const byPrio = (a: DialogueDef, b: DialogueDef) => (b.priority ?? 0) - (a.priority ?? 0);
    const all = [...this.defs.values()];
    const specific = all.filter((d) => d.npcs.includes(npcId)).sort(byPrio);
    const generic = all.filter((d) => d.npcs.includes('*') && !d.npcs.includes(npcId)).sort(byPrio);
    // An NPC def can name its dialogue explicitly; that one goes first.
    const named = this.game.npcs?.get(npcId)?.dialogue;
    const explicit = named ? this.defs.get(named) : undefined;
    return [...(explicit ? [explicit] : []), ...specific.filter((d) => d !== explicit), ...generic.filter((d) => d !== explicit)];
  }

  hasDialogue(npcId: string) {
    return this.candidates(npcId).length > 0;
  }

  get active(): boolean {
    return !!this.session;
  }

  get view(): DialogueView | null {
    return this.session?.view ?? null;
  }

  /** Saved per-NPC memory (created on demand). */
  memoryOf(npcId: string): Memory {
    let m = this.memory.get(npcId);
    if (!m) this.memory.set(npcId, (m = {}));
    return m;
  }

  onChange(fn: (v: DialogueView | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------------------------------------------------------------- conversation

  /** Start talking to an NPC. `opts.name` labels unnamed citizens; `opts.dialogueId` forces one. */
  start(npcId: string, opts: { name?: string; dialogueId?: string } = {}): DialogueView | null {
    if (this.session) this.end();
    const ctx = this.context(npcId);
    const list = opts.dialogueId ? [this.defs.get(opts.dialogueId)].filter((d): d is DialogueDef => !!d) : this.candidates(npcId);
    for (const def of list) {
      let entry: string | undefined;
      try {
        entry = def.start(ctx);
      } catch (err) {
        console.error(`[dialogue] ${def.id}.start threw`, err);
        continue;
      }
      if (!entry) continue;
      if (!def.nodes[entry]) {
        console.warn(`[dialogue] ${def.id}.start returned unknown node "${entry}"`);
        continue;
      }
      const mem = this.memoryOf(npcId);
      mem._talks = (typeof mem._talks === 'number' ? mem._talks : 0) + 1;
      this.session = { def, npcId, nodeId: entry, ctx, view: null, map: [], name: opts.name, checks: 0 };
      this.game.events.emit('dialogue:started', { npcId, dialogueId: def.id });
      return this.enter(entry);
    }
    return null;
  }

  /** Pick the i-th visible choice. Disabled or out-of-range picks are ignored. */
  choose(i: number): DialogueView | null {
    const s = this.session;
    if (!s?.view) return null;
    const vc = s.view.choices[i];
    const node = s.def.nodes[s.nodeId];
    const idx = s.map[i];
    const choice = node?.choices?.[idx];
    if (!vc || !choice || !vc.enabled) return s.view;
    const { ctx, def, npcId } = s;
    if (choice.once) this.memoryOf(npcId)[onceKey(def.id, s.nodeId, idx)] = true;

    let goto = choice.goto;
    if (choice.bribe) {
      if (!ctx.pay(choice.bribe.amount)) return s.view;
      goto = choice.bribe.goto;
    } else if (choice.check) {
      const c = choice.check;
      const input = this.checkInputs(c, npcId);
      const r = rollSkillCheck(input.skill, c.difficulty, this.rng, input.bonus);
      s.checks++;
      if (c.skill === 'rhetoric') this.memoryOf(npcId)._exordium = true;
      // Fortune's Turn: the next roll succeeds (consumed only when it changes the outcome).
      if (!r.pass && this.game.player?.sheet?.consumeFlag('fortuna.nextRoll')) r.pass = true;
      // GDD §5.4: a passed check gives 10 × tier XP, a failed one 2.
      this.game.player?.sheet?.useSkill(c.skill, r.pass ? XP.rhetoric.perTier * checkTier(c.difficulty) : XP.rhetoric.fail);
      this.game.events.emit('dialogue:check', { npcId, dialogueId: def.id, nodeId: s.nodeId, skill: c.skill, chance: r.chance, pass: r.pass });
      goto = r.pass ? c.pass : c.fail;
    }
    if (choice.effects) {
      try {
        choice.effects(ctx);
      } catch (err) {
        console.error(`[dialogue] ${def.id}/${s.nodeId} choice effects threw`, err);
      }
      if (this.session !== s) return this.view;
    }
    if (choice.end || !goto) {
      this.end();
      return null;
    }
    return this.enter(goto);
  }

  /** Continue past a node without choices; closes the conversation at an ending node. */
  advance(): DialogueView | null {
    const s = this.session;
    if (!s?.view) return null;
    const node = s.def.nodes[s.nodeId];
    if (s.view.choices.length) return s.view;
    if (node?.next && !node.end) return this.enter(node.next);
    this.end();
    return null;
  }

  end() {
    const s = this.session;
    if (!s) return;
    this.session = null;
    this.memoryOf(s.npcId)._lastTalk = this.game.time?.totalHours ?? 0;
    this.game.events.emit('dialogue:ended', { npcId: s.npcId, dialogueId: s.def.id });
    this.emitChange(null);
  }

  /** Chance shown in a check's tag (0..1) when talking to `npcId`. */
  checkChance(check: SkillCheck, npcId: string): number {
    const input = this.checkInputs(check, npcId);
    return skillCheckChance(input.skill, check.difficulty, input.bonus);
  }

  /**
   * Effective skill and bonus for a check: Rhetoric adds persuasion points for the audience (dress,
   * Fama with the NPC's faction, Infamia, cleanliness), Exordium (+10 on the first check with each
   * person), Clientela (+15 when invoking your patron) and persuade.chance.
   */
  private checkInputs(c: SkillCheck, npcId: string): { skill: number; bonus: number } {
    const sheet = this.game.player?.sheet;
    let skill = sheet?.skillLevel(c.skill) ?? 0;
    let bonus = 0;
    if (c.skill === 'rhetoric' && sheet) {
      bonus += sheet.modifier('persuade.chance');
      if (sheet.hasFlag('perk-rhetoric-exordium') && !this.memoryOf(npcId)._exordium) skill += 10;
      if (c.kind === 'invoke-patron' && sheet.hasFlag('perk-rhetoric-clientela')) skill += 15;
      const faction = this.game.npcs?.get(npcId)?.faction;
      skill += persuasionPoints(c.audience ?? 'any', {
        flags: sheet,
        fama: faction ? (this.game.factions?.reputation(faction) ?? 0) : 0,
        infamia: this.game.standing?.infamia,
        cleanliness: this.game.standing?.cleanliness,
      });
    }
    return { skill, bonus };
  }

  private enter(nodeId: string): DialogueView | null {
    const s = this.session;
    if (!s) return null;
    const node = s.def.nodes[nodeId];
    if (!node) {
      console.warn(`[dialogue] ${s.def.id}: unknown node "${nodeId}"`);
      this.end();
      return null;
    }
    s.nodeId = nodeId;
    if (node.effects) {
      try {
        node.effects(s.ctx);
      } catch (err) {
        console.error(`[dialogue] ${s.def.id}/${nodeId} effects threw`, err);
      }
      if (this.session !== s) return this.view;
    }
    // Quests react to the node (start/advance) before its choices are evaluated.
    this.game.events.emit('dialogue:node', { npcId: s.npcId, dialogueId: s.def.id, nodeId });
    if (this.session !== s || s.nodeId !== nodeId) return this.view;
    s.view = this.buildView(s, node);
    this.emitChange(s.view);
    return s.view;
  }

  private buildView(s: Session, node: DialogueNode): DialogueView {
    const { ctx, def, npcId } = s;
    const mem = this.memoryOf(npcId);
    const choices: DialogueChoiceView[] = [];
    s.map = [];
    (node.choices ?? []).forEach((c, idx) => {
      if (!safe(() => (c.if ? c.if(ctx) : true), false, def.id)) return;
      if (c.once && mem[onceKey(def.id, s.nodeId, idx)]) return;
      choices.push(this.choiceView(c, ctx, def.id));
      s.map.push(idx);
    });
    const speaker = node.speaker ?? 'npc';
    const npcName = this.nameOf(npcId) ?? s.name ?? 'Citizen';
    const speakerName = speaker === 'npc' ? npcName : speaker === 'player' ? this.playerName : (this.nameOf(speaker) ?? speaker);
    const hasNext = !!node.next && !node.end;
    return {
      npcId,
      dialogueId: def.id,
      nodeId: s.nodeId,
      speaker,
      speakerName,
      text: resolveText(node.text, ctx, def.id),
      choices,
      canContinue: !choices.length && hasNext,
      willEnd: !choices.length && !hasNext,
    };
  }

  private choiceView(c: DialogueChoice, ctx: DialogueContext, dialogueId: string): DialogueChoiceView {
    let enabled = safe(() => (c.enabled ? c.enabled(ctx) : true), false, dialogueId);
    let tag: string | undefined;
    let kind: DialogueChoiceView['kind'] = 'normal';
    if (c.bribe) {
      kind = 'bribe';
      tag = `Bribe ${formatDenarii(c.bribe.amount)}`;
      enabled &&= ctx.denarii() + 1e-9 >= c.bribe.amount;
    } else if (c.check) {
      kind = 'check';
      const label = c.check.label ?? (c.check.skill === 'rhetoric' ? 'Persuade' : capital(c.check.skill));
      tag = `${label} ${Math.round(this.checkChance(c.check, ctx.npcId) * 100)}%`;
    }
    return { text: resolveText(c.text, ctx, dialogueId), enabled, tag, kind };
  }

  private emitChange(v: DialogueView | null) {
    for (const fn of [...this.listeners]) {
      try {
        fn(v);
      } catch (err) {
        console.error('[dialogue] listener threw', err);
      }
    }
  }

  /** The context handed to dialogue content for an NPC. */
  context(npcId: string): DialogueContext {
    const game = this.game;
    const sys = this;
    const inv = () => game.player?.inventory;
    return {
      game,
      npcId,
      get memory() {
        return sys.memoryOf(npcId);
      },
      flag: (n) => sys.flags.get(n),
      setFlag: (n, v) => sys.flags.set(n, v),
      quest: (id) => game.quests?.status(id),
      startQuest: (id, stage) => void game.quests?.start(id, stage),
      setQuestStage: (id, stage) => void game.quests?.setStage(id, stage),
      skill: (id) => game.player?.sheet?.skillLevel(id) ?? 0,
      hasItem: (id, count = 1) => (inv()?.count(id) ?? 0) >= count,
      giveItem: (id, count = 1) => inv()?.add(id, count, { source: 'dialogue' }),
      takeItem: (id, count = 1) => inv()?.remove(id, count, { reason: 'given' }) ?? false,
      denarii: () => inv()?.denarii ?? 0,
      pay: (amount) => inv()?.spendDenarii(amount) ?? false,
      receive: (amount) => inv()?.addDenarii(amount),
      attack: () => {
        game.events.emit('dialogue:attack', { npcId });
        sys.end();
      },
      openService: (service) => game.events.emit('dialogue:service', { npcId, service }),
    };
  }

  // ---------------------------------------------------------------- persistence

  serialize() {
    return { memory: Object.fromEntries(this.memory), flags: this.ownFlags ? this.flags.serialize() : undefined };
  }

  restore(data: unknown) {
    this.end();
    this.memory.clear();
    const d = (data ?? {}) as { memory?: Record<string, Memory>; flags?: unknown };
    for (const [npc, m] of Object.entries(d.memory ?? {})) {
      if (!m || typeof m !== 'object') continue;
      const clean: Memory = {};
      for (const [k, v] of Object.entries(m)) if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') clean[k] = v;
      this.memory.set(npc, clean);
    }
    if (this.ownFlags) this.flags.restore(d.flags);
  }
}

function onceKey(dialogueId: string, nodeId: string, idx: number) {
  return `_once:${dialogueId}:${nodeId}:${idx}`;
}

function resolveText(t: Text, ctx: DialogueContext, dialogueId: string): string {
  return typeof t === 'function' ? safe(() => t(ctx), '…', dialogueId) : t;
}

function safe<T>(fn: () => T, fallback: T, where: string): T {
  try {
    return fn();
  } catch (err) {
    console.error(`[dialogue] ${where}: condition/text threw`, err);
    return fallback;
  }
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
