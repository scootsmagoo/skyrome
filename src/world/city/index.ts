/**
 * The city fabric of Rome (AD 113): streets, blocks of insulae / domus / shops / horrea, Servian
 * wall remnants and gates, aqueduct arcades, gardens and trees, street furniture, and the street
 * graph for NPC navigation (`game.streets`).
 *
 * Pipeline: plan.ts (pure planning over a class raster) → far massing for every block (massing.ts)
 * → street work per cell (roads.ts) → walls / gates / aqueducts (monuments.ts) → trees and grass
 * → street graph (network.ts) → CityStreamer (lazy detail near the player).
 *
 * `extent: 'core'` builds detailed blocks and streets for the atlas core (+150 m) and the golden-
 * path corridors, and far massing for the rest of the city; `extent: 'city'` streams detail
 * everywhere. Colliders of the far massing, the trees, walls and arcades exist only near the player
 * (ProximityColliders). The city tells the terrain dressing which ground it dresses itself
 * (`coversGround`, `ownsTrees`).
 */
import { FountainSpray, clearSpray } from './spray';
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type * as Atlas from '../../data/atlas';
import { interiorLamp, whenTexturesLoaded } from '../../gfx/materials';
import { GrassField } from '../../arch/vegetation/Grass';
import { vegetation } from '../../arch/vegetation/system';
import type { Spot } from '../../arch/fabric/types';
import { WORLD_SCALE, toGame } from '../coords';
import type { Heightmap } from '../terrain/heightmap';
import { BatchPool } from './batches';
import { renderBreakdown } from './debug';
import { auditReach, auditRoadEnds, summarizeRoadEnds } from './audit';
import { FlatSoup, blockFarGeometry, layoutBlock, ribbon, type LotMass } from './massing';
import { buildMonuments } from './monuments';
import { buildStreetGraph, type StreetGraph } from './network';
import { inRects, planCity, rectsBounds, scaleBounds, type CityPlan } from './plan';
import { K } from './raster';
import { cellAdder, cellKey, streetWork } from './roads';
import { CityLamps } from './lamps';
import { lifeWork, torchFlames, torchLamp } from './life';
import { CityStreamer, addColliders, type BlockRec, type CellRec } from './streamer';
import type { ColliderSpec } from '../../gfx/MeshBuilder';
import type { RAPIER } from '../../core/Physics';
import { ProximityColliders, type ColliderHost } from './proximity';
import { TreeLayer } from './trees';
import { placeTrees } from './vegetation';

export interface CityService {
  plan: CityPlan;
  pool: BatchPool;
  streamer: CityStreamer;
  lamps: CityLamps;
  trees: TreeLayer;
  grass: GrassField | null;
  /** Exact NPC spots of a block once its full detail has been built (else null). */
  blockSpots(blockId: string): Spot[] | null;
  /** Ground class at a game position (see raster.ts `K`). */
  classAt(x: number, z: number): number;
  /**
   * Does the city dress this ground itself (streets, squares, aprons, yards, blocks and walls, and
   * in its detail area also the grass and trees of the open ground)? The terrain dressing
   * (terrain/dress.ts) plants no grass, stones, kerbs or trees there. Landmark footprints and the
   * river are left to their own builders.
   */
  coversGround(x: number, z: number): boolean;
  /** Does the city plant the trees here (gardens, slopes and scraps of its regions)? */
  ownsTrees(x: number, z: number): boolean;
  /** Live city colliders near the player (debug / tests). */
  colliders(): { massing: number; trees: number; monuments: number };
  /** Build everything due around a position now (after a teleport). */
  prime(pos: THREE.Vector3Like): void;
  stats: Record<string, number>;
}

declare module '../../core/Game' {
  interface Game {
    city: CityService;
    streets: StreetGraph;
  }
}

export type { StreetGraph } from './network';

