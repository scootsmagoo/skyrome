/**
 * City-fabric test bed: a Roman neighbourhood on gently sloping ground — a basalt main street with
 * sidewalks crossing a side street at a small piazza (lacus fountain, compital shrine, market
 * stalls), dirt lanes, four blocks filled by the CityBlockFiller at different wealth levels, a
 * building site with scaffolding and a treadwheel crane, a garden, umbrella pines and cypresses,
 * grass and flowers at the edges, and stairs up the hill to the east.
 *
 *   ?scene=fabric                    the neighbourhood (walk it; V toggles first person)
 *   ?scene=fabric&gallery=props      every prop kind
 *   ?scene=fabric&gallery=buildings  insulae / domus / horrea / shrines / crane
 *   ?scene=fabric&gallery=trees      every tree species + grass
 *   &spots                           show NPC spots as coloured pins
 *
 * Debug camera for screenshots: window.fabricCam = { pos: [x, y, z], look: [x, y, z] } (null = player camera).
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import { MeshBuilder, placeAndRegister, registerColliders } from '../gfx/MeshBuilder';
import { getMaterial } from '../gfx/materials';
import {
  CityLOD, Draw, buildPlaza, buildStairs, buildStreet, compitalShrine, domus, fillBlock, horrea, insula, lacus, lararium, pergola,
  pointInPolygon, scaffolding, streetAltar, treadwheelCrane, wall, type InsulaSpec, type Polygon, type Spot, type StreetSpec,
} from '../arch/fabric';
import { PROP_KINDS, PropScatter, placeProp } from '../arch/props';
import { Forest, GrassField, TREE_SPECIES, fbm2, ivy, vegetation, vineCanopy, type TreeSpecies } from '../arch/vegetation';
import { WorldRegistry } from '../world/WorldRegistry';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

declare global {
  interface Window {
    fabricCam?: { pos: [number, number, number]; look: [number, number, number] } | null;
    fabricInfo?: Record<string, unknown>;
    fabricBreakdown?: () => unknown;
    fabricSpots?: Spot[];
    /** Aim the debug camera at the n-th spot of a kind/tag: `dist` m out along its facing, `side` m to its right, `h` m above the terrain. */
    fabricLook?: (kind: string, tag?: string, n?: number, dist?: number, h?: number, side?: number) => unknown;
    /** Debug: the scene's terrain height. */
    fabricH?: (x: number, z: number) => number;
  }
}

// ------------------------------------------------------------------ light & sky

function environment(game: Game, follow: () => THREE.Vector3) {
  const skyGeo = new THREE.SphereGeometry(1500, 32, 16);
  const colors: number[] = [];
  const pos = skyGeo.getAttribute('position');
  const top = new THREE.Color(0x4a82c4), mid = new THREE.Color(0xa6c6e4), hor = new THREE.Color(0xeedcc2);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 1500;
    const c = t > 0.22 ? mid.clone().lerp(top, Math.min(1, (t - 0.22) / 0.78)) : hor.clone().lerp(mid, Math.max(0, t / 0.22));
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  game.scene.add(sky);
  game.scene.background = new THREE.Color(0xeedcc2);
  game.scene.fog = new THREE.Fog(0xe4dccd, 140, 1100);

  const hemi = new THREE.HemisphereLight(0xc8ddf2, 0xa88a62, 1.75);
  game.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.0);
  // Mid-afternoon sun from the south-west, ~38° high.
  const sunDir = new THREE.Vector3(-0.55, 0.62, 0.55).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -75;
  cam.right = cam.top = 75;
  cam.near = 1;
  cam.far = 500;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  game.scene.add(sun, sun.target);
  game.addSystem({
    name: 'fabricSun',
    priority: 102,
    lateUpdate() {
      sky.position.copy(game.camera.position);
      const p = window.fabricCam ? new THREE.Vector3(...window.fabricCam.look) : follow();
      const sx = Math.round(p.x / 2) * 2, sz = Math.round(p.z / 2) * 2;
      sun.target.position.set(sx, p.y, sz);
      sun.position.set(sx + sunDir.x * 200, p.y + sunDir.y * 200, sz + sunDir.z * 200);
    },
  });
  game.addSystem({
    name: 'fabricCam',
    priority: 101,
    lateUpdate() {
      const fc = window.fabricCam;
      if (!fc) return;
      game.camera.position.set(...fc.pos);
      game.camera.lookAt(new THREE.Vector3(...fc.look));
    },
  });
}

