/** UV density measurement for the audit (`?uvaudit=1`) and its tests. Pure: no DOM. */
import * as THREE from 'three';

export interface UvStretch {
  /** Total surface area (m²) of the triangles measured. */
  area: number;
  /** Area (m²) of triangles whose texture is stretched or squeezed beyond `limit` in some direction. */
  badArea: number;
  /** Worst ratio found: the largest of (metres per texture metre) and its inverse, over both axes. */
  worst: number;
  /** Area (m²) of triangles whose UVs are collapsed (no texture area at all). */
  collapsedArea: number;
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const ss = new THREE.Vector3();
const st = new THREE.Vector3();

/**
 * UV density audit for a geometry whose UVs are in texture repeats of `metersPerTile` metres.
 * For each triangle the singular values of the UV→surface map say how many surface metres one
 * texture metre covers along the two principal directions: both 1 means a faithful world-scale
 * texture; 3 and 1 is a streak three times too long. A triangle counts as bad when either value
 * is outside 1/limit..limit.
 */
export function uvStretch(geometry: THREE.BufferGeometry, metersPerTile = 2, limit = 1.8): UvStretch {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const out: UvStretch = { area: 0, badArea: 0, worst: 1, collapsedArea: 0 };
  if (!uv) return out;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    const area = ss.copy(e1).cross(e2).length() / 2;
    if (area < 1e-6) continue;
    out.area += area;
    const d1x = (uv.getX(i + 1) - uv.getX(i)) * metersPerTile;
    const d1y = (uv.getY(i + 1) - uv.getY(i)) * metersPerTile;
    const d2x = (uv.getX(i + 2) - uv.getX(i)) * metersPerTile;
    const d2y = (uv.getY(i + 2) - uv.getY(i)) * metersPerTile;
    const det = d1x * d2y - d1y * d2x;
    if (Math.abs(det) < 1e-9) {
      out.collapsedArea += area;
      out.badArea += area;
      out.worst = Math.max(out.worst, 1e3);
      continue;
    }
    // Surface metres per UV metre along s and t (Sander et al.).
    ss.copy(e1).multiplyScalar(d2y).addScaledVector(e2, -d1y).multiplyScalar(1 / det);
    st.copy(e2).multiplyScalar(d1x).addScaledVector(e1, -d2x).multiplyScalar(1 / det);
    const A = ss.dot(ss);
    const B = ss.dot(st);
    const C = st.dot(st);
    const r = Math.sqrt((A - C) * (A - C) + 4 * B * B);
    const s1 = Math.sqrt((A + C + r) / 2);
    const s2 = Math.sqrt(Math.max(1e-12, (A + C - r) / 2));
    const worst = Math.max(s1, 1 / s2);
    if (worst > limit) out.badArea += area;
    if (worst > out.worst) out.worst = worst;
  }
  return out;
}

/** Per (material, builder call site) totals gathered while the world builds (`?uvaudit=1`). */
export interface UvAuditRow {
  material: string;
  site: string;
  area: number;
  badArea: number;
  worst: number;
}

export const UV_AUDIT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('uvaudit');
const rows = new Map<string, UvAuditRow>();

/** The first two stack frames outside the gfx/ plumbing and the Draw helpers: who asked for this geometry. */
function callSite(): string {
  const lines = (new Error().stack ?? '').split('\n').slice(2);
  const found: string[] = [];
  for (const l of lines) {
    if (/\/src\/gfx\/|\/arch\/fabric\/draw|\/arch\/common\/(geom|walls|stairs)|node_modules/.test(l)) continue;
    const m = /at (?:async )?([^ ]+) \(.*\/src\/([^?:)]+)[^:)]*:(\d+)/.exec(l) ?? /\/src\/([^?:)]+)[^:)]*:(\d+)/.exec(l);
    if (!m) continue;
    found.push(m.length === 4 ? `${m[1]}@${m[2].split('/').pop()}:${m[3]}` : `${m[1].split('/').pop()}:${m[2]}`);
    if (found.length === 2) break;
  }
  return found.join(' < ') || '?';
}

/** Record one added geometry (call only when UV_AUDIT). `metersPerTile` is its UV scale. */
export function uvAuditRecord(g: THREE.BufferGeometry, material: string, metersPerTile: number) {
  const s = uvStretch(g, metersPerTile);
  if (s.area === 0) return;
  const site = s.badArea > 0 ? callSite() : '-';
  const key = `${material}|${site}`;
  const r = rows.get(key) ?? { material, site, area: 0, badArea: 0, worst: 1 };
  r.area += s.area;
  r.badArea += s.badArea;
  r.worst = Math.max(r.worst, s.worst);
  rows.set(key, r);
}

/** The worst offenders by stretched area, for the console / a shot step. */
export function uvAuditReport(top = 40): UvAuditRow[] {
  return [...rows.values()].filter((r) => r.badArea > 0).sort((x, y) => y.badArea - x.badArea).slice(0, top);
}

if (UV_AUDIT && typeof window !== 'undefined') {
  (window as unknown as { __uvAudit: typeof uvAuditReport }).__uvAudit = uvAuditReport;
}
