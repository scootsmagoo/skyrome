import { describe, expect, it } from 'vitest';
import {
  applyPoiseDamage,
  armorFamilyOf,
  armorReduction,
  armorSkillFor,
  attackInterval,
  computeAttack,
  conditionFactor,
  createPoise,
  damageTypeOf,
  difficultyMult,
  effectiveArmorRating,
  flatStats,
  missileBlocked,
  parryWindow,
  playerPoise,
  powerChargeMult,
  resolveBlock,
  resolveHit,
  resolveParry,
  tickPoise,
  timeToKill,
  typeFactor,
} from '../src/rpg/combat-math';
import { COMBAT } from '../src/rpg/data/balance';
import { ARCHETYPES } from '../src/rpg/data/enemies';
import { allArchetypes, archetypeProfile, combatProfileFor, profileStats, profileWeapon, tierDef, tiersInBand } from '../src/rpg/enemies';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { BUILDS, db, duel, ttkTable, TTK_ROWS } from './rpg-ttk';

const gladius = db.require('gladius');
const scutum = db.require('scutum');
/** A sheet with only the given skills set (others 0) and no perks. */
const stats = (skills: Record<string, number>) => {
  const s = new CharacterSheetImpl({ startSkill: 0 });
  for (const [k, v] of Object.entries(skills)) s.setSkill(k, v);
  return s;
};

describe('GDD §6.2 lethality check (pinned)', () => {
  const p = stats({ blades: 25, brawling: 25 });
  const thrust = computeAttack(p, gladius.weapon, { item: gladius });

  it('an iron gladius at Blades 25 does 13 × 1.125 = 14.6', () => {
    expect(thrust.damage).toBeCloseTo(14.625);
    expect(thrust.damageType).toBe('thrust');
  });

  it('a thug in a tunic (45 HP) falls to 4 thrusts, 3 with a Noric gladius', () => {
    const hits = (dmg: number) => timeToKill({ damagePerHit: resolveHit({ attack: { ...thrust, damage: dmg }, armor: 0, family: 'cloth' }).damage, interval: 1, health: 45 }).hits;
    expect(hits(thrust.damage)).toBe(4);
    const noric = db.require('gladius-noric');
    expect(hits(computeAttack(p, noric.weapon, { item: noric }).damage)).toBe(3);
  });

  it('an urban soldier in segmentata and helmet (AR 50, 70 HP) takes 10 thrusts and 9 clava blows', () => {
    const vsSoldier = (a: ReturnType<typeof computeAttack>) => timeToKill({ damagePerHit: resolveHit({ attack: a, armor: 50, family: 'plate' }).damage, interval: 1, health: 70 }).hits;
    expect(vsSoldier(thrust)).toBe(10);
    const clava = db.require('clava');
    expect(vsSoldier(computeAttack(p, clava.weapon, { item: clava }))).toBe(9);
    // Cuts are much worse against plate (the GDD's "14 cuts" uses the thrust damage; with the gladius cut of 11 it is 17).
    expect(vsSoldier(computeAttack(p, gladius.weapon, { item: gladius, alt: true }))).toBeGreaterThanOrEqual(14);
  });

  it('a sicarius (sica 11, skill 50, tier 1.15, Normalis ×1.5 → 23.7) kills a player in a tunic in 5 hits, in mail and helmet (AR 42) in 10', () => {
    const sica = db.require('sica');
    const a = computeAttack(flatStats(50, 1.15), sica.weapon, { item: sica });
    const mult = difficultyMult('normalis', false);
    expect(a.damage * mult).toBeCloseTo(23.72, 1);
    const hits = (armor: number, family: 'cloth' | 'mail') => timeToKill({ damagePerHit: resolveHit({ attack: a, armor, family, mult }).damage, interval: 1, health: 100 }).hits;
    expect(hits(0, 'cloth')).toBe(5);
    expect(hits(42, 'mail')).toBe(10);
  });
});

