/**
 * The quest marker that showed a target behind you straight ahead (living-city NAV, 2026-10-10).
 * The world chevron decided "behind" from the projected depth, which the reversed depth buffer
 * turns the other way. These tests drive the placement with real three.js cameras in both depth
 * conventions, and follow the marker the way the owner did.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { chevronAngle, pinnedSide, placeMarker, screenMarker, type MarkerBox } from '../src/ui/hud/markerMath';

const W = 1280;
const H = 720;
const BOX: MarkerBox = { left: 46, right: 46, top: 74, bottom: 110 };

function camera(reversed: boolean, yaw = 0) {
  const cam = new THREE.PerspectiveCamera(65, W / H, 0.1, 4000);
  (cam as unknown as { _reversedDepth: boolean })._reversedDepth = reversed;
  cam.position.set(0, 2, 0);
  cam.rotation.set(-0.12, yaw, 0, 'YXZ');
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

function place(cam: THREE.PerspectiveCamera, x: number, y: number, z: number, out = screenMarker()) {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
  const e = cam.projectionMatrix.elements;
  return placeMarker(out, v.x, v.y, v.z, e[0], e[5], e[8], e[9], W, H, BOX);
}

describe('world quest marker placement', () => {
  it('is the reversed depth that broke the old test: behind projects to z < 1', () => {
    const cam = camera(true);
    expect(cam.reversedDepth).toBe(true);
    const behind = new THREE.Vector3(0, 6, 400).project(cam);
    // The old code read `z > 1` as behind: false here, so it drew the point mirrored ahead.
    expect(behind.z).toBeLessThan(1);
    expect(Math.abs(behind.x)).toBeLessThan(0.05);
  });

  for (const reversed of [true, false]) {
    describe(reversed ? 'reversed depth' : 'standard depth', () => {
      it('puts a target straight ahead in the middle of the screen', () => {
        const m = place(camera(reversed), 0, 8, -300);
        expect(m.edge).toBe(false);
        expect(m.behind).toBe(false);
        expect(Math.abs(m.x - W / 2)).toBeLessThan(2);
      });

      it('never draws a target straight behind in the middle: it rides a side edge', () => {
        const m = place(camera(reversed), 0, 6, 400);
        expect(m.behind).toBe(true);
        expect(m.edge).toBe(true);
        expect(m.x === BOX.left || m.x === W - BOX.right).toBe(true);
      });

      it('rides the edge on the side to turn toward', () => {
        const cam = camera(reversed);
        const left = place(cam, -60, 2, 80);
        expect(left.behind).toBe(true);
        expect(left.x).toBe(BOX.left);
        expect(left.angle).toBe(90);
        const right = place(cam, 60, 2, 80);
        expect(right.x).toBe(W - BOX.right);
        expect(right.angle).toBe(-90);
      });

      it('slides an off-screen target in front to the edge in its direction', () => {
        const m = place(camera(reversed), 300, 2, -40);
        expect(m.behind).toBe(false);
        expect(m.edge).toBe(true);
        expect(m.x).toBeCloseTo(W - BOX.right, 3);
        expect(m.angle).toBeLessThan(0);
      });
    });
  }

  it('keeps its side while the target is about straight behind (no flicker)', () => {
    const cam = camera(true);
    const out = screenMarker();
    place(cam, -60, 2, 80, out);
    expect(out.side).toBe(-1);
    // Now nearly dead behind, a hair to the right: it stays on the left.
    place(cam, 0.5, 2, 300, out);
    expect(out.x).toBe(BOX.left);
  });

  it('following the marker leads to the target (the owner’s run, as a loop)', () => {
    // Stand at the origin facing north with the target 470 m to the south (straight behind), then
    // do what a player does: turn toward the marker and run at 5 m/s.
    const target = new THREE.Vector3(0, 0, 470);
    const pos = new THREE.Vector3(0, 0, 0);
    let yaw = 0;
    const out = screenMarker();
    const start = pos.distanceTo(target);
    for (let i = 0; i < 120; i++) {
      const cam = camera(true, yaw);
      cam.position.set(pos.x, 2, pos.z);
      cam.updateMatrixWorld(true);
      place(cam, target.x, 6, target.z, out);
      // Steer toward the marker: right of centre turns right (yaw down), left turns left.
      yaw -= ((out.x - W / 2) / (W / 2)) * 0.25;
      pos.x += -Math.sin(yaw) * 0.5;
      pos.z += -Math.cos(yaw) * 0.5;
    }
    expect(pos.distanceTo(target)).toBeLessThan(start - 40);
  });
});

describe('chevron and compass ends', () => {
  it('turns a downward chevron toward the edge it rides', () => {
    expect(chevronAngle(0, 1)).toBeCloseTo(0);
    expect(chevronAngle(1, 0)).toBeCloseTo(-90);
    expect(chevronAngle(-1, 0)).toBeCloseTo(90);
  });

  it('pins a quest marker behind you to one end and keeps it there', () => {
    expect(pinnedSide(120, 0)).toBe(1);
    expect(pinnedSide(-120, 0)).toBe(-1);
    // The relative bearing wobbles across ±180 while you walk straight away: the end holds.
    expect(pinnedSide(-179, 1)).toBe(1);
    expect(pinnedSide(179, -1)).toBe(-1);
    // Turning well round lets it change.
    expect(pinnedSide(-150, 1)).toBe(-1);
  });
});
