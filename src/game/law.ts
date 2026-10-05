/**
 * The law in the streets (GDD §14.1), Skyrim-style. Anyone can be attacked anywhere, and the city
 * answers:
 *
 * - Striking someone who wasn't your enemy is an assault (vis: 40 den. bounty); killing them is
 *   murder (homicidium: 1,000), and so is killing one of the watch while you are the aggressor.
 *   A crime counts when someone saw it: the victim of an assault always did; a killing needs a
 *   witness in sight (`population.witnesses`).
 * - Witnesses raise the alarm: the crowd scatters and guards nearby come for you.
 * - With a bounty, a guard who sees you walks up and stops you ("Stop right there!"): pay the fine,
 *   talk your way out (bounty under 200), bribe him (a corruptible guard, 200 or less), go quietly
 *   to the Carcer (days pass, you walk out at its door), or resist (+50 %, and the watch attacks on
 *   sight). Walking away from the talk is resisting; running from the guard adds 10 %.
 * - At 1,000 or more (murder), or after resisting, guards attack on sight. Hold Y while the watch
 *   is fighting you to give yourself up into the same talk.
 *
 * The rules live in rpg/crime.ts; combat reports the blows ('combat:assault', 'actor:killed'); the
 * NPC module provides guards, witnesses and the alarm. Missing modules make this a no-op.
 */
import type { CombatSystem } from '../combat/CombatSystem';
import type { Game, System } from '../core/Game';
import { Layer } from '../core/Physics';
import type { Npc } from '../npc/Npc';
import type { NpcManager } from '../npc/NpcManager';
import type { CrimeSystem } from '../rpg/crime';
import type { DialogueChoiceView, DialogueLine, DialogueView } from '../ui/types';
import * as THREE from 'three';

export const LAW = {
  /** A second assault on the same person within this long (s) is the same crime. */
  assaultMemory: 60,
  /** Who sees an assault or a killing (m). */
  witnessRadius: 22,
  /** The alarm (crowd flees, guards come) reaches this far (m). */
  alarmRadius: 22,
  /** A guard notices a wanted player this close, in sight (m). */
  noticeRadius: 18,
  /** Guards attack a player wanted for murder (or resisting) this close, in sight (m). */
  attackRadius: 24,
  /** The talk starts when the guard is this close (m). */
  talkReach: 3,
  /** A guard who hasn't caught up after this long (s) gives up for now. */
  giveUpAfter: 30,
  /** After a talk (or a guard giving up) the watch leaves the player be this long (s). */
  quiet: 30,
  /** Further than this from the guard who came for you counts as running from the watch (m). */
  fleeDistance: 40,
  /** Enforcement checks per second. */
  rate: 4,
};

export interface LawHost {
  /** A game in progress (not the title, creation or loading). */
  playing(): boolean;
  /** Put the player outside the Carcer after serving a sentence. */
  releaseFromCarcer(): void | Promise<void>;
}

type Services = { combat?: CombatSystem; population?: NpcManager; crime?: CrimeSystem };

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();

export class LawSystem implements System {
  readonly name = 'law';
  /** After combat (20), so a blow's events are in before the watch looks around. */
  readonly priority = 30;
  private hooked = false;
  /** Victims of the player's assaults → when (game seconds) they were last struck. */
  private readonly assaulted = new Map<string, number>();
  /** The guard walking up to stop the player. */
  private confront: { npc: Npc; since: number } | null = null;
  private quietUntil = 0;
  private acc = 0;

  constructor(
    private readonly game: Game,
    private readonly host: LawHost,
  ) {}

  private get s(): Services {
    return this.game as unknown as Services;
  }

  // ------------------------------------------------------------------ crimes

