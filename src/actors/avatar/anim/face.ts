/**
 * A face that is alive (realistic bodies, LOD 0): blinks, the jaw while speaking, and the eyes.
 *
 *   - Blinks every 2 to 6 s (a few double blinks), about 130 ms: the lid falls fast, rests a moment and
 *     rises more slowly. Every face keeps its own clock, so a crowd never blinks together.
 *   - Speech: `speak(text)` turns the line into a rhythm of syllables (one per vowel group, a pause at
 *     each word gap and a longer one at punctuation, about 4.5 syllables a second) and the jaw opens and
 *     closes with it, each syllable a little different.
 *   - Gaze: toward the head's look-at target when there is one (the eyes lead, the head follows in the
 *     animation), otherwise small idle glances around straight ahead; the eyes jump between fixations
 *     quickly (saccades), and a big jump brings a blink.
 *
 * Output: jaw angle, blink amounts and gaze angles written into the avatar's parameter slot (real/deform.ts).
 * Pure apart from the parameter floats; the random source can be injected for tests.
 */
import { PRM } from '../real/deform';

/** Seconds between blinks (uniform), and a blink's phases. */
export const BLINK_GAP = [2, 6] as const;
export const BLINK_CLOSE = 0.05;
export const BLINK_HOLD = 0.025;
export const BLINK_OPEN = 0.075;
export const BLINK_TIME = BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN;
/** Syllables per second while speaking, and the jaw's widest opening for a syllable (rad). */
export const SYLLABLE_RATE = 4.5;
export const JAW_OPEN = 0.1;
/** Gaze limits (rad) and how far idle glances wander. */
const GAZE_YAW = 0.5;
const GAZE_PITCH = 0.35;

/** Blink amount (0 open ... 1 shut) at `t` seconds into a blink. */
export function blinkCurve(t: number): number {
  if (t <= 0 || t >= BLINK_TIME) return 0;
  if (t < BLINK_CLOSE) {
    const k = t / BLINK_CLOSE;
    return k * k * (3 - 2 * k);
  }
  if (t < BLINK_CLOSE + BLINK_HOLD) return 1;
  const k = (t - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN;
  return 1 - k * k * (3 - 2 * k);
}

/** A spoken line as syllable beats: [start s, length s, loudness 0..1]; the jaw shuts between them. */
export function syllables(text: string, rate = SYLLABLE_RATE, rnd: () => number = Math.random): [number, number, number][] {
  const out: [number, number, number][] = [];
  const beat = 1 / rate;
  let t = 0.05;
  const re = /([aeiouyāēīōū]+)|([.,;:!?…—–-]+)|(\s+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) {
      const len = beat * (0.75 + 0.5 * rnd());
      out.push([t, len * 0.85, 0.55 + 0.45 * rnd()]);
      t += len;
    } else if (m[2]) t += beat * (/[.!?…]/.test(m[2]) ? 2.2 : 1.2);
    else t += beat * 0.25;
  }
  if (!out.length && text.trim()) out.push([t, beat, 0.7]);
  return out;
}

/** Jaw opening (0..1 of JAW_OPEN) at time t through a syllable list. */
export function jawAt(beats: readonly [number, number, number][], t: number): number {
  for (const [s, len, amp] of beats) {
    if (t < s) break;
    if (t < s + len) {
      const k = (t - s) / len;
      // Quick to open, a little slower to close.
      return amp * Math.sin(Math.PI * Math.pow(k, 0.8));
    }
  }
  return 0;
}

export class FaceDriver {
  private nextBlink: number;
  private blinkT = -1;
  private doubleBlink = false;
  private beats: [number, number, number][] = [];
  private speakT = 0;
  private speaking = false;
  private jaw = 0;
  private yaw = 0;
  private pitch = 0;
  private wantYaw = 0;
  private wantPitch = 0;
  private glanceIn = 1;
  /** Gaze toward a target in the head's frame (set by the body each frame), or null for idle glances. */
  private target: { yaw: number; pitch: number } | null = null;
  /** Screenshots and tests: hold the lids (0 open ... 1 shut) or the jaw (0..1) at a value; null lets them live. */
  debugBlink: number | null = null;
  debugJaw: number | null = null;

