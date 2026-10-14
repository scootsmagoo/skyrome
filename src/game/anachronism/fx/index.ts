/**
 * The look and sound of the anachronism guns, driven only by the events in ../types.ts:
 *
 *   gun:equip   the model in the hand (and the arms round it; hand.ts)
 *   gun:fire    sound, muzzle flare and light, tracers, shell casing, and an impact (dust, sparks, chips,
 *               or blood through the gore system) at every hit
 *   gun:rocket  the rocket in flight with its smoke trail, flame and moving light
 *   gun:explode fireball, smoke column, dust ring, flying debris, a flash of light, camera shake, sound
 *
 * Everything is pooled (billboards.ts, streaks.ts, debris.ts: one draw call each) and nothing is
 * allocated per shot or per frame. `installGunFx(game)` is idempotent; `game.gunFx` is the service.
 */
import * as THREE from 'three';
import { gunSounds } from '../../../audio/sounds/guns';
import type { Game, System } from '../../../core/Game';
import { Layer } from '../../../core/Physics';
import { isMobileDevice } from '../../../core/graphics';
import { avatarMaterial } from '../../../actors/avatar/material';
import type { BloodFx } from '../../../combat/gore/blood';
import type { CombatSystem } from '../../../combat/CombatSystem';
import type { LightHandle } from '../../../world/lights/LightPool';
import type { CameraRig } from '../../../player/CameraRig';
import type { GunId } from '../types';
import { Billboards, Kind } from './billboards';
import { Debris } from './debris';
import { Scorches } from './scorch';
import { GunHand } from './hand';
import { gunModel, rocketModel, ROCKET_TAIL } from './models';
import { Streaks } from './streaks';
import { FxLight } from './light';
import { Shake } from './shake';

declare module '../../../core/Game' {
  interface Game {
    /** The anachronism guns' effects (src/game/anachronism/fx). */
    gunFx?: GunFx;
  }
}

/** Per-gun look: the flare's size, the light's strength, the tracer, the shake, the sound. */
const LOOK: Record<GunId, { flare: number; light: number; tracer: number; width: number; shake: number; sound: string; casing: boolean; blood: number }> = {
  pistol: { flare: 0.26, light: 22, tracer: 2.4, width: 0.045, shake: 0.08, sound: 'gun.pistol', casing: true, blood: 8 },
  rifle: { flare: 0.36, light: 26, tracer: 2.4, width: 0.045, shake: 0.06, sound: 'gun.rifle', casing: true, blood: 5 },
  shotgun: { flare: 0.7, light: 55, tracer: 1.6, width: 0.025, shake: 0.3, sound: 'gun.shotgun', casing: false, blood: 3 },
  rpg: { flare: 0.9, light: 70, tracer: 0, width: 0, shake: 0.35, sound: 'gun.rpg.launch', casing: false, blood: 0 },
};

/** Debris palettes (linear): stone, brick, plaster, wood. */
const CHUNKS: readonly (readonly [number, number, number])[] = [
  [0.4, 0.34, 0.26],
  [0.32, 0.12, 0.07],
  [0.55, 0.5, 0.42],
  [0.12, 0.07, 0.04],
  [0.3, 0.28, 0.25],
];

interface RocketVis {
  id: number;
  mesh: THREE.Mesh;
  trail: number;
  /** Last position, to space the trail evenly. */
  x: number;
  y: number;
  z: number;
  seen: number;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();

export class GunFx implements System {
  readonly name = 'gunFx';
  /** After the camera rig (100): the shake is added to the placed camera. */
  readonly priority = 101;
  readonly group = new THREE.Group();
  readonly hand: GunHand;
  readonly smoke: Billboards;
  readonly fire: Billboards;
  readonly streaks: Streaks;
  readonly debris: Debris;
  readonly scorch: Scorches;
  private readonly light: FxLight;
  private readonly shake: Shake;
  private readonly lite = isMobileDevice();
  private readonly rockets: RocketVis[] = [];
  private readonly rocketPool: THREE.Mesh[] = [];
  private readonly offs: (() => void)[] = [];
  private time = 0;
  private armed = false;

