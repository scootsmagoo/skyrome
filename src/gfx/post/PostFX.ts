/**
 * Post-processing, kept deliberately small (cost ≈ one full-screen pass plus a bloom chain at
 * half resolution and below):
 *
 *   scene → HDR target (half float, 4× MSAA when antialias is on)
 *         → bloom: 5 downsamples (13-tap, Karis-averaged threshold) + 4 tent upsamples
 *         → composite to screen: tone mapping (AgX/ACES/Neutral) + grade + vignette + dither
 *         → FXAA (only when MSAA is off; the composite then goes through an 8-bit target)
 *
 * Install with `installPostFX(game)`; it replaces `game.renderFrame`. Toggle at runtime with
 * `game.post.enabled` or the `postfx` setting (when off, the renderer tone-maps directly).
 */
import * as THREE from 'three';
import { AO_BLUR_FRAG, AO_FRAG } from './ao';
import { SHAFT_BLUR_FRAG, SHAFT_MASK_FRAG } from './shafts';
import { aoDefault, shaftsDefault } from '../../core/graphics';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { Game, System } from '../../core/Game';
import { COMPOSITE_FRAG, DOWNSAMPLE_FRAG, POST_VERT, UPSAMPLE_FRAG } from './shaders';

declare module '../../core/Game' {
  interface Game {
    post: PostFX;
  }
}

declare module '../../core/Settings' {
  interface SettingsData {
    /** Post-processing on/off (default on). */
    postfx?: boolean;
    /** Bloom on/off (default on). */
    bloom?: boolean;
    /** Screen-space ambient occlusion (default: on for the High graphics tier). */
    ao?: boolean;
    /** Sun shafts (default: on for the High graphics tier). */
    sunShafts?: boolean;
  }
}

export type ToneMap = 'aces' | 'agx' | 'neutral';
const TONEMAP_DEFINE: Record<ToneMap, number> = { aces: 0, agx: 1, neutral: 2 };
const TONEMAP_RENDERER: Record<ToneMap, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

export interface PostOptions {
  toneMapping?: ToneMap;
  /** Bloom strength (0 disables). */
  bloom?: number;
  /** MSAA on the HDR target; default follows settings.antialias. */
  msaa?: boolean;
}

export interface GradeParams {
  saturation: number;
  contrast: number;
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  vignette: number;
}

const BLOOM_LEVELS = 5;

export class PostFX implements System {
  readonly name = 'postfx';
  readonly priority = 2000;
  enabled: boolean;
  bloomEnabled: boolean;
  aoEnabled: boolean;
  /** AO strength and reach (view-space metres). */
  aoIntensity = 0.8;
  aoRadius = 0.6;
  aoFadeFar = 70;
  bloomStrength: number;
  bloomThreshold = 1.4;
  bloomKnee = 0.6;
  bloomRadius = 1;
  toneMap: ToneMap;
  readonly grade: GradeParams = {
    saturation: 1.04,
    contrast: 0.06,
    shadowTint: new THREE.Color(0.94, 0.99, 1.06),
    highlightTint: new THREE.Color(1.05, 1.0, 0.93),
    vignette: 0.22,
  };
  /** Multiplier from the weather (rain is greyer). */
  weatherSaturation = 1;
  /** Last frame's measured CPU-side cost of the post passes (ms). */
  lastPostMs = 0;

  private msaa: boolean;
  private hdr: THREE.WebGLRenderTarget;
  private ldr: THREE.WebGLRenderTarget;
  private mips: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private fxaaMat: THREE.ShaderMaterial;
  private ao: THREE.WebGLRenderTarget;
  private aoBlur: THREE.WebGLRenderTarget;
  private aoMat: THREE.ShaderMaterial;
  private aoBlurMat: THREE.ShaderMaterial;
  private shaftA: THREE.WebGLRenderTarget;
  private shaftB: THREE.WebGLRenderTarget;
  private shaftMaskMat: THREE.ShaderMaterial;
  private shaftBlurMat: THREE.ShaderMaterial;
  shaftsEnabled: boolean;
  /** Overall strength of the sun shafts. */
  shaftStrength = 0.8;
  private sunNdc = new THREE.Vector3();
  private size = new THREE.Vector2();
  private originalRender: () => void;
  private unsub: () => void;