  private hook() {
    const { combat, crime } = this.s;
    if (!combat || !crime) return;
    this.hooked = true;
    const ev = this.game.events;
    ev.on('combat:assault', (e) => this.onAssault(e.attackerId, e.victimId));
    ev.on('actor:killed', (e) => this.onKilled(e.victimId, e.killerId, e.tags));
    ev.on('combat:playerYielded', (e) => {
      if (e.context === 'arrest') setTimeout(() => this.openTalk(this.nearestGuard(12)), 400);
    });
    ev.on('crime:cleared', () => {
      if (this.s.crime && this.s.crime.totalBounty() <= 0) this.s.combat?.clearAggressor();
    });
  }

  private onAssault(attackerId: string, victimId: string) {
    const g = this.game;
    if (attackerId !== g.player?.id) return;
    const now = g.elapsed;
    const last = this.assaulted.get(victimId);
    this.assaulted.set(victimId, now);
    if (last !== undefined && now - last < LAW.assaultMemory) return;
    const at = this.positionOf(victimId);
    // The victim saw who hit them; so may others.
    const seen = new Set([victimId, ...(this.s.population?.witnesses(at, LAW.witnessRadius) ?? [])]);
    this.s.crime?.commit('vis', { witnessed: [...seen], victimId, district: this.district() });
    this.s.population?.alarm(at.x, at.z, LAW.alarmRadius, 'crime', g.player);
  }

  private onKilled(victimId: string, killerId: string | undefined, tags: readonly string[] | undefined) {
    const g = this.game;
    if (killerId !== g.player?.id || !tags?.includes('dead')) return;
    const victim = this.s.combat?.core.get(victimId);
    const innocent = this.assaulted.has(victimId) || (!!victim?.lawful && !!this.s.combat?.playerAggressor);
    this.assaulted.delete(victimId);
    if (!innocent) return;
    const at = this.positionOf(victimId);
    const seen = (this.s.population?.witnesses(at, LAW.witnessRadius) ?? []).filter((id) => id !== victimId);
    this.s.crime?.commit('homicidium', { witnessed: seen, victimId, district: this.district() });
    if (seen.length) this.s.population?.alarm(at.x, at.z, LAW.alarmRadius, 'crime', g.player);
  }

  private positionOf(id: string): THREE.Vector3 {
    const c = this.s.combat?.core.get(id);
    if (c) return new THREE.Vector3(c.position.x, c.position.y, c.position.z);
    return this.game.actors?.get(id)?.position.clone() ?? this.game.player.position.clone();
  }

  private district(): string | undefined {
    return (this.game as unknown as { locations?: { current(): { id: string } | null } }).locations?.current()?.id;
  }

  // ------------------------------------------------------------------ the watch

  lateUpdate(dt: number) {
    if (!this.hooked) this.hook();
    if (!this.hooked) return;
    this.acc += dt;
    if (this.acc < 1 / LAW.rate) return;
    this.acc = 0;
    // Old assaults are forgotten (killing someone hit long ago is still murder only if remembered).
    const now = this.game.elapsed;
    for (const [id, t] of this.assaulted) if (now - t > 600) this.assaulted.delete(id);
    if (!this.host.playing() || this.game.paused || this.game.ui?.top) return;
    this.enforce();
  }

