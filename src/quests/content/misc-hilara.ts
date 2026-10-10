/**
 * misc-hilara "Hilara" (docs/design/world-life.md §4.8 Q1, QUESTS I). Misc quest, no fighting.
 *
 * A Molossian bitch named Hilara went astray on the 8th day before the Ides of May. The painted notice
 * on the pier of the Basilica Paulli shop row (texts t10-canis, CONTENT.md T10 [G]) promises 20 sesterces
 * to whoever brings her to Tryphon the barber. Offered by that notice and its twin on board-forum, by
 * Tryphon's own talk, by Cerdo's cry and by the rumour pool, after mq-01.
 *
 *   start    ask round the Circus: Fuscus, the stable-lad at the Inn at the Starting Gates, has the lead  → hunt
 *   hunt     at dusk (11th hour to the 2nd watch) the strays come out in the yard behind the starting
 *            gates: three dogs and, with a bronze bulla, Hilara. Find her, then offer her a sausage
 *            (botulus, from the cook-shops)                                                              → follow
 *   follow   she trots 2–4 m behind, waits if the player runs ahead and goes back to the pack beyond
 *            40 m (stage hunt again). Bring her to Tryphon in his hours                                  → done
 *
 * Reward 5 den. (20 sesterces), `hilara-returned` (free haircuts, src/life/data/**), Fama plebs +2. The
 * dogs are the existing Quadruped (src/npc/props.ts), moved by a small system that exists only while the
 * quest runs and the player is near the yard.
 */
import * as THREE from 'three';
import { between } from '../../content/hours';
import type { Game, System } from '../../core/Game';
import { defineQuest, type QuestContext } from '../types';

export const QUEST_ID = 'misc-hilara';
const FUSCUS = 'npc-fuscus-carcerum';
const TRYPHON = 'npc-tryphon';
/** The Inn at the Starting Gates; the strays' yard lies 20 m west of it, behind the gates. */
const INN = 'caupona-carcerum';
const YARD_DX = -20;

/** A conversation node was reached. */
const hit = (e: { dialogueId: string; nodeId: string }, dialogue: string, node: string) => e.dialogueId === dialogue && e.nodeId === node;
const SAUSAGE = 'botulus';
/** Beyond this far from the player Hilara goes back to the pack (m). */
export const LOSE_DIST = 40;
/** The pack is built when the player is this near the yard (m) and gone beyond twice that. */
const NEAR = 150;

// ------------------------------------------------------------------ the pack

type Mode = 'pack' | 'follow';

interface DogRt {
  body: { root: THREE.Group; animate(dt: number, speed: number): void; dispose(): void };
  hilara: boolean;
  tx: number;
  tz: number;
  wait: number;
  /** Waypoints toward the player (nav grid A*), when the straight line is walled off. */
  path: { x: number; z: number }[];
  /** Seconds until the path is planned again (a failing search backs off). */
  repath: number;
}

/** The dogs of the yard: wander about its centre; Hilara follows the player once tempted. */
class Pack implements System {
  readonly name = 'hilara-pack';
  readonly priority = 60;
  mode: Mode = 'pack';
  readonly dogs: DogRt[] = [];
  private cx = 0;
  private cz = 0;
  private built = false;
  private acc = 0;
  private seed = 7;
  /** Hilara's place, for her prompt (a stored vector). */
  readonly at = new THREE.Vector3();
  private off: (() => void) | null = null;
  private busy = false;
  private hinted = false;

  constructor(private readonly game: Game) {
    const c = game.locations?.get(INN)?.position;
    this.cx = (c?.x ?? 0) + YARD_DX;
    this.cz = c?.z ?? 0;
  }

  private rnd() {
    // A tiny LCG: the pack must not touch the game's seeded streams.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  get hilara(): DogRt | undefined {
    return this.dogs.find((d) => d.hilara);
  }

  private floor(x: number, z: number): number | null {
    return this.game.population?.floorY(x, z) ?? null;
  }

  private ready(x: number, z: number): boolean {
    const g = this.game.population?.grid;
    return !g || (g.ready(x, z) && g.walkable(x, z));
  }

  /** Hilara is within `r` of a point (x, z). */
  near(x: number, z: number, r: number): boolean {
    const h = this.hilara;
    return !!h && Math.hypot(h.body.root.position.x - x, h.body.root.position.z - z) <= r;
  }