export async function buildCity(
  game: Game,
  atlas: typeof Atlas,
  hm: Heightmap,
  opts: { extent: 'core' | 'city'; onProgress?: (f: number, label: string) => void; spawn?: THREE.Vector3Like },
): Promise<void> {
  const report = opts.onProgress ?? (() => {});
  // `?city=0` skips the fabric (for measuring the rest of the world without it).
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('city') === '0') return;
  const T = performance.now();
  const stats: Record<string, number> = {};
  const H = (x: number, z: number) => hm.heightAt(x, z);
  const cityBounds = scaleBounds(atlas.CITY_BOUNDS);
  const detailBounds = opts.extent === 'city' ? cityBounds : scaleBounds(atlas.CORE_BOUNDS, 150);

  // ---- 1. plan (detail: the core + 150 m, and the golden-path corridors + 150 m round them)
  // ?detour=0: the atlas roads as they are, through the buildings (A/B for the M5a road work).
  const detourRoads = typeof location === 'undefined' || new URLSearchParams(location.search).get('detour') !== '0';
  const plan = planCity(atlas, hm, { detailBounds, corridorDetail: opts.extent === 'city' ? null : 150, detourRoads });
  // Where streets, ground cover and city grass exist: the detail area plus a 60 m fringe.
  const areaRects = plan.detailRects.map((b) => ({ minX: b.minX - 60, minZ: b.minZ - 60, maxX: b.maxX + 60, maxZ: b.maxZ + 60 }));
  const inDetail = (x: number, z: number) => inRects(areaRects, x, z);
  stats.planMs = performance.now() - T;
  report(0.2, 'Laying out the vici');
  await tick();

  // ---- 2. far massing for every block
  const pool = new BatchPool(game.scene);
  const farMat = massingMaterial();
  const farBatch = pool.get(farMat, false, true);
  const blocks: BlockRec[] = [];
  let t = performance.now();
  for (const blk of plan.blocks) {
    const layout = blk.kind === 'built' ? layoutBlock(blk, H) : null;
    const geo = blockFarGeometry(blk, layout, H);
    const far = geo.getAttribute('position').count ? pool.handle([farBatch.add(geo)]) : null;
    blocks.push({ blk, layout, far, levels: {}, colliders: null, spots: null, center: new THREE.Vector3(blk.centroid[0], H(blk.centroid[0], blk.centroid[1]), blk.centroid[1]), d: Infinity });
    if (performance.now() - t > 40) {
      report(0.2 + 0.3 * (blocks.length / plan.blocks.length), 'Raising the insulae');
      await tick();
      t = performance.now();
    }
  }
  stats.massingMs = performance.now() - T - stats.planMs;
  // Outside the detail area the massing is all there is: its buildings get box colliders, so
  // nobody walks through the backdrop, but only near the player (ProximityColliders): thousands of
  // colliders minutes away only cost Rapier time every step.
  const host: ColliderHost<RAPIER.Collider> = {
    add: (spec, owner) => addColliders(game, [spec], owner)[0],
    remove: (c) => game.physics.removeCollider(c),
  };
  const massColliders = new ProximityColliders(host, { near: 80, far: 110 });
  for (const r of blocks) {
    if (r.blk.detailed || !r.layout || !r.layout.masses.length) continue;
    const masses = r.layout.masses;
    massColliders.add(r.blk.centroid[0], r.blk.centroid[1], r.blk.radius, () => masses.map((m) => massCollider(m)), { city: 'massing' });
  }
  stats.massingColliderBlocks = massColliders.size;

  // ---- 3. streets: detailed work per cell in the detail area, far ribbons elsewhere
  const work = streetWork(plan, H, areaRects, STREET_CELL);
  // Street life: stalls, goods, benches, statues and trees on the landmark frontages, washing
  // lines over the lanes (built with the street cells).
  const life = lifeWork(plan, H, inDetail, cellAdder(work.cells, STREET_CELL, inDetail));
  work.spots.push(...life.spots);
  stats.lifeItems = Object.values(life.counts).reduce((a, b) => a + b, 0);
  const cells: CellRec[] = [];
  const size = STREET_CELL;
  const ribbons = new Map<string, FlatSoup>();
  for (const st of plan.streets) {
    const mid = st.points[Math.floor(st.points.length / 2)];
    const key = cellKey(mid[0], mid[1], size);
    let s = ribbons.get(key);
    if (!s) ribbons.set(key, (s = new FlatSoup()));
    s.color(st.kind === 'vicus' ? 'paving_basalt' : st.kind === 'lane' ? 'cobbles' : 'gravel', 0.95);
    ribbon(s, st.points, st.width, H, 0.2);
  }
  const keys = new Set([...work.cells.keys(), ...ribbons.keys()]);
  for (const key of keys) {
    const [ix, iz] = key.split(',').map(Number);
    const w = work.cells.get(key) ?? { key, cx: (ix + 0.5) * size, cz: (iz + 0.5) * size, items: [], detail: [] };
    const rib = ribbons.get(key);
    const far = rib && !rib.empty ? pool.handle([farBatch.add(rib.geometry())]) : null;
    cells.push({
      work: w, far, near: null, detail: null, d: Infinity,
      bounds: { minX: ix * size, minZ: iz * size, maxX: (ix + 1) * size, maxZ: (iz + 1) * size },
      y: H(w.cx, w.cz),
    });
  }
  stats.streetWorkMs = performance.now() - T - stats.planMs - stats.massingMs;
  report(0.55, 'Paving the streets');
  await tick();

  // ---- 4. walls, gates, aqueducts
  // Wall, gate and arcade colliders near the player only (per ~120 m chunk).
  const monColliders = new ProximityColliders(host, { near: 90, far: 125 });
  const mon = buildMonuments(game, plan, hm, pool, {
    inDetail: (x, z) => plan.inDetail(x, z),
    colliders: (x, z, r, specs) => monColliders.add(x, z, r, () => specs, { city: 'monuments' }),
  });
  stats.monuments = mon.pieces;
  report(0.65, 'Raising the aqueducts');
  await tick();

  // ---- 5. trees and grass (vegetation materials clone the textured library materials)
  await whenTexturesLoaded().catch(() => {});
  const trees = new TreeLayer({ near: 45, far: 1000, thinFrom: 200, minKeep: 0.12 });
  for (const sp of placeTrees(plan, cityBounds, hm.waterLevelY, 31, inDetail, inDetail)) trees.add(sp.species, sp.x, H(sp.x, sp.z), sp.z, { scale: sp.scale });
  for (const sp of life.trees) trees.add(sp.species, sp.x, H(sp.x, sp.z), sp.z, { scale: sp.scale });
  const yardSpecies = ['fig', 'laurel', 'umbrella_pine', 'cypress', 'olive', 'fig'] as const;
  for (const r of blocks) {
    if (!r.layout) continue;
    r.layout.trees.forEach(([x, z], k) => trees.add(yardSpecies[(r.blk.seed + k) % yardSpecies.length], x, H(x, z), z, { scale: 0.7 + ((r.blk.seed >> (k + 3)) % 30) / 100 }));
  }
  game.scene.add(trees.build());
  // Trunk colliders near the player only (per 32 m cell of trees).
  const treeColliders = new ProximityColliders(host, { near: 60, far: 85 });
  for (const tg of trees.trunkGroups(32)) treeColliders.add(tg.x, tg.z, tg.r, tg.specs, { city: 'trees' });
  stats.trees = trees.total;
  const g = plan.grid;
  const grass = new GrassField(rectsBounds(areaRects), {
    heightAt: H,
    mask: (x, z) => {
      if (!inDetail(x, z)) return false;
      const c = g.at(x, z);
      // Not on the paved landmark margins, nor in the town's scraps along the golden path.
      return c === K.GARDEN || c === K.STEEP || c === K.OUTSIDE || (c === K.SCRAP && !plan.corridor(x, z)) || c === K.WALL || c === K.AQUEDUCT;
    },
    density: 1.0,
    flowers: 0.2,
    dryness: 0.5,
    fadeStart: 16,
    fadeEnd: 28,
  });
  game.scene.add(grass.build());
  const veg = vegetation(game);
  veg.addGrass(grass);
  game.addSystem({
    name: 'cityTrees',
    priority: 106,
    lateUpdate: () => {
      const scale = game.world?.distanceScale ?? 1;
      trees.update(game.camera, scale);
      // Colliders follow the player (the camera when there is none).
      const who = (game as Game & { player?: { position: THREE.Vector3 } }).player?.position ?? game.camera.position;
      massColliders.update(who);
      treeColliders.update(who);
      monColliders.update(who);
      // Lamplit windows in the far massing follow the sky's lamp factor.
      const sky = (game as Game & { sky?: { lampFactor?: number } }).sky;
      farMat.userData.uLamp.value = sky?.lampFactor ?? 0;
      interiorLamp.value = sky?.lampFactor ?? 0;
      // Wall torches burn from dusk to dawn only.
      torchFlames().visible = (sky?.lampFactor ?? 1) > 0.05;
    },
  });
  report(0.8, 'Planting the gardens');
  await tick();

  // ---- 6. street graph. Its links are checked against the static colliders (landmarks, bridges,
  // quays, walls): Rapier only sees colliders in ray casts after a step, and nothing has stepped the
  // world during the load yet (no bodies exist, so one step moves nothing).
  game.physics.step(1 / 60);
  const graph = buildStreetGraph(plan, work, game, (x, z) => inDetail(x, z), { obstacles: trees.trunkDiscs() });
  game.streets = graph;
  stats.graphNodes = graph.nodes.length;

  // ---- 7. lamps (wall torches of the detailed blocks, shrine and fountain lamps, stall lamps)
  const lamps = game.addSystem(new CityLamps(game));
  for (const r of blocks) if (r.blk.detailed && r.layout) for (const t of r.layout.torches) lamps.add(torchLamp(t));
  for (const l of work.lamps) lamps.add(l);
  for (const l of life.lamps) lamps.add(l);
  stats.lamps = lamps.total;
  clearSpray();
  game.addSystem(new FountainSpray(game));

  // ---- 8. streamer
  // Dev overrides: ?cityNear=<m>&cityMid=<m>&cityLow=<m>&cityFar=<m>&cityMidShadows=0.
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const streamer = game.addSystem(new CityStreamer(game, pool, blocks, cells, H, {
    ...(num('cityNear') ? { nearR: num('cityNear') } : {}),
    ...(num('cityMid') ? { midR: num('cityMid') } : {}),
    ...(num('cityLow') ? { lowR: num('cityLow') } : {}),
    ...(num('cityFar') ? { farMax: num('cityFar') } : {}),
    ...(q.get('cityMidShadows') === '0' ? { midShadows: false } : {}),
  }));
  const byId = new Map(blocks.map((b) => [b.blk.id, b]));
  const service: CityService = {
    plan, pool, streamer, lamps, trees, grass, stats,
    blockSpots: (id) => byId.get(id)?.spots ?? null,
    classAt: (x, z) => g.at(x, z),
    coversGround: (x, z) => coversGround(plan, inDetail, x, z),
    ownsTrees: (x, z) => ownsTrees(plan, inDetail, x, z),
    prime: (p) => {
      streamer.prime(new THREE.Vector3(p.x, p.y, p.z));
      massColliders.update(p, 1, true);
      treeColliders.update(p, 1, true);
      monColliders.update(p, 1, true);
    },
    colliders: () => ({ massing: massColliders.live, trees: treeColliders.live, monuments: monColliders.live }),
  };
  game.city = service;
  // Build the detail around the expected spawn now, so the first frames do not pop.
  const spawn = opts.spawn ?? guessSpawn(atlas, H);
  if (spawn) {
    const t1 = performance.now();
    service.prime(spawn);
    stats.primeMs = performance.now() - t1;
  }
  stats.totalMs = performance.now() - T;
  stats.blocks = plan.blocks.length;
  stats.streets = plan.streets.length;
  console.info('[city]', JSON.stringify(Object.fromEntries(Object.entries({ ...plan.stats, ...stats }).map(([k, v]) => [k, Math.round(v)]))));
  report(1, 'The city wakes');
  const w = window as unknown as { __city?: CityService; __cityBreakdown?: () => unknown; __streetAudit?: () => unknown };
  w.__city = service;
  // In-game audit: what the street graph reaches from the Forum, and the road ends that stop at nothing (M5a).
  w.__streetAudit = () => ({ reach: auditReach(game.streets, 0, 0), roadEnds: summarizeRoadEnds(auditRoadEnds(plan)), dead: auditRoadEnds(plan).filter((e) => e.verdict === 'dead') });
  w.__cityBreakdown = () =>
    renderBreakdown(game, {
      terrain: () => (game.terrain ? [game.terrain.group] : []),
      landmarks: () => game.scene.children.filter((o) => o.name.startsWith('landmark:')),
      cityBlocksStreets: () => [pool.group],
      trees: () => [trees.group],
      grass: () => [grass.group],
    });
}

