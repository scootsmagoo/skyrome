import { describe, expect, it } from 'vitest';
import {
  applyArmor,
  applyPoiseDamage,
  armorMitigation,
  attackInterval,
  attackStaminaCost,
  computeAttack,
  createPoise,
  difficultyMult,
  effectiveArmorRating,
  flatStats,
  resolveBlock,
  resolveHit,
  tickPoise,
  timeToKill,
  weaponDamage,
} from '../src/rpg/combat-math';
import { COMBAT } from '../src/rpg/data/balance';
import { combatProfileFor, enemyLevel, profileStats, profileWeapon, tierDef } from '../src/rpg/enemies';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { BUILDS, db, duel, ttkTable } from './rpg-ttk';

const gladius = db.require('gladius');
const scutum = db.require('scutum');

describe('attack damage', () => {
  it('scales with skill (×1.5 at 100), power (×2) and sneak (×3 melee, ×2 ranged)', () => {
    const w = gladius.weapon!;
    expect(weaponDamage(w, 0)).toBe(8);
    expect(weaponDamage(w, 100)).toBe(12);
    expect(weaponDamage(w, 0, { power: true })).toBe(16);
    expect(weaponDamage(w, 0, { sneak: true })).toBe(24);
    expect(weaponDamage(w, 0, { classMod: 0.4 })).toBeCloseTo(11.2);
    const bow = db.require('arcus').weapon!;
    const arrow = db.require('sagitta').weapon!;
    expect(weaponDamage(bow, 0, { ammo: arrow })).toBe(14);
    expect(weaponDamage(bow, 0, { ammo: arrow, charge: 0 })).toBeCloseTo(14 * 0.35);
    expect(weaponDamage(bow, 0, { ammo: arrow, sneak: true })).toBe(28);
    expect(weaponDamage(bow, 0, { power: true })).toBe(12); // no power shots
  });

  it('reads perks from the sheet: class damage, power, sneak and the Sicarius dagger bonus', () => {
    const s = new CharacterSheetImpl();
    s.setSkill('blades', 0);
    expect(computeAttack(s, gladius.weapon, { item: gladius }).damage).toBe(8);
    s.grantPerk('blades.arm1');
    s.grantPerk('blades.punctim');
    expect(computeAttack(s, gladius.weapon, { item: gladius }).damage).toBeCloseTo(9.6);
    expect(computeAttack(s, gladius.weapon, { item: gladius, power: true }).damage).toBeCloseTo(9.6 * 2 * 1.25);
    const pugio = db.require('pugio');
    const plain = computeAttack(s, pugio.weapon, { item: pugio, sneak: true }).damage;
    s.grantPerk('sneak.backstab');
    s.grantPerk('sneak.sicarius');
    const dagger = computeAttack(s, pugio.weapon, { item: pugio, sneak: true }).damage;
    expect(dagger / plain).toBeCloseTo(8 / 3);
  });

  it('unarmed uses fists; stamina cost grows with weight and power; perks cut it', () => {
    const s = flatStats(0);
    expect(computeAttack(s, undefined).damage).toBe(COMBAT.fists.damage);
    expect(attackStaminaCost(1.2, false)).toBeCloseTo(3.2);
    expect(attackStaminaCost(1.2, true)).toBeCloseTo(18.8);
    expect(attackStaminaCost(1.2, true, 0.25)).toBeCloseTo(18.8 * 0.75);
    expect(attackInterval(gladius.weapon!)).toBeCloseTo(0.75);
    expect(attackInterval(db.require('falx').weapon!)).toBeCloseTo(1);
  });

  it('Skullcracker ignores a quarter of armor on blunt power attacks', () => {
    const s = new CharacterSheetImpl();
    s.grantPerk('blunt.skullcracker');
    const club = db.require('clava');
    expect(computeAttack(s, club.weapon, { item: club, power: true }).armorIgnore).toBe(0.25);
    expect(computeAttack(s, club.weapon, { item: club }).armorIgnore).toBe(0);
    expect(applyArmor(100, 120, 0.25)).toBeGreaterThan(applyArmor(100, 120));
  });
});

