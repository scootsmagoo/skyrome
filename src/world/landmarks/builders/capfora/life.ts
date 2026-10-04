/**
 * Things the capfora landmarks hand to the running game once it is ready, rather than baking them
 * into their static meshes:
 *
 *  - TREES: groves (the Asylum's two woods, laurels by the temples, figs in the cliff) planted in ONE
 *    shared instanced `Forest` per flush instead of one per landmark, so every grove on the
 *    Capitoline and in the Fora costs a single set of draw calls per species.
 *  - LAMPS: braziers on the altars, lamps at the temple doors and torches at the gates, requested
 *    from the sky module's light pool (`game.lights`, installed only after the world is built).
 *    Altar fires burn day and night; lamps and torches are lit at dusk (`night: true`).
 *  - READABLE THINGS: every inscription spot with a text gets an "E — Read" interaction that opens
 *    the Latin and an English gloss in the book reader, so the landmarks have something to engage
 *    with now. The gameplay team can replace this by wiring `PlacedLandmark.spots` generically; the
 *    ids are `capfora:<landmark>:<spot>` so a later generic pass can skip them.
 *
 * Builders run in LOCAL space; this module converts to world space with the same placement
 * formula `buildLandmarks()` uses (`frameOf`). Everything is a no-op without a running game (the
 * unit tests build landmarks against a bare `{ heightmap }`), and nothing here is created per frame.
 */
import * as THREE from 'three';
import type { Game, System } from '../../../../core/Game';
import type { ColliderSpec, MeshBuilder } from '../../../../gfx/MeshBuilder';
import { Draw } from '../../../../arch/fabric/draw';
import { placeProp } from '../../../../arch/props/props';
import { Forest } from '../../../../arch/vegetation/Forest';
import type { TreeSpecies } from '../../../../arch/vegetation/species';
import { vegetation } from '../../../../arch/vegetation/system';
import type { LandmarkContext } from '../../types';
import { frameOf, type CapSpot } from './frame';

export interface TreeReq {
  sp: TreeSpecies;
  x: number;
  z: number;
  /** Scale (1 = species default). */
  s?: number;
  /** Ground offset (default: the terrain under the trunk). */
  y?: number;
}

export type LampKind = 'brazier' | 'lamp' | 'torch';

interface Pending {
  /** Bumped on every request, so the flush can wait for a burst of builds to finish. */
  version: number;
  trees: { sp: TreeSpecies; p: THREE.Vector3; s: number }[];
  lamps: { p: THREE.Vector3; kind: LampKind }[];
  reads: { id: string; p: THREE.Vector3; title: string; text: string }[];
  system: LifeSystem | null;
}

const pending = new WeakMap<object, Pending>();

function live(ctx: Pick<LandmarkContext, 'game'>): Game | null {
  const g = ctx.game as Game | undefined;
  return g && typeof (g as { addSystem?: unknown }).addSystem === 'function' && g.scene ? g : null;
}

function queue(game: Game): Pending {
  let q = pending.get(game);
  if (!q) {
    q = { version: 0, trees: [], lamps: [], reads: [], system: null };
    pending.set(game, q);
  }
  if (!q.system) {
    q.system = new LifeSystem(game, q);
    game.addSystem(q.system);
  }
  q.version++;
  return q;
}

/** Local → world point for the landmark being built. */
function toWorld(ctx: Pick<LandmarkContext, 'game' | 'lm'>, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyMatrix4(frameOf(ctx.game, ctx.lm).matrix);
}

/**
 * Plant trees (local x, z on the terrain) and give them trunk colliders in the landmark's builder.
 * Colliders are added even without a running game so walkability tests see them.
 */
export function plantTrees(ctx: LandmarkContext, b: MeshBuilder, trees: TreeReq[]) {
  const game = live(ctx);
  const q = game ? queue(game) : null;
  for (const t of trees) {
    const y = t.y ?? ctx.groundAt(t.x, t.z) - 0.05;
    const s = t.s ?? 1;
    const r = (t.sp === 'plane' ? 0.45 : t.sp === 'umbrella_pine' ? 0.4 : t.sp === 'cypress' ? 0.25 : 0.22) * s;
    if (t.sp !== 'oleander' && t.sp !== 'reeds') b.collider({ kind: 'cylinder', center: new THREE.Vector3(t.x, y + 1.5, t.z), halfHeight: 1.5, radius: r } as ColliderSpec);
    q?.trees.push({ sp: t.sp, p: toWorld(ctx, t.x, y, t.z), s });
  }
}

/** A light from the sky module's pool at a local point (flame position). */
export function addLamp(ctx: LandmarkContext, x: number, y: number, z: number, kind: LampKind = 'lamp') {
  const game = live(ctx);
  if (!game) return;
  queue(game).lamps.push({ p: toWorld(ctx, x, y, z), kind });
}