describe('attack multipliers (§6.1–6.7)', () => {
  const p = stats({ blades: 0 });
  const base = computeAttack(p, gladius.weapon, { item: gladius }).damage;

  it('power attacks: ×1.5 at 0.35 s rising to ×2.0 at 0.8 s; directions; chain, sprint, bash, riposte', () => {
    expect(base).toBe(13);
    expect(powerChargeMult(0.35)).toBeCloseTo(1.5);
    expect(powerChargeMult(0.8)).toBeCloseTo(2);
    expect(computeAttack(p, gladius.weapon, { item: gladius, power: true, chargeSeconds: 0.575 }).damage / base).toBeCloseTo(1.75);
    expect(computeAttack(p, gladius.weapon, { item: gladius, power: true, direction: 'sideways' }).damage / base).toBeCloseTo(1.4);
    expect(computeAttack(p, gladius.weapon, { item: gladius, power: true, direction: 'back' }).damage / base).toBeCloseTo(1.3);
    expect(computeAttack(p, gladius.weapon, { item: gladius, chain: 3 }).damage / base).toBeCloseTo(1.25);
    expect(computeAttack(p, gladius.weapon, { item: gladius, sprint: true }).damage / base).toBeCloseTo(1.3);
    expect(computeAttack(p, gladius.weapon, { item: gladius, bash: true })).toMatchObject({ damageType: 'blunt' });
    expect(computeAttack(p, gladius.weapon, { item: gladius, bash: true }).damage / base).toBeCloseTo(0.3);
    expect(computeAttack(p, gladius.weapon, { item: gladius, riposte: true }).damage / base).toBeCloseTo(2);
    const overhead = computeAttack(p, gladius.weapon, { item: gladius, power: true, direction: 'none' });
    expect(overhead.poise).toBeCloseTo(12 * 2.5 * 1.5);
  });

  it('sneak attacks: melee ×3, daggers ×4, ranged ×2; Sicarius ×4 / ×6; fists from behind take down', () => {
    expect(computeAttack(p, gladius.weapon, { item: gladius, sneak: true }).damage / base).toBeCloseTo(3);
    const pugio = db.require('pugio');
    const pBase = computeAttack(p, pugio.weapon, { item: pugio }).damage;
    expect(computeAttack(p, pugio.weapon, { item: pugio, sneak: true }).damage / pBase).toBeCloseTo(4);
    const bow = db.require('arcus');
    expect(computeAttack(p, bow.weapon, { item: bow, sneak: true }).damage / computeAttack(p, bow.weapon, { item: bow }).damage).toBeCloseTo(2);
    const s = stats({ blades: 0 });
    s.grantPerk('perk-stealth-assassin');
    expect(computeAttack(s, gladius.weapon, { item: gladius, sneak: true }).damage / base).toBeCloseTo(4);
    expect(computeAttack(s, pugio.weapon, { item: pugio, sneak: true }).damage / pBase).toBeCloseTo(6);
    expect(computeAttack(p, undefined, { sneak: true }).takedown).toBe(true);
    expect(computeAttack(p, gladius.weapon, { item: gladius, sneak: true }).takedown).toBe(false);
  });

  it('crits: 3% chance of ×1.5, shifted by luck (Fortuna +5, infaustus −10) and good omens; never on sneak attacks', () => {
    expect(computeAttack(p, gladius.weapon, { item: gladius, critRoll: 0.029 })).toMatchObject({ crit: true, damage: 13 * 1.5 });
    expect(computeAttack(p, gladius.weapon, { item: gladius, critRoll: 0.031 }).crit).toBe(false);
    expect(computeAttack(p, gladius.weapon, { item: gladius, sneak: true, critRoll: 0 }).crit).toBe(false);
    const lucky = stats({});
    lucky.setModifierSource('patron', { luck: 0.05 });
    expect(computeAttack(lucky, gladius.weapon, { item: gladius, critRoll: 0.07 }).crit).toBe(true);
    lucky.applyCondition('omen-faustum');
    expect(computeAttack(lucky, gladius.weapon, { item: gladius, critRoll: 0.12 }).crit).toBe(true);
    const cursed = stats({});
    cursed.applyCondition('infaustus');
    expect(computeAttack(cursed, gladius.weapon, { item: gladius, critRoll: 0 }).crit).toBe(false);
  });

  it('bleeding: cuts with blades 20% (power 35%), +15 points with Bilbilis Edge, halved against AR ≥ 30; not through a block', () => {
    const cut = computeAttack(p, gladius.weapon, { item: gladius, alt: true });
    expect(cut.bleedChance).toBeCloseTo(0.2);
    expect(computeAttack(p, gladius.weapon, { item: gladius }).bleedChance).toBe(0);
    expect(computeAttack(p, gladius.weapon, { item: gladius, alt: true, power: true }).bleedChance).toBeCloseTo(0.35);
    const edge = stats({});
    edge.grantPerk('perk-blades-bilbilis-edge');
    expect(computeAttack(edge, gladius.weapon, { item: gladius, alt: true }).bleedChance).toBeCloseTo(0.35);
    expect(resolveHit({ attack: cut, armor: 30 }).bleedChance).toBeCloseTo(0.1);
    expect(resolveHit({ attack: cut, armor: 0, block: { stats: flatStats(0), shield: scutum.shield, stamina: 100 } }).bleedChance).toBe(0);
  });

  it('thrown weapons, partial draws, headshots, beasts and the vitis', () => {
    const pilum = db.require('pilum');
    expect(computeAttack(p, pilum.weapon, { item: pilum, thrown: true }).damage).toBe(30);
    expect(computeAttack(p, pilum.weapon, { item: pilum }).damage).toBe(10);
    const volley = stats({});
    volley.grantPerk('perk-spear-pilum-volley');
    expect(computeAttack(volley, pilum.weapon, { item: pilum, thrown: true }).damage).toBeCloseTo(39);
    const bow = db.require('arcus');
    expect(computeAttack(p, bow.weapon, { item: bow, partialDraw: true }).damage).toBe(8);
    expect(computeAttack(p, bow.weapon, { item: bow, headshot: 'bare' }).damage).toBe(24);
    const sling = db.require('funda');
    expect(computeAttack(p, sling.weapon, { item: sling, ammoItem: db.require('glans-plumbea') }).damage).toBe(12);
    expect(computeAttack(p, sling.weapon, { item: sling, ammoItem: db.require('lapis') }).damage).toBe(8);
    const ven = db.require('venabulum');
    const hunter = stats({});
    hunter.grantPerk('perk-spear-venator');
    expect(computeAttack(hunter, ven.weapon, { item: ven, vsBeast: true }).damage).toBeCloseTo(16 * 1.3 * 1.25);
    const vitis = db.require('vitis');
    expect(computeAttack(p, vitis.weapon, { item: vitis, vsSoldier: true }).poise).toBeCloseTo(18 * 1.5);
  });

  it('stamina: light 5 + 2/kg (gladius 7.4), power ×3 (min 20), sprint ×1.5, bash 18; Furor frees power attacks', () => {
    expect(computeAttack(p, gladius.weapon, { item: gladius }).staminaCost).toBeCloseTo(7.4);
    expect(computeAttack(p, gladius.weapon, { item: gladius, power: true }).staminaCost).toBeCloseTo(22.2);
    const pugio = db.require('pugio');
    expect(computeAttack(p, pugio.weapon, { item: pugio, power: true }).staminaCost).toBe(20);
    expect(computeAttack(p, gladius.weapon, { item: gladius, sprint: true }).staminaCost).toBeCloseTo(11.1);
    expect(computeAttack(p, gladius.weapon, { item: gladius, bash: true }).staminaCost).toBe(18);
    const furor = stats({});
    furor.applyEffects('invocation:mars', [{ kind: 'flag', target: 'power.free', amount: 1, duration: 10 }]);
    expect(computeAttack(furor, gladius.weapon, { item: gladius, power: true }).staminaCost).toBe(0);
    expect(attackInterval(gladius.weapon!)).toBeCloseTo(COMBAT.swingSeconds);
  });

  it('condition scales damage by 0.5 + 0.5 × condition; Caestus +50% fists', () => {
    expect(conditionFactor(0.7)).toBeCloseTo(0.85);
    expect(computeAttack(p, gladius.weapon, { item: gladius, condition: 0.7 }).damage).toBeCloseTo(13 * 0.85);
    const boxer = stats({});
    boxer.grantPerk('perk-brawling-caestus');
    expect(computeAttack(boxer, undefined).damage).toBeCloseTo(COMBAT.fists.damage * 1.5);
  });
});

