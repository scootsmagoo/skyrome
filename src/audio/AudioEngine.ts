/**
 * The audio engine: one Web Audio context, mix buses wired to the settings, a convolution reverb
 * for the current space, a listener that follows the camera, voice-limited spatial one-shots and
 * virtualised loops (beds plus recurring events).
 *
 *   installAudio(game);                                    // once, in scene setup
 *   game.audio.play('clash.metal', { position: hitPoint });
 *   const fire = game.audio.loop('fire', { position: brazier });   fire.stop(1);
 *   game.audio.music.setState('combat');
 *   game.audio.ambience.addZone({ center, radius: 40, layers: [{ id: 'crowd', volume: 1 }] });
 *
 * The context is created lazily and resumed on the first user gesture (Safari and Chrome both
 * require that); until then `play` is a no-op and loops/music wait and start on unlock.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { Layer } from '../core/Physics';
import type { SettingsData } from '../core/Settings';
import { AmbienceDirector } from './Ambience';
import { LOOPS, SOUNDS, bakeRate, forget, getVariants, requestBake, setBaker } from './bank';
import { Rand, dbToGain } from './dsp/core';
import { REVERBS, impulseResponse, type ReverbPreset } from './dsp/reverb';
import { FootstepDriver, type FootstepOptions, type FootstepSource } from './FootstepDriver';
import { DEFAULT_SPATIAL, airCutoff, distanceGain, distanceWetness, pickVariant, planVoice, sliderToGain, type VoiceSlot } from './mix';
import { MusicDirector } from './music/MusicDirector';
import { WorkerBaker } from './WorkerBaker';
import type { BusName, LoopDef, LoopEvent, SoundDef, SpatialSpec } from './sounds/types';

declare module '../core/Settings' {
  interface SettingsData {
    /** Ambience bus (0..1). */
    ambienceVolume?: number;
    /** Voices / barks bus (0..1). */
    voiceVolume?: number;
    /** Interface sounds and stingers (0..1). */
    uiVolume?: number;
    /** Use HRTF panning for spatial sounds (headphones). */
    audioHrtf?: boolean;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    /** The audio context is running (after the first user gesture). */
    'audio:unlocked': {};
    /** Fire-and-forget sound request from any module (no import of the audio module needed). */
    sfx: { id: string; position?: THREE.Vector3Like; volume?: number; rate?: number };
  }
}

export const BUSES: readonly BusName[] = ['music', 'sfx', 'ambience', 'voice', 'ui'];

export interface PlayOptions {
  /** World position for spatial playback (omit for 2D). */
  position?: THREE.Vector3Like;
  /** Linear volume multiplier. */
  volume?: number;
  /** Playback-rate multiplier (pitch and speed). */
  rate?: number;
  /** Pitch offset in cents. */
  detune?: number;
  /** Force a variant. */
  variant?: number;
  /** Muffle the sound if world geometry is between it and the listener. */
  occlude?: boolean;
  /** Start after this many seconds. */
  delay?: number;
  /** Skip (and start baking) if the sound isn't baked yet instead of baking synchronously. */
  ifReady?: boolean;
  /** Move the voice while it plays (fly-bys), m/s. */
  velocity?: THREE.Vector3Like;
  /** Override the bus. */
  bus?: BusName;
  /** HRTF instead of equal-power panning for this voice. */
  hrtf?: boolean;
}

export interface VoiceHandle {
  readonly id: string;
  readonly playing: boolean;
  stop(fade?: number): void;
  setPosition(p: THREE.Vector3Like): void;
}

export interface LoopOptions {
  position?: THREE.Vector3Like;
  /** 0..1 (default 1). */
  volume?: number;
  /** Fade-in seconds (default 1). */
  fadeIn?: number;
  occlude?: boolean;
}

export interface LoopHandle {
  readonly id: string;
  readonly active: boolean;
  /** True while the bed is actually producing sound (not virtualised). */
  readonly audible: boolean;
  volume: number;
  setVolume(v: number, fade?: number): void;
  setPosition(p: THREE.Vector3Like): void;
  stop(fade?: number): void;
}

export interface AudioStats {
  state: string;
  voices: number;
  loops: number;
  loopsAudible: number;
  bakedMB: number;
  music: string;
  reverb: ReverbPreset;
  sampleRate: number;
}

interface Voice extends VoiceSlot {
  def: SoundDef;
  src: AudioBufferSourceNode;
  /** The voice's level node (VoiceSlot.gain is the estimated gain at the listener). */
  amp: GainNode;
  nodes: AudioNode[];
  panner: PannerNode | null;
  pos: THREE.Vector3 | null;
  vel: THREE.Vector3 | null;
  done: boolean;
}

