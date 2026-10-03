/**
 * Water: the Tiber and Agrippa's canal (surface + shader), the stone quays of the river port and
 * the Emporium, reeds on the natural banks, and swimming. `buildWater` is called by buildRome
 * after the terrain; it installs `game.water` for gameplay queries:
 *
 *   game.water.levelAt(x, z)   // surface y, or null on dry land
 *   game.water.depthAt(x, z)   // surface minus ground (≤ 0 on dry land)
 *   game.water.currentAt(x, z) // downstream current, m/s
 *   game.water.swim.tuning     // swimming (crossable, current scale…)
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import type * as Atlas from '../../data/atlas';
import { registerColliders } from '../../gfx/MeshBuilder';
import { Forest, vegetation } from '../../arch/vegetation';
import { WORLD_SCALE } from '../coords';
import type { Heightmap } from '../terrain/heightmap';
import { chain, resolveQuays } from '../terrain/riverbanks';
import { bodyAt, currentOf, makeWaterBodies, type BodyHit, type WaterBody } from './bodies';
import { buildQuay } from './quays';
import { placeReeds } from './reeds';
import { buildWaterSurface } from './surfaceMesh';
import { SwimSystem } from './swim';
import { createWaterMaterial, makeWaterNormalTexture, TIBER_COLORS, type WaterUniforms } from './waterMaterial';

declare module '../../core/Game' {
  interface Game {
    water: WaterService;
  }
}

export class WaterService implements System {
  readonly name = 'water';
  readonly priority = 60;
  readonly group = new THREE.Group();
  swim!: SwimSystem;
  uniforms!: WaterUniforms;
  surface: THREE.Mesh | null = null;
  reeds: Forest | null = null;
  /** Stair landings at the quays (game space). */
  landings: THREE.Vector3[] = [];

  constructor(
    readonly game: Game,
    readonly hm: Heightmap,
    readonly bodies: WaterBody[],
  ) {
    this.group.name = 'water';
  }

  hitAt(x: number, z: number): BodyHit | null {
    return bodyAt(this.bodies, x, z);
  }

  /** Water surface height at (x, z), or null where there is no water body. */
  levelAt(x: number, z: number): number | null {
    const h = this.hitAt(x, z);
    if (!h) return null;
    return this.hm.heightAt(x, z) < h.body.level ? h.body.level : null;
  }

  /** Water depth (surface minus ground); negative or -Infinity on dry land. */
  depthAt(x: number, z: number): number {
    const h = this.hitAt(x, z);
    return h ? h.body.level - this.hm.heightAt(x, z) : -Infinity;
  }

  currentAt(x: number, z: number, out = { x: 0, z: 0 }) {
    const h = this.hitAt(x, z);
    if (!h) {
      out.x = out.z = 0;
      return out;
    }
    return currentOf(h, out);
  }

  update(dt: number) {
    if (this.uniforms) this.uniforms.uTime.value = (this.uniforms.uTime.value + dt) % 3600;
  }
}

export async function buildWater(game: Game, atlas: typeof Atlas, hm: Heightmap): Promise<void> {
  const S = WORLD_SCALE;
  const bodies = makeWaterBodies(atlas.RIVERS);
  const water = new WaterService(game, hm, bodies);
  game.water = water;
  game.addSystem(water);

  // ---- surface
  const data = buildWaterSurface(bodies, (x, z) => hm.heightAt(x, z), { minX: hm.minX, maxX: hm.maxX, minZ: hm.minZ, maxZ: hm.maxZ }, 4);
  let heightTex: THREE.Texture | null = game.terrain?.uniforms?.tHeight.value ?? null;
  if (!heightTex) {
    const t = new THREE.DataTexture(hm.heights, hm.nx, hm.nz, THREE.RedFormat, THREE.FloatType);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    heightTex = t;
  }
  const lin = (hex: number) => new THREE.Color(hex);
  water.uniforms = {
    tHeight: { value: heightTex },
    uGrid: { value: new THREE.Vector4(hm.minX, hm.minZ, hm.spacing, 0) },
    uGridN: { value: new THREE.Vector2(hm.nx, hm.nz) },
    tWaterN: { value: makeWaterNormalTexture() },
    uTime: { value: 0 },
    uDeep: { value: lin(TIBER_COLORS.deep) },
    uShallow: { value: lin(TIBER_COLORS.shallow) },
    uSilt: { value: lin(TIBER_COLORS.silt) },
    uGlint: { value: 6 },
  };
  if (data.index.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('aFlow', new THREE.BufferAttribute(data.flow, 2));
    const normals = new Float32Array(data.positions.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, createWaterMaterial(water.uniforms));
    mesh.name = 'water-surface';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.renderOrder = 1;
    water.surface = mesh;
    water.group.add(mesh);
  }

  // ---- quays
  const features = hm.features;
  const quaySkip: { body: string; side: number; s0: number; s1: number }[] = [];
  for (const river of atlas.RIVERS) {
    const rqs = resolveQuays(features?.quays ?? [], river.id, chain(river.centerline));
    for (const rq of rqs) {
      quaySkip.push({ body: river.id, side: rq.side, s0: rq.s0 * S, s1: rq.s1 * S });
      const q = buildQuay(river, rq, (x, z) => hm.heightAt(x, z), S);
      const group = q.builder.build(rq.quay.id);
      registerColliders(game, q.colliders, undefined, water);
      if (game.world) game.world.add(`quay:${rq.quay.id}`, group, { cullDistance: 1600, parent: water.group });
      else water.group.add(group);
      water.landings.push(...q.landings);
    }
  }

  // ---- reeds on the natural banks
  const bridgeEnds: [number, number][] = [];
  for (const b of atlas.BRIDGES) {
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      bridgeEnds.push([(b.a[0] + (b.b[0] - b.a[0]) * t) * S, (b.a[1] + (b.b[1] - b.a[1]) * t) * S]);
    }
  }
  const spots = placeReeds(bodies, hm, {
    skip: quaySkip,
    avoid: bridgeEnds,
    clear: 16,
    avoidPolys: atlas.ISLANDS.map((i) => i.outline.map((p) => [p[0] * S, p[1] * S] as const)),
  });
  if (spots.length) {
    const forest = new Forest({ near: 150, far: 150, castShadow: true, seed: 113 });
    for (const s of spots) forest.add('reeds', s.x, s.y, s.z, { scale: s.scale, rotationY: s.rot });
    water.group.add(forest.build());
    vegetation(game).addForest(forest);
    water.reeds = forest;
  }

  // ---- swimming
  water.swim = game.addSystem(new SwimSystem(game, (x, z) => water.hitAt(x, z)));

  game.scene.add(water.group);
}

export { makeWaterBodies, bodyAt, currentOf } from './bodies';
export type { WaterBody, BodyHit } from './bodies';
