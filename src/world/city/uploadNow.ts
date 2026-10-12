/**
 * Upload finished static batches to the GPU now, one at a time, instead of all of them on the first
 * drawn frame. three.js sends a mesh's vertex arrays (and its material's textures) the first time the
 * mesh is drawn, and gfx/release frees the CPU copies right after; so until the first frame every
 * copy of every batch lives at once, and on a phone that spike (plus the copy each upload makes for
 * the GPU process) is what gets the tab killed. Here each batch is drawn once, alone, into a 1 x 1
 * target with a camera that sees none of it: three.js uploads it and frees its arrays, the draw
 * itself is empty.
 *
 * Phones only (gfx/mobileLite `flush`). Only for batches that are finished: their arrays are freed
 * by the upload, so nothing may be added to them or edited afterwards (Batch.finish).
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { fastCullSwitches } from '../../gfx/fastCull';
import { allMaterials } from '../../gfx/materials';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Draw each group of `groups` once (the meshes of a group together), with a yield between groups (so
 * the browser can free what the upload released). `before(i)` runs just before group i is drawn (the
 * caller finishes its batches there, so only one group's arrays are rebuilt at a time). Everything else in the scene is hidden for the draws, except the lights, so the
 * material programs compile in the real scene's light set (they are needed at the first frame anyway).
 */
export async function uploadBatchesNow(game: Game, groups: readonly (readonly THREE.Object3D[])[], before?: (i: number) => void): Promise<void> {
  const { renderer, scene } = game;
  if (!groups.length) return;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
  camera.position.set(0, 20000, 0);
  camera.rotation.x = Math.PI / 2; // straight up, away from the world
  camera.updateMatrixWorld(true);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, colorSpace: THREE.LinearSRGBColorSpace });
  const sm = renderer.shadowMap;
  const saved = { auto: sm.autoUpdate, need: sm.needsUpdate, pre: fastCullSwitches.precull, rt: renderer.getRenderTarget(), xr: renderer.xr.enabled };
  // The lights and the chain above them stay; the chain above the batch stays; the rest is hidden.
  const keep = new Set<THREE.Object3D>();
  const mark = (o: THREE.Object3D | null) => {
    for (let p = o; p && !keep.has(p); p = p.parent) keep.add(p);
  };
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight) mark(o);
  });
  try {
    sm.autoUpdate = false;
    sm.needsUpdate = false;
    fastCullSwitches.precull = false;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(target);
    for (let i = 0; i < groups.length; i++) {
      before?.(i);
      const meshes = groups[i].filter((m) => m.parent);
      if (!meshes.length) continue;
      const hidden: THREE.Object3D[] = [];
      const own = new Set(keep);
      for (const mesh of meshes) for (let p: THREE.Object3D | null = mesh; p; p = p.parent) own.add(p);
      const isMesh = new Set<THREE.Object3D>(meshes);
      const hide = (o: THREE.Object3D) => {
        for (const c of o.children) {
          if (!own.has(c) && c.visible) {
            c.visible = false;
            hidden.push(c);
          } else if (own.has(c) && !isMesh.has(c)) hide(c);
        }
      };
      hide(scene);
      const was = meshes.map((m) => m.visible);
      for (const m of meshes) m.visible = true;
      try {
        renderer.render(scene, camera);
      } catch (err) {
        console.warn('[upload] draw failed', err);
      }
      meshes.forEach((m, k) => (m.visible = was[k]));
      for (const o of hidden) o.visible = true;
      await tick();
    }
  } finally {
    sm.autoUpdate = saved.auto;
    sm.needsUpdate = saved.need;
    fastCullSwitches.precull = saved.pre;
    renderer.xr.enabled = saved.xr;
    renderer.setRenderTarget(saved.rt);
    target.dispose();
  }
}

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap'] as const;

/**
 * Upload the textures of the material library that are loaded already (procedural sets, KTX2 sets
 * that have arrived), so their CPU pixels are freed now (gfx/release) instead of at the first frame.
 * Textures still loading are skipped; the first frame takes them as before. Returns how many went up.
 */
export function uploadTexturesNow(game: Game): number {
  let n = 0;
  const seen = new Set<THREE.Texture>();
  for (const m of allMaterials().values()) {
    const mat = m as unknown as Record<string, THREE.Texture | null>;
    for (const k of MAP_KEYS) {
      const t = mat[k];
      if (!t || !t.isTexture || seen.has(t)) continue;
      seen.add(t);
      const ready = (t as THREE.CompressedTexture).isCompressedTexture ? (t as THREE.CompressedTexture).mipmaps?.length > 0 : !!t.image;
      if (!ready) continue;
      try {
        game.renderer.initTexture(t);
        n++;
      } catch {
        /* not uploadable yet: left to the first frame */
      }
    }
  }
  return n;
}
