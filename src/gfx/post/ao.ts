/**
 * Screen-space ambient occlusion from the depth buffer alone (no extra scene pass): the darkening
 * where surfaces meet — wall feet, under cornices, inside doorways, between columns — that makes a
 * city read as solid. Alchemy-style estimator at half resolution (12 samples on a spiral, rotated
 * per pixel), normals rebuilt from depth, then a depth-aware 5×5 blur. It fades out with distance
 * (where the depth buffer gets coarse and AO stops reading anyway).
 *
 * Cost: two half-resolution passes, ~1 ms on an M-series Mac at 1512×860×2. On by default on the
 * High graphics tier only (Settings → Display → Ambient occlusion).
 */

export const AO_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec2 uTexel;      // full-resolution texel of the depth buffer
uniform float uRadius;    // view-space metres
uniform float uIntensity;
uniform float uFadeFar;   // metres: AO fades out toward here
uniform float uReversed;  // 1 with a reversed depth buffer (NDC z = depth, far = 0)
varying vec2 vUv;

vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, uReversed > 0.5 ? d : d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  float d = texture2D(tDepth, vUv).x;
  if (uReversed > 0.5 ? d <= 0.00001 : d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  float dist = -P.z;
  if (dist > uFadeFar) { gl_FragColor = vec4(1.0); return; }
  // Normal from the nearer of the two neighbours on each axis (no halos across silhouettes).
  vec3 px1 = viewPos(vUv + vec2(uTexel.x, 0.0)) - P, px0 = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 py1 = viewPos(vUv + vec2(0.0, uTexel.y)) - P, py0 = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(px1.z) < abs(px0.z) ? px1 : px0;
  vec3 dy = abs(py1.z) < abs(py0.z) ? py1 : py0;
  vec3 N = normalize(cross(dx, dy));
  // Screen radius of uRadius metres at this depth.
  float rs = uRadius * uProj[1][1] * 0.5 / dist;
  rs = clamp(rs, 3.0 * uTexel.y, 0.12);
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  const int N_S = 12;
  float occ = 0.0;
  for (int i = 0; i < N_S; i++) {
    float t = (float(i) + 0.5) / float(N_S);
    float a = rot + float(i) * 2.39996;
    vec2 o = vec2(cos(a), sin(a) * (uTexel.x / uTexel.y)) * rs * t;
    vec3 Q = viewPos(vUv + o);
    vec3 v = Q - P;
    float vv = dot(v, v);
    // Alchemy: occluders above the tangent plane, weighted down with distance.
    occ += max(0.0, dot(v, N) - 0.012 * dist) / (vv + 0.01) * smoothstep(uRadius * uRadius * 4.0, 0.0, vv);
  }
  float ao = max(0.0, 1.0 - uIntensity * 2.0 * occ / float(N_S));
  ao = mix(ao, 1.0, smoothstep(uFadeFar * 0.5, uFadeFar, dist));
  gl_FragColor = vec4(vec3(ao), 1.0);
}
`;

/** Depth-aware 5×5 blur of the half-resolution AO (keeps edges, kills the per-pixel noise). */
export const AO_BLUR_FRAG = /* glsl */ `
uniform sampler2D tAo;
uniform sampler2D tDepth;
uniform vec2 uTexel;      // AO texel
uniform mat4 uInvProj;
uniform float uReversed;
varying vec2 vUv;
float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, uReversed > 0.5 ? d : d * 2.0 - 1.0, 1.0);
  return p.z / p.w;
}
void main() {
  float z0 = viewZ(vUv);
  float sum = 0.0, wsum = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * uTexel;
      float z = viewZ(uv);
      float w = 1.0 / (1.0 + abs(z - z0) * 8.0 / max(1.0, -z0 * 0.05));
      sum += texture2D(tAo, uv).r * w;
      wsum += w;
    }
  }
  gl_FragColor = vec4(vec3(sum / wsum), 1.0);
}
`;