describe('armor (§6.2–6.3, §8.3)', () => {
  it('reduction = AR / (AR + 120), capped at 60%; damage is at least 1', () => {
    expect(armorReduction(0)).toBe(0);
    expect(armorReduction(120)).toBeCloseTo(0.5);
    expect(armorReduction(10_000)).toBe(COMBAT.armorCap);
    expect(resolveHit({ attack: { damage: 1, poise: 0 }, armor: 500, family: 'plate' }).damage).toBe(1);
  });

  it('TYPE_VS_FAMILY: thrust beats cut against armor, blunt beats both against mail and plate', () => {
    expect(typeFactor('cut', 'cloth')).toBe(1);
    expect(typeFactor('thrust', 'mail')).toBe(0.85);
    expect(typeFactor('cut', 'plate')).toBe(0.5);
    expect(typeFactor('blunt', 'plate')).toBeGreaterThan(typeFactor('thrust', 'plate'));
    expect(typeFactor('blunt', 'padded')).toBe(0.75);
    expect(damageTypeOf(gladius.weapon!)).toBe('thrust');
    expect(damageTypeOf(db.require('spatha').weapon!)).toBe('cut');
    expect(armorFamilyOf([db.require('lorica-segmentata'), db.require('galea-gallica')])).toBe('plate');
    expect(armorFamilyOf([db.require('lorica-hamata')])).toBe('mail');
    expect(armorFamilyOf([db.require('tunica')])).toBe('cloth');
  });

  it('AR = Σ pieces × (1 + armor skill/250) × (1 + armor.*) × condition; shields add none; Manica ×2', () => {
    const s = stats({ 'heavy-armor': 0, 'light-armor': 0 });
    const seg = db.require('lorica-segmentata');
    expect(effectiveArmorRating([seg, scutum], s)).toBe(38);
    s.setSkill('heavy-armor', 50);
    expect(effectiveArmorRating([seg], s)).toBeCloseTo(38 * 1.2);
    s.grantPerk('perk-heavy-armor-iron-skin');
    expect(effectiveArmorRating([seg], s)).toBeCloseTo(38 * 1.2 * 1.15);
    expect(effectiveArmorRating([{ def: seg, condition: 0.5 }], s)).toBeCloseTo(38 * 1.2 * 1.15 * 0.75);
    expect(effectiveArmorRating([db.require('tunica-crassa')], s)).toBe(2);
    const m = db.require('manica-linea');
    expect(effectiveArmorRating([m], s)).toBe(4);
    s.grantPerk('perk-light-armor-manica');
    expect(effectiveArmorRating([m], s)).toBe(8);
    expect(armorSkillFor([seg, db.require('ocreae')])).toBe('heavy-armor');
    expect(armorSkillFor([db.require('thorax-coriaceus'), db.require('galea-gallica')])).toBe('light-armor');
    expect(armorSkillFor([db.require('tunica')])).toBeNull();
  });

  it('Punctim: thrusts +25% against mail and plate; Padded: −20% blunt damage taken', () => {
    const s = stats({});
    const plain = computeAttack(s, gladius.weapon, { item: gladius });
    s.grantPerk('perk-blades-punctim');
    const punct = computeAttack(s, gladius.weapon, { item: gladius });
    expect(resolveHit({ attack: punct, armor: 0, family: 'mail' }).damage / resolveHit({ attack: plain, armor: 0, family: 'mail' }).damage).toBeCloseTo(1.25);
    expect(resolveHit({ attack: punct, armor: 0, family: 'cloth' }).damage).toBeCloseTo(resolveHit({ attack: plain, armor: 0, family: 'cloth' }).damage);
    const d = stats({});
    const club = computeAttack(flatStats(20), db.require('fustis').weapon);
    const before = resolveHit({ attack: club, armor: 0, defender: d }).damage;
    d.grantPerk('perk-light-armor-padded');
    expect(resolveHit({ attack: club, armor: 0, defender: d }).damage / before).toBeCloseTo(0.8);
  });
});

