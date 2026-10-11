/**
 * First-arrival prewarm (phase 4b, LOOK: docs/design/solid-ground.md §4). The surface audit saw the
 * first view at the Porta Capena go on changing for 2.7 s after the fade-in: the people's skin, eye
 * and hair programs compiled as the first bodies were built (two shader compiles, a frame each), their
 * textures uploaded one by one, and the last street cells and block levels streamed in. All of that is
 * paid behind the loading screen instead, once, bounded by `maxMs`:
 *
 *   1. the ground's photo layers (Terrain.ready) and every photo set asked for so far are in, and the
 *      ground's texture arrays are uploaded (renderer.initTexture);
 *   2. the street cells and the full block levels within the near radius are built
 *      (CityStreamer.settle);
 *   3. the staged body builds of the people already spawned are drained (stepRealBuilds);
 *   4. the people's programs are compiled: everything now in the scene, plus probes for the variants
 *      the crowd will need (the unpainted skin of the far LODs, the eyes) cast from the player's own
 *      body, compiled in the real scene's light set (renderer.compile);
 *   5. every texture of every material in the scene is uploaded (renderer.initTexture).
 *
 *   await prewarmArrival(game);   // boot.ts, once, before the loading screen fades
 *
 * `?prewarm=0` skips it (A/B: scripts/audit/surface.mjs --mode settle at the Porta Capena).
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { whenTexturesLoaded } from './materials';
import { skinMaterial } from '../actors/avatar/real/skin';
import { stagedBuilds, stepRealBuilds } from '../actors/avatar/real/RealBody';

export interface PrewarmReport {
  ms: number;
  /** Shader programs the renderer holds after the prewarm, and how many it gained. */
  programs: number;
  programsAdded: number;
  /** Textures uploaded by step 5 (ones the renderer did not hold yet). */
  texturesUploaded: number;
  /** Staged body builds finished (step 3) and left (out of time). */
  bodiesBuilt: number;
  bodiesLeft: number;
  /** Full block levels and street cells still missing within the near radius after step 2. */
  blocksLeft: number;
  cellsLeft: number;
  skipped: boolean;
}

const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'envMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap'] as const;

const frames = (n: number) =>
  new Promise<void>((r) => {
    let i = 0;
    const f = () => (++i >= n ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  });

export async function prewarmArrival(game: Game, opts: { maxMs?: number } = {}): Promise<PrewarmReport> {
  const t0 = performance.now();
  const maxMs = opts.maxMs ?? 1800;
  const left = () => maxMs - (performance.now() - t0);
  const renderer = game.renderer;
  const report: PrewarmReport = { ms: 0, programs: renderer.info.programs?.length ?? 0, programsAdded: 0, texturesUploaded: 0, bodiesBuilt: 0, bodiesLeft: 0, blocksLeft: 0, cellsLeft: 0, skipped: false };
  const programs0 = report.programs;
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('prewarm') === '0') {
    report.skipped = true;
    return report;
  }
  const bounded = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))]);

  // 1. The ground's photo layers and the photo sets, then the ground arrays on the GPU.
  const terrain = game.terrain;
  if (terrain) await bounded(terrain.ready, left() * 0.5);
  await bounded(whenTexturesLoaded(), left() * 0.5);
  if (terrain) {
    renderer.initTexture(terrain.uniforms.tAlbedo.value);
    renderer.initTexture(terrain.uniforms.tSurface.value);
  }

  // 2. The near street cells and full block levels.
  const streamer = game.city?.streamer;
  if (streamer) {
    const r = streamer.settle(game.camera.position, Math.max(100, left() * 0.45));
    report.blocksLeft = r.blocksLeft;
    report.cellsLeft = r.cellsLeft;
  }

  // 3. The bodies of the people already spawned (the crowd spawns over the first frames: give it two).
  await frames(2);
  while (stagedBuilds() > 0 && left() > 150) report.bodiesBuilt += stepRealBuilds(12);
  report.bodiesLeft = stagedBuilds();

  // 4. Programs: the scene as it stands, plus the crowd's variants cast from the player's body.
  const probes = probeVariants(game.scene);
  try {
    renderer.compile(game.scene, game.camera);
    if (probes.children.length) renderer.compile(probes, game.camera, game.scene);
  } catch (err) {
    console.warn('[prewarm] compile failed', err);
  }
  for (const c of probes.children) (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.Material).dispose();

  // 5. Textures of every material in the scene.
  const seen = new Set<THREE.Texture>();
  game.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) {
      for (const k of MAP_SLOTS) {
        const t = (mm as unknown as Record<string, THREE.Texture | null>)[k];
        if (t && t.isTexture && !seen.has(t)) {
          seen.add(t);
          if (left() < 40) break;
          const had = !!(renderer.properties.get(t) as { __webglTexture?: unknown }).__webglTexture;
          try {
            renderer.initTexture(t);
          } catch {
            /* a texture that cannot upload yet (its image still loading) is left to the frame */
          }
          if (!had) report.texturesUploaded++;
        }
      }
    }
  });
  report.programs = renderer.info.programs?.length ?? 0;
  report.programsAdded = report.programs - programs0;
  report.ms = Math.round(performance.now() - t0);
  return report;
}

/**
 * Probe meshes for the programs the crowd needs that the scene may not hold yet: the unpainted skin
 * (every LOD past the first) on the player's own body geometry and skeleton, so the program's
 * parameters (skinning, tangents, uv sets) are the real ones. Empty when the player has no real body.
 */
function probeVariants(scene: THREE.Scene): THREE.Group {
  const g = new THREE.Group();
  let skin: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!skin && m.isSkinnedMesh && (m.material as THREE.Material)?.name?.startsWith('skin:')) skin = m;
  });
  if (!skin) return g;
  const src = skin as THREE.SkinnedMesh;
  const mat = src.material as THREE.MeshStandardMaterial;
  if (!mat.normalMap || !mat.aoMap) return g;
  const plain = skinMaterial('prewarm', '#b07c58', { normal: mat.normalMap, ao: mat.aoMap });
  const probe = new THREE.SkinnedMesh(src.geometry, plain);
  probe.bind(src.skeleton, src.bindMatrix);
  probe.frustumCulled = false;
  g.add(probe);
  return g;
}
