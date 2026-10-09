/**
 * The dedication of Trajan's Column (mq-04 §3.4), 12 May AD 113, seen from the player's post by the
 * bronze door. The party walks out of the basilica's back door onto the court, the herald calls for
 * silence and reads the inscription, Trajan pours the libation, and at the shot Bitus looses from the
 * abacus top at Gratus. Then the court panics.
 *
 * Every position is Column-local (src/world/landmarks/columnFrame.ts) and goes to the world through
 * `columnLocalToWorld` with an explicit y: the court floor is hemmed in by roofs and galleries, so no
 * ground ray is used. Without a placed Column the timeline still runs (subtitles, the shot), but no
 * figure is placed and nothing is walked.
 *
 * Staging: figures are a Tableau (src/content/tableau.ts); the timeline and the delayed steps run on
 * game time (src/content/sequence.ts), so the scene pauses with the game. Gratus is a named NPC staged
 * by the population (`unstage`/`direct`/`stage`); the crowd boost, the no-go rectangle, the Apollodorus
 * hold and the trajanExtras switch are all undone by `stop()`.
 */
import * as THREE from 'three';
import { Layer } from '../core/Physics';
import type { Actor, IdleLoop } from '../actors/Actor';
import type { Appearance } from '../actors/appearance';
import type { AvatarRole } from '../actors/avatar/variants';
import type { Game } from '../core/Game';
import { COLUMN_LOCAL, columnHeading, columnLocalToWorld, columnPlaced, columnWorldToLocal, type Local } from '../world/landmarks/columnFrame';
import { say } from './director';
import { Sequence } from './sequence';
import { Tableau, type FigureDef, type FigureFactory } from './tableau';

export type DedicationPhase = 'idle' | 'rite' | 'shot' | 'panic' | 'over';

export interface Dedication {
  readonly phase: DedicationPhase;
  /** The party comes out, the herald, the libation. */
  start(): void;
  /** Gratus starts toward the door; the shot follows 4 s later. Ignored unless the rite runs with no shot set. */
  sealSeen(): void;
  /** Clear the figures, restore extras, the crowd boost, the no-go and the holds. */
  stop(): void;
}

export interface DedicationOptions {
  /** Builds the figures (tests inject a stub; the default makes humanoid Actors). */
  figures?: FigureFactory;
}

/** Court floor height (Column-local y). */
const COURT_Y = 0.03;
/** Tableau's walk arrival radius (m): a walker stops here, and its heading is its walking heading until then. */
const ARRIVE = 0.1;
/** Crowd boost around the Forum of Trajan's centre (MunusDirector pattern). */
const BOOST = 1.6;
const BOOST_RADIUS = 120;
const FORUM = 'forum-trajan';
/** The shot follows the seal (or the 52 s path) by this long (s). */
const SHOT_DELAY = 4;
/** The bow is drawn this long before the arrow flies (s). */
const DRAW_DELAY = 0.6;
/** The arrow's flight (s). */
const FLIGHT_SECONDS = 0.7;
/** The panic starts this long after the arrow lands (s). */
const PANIC_DELAY = 1;
/** Bitus leaves the platform after this long if the player never goes up (s). */
const BITUS_TTL = 60;
/** The party walks out over the first 5 s, the walk-outs 0.4 s apart; the praetorians walk out together. */
const WALK_OUT = 5;
const STAGGER = 0.4;
/** The court rectangle (Column-local x ±7.1, z from the basilica's back wall at −7.0 to 9.5) the crowd is kept out of. */
const COURT = { x: 7.1, zMin: -7.0, zMax: 9.5 };
/** The alarm's centre in the court (Column-local z, toward the party). */
const COURT_CENTRE_Z = -3;

/** The quest's own people, never cleared from the court. */
const STAY = new Set(['npc-gratus', 'npc-crito', 'npc-pudens', 'npc-apollodorus']);
/** Inside the court rectangle (Column-local). */
const inCourtLocal = (x: number, z: number) => Math.abs(x - COLUMN_LOCAL.axis.x) <= COURT.x && z >= COURT.zMin && z <= COURT.zMax;

