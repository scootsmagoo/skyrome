import { describe, expect, it } from 'vitest';
import { bridgeFloor, categorySpace, flowMusic, interiorFloor, interiorReverb, landmarkFloor, lemuriaMusic, nearSegment } from '../src/audio/places';
import { REVERBS, impulseResponse } from '../src/audio/dsp/reverb';
import { MUSIC_STATES, STYLES } from '../src/audio/music/styles';
import { Composer } from '../src/audio/music/composer';
import { footstepSurface, groundSurface, isWading } from '../src/game/audio';

describe('wading', () => {
  it('shallow water over the bed splashes; dry land and swimming depth do not', () => {
    expect(isWading(0.3, 0)).toBe(true);
    expect(isWading(0.9, 0.1)).toBe(true);
    expect(isWading(-Infinity, 0)).toBe(false);
    expect(isWading(0.01, 0)).toBe(false);
    expect(isWading(2, 0)).toBe(false);
    // Standing on a quay or a deck above the water is not wading.
    expect(isWading(0.5, 1.2)).toBe(false);
  });
});

describe('floors by place', () => {
  it('temples, basilicas and baths are marble; store-rooms and huts are boards', () => {
    expect(landmarkFloor('temple', 'temple-saturn', false)).toBe('marble');
    expect(landmarkFloor('basilica', 'basilica-julia', false)).toBe('marble');
    expect(landmarkFloor('baths', 'baths-titus', false)).toBe('marble');
    expect(landmarkFloor('warehouse', 'horrea-agrippiana', false)).toBe('wood');
    expect(landmarkFloor('house', 'casa-romuli', false)).toBe('wood');
  });
  it('a raised floor in a house, market or camp is boards; at ground level the terrain decides', () => {
    expect(landmarkFloor('house', 'domus-plinii', true)).toBe('wood');
    expect(landmarkFloor('market', 'markets-trajan', true)).toBe('wood');
    expect(landmarkFloor('house', 'domus-plinii', false)).toBeNull();
    expect(landmarkFloor('forum', 'forum-romanum', true)).toBeNull();
  });
  it('bridges: a timber trestle is boards, a masonry bridge is paved with setts', () => {
    expect(bridgeFloor(0)).toBe('wood');
    expect(bridgeFloor(6)).toBe('cobbles');
  });
  it('the deck test measures to the segment, not the line', () => {
    expect(nearSegment(5, 1, 0, 0, 10, 0, 2)).toBe(true);
    expect(nearSegment(5, 3, 0, 0, 10, 0, 2)).toBe(false);
    expect(nearSegment(13, 0, 0, 0, 10, 0, 2)).toBe(false);
    expect(nearSegment(11, 1, 0, 0, 10, 0, 2)).toBe(true);
    expect(nearSegment(1, 1, 3, 3, 3, 3, 3)).toBe(true);
  });
  it('the Column: its stair is stone, its summit platform marble', () => {
    expect(interiorFloor('dun-columna')).toBe('stone');
    expect(interiorFloor('columna-summa')).toBe('marble');
    expect(interiorReverb('dun-columna')).toBe('stair');
    expect(interiorReverb('columna-summa')).toBeNull();
  });
  it('the terrain rules stay as they were outside the built places', () => {
    expect(footstepSurface('paved', 0)).toBe('stone');
    expect(groundSurface('paved', 0, 1, 0)).toBe('marble');
    expect(groundSurface('paved', 0, 0, 1)).toBe('cobbles');
  });
});