/**
 * Where the game will put the player: `?at=<landmark>` (18 m out from its facade), else the Porta
 * Capena (the new-game spawn, 16 m out on the Via Appia; the title screen stands there too).
 */
function guessSpawn(atlas: typeof Atlas, H: (x: number, z: number) => number): THREE.Vector3 | null {
  if (typeof location === 'undefined') return null;
  const p = new URLSearchParams(location.search);
  const at = p.get('at');
  const id = at ?? (p.get('scene') === 'rome' || !p.get('scene') ? 'porta-capena' : null);
  const lm = id ? atlas.LANDMARK_BY_ID[id] : null;
  if (!lm) return null;
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const th = (lm.rotation * Math.PI) / 180;
  const f = at ? 18 : 16;
  const x = gx + Math.sin(th) * f, z = gz - Math.cos(th) * f;
  return new THREE.Vector3(x, H(x, z), z);
}

/**
 * Flat vertex-coloured material of the far massing (colours are linear bytes). Walls with facade
 * coordinates get a procedural pattern of shop openings on the ground floor and window rows above
 * (faded out where a window would be smaller than a pixel), so distant blocks read as buildings at
 * no geometry cost. From dusk to dawn (`uLamp`, the sky's lamp factor) about one window in six and
 * a few shop fronts glow with lamplight, so the city twinkles from the hills before sunrise.
 */
