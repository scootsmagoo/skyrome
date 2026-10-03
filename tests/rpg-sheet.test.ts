import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { DEVOTION, RESOURCES, SKILL_CURVE } from '../src/rpg/data/tuning';
import { CharacterSheetImpl, levelXpToNext, skillXpToNext } from '../src/rpg/sheet';
import { VitalsImpl } from '../src/rpg/vitals';
import { record } from './rpg-fakes';

function sheet() {
  const events = new EventBus<GameEvents>();
  return { s: new CharacterSheetImpl({ events }), events };
}

describe('XP curves (GDD §5.2–5.3)', () => {
  it('skill XP to next = round(difficulty × (L + 5)^1.5)', () => {
    expect([10, 15, 20, 30, 50, 75, 99].map((l) => skillXpToNext(l))).toEqual([58, 89, 125, 207, 408, 716, 1061]);
    expect(skillXpToNext(10, 1.2)).toBe(70);
    expect(skillXpToNext(10, 0.8)).toBe(46);
  });

  it('character XP to next level is 25 × (n + 2)', () => {
    expect(levelXpToNext(1)).toBe(75);
    expect(levelXpToNext(2)).toBe(100);
    expect(levelXpToNext(10)).toBe(300);
  });
});

describe('skills and levels', () => {
  it('starts all 17 skills at 10, pietas half full', () => {
    const { s } = sheet();
    expect(SKILL_CURVE.start).toBe(10);
    expect(s.skillLevel('blades')).toBe(10);
    expect(s.skillLevel('religio')).toBe(10);
    expect(s.skillDefsList().length).toBe(17);
    expect(s.level).toBe(1);
    expect(s.vitals.pietas).toEqual({ current: 25, max: 50 });
    expect(s.vitals.health.max).toBe(100);
  });

  it('use raises a skill, emits skill:levelup and grants character XP equal to the new level', () => {
    const { s, events } = sheet();
    const log = record(events, ['skill:levelup']);
    s.useSkill('blades', 57.99);
    expect(s.skillLevel('blades')).toBe(10);
    expect(s.skillProgress('blades')).toBeGreaterThan(0.99);
    s.useSkill('blades', 0.02);
    expect(s.skillLevel('blades')).toBe(11);
    expect(log).toEqual([{ type: 'skill:levelup', e: { skill: 'blades', level: 11 } }]);
    expect(s.xp).toBe(11);
  });

  it('harder skills need more XP (Pickpocket ×1.2, Athletics ×0.8)', () => {
    const { s } = sheet();
    s.useSkill('pickpocket', 69);
    expect(s.skillLevel('pickpocket')).toBe(10);
    s.useSkill('pickpocket', 1.01);
    expect(s.skillLevel('pickpocket')).toBe(11);
    s.useSkill('athletics', 46);
    expect(s.skillLevel('athletics')).toBe(11);
  });

  it('skill level-ups drive character levels, perk points, pending choices and +0.2 governing pool', () => {
    const { s, events } = sheet();
    const log = record(events, ['player:levelup']);
    // 10 → 30 grants 11+12+…+30 = 410 XP: levels at 75, +100, +125 (300 total); 110 toward the 150 for level 5.
    for (let i = 10; i < 30; i++) s.useSkill('blades', skillXpToNext(i) + 1e-6);
    expect(s.skillLevel('blades')).toBe(30);
    expect(s.level).toBe(4);
    expect(s.xp).toBeCloseTo(110, 3);
    expect(s.perkPoints).toBe(3);
    expect(s.pendingLevelUps).toBe(3);
    expect(log.map((l) => (l.e as { level: number }).level)).toEqual([2, 3, 4]);
    expect(s.vitals.health.max).toBeCloseTo(104); // Blades governs health
  });

  it('a level choice adds +10 to the chosen pool (max and current); stamina also adds 5 kg carry', () => {
    const { s } = sheet();
    s.addXp(75);
    expect(s.level).toBe(2);
    s.vitals.damage(30);
    expect(s.chooseLevelUp('health')).toBe(true);
    expect(s.vitals.health.max).toBe(RESOURCES.base.health + 10);
    expect(s.vitals.health.current).toBe(80);
    expect(s.chooseLevelUp('stamina')).toBe(false);
    expect(s.carryCapacity()).toBe(50);
    s.addXp(100);
    s.chooseLevelUp('stamina');
    expect(s.carryCapacity()).toBe(55);
    expect(s.levelPicks()).toEqual({ health: 1, stamina: 1, pietas: 0 });
  });

  it('caps skills at 100 and stops gaining', () => {
    const { s } = sheet();
    s.setSkill('stealth', 99);
    s.useSkill('stealth', 1e6);
    expect(s.skillLevel('stealth')).toBe(100);
    expect(s.skillProgress('stealth')).toBe(0);
  });

  it('xp.mult speeds up skill gain; an xp.<skill> flag (Minerva, the freedman) adds 10% to that skill', () => {
    const { s } = sheet();
    s.setModifierSource('test', { 'xp.mult': 1 });
    s.useSkill('spear', 29.01);
    expect(s.skillLevel('spear')).toBe(11);
    const b = sheet().s;
    b.setFlagSource('patron', ['xp.fabrica']);
    b.useSkill('fabrica', 1);
    b.useSkill('medicina', 1);
    expect(b.skillXp('fabrica')).toBeCloseTo(1.1);
    expect(b.skillXp('medicina')).toBeCloseTo(1);
  });

  it('training dummies give half XP and nothing from level 30', () => {
    const { s } = sheet();
    s.useSkill('blades', 10, { dummy: true });
    expect(s.skillXp('blades')).toBe(5);
    s.setSkill('blades', 30);
    s.useSkill('blades', 10, { dummy: true });
    expect(s.skillXp('blades')).toBe(0);
  });

  it('raiseSkill (books, trainers) levels without a curve but still feeds character XP', () => {
    const { s } = sheet();
    s.raiseSkill('rhetoric', 2);
    expect(s.skillLevel('rhetoric')).toBe(12);
    expect(s.xp).toBe(11 + 12);
  });

  it('loseProgress zeroes progress (never levels): the most progress, or random skills with an rng (the Carcer)', () => {
    const { s } = sheet();
    s.useSkill('blades', 5);
    s.useSkill('stealth', 3);
    s.useSkill('spear', 1);
    expect(s.loseProgress(2)).toEqual(['blades', 'stealth']);
    expect(s.skillXp('blades')).toBe(0);
    expect(s.skillXp('spear')).toBeGreaterThan(0);
    s.useSkill('blades', 5);
    expect(s.loseProgress(1, { next: () => 0.99 })).toEqual(['spear']);
    expect(s.skillLevel('spear')).toBe(10);
    expect(s.loseProgress(5, { next: () => 0 })).toEqual(['blades']);
  });

  it('trainers: cost round(0.15 L² + 10), five lessons per level, caps 40/70/90 by grade', () => {
    const { s } = sheet();
    expect(s.trainingCost('blades')).toBe(25);
    s.setSkill('blades', 40);
    expect(s.trainingCost('blades')).toBe(250);
    expect(s.trainingBlocker('blades', 'common')).toBe('cap');
    expect(s.trainingBlocker('blades', 'expert')).toBeNull();
    expect(s.trainingBlocker('nope', 'master')).toBe('unknown');
    for (let i = 0; i < 5; i++) expect(s.train('shield', 'common')).toBe(true);
    expect(s.skillLevel('shield')).toBe(15);
    expect(s.trainingBlocker('shield', 'common')).toBe('lessons');
    expect(s.train('shield', 'common')).toBe(false);
    s.addXp(1000);
    expect(s.train('shield', 'common')).toBe(true);
  });
});

