/**
 * Allocation-free quaternion helpers on flat Float32Arrays (x, y, z, w at offset o).
 * The animation runtime blends dozens of poses per avatar per frame, so it avoids THREE objects.
 */

export type QArr = Float32Array | number[];

export function qSet(out: QArr, o: number, x: number, y: number, z: number, w: number) {
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  out[o + 3] = w;
}

export function qIdentity(out: QArr, o = 0) {
  qSet(out, o, 0, 0, 0, 1);
}

/** out = a * b (apply b first, then a). Safe when out aliases a or b. */
export function qMul(out: QArr, oo: number, a: QArr, ao: number, b: QArr, bo: number) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[oo] = ax * bw + aw * bx + ay * bz - az * by;
  out[oo + 1] = ay * bw + aw * by + az * bx - ax * bz;
  out[oo + 2] = az * bw + aw * bz + ax * by - ay * bx;
  out[oo + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** Quaternion for a rotation of `rad` about a principal axis (0 = X, 1 = Y, 2 = Z). */
export function qAxis(out: QArr, o: number, axis: number, rad: number) {
  const h = rad * 0.5;
  const s = Math.sin(h);
  out[o] = axis === 0 ? s : 0;
  out[o + 1] = axis === 1 ? s : 0;
  out[o + 2] = axis === 2 ? s : 0;
  out[o + 3] = Math.cos(h);
}

/** Normalized lerp with hemisphere correction: out = nlerp(a, b, t). */
export function qNlerp(out: QArr, oo: number, a: QArr, ao: number, b: QArr, bo: number, t: number) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  let bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  if (ax * bx + ay * by + az * bz + aw * bw < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  const x = ax + (bx - ax) * t;
  const y = ay + (by - ay) * t;
  const z = az + (bz - az) * t;
  const w = aw + (bw - aw) * t;
  const l = 1 / (Math.hypot(x, y, z, w) || 1);
  out[oo] = x * l;
  out[oo + 1] = y * l;
  out[oo + 2] = z * l;
  out[oo + 3] = w * l;
}

/** Rotate vector v (array offset vo) by quaternion q; writes to out (offset outo). */
export function qRotate(out: QArr, outo: number, q: QArr, qo: number, vx: number, vy: number, vz: number) {
  const qx = q[qo], qy = q[qo + 1], qz = q[qo + 2], qw = q[qo + 3];
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[outo] = vx + qw * tx + (qy * tz - qz * ty);
  out[outo + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[outo + 2] = vz + qw * tz + (qx * ty - qy * tx);
}

export function qInvert(out: QArr, oo: number, a: QArr, ao: number) {
  out[oo] = -a[ao];
  out[oo + 1] = -a[ao + 1];
  out[oo + 2] = -a[ao + 2];
  out[oo + 3] = a[ao + 3];
}

/** Quaternion rotating unit vector a onto unit vector b (shortest arc). */
export function qFromUnitVectors(out: QArr, o: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  let r = ax * bx + ay * by + az * bz + 1;
  let x: number, y: number, z: number;
  if (r < 1e-6) {
    r = 0;
    if (Math.abs(ax) > Math.abs(az)) {
      x = -ay;
      y = ax;
      z = 0;
    } else {
      x = 0;
      y = -az;
      z = ay;
    }
  } else {
    x = ay * bz - az * by;
    y = az * bx - ax * bz;
    z = ax * by - ay * bx;
  }
  const l = 1 / Math.hypot(x, y, z, r);
  out[o] = x * l;
  out[o + 1] = y * l;
  out[o + 2] = z * l;
  out[o + 3] = r * l;
}