function massingMaterial(): THREE.MeshStandardMaterial & { userData: { uLamp: { value: number } } } {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  m.name = 'city:massing';
  const uLamp = { value: 0 };
  m.userData.uLamp = uLamp;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLamp = uLamp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 facade;\nvarying vec2 vFacade;\nvarying vec2 vCityXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = facade;\nvCityXZ = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFacade;\nvarying vec2 vCityXZ;\nuniform float uLamp;\nfloat cityHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
float cityLit = 0.0;
{
  vec2 f = vFacade;
  if (f.y > 0.0) {
    vec2 fw = fwidth(f);
    float aa = clamp(1.6 - max(fw.x, fw.y) * 1.4, 0.0, 1.0);
    float w = 0.0;
    vec2 cellId;
    if (f.y < 4.3) {
      float bx = fract(f.x / 3.9);
      w = step(0.13, bx) * step(bx, 0.87) * step(0.15, f.y) * step(f.y, 3.0) * 0.72;
      cellId = vec2(floor(f.x / 3.9), -1.0);
    } else {
      float bx = fract(f.x / 3.3 + 0.5);
      float by = fract((f.y - 4.3) / 3.0);
      w = step(0.36, bx) * step(bx, 0.64) * step(0.3, by) * step(by, 0.74) * 0.68;
      cellId = vec2(floor(f.x / 3.3 + 0.5), floor((f.y - 4.3) / 3.0));
      w = max(w, step(by, 0.06) * 0.1);
    }
    diffuseColor.rgb *= 1.0 - w * aa;
    // Lamplight in some openings (seeded by the window and the ~14 m patch of city it is in).
    float h = cityHash(cellId + floor(vCityXZ / 14.0) * 17.0);
    float lit = step(h, cellId.y < 0.0 ? 0.22 : 0.16);
    cityLit = lit * step(0.5, w) * uLamp * max(aa, 0.35);
  }
}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.56, 0.24) * 1.6 * cityLit;');
  };
  m.customProgramCacheKey = () => 'city:massing:2';
  return m as THREE.MeshStandardMaterial & { userData: { uLamp: { value: number } } };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Box collider of a far-massing building. */
