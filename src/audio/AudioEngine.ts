/**
 * The audio engine: one Web Audio context, mix buses wired to the settings, a convolution reverb
 * for the current space, a listener that follows the camera, voice-limited spatial one-shots and
 * virtualised loops (beds plus recurring events).
 *
 *   installAudio(game);                                    // once, in scene setup
 *   game.audio.play('clash.metal', { position: hitPoint });
 *   const fire = game.audio.loop('fire', { position: brazier });   fire.stop(1);
 *   game.audio.music.setState('explore');                  // base music
 *   game.audio.music.setOverride('combat', 'combat', 10);  // a fight (… 'combat', null) ends it)
 *   game.audio.ambience.addZone({ center, radius: 40, layers: [{ id: 'crowd', volume: 1 }] });
 *
 * The context is created lazily and resumed on the first user gesture (Safari and Chrome both
 * require that); until then `play` is a no-op and loops/music wait and start on unlock. Every
 * one-shot is pre-baked in a worker from start-up, so playing never synthesizes on the main thread
 * (except a first-use fallback for a few critical sounds, see `play`).
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { Layer } from '../core/Physics';
import type { SettingsData } from '../core/Settings';
import { AmbienceDirector } from './Ambience';
import { LOOPS, SOUNDS, bakeRate, forget, getVariants, isBaked, requestBake, setBaker, setSampleSource } from './bank';
import { Rand, dbToGain } from './dsp/core';
import { REVERBS, impulseResponse, type ReverbPreset } from './dsp/reverb';
import { FootstepDriver, type FootstepOptions, type FootstepSource, type Surface } from './FootstepDriver';
import { DEFAULT_SPATIAL, SOFT_CLIP_RANGE, airCutoff, distanceGain, distanceWetness, pickVariant, planVoice, sliderToGain, softClipCurve, type VoiceSlot } from './mix';
import { MusicDirector } from './music/MusicDirector';
import { musicSamples } from './music/samples';
import { vsco } from './music/vsco';
import { WorkerBaker } from './WorkerBaker';
import { SampleLibrary } from './samples';
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
  /**
   * Skip (and start baking) if the sound isn't baked yet instead of baking it synchronously. Only
   * matters in the first second or so after start-up, while the worker pre-bakes the bank.
   */
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
  /** Music samples held (the recorded instruments, plus any synthesised fallback), MB. */
  musicMB: number;
  music: string;
  reverb: ReverbPreset;
  sampleRate: number;
  /** Recorded sounds: how many the manifest lists, the codec that decoded, PCM not yet uploaded (MB). */
  recorded: number;
  sampleFormat: string;
  samplesHeldMB: number;
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

/** A reverb space: its convolver and return fader. */
interface Space {
  conv: ConvolverNode;
  gain: GainNode;
  /** Input connected (it is up, or fading). */
  connected: boolean;
  /** Context time its fade-out reaches silence (Infinity while it is the active space). */
  silentAt: number;
}

/** Linear ramp from the current value (gain fades with an exact end time). */
function ramp(p: AudioParam, v: number, t: number, dur: number) {
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(v, t + dur);
}

const tmpV = new THREE.Vector3();
const fwd = new THREE.Vector3();
const up = new THREE.Vector3();

/** Max simultaneous one-shot voices. */
const GLOBAL_VOICES = 48;
/** Below this estimated gain a one-shot isn't worth starting (≈ -62 dB). */
const CULL_GAIN = 0.0008;
/**
 * Output stage: makeup → glue compressor → brick-wall limiter → soft clipper. Sounds are
 * normalized to about -14 dBFS short-term and mixed well below that. The makeup plus the glue
 * compressor's own automatic makeup (browsers add about 0.6 × its full-range reduction) bring
 * exploring to about -22 dBFS RMS; the glue (2.5:1, slow-ish) evens out fights without pumping,
 * the limiter (20:1, 1 ms) catches what is left, and the soft clipper guarantees the output never
 * passes -0.2 dBFS, even with every slider at 100 %. Measured with `meter()` in the audio scene.
 */
