/**
 * Real bright stars and the Milky Way's orientation, precessed from J2000 back to AD 113, so the
 * constellations a Roman would know (Ursa Major, Boötes, Lyra, Scorpius…) stand where they did.
 * Positions are in the EQUATORIAL FRAME OF DATE used by `SkyEphemeris.starMatrix`.
 */
import * as THREE from 'three';
import { DEG, eclipticToEquatorial, julianDay, obliquity } from './astronomy';
import { FAR_PLANE, reversedDepth } from '../../gfx/depth';

/** Years from AD 113 to J2000 × general precession in longitude (50.29″/yr). */
export const PRECESSION_DEG = ((2000 - 113) * 50.29) / 3600;
const EPS_J2000 = 23.4392911;

/** J2000 (RA hours, Dec degrees) → unit vector in the AD 113 equatorial frame. */
export function precessToAD113(raHours: number, decDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = raHours * 15 * DEG;
  const d = decDeg * DEG;
  const e = EPS_J2000 * DEG;
  // Equatorial J2000 → ecliptic J2000.
  const sinB = Math.sin(d) * Math.cos(e) - Math.cos(d) * Math.sin(e) * Math.sin(a);
  const beta = Math.asin(sinB);
  const lambda = Math.atan2(Math.sin(a) * Math.cos(e) + Math.tan(d) * Math.sin(e), Math.cos(a));
  // Back-precess along the ecliptic, then to the equator of AD 113.
  const eq = eclipticToEquatorial(lambda / DEG - PRECESSION_DEG, beta / DEG, obliquity(julianDay(113, 5, 13)));
  const ra = eq.ra * DEG;
  const dec = eq.dec * DEG;
  return out.set(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
}

/** Galactic north pole and galactic centre in the AD 113 equatorial frame. */
export function galacticFrame() {
  return {
    pole: precessToAD113(192.85948 / 15, 27.12825),
    center: precessToAD113(266.40499 / 15, -28.93617),
  };
}

/**
 * The brightest stars visible from Rome: [name, RA (h, J2000), Dec (°, J2000), V magnitude, B−V color].
 */
export const BRIGHT_STARS: [string, number, number, number, number][] = [
  ['Sirius', 6.7525, -16.716, -1.46, 0.0],
  ['Arcturus', 14.261, 19.182, -0.05, 1.23],
  ['Vega', 18.6156, 38.784, 0.03, 0.0],
  ['Capella', 5.2782, 45.998, 0.08, 0.8],
  ['Rigel', 5.2423, -8.2016, 0.13, -0.03],
  ['Procyon', 7.655, 5.225, 0.34, 0.42],
  ['Betelgeuse', 5.9195, 7.407, 0.42, 1.85],
  ['Altair', 19.8464, 8.868, 0.76, 0.22],
  ['Aldebaran', 4.5987, 16.509, 0.86, 1.54],
  ['Antares', 16.4901, -26.432, 0.96, 1.83],
  ['Spica', 13.4199, -11.161, 0.97, -0.23],
  ['Pollux', 7.7553, 28.026, 1.14, 1.0],
  ['Fomalhaut', 22.9608, -29.622, 1.16, 0.09],
  ['Deneb', 20.6905, 45.28, 1.25, 0.09],
  ['Regulus', 10.1395, 11.967, 1.35, -0.11],
  ['Adhara', 6.977, -28.972, 1.5, -0.21],
  ['Castor', 7.5767, 31.888, 1.58, 0.03],
  ['Shaula', 17.5601, -37.104, 1.62, -0.22],
  ['Bellatrix', 5.4189, 6.35, 1.64, -0.22],
  ['Elnath', 5.4382, 28.608, 1.65, -0.13],
  ['Alnilam', 5.6036, -1.202, 1.69, -0.18],
  ['Alnitak', 5.6793, -1.943, 1.77, -0.21],
  ['Alioth', 12.9005, 55.96, 1.77, -0.02],
  ['Dubhe', 11.0621, 61.751, 1.79, 1.07],
  ['Mirfak', 3.4054, 49.861, 1.79, 0.48],
  ['Wezen', 7.1399, -26.393, 1.83, 0.68],
  ['Sargas', 17.6219, -42.998, 1.86, 0.4],
  ['Kaus Australis', 18.4029, -34.385, 1.85, -0.03],
  ['Alkaid', 13.7923, 49.313, 1.86, -0.19],
  ['Menkalinan', 5.9921, 44.947, 1.9, 0.08],
  ['Alhena', 6.6285, 16.399, 1.93, 0.0],
  ['Polaris', 2.5303, 89.264, 1.98, 0.6],
  ['Mirzam', 6.3783, -17.956, 1.98, -0.24],
  ['Alphard', 9.4598, -8.659, 1.98, 1.44],
  ['Hamal', 2.1196, 23.462, 2.0, 1.15],
  ['Diphda', 0.7265, -17.987, 2.04, 1.02],
  ['Nunki', 18.9211, -26.297, 2.05, -0.13],
  ['Menkent', 14.1114, -36.37, 2.06, 1.01],
  ['Saiph', 5.7959, -9.67, 2.06, -0.17],
  ['Alpheratz', 0.1398, 29.091, 2.06, -0.11],
  ['Mirach', 1.1622, 35.621, 2.05, 1.58],
  ['Kochab', 14.8451, 74.155, 2.08, 1.47],
  ['Rasalhague', 17.5822, 12.56, 2.08, 0.15],
  ['Algol', 3.1361, 40.956, 2.1, -0.05],
  ['Almach', 2.065, 42.33, 2.1, 1.37],
  ['Denebola', 11.8177, 14.572, 2.13, 0.09],
  ['Naos', 8.0597, -40.003, 2.25, -0.27],
  ['Suhail', 9.1333, -43.433, 2.21, 1.66],
  ['Mizar', 13.3988, 54.925, 2.23, 0.02],
  ['Schedar', 0.6751, 56.537, 2.24, 1.17],
  ['Eltanin', 17.9434, 51.489, 2.23, 1.52],
  ['Sadr', 20.3705, 40.257, 2.23, 0.67],
  ['Alphecca', 15.5781, 26.715, 2.23, -0.02],
  ['Caph', 0.1529, 59.15, 2.28, 0.34],
  ['Dschubba', 16.0056, -22.622, 2.29, -0.12],
  ['Izar', 14.7498, 27.074, 2.37, 0.97],
  ['Merak', 11.0307, 56.382, 2.37, -0.02],
  ['Enif', 21.7364, 9.875, 2.38, 1.52],
  ['Ankaa', 0.4381, -42.306, 2.4, 1.09],
  ['Phecda', 11.8972, 53.695, 2.44, 0.0],
  ['Sabik', 17.1725, -15.725, 2.43, 0.06],
  ['Scheat', 23.0629, 28.083, 2.42, 1.67],
  ['Alderamin', 21.3097, 62.585, 2.45, 0.22],
  ['Aludra', 7.4016, -29.303, 2.45, -0.08],
  ['Markab', 23.0793, 15.205, 2.48, -0.04],
  ['Gamma Cas', 0.9451, 60.717, 2.47, -0.15],
  ['Aljanah', 20.7702, 33.97, 2.48, 1.03],
  ['Menkar', 3.0380, 4.09, 2.53, 1.64],
  ['Zosma', 11.2351, 20.524, 2.56, 0.12],
  ['Acrab', 16.0906, -19.806, 2.62, -0.07],
  ['Zubeneschamali', 15.2834, -9.383, 2.61, -0.11],
  ['Unukalhai', 15.7378, 6.426, 2.63, 1.17],
  ['Gienah', 12.2634, -17.542, 2.59, -0.11],
  ['Sheratan', 1.9107, 20.808, 2.64, 0.13],
  ['Kraz', 12.5731, -23.397, 2.65, 0.89],
  ['Ruchbah', 1.4302, 60.235, 2.68, 0.13],
  ['Muphrid', 13.9114, 18.398, 2.68, 0.58],
  ['Lesath', 17.5127, -37.296, 2.7, -0.22],
  ['Kaus Media', 18.3499, -29.828, 2.7, 1.38],
  ['Tarazed', 19.7709, 10.613, 2.72, 1.52],
  ['Porrima', 12.6943, -1.449, 2.74, 0.36],
  ['Zubenelgenubi', 14.8480, -16.042, 2.75, 0.15],
  ['Kornephoros', 16.5037, 21.49, 2.77, 0.94],
  ['Ascella', 19.0435, -29.88, 2.6, 0.08],
  ['Kaus Borealis', 18.4662, -25.421, 2.81, 1.04],
  ['Algenib', 0.2206, 15.184, 2.83, -0.23],
  ['Vindemiatrix', 13.0363, 10.959, 2.83, 0.94],
  ['Alcyone', 3.7914, 24.105, 2.87, -0.09],
  ['Delta Cyg', 19.7496, 45.131, 2.87, -0.03],
  ['Tejat', 6.3827, 22.514, 2.88, 1.64],
  ['Cor Caroli', 12.9338, 38.318, 2.89, -0.12],
  ['Gomeisa', 7.4525, 8.289, 2.89, -0.1],
  ['Algorab', 12.4977, -16.515, 2.95, -0.05],
  ['Albireo', 19.5121, 27.96, 3.08, 1.09],
  ['Rasalgethi', 17.2441, 14.39, 3.1, 1.44],
  ['Megrez', 12.2571, 57.033, 3.31, 0.08],
  ['Segin', 1.9066, 63.67, 3.37, -0.15],
  ['Electra', 3.7479, 24.113, 3.7, -0.11],
  ['Maia', 3.7638, 24.368, 3.87, -0.07],
  ['Merope', 3.7720, 23.948, 4.18, -0.06],
  ['Taygeta', 3.7535, 24.467, 4.3, -0.11],
  ['Atlas', 3.8194, 24.053, 3.62, -0.08],
];

/** Approximate star color from B−V (linear RGB, max 1). */
export function starColor(bv: number, out = new THREE.Color()): THREE.Color {
  // Ballesteros' formula B−V → temperature, then a coarse blackbody tint.
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const k = THREE.MathUtils.clamp((t - 3000) / 9000, 0, 1);
  out.setRGB(1, 0.62 + 0.36 * Math.min(1, k * 1.6), 0.32 + 0.68 * k);
  const m = Math.max(out.r, out.g, out.b);
  return out.setRGB(out.r / m, out.g / m, out.b / m);
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aMag;
uniform mat3 uStarMatrix;
uniform float uStars;
uniform float uPixelRatio;
uniform float uReversedDepth;
${'' /* cloud functions are prepended by the caller */}
varying vec3 vColor;
void main() {
  vec3 dir = uStarMatrix * position;
  float b = pow(2.512, -aMag) * uStars;
  // Atmospheric extinction and twinkle near the horizon.
  float ext = smoothstep(-0.01, 0.12, dir.y);
  b *= ext * (1.0 - cloudOpacity(dir));
  vColor = aColor * b * 0.9;
  vec4 p = projectionMatrix * viewMatrix * vec4(dir, 0.0);
  gl_Position = ${FAR_PLANE};
  gl_PointSize = (2.0 + clamp(1.4 - aMag * 0.55, 0.0, 2.2)) * uPixelRatio;
  if (b < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  float a = exp(-r2 * 3.5);
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
  // No-ops into PostFX's linear HDR target; tone map + sRGB when post is off.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Point sprites for the catalog stars; drawn after the dome (additive, at the far plane). */
export function createBrightStars(domeUniforms: Record<string, THREE.IUniform>, cloudGlsl: string, pixelRatio: number): THREE.Points {
  const n = BRIGHT_STARS.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const mag = new Float32Array(n);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  BRIGHT_STARS.forEach(([, ra, dec, m, bv], i) => {
    precessToAD113(ra, dec, v).toArray(pos, i * 3);
    starColor(bv, c).toArray(col, i * 3);
    mag[i] = m;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  const mat = new THREE.ShaderMaterial({
    name: 'BrightStars',
    uniforms: {
      uReversedDepth: reversedDepth,
      uStarMatrix: domeUniforms.uStarMatrix,
      uStars: domeUniforms.uStars,
      uCloudCover: domeUniforms.uCloudCover,
      uCloudOffset: domeUniforms.uCloudOffset,
      uCirrusOffset: domeUniforms.uCirrusOffset,
      uCirrus: domeUniforms.uCirrus,
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: cloudGlsl + VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.name = 'brightStars';
  pts.frustumCulled = false;
  pts.renderOrder = 1;
  return pts;
}
