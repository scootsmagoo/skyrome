/**
 * forum-trajan-gateway: the entrance from the Forum of Augustus side. Coins of 112 show a single
 * arch with an attic carrying Trajan in a six-horse chariot (seiugis) between trophies; the recent
 * excavations show a straight SE wall with the arch in the middle. Here: a marble arch of the Arch
 * of Titus scheme (composite order, bronze-letter inscription on both faces), flanked by wings
 * with columned niches holding statues, all set in the gap of the forum's SE wall.
 *
 * equus-traiani: the colossal gilded equestrian Trajan in the south part of the square, on a
 * moulded marble base with the dedication, reliefs of heaped Dacian arms on the ends, and a
 * festival garland. The horse faces the entrance (SE), like the landmark's facade.
 */
import * as THREE from 'three';
import { triumphalArch } from '../../../arch/classical/arch';
import { column } from '../../../arch/classical/column';
import { armoredEmperor } from '../../../arch/classical/statues';
import { ProfileBuilder, T, TRS, mul, sweep } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props/props';
import type { ColliderSpec, MeshBuilder } from '../../../gfx/MeshBuilder';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { equusStatue } from './trajan-equus';
import { FORUM_X } from './trajan-forum';
import { LodChunks, boxMinMax, quad, solidBox } from './trajan-kit';
import { TRAJAN_INSCRIPTIONS, forumToLocal } from './trajan-layout';
import { dacianArmsMaterial } from './trajan-materials';
import { Lamps } from './trajan-lights';
import { garland, tripod } from './trajan-props';
import { chariotTeam, signum, tropaeum, victory } from './trajan-sculpture';
import { installExtras } from './trajan-extras';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Passage width of the gateway arch (game m; ≈ 6.3 m real). */
const SPAN = 3.8;