describe('armor', () => {
  it('mitigation = R / (R + 120), capped at 80%', () => {
    expect(armorMitigation(0)).toBe(0);
    expect(armorMitigation(120)).toBeCloseTo(0.5);
    expect(armorMitigation(10_000)).toBe(COMBAT.armorCap);
    expect(applyArmor(100, 120)).toBeCloseTo(50);
  });

  it('effective rating scales with armor skill and perks; shields count', () => {
    const s = new CharacterSheetImpl();
    s.setSkill('heavyArmor', 0);
    s.setSkill('block', 0);
    const seg = db.require('lorica_segmentata');
    expect(effectiveArmorRating([seg], s)).toBe(40);
    s.setSkill('heavyArmor', 100);
    expect(effectiveArmorRating([seg], s)).toBeCloseTo(56);
    s.grantPerk('heavy.miles1');
    expect(effectiveArmorRating([seg], s)).toBeCloseTo(56 * 1.2);
    expect(effectiveArmorRating([seg, scutum], s)).toBeCloseTo(56 * 1.2 + 25);
    expect(effectiveArmorRating([db.require('tunica')], s)).toBe(0);
  });
});

describe('blocking', () => {
  it('a scutum absorbs most of a blow and costs stamina', () => {
    const s = new CharacterSheetImpl();
    s.setSkill('block', 0);
    const r = resolveBlock(s, { damage: 20, shield: scutum.shield, stamina: 100 });
    expect(r.mitigation).toBeCloseTo(0.8);
    expect(r.damage).toBeCloseTo(4);
    expect(r.staminaCost).toBeCloseTo(12);
    expect(r.guardBroken).toBe(false);
    const power = resolveBlock(s, { damage: 20, shield: scutum.shield, stamina: 100, power: true });
    expect(power.staminaCost).toBeCloseTo(18);
  });

  it('blocking with a weapon is weaker; skill and perks help; capped at 95%', () => {
    const s = new CharacterSheetImpl();
    s.setSkill('block', 0);
    expect(resolveBlock(s, { damage: 10, stamina: 100 }).mitigation).toBeCloseTo(0.35);
    expect(resolveBlock(s, { damage: 10, stamina: 100, twoHanded: true }).mitigation).toBeCloseTo(0.5);
    s.setSkill('block', 100);
    s.grantPerk('block.wall1');
    s.grantPerk('block.wall2');
    s.grantPerk('block.wall3');
    expect(resolveBlock(s, { damage: 10, shield: scutum.shield, stamina: 100 }).mitigation).toBe(COMBAT.blockCap);
    s.grantPerk('block.testudo');
    expect(resolveBlock(s, { damage: 10, shield: scutum.shield, stamina: 100 }).staminaCost).toBeCloseTo(6 * 0.7);
  });

  it('runs out of stamina → guard break (half the mitigation, all remaining stamina)', () => {
    const s = flatStats(0);
    const r = resolveBlock(s, { damage: 50, shield: scutum.shield, stamina: 5 });
    expect(r.guardBroken).toBe(true);
    expect(r.staminaCost).toBe(5);
    expect(r.mitigation).toBeCloseTo(0.4);
  });

  it('Deflect Missiles stops arrows completely', () => {
    const s = new CharacterSheetImpl();
    s.grantPerk('block.deflect');
    expect(resolveBlock(s, { damage: 30, shield: scutum.shield, stamina: 100, ranged: true }).damage).toBe(0);
  });

  it('resolveHit applies block, then armor, then difficulty', () => {
    const s = flatStats(0);
    const hit = resolveHit({ attack: { damage: 20, poise: 12, armorIgnore: 0 }, armor: 120, block: { stats: s, shield: scutum.shield, stamina: 100 }, mult: 2 });
    expect(hit.damage).toBeCloseTo(20 * 0.2 * 0.5 * 2);
    expect(hit.poise).toBeCloseTo(12 * COMBAT.poiseBlockedMult);
    expect(hit.blockStamina).toBeCloseTo(12);
    expect(difficultyMult('master', false)).toBe(2);
    expect(difficultyMult('novice', true)).toBe(2);
  });
});

describe('poise', () => {
  it('flinches, staggers when poise runs out, knocks down on a huge hit, then regenerates', () => {
    const p = createPoise(60);
    expect(applyPoiseDamage(p, 0)).toBe('none');
    expect(applyPoiseDamage(p, 20)).toBe('flinch');
    expect(applyPoiseDamage(p, 20)).toBe('flinch');
    expect(applyPoiseDamage(p, 25)).toBe('stagger');
    expect(p.current).toBe(60);
    expect(applyPoiseDamage(p, 55)).toBe('knockdown');
    applyPoiseDamage(p, 30, 0.5);
    expect(p.current).toBe(45);
    tickPoise(p, 1);
    expect(p.current).toBe(45); // still in the regen delay
    tickPoise(p, 1.5);
    tickPoise(p, 1);
    expect(p.current).toBe(60);
  });

  it('power attacks and heavy weapons break poise faster', () => {
    const s = flatStats(20);
    const light = computeAttack(s, gladius.weapon).poise;
    expect(computeAttack(s, gladius.weapon, { power: true }).poise).toBeCloseTo(light * 2);
    expect(computeAttack(s, db.require('malleus').weapon).poise).toBeGreaterThan(light * 3);
  });
});