const tmpV = new THREE.Vector3();
const fwd = new THREE.Vector3();
const up = new THREE.Vector3();

/** Max simultaneous one-shot voices. */
const GLOBAL_VOICES = 48;
/** Below this estimated gain a one-shot isn't worth starting (≈ -62 dB). */
const CULL_GAIN = 0.0008;
/**
 * Output makeup before the limiter. Sounds are normalized to about -14 dBFS short-term and mixed
 * well below that; this brings typical play to roughly -24 dBFS RMS (combat peaks near -4 dBFS),
 * measured with `meter()` in the audio scene.
 */
const MAKEUP_DB = 10;
/** The music bus sits +6 dB hotter than its slider so the default (0.5) is clearly audible. */
const MUSIC_TRIM = 2;

export class AudioEngine implements System {
  readonly name = 'audio';
  /** After the camera (100) so the listener uses this frame's camera. */
  readonly priority = 105;

  ctx: AudioContext | null = null;
  readonly music = new MusicDirector();
  readonly ambience: AmbienceDirector;
  readonly footsteps = new FootstepSystem(this);
  /** Listener position (world), updated every frame from the camera. */
  readonly listener = new THREE.Vector3();
  /** Use HRTF panning for all spatial voices (more CPU; best on headphones). */
  hrtf = false;
  /** Suspend audio while the tab is hidden. */
  pauseWhenHidden = true;

  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private makeup!: GainNode;
  private buses = {} as Record<BusName, GainNode>;
  private sends = {} as Record<BusName, GainNode>;
  private envIn!: GainNode;
  private envReturn!: GainNode;
  private conv: [ConvolverNode, GainNode][] = [];
  private convActive = 0;
  private musicRev!: GainNode;
  private reverbPreset: ReverbPreset = 'open';
  private irCache = new Map<ReverbPreset, AudioBuffer>();
  private buffers = new Map<string, AudioBuffer[]>();
  private preparing = new Set<string>();
  private bufferBytes = 0;
  private baker: WorkerBaker | null = null;
  private analyser: AnalyserNode | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
  private lastVariant = new Map<string, number>();
  private voices: Voice[] = [];
  private loops = new Set<LoopInstance>();
  private rnd = new Rand('audio-engine');
  private muted = false;
  private warned = new Set<string>();
  private unlocked = false;
  private offs: Array<() => void> = [];

  constructor(readonly game: Game) {
    this.ambience = new AmbienceDirector(this);
    this.hrtf = !!game.settings.data.audioHrtf;
    this.music.isNight = () => game.time.isNight;
    this.installUnlock();
    this.offs.push(game.settings.onChange((s) => this.applySettings(s)));
    this.offs.push(game.events.on('sfx', (e) => void this.play(e.id, e)));
  }

  // ---------------------------------------------------------------- lifecycle

  get state(): string {
    return this.ctx?.state ?? 'locked';
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  private installUnlock() {
    const handler = () => this.unlock();
    const opts = { capture: true, passive: true } as const;
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchend', 'click'] as const) {
      window.addEventListener(type, handler, opts);
      this.offs.push(() => window.removeEventListener(type, handler, opts));
    }
    document.addEventListener('pointerlockchange', handler);
    this.offs.push(() => document.removeEventListener('pointerlockchange', handler));
    const vis = () => {
      if (!this.ctx || !this.pauseWhenHidden) return;
      if (document.hidden) void this.ctx.suspend().catch(() => {});
      else if (this.unlocked) void this.ctx.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', vis);
    this.offs.push(() => document.removeEventListener('visibilitychange', vis));
  }

  /**
   * Create/resume the context. Must run inside a user gesture the first time (the engine calls it
   * from its own gesture listeners; UI code may call it too).
   */
  unlock() {
    if (!this.ctx) this.createContext();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      // Safari: resume() must be called synchronously inside the gesture.
      void ctx.resume().then(() => this.onRunning(), () => {});
      // iOS: a silent buffer started inside the gesture fully unlocks output.
      try {
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      } catch {
        /* ignore */
      }
    } else this.onRunning();
  }

  private onRunning() {
    if (!this.ctx || this.ctx.state !== 'running' || this.unlocked) return;
    this.unlocked = true;
    this.game.events.emit('audio:unlocked', {});
    // Bake the common sounds in the worker now, so the first footstep or swing doesn't hitch.
    for (const id of [
      'step.stone.walk', 'step.stone.run', 'step.dirt.walk', 'step.dirt.run', 'step.grass.walk', 'step.grass.run', 'land.stone',
      'ui.click', 'ui.hover', 'ui.open', 'ui.close', 'swing.medium', 'swing.fast', 'clash.metal', 'block.shield', 'hit.flesh',
      'vox.grunt.m', 'vox.pain.m', 'vox.effort.m', 'body.fall', 'stinger.questStart', 'stinger.questComplete', 'stinger.levelUp', 'stinger.discover',
    ])
      this.prepare(id);
  }