  constructor(private readonly rnd: () => number = Math.random) {
    this.nextBlink = BLINK_GAP[0] * rnd() + 0.5 * BLINK_GAP[1] * rnd();
  }

  /** Speak a line (subtitles, dialogue): the jaw moves for about its length. Empty text stops. */
  speak(text: string) {
    this.beats = text ? syllables(text, SYLLABLE_RATE, this.rnd) : [];
    this.speakT = 0;
    this.speaking = this.beats.length > 0;
  }

  /** Seconds left of the current line. */
  get speechLeft(): number {
    if (!this.speaking || !this.beats.length) return 0;
    const [s, len] = this.beats[this.beats.length - 1];
    return Math.max(0, s + len - this.speakT);
  }

  /** Blink now (tests, screenshots). */
  blink() {
    this.blinkT = 0;
  }

  /** Where the eyes should look, in the head's frame (rad), or null. */
  lookAt(yaw: number | null, pitch = 0) {
    this.target = yaw === null ? null : { yaw: Math.max(-GAZE_YAW, Math.min(GAZE_YAW, yaw)), pitch: Math.max(-GAZE_PITCH, Math.min(GAZE_PITCH, pitch)) };
  }

  update(dt: number, params: Float32Array | null) {
    // Blinks.
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT >= BLINK_TIME) {
        this.blinkT = -1;
        if (this.doubleBlink) {
          this.doubleBlink = false;
          this.nextBlink = 0.08;
        }
      }
    } else {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blinkT = 0;
        this.doubleBlink = this.rnd() < 0.12;
        this.nextBlink = BLINK_GAP[0] + (BLINK_GAP[1] - BLINK_GAP[0]) * this.rnd();
      }
    }
    const blink = this.debugBlink ?? (this.blinkT >= 0 ? blinkCurve(this.blinkT) : 0);
    // Speech.
    let jawWant = 0;
    if (this.speaking) {
      this.speakT += dt;
      jawWant = jawAt(this.beats, this.speakT);
      if (this.speechLeft <= 0) this.speaking = false;
    }
    // A touch of smoothing so a frame hitch does not snap the jaw.
    this.jaw += (jawWant - this.jaw) * Math.min(1, dt * 30);
    // Gaze: fixations and saccades.
    this.glanceIn -= dt;
    if (this.target) {
      this.wantYaw = this.target.yaw;
      this.wantPitch = this.target.pitch;
    } else if (this.glanceIn <= 0) {
      this.glanceIn = 0.8 + 2.4 * this.rnd();
      const far = this.rnd() < 0.25;
      this.wantYaw = (this.rnd() * 2 - 1) * (far ? 0.3 : 0.1);
      this.wantPitch = (this.rnd() * 2 - 1) * 0.06 - (far ? 0.05 : 0);
    }
    const jump = Math.abs(this.wantYaw - this.yaw) + Math.abs(this.wantPitch - this.pitch);
    // A big jump of the eyes often comes with a blink.
    if (jump > 0.35 && this.blinkT < 0 && this.rnd() < 0.5) this.blinkT = 0;
    const k = Math.min(1, dt * 22);
    this.yaw += (this.wantYaw - this.yaw) * k;
    this.pitch += (this.wantPitch - this.pitch) * k;
    if (params) {
      params[PRM.jaw] = (this.debugJaw ?? this.jaw) * JAW_OPEN;
      params[PRM.blinkL] = blink;
      params[PRM.blinkR] = blink;
      params[PRM.gazeYaw] = this.yaw;
      params[PRM.gazePitch] = this.pitch;
    }
  }

  /** Zero the face parameters (far LODs, first person). */
  static clear(params: Float32Array | null) {
    if (!params) return;
    params[PRM.jaw] = params[PRM.blinkL] = params[PRM.blinkR] = params[PRM.gazeYaw] = params[PRM.gazePitch] = 0;
  }
}
