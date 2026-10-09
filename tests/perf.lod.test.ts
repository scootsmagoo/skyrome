/** The perf workstream's pure pieces: simplification, chunking, twins, shadow swaps, the fast cull. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { column } from '../src/arch/classical/column';
import { diameterForHeight } from '../src/arch/classical/orders';
import { FastCull } from '../src/gfx/fastCull';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { addShadowHook, installShadowLod, trackShadowProxy, untrackShadowProxy } from '../src/gfx/shadowLod';
import { cellForBox, simplifyByGrid } from '../src/gfx/simplify';
import { splitByCells } from '../src/world/landmarks/chunking';
import { pieceTwin, shapeTwins } from '../src/world/landmarks/landmarkLod';

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** The column's instanced shape (the geometry the landmarks' columns share). */
function columnShape(detail: 'high' | 'low') {
  const b = new MeshBuilder();
  column(b, { order: 'corinthian', D: diameterForHeight('corinthian', 9), fluted: true, detail });
  let g: THREE.BufferGeometry | null = null;
  b.build('t').traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh && !g) g = (o as THREE.Mesh).geometry;
  });
  return g as unknown as THREE.BufferGeometry;
}

/** A flat square slab from the origin, `size` m a side, non-indexed, with normals and uvs. */
function slab(size: number, quad: number): THREE.BufferGeometry {
  const n = Math.round(size / quad);
  return new THREE.PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2).translate(size / 2, 0, size / 2).toNonIndexed();
}

describe('simplifyByGrid', () => {
  it('thins a high-detail column to a small fraction and keeps its extent', () => {
    const g = columnShape('high');
    g.computeBoundingBox();
    const cell = cellForBox(g.boundingBox!, [6, 16, 6], [0.1, 0.2, 0.1]);
    const s = simplifyByGrid(g, cell, { maxRatio: 1 })!;
    expect(s).not.toBeNull();
    expect(tris(s)).toBeLessThan(tris(g) * 0.15);
    s.computeBoundingBox();
    // The silhouette stays within a cell of the original.
    const bb = g.boundingBox!;
    expect(Math.abs(bb.min.y - s.boundingBox!.min.y)).toBeLessThanOrEqual(cell[1]);
    expect(Math.abs(bb.max.y - s.boundingBox!.max.y)).toBeLessThanOrEqual(cell[1]);
    expect(Math.abs(bb.max.x - s.boundingBox!.max.x)).toBeLessThanOrEqual(cell[0]);
    // UVs and normals survive, unit normals.
    expect(s.getAttribute('uv')).toBeTruthy();
    const n = s.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 3);
  });

  it('returns null when the result would not be worth having', () => {
    // Cells far finer than the quads: nothing merges.
    expect(simplifyByGrid(slab(4, 0.5), [0.01, 0.01, 0.01])).toBeNull();
  });

  it('snaps to grid points, so pieces simplified apart still meet', () => {
    const g = slab(8, 0.25);
    const cell: [number, number, number] = [0.8, 0.8, 0.8];
    const s = simplifyByGrid(g, cell, { snap: true, maxRatio: 1 })!;
    const p = s.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      for (const [v, c] of [[p.getX(i), cell[0]], [p.getY(i), cell[1]], [p.getZ(i), cell[2]]]) {
        expect(Math.abs(v / c - Math.round(v / c))).toBeLessThan(1e-4);
      }
    }
    // Chunks of one slab, simplified separately, end on the same points along their shared edge.
    const parts = splitByCells(g, 4)!;
    expect(parts.length).toBe(4);
    const edgePoints = (geo: THREE.BufferGeometry) => {
      const q = simplifyByGrid(geo, cell, { snap: true, maxRatio: 1 })!.getAttribute('position') as THREE.BufferAttribute;
      const found = new Set<string>();
      for (let i = 0; i < q.count; i++) if (Math.abs(q.getX(i) - 4) < 1e-4) found.add(`${q.getY(i).toFixed(3)},${q.getZ(i).toFixed(3)}`);
      return found;
    };
    const left = new Set<string>();
    const right = new Set<string>();
    for (const part of parts) {
      part.computeBoundingBox();
      for (const f of edgePoints(part)) (part.boundingBox!.max.x <= 4 + 1e-4 ? left : right).add(f);
    }
    expect(left.size).toBeGreaterThan(3);
    expect([...right].sort()).toEqual([...left].sort());
  });
});

describe('splitByCells', () => {
  it('keeps every triangle exactly once', () => {
    const g = slab(50, 5);
    const parts = splitByCells(g, 20)!;
    expect(parts.length).toBe(9);
    expect(parts.reduce((s, p) => s + tris(p), 0)).toBe(tris(g));
    for (const p of parts) expect(p.getAttribute('uv').count).toBe(p.getAttribute('position').count);
  });

  it('is null when everything falls in one cell', () => {
    expect(splitByCells(slab(10, 1), 30)).toBeNull();
  });
});

describe('landmark twins', () => {
  it('gives a high column two coarser levels, each smaller than the last', () => {
    const hi = shapeTwins(columnShape('high'));
    expect(hi.length).toBe(2);
    expect(tris(hi[1].geometry)).toBeLessThan(tris(hi[0].geometry));
    expect(hi[1].from).toBeGreaterThan(hi[0].from);
  });

  it('twins a big finely cut piece and leaves a small one', () => {
    expect(pieceTwin(slab(40, 0.25))).not.toBeNull();
    expect(pieceTwin(slab(2, 0.5))).toBeNull();
  });
});