  private createContext() {
    const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) {
      console.warn('[audio] Web Audio is not available');
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      ctx = new Ctor();
    }
    this.ctx = ctx;
    if (!this.baker) {
      this.baker = WorkerBaker.create();
      setBaker(this.baker);
    }
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this.onRunning();
    };
    this.buildGraph(ctx);
    this.applySettings(this.game.settings.data);
    this.setEnvironment(this.reverbPreset, 0);
    this.music.attach({ ctx, dry: this.buses.music, rev: this.musicRev });
  }

  private buildGraph(ctx: AudioContext) {
    this.master = ctx.createGain();
    // Gentle bus limiter: catches pile-ups (big fights) without pumping normal play.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 10;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.makeup = ctx.createGain();
    this.makeup.gain.value = dbToGain(MAKEUP_DB);
    this.master.connect(this.makeup);
    this.makeup.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.envIn = ctx.createGain();
    this.envReturn = ctx.createGain();
    this.envReturn.connect(this.master);
    for (let i = 0; i < 2; i++) {
      const c = ctx.createConvolver();
      c.normalize = false;
      const g = ctx.createGain();
      g.gain.value = 0;
      this.envIn.connect(c);
      c.connect(g);
      g.connect(this.envReturn);
      this.conv.push([c, g]);
    }
    for (const b of BUSES) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
      const s = ctx.createGain();
      s.connect(this.envIn);
      this.sends[b] = s;
    }
    // Music has its own warm hall (non-diegetic), returned through the music bus.
    const mc = ctx.createConvolver();
    mc.normalize = false;
    mc.buffer = this.ir('music');
    this.musicRev = ctx.createGain();
    this.musicRev.connect(mc);
    mc.connect(this.buses.music);
  }

  private ir(preset: ReverbPreset): AudioBuffer {
    let b = this.irCache.get(preset);
    if (b) return b;
    const ctx = this.ctx!;
    const [l, r] = impulseResponse(REVERBS[preset], ctx.sampleRate);
    b = ctx.createBuffer(2, l.length, ctx.sampleRate);
    b.getChannelData(0).set(l);
    b.getChannelData(1).set(r);
    this.irCache.set(preset, b);
    return b;
  }

  private applySettings(s: SettingsData) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.04);
    set(this.master.gain, this.muted ? 0 : sliderToGain(s.masterVolume));
    const vols: Record<BusName, number> = {
      music: s.musicVolume,
      sfx: s.sfxVolume,
      ambience: s.ambienceVolume ?? 0.8,
      voice: s.voiceVolume ?? 0.9,
      ui: s.uiVolume ?? 0.75,
    };
    for (const b of BUSES) {
      set(this.buses[b].gain, sliderToGain(vols[b]) * (b === 'music' ? MUSIC_TRIM : 1));
      set(this.sends[b].gain, b === 'music' ? 0 : sliderToGain(vols[b]));
    }
    this.hrtf = !!s.audioHrtf;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applySettings(this.game.settings.data);
  }

  /** Crossfade the environmental reverb to another space (street, forum, temple, room…). */
  setEnvironment(preset: ReverbPreset, fade = 1.5) {
    const same = preset === this.reverbPreset && this.conv[this.convActive]?.[0].buffer;
    this.reverbPreset = preset;
    if (!this.ctx || same) return;
    const t = this.ctx.currentTime;
    const next = this.conv[this.convActive][0].buffer ? 1 - this.convActive : this.convActive;
    const [c, g] = this.conv[next];
    c.buffer = this.ir(preset);
    const tc = Math.max(0.01, fade / 3);
    g.gain.setTargetAtTime(1, t, tc);
    if (next !== this.convActive) this.conv[this.convActive][1].gain.setTargetAtTime(0, t, tc);
    this.envReturn.gain.setTargetAtTime(REVERBS[preset].wet, t, tc);
    this.convActive = next;
  }

  get environment(): ReverbPreset {
    return this.reverbPreset;
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    this.music.dispose();
    this.baker?.dispose();
    setBaker(null);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number) {
    this.footsteps.update(dt);
  }

  lateUpdate(dt: number) {
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    this.listener.setFromMatrixPosition(cam.matrixWorld);
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const L = ctx.listener;
    const end = ctx.currentTime + Math.min(Math.max(dt, 0.005), 0.1);
    if (L.positionX) {
      const p = this.listener;
      L.positionX.linearRampToValueAtTime(p.x, end);
      L.positionY.linearRampToValueAtTime(p.y, end);
      L.positionZ.linearRampToValueAtTime(p.z, end);
      L.forwardX.linearRampToValueAtTime(fwd.x, end);
      L.forwardY.linearRampToValueAtTime(fwd.y, end);
      L.forwardZ.linearRampToValueAtTime(fwd.z, end);
      L.upX.linearRampToValueAtTime(up.x, end);
      L.upY.linearRampToValueAtTime(up.y, end);
      L.upZ.linearRampToValueAtTime(up.z, end);
    } else {
      (L as any).setPosition(this.listener.x, this.listener.y, this.listener.z);
      (L as any).setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
    this.ambience.update(dt);
    for (const l of this.loops) l.update(dt);
    // Moving voices (fly-bys).
    for (const v of this.voices) {
      if (!v.vel || !v.pos || !v.panner || v.done) continue;
      v.pos.addScaledVector(v.vel, dt);
      setPannerPosition(v.panner, v.pos, end);
    }
    this.music.update();
  }

  // ---------------------------------------------------------------- buffers

  /** AudioBuffers for every variant of a sound (baked synchronously on first use if needed). */
  buffersFor(def: SoundDef): AudioBuffer[] | null {
    const hit = this.buffers.get(def.id);
    if (hit) return hit;
    const vars = getVariants(def.id);
    return vars ? this.upload(def, vars) : null;
  }

  /** Uploaded buffers, or null (and start an async bake) if the sound isn't ready yet. */
  buffersIfReady(def: SoundDef): AudioBuffer[] | null {
    const hit = this.buffers.get(def.id);
    if (!hit) this.prepare(def.id);
    return hit ?? null;
  }

  /** Bake a sound off the main thread and upload it. Safe to call repeatedly. */
  prepare(id: string) {
    if (this.buffers.has(id) || this.preparing.has(id)) return;
    const def = SOUNDS.get(id);
    if (!def) return;
    this.preparing.add(id);
    void requestBake(id).then((vars) => {
      this.preparing.delete(id);
      if (vars && !this.buffers.has(id)) this.upload(def, vars);
    });
  }

  private upload(def: SoundDef, vars: Float32Array[]): AudioBuffer[] | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const rate = bakeRate(def);
    const list = vars.map((d) => {
      const b = ctx.createBuffer(1, d.length, rate);
      b.getChannelData(0).set(d);
      this.bufferBytes += d.byteLength;
      return b;
    });
    this.buffers.set(def.id, list);
    forget(def.id); // the AudioBuffers hold the audio now
    return list;
  }

  // ---------------------------------------------------------------- one-shots

  /** Distance from the listener (m). */
  distanceTo(p: THREE.Vector3Like): number {
    return tmpV.set(p.x, p.y, p.z).distanceTo(this.listener);
  }

  /** Is there world geometry between the listener and `p`? */
  occluded(p: THREE.Vector3Like): boolean {
    const d = this.distanceTo(p);
    if (d < 1) return false;
    const dir = tmpV.set(p.x - this.listener.x, p.y - this.listener.y, p.z - this.listener.z).normalize();
    const hit = this.game.physics.raycast(this.listener, dir, d - 0.5, Layer.World);
    return !!hit;
  }

  play(id: string, o: PlayOptions = {}): VoiceHandle | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted) return null;
    const def = SOUNDS.get(id);
    if (!def) {
      if (!this.warned.has(id)) console.warn(`[audio] unknown sound "${id}"`);
      this.warned.add(id);
      return null;
    }
    const spatial: SpatialSpec | null = o.position ? { ...DEFAULT_SPATIAL, ...(def.spatial ?? {}) } : null;
    let dist = 0;
    let dg = 1;
    if (spatial && o.position) {
      dist = this.distanceTo(o.position);
      dg = distanceGain(dist, spatial);
      if (dg <= 0) return null;
    }
    const rg = def.randomGainDb ? (this.rnd.next() * 2 - 1) * def.randomGainDb : 0;
    let gain = (o.volume ?? 1) * dbToGain((def.gainDb ?? 0) + rg);
    const occ = !!(o.occlude && o.position && this.occluded(o.position));
    if (occ) gain *= 0.5;
    const est = gain * dg;
    if (est < CULL_GAIN) return null;

    const plan = planVoice(this.voices, { id, priority: def.priority ?? 0.5, gain: est }, def.maxVoices ?? 6, GLOBAL_VOICES);
    if (!plan.allow) return null;
    for (const v of plan.steal) this.stopVoice(v, 0.03);

    const bufs = o.ifReady ? this.buffersIfReady(def) : this.buffersFor(def);
    if (!bufs?.length) return null;
    const vi = o.variant ?? pickVariant(bufs.length, this.lastVariant.get(id) ?? -1, this.rnd.next());
    this.lastVariant.set(id, vi);

    const now = ctx.currentTime;
    const start = now + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = bufs[vi];
    const rr = def.randomRate ? 1 + (this.rnd.next() * 2 - 1) * def.randomRate : 1;
    src.playbackRate.value = (o.rate ?? 1) * rr * Math.pow(2, (o.detune ?? 0) / 1200);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    const nodes: AudioNode[] = [src, g];
    let tail: AudioNode = g;
    let panner: PannerNode | null = null;
    let pos: THREE.Vector3 | null = null;
    if (spatial && o.position) {
      pos = new THREE.Vector3(o.position.x, o.position.y, o.position.z);
      const cutoff = Math.min(airCutoff(dist), occ ? 900 : 20000);
      if (cutoff < 15000 || o.velocity) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = cutoff;
        f.Q.value = 0.5;
        tail.connect(f);
        tail = f;
        nodes.push(f);
      }
      panner = this.makePanner(spatial, pos, o.hrtf);
      tail.connect(panner);
      tail = panner;
      nodes.push(panner);
    }
    const bus = o.bus ?? def.bus;
    tail.connect(this.buses[bus]);
    const sendAmt = (def.reverb ?? 0.25) * (spatial ? distanceWetness(dist) : 0.7);
    if (sendAmt > 0.01 && bus !== 'music') {
      const s = ctx.createGain();
      s.gain.value = sendAmt;
      tail.connect(s);
      s.connect(this.sends[bus]);
      nodes.push(s);
    }
    const voice: Voice = {
      id,
      def,
      start: now,
      priority: def.priority ?? 0.5,
      gain: est,
      src,
      amp: g,
      nodes,
      panner,
      pos,
      vel: o.velocity ? new THREE.Vector3(o.velocity.x, o.velocity.y, o.velocity.z) : null,
      done: false,
    };
    src.onended = () => this.release(voice);
    src.start(start);
    this.voices.push(voice);
    const engine = this;
    return {
      id,
      get playing() {
        return !voice.done;
      },
      stop(fade = 0.05) {
        engine.stopVoice(voice, fade);
      },
      setPosition(p: THREE.Vector3Like) {
        if (!voice.panner || !voice.pos || !engine.ctx) return;
        voice.pos.set(p.x, p.y, p.z);
        setPannerPosition(voice.panner, voice.pos, engine.ctx.currentTime + 0.02);
      },
    };
  }

  /** Convenience for UI code: a 2D sound on the UI bus. */
  ui(id: string, volume = 1) {
    return this.play(id.startsWith('ui.') || id.startsWith('stinger.') ? id : `ui.${id}`, { volume, bus: 'ui' });
  }

  makePanner(spec: SpatialSpec, pos: THREE.Vector3Like, hrtf?: boolean): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = (hrtf ?? this.hrtf) ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = spec.ref;
    p.maxDistance = Math.max(spec.max, spec.ref + 1);
    p.rolloffFactor = spec.rolloff;
    setPannerPosition(p, pos);
    return p;
  }

  private stopVoice(v: Voice, fade: number) {
    if (v.done || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = v.amp;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + Math.max(0.005, fade));
    try {
      v.src.stop(t + Math.max(0.005, fade) + 0.01);
    } catch {
      /* already stopped */
    }
    // Free the slot immediately so the limiter sees room.
    this.voices = this.voices.filter((x) => x !== v);
  }

  private release(v: Voice) {
    if (v.done) return;
    v.done = true;
    for (const n of v.nodes) n.disconnect();
    this.voices = this.voices.filter((x) => x !== v);
  }

  // ---------------------------------------------------------------- loops

  /** Start a loop (bed and/or recurring events). Works before unlock: it starts on unlock. */
  loop(id: string, o: LoopOptions = {}): LoopHandle {
    const def = LOOPS.get(id);
    if (!def) {
      if (!this.warned.has(id)) console.warn(`[audio] unknown loop "${id}"`);
      this.warned.add(id);
    }
    const inst = new LoopInstance(this, def ?? { id, label: id, group: '', bus: 'ambience' }, o);
    this.loops.add(inst);
    return inst;
  }

  /** @internal */
  removeLoop(l: LoopInstance) {
    this.loops.delete(l);
  }

  /** @internal */
  get busNodes() {
    return this.buses;
  }

  /** @internal */
  get sendNodes() {
    return this.sends;
  }

  /**
   * Output level after the limiter over the last ~43 ms (peak and RMS in dBFS) and the limiter's
   * gain reduction. The analyser is created on first use.
   */
  meter(): { peakDb: number; rmsDb: number; reductionDb: number } | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.limiter.connect(this.analyser);
      this.meterBuf = new Float32Array(this.analyser.fftSize);
    }
    const b = this.meterBuf!;
    this.analyser.getFloatTimeDomainData(b);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < b.length; i++) {
      const a = Math.abs(b[i]);
      if (a > peak) peak = a;
      sum += b[i] * b[i];
    }
    const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -120);
    // Old Safari exposed `reduction` as an AudioParam; modern browsers give a number.
    const red = this.limiter.reduction as unknown;
    const reductionDb = typeof red === 'number' ? red : ((red as AudioParam | undefined)?.value ?? 0);
    return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / b.length)), reductionDb };
  }

  stats(): AudioStats {
    let audible = 0;
    for (const l of this.loops) if (l.audible) audible++;
    return {
      state: this.state,
      voices: this.voices.length,
      loops: this.loops.size,
      loopsAudible: audible,
      bakedMB: this.bufferBytes / 1048576,
      music: this.music.state,
      reverb: this.reverbPreset,
      sampleRate: this.ctx?.sampleRate ?? 0,
    };
  }

  /** Active loops (for the sound board). */
  activeLoops(): readonly LoopHandle[] {
    return [...this.loops];
  }

  /** Lazy-loaded offline verification report (see debug/verify.ts). */
  async verify(opts?: { music?: boolean; seconds?: number }) {
    const m = await import('./debug/verify');
    return m.verifyAll(opts);
  }
}

