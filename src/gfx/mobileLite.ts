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
 *
 * On by default on a phone, off elsewhere. `?lite=0` turns them all off, `?lite=1` all on, and
 * `?lite=proc,ktx` picks (A/B runs). Desktop behaviour is unchanged.
 */
import { isMobileDevice } from '../core/graphics';

export interface Lite {
  proc: boolean;
  ktx: boolean;
  atlas: boolean;
  ground: boolean;
  flush: boolean;
}

function read(): Lite {
  const none: Lite = { proc: false, ktx: false, atlas: false, ground: false, flush: false };
  const all: Lite = { proc: true, ktx: true, atlas: true, ground: true, flush: true };
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lite') : null;
  if (q === '0') return none;
  if (q === '1') return all;
  if (q) {
    const on = new Set(q.split(','));
    return { proc: on.has('proc'), ktx: on.has('ktx'), atlas: on.has('atlas'), ground: on.has('ground'), flush: on.has('flush') };
  }
  return isMobileDevice() ? all : none;
}

/** Fixed at first read (module load of whoever needs it first); the same for the whole page life. */
export const lite: Lite = read();