const GRATUS = 'npc-gratus';
const APOLLODORUS = 'npc-apollodorus';
const TRAJAN = 'npc-traianus';
const BITUS = 'bitus-top';

const INSCRIPTION_1 =
  'SENATVS POPVLVSQVE ROMANVS IMP·CAESARI·DIVI·NERVAE·F·NERVAE TRAIANO AVG·GERM·DACICO PONTIF·MAXIMO TRIB·POT·XVII IMP·VI COS·VI P·P';
const INSCRIPTION_2 = 'AD DECLARANDVM QVANTAE ALTITVDINIS MONS ET LOCVS TANTIS OPERIBVS SIT EGESTVS';
const GLOSS = 'The Senate and People of Rome, to Caesar Trajan… to show how high a hill was cut away for works so great.';

// ---------------------------------------------------------------- the cast

const TOGA = '#f2eee4';

/** The party's looks, from docs/CONTENT.md §2.B (the v0.2 dedication party). */
const PLOTINA: Appearance = {
  sex: 'female', age: 'adult', build: 'slight', height: 1.55, skin: '#DDB48F',
  hair: { style: 'trajanic-tower', color: '#4A3424' },
  garments: [{ kind: 'stola', color: '#5E9A8A' }, { kind: 'palla', color: TOGA }],
  footwear: 'calcei',
};
const MATIDIA: Appearance = {
  sex: 'female', age: 'adult', build: 'average', height: 1.56, skin: '#DDB48F',
  hair: { style: 'trajanic-tower', color: '#2A1D14' },
  garments: [{ kind: 'stola', color: '#6B3A6E' }, { kind: 'palla', color: '#D8A23A' }],
  footwear: 'calcei',
};
const SIMILIS: Appearance = {
  sex: 'male', age: 'adult', build: 'average', height: 1.68, skin: '#B07D58',
  hair: { style: 'cropped', color: '#CFCBC4' }, beard: 'none',
  garments: [{ kind: 'tunica', color: TOGA }, { kind: 'toga', color: TOGA }],
  footwear: 'calcei',
};
const PHAEDIMUS: Appearance = {
  sex: 'male', age: 'young', build: 'slight', height: 1.7, skin: '#DDB48F',
  hair: { style: 'cropped', color: '#2A1D14' }, beard: 'none',
  garments: [{ kind: 'tunica', color: TOGA }],
  footwear: 'soleae',
};
const CELSUS: Appearance = {
  sex: 'male', age: 'middle', build: 'heavy', height: 1.69, skin: '#C99A72',
  hair: { style: 'cropped', color: '#8A8580' }, beard: 'none',
  garments: [{ kind: 'tunica', color: TOGA, clavi: 'wide' }, { kind: 'toga', color: TOGA }],
  footwear: 'calcei',
};
/** No pallium garment kind exists; a lacerna over the tunic stands in for it. */
const CRITO: Appearance = {
  sex: 'male', age: 'middle', build: 'slight', height: 1.64, skin: '#C99A72',
  hair: { style: 'cropped', color: '#8A8580' }, beard: 'full',
  garments: [{ kind: 'tunica', color: TOGA }, { kind: 'lacerna', color: '#8A6A4A' }],
  footwear: 'soleae',
};
const HERALD: Appearance = {
  sex: 'male', age: 'adult', build: 'average', height: 1.7, skin: '#C99A72',
  hair: { style: 'cropped', color: '#4A3424' }, beard: 'none',
  garments: [{ kind: 'toga', color: TOGA, trim: '#6B2A6E' }],
  footwear: 'calcei',
};
/** The cohors togata: togas and no armour. */
const PRAETORIAN: Appearance = {
  sex: 'male', age: 'adult', build: 'average', height: 1.74, skin: '#B07D58',
  hair: { style: 'cropped', color: '#2A1D14' }, beard: 'none',
  garments: [{ kind: 'toga', color: TOGA }],
  footwear: 'calcei',
};

interface Member {
  id: string;
  /** Column-local place on the court floor. */
  at: Local;
  role?: AvatarRole;
  appearance?: Appearance;
  /** A named NPC whose look is the registry's, when the game has one. */
  npc?: string;
}