/** Move a panner: ramp to `at` (moving sources), or set immediately when `at` is omitted (new voices). */
export function setPannerPosition(p: PannerNode, v: THREE.Vector3Like, at?: number) {
  if (p.positionX) {
    if (at === undefined) {
      p.positionX.value = v.x;
      p.positionY.value = v.y;
      p.positionZ.value = v.z;
    } else {
      p.positionX.linearRampToValueAtTime(v.x, at);
      p.positionY.linearRampToValueAtTime(v.y, at);
      p.positionZ.linearRampToValueAtTime(v.z, at);
    }
  } else (p as any).setPosition(v.x, v.y, v.z);
}

// ---------------------------------------------------------------- loop instances

/** A running loop: an optional bed buffer plus Poisson-scheduled events; virtualised when inaudible. */
class LoopInstance implements LoopHandle {
  readonly id: string;
  active = true;
  volume: number;
  private pos: THREE.Vector3 | null;
  private srcs: AudioBufferSourceNode[] = [];
  private out: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private panner: PannerNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private running = false;
  private stopping = false;
  private next: number[] = [];
  private bouts: { time: number; ev: LoopEvent; pos: THREE.Vector3 }[] = [];
  private checkAcc = 1;
  private occluded = false;
  private inaudibleFor = 0;
  /** Time constant for level changes (follows the last setVolume fade). */
  private levelTc = 0.15;
  private readonly fadeIn: number;
  private readonly occlude: boolean;
  private readonly rnd: Rand;