function gateway(b: MeshBuilder, F: THREE.Matrix4, detail: 'high' | 'low', spots: Spot[] | null, fires?: Fires) {
  const X = FORUM_X;
  const z = X.zGate - 0.45; // centre of the SE wall's thickness
  const at = mul(F, T(0, 0, z));
  const lines = TRAJAN_INSCRIPTIONS['forum-gateway-inscription'].latin;
  const arch = triumphalArch(b, { bays: 1, span: SPAN, order: 'composite', material: 'marble', detail, inscription: lines, inscriptionStyle: 'bronze', quadriga: false, reliefs: true }, at);
  const W = arch.width;
  const socle = 0.57 * SPAN;
  const colH = 1.18 * SPAN;
  const yEnt = socle + colH;
  const atticTop = arch.height;
  const yAttic = atticTop - 0.82 * SPAN;
  // Six-horse chariot of Trajan on the attic, trophies and standards at the corners.
  chariotTeam(b, mul(at, T(0, atticTop, 0.15)), { horses: 6, scale: 1.15, detail: 'low', material: 'gilded_bronze', driverMaterial: 'gilded_bronze' });
  for (const sx of [-1, 1]) {
    tropaeum(b, mul(at, TRS(sx * (W / 2 - 0.7), atticTop, 0, 0, 0, 0)), { scale: 1.3, detail, material: 'gilded_bronze' });
    victory(b, mul(at, TRS(sx * (W / 2 - 2.2), atticTop, -0.4, 0, sx * -0.35, 0)), { scale: 1.1, detail, material: 'gilded_bronze' });
  }
  // Wings between the arch and the wall ends of the gap: marble-faced, two engaged columns
  // framing a niche with a statue on each face, entablature and attic level with the arch's.
  const wingDepth = 1.6;
  const x0 = W / 2;
  const x1 = X.gateHalf;
  const ent = 0.235 * colH;
  for (const sx of [-1, 1]) {
    const xa = Math.min(sx * x0, sx * x1);
    const xb = Math.max(sx * x0, sx * x1);
    const xc = (xa + xb) / 2;
    const D = (colH / 10) * 0.9;
    boxMinMax(b, 'marble', at, xa, -0.3, -wingDepth / 2, xb, yEnt + ent, wingDepth / 2);
    // The collider takes in the column plinths standing proud of both faces (D·0.9).
    solidBox(b, at, xc, (yEnt + ent - 0.3) / 2, 0, xb - xa, yEnt + ent + 0.3, wingDepth + 2 * D * 0.9);
    boxMinMax(b, 'marble', at, xa, yEnt + ent, -wingDepth / 2 + 0.15, xb, yAttic + 0.6, wingDepth / 2 - 0.15);
    for (const side of [-1, 1]) {
      const zf = side * (wingDepth / 2);
      const rot = side < 0 ? 0 : Math.PI;
      for (const dx of [-1, 1]) {
        const x = xc + dx * ((xb - xa) / 2 - 0.45);
        b.box('marble', D * 1.5, socle, D * 0.9, mul(at, T(x, socle / 2, zf + side * D * 0.45)));
        column(b, { order: 'composite', D, height: colH, fluted: true, material: 'marble', detail: 'low', kind: 'engaged', collide: false }, mul(at, TRS(x, socle, zf, 0, rot, 0)));
      }
      // Niche (dark marble panel, shell head) with a bronze statue on a little base.
      b.box('marble_veined', 1.3, 3.0, 0.06, mul(at, T(xc, socle + 1.7, zf + side * 0.04)));
      b.box('marble', 1.6, 0.18, 0.3, mul(at, T(xc, socle + 3.3, zf + side * 0.12)));
      b.box('marble', 0.9, 0.5, 0.6, mul(at, T(xc, socle + 0.25, zf + side * 0.3)));
      armoredEmperor(b, mul(at, TRS(xc, socle + 0.5, zf + side * 0.3, 0, rot, 0)), { material: 'bronze', detail: 'low', scale: 1.15, plinth: false, spear: true });
      // Entablature band and attic cornice of the wing.
      boxMinMax(b, 'marble', at, xa, yEnt, Math.min(zf, zf + side * 0.35), xb, yEnt + ent, Math.max(zf, zf + side * 0.35));
      boxMinMax(b, 'marble', at, xa, yAttic + 0.45, Math.min(zf, zf + side * 0.25), xb, yAttic + 0.6, Math.max(zf, zf + side * 0.25));
    }
    // Standards on the wing attics.
    signum(b, mul(at, T(xc, yAttic + 0.6, 0)), { scale: 1.2, eagle: true, detail });
  }
  // Festival garlands across the arch faces.
  for (const side of [-1, 1]) {
    const zf = side * (arch.depth / 2 + 0.25);
    garland(b, at, V(-W / 2 + 0.6, yEnt - 0.3, zf), V(W / 2 - 0.6, yEnt - 0.3, zf), 1.0, 0.12, true, detail === 'high' ? 11 : 6);
  }
  // Paving through the passage.
  boxMinMax(b, 'paving_travertine', at, -SPAN / 2, -0.25, -arch.depth / 2 - 0.4, SPAN / 2, 0.03, arch.depth / 2 + 0.4, { collide: true });
  if (spots) {
    const p = V(0, yAttic + 0.82 * SPAN * 0.48, -arch.depth / 2 - 0.4).applyMatrix4(at);
    spots.push({ id: 'forum-gateway-inscription', kind: 'inscription', position: p, heading: 0 });
    spots.push({ id: 'forum-gateway-passage', kind: 'spawn', position: V(0, 0.03, -arch.depth / 2 - 3).applyMatrix4(at), heading: 0 });
    for (const sx of [-1, 1]) spots.push({ id: `forum-gateway-guard${sx < 0 ? 'ne' : 'sw'}`, kind: 'npc', position: V(sx * (SPAN / 2 + 0.6), 0.03, -arch.depth / 2 - 0.8).applyMatrix4(at), heading: Math.PI });
  }
  if (fires) {
    // Braziers burning before the gate on the Forum of Augustus side (the guards' fires).
    for (const sx of [-1, 1]) {
      const x = sx * (SPAN / 2 + 1.5);
      const z = -arch.depth / 2 - 2.2;
      placeProp(new Draw(fires.b, at), 'brazier', x, 0, z, 0, { variant: 1 });
      fires.lamps.add('brazier', V(x, 0.86, z), at);
    }
  }
}