function flatGround(game: Game, mat: Parameters<typeof getMaterial>[0]) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), getMaterial(mat));
  ground.receiveShadow = true;
  game.scene.add(ground);
  game.physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 200, y: 0.5, z: 200 });
}

// ------------------------------------------------------------------ the neighbourhood

/** Gentle slope rising to the north-east, soft undulation, and a hill beyond x ≈ 60. */
export function fabricHeight(x: number, z: number): number {
  const s = THREE.MathUtils.smoothstep(x, 58, 100);
  return 0.03 * x - 0.022 * z + 0.9 * Math.sin(x / 37) * Math.cos(z / 43) + 0.45 * Math.sin((x + z) / 23) + 7 * s;
}

const H = fabricHeight;
const MAIN_HALF = 2.75 + 2.2; // main street: 5.5 m roadway + 2.2 m sidewalks
const CROSS_HALF = 2.25 + 1.8;
const LANE = 4;

/** The packed-dirt town ground (the terrain outside it is dry grass). */
const DIRT = { x0: -78, x1: 78, z0: -98, z1: 88 };
const inDirt = (x: number, z: number) => x > DIRT.x0 && x < DIRT.x1 && z > DIRT.z0 && z < DIRT.z1;
/** Distance inside the dirt rectangle from its edge (negative outside). */
const dirtDepth = (x: number, z: number) => Math.min(x - DIRT.x0, DIRT.x1 - x, z - DIRT.z0, DIRT.z1 - z);

function rect(x0: number, z0: number, x1: number, z1: number): Polygon {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

function terrain(game: Game) {
  const size = 460, seg = 230;
  const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const heights = new Float32Array((seg + 1) * (seg + 1));
  for (let i = 0; i < pos.count; i++) {
    const y = H(pos.getX(i), pos.getZ(i));
    pos.setY(i, y);
    heights[i] = y;
  }
  g.computeVertexNormals();
  // Two material groups: packed dirt inside the town, sun-dried grass outside. Triangles are
  // classified by their centroid; the town edge lies on the 2 m grid lines, so both triangles of a
  // grid cell always land on the same side and the edge comes out straight (the grass fringe below
  // then softens it).
  const idx = g.getIndex()!;
  const town: number[] = [], wild: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    (inDirt(x, z) ? town : wild).push(a, b, c);
  }
  g.setIndex([...town, ...wild]);
  g.clearGroups();
  g.addGroup(0, town.length, 0);
  g.addGroup(town.length, wild.length, 1);
  const mesh = new THREE.Mesh(g, [getMaterial('dirt'), getMaterial('dry_grass')]);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  game.scene.add(mesh);
  // PlaneGeometry rows run along z, columns along x: matches Physics.addHeightfield's layout.
  game.physics.addHeightfield(-size / 2, -size / 2, size, size, seg, seg, heights);
}

interface Block {
  id: string;
  poly: Polygon;
  wealth: number;
  density: number;
  seed: number;
  /** Sidewalk height per edge (paved street 0.3, lane 0.12). */
  sw: number[];
}

