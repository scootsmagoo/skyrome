/**
 * UV-density audit (`?uvcheck=1`): every textured material swaps its maps for a checker whose
 * squares are 1 m on the ground (UV unit = 2 m, `UV_METERS`), with a finer 0.25 m grid and an "F"
 * in one square to show orientation, tinted by a hash of the material id. On a surface with
 * correct world-scale UVs the squares are square and one metre wide; stretched or streaky UVs show
 * as long bars, sheared diamonds or smeared lines. Walk it over a landmark and look.
 */
import * as THREE from 'three';
import type { MaterialId } from './materialIds';

/** True when the page was opened with ?uvcheck=1 (browser only). */
export function uvCheckEnabled(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('uvcheck') === '1';
}

/** Stable hue (0..1) for a material id, spread by the golden ratio so neighbours differ. */
export function uvCheckHue(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((((h >>> 0) % 997) / 997) * 0.618034 * 7) % 1;
}

let checker: THREE.CanvasTexture | null = null;

function checkerTexture(): THREE.CanvasTexture {
  if (checker) return checker;
  const S = 512; // one UV unit = 2 m: 2 x 2 squares of 1 m
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#d8d8d8' : '#8c8c8c';
      g.fillRect((x * S) / 2, (y * S) / 2, S / 2, S / 2);
    }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    const p = (i * S) / 8;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, S);
    g.moveTo(0, p);
    g.lineTo(S, p);
    g.stroke();
  }
  g.fillStyle = '#202020';
  g.font = 'bold 150px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('F', S / 4, S / 4);
  g.lineWidth = 6;
  g.strokeStyle = '#000';
  g.strokeRect(3, 3, S - 6, S - 6);
  checker = new THREE.CanvasTexture(c);
  checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
  checker.colorSpace = THREE.SRGBColorSpace;
  checker.anisotropy = 16;
  return checker;
}

/** Make `m` a plain checker-mapped material tinted per id (call instead of building the real look). */
export function applyUvCheck(m: THREE.MeshStandardMaterial, id: MaterialId) {
  m.map = checkerTexture();
  m.normalMap = null;
  m.aoMap = null;
  m.roughnessMap = null;
  m.metalness = 0;
  m.roughness = 0.9;
  m.emissive.setRGB(0, 0, 0);
  m.color.setHSL(uvCheckHue(id), 0.55, 0.62);
}