describe('rooms', () => {
  it('a cella has the temple tone and brings the temple music, unless the temples are shut', () => {
    expect(categorySpace('temple', 'temple-saturn', 900)).toEqual({ reverb: 'temple', music: 'temple' });
    expect(categorySpace('temple', 'temple-saturn', 900, true)).toEqual({ reverb: 'temple', music: null });
  });
  it('precincts around open courts have no cella tone', () => {
    expect(categorySpace('temple', 'temple-divus-claudius', 36000)).toBeNull();
    expect(categorySpace('temple', 'iseum-campense', 15400)).toBeNull();
  });
  it('halls, baths, cells and the arena each have their own space', () => {
    expect(categorySpace('basilica', 'basilica-julia', 5000)?.reverb).toBe('hall');
    expect(categorySpace('baths', 'baths-titus', 12600)?.reverb).toBe('baths');
    expect(categorySpace('prison', 'carcer-tullianum', 130)?.reverb).toBe('cave');
    expect(categorySpace('amphitheatre', 'colosseum', 23000)?.reverb).toBe('arena');
    expect(categorySpace('arch', 'arch-titus', 100)).toBeNull();
  });
  it('every space is a reverb the engine can render', () => {
    for (const cat of ['temple', 'basilica', 'baths', 'prison', 'amphitheatre']) {
      const sp = categorySpace(cat, 'x', 1000);
      expect(sp && REVERBS[sp.reverb]).toBeTruthy();
    }
    expect(REVERBS.stair).toBeTruthy();
  });
});

describe('music moments', () => {
  it('the title and the character stage play Seikilos; the game plays the world music', () => {
    expect(flowMusic('title')).toBe('seikilos');
    expect(flowMusic('creation')).toBe('seikilos');
    expect(flowMusic('playing')).toBe('explore');
    expect(flowMusic('spawning')).toBe('explore');
    expect(flowMusic(undefined)).toBe('explore');
  });
  it('the Lemuria night plays Seikilos; the Lemuria by day does not', () => {
    expect(lemuriaMusic(['fest-lemuria'], true)).toBe('seikilos');
    expect(lemuriaMusic(['fest-lemuria'], false)).toBeNull();
    expect(lemuriaMusic(['fest-parilia'], true)).toBeNull();
  });
  it('the seikilos state opens with the tune itself, not a silence', () => {
    const c = new Composer('seikilos', 'title');
    const first = c.next();
    expect(first.info.phrase).toBe('seikilos');
    expect(first.events.some((e) => e.part === 'lyre')).toBe(true);
  });
  it('every state has a level in (0, 1]', () => {
    for (const s of MUSIC_STATES) if (s !== 'silence') expect(STYLES[s].level).toBeGreaterThan(0), expect(STYLES[s].level).toBeLessThanOrEqual(1);
  });
});

/** Time for the backward-integrated energy decay to fall from -5 to -25 dB, times three (a T20 estimate of the T60). */
function t20(l: Float32Array, rate: number): number {
  const e = new Float64Array(l.length);
  let acc = 0;
  for (let i = l.length - 1; i >= 0; i--) {
    acc += l[i] * l[i];
    e[i] = acc;
  }
  const db = (i: number) => 10 * Math.log10(e[i] / e[0] + 1e-30);
  let a = 0;
  let b = 0;
  for (let i = 0; i < l.length; i++) {
    if (!a && db(i) < -5) a = i;
    if (!b && db(i) < -25) {
      b = i;
      break;
    }
  }
  return ((b - a) / rate) * 3;
}

describe('reverb spaces', () => {
  for (const [name, spec] of Object.entries(REVERBS)) {
    it(`${name}: measured decay is the preset's t60 (within 30%)`, () => {
      const [l] = impulseResponse(spec, 24000);
      const t = t20(l, 24000);
      expect(t).toBeGreaterThan(spec.t60 * 0.7);
      expect(t).toBeLessThan(spec.t60 * 1.3);
    });
  }
  it('the stair rings shorter than the arena, which rings shorter than a hall', () => {
    expect(REVERBS.stair.t60).toBeLessThan(REVERBS.arena.t60);
    expect(REVERBS.arena.t60).toBeLessThan(REVERBS.hall.t60);
  });
  it('the arena throws back a late echo that its early field does not have', () => {
    const [l] = impulseResponse(REVERBS.arena, 24000);
    const around = (t: number, w = 0.012) => {
      let m = 0;
      for (let i = Math.round((t - w) * 24000); i < Math.round((t + w) * 24000); i++) m = Math.max(m, Math.abs(l[i]));
      return m;
    };
    expect(around(0.19)).toBeGreaterThan(around(0.28) * 1.3);
  });
});
