/**
 * Blob shadows: a soft dark disc on the ground under every nearby character, one instanced draw.
 * It grounds people on every graphics tier (the Low tier has no shadow maps at all) and, on the
 * tiers that do, adds the contact darkness under the feet that a 4 cm shadow texel and the AO
 * pass leave faint. It fades with the sun's own shadow strength: full when the shadow map is off,
 * light when it is on, a little at night (torches and moonlight cast no map shadows here).
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';

const MAX_BLOBS = 192;
/** Beyond this many metres from the camera a person's blob is not drawn. */
const RANGE = 45;
const RADIUS = 0.5;

/** A soft round falloff, as an RGBA texture (three's alphaMap reads green). */
function makeFalloff(size = 32): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const t = Math.max(0, 1 - r);
      const a = Math.round(255 * t * t * (3 - 2 * t));
      data.set([a, a, a, 255], (y * size + x) * 4);
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class BlobShadows {
  readonly mesh: THREE.InstancedMesh;
  /** Opacity at the centre of a disc (before the sun/shadow-map scaling). */
  strength = 0.5;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly falloff = makeFalloff();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(RADIUS * 2, RADIUS * 2, 1);

  constructor(private readonly game: Game) {
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: this.falloff,
      transparent: true,
      opacity: this.strength,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.material, MAX_BLOBS);
    this.mesh.name = 'blobShadows';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    game.scene.add(this.mesh);
  }

  /** `shadowStrength` is the key light's shadow-map strength this frame (0..1); `inside` 0..1. */
  update(shadowStrength: number, daylight: number, inside: number) {
    const actors = this.game.actors?.all();
    if (!actors) return;
    const cam = this.game.camera.position;
    const r2 = RANGE * RANGE;
    const mapShadows = this.game.renderer.shadowMap.enabled && this.game.settings.data.shadows !== 'off';
    let n = 0;
    for (let i = 0; i < actors.length && n < MAX_BLOBS; i++) {
      const a = actors[i];
      if (a.disposed || !a.root.visible) continue;
      const p = a.position;
      const dx = p.x - cam.x, dz = p.z - cam.z;
      if (dx * dx + dz * dz > r2) continue;
      this.pos.set(p.x, p.y + 0.04, p.z);
      this.m.compose(this.pos, this.q, this.scale);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    // Light where the real shadow already darkens the feet, full where there is none.
    const base = mapShadows ? 0.22 + 0.1 * (1 - shadowStrength) : this.strength;
    this.material.opacity = base * (0.55 + 0.45 * daylight) * (1 - 0.5 * inside);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.falloff.dispose();
  }
}
