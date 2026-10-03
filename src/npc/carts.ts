/**
 * Night carts (society.md §3.5): Caesar's municipal law kept wheeled traffic off the streets from
 * sunrise to the 10th hour, so deliveries and building stone rumble through at night — "carts
 * creak through the narrow bends and the drovers swear" (Juvenal 3.236–8).
 *
 * A cart is a kinematic body (it blocks the player and NPCs steer around it) pulled by a mule, with
 * a drover walking alongside with a lantern. Routes follow the street graph when there is one,
 * otherwise a clear straight line across the open ground around the player.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { groups, Layer, RAPIER } from '../core/Physics';
import { approachAngle } from '../core/math';
import type { NavService } from '../ai/life/nav';
import type { StreetNav } from '../ai/life/streets';
import type { Vec2 } from '../ai/life/steering';
import type { Npc } from './Npc';
import { Quadruped, makeCart } from './props';

export interface CartHost {
  readonly game: Game;
  readonly nav: NavService;
  streets(): StreetNav | null;
  readonly player: THREE.Vector3 | null;
  rand(): number;
  isVisible(x: number, y: number, z: number): boolean;
  floorY(x: number, z: number): number | null;
  /** Spawn the drover (scripted, walks beside the cart). */
  spawnDrover(x: number, z: number, heading: number): Npc | null;
  releaseDrover(npc: Npc): void;
  bark(npc: Npc, text: string): void;
}

export class Cart {
  readonly group: THREE.Group;
  readonly mule = new Quadruped('mule');
  private wheels: THREE.Object3D[];
  private body: RAPIER.RigidBody;
  heading = 0;
  speed = 0;
  readonly cruise = 1.25;
  idx = 0;
  done = false;
  /** Seconds blocked by the player. */
  blocked = 0;
  private swore = false;
  /** Approximate radius for steering (m). */
  readonly radius = 1.7;
  readonly pos = new THREE.Vector3();

  constructor(
    private readonly host: CartHost,
    readonly path: Vec2[],
    public drover: Npc | null,
  ) {
    const load = host.rand() < 0.5 ? 'marble' : 'amphorae';
    const c = makeCart(load);
    this.group = c.group;
    this.wheels = c.wheels;
    this.mule.root.position.set(0, 0, 3.1);
    this.group.add(this.mule.root);
    const p0 = path[0];
    const p1 = path[1] ?? path[0];
    this.heading = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    const y = host.floorY(p0.x, p0.z) ?? host.player?.y ?? 0;
    this.pos.set(p0.x, y, p0.z);
    this.idx = 1;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    host.game.scene.add(this.group);
    const w = host.game.physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y + 0.9, this.pos.z));
    const col = w.createCollider(
      RAPIER.ColliderDesc.cuboid(0.75, 0.75, 1.4).setTranslation(0, 0, 0.3).setCollisionGroups(groups(Layer.Npc, Layer.World | Layer.Player | Layer.Npc)),
      this.body,
    );
    host.game.physics.setOwner(col, this);
  }

  update(dt: number) {
    const h = this.host;
    const target = this.path[this.idx];
    if (!target) {
      this.done = true;
      return;
    }
    // Stop for the player standing in the way (and swear at them).
    let want = this.cruise;
    const pl = h.player;
    if (pl) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const rx = pl.x - this.pos.x;
      const rz = pl.z - this.pos.z;
      const ahead = rx * fx + rz * fz;
      const side = Math.abs(rx * fz - rz * fx);
      if (ahead > 0 && ahead < 5.5 && side < 1.6) {
        want = 0;
        this.blocked += dt;
        if (!this.swore && this.blocked > 0.8 && this.drover) {
          this.swore = true;
          h.bark(this.drover, this.host.rand() < 0.5 ? 'Out of the way! Wheels coming!' : 'Move, or the mule moves you!');
        }
      } else {
        this.blocked = 0;
        if (this.swore && ahead < 0) this.swore = false;
      }
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 1.5);
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      this.idx++;
      return;
    }
    this.heading = approachAngle(this.heading, Math.atan2(dx, dz), dt * 0.6);
    const step = this.speed * dt;
    this.pos.x += Math.sin(this.heading) * step;
    this.pos.z += Math.cos(this.heading) * step;
    const y = h.floorY(this.pos.x, this.pos.z);
    if (y !== null) this.pos.y += (y - this.pos.y) * Math.min(1, dt * 6);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    for (const w of this.wheels) w.rotation.x += step / 0.5;
    this.mule.animate(dt, this.speed);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + 0.9, z: this.pos.z });
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    // The drover walks at the mule's left shoulder.
    if (this.drover?.brain) {
      const lx = this.pos.x + Math.sin(this.heading) * 3.0 + Math.cos(this.heading) * 1.1;
      const lz = this.pos.z + Math.cos(this.heading) * 3.0 - Math.sin(this.heading) * 1.1;
      const dd = Math.hypot(lx - this.drover.position.x, lz - this.drover.position.z);
      if (dd > 0.5 || this.speed > 0.2) this.drover.brain.scriptGo(lx, lz, Math.min(2.4, this.speed + dd * 0.8), 0.3);
      else this.drover.brain.scriptStand('stand', this.heading);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.host.game.physics.world.removeRigidBody(this.body);
    if (this.drover) this.host.releaseDrover(this.drover);
    this.drover = null;
  }
}

