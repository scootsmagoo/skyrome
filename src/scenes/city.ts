/**
 * City fabric viewer: the whole of Rome (terrain, landmarks, city) with framed views of the
 * ordinary city.
 *
 *   ?scene=city&view=subura|argiletum|tuscus|velabrum|boarium|caelian|aventine|aerial|capitol|palatine|far|
 *              aqueduct|arcades|neroniani|wall|gate|agger|scalae|river|capena|circus|golden
 *              [&hour=9.5][&extent=core|city][&walk=1]
 *
 * Street views put the player on the nearest street-graph node and look along the street at eye
 * height (dev camera); `&walk=1` keeps the player camera instead, so the street can be walked.
 * `window.cityView(name)` switches views at runtime (for scripted screenshots).
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { devCamera } from '../dev/devCamera';
import { whenTexturesLoaded } from '../gfx/materials';
import { Interactions } from '../interaction/Interactions';
import { WorldRegistry } from '../world/WorldRegistry';
import { buildRome, type RomeExtent } from '../world/rome/buildRome';
import { installSky } from '../world/sky';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

interface View {
  /** Real-meter point (atlas frame) to stand at (snapped to the street graph for street views). */
  at: [number, number];
  /** Real-meter point to look toward. */
  look: [number, number];
  /** Eye height above the ground (game m); street views 1.7. */
  h: number;
  street?: boolean;
}

const VIEWS: Record<string, View> = {
  subura: { at: [430, -330], look: [520, -400], h: 1.7, street: true },
  argiletum: { at: [300, -140], look: [430, -180], h: 1.7, street: true },
  tuscus: { at: [-10, 240], look: [-50, 320], h: 1.7, street: true },
  velabrum: { at: [-90, 350], look: [-180, 380], h: 1.7, street: true },
  boarium: { at: [-230, 330], look: [-300, 450], h: 3 },
  caelian: { at: [760, 620], look: [900, 700], h: 1.7, street: true },
  aventine: { at: [-150, 900], look: [-250, 1000], h: 1.7, street: true },
  aerial: { at: [250, 1030], look: [250, 80], h: 330 },
  capitol: { at: [-95, -150], look: [600, -250], h: 8 },
  palatine: { at: [150, 330], look: [700, -200], h: 24 },
  capena: { at: [470, 905], look: [300, 760], h: 1.7, street: true },
  circus: { at: [280, 748], look: [156, 657], h: 1.7, street: true },
  golden: { at: [640, 1180], look: [120, 520], h: 150 },
  far: { at: [-200, 80], look: [1200, -500], h: 30 },
  aqueduct: { at: [470, 700], look: [420, 590], h: 2 },
  arcades: { at: [380, 760], look: [800, 640], h: 70 },
  neroniani: { at: [880, 640], look: [870, 760], h: 2 },
  wall: { at: [-480, 1180], look: [-560, 1060], h: 2 },
  gate: { at: [0, 1300], look: [-20, 1345], h: 2 },
  agger: { at: [1330, -960], look: [1470, -800], h: 4 },
  scalae: { at: [-30, 470], look: [30, 380], h: 1.7 },
  river: { at: [-370, 270], look: [-470, 220], h: 1.7, street: true },
};

declare global {
  interface Window {
    /** Switch to a view; `turn` (radians) turns the player from the street direction (walk tests). */
    cityView?: (name: string, turn?: number) => unknown;
    /** Free survey camera in game coordinates (builds the city detail around the eye first). */
    cityCam?: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => unknown;
  }
}

const scene: SceneDef = {
  title: 'City',
  description: 'Rome\'s city fabric: streets, insulae, walls, aqueducts, gardens (framed views)',
  async setup(game: Game) {
    const p = new URLSearchParams(location.search);
    game.world = game.addSystem(new WorldRegistry(game));
    game.interactions = game.addSystem(new Interactions(game));
    const name = p.get('view') ?? 'subura';
    const first = VIEWS[name] ?? VIEWS.subura;
    await buildRome(game, { extent: (p.get('extent') as RomeExtent) ?? 'core' });
    await whenTexturesLoaded().catch(() => {});
    const H = (x: number, z: number) => game.heightmap.heightAt(x, z);
    const start = place(game, first);
    const player = setupPlayer(game, start.feet, start.heading);
    player.yaw = start.heading + Math.PI;
    game.time.totalHours = Number(p.get('hour') ?? 9.5);
    installSky(game);
    const walk = p.has('walk');
    // Survey views look from the player's eyes: hide the body.
    if (!walk) player.root.visible = false;
    const apply = (v: View, turn = 0) => {
      const s = place(game, v);
      player.teleport(s.feet, s.heading + turn);
      player.yaw = s.heading + turn + Math.PI;
      game.city?.prime(s.feet);
      if (!walk) devCamera(game).look(s.eye, new THREE.Vector3(s.target.x, H(s.target.x, s.target.z) + (v.street ? 1.6 : 0), s.target.z));
      game.world.refreshAll();
      return { feet: s.feet.toArray().map((x) => +x.toFixed(1)), heading: +s.heading.toFixed(2) };
    };
    window.cityView = (n: string, turn = 0) => apply(VIEWS[n] ?? VIEWS.subura, turn);
    window.cityCam = (x, y, z, tx, ty, tz) => {
      const eye = new THREE.Vector3(x, y, z);
      player.teleport(new THREE.Vector3(x, H(x, z) + 0.05, z), 0);
      game.city?.prime(eye);
      devCamera(game).look(eye, new THREE.Vector3(tx, ty, tz));
      return 1;
    };
    apply(first);
  },
};
export default scene;

/** Where a view stands (feet), where the eye is, and what it looks at (game coordinates). */
function place(game: Game, v: View) {
  const S = 0.6;
  let x = v.at[0] * S, z = v.at[1] * S;
  let tx = v.look[0] * S, tz = v.look[1] * S;
  if (v.street && game.streets) {
    // Snap to the nearest street node and look along its longest edge toward the target.
    const n = game.streets.nearest(x, z, 120);
    if (n >= 0) {
      const node = game.streets.nodes[n];
      x = node.x;
      z = node.z;
      let best = -Infinity;
      for (const [m] of game.streets.neighbours(n)) {
        const o = game.streets.nodes[m];
        const dx = o.x - x, dz = o.z - z;
        const l = Math.hypot(dx, dz) || 1;
        const score = (dx * (tx - x) + dz * (tz - z)) / (l * (Math.hypot(tx - x, tz - z) || 1));
        if (score > best) {
          best = score;
          tx = x + (dx / l) * 60;
          tz = z + (dz / l) * 60;
        }
      }
    }
  }
  const ground = game.heightmap.heightAt(x, z);
  const top = game.physics.groundHeight(x, z, ground + 40, 80) ?? ground;
  const feet = new THREE.Vector3(x, top + 0.05, z);
  const eye = new THREE.Vector3(x, top + v.h, z);
  const heading = Math.atan2(tx - x, tz - z);
  return { feet, eye, target: new THREE.Vector3(tx, 0, tz), heading };
}