describe('shadow level of detail', () => {
  const cam = new THREE.PerspectiveCamera();
  cam.updateMatrixWorld(true);

  /** A fake game whose shadow map's own render records what `onRender` sees. */
  function rig(onRender: () => void, opts: { fails?: boolean } = {}) {
    const shadowMap = {
      enabled: true,
      autoUpdate: false,
      needsUpdate: true,
      render: () => {
        onRender();
        if (opts.fails) throw new Error('boom');
      },
    };
    const game = { renderer: { shadowMap } } as never;
    installShadowLod(game);
    return shadowMap as unknown as { render: (l: unknown[], s: unknown, c: THREE.Camera) => void; needsUpdate: boolean };
  }

  function proxied(x: number) {
    const full = new THREE.BoxGeometry(1, 1, 1);
    const proxy = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(full, new THREE.MeshBasicMaterial());
    mesh.castShadow = true;
    mesh.position.set(x, 0, 0);
    mesh.updateMatrixWorld(true);
    mesh.userData.shadowGeometry = proxy;
    trackShadowProxy(mesh);
    return { mesh, full, proxy };
  }

  it('swaps a far tracked mesh to its shadow geometry only during the shadow render', () => {
    const near = proxied(3);
    const far = proxied(40);
    const seen: Record<string, THREE.BufferGeometry> = {};
    const sm = rig(() => {
      seen.near = near.mesh.geometry;
      seen.far = far.mesh.geometry;
    });
    sm.render([{}], {}, cam);
    expect(seen.near).toBe(near.full); // inside SHADOW_PROXY_FROM
    expect(seen.far).toBe(far.proxy);
    expect(far.mesh.geometry).toBe(far.full); // restored for the main pass
    untrackShadowProxy(near.mesh);
    untrackShadowProxy(far.mesh);
  });

  it('does nothing when the map is not about to be drawn', () => {
    const far = proxied(50);
    let seen: THREE.BufferGeometry | null = null;
    const sm = rig(() => (seen = far.mesh.geometry));
    sm.needsUpdate = false;
    sm.render([{}], {}, cam);
    expect(seen).toBe(far.full);
    untrackShadowProxy(far.mesh);
  });

  it('runs hooks around the render and restores everything when it fails', () => {
    const far = proxied(60);
    const order: string[] = [];
    addShadowHook({ enter: () => order.push('enter'), leave: () => order.push('leave') });
    const sm = rig(() => order.push('render'), { fails: true });
    expect(() => sm.render([{}], {}, cam)).toThrow('boom');
    expect(order.slice(-3)).toEqual(['enter', 'render', 'leave']);
    expect(far.mesh.geometry).toBe(far.full);
    untrackShadowProxy(far.mesh);
  });
});

describe('FastCull', () => {
  /** Instances scattered on a grid: three.js's own walk and ours must draw the same ones. */
  it('selects the same instances as BatchedMesh.onBeforeRender', () => {
    const box = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const mat = new THREE.MeshBasicMaterial();
    const make = () => {
      const b = new THREE.BatchedMesh(400, 64, 64, mat);
      b.perObjectFrustumCulled = true;
      b.sortObjects = false;
      const id = b.addGeometry(box);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 300; i++) {
        const inst = b.addInstance(id);
        m.makeTranslation(((i * 37) % 100) - 50, (i % 7) - 3, -((i * 53) % 200));
        b.setMatrixAt(inst, m);
      }
      return b;
    };
    const slow = make();
    const fast = make();
    const cull = new FastCull(fast);
    const sphere = new THREE.Sphere();
    const bs = new THREE.Box3().setFromBufferAttribute(box.getAttribute('position') as THREE.BufferAttribute).getBoundingSphere(sphere);
    for (let i = 0; i < 300; i++) {
      const m = new THREE.Matrix4();
      fast.getMatrixAt(i, m);
      const c = bs.center.clone().applyMatrix4(m);
      cull.setSphere(i, c.x, c.y, c.z, bs.radius);
    }
    expect(cull.install()).toBe(true);
    const cam = new THREE.PerspectiveCamera(60, 1.6, 0.5, 120);
    cam.position.set(0, 1, 5);
    cam.rotation.y = 0.3;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const ids = (b: THREE.BatchedMesh) => {
      const n = (b as unknown as { _multiDrawCount: number })._multiDrawCount;
      const data = (b as unknown as { _indirectTexture: THREE.DataTexture })._indirectTexture.image.data as unknown as Uint32Array;
      return [...data.slice(0, n)].sort((a, b2) => a - b2);
    };
    slow.onBeforeRender(null as never, null as never, cam, box, mat, null as never);
    fast.onBeforeRender(null as never, null as never, cam, box, mat, null as never);
    const want = ids(slow);
    expect(want.length).toBeGreaterThan(5);
    expect(want.length).toBeLessThan(300);
    expect(ids(fast)).toEqual(want);
    // A hidden instance is skipped by both.
    fast.setVisibleAt(want[0], false);
    fast.onBeforeRender(null as never, null as never, cam, box, mat, null as never);
    expect(ids(fast)).toEqual(want.slice(1));
    expect(cull.anyVisible(cam)).toBe(true);
  });
});