export class CartDirector {
  readonly carts: Cart[] = [];
  private spawnT = 0;

  constructor(private readonly host: CartHost) {}

  /** Keep `target` carts around the player. */
  update(dt: number, target: number) {
    for (const c of [...this.carts]) {
      c.update(dt);
      const pl = this.host.player;
      const far = pl ? Math.hypot(c.pos.x - pl.x, c.pos.z - pl.z) > 130 : false;
      if (c.done || far) {
        // Vanish only out of sight (or far away).
        if (far || !this.host.isVisible(c.pos.x, c.pos.y + 1, c.pos.z)) {
          c.dispose();
          this.carts.splice(this.carts.indexOf(c), 1);
        }
      }
    }
    this.spawnT -= dt;
    if (this.spawnT > 0 || this.carts.length >= target) return;
    this.spawnT = 6 + this.host.rand() * 10;
    const route = this.route();
    if (!route) return;
    const h0 = Math.atan2(route[1].x - route[0].x, route[1].z - route[0].z);
    const drover = this.host.spawnDrover(route[0].x + Math.sin(h0) * 3 + Math.cos(h0) * 1.1, route[0].z + Math.cos(h0) * 3 - Math.sin(h0) * 1.1, h0);
    this.carts.push(new Cart(this.host, route, drover));
  }

  /** A route that starts and ends out of sight and is clear enough for a cart. */
  route(): Vec2[] | null {
    const h = this.host;
    const pl = h.player;
    if (!pl) return null;
    const streets = h.streets();
    if (streets && !streets.empty) {
      for (let i = 0; i < 6; i++) {
        const a = h.rand() * Math.PI * 2;
        const from = streets.nearest(pl.x + Math.sin(a) * 60, pl.z + Math.cos(a) * 60, 40);
        const to = streets.nearest(pl.x - Math.sin(a) * 60, pl.z - Math.cos(a) * 60, 40);
        if (!from || !to || from === to) continue;
        const r = streets.route(from.i, to.i);
        if (r && r.length >= 2) return r.map((k) => ({ x: streets.nodes[k].x, z: streets.nodes[k].z }));
      }
    }
    const g = h.nav.grid;
    if (!g) return null;
    for (let i = 0; i < 10; i++) {
      const a = h.rand() * Math.PI * 2;
      const off = (h.rand() - 0.5) * 30;
      const ax = pl.x + Math.sin(a) * 50 + Math.cos(a) * off;
      const az = pl.z + Math.cos(a) * 50 - Math.sin(a) * off;
      const bx = pl.x - Math.sin(a) * 50 + Math.cos(a) * off;
      const bz = pl.z - Math.cos(a) * 50 - Math.sin(a) * off;
      if (!g.ready(ax, az) || !g.ready(bx, bz)) continue;
      // Every 2 m along the line, a 1.2 m-radius disc must be walkable.
      const len = Math.hypot(bx - ax, bz - az);
      let ok = true;
      for (let t = 0; t <= len && ok; t += 2) ok = g.areaWalkable(ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len, 1.2);
      if (!ok) continue;
      const ya = h.floorY(ax, az) ?? pl.y;
      if (h.isVisible(ax, ya + 1, az)) continue;
      return [
        { x: ax, z: az },
        { x: bx, z: bz },
      ];
    }
    return null;
  }

  clear() {
    for (const c of this.carts) c.dispose();
    this.carts.length = 0;
  }
}