describe('blocking and parrying (§6.4)', () => {
  it('mitigation: shield value or weapon-only (blades 0.45, two-handed 0.55, fists 0.25) + Shield/400 (max +0.25), cap 0.95', () => {
    const s = stats({ shield: 0 });
    expect(resolveBlock(s, { damage: 20, shield: scutum.shield, stamina: 100 }).mitigation).toBeCloseTo(0.85);
    expect(resolveBlock(s, { damage: 20, stamina: 100 }).mitigation).toBeCloseTo(0.45);
    expect(resolveBlock(s, { damage: 20, stamina: 100, twoHanded: true }).mitigation).toBeCloseTo(0.55);
    expect(resolveBlock(s, { damage: 20, stamina: 100, fists: true }).mitigation).toBeCloseTo(0.25);
    s.setSkill('shield', 40);
    expect(resolveBlock(s, { damage: 20, stamina: 100 }).mitigation).toBeCloseTo(0.55);
    s.setSkill('shield', 100);
    expect(resolveBlock(s, { damage: 20, shield: scutum.shield, stamina: 100 }).mitigation).toBe(0.95);
  });

  it('stamina per absorbed hit = max(4, 0.6 × raw × (1 − Shield/200)); at 0 stamina the guard breaks', () => {
    const s = stats({ shield: 0 });
    expect(resolveBlock(s, { damage: 20, shield: scutum.shield, stamina: 100 }).staminaCost).toBeCloseTo(12);
    expect(resolveBlock(s, { damage: 2, shield: scutum.shield, stamina: 100 }).staminaCost).toBe(4);
    s.setSkill('shield', 100);
    expect(resolveBlock(s, { damage: 20, shield: scutum.shield, stamina: 100 }).staminaCost).toBeCloseTo(6);
    const broken = resolveBlock(s, { damage: 50, shield: scutum.shield, stamina: 5 });
    expect(broken).toMatchObject({ guardBroken: true, staminaCost: 5 });
    expect(COMBAT.guardBreakStagger).toBe(1.2);
  });

  it('sica and falx hook round shields; the falx sweep is unblockable; Shield Wall helps with allies', () => {
    const s = stats({ blades: 0 });
    const sica = db.require('sica');
    const falx = db.require('falx');
    expect(computeAttack(s, sica.weapon, { item: sica }).blockIgnore).toBe(0.25);
    expect(computeAttack(s, falx.weapon, { item: falx }).blockIgnore).toBe(0.5);
    const sweep = computeAttack(s, falx.weapon, { item: falx, power: true, direction: 'sideways' });
    expect(sweep.unblockable).toBe(true);
    expect(resolveHit({ attack: sweep, armor: 0, block: { stats: flatStats(50), shield: scutum.shield, stamina: 100 } }).blocked).toBe(false);
    const hook = stats({});
    hook.grantPerk('perk-blades-falx-hook');
    expect(computeAttack(hook, sica.weapon, { item: sica }).blockIgnore).toBe(0.5);
    const wall = stats({ shield: 0 });
    wall.grantPerk('perk-shield-wall');
    expect(resolveBlock(wall, { damage: 10, shield: scutum.shield, stamina: 100, alliesNear: 3 }).mitigation).toBeCloseTo(0.95);
  });

  it('missiles: scutum 100%, parma 70%; no shield, no block; Testudo blocks them for 0 stamina', () => {
    const parma = db.require('parma');
    expect(missileBlocked(scutum.shield, 0.99)).toBe(true);
    expect(missileBlocked(parma.shield, 0.69)).toBe(true);
    expect(missileBlocked(parma.shield, 0.71)).toBe(false);
    expect(missileBlocked(undefined, 0)).toBe(false);
    expect(resolveBlock(flatStats(0), { damage: 20, stamina: 100, ranged: true }).mitigation).toBe(0);
    const t = stats({});
    t.grantPerk('perk-shield-testudo');
    expect(resolveBlock(t, { damage: 20, shield: scutum.shield, stamina: 100, ranged: true }).staminaCost).toBe(0);
  });

  it('parry: 0.20 s window on Normalis (Tiro 0.40, Herculea 0.10, +0.06 with the perk); power attacks only with a shield', () => {
    const s = stats({});
    expect(parryWindow(s)).toBeCloseTo(0.2);
    expect(parryWindow(s, 'tiro')).toBeCloseTo(0.4);
    expect(parryWindow(s, 'herculea')).toBeCloseTo(0.1);
    s.grantPerk('perk-shield-parry-plus');
    expect(parryWindow(s)).toBeCloseTo(0.26);
    expect(resolveParry({ attackerPoiseMax: 60, withShield: false })).toEqual({ parried: true, attackerPoiseLoss: 36, attackerStagger: 1, riposteWindow: 0.8 });
    expect(resolveParry({ attackerPoiseMax: 60, power: true, withShield: false }).parried).toBe(false);
    expect(resolveParry({ attackerPoiseMax: 60, power: true, withShield: true }).parried).toBe(true);
  });

  it('difficulty: the player deals ×dealt and takes ×taken; NPC against NPC ×1', () => {
    expect(difficultyMult('normalis', true)).toBe(1);
    expect(difficultyMult('normalis', false)).toBe(1.5);
    expect(difficultyMult('normalis', false, false)).toBe(1);
    expect(difficultyMult('tiro', false)).toBe(0.5);
    expect(difficultyMult('herculea', true)).toBe(0.75);
  });
});

