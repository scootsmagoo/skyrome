/**
 * Shared plan of the Forum of Trajan complex (dedicated 1 Jan 112; the Column 12 May 113).
 *
 * Every Trajanic builder (forum, gateway, equestrian statue, Basilica Ulpia, Column court,
 * libraries, Markets) designs its geometry in one common frame, the FORUM FRAME, so the parts of
 * the complex line up on one axis even where the atlas centres disagree by a few metres:
 *
 *   u = across the axis, + towards the SW hemicycle (real metres from the forum-trajan centre)
 *   v = along the axis, + towards the SE gateway (the Forum of Augustus side)
 *
 * The forum-trajan builder's own local frame is exactly the forum frame scaled by WORLD_SCALE
 * (local x = u·S, local z = −v·S). `forumToLocal(lm)` maps that frame into any other landmark's
 * local frame, so a builder can place forum-frame geometry with `mul(F, T(x, y, z))`.
 *
 * Pure data and arithmetic (no scene objects); tested in tests/trajan.layout.test.ts.
 */
import * as THREE from 'three';
import { LANDMARK_BY_ID } from '../../../data/atlas';
import { WORLD_SCALE } from '../../coords';

export const S = WORLD_SCALE;

/** The atlas fields the layout needs. */
export interface Sited {
  id: string;
  center: readonly [number, number];
  rotation: number;
  baseElevation?: number;
}

const FORUM_FALLBACK: Sited = { id: 'forum-trajan', center: [78, -256], rotation: 140, baseElevation: 17.5 };

export function forumSite(): Sited {
  return (LANDMARK_BY_ID['forum-trajan'] as Sited | undefined) ?? FORUM_FALLBACK;
}

/**
 * The plan in REAL metres (forum frame). Values follow docs/research/architecture.md §3.17–3.18
 * and the atlas notes; where the atlas centres are a few metres off the common axis, the plan wins.
 */
export const PLAN = {
  /** Half-width of the precinct between the outer faces of the lateral back walls. */
  wallOuter: 60,
  /** Inner face of the lateral back walls (peperino, marble-veneered inside). */
  wallInner: 58.5,
  /** Column axes of the lateral porticoes (pavonazzetto Corinthian). */
  colU: 46.3,
  /** Portico column height (real). */
  colH: 9.5,
  /** Square: from the gateway wall (+v) to the Basilica Ulpia front (−v). */
  vGate: 62.5,
  vBasilica: -62.5,
  /** Hemicycle exedrae behind the lateral porticoes, centred on the back-wall line. */
  exedra: { v: -10, r: 21, wall: 1.6 },
  /** The basalt street ringing the NE exedra, and the Markets' Great Hemicycle facade. */
  hemicycle: { r: 29.5, street0: 22.8, halfAngle: (74 * Math.PI) / 180, shopDepth: 5.5 },
  /** Basilica Ulpia: hall 117 m between the outer faces of the end walls, 58 deep. */
  basilica: { front: -63.0, back: -121.5, halfLength: 58.5, apseR: 22.5, apseWall: 2.2 },
  /** Column court between the two libraries (the basilica's back wall closes it on the SE). */
  court: { u0: -11.8, u1: 11.8, v0: -121.5, v1: -147.5 },
  /** Twin libraries: halls 24.5 × 20 m, fronts on the court. */
  library: { v0: -122.6, v1: -147.0, depth: 19.5 },
  /** Equus Traiani: in the S part of the square near the entrance (Meneghini). */
  equus: { v: 12.7 },
  column: { v: -133.3 },
} as const;

// ---------------------------------------------------------------- frames

const DEG = Math.PI / 180;

/** Forum frame (u, v) real → world real (x, z). */
export function uvToWorld(u: number, v: number, forum: Sited = forumSite()): [number, number] {
  const th = forum.rotation * DEG;
  // p = across (cos θ, sin θ), n = facade normal (sin θ, −cos θ)
  return [forum.center[0] + u * Math.cos(th) + v * Math.sin(th), forum.center[1] + u * Math.sin(th) - v * Math.cos(th)];
}

/** World real (x, z) → forum frame (u, v). */
export function worldToUV(x: number, z: number, forum: Sited = forumSite()): [number, number] {
  const th = forum.rotation * DEG;
  const dx = x - forum.center[0];
  const dz = z - forum.center[1];
  return [dx * Math.cos(th) + dz * Math.sin(th), dx * Math.sin(th) - dz * Math.cos(th)];
}

/** World real (x, z) → a landmark's local GAME frame (facade −z, as buildLandmarks places it). */
export function worldToLocal(lm: Sited, x: number, z: number): [number, number] {
  const rotY = -lm.rotation * DEG;
  const dx = (x - lm.center[0]) * S;
  const dz = (z - lm.center[1]) * S;
  // inverse of: x' = x cos + z sin, z' = −x sin + z cos
  return [dx * Math.cos(rotY) - dz * Math.sin(rotY), dx * Math.sin(rotY) + dz * Math.cos(rotY)];
}

/** Landmark local GAME (lx, lz) → world real (x, z). */
export function localToWorld(lm: Sited, lx: number, lz: number): [number, number] {
  const rotY = -lm.rotation * DEG;
  return [lm.center[0] + (lx * Math.cos(rotY) + lz * Math.sin(rotY)) / S, lm.center[1] + (-lx * Math.sin(rotY) + lz * Math.cos(rotY)) / S];
}

/** Forum frame (u, v) real → a landmark's local game frame. */
export function uvToLocal(lm: Sited, u: number, v: number, forum: Sited = forumSite()): [number, number] {
  const [x, z] = uvToWorld(u, v, forum);
  return worldToLocal(lm, x, z);
}