/** The party, in their shallow arc facing the Column. */
const PARTY: Member[] = [
  { id: 'trajan', at: { x: -1.04, y: COURT_Y, z: -5.0 }, role: 'patrician-man', npc: TRAJAN },
  { id: 'plotina', at: { x: -2.2, y: COURT_Y, z: -5.3 }, appearance: PLOTINA },
  { id: 'matidia', at: { x: -3.0, y: COURT_Y, z: -5.6 }, appearance: MATIDIA },
  { id: 'similis', at: { x: 0.2, y: COURT_Y, z: -5.2 }, appearance: SIMILIS },
  { id: 'phaedimus', at: { x: -1.6, y: COURT_Y, z: -5.8 }, appearance: PHAEDIMUS },
  { id: 'crito', at: { x: 0.9, y: COURT_Y, z: -5.7 }, appearance: CRITO },
  { id: 'celsus', at: { x: -3.8, y: COURT_Y, z: -6.0 }, appearance: CELSUS },
  { id: 'apollodorus', at: { x: 1.8, y: COURT_Y, z: -6.0 }, role: 'greek', npc: APOLLODORUS },
];

/** The six praetorians in togas, facing inward. */
const PRAETORIANS: Member[] = [
  { id: 'pr-0', at: { x: 4.6, y: COURT_Y, z: -5.6 } },
  { id: 'pr-1', at: { x: -4.6, y: COURT_Y, z: -5.6 } },
  { id: 'pr-2', at: { x: 5.2, y: COURT_Y, z: -3.4 } },
  { id: 'pr-3', at: { x: -5.2, y: COURT_Y, z: -3.4 } },
  { id: 'pr-4', at: { x: 5.2, y: COURT_Y, z: -1.0 } },
  { id: 'pr-5', at: { x: -5.2, y: COURT_Y, z: -1.0 } },
].map((m) => ({ ...m, role: 'praetorian' as const, appearance: PRAETORIAN }));

/** The walkers: they come out of the basilica door and go back into it. Crito stays by Gratus. */
const WALKERS: Member[] = [...PARTY, ...PRAETORIANS];
/**
 * Where walker i starts: a step behind its own place, toward the basilica (no further than its back
 * steps: the door itself is in the wall), so each walks straight forward and no two paths cross.
 * The places are at least 0.75 m apart, so no two 0.35 m capsules start inside each other.
 */
const startOf = (i: number): Local => {
  const at = WALKERS[i].at;
  return { x: at.x, y: COURT_Y, z: Math.max(-6.85, at.z - 1.2) };
};
/** Who leaves at the panic (the herald and priest leave too; Crito kneels; the watchers stay). */
const LEAVERS = [...WALKERS.map((m) => m.id).filter((id) => id !== 'crito'), 'herald', 'priest'];

// ---------------------------------------------------------------- the services, read structurally

interface Body {
  position: { x: number; y: number; z: number };
  heading?: number;
}

/** A person of the crowd or a named NPC, as the population hands them out. */
interface PopNpc {
  id: string;
  ambient?: boolean;
  position: { x: number; z: number };
  isFighting?(): boolean;
}

interface PopLike {
  near?(p: { x: number; y: number; z: number }, r: number): PopNpc[];
  undirect?(npc: unknown): void;
  get?(id: string): unknown;
  unstage?(id: string): void;
  direct?(npc: unknown, x: number, z: number, speed: number, arrive?: number): boolean;
  stage?(id: string, x: number, z: number, heading?: number, loop?: IdleLoop | null): boolean;
  alarm?(x: number, z: number, radius?: number, kind?: 'fight' | 'crime' | 'danger'): void;
  holdNamed?(id: string): () => void;
  addNoGo?(test: (x: number, z: number) => boolean): () => void;
  crowdBoost?: ((x: number, z: number) => number) | null;
}

interface CombatLike {
  shootVisual?(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, seconds: number, onArrive?: () => void): void;
}

interface Services {
  population?: PopLike;
  combat?: CombatLike;
  actors?: { get?(id: string): unknown };
  npcs?: { get?(id: string): { appearance?: Appearance } | undefined };
  landmarks?: { get?(id: string): { position: { x: number; z: number } } | undefined };
  trajanExtras?: { enabled: boolean; clear?(): void };
}