describe('poise (§6.5)', () => {
  it('Jupiter’s blessing and a vow each cut damage taken by 10%', () => {
    const d = stats({});
    const a = computeAttack(flatStats(20), gladius.weapon);
    const base = resolveHit({ attack: a, armor: 0, defender: d }).damage;
    d.applyCondition('benedictio-iuppiter');
    expect(resolveHit({ attack: a, armor: 0, defender: d }).damage / base).toBeCloseTo(0.9);
    d.applyCondition('votum');
    expect(resolveHit({ attack: a, armor: 0, defender: d }).damage / base).toBeCloseTo(0.8);
  });

  it('player poise: 50, +12 heavy body, +20 shield raised, +20 old wound, +30 drill, survivor +10 per extra enemy, Mithras +15', () => {
    const s = stats({});
    expect(playerPoise(s)).toBe(50);
    expect(playerPoise(s, { heavyBody: true, shieldRaised: true })).toBe(82);
    s.setFlagSource('origin', ['trait-old-wound']);
    expect(playerPoise(s)).toBe(70);
    s.grantPerk('perk-heavy-armor-drill');
    expect(playerPoise(s, { heavyBody: true })).toBe(112);
    const d = stats({});
    d.setFlagSource('origin', ['trait-survivor']);
    expect(playerPoise(d, { enemies: 5 })).toBe(80);
    d.setModifierSource('patron', { 'poise.max': 15 });
    expect(playerPoise(d, { enemies: 1 })).toBe(65);
  });

  it('flinch only from hits ≥ 20% of max; breaks into stagger (0.8 s light, 1.5 s heavy); knockdown 2 s; regen 15/s after 1.5 s', () => {
    const p = createPoise(50);
    expect(applyPoiseDamage(p, 5).result).toBe('none');
    expect(applyPoiseDamage(p, 12).result).toBe('flinch');
    expect(applyPoiseDamage(p, 40)).toEqual({ result: 'stagger', seconds: 0.8 });
    expect(p.current).toBe(50);
    applyPoiseDamage(p, 20);
    expect(applyPoiseDamage(p, 40, { heavy: true })).toEqual({ result: 'stagger', seconds: 1.5 });
    expect(applyPoiseDamage(p, 1, { knockdown: true })).toEqual({ result: 'knockdown', seconds: 2 });
    expect(applyPoiseDamage(p, 99, { immune: true }).result).toBe('none');
    applyPoiseDamage(p, 30);
    tickPoise(p, 1);
    expect(p.current).toBe(20);
    tickPoise(p, 1);
    tickPoise(p, 1);
    expect(p.current).toBe(35);
  });

  it('poise damage: stagger × light 1, power 2.5, bash 2, sprint 1.5', () => {
    const s = flatStats(0);
    expect(computeAttack(s, gladius.weapon).poise).toBe(12);
    expect(computeAttack(s, gladius.weapon, { power: true }).poise).toBe(30);
    expect(computeAttack(s, gladius.weapon, { bash: true }).poise).toBe(24);
    expect(computeAttack(s, gladius.weapon, { sprint: true }).poise).toBe(18);
  });
});

