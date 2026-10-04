/**
 * Shared plumbing for the capfora builders: build a landmark at the requested detail, optionally a
 * cheap far stand-in (the same generator at 'low' detail, shadows off), and package spots.
 */
import type * as THREE from 'three';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { LandmarkBuild, LandmarkContext } from '../../types';
import type { CapSpot } from './frame';
import { addReadables } from './life';

export type Detail = 'high' | 'low';

export interface MakeOptions {
  /**
   * Far stand-in shown beyond `cull`: `true` builds the same generator at 'low' detail; a function
   * writes a dedicated cheap massing (colliders ignored).
   */
  far?: boolean | ((b: MeshBuilder) => void);
  /** Cull distance of the full-detail object (m); default from the landmark height. */
  cull?: number;
}

/**
 * `make(b, detail, spots)` writes geometry and colliders into `b` and pushes spots. It is called
 * once at `ctx.detail` and, with `far`, once more at 'low' into a throw-away builder whose
 * colliders are discarded.
 */
export function makeLandmark(ctx: LandmarkContext, make: (b: MeshBuilder, detail: Detail, spots: CapSpot[]) => void, opts: MakeOptions = {}): LandmarkBuild {
  const b = ctx.builder();
  const spots: CapSpot[] = [];
  make(b, ctx.detail, spots);
  // Inscriptions with a text become "Read" interactions in the running game.
  addReadables(ctx, spots);
  const object = b.build(ctx.lm.id);
  let far: THREE.Object3D | undefined;
  if (opts.far) {
    const fb = ctx.builder();
    if (typeof opts.far === 'function') opts.far(fb);
    else make(fb, 'low', []);
    far = fb.build(`${ctx.lm.id}:far`);
    far.traverse((o) => {
      (o as THREE.Mesh).castShadow = false;
    });
  }
  return { object, colliders: b.colliders, spots, far, cullDistance: opts.cull };
}
