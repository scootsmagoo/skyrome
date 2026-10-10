/**
 * GLSL for the painted face (used by real/skin.ts when a SkinPaint is given).
 *
 * The body's UV atlas carries only baked normals and AO, so the face is painted procedurally from the
 * bind-pose position: `q = (vRest - uHeadJ) / uHeadK` is the position in the REFERENCE head's frame
 * (metres from the head joint; the head bone's morph is exactly that scale and translation), where the
 * features sit at fixed places measured on the baked heads. Painted: brows, lips, lid lines and lashes,
 * nostrils, blush, the shadows of the eye sockets and under the nose, age lines, stubble and the skin
 * under a beard, the shadow of the hair roots above the hairline, and a thin-skin mask for the ears and
 * nose (`skThin`: light shining through, used by the direct-light hook).
 */

export const PAINT_PARS = /* glsl */ `
uniform vec3 uHeadJ;
uniform float uHeadK;
uniform vec3 uEye;      // eye centre (x > 0), relative to the head joint, reference metres
uniform vec4 uFace;     // mouth y, nose-tip y, nose-tip z, mouth half width
uniform vec4 uHead;     // chin y, head height, axis z, brow y (all relative)
uniform vec4 uEar;      // x min, y bottom, y top, z max
uniform vec3 uBrowC;
uniform vec3 uLipC;
uniform vec4 uStubC;    // rgb: beard colour; a: stubble amount 0..1
uniform vec4 uHl;       // hairline height fractions: front, temple, side, nape
uniform vec3 uHlC;      // colour of the hair roots
uniform vec4 uMisc;     // beard (0 none, 1 stubble, 2 short, 3 full), blush, age 0..1, scalp on (0/1)
uniform vec2 uLook;     // sex (0 male, 1 female), brow thickness
float skThin = 0.0;
float skPaintH = 0.0;
float skCavity = 0.0;
float pt_noise(vec2 p) { return sk_noise(vec3(p, 0.37)); }
float pt_line(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
float pt_hairline(float a) {
  float d = a * 57.2958;
  if (d < 38.0) return mix(uHl.x, uHl.y, smoothstep(0.0, 38.0, d));
  if (d < 85.0) return mix(uHl.y, uHl.z, smoothstep(38.0, 85.0, d));
  if (d < 112.0) return uHl.z;
  return mix(uHl.z, uHl.w, smoothstep(112.0, 150.0, d));
}
float pt_beardTop(float a) {
  if (a < 0.3) return 0.178;
  if (a < 0.62) return mix(0.178, 0.4, smoothstep(0.3, 0.62, a));
  return mix(0.4, 0.62, smoothstep(0.62, 1.45, a));
}
`;