function neighbourhood(game: Game) {
  const t0 = performance.now();
  terrain(game);
  const spots: Spot[] = [];

  // ---- streets
  const sb = new MeshBuilder();
  const paved = (points: [number, number][], extra: Partial<StreetSpec> = {}) => buildStreet(sb, { points, kind: 'paved', roadWidth: 5.5, sidewalk: 2.2, ...extra }, H);
  const lane = (points: [number, number][], extra: Partial<StreetSpec> = {}) => buildStreet(sb, { points, kind: 'lane', roadWidth: LANE, ...extra }, H);
  paved([[0, -112], [0, -12]], { steppingStones: [30, 72] });
  paved([[0, 12], [0, 98]], { steppingStones: [24] });
  paved([[-90, 0], [-14, 0]], { roadWidth: 4.5, sidewalk: 1.8, steppingStones: [40] });
  paved([[14, 0], [90, 0]], { roadWidth: 4.5, sidewalk: 1.8, steppingStones: [] });
  // Lanes never overlap another street surface: they stop at the edge of whatever they meet.
  const R0 = 72; // ring lanes run along x = ±74 (4 m wide)
  for (const s of [-1, 1]) {
    lane([[s * 74, -98], [s * 74, -CROSS_HALF]]);
    if (s < 0) lane([[-74, CROSS_HALF], [-74, 88]]);
    else { lane([[74, CROSS_HALF], [74, 43]]); lane([[74, 47], [74, 88]]); }
    lane([[s * R0, -94], [s * MAIN_HALF, -94]]);
    lane([[s * R0, 84], [s * MAIN_HALF, 84]]);
  }
  lane([[-R0, -50], [-MAIN_HALF, -50]]);
  lane([[MAIN_HALF, 45], [78, 45]]);
  buildStairs(sb, [78, 45], [98, 45], 3.6, (x, z) => H(x, z) + 0.06, { material: 'travertine', parapet: 'tufa' });
  lane([[98, 45], [125, 45]]);
  // Piazza at the crossroads.
  const piazza = rect(-14, -12, 14, 12);
  buildPlaza(sb, piazza, H, { material: 'paving_travertine', lift: 0.08 });
  placeAndRegister(game, 'streets', sb.build('streets'), sb.colliders, { x: 0, y: 0, z: 0 }, 0, { cullDistance: 2000 });

  // ---- blocks (property lines at the sidewalks' outer edges)
  const notchNW: Polygon = [[-72, -48], [-MAIN_HALF, -48], [-MAIN_HALF, -12], [-14, -12], [-14, -CROSS_HALF], [-72, -CROSS_HALF]];
  const notchNE: Polygon = [[MAIN_HALF, -92], [72, -92], [72, -CROSS_HALF], [14, -CROSS_HALF], [14, -12], [MAIN_HALF, -12]];
  const notchSW: Polygon = [[-72, CROSS_HALF], [-14, CROSS_HALF], [-14, 12], [-MAIN_HALF, 12], [-MAIN_HALF, 82], [-72, 82]];
  const blocks: Block[] = [
    { id: 'A1', poly: rect(-72, -92, -MAIN_HALF, -52), wealth: 0.15, density: 0.9, seed: 11, sw: [0.12, 0.3, 0.12, 0.12] },
    { id: 'A2', poly: notchNW, wealth: 0.35, density: 0.8, seed: 12, sw: [0.12, 0.3, 0.3, 0.3, 0.3, 0.12] },
    { id: 'B', poly: notchNE, wealth: 0.85, density: 0.55, seed: 13, sw: [0.12, 0.12, 0.3, 0.3, 0.3, 0.3] },
    { id: 'C', poly: notchSW, wealth: 0.5, density: 0.7, seed: 14, sw: [0.3, 0.3, 0.3, 0.3, 0.12, 0.12] },
    { id: 'E', poly: rect(MAIN_HALF, 47, 72, 82), wealth: 0.6, density: 0.6, seed: 15, sw: [0.12, 0.12, 0.12, 0.3] },
  ];
  const lots: { id: string; floorY: number }[] = [];
  // Three levels per block (same seed = same massing): full detail near, the street exterior at
  // mid range, and far stand-ins merged per cell. ?lod=near,mid overrides the distances.
  const [lodNear, lodMid] = (new URLSearchParams(location.search).get('lod') ?? '70,220').split(',').map(Number);
  const lod = game.addSystem(new CityLOD(game, { near: lodNear, mid: lodMid ?? 220, id: 'fabric' }));
  for (const blk of blocks) {
    const opts = { id: `${blk.id}:`, heightAt: H, wealth: blk.wealth, density: blk.density, seed: blk.seed, sidewalkHeight: blk.sw, allowHorrea: blk.id === 'A1' };
    const r = fillBlock(blk.poly, opts);
    registerColliders(game, r.builder.colliders);
    lod.addBlock(`block${blk.id}`, {
      near: r.builder.build(`block${blk.id}`),
      mid: fillBlock(blk.poly, { ...opts, detail: 'mid' }).builder.build(`block${blk.id}:mid`),
      far: fillBlock(blk.poly, { ...opts, detail: 'low' }).builder.build(`block${blk.id}:far`),
    });
    spots.push(...r.spots);
    for (const l of r.lots) lots.push({ id: `${l.id}:${l.kind}`, floorY: +l.floorY.toFixed(2) });
  }
  lod.finish();

  // ---- piazza furniture: fountain, compital shrine at the corner, stalls, a statue, plane trees
  const pb = new MeshBuilder();
  const pd = new Draw(pb);
  const at = (x: number, z: number, ry = 0) => pd.at(x, H(x, z) + 0.08, z, ry);
  const fz = 3.5;
  for (const s of lacus(at(-7, fz, 0), new Rng(4))) spots.push({ id: 'piazza:fountain', kind: 'fountain', position: new THREE.Vector3(-7 + s.x, H(-7, fz) + 0.08, fz + s.z), facing: s.facing });
  compitalShrine(at(10.5, -9.5, Math.PI / 4), new Rng(7));
  spots.push({ id: 'piazza:compitum', kind: 'shrine', position: new THREE.Vector3(9.2, H(9, -8) + 0.08, -8.2), facing: Math.PI / 4 + Math.PI });
  placeProp(at(-10, -9), 'statue_pedestal', 0, 0, 0, Math.PI * 0.75, { variant: 0 });
  streetAltar(at(11, 9.5, -Math.PI / 2));
  // One-off props merge into the static piazza mesh (one draw call per material) …
  const one = (k: Parameters<typeof placeProp>[1], x: number, z: number, ry: number, v?: number, lift = 0.08) => placeProp(pd.at(x, H(x, z) + lift, z), k, 0, 0, 0, ry, { variant: v });
  one('stall_fruit', 3.5, 7.5, Math.PI, 0);
  one('stall_fish', 8.0, 7.0, Math.PI + 0.15, 1);
  one('stall_pottery', 3.5, -6.5, 0, 2);
  one('stall_cloth', -2.0, 8.0, Math.PI - 0.1, 0);
  spots.push(...[[3.5, 6.2], [8, 5.8], [3.5, -5.2], [-2, 6.7]].map(([x, z], i) => ({ id: `piazza:stall${i}`, kind: 'stall' as const, position: new THREE.Vector3(x, H(x, z) + 0.08, z), facing: i === 2 ? Math.PI : 0 })));
  one('bench_masonry', -12.6, -1.5, Math.PI / 2, 0);
  spots.push({ id: 'piazza:bench', kind: 'bench', position: new THREE.Vector3(-12.1, H(-12, -1.5) + 0.08, -1.5), facing: Math.PI / 2 });
  one('cart', 3.4, -40, 0.03, 0, 0.36);
  one('handcart', -3.2, -66, 2.9, 1, 0.36);
  one('litter', 3.0, 30, Math.PI, 0, 0.36);
  one('cart', -40, -51.5, Math.PI / 2, 1, 0.1);
  one('herm', 6.3, 4.6, -Math.PI / 4);
  one('trough', -5.2, 14, 0, 1, 0.36);
  placeAndRegister(game, 'piazza', pb.build('piazza'), pb.colliders, { x: 0, y: 0, z: 0 });

  // … while repeated small props are instanced.
  const props = new PropScatter();
  const prng = new Rng(17);
  const prop = (k: Parameters<PropScatter['add']>[0], x: number, z: number, ry: number, v?: number, lift = 0.08) => props.add(k, { x, y: H(x, z) + lift, z }, ry, 1, { variant: v });
  for (const [x, z] of [[1.5, 9.2], [5.8, 9.0], [10, 8.5], [-4, 9.6], [2.2, -8.8]]) prop('basket', x, z, prng.range(0, 6), 0);
  for (const [x, z] of [[6.0, -8.8], [6.6, -9.4], [-12.8, 6]]) prop('crate', x, z, prng.range(0, 1), 2);
  prop('amphora_stack', -12.5, 9.5, 0.2, 0);
  prop('amphora_stack', -22, -48.6, 0, 0, 0.1);
  for (const s of spots.filter((sp) => sp.kind === 'shopDoor')) {
    if (s.tag !== 'wine' && s.tag !== 'thermopolium' && s.tag !== 'general') continue;
    // Beside the door, against the facade: out (facing) is toward the street, right = facing − π/2.
    const out = new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing));
    const right = new THREE.Vector3(Math.cos(s.facing), 0, -Math.sin(s.facing));
    const p = s.position.clone().addScaledVector(out, -0.25).addScaledVector(right, 2.0 + prng.range(0, 0.3));
    props.add(s.tag === 'general' ? 'sack' : 'amphora_tall', p, s.facing + prng.range(-0.3, 0.3), 1, { collide: false, variant: 0 });
  }
  placeAndRegister(game, 'props', props.build('props'), props.colliders(), { x: 0, y: 0, z: 0 });

  // ---- block D: garden with a vine pergola, and the building site
  const gb = new MeshBuilder();
  const gd = new Draw(gb);
  // Block D south-east of the crossroads, minus the piazza's corner.
  const garden: Polygon = [[14, CROSS_HALF], [40, CROSS_HALF], [40, 43], [MAIN_HALF, 43], [MAIN_HALF, 12], [14, 12]];
  buildPlaza(gb, garden, H, { material: 'grass', lift: 0.04, collide: false });
  for (const [x, z] of [[24, 24], [24, 34]]) {
    const p = gd.at(x, H(x, z) + 0.04, z);
    const c = pergola(p, 5.2, 7.8, 2.6);
    vineCanopy(p, c.w, c.l, c.y, new Rng(x + z));
  }
  placeProp(gd.at(14, H(14, 29) + 0.04, 29), 'bench_masonry', 0, 0, 0, Math.PI / 2, { variant: 0 });
  // Garden wall along the street with ivy.
  {
    const wz = CROSS_HALF;
    const W0 = gd.at(27, H(27, wz) - 0.4, wz, Math.PI);
    wall(W0, 'reticulatum', -13, 13, 0, 2.4, 0.45, [{ x0: -1.0, x1: 1.0, y0: 0.42, y1: 2.0, arch: 1.0 }]);
    W0.span('travertine', -13.05, 2.4, -0.05, 13.05, 2.55, 0.5);
    W0.solid(-13, 0, 0, -1.0, 2.4, 0.45);
    W0.solid(1.0, 0, 0, 13, 2.4, 0.45);
    ivy(W0, -12, 6, 0.4, 2.0, new Rng(3));
    ivy(W0, 5, 5, 0.4, 1.8, new Rng(4));
  }
  // Building site: a new insula going up behind scaffolding, with a treadwheel crane.
  {
    const cx = 56, cz = 22;
    const y = H(cx - 6, cz - 7) + 0.1;
    const S = gd.at(cx, y, cz);
    S.span('concrete', -9, -1.5, -7, 9, 0.2, 7, { collide: true });
    for (const [x0, z0, x1, z1, h] of [[-9, -7, 9, -6.4, 7.2], [-9, 6.4, 9, 7, 4.6], [-9, -6.4, -8.4, 6.4, 6.4], [8.4, -6.4, 9, 6.4, 5.2]] as const) {
      S.span('brick', x0, 0.2, z0, x1, h, z1, { collide: true });
    }
    // Ragged top courses.
    for (let i = 0; i < 14; i++) S.span('brick', -9 + i * 1.3, 7.2, -7, -8.4 + i * 1.3, 7.2 + ((i * 7) % 5) * 0.12, -6.4);
    scaffolding(S.at(0, 0.2, -7.0), -9, 9, 8, new Rng(5));
    treadwheelCrane(S.at(-3, 0.2, -12.5), 15, new Rng(6));
    for (let i = 0; i < 5; i++) placeProp(S, i % 2 ? 'sack' : 'crate', -6 + i * 1.1, 0.2, -15.5, i, { variant: 0 });
    S.span('travertine', 3.5, 0.2, -16, 5.5, 1.0, -14.8, { collide: true });
    S.span('tufa', 5.8, 0.2, -16.5, 7.0, 0.9, -15.2, { collide: true });
    placeProp(S, 'cart', 2.0, 0.2, -19.5, 0.4, { variant: 1 });
    spots.push({ id: 'site:foreman', kind: 'workshop', position: S.point(0, 0.2, -16), facing: Math.PI, tag: 'construction' });
  }
  placeAndRegister(game, 'blockD', gb.build('blockD'), gb.colliders, { x: 0, y: 0, z: 0 });

  // ---- trees: countryside pines and cypresses, olive grove on the hill, spots from the blocks
  const forest = new Forest({ near: 120, seed: 3 });
  const rng = new Rng(9);
  const inTown = (x: number, z: number) => x > -80 && x < 80 && z > -100 && z < 90;
  const tree = (sp: TreeSpecies, x: number, z: number, s?: number) => forest.add(sp, x, H(x, z), z, { scale: s });
  // Umbrella pines in loose groups around the town; cypress lines along the lanes.
  for (let i = 0; i < 900 && forest.count < 150; i++) {
    const x = rng.range(-220, 220), z = rng.range(-220, 220);
    if (inTown(x, z) || fbm2(x * 0.02, z * 0.02, 5) < 0.5) continue;
    if (x > 85 && z > -40 && z < 70) continue; // olive grove
    tree(rng.chance(0.75) ? 'umbrella_pine' : 'cypress', x, z);
  }
  for (let x = 92; x < 150; x += 7) for (let z = -30; z < 64; z += 7) tree('olive', x + rng.range(-1.2, 1.2), z + rng.range(-1.2, 1.2));
  for (let z = -105; z < 95; z += 8.5) tree('cypress', -78.5, z, rng.range(0.9, 1.1));
  for (let x = 80; x < 98; x += 5) { tree('cypress', x, 41.8); tree('cypress', x, 48.2); }
  for (const [x, z] of [[20, 16], [34, 18], [33, 40], [17, 39], [42, 30]]) tree('umbrella_pine', x, z, 0.95);
  for (const [x, z] of [[16, 28], [32, 28]]) tree('oleander', x, z);
  tree('plane', -11, 9, 0.85);
  tree('plane', 11, -1, 0.8);
  for (const [x, z] of [[-60, 100], [-40, 98], [20, 100], [45, 96], [70, -110], [-10, -118]]) tree('umbrella_pine', x, z, 1.1);
  for (let z = -60; z < 60; z += 6) tree('reeds', -110 + rng.range(-2, 2), z);
  const species: Record<string, TreeSpecies> = { pine: 'umbrella_pine', cypress: 'cypress', plane: 'plane', olive: 'olive', laurel: 'laurel', oleander: 'oleander', fig: 'fig' };
  for (const s of spots.filter((sp) => sp.kind === 'tree')) {
    const sp = species[s.tag ?? 'laurel'] ?? 'laurel';
    forest.add(sp, s.position.x, s.position.y, s.position.z, { scale: sp === 'umbrella_pine' || sp === 'plane' ? 0.75 : 0.9 });
  }
  const fg = forest.build();
  game.scene.add(fg);
  vegetation(game).addForest(forest);
  for (const c of forest.colliders()) if (c.kind === 'cylinder') game.physics.addCylinder(c.center, c.halfHeight, c.radius);

  // ---- grass & wildflowers outside the town and in the garden
  const grass = new GrassField({ minX: -200, minZ: -200, maxX: 200, maxZ: 200 }, {
    heightAt: H,
    // Outside the town, plus a ragged fringe up to 1.8 m into the dirt so its edge is not a ruled line.
    mask: (x, z) => (Math.abs(z - 45) > 3.2 && Math.abs(x) > MAIN_HALF + 0.4 && dirtDepth(x, z) < 1.8 * fbm2(x * 0.35, z * 0.35, 7) - 0.15) || (pointInPolygon([x, z], garden) && !(x > 20 && x < 29 && z > 18 && z < 40)),
    density: 2.6,
    dryness: 0.55,
  });
  game.scene.add(grass.build());
  vegetation(game).addGrass(grass);

  // Optional spot markers.
  if (new URLSearchParams(location.search).has('spots')) showSpots(game, spots);
  const ms = performance.now() - t0;
  console.log(`fabric neighbourhood built in ${ms.toFixed(0)} ms: ${spots.length} spots, ${lots.length} lots, ${forest.count} trees, ${grass.instanceCount} grass instances`);
  window.fabricSpots = spots;
  window.fabricInfo = { buildMs: Math.round(ms), spots: spots.length, lots, trees: forest.count, grass: grass.instanceCount, spotKinds: countBy(spots.map((s) => s.kind)) };
}