  constructor(private readonly game: Game) {
    const lite = this.lite;
    this.group.name = 'gunFx';
    this.smoke = new Billboards(lite ? 90 : 200, false);
    this.fire = new Billboards(lite ? 70 : 140, true);
    this.streaks = new Streaks(lite ? 24 : 48);
    this.debris = new Debris(lite ? 36 : 72);
    this.scorch = new Scorches(lite ? 6 : 10);
    this.hand = new GunHand(game);
    this.light = new FxLight(game);
    this.shake = new Shake(game);
    this.group.add(this.smoke.mesh, this.fire.mesh, this.streaks.mesh, this.debris.mesh, this.scorch.mesh);
    game.scene.add(this.group);
    const ev = game.events;
    this.offs.push(
      ev.on('gun:armed', (e) => {
        this.armed = e.on;
        if (!e.on) this.reset();
      }),
      ev.on('gun:equip', (e) => {
        this.hand.equip(e.gun);
        if (e.gun) this.armed = true;
      }),
      ev.on('gun:fire', (e) => this.onFire(e)),
      ev.on('gun:rocket', (e) => this.onRocket(e)),
      ev.on('gun:explode', (e) => this.onExplode(e)),
      ev.on('save:loaded', () => this.reset()),
    );
    // Installed after the cheat came on: catch up with what is already in hand.
    const cur = game.guns?.current;
    if (cur) {
      this.armed = true;
      this.hand.equip(cur);
    }
  }

  /** The gun's muzzle in world space (the model's), or null with no gun out. For the logic to start its shots at the barrel. */
  muzzle(out: THREE.Vector3): THREE.Vector3 | null {
    const m = this.hand.model;
    return m ? this.hand.toWorld(m.muzzle, out) : null;
  }

  // ------------------------------------------------------------------ frame

  update(dt: number) {
    this.time += dt;
    this.hand.update(dt);
    const sky = this.game.sky;
    // Smoke takes the light of the hour: grey by day, nearly black at night.
    const amb = 0.22 + 0.78 * (sky?.daylight ?? 1);
    this.smoke.uniforms.uTint.value.set(amb, amb, amb * 1.02);
    const fog = (this.game.scene.fog as THREE.FogExp2 | null)?.density ?? 0;
    this.smoke.uniforms.uFogDensity.value = fog;
    this.fire.uniforms.uFogDensity.value = fog;
    this.game.renderer.getDrawingBufferSize(this.streaks.uniforms.uViewport.value);
    this.smoke.update(dt);
    this.fire.update(dt);
    this.streaks.update(dt);
    this.debris.update(dt);
    this.scorch.update(dt);
    this.updateRockets();
  }

  lateUpdate(dt: number) {
    this.light.update(dt, this.armed);
    this.shake.apply(dt);
  }

  // ------------------------------------------------------------------ fire

