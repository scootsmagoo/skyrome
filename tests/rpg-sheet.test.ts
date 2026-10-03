import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { RESOURCES, SKILL_CURVE } from '../src/rpg/data/balance';
import { CharacterSheetImpl, levelXpToNext, skillXpToNext } from '../src/rpg/sheet';
import { VitalsImpl } from '../src/rpg/vitals';
import { record } from './rpg-fakes';

function sheet() {
  const events = new EventBus<GameEvents>();
  return { s: new CharacterSheetImpl({ events }), events };
}

describe('XP curves', () => {
  it('skill XP needed grows like Skyrim (≈8 uses at 15, ≈54 at 50, ≈165 at 90)', () => {
    expect(skillXpToNext(15)).toBeCloseTo(7.9, 1);
    expect(skillXpToNext(50)).toBeGreaterThan(50);
    expect(skillXpToNext(50)).toBeLessThan(58);
    expect(skillXpToNext(90)).toBeGreaterThan(155);
    expect(skillXpToNext(90)).toBeLessThan(175);
    expect(skillXpToNext(15, 2)).toBeCloseTo(skillXpToNext(15) * 2);
  });

  it('character XP to next level is 75 + 25 L', () => {
    expect(levelXpToNext(1)).toBe(100);
    expect(levelXpToNext(10)).toBe(325);
  });
});

describe('skills and levels', () => {
  it('starts every skill at 15', () => {
    const { s } = sheet();
    expect(s.skillLevel('blades')).toBe(SKILL_CURVE.start);
    expect(s.skillLevel('religio')).toBe(SKILL_CURVE.start);
    expect(s.level).toBe(1);
  });

  it('use raises a skill, emits skill:levelup and grants character XP equal to the new level', () => {
    const { s, events } = sheet();
    const log = record(events, ['skill:levelup']);
    s.useSkill('blades', skillXpToNext(15) - 0.01);
    expect(s.skillLevel('blades')).toBe(15);
    expect(s.skillProgress('blades')).toBeGreaterThan(0.99);
    s.useSkill('blades', 0.02);
    expect(s.skillLevel('blades')).toBe(16);
    expect(log).toEqual([{ type: 'skill:levelup', e: { skill: 'blades', level: 16 } }]);
    expect(s.xp).toBe(16);
  });

  it('skill level-ups drive character levels, perk points and pending resource choices', () => {
    const { s, events } = sheet();
    const log = record(events, ['player:levelup']);
    // 15 → 30 grants 16+17+…+30 = 345 XP: level 1→2 at 100, 2→3 at +125, 3→4 needs +150 more.
    for (let i = 15; i < 30; i++) s.useSkill('blades', skillXpToNext(i) + 1e-6);
    expect(s.skillLevel('blades')).toBe(30);
    expect(s.level).toBe(3);
    expect(s.xp).toBeCloseTo(345 - 225, 3);
    expect(s.perkPoints).toBe(2);
    expect(s.pendingLevelUps).toBe(2);
    expect(log.map((l) => (l.e as { level: number }).level)).toEqual([2, 3]);
  });

  it('a level choice adds +10 to the chosen resource (max and current)', () => {
    const { s } = sheet();
    s.addXp(100);
    expect(s.level).toBe(2);
    s.vitals.damage(30);
    expect(s.chooseLevelUp('health')).toBe(true);
    expect(s.vitals.health.max).toBe(RESOURCES.base.health + 10);
    expect(s.vitals.health.current).toBe(80);
    expect(s.chooseLevelUp('stamina')).toBe(false);
  });

  it('caps skills at 100 and stops gaining', () => {
    const { s } = sheet();
    s.setSkill('sneak', 99);
    s.useSkill('sneak', 1e6);
    expect(s.skillLevel('sneak')).toBe(100);
    expect(s.skillProgress('sneak')).toBe(0);
  });

  it('xp.mult speeds up skill gain', () => {
    const { s } = sheet();
    s.setModifierSource('test', { 'xp.mult': 1 });
    s.useSkill('spear', skillXpToNext(15) / 2 + 0.01);
    expect(s.skillLevel('spear')).toBe(16);
  });

  it('raiseSkill (books, trainers) levels without a curve but still feeds character XP', () => {
    const { s } = sheet();
    s.raiseSkill('rhetoric', 2);
    expect(s.skillLevel('rhetoric')).toBe(17);
    expect(s.xp).toBe(16 + 17);
  });

  it('loseProgress zeroes the skills with most progress (jail)', () => {
    const { s } = sheet();
    s.useSkill('blades', 5);
    s.useSkill('sneak', 3);
    s.useSkill('spear', 1);
    expect(s.loseProgress(2)).toEqual(['blades', 'sneak']);
    expect(s.skillXp('blades')).toBe(0);
    expect(s.skillXp('spear')).toBeGreaterThan(0);
  });
});

