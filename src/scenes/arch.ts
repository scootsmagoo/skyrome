/**
 * Architecture kit gallery: a travertine-paved plaza with every classical generator at real
 * scale (buildings at WORLD_SCALE, people-sized details 1:1), plus a material swatch view.
 *
 *   ?scene=arch                  the gallery (spawn faces the temple, looking south)
 *   ?scene=arch&detail=low|far   every exhibit at the low or far LOD (far: the amphitheatre shell)
 *   ?scene=arch&view=materials   every library material on a box and a sphere
 *
 * Debug helpers on window.__arch: look(eye…, target…, fov) detaches the camera for screenshots;
 * `stats` holds triangle counts per exhibit; `info` holds placement data for scripted tests
 * (e.g. the temple stairs, used to verify that the player can climb them).
 */
import * as THREE from 'three';
import { amphitheatre, type AmphitheatreSpec } from '../arch/classical/amphitheatre';
import { amphitheatreFar } from '../arch/classical/amphitheatreFar';
import { arcade, colosseumStoreys, plainArch, triumphalArch } from '../arch/classical/arch';
import { basilica } from '../arch/classical/basilica';
import { column } from '../arch/classical/column';
import { honorificColumn, obelisk } from '../arch/classical/monuments';
import { ORDERS, diameterForHeight, type Detail } from '../arch/classical/orders';
import { porticus, quadriporticus } from '../arch/classical/porticus';
import { armoredEmperor, equestrian, quadriga, seatedDeity, togate } from '../arch/classical/statues';
import { temple } from '../arch/classical/temple';
import { tholos } from '../arch/classical/tholos';
import { barrelVault, exedra, rotunda } from '../arch/classical/vaults';
import { T, TRS } from '../arch/common/geom';
import { wall } from '../arch/common/walls';
import { inscriptionPanel, loadInscriptionFont, paintedSign } from '../arch/common/inscription';
import type { Game } from '../core/Game';
import { MeshBuilder, placeAndRegister } from '../gfx/MeshBuilder';
import { MATERIAL_IDS } from '../gfx/materialIds';
import { applyDefaultEnvironment, whenTexturesLoaded } from '../gfx/materials';
import { WorldRegistry } from '../world/WorldRegistry';
import { WORLD_SCALE } from '../world/coords';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

declare global {
  interface Window {
    __arch?: {
      /** Detach the camera from the player and aim it (screenshots): eye → target. */
      look(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov?: number): void;
      stats: Record<string, { triangles: number; vertices: number; ms: number }>;
      /** Placement info for scripted tests (e.g. the temple stairs). */
      info: Record<string, unknown>;
      /** Geometry memory of the scene: unique geometries, vertices, vertex/index bytes on the GPU and still in the JS heap. */
      memory(): { meshes: number; geometries: number; vertices: number; gpuMB: number; cpuMB: number; heapMB?: number };
    };
  }
}

const K = WORLD_SCALE;
/** `?detail=low` builds every exhibit at low detail (the far-LOD versions). */
let DET: Detail = 'high';

/** When set (by `look`), the sun's shadow camera follows this point instead of the player. */
let focus: THREE.Vector3 | null = null;

function installDebug(game: Game) {
  window.__arch = {
    stats: {},
    info: {},
    look(px, py, pz, tx, ty, tz, fov) {
      const rig = game.getSystem('cameraRig');
      if (rig) game.removeSystem(rig);
      game.camera.position.set(px, py, pz);
      game.camera.lookAt(tx, ty, tz);
      if (fov) {
        game.camera.fov = fov;
        game.camera.updateProjectionMatrix();
      }
      focus = new THREE.Vector3(tx, 0, tz);
    },
    memory() {
      const geos = new Set<THREE.BufferGeometry>();
      let meshes = 0;
      game.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        meshes++;
        geos.add(m.geometry);
      });
      let vertices = 0;
      let gpu = 0;
      let cpu = 0;
      for (const g of geos) {
        vertices += g.getAttribute('position').count;
        for (const a of [...Object.values(g.attributes), ...(g.index ? [g.index] : [])] as THREE.BufferAttribute[]) {
          const bytes = a.count * a.itemSize * (a.array ? a.array.BYTES_PER_ELEMENT : 4);
          gpu += bytes;
          if (a.array) cpu += bytes;
        }
      }
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const mb = (n: number) => Math.round(n / 1e5) / 10;
      return { meshes, geometries: geos.size, vertices, gpuMB: mb(gpu), cpuMB: mb(cpu), heapMB: mem ? mb(mem.usedJSHeapSize) : undefined };
    },
  };
}

