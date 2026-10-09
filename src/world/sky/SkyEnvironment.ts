/**
 * Image-based lighting from the sky: renders the dome (without sun disc and stars, with the
 * ground below the horizon) into a small cube map and pre-filters it with PMREM, so metals,
 * polished marble and water reflect the actual sky and diffuse surfaces get sky-colored ambient.
 *
 * Changes are crossfaded: a new sky is blended over the previous one in `FADE_STEPS` cube blends
 * (a small shader pass per cube face) before each PMREM, so the ambient light eases from one sky to
 * the next instead of stepping every time a bake lands.
 *
 * Refreshes are throttled: only when the sky changed noticeably (sun moved, weather blended) and
 * at most every `minInterval` real seconds; one refresh costs roughly 1 ms of GPU time.
 */
import * as THREE from 'three';
import type { SkyDome } from './SkyDome';

/** A new sky takes this many blended PMREM bakes to take over, one every `FADE_GAP` seconds. */
const FADE_STEPS = 3;
const FADE_GAP = 0.2;

export class SkyEnvironment {
  readonly scene = new THREE.Scene();
  private cubeTarget: THREE.WebGLCubeRenderTarget;
  private cubeCamera: THREE.CubeCamera;
  private pmrem: THREE.PMREMGenerator;
  /** The sky shown before the current fade, and the blend being shown (swapped when a fade ends). */
  private oldCube: THREE.WebGLCubeRenderTarget;
  private outCube: THREE.WebGLCubeRenderTarget;
  private blendCamera: THREE.CubeCamera;
  private readonly blendScene = new THREE.Scene();
  private readonly blendMat: THREE.ShaderMaterial;
  private fadeStep = FADE_STEPS;
  private fadeWait = 0;
  private hasBase = false;
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
    const mk = () => new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.oldCube = mk();
    this.outCube = mk();
    this.blendCamera = new THREE.CubeCamera(0.1, 10, this.outCube);
    this.blendMat = new THREE.ShaderMaterial({
      name: 'SkyEnvBlend',
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { tOld: { value: this.oldCube.texture }, tNew: { value: this.cubeTarget.texture }, uMix: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform samplerCube tOld; uniform samplerCube tNew; uniform float uMix; varying vec3 vDir; void main() { vec3 d = normalize(vDir); gl_FragColor = vec4(mix(textureCube(tOld, d).rgb, textureCube(tNew, d).rgb, uMix), 1.0); }',
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), this.blendMat);
    box.frustumCulled = false;
    this.blendScene.add(box);
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
    if (this.fadeStep < FADE_STEPS) {
      // Mid-fade: the next blend step is due (a fresh change restarts the fade below instead).
      this.fadeWait -= dt;
      if (this.fadeWait <= 0 && !force) this.blendStep();
    }
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
    this.renderer.setRenderTarget(prevTarget);
    if (!this.hasBase) {
      // First bake: nothing to fade from, show the sky as it is.
      this.hasBase = true;
      this.fadeStep = FADE_STEPS - 1;
      this.blendMat.uniforms.tOld.value = this.cubeTarget.texture;
    } else {
      // The sky being shown right now (possibly mid-fade) becomes the one to fade from.
      if (this.fadeStep < FADE_STEPS) [this.oldCube, this.outCube] = [this.outCube, this.oldCube];
      this.blendMat.uniforms.tOld.value = this.oldCube.texture;
      this.fadeStep = 0;
    }
    this.blendStep();
  }

  /** Blend old to new by the next fraction, then pre-filter the result. */
  private blendStep() {
    this.fadeStep++;
    this.blendMat.uniforms.uMix.value = this.fadeStep / FADE_STEPS;
    this.fadeWait = FADE_GAP;
    const prevTarget = this.renderer.getRenderTarget();
    this.blendCamera.renderTarget = this.outCube;
    this.blendCamera.update(this.renderer, this.blendScene);
    this.target = this.pmrem.fromCubemap(this.outCube.texture, this.target ?? undefined);
    this.renderer.setRenderTarget(prevTarget);
    this.refreshes++;
    // Fade done: the result becomes the base for the next one.
    if (this.fadeStep >= FADE_STEPS) [this.oldCube, this.outCube] = [this.outCube, this.oldCube];
  }

  dispose() {
    this.cubeTarget.dispose();
    this.oldCube.dispose();
    this.outCube.dispose();
    this.blendMat.dispose();
    this.target?.dispose();
    this.pmrem.dispose();
  }
}