  private enforce() {
    const { combat, crime, population: pop } = this.s;
    const p = this.game.player;
    if (!combat || !crime || !pop || !p) return;
    const response = crime.guardResponse();
    if (response === 'none') return this.endConfront();
    if (response === 'attack') {
      this.endConfront();
      for (const n of pop.near(p.position, LAW.attackRadius, (n) => pop.isGuard(n) && !n.isFighting() && !n.talking)) {
        if (!this.sees(n)) continue;
        combat.engage(n, p);
        pop.bark(n, 'guard', true);
      }
      return;
    }
    // A bounty, not yet a hunt: a guard comes to stop you (not in the middle of a fight).
    const now = this.game.elapsed;
    if (combat.active || now < this.quietUntil) return;
    if (!this.confront) {
      const guard = pop.near(p.position, LAW.noticeRadius, (n) => pop.isGuard(n) && !n.isFighting() && !n.talking).find((n) => this.sees(n));
      if (!guard || !pop.direct(guard, p.position.x, p.position.z, 3.2, LAW.talkReach * 0.6)) return;
      this.confront = { npc: guard, since: now };
      this.game.events.emit('ui:subtitle', { text: 'Stop right there!', speaker: guard.name, duration: 2.5 });
      return;
    }
    const g = this.confront.npc;
    if (g.dead || g.isFighting() || now - this.confront.since > LAW.giveUpAfter) {
      this.endConfront();
      this.quietUntil = now + LAW.quiet;
      return;
    }
    const d = Math.hypot(g.position.x - p.position.x, g.position.z - p.position.z);
    if (d > LAW.fleeDistance) {
      crime.flee();
      this.game.events.emit('ui:notify', { text: 'You ran from the watch — your bounty grows', kind: 'warning' });
      this.endConfront();
      this.quietUntil = now + LAW.quiet;
      return;
    }
    if (d <= LAW.talkReach) return this.openTalk(g);
    pop.direct(g, p.position.x, p.position.z, d > 8 ? 3.8 : 2.6, LAW.talkReach * 0.6);
  }

  /** Can this NPC see the player (head to chest, no wall between)? */
  private sees(n: Npc): boolean {
    const p = this.game.player.position;
    eye.set(n.position.x, n.position.y + 1.55, n.position.z);
    dir.set(p.x - eye.x, p.y + 1.2 - eye.y, p.z - eye.z);
    const d = dir.length();
    if (d < 1) return true;
    return !this.game.physics.raycast(eye, dir.normalize(), d - 0.4, Layer.World);
  }

  private nearestGuard(r: number): Npc | null {
    const pop = this.s.population;
    const p = this.game.player;
    return pop && p ? (pop.near(p.position, r, (n) => pop.isGuard(n) && !n.dead)[0] ?? null) : null;
  }

  private endConfront() {
    if (!this.confront) return;
    this.s.population?.undirect(this.confront.npc);
    this.confront = null;
  }

  /** The "Stop right there!" talk (also after the player gives up to the watch with Y). */
  openTalk(guard: Npc | null) {
    const { crime, combat } = this.s;
    const ui = this.game.ui;
    if (!crime || !ui || crime.bounty() <= 0 || ui.top) return;
    if (guard) {
      this.s.population?.direct(guard, guard.position.x, guard.position.z, 1, 5);
      guard.turnToward(Math.atan2(this.game.player.position.x - guard.position.x, this.game.player.position.z - guard.position.z), 99, 1);
    }
    const view = new ArrestView(crime, guard?.id ?? 'guard', guard?.name ?? 'Guard', guard?.title, (outcome) => {
      const now = this.game.elapsed;
      this.endConfront();
      this.quietUntil = now + LAW.quiet;
      if (outcome.jailed) {
        void this.host.releaseFromCarcer();
        const lost = outcome.jailed.lostProgress.length ? ` Your skills grew rusty (${outcome.jailed.lostProgress.join(', ')}).` : '';
        this.game.events.emit('ui:notify', { text: `${outcome.jailed.days} ${outcome.jailed.days === 1 ? 'day' : 'days'} in the Carcer.${lost}`, kind: 'warning' });
      }
      if (outcome.resisted && guard && !guard.dead) combat?.engage(guard, this.game.player);
    });
    ui.openDialogue(view);
  }
}

export interface ArrestOutcome {
  paid?: boolean;
  jailed?: { days: number; lostProgress: string[] };
  resisted?: boolean;
}

/**
 * The guard's talk as a DialogueView: the offer, then the guard's answer. Closing it before a
 * choice is resisting arrest.
 */
export class ArrestView implements DialogueView {
  line: DialogueLine;
  choices: DialogueChoiceView[] = [];
  ended = false;
  private acts: (() => void)[] = [];
  private outcome: ArrestOutcome = {};
  private decided = false;
  private fns = new Set<() => void>();

