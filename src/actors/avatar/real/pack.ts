/**
 * Smaller vertex attributes for finished avatar geometry (body LODs, shells, hair, eyes). Every
 * person keeps their geometry on the CPU (gore cuts it, and the caches hand it to the next person
 * with the same look) and on the GPU, and the floats were 48 MB in the Forum's crowd (memory audit,
 * phase 3). Packed:
 *
 *  - skinWeight  float × 4 in [0, 1]   → normalized uint16 (error ≤ 8e-6 of a weight)
 *  - skinIndex   any int < 256          → uint8 (the rig has 25 bones)
 *  - normal, tangent, strand in [−1, 1] → normalized int16 (error ≤ 2e-5)
 *  - color, uv in [0, 1]                → normalized uint16 (finer than any 8-bit texel or colour step)
 *
 * The shaders read the same floats (WebGL normalizes on fetch); `BufferAttribute.getX/getComponent`
 * and `fromBufferAttribute` denormalize. Code that reads `.array` directly must go through
 * `floatsOf` (the gore cuts do). An attribute is left as it is when a value lies outside its range
 * (a colour above 1 stays float, so nothing is clamped), when it is dynamic or interleaved, or when
 * it is not float. Call it last, when nothing will edit the geometry again.
 */
import * as THREE from 'three';

type Kind = 'unorm16' | 'snorm16';

const RULES: Record<string, Kind> = {
  skinWeight: 'unorm16',
  normal: 'snorm16',
  tangent: 'snorm16',
  strand: 'snorm16',
  color: 'unorm16',
  uv: 'unorm16',
};

/** Pack a finished geometry's attributes in place (see the header). Returns the bytes saved. */
export function packSkinned(g: THREE.BufferGeometry): number {
  let saved = 0;
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute;
    if ((a as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute || a.usage !== THREE.StaticDrawUsage) continue;
    const src = a.array as ArrayLike<number> & { byteLength: number };
    if (!src) continue;
    if (name === 'skinIndex') {
      if (src instanceof Uint8Array) continue;
      let max = 0;
      let whole = true;
      for (let i = 0; i < src.length; i++) {
        const v = src[i];
        if (v > max) max = v;
        if (v < 0 || v !== Math.floor(v)) whole = false;
      }
      if (!whole || max > 255) continue;
      const out = Uint8Array.from(src);
      saved += src.byteLength - out.byteLength;
      g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
      continue;
    }
    const kind = RULES[name];
    if (!kind || !(src instanceof Float32Array) || a.normalized) continue;
    const lo = kind === 'unorm16' ? 0 : -1;
    let ok = true;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (!(v >= lo && v <= 1)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // Rounded to nearest (as Math.round, which is several times slower in this loop): + 0.5 then the
    // typed array truncates (unsigned), or floor (signed).
    let out: Uint16Array | Int16Array;
    if (kind === 'unorm16') {
      out = new Uint16Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = src[i] * 65535 + 0.5;
    } else {
      out = new Int16Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = Math.floor(src[i] * 32767 + 0.5);
    }
    saved += src.byteLength - out.byteLength;
    const packed = new THREE.BufferAttribute(out, a.itemSize, true);
    packed.name = a.name;
    g.setAttribute(name, packed);
  }
  return saved;
}

/**
 * An attribute's values as plain floats: its own array when it is float already, else a denormalized
 * copy (for code that indexes `.array` directly, such as the gore cuts).
 */
export function floatsOf(a: THREE.BufferAttribute): ArrayLike<number> {
  const src = a.array as ArrayLike<number>;
  if (!a.normalized) return src;
  const out = new Float32Array(src.length);
  const typed = src as Parameters<typeof THREE.MathUtils.denormalize>[1];
  for (let i = 0; i < src.length; i++) out[i] = THREE.MathUtils.denormalize(src[i], typed);
  return out;
}