  constructor(
    private readonly game: Game,
    opts: PostOptions = {},
  ) {
    const s = game.settings.data;
    this.enabled = s.postfx ?? true;
    this.bloomEnabled = s.bloom ?? true;
    this.aoEnabled = aoDefault(s);
    this.shaftsEnabled = shaftsDefault(s);
    this.bloomStrength = opts.bloom ?? 0.075;
    this.toneMap = opts.toneMapping ?? 'aces';
    this.msaa = opts.msaa ?? s.antialias;
    game.renderer.toneMapping = TONEMAP_RENDERER[this.toneMap];

    const hdrOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false, colorSpace: THREE.LinearSRGBColorSpace };
    this.hdr = new THREE.WebGLRenderTarget(1, 1, { ...hdrOpts, samples: this.msaa ? 4 : 0 });
    // The scene's own depth, kept as a texture for the AO pass (no extra scene render).
    this.hdr.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    const aoOpts = { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.ao = new THREE.WebGLRenderTarget(1, 1, aoOpts);
    this.aoBlur = new THREE.WebGLRenderTarget(1, 1, aoOpts);
    const shaftOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, colorSpace: THREE.LinearSRGBColorSpace };
    this.shaftA = new THREE.WebGLRenderTarget(1, 1, shaftOpts);
    this.shaftB = new THREE.WebGLRenderTarget(1, 1, shaftOpts);
    this.ldr = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      this.mips.push(
        new THREE.WebGLRenderTarget(1, 1, {
          type: THREE.HalfFloatType,
          depthBuffer: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          wrapS: THREE.ClampToEdgeWrapping,
          wrapT: THREE.ClampToEdgeWrapping,
          colorSpace: THREE.LinearSRGBColorSpace,
        }),
      );
    }

    const common = { depthTest: false, depthWrite: false, vertexShader: POST_VERT };
    this.downMat = new THREE.ShaderMaterial({
      ...common,
      name: 'BloomDown',
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uPrefilter: { value: 0 },
        uThreshold: { value: 1 },
        uKnee: { value: 0.5 },
        uExposure: { value: 1 },
      },
      fragmentShader: DOWNSAMPLE_FRAG,
    });
    this.upMat = new THREE.ShaderMaterial({
      ...common,
      name: 'BloomUp',
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } },
      fragmentShader: UPSAMPLE_FRAG,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    this.aoMat = new THREE.ShaderMaterial({
      ...common,
      name: 'AO',
      uniforms: {
        tDepth: { value: null },
        uProj: { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2() },
        uRadius: { value: 1 },
        uIntensity: { value: 1 },
        uFadeFar: { value: 160 },
      },
      fragmentShader: AO_FRAG,
    });
    this.aoBlurMat = new THREE.ShaderMaterial({
      ...common,
      name: 'AOBlur',
      uniforms: { tAo: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uInvProj: { value: new THREE.Matrix4() } },
      fragmentShader: AO_BLUR_FRAG,
    });
    this.shaftMaskMat = new THREE.ShaderMaterial({
      ...common,
      name: 'ShaftMask',
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } },
      fragmentShader: SHAFT_MASK_FRAG,
    });
    this.shaftBlurMat = new THREE.ShaderMaterial({
      ...common,
      name: 'ShaftBlur',
      uniforms: { tMask: { value: null }, uSun: { value: new THREE.Vector2() }, uDensity: { value: 0.9 } },
      fragmentShader: SHAFT_BLUR_FRAG,
    });
    this.compMat = new THREE.ShaderMaterial({
      ...common,
      name: 'Composite',
      defines: { TONEMAP: TONEMAP_DEFINE[this.toneMap] },
      uniforms: {
        tColor: { value: null },
        tBloom: { value: null },
        tAo: { value: null },
        uAoOn: { value: 0 },
        tShafts: { value: null },
        uShafts: { value: 0 },
        uBloom: { value: this.bloomStrength },
        uBloomOn: { value: 1 },
        uVignette: { value: 0.2 },
        uAspect: { value: 1 },
        uSaturation: { value: 1 },
        uContrast: { value: 0 },
        uShadowTint: { value: new THREE.Color() },
        uHighlightTint: { value: new THREE.Color() },
        uTime: { value: 0 },
        toneMappingExposure: { value: 1 },
      },
      fragmentShader: COMPOSITE_FRAG,
      toneMapped: false,
    });
    this.fxaaMat = new THREE.ShaderMaterial({
      ...common,
      name: 'FXAA',
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      fragmentShader: FXAAShader.fragmentShader,
      toneMapped: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(tri, this.compMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.originalRender = game.renderFrame;
    game.renderFrame = () => this.render();
    this.unsub = game.settings.onChange((d) => {
      this.enabled = d.postfx ?? true;
      this.bloomEnabled = d.bloom ?? true;
      this.aoEnabled = aoDefault(d);
      this.shaftsEnabled = shaftsDefault(d);
    });
  }

  setToneMapping(t: ToneMap) {
    this.toneMap = t;
    this.compMat.defines.TONEMAP = TONEMAP_DEFINE[t];
    this.compMat.needsUpdate = true;
    this.game.renderer.toneMapping = TONEMAP_RENDERER[t];
  }

  /**
   * How strong the shafts are this frame (0 = skip): the sun must be up, in front of the camera
   * and not far off screen; strongest low in the sky; none indoors. Sets `sunNdc`.
   */
  private shaftAmount(): number {
    const sky = (this.game as Game & { sky?: { sunDir: THREE.Vector3; indoor?: number } }).sky;
    if (!sky) return 0;
    const dir = sky.sunDir;
    if (dir.y < -0.02) return 0;
    const cam = this.game.camera;
    this.sunNdc.copy(cam.position).addScaledVector(dir, 1000).project(cam);
    if (this.sunNdc.z > 1) return 0;
    const off = Math.max(Math.abs(this.sunNdc.x), Math.abs(this.sunNdc.y));
    const onScreen = THREE.MathUtils.smoothstep(1.7, 1.0, off);
    const low = 1 - 0.6 * THREE.MathUtils.smoothstep(0.25, 0.75, dir.y);
    const rise = THREE.MathUtils.smoothstep(-0.02, 0.06, dir.y);
    const indoor = 1 - Math.min(1, Math.max(0, sky.indoor ?? 0));
    return this.shaftStrength * onScreen * low * rise * indoor;
  }

  private resize(w: number, h: number) {
    this.hdr.setSize(w, h);
    this.ldr.setSize(w, h);
    this.ao.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.aoBlur.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.shaftA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.shaftB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    let mw = w, mh = h;
    for (const m of this.mips) {
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
      m.setSize(mw, mh);
    }
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.game.renderer.setRenderTarget(target);
    this.game.renderer.render(this.scene, this.camera);
  }

  render() {
    const { renderer, scene, camera } = this.game;
    if (!this.enabled) {
      renderer.setRenderTarget(null);
      this.originalRender();
      return;
    }
    renderer.getDrawingBufferSize(this.size);
    const w = this.size.x, h = this.size.y;
    if (this.hdr.width !== w || this.hdr.height !== h) this.resize(w, h);

    // 1. Scene into HDR.
    renderer.setRenderTarget(this.hdr);
    renderer.render(scene, camera);

    const t0 = performance.now();
    const info = renderer.info;
    info.autoReset = false; // keep the scene's draw-call stats and add ours
    // Every post pass covers its whole target, so clears are wasted work, and the additive bloom
    // upsamples MUST NOT clear: each one adds onto the level's own downsampled content.
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    const exposure = renderer.toneMappingExposure;

    // 2. Ambient occlusion at half resolution from the scene's depth, then an edge-keeping blur.
    if (this.aoEnabled) {
      const au = this.aoMat.uniforms;
      au.tDepth.value = this.hdr.depthTexture;
      au.uProj.value.copy(camera.projectionMatrix);
      au.uInvProj.value.copy(camera.projectionMatrixInverse);
      au.uTexel.value.set(1 / w, 1 / h);
      au.uRadius.value = this.aoRadius;
      au.uIntensity.value = this.aoIntensity;
      au.uFadeFar.value = this.aoFadeFar;
      this.pass(this.aoMat, this.ao);
      const bu = this.aoBlurMat.uniforms;
      bu.tAo.value = this.ao.texture;
      bu.tDepth.value = this.hdr.depthTexture;
      bu.uTexel.value.set(1 / this.ao.width, 1 / this.ao.height);
      bu.uInvProj.value.copy(camera.projectionMatrixInverse);
      this.pass(this.aoBlurMat, this.aoBlur);
    }

    // 2a. Sun shafts at quarter resolution (only when the sun is up and in front of the camera).
    const shafts = this.shaftsEnabled ? this.shaftAmount() : 0;
    if (shafts > 0) {
      const sun = { x: this.sunNdc.x * 0.5 + 0.5, y: this.sunNdc.y * 0.5 + 0.5 };
      const mu = this.shaftMaskMat.uniforms;
      mu.tColor.value = this.hdr.texture;
      mu.tDepth.value = this.hdr.depthTexture;
      mu.uSun.value.set(sun.x, sun.y);
      mu.uAspect.value = w / Math.max(1, h);
      this.pass(this.shaftMaskMat, this.shaftA);
      const bu = this.shaftBlurMat.uniforms;
      bu.tMask.value = this.shaftA.texture;
      bu.uSun.value.set(sun.x, sun.y);
      this.pass(this.shaftBlurMat, this.shaftB);
    }

    // 2b. Bloom chain.
    const bloomOn = this.bloomEnabled && this.bloomStrength > 0;
    if (bloomOn) {
      const du = this.downMat.uniforms;
      du.uThreshold.value = this.bloomThreshold;
      du.uKnee.value = this.bloomKnee;
      du.uExposure.value = exposure;
      let src: THREE.Texture = this.hdr.texture;
      let sw = w, sh = h;
      for (let i = 0; i < this.mips.length; i++) {
        du.tSrc.value = src;
        du.uTexel.value.set(1 / sw, 1 / sh);
        du.uPrefilter.value = i === 0 ? 1 : 0;
        this.pass(this.downMat, this.mips[i]);
        src = this.mips[i].texture;
        sw = this.mips[i].width;
        sh = this.mips[i].height;
      }
      const uu = this.upMat.uniforms;
      uu.uRadius.value = this.bloomRadius;
      for (let i = this.mips.length - 1; i > 0; i--) {
        const s = this.mips[i];
        uu.tSrc.value = s.texture;
        uu.uTexel.value.set(1 / s.width, 1 / s.height);
        uu.uWeight.value = 1;
        this.pass(this.upMat, this.mips[i - 1]);
      }
    }

    // 3. Composite (+ FXAA when MSAA is off).
    const cu = this.compMat.uniforms;
    cu.tColor.value = this.hdr.texture;
    cu.tBloom.value = this.mips[0].texture;
    cu.tAo.value = this.aoBlur.texture;
    cu.uAoOn.value = this.aoEnabled ? 1 : 0;
    cu.tShafts.value = this.shaftB.texture;
    cu.uShafts.value = shafts;
    cu.uBloom.value = this.bloomStrength / BLOOM_LEVELS;
    cu.uBloomOn.value = bloomOn ? 1 : 0;
    cu.uVignette.value = this.grade.vignette;
    cu.uAspect.value = w / Math.max(1, h);
    cu.uSaturation.value = this.grade.saturation * this.weatherSaturation;
    cu.uContrast.value = this.grade.contrast;
    cu.uShadowTint.value.copy(this.grade.shadowTint);
    cu.uHighlightTint.value.copy(this.grade.highlightTint);
    cu.uTime.value = this.game.elapsed;
    cu.toneMappingExposure.value = exposure;
    if (this.msaa) {
      this.pass(this.compMat, null);
    } else {
      this.pass(this.compMat, this.ldr);
      this.fxaaMat.uniforms.tDiffuse.value = this.ldr.texture;
      this.fxaaMat.uniforms.resolution.value.set(1 / w, 1 / h);
      this.pass(this.fxaaMat, null);
    }
    renderer.autoClear = autoClear;
    info.autoReset = true;
    this.lastPostMs = performance.now() - t0;
  }

  lateUpdate() {
    this.weatherSaturation = this.game.sky?.weatherParams.saturation ?? 1;
  }

  dispose() {
    this.game.renderFrame = this.originalRender;
    this.unsub();
    this.hdr.dispose();
    this.ldr.dispose();
    this.ao.dispose();
    this.aoBlur.dispose();
    this.aoMat.dispose();
    this.aoBlurMat.dispose();
    for (const m of this.mips) m.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.compMat.dispose();
    this.fxaaMat.dispose();
    this.shaftA.dispose();
    this.shaftB.dispose();
    this.shaftMaskMat.dispose();
    this.shaftBlurMat.dispose();
  }
}
