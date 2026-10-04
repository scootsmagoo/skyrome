/**
 * Crowd test bed: a small Roman plaza (a temple on a podium, a portico with steps, a row of shops,
 * a fountain, statue bases and a street graph) filled by the NPC module — ambient crowd, named NPCs
 * on schedules, barks, vignettes, night carts and vigiles.
 *
 * URL options: &hour=<0-24> · &crowd=<density mult, 0 = off> · &streets=0 (no street graph) ·
 * &vignette=<id> (start one after 2 s) · &vignettes=0 · &audio=0 · &rpg=0 (no dialogue engine).
 * window.__crowd: { pop, start(id, x?, z?), teleport(x, z), stats() } for shot.mjs evals.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Interactions } from '../interaction/Interactions';
import { installNpcs } from '../npc/NpcManager';
import type { NpcDef } from '../npc/types';
import { randomAppearance } from '../actors/avatar/variants';
import { Rng } from '../core/Rng';
import { installRpg } from '../rpg/install';
import { installUI } from '../ui/UIManager';
import { WorldRegistry } from '../world/WorldRegistry';
import { installSky } from '../world/sky';
import { installAudio } from '../audio';
import { createHumanoid } from '../actors/avatar/HumanoidAvatar';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

const mats = new Map<number, THREE.MeshStandardMaterial>();
const mat = (c: number, rough = 0.85) => {
  let m = mats.get(c);
  if (!m) mats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: rough })));
  return m;
};

function box(game: Game, x: number, y: number, z: number, w: number, h: number, d: number, color: number, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = true;
  game.scene.add(m);
  game.physics.addBox({ x, y: y + h / 2, z }, { x: w / 2, y: h / 2, z: d / 2 }, rotY);
  return m;
}

function column(game: Game, x: number, y: number, z: number, h: number, r: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, h, 14), mat(0xefe9dc, 0.55));
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  game.scene.add(m);
  game.physics.addCylinder({ x, y: y + h / 2, z }, h / 2, r);
}

/** The plaza: 90 × 70 m of paving, north is −z. */
function buildPlaza(game: Game) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0xb9ad94, 0.95));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  game.scene.add(ground);
  game.physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 200, y: 0.5, z: 200 });
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), mat(0xd2c8b2, 0.8));
  paving.rotation.x = -Math.PI / 2;
  paving.position.y = 0.01;
  paving.receiveShadow = true;
  game.scene.add(paving);

  // Temple on a 3 m podium at the north end, facing south (+z), front steps.
  const tz = -30;
  box(game, 0, 0, tz - 4, 16, 3, 20, 0xd8cfbd);
  for (let i = 0; i < 15; i++) box(game, 0, 0, tz + 6 + 0.35 * (15 - i) - 0.175, 10, 0.2 * (i + 1), 0.35, i % 2 ? 0xe1d9c9 : 0xd9d0bf);
  for (let i = 0; i < 6; i++) column(game, -6.25 + i * 2.5, 3, tz + 4.6, 8, 0.45);
  box(game, 0, 3, tz - 6, 13, 9, 13, 0xe9e2d4); // cella
  box(game, 0, 11, tz - 2.5, 15.5, 1.4, 19, 0xe2d9c6); // roof / entablature

  // Portico with steps along the west side (idlers sit on the steps).
  const px = -38;
  for (let i = 0; i < 3; i++) box(game, px + 3.2 - i * 0.4, 0, 0, 0.4, 0.2 * (i + 1), 50, 0xddd4c2);
  for (let i = 0; i < 10; i++) column(game, px + 2, 0.6, -22.5 + i * 5, 6, 0.38);
  box(game, px - 2.5, 0.6, 0, 1, 6.5, 52, 0xcfc4ae); // back wall
  box(game, px, 6.6, 0, 6, 0.6, 52, 0xb8573e); // roof

  // A row of shops along the east side: a wall with doorways (gaps).
  const sx = 38;
  for (let i = 0; i < 7; i++) {
    box(game, sx + 1, 0, -24 + i * 8, 1, 7, 5, i % 2 ? 0xc79a5c : 0xd8b27a);
    box(game, sx + 1, 3.2, -20 + i * 8, 1, 3.8, 3, 0xc79a5c); // lintel over the shop opening
  }
  box(game, sx + 6, 0, 4, 9, 7, 60, 0x9a6b45); // the block behind

  // South: a low wall with a gap for the street, a fountain, statue bases.
  box(game, -22, 0, 34, 34, 2.5, 1, 0xc9bda5);
  box(game, 22, 0, 34, 34, 2.5, 1, 0xc9bda5);
  box(game, 10, 0, 8, 3.2, 0.9, 2.2, 0xdedad0); // fountain basin
  box(game, 10, 0.9, 8, 0.5, 1.4, 0.5, 0xcfc8ba);
  for (const [x, z] of [
    [-14, -8],
    [-14, 12],
    [16, -14],
    [0, 20],
  ])
    box(game, x, 0, z, 1.6, 2.2, 1.6, 0xe4ddcf);
  // A small street altar (compitum shrine) in the south-west corner.
  box(game, -30, 0, 28, 1.6, 2.4, 1, 0xc8b89c);
  // Enclosure: house fronts all round, one street leaving to the south through the gap.
  box(game, 0, 0, -50, 100, 9, 2, 0xb59a74); // north, behind the temple
  box(game, -46, 0, -8, 2, 9, 86, 0xc2a57c); // west, behind the portico
  box(game, 48, 0, -8, 2, 9, 86, 0xa77b52); // east, behind the shops
  box(game, -26, 0, 36, 42, 9, 2, 0xc6ad86); // south fronts either side of the street
  box(game, 26, 0, 36, 42, 9, 2, 0xbf9f78);
  box(game, -5.5, 0, 70, 1, 7, 66, 0xb08d68); // the street going south
  box(game, 5.5, 0, 70, 1, 7, 66, 0xc49c70);
}

