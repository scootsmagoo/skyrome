import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import type { Game } from '../src/core/Game';
import { FirstStepsGuide, GUIDE_ID, GUIDE_REACH, GUIDE_STEPS, advanceGuide, guideStepOf, guideWaypoint, withGuide } from '../src/game/guide';
import type { QuestLogView, QuestView } from '../src/ui/types';
import type { UIManager } from '../src/ui/UIManager';
import { romanHour } from '../src/ui/format';
import { ROME_LATITUDE, julianDayForGame, solarDeclination, sunriseSunset } from '../src/world/sky/astronomy';

const N = GUIDE_STEPS.reduce((n, s) => n + s.points.length, 0);

describe('the first-steps guide route (GDD §17.2)', () => {
  it('advances waypoint by waypoint, and shortcuts count', () => {
    expect(advanceGuide(0, 298, 565)).toBe(0); // at the gate
    expect(advanceGuide(0, 249, 503)).toBe(1); // the Circus valley
    expect(guideStepOf(1)).toBe(1);
    const last = guideWaypoint(N - 1)!;
    expect(advanceGuide(1, last.x + GUIDE_REACH / 2, last.z)).toBe(N); // straight to the Milestone
    expect(guideStepOf(N)).toBe(GUIDE_STEPS.length);
    expect(guideWaypoint(N)).toBeNull();
  });

  it('ends at the Golden Milestone in the Forum', () => {
    const last = guideWaypoint(N - 1)!;
    expect(Math.hypot(last.x, last.z)).toBeLessThan(GUIDE_REACH); // the Miliarium Aureum is the origin
  });
});

function guideRig() {
  const events = new EventBus<GameEvents>();
  const player = { position: { x: 298, y: 0, z: 565 } };
  const game = { events, player } as unknown as Game;
  const notes: string[] = [];
  const ui = { notify: (t: string) => notes.push(t) } as unknown as UIManager;
  const env = { playing: true, tracked: false, main: false };
  const guide = new FirstStepsGuide(game, ui, () => env.playing, () => env.tracked, () => env.main);
  const walk = (x: number, z: number) => {
    player.position.x = x;
    player.position.z = z;
    guide.update(0.3);
  };
  return { guide, walk, notes, env, events };
}

describe('the first-steps guide', () => {
  it('is a tracked journal entry pointing at the next waypoint', () => {
    const { guide } = guideRig();
    const v = guide.view()!;
    expect(v.id).toBe(GUIDE_ID);
    expect(v.state).toBe('active');
    expect(v.tracked).toBe(true);
    const target = v.objectives.find((o) => !o.done)?.target;
    expect(target).toEqual({ kind: 'point', x: 249, y: 0, z: 503 });
  });

  it('clears waypoints on arrival and completes in the Forum', () => {
    const { guide, walk, notes } = guideRig();
    walk(249, 503);
    expect(notes).toContain(`Completed: ${GUIDE_STEPS[0].text}`);
    expect(guide.view()!.objectives[0].done).toBe(true);
    for (const s of GUIDE_STEPS.slice(1)) for (const [x, z] of s.points) walk(x, z);
    expect(guide.done).toBe(true);
    expect(guide.view()!.state).toBe('completed');
    expect(guide.view()!.tracked).toBe(false);
  });

  it('does nothing outside a game, steps aside for a tracked quest and retires for the main quest', () => {
    const { guide, walk, env } = guideRig();
    env.playing = false;
    walk(249, 503);
    expect(guide.state.index).toBe(0);
    env.playing = true;
    env.tracked = true;
    expect(guide.view()!.tracked).toBe(false);
    env.tracked = false;
    expect(guide.view()!.tracked).toBe(true);
    env.main = true;
    walk(249, 503);
    expect(guide.view()).toBeNull();
  });

  it('joins the journal first and routes its tracking', () => {
    const { guide } = guideRig();
    let tracked: string | null = 'misc-1';
    const quest = (id: string): QuestView => ({ id, title: id, category: 'misc', summary: '', state: 'active', tracked: tracked === id, entries: [], objectives: [] });
    const log: QuestLogView = { quests: () => [quest('misc-1')], setTracked: (id, t) => (tracked = t ? id : null), notes: () => [] };
    const merged = withGuide(log, guide);
    expect(merged.quests().map((q) => q.id)).toEqual([GUIDE_ID, 'misc-1']);
    merged.setTracked(GUIDE_ID, true);
    expect(tracked).toBeNull(); // following the guide again: the other quest steps aside
    merged.setTracked(GUIDE_ID, false);
    expect(guide.state.tracked).toBe(false);
  });
});

describe('Roman hours follow the real sunrise (GDD §2.1)', () => {
  const may11 = sunriseSunset(solarDeclination(julianDayForGame(113, 4, 11, 12)), ROME_LATITUDE, 0)!;

  it('sunrise ≈ 04:54 and sunset ≈ 19:06 on 11 May 113', () => {
    expect(may11.rise).toBeCloseTo(4.9, 1);
    expect(may11.set).toBeCloseTo(19.1, 1);
  });

  it('daylight at 05:00 is the first hour, not the fourth watch; noon ends the sixth hour', () => {
    expect(romanHour(4.5, may11).latin).toBe('Quarta vigilia');
    expect(romanHour(5.0, may11).latin).toBe('Hora prima');
    expect(romanHour(5.5, may11).latin).toBe('Hora prima');
    expect(romanHour(11.95, may11).latin).toBe('Hora sexta');
    expect(romanHour(12.05, may11).latin).toBe('Hora septima');
    expect(romanHour(18.9, may11).latin).toBe('Hora duodecima');
    expect(romanHour(19.3, may11).latin).toBe('Prima vigilia');
    expect(romanHour(0.1, may11).latin).toBe('Tertia vigilia');
  });
});