/**
 * Warm late-morning light: strong sun, desaturated sky fill with a warm bounce from the paving,
 * and the default PMREM sky for reflections (and as the background).
 */
function lights(game: Game, follow: () => THREE.Vector3) {
  const hemi = new THREE.HemisphereLight(0xd3dde8, 0xbfa98a, 0.5);
  game.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7c4, 3.4);
  // Dev gallery: the sun stands in the north-west so the facades (which face −z, the spawn side) are lit.
  const offset = new THREE.Vector3(-60, 105, -70);
  sun.position.copy(offset);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -90;
  cam.right = cam.top = 90;
  cam.near = 10;
  cam.far = 420;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  game.scene.add(sun, sun.target);
  game.addSystem({
    name: 'archSun',
    priority: 90,
    lateUpdate() {
      const p = follow();
      const sx = Math.round(p.x / 4) * 4;
      const sz = Math.round(p.z / 4) * 4;
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + offset.x, offset.y, sz + offset.z);
    },
  });
  const env = applyDefaultEnvironment(game.scene, game.renderer, { intensity: 0.5, sunDir: offset.clone().normalize(), zenith: 0x2f6cb8 });
  game.scene.background = env;
  game.scene.backgroundBlurriness = 0.04;
  game.scene.backgroundIntensity = 1.0;
  game.scene.fog = new THREE.Fog(0xdcd6c8, 260, 1300);
  game.renderer.toneMappingExposure = 1.0;
}

/** Drawn triangles (instances counted per placement) and stored vertices (shared geometry once). */
function meshStats(g: THREE.Object3D, seen = new Set<THREE.BufferGeometry>()) {
  let tris = 0;
  let verts = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    tris += ((geo.index ? geo.index.count : geo.getAttribute('position').count) / 3) * inst;
    if (!seen.has(geo)) verts += geo.getAttribute('position').count;
    seen.add(geo);
  });
  return { tris, verts };
}

function record(name: string, g: THREE.Object3D, ms: number) {
  const { tris, verts } = meshStats(g);
  if (window.__arch) window.__arch.stats[name] = { triangles: Math.round(tris), vertices: verts, ms: Math.round(ms) };
  console.info(`[arch] ${name}: ${Math.round(tris)} tris, ${ms.toFixed(0)} ms`);
}

/**
 * Build one exhibit with its own MeshBuilder, place it, register colliders and stats. With
 * `far`, a far-LOD stand-in is built too and the registry swaps it in beyond `cullDistance`.
 */
function build(game: Game, name: string, pos: THREE.Vector3Like, rotY: number, fn: (b: MeshBuilder) => void, lod?: { far: (b: MeshBuilder) => void; cullDistance: number }) {
  const b = new MeshBuilder();
  const t0 = performance.now();
  fn(b);
  // Indexed (smooth lathes and sweeps share most vertices) and freed from the JS heap once on
  // the GPU: the gallery is static scenery and its colliders are separate.
  const g = b.build(name, { index: true, releaseCpu: true });
  let far: THREE.Group | undefined;
  if (lod) {
    const fb = new MeshBuilder();
    const t1 = performance.now();
    lod.far(fb);
    far = fb.build(`${name}-far`, { index: true, releaseCpu: true });
    record(`${name}-far`, far, performance.now() - t1);
  }
  placeAndRegister(game, `arch:${name}`, g, b.colliders, pos, rotY, { far, cullDistance: lod?.cullDistance, farDistance: 3000 });
  record(name, g, performance.now() - t0);
  return g;
}