  update(dt: number) {
    const g = this.game;
    const p = g.player?.position;
    if (!p) return;
    this.acc += dt;
    if (this.acc >= 1) {
      this.acc = 0;
      this.manage(p);
    }
    if (!this.built) return;
    for (const d of this.dogs) this.move(d, dt, p);
    const h = this.hilara;
    if (h) this.at.set(h.body.root.position.x, h.body.root.position.y + 0.6, h.body.root.position.z);
    if (this.mode === 'follow' && h) {
      const d = Math.hypot(h.body.root.position.x - p.x, h.body.root.position.z - p.z);
      if (d > LOSE_DIST) this.lose();
    }
  }

  /** 1 Hz: build or clear the pack as the clock and the player's distance say. */
  private manage(p: THREE.Vector3Like) {
    const g = this.game;
    const d = Math.hypot(this.cx - p.x, this.cz - p.z);
    const dusk = between(g.time?.hour ?? 12, 'h11', 'v2');
    if (this.mode === 'follow') {
      if (!this.built) this.build(p.x + 3, p.z + 3, true);
      return;
    }
    // In the yard by day: the pack isn't there (said once).
    if (!dusk && !this.hinted && d < 14 && g.quests?.status(QUEST_ID)?.stage === 'hunt') {
      this.hinted = true;
      g.events.emit('rpg:notify', { text: 'Scraps, flies and a smell of dog. Fuscus said the pack comes out at dusk.', kind: 'info' });
    }
    if (this.built && (!dusk || d > NEAR * 2)) this.clear();
    else if (!this.built && dusk && d < NEAR) this.build(this.cx, this.cz, false);
    // Seen: within 16 m of her, the sausage is the next thing.
    if (this.built && this.near(p.x, p.z, 16) && g.quests?.status(QUEST_ID)?.running && g.quests.status(QUEST_ID)?.stage === 'hunt') {
      const q = g.quests.context(QUEST_ID);
      q.completeObjective('find');
      q.reveal('sausage');
    }
  }

  /** Make the dogs (a Quadruped each, scaled: Hilara is a big Molossian with a bronze bulla). */
  private build(x: number, z: number, onlyHilara: boolean) {
    if (this.busy || this.built) return;
    const y = this.floor(x, z);
    if (y === null || !g_scene(this.game)) return;
    this.busy = true;
    void import('../../npc/props').then(({ Quadruped }) => {
      this.busy = false;
      if (this.built || !g_scene(this.game)) return;
      const make = (hilara: boolean, i: number) => {
        const body = new Quadruped('dog');
        const s = hilara ? 1.6 : 0.95 + 0.1 * (i % 3);
        body.root.scale.setScalar(s);
        if (hilara) {
          const bulla = new THREE.Mesh(BULLA_GEO(), BULLA_MAT());
          bulla.position.set(0, 0.5, 0.31);
          bulla.castShadow = false;
          body.root.add(bulla);
        }
        const a = this.rnd() * Math.PI * 2;
        const r = hilara && !onlyHilara ? 2 : 1 + this.rnd() * 5;
        // On ground the nav grid calls walkable (the yard is a tight lane between walls).
        const sn = this.game.population?.nav?.snap(x + Math.cos(a) * r, z + Math.sin(a) * r, 5);
        const px = sn?.x ?? x + Math.cos(a) * r;
        const pz = sn?.z ?? z + Math.sin(a) * r;
        const py = this.floor(px, pz) ?? y;
        body.root.position.set(px, py, pz);
        body.root.rotation.y = this.rnd() * 6.28;
        this.game.scene.add(body.root);
        this.dogs.push({ body, hilara, tx: px, tz: pz, wait: this.rnd() * 3, path: [], repath: 0 });
      };
      make(true, 0);
      if (!onlyHilara) for (let i = 1; i <= 3; i++) make(false, i);
      this.built = true;
      this.promptOn();
    });
  }

  /** Take the dogs away. */
  clear() {
    this.promptOff();
    for (const d of this.dogs) d.body.dispose();
    this.dogs.length = 0;
    this.built = false;
  }

  dispose() {
    this.clear();
  }

  // ---------------------------------------------------------------- Hilara's prompt

  private promptOn() {
    const inter = this.game.interactions;
    if (!inter?.add || this.off || this.mode !== 'pack') return;
    this.off = inter.add({
      id: 'content:hilara',
      reach: 3.2,
      position: () => this.at,
      verb: () => (this.game.player?.inventory?.count(SAUSAGE) ? 'Offer a sausage' : 'Look'),
      label: () => 'Hilara',
      interact: (g) => {
        if ((g.player?.inventory?.count(SAUSAGE) ?? 0) > 0) {
          g.player?.inventory?.remove(SAUSAGE, 1, { reason: 'quest' });
          g.events.emit('content:interact', { id: 'hilara-sausage' });
        } else {
          g.events.emit('rpg:notify', { text: 'A big Molossian bitch with a bronze bulla looks at you, and at your empty hands. She wants something that smells of the cook-shop: a sausage.', kind: 'info' });
        }
      },
    }) as () => void;
  }