describe('perks', () => {
  it('gates on points, skill level and prerequisite', () => {
    const { s } = sheet();
    expect(s.perkBlocker('blades.arm1')).toBe('points');
    s.grantPerkPoints(3);
    expect(s.canTakePerk('blades.arm1')).toBe(true);
    expect(s.perkBlocker('blades.arm2')).toBe('level'); // needs Blades 20
    s.setSkill('blades', 20);
    expect(s.perkBlocker('blades.arm2')).toBe('prerequisite');
    expect(s.takePerk('blades.arm1')).toBe(true);
    expect(s.takePerk('blades.arm1')).toBe(false);
    expect(s.perkBlocker('blades.arm1')).toBe('taken');
    expect(s.takePerk('blades.arm2')).toBe(true);
    expect(s.perkPoints).toBe(1);
    expect(s.perkBlocker('nope')).toBe('unknown');
  });

  it('perk modifiers and flags are summed and visible immediately', () => {
    const { s } = sheet();
    s.grantPerkPoints(5);
    s.setSkill('blades', 40);
    s.takePerk('blades.arm1');
    expect(s.modifier('damage.blades')).toBeCloseTo(0.2);
    s.takePerk('blades.arm2');
    s.takePerk('blades.punctim');
    expect(s.modifier('damage.blades')).toBeCloseTo(0.4);
    expect(s.modifier('damage.power')).toBeCloseTo(0.25);
    expect(s.hasFlag('blades.crit')).toBe(false);
  });

  it('flat .max modifiers change resource maxima (Pius: +25 pietas)', () => {
    const { s } = sheet();
    s.grantPerk('rel.devotion1');
    s.grantPerk('rel.pious');
    expect(s.vitals.pietas.max).toBe(RESOURCES.base.pietas + 25);
    expect(s.modifier('blessing.duration')).toBeCloseTo(0.5);
  });
});

describe('modifier sources', () => {
  it('adds and removes named sources (equipment)', () => {
    const { s } = sheet();
    s.setModifierSource('equip:neck', { 'health.max': 10, 'persuade.chance': 0.05 });
    expect(s.vitals.health.max).toBe(110);
    expect(s.modifier('persuade.chance')).toBeCloseTo(0.05);
    s.setModifierSource('equip:neck', null);
    expect(s.vitals.health.max).toBe(100);
    expect(s.modifier('persuade.chance')).toBe(0);
  });
});

