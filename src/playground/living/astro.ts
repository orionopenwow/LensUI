/**
 * Sun and Moon for the Living Themes (docs/LIVING_THEMES.md). Pure functions, no dependencies.
 *
 * Sun: the NOAA solar position algorithm (the one behind the NOAA Solar Calculator
 * spreadsheet), including the equation of time and NOAA's atmospheric refraction correction.
 * Accurate to well under 0.1° for 1950–2050, which is far more than a wallpaper needs.
 *
 * Moon: the low-precision lunar theory used by suncalc (Meeus, truncated): ecliptic longitude
 * with the equation of centre, latitude and distance, then the phase angle from the Sun–Moon
 * elongation. Good to about 1° in position and an hour or two in phase timing, which is enough
 * to put the Moon in the right part of the sky with the right shape.
 *
 * Angles are degrees in the public API. Azimuth is measured from true north, clockwise
 * (0 = N, 90 = E, 180 = S, 270 = W).
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SkyPosition {
  /** Degrees above the horizon (refraction-corrected for the Sun). */
  altitude: number;
  /** Degrees from north, clockwise, 0..360. */
  azimuth: number;
}

export interface SunPosition extends SkyPosition {
  /** Declination, degrees. */
  declination: number;
  /** Equation of time, minutes. */
  eqTime: number;
}

export interface MoonState extends SkyPosition {
  /** Lit fraction of the disc, 0..1. */
  illumination: number;
  /** Phase, 0..1: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  phase: number;
  waxing: boolean;
  /** Earth–Moon distance, km. */
  distance: number;
  /**
   * Angle of the bright limb's midpoint, measured from the direction "up" toward the zenith,
   * clockwise on screen. Used to rotate the terminator so the lit side faces the Sun.
   */
  brightLimb: number;
  /** Local hour angle, degrees (−180..180, 0 = on the meridian). Drives the tide model. */
  hourAngle: number;
}

const norm360 = (x: number) => ((x % 360) + 360) % 360;

/** Julian Day for a JS Date (UTC). */
export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5;
}

/** Julian centuries since J2000.0. */
function centuries(jd: number): number {
  return (jd - 2451545) / 36525;
}

/** NOAA's refraction correction (degrees) for a geometric elevation `e` (degrees). */
export function refraction(e: number): number {
  if (e > 85) return 0;
  const te = Math.tan(e * RAD);
  let arcsec: number;
  if (e > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (e > -0.575) arcsec = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)));
  else arcsec = -20.774 / te;
  return arcsec / 3600;
}

interface SolarCore {
  declination: number;
  eqTime: number;
  /** Apparent right ascension, degrees. */
  ra: number;
}

function solarCore(jd: number): SolarCore {
  const T = centuries(jd);
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const ra = norm360(Math.atan2(Math.cos(eps * RAD) * Math.sin(lambda * RAD), Math.cos(lambda * RAD)) * DEG);
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));
  return { declination, eqTime, ra };
}

/** Altitude/azimuth from latitude, declination and hour angle (all degrees). */
function horizontal(lat: number, dec: number, ha: number): SkyPosition {
  const phi = lat * RAD;
  const d = dec * RAD;
  const h = ha * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
  // atan2 form avoids the division by cos(alt) at the zenith; +180 turns "from south" into "from north".
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)) * DEG + 180;
  return { altitude, azimuth: norm360(az) };
}

/** Sun position for an instant and place (NOAA). Longitude east-positive. */
export function sunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const jd = julianDay(date);
  const { declination, eqTime } = solarCore(jd);
  const utcMinutes = ((date.getTime() / 60_000) % 1440 + 1440) % 1440;
  const tst = (((utcMinutes + eqTime + 4 * longitude) % 1440) + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const geo = horizontal(latitude, declination, ha);
  return { altitude: geo.altitude + refraction(geo.altitude), azimuth: geo.azimuth, declination, eqTime };
}

/** Minutes past UTC midnight of local solar noon for the given day (NOAA). */
export function solarNoonUtcMinutes(date: Date, longitude: number): number {
  const noon = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  const { eqTime } = solarCore(julianDay(noon));
  return 720 - 4 * longitude - eqTime;
}

// ---- Moon ----------------------------------------------------------------------------------

const OBLIQUITY = 23.4397 * RAD;
const SUN_KM = 149_598_000;

function raDec(lng: number, lat: number): { ra: number; dec: number } {
  // Ecliptic (radians) -> equatorial (radians).
  return {
    ra: Math.atan2(Math.sin(lng) * Math.cos(OBLIQUITY) - Math.tan(lat) * Math.sin(OBLIQUITY), Math.cos(lng)),
    dec: Math.asin(Math.sin(lat) * Math.cos(OBLIQUITY) + Math.cos(lat) * Math.sin(OBLIQUITY) * Math.sin(lng)),
  };
}

