/**
 * Fallback massing for any landmark without a custom or category builder: correct footprint,
 * height and orientation in plain masonry, so the skyline is right while hero builders are written.
 */
import * as THREE from 'three';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { localFootprint } from '../footprint';

const WALL: Record<string, MaterialId> = {
  temple: 'marble',
  basilica: 'travertine',
  arch: 'marble',
  column: 'marble',
  amphitheatre: 'travertine',
  theatre: 'travertine',
  baths: 'brick',
  palace: 'brick',
  camp: 'brick',
  warehouse: 'brick',
  market: 'brick',
  tomb: 'travertine',
  gate: 'tufa',
  prison: 'tufa',
};

const OPEN = new Set(['circus', 'stadium', 'forum', 'camp', 'harbor', 'portico', 'market']);

function roofPrism(w: number, d: number, h: number): THREE.BufferGeometry {
  // Gable along z (depth), ridge height h, base w x d at y = 0.
  const hw = w / 2;
  const hd = d / 2;
  const shape = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -hd);
  return g;
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['category:*'],
    build(ctx: LandmarkContext) {
      const { lm, S } = ctx;
      const b = ctx.builder();
      const wallMat = WALL[lm.category] ?? 'plaster_cream';
      const H = Math.max(2.5, lm.height * S);
      const fp = localFootprint(lm);
      const siting = (lm as { siting?: string }).siting;
      if (lm.category === 'garden' || lm.category === 'aqueduct' || siting === 'open' || siting === 'underground') {
        // Areas, districts, open squares, buried and linear features have no massing of their own
        // (the city module builds the fabric over districts such as the Subura).
        return { object: b.build(lm.id), colliders: [] };
      }
      if (OPEN.has(lm.category) && fp.kind === 'rect') {
        // Open spaces (circus, stadium, forum, camp…): paved floor + perimeter wall, no roof.
        const w = fp.w * S;
        const d = fp.d * S;
        const wallH = Math.min(H, lm.category === 'forum' ? 9 : 14);
        const t = Math.max(1.2, Math.min(w, d) * 0.04);
        b.box(lm.category === 'camp' ? 'dirt' : 'paving_travertine', w, 0.25, d, new THREE.Matrix4().makeTranslation(0, 0.125, 0), { collide: true });
        for (const [x, z, sx, sz] of [[0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]] as const) {
          // Leave a gate gap in the middle of the facade wall.
          if (z === -d / 2) {
            const gap = Math.min(w * 0.3, 12);
            const seg = (w - gap) / 2;
            b.box(wallMat, seg, wallH, t, new THREE.Matrix4().makeTranslation(-(gap / 2 + seg / 2), wallH / 2, z), { collide: true });
            b.box(wallMat, seg, wallH, t, new THREE.Matrix4().makeTranslation(gap / 2 + seg / 2, wallH / 2, z), { collide: true });
          } else {
            b.box(wallMat, sx, wallH, sz, new THREE.Matrix4().makeTranslation(x, wallH / 2, z), { collide: true });
          }
        }
      } else if (fp.kind === 'rect') {
        const w = fp.w * S;
        const d = fp.d * S;
        const podium = lm.category === 'temple' ? Math.min(3.5, H * 0.18) : 0.4;
        b.box('travertine', w, podium, d, new THREE.Matrix4().makeTranslation(0, podium / 2, 0), { collide: true });
        const bodyH = lm.category === 'temple' ? H * 0.62 : H * 0.85;
        b.box(wallMat, w * 0.96, bodyH, d * 0.96, new THREE.Matrix4().makeTranslation(0, podium + bodyH / 2, 0), { collide: true });
        const roofH = Math.min(w, d) * 0.18;
        if (H - podium - bodyH > 0.5 || lm.category === 'temple' || lm.category === 'basilica') {
          const along = d >= w;
          const g = along ? roofPrism(w, d, roofH) : roofPrism(d, w, roofH).rotateY(Math.PI / 2);
          b.add(g, 'roof_tile', new THREE.Matrix4().makeTranslation(0, podium + bodyH, 0));
        }
      } else if (fp.kind === 'ellipse' || fp.kind === 'circle') {
        const rx = (fp.kind === 'circle' ? fp.r : fp.rx) * S;
        const rz = (fp.kind === 'circle' ? fp.r : fp.rz) * S;
        const g = new THREE.CylinderGeometry(1, 1, H, 32, 1);
        g.scale(rx, 1, rz);
        b.add(g, wallMat, new THREE.Matrix4().makeTranslation(0, H / 2, 0));
        b.collider({ kind: 'cylinder', center: new THREE.Vector3(0, H / 2, 0), halfHeight: H / 2, radius: Math.min(rx, rz) });
      } else {
        const pts = fp.points.map(([x, z]) => new THREE.Vector2(x * S, -z * S));
        const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: H, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        b.add(g, wallMat);
        const box = new THREE.Box3().setFromPoints(fp.points.map(([x, z]) => new THREE.Vector3(x * S, 0, z * S)));
        const c = box.getCenter(new THREE.Vector3());
        const sz = box.getSize(new THREE.Vector3());
        b.collider({ kind: 'box', center: new THREE.Vector3(c.x, H / 2, c.z), half: new THREE.Vector3(sz.x * 0.45, H / 2, sz.z * 0.45) });
      }
      return { object: b.build(lm.id), colliders: b.colliders };
    },
  },
];