describe('enemy tiers (§6.11)', () => {
  it('fixed stats from the table, kits, and bands', () => {
    expect(combatProfileFor('thug')).toMatchObject({ tier: 'thug', health: 45, stamina: 60, armor: 0, armorFamily: 'cloth', damageMult: 0.9, weapon: 'fustis', skill: 15, yieldAt: 0.25, fleeAt: 0.15, loot: 'thug' });
    expect(combatProfileFor('thug', { kit: 'pugio' }).weapon).toBe('pugio');
    expect(combatProfileFor('miles', { kit: 1 })).toMatchObject({ armor: 45, armorFamily: 'mail', shield: 'scutum-ovale' });
    expect(combatProfileFor('boss', { health: 700 }).health).toBe(700);
    expect(tierDef('elite')).toMatchObject({ health: 120, dmgMult: 1.3, reaction: 0.22 });
    expect(tiersInBand(1).map((t) => t.tier)).toEqual(['thug', 'bruiser', 'skirmisher']);
    expect(tiersInBand(3).map((t) => t.tier)).toEqual(['miles', 'veteran', 'champion']);
    expect(tiersInBand(3, { beasts: true }).map((t) => t.tier)).toEqual(['pardus', 'leo', 'ursus', 'taurus']);
    expect(() => combatProfileFor('dragon')).toThrow();
  });

  it('§13.1 archetypes: tier stats with the archetype’s kit; AR from worn pieces unless given', () => {
    const miles = archetypeProfile('miles-urbanus', db);
    expect(miles).toMatchObject({ archetype: 'miles-urbanus', tier: 'miles', health: 70, armor: 50, armorFamily: 'plate', weapon: 'gladius', shield: 'scutum', ranged: 'pilum' });
    const thraex = archetypeProfile('thraex', db, { tier: 'veteran' });
    expect(thraex).toMatchObject({ tier: 'veteran', health: 95, weapon: 'sica', shield: 'parmula', armorFamily: 'cloth' });
    expect(thraex.armor).toBe(13 + 4 + 6); // helmet, manica, greaves
    expect(archetypeProfile('thraex', db).tier).toBe('thug'); // a tiro
    expect(archetypeProfile('sicarius', db)).toMatchObject({ tier: 'veteran', poison: 'aconitum', armor: 20 });
    expect(archetypeProfile('fugitivarius', db).companion).toBe('canis-molossus');
    expect(archetypeProfile('grassator', db, { kit: 1 }).weapon).toBe('fustis');
    expect(archetypeProfile('ebrius-rixator', db)).toMatchObject({ weapon: 'fists', armor: 0 });
    expect(() => archetypeProfile('dragon', db)).toThrow();
    // Every kit names real items or natural weapons, and every tier exists.
    for (const a of allArchetypes()) {
      for (const t of [a.tier].flat()) expect(tierDef(t), `${a.id}:${t}`).toBeTruthy();
      for (const k of a.kits) {
        for (const id of [k.weapon, k.shield, k.ranged, ...(k.worn ?? [])].filter(Boolean) as string[]) expect(db.has(id) || id === 'fists', `${a.id}:${id}`).toBe(true);
        if (k.companion) expect(tierDef(k.companion), k.companion).toBeTruthy();
      }
    }
    expect(ARCHETYPES.filter((a) => a.firstIn.startsWith('v0.1')).map((a) => a.id)).toEqual(['grassator', 'ebrius-rixator', 'collegium-bruiser', 'funditor', 'cloacarius', 'miles-urbanus', 'vigil', 'thraex', 'retiarius']);
  });

  it('beasts bite and claw with their own damage and never yield', () => {
    const bear = combatProfileFor('ursus');
    expect(bear).toMatchObject({ health: 240, poise: 120, yieldAt: 0, beast: true });
    expect(profileWeapon(bear, db)).toMatchObject({ damage: 22, damageType: 'blunt' });
    expect(computeAttack(profileStats(bear), profileWeapon(bear, db)).damage).toBeCloseTo(22);
    expect(profileWeapon(combatProfileFor('civilian'), db).damage).toBe(4);
  });
});