/** Replaces nothing: appended after the base colour block. Reads vRest, writes diffuseColor, skThin, skPaintH. */
export const PAINT_COLOR = /* glsl */ `
{
  vec3 q = (vRest - uHeadJ) / uHeadK;
  vec3 dq = max(fwidth(q), vec3(0.0003));
  float aa = max(dq.x, dq.y) * 1.2;
  float ax = abs(q.x);
  float ex = uEye.x;
  float yf = (q.y - uHead.x) / uHead.y;
  float zc = q.z - uHead.z;
  float az = abs(atan(q.x, zc));
  float fr = smoothstep(uEye.z - 0.05, uEye.z - 0.02, q.z);
  float inHead = smoothstep(uHead.x - 0.012, uHead.x + 0.004, q.y);
  vec3 col = diffuseColor.rgb;
  float tint = 1.0;

  // ---- soft facial colour: blush, sockets, nose, forehead
  float cheek = exp(-pow((ax - 0.046) / 0.02, 2.0) - pow((q.y - (uEye.y - 0.03)) / 0.022, 2.0)) * fr;
  col = mix(col, col * vec3(1.1, 0.78, 0.72), clamp(uMisc.y * cheek, 0.0, 0.7));
  float socket = exp(-pow((ax - ex) / 0.022, 2.0) - pow((q.y - (uEye.y + 0.004)) / 0.016, 2.0)) * fr;
  tint *= 1.0 - 0.1 * socket - 0.05 * uMisc.z * socket;
  float bag = exp(-pow((ax - ex) / 0.018, 2.0) - pow((q.y - (uEye.y - 0.017)) / 0.006, 2.0)) * fr;
  tint *= 1.0 - (0.07 + 0.1 * uMisc.z) * bag;
  float noseW = exp(-pow(ax / 0.011, 2.0) - pow((q.y - uFace.y) / 0.014, 2.0)) * smoothstep(uFace.z - 0.025, uFace.z - 0.008, q.z);
  col = mix(col, col * vec3(1.06, 0.88, 0.84), noseW * 0.7);
  float philtrum = exp(-pow(q.x / 0.0045, 2.0) - pow((q.y - (uFace.y - 0.016)) / 0.007, 2.0)) * fr;
  tint *= 1.0 - 0.07 * philtrum;

  // ---- lips
  {
    float mx = q.x;
    float my = q.y - uFace.x;
    float hw = uFace.w;
    float lx = clamp(abs(mx) / hw, 0.0, 1.0);
    float curve = sqrt(max(0.0, 1.0 - lx * lx));
    float lipU = 0.0092 * (0.85 + 0.35 * uLook.x);
    float lipL = 0.0115 * (0.85 + 0.4 * uLook.x);
    float upTop = lipU * curve - 0.0025 * exp(-mx * mx / 0.000025) * (1.0 - 0.4 * uLook.x) + 0.0006;
    float loBot = -lipL * curve;
    float inLip = smoothstep(loBot - aa, loBot + aa * 0.6, my) * smoothstep(upTop + aa * 0.6, upTop - aa, my) * smoothstep(1.02, 0.9, abs(mx) / hw) * fr;
    // The upper lip is a shade darker than the lower (it faces down).
    vec3 lc = uLipC * mix(0.86, 1.0, smoothstep(0.0, -0.004, my));
    col = mix(col, lc, inLip * 0.88);
    float line = pt_line(my - 0.0006 * (1.0 - lx) + 0.0012 * lx * lx, 0.00075, aa) * smoothstep(1.0, 0.82, abs(mx) / hw);
    tint *= 1.0 - 0.55 * line * fr;
    // Shadow under the lower lip and the corners of the mouth.
    tint *= 1.0 - 0.1 * exp(-pow(mx / 0.016, 2.0) - pow((my + lipL + 0.0045) / 0.0042, 2.0)) * fr;
    tint *= 1.0 - 0.18 * exp(-pow((abs(mx) - hw) / 0.0032, 2.0) - pow(my / 0.0035, 2.0)) * fr;
    skPaintH -= 0.5 * line * fr;
  }

  // ---- inside the mouth (seen when the jaw opens): dark and red, facing away from the light
  {
    float behind = smoothstep(uFace.z - 0.016, uFace.z - 0.026, q.z);
    float inward = smoothstep(0.35, 0.05, vRestN.z);
    float mouthBox = smoothstep(uFace.w + 0.004, uFace.w - 0.004, ax) * smoothstep(0.022, 0.012, abs(q.y - uFace.x));
    float cavity = behind * inward * mouthBox * fr;
    col = mix(col, vec3(0.16, 0.035, 0.03), cavity);
    tint *= 1.0 - 0.6 * cavity * smoothstep(uFace.z - 0.02, uFace.z - 0.05, q.z);
    skCavity = cavity;
  }

  // ---- eyes: lid line, lashes, crease
  {
    float dx = ax - ex;
    float dy = q.y - uEye.y;
    float rx = 0.0165;
    float ry = 0.0072 + 0.0008 * uLook.x;
    float d = length(vec2(dx / rx, dy / ry));
    // Upper lid line (lashes): a dark arc on the upper half of the opening.
    float arcY = ry * sqrt(max(0.0, 1.0 - (dx / (rx * 1.05)) * (dx / (rx * 1.05))));
    float upper = pt_line(dy - arcY * 1.04 - 0.0005, 0.0011 + 0.0006 * uLook.x, aa) * smoothstep(1.12, 0.9, abs(dx) / rx);
    tint *= 1.0 - (0.62 + 0.15 * uLook.x) * upper * fr;
    // Lashes flicking out at the outer end.
    float outer = smoothstep(0.35, 1.0, dx / rx) * smoothstep(1.3, 0.95, dx / rx);
    float lash = pt_line(dy - arcY * 1.04 - 0.0012 * outer, 0.0007 + 0.0008 * outer, aa) * outer;
    tint *= 1.0 - 0.4 * lash * fr * (1.0 + uLook.x);
    // Lower lid, fainter.
    float lower = pt_line(dy + arcY * 0.9 + 0.0016, 0.0007, aa) * smoothstep(1.1, 0.8, abs(dx) / rx);
    tint *= 1.0 - 0.22 * lower * fr;
    // Crease above the lid and the inner corner.
    float crease = pt_line(dy - arcY * 1.7 - 0.0042 - 0.002 * (dx / rx), 0.0009, aa * 1.5) * smoothstep(1.2, 0.5, abs(dx) / rx);
    tint *= 1.0 - (0.26 + 0.1 * uMisc.z) * crease * fr;
    float caruncle = exp(-pow((dx + rx * 0.95) / 0.0024, 2.0) - pow(dy / 0.0035, 2.0));
    col = mix(col, col * vec3(1.0, 0.55, 0.52), 0.55 * caruncle * fr);
    skPaintH -= 0.4 * crease * fr;
  }

  // ---- brows
  {
    float t = clamp((ax - 0.011) / 0.052, 0.0, 1.0);
    float arch = sin(t * 2.5) * (0.0085 + 0.0035 * uLook.x) - 0.0035 * t * t;
    float yb = uHead.w + arch + 0.0015 * uLook.x;
    float thick = mix(0.0052, 0.0014, pow(t, 1.1)) * uLook.y;
    float inBrow = smoothstep(thick + aa, thick - aa * 0.5, abs(q.y - yb)) * smoothstep(0.004, 0.014, ax) * smoothstep(0.068, 0.054, ax) * fr;
    float strands = sk_noise(vec3(q.y * 1300.0 - ax * 150.0, ax * 90.0, 0.5)) * 0.65 + sk_noise(vec3(q.y * 2900.0, ax * 200.0, 1.5)) * 0.35;
    float dens = inBrow * (0.5 + 0.5 * strands) * (1.0 - 0.15 * t);
    col = mix(col, uBrowC, clamp(dens * (1.15 - 0.2 * uLook.x), 0.0, 1.0));
    tint *= 1.0 - 0.05 * inBrow;
  }

  // ---- nostrils and the creases of the nose wings
  {
    float nx = ax - 0.0098;
    float ny = q.y - (uFace.y - 0.0085);
    float nostril = exp(-(nx * nx) / (0.0035 * 0.0035) - (ny * ny) / (0.0021 * 0.0021)) * smoothstep(uFace.z - 0.03, uFace.z - 0.012, q.z);
    tint *= 1.0 - 0.72 * nostril;
    float wing = pt_line(length(vec2(ax - 0.0165, (q.y - (uFace.y - 0.0045)) * 1.4)) - 0.0075, 0.0009, aa * 1.4) * smoothstep(0.0, 0.01, ax - 0.013);
    tint *= 1.0 - 0.2 * wing * fr;
    float fdy = clamp((uFace.y + 0.004 - q.y) / 0.04, 0.0, 1.0);
    float fold = pt_line((ax - 0.0155) - 0.02 * (fdy * 0.55 + fdy * fdy * 0.45) * 1.0, 0.0024, aa * 2.5) * smoothstep(uFace.x + 0.014, uFace.x + 0.022, q.y) * smoothstep(uFace.y + 0.012, uFace.y + 0.004, q.y);
    tint *= 1.0 - (0.05 + 0.1 * uMisc.z) * fold * fr;
    skPaintH -= 0.25 * fold * fr * (0.4 + uMisc.z);
  }

  // ---- age: forehead lines, crow's feet, jowls
  if (uMisc.z > 0.01) {
    float fy = (q.y - uHead.w - 0.018) / 0.0105;
    float fz = smoothstep(uEye.z - 0.04, uEye.z - 0.02, q.z) * smoothstep(0.046, 0.024, ax) * smoothstep(-0.2, 0.3, fy) * smoothstep(5.2, 3.2, fy);
    float wob = pt_noise(vec2(q.x * 60.0, fy * 1.5)) - 0.5;
    float lines = pt_line(fract(fy + wob * 0.5) - 0.5, 0.075, aa / 0.0105) * fz;
    tint *= 1.0 - 0.1 * uMisc.z * lines;
    skPaintH -= 0.7 * uMisc.z * lines;
    float cf = pt_line(sin(atan(q.y - uEye.y + 0.002, ax - ex - 0.021) * 8.0), 0.35, 0.2) * exp(-pow((ax - ex - 0.03) / 0.012, 2.0) - pow((q.y - uEye.y) / 0.016, 2.0)) * fr;
    tint *= 1.0 - 0.08 * uMisc.z * cf;
  }

  // ---- stubble and the skin under a beard
  {
    float inZone = smoothstep(pt_beardTop(az) + 0.015, pt_beardTop(az) - 0.015, yf) * smoothstep(1.6, 1.4, az) * smoothstep(-0.02, 0.05, yf) * step(0.5, uMisc.x);
    float lipsOut = smoothstep(0.95, 1.2, length(vec2(q.x / (uFace.w + 0.002), (q.y - uFace.x) / 0.0125)));
    // Upper lip zone (the moustache grows there; the lips themselves do not).
    float lipZone = smoothstep(0.034, 0.028, ax) * smoothstep(uFace.x + 0.008, uFace.x + 0.014, q.y) * smoothstep(uFace.y - 0.003, uFace.y - 0.012, q.y) * step(0.5, uMisc.x);
    float zone = max(inZone, lipZone) * lipsOut * fr * inHead;
    float n = sk_noise(vec3(q.x * 900.0, q.y * 900.0, q.z * 900.0));
    float n2 = sk_noise(vec3(q.x * 2400.0 + 7.0, q.y * 2400.0, q.z * 2400.0));
    float dots = smoothstep(0.38, 0.7, n * 0.6 + n2 * 0.5);
    float amount = uStubC.a * (uMisc.x < 1.5 ? 1.0 : 0.0) + (uMisc.x > 1.5 ? 0.85 : 0.0);
    // Beards: the skin under them is the hair's own tone; stubble: dots and a bluish shadow.
    vec3 sh = mix(col, uStubC.rgb, 0.5);
    col = mix(col, sh, zone * (0.28 * uStubC.a + 0.55 * step(1.5, uMisc.x)));
    col = mix(col, uStubC.rgb * 0.8, zone * dots * amount * 0.65);
  }

  // ---- hair roots above the hairline darken the scalp (the hair cap thins out over it): fine root stipple
  // over a few millimetres, densest under the hair, never blotches on the forehead.
  if (uMisc.w > 0.5) {
    float h = pt_hairline(az) + 0.012 * (sk_noise(vec3(az * 14.0, 3.7, 0.0)) - 0.5);
    float s = smoothstep(h - 0.006, h + 0.035, yf);
    float fine = sk_noise(q * 1500.0) * 0.6 + sk_noise(q * 650.0 + 3.1) * 0.4;
    // Sub-pixel stipple fades to its mean (no shimmer at a distance).
    float roots = mix(0.5, smoothstep(0.4, 0.72, fine), smoothstep(0.0012, 0.0005, aa));
    col = mix(col, uHlC, s * (0.25 + 0.5 * roots) * smoothstep(0.0, 0.25, s + roots * 0.2));
  }

  // ---- thin skin: the ears and the nose let the light through
  {
    float ear = smoothstep(uEar.x - 0.006, uEar.x + 0.004, ax) * smoothstep(uEar.y - 0.01, uEar.y + 0.01, q.y) * smoothstep(uEar.z + 0.012, uEar.z - 0.012, q.y) * smoothstep(uEar.w + 0.015, uEar.w - 0.005, q.z);
    float nose = exp(-pow(length(vec3(q.x / 1.2, q.y - uFace.y - 0.002, (q.z - uFace.z + 0.004) / 1.5)) / 0.0105, 2.0));
    float wings = exp(-pow((ax - 0.014) / 0.006, 2.0) - pow((q.y - uFace.y) / 0.008, 2.0)) * smoothstep(uFace.z - 0.03, uFace.z - 0.01, q.z) * 0.8;
    skThin = clamp(ear + max(nose, wings), 0.0, 1.0) * inHead;
    col = mix(col, col * vec3(1.12, 0.84, 0.78), skThin * 0.4);
  }

  diffuseColor.rgb = col * tint;
}
`;