function massCollider(m: LotMass): ColliderSpec {
  const { c, u, hu, hv } = m.obb;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-u[1], u[0]));
  return { kind: 'box', center: new THREE.Vector3(c[0], (m.base + m.eave) / 2, c[1]), half: new THREE.Vector3(hu, (m.eave - m.base) / 2, hv), rotation: q };
}

/** Ground the city dresses itself (see CityService.coversGround). */
export function coversGround(plan: CityPlan, inDetail: (x: number, z: number) => boolean, x: number, z: number): boolean {
  const g = plan.grid;
  const i = g.index(x, z);
  if (i < 0) return false;
  const c = g.cls[i];
  if (c === K.LANDMARK || c === K.WATER) return false;
  // The detail area: streets, ground cover, the city's own grass and trees everywhere.
  if (inDetail(x, z)) return true;
  // Beyond it, what the far city stands on: blocks of massing, street ribbons, walls, the
  // aqueducts' pier lines, fora.
  return c === K.STREET || c === K.WALL || c === K.AQUEDUCT || c === K.PLAZA || (c === K.FREE && g.owner[i] >= 2_000_000);
}

/** Ground whose trees the city plants (placeTrees / yard trees): its regions, and all of the detail area. */
export function ownsTrees(plan: CityPlan, inDetail: (x: number, z: number) => boolean, x: number, z: number): boolean {
  const g = plan.grid;
  const i = g.index(x, z);
  if (i < 0) return false;
  const c = g.cls[i];
  if (c === K.LANDMARK || c === K.WATER) return false;
  return c !== K.OUTSIDE || inDetail(x, z);
}

/** Street work is built per 128 m cell (one culling instance per material each). */
const STREET_CELL = 128;

export { WORLD_SCALE };
