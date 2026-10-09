/**
 * The recorded sounds: manifest rules, cutting and levelling of clips, the library's loading and
 * fallbacks, its place in the bank, and the shipped files against the sound catalogue.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { BED_RMS, ONESHOT_LOUDNESS, SOUNDS, bakeRate, clearBank, getVariants, requestBake, setSampleSource } from '../src/audio/bank';
import { peakOf, rmsOf } from '../src/audio/dsp/core';
import { FootstepDriver, SURFACES } from '../src/audio/FootstepDriver';
import { SampleLibrary, cutClips, finishSample, onsetIndex, resolveEntry, type LibraryHooks, type SampleManifest } from '../src/audio/samples';
import { GAITS } from '../src/audio/sounds/footsteps';
import { groundSurface } from '../src/game/audio';

const RATE = 8000;

/** A strip with a decaying 500 Hz burst at each given second, and silence between. */
function strip(seconds: number, bursts: number[], lead = 0): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (const t of bursts) {
    const s = Math.round((t + lead) * RATE);
    for (let i = 0; i < 0.1 * RATE && s + i < out.length; i++) out[s + i] = 0.5 * Math.sin((2 * Math.PI * 500 * i) / RATE) * Math.exp(-i / (0.03 * RATE));
  }
  return out;
}

const manifest: SampleManifest = {
  version: 1,
  groups: { g: { rate: RATE, m4a: 'g.m4a', mp3: 'g.mp3', seconds: 3, bytes: 1 }, dead: { rate: RATE, m4a: 'd.m4a', mp3: 'd.mp3', seconds: 1, bytes: 1 } },
  sounds: {
    'a.walk': { group: 'g', kind: 'oneshot', clips: [[0.5, 0.7], [1.5, 1.7]] },
    'a.run': { alias: 'a.walk' },
    'lost.sound': { group: 'dead', kind: 'oneshot', clips: [[0.2, 0.4]] },
    'bed.test': { group: 'g', kind: 'bed', clips: [[1, 2]] },
  },
};

function hooks(over: Partial<LibraryHooks> = {}): LibraryHooks & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    fetchJson: async () => manifest,
    fetchBytes: async (url) => {
      fetched.push(url);
      if (url.includes('d.')) throw new Error('404');
      return new ArrayBuffer(8);
    },
    // The strip: bursts at 0.5 s and 1.5 s (one-shots), noise for the bed from 1 s to 2 s.
    decode: async () => {
      const s = strip(3, [0.5, 1.5]);
      for (let i = RATE; i < 2 * RATE; i++) s[i] = 0.3 * Math.sin(i * 0.3) + 0.2 * Math.sin(i * 1.7);
      return s;
    },
    ...over,
  };
}

afterEach(() => {
  setSampleSource(null);
  clearBank();
});

describe('sample manifest rules', () => {
  it('follows aliases one hop and rejects unknown or empty entries', () => {
    expect(resolveEntry(manifest, 'a.run')?.id).toBe('a.walk');
    expect(resolveEntry(manifest, 'a.walk')?.entry.clips?.length).toBe(2);
    expect(resolveEntry(manifest, 'nope')).toBeNull();
    expect(resolveEntry({ ...manifest, sounds: { x: { alias: 'y' } } }, 'x')).toBeNull();
  });

  it('finds the first audible sample', () => {
    const b = new Float32Array(1000);
    b[400] = 0.5;
    b[300] = 0.0001; // far below -50 dB of the peak
    expect(onsetIndex(b, 1000, -50, 0.01)).toBe(390);
    expect(onsetIndex(new Float32Array(10), 1000)).toBe(0);
  });
});

