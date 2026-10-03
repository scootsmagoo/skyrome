/** Relative placement of one atlas landmark in another's local frame (game metres, no heights). */
import { LANDMARK_BY_ID } from '../../../../data/atlas';
import { WORLD_SCALE } from '../../../coords';
import type { LandmarkData } from '../../types';

export interface RelFrame {
  /** Centre of `other` in the host's local frame (game m). */
  x: number;
  z: number;
  /** Rotation of `other`'s local frame relative to the host's (radians, about +y). */
  yaw: number;
}

export function relLocal(host: Pick<LandmarkData, 'center' | 'rotation'>, other: Pick<LandmarkData, 'center' | 'rotation'>): RelFrame {
  const th = (host.rotation * Math.PI) / 180;
  const dx = (other.center[0] - host.center[0]) * WORLD_SCALE;
  const dz = (other.center[1] - host.center[1]) * WORLD_SCALE;
  return {
    x: dx * Math.cos(th) + dz * Math.sin(th),
    z: -dx * Math.sin(th) + dz * Math.cos(th),
    yaw: (-(other.rotation - host.rotation) * Math.PI) / 180,
  };
}

/** `relLocal` by atlas id (throws if missing). */
export function relById(hostId: string, otherId: string): RelFrame {
  const h = LANDMARK_BY_ID[hostId];
  const o = LANDMARK_BY_ID[otherId];
  if (!h || !o) throw new Error(`[palcirc] unknown landmark ${hostId} / ${otherId}`);
  return relLocal(h as LandmarkData, o as LandmarkData);
}

/** Map a point from `other`'s local frame into the host's (x, z only). */
export function toHost(r: RelFrame, x: number, z: number): [number, number] {
  const c = Math.cos(r.yaw);
  const s = Math.sin(r.yaw);
  // rotation.y = yaw: x' = x cos + z sin, z' = −x sin + z cos.
  return [r.x + x * c + z * s, r.z - x * s + z * c];
}

/** Map a point from the host's local frame into `other`'s (inverse of toHost). */
export function fromHost(r: RelFrame, x: number, z: number): [number, number] {
  const dx = x - r.x;
  const dz = z - r.z;
  const c = Math.cos(r.yaw);
  const s = Math.sin(r.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}
