/**
 * The anachronism cheat (`anachronism` in the console): modern guns in AD 113, for fun. Session
 * only, never saved, never in the story, the shops or the loot. The logic is `guns.ts` (GunSystem,
 * `game.guns`); the look and sound (models in the hand, muzzle flashes, tracers, the rocket, blasts,
 * impacts, gunshots) listen to the events below, so either side can change on its own.
 */
import type * as THREE from 'three';

export type GunId = 'pistol' | 'rifle' | 'shotgun' | 'rpg';

declare module '../../core/Events' {
  interface GameEvents {
    /** The cheat was switched on or off. */
    'gun:armed': { on: boolean };
    /** The gun in hand changed (null: holstered). */
    'gun:equip': { gun: GunId | null };
    /**
     * One trigger pull. `muzzle` is the world point the shot leaves from, `dir` the (unit) aim.
     * A hit-scan gun lists one entry per pellet: where it stopped and what it hit
     * (`actorId` for a person, else the world; `null` point = it flew off into the distance).
     */
    'gun:fire': {
      gun: GunId;
      muzzle: THREE.Vector3Like;
      dir: THREE.Vector3Like;
      hits: { point: THREE.Vector3Like | null; normal: THREE.Vector3Like | null; actorId: string | null }[];
    };
    /** A rocket left the tube (id for its flight); its position is reported each frame. */
    'gun:rocket': { id: number; position: THREE.Vector3Like; velocity: THREE.Vector3Like; live: boolean };
    /** A rocket burst (or anything else that explodes): the blast and its radius. */
    'gun:explode': { position: THREE.Vector3Like; radius: number };
  }
}