describe('cutting and levelling', () => {
  it('cuts one-shots with a margin and copies them out of the strip', () => {
    const s = strip(3, [0.5, 1.5]);
    const [a, b] = cutClips(s, RATE, [[0.5, 0.7], [1.5, 1.7]]);
    expect(a.length).toBeGreaterThan(0.2 * RATE);
    expect(a.length).toBeLessThan(0.3 * RATE);
    expect(peakOf(a)).toBeGreaterThan(0.4);
    expect(peakOf(b)).toBeGreaterThan(0.4);
    a.fill(0);
    expect(peakOf(s)).toBeGreaterThan(0.4); // a copy, not a view
  });

  it('cuts a bed to its exact length even when the codec shifted the strip', () => {
    const lead = 0.013; // 13 ms of encoder delay
    const s = new Float32Array(Math.round(3 * RATE));
    for (let i = Math.round((1 + lead) * RATE); i < Math.round((2 + lead) * RATE); i++) s[i] = 0.4 * Math.sin(i * 0.9);
    const [bed] = cutClips(s, RATE, [[1, 2]], 'bed');
    expect(bed.length).toBe(RATE);
    expect(Math.abs(bed[0])).toBeGreaterThan(0.001); // starts on sound, not on the silence before it
  });

  it('levels one-shots to the bank convention and beds to the bed RMS', () => {
    const s = strip(1, [0.1]);
    const out = finishSample(cutClips(s, RATE, [[0.1, 0.3]])[0], RATE, 'oneshot');
    expect(peakOf(out)).toBeLessThanOrEqual(0.95);
    // The loudest 50 ms sit at the target (or the peak cap held them back a little).
    const n = Math.round(0.05 * RATE);
    let best = 0;
    for (let i = 0; i + n <= out.length; i += 8) best = Math.max(best, rmsOf(out, i, i + n));
    expect(best).toBeGreaterThan(ONESHOT_LOUDNESS * 0.6);
    expect(best).toBeLessThanOrEqual(ONESHOT_LOUDNESS * 1.05);
    expect(Math.abs(out[out.length - 1])).toBeLessThan(0.01);
    const bed = new Float32Array(RATE);
    for (let i = 0; i < bed.length; i++) bed[i] = 0.05 * Math.sin(i * 0.2) + 0.2;
    const fixed = finishSample(bed, RATE, 'bed');
    expect(rmsOf(fixed)).toBeCloseTo(BED_RMS, 2);
    // A sparse bed (one loud chirp in silence) keeps its peaks instead of being distorted to reach the RMS.
    const sparse = new Float32Array(RATE * 2);
    for (let i = 0; i < 400; i++) sparse[RATE + i] = 0.5 * Math.sin(i * 0.5);
    const kept = finishSample(sparse, RATE, 'bed');
    expect(peakOf(kept)).toBeLessThanOrEqual(0.9001);
    expect(rmsOf(kept)).toBeLessThan(BED_RMS);
  });
});

describe('SampleLibrary', () => {
  it('loads a group once, cuts every sound, and shares the arrays of an alias', async () => {
    const h = hooks();
    const lib = new SampleLibrary('/audio/sfx/', h);
    await lib.ready;
    expect(lib.pending('a.walk')).toBe(true);
    expect(lib.pending('unknown')).toBe(false);
    const walk = await lib.load('a.walk');
    const run = await lib.load('a.run');
    expect(walk?.length).toBe(2);
    expect(run?.[0]).toBe(walk?.[0]);
    expect(lib.rateOf('a.run')).toBe(RATE);
    expect(h.fetched).toEqual(['/audio/sfx/g.m4a']); // one fetch for the whole group
    expect(lib.pending('a.walk')).toBe(false);
    expect(lib.heldBytes()).toBeGreaterThan(0);
    lib.release('a.walk');
    lib.release('a.run');
    expect(lib.heldBytes()).toBe(RATE * 4); // only the bed is left (its own second of audio)
    lib.release('bed.test');
    expect(lib.heldBytes()).toBe(0);
    expect(lib.format).toBe('m4a');
  });

  it('falls back to the mp3 when the AAC will not decode, and gives up on a dead group', async () => {
    let tries = 0;
    const lib = new SampleLibrary('/x/', hooks({ decode: async () => { if (tries++ === 0) throw new Error('no aac'); return strip(3, [0.5, 1.5]); } }));
    expect(await lib.load('a.walk')).not.toBeNull();
    expect(lib.format).toBe('mp3');
    expect(await lib.load('lost.sound')).toBeNull();
    expect(lib.wants('lost.sound')).toBe(false);
    expect(lib.pending('lost.sound')).toBe(false);
  });

  it('wants nothing when the manifest cannot be fetched', async () => {
    const lib = new SampleLibrary('/x/', hooks({ fetchJson: async () => { throw new Error('offline'); } }));
    await lib.ready;
    expect(lib.wants('a.walk')).toBe(false);
    expect(lib.pending('a.walk')).toBe(false);
    expect(await lib.load('a.walk')).toBeNull();
  });
});

