/**
 * What the player can do in the Forum (src/world/landmarks/builders/forum-interactions.ts): every
 * inscription spot reads, every vista and the doors and shrines with a line of flavour can be looked
 * at, no text is left without a spot, and the prompts reach the game's interaction service.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { LANDMARK_BY_ID } from '../src/data/atlas';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import type { Game, System } from '../src/core/Game';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../src/world/landmarks/types';
import { CONFIDENCE, FORUM_LOOKS, forumInteractions, readable } from '../src/world/landmarks/builders/forum-interactions';
import { FORUM_INSCRIPTIONS } from '../src/world/landmarks/builders/forum-data';
import * as square from '../src/world/landmarks/builders/forum-square';
import * as temples from '../src/world/landmarks/builders/forum-temples';
import * as basilicas from '../src/world/landmarks/builders/forum-basilicas';
import * as arches from '../src/world/landmarks/builders/forum-arches';
import * as curia from '../src/world/landmarks/builders/forum-curia';
import * as vesta from '../src/world/landmarks/builders/forum-vesta';
import * as capitol from '../src/world/landmarks/builders/forum-capitol';
import * as velia from '../src/world/landmarks/builders/forum-velia';

const ALL: LandmarkBuilder[] = [square, temples, basilicas, arches, curia, vesta, capitol, velia].flatMap((m) => m.builders);

/** A Game stand-in with the services the interaction hook uses. */
function fakeGame() {
  const systems: System[] = [];
  const added: { id: string; verb: () => string; label: () => string; position: () => THREE.Vector3; interact: (g: Game) => void }[] = [];
  const books: { title: string; text: string }[] = [];
  const subtitles: string[] = [];
  const game = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    addSystem: <T extends System>(s: T) => {
      systems.push(s);
      return s;
    },
    removeSystem: (s: System) => {
      const i = systems.indexOf(s);
      if (i >= 0) systems.splice(i, 1);
    },
    interactions: { add: (i: (typeof added)[number]) => added.push(i) },
    ui: { openBook: (b: { title: string; text: string }) => books.push(b), subtitle: (t: string) => subtitles.push(t) },
  } as unknown as Game;
  return { game, systems, added, books, subtitles };
}

function context(id: string, game: Game): LandmarkContext {
  return { game, lm: LANDMARK_BY_ID[id], S: 0.6, rng: new Rng(`landmark:${id}`), detail: 'high', groundAt: () => 0, builder: () => new MeshBuilder() };
}

const built = new Map<string, LandmarkBuild>();
for (const b of ALL) for (const id of b.handles) built.set(id, b.build(context(id, fakeGame().game)));
const spots: { landmark: string; spot: Spot }[] = [...built].flatMap(([landmark, r]) => (r.spots ?? []).map((spot) => ({ landmark, spot })));

describe('forum readables', () => {
  it('formats the Latin as carved, the English and the confidence grade', () => {
    const r = readable('arch-titus', 'Arch of Titus')!;
    expect(r.title).toBe('Arch of Titus');
    expect(r.text).toContain('SENATVS / POPVLVSQVE · ROMANVS');
    expect(r.text).toContain('*The Senate and People of Rome to the Divine Titus');
    expect(r.text).toContain(CONFIDENCE.A);
    expect(readable('no-such-text')).toBeNull();
  });

  it('every inscription spot has a text', () => {
    const ids = new Set(spots.filter((s) => s.spot.kind === 'inscription').map((s) => s.spot.id));
    for (const id of ids) expect(readable(id, 'x'), id).not.toBeNull();
    // (texts the builders only print on stone, like the Arch of Augustus' Fasti panels, have no reading place of their own)
    expect(ids.size).toBeGreaterThanOrEqual(28);
  });

  it('no grade leaks the wrong way: each text states which of A, B or C it is', () => {
    for (const [id, t] of Object.entries(FORUM_INSCRIPTIONS)) {
      expect(['A', 'B', 'C']).toContain(t.conf);
      expect(readable(id, 'x')!.text).toContain(`[${t.conf}]`);
    }
    // the Column's dedication day is the game's choice (the acta board), not a surviving date
    expect(FORUM_INSCRIPTIONS['acta-diurna'].conf).toBe('C');
    expect(FORUM_INSCRIPTIONS['acta-diurna'].note).toMatch(/18 May/);
  });
});

describe('forum looks', () => {
  it('every vista has a line to look at', () => {
    const vistas = spots.filter((s) => s.spot.kind === 'vista');
    expect(vistas.length).toBeGreaterThanOrEqual(8);
    for (const { spot } of vistas) expect(FORUM_LOOKS[spot.id], spot.id).toBeDefined();
  });

  it('every line belongs to a spot of a built landmark, and the quest doors keep their ids', () => {
    const byId = new Map(spots.map((s) => [s.spot.id, s.spot]));
    // (the causeway's vista exists only where the terrain has the step the causeway bridges)
    for (const id of Object.keys(FORUM_LOOKS).filter((k) => k !== 'summa-sacra-via-vista')) expect(byId.has(id), id).toBe(true);
    for (const id of ['castor-strongroom', 'aerarium-door', 'carcer-door', 'tabularium-door', 'curia-julia']) expect(byId.get(id)?.kind, id).toBe('door');
  });

  it('the lines are short enough for a subtitle and name a verb', () => {
    for (const [id, l] of Object.entries(FORUM_LOOKS)) {
      expect(l.line.length, id).toBeLessThan(260);
      expect(l.verb.length, id).toBeGreaterThan(2);
      expect(l.label.length, id).toBeGreaterThan(3);
    }
  });
});

describe('forum interaction hook', () => {
  it('hands a Read prompt per inscription and a Look per vista to game.interactions once it exists', () => {
    const { game, systems, added, books, subtitles } = fakeGame();
    const id = 'arch-titus';
    const r = built.get(id)!;
    forumInteractions(context(id, game), r.spots ?? []);
    const hook = systems.filter((s) => s.name === 'forum-interactions');
    expect(hook).toHaveLength(1);
    // the service is there: two frames later everything is registered and the system retires
    hook[0].lateUpdate?.(1 / 60);
    hook[0].lateUpdate?.(1 / 60);
    expect(systems.filter((s) => s.name === 'forum-interactions')).toHaveLength(0);
    const reads = added.filter((a) => a.id.startsWith('forum:read:'));
    expect(reads.map((a) => a.id)).toEqual(expect.arrayContaining(['forum:read:arch-titus', 'forum:read:arch-titus-spoils', 'forum:read:arch-titus-triumph']));
    expect(reads[0].verb()).toBe('Read');
    reads.find((a) => a.id === 'forum:read:arch-titus')!.interact(game);
    expect(books).toHaveLength(1);
    expect(books[0].text).toContain('[A]');
    const look = added.find((a) => a.id === 'forum:look:arch-titus-vista')!;
    expect(look.verb()).toBe('Look');
    look.interact(game);
    expect(subtitles).toHaveLength(1);
    // the prompt sits about 1.4 m up, in front of the reader
    expect(look.position().y).toBeGreaterThan(1);
  });

  it('is a no-op without a running game', () => {
    const lm = LANDMARK_BY_ID['arch-titus'];
    const bare = { lm, S: 0.6, rng: new Rng('x'), detail: 'high', groundAt: () => 0, builder: () => new MeshBuilder(), game: {} as Game } as LandmarkContext;
    expect(() => forumInteractions(bare, built.get('arch-titus')!.spots ?? [])).not.toThrow();
  });
});
