/**
 * People on the Capitoline and in the Imperial Fora, until the population crew wires
 * `PlacedLandmark.spots` generically: everyone `people.ts` puts at the 'npc', 'vendor' and 'stall'
 * spots (and a few benches) appears as a procedural humanoid in the right dress, idling in place
 * (working, praying, cheering, sitting), turning to look at you when you come close, with an
 * "E — Talk" that opens a short conversation in the dialogue panel.
 *
 * Cheap by construction: only people within SHOW_R of the player are in the scene (at most
 * MAX_SHOWN, nearest first); avatars are built lazily, at most two a frame, and kept for reuse;
 * nobody walks, so there are no character controllers, only a static cylinder on the NPC layer so
 * you can't walk through them. Ids are `capfora:<landmark>:<spot>[:k]`, so a generic pass over
 * the spots can skip these.
 */
import * as THREE from 'three';
import type { LocomotionState } from '../../../../actors/Actor';
import { createHumanoid, type HumanoidAvatar } from '../../../../actors/avatar/HumanoidAvatar';
import { randomAppearance } from '../../../../actors/avatar/variants';
import type { Game, System } from '../../../../core/Game';
import { Layer } from '../../../../core/Physics';
import { Rng } from '../../../../core/Rng';
import type { DialogueChoiceView, DialogueLine, DialogueView } from '../../../../ui/types';
import type { LandmarkContext } from '../../types';
import { frameOf, type CapSpot } from './frame';
import { live, toWorld } from './life';
import { peopleAt, type PersonDef, type PersonPlace } from './people';

/** Shown within this distance of the player (m), hidden beyond HIDE_R. */
export const SHOW_R = 55;
const HIDE_R = 68;
const MAX_SHOWN = 32;
/** Turn the head to the player within this distance (m). */
const LOOK_R = 5;

const IDLE: LocomotionState = { speed: 0, forwardSpeed: 0, strafeSpeed: 0, verticalSpeed: 0, grounded: true, sprinting: false, sneaking: false, turnRate: 0 };

interface Person {
  id: string;
  pos: THREE.Vector3;
  heading: number;
  place: PersonPlace;
  avatar: HumanoidAvatar | null;
  collider: ReturnType<Game['physics']['addCylinder']> | null;
  shown: boolean;
  want: boolean;
  snapped: boolean;
  /** Where the "Talk" prompt aims (the head). */
  talkAt: THREE.Vector3;
  looking: boolean;
  nextGesture: number;
  d2: number;
}

const crowds = new WeakMap<Game, CrowdSystem>();

/** Queue the people at a landmark's spots (no-op without a running game). */
export function addPeople(ctx: LandmarkContext, spots: CapSpot[]) {
  const game = live(ctx);
  if (!game) return;
  let sys = crowds.get(game);
  if (!sys) {
    sys = new CrowdSystem(game);
    crowds.set(game, sys);
    game.addSystem(sys);
  }
  const rotY = frameOf(ctx.game, ctx.lm).rotY;
  for (const p of peopleAt(ctx.lm.id, spots)) {
    const w = toWorld(ctx, p.position.x, p.position.y, p.position.z);
    sys.add(`capfora:${ctx.lm.id}:${p.id}`, w, p.heading + rotY, p);
  }
}

export class CrowdSystem implements System {
  readonly name = 'capfora-crowd';
  readonly priority = 55;
  readonly people: Person[] = [];
  private acc = 1;
  private readonly head = new THREE.Vector3();

  constructor(private readonly game: Game) {}

  add(id: string, pos: THREE.Vector3, heading: number, place: PersonPlace) {
    const rng = new Rng(id);
    const seated = place.idle === 'sit' || place.idle === 'sitGround';
    const talkAt = new THREE.Vector3(pos.x, pos.y + (seated ? 1.0 : 1.5), pos.z);
    const person: Person = { id, pos, heading, place, avatar: null, collider: null, shown: false, want: false, snapped: false, talkAt, looking: false, nextGesture: rng.range(3, 12), d2: Infinity };
    this.people.push(person);
    this.game.interactions?.add({
      id,
      position: () => person.talkAt,
      reach: 2.6,
      verb: () => 'Talk',
      label: () => place.def.name,
      enabled: () => person.shown,
      interact: (g) => {
        person.avatar?.lookAt(this.head);
        g.ui?.openDialogue(new SmallTalk(id, place.def));
      },
    });
  }

