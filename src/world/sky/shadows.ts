/**
 * The key light (sun by day, moon by night) and its shadows. Exactly ONE shadow-casting
 * directional light exists at any time; switching sun → moon only changes its direction, color
 * and intensity (no shader recompiles).
 *
 * Two shadow techniques, chosen by quality:
 *  - 'single': a DirectionalLight whose orthographic shadow box follows the camera, pushed ahead of
 *    it and snapped to whole shadow texels in light space so edges don't shimmer as you walk.
 *  - 'cascade': three r186's native two-cascade `SunLight` (fitted to the view frustum by the
 *    renderer; no material patching, unlike the older CSM addon).
 * The light DIRECTION also moves in small steps (≈0.03°) instead of every frame: the sun crawls
 * slowly enough that sub-texel steps are invisible, and the texel grid stays stable in between.
 */
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';

export type ShadowQuality = 'off' | 'low' | 'high';
export type ShadowMode = 'single' | 'cascade';

export interface ShadowPreset {
  mode: ShadowMode;
  mapSize: number;
  /** Side of the shadow box (single) in metres. */
  extent: number;
  /** Shadow distance for cascades (m). */
  distance: number;
  radius: number;
}

export const SHADOW_PRESETS: Record<Exclude<ShadowQuality, 'off'>, ShadowPreset> = {
  low: { mode: 'single', mapSize: 1024, extent: 110, distance: 0, radius: 1.5 },
  high: { mode: 'single', mapSize: 2048, extent: 120, distance: 0, radius: 2 },
};
/** Alternative 'high' (selectable for comparison with ?shadowmode=cascade). */
export const CASCADE_PRESET: ShadowPreset = { mode: 'cascade', mapSize: 2048, extent: 0, distance: 220, radius: 2 };

/** Distance from the focus to the light along its direction; the shadow depth range spans 2×. */
const LIGHT_DISTANCE = 260;
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Snap `center` to the shadow-map texel grid of a light shining along -`toLight`, matching the
 * basis of an orthographic camera that looks from the light with up = +Y (what three uses).
 */
export function snapToTexels(center: THREE.Vector3, toLight: THREE.Vector3, texel: number, out = new THREE.Vector3()): THREE.Vector3 {
  _z.copy(toLight).normalize();
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  const cx = Math.round(center.dot(_x) / texel) * texel;
  const cy = Math.round(center.dot(_y) / texel) * texel;
  const cz = center.dot(_z);
  return out.set(0, 0, 0).addScaledVector(_x, cx).addScaledVector(_y, cy).addScaledVector(_z, cz);
}

export class ShadowRig {
  /** The current key light (a DirectionalLight, or a SunLight in cascade mode). */
  light: THREE.DirectionalLight | SunLight;
  quality: ShadowQuality = 'high';
  preset: ShadowPreset = SHADOW_PRESETS.high;
  /** Direction the light currently shines FROM (stepped, see header). */
  readonly dir = new THREE.Vector3(0, 1, 0);
  /** Shift the shadow box ahead of the camera by this fraction of its extent. */
  lookAhead = 0.28;
  private readonly focus = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.light = this.makeLight('single');
  }

  private makeLight(mode: ShadowMode): THREE.DirectionalLight | SunLight {
    if (mode === 'cascade') {
      const l = new SunLight(0xffffff, 1);
      l.name = 'keyLight';
      this.scene.add(l);
      return l;
    }
    const l = new THREE.DirectionalLight(0xffffff, 1);
    l.name = 'keyLight';
    this.scene.add(l, l.target);
    return l;
  }

  /** Apply a quality level (and optionally force the technique). Recompiles shaders once if the light type changes. */
  setQuality(q: ShadowQuality, mode?: ShadowMode) {
    this.quality = q;
    const preset = q === 'off' ? SHADOW_PRESETS.low : mode === 'cascade' ? CASCADE_PRESET : SHADOW_PRESETS[q];
    this.preset = preset;
    const wantSun = preset.mode === 'cascade';
    const isSun = (this.light as SunLight).isSunLight === true;
    if (wantSun !== isSun) {
      const old = this.light;
      this.light = this.makeLight(preset.mode);
      this.light.color.copy(old.color);
      this.light.intensity = old.intensity;
      old.removeFromParent();
      if ((old as THREE.DirectionalLight).target) (old as THREE.DirectionalLight).target.removeFromParent();
      old.dispose();
    }
    const l = this.light;
    l.castShadow = q !== 'off';
    if (q !== 'off') this.renderer.shadowMap.enabled = true;
    const s = l.shadow;
    if (s.mapSize.x !== preset.mapSize) {
      s.mapSize.set(preset.mapSize, preset.mapSize);
      s.map?.dispose();
      s.map = null;
    }
    s.radius = preset.radius;
    s.bias = preset.mode === 'cascade' ? -0.0003 : -0.00025;
    s.normalBias = preset.mode === 'cascade' ? 0.05 : 0.035 * (preset.extent / preset.mapSize) / 0.073;
    const cam = s.camera as THREE.OrthographicCamera;
    if (preset.mode === 'single') {
      cam.left = cam.bottom = -preset.extent / 2;
      cam.right = cam.top = preset.extent / 2;
      cam.near = 1;
      cam.far = LIGHT_DISTANCE * 2;
    } else {
      cam.near = 1;
      cam.far = preset.distance;
    }
    cam.updateProjectionMatrix();
  }

  /**
   * Point the light along `toLight` (unit, toward the sun/moon) and fit the shadow to the view.
   * `camPos`/`camDir` are the main camera position and forward direction.
   */
  update(toLight: THREE.Vector3, camPos: THREE.Vector3, camDir: THREE.Vector3) {
    // Step the direction (see header): ~0.03° hysteresis.
    if (this.dir.dot(toLight) < 0.99999986) this.dir.copy(toLight);
    const l = this.light;
    if ((l as SunLight).isSunLight) {
      l.position.copy(this.dir);
      l.updateMatrixWorld();
      return;
    }
    const p = this.preset;
    // Shadow box centred a bit ahead of the camera (horizontal look direction).
    this.tmp.set(camDir.x, 0, camDir.z);
    if (this.tmp.lengthSq() < 1e-6) this.tmp.set(0, 0, -1);
    this.tmp.normalize().multiplyScalar(p.extent * this.lookAhead);
    this.focus.copy(camPos).add(this.tmp);
    const texel = p.extent / p.mapSize;
    snapToTexels(this.focus, this.dir, texel, this.focus);
    const d = l as THREE.DirectionalLight;
    d.target.position.copy(this.focus);
    d.position.copy(this.focus).addScaledVector(this.dir, LIGHT_DISTANCE);
    d.updateMatrixWorld();
    d.target.updateMatrixWorld();
  }

  dispose() {
    this.light.removeFromParent();
    this.light.dispose();
  }
}
