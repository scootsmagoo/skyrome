/**
 * `game.guns`: the anachronism cheat's guns (types.ts). Loaded on first use of the console command
 * (install.ts), so the game carries none of it until someone asks.
 *
 * - **Hands.** While a gun is out the player's melee is off (`game.meleeSuspended`), the melee
 *   weapon is sheathed, and the player faces where the camera looks (`combatStance`).
 * - **Controls.** Fire with the attack action (F, the mouse button; the rifle fires while held),
 *   aim with block (Q, right mouse: over the shoulder, zoomed in, tighter spread), lock on with
 *   lockOn (X: the person nearest the crosshair; X again for the next; hold X to let go), switch
 *   guns with readyWeapon (R). Infinite ammunition, no reloading.
 * - **Shots.** A bullet goes from the muzzle to the point under the crosshair (or the locked
 *   target's chest): hit-scan against the world (physics ray) and people (their capsules, here).
 *   A rocket flies (55 m/s, a little drop) and bursts on what it meets: blast damage falls off
 *   over 7 m, everyone in it is thrown down, the player too.
 * - **Rome reacts.** Every hit on a person is the player's assault (the law books it; killing is
 *   murder) through `game.combat.playerStrike`; every shot is a loud danger, so the street runs.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import { Layer } from '../../core/Physics';
import type { Actor } from '../../actors/Actor';
import { blastDamage, GUNS, nextGun, rayCapsule, scatter, shotInterval, type GunStats, type V3 } from './weapons';
import type { GunId } from './types';

declare module '../../core/Game' {
  interface Game {
    guns?: GunSystem;
  }
}

const BODY_H = 1.75;
const BODY_R = 0.32;
const LOCK_RANGE = 70;
const LOCK_CONE = (28 * Math.PI) / 180;
const AIM_ZOOM = 1.6;
const AIM_FOV = -14;
const SHOULDER_ARMED = 0.55;
const SHOULDER_AIM = 0.12;
const ROCKET_DROP = 2.5; // m/s² (a little, so a long shot arcs)
const ROCKET_LIFE = 7;

interface Rocket {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
}

interface Trace {
  point: THREE.Vector3 | null;
  normal: THREE.Vector3 | null;
  actor: Actor | null;
  dist: number;
}

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const fwd = new THREE.Vector3();

export class GunSystem implements System {
  readonly name = 'guns';
  readonly priority = 25; // after combat (20): its stance and lock are ours while a gun is out
  armed = false;
  current: GunId | null = null;
  aiming = false;
  lockTarget: Actor | null = null;
  private cooldown = 0;
  private bloom = 0;
  private aimBlend = 0;
  private savedZoom = NaN;
  private alarmAt = -1e9;
  private lockDownAt = -1;
  private rockets: Rocket[] = [];
  private rocketSeq = 0;
  private hud: HTMLElement | null = null;
  private reticle: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private rng = Math.random;

  constructor(private readonly game: Game) {}

  // ------------------------------------------------------------------ the cheat

  arm(on: boolean) {
    if (on === this.armed) return;
    this.armed = on;
    this.game.events.emit('gun:armed', { on });
    if (on) {
      const pc = this.game.combat?.playerC;
      if (pc && pc.drawn) this.game.combat.core.setDrawn(pc, false);
      this.equip('pistol');
    } else this.equip(null);
  }

  equip(id: GunId | null) {
    if (id === this.current) return;
    this.current = id;
    this.cooldown = Math.min(this.cooldown, 0.25);
    this.bloom = 0;
    this.game.meleeSuspended = !!id;
    if (!id) {
      this.lockTarget = null;
      this.setAim(false, 1);
      if (this.game.player) this.game.player.combatStance = false;
    }
    this.game.events.emit('gun:equip', { gun: id });
    this.ensureHud();
    if (this.label) this.label.textContent = id ? GUNS[id].name : '';
  }

  // ------------------------------------------------------------------ the frame

  update(dt: number) {
    this.stepRockets(dt);
    const g = this.game;
    const p = g.player;
    if (!this.armed || !this.current || !p) {
      this.showHud(false);
      return;
    }
    const gun = GUNS[this.current];
    g.meleeSuspended = true;
    p.combatStance = true;
    const input = g.input;
    if (!input.enabled) {
      this.showHud(false);
      return;
    }
    if (input.pressed('readyWeapon')) this.equip(nextGun(this.current));
    this.lockInput();
    this.trackLock(dt);
    this.setAim(input.down('block'), dt);
    this.bloom = Math.max(0, this.bloom - (gun.bloom?.recover ?? 0) * dt);
    this.cooldown -= dt;
    const trigger = gun.auto ? input.down('attack') : input.pressed('attack');
    if (trigger && this.cooldown <= 0) {
      this.fire(gun);
      this.cooldown = Math.max(this.cooldown, 0) + shotInterval(gun);
    }
    if (this.cooldown < -0.2) this.cooldown = 0;
    this.showHud(true);
    this.placeReticle();
  }

  // ------------------------------------------------------------------ aiming and lock-on

  private setAim(on: boolean, dt: number) {
    const p = this.game.player;
    if (!p) return;
    this.aiming = on;
    if (on && !Number.isFinite(this.savedZoom)) this.savedZoom = p.zoom;
    this.aimBlend = THREE.MathUtils.clamp(this.aimBlend + (on ? dt : -dt) * 6, 0, 1);
    if (Number.isFinite(this.savedZoom)) {
      p.zoom = THREE.MathUtils.lerp(this.savedZoom, Math.min(this.savedZoom, AIM_ZOOM), this.aimBlend);
      if (!on && this.aimBlend === 0) {
        p.zoom = this.savedZoom;
        this.savedZoom = NaN;
      }
    }
    const rig = this.game.getSystem<System & { fovKick: number; shoulderExtra: number }>('cameraRig');
    if (rig) {
      rig.fovKick = AIM_FOV * this.aimBlend;
      // Over the shoulder and out to the side, so the gun and its flash are in view, not behind the back.
      const side = this.current ? SHOULDER_ARMED + SHOULDER_AIM * this.aimBlend : 0;
      rig.shoulderExtra += (side - rig.shoulderExtra) * Math.min(1, dt * 8);
      if (!this.current && Math.abs(rig.shoulderExtra) < 0.005) rig.shoulderExtra = 0;
    }
  }

  private lockInput() {
    const input = this.game.input;
    const t = this.game.elapsed;
    if (input.pressed('lockOn')) {
      this.lockDownAt = t;
      const next = this.lockCandidates()[this.lockTarget ? 1 : 0] ?? this.lockCandidates()[0] ?? null;
      // (the first candidate is the one nearest the crosshair: with a lock, the next one along)
      this.lockTarget = this.lockTarget && next === this.lockTarget ? null : next;
    }
    if (this.lockDownAt >= 0 && input.down('lockOn') && t - this.lockDownAt > 0.45) {
      this.lockTarget = null;
      this.lockDownAt = -1;
    }
    if (input.released('lockOn')) this.lockDownAt = -1;
  }

  /** People in view near the crosshair (the current lock last), nearest the crosshair first. */
  private lockCandidates(): Actor[] {
    const g = this.game;
    const cam = g.camera;
    cam.getWorldDirection(fwd);
    const out: { a: Actor; ang: number }[] = [];
    for (const a of g.actors.all()) {
      if (!this.targetable(a)) continue;
      v1.set(a.position.x, a.position.y + 1.3, a.position.z).sub(cam.position);
      const d = v1.length();
      if (d > LOCK_RANGE || d < 0.5) continue;
      const ang = v1.angleTo(fwd);
      if (ang > LOCK_CONE) continue;
      if (!this.clearLine(cam.position, a)) continue;
      out.push({ a, ang: a === this.lockTarget ? 99 : ang });
    }
    return out.sort((x, y) => x.ang - y.ang).map((x) => x.a);
  }

  private targetable(a: Actor): boolean {
    if (a === (this.game.player as unknown as Actor) || a.disposed) return false;
    if ((a as unknown as { dead?: boolean }).dead) return false;
    const c = this.game.combat?.get(a.id);
    return !c || c.status !== 'dead';
  }

  private clearLine(from: THREE.Vector3, a: Actor): boolean {
    v2.set(a.position.x, a.position.y + 1.3, a.position.z).sub(from);
    const d = v2.length();
    v2.divideScalar(d || 1);
    return !this.game.physics.raycast(from, v2, d - 0.4, Layer.World);
  }

  /** Keep the camera on the locked target's chest; let go when it is gone, out of range or out of sight. */
  private trackLock(dt: number) {
    const t = this.lockTarget;
    const p = this.game.player;
    if (!t || !p) return;
    const cam = this.game.camera;
    if (!this.targetable(t) || t.position.distanceTo(p.position) > LOCK_RANGE * 1.2 || !this.clearLine(cam.position, t)) {
      this.lockTarget = null;
      return;
    }
    v1.set(t.position.x, t.position.y + 1.25, t.position.z).sub(cam.position);
    const yaw = Math.atan2(-v1.x, -v1.z);
    const pitch = Math.atan2(v1.y, Math.hypot(v1.x, v1.z));
    const k = Math.min(1, dt * 14);
    let dy = yaw - p.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    p.yaw += dy * k;
    p.pitch += (pitch - p.pitch) * k;
  }

  // ------------------------------------------------------------------ shooting

  /** Where the shot leaves: the gun hand, a little ahead of the chest (first person: under the eye). */
  muzzle(out = new THREE.Vector3()): THREE.Vector3 {
    // The model's own barrel when the look is loaded (fx/), else a point by the gun hand.
    const look = (this.game as unknown as { gunFx?: { muzzle?(o: THREE.Vector3): THREE.Vector3 | null } }).gunFx;
    if (look?.muzzle?.(out)) return out;
    const p = this.game.player!;
    const first = p.viewMode === 'first';
    const yaw = p.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const side = first ? 0.16 : 0.26, ahead = first ? 0.45 : 0.6, up = first ? 1.45 : 1.38;
    return out.set(p.position.x + rx * side + fx * ahead, p.position.y + up + Math.sin(p.pitch) * ahead, p.position.z + rz * side + fz * ahead);
  }

  /** The point under the crosshair (or the locked target's chest). */
  private aimPoint(range: number): THREE.Vector3 {
    const t = this.lockTarget;
    if (t) return new THREE.Vector3(t.position.x, t.position.y + 1.25, t.position.z);
    const cam = this.game.camera;
    cam.getWorldDirection(fwd);
    const hit = this.trace(cam.position, fwd, range + 20);
    return hit.point ? hit.point : cam.position.clone().addScaledVector(fwd, range);
  }

  /** The first thing along a ray: a person (capsule) or the world (physics), within `max`. */
  trace(origin: THREE.Vector3, dir: THREE.Vector3, max: number): Trace {
    const w = this.game.physics.raycast(origin, dir, max, Layer.World);
    let best = w ? w.distance : max;
    let actor: Actor | null = null;
    const o: V3 = origin, d: V3 = dir;
    for (const a of this.game.actors.all()) {
      if (!this.targetable(a)) continue;
      const pa = a.position;
      // Cheap reject: farther than the best hit, or behind.
      const rx = pa.x - origin.x, ry = pa.y + 1 - origin.y, rz = pa.z - origin.z;
      const along = rx * dir.x + ry * dir.y + rz * dir.z;
      if (along < -1 || along > best + 1) continue;
      const t = rayCapsule(o, d, best, pa, BODY_H, BODY_R);
      if (t !== null && t < best) {
        best = t;
        actor = a;
      }
    }
    if (actor) {
      const point = origin.clone().addScaledVector(dir, best);
      const normal = new THREE.Vector3(point.x - actor.position.x, 0, point.z - actor.position.z).normalize();
      return { point, normal, actor, dist: best };
    }
    if (w) return { point: w.point.clone(), normal: w.normal.clone(), actor: null, dist: w.distance };
    return { point: null, normal: null, actor: null, dist: max };
  }

  private fire(gun: GunStats) {
    const g = this.game;
    const p = g.player!;
    const muzzle = this.muzzle();
    const aim = this.aimPoint(gun.range);
    const dir = aim.clone().sub(muzzle).normalize();
    // Aiming tightens the cone; the rifle's grows while it is held down.
    const spread = (gun.spread + this.bloom) * (this.aiming ? 0.45 : 1) * (this.lockTarget ? 0.6 : 1);
    if (gun.bloom) this.bloom = Math.min(gun.bloom.max, this.bloom + gun.bloom.perShot);
    const hits: { point: THREE.Vector3Like | null; normal: THREE.Vector3Like | null; actorId: string | null }[] = [];
    if (gun.rocket) {
      const v = dir.clone().multiplyScalar(gun.rocket.speed);
      const r: Rocket = { id: ++this.rocketSeq, pos: muzzle.clone(), vel: v, age: 0 };
      this.rockets.push(r);
      g.events.emit('gun:rocket', { id: r.id, position: r.pos, velocity: r.vel, live: true });
    } else {
      const struck = new Map<Actor, number>();
      for (let i = 0; i < gun.pellets; i++) {
        const s = scatter(dir, spread, this.rng(), this.rng());
        const d = new THREE.Vector3(s.x, s.y, s.z);
        const hit = this.trace(muzzle, d, gun.range);
        hits.push({ point: hit.point, normal: hit.normal, actorId: hit.actor?.id ?? null });
        if (hit.actor) struck.set(hit.actor, (struck.get(hit.actor) ?? 0) + 1);
      }
      for (const [a, n] of struck) {
        const knock = gun.knockdownPellets !== undefined && n >= gun.knockdownPellets;
        g.combat?.playerStrike(a, gun.damage * n, { from: muzzle, power: knock || gun.id === 'pistol', knockdown: knock });
      }
    }
    g.events.emit('gun:fire', { gun: gun.id, muzzle, dir, hits });
    // Recoil: the muzzle climbs (a lock pulls it back).
    p.pitch = Math.min(1.2, p.pitch + gun.recoil * (this.aiming ? 0.6 : 1));
    p.yaw += (this.rng() - 0.5) * gun.recoil * 0.4;
    this.alarm(muzzle, gun.rocket ? 45 : 32);
  }

  /** A gunshot is the loudest thing in Rome: everyone near takes fright (throttled). */
  private alarm(at: THREE.Vector3Like, radius: number) {
    const g = this.game;
    if (g.elapsed - this.alarmAt < 0.4) return;
    this.alarmAt = g.elapsed;
    const pop = (g as unknown as { population?: { alarm?(x: number, z: number, r: number, k: 'fight' | 'crime' | 'danger', a: unknown): void } }).population;
    pop?.alarm?.(at.x, at.z, radius, 'danger', g.player);
  }

  // ------------------------------------------------------------------ rockets and blasts

  private stepRockets(dt: number) {
    if (!this.rockets.length) return;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.age += dt;
      r.vel.y -= ROCKET_DROP * dt;
      const step = r.vel.length() * dt;
      v1.copy(r.vel).normalize();
      const hit = this.trace(r.pos, v1.clone(), step);
      if (hit.point || r.age > ROCKET_LIFE) {
        const at = hit.point ?? r.pos;
        this.rockets.splice(i, 1);
        this.game.events.emit('gun:rocket', { id: r.id, position: at, velocity: r.vel, live: false });
        this.explode(at, GUNS.rpg.rocket!.radius, GUNS.rpg.rocket!.damage);
        continue;
      }
      r.pos.addScaledVector(r.vel, dt);
      this.game.events.emit('gun:rocket', { id: r.id, position: r.pos, velocity: r.vel, live: true });
    }
  }

  /** A blast: everyone within `radius` is hurt by the distance and thrown down, the player too. */
  explode(at: THREE.Vector3Like, radius: number, max: number) {
    const g = this.game;
    const c = new THREE.Vector3(at.x, at.y, at.z);
    for (const a of [...g.actors.all()]) {
      if (!this.targetable(a)) continue;
      const d = v2.set(a.position.x, a.position.y + 1, a.position.z).distanceTo(c);
      const dmg = blastDamage(d, radius, max);
      if (dmg <= 0) continue;
      g.combat?.playerStrike(a, dmg, { from: c, power: true, knockdown: true });
    }
    const p = g.player;
    const pc = g.combat?.playerC;
    if (p && pc) {
      const d = v2.set(p.position.x, p.position.y + 1, p.position.z).distanceTo(c);
      const dmg = blastDamage(d, radius, max) * 0.6;
      if (dmg > 0) g.combat.core.dealDamage(null, pc, dmg);
    }
    g.events.emit('gun:explode', { position: c, radius });
    this.alarmAt = -1e9;
    this.alarm(c, 60);
  }

  // ------------------------------------------------------------------ crosshair

  private ensureHud() {
    if (this.hud || typeof document === 'undefined') return;
    const hud = document.createElement('div');
    hud.className = 'gun-hud';
    hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50;display:none;';
    hud.innerHTML =
      '<div class="gun-cross" style="position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid rgba(255,240,210,.85);border-radius:50%;box-shadow:0 0 2px #000"></div>' +
      '<div style="position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;background:#fff3d6;border-radius:50%;box-shadow:0 0 2px #000"></div>' +
      '<div class="gun-lock" style="position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border:2px solid #e8463a;transform:rotate(45deg);display:none;box-shadow:0 0 3px #000"></div>' +
      '<div class="gun-name" style="position:absolute;right:24px;bottom:96px;font:600 15px/1 var(--font-display, serif);letter-spacing:.12em;text-transform:uppercase;color:#f3e6c8;text-shadow:0 1px 3px #000"></div>';
    // (on a phone the corner is the touch buttons': the name sits above the stamina bar)
    const st = document.createElement('style');
    st.textContent = '@media (pointer: coarse) { .gun-hud .gun-name { right: auto !important; left: 50% !important; transform: translateX(-50%); bottom: 31% !important; } }';
    hud.appendChild(st);
    document.body.appendChild(hud);
    this.hud = hud;
    this.reticle = hud.querySelector('.gun-lock');
    this.label = hud.querySelector('.gun-name');
  }

  private showHud(on: boolean) {
    if (!this.hud) return;
    const want = on ? 'block' : 'none';
    if (this.hud.style.display !== want) this.hud.style.display = want;
    const cross = this.hud.firstElementChild as HTMLElement | null;
    if (cross) {
      const s = this.aiming ? '14px' : '22px';
      if (cross.style.width !== s) {
        cross.style.width = cross.style.height = s;
        cross.style.margin = this.aiming ? '-7px 0 0 -7px' : '-11px 0 0 -11px';
      }
    }
  }

  private placeReticle() {
    const el = this.reticle;
    if (!el) return;
    const t = this.lockTarget;
    if (!t) {
      if (el.style.display !== 'none') el.style.display = 'none';
      return;
    }
    v1.set(t.position.x, t.position.y + 1.25, t.position.z).project(this.game.camera);
    if (v1.z > 1) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.style.left = `${((v1.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - v1.y) / 2) * 100}%`;
  }

  dispose() {
    this.arm(false);
    this.hud?.remove();
    this.hud = null;
  }
}


/** Switch the cheat on or off (made on first use). */
export function enableGuns(game: Game, on: boolean): GunSystem {
  if (!game.guns) game.guns = game.addSystem(new GunSystem(game));
  game.guns.arm(on);
  return game.guns;
}
