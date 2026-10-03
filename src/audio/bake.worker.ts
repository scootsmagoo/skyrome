/**
 * Bakes sounds off the main thread. The engine posts `{ seq, id }`; the worker bakes every variant
 * with the same deterministic code as the main thread and transfers the PCM back.
 */
import { forget, getVariants } from './bank';

interface Req {
  seq: number;
  id: string;
}

const scope = self as unknown as { postMessage(m: unknown, transfer: Transferable[]): void; onmessage: ((e: MessageEvent<Req>) => void) | null };

scope.onmessage = (e) => {
  const { seq, id } = e.data;
  const t0 = performance.now();
  try {
    const variants = getVariants(id);
    if (!variants) {
      scope.postMessage({ seq, id, error: `unknown sound ${id}` }, []);
      return;
    }
    forget(id); // the buffers are transferred; keep nothing here
    scope.postMessage({ seq, id, ms: performance.now() - t0, variants }, variants.map((v) => v.buffer as ArrayBuffer));
  } catch (err) {
    scope.postMessage({ seq, id, error: String(err) }, []);
  }
};
