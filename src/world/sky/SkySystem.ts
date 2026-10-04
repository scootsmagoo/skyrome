/**
 * SkySystem: time of day, sun & moon, sky dome, weather, key/fill lights, fog, environment map,
 * exposure and shadows. Install with `installSky(game)` (src/world/sky/index.ts), then read
 * `game.sky` anywhere:
 *
 *   game.sky.setWeather('rain', 30);      // blend to rain over 30 real seconds
 *   game.sky.lampFactor                   // 0 by day → 1 when lamps should be lit
 *   game.sky.daylight / game.sky.isNight
 *   game.events.on('weather:thunder', ({ delay }) => …)
 *
 * Runs in lateUpdate after the camera rig, so the dome, shadow box and rain follow the final
 * camera position of the frame.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import { damp } from '../../core/math';
import { Rng } from '../../core/Rng';
import { computeEphemeris, type SkyEphemeris } from './astronomy';
import { skyFogUniforms } from './fog';
import { computeLighting, type Lighting } from './lighting';
import { Rain } from './Rain';
import { SkyDome } from './SkyDome';
import { SkyEnvironment } from './SkyEnvironment';
import { ShadowRig, type ShadowMode, type ShadowQuality } from './shadows';
import { CLOUD_FUNCS_GLSL, NOISE_GLSL } from './skyShader';
import { createBrightStars, galacticFrame } from './stars';
import { skyWetUniform } from './wet';
import { WeatherController, type WeatherParams, type WeatherState } from './weather';

declare module '../../core/Game' {
  interface Game {
    sky: SkySystem;
  }
}

declare module '../../core/Events' {
  interface GameEvents {
    /** Weather started changing to `state` over `seconds`. */
    'weather:changed': { state: WeatherState; seconds: number };
    /** A lightning flash happened; thunder should be heard after `delay` seconds. */
    'weather:thunder': { intensity: number; delay: number; direction: { x: number; y: number; z: number } };
    /** Lamps were lit (dusk/darkness) or put out (morning). */
    'sky:lamps': { lit: boolean };
  }
}

export interface SkyOptions {
  weather?: WeatherState;
  /** Let the weather change by itself (seeded Markov climate). Default true. */
  autoWeather?: boolean;
  /** Override the settings' shadow quality. */
  shadows?: ShadowQuality;
  /** Force the shadow technique ('single' map vs native 'cascade'). */
  shadowMode?: ShadowMode;
  /** Number of rain drops. */
  rainDrops?: number;
}

const _camDir = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _color = new THREE.Color();
const _keyDir = new THREE.Vector3();

export class SkySystem implements System {
  readonly name = 'sky';
  readonly priority = 105;

