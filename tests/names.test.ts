/**
 * Name audit (rework M1): every name the player can read, from the atlas through LocationDefs to
 * the map, is unique, free of research notes, free of modern or medieval names, and carries a
 * Latin line that is Latin. Research and citations: docs/research/names-audit.md.
 */
import { describe, expect, it } from 'vitest';
import { AQUEDUCTS, BRIDGES, GATES, HILLS, LANDMARKS, ROADS } from '../src/data/atlas';
import { CONTENT_LOCATIONS, FRONT_SPOTS, WORLD_SPOTS } from '../src/content/places';
import { atlasLocations, displayLatin, displayName, hillLocation, lowlandLocations, namedHills } from '../src/game/locations';
import { AtlasMapSource, mapLabels, mapLandmarks } from '../src/game/mapSource';

/** Names that did not exist in AD 113 (modern, Italian or medieval), banned from player text. */
const FORBIDDEN = [
  'Vatican Pyramid', 'Meta Romuli', 'Potsherds', 'Testaccio', 'Testaceus', 'Seven Halls', 'Sette Sale',
  'Parthian Arch', 'Passageway', 'formerly', 'Trastevere', 'Ara Coeli', 'Aracoeli', 'Colosseum',
  'Pincian', 'Monteverde', 'Largo', 'Area Sacra', 'Sacred Area', 'Domus Flavia', 'Rampa', 'Mercat',
  'Auditorium of Maecenas', 'Porta Maggiore', 'Biberatica', 'medieval', 'modern', 'anchor', 'later',
];

/** Modern Italian endings and words that must not appear as the Latin line. */
const ITALIAN = /\b(?:di|del|della|delle|dei|piazza|via dei|santa|santo|san|torre|monte|mercati|foro)\b/i;

const hillsShown = namedHills();

describe('landmark names', () => {
  it('there are 190+ landmarks, each with a name and a Latin line', () => {
    expect(LANDMARKS.length).toBeGreaterThanOrEqual(190);
    for (const l of LANDMARKS) {
      expect(l.name.trim(), l.id).not.toBe('');
      expect(l.latin.trim(), l.id).not.toBe('');
    }
  });

  it('atlas names carry no parentheses, slashes or question marks (they are clean at the source)', () => {
    for (const l of LANDMARKS) {
      expect(l.name, l.id).not.toMatch(/[()/?]/);
      expect(l.latin, l.id).not.toMatch(/[()?]/);
    }
    for (const h of HILLS) {
      if (h.kind === 'terrace' || h.parent) continue;
      expect(h.name, h.id).not.toMatch(/[()/?]/);
    }
    for (const r of ROADS) {
      expect(r.name, r.id).not.toMatch(/[()?]/);
      if (r.latin) expect(r.latin, r.id).not.toMatch(/[()?]/);
    }
  });

  it('display names are unique across landmarks, named hills and valleys', () => {
    const seen = new Map<string, string>();
    const defs = [...atlasLocations(), ...hillsShown.map((h) => hillLocation(h)), ...lowlandLocations()];
    for (const d of defs) {
      const key = d.name.toLowerCase();
      expect(seen.get(key), `"${d.name}" is shared by ${seen.get(key)} and ${d.id}`).toBeUndefined();
      seen.set(key, d.id);
    }
  });

  it('no forbidden modern or medieval name reaches a banner, the map or a content location', () => {
    const texts: [string, string][] = [];
    for (const d of [...atlasLocations(), ...hillsShown.map((h) => hillLocation(h)), ...lowlandLocations(), ...CONTENT_LOCATIONS]) {
      texts.push([d.id, d.name], [d.id, d.latin ?? '']);
    }
    for (const [k, v] of Object.entries(WORLD_SPOTS)) texts.push([k, v.name]);
    for (const l of mapLandmarks()) texts.push([l.id, l.name], [l.id, l.latin ?? '']);
    for (const l of mapLabels()) texts.push([l.text, l.text], [l.text, l.latin ?? '']);
    for (const [id, t] of texts) {
      for (const bad of FORBIDDEN) expect(t.toLowerCase(), `${id}: "${t}"`).not.toContain(bad.toLowerCase());
    }
  });

  it('the Latin line is Latin: present on landmarks, not Italian', () => {
    for (const l of LANDMARKS) {
      const lat = displayLatin(l.latin, displayName(l.name));
      // A Latin line may be omitted on screen only because it repeats the English name.
      if (!lat) expect(displayName(l.name).toLowerCase(), l.id).toBe(l.latin.split(/\s+\/\s+/)[0].toLowerCase());
      else expect(lat, l.id).not.toMatch(ITALIAN);
    }
    for (const h of hillsShown) expect(displayLatin(h.latin), h.id).toBeTruthy();
  });

  it('the previously colliding places now read differently', () => {
    const name = (id: string) => displayName(LANDMARKS.find((l) => l.id === id)!.name);
    expect(name('temple-castor-pollux')).not.toBe(name('temple-castor-in-circo'));
    expect(name('iseum-campense')).not.toBe(name('iseum-labicana'));
    expect(name('arch-augustus')).not.toBe(name('arch-augustus-tiburtina'));
    expect(name('bibliotheca-ulpia-east')).not.toBe(name('bibliotheca-ulpia-west'));
  });

  it('modern facts moved to codexNote, which is out-of-world text', () => {
    const note = (id: string) => LANDMARKS.find((l) => l.id === id)?.codexNote ?? '';
    expect(note('meta-romuli')).toMatch(/Vatican Pyramid/);
    expect(note('monte-testaccio')).toMatch(/Testaccio/);
    expect(note('sette-sale')).toMatch(/Sette Sale/);
    expect(note('colossus-sol')).toMatch(/Nero/);
    expect(note('arch-augustus')).toMatch(/Parthian Arch/);
    expect(note('forum-nerva')).toMatch(/Passageway/);
  });
});