  private promptOff() {
    this.off?.();
    this.off = null;
  }

  // ---------------------------------------------------------------- behaviour

  /** Hilara decides to trust the player. */
  tempt() {
    this.mode = 'follow';
    this.promptOff();
    // The strays stay in the yard; Hilara leaves them.
    for (const d of this.dogs) {
      if (d.hilara) continue;
      d.body.dispose();
    }
    const h = this.hilara;
    this.dogs.length = 0;
    if (h) this.dogs.push(h);
  }

  /** Hilara slips away from the player, back to the pack (until dusk next time). */
  private lose() {
    this.mode = 'pack';
    this.clear();
    const q = this.game.quests;
    if (q?.status(QUEST_ID)?.running) {
      q.setStage(QUEST_ID, 'hunt');
      this.game.events.emit('rpg:notify', { text: 'Hilara slips away from you, back to the pack. She will be in the yard again at dusk.', kind: 'info' });
    }
  }

  private move(d: DogRt, dt: number, p: THREE.Vector3Like) {
    const r = d.body.root.position;
    let speed = 0;
    if (this.mode === 'follow' && d.hilara) {
      const dx = p.x - r.x;
      const dz = p.z - r.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.2) {
        speed = Math.min(5.5, 1.3 + (dist - 3) * 1.2);
        d.repath -= dt;
        if (d.repath <= 0) this.plan(d, p.x, p.z);
        // Round the corners by waypoints; the last leg stops 2.6 m short of the player.
        const wp = d.path[0];
        if (wp && Math.hypot(wp.x - r.x, wp.z - r.z) < 0.8) d.path.shift();
        const next = d.path[0];
        if (next) this.step(d, next.x, next.z, speed, dt);
        else this.step(d, p.x - (dx / dist) * 2.6, p.z - (dz / dist) * 2.6, speed, dt);
      } else d.path.length = 0;
    } else {
      d.wait -= dt;
      const left = Math.hypot(d.tx - r.x, d.tz - r.z);
      if (left > 0.4 && d.wait <= 0) {
        speed = 1.3;
        this.step(d, d.tx, d.tz, speed, dt);
      } else if (left <= 0.4 && d.wait <= 0) {
        d.wait = 1.5 + this.rnd() * 3.5;
        const a = this.rnd() * Math.PI * 2;
        const rr = 1 + this.rnd() * 6;
        d.tx = this.cx + Math.cos(a) * rr;
        d.tz = this.cz + Math.sin(a) * rr;
        const sn = this.game.population?.nav?.snap(d.tx, d.tz, 3);
        if (sn) {
          d.tx = sn.x;
          d.tz = sn.z;
        }
      }
    }
    d.body.animate(dt, speed);
  }

  /** Plan the walk to the player (about once a second; a failing search waits longer). */
  private plan(d: DogRt, x: number, z: number) {
    const nav = this.game.population?.nav;
    const r = d.body.root.position;
    if (!nav) {
      d.repath = 1;
      return;
    }
    const res = nav.findPath(r.x, r.z, x, z);
    if (res === 'busy') d.repath = 0.2;
    else if (!res) {
      d.path.length = 0;
      d.repath = 2.5;
    } else {
      d.path = res.length > 1 ? res.slice(0, -1) : [];
      d.repath = 1;
    }
  }

  /** One step toward (tx, tz), sliding along whichever axis is free (the nav grid knows the walls). */
  private step(d: DogRt, tx: number, tz: number, speed: number, dt: number) {
    const r = d.body.root.position;
    const dx = tx - r.x;
    const dz = tz - r.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    const k = Math.min(dist, speed * dt) / dist;
    let nx = r.x + dx * k;
    let nz = r.z + dz * k;
    const grid = this.game.population?.grid;
    // (A dog already standing on blocked ground may walk off it: only a step INTO the walls is refused.)
    if (grid && grid.ready(nx, nz) && !grid.walkable(nx, nz) && grid.walkable(r.x, r.z)) {
      if (grid.walkable(nx, r.z)) nz = r.z;
      else if (grid.walkable(r.x, nz)) nx = r.x;
      else {
        d.wait = 0.5;
        d.tx = r.x;
        d.tz = r.z;
        return;
      }
    }
    const y = this.floor(nx, nz);
    r.set(nx, y ?? r.y, nz);
    d.body.root.rotation.y = Math.atan2(dx, dz);
  }
}