  readonly dome = new SkyDome();
  readonly env: SkyEnvironment;
  readonly shadows: ShadowRig;
  readonly weather: WeatherController;
  readonly rain: Rain;
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a45, 0.3);
  readonly fog = new THREE.FogExp2(0xcfd8e0, 0.0012);
  /** Catalog stars (real constellations) drawn over the dome. */
  readonly brightStars: THREE.Points;

  /** Directions toward the sun and moon (game axes). */
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly moonDir = new THREE.Vector3(0, -1, 0);
  ephemeris!: SkyEphemeris;
  lighting!: Lighting;

  /** Current (adapted) exposure, and a user multiplier on top. */
  exposure = 1;
  exposureBias = 1;
  /** Seconds of adaptation time constant (eye adaptation feel). */
  adaptationRate = 1.1;
  /** Multiplier for scene.environmentIntensity (the IBL part of the ambient). */
  envScale = 0.6;
  /** Clouds drift faster than the real wind so the sky feels alive at the game's time scale. */
  cloudSpeed = 3;
  /**
   * 0 outdoors → 1 deep inside a building. An interiors module (or trigger volumes) sets it:
   * it dims the sky ambient, stops rain and wetness, and lets the eye adapt to the gloom.
   */
  indoor = 0;

  private flash = 0;
  private flashTimer = 0;
  private lastTotalHours: number;
  private lightingAge = Infinity;
  private litSunY = NaN;
  private litMoonY = NaN;
  private litWeather: number[] = [];
  private lampsLit: boolean | null = null;
  private rng: Rng;
  private cloudOffset = new THREE.Vector2(13.7, 4.1);
  private cirrusOffset = new THREE.Vector2(2.3, 8.9);
  private first = true;
  private unsubSettings: () => void;

  constructor(
    private readonly game: Game,
    opts: SkyOptions = {},
  ) {
    const { renderer, scene } = game;
    this.rng = game.rng.fork('sky');
    this.weather = new WeatherController(opts.weather ?? 'clear', this.rng.int(1, 1e9));
    this.weather.auto = opts.autoWeather ?? true;

    scene.add(this.dome.mesh);
    scene.add(this.hemi);
    scene.fog = this.fog;
    scene.background = null;

    this.shadows = new ShadowRig(scene, renderer);
    this.shadows.setQuality(opts.shadows ?? game.settings.data.shadows, opts.shadowMode);
    this.unsubSettings = game.settings.onChange((s) => {
      if (s.shadows !== this.shadows.quality) this.shadows.setQuality(s.shadows, opts.shadowMode);
    });

    this.env = new SkyEnvironment(renderer, this.dome);
    this.rain = new Rain(opts.rainDrops ?? 9000);
    scene.add(this.rain.mesh);

    this.brightStars = createBrightStars(this.dome.uniforms, NOISE_GLSL + CLOUD_FUNCS_GLSL, renderer.getPixelRatio());
    scene.add(this.brightStars);

    const gal = galacticFrame();
    this.dome.uniforms.uGalPole.value.copy(gal.pole);
    this.dome.uniforms.uGalCenter.value.copy(gal.center);

    this.lastTotalHours = game.time.totalHours;
  }

  /** Blend to a weather state over `seconds` real seconds (0 = instant). */
  setWeather(state: WeatherState, seconds = 30) {
    this.weather.set(state, seconds);
    this.game.events.emit('weather:changed', { state, seconds });
  }

  get weatherState(): WeatherState {
    return this.weather.state;
  }

  /** Current blended weather parameters. */
  get weatherParams(): Readonly<WeatherParams> {
    return this.weather.params;
  }

  /** 0 = lamps out, 1 = lamps lit. */
  get lampFactor() {
    return this.lighting?.lampFactor ?? 0;
  }

  /** 0 at night → 1 in daylight. */
  get daylight() {
    return this.lighting?.daylight ?? 1;
  }

  get isNight() {
    return this.sunDir.y < -0.05;
  }

  /** The current key light (sun or moon). */
  get keyLight() {
    return this.shadows.light;
  }

  /** Force a full refresh (after teleports, time skips, loading a save). */
  invalidate() {
    this.first = true;
  }

  lateUpdate(dt: number) {
    const { game } = this;
    const time = game.time;
    const gameHours = time.totalHours - this.lastTotalHours;
    this.lastTotalHours = time.totalHours;
    const force = this.first || Math.abs(gameHours) > 0.5;

    // --- Sun & moon.
    const d = time.date();
    const eph = (this.ephemeris = computeEphemeris(d.year, d.month, d.day, time.hour));
    this.sunDir.set(eph.sun.x, eph.sun.y, eph.sun.z);
    this.moonDir.set(eph.moon.x, eph.moon.y, eph.moon.z);
    // The star points cost a pass over every star even when the day sky hides them all.
    this.brightStars.visible = eph.sun.y < 0.12;
    const sm = eph.starMatrix;
    this.dome.uniforms.uStarMatrix.value.set(sm[0], sm[3], sm[6], sm[1], sm[4], sm[7], sm[2], sm[5], sm[8]);

    // --- Weather.
    const changed = this.weather.update(force ? 0 : dt, Math.max(0, gameHours));
    if (changed) game.events.emit('weather:changed', { state: changed, seconds: 30 });
    const w = this.weather.params;

    // --- Lighting (CPU atmosphere): only when something moved enough.
    this.lightingAge += dt;
    const wsig = [w.cloudCover, w.haze, w.fog, w.sun, w.cloudDark];
    let wChanged = this.litWeather.length !== wsig.length;
    for (let i = 0; !wChanged && i < wsig.length; i++) if (Math.abs(wsig[i] - this.litWeather[i]) > 0.004 * Math.max(1, Math.abs(wsig[i]))) wChanged = true;
    if (force || wChanged || Math.abs(eph.sun.y - this.litSunY) > 0.0012 || Math.abs(eph.moon.y - this.litMoonY) > 0.004 || this.lightingAge > 2) {
      this.lighting = computeLighting({ sun: eph.sun, moon: eph.moon, moonIllumination: eph.moonIllumination, hour: time.hour, weather: w }, this.lighting);
      this.litSunY = eph.sun.y;
      this.litMoonY = eph.moon.y;
      this.litWeather = wsig;
      this.lightingAge = 0;
    }
    const L = this.lighting;

    // --- Sky dome.
    const moonUp = eph.moon.y > -0.1 && L.moonRadiance > 0;
    this.dome.updateLuts(game.renderer, this.sunDir, this.moonDir, w.haze, 0.8, moonUp, force);
    this.dome.applyLighting(L, this.sunDir, this.moonDir);
    const u = this.dome.uniforms;
    u.uTime.value = game.elapsed;
    const drift = w.wind * 7e-4 * this.cloudSpeed * dt;
    this.cloudOffset.x += drift * 0.8;
    this.cloudOffset.y += drift * 0.6;
    this.cirrusOffset.x += drift * 0.5;
    this.cirrusOffset.y += drift * 0.2;
    u.uCloudOffset.value.copy(this.cloudOffset);
    u.uCirrusOffset.value.copy(this.cirrusOffset);
    u.uCloudCover.value = w.cloudCover;
    u.uCirrus.value = w.cirrus;
    u.uCloudDark.value = w.cloudDark;

    // --- Lightning.
    this.updateLightning(dt, w);
    u.uFlash.value = this.flash * 0.35;

    // --- Lights.
    const key = this.shadows.light;
    key.color.fromArray(L.keyColor);
    key.intensity = L.keyIntensity;
    key.shadow.intensity = L.shadowIntensity;
    this.hemi.color.fromArray(L.hemiSky);
    this.hemi.groundColor.fromArray(L.hemiGround);
    const inside = THREE.MathUtils.clamp(this.indoor, 0, 1);
    this.hemi.intensity = (L.hemiIntensity + this.flash * 1.1) * (1 - 0.6 * inside);
    game.camera.getWorldPosition(_camPos);
    game.camera.getWorldDirection(_camDir);
    _keyDir.set(L.keyDir.x, L.keyDir.y, L.keyDir.z);
    this.shadows.update(_keyDir, _camPos, _camDir);

    // --- Fog (shared uniforms reach every material).
    this.fog.color.setRGB(L.fogColor[0], L.fogColor[1], L.fogColor[2], THREE.LinearSRGBColorSpace);
    this.fog.density = L.fogDensity;
    const fs = skyFogUniforms.skyFogSun.value;
    fs.x = this.sunDir.x;
    fs.y = this.sunDir.y;
    fs.z = this.sunDir.z;
    fs.w = L.fogSunPower;
    const fc = skyFogUniforms.skyFogSunColor.value;
    fc.x = L.fogSunColor[0];
    fc.y = L.fogSunColor[1];
    fc.z = L.fogSunColor[2];
    fc.w = L.fogFalloff;
    skyFogUniforms.skyFogParams.value.x = L.fogBaseHeight;

    // --- Environment map (throttled).
    const envSig = [this.sunDir.x, this.sunDir.y, this.sunDir.z, this.moonDir.y, w.cloudCover, w.cloudDark, w.haze * 0.1, L.lampFactor];
    const envTol = [0.004, 0.004, 0.004, 0.02, 0.02, 0.02, 0.02, 0.2];
    this.env.update(dt, envSig, envTol, force);
    if (this.env.texture && game.scene.environment !== this.env.texture) game.scene.environment = this.env.texture;
    game.scene.environmentIntensity = L.envIntensity * this.envScale * (1 - 0.75 * inside);

    // --- Exposure with eye adaptation.
    const target = Math.min(3, L.exposure * (1 + 0.9 * inside));
    this.exposure = force ? target : this.exposure + (target - this.exposure) * damp(this.adaptationRate, dt);
    game.renderer.toneMappingExposure = this.exposure * this.exposureBias;

    // --- Wet surfaces.
    skyWetUniform.value.x = this.weather.wetness;
    skyWetUniform.value.y = 1 - inside;

    // --- Rain.
    // Streaks catch the sky light; a bit brighter than the fog so they read against it.
    const rl = 0.12 + L.skyIrradiance * 0.55 + this.flash * 2;
    _color.setRGB(rl * 0.92, rl * 0.96, rl);
    const windA = 0.7;
    this.rain.update(dt, game.camera, w.rain * (1 - inside), Math.cos(windA) * w.wind, Math.sin(windA) * w.wind, _color);

    // --- Lamps.
    const lit = L.lampFactor > 0.5;
    if (lit !== this.lampsLit) {
      if (this.lampsLit !== null) game.events.emit('sky:lamps', { lit });
      this.lampsLit = lit;
    }
    this.first = false;
  }

  private updateLightning(dt: number, w: WeatherParams) {
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash = Math.max(this.flash, 0.7 + this.rng.next() * 0.5);
    }
    if (w.lightning <= 0) return;
    if (this.rng.next() < (w.lightning / 60) * dt) {
      const intensity = 0.6 + this.rng.next() * 0.8;
      this.flash = intensity;
      // A second stroke a moment later, as real lightning flickers.
      if (this.rng.chance(0.6)) this.flashTimer = 0.08 + this.rng.next() * 0.12;
      const a = this.rng.next() * Math.PI * 2;
      const dist = 800 + this.rng.next() * 5000;
      this.game.events.emit('weather:thunder', { intensity, delay: dist / 343, direction: { x: Math.sin(a), y: 0, z: -Math.cos(a) } });
    }
  }

  dispose() {
    this.unsubSettings();
    this.dome.mesh.removeFromParent();
    this.dome.dispose();
    this.env.dispose();
    this.rain.mesh.removeFromParent();
    this.rain.dispose();
    this.brightStars.removeFromParent();
    this.brightStars.geometry.dispose();
    (this.brightStars.material as THREE.Material).dispose();
    this.hemi.removeFromParent();
    this.shadows.dispose();
  }
}

export type { WeatherState };
