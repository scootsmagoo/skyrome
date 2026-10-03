/** Finds the builder for a landmark: custom by id first, then generic by category. */
import type { LandmarkBuilder, LandmarkData } from './types';

const modules = import.meta.glob<{ builders: LandmarkBuilder[] }>('./builders/*.ts', { eager: true });

const byKey = new Map<string, LandmarkBuilder>();
for (const mod of Object.values(modules)) {
  for (const b of mod.builders ?? []) {
    for (const key of b.handles) {
      if (byKey.has(key)) console.warn(`[landmarks] duplicate builder for "${key}"`);
      byKey.set(key, b);
    }
  }
}

export function builderFor(lm: LandmarkData): LandmarkBuilder | undefined {
  return byKey.get(lm.id) ?? byKey.get(`category:${lm.category}`) ?? byKey.get('category:*');
}

export function registeredBuilderKeys(): string[] {
  return [...byKey.keys()].sort();
}
