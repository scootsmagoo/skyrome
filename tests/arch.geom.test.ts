import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProfileBuilder, extrudePolygon, gridSurface, lathe, linspace, sweep, tube } from '../src/arch/common/geom';

/** Fraction of triangles whose winding normal agrees with the stored vertex normals. */
function windingAgreement(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const fn = new THREE.Vector3();
  const vn = new THREE.Vector3();
  let ok = 0;
  let total = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    fn.subVectors(b, a).cross(c.clone().sub(a));
    if (fn.lengthSq() < 1e-14) continue;
    vn.set(0, 0, 0);
    for (let k = 0; k < 3; k++) vn.x += n.getX(i + k), vn.y += n.getY(i + k), vn.z += n.getZ(i + k);
    total++;
    if (fn.dot(vn) > 0) ok++;
  }
  return ok / total;
}

describe('profile builder', () => {
  it('builds classical mouldings that end where expected', () => {
    const p = new ProfileBuilder(0.5, 0).out(0.2).up(0.1).torus(0.2).up(0.05).scotia(0.1).ovolo(0.1, 0.1).cymaRecta(0.2, 0.2).build();
    const last = p.pts[p.pts.length - 1];
    expect(last[1]).toBeCloseTo(0.75, 6);
    // torus returns to its starting x
    expect(p.pts.some(([x]) => x > 0.79)).toBe(true);
    expect(p.smooth.length).toBe(p.pts.length);
  });
});

describe('lathe', () => {
  it('faces outward and caps correctly', () => {
    const prof = new ProfileBuilder(0.6, 0).up(0.2).torus(0.2).to(0.5, 0.4).up(1).build();
    const g = lathe(prof, { segments: 16, capTop: true, capBottom: true });
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(1.4, 5);
    expect(g.boundingBox!.max.x).toBeGreaterThan(0.69);
  });
  it('supports a partial angular range (engaged columns)', () => {
    const prof = new ProfileBuilder(0.5, 0).up(2).build();
    const g = lathe(prof, { segments: 8, theta0: Math.PI / 2, theta1: Math.PI * 1.5 });
    g.computeBoundingBox();
    // half-column bulges towards -z only
    expect(g.boundingBox!.max.z).toBeLessThan(1e-6);
    expect(g.boundingBox!.min.z).toBeCloseTo(-0.5, 5);
  });
});

describe('sweep', () => {
  it('puts the profile outside a rectangle walked (-,-)→(+,-)→(+,+)→(-,+)', () => {
    const prof = new ProfileBuilder(0, 0).out(0.3).up(0.2).in(0.3).build();
    const path = [new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 0, -1), new THREE.Vector3(2, 0, 1), new THREE.Vector3(-2, 0, 1)];
    const g = sweep(prof, path, { closed: true });
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeCloseTo(-2.3, 5);
    expect(g.boundingBox!.max.z).toBeCloseTo(1.3, 5);
  });
  it('caps open paths with outward-facing ends', () => {
    const prof = new ProfileBuilder(0, 0).out(0.3).up(0.2).in(0.3).build();
    const g = sweep(prof, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)], { caps: true, back: true });
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
  });
  it('handles a raking (sloped) path in a facade plane', () => {
    const prof = new ProfileBuilder(0, 0).out(0.3).up(0.2).in(0.3).build();
    const path = [new THREE.Vector3(-4, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(4, 0, 0)];
    const g = sweep(prof, path, { outward: new THREE.Vector3(0, 0, -1) });
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.z).toBeCloseTo(-0.3, 5);
  });
});

describe('extrudePolygon', () => {
  it('occupies z in [-depth, 0]', () => {
    const g = extrudePolygon(
      [
        [0, 0],
        [2, 0],
        [1, 1],
      ],
      0.5,
    );
    g.computeBoundingBox();
    expect(g.boundingBox!.min.z).toBeCloseTo(-0.5);
    expect(g.boundingBox!.max.z).toBeCloseTo(0);
  });
});

describe('gridSurface and tube', () => {
  it('grid normals agree with winding (cylinder param)', () => {
    const g = gridSurface(linspace(0, Math.PI * 2, 24), linspace(0, 2, 4), (a, b, o) => o.set(Math.sin(a) * (0.5 + 0.05 * Math.cos(a * 12)), b, Math.cos(a) * (0.5 + 0.05 * Math.cos(a * 12))));
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    // outward: normal points away from the axis
    let out = 0;
    for (let i = 0; i < p.count; i++) if (p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i) > 0) out++;
    expect(out / p.count).toBeGreaterThan(0.95);
  });
  it('grid normals follow the winding even with decreasing samples', () => {
    const g = gridSurface(linspace(Math.PI, 0, 12), linspace(2, 0, 3), (a, b, o) => o.set(Math.cos(a), 1 + Math.sin(a), b));
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
  });
  it('tube faces outward', () => {
    const path = linspace(0, 4, 16).map((t) => new THREE.Vector3(Math.cos(t), t * 0.2, Math.sin(t)));
    const g = tube(path, 0.1, 6);
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
  });
});