const g_scene = (game: Game) => !!game.scene;

let bullaGeo: THREE.SphereGeometry | null = null;
let bullaMat: THREE.MeshStandardMaterial | null = null;
const BULLA_GEO = () => (bullaGeo ??= new THREE.SphereGeometry(0.03, 8, 6));
const BULLA_MAT = () => (bullaMat ??= new THREE.MeshStandardMaterial({ color: '#c8a23a', metalness: 0.8, roughness: 0.35 }));

let pack: Pack | null = null;

/** Start the pack's system (the quest is in stage hunt or follow). Idempotent. */
function ensurePack(game: Game): Pack {
  if (!pack) {
    pack = new Pack(game);
    game.addSystem(pack);
  }
  return pack;
}

function dropPack(game: Game) {
  if (!pack) return;
  const p = pack;
  pack = null;
  if (game.removeSystem) game.removeSystem(p);
  else p.dispose();
}

/**
 * Is Hilara with the player at a place (the dialogue with Tryphon asks)? True without a pack in the
 * world (a build with no scene, or just after a load before she is made): she is "with" the player.
 */
export function hilaraNear(game: Game, x: number, z: number, r = 14): boolean {
  if (!pack || !pack.hilara) return true;
  return pack.near(x, z, r);
}

function setup(q: QuestContext) {
  const mode: Mode = q.stage === 'follow' ? 'follow' : 'pack';
  const p = ensurePack(q.game);
  if (mode === 'follow') p.tempt();
}

export default defineQuest({
  id: QUEST_ID,
  title: 'Hilara',
  latin: 'Canis Hilara',
  category: 'misc',
  giver: TRYPHON,
  summary: 'A Molossian bitch named Hilara has gone astray. Tryphon the barber will pay twenty sesterces to whoever brings her back.',
  stages: {
    start: {
      journal: 'A painted notice on the pier of the Basilica Paulli shops said a Molossian bitch named Hilara had gone astray on the eighth day before the Ides, and that Tryphon the barber would pay twenty sesterces to whoever brought her back. Dogs get lost near the Circus. I meant to ask round the starting gates.',
      objectives: [{ id: 'ask', text: 'Ask round the Circus for a big Molossian bitch', target: { kind: 'npc', id: FUSCUS } }],
      next: 'hunt',
    },
    hunt: {
      journal: 'Fuscus, the stable-lad at the Inn at the Starting Gates, said a big Molossian with a bronze bulla runs with the stray pack in the yard behind the gates, but only at dusk. She will take a sausage from a stranger, he said, and nothing else.',
      objectives: [
        { id: 'find', text: 'Find the stray pack behind the starting gates (11th hour to the 2nd watch)', target: { kind: 'location', id: INN } },
        { id: 'sausage', text: 'Win Hilara over with a sausage from a cook-shop', hidden: true, target: { kind: 'location', id: INN } },
      ],
      onEnter: (q) => {
        setup(q);
      },
    },
    follow: {
      journal: 'I held out a sausage and Hilara took it, then took me: she trotted after me as though she had never been anywhere else. Now to Tryphon, in the shops of the Basilica Paulli.',
      objectives: [{ id: 'bring', text: 'Bring Hilara to Tryphon the barber (stay within 40 m)', target: { kind: 'npc', id: TRYPHON } }],
      onEnter: setup,
    },
    done: {
      journal: 'Tryphon took Hilara’s great head in both hands and told her what he thought of her. Then he paid me the twenty sesterces and said my shaves were free for as long as his razor held.',
      onEnter: (q) => {
        q.setFlag('hilara-returned', true);
        dropPack(q.game);
      },
      end: 'complete',
    },
  },
  rewards: { denarii: 5, reputation: [{ faction: 'plebs', amount: 2 }] },
  on: {
    'dialogue:node': (q, e) => {
      if (hit(e, FUSCUS, 'fuscusLead') && q.stage === 'start') q.completeObjective('ask');
      if (hit(e, 'misc-hilara-tryphon', 'hilaraReturned') && q.stage === 'follow') {
        q.completeObjective('bring');
        q.setStage('done');
      }
    },
    'content:interact': (q, e) => {
      if (e.id === 'hilara-sausage' && q.stage === 'hunt') {
        q.completeObjective('find');
        q.setStage('follow');
      }
    },
    'save:loaded': (q) => {
      if (q.stage === 'hunt' || q.stage === 'follow') {
        dropPack(q.game);
        setup(q);
      }
    },
  },
});