const MAKEUP_DB = 7;
/** A dip on the ambience bus where the crowd and city beds crowd the mix (see buildGraph). */
const AMBIENCE_MUD = { hz: 480, q: 0.7, db: -3.5 };
/** Sounds louder than this at the listener (est. linear gain) duck the music briefly. */
const DUCK_ABOVE = 0.4;
/** The music bus follows its slider exactly (0 dB trim): the music is a quiet bed, and its instruments carry the level. */
const MUSIC_TRIM = 1;
/** Bus levels while someone is speaking to the player: the world steps back so the words stand out. */
const DIALOGUE_DUCK: Partial<Record<BusName, number>> = { music: 0.7, ambience: 0.45, sfx: 0.6 };

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
  private makeup!: GainNode;
  private glue!: DynamicsCompressorNode;
  private limiter!: DynamicsCompressorNode;
  private clipIn!: GainNode;
  private clipper!: WaveShaperNode;
  /** Music ducking under big impacts (after the music bus fader, so settings don't fight it). */
  private musicDuck!: GainNode;
  private duckUntil = 0;
  private buses = {} as Record<BusName, GainNode>;
  private sends = {} as Record<BusName, GainNode>;
  private envIn!: GainNode;
  private envReturn!: GainNode;
  /** One convolver per reverb space in use (see setEnvironment). */
  private spaces = new Map<ReverbPreset, Space>();
  /** Spaces to build as soon as their impulse response arrives (zones' and the default space). */
  private wantedSpaces = new Set<ReverbPreset>();
  /** The space that is (fading) up. */
  private envActive: ReverbPreset | null = null;
  /** A space change waiting for its impulse response from the worker. */
  private envPending = false;
  private envFade = 1.5;
  private musicRev!: GainNode;
  private musicConv!: ConvolverNode;
  private reverbPreset: ReverbPreset = 'open';
  private irCache = new Map<ReverbPreset, AudioBuffer>();
  private irPending = new Set<ReverbPreset>();
  private buffers = new Map<string, AudioBuffer[]>();
  private preparing = new Set<string>();
  /** Baked before the context existed: uploaded a few per frame once it does. */
  private uploadQueue = new Set<string>();
  private bufferBytes = 0;
  private baker: WorkerBaker | null = null;
  /** The recorded sounds (public/audio/sfx), null where the browser cannot decode them. */
  samples: SampleLibrary | null = null;
  /** One AudioBuffer per PCM array: aliased sounds (walk and run steps) share their recordings. */
  private shared = new WeakMap<Float32Array, AudioBuffer>();
  /** Fader per bus while a conversation is on (see duckForDialogue). */
  private dialogueDuck = false;
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
    const talk = (on: boolean) => {
      this.dialogueDuck = on;
      this.applySettings(game.settings.data, 0.25);
    };
    this.offs.push(game.events.on('dialogue:started', () => talk(true)), game.events.on('dialogue:ended', () => talk(false)));
    // Fire-and-forget requests never bake on the main thread, except critical sounds on first use.
    this.offs.push(game.events.on('sfx', (e) => void this.play(e.id, { ...e, ifReady: !isCritical(e.id) })));
    // Start the worker now (no gesture needed) and pre-bake every one-shot in the background, so
    // everything is ready by the time the player first clicks or presses a key.
    this.baker = WorkerBaker.create();
    setBaker(this.baker);
    this.installSamples();
    // Without a worker, sounds bake on first use instead (pre-baking would stall the main thread).
    if (this.baker) this.prewarm();
  }

  /** Recordings first (decoded off the main thread), the synthesised sounds for anything they lack. */
  private installSamples() {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    if (typeof fetch !== 'function' || typeof OfflineAudioContext === 'undefined' || q?.get('samples') === '0') return;
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    this.samples = new SampleLibrary(`${base}audio/sfx/`);
    setSampleSource(this.samples);
    const lib = this.samples;
    void lib.prefetch(['steps', 'combat', 'world', 'ui']).then(() => {
      // Upload every recorded one-shot as soon as its group is in (beds wait for their loop).
      for (const id of lib.ids()) if (SOUNDS.get(id)?.kind === 'oneshot') this.prepare(id, false);
    });
  }

  /** Queue every one-shot for background baking: the commonest first. */
  private prewarm() {
    const first = [
      'step.stone.walk', 'step.stone.run', 'step.dirt.walk', 'step.dirt.run', 'step.grass.walk', 'step.grass.run', 'land.stone',
      'ui.click', 'ui.hover', 'ui.open', 'ui.close', 'swing.medium', 'swing.fast', 'clash.metal', 'block.shield', 'hit.flesh',
      'vox.grunt.m', 'vox.pain.m', 'vox.effort.m', 'body.fall', 'stinger.questStart', 'stinger.questComplete', 'stinger.levelUp', 'stinger.discover',
    ];
    const rest = [...SOUNDS.values()].filter((d) => d.kind === 'oneshot' && !first.includes(d.id)).map((d) => d.id);
    for (const id of [...first, ...rest]) this.prepare(id, false);
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
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this.onRunning();
    };
    this.buildGraph(ctx);
    this.applySettings(this.game.settings.data);
    // Impulse responses bake in the worker too: the music hall and the spaces in use first.
    for (const p of Object.keys(REVERBS) as ReverbPreset[]) this.irIfReady(p, p === 'music' || p === this.reverbPreset || this.wantedSpaces.has(p));
    this.setEnvironment(this.reverbPreset, 0);
    this.music.attach({ ctx, dry: this.buses.music, rev: this.musicRev });
  }

  private buildGraph(ctx: AudioContext) {
    this.master = ctx.createGain();
    this.makeup = ctx.createGain();
    this.makeup.gain.value = dbToGain(MAKEUP_DB);
    // Glue: a gentle, slow-ish compressor that evens out pile-ups (big fights) without pumping.
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 10;
    this.glue.ratio.value = 2.5;
    this.glue.attack.value = 0.012;
    this.glue.release.value = 0.3;
    // Brick wall: fast and hard, only touches what the glue let through.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;
    // Soft clipper for the limiter's overshoot: linear below -3 dBFS, never above -0.2 dBFS.
    this.clipIn = ctx.createGain();
    this.clipIn.gain.value = 1 / SOFT_CLIP_RANGE;
    this.clipper = ctx.createWaveShaper();
    this.clipper.curve = softClipCurve(4096, SOFT_CLIP_RANGE);
    this.clipper.oversample = '2x';
    this.master.connect(this.makeup);
    this.makeup.connect(this.glue);
    this.glue.connect(this.limiter);
    this.limiter.connect(this.clipIn);
    this.clipIn.connect(this.clipper);
    this.clipper.connect(ctx.destination);

    this.envIn = ctx.createGain();
    this.envReturn = ctx.createGain();
    this.envReturn.connect(this.master);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.master);
    for (const b of BUSES) {
      const g = ctx.createGain();
      if (b === 'ambience') {
        // The crowd and city beds pile half of the mix's energy into one octave (355-710 Hz, measured
        // in the Forum by scripts/sfx/mixcheck.mjs): a mild cut there lets the voices, steps and air above it through.
        const mud = ctx.createBiquadFilter();
        mud.type = 'peaking';
        mud.frequency.value = AMBIENCE_MUD.hz;
        mud.Q.value = AMBIENCE_MUD.q;
        mud.gain.value = AMBIENCE_MUD.db;
        g.connect(mud);
        mud.connect(this.master);
      } else g.connect(b === 'music' ? this.musicDuck : this.master);
      this.buses[b] = g;
      const s = ctx.createGain();
      s.connect(this.envIn);
      this.sends[b] = s;
    }
    // Music has its own warm hall (non-diegetic), returned through the music bus. Its impulse
    // response arrives from the worker shortly after start-up (see storeIr).
    this.musicConv = ctx.createConvolver();
    this.musicConv.normalize = false;
    this.musicRev = ctx.createGain();
    this.musicRev.connect(this.musicConv);
    this.musicConv.connect(this.buses.music);
  }

  /**
   * A space's impulse response, or null while the worker bakes it (the bake is started here).
   * Without a worker it is rendered on the spot.
   */
  private irIfReady(preset: ReverbPreset, urgent = true): AudioBuffer | null {
    const hit = this.irCache.get(preset);
    const ctx = this.ctx;
    if (hit || !ctx) return hit ?? null;
    const rate = ctx.sampleRate;
    const render = () => {
      const [l, r] = impulseResponse(REVERBS[preset], rate);
      return this.storeIr(preset, l, r, rate);
    };
    if (!this.baker) return render();
    if (this.irPending.has(preset)) {
      if (urgent) this.baker.promoteIr(preset);
    } else {
      this.irPending.add(preset);
      this.baker.bakeIr(preset, rate, urgent).then(
        ({ channels }) => {
          this.irPending.delete(preset);
          this.storeIr(preset, channels[0], channels[1], rate);
        },
        (e: Error) => {
          this.irPending.delete(preset);
          if (e?.name !== 'BakeCancelled' && this.ctx) render();
        },
      );
    }
    return null;
  }

  private storeIr(preset: ReverbPreset, l: Float32Array, r: Float32Array, rate: number): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx || ctx.sampleRate !== rate) return null; // a convolver needs the context's own rate
    const b = ctx.createBuffer(2, l.length, rate);
    b.getChannelData(0).set(l);
    b.getChannelData(1).set(r);
    this.irCache.set(preset, b);
    if (preset === 'music' && !this.musicConv.buffer) this.musicConv.buffer = b;
    // Setting a convolver's buffer is the expensive part (the browser prepares its FFT kernels on
    // the main thread, several ms for a long hall): do it now, as the IR arrives, for every space a
    // zone may ask for, rather than at the moment the player walks in.
    else if (this.wantedSpaces.has(preset)) this.space(preset);
    return b;
  }

  /** The convolver for a space, built on first use (null while its impulse response bakes). */
  private space(preset: ReverbPreset): Space | null {
    const hit = this.spaces.get(preset);
    if (hit) return hit;
    const ctx = this.ctx;
    const ir = ctx && this.irIfReady(preset);
    if (!ctx || !ir) return null;
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = ir;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    conv.connect(gain);
    gain.connect(this.envReturn);
    const sp: Space = { conv, gain, connected: false, silentAt: 0 };
    this.spaces.set(preset, sp);
    return sp;
  }

  /** Build a space's convolver ahead of need (ambience zones call this for their reverb). */
  prepareEnvironment(preset: ReverbPreset) {
    if (this.wantedSpaces.has(preset)) return;
    this.wantedSpaces.add(preset);
    if (this.ctx && this.irCache.has(preset)) this.space(preset);
  }

  private applySettings(s: SettingsData, tc = 0.04) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, tc);
    set(this.master.gain, this.muted ? 0 : sliderToGain(s.masterVolume));
    const vols: Record<BusName, number> = {
      music: s.musicVolume,
      sfx: s.sfxVolume,
      ambience: s.ambienceVolume ?? 0.8,
      voice: s.voiceVolume ?? 0.9,
      ui: s.uiVolume ?? 0.75,
    };
    for (const b of BUSES) {
      const duck = this.dialogueDuck ? DIALOGUE_DUCK[b] ?? 1 : 1;
      set(this.buses[b].gain, sliderToGain(vols[b]) * (b === 'music' ? MUSIC_TRIM : 1) * duck);
      set(this.sends[b].gain, b === 'music' ? 0 : sliderToGain(vols[b]) * duck);
    }
    this.hrtf = !!s.audioHrtf;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applySettings(this.game.settings.data);
  }

  /**
   * Crossfade the environmental reverb to another space (street, forum, temple, room…).
   *
   * Each space has its own convolver, loaded once with its impulse response and never reassigned
   * (reassigning a ringing convolver clicks, and loading one costs milliseconds of main-thread
   * time). Changing space only ramps gains: the new space fades up, the others fade down, and a
   * faded-out space's input is disconnected so the browser stops running it. Going back and forth
   * between two spaces is therefore free and seamless. A space whose impulse response is still
   * baking is switched to as soon as it arrives.
   */
  setEnvironment(preset: ReverbPreset, fade = 1.5) {
    if (preset === this.reverbPreset && (this.envActive === preset || this.envPending)) return;
    this.reverbPreset = preset;
    this.envFade = Math.max(0.02, fade);
    this.applyEnvironment();
  }

  private applyEnvironment() {
    const ctx = this.ctx;
    if (!ctx) return;
    const want = this.reverbPreset;
    this.wantedSpaces.add(want);
    const sp = this.space(want);
    this.envPending = !sp;
    if (!sp || this.envActive === want) return;
    const t = ctx.currentTime;
    const dur = this.envFade;
    if (!sp.connected) {
      this.envIn.connect(sp.conv);
      sp.connected = true;
    }
    ramp(sp.gain.gain, REVERBS[want].wet, t, dur);
    sp.silentAt = Infinity;
    for (const [p, other] of this.spaces) {
      if (p === want || other.silentAt !== Infinity) continue;
      ramp(other.gain.gain, 0, t, dur);
      other.silentAt = t + dur + 0.05;
    }
    this.envActive = want;
  }

  /** Disconnect spaces that have faded out (an idle convolver costs nothing). */
  private retireSpaces(t: number) {
    for (const sp of this.spaces.values())
      if (sp.connected && t >= sp.silentAt) {
        this.envIn.disconnect(sp.conv);
        sp.connected = false;
      }
  }

  /** Dip the music for a moment (big impacts), by `db` (negative), recovering over `release` s. */
  duckMusic(db = -4, hold = 0.25, release = 0.6) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = this.musicDuck.gain;
    const target = dbToGain(db);
    // Overlapping hits extend the hold rather than restarting the dip.
    this.duckUntil = Math.max(this.duckUntil, t + hold);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(Math.min(target, g.value), t, 0.015);
    g.setTargetAtTime(1, this.duckUntil, release / 3);
  }

  get environment(): ReverbPreset {
    return this.reverbPreset;
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    this.music.dispose();
    this.baker?.dispose();
    this.baker = null;
    setBaker(null);
    if (this.samples) setSampleSource(null);
    this.samples = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.buffers.clear();
    this.uploadQueue.clear();
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number) {
    this.footsteps.update(dt);
  }

  lateUpdate(dt: number) {
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    this.listener.setFromMatrixPosition(cam.matrixWorld);
    if (!this.ctx) return;
    this.drainUploads();
    if (this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    if (this.envPending) this.applyEnvironment();
    this.retireSpaces(ctx.currentTime);
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

  /** Uploaded buffers, or null (and hurry its bake along) if the sound isn't baked yet. */
  buffersIfReady(def: SoundDef): AudioBuffer[] | null {
    const hit = this.buffers.get(def.id);
    if (hit) return hit;
    // Baked but not uploaded yet: copying into AudioBuffers is cheap.
    if (isBaked(def.id)) return this.upload(def, getVariants(def.id)!);
    this.prepare(def.id);
    return null;
  }

  /**
   * Bake a sound off the main thread and upload it. Safe to call repeatedly; an urgent call promotes
   * a queued background bake of the same sound.
   */
  prepare(id: string, urgent = true) {
    if (this.buffers.has(id)) return;
    if (this.preparing.has(id)) {
      if (urgent) void requestBake(id, true);
      return;
    }
    const def = SOUNDS.get(id);
    if (!def) return;
    this.preparing.add(id);
    void requestBake(id, urgent).then((vars) => {
      this.preparing.delete(id);
      if (!vars || this.buffers.has(id)) return;
      if (this.ctx) this.upload(def, vars);
      else this.uploadQueue.add(id);
    });
  }

  /** Upload sounds baked before the context existed, about a millisecond's worth per frame. */
  private drainUploads() {
    if (!this.uploadQueue.size) return;
    const t0 = performance.now();
    for (const id of this.uploadQueue) {
      this.uploadQueue.delete(id);
      const def = SOUNDS.get(id);
      if (def && !this.buffers.has(id) && isBaked(id)) this.upload(def, getVariants(id)!);
      if (performance.now() - t0 > 1) break;
    }
  }

  private upload(def: SoundDef, vars: Float32Array[]): AudioBuffer[] | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const rate = bakeRate(def);
    const list = vars.map((d) => {
      const had = this.shared.get(d);
      if (had && had.sampleRate === rate) return had;
      const b = ctx.createBuffer(1, d.length, rate);
      b.getChannelData(0).set(d);
      this.bufferBytes += d.byteLength;
      this.shared.set(d, b);
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

  /**
   * Play a one-shot. A sound not baked yet (only possible in the first second or so, while the
   * worker pre-bakes the bank) is baked synchronously, unless `ifReady` is set, in which case it is
   * skipped. Footsteps, ambience events and the 'sfx' event use `ifReady` (critical sounds excepted).
   */
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
    // Big impacts and cries make room for themselves in the music (rather than leaning on the master
    // compressor, which would pump the ambience too).
    if (est > DUCK_ABOVE && (bus === 'sfx' || bus === 'voice') && (def.priority ?? 0.5) >= 0.5) this.duckMusic();
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
   * Final output level over the last ~43 ms (peak and RMS in dBFS), and the gain reduction of the
   * glue compressor and the limiter (dB, ≤ 0). The analyser is created on first use.
   */
  meter(): { peakDb: number; rmsDb: number; reductionDb: number; glueDb: number; limiterDb: number } | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.clipper.connect(this.analyser);
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
    const reduction = (c: DynamicsCompressorNode) => {
      const r = c.reduction as unknown;
      return typeof r === 'number' ? r : ((r as AudioParam | undefined)?.value ?? 0);
    };
    const glueDb = reduction(this.glue);
    const limiterDb = reduction(this.limiter);
    return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / b.length)), reductionDb: glueDb + limiterDb, glueDb, limiterDb };
  }

  /**
   * Debug/measurement: record `seconds` of the final output (after glue, limiter and clipper) and of
   * each bus's dry feed (post-fader, before the master; reverb returns are not in the bus feeds), as
   * mono sums. Used by scripts/sfx/mixcheck.mjs to report loudness and spectra of the real mix. Not for
   * play: it runs script processors (deprecated, but the only portable raw-PCM tap).
   */
  // DEBUG-ONLY measurement tap (scripts/sfx/mixcheck.mjs); never called at play time.
  capture(seconds: number): Promise<{ rate: number; out: Float32Array; buses: Record<string, Float32Array> }> {
    const ctx = this.ctx;
    if (!ctx) return Promise.reject(new Error('audio not started'));
    const rate = ctx.sampleRate;
    const total = Math.round(seconds * rate);
    const taps: [string, AudioNode][] = [['out', this.clipper], ...BUSES.map((b): [string, AudioNode] => [b, this.buses[b]])];
    const bufs = new Map<string, Float32Array>();
    return new Promise((resolve) => {
      let done = 0;
      for (const [name, node] of taps) {
        const data = new Float32Array(total);
        bufs.set(name, data);
        let at = 0;
        const sp = ctx.createScriptProcessor(4096, 1, 1);
        sp.onaudioprocess = (e) => {
          const inp = e.inputBuffer.getChannelData(0);
          const n = Math.min(inp.length, total - at);
          if (n > 0) data.set(inp.subarray(0, n), at);
          at += Math.max(0, n);
          if (at >= total && sp.onaudioprocess) {
            sp.onaudioprocess = null;
            node.disconnect(sp);
            sp.disconnect();
            if (++done === taps.length) {
              const out = bufs.get('out')!;
              bufs.delete('out');
              resolve({ rate, out, buses: Object.fromEntries(bufs) });
            }
          }
        };
        node.connect(sp);
        sp.connect(ctx.destination);
      }
    });
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
      musicMB: (musicSamples.bytes + vsco.bytes) / 1048576,
      music: this.music.state,
      reverb: this.reverbPreset,
      sampleRate: this.ctx?.sampleRate ?? 0,
      recorded: this.samples?.ids().length ?? 0,
      sampleFormat: this.samples?.format ?? (this.samples ? 'loading' : 'off'),
      samplesHeldMB: (this.samples?.heldBytes() ?? 0) / 1048576,
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
    // Bake everything this loop needs now (in the worker), so it is ready when it becomes audible.
    if (def.bed) engine.prepare(def.bed);
    for (const e of def.events ?? []) engine.prepare(e.sound);
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

/** Sounds that may still bake synchronously on first use: rare, and must never be lost. */
export function isCritical(id: string): boolean {
  return id.startsWith('stinger.') || id.startsWith('ui.');
}

// ---------------------------------------------------------------- footsteps

/** Keeps footstep drivers updated; culls those far from the listener. */
export class FootstepSystem {
  private drivers = new Set<FootstepDriver>();
  /** Drivers farther than this from the listener don't play (they keep their rhythm). */
  cullDistance = 40;
  /** The ground under (x, y, z): set by the game (terrain and what is built on it); stone until then. */
  surfaceAt: (x: number, y: number, z: number) => Surface = () => 'stone';

  constructor(private readonly engine: AudioEngine) {}

  attach(source: FootstepSource, opts: FootstepOptions = {}): FootstepDriver & { detach(): void } {
    const engine = this.engine;
    const cull = () => this.cullDistance;
    // Without a lookup of its own a walker reads the ground the game installed (see game/audio.ts).
    const surfaceAt = opts.surfaceAt ?? ((x: number, y: number, z: number) => this.surfaceAt(x, y, z));
    // Nobody hears a step beyond the cull distance: skip even the ground lookup there.
    const near = opts.near ?? ((p: { x: number; y: number; z: number }) => engine.distanceTo(p) <= cull() + 5);
    const d = new FootstepDriver(
      source,
      (id, o) => {
        if (o.position && engine.distanceTo(o.position) > cull()) return;
        // Never bake on the main thread for a footstep: skip it if (rarely) not ready yet.
        engine.play(id, { ...o, ifReady: true });
      },
      { ...opts, surfaceAt, near: opts.spatial === false ? undefined : near },
    ) as FootstepDriver & { detach(): void };
    d.detach = () => {
      this.drivers.delete(d);
      d.release();
    };
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