/** Thin-skin transmission in the direct-light hook (after the wrap-lighting term). */
export const PAINT_THIN = /* glsl */ `
reflectedLight.directDiffuse += directLight.color * material.diffuseColor * RECIPROCAL_PI * skThin * 1.1 * vec3( 1.0, 0.36, 0.2 ) * saturate( dot( - geometryNormal, directLight.direction ) * 0.9 + 0.2 );
`;

/** Wrinkle bump: added to the pore height in the normal block (gradient of skPaintH). */
export const PAINT_BUMP = /* glsl */ `
{
  float pH = skPaintH;
  vec3 pdx = dFdx( - vViewPosition );
  vec3 pdy = dFdy( - vViewPosition );
  float pdHx = dFdx( pH );
  float pdHy = dFdy( pH );
  vec3 pr1 = cross( pdy, normal );
  vec3 pr2 = cross( normal, pdx );
  float pdet = dot( pdx, pr1 );
  vec3 pgrad = sign( pdet ) * ( pdHx * pr1 + pdHy * pr2 );
  normal = normalize( abs( pdet ) * normal - 0.0022 * pgrad );
}
`;

/** After the physical material is set up: the inside of the mouth reflects (almost) nothing. */
export const PAINT_SPEC = /* glsl */ `
material.specularColor *= 1.0 - 0.9 * skCavity;
material.specularColorBlended *= 1.0 - 0.9 * skCavity;
material.specularF90 *= 1.0 - 0.9 * skCavity;
`;