  constructor(
    private readonly engine: AudioEngine,
    readonly def: LoopDef,
    o: LoopOptions,
  ) {
    this.id = def.id;
    this.volume = o.volume ?? 1;
    this.pos = o.position ? new THREE.Vector3(o.position.x, o.position.y, o.position.z) : null;
    this.fadeIn = o.fadeIn ?? 1;
    this.occlude = !!o.occlude;
    this.rnd = new Rand(`${def.id}:${Math.random()}`);
    // Bake everything this loop needs in the background.
    if (engine.ctx) {
      if (def.bed) engine.prepare(def.bed);
      for (const e of def.events ?? []) engine.prepare(e.sound);
    }
  }

  get audible() {
    return this.running;
  }

  private get spatial(): SpatialSpec | null {
    return this.pos ? { ...DEFAULT_SPATIAL, ...(this.def.spatial ?? {}) } : null;
  }

  private bedGain(dist: number): number {
    const s = this.spatial;
    // The panner applies the inverse-distance law; we add the fade-out toward max distance.
    const fade = s ? (dist >= s.max ? 0 : dist <= s.max * 0.8 ? 1 : 1 - (dist - s.max * 0.8) / (s.max * 0.2)) : 1;
    return this.volume * dbToGain(this.def.gainDb ?? 0) * fade * (this.occluded ? 0.5 : 1);
  }