  constructor(
    private readonly crime: CrimeSystem,
    readonly npcId: string,
    readonly npcName: string,
    readonly npcTitle: string | undefined,
    private readonly onDone: (o: ArrestOutcome) => void,
  ) {
    const o = crime.arrestOptions();
    const murder = o.sentence === 'ad-ludum';
    this.line = {
      speaker: 'npc',
      text: murder
        ? `Murderer! There's ${o.bounty} denarii on your head. Pay the blood-price, or come to the Carcer.`
        : `Stop right there! You've broken the peace of Rome. Pay the ${o.fine} denarii, or come with me to the Carcer.`,
    };
    this.offer();
  }

  /** The choices from the crime rules as they stand now. */
  private offer() {
    const o = this.crime.arrestOptions();
    const list: { view: DialogueChoiceView; act: () => void }[] = [];
    list.push({
      view: { text: 'Pay the fine.', tag: { kind: 'service', label: `${o.fine} denarii` }, disabled: !o.canPay, disabledReason: "You haven't enough money." },
      act: () => {
        if (!this.crime.payFine()) return this.answer("You haven't the coin. Then it's the Carcer.");
        this.outcome.paid = true;
        this.answer('Then be on your way. And keep the peace.', true);
      },
    });
    if (o.persuade) {
      const p = o.persuade;
      list.push({
        view: { text: 'It was a misunderstanding, officer.', tag: { kind: 'skill', label: `Rhetoric ${p.difficulty}`, chance: p.chance } },
        act: () => {
          const r = this.crime.persuade();
          if (r.pass) this.answer(this.crime.bounty() > 0 ? 'Hm. A misunderstanding, then. Half of it stands. I have my eye on you.' : 'Hm. A misunderstanding, then. Go on.', true);
          else this.answer('Save your breath for the magistrate.');
        },
      });
    }
    if (o.bribe !== undefined) {
      list.push({
        view: { text: 'Perhaps we can come to an arrangement…', tag: { kind: 'bribe', label: `${o.bribe} denarii` }, disabled: !o.canBribe, disabledReason: "You haven't enough money." },
        act: () => {
          if (this.crime.bribe()) this.answer("I didn't see a thing. Move along.", true);
          else this.answer('Are you trying to bribe an officer of Rome?');
        },
      });
    }
    list.push({
      view: { text: `I'll come quietly. (The Carcer: ${o.jailDays} ${o.jailDays === 1 ? 'day' : 'days'})` },
      act: () => {
        const r = this.crime.goToJail(undefined, undefined, { anySentence: true });
        if (r) this.outcome.jailed = { days: r.days, lostProgress: r.lostProgress };
        this.answer('Wise. This way.', true);
      },
    });
    list.push({
      view: { text: "I won't be taken. (Resist arrest)" },
      act: () => {
        this.resist();
        this.answer('Then we do this the hard way!', true);
      },
    });
    this.choices = list.map((x) => x.view);
    this.acts = list.map((x) => x.act);
  }

  private resist() {
    this.crime.resistArrest();
    this.outcome.resisted = true;
  }

  /** The guard answers; `final` ends the talk after Continue, otherwise the offer stands again. */
  private answer(text: string, final = false) {
    this.line = { speaker: 'npc', text };
    if (final) {
      this.decided = true;
      this.choices = [];
      this.acts = [];
    } else this.offer();
    this.changed();
  }

  choose(i: number) {
    if (this.ended || this.choices[i]?.disabled) return;
    this.acts[i]?.();
  }

  advance() {
    if (this.decided) this.end();
  }

  end() {
    if (this.ended) return;
    // Walking away from the guard is resisting arrest.
    if (!this.decided) this.resist();
    this.ended = true;
    this.changed();
    this.onDone(this.outcome);
  }

  private changed() {
    for (const f of [...this.fns]) f();
  }

  onChange(fn: () => void) {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
}
