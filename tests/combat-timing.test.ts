/**
 * Timings (§6.1, §6.5, §6.15): attack phases by weapon speed, NPC telegraph minimums, and the
 * check that every avatar attack clip, played at the speed the combat system picks, lands its hit
 * frame exactly on the timeline's wind-up (wind-up ÷ weapon speed).
 */
import { describe, expect, it } from 'vitest';
import type { Stance } from '../src/actors/Actor';
import { actionInfo } from '../src/actors/avatar/anim/library';
import { clipFor } from '../src/combat/CombatCore';
import { attackLength, attackPhases, clipSpeedFor, TIMING } from '../src/combat/timing';
import { ITEMS } from '../src/rpg/data/items';

const melee = ITEMS.filter((i) => i.weapon && i.type === 'weapon' && !['bow', 'sling', 'thrown'].includes(i.weapon.class));

describe('attack phases', () => {
  it('a gladius (speed 1): wind-up 0.25, active 0.12, recovery 0.30 = 0.67 s; the player swings quicker (0.20 + 0.12 + 0.255)', () => {
    const n = attackPhases('light', 1, { npc: true, minWindup: 0 });
    expect(n.active).toBeCloseTo(0.12, 6);
    expect(n.recovery).toBeCloseTo(0.3, 6);
    const p = attackPhases('light', 1);
    expect(p.windup).toBeCloseTo(0.25 * TIMING.playerQuick.windup, 6);
    expect(p.recovery).toBeCloseTo(0.3 * TIMING.playerQuick.recovery, 6);
    expect(attackLength(p)).toBeCloseTo(0.2 + 0.12 + 0.255, 5);
  });

  it('every melee weapon: the player\'s hit frame is wind-up ÷ speed; NPCs never under the telegraph minimums', () => {
    for (const it of melee) {
      const s = it.weapon!.speed;
      expect(attackPhases('light', s).windup).toBeCloseTo((0.25 / s) * TIMING.playerQuick.windup, 6);
      expect(attackPhases('power', s).windup).toBeCloseTo(0.15 / s, 6);
      expect(attackPhases('light', s, { npc: true }).windup).toBeGreaterThanOrEqual(TIMING.npcMinWindup.light);
      expect(attackPhases('power', s, { npc: true }).windup).toBeGreaterThanOrEqual(TIMING.npcMinWindup.power);
    }
  });

  it('only the NPC wind-up is stretched; active and recovery keep the weapon timing', () => {
    const p = attackPhases('light', 1.3);
    const n = attackPhases('light', 1.3, { npc: true });
    expect(n.active).toBeCloseTo(p.active, 6);
    expect(n.recovery).toBeCloseTo(0.3 / 1.3, 6);
    expect(p.recovery).toBeCloseTo((0.3 / 1.3) * TIMING.playerQuick.recovery, 6);
    expect(n.windup).toBe(0.35);
  });

  it('bash 0.35 s, riposte 0.15 + 0.10 + 0.35, Nereus\' net twirl 0.8 s (and his follow-up ≥ 0.8)', () => {
    expect(attackLength(attackPhases('bash'))).toBeCloseTo(0.35, 6);
    const r = attackPhases('riposte', 1, { npc: true });
    expect([r.active, r.recovery]).toEqual([0.1, 0.35]);
    expect(attackPhases('riposte').windup).toBeCloseTo(0.15 * TIMING.playerQuick.windup, 6);
    expect(attackPhases('net', 1, { npc: true }).windup).toBe(0.8);
    expect(attackPhases('power', 0.9, { npc: true, minWindup: 0.8 }).windup).toBeGreaterThanOrEqual(0.8);
  });
});

describe('avatar clips land on the timeline (§6.15 check)', () => {
  const stances: Stance[] = ['unarmed', 'oneHand', 'oneHandShield', 'spear', 'spearShield', 'twoHand'];
  it('for every stance and attack clip, hit-at-speed equals the wind-up', () => {
    let checked = 0;
    for (const stance of stances) {
      for (const kind of ['light', 'power', 'bash', 'riposte', 'sprint'] as const) {
        for (const chain of [1, 2, 3]) {
          if (kind !== 'light' && chain > 1) continue;
          const clip = clipFor({ kind, chain });
          const info = actionInfo(stance, clip);
          if (!info?.hit) continue;
          for (const speed of [0.7, 1, 1.3]) {
            for (const npc of [false, true]) {
              const w = attackPhases(kind, speed, { npc }).windup;
              const v = clipSpeedFor(info.hit, w);
              // Inside the clamp the clip's hit time at this speed is the wind-up.
              if (v > 0.25 && v < 4) expect(info.hit / v).toBeCloseTo(w, 6);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('a held power attack resumes from its wind-up pose and still hits 0.15 s ÷ speed after release', () => {
    const info = actionInfo('oneHandShield', 'attackPower')!;
    const w = attackPhases('power', 1).windup;
    const from = info.windup!;
    const v = clipSpeedFor(info.hit, w, from);
    expect((info.hit! - from) / v).toBeCloseTo(w, 6);
  });
});