  private onFire(e: GameFire) {
    const g = e.gun;
    const look = LOOK[g];
    const game = this.game;
    const mx = e.muzzle.x, my = e.muzzle.y, mz = e.muzzle.z;
    const dx = e.dir.x, dy = e.dir.y, dz = e.dir.z;
    this.hand.kick(g === 'pistol' ? 0.7 : g === 'rifle' ? 0.5 : g === 'shotgun' ? 1.1 : 1.2);
    // Sound: the shot, and the pump a moment later.
    game.events.emit('sfx', { id: look.sound, position: e.muzzle });
    if (g === 'shotgun') game.audio?.play('gun.pump', { position: e.muzzle, delay: 0.42, ifReady: true });
    // The muzzle flare and the light.
    const lite = this.lite;
    const fx = mx + dx * 0.04, fy = my + dy * 0.04, fz = mz + dz * 0.04;
    this.fire.spawn(fx, fy, fz, 0, 0, 0, look.flare * 1.3, look.flare * 1.7, g === 'rifle' ? 0.05 : 0.065, 1, 0.9, 0.6, 1, 0.55, 0.2, 1.3, 0, 0, 0, Kind.Flare, 0.05);
    this.fire.spawn(fx + dx * 0.05, fy + dy * 0.05, fz + dz * 0.05, dx * 3, dy * 3, dz * 3, look.flare * 0.3, look.flare * 0.55, 0.05, 1, 0.95, 0.8, 1, 0.7, 0.3, 0.8, 0, 0, 0, Kind.Puff, 0.05);
    this.light.flash(look.light, 0.07, 1, 0.72, 0.42, fx + dx * 0.3, fy + dy * 0.3, fz + dz * 0.3, 0);
    // A wisp of gas from the muzzle.
    if (g !== 'rifle' || (this.time * 10) % 2 < 1) {
      const sp = g === 'shotgun' ? 3 : 1.5;
      this.smoke.spawn(fx, fy, fz, dx * sp, dy * sp + 0.2, dz * sp, 0.12, g === 'shotgun' ? 0.9 : 0.5, g === 'shotgun' ? 1.1 : 0.7, 0.55, 0.55, 0.55, 0.4, 0.4, 0.4, g === 'shotgun' ? 0.28 : 0.2, 2.2, 0.5, (Math.random() - 0.5) * 2, Kind.Puff, 0.15);
    }
    this.shake.add(look.shake);
    if (g === 'rpg') {
      this.backblast(e);
      return;
    }
    // The ejected case.
    if (look.casing) this.casing(e);
    // Tracers and impacts, one for each pellet.
    const n = e.hits.length;
    for (let i = 0; i < n; i++) {
      const h = e.hits[i];
      let ex: number, ey: number, ez: number;
      if (h.point) {
        ex = h.point.x; ey = h.point.y; ez = h.point.z;
      } else {
        ex = mx + dx * 140; ey = my + dy * 140; ez = mz + dz * 140;
      }
      let tx = ex - mx, ty = ey - my, tz = ez - mz;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > 1.5) {
        tx /= dist; ty /= dist; tz /= dist;
        this.streaks.spawn(mx + tx * 0.2, my + ty * 0.2, mz + tz * 0.2, tx, ty, tz, dist - 0.2, g === 'shotgun' ? 5 : 8, 240, look.width, look.tracer);
      }
      if (!h.point) continue;
      if (h.actorId) this.bloodAt(h.point, e.dir, look.blood, g === 'shotgun');
      else this.chipAt(h.point, h.normal, e.dir, i, n);
    }
    void lite;
  }

