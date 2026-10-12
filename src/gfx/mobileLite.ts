/**
 * Memory savers for phones (isMobileDevice, core/graphics.ts). A phone tab is killed by the system at
 * a fraction of what a laptop tolerates, and the boot's peak, not the frame rate, is what kills it
 * (measured: scripts in docs/research/mobile-crash-2026-10.md). Each saver is a flag, read once:
 *
 *   proc    procedural texture sets (travertine, slabs, stucco, mosaic ...) at half size
 *   ktx     photo sets (KTX2) without their top mip level: colour 2048 -> 1024, normal 1024 -> 512
 *   atlas   inscription atlas pages at 512 px and half the pixel density (same signs per page)
 *   ground  the terrain's layer arrays at 512 / 256 px instead of 1024 / 512
 *   flush   finished static batches are uploaded to the GPU (and their CPU arrays freed) as they are
 *           built, not all on the first frame (world/city/uploadNow.ts)
 *   gens    landmark batches are capped at about a million live vertices: a full one is finished and uploaded,
 *           and the next piece starts a new batch (world/landmarks/landmarkBatch.ts); needs flush
 *   bodies  people (lod 'auto' avatars) are never built at the finest body level (LOD 0, 70 % of the build time),
 *           and one that appears far away starts at the coarse level instead of building two (HumanoidAvatar, Npc)
 *   rapier  removing a body does not re-scan every collider and body (core/Physics.ts)
 *   detail  priority-2 landmarks built at their low detail, as priority 3 already is (world/rome/buildRome.ts)
 *
 * On by default on a phone, off elsewhere. `?lite=0` turns them all off, `?lite=1` all on, and
 * `?lite=proc,ktx` picks (A/B runs). Desktop behaviour is unchanged.
 */
import { isMobileDevice } from '../core/graphics';

const KEYS = ['proc', 'ktx', 'atlas', 'ground', 'flush', 'gens', 'bodies', 'rapier', 'detail'] as const;

export type Lite = Record<(typeof KEYS)[number], boolean>;

function read(): Lite {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lite') : null;
  const on = q === '0' ? new Set<string>() : q === '1' ? new Set<string>(KEYS) : q ? new Set(q.split(',')) : isMobileDevice() ? new Set<string>(KEYS) : new Set<string>();
  return Object.fromEntries(KEYS.map((k) => [k, on.has(k)])) as Lite;
}

/** Fixed at first read (module load of whoever needs it first); the same for the whole page life. */
export const lite: Lite = read();