/** A street graph in the city module's shape: a ring around the plaza and spokes leaving it. */
function streetGraph() {
  const nodes = [
    { id: 'n', x: 0, z: -12, tags: ['crowd'] },
    { id: 'ne', x: 28, z: -16 },
    { id: 'e', x: 30, z: 6, tags: ['crowd'] },
    { id: 'se', x: 24, z: 26 },
    { id: 's', x: 0, z: 30 },
    { id: 'sw', x: -26, z: 24 },
    { id: 'w', x: -30, z: 0 },
    { id: 'nw', x: -26, z: -18 },
    { id: 'c', x: 2, z: 4, tags: ['crowd'] },
    { id: 'gate', x: 0, z: 40 },
    { id: 'out-s', x: 0, z: 90 },
    { id: 'out-n', x: -60, z: -60 },
    { id: 'out-e', x: 70, z: 40 },
  ];
  const edges = [
    ['n', 'ne'],
    ['ne', 'e'],
    ['e', 'se'],
    ['se', 's'],
    ['s', 'sw'],
    ['sw', 'w'],
    ['w', 'nw'],
    ['nw', 'n'],
    ['c', 'n'],
    ['c', 'e'],
    ['c', 's'],
    ['c', 'w'],
    ['s', 'gate'],
    ['gate', 'out-s'],
    ['nw', 'out-n'],
    ['se', 'out-e'],
  ].map(([a, b]) => ({ a, b, width: 6 }));
  const spots: { id: string; kind: string; position: { x: number; y: number; z: number }; facing: number; tag?: string }[] = [];
  // Shop doors face west (out onto the plaza): heading -π/2.
  for (let i = 0; i < 7; i++) spots.push({ id: `shop${i}`, kind: 'shopDoor', position: { x: 36.6, y: 0, z: -20 + i * 8 }, facing: -Math.PI / 2, tag: i === 2 ? 'thermopolium' : i === 4 ? 'smithy' : 'general' });
  spots.push({ id: 'stall1', kind: 'stall', position: { x: 20, y: 0, z: 18 }, facing: Math.PI });
  spots.push({ id: 'stall2', kind: 'stall', position: { x: 26, y: 0, z: -6 }, facing: -Math.PI / 2 });
  spots.push({ id: 'work1', kind: 'workshop', position: { x: 22, y: 0, z: -24 }, facing: Math.PI });
  for (let i = 0; i < 4; i++) spots.push({ id: `door${i}`, kind: 'houseDoor', position: { x: -20 + i * 13, y: 0, z: 33.2 }, facing: Math.PI });
  spots.push({ id: 'shrine', kind: 'shrine', position: { x: -30, y: 0, z: 26.6 }, facing: Math.PI });
  for (let i = 0; i < 2; i++) spots.push({ id: `fount${i}`, kind: 'fountain', position: { x: 8 + i * 4, y: 0, z: 9.8 }, facing: 0 });
  for (let i = 0; i < 3; i++) spots.push({ id: `bench${i}`, kind: 'bench', position: { x: -8 + i * 8, y: 0, z: 26 }, facing: Math.PI });
  return { nodes, edges, spots };
}