/** Phaedimus's cup: a small lathed bronze cup, built once and shared by every figure that holds one. */
let cupGeo: THREE.LatheGeometry | null = null;
let cupMat: THREE.MeshStandardMaterial | null = null;

/** Puts a cup in the figure's right hand (no-op for a figure without a humanoid avatar). */
function holdCup(actor: Actor | null) {
  const hand = (actor?.avatar as { getSocket?(name: string): THREE.Object3D } | null | undefined)?.getSocket?.('handR');
  if (!hand) return;
  cupGeo ??= new THREE.LatheGeometry(
    [new THREE.Vector2(0, 0), new THREE.Vector2(0.035, 0), new THREE.Vector2(0.045, 0.06), new THREE.Vector2(0.05, 0.08)],
    8,
  );
  cupMat ??= new THREE.MeshStandardMaterial({ color: '#B0873A', metalness: 0.6, roughness: 0.4 });
  const cup = new THREE.Mesh(cupGeo, cupMat);
  cup.position.set(0, 0.02, 0.02);
  hand.add(cup);
}

/** A named NPC's body (the Actor if spawned, else the population's NPC), or null. */
function bodyOf(s: Services, id: string): Body | null {
  const b = (s.actors?.get?.(id) ?? s.population?.get?.(id)) as Body | undefined;
  return b?.position ? b : null;
}