/**
 * A torch in an iron bracket on a wall face (local point on the face, `rotY` turns the bracket's
 * −z out of the wall) and its light, lit at dusk.
 */
export function torch(ctx: LandmarkContext, b: MeshBuilder, x: number, y: number, z: number, rotY: number) {
  placeProp(new Draw(b), 'torch_bracket', x, y, z, rotY, { collide: false });
  addLamp(ctx, x - Math.sin(rotY) * 0.34, y + 0.62, z - Math.cos(rotY) * 0.34, 'torch');
}

/** A bronze brazier on its tripod (always burning) at a local ground point. */
export function brazier(ctx: LandmarkContext, b: MeshBuilder, x: number, y: number, z: number) {
  placeProp(new Draw(b), 'brazier', x, y, z, 0);
  addLamp(ctx, x, y + 0.85, z, 'brazier');
}

/** A bronze lampstand (candelabrum) with an oil lamp, lit at dusk. */
export function lampstand(ctx: LandmarkContext, b: MeshBuilder, x: number, y: number, z: number) {
  placeProp(new Draw(b), 'lampstand', x, y, z, 0);
  addLamp(ctx, x, y + 1.45, z, 'lamp');
}

/** "Read" interactions for every inscription spot that carries a text. */
export function addReadables(ctx: LandmarkContext, spots: CapSpot[]) {
  const game = live(ctx);
  if (!game) return;
  const q = queue(game);
  for (const s of spots) {
    if (s.kind !== 'inscription' || !s.text) continue;
    // The thing read sits ~1.4 m above the spot, a little in front of where the reader stands.
    const h = s.heading ?? 0;
    const p = s.position.clone().add(new THREE.Vector3(Math.sin(h) * 1.2, 1.4, Math.cos(h) * 1.2));
    const wp = toWorld(ctx, p.x, p.y, p.z);
    const text = `${s.text.split(' / ').join('\n')}\n\n*${s.gloss ?? ''}*`;
    q.reads.push({ id: `capfora:${ctx.lm.id}:${s.id}`, p: wp, title: s.label ?? ctx.lm.name, text });
  }
}

/** Light pool parameters per lamp kind (warm flame; braziers are always-burning fires). */
const LAMP: Record<LampKind, { intensity: number; distance: number; night: boolean; glow: number; flicker: number }> = {
  brazier: { intensity: 22, distance: 11, night: false, glow: 0.55, flicker: 0.45 },
  torch: { intensity: 14, distance: 9, night: true, glow: 0.35, flicker: 0.4 },
  lamp: { intensity: 7, distance: 5, night: true, glow: 0.18, flicker: 0.25 },
};

class LifeSystem implements System {
  readonly name = 'capfora-life';
  /** Just before the world registry's culling (95 is the registry; 100 the camera). */
  readonly priority = 94;
  private seen = -1;
  private quiet = 0;

  constructor(
    private readonly game: Game,
    private readonly q: Pending,
  ) {}

  lateUpdate() {
    const { game, q } = this;
    // Flush once the world is complete: the sky (and its light pool) is installed after every
    // landmark is built; without a sky, after ~3 s with no new requests. One flush means one
    // shared Forest for every grove.
    if (q.version !== this.seen) {
      this.seen = q.version;
      this.quiet = 0;
    } else this.quiet++;
    if (!game.lights && this.quiet < 180) return;
    if (q.trees.length) {
      const f = new Forest({ near: 150, far: 1700, seed: 113 + q.trees.length });
      for (const t of q.trees) f.add(t.sp, t.p.x, t.p.y, t.p.z, { scale: t.s });
      q.trees.length = 0;
      f.group.name = 'capfora:groves';
      game.scene.add(f.build());
      vegetation(game).addForest(f);
    }
    if (q.lamps.length && game.lights) {
      for (const l of q.lamps) {
        const o = LAMP[l.kind];
        game.lights.request({ position: l.p, intensity: o.intensity, distance: o.distance, night: o.night, glow: o.glow, flicker: o.flicker, priority: l.kind === 'brazier' ? 1.3 : 1 });
      }
      q.lamps.length = 0;
    }
    if (q.reads.length && game.interactions) {
      for (const r of q.reads) {
        game.interactions.add({
          id: r.id,
          position: () => r.p,
          reach: 3.2,
          verb: () => 'Read',
          label: () => r.title,
          interact: (g) => g.ui?.openBook({ title: r.title, kind: 'tablet', text: r.text }),
        });
      }
      q.reads.length = 0;
    }
    // Stay registered (one check a frame) while something still waits for its service: the light
    // pool only arrives with the sky, after the world is built.
    if (!q.trees.length && !q.reads.length && !q.lamps.length) {
      game.removeSystem(this);
      q.system = null;
    }
  }
}
