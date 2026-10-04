import { describe, expect, it } from 'vitest';
import { closestOnLane } from '../src/ai/life/lanes';
import * as atlas from '../src/data/atlas';
import { crowdBudget, crowdTarget, dayPhase, NIGHT_CAP, roleWeights } from '../src/npc/crowd/budget';
import { atlasLanes } from '../src/npc/crowd/atlasLanes';
import { districtAt } from '../src/npc/crowd/districts';
import { CROWD_ROLES } from '../src/npc/crowd/roles';
import { activeStations, memberHeading, STATIONS, stationAnchor, stationPoint } from '../src/npc/crowd/stations';
import { ARCHETYPES, isOut, sunTimes } from '../src/npc/schedules';
import { toGame } from '../src/world/coords';

const sun = sunTimes({ year: 113, month: 4, day: 11 });
const [capX, capZ] = toGame(507, 955);
// The new-game spawn: 16 game m outside the gate along its facade normal (GameFlow.spawnPoint).
const th = (140 * Math.PI) / 180;
const spawn = { x: capX + Math.sin(th) * 16, z: capZ - Math.cos(th) * 16 };

describe('stations', () => {
  it('all resolve to a place in Rome with valid roles', () => {
    for (const s of STATIONS) {
      expect(stationAnchor(s), s.id).not.toBeNull();
      for (const m of s.members) expect(CROWD_ROLES[m.role], `${s.id} ${m.role}`).toBeDefined();
      if (s.landmark) expect(atlas.LANDMARK_BY_ID[s.landmark]).toBeDefined();
      expect(s.when.length).toBeGreaterThan(0);
    }
  });

  it('mans the Porta Capena at 04:30: the vigiles post, the cart stand and the farmers', () => {
    const phase = dayPhase(4.5, sun);
    expect(phase).toBe('predawn');
    const ids = activeStations(spawn.x, spawn.z, phase, 85).map((s) => s.id);
    expect(ids).toContain('st-capena-vigiles');
    expect(ids).toContain('st-capena-carts');
    expect(ids).toContain('st-capena-farmers');
    // The customs post opens at sunrise.
    expect(ids).not.toContain('st-capena-portitor');
    expect(activeStations(spawn.x, spawn.z, dayPhase(9, sun), 85).map((s) => s.id)).toContain('st-capena-portitor');
    // Vigiles carry lanterns and stand by a brazier.
    const vig = STATIONS.find((s) => s.id === 'st-capena-vigiles')!;
    expect(vig.members.some((m) => m.role === 'vigil' && m.prop === 'lantern')).toBe(true);
    expect(vig.dressing?.some((d) => d.kind === 'brazier')).toBe(true);
  });

  it('keeps the Via Appia and the gate passage clear at the Porta Capena', () => {
    const lanes = atlasLanes();
    const road = lanes.lanes.filter((l) => l.id === 'via-appia' || l.id === 'conn-capena-intra');
    for (const s of STATIONS.filter((x) => x.id.startsWith('st-capena'))) {
      const a = stationAnchor(s)!;
      const pts = [...s.members.map((m) => stationPoint(a, m.out, m.side)), ...(s.dressing ?? []).map((d) => stationPoint(a, d.out, d.side))];
      for (const p of pts) {
        const d = Math.min(...road.map((l) => closestOnLane(l, p.x, p.z).d));
        expect(d, `${s.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeGreaterThan(2.6);
        // Not inside the gate itself (13 × 11 real m → about 4 m from its centre).
        expect(Math.hypot(p.x - capX, p.z - capZ)).toBeGreaterThan(4.5);
      }
    }
  });

  it('turns people toward their brazier or stall', () => {
    const s = STATIONS.find((x) => x.id === 'st-capena-vigiles')!;
    const a = stationAnchor(s)!;
    const m = s.members.find((x) => x.face === 'center')!;
    const h = memberHeading(a, s, m);
    const p = stationPoint(a, m.out, m.side);
    const b = stationPoint(a, s.dressing![0].out, s.dressing![0].side);
    const toB = Math.atan2(b.x - p.x, b.z - p.z);
    expect(Math.abs(Math.atan2(Math.sin(h - toB), Math.cos(h - toB)))).toBeLessThan(1e-6);
  });

  it('puts stalls along the whole golden path by day', () => {
    const day = activeStations(0, 0, 'morning', 1e9).map((s) => s.id);
    for (const id of ['st-circus-popina', 'st-circus-sortilega', 'st-tuscus-vestarius', 'st-forum-argentarii', 'st-capena-portitor']) expect(day).toContain(id);
  });
});

describe('the gate crowd', () => {
  it('has its own district at the spawn: travellers and farmers before dawn', () => {
    const d = districtAt(spawn.x, spawn.z);
    expect(d.id).toBe('dist-porta-capena');
    const w = roleWeights(d, 4.5, sun).map(([r]) => r);
    expect(w).toContain('farmer');
    expect(w).toContain('traveller');
    expect(w).toContain('porter');
    // Citizens and shopkeepers are still in bed.
    expect(w).not.toContain('citizen');
    expect(w).not.toContain('merchant');
  });

  it('farmers go home by mid-afternoon; travellers are on the road all day', () => {
    expect(isOut('rusticus', 4.5, sun)).toBe(true);
    expect(isOut('rusticus', 9, sun)).toBe(true);
    expect(isOut('rusticus', 17, sun)).toBe(false);
    expect(isOut('viator', 14, sun)).toBe(true);
    expect(ARCHETYPES.viator.length).toBeGreaterThan(2);
  });

  it('counts the station people toward the ≤ 25 night cap (AC-10)', () => {
    for (const h of [23, 2, 4.5]) {
      const b = crowdBudget(h, sun, 1.4, 2);
      for (const st of [0, 6, 10]) {
        const t = crowdTarget(b, 96, st);
        expect(t + b.vigiles + st).toBeLessThanOrEqual(NIGHT_CAP + 2);
      }
    }
    // By day the cap is the hard limit only.
    const day = crowdBudget(9, sun, 1.4);
    expect(crowdTarget(day, 96, 10)).toBe(Math.min(96, day.citizens));
    expect(crowdTarget(day, 40, 0)).toBe(40);
  });
});
