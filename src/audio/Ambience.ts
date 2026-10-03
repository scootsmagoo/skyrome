/**
 * Ambience director: decides which ambience layers play and how loud, from
 *  - scene-wide base levels  (`setBase({ city: 1, birds: 0.6, wind: 0.4 })`),
 *  - zones around the listener (`addZone({ center, radius, layers: [{ id: 'crowd', volume: 1 }] })`),
 *  - the hour and month (birds and cicadas by day, crickets and owls by night, carts after dark),
 *  - altitude (the city bed thins and the wind rises as you climb a hill).
 *
 * A layer id is a loop id from the bank (sounds/ambience.ts). Each audible layer runs as one
 * engine loop whose volume is eased toward its target; silent layers are stopped after a while.
 * Zones may also set the reverb space and request a music state (e.g. a temple precinct).
 */
import * as THREE from 'three';
import type { AudioEngine, LoopHandle } from './AudioEngine';
import { CITY_LAYERS, altitudeFactors, timeFactor, zoneWeight } from './ambienceCurves';
import type { ReverbPreset } from './dsp/reverb';
import type { MusicRequest } from './music/MusicDirector';

export interface ZoneLayer {
  id: string;
  volume: number;
}

export interface ZoneOptions {
  center: THREE.Vector3Like;
  /** Full strength within this radius (m, horizontal). */
  radius: number;
  /** Fade-out distance beyond the radius (default: half the radius, at least 8 m). */
  fade?: number;
  layers: ZoneLayer[];
  /** Reverb space while inside (strongest zone wins). */
  reverb?: ReverbPreset;
  /** Music request while inside (e.g. 'temple', 'tavern'). */
  music?: MusicRequest;
  /** Ignore hour/season curves for this zone's layers (interiors). */
  timeless?: boolean;
  /** Free label for debugging. */
  name?: string;
}

export interface Zone extends ZoneOptions {
  readonly id: number;
  /** Current weight 0..1 (updated by the director). */
  weight: number;
  remove(): void;
}

const UPDATE_INTERVAL = 0.2;
const STOP_AFTER = 6;

export class AmbienceDirector {
  /** Scene-wide base levels per layer. */
  readonly base = new Map<string, number>();
  /** Current target level per layer (for the HUD / sound board). */
  readonly levels = new Map<string, number>();
  /** Altitude band (game y) over which the city thins and the wind rises. */
  altitude = { low: 12, high: 34 };
  /** Reverb when no zone asks for one. */
  defaultReverb: ReverbPreset = 'open';
  /** Overrides for testing (the sound board's time slider). */
  hourOverride: number | null = null;
  monthOverride: number | null = null;
  enabled = true;

  private zones: Zone[] = [];
  private handles = new Map<string, { h: LoopHandle; silentFor: number }>();
  private acc = UPDATE_INTERVAL;
  private nextId = 1;
  private musicRequest: MusicRequest | null = null;

  constructor(private readonly engine: AudioEngine) {}

  setBase(layers: Record<string, number>) {
    for (const [k, v] of Object.entries(layers)) this.base.set(k, v);
    this.acc = UPDATE_INTERVAL;
  }

  addZone(o: ZoneOptions): Zone {
    const zone: Zone = {
      ...o,
      center: { x: o.center.x, y: o.center.y, z: o.center.z },
      id: this.nextId++,
      weight: 0,
      remove: () => {
        this.zones = this.zones.filter((z) => z !== zone);
        this.acc = UPDATE_INTERVAL;
      },
    };
    this.zones.push(zone);
    this.acc = UPDATE_INTERVAL;
    return zone;
  }

  allZones(): readonly Zone[] {
    return this.zones;
  }

  get hour(): number {
    return this.hourOverride ?? this.engine.game.time.hour;
  }

  get month(): number {
    return this.monthOverride ?? this.engine.game.time.date().month;
  }

  /** Compute target levels for every layer at a listener position (pure-ish; used by update). */
  computeLevels(listener: THREE.Vector3Like, hour: number, month: number): Map<string, number> {
    const raw = new Map<string, { v: number; timeless: boolean }>();
    for (const [id, v] of this.base) raw.set(id, { v, timeless: false });
    for (const z of this.zones) {
      const d = Math.hypot(listener.x - z.center.x, listener.z - z.center.z);
      z.weight = zoneWeight(d, z.radius, z.fade ?? Math.max(8, z.radius * 0.5));
      if (z.weight <= 0) continue;
      for (const l of z.layers) {
        const v = z.weight * l.volume;
        const cur = raw.get(l.id);
        if (!cur || v > cur.v) raw.set(l.id, { v, timeless: !!z.timeless });
      }
    }
    const alt = altitudeFactors(listener.y, this.altitude.low, this.altitude.high);
    const out = new Map<string, number>();
    for (const [id, { v, timeless }] of raw) {
      let level = v * (timeless ? 1 : timeFactor(id, hour, month));
      if (CITY_LAYERS.has(id)) level *= alt.city;
      if (id === 'wind') level *= alt.wind;
      out.set(id, Math.max(0, Math.min(1, level)));
    }
    return out;
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < UPDATE_INTERVAL) return;
    const step = this.acc;
    this.acc = 0;
    const targets = this.enabled ? this.computeLevels(this.engine.listener, this.hour, this.month) : new Map<string, number>();
    this.levels.clear();
    for (const [id, v] of targets) this.levels.set(id, v);

    for (const [id, v] of targets) {
      let h = this.handles.get(id);
      if (v > 0.002) {
        if (!h) {
          h = { h: this.engine.loop(id, { volume: v, fadeIn: 2 }), silentFor: 0 };
          this.handles.set(id, h);
        } else h.h.setVolume(v, 1.5);
        h.silentFor = 0;
      }
    }
    for (const [id, h] of this.handles) {
      const v = targets.get(id) ?? 0;
      if (v > 0.002) continue;
      h.h.setVolume(0, 1.5);
      h.silentFor += step;
      if (h.silentFor > STOP_AFTER) {
        h.h.stop(0.5);
        this.handles.delete(id);
      }
    }

    // Reverb space and music from the strongest zone that asks for them.
    let rz: Zone | null = null;
    let mz: Zone | null = null;
    for (const z of this.zones) {
      if (z.reverb && z.weight > 0.5 && (!rz || z.weight > rz.weight)) rz = z;
      if (z.music && z.weight > 0.6 && (!mz || z.weight > mz.weight)) mz = z;
    }
    this.engine.setEnvironment(rz?.reverb ?? this.defaultReverb, 1.5);
    const req = mz?.music ?? null;
    if (req !== this.musicRequest) {
      this.musicRequest = req;
      this.engine.music.setOverride('ambience-zone', req, 1);
    }
  }
}
