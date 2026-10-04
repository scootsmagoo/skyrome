/**
 * Smoke tests: every generator builds in Node (no DOM), produces finite geometry within its
 * triangle budget, and registers colliders where the player can reach.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cavea, ellipticalArcade } from '../src/arch/classical/amphitheatre';
import { arcade, colosseumStoreys, plainArch, triumphalArch } from '../src/arch/classical/arch';
import { basilica } from '../src/arch/classical/basilica';
import { honorificColumn, obelisk } from '../src/arch/classical/monuments';
import { porticus, quadriporticus } from '../src/arch/classical/porticus';
import { armoredEmperor, equestrian, quadriga, seatedDeity, togate } from '../src/arch/classical/statues';
import { temple } from '../src/arch/classical/temple';
import { tholos } from '../src/arch/classical/tholos';
import { apse, barrelVault, dome, exedra, rotunda } from '../src/arch/classical/vaults';
import { stairs } from '../src/arch/common/stairs';
import { wall } from '../src/arch/common/walls';
import { MeshBuilder } from '../src/gfx/MeshBuilder';

function stats(b: MeshBuilder) {
  const g = b.build('x');
  let tris = 0;
  let finite = true;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.getAttribute('position');
    tris += ((m.geometry.index?.count ?? p.count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) finite = false;
    const n = m.geometry.getAttribute('normal');
    for (let i = 0; i < n.array.length; i++) if (!Number.isFinite(n.array[i])) finite = false;
  });
  return { tris, finite, colliders: b.colliders.length, box: new THREE.Box3().setFromObject(g) };
}

type Case = [string, (b: MeshBuilder) => void, number, number];
const K = 0.6;
const cases: Case[] = [
  ['temple high', (b) => temple(b, { front: 6, width: 18 }), 260_000, 10],
  ['temple low', (b) => temple(b, { front: 6, width: 18, detail: 'low' }), 30_000, 10],
  ['tholos steps', (b) => tholos(b, { radius: 5.5, base: 'steps' }), 180_000, 5],
  ['tholos podium low', (b) => tholos(b, { radius: 5.5, base: 'podium', detail: 'low' }), 25_000, 5],
  ['triumphal arch', (b) => triumphalArch(b, { span: 3.2 }), 130_000, 2],
  ['triple arch low', (b) => triumphalArch(b, { bays: 3, span: 3.9, detail: 'low' }), 40_000, 2],
  ['plain arch', (b) => plainArch(b, { span: 3 }), 5_000, 2],
  ['arcade storeys', (b) => arcade(b, { bays: 4, bay: 4, pier: 1.4, depth: 1.4, storeys: colosseumStoreys(K) }), 90_000, 4],
  ['elliptical arcade 16 bays low', (b) => ellipticalArcade(b, { rx: 20, rz: 16, bays: 16, storeys: colosseumStoreys(K).slice(0, 2), depth: 1.4, detail: 'low' }), 40_000, 16],
  ['cavea', (b) => cavea(b, { arenaRx: 20, arenaRz: 12, podium: 2.4, tiers: [{ rows: 6 }, { rows: 6, wall: 1.2 }], segments: 48 }), 60_000, 48],
  ['basilica', (b) => basilica(b, { length: 30, naveWidth: 12, aisleWidth: 5, apses: 'both' }), 300_000, 10],
  ['porticus', (b) => porticus(b, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0)], { depth: 5 }), 80_000, 3],
  ['quadriporticus low', (b) => quadriporticus(b, 30, 40, { depth: 5, detail: 'low' }), 60_000, 10],
  ['dome', (b) => dome(b, { radius: 10, oculus: 2 }), 30_000, 0],
  ['rotunda', (b) => rotunda(b, { radius: 10 }), 40_000, 10],
  ['barrel vault', (b) => barrelVault(b, { span: 5, length: 8, springing: 3, coffers: true }), 10_000, 2],
  ['exedra', (b) => exedra(b, { radius: 6, height: 6, colonnade: { order: 'ionic', count: 4 } }), 60_000, 4],
  ['apse', (b) => apse(b, { radius: 4, height: 5 }), 20_000, 4],
  ['obelisk', (b) => obelisk(b, { height: 13 }), 2_000, 2],
  ['honorific column', (b) => honorificColumn(b, { height: 18, D: 2.2 }), 40_000, 2],
  [
    'statues',
    (b) => {
      togate(b, new THREE.Matrix4());
      armoredEmperor(b, new THREE.Matrix4());
      seatedDeity(b, new THREE.Matrix4());
      equestrian(b, new THREE.Matrix4());
      quadriga(b, new THREE.Matrix4());
    },
    120_000,
    0,
  ],
  [
    'wall with openings',
    (b) =>
      wall(b, {
        length: 12,
        height: 6,
        thickness: 0.8,
        courses: 0.6,
        openings: [
          { kind: 'door', x: 3, width: 1.6, height: 3 },
          { kind: 'window', x: 7, width: 1.2, height: 1.6, arched: true },
          { kind: 'niche', x: 10, width: 1, height: 2 },
        ],
      }),
    20_000,
    4,
  ],
  ['stairs', (b) => stairs(b, { width: 4, rise: 0.2, run: 0.34, count: 10 }), 200, 10],
];

describe('generators build cleanly within budget', () => {
  for (const [name, fn, maxTris, minColliders] of cases) {
    it(name, () => {
      const b = new MeshBuilder();
      fn(b);
      const s = stats(b);
      expect(s.finite).toBe(true);
      expect(s.tris).toBeGreaterThan(10);
      expect(s.tris).toBeLessThan(maxTris);
      expect(s.colliders).toBeGreaterThanOrEqual(minColliders);
      expect(s.box.isEmpty()).toBe(false);
    });
  }
});

describe('vault coffers stay inside their open faces', () => {
  const bounds = (fn: (b: MeshBuilder) => void) => {
    const b = new MeshBuilder();
    fn(b);
    return new THREE.Box3().setFromObject(b.build('v'));
  };
  it('barrel vault: no rib ends past the end faces', () => {
    const box = bounds((b) => barrelVault(b, { span: 6, length: 10, springing: 4, coffers: true }));
    expect(box.min.z).toBeGreaterThan(-1e-3);
    expect(box.max.z).toBeLessThan(10 + 1e-3);
  });
  it('apse / exedra semi-dome: nothing protrudes past the chord (coffers end in edge bands)', () => {
    for (const fn of [(b: MeshBuilder) => apse(b, { radius: 6, height: 7 }), (b: MeshBuilder) => exedra(b, { radius: 6, height: 7 })]) {
      expect(bounds(fn).min.z).toBeGreaterThan(-0.01);
    }
  });
});
