/**
 * Generates the procedural texture sets off the main thread while the city is being built (perf
 * audit 2026-10: they were ~1 s of the boot). The page posts the ids, the worker runs the same
 * deterministic generators (procedural.ts) and transfers each set's pixels back as it finishes.
 */
import { generateProcedural } from './procedural';
import type { ProceduralId } from './catalog';

const scope = self as unknown as { postMessage(m: unknown, transfer: Transferable[]): void; onmessage: ((e: MessageEvent<ProceduralId[]>) => void) | null };

scope.onmessage = (e) => {
  for (const id of e.data) {
    try {
      const img = generateProcedural(id);
      const transfer = [img.color.buffer, img.normal?.buffer, img.arm?.buffer].filter((b): b is ArrayBuffer => !!b);
      scope.postMessage({ id, img }, transfer);
    } catch (err) {
      scope.postMessage({ id, error: String(err) }, []);
    }
  }
};
