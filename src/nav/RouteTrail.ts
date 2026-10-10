/**
 * The quest route on the ground (Settings → Interface → Route on the ground, off by default): a
 * faint trail of gold chevrons on the street ahead, every 3 m for the next 50 m, pointing the way.
 * They fade out as you reach them and into the distance, so the trail never covers the street at
 * your feet or the view ahead.
 *
 * Cost: one instanced draw of at most 18 small flat quads pairs. The marks are placed five times a
 * second (or when the route changes); the fade by distance runs in the shader from one uniform,
 * so nothing else changes per frame.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import type { PointOnLine } from './polyline';
import type { QuestRoute } from './QuestRoute';

/** Spacing, the first mark's distance ahead and the last's (m along the route). */
export const TRAIL = { spacing: 3, from: 2.5, to: 52, max: 18, lift: 0.06 };

/** A flat chevron pointing +Z, 0.85 m wide (v runs across each arm for the soft edge). */
function chevronGeometry(): THREE.BufferGeometry {
  const w = 0.42;
  const back = -0.2;
  const tip = 0.22;
  const t = 0.2;
  // Two arms as quads: outer edge and inner edge, left then right.
  const pos = [
    -w, 0, back, 0, 0, tip, 0, 0, tip - t * 1.6, -w, 0, back - t,
    w, 0, back, 0, 0, tip, 0, 0, tip - t * 1.6, w, 0, back - t,
  ];
  const uv = [0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0];
  const index = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

const VERT = /* glsl */ `
uniform vec3 uPlayer;
uniform float uTime;
varying float vFade;
varying float vEdge;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float d = distance(wp.xz, uPlayer.xz);
  // Fades in from 2 to 5 m, out from 30 to 50 m; a slow pulse runs down the trail.
  vFade = smoothstep(2.0, 5.0, d) * (1.0 - smoothstep(30.0, 50.0, d)) * (0.78 + 0.22 * sin(uTime * 2.4 - d * 0.35));
  vEdge = uv.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
varying float vEdge;
void main() {
  float soft = smoothstep(0.0, 0.35, vEdge) * smoothstep(1.0, 0.65, vEdge);
  gl_FragColor = vec4(uColor, uOpacity * vFade * (0.35 + 0.65 * soft));
}`;

export class RouteTrail implements System {
  readonly name = 'routeTrail';
  readonly priority = 960;
  readonly mesh: THREE.InstancedMesh;
  private readonly uniforms = {
    uPlayer: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(1.0, 0.78, 0.36) },
    uOpacity: { value: 0.75 },
  };
  private timer = 0;
  private version = -1;
  private along = -1;
  private readonly at: PointOnLine = { x: 0, y: 0, z: 0, dx: 0, dz: 1 };
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly game: Game,
    private readonly route: QuestRoute,
  ) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(chevronGeometry(), mat, TRAIL.max);
    this.mesh.name = 'route-trail';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    game.scene.add(this.mesh);
  }

  update(dt: number) {
    const on = this.game.settings.data.routeInWorld === true && this.route.legs.length > 0;
    const p = this.game.player?.root.position;
    if (!on || !p) {
      if (this.mesh.visible) this.mesh.visible = false;
      return;
    }
    this.uniforms.uPlayer.value.copy(p);
    this.uniforms.uTime.value += dt;
    this.timer += dt;
    const changed = this.route.version !== this.version || Math.abs(this.route.along - this.along) > 1;
    if (!changed && this.timer < 0.2) return;
    this.timer = 0;
    this.version = this.route.version;
    this.along = this.route.along;
    this.place();
  }

  /** Put the marks on the route ahead of the player: fixed every `spacing` m along it, so they stay put as you walk. */
  private place() {
    const leg = this.route.legs[0];
    const line = leg?.line;
    if (!leg || !line || line.n < 2 || leg.cell !== this.route.place) {
      this.mesh.count = 0;
      this.mesh.visible = false;
      return;
    }
    const grid = this.game.population?.grid ?? null;
    const hm = this.game.heightmap;
    const end = Math.min(line.length - 1, this.route.along + TRAIL.to);
    let k = 0;
    for (let s = Math.ceil((this.route.along + TRAIL.from) / TRAIL.spacing) * TRAIL.spacing; s <= end && k < TRAIL.max; s += TRAIL.spacing) {
      const a = line.pointAt(s, this.at);
      // Street legs carry no heights: the nav grid's floor (near the player), else the terrain.
      let y = a.y;
      if (leg.cell === null || Number.isNaN(y)) y = grid?.floorAt(a.x, a.z) ?? (Number.isNaN(a.y) ? (hm?.heightAt(a.x, a.z) ?? 0) : a.y);
      this.pos.set(a.x, y + TRAIL.lift, a.z);
      this.q.setFromAxisAngle(this.up, Math.atan2(a.dx, a.dz));
      this.m.compose(this.pos, this.q, this.one);
      this.mesh.setMatrixAt(k++, this.m);
    }
    this.mesh.count = k;
    this.mesh.visible = k > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