/** Local heading from `from` toward `to` (0 = +z, the convention of columnHeading). */
function toward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function createDedication(game: Game, hooks: { onShot(): void }, options: DedicationOptions = {}): Dedication {
  const s = game as unknown as Services;
  let phase: DedicationPhase = 'idle';
  /** Bumped by start() and stop(): a callback from an earlier run does nothing. */
  let token = 0;
  let tableau: Tableau | null = null;
  let timeline: Sequence | null = null;
  let delayed: Sequence[] = [];
  let undo: (() => void)[] = [];
  let shotSet = false;

  /**
   * A Column-local point in the world (null without a placed Column). Court-level points (y < 1.5)
   * take the floor under them, from a short ray cast from just above head height (the court is
   * hemmed in by roofs and galleries, so never from the sky): the basilica's back steps rise
   * there, and a fixed height would put a figure inside a step.
   */
  const world = (p: Local) => {
    const w = columnLocalToWorld(game, p);
    if (!w || p.y >= 1.5) return w;
    const hit = game.physics?.raycast?.({ x: w.x, y: w.y + 2.4, z: w.z }, { x: 0, y: -1, z: 0 }, 4, Layer.World);
    if (hit && hit.distance > 0.01) w.y = hit.point.y;
    return w;
  };
  /** A Column-local heading in the world (the local value without a placed Column). */
  const heading = (local: number) => columnHeading(game, local) ?? local;
  const axis = COLUMN_LOCAL.axis;

  /** Run `fn` once, `t` seconds from now on game time. Stopped by stop(). */
  const later = (t: number, fn: () => void) => {
    delayed = delayed.filter((q) => q.active);
    delayed.push(new Sequence(game).at(t, fn).start());
  };

  /** Walk Gratus halfway to the door. `unstage` first: a staged NPC is held out of their walks until then. */
  const walkGratus = () => {
    const pop = s.population;
    const npc = pop?.get?.(GRATUS);
    const body = bodyOf(s, GRATUS);
    const door = world(COLUMN_LOCAL.door);
    if (!pop || !npc || !body || !door) return;
    pop.unstage?.(GRATUS);
    // The result is not checked: a refusal (he is talking or fighting) leaves him where he stands, and
    // the shot still follows, so the rite never stalls on him.
    pop.direct?.(npc, (body.position.x + door.x) / 2, (body.position.z + door.z) / 2, 1.8, 1.2);
  };

  /** The panic: the party runs for the basilica, Crito kneels by Gratus, the rest leave. */
  const panic = (tb: Tableau) => {
    phase = 'panic';
    const door = COLUMN_LOCAL.basilicaDoor;
    LEAVERS.forEach((id, i) => {
      const to = world({ x: door.x + ((i % 5) - 2) * 0.4, y: door.y, z: door.z });
      const pos = tb.get(id)?.position;
      // A run: fast enough that everyone is at the door by 3.5 s, when they are removed (4 s).
      if (to && pos) tb.walk(id, to, Math.max(1.6, Math.hypot(to.x - pos.x, to.z - pos.z) / 3.5));
    });
    later(4, () => {
      for (const id of LEAVERS) tb.remove(id);
    });
    // Crito steps out of the tableau: the quest's own Crito (npc-crito, talkable) takes his place
    // and runs to Gratus, so there is only ever one of him.
    tb.remove('crito');
    later(12, () => {
      phase = 'over';
    });
  };

  /** The arrow has landed: Gratus falls, the court screams, the panic follows. */
  const landed = (t: number) => {
    if (t !== token || phase !== 'rite') return;
    phase = 'shot';
    const pop = s.population;
    const body = bodyOf(s, GRATUS);
    if (pop && body) pop.stage?.(GRATUS, body.position.x, body.position.z, body.heading ?? 0, 'sleep');
    say(game, 'A woman', '(A scream.)', 3);
    const court = world({ x: axis.x, y: COURT_Y, z: COURT_CENTRE_Z });
    if (court) pop?.alarm?.(court.x, court.z, 30, 'danger');
    later(PANIC_DELAY, () => {
      if (t === token && tableau) panic(tableau);
    });
    hooks.onShot();
  };

  /** The shot: Bitus on the abacus top draws; the arrow flies; without combat the arrow lands at once. */
  const shoot = () => {
    if (phase !== 'rite') return;
    const t = token;
    const tb = tableau;
    const from = { x: axis.x, y: COLUMN_LOCAL.abacusTop, z: axis.z - COLUMN_LOCAL.abacusHalf + 0.3 };
    // Bitus on the abacus top, on the court side of the rail, facing down at the court.
    const at = world(from);
    if (tb && at) tb.add({ id: BITUS, role: 'dacian', weapon: 'bow', loop: 'guard', x: at.x, y: at.y, z: at.z, heading: heading(Math.PI) });
    later(BITUS_TTL, () => tb?.remove(BITUS));

    const chest = world({ x: from.x, y: from.y + 1.4, z: from.z });
    const body = bodyOf(s, GRATUS);
    if (!s.combat?.shootVisual || !chest || !body) {
      landed(t);
      return;
    }
    later(DRAW_DELAY, () => {
      if (t !== token) return;
      // Combat can vanish during the draw: the arrow then lands at once, so the rite never stalls.
      if (!s.combat?.shootVisual) {
        landed(t);
        return;
      }
      const to = { x: body.position.x, y: body.position.y + 1.3, z: body.position.z };
      s.combat.shootVisual(chest, to, FLIGHT_SECONDS, () => landed(t));
    });
  };

  /** Gratus starts for the door; the shot follows in SHOT_DELAY (the seal, or the 52 s path). */
  const callShot = () => {
    shotSet = true;
    walkGratus();
    later(SHOT_DELAY, shoot);
  };

  /** Crowd boost within 120 m of the Forum of Trajan's centre, ×1.6. Without the forum placed, no boost. */
  const boost = (x: number, z: number) => {
    const forum = s.landmarks?.get?.(FORUM);
    if (!forum) return 1;
    const dx = x - forum.position.x;
    const dz = z - forum.position.z;
    return dx * dx + dz * dz <= BOOST_RADIUS * BOOST_RADIUS ? BOOST : 1;
  };

  const scratch = new THREE.Vector3();
  const inCourt = (x: number, z: number) => {
    const l = columnWorldToLocal(game, { x, y: 0, z }, scratch);
    return !!l && Math.abs(l.x) <= COURT.x && l.z >= COURT.zMin && l.z <= COURT.zMax;
  };

  /**
   * Empty the court for the rite: named people who happen to be there (the carvers' foreman, a
   * sculptor) are held out of the world until stop(); the crowd walks out of the court (the no-go
   * keeps others from wandering in). The quest's own people stay.
   */
  const cleared = new Set<string>();
  const clearCourt = (pop: PopLike) => {
    const centre = world({ x: axis.x, y: COURT_Y, z: COURT_CENTRE_Z });
    if (!centre || !pop.near) return;
    for (const n of pop.near({ x: centre.x, y: centre.y, z: centre.z }, 14)) {
      if (STAY.has(n.id) || cleared.has(n.id) || n.isFighting?.()) continue;
      const local = columnWorldToLocal(game, { x: n.position.x, y: 0, z: n.position.z });
      if (!local || !inCourtLocal(local.x, local.z)) continue;
      cleared.add(n.id);
      if (!n.ambient) {
        const release = pop.holdNamed?.(n.id);
        if (release) undo.push(release);
        continue;
      }
      // Out through the nearer library porch (the court's long sides), a few metres past it.
      const side = local.x >= axis.x ? 1 : -1;
      const out = world({ x: side * (COURT.x + 3), y: COURT_Y, z: local.z });
      if (out && pop.direct?.(n, out.x, out.z, 1.6, 1)) undo.push(() => pop.undirect?.(n));
    }
  };

  /** The figures that stand at their places from the start (the walkers start at the door). */
  const cast = (tb: Tableau) => {
    const figure = (id: string, at: Local, face: number, extra: Partial<FigureDef> = {}): Actor | null => {
      const w = world(at);
      return w ? tb.add({ id, x: w.x, y: w.y, z: w.z, heading: heading(face), ...extra }) : null;
    };
    const door = COLUMN_LOCAL.basilicaDoor;
    WALKERS.forEach((m, i) => {
      const look = m.appearance ?? (m.npc ? s.npcs?.get?.(m.npc)?.appearance : undefined);
      const actor = figure(m.id, startOf(i), toward(door, m.at), { role: m.role, appearance: look });
      if (m.id === 'phaedimus') holdCup(actor);
    });
    figure('priest', COLUMN_LOCAL.priest, toward(COLUMN_LOCAL.priest, axis), { role: 'priest' });
    figure('herald', { x: -2.7, y: COURT_Y, z: -2.6 }, Math.PI, { appearance: HERALD });
    // Watchers: ten on the NW upper gallery (facing −z), six on the library porches (facing inward).
    for (let i = 0; i < 10; i++) {
      figure(`watch-g${i}`, { x: -5 + (i * 8) / 9, y: COLUMN_LOCAL.gallery.y, z: 9.2 }, Math.PI, { role: i % 2 ? 'plebeian-woman' : 'plebeian-man' });
    }
    let p = 0;
    for (const side of [-6.4, 6.4]) {
      for (const z of [-4, -1, 2]) {
        const n = p++;
        figure(`watch-p${n}`, { x: side, y: COURT_Y, z }, toward({ x: side, z }, { x: 0, z: 0 }), { role: n % 2 ? 'plebeian-woman' : 'plebeian-man' });
      }
    }
  };

  /**
   * Faces a walker once it has arrived: until then Tableau keeps the walking heading, so a face set
   * during the walk would be overwritten. Polls every 0.25 s and gives up after 10 s.
   */
  const faceOnArrival = (tb: Tableau, id: string, to: { x: number; z: number }, face: number, polls = 40) => {
    const a = tb.get(id);
    if (a && polls > 0 && Math.hypot(a.position.x - to.x, a.position.z - to.z) > ARRIVE) {
      later(0.25, () => faceOnArrival(tb, id, to, face, polls - 1));
      return;
    }
    tb.face(id, face);
  };

  /** The timeline (seconds from start), as in spec §3.4. */
  const timelineSteps = (tb: Tableau): [number, () => void][] => {
    const out: [number, () => void][] = [];
    // The party walks out over 5 s, each STAGGER after the one before, and every walk ends by WALK_OUT
    // (at most 1.5 m/s). The praetorians walk out together over the full 5 s (at most 1.8 m/s).
    // Then each faces the Column.
    WALKERS.forEach((m, i) => {
      const t = m.role === 'praetorian' ? 0 : i * STAGGER;
      const dur = WALK_OUT - t;
      const to = world({ ...m.at, y: COURT_Y });
      if (!to) return;
      const start = startOf(i);
      const metres = Math.hypot(m.at.x - start.x, m.at.z - start.z);
      out.push([t, () => tb.walk(m.id, to, metres / dur)]);
      out.push([t + dur, () => faceOnArrival(tb, m.id, to, heading(toward(m.at, axis)))]);
    });
    out.push([0, () => say(game, '', '(The cornicines sound. The crowd falls quiet.)', 4.5)]);
    out.push([5, () => say(game, 'Herald', 'Favete linguis! (Keep holy silence!)', 4.5)]);
    out.push([10, () => say(game, 'Herald', INSCRIPTION_1, 6.5)]);
    out.push([17, () => say(game, 'Herald', INSCRIPTION_2, 5.5)]);
    out.push([23, () => say(game, '', GLOSS, 5.5)]);
    out.push([29, () => {
      say(game, '', '(Trajan steps down to the altar and pours wine on the fire.)', 5);
      // Two metres toward the altar, along the line from his place to it.
      const from = PARTY[0].at;
      const dx = COLUMN_LOCAL.altar.x - from.x;
      const dz = COLUMN_LOCAL.altar.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      const to = world({ x: from.x + (dx / len) * 2, y: COURT_Y, z: from.z + (dz / len) * 2 });
      if (to) tb.walk('trajan', to, 1);
    }]);
    out.push([34, () => say(game, 'Plotina', 'Let the dedication be short, Marcus. The gods are patient; the crowd is not.', 5)]);
    out.push([40, () => say(game, 'Similis', 'Everyone within thirty paces is mine today. Everyone.', 5)]);
    out.push([46, () => say(game, 'Phaedimus', 'Watered, Caesar, as you asked. Lightly.', 5)]);
    out.push([52, () => {
      if (!shotSet) callShot();
    }]);
    return out;
  };

  const release = () => {
    token++;
    timeline?.stop();
    timeline = null;
    for (const q of delayed) q.stop();
    delayed = [];
    tableau?.dispose();
    tableau = null;
    for (const u of undo.reverse()) u();
    undo = [];
  };

  return {
    get phase() {
      return phase;
    },

    start() {
      if (phase !== 'idle') release();
      ++token;
      phase = 'rite';
      shotSet = false;

      // Extras off while the court is staged; the old switch comes back in stop().
      const extras = s.trajanExtras;
      if (extras) {
        const was = extras.enabled;
        extras.enabled = false;
        // The carvers, priests and guards the extras keep in the court go now, not when next due.
        extras.clear?.();
        undo.push(() => {
          extras.enabled = was;
        });
      }

      const pop = s.population;
      if (pop) {
        const prev = pop.crowdBoost ?? null;
        pop.crowdBoost = (x, z) => (prev ? prev(x, z) : 1) * boost(x, z);
        undo.push(() => {
          pop.crowdBoost = prev;
        });
        const offNoGo = pop.addNoGo?.(inCourt);
        if (offNoGo) undo.push(offNoGo);
        const releaseApollo = pop.holdNamed?.(APOLLODORUS);
        if (releaseApollo) undo.push(releaseApollo);
        // Again every second while the court is staged: named people spawn a moment after the
        // player arrives (the nav grid has to be ready first), after the rite has begun.
        const sweep = () => {
          if (phase === 'idle' || phase === 'over') return;
          clearCourt(pop);
          later(1, sweep);
        };
        sweep();
      }

      const tb = new Tableau(game, options.figures);
      tableau = tb;
      if (columnPlaced(game)) cast(tb);

      const tl = new Sequence(game);
      for (const [at, fn] of timelineSteps(tb)) tl.at(at, fn);
      timeline = tl.start();

      // The player going up the stair takes Bitus off the platform.
      undo.push(
        game.events.on('interior:entered', (e) => {
          if (e.id === 'dun-columna') tableau?.remove(BITUS);
        }),
      );
    },

    sealSeen() {
      if (phase !== 'rite' || shotSet) return;
      callShot();
    },

    stop() {
      release();
      phase = 'idle';
    },
  };
}