describe('recordings in the bank', () => {
  it('serves a recording at its own rate, keeps the stand-in away while loading, and falls back when it fails', async () => {
    const real = new Map<string, SampleManifest['sounds'][string]>();
    // Use real sound ids so the bank knows them: one that loads, one whose group is dead.
    real.set('step.stone.walk', { group: 'g', kind: 'oneshot', clips: [[0.5, 0.7], [1.5, 1.7]] });
    real.set('step.dirt.walk', { group: 'dead', kind: 'oneshot', clips: [[0.2, 0.4]] });
    const m: SampleManifest = { ...manifest, sounds: Object.fromEntries(real) };
    const lib = new SampleLibrary('/x/', hooks({ fetchJson: async () => m }));
    setSampleSource(lib);
    clearBank();
    expect(getVariants('step.stone.walk')).toBeNull(); // manifest not in yet: nothing to stand in
    const vars = await requestBake('step.stone.walk');
    expect(vars?.length).toBe(2);
    expect(bakeRate(SOUNDS.get('step.stone.walk')!)).toBe(RATE);
    // The dead group's sound is synthesised instead (5 variants, the bank's own rate).
    const synth = await requestBake('step.dirt.walk');
    expect(synth?.length).toBe(SOUNDS.get('step.dirt.walk')!.variants);
    expect(bakeRate(SOUNDS.get('step.dirt.walk')!)).toBe(SOUNDS.get('step.dirt.walk')!.rate ?? 32000);
    // A sound the manifest never mentions is synthesised too.
    expect((await requestBake('ui.click'))?.length).toBe(SOUNDS.get('ui.click')!.variants);
  });
});

describe('the shipped recordings', () => {
  const dir = new URL('../public/audio/sfx/', import.meta.url).pathname;
  const have = existsSync(dir + 'manifest.json');
  const shipped: SampleManifest | null = have ? JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')) : null;

  it.skipIf(!have)('names only sounds the bank defines, with files on disk and clips inside their strip', () => {
    for (const [id, e] of Object.entries(shipped!.sounds)) {
      expect(SOUNDS.has(id), `${id} is not a sound`).toBe(true);
      const o = resolveEntry(shipped!, id);
      expect(o, `${id} resolves`).not.toBeNull();
      const g = shipped!.groups[o!.entry.group!];
      for (const [a, b] of o!.entry.clips!) {
        expect(a).toBeGreaterThanOrEqual(0.1);
        expect(b).toBeGreaterThan(a);
        expect(b, `${id} inside ${o!.entry.group}`).toBeLessThanOrEqual(g.seconds + 0.01);
      }
      expect(SOUNDS.get(id)!.kind, `${id} kind`).toBe(e.kind ?? SOUNDS.get(o!.id)!.kind);
    }
    for (const g of Object.values(shipped!.groups)) {
      expect(existsSync(dir + g.m4a), g.m4a).toBe(true);
      expect(existsSync(dir + g.mp3), g.mp3).toBe(true);
    }
  });

  it.skipIf(!have)('has every footstep for every surface and gait, with 6 or more variants to rotate', () => {
    for (const s of SURFACES)
      for (const gait of GAITS) {
        const o = resolveEntry(shipped!, `step.${s}.${gait}`);
        expect(o, `step.${s}.${gait}`).not.toBeNull();
        expect(o!.entry.clips!.length, `${s} ${gait} variants`).toBeGreaterThanOrEqual(6);
      }
    for (const s of SURFACES) expect(resolveEntry(shipped!, `land.${s}`), `land.${s}`).not.toBeNull();
  });

  it.skipIf(!have)('keeps the whole set small enough to ship (under 25 MB, both formats)', () => {
    let bytes = 0;
    for (const g of Object.values(shipped!.groups)) {
      bytes += readFileSync(dir + g.m4a).byteLength + readFileSync(dir + g.mp3).byteLength;
    }
    expect(bytes).toBeLessThan(25 * 1048576);
  });
});