/** Debug: visible triangles and meshes per object family (frustum culling ignored). */
function breakdown(game: Game) {
  const out: Record<string, { meshes: number; tris: number }> = {};
  let total = 0;
  game.scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
    const key = (o.name || 'unnamed').split(':')[0] + ((o as THREE.InstancedMesh).isInstancedMesh ? '[i]' : '');
    out[key] = out[key] ?? { meshes: 0, tris: 0 };
    out[key].meshes++;
    out[key].tris += Math.round(tris * inst);
    total += tris * inst;
  });
  return { total: Math.round(total), out };
}

function countBy(xs: string[]) {
  const o: Record<string, number> = {};
  for (const x of xs) o[x] = (o[x] ?? 0) + 1;
  return o;
}

function showSpots(game: Game, spots: Spot[]) {
  const colors: Record<string, number> = { shopDoor: 0xffcc00, houseDoor: 0x44aaff, fountain: 0x00ffff, shrine: 0xff44ff, bench: 0x88ff44, stall: 0xff8800, tree: 0x22aa22, well: 0x0088ff, workshop: 0xffffff };
  const geo = new THREE.ConeGeometry(0.15, 0.5, 6).rotateX(Math.PI).translate(0, 1.8, 0);
  const mats = new Map<string, THREE.Material>();
  for (const s of spots) {
    let m = mats.get(s.kind);
    if (!m) mats.set(s.kind, (m = new THREE.MeshBasicMaterial({ color: colors[s.kind] ?? 0xff0000 })));
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(s.position);
    mesh.rotation.y = s.facing;
    game.scene.add(mesh);
  }
}