  setVolume(v: number, fade = 0.5) {
    this.volume = Math.max(0, v);
    this.levelTc = Math.max(0.01, fade / 3);
    const ctx = this.engine.ctx;
    if (this.out && ctx && !this.stopping) this.out.gain.setTargetAtTime(this.bedGain(this.pos ? this.engine.distanceTo(this.pos) : 0), ctx.currentTime, this.levelTc);
  }

  setPosition(p: THREE.Vector3Like) {
    if (!this.pos) this.pos = new THREE.Vector3();
    this.pos.set(p.x, p.y, p.z);
    if (this.panner && this.engine.ctx) setPannerPosition(this.panner, this.pos, this.engine.ctx.currentTime + 0.05);
  }

  stop(fade = 1) {
    if (!this.active) return;
    this.active = false;
    this.stopping = true;
    const ctx = this.engine.ctx;
    if (ctx && this.out) {
      const t = ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
      for (const s of this.srcs) s.stop(t + fade + 0.05);
      const nodes = this.nodes;
      setTimeout(() => nodes.forEach((n) => n.disconnect()), (fade + 0.3) * 1000);
    }
    this.srcs = [];
    this.nodes = [];
    this.running = false;
    this.engine.removeLoop(this);
  }

  private startBed(ctx: AudioContext, dist: number) {
    const bedDef = this.def.bed ? SOUNDS.get(this.def.bed) : null;
    const bufs = bedDef ? this.engine.buffersIfReady(bedDef) : null;
    if (!bufs?.length) return; // still baking: try again next frame
    const buf = bufs[0];
    const t = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.setTargetAtTime(this.bedGain(dist), t, Math.max(0.02, this.fadeIn / 3));
    this.nodes = [this.out];
    const stereo = this.def.stereoBed && !this.pos && typeof ctx.createStereoPanner === 'function';
    const copies = stereo ? 2 : 1;
    const base = this.rnd.next() * buf.duration;
    for (let k = 0; k < copies; k++) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      // Slightly different speeds keep the two copies from ever lining up.
      if (stereo) s.playbackRate.value = k ? 1.0031 : 0.9987;
      let dest: AudioNode = this.out;
      if (stereo) {
        const p = ctx.createStereoPanner();
        p.pan.value = k ? 0.7 : -0.7;
        p.connect(this.out);
        this.nodes.push(p);
        dest = p;
      }
      s.connect(dest);
      s.start(t, (base + k * buf.duration * 0.5) % buf.duration);
      this.srcs.push(s);
      this.nodes.push(s);
    }
    let tail: AudioNode = this.out;
    const bus = this.def.bus;
    const spatial = this.spatial;
    if (spatial && this.pos) {
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = airCutoff(dist);
      this.filter.Q.value = 0.5;
      tail.connect(this.filter);
      tail = this.filter;
      this.panner = this.engine.makePanner(spatial, this.pos);
      tail.connect(this.panner);
      tail = this.panner;
      this.nodes.push(this.filter, this.panner);
    }
    tail.connect(this.engine.busNodes[bus]);
    const send = ctx.createGain();
    send.gain.value = (this.def.reverb ?? 0.2) * (this.pos ? distanceWetness(dist) : 0.6);
    tail.connect(send);
    send.connect(this.engine.sendNodes[bus]);
    this.nodes.push(send);
    this.running = true;
  }

  private stopBed(fade: number) {
    const ctx = this.engine.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, fade / 3);
    for (const s of this.srcs) s.stop(t + fade + 0.05);
    const nodes = this.nodes;
    setTimeout(() => nodes.forEach((n) => n.disconnect()), (fade + 0.3) * 1000);
    this.srcs = [];
    this.nodes = [];
    this.out = null;
    this.panner = null;
    this.filter = null;
    this.running = false;
  }

  update(dt: number) {
    const ctx = this.engine.ctx;
    if (!ctx || !this.active) return;
    const now = ctx.currentTime;
    const spatial = this.spatial;
    const dist = this.pos ? this.engine.distanceTo(this.pos) : 0;
    const dg = spatial ? distanceGain(dist, spatial) : 1;
    const level = this.volume * dg;

    // Occlusion and air absorption, a few times a second.
    this.checkAcc += dt;
    if (this.checkAcc > 0.25) {
      this.checkAcc = 0;
      if (this.occlude && this.pos && dg > 0) this.occluded = this.engine.occluded(this.pos);
      if (this.filter) this.filter.frequency.setTargetAtTime(Math.min(airCutoff(dist), this.occluded ? 900 : 20000), now, 0.1);
      if (this.out) this.out.gain.setTargetAtTime(this.bedGain(dist), now, Math.max(0.15, this.levelTc));
    }

    if (this.def.bed) {
      const audible = level * dbToGain(this.def.gainDb ?? 0) > 0.0004;
      this.inaudibleFor = audible ? 0 : this.inaudibleFor + dt;
      if (audible && !this.running) this.startBed(ctx, dist);
      else if (!audible && this.running && this.inaudibleFor > 1) this.stopBed(0.3); // virtualise
    }

    // Recurring events.
    const events = this.def.events ?? [];
    for (let k = 0; k < events.length; k++) {
      const ev = events[k];
      const rate = ev.rate * Math.sqrt(Math.min(1, this.volume));
      if (this.next[k] === undefined) this.next[k] = now + this.expWait(rate) * this.rnd.next();
      if (level <= 0.001 || rate <= 0) {
        this.next[k] = now + this.expWait(Math.max(rate, 0.05));
        continue;
      }
      if (now >= this.next[k]) {
        this.fire(ev);
        this.next[k] = now + this.expWait(rate);
      }
    }
    for (let i = this.bouts.length - 1; i >= 0; i--) {
      const b = this.bouts[i];
      if (now >= b.time) {
        this.bouts.splice(i, 1);
        this.engine.play(b.ev.sound, { position: b.pos, volume: this.volume * dbToGain(b.ev.gainDb ?? 0), bus: this.def.bus, ifReady: true });
      }
    }
  }

  private expWait(rate: number) {
    return -Math.log(1 - this.rnd.next()) / Math.max(1e-3, rate);
  }

  private fire(ev: LoopEvent) {
    const r = this.rnd;
    const L = this.engine.listener;
    let pos: THREE.Vector3;
    if (this.pos) {
      const j = ev.jitter ?? 0;
      pos = new THREE.Vector3(this.pos.x + r.range(-j, j), this.pos.y, this.pos.z + r.range(-j, j));
    } else {
      const [d0, d1] = ev.dist ?? [10, 30];
      const [h0, h1] = ev.height ?? [0, 3];
      const a = r.next() * Math.PI * 2;
      const d = r.range(d0, d1);
      pos = new THREE.Vector3(L.x + Math.cos(a) * d, L.y + r.range(h0, h1), L.z + Math.sin(a) * d);
    }
    let velocity: THREE.Vector3 | undefined;
    if (ev.move) {
      // Fly across the listener: tangential to the radial direction.
      const dx = pos.x - L.x;
      const dz = pos.z - L.z;
      const len = Math.hypot(dx, dz) || 1;
      const s = r.chance(0.5) ? 1 : -1;
      velocity = new THREE.Vector3((-dz / len) * ev.move * s, 0, (dx / len) * ev.move * s);
      pos.addScaledVector(velocity, -1.2); // start a little before the closest point
    }
    const volume = this.volume * dbToGain(ev.gainDb ?? 0);
    this.engine.play(ev.sound, { position: pos, volume, velocity, bus: this.def.bus, ifReady: true });
    if (ev.bout) {
      const n = r.int(ev.bout.count[0], ev.bout.count[1]);
      let t = this.engine.ctx!.currentTime;
      for (let i = 1; i < n; i++) {
        t += r.range(ev.bout.interval[0], ev.bout.interval[1]);
        this.bouts.push({ time: t, ev, pos });
      }
    }
  }
}

// ---------------------------------------------------------------- footsteps

/** Keeps footstep drivers updated; culls those far from the listener. */
export class FootstepSystem {
  private drivers = new Set<FootstepDriver>();
  /** Drivers farther than this from the listener don't play (they keep their rhythm). */
  cullDistance = 40;

  constructor(private readonly engine: AudioEngine) {}

  attach(source: FootstepSource, opts: FootstepOptions = {}): FootstepDriver & { detach(): void } {
    const engine = this.engine;
    const cull = () => this.cullDistance;
    const d = new FootstepDriver(
      source,
      (id, o) => {
        if (o.position && engine.distanceTo(o.position) > cull()) return;
        engine.play(id, o);
      },
      opts,
    ) as FootstepDriver & { detach(): void };
    d.detach = () => this.drivers.delete(d);
    this.drivers.add(d);
    return d;
  }

  update(dt: number) {
    for (const d of this.drivers) d.update(dt);
  }

  get count() {
    return this.drivers.size;
  }

  all(): readonly FootstepDriver[] {
    return [...this.drivers];
  }
}