describe('the ground under a walker', () => {
  it('tells marble from cobbles, sand from gravel, and built floors from the terrain', () => {
    expect(groundSurface('paved', 0, 0.8, 0.1)).toBe('marble');
    expect(groundSurface('paved', 0, 0.1, 0.8)).toBe('cobbles');
    expect(groundSurface('sand', 0)).toBe('sand');
    expect(groundSurface('gravel', 0)).toBe('gravel');
    expect(groundSurface('grass', 0)).toBe('grass');
    expect(groundSurface('mud', 0.05)).toBe('dirt');
    expect(groundSurface('water', 0)).toBe('water');
    expect(groundSurface('rock', 0)).toBe('stone');
    expect(groundSurface('grass', 0.6)).toBe('stone'); // steps, a floor
    expect(groundSurface('grass', -3)).toBe('stone'); // an interior under the terrain
    expect(groundSurface(null, 0)).toBe('stone');
  });
});

describe('FootstepDriver with an animated avatar', () => {
  function rig(over: { gear?: 'none' | 'cloth' | 'armor'; surface?: string; near?: () => boolean; speed?: number } = {}) {
    const played: string[] = [];
    let looks = 0;
    const avatar: { onFootContact?: ((s: 'L' | 'R', g: string, k: number) => void) | null } = {};
    const src = {
      locomotionState: () => ({ speed: over.speed ?? 1.9, forwardSpeed: 0, strafeSpeed: 0, verticalSpeed: 0, grounded: true, sprinting: false, sneaking: false, turnRate: 0 }),
      position: { x: 0, y: 0, z: 0 },
      avatar,
    };
    const d = new FootstepDriver(src, (id) => played.push(id), {
      surfaceAt: () => {
        looks++;
        return (over.surface ?? 'cobbles') as never;
      },
      gear: over.gear ?? 'none',
      near: over.near,
    });
    return { d, played, avatar, looks: () => looks };
  }

  it('hooks the avatar, stops the speed cadence once contacts arrive, and takes the beat back if they stop', () => {
    const { d, played, avatar } = rig();
    d.update(1 / 60);
    expect(typeof avatar.onFootContact).toBe('function');
    avatar.onFootContact!('L', 'walk', 0.8);
    expect(played).toEqual(['step.cobbles.walk']);
    // Two seconds of walking without any contact event: no cadence steps while the animation owns the beat... for 1.2 s.
    played.length = 0;
    for (let t = 0; t < 1.0; t += 1 / 60) d.update(1 / 60);
    expect(played.length).toBe(0);
    for (let t = 0; t < 3; t += 1 / 60) d.update(1 / 60);
    expect(played.length).toBeGreaterThan(2); // the cadence took over again
    d.release();
    expect(avatar.onFootContact).toBeNull();
  });

  it('plays hobnails with armour on hard ground only, and looks the ground up at a low rate', () => {
    const hard = rig({ gear: 'armor', surface: 'cobbles' });
    for (let i = 0; i < 40; i++) hard.d.footPlant('run');
    expect(hard.played.filter((id) => id === 'gear.hobnail').length).toBeGreaterThan(20);
    expect(hard.looks()).toBeLessThanOrEqual(8); // one lookup serves several steps in the same place
    const soft = rig({ gear: 'armor', surface: 'grass' });
    for (let i = 0; i < 40; i++) soft.d.footPlant('run');
    expect(soft.played.includes('gear.hobnail')).toBe(false);
  });

  it('skips the ground lookup for steps nobody can hear', () => {
    const far = rig({ near: () => false });
    for (let i = 0; i < 10; i++) far.d.footPlant();
    expect(far.played.length).toBe(0);
    expect(far.looks()).toBe(0);
  });
});
