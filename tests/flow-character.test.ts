import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/rpg/data/items';
import {
  LOOKS,
  PLAYABLE_ORIGINS,
  cleanName,
  defaultName,
  feminineNomen,
  kitWorn,
  lookById,
  looksFor,
  meshKey,
  normalizeSpec,
  originChoices,
  outfitAppearance,
  romanName,
  statusLine,
} from '../src/game/character';

const item = (id: string) => ITEMS.find((i) => i.id === id);

/** A deterministic picker for the name helper. */
function picker(seed = 1) {
  let s = seed;
  return <T>(list: readonly T[]): T => {
    s = (s * 16807) % 2147483647;
    return list[s % list.length];
  };
}

describe('character creation choices (GDD §3, §17.1)', () => {
  it('offers four playable origins and shows the other six locked', () => {
    const rows = originChoices();
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.playable).map((r) => r.def.id).sort()).toEqual([...PLAYABLE_ORIGINS].sort());
    expect(rows.filter((r) => !r.playable)).toHaveLength(6);
    for (const r of rows.filter((x) => !x.playable)) expect(r.locked).toMatch(/v0\.2/);
    // Playable first.
    expect(rows.slice(0, 4).every((r) => r.playable)).toBe(true);
  });

  it('has three appearance presets per sex', () => {
    expect(looksFor('male')).toHaveLength(3);
    expect(looksFor('female')).toHaveLength(3);
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
    for (const l of LOOKS) {
      expect(l.height).toBeGreaterThanOrEqual(1.5);
      expect(l.height).toBeLessThanOrEqual(1.85);
    }
    // A preset of the other sex falls back to that sex's first.
    expect(lookById('m-urbanus', 'female').sex).toBe('female');
  });
});

describe('dress follows the equipment (§8.2)', () => {
  it('dresses the Subura-born plebeian in his kit', () => {
    const app = outfitAppearance(lookById('m-urbanus', 'male'), kitWorn('civis-suburanus', item));
    expect(app.garments.map((g) => g.kind)).toEqual(['tunica', 'paenula']);
    expect(app.footwear).toBe('calcei');
    expect(app.weapon).toBe('fustis');
    expect(app.shield?.model).toBe('none');
    // The toga is in the pack, not worn.
    expect(app.garments.some((g) => g.kind === 'toga')).toBe(false);
  });

  it('gives a woman the long tunic and no beard', () => {
    const app = outfitAppearance(lookById('f-plebeia', 'female'), kitWorn('hispanus', item));
    expect(app.garments[0].kind).toBe('tunica-long');
    expect(app.beard).toBeUndefined();
    expect(app.weapon).toBe('gladius');
    expect(app.footwear).toBe('barefoot');
  });

  it('arms the veteran with his helmet, oval shield and hobnailed boots', () => {
    const app = outfitAppearance(lookById('m-durus', 'male'), kitWorn('veteranus', item));
    expect(app.armor?.helmet?.kind).toBe('imperial-gallic');
    expect(app.shield?.model).toBe('scutum-oval');
    expect(app.footwear).toBe('caligae');
    expect(app.garments.map((g) => g.kind)).toEqual(['tunica', 'sagum']);
  });

  it('puts the Dacian in trousers when he wears them, and a loincloth when he wears nothing', () => {
    const app = outfitAppearance(lookById('m-peregrinus', 'male'), { under: item('tunica'), legs: item('bracae') });
    expect(app.garments.map((g) => g.kind)).toEqual(['tunica', 'braccae']);
    expect(outfitAppearance(lookById('m-urbanus', 'male'), {}).garments[0].kind).toBe('subligaculum');
    expect(outfitAppearance(lookById('f-matrona', 'female'), {}).garments[0].kind).toBe('tunica-long');
  });

  it('rebuilds the mesh for clothes but not for weapons', () => {
    const look = lookById('m-urbanus', 'male');
    const a = outfitAppearance(look, { under: item('tunica'), mainHand: item('gladius') });
    const b = outfitAppearance(look, { under: item('tunica'), mainHand: item('fustis') });
    const c = outfitAppearance(look, { under: item('tunica'), cloak: item('toga'), mainHand: item('gladius') });
    expect(meshKey(a)).toBe(meshKey(b));
    expect(meshKey(a)).not.toBe(meshKey(c));
  });
});

describe('Roman names (§3.6)', () => {
  it('builds citizen names: tria nomina for men, nomen + cognomen for women', () => {
    for (let i = 1; i < 30; i++) {
      const m = romanName('civis-suburanus', 'male', picker(i));
      expect(m.split(' ')).toHaveLength(3);
      const f = romanName('hispanus', 'female', picker(i));
      const [nomen, cog] = f.split(' ');
      expect(nomen.endsWith('a')).toBe(true);
      expect(cog).toBeTruthy();
    }
  });

  it('names a Dacian (Junian Latin) "X, son of Y"', () => {
    for (let i = 1; i < 20; i++) {
      expect(romanName('dacus', 'male', picker(i))).toMatch(/^\S+, son of \S+$/);
      expect(romanName('dacus', 'female', picker(i))).toMatch(/^\S+, daughter of \S+$/);
    }
  });

  it('feminizes nomina and cleans typed names', () => {
    expect(feminineNomen('Ulpius')).toBe('Ulpia');
    expect(feminineNomen('Annius')).toBe('Annia');
    expect(cleanName('  Marcus   Ulpius  ', 'hispanus', 'male')).toBe('Marcus Ulpius');
    expect(cleanName('   ', 'dacus', 'male')).toBe(defaultName('dacus', 'male'));
    expect(cleanName('x'.repeat(80), 'dacus', 'male')).toHaveLength(40);
  });

  it('normalizes a saved or partial spec', () => {
    const s = normalizeSpec({ sex: 'female', origin: 'nowhere', look: 'm-durus' });
    expect(s.origin).toBe('civis-suburanus');
    expect(s.look.startsWith('f-')).toBe(true);
    expect(s.name).toBe(defaultName('civis-suburanus', 'female'));
    expect(normalizeSpec(null).sex).toBe('male');
    expect(statusLine(normalizeSpec({ origin: 'dacus' }))).toMatch(/Junian Latin/);
  });
});