  update(dt: number) {
    const p = this.game.player?.position;
    if (!p) return;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.acc = 0;
      this.select(p);
    }
    this.head.set(p.x, p.y + 1.6, p.z);
    let built = 0;
    for (const s of this.people) {
      if (s.want && !s.shown) {
        if (s.avatar || built < 2) {
          if (!s.avatar) built++;
          this.show(s);
        }
      } else if (!s.want && s.shown) this.hide(s);
      if (!s.shown || !s.avatar) continue;
      s.avatar.update(dt, IDLE);
      // Look at the player when close, and now and then a gesture.
      const near = s.d2 < LOOK_R * LOOK_R;
      if (near !== s.looking) {
        s.looking = near;
        s.avatar.lookAt(near ? this.head : null);
      }
      s.nextGesture -= dt;
      if (s.nextGesture <= 0) {
        s.nextGesture = 7 + Math.random() * 10;
        const g = s.place.def.gesture;
        if (g && s.place.idle !== 'sit' && s.place.idle !== 'sitGround' && !s.avatar.isBusy()) s.avatar.play(g);
      }
    }
  }

  /** Who should be in the scene: within SHOW_R (HIDE_R once shown), nearest MAX_SHOWN. */
  private select(p: THREE.Vector3) {
    const near: Person[] = [];
    for (const s of this.people) {
      const dx = s.pos.x - p.x;
      const dz = s.pos.z - p.z;
      const dy = s.pos.y - p.y;
      s.d2 = dx * dx + dz * dz + dy * dy * 0.25;
      const r = s.shown ? HIDE_R : SHOW_R;
      s.want = s.d2 < r * r;
      if (s.want) near.push(s);
    }
    if (near.length > MAX_SHOWN) {
      near.sort((a, b) => a.d2 - b.d2);
      for (let i = MAX_SHOWN; i < near.length; i++) near[i].want = false;
    }
  }

  private show(s: Person) {
    const g = this.game;
    if (!s.snapped) {
      // Stand on whatever is under the spot (a step, the edge of a podium), if it is close.
      s.snapped = true;
      const y = g.physics.groundHeight(s.pos.x, s.pos.z, s.pos.y + 1.0, 2.2);
      if (y !== null && Math.abs(y - s.pos.y) < 0.7) {
        s.talkAt.y += y - s.pos.y;
        s.pos.y = y;
      }
    }
    if (!s.avatar) {
      const app = randomAppearance(new Rng(s.id), s.place.role);
      // Nobody in a forum crowd goes armed.
      app.weapon = 'none';
      app.shield = undefined;
      s.avatar = createHumanoid(app, { lod: 'auto' });
      s.avatar.root.name = s.id;
      s.avatar.setIdleLoop(s.place.idle);
    }
    s.avatar.root.position.copy(s.pos);
    s.avatar.root.rotation.y = s.heading;
    g.scene.add(s.avatar.root);
    const seated = s.place.idle === 'sit' || s.place.idle === 'sitGround';
    const hh = seated ? 0.55 : 0.85;
    s.collider = g.physics.addCylinder({ x: s.pos.x, y: s.pos.y + hh, z: s.pos.z }, hh, 0.28, { owner: s, layer: Layer.Npc });
    s.shown = true;
  }

  private hide(s: Person) {
    if (s.avatar) this.game.scene.remove(s.avatar.root);
    if (s.collider) this.game.physics.removeCollider(s.collider);
    s.collider = null;
    s.shown = false;
    s.looking = false;
  }

  /** How many are in the scene now (tests, the debug overlay). */
  shownCount() {
    let n = 0;
    for (const s of this.people) if (s.shown) n++;
    return n;
  }
}

/**
 * A conversation with one of them: the greeting, then any of their topics, then farewell. Drives
 * the game's dialogue panel through the same `DialogueView` the dialogue engine provides.
 */
export class SmallTalk implements DialogueView {
  readonly npcName: string;
  readonly npcTitle?: string;
  line: DialogueLine;
  choices: DialogueChoiceView[] = [];
  ended = false;
  private asked = new Set<number>();
  private listeners = new Set<() => void>();

  constructor(
    readonly npcId: string,
    private readonly def: PersonDef,
  ) {
    this.npcName = def.name;
    this.npcTitle = def.title;
    this.line = { speaker: 'npc', text: def.greet };
    this.refresh();
  }

  private refresh() {
    const topics = this.def.topics ?? [];
    this.choices = [...topics.map((t, i) => ({ text: t.ask, seen: this.asked.has(i) })), { text: 'Farewell.', exit: true }];
  }

  choose(index: number) {
    const topics = this.def.topics ?? [];
    if (index >= topics.length) return this.end();
    this.asked.add(index);
    this.line = { speaker: 'npc', text: topics[index].answer };
    this.refresh();
    this.emit();
  }

  advance() {
    if (!this.choices.length) this.end();
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    this.emit();
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
