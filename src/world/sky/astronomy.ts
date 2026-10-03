/**
 * Low-precision ephemeris for the sky over Rome in the 2nd century AD (pure math, no Three.js).
 *
 * Accuracy is about a degree for the sun and a few degrees for the moon, which is plenty for
 * lighting and for a moon whose phase matches the real one on the game date. Formulas follow
 * Meeus, *Astronomical Algorithms*, and the Astronomical Almanac's low-precision series.
 *
 * Time model: `GameTime.hour` is LOCAL APPARENT SOLAR TIME (a sundial reading, which is how the
 * Romans counted their hours), so the sun's hour angle is simply 15° × (hour − 12). The sidereal
 * time that rotates the stars and places the moon is derived from that.
 *
 * Directions are returned in game axes: +x east, +y up, +z SOUTH (north is −z).
 */

export const DEG = Math.PI / 180;

/** Latitude of the Forum Romanum. */
export const ROME_LATITUDE = 41.89;
/** Longitude east of Greenwich, used only to turn local time into UT for the moon. */
export const ROME_LONGITUDE = 12.49;
/** Mean synodic month in days. */
export const SYNODIC_MONTH = 29.530588853;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Julian Day at 0h UT of a date in the JULIAN calendar (Meeus 7.1 with B = 0).
 * `month` is 1..12, `day` is 1..31 (may be fractional).
 */
export function julianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day - 1524.5;
}

/** Julian Day for a game date (`month0` 0-based like GameTime) at a local solar hour in Rome. */
export function julianDayForGame(year: number, month0: number, day: number, hour: number): number {
  const utHours = hour - ROME_LONGITUDE / 15;
  return julianDay(year, month0 + 1, day) + utHours / 24;
}

/** Julian centuries since J2000.0. */
const centuries = (jd: number) => (jd - 2451545.0) / 36525;