/** A low travertine base with a carved Latin label facing −z. */
function label(b: MeshBuilder, text: string, x: number, z: number) {
  b.box('travertine', 2.4, 0.55, 0.7, T(x, 0.275, z), { collide: true });
  inscriptionPanel(b, { lines: [text], width: 2.1, height: 0.4, style: 'carved', interpunct: true }, T(x, 0.3, z - 0.36), { depth: 0.04 });
}

function plaza(game: Game) {
  build(game, 'plaza', { x: 0, y: 0, z: 0 }, 0, (b) => {
    b.box('paving_travertine', 300, 0.4, 360, T(0, -0.2, 20), { collide: true });
    // Open country round the plaza so the horizon reads as land. Its top sits 0.3 m below the
    // paving: closer and the two coplanar-ish surfaces z-fight at distance.
    b.box('dry_grass', 3000, 0.4, 3000, T(0, -0.5, 0), { collide: true, castShadow: false });
    // A basalt street (via) along the north edge, with travertine kerbs; the spawn stands on it.
    b.box('paving_basalt', 300, 0.06, 9, T(0, 0.03, -122), { castShadow: false });
    for (const sz of [-1, 1]) b.box('travertine', 300, 0.22, 0.45, T(0, 0.11, -122 + sz * 4.75), { castShadow: false });
  });
}

function materialSwatches(game: Game) {
  build(game, 'swatches', { x: 0, y: 0, z: 0 }, 0, (b) => {
    const cols = 10;
    MATERIAL_IDS.forEach((id, i) => {
      const x = (i % cols) * 3.2 - (cols - 1) * 1.6;
      const z = Math.floor(i / cols) * 4 - 8;
      b.box(id, 2.4, 2.4, 0.6, T(x, 1.4, z));
      b.add(new THREE.SphereGeometry(0.6, 32, 16), id, T(x, 3.4, z));
    });
  });
}

const ORDER_LABEL: Record<string, string> = { tuscan: 'Tuscanica', doric: 'Dorica', ionic: 'Ionica', corinthian: 'Corinthia', composite: 'Composita' };

