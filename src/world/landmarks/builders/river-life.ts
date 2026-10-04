/**
 * Things the river-district landmarks and bridges hand to the running game once its services
 * exist, instead of baking them into static meshes:
 *
 *  - LAMPS: altar fires, the Ara Maxima's tripods, braziers, quay lamps, stall and shop lamps,
 *    requested from the sky module's light pool (`game.lights`, installed after the world is built).
 *    Altar fires and braziers burn day and night; lamps and torches are lit at dusk (`night`).
 *  - READABLE THINGS: every inscription spot with a known text (`RIVER_TEXTS`) gets an
 *    "E — Read" interaction that opens the Latin with an English gloss in the book reader. The ids
 *    are `river:<spot id>` so a later generic pass over `PlacedLandmark.spots` can skip them.
 *
 * Builders work in LOCAL space; this module converts to world space with the same placement
 * buildLandmarks() uses (centre on the terrain, rotation from the facade bearing). Everything is
 * a no-op without a running game (unit tests build against a bare `{ heightmap }`), and nothing is
 * created per frame.
 */
import * as THREE from 'three';
import type { Game, System } from '../../../core/Game';
import { bearingToRotationY } from '../../../core/math';
import type { LandmarkContext, Spot } from '../types';

export type LampKind = 'fire' | 'brazier' | 'lamp' | 'torch';

/** Light pool parameters per kind (warm flames; fires and braziers always burn). */
const LAMP: Record<LampKind, { intensity: number; distance: number; night: boolean; glow: number; flicker: number; priority: number }> = {
  fire: { intensity: 18, distance: 10, night: false, glow: 0.5, flicker: 0.45, priority: 1.3 },
  brazier: { intensity: 22, distance: 11, night: false, glow: 0.55, flicker: 0.45, priority: 1.3 },
  torch: { intensity: 14, distance: 9, night: true, glow: 0.35, flicker: 0.4, priority: 1 },
  lamp: { intensity: 7, distance: 6, night: true, glow: 0.2, flicker: 0.25, priority: 0.9 },
};