function moonCoords(d: number): { ra: number; dec: number; dist: number } {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const lng = L + RAD * 6.289 * Math.sin(M);
  const lat = RAD * 5.128 * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);
  return { ...raDec(lng, lat), dist };
}

function sunCoordsLow(d: number): { ra: number; dec: number } {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return raDec(L, 0);
}

/** Moon position, phase and lit fraction for an instant and place. */
export function moonState(date: Date, latitude: number, longitude: number): MoonState {
  const d = julianDay(date) - 2451545;
  const m = moonCoords(d);
  const s = sunCoordsLow(d);
  // Local sidereal time (radians), then hour angle.
  const lst = RAD * (280.16 + 360.9856235 * d) + longitude * RAD;
  const H = lst - m.ra;
  const phi = latitude * RAD;
  let alt = Math.asin(Math.sin(phi) * Math.sin(m.dec) + Math.cos(phi) * Math.cos(m.dec) * Math.cos(H));
  // Lunar parallax (topocentric correction, up to ~1°) and a simple refraction term.
  const parallax = Math.asin(6378.14 / m.dist) * Math.cos(alt);
  alt -= parallax;
  const altitude = alt * DEG + (alt * DEG > -1 ? refraction(alt * DEG) : 0);
  const azimuth = norm360(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(m.dec) * Math.cos(phi)) * DEG + 180);

  // Illumination (Meeus ch. 48): elongation -> phase angle.
  const cosElong = Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra);
  const elong = Math.acos(Math.max(-1, Math.min(1, cosElong)));
  const inc = Math.atan2(SUN_KM * Math.sin(elong), m.dist - SUN_KM * Math.cos(elong));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
  );
  const illumination = (1 + Math.cos(inc)) / 2;
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  // Parallactic angle turns the bright-limb angle (from celestial north) into "from the zenith".
  const pa = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(m.dec) - Math.sin(m.dec) * Math.cos(H));
  return {
    altitude,
    azimuth,
    illumination,
    phase: ((phase % 1) + 1) % 1,
    waxing: phase < 0.5,
    distance: m.dist,
    brightLimb: norm360((pa - angle) * DEG),
    hourAngle: ((((H * DEG) % 360) + 540) % 360) - 180,
  };
}

/** Angle between two sky positions, degrees (great circle). */
export function separation(a: SkyPosition, b: SkyPosition): number {
  const c =
    Math.sin(a.altitude * RAD) * Math.sin(b.altitude * RAD) +
    Math.cos(a.altitude * RAD) * Math.cos(b.altitude * RAD) * Math.cos((a.azimuth - b.azimuth) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
}

// ---- Twilight ------------------------------------------------------------------------------

export type SkyStage = "day" | "golden" | "civil" | "nautical" | "astronomical" | "night";

/**
 * Standard thresholds, degrees of solar altitude. `horizon` is the apparent (refracted) altitude
 * of the Sun's centre at sunrise/sunset, i.e. the usual geometric −0.833° after refraction; the
 * twilight limits are geometric by definition, and refraction there is under 0.1°.
 */
export const TWILIGHT = {
  golden: 6,
  horizon: -0.27,
  civil: -6,
  nautical: -12,
  astronomical: -18,
} as const;

/**
 * Which part of the day a solar altitude belongs to. "golden" is the low-sun band between the
 * apparent horizon and +6°; the three twilights follow the usual −6° / −12° / −18° limits.
 */
export function skyStage(altitude: number): SkyStage {
  if (altitude >= TWILIGHT.golden) return "day";
  if (altitude >= TWILIGHT.horizon) return "golden";
  if (altitude >= TWILIGHT.civil) return "civil";
  if (altitude >= TWILIGHT.nautical) return "nautical";
  if (altitude >= TWILIGHT.astronomical) return "astronomical";
  return "night";
}

/** 0 in full daylight .. 1 in astronomical night: how visible the stars are. */
export function starVisibility(sunAltitude: number): number {
  const t = (-2 - sunAltitude) / 14; // first stars at −2°, all of them by −16°
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Seconds since the last solar noon -> "morning" (sun rising) or "evening". */
export function isEvening(sun: SunPosition, latitude: number): boolean {
  // In the northern hemisphere the Sun is east (az < 180) in the morning. Near the poles or the
  // tropics the azimuth can wrap, so use the hour-angle sign via the azimuth relative to the
  // meridian the Sun culminates on.
  const culminatesSouth = latitude >= sun.declination;
  return culminatesSouth ? sun.azimuth > 180 : sun.azimuth < 180 && sun.azimuth > 0;
}
