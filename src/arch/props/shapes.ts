/** Small cached geometry helpers for props (lathe profiles, loops). */
import * as THREE from 'three';

const latheCache = new Map<string, THREE.BufferGeometry>();

/** Lathe from [radius, y] pairs (bottom → top). Cached by key. */
export function lathe(key: string, profile: [number, number][], seg = 12): THREE.BufferGeometry {
  let g = latheCache.get(key);
  if (!g) {
    g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
    g.computeVertexNormals();
    latheCache.set(key, g);
  }
  return g;
}

const torusCache = new Map<string, THREE.BufferGeometry>();
/** Half / partial torus (handles, hoops). The arc lies in the XY plane starting at +X. */
export function loop(radius: number, tube: number, arc = Math.PI, seg = 8): THREE.BufferGeometry {
  const key = `${radius}|${tube}|${arc}|${seg}`;
  let g = torusCache.get(key);
  if (!g) {
    g = new THREE.TorusGeometry(radius, tube, 5, seg, arc);
    torusCache.set(key, g);
  }
  return g;
}

/** Lumpy "sack" geometry: a squashed sphere with a tied neck. */
let sackGeo: THREE.BufferGeometry | null = null;
export function sackGeometry(): THREE.BufferGeometry {
  if (sackGeo) return sackGeo;
  const prof: [number, number][] = [
    [0.0, 0.0], [0.17, 0.01], [0.23, 0.06], [0.25, 0.18], [0.24, 0.32], [0.2, 0.43], [0.12, 0.5], [0.05, 0.53], [0.06, 0.56], [0.09, 0.62], [0.03, 0.64], [0, 0.64],
  ];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10);
  // Slump: flatten one side and wobble.
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.08 * Math.sin(a * 3 + y * 7) + (y < 0.4 ? 0.12 * (1 - y / 0.4) : 0);
    pos.setXYZ(i, x * k * (x > 0 ? 1.05 : 0.95), y, z * k);
  }
  g.computeVertexNormals();
  sackGeo = g;
  return g;
}