  private casing(e: GameFire) {
    // Out to the right and up, a brass case tumbling to the ground.
    const d = e.dir;
    let rx = -d.z, rz = d.x;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const m = this.hand.model;
    const px = e.muzzle.x - d.x * (m ? 0.62 : 0.3), py = e.muzzle.y + 0.02, pz = e.muzzle.z - d.z * (m ? 0.62 : 0.3);
    const floor = this.groundY(px, py, pz);
    this.debris.spawn(px, py, pz, rx * 2.2 + (Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 0.8, rz * 2.2 + (Math.random() - 0.5) * 0.6, 0.016, floor, 1.4, 0.55, 0.36, 0.08, 22);
  }

  private bloodAt(point: V3, dir: V3, n: number, pellet: boolean) {
    const level = this.game.settings.data.gore ?? 'ultra';
    if (level === 'off') return;
    const blood = this.blood();
    if (!blood) return;
    const k = level === 'ultra' ? 1.6 : 1;
    // Through the body and out the back, a little up; and a mist back at the shooter.
    _v.set(dir.x, dir.y + 0.25, dir.z);
    blood.burst(point, _v, Math.round(n * k), pellet ? 2.6 : 4, 0.5, 0.2);
    if (!pellet) {
      _w.set(-dir.x, 0.2, -dir.z);
      blood.burst(point, _w, Math.round(n * 0.4 * k), 2, 0.6, 0.1);
    }
    // A pink puff where it went in.
    this.smoke.spawn(point.x, point.y, point.z, dir.x * 0.5, 0.3, dir.z * 0.5, 0.08, 0.34, 0.45, 0.22, 0.015, 0.012, 0.12, 0.01, 0.008, 0.45, 2, 0, 0, Kind.Puff, 0.1);
  }

  private blood(): BloodFx | null {
    return this.game.getSystem<CombatSystem>('combat')?.gore?.blood ?? null;
  }

  /** A bullet into a wall or the ground: a puff of dust, sparks, chips, and now and then a whine. */
  private chipAt(point: V3, normal: V3 | null, dir: V3, i: number, count: number) {
    let nx = normal?.x ?? -dir.x, ny = normal?.y ?? -dir.y, nz = normal?.z ?? -dir.z;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const px = point.x + nx * 0.03, py = point.y + ny * 0.03, pz = point.z + nz * 0.03;
    const r = Math.random;
    // Dust: a grey-tan puff off the surface.
    this.smoke.spawn(px, py, pz, nx * 1.4 + (r() - 0.5) * 0.6, ny * 1.4 + 0.3 + (r() - 0.5) * 0.4, nz * 1.4 + (r() - 0.5) * 0.6, 0.1, 0.42, 0.55, 0.5, 0.45, 0.38, 0.4, 0.37, 0.32, 0.5, 3, 0.4, (r() - 0.5) * 2, Kind.Puff, 0.1);
    // Sparks and chips: a few for a single bullet, fewer for each pellet of a spread.
    const many = count < 3;
    if (many || i % 3 === 0) {
      const ns = this.lite ? 1 : many ? 3 : 1;
      for (let s = 0; s < ns; s++)
        this.fire.spawn(px, py, pz, nx * 3 + (r() - 0.5) * 3, ny * 3 + (r() - 0.2) * 2.5, nz * 3 + (r() - 0.5) * 3, 0.06, 0.04, 0.16 + r() * 0.12, 1, 0.8, 0.4, 1, 0.3, 0.05, 1, 0.3, -9, 0, Kind.Spark, 0.02);
      const floor = this.groundY(px, py, pz);
      for (let c = 0; c < (this.lite ? 1 : many ? 3 : 1); c++) {
        const k = CHUNKS[Math.floor(r() * CHUNKS.length)];
        this.debris.spawn(px, py, pz, nx * 2.5 + (r() - 0.5) * 2.5, ny * 2.5 + r() * 1.5, nz * 2.5 + (r() - 0.5) * 2.5, 0.02 + r() * 0.025, floor, 0.9, k[0], k[1], k[2], 20);
      }
    }
    if (count === 1 && r() < 0.14) this.game.events.emit('sfx', { id: 'gun.ricochet', position: { x: px, y: py, z: pz } });
  }

  /** The RPG's back-blast: a cone of fire and a cloud of dust behind the tube. */
  private backblast(e: GameFire) {
    const m = this.hand.model;
    if (m && this.hand.toWorld(m.rear, _v)) {
      /* the rear of the tube */
    } else _v.set(e.muzzle.x - e.dir.x * 1.2, e.muzzle.y - e.dir.y * 1.2, e.muzzle.z - e.dir.z * 1.2);
    const bx = -e.dir.x, by = -e.dir.y, bz = -e.dir.z;
    const r = Math.random;
    const nf = this.lite ? 4 : 7;
    for (let i = 0; i < nf; i++)
      this.fire.spawn(_v.x, _v.y, _v.z, bx * (8 + r() * 10) + (r() - 0.5) * 3, by * (8 + r() * 10) + (r() - 0.5) * 3, bz * (8 + r() * 10) + (r() - 0.5) * 3, 0.15, 0.5 + r() * 0.3, 0.14 + r() * 0.1, 1, 0.8, 0.45, 0.8, 0.2, 0.04, 0.7, 3, 0.5, 0, Kind.Puff, 0.05);
    const ns = this.lite ? 5 : 9;
    for (let i = 0; i < ns; i++)
      this.smoke.spawn(_v.x, _v.y, _v.z, bx * (3 + r() * 7) + (r() - 0.5) * 3, by * (3 + r() * 7) + (r() - 0.2) * 3, bz * (3 + r() * 7) + (r() - 0.5) * 3, 0.3, 1.4 + r() * 0.9, 1.3 + r() * 0.6, 0.6, 0.57, 0.52, 0.45, 0.43, 0.4, 0.4, 2.2, 0.3, (r() - 0.5) * 2, Kind.Puff, 0.08);
    // The muzzle end too: a thick puff where the rocket left.
    for (let i = 0; i < 4; i++)
      this.smoke.spawn(e.muzzle.x, e.muzzle.y, e.muzzle.z, e.dir.x * 3 + (r() - 0.5), e.dir.y * 3 + (r() - 0.5), e.dir.z * 3 + (r() - 0.5), 0.25, 1.0, 1.0, 0.58, 0.56, 0.52, 0.42, 0.4, 0.38, 0.35, 2, 0.3, (r() - 0.5) * 2, Kind.Puff, 0.08);
    this.light.flash(70, 0.14, 1, 0.65, 0.35, e.muzzle.x, e.muzzle.y, e.muzzle.z, 1);
  }

  // ------------------------------------------------------------------ rocket

  private onRocket(e: GameRocket) {
    let r = this.rockets.find((x) => x.id === e.id);
    if (!e.live) {
      if (r) this.dropRocket(r);
      return;
    }
    const p = e.position, v = e.velocity;
    if (!r) {
      const mesh = this.rocketPool.pop() ?? new THREE.Mesh(rocketModel(), avatarMaterial());
      mesh.name = 'gun:rocket';
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      r = { id: e.id, mesh, trail: 0, x: p.x, y: p.y, z: p.z, seen: this.time };
      this.rockets.push(r);
      this.light.rocketOn(true);
    }
    r.seen = this.time;
    const sp = Math.hypot(v.x, v.y, v.z) || 1;
    const vx = v.x / sp, vy = v.y / sp, vz = v.z / sp;
    r.mesh.position.set(p.x, p.y, p.z);
    r.mesh.quaternion.copy(_q.setFromUnitVectors(_z, _v.set(vx, vy, vz)));
    // The smoke trail, evenly spaced along the path, and the flame at the tail.
    const tail = ROCKET_TAIL;
    const tx = p.x - vx * tail, ty = p.y - vy * tail, tz = p.z - vz * tail;
    const step = this.lite ? 1.4 : 0.8;
    const dx = p.x - r.x, dy = p.y - r.y, dz = p.z - r.z;
    const dist = Math.hypot(dx, dy, dz);
    r.trail += dist;
    const rn = Math.random;
    if (r.trail >= step && dist > 1e-4) {
      let k = 0;
      while (r.trail >= step && k++ < 6) {
        r.trail -= step;
        const f = 1 - r.trail / dist;
        const cx = r.x + dx * f - vx * tail, cy = r.y + dy * f - vy * tail, cz = r.z + dz * f - vz * tail;
        this.smoke.spawn(cx, cy, cz, (rn() - 0.5) * 0.5, (rn() - 0.5) * 0.4 + 0.2, (rn() - 0.5) * 0.5, 0.25, 1.5 + rn() * 0.6, 1.5, 0.62, 0.6, 0.56, 0.46, 0.45, 0.43, 0.55, 1, 0.12, (rn() - 0.5) * 1.4, Kind.Puff, 0.05);
      }
    }
    r.x = p.x; r.y = p.y; r.z = p.z;
    this.fire.spawn(tx, ty, tz, -vx * 2, -vy * 2, -vz * 2, 0.42, 0.14, 0.09, 1, 0.9, 0.6, 1, 0.45, 0.12, 1, 0, 0, 0, Kind.Puff, 0.05);
    this.fire.spawn(tx - vx * 0.15, ty - vy * 0.15, tz - vz * 0.15, 0, 0, 0, 0.5, 0.3, 0.05, 1, 0.85, 0.55, 1, 0.6, 0.2, 0.85, 0, 0, 0, Kind.Flare, 0.1);
    if (!this.lite && rn() < 0.5)
      this.fire.spawn(tx, ty, tz, -vx * 5 + (rn() - 0.5) * 4, -vy * 5 + (rn() - 0.5) * 4 - 1, -vz * 5 + (rn() - 0.5) * 4, 0.05, 0.03, 0.3, 1, 0.7, 0.3, 1, 0.3, 0.05, 1, 0.5, -4, 0, Kind.Spark, 0.02);
    this.light.rocket(tx, ty, tz);
  }

  private updateRockets() {
    // A rocket no event has mentioned for a moment has been lost: take it down.
    for (let i = this.rockets.length - 1; i >= 0; i--) if (this.time - this.rockets[i].seen > 0.5) this.dropRocket(this.rockets[i]);
  }

  private dropRocket(r: RocketVis) {
    const i = this.rockets.indexOf(r);
    if (i >= 0) this.rockets.splice(i, 1);
    r.mesh.removeFromParent();
    this.rocketPool.push(r.mesh);
    if (this.rockets.length === 0) this.light.rocketOn(false);
  }

  // ------------------------------------------------------------------ explosion

  private onExplode(e: GameExplode) {
    const p = e.position;
    const R = e.radius || 7;
    const k = Math.max(0.5, R / 7);
    const rn = Math.random;
    const lite = this.lite;
    const floor = this.groundY(p.x, p.y + 0.5, p.z);
    const h = Math.max(0, p.y - floor);
    // A scorch on the ground under a blast near it.
    if (h < 2.5) {
      const hit = this.game.physics.raycast({ x: p.x, y: p.y + 0.5, z: p.z }, { x: 0, y: -1, z: 0 }, 4, Layer.World);
      this.scorch.spawn({ x: p.x, y: hit ? hit.point.y : floor, z: p.z }, hit?.normal ?? null, 3.2 * k, rn() * 100);
    }
    // The fireball: puffs of fire thrown out and swelling, white in the middle and red at the edge.
    const nf = lite ? 9 : 16;
    for (let i = 0; i < nf; i++) {
      const a = rn() * Math.PI * 2;
      const up = rn() * 0.95 - 0.1;
      const sp = (2 + rn() * 7) * k;
      const c = Math.sqrt(1 - up * up);
      this.fire.spawn(p.x + (rn() - 0.5) * k, p.y + 0.4 * k, p.z + (rn() - 0.5) * k, Math.cos(a) * c * sp, up * sp * 1.2 + 1.5, Math.sin(a) * c * sp, 1.6 * k, (4.8 + rn() * 2.4) * k, 0.45 + rn() * 0.45, 1, 0.9, 0.6, 0.85, 0.2, 0.03, 1, 2.4, 3, (rn() - 0.5) * 2, Kind.Puff, 0.04);
    }
    this.fire.spawn(p.x, p.y + 0.5 * k, p.z, 0, 0, 0, 2 * k, 13 * k, 0.26, 1, 0.95, 0.8, 1, 0.55, 0.2, 1, 0, 0, 0, Kind.Flare, 0.05);
    this.fire.spawn(p.x, p.y + 0.5 * k, p.z, 0, 0, 0, 3 * k, 8 * k, 0.4, 1, 0.8, 0.45, 0.9, 0.25, 0.05, 0.9, 0, 0, 0, Kind.Puff, 0.05);
    // A rising column of fire after the first burst.
    for (let i = 0; i < (lite ? 3 : 6); i++)
      this.fire.spawn(p.x + (rn() - 0.5) * k, p.y + (0.5 + i * 0.5) * k, p.z + (rn() - 0.5) * k, (rn() - 0.5) * 2, (5 + rn() * 5) * k, (rn() - 0.5) * 2, 1.4 * k, (3.4 + rn() * 1.4) * k, 0.7 + rn() * 0.4, 1, 0.7, 0.3, 0.7, 0.12, 0.02, 0.9, 1.2, 1, 0, Kind.Puff, 0.15);
    // Sparks and embers.
    const nsp = lite ? 10 : 22;
    for (let i = 0; i < nsp; i++) {
      const a = rn() * Math.PI * 2;
      const up = 0.2 + rn() * 0.8;
      const sp = (9 + rn() * 15) * Math.sqrt(k);
      const c = Math.sqrt(1 - up * up);
      this.fire.spawn(p.x, p.y + 0.6, p.z, Math.cos(a) * c * sp, up * sp, Math.sin(a) * c * sp, 0.14, 0.06, 0.6 + rn() * 0.8, 1, 0.8, 0.4, 1, 0.25, 0.04, 1, 0.35, -9.8, 0, Kind.Spark, 0.02);
    }
    // The smoke column: dark, heavy, climbing and swelling for seconds.
    const ns = lite ? 12 : 22;
    for (let i = 0; i < ns; i++) {
      const a = rn() * Math.PI * 2;
      const rad = rn() * 1.5 * k;
      const rise = (3 + rn() * 7) * Math.sqrt(k);
      this.smoke.spawn(p.x + Math.cos(a) * rad, p.y + (i / ns) * 2.4 * k, p.z + Math.sin(a) * rad, Math.cos(a) * 1.2, rise, Math.sin(a) * 1.2, 2 * k, (5.5 + rn() * 3.5) * k, 4 + rn() * 2.6, 0.06, 0.055, 0.05, 0.3, 0.29, 0.28, 0.85, 0.8, 0.5, (rn() - 0.5) * 0.7, Kind.Puff, 0.1);
    }
    // A ring of dust running out along the ground.
    const nd = lite ? 8 : 14;
    for (let i = 0; i < nd; i++) {
      const a = (i / nd) * Math.PI * 2 + rn() * 0.4;
      const sp = (10 + rn() * 7) * Math.sqrt(k);
      this.smoke.spawn(p.x, floor + 0.5 * k, p.z, Math.cos(a) * sp, 0.5, Math.sin(a) * sp, 1.1 * k, (3.6 + rn() * 1.4) * k, 1.6 + rn() * 0.8, 0.5, 0.44, 0.36, 0.4, 0.36, 0.31, 0.7, 2.2, 0.4, (rn() - 0.5), Kind.Puff, 0.06);
    }
    // Debris thrown up and out: stone, brick, plaster and wood.
    const nc = lite ? 24 : 48;
    for (let i = 0; i < nc; i++) {
      const a = rn() * Math.PI * 2;
      const up = 0.4 + rn() * 0.6;
      const sp = (6 + rn() * 13) * Math.sqrt(k);
      const c = Math.sqrt(1 - up * up);
      const col = CHUNKS[Math.floor(rn() * CHUNKS.length)];
      this.debris.spawn(p.x + (rn() - 0.5) * k, p.y + 0.5, p.z + (rn() - 0.5) * k, Math.cos(a) * c * sp, up * sp, Math.sin(a) * c * sp, 0.14 + rn() * 0.4, floor, 3 + rn() * 2, col[0], col[1], col[2], 9);
    }
    // The flash of light and the shake: nearer is worse.
    this.light.blast(h > 30 ? 0 : 1100 * k, p.x, p.y + 1, p.z);
    const cam = this.game.camera.position;
    const d = Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z);
    this.shake.add(0.2 + 0.8 * Math.max(0, 1 - d / (R * 5)), 1);
    this.game.events.emit('sfx', { id: 'gun.explosion', position: { x: p.x, y: p.y, z: p.z } });
  }