function equus(b: MeshBuilder, F: THREE.Matrix4, detail: 'high' | 'low', spots: Spot[] | null, fires?: Fires) {
  const z = -12.7 * 0.6; // PLAN.equus.v
  const at = mul(F, T(0, 0, z));
  // The horse walks along the axis (towards the entrance), so the base is long in z.
  const w = 2.6;
  const d = 4.4;
  const h = 2.6;
  // Two walkable steps of travertine round the base.
  for (let k = 0; k < 2; k++) {
    const g = 1.0 - k * 0.45;
    boxMinMax(b, 'travertine', at, -w / 2 - g, -0.2, -d / 2 - g, w / 2 + g, 0.03 + 0.18 * (k + 1), d / 2 + g, { collide: true });
  }
  const y0 = 0.39;
  // Die with base and crown mouldings.
  const n = detail === 'high' ? 3 : 1;
  boxMinMax(b, 'marble', at, -w / 2, y0, -d / 2, w / 2, y0 + h, d / 2, { collide: true });
  const sq = (hw: number, hd: number, y: number) => [V(-hw, y, -hd), V(hw, y, -hd), V(hw, y, hd), V(-hw, y, hd)];
  const base = new ProfileBuilder(-0.02, 0).to(0.18, 0).up(0.18).torus(0.14, 0.06, n).in(0.06).cymaReversa(-0.08, 0.14, n).to(-0.02, 0.5).build();
  b.add(sweep(base, sq(w / 2, d / 2, y0), { closed: true }), 'marble', at);
  const crown = new ProfileBuilder(-0.02, -0.4).to(0, -0.4).cymaReversa(0.08, 0.14, n).up(0.04).out(0.12).up(0.16).ovolo(0.06, 0.06, n).to(-0.02, 0).build();
  b.add(sweep(crown, sq(w / 2, d / 2, y0 + h), { closed: true }), 'marble', at);
  // Inscription on the front (SE) face; reliefs of heaped Dacian arms on the ends and the back.
  const lines = TRAJAN_INSCRIPTIONS['equus-inscription'].latin;
  inscriptionPanel(b, { lines, width: w * 0.8, height: h * 0.6, style: 'bronze', border: true }, mul(at, T(0, y0 + h * 0.5, -d / 2 - 0.015)), { depth: 0.03 });
  if (detail === 'high') {
    const arms = dacianArmsMaterial();
    const panel = (cx: number, cz: number, rot: number, pw: number) => {
      const m = mul(at, TRS(cx, y0 + h * 0.5, cz, 0, rot, 0));
      quad(b, arms, m, V(-pw / 2, -h * 0.32, 0), V(pw / 2, -h * 0.32, 0), V(pw / 2, h * 0.32, 0), V(-pw / 2, h * 0.32, 0), 'unit');
    };
    // quad() winds a→b→c→d counter-clockwise seen from +z; rotate so each faces outward.
    panel(w / 2 + 0.01, 0, Math.PI / 2, d * 0.8);
    panel(-w / 2 - 0.01, 0, -Math.PI / 2, d * 0.8);
    panel(0, d / 2 + 0.01, 0, w * 0.75);
  }
  // Laurel garland swags round the crown for the festival.
  for (const [ax, az, cx, cz] of [
    [-w / 2, -d / 2 - 0.08, w / 2, -d / 2 - 0.08],
    [w / 2, d / 2 + 0.08, -w / 2, d / 2 + 0.08],
    [w / 2 + 0.08, -d / 2, w / 2 + 0.08, d / 2],
    [-w / 2 - 0.08, d / 2, -w / 2 - 0.08, -d / 2],
  ]) {
    garland(b, at, V(ax, y0 + h - 0.45, az), V(cx, y0 + h - 0.45, cz), 0.35, 0.08, true, detail === 'high' ? 9 : 5);
  }
  // The colossal gilded horseman (≈ 2.4 × life, the horse's right foreleg raised).
  equusStatue(b, mul(at, T(0, y0 + h, 0.1)), { scale: 2.2, detail });
  if (fires) {
    // Incense tripods before the statue for the dedication.
    for (const sx of [-1, 1]) {
      const p = V(sx * 1.9, 0.03, -d / 2 - 1.7);
      tripod(fires.b, mul(at, T(p.x, p.y, p.z)), 1.1);
      fires.lamps.add('brazier', V(p.x, p.y + 1.3, p.z), at, { intensity: 9, distance: 9, glow: 0.3, priority: 0.9 });
    }
  }
  if (spots) {
    spots.push({ id: 'equus-inscription', kind: 'inscription', position: V(0, y0 + h * 0.5, -d / 2 - 0.05).applyMatrix4(at), heading: 0 });
    // (on the upper step, beside the inscription, addressing the square)
    spots.push({ id: 'equus-orator', kind: 'npc', position: V(-1.2, 0.39, -d / 2 - 0.42).applyMatrix4(at), heading: Math.PI });
    spots.push({ id: 'equus-vista', kind: 'vista', position: V(0, 0.03, -d / 2 - 9).applyMatrix4(at), heading: 0 });
  }
}

/** Fires and their stands: drawn at every distance (small, and lit from afar), with their lamps. */
interface Fires {
  b: MeshBuilder;
  lamps: Lamps;
}

function lodBuild(ctx: LandmarkContext, name: string, distance: number, fn: (b: MeshBuilder, F: THREE.Matrix4, detail: 'high' | 'low', spots: Spot[] | null, fires?: Fires) => void) {
  installExtras(ctx.game);
  const F = forumToLocal(ctx.lm);
  const spots: Spot[] = [];
  const fires: Fires = { b: ctx.builder(), lamps: new Lamps() };
  const chunks = new LodChunks(distance);
  const c = chunks.chunk('all', V(0, 4, 0));
  fn(c.near, F, ctx.detail, spots, fires);
  fn(c.far, F, 'low', null);
  const colliders: ColliderSpec[] = [];
  const object = chunks.build(name, colliders);
  if (!fires.b.isEmpty) {
    object.add(fires.b.build(`${name}:fires`));
    for (const s of fires.b.colliders) colliders.push(s);
  }
  fires.lamps.attach(ctx.game, object);
  return { object, colliders, spots };
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['forum-trajan-gateway'],
    build: (ctx) => ({ ...lodBuild(ctx, 'forum-trajan-gateway', 45, gateway), cullDistance: 900 }),
  },
  {
    handles: ['equus-traiani'],
    build: (ctx) => ({ ...lodBuild(ctx, 'equus-traiani', 60, equus), cullDistance: 900 }),
  },
];