/**
 * Matrix mapping forum-local GAME coordinates (x = u·S, y, z = −v·S) into `lm`'s local frame.
 * All Trajanic landmarks sit on pads at 17.5 m, so the vertical offset is normally zero.
 */
export function forumToLocal(lm: Sited, forum: Sited = forumSite()): THREE.Matrix4 {
  const [tx, tz] = uvToLocal(lm, 0, 0, forum);
  const dy = ((forum.baseElevation ?? 17.5) - (lm.baseElevation ?? forum.baseElevation ?? 17.5)) * S;
  const ry = (lm.rotation - forum.rotation) * DEG;
  return new THREE.Matrix4().makeRotationY(ry).setPosition(tx, dy, tz);
}

/** Forum-local game position for (u, v) real at height y (game). */
export function fp(u: number, v: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(u * S, y, -v * S);
}

/**
 * Heading (model +Z convention, radians) in forum-local space for a figure at (u, v) that faces
 * the forum-frame direction (du, dv).
 */
export function headingUV(du: number, dv: number): number {
  return Math.atan2(du, -dv);
}

// ---------------------------------------------------------------- plan helpers (pure, tested)

/** Evenly divide a run into bays of about `target`; returns the column positions (inclusive). */
export function divide(a: number, b: number, target: number): number[] {
  const n = Math.max(1, Math.round(Math.abs(b - a) / target));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/** Stair layout for a rise (human scale, game metres): risers ≤ 0.2 m, treads ≥ 0.32 m. */
export function flight(rise: number, maxRiser = 0.2, tread = 0.34): { count: number; riser: number; run: number; tread: number } {
  const count = Math.max(1, Math.ceil(rise / maxRiser - 1e-6));
  return { count, riser: rise / count, run: count * tread, tread };
}

/** Points on a circular arc in the forum frame (real), from angle a0 to a1 (0 = towards −u). */
export function hemicyclePoint(cu: number, cv: number, r: number, a: number, side: -1 | 1 = -1): [number, number] {
  // side −1: the NE hemicycle bulges towards −u; +1: the SW one towards +u.
  return [cu + side * r * Math.cos(a), cv + r * Math.sin(a)];
}

/**
 * Latin texts of the readable inscriptions, keyed by spot id, for the gameplay team (the
 * landmark Spot type carries no text). Titulature follows Trajan's attested titles in 112–113
 * (TRIB·POT XVI until 9 Dec 112, XVII after; IMP VI; COS VI). "Optimus" is NOT official until 114.
 */
export const TRAJAN_INSCRIPTIONS: Record<string, { latin: string[]; english: string; source: string }> = {
  'column-inscription': {
    latin: ['SENATVS·POPVLVSQVE·ROMANVS', 'IMP·CAESARI·DIVI·NERVAE·F·NERVAE', 'TRAIANO·AVG·GERM·DACICO·PONTIF', 'MAXIMO·TRIB·POT·XVII·IMP·VI·COS·VI·P·P', 'AD·DECLARANDVM·QVANTAE·ALTITVDINIS', 'MONS·ET·LOCVS·TANTIS·OPERIBVS·SIT·EGESTVS'],
    english:
      'The Senate and People of Rome, to the Emperor Caesar Nerva Trajan Augustus, son of the deified Nerva, conqueror of Germany and Dacia, Pontifex Maximus, in his 17th year of tribunician power, six times hailed imperator, six times consul, Father of his Country: to show how high a hill, and how great a site, was cleared for such great works.',
    source: 'CIL VI 960 (the Column base, AD 113)',
  },
  'forum-gateway-inscription': {
    latin: ['SENATVS·POPVLVSQVE·ROMANVS', 'IMP·CAESARI·DIVI·NERVAE·F·NERVAE·TRAIANO·AVG·GERM·DACICO', 'PONTIF·MAXIMO·TRIB·POT·XVI·IMP·VI·COS·VI·P·P'],
    english: 'The Senate and People of Rome to the Emperor Caesar Nerva Trajan Augustus, son of the deified Nerva, conqueror of Germany and Dacia, Pontifex Maximus, in his 16th year of tribunician power, six times imperator, six times consul, Father of his Country.',
    source: "Reconstruction: the gateway's own text is lost; titles as attested for AD 112",
  },
  'equus-inscription': {
    latin: ['S·P·Q·R', 'IMP·CAESARI·DIVI·NERVAE·F', 'NERVAE·TRAIANO·AVG', 'GERM·DACICO·PONT·MAX', 'TRIB·POT·XVI·IMP·VI·COS·VI·P·P'],
    english: 'The Senate and People of Rome to the Emperor Caesar Nerva Trajan Augustus, son of the deified Nerva, conqueror of Germany and Dacia, Pontifex Maximus (AD 112).',
    source: 'Reconstruction: the base was found without its text; titles as attested for AD 112',
  },
  'forum-ex-manubiis': {
    latin: ['EX·MANVBIIS'],
    english: '"From the spoils of war": the legend on the gilded horses and standards along the roofs of the forum.',
    source: 'Aulus Gellius, Attic Nights 13.25.1',
  },
  'basilica-attic-inscription': {
    latin: ['IMP·CAESAR·DIVI·NERVAE·F·NERVA·TRAIANVS·AVG·GERM·DACICVS', 'EX·MANVBIIS'],
    english: 'The Emperor Caesar Nerva Trajan Augustus, son of the deified Nerva, conqueror of Germany and Dacia — from the spoils of war.',
    source: 'Gellius 13.25 (ex manubiis); the attic text itself is a reconstruction',
  },
};