  // ------------------------------------------------------------------ helpers

  /** Ground height under a point (a ray down), or a little below it. */
  private groundY(x: number, y: number, z: number): number {
    const hit = this.game.physics.raycast({ x, y: y + 0.4, z }, { x: 0, y: -1, z: 0 }, 30, Layer.World);
    return hit ? hit.point.y : y - 1.5;
  }

  private reset() {
    this.smoke.clear();
    this.fire.clear();
    this.streaks.clear();
    this.debris.clear();
    for (const r of [...this.rockets]) this.dropRocket(r);
    this.hand.equip(null);
    this.light.release();
  }

  dispose() {
    for (const o of this.offs) o();
    this.hand.dispose();
    this.light.release();
    this.smoke.dispose();
    this.fire.dispose();
    this.streaks.dispose();
    this.debris.dispose();
    this.scorch.dispose();
    this.group.removeFromParent();
    if (this.game.gunFx === this) this.game.gunFx = undefined;
  }
}

type V3 = THREE.Vector3Like;
type GameFire = import('../../../core/Events').GameEvents['gun:fire'];
type GameRocket = import('../../../core/Events').GameEvents['gun:rocket'];
type GameExplode = import('../../../core/Events').GameEvents['gun:explode'];

/** Add the guns' effects to the game (once). The cheat's install calls this. */
export function installGunFx(game: Game): GunFx {
  if (game.gunFx) return game.gunFx;
  const fx = new GunFx(game);
  game.gunFx = fx;
  game.addSystem(fx);
  // The gunshots are left out of the boot's pre-bake (onDemand): bake them now, in the background.
  for (const d of gunSounds) game.audio?.prepare(d.id, false);
  return fx;
}

export type { LightHandle, CameraRig };
void gunModel;