/** Inscriptions the player can read: Latin as carved (lines split by ' / ') and an English gloss. */
export const RIVER_TEXTS: Record<string, { title: string; latin: string; gloss: string }> = {
  'temple-portunus:notice': {
    title: 'Notice on the Temple of Portunus',
    latin: 'PORTVNALIA / A·D·XVI·K·SEPT',
    gloss: 'The Portunalia, on the sixteenth day before the Kalends of September (17 August): the feast of Portunus, god of harbours, gates and keys. Keys are thrown into the fire for luck.',
  },
  'temple-hercules-victor:dedication': {
    title: 'Altar of Hercules Victor',
    latin: 'HERCVLI · VICTORI / SACRVM',
    gloss: 'Sacred to Hercules the Victor. The oil merchants of the river port keep this round marble temple; they call him Hercules Olivarius.',
  },
  'ara-maxima:dedication': {
    title: 'Base of the Hercules of the Ara Maxima',
    latin: 'HERCVLI / INVICTO',
    gloss: 'To Hercules the Unconquered. Here, they say, Hercules himself set up the Greatest Altar after killing the cattle thief Cacus. Merchants still pay him a tenth of their profits; no women may take part in the rite.',
  },
  'forum-holitorium:measures': {
    title: 'Table of standard measures',
    latin: 'MENSA·PONDERARIA / AED·CVR',
    gloss: 'Table of measures, set up by the curule aediles. Buyers who doubt a greengrocer\'s measure may test it in these hollows.',
  },
  'forum-holitorium:edict': {
    title: 'Edict of the aediles',
    latin: 'EDICTVM AEDILIVM / DE PRETIIS OLERVM',
    gloss: 'Edict of the aediles on the prices of vegetables. Below, in smaller letters: cabbages, leeks, lettuces, turnips, beans; whoever sells above the price shall be fined.',
  },
  'temple-janus-holitorium:dedication': {
    title: 'Temple of Janus',
    latin: 'IANO / TI·CAESAR·AVGVSTVS·RESTITVIT',
    gloss: 'To Janus. Tiberius Caesar Augustus restored it. Built by Gaius Duilius after his sea victory over Carthage (260 BC).',
  },
  'temple-juno-sospita:dedication': {
    title: 'Temple of Juno Sospita',
    latin: 'IVNONI·SOSPITAE·MATRI·REGINAE',
    gloss: 'To Juno the Saviour, Mother and Queen.',
  },
  'temple-spes:dedication': {
    title: 'Temple of Hope',
    latin: 'SPEI / TI·CAESAR·AVGVSTVS·RESTITVIT',
    gloss: 'To Hope. Tiberius Caesar Augustus restored it.',
  },
  'columna-lactaria:inscription': {
    title: 'The Milk Column',
    latin: 'COLVMNA / LACTARIA',
    gloss: 'The Milk Column. Parents who cannot feed a child leave it here; wet-nurses wait to be hired, and milk is poured out as an offering.',
  },
  'theatre-marcellus:playbill': {
    title: 'Playbill',
    latin: 'LVDI APOLLINARES / PRIDIE NONAS IVLIAS / IN THEATRO MARCELLI',
    gloss: 'The Games of Apollo, from the day before the Nones of July (6 July), in the Theatre of Marcellus.',
  },
  'theatre-marcellus:dedication': {
    title: 'Dedication over the royal door',
    latin: 'IMP·CAESAR·VESPASIANVS·AVG / SCAENAM·RESTITVIT',
    gloss: 'The Emperor Caesar Vespasian Augustus restored the stage.',
  },
  'temple-apollo-sosianus:dedication': {
    title: 'Temple of Apollo',
    latin: 'APOLLINI·MEDICO / C·SOSIVS·COS·FECIT',
    gloss: 'To Apollo the Healer. Gaius Sosius, consul, built it.',
  },
  'porticus-octaviae:horsemen': {
    title: 'Base of the bronze horsemen',
    latin: 'TVRMA·ALEXANDRI·OPVS·LYSIPPI / Q·METELLVS·MACEDONICVS·EX·MACEDONIA·ADVEXIT',
    gloss: 'The squadron of Alexander, the work of Lysippus. Quintus Metellus Macedonicus brought it from Macedonia.',
  },
  'circus-flaminius:arch-germanicus': {
    title: 'Arch of Germanicus',
    latin: 'SENATVS·POPVLVSQVE·ROMANVS / GERMANICO·CAESARI·TI·AVGVSTI·F',
    gloss: 'The Senate and People of Rome, to Germanicus Caesar, son of Tiberius Augustus.',
  },
  'circus-flaminius:arch-drusus': {
    title: 'Arch of Drusus',
    latin: 'SENATVS·POPVLVSQVE·ROMANVS / DRVSO·CAESARI·TI·AVGVSTI·F',
    gloss: 'The Senate and People of Rome, to Drusus Caesar, son of Tiberius Augustus.',
  },
  'portus-tiberinus:notice': {
    title: 'Harbour office',
    latin: 'STATIO / PORTVS·TIBERINI',
    gloss: 'Station of the Tiber Port. Barge masters declare their cargo here and pay the dues.',
  },
  'portus-tiberinus:horrea': {
    title: 'Sign over the storerooms',
    latin: 'HORREA / VINVM·OLEVM·LATERES',
    gloss: 'Storerooms: wine, oil, bricks. Cellae to let by the month.',
  },
  'temple-aesculapius:ex-voto': {
    title: 'Votive tablet',
    latin: 'AESCVLAPIO·DEO / VOTVM·SOLVIT·LIBENS·MERITO',
    gloss: 'To the god Aesculapius: he fulfilled his vow willingly and deservedly. A pair of terracotta feet hangs beside it.',
  },
  'island-prow:relief': {
    title: 'Relief on the prow',
    latin: '',
    gloss: 'Carved in the travertine of the island\'s prow: Aesculapius with his staff, the sacred serpent coiled round it. The serpent came from Epidaurus by ship in 291 BC and swam ashore here.',
  },
  'island-obelisk:glyphs': {
    title: 'The island\'s obelisk',
    latin: '',
    gloss: 'Egyptian signs cut in the granite: birds, eyes, reeds. Nobody in Rome can read them. The obelisk stands for the mast of the stone ship.',
  },
  'forum-boarium:edict': {
    title: 'Notice by the cattle pens',
    latin: 'BOVES·VENALES / NVNDINIS',
    gloss: 'Oxen for sale on market days. Every beast sold to be declared to the aediles.',
  },
  'forum-boarium:shrine-board': {
    title: 'Board of the cattle dealers',
    latin: 'NEGOTIATORES·BOARII / HERCVLI·DECVMAM',
    gloss: 'The cattle dealers to Hercules, the tenth part. They pay the god a tithe of their profits at the Ara Maxima.',
  },
  'pons-fabricius:inscription-b': {
    title: 'Inscription of the Pons Fabricius',
    latin: 'L·FABRICIVS·C·F·CVR·VIAR / FACIVNDVM·COERAVIT',
    gloss: 'Lucius Fabricius, son of Gaius, curator of roads, had it built (62 BC).',
  },
  'pons-fabricius:inscription-a': {
    title: 'Inscription on the parapet',
    latin: 'Q·LEPIDVS·M·F·M·LOLLIVS·M·F·COS / EX·S·C·PROBAVERVNT',
    gloss: 'Quintus Lepidus, son of Marcus, and Marcus Lollius, son of Marcus, consuls, approved it by decree of the Senate (21 BC).',
  },
};