const scene: SceneDef = {
  title: 'Crowd',
  description: 'NPC life test bed: crowd, schedules, steering, barks, vignettes, carts',
  setup(game, ui) {
    const q = new URLSearchParams(location.search);
    game.world = game.addSystem(new WorldRegistry(game));
    game.interactions = game.addSystem(new Interactions(game));
    buildPlaza(game);
    if (q.get('streets') !== '0') (game as unknown as { streets: unknown }).streets = streetGraph();
    const player = setupPlayer(game, new THREE.Vector3(0, 0.05, 22), Math.PI, createHumanoid(randomAppearance(new Rng('player'), 'legionary')));
    player.yaw = 0;
    const hour = q.get('hour');
    game.time.totalHours = hour ? Number(hour) : 9.5;
    installSky(game);
    if (q.get('rpg') !== '0') {
      const rpg = installRpg(game, { examples: true });
      // Two named NPCs with schedules over this plaza.
      game.locations.add([
        { id: 'plaza-temple', name: 'Temple steps', position: { x: 0, z: -18 }, radius: 4 },
        { id: 'plaza-shops', name: 'Shops', position: { x: 33, z: -4 }, radius: 3 },
        { id: 'plaza-portico', name: 'Portico', position: { x: -32, z: 4 }, radius: 6 },
      ]);
      const named: NpcDef[] = [
        {
          id: 'crowd-felix',
          name: 'Felix the Baker',
          title: 'Pistor',
          appearance: randomAppearance(new Rng('felix'), 'merchant'),
          schedule: [
            { from: 5, at: 'plaza-shops', activity: 'sweep' },
            { from: 7, at: 'plaza-shops', activity: 'stand' },
            { from: 12, at: 'plaza-portico', activity: 'sit' },
            { from: 13.5, at: 'plaza-shops', activity: 'talk' },
            { from: 19, at: 'plaza-portico', activity: 'wander' },
            { from: 21, at: 'plaza-shops', activity: 'sleep' },
          ],
          barks: ['Bread! Fresh from the oven!', 'Salve! The loaves are still warm.'],
          tags: ['test'],
        },
        {
          id: 'crowd-aedituus',
          name: 'Philo',
          title: 'Aedituus (temple keeper)',
          appearance: randomAppearance(new Rng('philo'), 'priest'),
          essential: true,
          schedule: [
            { from: 5, at: 'plaza-temple', activity: 'pray' },
            { from: 10, at: 'plaza-temple', activity: 'wander' },
            { from: 12, at: 'plaza-temple', activity: 'pray' },
            { from: 19.5, at: 'plaza-temple', activity: 'sleep' },
          ],
          tags: ['test'],
        },
      ];
      rpg.npcs.add(named);
    }
    if (q.get('audio') !== '0') installAudio(game);
    installUI(game, ui);
    // The plaza isn't on the atlas: no landmark forecourts; a Forum-like mix of people.
    const pop = installNpcs(game, {
      atlas: false,
      district: {
        id: 'test-plaza',
        name: 'Test plaza',
        density: 1,
        weights: { citizen: 10, 'citizen-woman': 6, senator: 3, matron: 3, porter: 6, merchant: 4, artisan: 2, soldier: 3, priest: 2, idler: 4, beggar: 1, child: 2, elder: 2, foreigner: 3 },
      },
    });
    (window as unknown as { __crowd: unknown }).__crowd = {
      pop,
      start: (id: string, x?: number, z?: number) => pop.vignettes.start(id, x !== undefined && z !== undefined ? { x, z } : undefined),
      teleport: (x: number, z: number) => player.teleport({ x, y: 0.05, z }),
      stats: () => ({ ...pop.stats, crowd: pop.crowdCount, budget: pop.currentBudget, active: pop.vignettes.active, fps: game.stats.fps, draw: game.stats.drawCalls, tris: game.stats.triangles, cpu: game.stats.cpuMs }),
    };
    const v = q.get('vignette');
    if (v) setTimeout(() => pop.vignettes.start(v), 2000);
  },
};
export default scene;