describe('perks (GDD §5.5)', () => {
  it('gates on skill level and points; ids are perk-…', () => {
    const { s } = sheet();
    expect(s.perkBlocker('perk-blades-punctim')).toBe('level'); // needs Blades 20
    s.setSkill('blades', 20);
    expect(s.perkBlocker('perk-blades-punctim')).toBe('points');
    s.grantPerkPoints(1);
    expect(s.canTakePerk('perk-blades-punctim')).toBe(true);
    expect(s.takePerk('perk-blades-punctim')).toBe(true);
    expect(s.takePerk('perk-blades-punctim')).toBe(false);
    expect(s.perkBlocker('perk-blades-punctim')).toBe('taken');
    expect(s.perkPoints).toBe(0);
    expect(s.perkBlocker('nope')).toBe('unknown');
  });

  it('a taken perk is a flag, and its modifiers apply immediately', () => {
    const { s } = sheet();
    s.grantPerk('perk-brawling-caestus');
    expect(s.hasFlag('perk-brawling-caestus')).toBe(true);
    expect(s.modifier('damage.unarmed')).toBeCloseTo(0.5);
    s.grantPerk('perk-religio-pax-deorum');
    expect(s.vitals.pietas.max).toBe(RESOURCES.base.pietas + 25);
  });

  it('every skill has four perks at rising levels', () => {
    const { s } = sheet();
    for (const sk of s.skillDefsList()) {
      const levels = s.perkDefsList().filter((p) => p.skill === sk.id).map((p) => p.requiresLevel);
      expect(levels.length, sk.id).toBe(4);
      expect([...levels].sort((a, b) => a - b), sk.id).toEqual(levels);
    }
    expect(s.perkDefsList().every((p) => p.id.startsWith('perk-'))).toBe(true);
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

describe('timed effects and conditions', () => {
  it('restore is instant; regen heals over its duration then expires', () => {
    const { s, events } = sheet();
    const log = record(events, ['effect:added', 'effect:expired']);
    s.vitals.damage(60);
    s.applyEffects('item:panis', [{ kind: 'restore', target: 'health', amount: 25 }]);
    expect(s.vitals.health.current).toBe(65);
    s.vitals.inCombat = true; // no natural health regen
    s.applyEffects('item:emplastrum', [{ kind: 'regen', target: 'health', amount: 2, duration: 10 }]);
    for (let i = 0; i < 660; i++) s.tick(1 / 60);
    expect(s.vitals.health.current).toBeCloseTo(85);
    expect(s.activeEffects.length).toBe(0);
    expect(log.map((l) => l.type)).toEqual(['effect:added', 'effect:expired']);
  });

  it('fortify raises a pool max while active and restores it after', () => {
    const { s } = sheet();
    s.applyEffects('item:mulsum', [{ kind: 'fortify', target: 'stamina', amount: 25, duration: 5 }]);
    expect(s.vitals.stamina.max).toBe(125);
    expect(s.vitals.stamina.current).toBe(125);
    for (let i = 0; i < 6 * 60; i++) s.tick(1 / 60);
    expect(s.vitals.stamina.max).toBe(100);
    expect(s.vitals.stamina.current).toBe(100);
  });

  it('fortify on a skill raises it temporarily (Falernian +5 Rhetoric)', () => {
    const { s } = sheet();
    s.applyEffects('item:vinum-falernum', [{ kind: 'fortify', target: 'rhetoric', amount: 5, duration: 60 }]);
    expect(s.skillLevel('rhetoric')).toBe(15);
    expect(s.baseSkillLevel('rhetoric')).toBe(10);
    s.applyEffects('test:speech', [{ kind: 'fortify', target: 'rhetoric', amount: 10, duration: 120 }]);
    expect(s.skillLevel('rhetoric')).toBe(25);
    s.tick(61);
    expect(s.skillLevel('rhetoric')).toBe(20);
  });

  it('percent effects scale with the pool: injured −20% max health for a game day; Salus heals 50% over 10 s', () => {
    const { s } = sheet();
    s.vitals.inCombat = true;
    s.chooseLevelUp('health'); // no pending level: ignored
    s.applyCondition('injured');
    expect(s.vitals.health.max).toBeCloseTo(80);
    s.cure('injury:injured');
    expect(s.vitals.health.max).toBe(100);
    s.vitals.damage(60);
    s.applyEffects('invocation:patronus-aesculapius', [{ kind: 'regen', target: 'health', amount: 5, percent: true, duration: 10 }]);
    s.tick(10);
    expect(s.vitals.health.current).toBeCloseTo(90);
  });

  it('a condition effect applies a named condition (mulsum makes you tipsy)', () => {
    const { s } = sheet();
    s.applyEffects('item:mulsum', [{ kind: 'condition', target: 'ebrius', amount: 1 }]);
    expect(s.hasCondition('ebrius')).toBe(true);
    expect(s.hasFlag('ebrius')).toBe(true);
  });

  it('remedy magnitude scales amounts; same-source effects refresh rather than stack', () => {
    const { s } = sheet();
    s.applyEffects('item:vinum', [{ kind: 'modifier', target: 'persuade.chance', amount: 0.1, duration: 60 }], { magnitude: 1.5 });
    expect(s.modifier('persuade.chance')).toBeCloseTo(0.15);
    s.applyEffects('item:vinum', [{ kind: 'modifier', target: 'persuade.chance', amount: 0.1, duration: 60 }]);
    expect(s.modifier('persuade.chance')).toBeCloseTo(0.1);
  });

  it('poisons: aconite 4/s, halved by theriac resistance, blocked by immunity, cured by theriac', () => {
    const { s } = sheet();
    s.vitals.inCombat = true; // no natural health regen
    s.applyCondition('aconitum');
    s.tick(1);
    expect(s.vitals.health.current).toBeCloseTo(96);
    s.applyEffects('item:theriaca', [{ kind: 'cure', target: 'poison', amount: 1 }]);
    expect(s.activeEffects.length).toBe(0);
    const r = sheet().s;
    r.vitals.inCombat = true;
    r.setFlagSource('test', ['poison.resist']);
    r.applyCondition('aconitum');
    r.tick(1);
    expect(r.vitals.health.current).toBeCloseTo(98);
    r.setFlagSource('test', ['poison.immune']);
    expect(r.applyCondition('taxus')).toBe(false);
  });

  it('bleeding (cruentus) stacks up to three (2/s each) and a bandage stops all of it', () => {
    const { s } = sheet();
    s.vitals.inCombat = true;
    for (let i = 0; i < 4; i++) s.applyCondition('cruentus');
    expect(s.conditionStacks('cruentus')).toBe(3);
    s.tick(1);
    expect(s.vitals.health.current).toBeCloseTo(94);
    expect(s.cure('injury:cruentus')).toBe(3);
    expect(s.hasCondition('cruentus')).toBe(false);
  });

  it('any poison counts as veneno; Isis’ blessing resists poison by 25%', () => {
    const { s } = sheet();
    s.vitals.inCombat = true;
    expect(s.hasCondition('veneno')).toBe(false);
    s.applyCondition('aconitum');
    s.applyCondition('cicuta');
    expect(s.conditionStacks('veneno')).toBe(2);
    s.cure('poison');
    expect(s.hasCondition('veneno')).toBe(false);
    s.applyCondition('benedictio-isis');
    s.applyCondition('taxus');
    s.tick(1);
    expect(s.vitals.health.current).toBeCloseTo(98.5);
  });

  it('diseases last until cured, can be cured specifically, and immunity blocks them', () => {
    const { s } = sheet();
    expect(s.applyCondition('febris')).toBe(true);
    expect(s.hasCondition('febris')).toBe(true);
    expect(s.vitals.stamina.max).toBeCloseTo(85); // −15% max stamina (§14.9)
    for (let i = 0; i < 100; i++) s.tick(10);
    expect(s.hasCondition('febris')).toBe(true);
    s.applyCondition('lippitudo');
    s.cure('disease:lippitudo');
    expect(s.hasCondition('lippitudo')).toBe(false);
    expect(s.hasCondition('febris')).toBe(true);
    s.cure('disease');
    expect(s.hasCondition('febris')).toBe(false);
    expect(s.vitals.stamina.max).toBe(100);
    s.setFlagSource('patron', ['disease.immune']);
    expect(s.applyCondition('febris')).toBe(false);
  });

  it('two blessing slots (§14.6): one temple blessing for a game day, and the Lares favor for 2 game hours', () => {
    const { s } = sheet();
    s.applyCondition('benedictio-mars');
    expect(s.activeEffects.find((a) => a.source === 'blessing:benedictio-mars')!.remaining).toBe(DEVOTION.blessingSeconds);
    expect(s.modifier('damage.blades')).toBeCloseTo(0.1);
    s.applyCondition('favor-larum');
    expect(s.activeEffects.find((a) => a.source === 'blessing:favor-larum')!.remaining).toBe(DEVOTION.laresSeconds);
    expect(s.hasCondition('benedictio-mars')).toBe(true);
    s.applyCondition('benedictio-venus');
    expect(s.hasCondition('benedictio-mars')).toBe(false);
    expect(s.hasCondition('benedictio-venus')).toBe(true);
    expect(s.hasCondition('favor-larum')).toBe(true);
    expect(s.modifier('persuade.chance')).toBeCloseTo(0.1);
    s.setFlagSource('test', ['religio.twoBlessings']);
    s.applyCondition('benedictio-minerva');
    expect(s.hasCondition('benedictio-venus')).toBe(true);
    expect(s.hasCondition('benedictio-minerva')).toBe(true);
    s.setModifierSource('test', { 'blessing.duration': 0.5 });
    s.applyCondition('benedictio-iuppiter');
    expect(s.activeEffects.find((a) => a.source === 'blessing:benedictio-iuppiter')!.remaining).toBeCloseTo(DEVOTION.blessingSeconds * 1.5);
    expect(s.modifier('damage.taken')).toBeCloseTo(-0.1);
  });

  it('per-skill XP modifiers (Minerva’s blessing +15% Smithing) and Mars’ combat-only stamina regeneration', () => {
    const { s } = sheet();
    s.applyCondition('benedictio-minerva');
    s.useSkill('fabrica', 10);
    expect(s.skillXp('fabrica')).toBeCloseTo(11.5);
    s.useSkill('blades', 10);
    expect(s.skillXp('blades')).toBeCloseTo(10);
    const m = sheet().s;
    m.setModifierSource('patron', { 'stamina.regenCombat': 0.1 });
    m.vitals.drain('stamina', 50);
    m.tick(0.8);
    m.tick(1);
    expect(m.vitals.stamina.current).toBeCloseTo(70);
    m.vitals.inCombat = true;
    m.tick(1);
    expect(m.vitals.stamina.current).toBeCloseTo(92);
  });

  it('flag effects set sheet flags for their duration; consumeFlag uses one up', () => {
    const { s, events } = sheet();
    const log = record(events, ['effect:expired']);
    s.applyEffects('invocation:fortuna', [{ kind: 'flag', target: 'fortuna.nextRoll', amount: 1, duration: 600 }]);
    expect(s.hasFlag('fortuna.nextRoll')).toBe(true);
    expect(s.consumeFlag('fortuna.nextRoll')).toBe(true);
    expect(s.hasFlag('fortuna.nextRoll')).toBe(false);
    expect(s.consumeFlag('fortuna.nextRoll')).toBe(false);
    s.applyEffects('invocation:hercules', [{ kind: 'flag', target: 'stagger.immune', amount: 1, duration: 10 }]);
    s.tick(11);
    expect(s.hasFlag('stagger.immune')).toBe(false);
    expect(log.map((l) => (l.e as { source: string }).source)).toEqual(['invocation:fortuna', 'invocation:hercules']);
  });

  it('Invictus turns one killing blow into 1 health', () => {
    const { s } = sheet();
    s.applyEffects('invocation:mithras', [{ kind: 'flag', target: 'invictus', amount: 1, duration: 4320 }]);
    s.vitals.damage(500);
    expect(s.vitals.dead).toBe(false);
    expect(s.vitals.health.current).toBe(1);
    s.vitals.damage(500);
    expect(s.vitals.dead).toBe(true);
  });

  it('impiety leaves you ill-omened (−10% luck) until expiation', () => {
    const { s } = sheet();
    s.applyCondition('infaustus');
    expect(s.modifier('luck')).toBeCloseTo(-0.1);
    expect(s.hasFlag('infaustus')).toBe(true);
    for (let i = 0; i < 10; i++) s.tick(1000);
    expect(s.hasCondition('infaustus')).toBe(true);
    s.cure('omen');
    expect(s.hasCondition('infaustus')).toBe(false);
  });

  it('serializes perks, growth, effects (including "until cured") and vitals', () => {
    const { s } = sheet();
    s.grantPerkPoints(2);
    s.setSkill('stealth', 20);
    s.takePerk('perk-stealth-crowd-blend');
    s.useSkill('stealth', 3);
    s.raiseSkill('blades', 5);
    s.applyCondition('febris');
    s.applyCondition('benedictio-mars');
    s.applyCondition('cruentus');
    s.applyCondition('cruentus');
    s.vitals.damage(20);
    const json = JSON.parse(JSON.stringify(s.serialize()));
    const t = new CharacterSheetImpl();
    t.restore(json);
    expect(t.hasCondition('febris')).toBe(true);
    expect(t.activeEffects.find((a) => a.source === 'disease:febris')!.remaining).toBe(Infinity);
    expect(t.hasCondition('benedictio-mars')).toBe(true);
    expect(t.conditionStacks('cruentus')).toBe(2);
    expect(t.perks.has('perk-stealth-crowd-blend')).toBe(true);
    expect(t.perkPoints).toBe(1);
    expect(t.skillXp('stealth')).toBeCloseTo(s.skillXp('stealth'));
    expect(t.vitals.health.max).toBeCloseTo(101); // 100 + 5 × 0.2
    expect(t.vitals.stamina.max).toBeCloseTo(85); // fever
    expect(t.vitals.health.current).toBeCloseTo(s.vitals.health.current);
    expect(t.serialize()).toEqual(s.serialize());
  });

  it('restore(undefined) is a new character: skills 10, full health, pietas 25', () => {
    const { s } = sheet();
    s.setSkill('blades', 50);
    s.vitals.damage(40);
    s.vitals.restore('pietas', 25);
    s.restore(undefined);
    expect(s.skillLevel('blades')).toBe(10);
    expect(s.vitals.health.current).toBe(100);
    expect(s.vitals.pietas.current).toBe(25);
  });
});

describe('vitals (GDD §3.3)', () => {
  it('spend fails without enough, drain takes what there is, stamina waits 0.8 s after spending', () => {
    const v = new VitalsImpl({ health: 100, stamina: 50, pietas: 20 });
    expect(v.spend('stamina', 60)).toBe(false);
    expect(v.stamina.current).toBe(50);
    expect(v.spend('stamina', 30)).toBe(true);
    expect(v.drain('stamina', 40)).toBe(20);
    expect(v.stamina.current).toBe(0);
    v.tick(0.5);
    expect(v.stamina.current).toBe(0);
    v.tick(0.5); // the rest of the delay
    v.tick(1);
    expect(v.stamina.current).toBeCloseTo(20);
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

  it('health regenerates 0.5/s out of combat only; stamina 20/s, half while blocking', () => {
    const a = new VitalsImpl({ health: 100 });
    const b = new VitalsImpl({ health: 100 });
    a.damage(50);
    b.damage(50);
    b.inCombat = true;
    a.tick(10);
    b.tick(10);
    expect(a.health.current).toBeCloseTo(55);
    expect(b.health.current).toBe(50);
    const c = new VitalsImpl({ health: 100, stamina: 100 });
    c.drain('stamina', 100);
    c.tick(0.8); // the delay
    c.tick(1);
    expect(c.stamina.current).toBeCloseTo(20);
    c.blocking = true;
    c.tick(1);
    expect(c.stamina.current).toBeCloseTo(30);
  });

  it('pietas does not regenerate on its own (devotion refills it)', () => {
    const { s } = sheet();
    s.vitals.spend('pietas', 5);
    for (let i = 0; i < 100; i++) s.tick(1);
    expect(s.vitals.pietas.current).toBe(20);
  });
});