// ------------------------------------------------------------------ galleries

function propGallery(game: Game) {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const rng = new Rng(7);
  const cols = 8;
  PROP_KINDS.forEach((k, i) => {
    const x = (i % cols) * 4 - cols * 2, z = -Math.floor(i / cols) * 4.5;
    placeProp(d, k, x, k === 'torch_bracket' || k === 'signboard' || k === 'waterspout' ? 2.2 : 0, z, 0, { rng: rng.fork(k), variant: i % 3 });
    if (k === 'torch_bracket' || k === 'signboard' || k === 'waterspout') d.span('plaster_cream', x - 0.6, 0, z, x + 0.6, 3, z + 0.3);
  });
  flatGround(game, 'gravel');
  placeAndRegister(game, 'gallery', b.build('gallery'), b.colliders, { x: 0, y: 0, z: 0 });
}

function buildingGallery(game: Game) {
  const specs: InsulaSpec[] = [
    { width: 16, depth: 14, seed: 1, storeys: 4, finish: 'brick', balcony: 'full' },
    { width: 20, depth: 22, seed: 2, storeys: 5, finish: 'plaster', courtyard: true, balcony: 'partial' },
    { width: 18, depth: 16, seed: 3, storeys: 5, finish: 'brick', portico: true },
    { width: 13, depth: 12, seed: 4, storeys: 3, finish: 'plaster', plaster: 'plaster_ochre', roof: 'gable', openShopChance: 1 },
    { width: 15, depth: 14, seed: 5, storeys: 6, finish: 'brick', wealth: 0.1 },
  ];
  let x = -50;
  const t0 = performance.now();
  specs.forEach((s, i) => {
    const out = insula(s);
    placeAndRegister(game, `ins${i}`, out.builder.build(`ins${i}`), out.builder.colliders, { x: x + s.width / 2, y: 0, z: -s.depth / 2 }, 0);
    x += s.width + 4;
  });
  const dm = domus({ width: 18, depth: 34, seed: 9, upperFloor: false });
  placeAndRegister(game, 'domus', dm.builder.build('domus'), dm.builder.colliders, { x: -40, y: 0, z: 40 }, Math.PI);
  const hr = horrea({ width: 30, depth: 26, seed: 3 });
  placeAndRegister(game, 'horrea', hr.builder.build('horrea'), hr.builder.colliders, { x: -5, y: 0, z: 36 }, Math.PI);
  const mb = new MeshBuilder();
  const md = new Draw(mb);
  compitalShrine(md.at(20, 0, 26, Math.PI), new Rng(1));
  lacus(md.at(27, 0, 26, Math.PI), new Rng(2));
  lararium(md.at(32, 0, 30, Math.PI));
  md.at(32, 0, 30.3, Math.PI).span('plaster_cream', -1, 0, -0.3, 1, 3, 0);
  streetAltar(md.at(35, 0, 26, Math.PI));
  md.at(46, 0, 34).span('brick', -5, 0, 0, 5, 12, 6);
  scaffolding(md.at(46, 0, 34), -5, 5, 10, new Rng(3));
  treadwheelCrane(md.at(46, 0, 26, Math.PI), 15, new Rng(4));
  placeAndRegister(game, 'misc', mb.build('misc'), mb.colliders, { x: 0, y: 0, z: 0 });
  console.log(`buildings built in ${(performance.now() - t0).toFixed(0)} ms`);
  flatGround(game, 'paving_basalt');
}