const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** Mean obliquity of the ecliptic in degrees (≈ 23.68° in AD 113, larger than today's 23.44°). */
export function obliquity(jd: number): number {
  const t = centuries(jd);
  return 23.439291 - 0.0130042 * t - 1.64e-7 * t * t;
}

/** Apparent ecliptic longitude of the sun in degrees. */
export function sunLongitude(jd: number): number {
  const t = centuries(jd);
  const l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const m = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * DEG;
  const c = (1.914602 - 0.004817 * t) * Math.sin(m) + 0.019993 * Math.sin(2 * m) + 0.000289 * Math.sin(3 * m);
  return norm360(l0 + c);
}

export interface Equatorial {
  /** Right ascension, degrees. */
  ra: number;
  /** Declination, degrees. */
  dec: number;
}

/** Ecliptic (λ, β) → equatorial (α, δ), degrees. */
export function eclipticToEquatorial(lambda: number, beta: number, eps: number): Equatorial {
  const l = lambda * DEG;
  const b = beta * DEG;
  const e = eps * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / DEG;
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / DEG;
  return { ra: norm360(ra), dec };
}

/** Solar declination in degrees for a Julian Day. */
export function solarDeclination(jd: number): number {
  return eclipticToEquatorial(sunLongitude(jd), 0, obliquity(jd)).dec;
}

export interface MoonEcliptic {
  lambda: number;
  beta: number;
}

/** Geocentric ecliptic position of the moon (main periodic terms only; good to ~1°). */
export function moonEcliptic(jd: number): MoonEcliptic {
  const t = centuries(jd);
  const lp = 218.3164477 + 481267.88123421 * t; // mean longitude
  const d = (297.8501921 + 445267.1114034 * t) * DEG; // mean elongation
  const m = (357.5291092 + 35999.0502909 * t) * DEG; // sun's mean anomaly
  const mp = (134.9633964 + 477198.8675055 * t) * DEG; // moon's mean anomaly
  const f = (93.272095 + 483202.0175233 * t) * DEG; // argument of latitude
  const lambda =
    lp +
    6.289 * Math.sin(mp) +
    1.274 * Math.sin(2 * d - mp) +
    0.658 * Math.sin(2 * d) +
    0.214 * Math.sin(2 * mp) -
    0.186 * Math.sin(m) -
    0.114 * Math.sin(2 * f);
  const beta = 5.128 * Math.sin(f) + 0.281 * Math.sin(mp + f) + 0.278 * Math.sin(mp - f) + 0.173 * Math.sin(2 * d - f);
  return { lambda: norm360(lambda), beta };
}

/**
 * Equatorial coordinates → game direction for an observer at `lat` (degrees), given the hour
 * angle H = LST − α in degrees (positive west of the meridian).
 */
export function equatorialToGame(hourAngle: number, dec: number, lat: number, out: Vec3): Vec3 {
  const h = hourAngle * DEG;
  const d = dec * DEG;
  const p = lat * DEG;
  const east = -Math.cos(d) * Math.sin(h);
  const north = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(h) * Math.sin(p);
  const up = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(h) * Math.cos(p);
  out.x = east;
  out.y = up;
  out.z = -north;
  return out;
}

/** Elevation in degrees of a game-space unit direction. */
export const elevationOf = (v: Vec3) => Math.asin(Math.max(-1, Math.min(1, v.y))) / DEG;
/** Compass azimuth in degrees (0 = north, 90 = east) of a game-space direction. */
export const azimuthOf = (v: Vec3) => norm360(Math.atan2(v.x, -v.z) / DEG);

/**
 * Sunrise and sunset in local apparent solar hours for a declination, using the standard −0.833°
 * altitude (refraction + solar radius). Returns null for polar day/night.
 */
export function sunriseSunset(dec: number, lat = ROME_LATITUDE, altitude = -0.833): { rise: number; set: number } | null {
  const p = lat * DEG;
  const d = dec * DEG;
  const cosH = (Math.sin(altitude * DEG) - Math.sin(p) * Math.sin(d)) / (Math.cos(p) * Math.cos(d));
  if (cosH < -1 || cosH > 1) return null;
  const h0 = Math.acos(cosH) / DEG / 15;
  return { rise: 12 - h0, set: 12 + h0 };
}

export interface SkyEphemeris {
  /** Unit vector toward the sun (game axes). */
  sun: Vec3;
  /** Unit vector toward the moon (game axes). */
  moon: Vec3;
  /** Sun elevation in degrees. */
  sunElevation: number;
  moonElevation: number;
  /** Solar declination, degrees. */
  declination: number;
  /** Fraction of the moon's disc that is lit, 0 (new) .. 1 (full). */
  moonIllumination: number;
  /** Moon age as a fraction of the synodic month: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  moonPhase: number;
  /** Local sidereal time in degrees (rotates the star field). */
  lst: number;
  /**
   * Column-major 3×3 rotation taking an equatorial unit vector (x → α=0h, y → α=6h, z → celestial
   * pole) to game axes. Its transpose maps view directions back onto the celestial sphere.
   */
  starMatrix: number[];
}

/** Everything the sky needs for a game date (Julian calendar) and local apparent solar hour. */
export function computeEphemeris(year: number, month0: number, day: number, hour: number, lat = ROME_LATITUDE): SkyEphemeris {
  const jd = julianDayForGame(year, month0, day, hour);
  const eps = obliquity(jd);
  const sunLon = sunLongitude(jd);
  const sunEq = eclipticToEquatorial(sunLon, 0, eps);

  // Apparent solar time fixes the sun's hour angle; sidereal time follows from it.
  const sunH = 15 * (hour - 12);
  const lst = norm360(sunEq.ra + sunH);

  const sun = equatorialToGame(sunH, sunEq.dec, lat, { x: 0, y: 0, z: 0 });

  const me = moonEcliptic(jd);
  const moonEq = eclipticToEquatorial(me.lambda, me.beta, eps);
  const moon = equatorialToGame(lst - moonEq.ra, moonEq.dec, lat, { x: 0, y: 0, z: 0 });

  const elong = norm360(me.lambda - sunLon);
  const cosPsi = Math.cos(me.beta * DEG) * Math.cos(elong * DEG);
  const moonIllumination = (1 - cosPsi) / 2;

  // Star matrix columns: images of the equatorial basis vectors.
  const c0 = equatorialToGame(lst - 0, 0, lat, { x: 0, y: 0, z: 0 });
  const c1 = equatorialToGame(lst - 90, 0, lat, { x: 0, y: 0, z: 0 });
  const c2 = equatorialToGame(0, 90, lat, { x: 0, y: 0, z: 0 });

  return {
    sun,
    moon,
    sunElevation: elevationOf(sun),
    moonElevation: elevationOf(moon),
    declination: sunEq.dec,
    moonIllumination,
    moonPhase: elong / 360,
    lst,
    starMatrix: [c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z],
  };
}
