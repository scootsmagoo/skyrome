/**
 * The sky dome: a unit sphere that follows the camera and is drawn at the far plane after all
 * opaque geometry, so it only shades uncovered pixels. Clear-sky radiance comes from two small
 * sky-view LUTs (one lit by the sun, one by the moon) that are re-baked only when their light
 * moves or the haze changes; stars, discs, clouds and horizon haze are evaluated per pixel.
 */
import * as THREE from 'three';
import type { Lighting } from './lighting';
import { FULLSCREEN_VERT, LUT_FRAG, SKY_FRAG, SKY_VERT } from './skyShader';

export const LUT_SIZE = { width: 192, height: 128 };

function makeLutTarget() {
  return new THREE.WebGLRenderTarget(LUT_SIZE.width, LUT_SIZE.height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    generateMipmaps: false,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
}

interface LutState {
  target: THREE.WebGLRenderTarget;
  el: number;
  haze: number;
  g: number;
}

const v3 = () => new THREE.Vector3();
const c3 = () => new THREE.Color();

export class SkyDome {
  readonly mesh: THREE.Mesh;
  /** A second mesh sharing the material, centred at the origin, for the environment bake. */
  readonly envMesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly uniforms = {
    uSunLut: { value: null as THREE.Texture | null },
    uMoonLut: { value: null as THREE.Texture | null },
    uSunDir: { value: v3() },
    uMoonDir: { value: v3() },
    uSunRadiance: { value: c3() },
    uMoonRadiance: { value: c3() },
    uSunDisc: { value: c3() },
    uMoonDisc: { value: c3() },
    uSunSize: { value: Math.cos(0.55 * THREE.MathUtils.DEG2RAD) },
    uMoonSize: { value: 0.85 * THREE.MathUtils.DEG2RAD },
    uNightZenith: { value: c3() },
    uNightHorizon: { value: c3() },
    uStarMatrix: { value: new THREE.Matrix3() },
    uStars: { value: 0 },
    uGalPole: { value: v3() },
    uGalCenter: { value: v3() },
    uTime: { value: 0 },
    uCloudCover: { value: 0.3 },
    uCloudOffset: { value: new THREE.Vector2() },
    uCirrusOffset: { value: new THREE.Vector2() },
    uCirrus: { value: 0.3 },
    uCloudSun: { value: c3() },
    uCloudAmbient: { value: c3() },
    uCloudDark: { value: 0 },
    uFogColor: { value: c3() },
    uFogSunColor: { value: c3() },
    uFogSunPower: { value: 8 },
    uHorizonBand: { value: 0.05 },
    uGroundColor: { value: c3() },
    uEnvMode: { value: 0 },
    uFlash: { value: 0 },
    uTwilight: { value: c3() },
    uTwilightBelt: { value: c3() },
    uHazeVeil: { value: 0 },
  };

  private sunLut: LutState;
  private moonLut: LutState;
  private lutMaterial: THREE.ShaderMaterial;
  private lutScene = new THREE.Scene();
  private lutCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** LUT re-bakes so far (for diagnostics). */
  bakes = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      name: 'SkyDome',
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    // The dome needs fwidth() for anti-aliased stars (core in WebGL2).
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'skyDome';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1e9; // last among opaques → early-z skips covered pixels
    this.mesh.matrixAutoUpdate = false;
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      // Centre on whichever camera renders it (main view, cube camera…).
      this.mesh.matrixWorld.makeTranslation(camera.matrixWorld.elements[12], camera.matrixWorld.elements[13], camera.matrixWorld.elements[14]);
    };
    this.envMesh = new THREE.Mesh(geo, this.material);
    this.envMesh.frustumCulled = false;

    this.sunLut = { target: makeLutTarget(), el: NaN, haze: NaN, g: NaN };
    this.moonLut = { target: makeLutTarget(), el: NaN, haze: NaN, g: NaN };
    this.uniforms.uSunLut.value = this.sunLut.target.texture;
    this.uniforms.uMoonLut.value = this.moonLut.target.texture;

    this.lutMaterial = new THREE.ShaderMaterial({
      name: 'SkyLut',
      uniforms: { uLightEl: { value: 0 }, uHaze: { value: 1 }, uMieG: { value: 0.8 } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: LUT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new THREE.Mesh(tri, this.lutMaterial);
    quad.frustumCulled = false;
    this.lutScene.add(quad);
  }

  /** Re-bake a LUT if its light moved more than ~0.08° or the haze changed noticeably. */
  private bake(renderer: THREE.WebGLRenderer, lut: LutState, el: number, haze: number, g: number, force: boolean) {
    const moved = Math.abs(el - lut.el) > 0.0014;
    const hazed = Math.abs(haze - lut.haze) > 0.02 * Math.max(1, lut.haze) || Math.abs(g - lut.g) > 0.005;
    if (!force && !moved && !hazed) return false;
    lut.el = el;
    lut.haze = haze;
    lut.g = g;
    const u = this.lutMaterial.uniforms;
    u.uLightEl.value = el;
    u.uHaze.value = haze;
    u.uMieG.value = g;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(lut.target);
    renderer.render(this.lutScene, this.lutCamera);
    renderer.setRenderTarget(prev);
    this.bakes++;
    return true;
  }

  /** Bake LUTs as needed; returns true if anything changed. */
  updateLuts(renderer: THREE.WebGLRenderer, sun: THREE.Vector3, moon: THREE.Vector3, haze: number, g: number, moonVisible: boolean, force = false) {
    let changed = this.bake(renderer, this.sunLut, Math.asin(THREE.MathUtils.clamp(sun.y, -1, 1)), haze, g, force);
    if (moonVisible || force) changed = this.bake(renderer, this.moonLut, Math.asin(THREE.MathUtils.clamp(moon.y, -1, 1)), haze, g, force) || changed;
    return changed;
  }

  /** Copy the derived lighting into the dome's uniforms. */
  applyLighting(L: Lighting, sun: THREE.Vector3, moon: THREE.Vector3) {
    const u = this.uniforms;
    u.uSunDir.value.copy(sun);
    u.uMoonDir.value.copy(moon);
    u.uSunRadiance.value.setScalar(L.sunRadiance);
    u.uMoonRadiance.value.setScalar(L.moonRadiance);
    u.uSunDisc.value.fromArray(L.sunDisc);
    u.uMoonDisc.value.fromArray(L.moonDisc);
    u.uNightZenith.value.fromArray(L.nightZenith);
    u.uNightHorizon.value.fromArray(L.nightHorizon);
    u.uStars.value = L.stars;
    u.uCloudSun.value.fromArray(L.cloudSun);
    u.uCloudAmbient.value.fromArray(L.cloudAmbient);
    u.uFogColor.value.fromArray(L.fogColor);
    u.uFogSunColor.value.fromArray(L.fogSunColor);
    u.uFogSunPower.value = L.fogSunPower;
    u.uHorizonBand.value = L.horizonBand;
    u.uGroundColor.value.fromArray(L.groundColor);
    u.uTwilight.value.fromArray(L.twilight);
    u.uTwilightBelt.value.fromArray(L.twilightBelt);
    u.uHazeVeil.value = L.hazeVeil;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.lutMaterial.dispose();
    this.sunLut.target.dispose();
    this.moonLut.target.dispose();
  }
}