describe('name pipeline', () => {
  it('map, content locations and front spots agree with the banner', () => {
    const map = new Map(mapLandmarks().map((l) => [l.id, l.name]));
    const banner = new Map(atlasLocations().map((d) => [d.id, d.name]));
    for (const [id, n] of banner) if (map.has(id)) expect(map.get(id), id).toBe(n);
    for (const d of CONTENT_LOCATIONS) {
      const b = banner.get(d.id);
      if (b && !d.id.includes(':')) expect(d.name, d.id).toBe(b);
    }
    for (const f of FRONT_SPOTS) expect(f.name, f.id).toMatch(/^Before (?:the )?[A-Z]/);
    expect(FRONT_SPOTS.find((f) => f.id === 'column-trajan:front')?.name).toBe("Before Trajan's Column");
  });

  it('no content location shows a parenthesis', () => {
    for (const d of CONTENT_LOCATIONS) expect(d.name, d.id).not.toMatch(/[()]/);
  });

  it('map labels and road names carry no notes', () => {
    for (const l of mapLabels()) {
      expect(l.text).not.toMatch(/[()]/);
      if (l.latin) expect(l.latin).not.toMatch(/[()]/);
    }
    const src = new AtlasMapSource();
    for (const r of src.roads) expect(r.name, r.name).not.toMatch(/[()?]/);
  });
});

describe('roads, gates, bridges and aqueducts (M5b audit)', () => {
  /** Later names and labels that must not reach the map or the in-world lines. */
  const LATER = ['Colosseum', 'Coliseum', 'Aurelia Vetus', 'Aurelia Nova', 'Rocca', 'Botteghe', 'Mills', 'Aurelian Wall', 'Trastevere'];
  const all = [
    ...ROADS.map((r) => ['road ' + r.id, r.name, r.latin ?? ''] as const),
    ...GATES.map((g) => ['gate ' + g.id, g.name, g.latin] as const),
    ...BRIDGES.map((b) => ['bridge ' + b.id, b.name, b.latin] as const),
    ...AQUEDUCTS.filter((a) => a.kind !== 'underground').map((a) => ['aqueduct ' + a.id, a.name, a.latin] as const),
  ];

  it('no later name or label appears in a road, gate, bridge or aqueduct name', () => {
    for (const [id, en, la] of all) {
      for (const bad of LATER) {
        expect(en, `${id}: "${en}"`).not.toContain(bad);
        expect(la, `${id}: "${la}"`).not.toContain(bad);
      }
    }
  });

  it('their Latin is not Italian and carries no notes once displayed', () => {
    for (const [id, , la] of all) {
      expect(la, id).not.toMatch(ITALIAN);
      expect(displayLatin(la) ?? '', id).not.toMatch(/[()?]/);
    }
  });

  it('the entries renamed in the audit read as the ancient ones', () => {
    expect(ROADS.find((r) => r.id === 'via-aurelia')?.latin).toBe('Via Aurelia');
    expect(ROADS.find((r) => r.id === 'road-between-palatine-and-caelian')?.name).not.toMatch(/Colosseum/);
    expect(LANDMARKS.find((l) => l.id === 'aqua-traiana-terminus')?.name).not.toMatch(/Mills/);
  });
});