describe('timed effects', () => {
  it('restore is instant; regen heals over its duration then expires', () => {
    const { s, events } = sheet();
    const log = record(events, ['effect:added', 'effect:expired']);
    s.vitals.damage(60);
    s.applyEffects('item:potio_minor', [{ kind: 'restore', target: 'health', amount: 25 }]);
    expect(s.vitals.health.current).toBe(65);
    s.vitals.inCombat = true; // keep natural regen tiny
    s.applyEffects('item:unguentum', [{ kind: 'regen', target: 'health', amount: 2, duration: 10 }]);
    for (let i = 0; i < 600; i++) s.tick(1 / 60);
    expect(s.vitals.health.current).toBeGreaterThan(65 + 19);
    expect(s.activeEffects.length).toBe(0);
    expect(log.map((l) => l.type)).toEqual(['effect:added', 'effect:expired']);
  });

  it('fortify raises the max while active and restores it after', () => {
    const { s } = sheet();
    s.applyEffects('item:embrocatio', [{ kind: 'fortify', target: 'stamina', amount: 25, duration: 5 }]);
    expect(s.vitals.stamina.max).toBe(125);
    expect(s.vitals.stamina.current).toBe(125);
    for (let i = 0; i < 6 * 60; i++) s.tick(1 / 60);
    expect(s.vitals.stamina.max).toBe(100);
    expect(s.vitals.stamina.current).toBe(100);
  });

  it('remedy magnitude scales amounts; same-source effects refresh rather than stack', () => {
    const { s } = sheet();
    s.applyEffects('item:wine', [{ kind: 'modifier', target: 'persuade.chance', amount: 0.1, duration: 60 }], { magnitude: 1.5 });
    expect(s.modifier('persuade.chance')).toBeCloseTo(0.15);
    s.applyEffects('item:wine', [{ kind: 'modifier', target: 'persuade.chance', amount: 0.1, duration: 60 }]);
    expect(s.modifier('persuade.chance')).toBeCloseTo(0.1);
  });

  it('poison damages over time and theriac cures it', () => {
    const { s } = sheet();
    s.applyCondition('aconitum');
    s.tick(1);
    expect(s.vitals.health.current).toBeLessThan(97);
    s.applyEffects('item:theriaca', [{ kind: 'cure', target: 'poison', amount: 1 }]);
    expect(s.activeEffects.length).toBe(0);
  });

  it('diseases last until cured, can be cured specifically, and Hale grants immunity', () => {
    const { s } = sheet();
    expect(s.applyCondition('febris')).toBe(true);
    expect(s.hasCondition('febris')).toBe(true);
    expect(s.vitals.health.max).toBe(85);
    for (let i = 0; i < 100; i++) s.tick(10);
    expect(s.hasCondition('febris')).toBe(true);
    s.applyCondition('lippitudo');
    s.cure('disease:lippitudo');
    expect(s.hasCondition('lippitudo')).toBe(false);
    expect(s.hasCondition('febris')).toBe(true);
    s.cure('disease');
    expect(s.hasCondition('febris')).toBe(false);
    expect(s.vitals.health.max).toBe(100);
    s.grantPerk('med.immune');
    expect(s.applyCondition('febris')).toBe(false);
  });

  it('one blessing at a time (two with Pontifex); Devotion extends duration', () => {
    const { s } = sheet();
    s.applyCondition('mars');
    s.applyCondition('venus');
    expect(s.hasCondition('mars')).toBe(false);
    expect(s.hasCondition('venus')).toBe(true);
    s.grantPerk('rel.pontifex');
    s.applyCondition('minerva');
    expect(s.hasCondition('venus')).toBe(true);
    expect(s.hasCondition('minerva')).toBe(true);
    s.grantPerk('rel.devotion1');
    s.applyCondition('vesta');
    const vesta = s.activeEffects.find((a) => a.source === 'blessing:vesta')!;
    expect(vesta.remaining).toBeCloseTo(8 * 60 * 1.5);
  });

  it('serializes effects including "until cured" ones', () => {
    const { s } = sheet();
    s.grantPerkPoints(2);
    s.takePerk('sneak.shadow1');
    s.useSkill('sneak', 3);
    s.applyCondition('febris');
    s.applyCondition('mars');
    s.vitals.damage(20);
    const json = JSON.parse(JSON.stringify(s.serialize()));
    const t = new CharacterSheetImpl();
    t.restore(json);
    expect(t.hasCondition('febris')).toBe(true);
    expect(t.activeEffects.find((a) => a.source === 'disease:febris')!.remaining).toBe(Infinity);
    expect(t.hasCondition('mars')).toBe(true);
    expect(t.perks.has('sneak.shadow1')).toBe(true);
    expect(t.perkPoints).toBe(1);
    expect(t.skillXp('sneak')).toBeCloseTo(s.skillXp('sneak'));
    expect(t.vitals.health.max).toBe(85);
    expect(t.vitals.health.current).toBeCloseTo(s.vitals.health.current);
    expect(t.serialize()).toEqual(s.serialize());
  });
});

describe('vitals', () => {
  it('spend fails without enough, drain takes what there is, regen waits after spending', () => {
    const v = new VitalsImpl({ health: 100, stamina: 50, pietas: 20 });
    expect(v.spend('stamina', 60)).toBe(false);
    expect(v.stamina.current).toBe(50);
    expect(v.spend('stamina', 30)).toBe(true);
    expect(v.drain('stamina', 40)).toBe(20);
    expect(v.stamina.current).toBe(0);
    v.tick(1); // still delayed (1.2 s)
    expect(v.stamina.current).toBe(0);
    v.tick(0.5);
    v.tick(1);
    expect(v.stamina.current).toBeGreaterThan(0);
  });

  it('dies at zero, reports damage actually dealt, revives full', () => {
    let died = 0;
    const v = new VitalsImpl({ health: 30, onDeath: () => died++ });
    expect(v.damage(20, 'thug')).toBe(20);
    expect(v.damage(50)).toBe(10);
    expect(v.dead).toBe(true);
    expect(died).toBe(1);
    expect(v.damage(5)).toBe(0);
    v.restore('health', 10);
    expect(v.health.current).toBe(0);
    v.revive();
    expect(v.health.current).toBe(30);
    expect(v.dead).toBe(false);
  });

  it('regenerates slower in combat', () => {
    const a = new VitalsImpl({ health: 100 });
    const b = new VitalsImpl({ health: 100 });
    a.damage(50);
    b.damage(50);
    b.inCombat = true;
    a.tick(10);
    b.tick(10);
    expect(a.health.current - 50).toBeGreaterThan((b.health.current - 50) * 2);
  });
});