function gallery(game: Game) {
  // 1. The five orders at 8 m, in a row left of the axis in front of the spawn.
  ORDERS.forEach((order, i) => {
    build(game, `column-${order}`, { x: -44 + i * 8, y: 0, z: -108 }, 0, (b) => {
      column(b, { order, D: diameterForHeight(order, 8), fluted: order !== 'tuscan', detail: DET });
      label(b, ORDER_LABEL[order], 0, -1.8);
    });
  });
  // 2. Obelisk on the axis (Montecitorio: 21.8 m real).
  build(game, 'obelisk', { x: 0, y: 0, z: -92 }, 0, (b) => obelisk(b, { height: 21.8 * K, detail: DET }));
  // 3. Hexastyle Corinthian pseudoperipteral temple (~30 × 55 m real).
  build(game, 'temple', { x: 0, y: 0, z: -40 }, 0, (b) => {
    const r = temple(b, { order: 'corinthian', plan: 'pseudoperipteral', front: 6, width: 30 * K, detail: DET });
    const st = r.layout.stairs;
    if (window.__arch) window.__arch.info.templeStairs = { x: (st.x0 + st.x1) / 2, z0: -40 + st.z0, z1: -40 + st.z1, top: r.layout.podiumHeight };
  });
  // 4. Honorific column (Trajan's, AD 113) and arches.
  build(game, 'honorific-column', { x: 28, y: 0, z: -66 }, 0, (b) => honorificColumn(b, { height: 29.78 * K, D: 3.69 * K, detail: DET }));
  build(game, 'arch-titus', { x: -38, y: 0, z: -72 }, 0, (b) => triumphalArch(b, { bays: 1, span: 5.36 * K, detail: DET }));
  build(game, 'arch-triple', { x: 60, y: 0, z: -78 }, 0, (b) =>
    triumphalArch(b, {
      bays: 3,
      span: 6.5 * K,
      order: 'corinthian',
      inscription: ['Imp Caesari Divi Nervae F', 'Nervae Traiano Optimo Aug Germ Dacico', 'Pontif Max Trib Pot XVII Imp VI Cos VI P P', 'Senatus Populusque Romanus'],
      inscriptionStyle: 'bronze',
      detail: DET,
    }),
  );
  build(game, 'plain-arch', { x: -76, y: 0, z: -100 }, 0, (b) => plainArch(b, { span: 3.4, material: 'travertine', detail: DET }));
  // 5. Statues.
  const statues: [string, (b: MeshBuilder, m: THREE.Matrix4) => void, number][] = [
    ['togate', (b, m) => togate(b, m, { detail: DET }), 1.6],
    ['emperor', (b, m) => armoredEmperor(b, m, { material: 'bronze', detail: DET }), 1.6],
    ['seated', (b, m) => seatedDeity(b, m, { scale: 1.2, detail: DET }), 1.8],
    ['equestrian', (b, m) => equestrian(b, m, { scale: 1.25, detail: DET }), 3.4],
    ['quadriga', (b, m) => quadriga(b, m, { material: 'bronze', scale: 0.85, detail: DET }), 3.4],
  ];
  statues.forEach(([name, fn, w], i) => {
    build(game, `statue-${name}`, { x: 22 + i * 7, y: 0, z: -104 }, 0, (b) => {
      b.box('marble', w, 1.4, name === 'equestrian' || name === 'quadriga' ? 4.6 : 1.6, T(0, 0.7, 0), { collide: true });
      fn(b, T(0, 1.4, 0));
    });
  });
  // 6. Round temples and a domed rotunda.
  build(game, 'tholos-hercules', { x: -52, y: 0, z: -34 }, 0, (b) => tholos(b, { radius: 6.6 * K * 1.4, columns: 20, columnHeight: 10.6 * K, base: 'steps', baseHeight: 0.9, detail: DET }));
  build(game, 'tholos-vesta', { x: -52, y: 0, z: 0 }, 0, (b) => tholos(b, { radius: 5.2, columns: 18, columnHeight: 6.4, base: 'podium', baseHeight: 2.0, detail: DET }));
  build(game, 'rotunda', { x: -60, y: 0, z: 38 }, 0, (b) => rotunda(b, { radius: 12, niches: 6, detail: DET }));
  // 7. A portico (Ionic, L-shaped) with painted notices on its wall.
  build(game, 'porticus', { x: -112, y: 0, z: -74 }, 0, (b) => {
    porticus(b, [new THREE.Vector3(0, 0, 30), new THREE.Vector3(0, 0, 0), new THREE.Vector3(34, 0, 0)], { order: 'ionic', columnHeight: 5.4, depth: 6, wallMaterial: 'plaster_red', material: 'marble', fluted: true, detail: DET });
    // Dipinti on the back wall (an election notice, Pompeii style, and a tavern sign). The wall's
    // inner face is at z = 6 and faces −z, like a panel's front: no rotation, the 4 cm board
    // sunk 1 cm into the plaster.
    paintedSign(b, ['C Iulium Polybium', 'Aed O V F'], 3.2, 1.0, T(17, 2.6, 5.97), { ink: '#1d1a17', ground: '#efe6d2' });
    paintedSign(b, ['Taberna Vinaria'], 2.6, 0.7, T(6, 3.1, 5.97));
  });
  // 8. Colosseum facade section (four bays of the 80, all four storeys).
  build(game, 'arcade-section', { x: 44, y: 0, z: -30 }, 0, (b) =>
    arcade(b, { bays: 4, bay: 6.6 * K, pier: 2.4 * K, depth: 2.4 * K, storeys: colosseumStoreys(K), material: 'travertine', masts: true, corridor: 3, detail: DET }),
  );
  // 9. Basilica (after the Basilica Ulpia) with apses, and vaulted forms.
  build(game, 'basilica', { x: 78, y: 0, z: 22 }, 0, (b) => basilica(b, { length: 46, naveWidth: 14, aisleWidth: 6, columnHeight: 7.2, apses: 'both', detail: DET }));
  build(game, 'barrel-vault', { x: 110, y: 0, z: -52 }, 0, (b) => barrelVault(b, { span: 6, length: 10, springing: 4, coffers: true, detail: DET }));
  build(game, 'exedra', { x: 110, y: 0, z: -20 }, 0, (b) => exedra(b, { radius: 6, height: 7, colonnade: { order: 'corinthian', count: 4 }, detail: DET }));
  // 10. An Ionic tetrastyle prostyle temple with a rostrum and lateral stairs (Castor type).
  build(game, 'temple-ionic', { x: 22, y: 0, z: 48 }, 0, (b) => {
    const r = temple(b, { order: 'ionic', plan: 'prostyle', front: 4, D: 0.8, pronaos: 2, sides: 6, stairs: 'sides', podiumHeight: 2.2, detail: DET });
    // the lateral flights in world space (foot centre, top), for scripted walks
    if (window.__arch) window.__arch.info.ionicFlights = r.layout.flights.map((f) => ({ x: 22 + (f.x0 + f.x1) / 2, z0: 48 + f.z0, z1: 48 + f.z1, top: r.layout.podiumHeight }));
  });
  // 11. A forum court: a Corinthian quadriporticus round an equestrian statue (Forum of Trajan).
  build(game, 'forum-court', { x: 78, y: 0, z: 84 }, 0, (b) => {
    quadriporticus(b, 44, 32, { order: 'corinthian', columnHeight: 6.4, depth: 5.5, wallMaterial: 'plaster_cream', floorMaterial: 'paving_travertine', detail: DET, columnDetail: DET === 'far' ? 'far' : 'low' });
    b.box('marble', 3.6, 3.2, 5.4, T(0, 1.6, 0), { collide: true });
    inscriptionPanel(b, { lines: ['Imp Caesari Nervae Traiano', 'Senatus Populusque Romanus'], width: 3.0, height: 0.9, style: 'bronze' }, T(0, 1.8, -2.72), { depth: 0.05 });
    equestrian(b, T(0, 3.2, 0), { scale: 1.6, detail: DET });
  });
  // 12. Wall specimens: opus testaceum with a door and niches, reticulatum with windows, and
  //     a plastered wall painted in the Pompeian style.
  build(game, 'walls', { x: -34, y: 0, z: 68 }, 0, (b) => {
    wall(b, { length: 9, height: 5, thickness: 0.7, material: 'brick', openings: [{ kind: 'door', x: 4.5, width: 1.6, height: 2.8, leaves: 'closed', leafMaterial: 'wood_dark' }, { kind: 'niche', x: 1.6, width: 1.1, height: 2.0 }, { kind: 'niche', x: 7.4, width: 1.1, height: 2.0 }], detail: DET });
    wall(b, { length: 9, height: 5, thickness: 0.7, material: 'reticulatum', frameMaterial: 'travertine', openings: [{ kind: 'window', x: 2.4, width: 1.1, height: 1.6, sill: 2.4, arched: true }, { kind: 'window', x: 6.6, width: 1.1, height: 1.6, sill: 2.4, arched: true }, { kind: 'arch', x: 4.5, width: 1.8, height: 3.2 }], detail: DET }, T(10, 0, 0));
    // the painted scheme is designed for a 3.2 m room height (socle, panels, frieze, upper zone)
    wall(b, { length: 9, height: 3.2, thickness: 0.7, material: 'stucco_painted', openings: [], detail: DET }, T(20, 0, 0));
    paintedSign(b, ['Pistor', 'Panis Venalis'], 2.2, 0.8, TRS(14.5, 4.1, -0.37, 0, 0, 0), { ground: '#efe4cc' });
  });
  // 13. The Flavian Amphitheatre at WORLD_SCALE (188 × 156 m real): facade, ambulatory and cavea
  //     with the four axial entrances, arena gates and vomitoria. Beyond ~180 m (from the
  //     spawn, for one) the registry shows the ~5k-triangle far shell instead.
  const amphAt = { x: -10, y: 0, z: 150 };
  const amphSpec: AmphitheatreSpec = {
    facade: { rx: 94 * K, rz: 78 * K, bays: 80, storeys: colosseumStoreys(K), depth: 2.4 * K, corridor: 6 * K, material: 'travertine', detail: DET === 'high' ? 'low' : DET, masts: true },
    cavea: {
      arenaRx: 43 * K,
      arenaRz: 27 * K,
      podium: 4 * K,
      tiers: [{ rows: 6, rise: 0.4, depth: 0.7 }, { rows: 9, rise: 0.4, depth: 0.7, wall: 1.0 }, { rows: 5, rise: 0.4, depth: 0.7, wall: 1.0 }],
      segments: 96,
      aisles: 20,
      seatMaterial: 'marble',
      riserMaterial: 'marble_veined',
      topPortico: { order: 'corinthian', columnHeight: 7 },
      detail: DET,
    },
  };
  if (DET === 'far') {
    build(game, 'amphitheatre', amphAt, 0, (b) => amphitheatreFar(b, amphSpec));
    return;
  }
  const amphitheatreNear = (b: MeshBuilder) => {
    const r = amphitheatre(b, amphSpec);
    // World-space entrances for scripted walks (shot steps): facade bay, passage axis and mouth.
    if (window.__arch)
      window.__arch.info.amphitheatre = {
        reach: r.cavea.reach,
        caveaTop: r.cavea.height,
        facade: r.facade.height,
        entrances: r.entrances.map((e) => ({ kind: e.kind, x: amphAt.x + e.x, z: amphAt.z + e.z, nx: e.nx, nz: e.nz, ax: amphAt.x + e.passage.x, az: amphAt.z + e.passage.z, dx: e.passage.dx, dz: e.passage.dz, mouth: e.passage.mouth, outer: e.passage.outer, floor: e.passage.floor })),
      };
  };
  build(game, 'amphitheatre', amphAt, 0, amphitheatreNear, { far: (b) => amphitheatreFar(b, amphSpec), cullDistance: 180 });
}

const scene: SceneDef = {
  title: 'Architecture kit',
  description: 'Classical architecture generators and materials gallery',
  async setup(game) {
    const params = new URLSearchParams(location.search);
    const view = params.get('view') ?? 'gallery';
    const det = params.get('detail');
    DET = det === 'low' || det === 'far' ? det : 'high';
    await loadInscriptionFont();
    // Distance culling and far-LOD swaps (the world module owns this in the game proper).
    if (!game.world) {
      game.world = new WorldRegistry(game);
      game.addSystem(game.world);
    }
    plaza(game);
    // Spawn north of the exhibits, looking south (+z) along the axis towards the temple.
    const player = setupPlayer(game, new THREE.Vector3(0, 0.05, -128), 0);
    installDebug(game);
    lights(game, () => focus ?? player.root.position);
    if (view === 'materials') {
      player.teleport({ x: 0, y: 0.05, z: -20 }, 0);
      materialSwatches(game);
    } else gallery(game);
    await whenTexturesLoaded();
  },
};
export default scene;