function treeGallery(game: Game) {
  const f = new Forest({ near: Number(new URLSearchParams(location.search).get('near') ?? 110) });
  TREE_SPECIES.forEach((sp, i) => {
    for (let v = 0; v < 3; v++) f.add(sp, -42 + i * 12, 0, -10 - v * 16, { variant: v, scale: 1, rotationY: 0 });
  });
  game.scene.add(f.build());
  vegetation(game).addForest(f);
  const g = new GrassField({ minX: -60, minZ: -70, maxX: 60, maxZ: 20 }, { heightAt: () => 0 });
  game.scene.add(g.build());
  vegetation(game).addGrass(g);
  flatGround(game, 'dry_grass');
}

const scene: SceneDef = {
  title: 'City fabric',
  description: 'A Roman neighbourhood: insulae, domus, shops, streets, props and trees on sloping ground',
  setup(game) {
    game.world = game.addSystem(new WorldRegistry(game));
    window.fabricBreakdown = () => breakdown(game);
    window.fabricH = fabricHeight;
    window.fabricLook = (kind, tag, n = 0, dist = 5, h = 1.7, side = 0) => {
      const s = (window.fabricSpots ?? []).filter((sp) => sp.kind === kind && (!tag || sp.tag === tag))[n];
      if (!s) return null;
      const out = new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing));
      const right = new THREE.Vector3(Math.cos(s.facing), 0, -Math.sin(s.facing));
      const p = s.position.clone().addScaledVector(out, dist).addScaledVector(right, side);
      p.y = Math.max(fabricHeight(p.x, p.z), s.position.y - 0.4) + h;
      window.fabricCam = { pos: [p.x, p.y, p.z], look: [s.position.x, s.position.y + 1.4, s.position.z] };
      return { id: s.id, pos: s.position.toArray().map((v) => +v.toFixed(1)) };
    };
    const mode = new URLSearchParams(location.search).get('gallery');
    const start = mode ? new THREE.Vector3(0, 0.1, 8) : new THREE.Vector3(0.5, H(0.5, 9) + 0.3, 9);
    const player = setupPlayer(game, start, Math.PI);
    environment(game, () => player.root.position);
    if (mode === 'props') propGallery(game);
    else if (mode === 'buildings') buildingGallery(game);
    else if (mode === 'trees') treeGallery(game);
    else neighbourhood(game);
  },
};
export default scene;
