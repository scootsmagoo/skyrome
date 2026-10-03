/**
 * Image-based lighting from the sky: renders the dome (without sun disc and stars, with the
 * ground below the horizon) into a small cube map and pre-filters it with PMREM, so metals,
 * polished marble and water reflect the actual sky and diffuse surfaces get sky-colored ambient.
 *
 * Refreshes are throttled: only when the sky changed noticeably (sun moved, weather blended) and
 * at most every `minInterval` real seconds; one refresh costs roughly 1 ms of GPU time.
 */
import * as THREE from 'three';
import type { SkyDome } from './SkyDome';

export class SkyEnvironment {
  readonly scene = new THREE.Scene();
  private cubeTarget: THREE.WebGLCubeRenderTarget;
  private cubeCamera: THREE.CubeCamera;
  private pmrem: THREE.PMREMGenerator;
  private target: THREE.WebGLRenderTarget | null = null;
  private sinceRefresh = Infinity;
  private signature: number[] = [];
  /** Minimum real seconds between refreshes. */
  minInterval = 0.4;
  /** Maximum real seconds between refreshes (clouds drift). */
  maxInterval = 20;
  refreshes = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly dome: SkyDome,
    size = 128,
  ) {
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCamera = new THREE.CubeCamera(0.1, 10, this.cubeTarget);
    this.scene.add(dome.envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  get texture(): THREE.Texture | null {
    return this.target?.texture ?? null;
  }

  /**
   * Refresh if `signature` (numbers describing the sky's state) differs from the last bake by more
   * than `tolerance` in any component, subject to the interval limits. Returns true if baked.
   */
  update(dt: number, signature: number[], tolerance: number[], force = false): boolean {
    this.sinceRefresh += dt;
    let changed = force || this.signature.length !== signature.length;
    if (!changed) for (let i = 0; i < signature.length; i++) if (Math.abs(signature[i] - this.signature[i]) > tolerance[i]) changed = true;
    if (!force) {
      if (this.sinceRefresh < this.minInterval) return false;
      if (!changed && this.sinceRefresh < this.maxInterval) return false;
    }
    this.signature = signature.slice();
    this.sinceRefresh = 0;
    this.bake();
    return true;
  }

  private bake() {
    const u = this.dome.uniforms;
    u.uEnvMode.value = 1;
    const flash = u.uFlash.value;
    u.uFlash.value = 0;
    const prevTarget = this.renderer.getRenderTarget();
    this.cubeCamera.update(this.renderer, this.scene);
    u.uEnvMode.value = 0;
    u.uFlash.value = flash;
    this.target = this.pmrem.fromCubemap(this.cubeTarget.texture, this.target ?? undefined);
    this.renderer.setRenderTarget(prevTarget);
    this.refreshes++;
  }

  dispose() {
    this.cubeTarget.dispose();
    this.target?.dispose();
    this.pmrem.dispose();
  }
}
