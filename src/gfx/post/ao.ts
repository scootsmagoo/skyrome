/**
 * Screen-space ambient occlusion from the depth buffer alone (no extra scene pass): the darkening
 * where surfaces meet — wall feet, under cornices, inside doorways, between columns — that makes a
 * city read as solid. Alchemy-style estimator at half resolution (12 samples on a spiral, rotated
 * per pixel), normals rebuilt from depth, then a depth-aware (distance packed in the AO pass) 5×5 blur. It fades out with distance
 * (where the depth buffer gets coarse and AO stops reading anyway).
 *
 * The same pass also marches 10 steps toward the light through the depth buffer for screen-space
 * CONTACT SHADOWS (the thin dark line where a foot meets the ground or a prop meets a wall, which
 * a 4 cm shadow texel still misses); that lives in the green channel. AO_SAMPLES (12 High, 8
 * Medium) and CONTACT (High only) are compile-time defines.
 *
 * Cost: two half-resolution passes, ~1 ms on an M-series Mac at 1512×860×2. On for High and
 * Medium (Settings → Display → Ambient occlusion).
 */

export const AO_FRAG = /* glsl */ `
uniform sampler2D tDepth;
// The scene colour: alpha 0 marks characters (avatar materials), which neither take nor cast this AO.
uniform sampler2D tMask;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec2 uTexel;      // full-resolution texel of the depth buffer
uniform float uRadius;    // view-space metres
uniform float uIntensity;
uniform float uFadeFar;   // metres: AO fades out toward here
uniform float uReversed;  // 1 with a reversed depth buffer (NDC z = depth, far = 0)
uniform vec3 uLightView;  // unit vector toward the key light, in view space
uniform float uContactOn;
varying vec2 vUv;

vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, uReversed > 0.5 ? d : d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}

#ifdef CONTACT
// 1 = lit, 0 = in the contact shadow of something within ~0.8 m toward the light.
float contactShadow(vec3 P, vec3 N, float dist, float jitter) {
  const int N_C = 10;
  const float LEN = 0.8;
  vec3 O = P + N * (0.012 + 0.004 * dist);
  float occ = 0.0;
  for (int i = 0; i < N_C; i++) {
    float t = (float(i) + jitter) / float(N_C) * LEN;
    vec3 Q = O + uLightView * t;
    if (Q.z > -0.1) break;
    vec4 c = uProj * vec4(Q, 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sz = viewPos(uv).z;
    float diff = sz - Q.z;   // > 0: the surface seen there is nearer the camera than the ray
    if (diff > 0.02 + 0.012 * dist && diff < 0.3 + 0.5 * t) occ = max(occ, 1.0 - t / LEN);
  }
  return 1.0 - occ;
}
#endif

// View distance packed into two 8-bit channels (0..DIST_MAX m, ~3 mm steps) so the blur needs no depth reads.
const float DIST_MAX = 256.0;
vec2 packDist(float dist) {
  float v = clamp(dist / DIST_MAX, 0.0, 1.0) * 65535.0;
  float hi = floor(v / 256.0);
  return vec2(hi, v - hi * 256.0) / 255.0;
}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  float d = texture2D(tDepth, vUv).x;
  if (uReversed > 0.5 ? d <= 0.00001 : d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  float dist = -P.z;
  vec2 zp = packDist(dist);
  if (dist > uFadeFar) { gl_FragColor = vec4(1.0, 1.0, zp); return; }
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
  const int N_S = AO_SAMPLES;
  float occ = 0.0;
  for (int i = 0; i < N_S; i++) {
    float t = (float(i) + 0.5) / float(N_S);
    float a = rot + float(i) * 2.39996;
    vec2 o = vec2(cos(a), sin(a) * (uTexel.x / uTexel.y)) * rs * t;
    if (texture2D(tMask, vUv + o).a < 0.5) continue;
    vec3 Q = viewPos(vUv + o);
    vec3 v = Q - P;
    float vv = dot(v, v);
    // Alchemy: occluders above the tangent plane, weighted down with distance.
    occ += max(0.0, dot(v, N) - 0.012 * dist) / (vv + 0.01) * smoothstep(uRadius * uRadius * 4.0, 0.0, vv);
  }
  float ao = max(0.0, 1.0 - uIntensity * 2.0 * occ / float(N_S));
  if (texture2D(tMask, vUv).a < 0.5) ao = 1.0;
  ao = mix(ao, 1.0, smoothstep(uFadeFar * 0.5, uFadeFar, dist));
  float cs = 1.0;
  #ifdef CONTACT
  if (uContactOn > 0.5 && dist < 36.0) {
    cs = contactShadow(P, N, dist, ign(gl_FragCoord.xy + 17.0));
    cs = mix(cs, 1.0, smoothstep(18.0, 36.0, dist));
  }
  #endif
  gl_FragColor = vec4(ao, cs, zp);
}
`;

/** Depth-aware blur (5×5 on High; 3×3 at twice the spacing on Medium: AO_BLUR_R, AO_BLUR_STEP) of the half-resolution AO (keeps edges, kills the per-pixel noise). */
export const AO_BLUR_FRAG = /* glsl */ `
uniform sampler2D tAo;
uniform vec2 uTexel;      // AO texel
varying vec2 vUv;
// The AO pass stores the view distance in .ba (see packDist), so this pass reads one texture only.
float dist(vec4 t) { return (t.b * 255.0 * 256.0 + t.a * 255.0) / 65535.0 * 256.0; }
void main() {
  vec4 c = texture2D(tAo, vUv);
  float z0 = dist(c);
  vec2 sum = vec2(0.0);
  float wsum = 0.0;
  for (int y = -AO_BLUR_R; y <= AO_BLUR_R; y++) {
    for (int x = -AO_BLUR_R; x <= AO_BLUR_R; x++) {
      vec4 t = texture2D(tAo, vUv + vec2(float(x), float(y)) * uTexel * AO_BLUR_STEP);
      float w = 1.0 / (1.0 + abs(dist(t) - z0) * 8.0 / max(1.0, z0 * 0.05));
      sum += t.rg * w;
      wsum += w;
    }
  }
  gl_FragColor = vec4(sum / wsum, 0.0, 1.0);
}
`;