describe('enemy tiers', () => {
  it('level with the player inside each tier’s range', () => {
    const thug = tierDef('thug')!;
    expect(enemyLevel(thug, 1)).toBe(1);
    expect(enemyLevel(thug, 30)).toBe(12);
    expect(enemyLevel(tierDef('praetorian')!, 1)).toBe(15);
    const p1 = combatProfileFor('thug', 1);
    const p10 = combatProfileFor('thug', 10);
    expect(p1).toMatchObject({ tier: 'thug', level: 1, health: 50, armor: 8, weapon: 'fustis', loot: 'thug' });
    expect(p10.health).toBe(95);
    expect(p10.weapon).toBe('gladius_rusty');
    expect(combatProfileFor('boss', 1, { level: 40 }).level).toBe(40);
    expect(() => combatProfileFor('dragon', 1)).toThrow();
  });

  it('NPC damage grows with level through damageMult', () => {
    const lo = combatProfileFor('veteran', 8);
    const hi = combatProfileFor('veteran', 30);
    expect(hi.damageMult!).toBeGreaterThan(lo.damageMult!);
    const w = profileWeapon(hi, db);
    expect(computeAttack(profileStats(hi), w).damage).toBeGreaterThan(computeAttack(flatStats(hi.skill), w).damage * 1.5);
    expect(profileWeapon(combatProfileFor('animal', 1), db).damage).toBe(7);
  });
});

describe('time to kill (player vs Suburan thug)', () => {
  // These are the documented balance targets (docs/modules/rpg.md): a thug should fall in a
  // handful of light attacks at every level, and never threaten a levelled player.
  it('level 1: ~6 hits, ~4–5 s; the thug needs ~16 hits on the player', () => {
    const d = duel(BUILDS[0], 'thug');
    expect(d.hits).toBeGreaterThanOrEqual(5);
    expect(d.hits).toBeLessThanOrEqual(8);
    expect(d.seconds).toBeLessThan(7);
    expect(d.hitsToDie).toBeGreaterThanOrEqual(12);
  });

  it('level 10: ~7 hits, ~5–6 s', () => {
    const d = duel(BUILDS[1], 'thug');
    expect(d.hits).toBeGreaterThanOrEqual(5);
    expect(d.hits).toBeLessThanOrEqual(9);
    expect(d.seconds).toBeLessThan(8);
    expect(d.hitsToDie).toBeGreaterThanOrEqual(20);
  });

  it('level 30: thugs cap at level 12 and drop in ~5 hits (2 power attacks)', () => {
    const d = duel(BUILDS[2], 'thug');
    expect(d.enemyLevel).toBe(12);
    expect(d.hits).toBeLessThanOrEqual(6);
    expect(Math.ceil(d.enemyHealth / d.powerHit)).toBeLessThanOrEqual(2);
    expect(d.hitsToDie).toBeGreaterThan(50);
  });

  it('on-level fights land in the tier bands (soldiers 10–18, elites 18–28, bosses 28–40 hits)', () => {
    for (const b of BUILDS.slice(1)) {
      for (const t of ['gladiator', 'veteran', 'urbanus']) expect(duel(b, t).hits, `${t}@${b.level}`).toBeGreaterThanOrEqual(10);
      for (const t of ['gladiator', 'veteran', 'urbanus']) expect(duel(b, t).hits, `${t}@${b.level}`).toBeLessThanOrEqual(18);
      for (const t of ['praetorian', 'champion']) expect(duel(b, t).hits, `${t}@${b.level}`).toBeGreaterThanOrEqual(18);
      for (const t of ['praetorian', 'champion']) expect(duel(b, t).hits, `${t}@${b.level}`).toBeLessThanOrEqual(28);
      expect(duel(b, 'boss').hits).toBeGreaterThanOrEqual(28);
      expect(duel(b, 'boss').hits).toBeLessThanOrEqual(40);
    }
  });

  it('TTK table', () => {
    const table = ttkTable();
    if (process.env.PRINT_TTK) console.log(table);
    expect(table.split('\n').length).toBe(2 + 3 * 8);
    expect(timeToKill({ damagePerHit: 10, interval: 0.5, health: 95, hitRate: 0.5 })).toEqual({ hits: 10, seconds: 10 });
  });
});