describe('time to kill across levels (TTK table in docs/modules/rpg.md)', () => {
  it('level 1: thugs fall in 3–5 hits, armored soldiers in 6–10; a veteran kills the player in 3–5', () => {
    expect(duel(BUILDS[0], 'thug').hits).toBeGreaterThanOrEqual(3);
    expect(duel(BUILDS[0], 'thug').hits).toBeLessThanOrEqual(5);
    const miles = duel(BUILDS[0], 'miles');
    expect(miles.hits).toBeGreaterThanOrEqual(6);
    expect(miles.hits).toBeLessThanOrEqual(10);
    expect(duel(BUILDS[0], 'veteran', 1).hitsToDie).toBeGreaterThanOrEqual(3);
    expect(duel(BUILDS[0], 'veteran', 1).hitsToDie).toBeLessThanOrEqual(5);
  });

  it('level 10: thugs fall in ≤ 3 hits; soldiers and veterans in 6–10; the soldier needs ~10 on the player in mail', () => {
    expect(duel(BUILDS[1], 'thug').hits).toBeLessThanOrEqual(3);
    for (const t of ['miles', 'veteran']) {
      expect(duel(BUILDS[1], t).hits, t).toBeGreaterThanOrEqual(6);
      expect(duel(BUILDS[1], t).hits, t).toBeLessThanOrEqual(10);
    }
    expect(duel(BUILDS[1], 'miles').hitsToDie).toBeGreaterThanOrEqual(6);
  });

  it('level 30: thugs fall in ≤ 2 hits; elites in 6–10 both ways; a boss lasts', () => {
    expect(duel(BUILDS[2], 'thug').hits).toBeLessThanOrEqual(2);
    const elite = duel(BUILDS[2], 'elite');
    expect(elite.hits).toBeGreaterThanOrEqual(6);
    expect(elite.hits).toBeLessThanOrEqual(10);
    expect(elite.hitsToDie).toBeGreaterThanOrEqual(6);
    expect(duel(BUILDS[2], 'boss').hits).toBeGreaterThanOrEqual(25);
  });

  it('TTK table', () => {
    const table = ttkTable();
    if (process.env.PRINT_TTK) console.log(table);
    expect(table.split('\n').length).toBe(2 + TTK_ROWS.length);
    expect(timeToKill({ damagePerHit: 10, interval: 0.5, health: 95, hitRate: 0.5 })).toEqual({ hits: 10, seconds: 10 });
  });
});