interface Pending {
  lamps: { p: THREE.Vector3; kind: LampKind }[];
  reads: { id: string; p: THREE.Vector3; title: string; text: string }[];
  system: LifeSystem | null;
}

const pending = new WeakMap<object, Pending>();

function live(game: Game | undefined): Game | null {
  return game && typeof (game as { addSystem?: unknown }).addSystem === 'function' && game.scene ? game : null;
}

function queue(game: Game): Pending {
  let q = pending.get(game);
  if (!q) {
    q = { lamps: [], reads: [], system: null };
    pending.set(game, q);
  }
  if (!q.system) {
    q.system = new LifeSystem(game, q);
    game.addSystem(q.system);
  }
  return q;
}

/** Local → world transform of the landmark being built (same placement as buildLandmarks). */
export function landmarkMatrix(ctx: Pick<LandmarkContext, 'game' | 'lm' | 'S'>): THREE.Matrix4 {
  const { lm, S } = ctx;
  const gx = lm.center[0] * S;
  const gz = lm.center[1] * S;
  const hm = ctx.game.heightmap;
  const y = hm ? hm.heightAt(gx, gz) : 0;
  return new THREE.Matrix4().makeRotationY(bearingToRotationY(lm.rotation)).setPosition(gx, y, gz);
}

/** Collects the lamps of one landmark (local points) and queues them in world space at the end. */
export class LampList {
  readonly items: { x: number; y: number; z: number; kind: LampKind }[] = [];
  add(x: number, y: number, z: number, kind: LampKind = 'lamp') {
    this.items.push({ x, y, z, kind });
    return this;
  }
}

/**
 * Hand a landmark's lamps and readable inscriptions to the running game. Call once at the end of
 * a builder with its LOCAL spots and lamps.
 */
export function riverLife(ctx: LandmarkContext, spots: readonly Spot[], lamps?: LampList) {
  const game = live(ctx.game);
  if (!game) return;
  const m = landmarkMatrix(ctx);
  const rotY = bearingToRotationY(ctx.lm.rotation);
  const q = queue(game);
  for (const l of lamps?.items ?? []) q.lamps.push({ p: new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(m), kind: l.kind });
  for (const s of spots) {
    if (s.kind !== 'inscription') continue;
    const r = readable(s.id, s.position.clone().applyMatrix4(m), (s.heading ?? 0) + rotY);
    if (r) q.reads.push(r);
  }
}

/** Readables for WORLD-space spots (the bridges publish theirs in world space). */
export function riverReadables(game: Game, spots: readonly Spot[]) {
  if (!live(game)) return;
  const q = queue(game);
  for (const s of spots) {
    if (s.kind !== 'inscription') continue;
    const r = readable(s.id, s.position, s.heading ?? 0);
    if (r) q.reads.push(r);
  }
}

/** The thing read sits ~1.5 m above the spot, a metre ahead of where the reader stands. */
function readable(id: string, at: THREE.Vector3, heading: number) {
  const t = RIVER_TEXTS[id];
  if (!t) return null;
  const p = at.clone().add(new THREE.Vector3(Math.sin(heading) * 1.0, 1.5, Math.cos(heading) * 1.0));
  const latin = t.latin ? `${t.latin.split(' / ').join('\n')}\n\n` : '';
  return { id: `river:${id}`, p, title: t.title, text: `${latin}*${t.gloss}*` };
}

class LifeSystem implements System {
  readonly name = 'river-life';
  /** Just before the world registry's culling (95). */
  readonly priority = 94;
  private frames = 0;

  constructor(
    private readonly game: Game,
    private readonly q: Pending,
  ) {}

  lateUpdate() {
    const { game, q } = this;
    // Wait two frames so a burst of landmark builds finishes queueing before the first flush.
    if (++this.frames < 2) return;
    if (q.lamps.length && game.lights) {
      for (const l of q.lamps) {
        const o = LAMP[l.kind];
        game.lights.request({ position: l.p, intensity: o.intensity, distance: o.distance, night: o.night, glow: o.glow, flicker: o.flicker, priority: o.priority });
      }
      q.lamps.length = 0;
    }
    if (q.reads.length && game.interactions) {
      for (const r of q.reads) {
        game.interactions.add({
          id: r.id,
          position: () => r.p,
          reach: 3.2,
          verb: () => 'Read',
          label: () => r.title,
          interact: (g) => g.ui?.openBook({ title: r.title, kind: 'tablet', text: r.text }),
        });
      }
      q.reads.length = 0;
    }
    // Stay registered (cheap) only while something still waits for its service.
    if (!q.reads.length && (!q.lamps.length || !game.lights) && this.frames > 600) {
      game.removeSystem(this);
      q.system = null;
    }
  }
}
