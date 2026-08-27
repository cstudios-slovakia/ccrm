/**
 * Sunrise / sunset without a weather API.
 *
 * The "auto" theme mode flips the interface to dark after sunset and back to
 * light at sunrise. That needs the real solar times for the user's location,
 * and the obvious way to get them is a weather endpoint — which would mean an
 * API key in the bundle, a network round-trip on every boot, a rate limit, and
 * a screen that stays the wrong colour whenever the request fails.
 *
 * Sunrise and sunset are astronomy, not weather: they are a closed-form
 * function of date, latitude and longitude, accurate to well under a minute.
 * This module implements the standard NOAA/USNO low-precision solar position
 * algorithm (the one documented as the "sunrise equation"), so the feature is
 * offline, instant, free and cannot fail.
 *
 * What a weather API would add on top is nothing we need: cloud cover, civil
 * twilight variants, and someone else's rounding.
 *
 * Reference: https://en.wikipedia.org/wiki/Sunrise_equation
 */

export interface Coordinates {
  /** Degrees north, -90..90. */
  latitude: number;
  /** Degrees east, -180..180. */
  longitude: number;
}

export interface SolarTimes {
  /** Local sunrise, or null inside a polar day/night. */
  sunrise: Date | null;
  /** Local sunset, or null inside a polar day/night. */
  sunset: Date | null;
  /** Moment the sun is highest — always defined, even above the polar circles. */
  solarNoon: Date;
  /** True when the sun never sets on this date at this latitude. */
  polarDay: boolean;
  /** True when the sun never rises on this date at this latitude. */
  polarNight: boolean;
}

const DEG = Math.PI / 180;

/** Julian day number of the Unix epoch (1970-01-01T00:00:00Z). */
const UNIX_EPOCH_JULIAN_DAY = 2440587.5;

/** Julian day number of J2000.0 (2000-01-01T12:00:00 TT). */
const J2000 = 2451545.0;

/** Earth's mean obliquity of the ecliptic, degrees. */
const OBLIQUITY = 23.4397;

/**
 * Solar altitude counted as "risen". -0.833° is the conventional value: -0.266°
 * for the sun's apparent radius plus -0.567° for atmospheric refraction at the
 * horizon. It is what every published sunrise table uses.
 */
const HORIZON_ALTITUDE = -0.833;

const toJulian = (date: Date): number => date.getTime() / 86400000 + UNIX_EPOCH_JULIAN_DAY;

const fromJulian = (julian: number): Date => new Date((julian - UNIX_EPOCH_JULIAN_DAY) * 86400000);

/** Positive modulo — JS `%` keeps the sign of the dividend, which breaks angles. */
const mod360 = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Solar events for the day `date` falls on, at `coords`.
 *
 * "The day" is the UTC day containing the local solar noon nearest `date`,
 * which is what the sunrise equation naturally produces. For the purpose this
 * serves — deciding whether it is currently light outside — that is exactly
 * right, and it stays right across DST changes because every value returned is
 * an absolute instant, never a wall-clock time.
 */
export const solarTimes = (date: Date, coords: Coordinates): SolarTimes => {
  const latitude = Math.max(-90, Math.min(90, coords.latitude));
  const longitude = coords.longitude;

  // Days since J2000, shifted so the cycle starts at local (not Greenwich) solar
  // midnight. 0.0008 is the leap-second offset baked into the published method.
  const daysSinceJ2000 = toJulian(date) - J2000 + 0.0008;
  const meanSolarDay = Math.round(daysSinceJ2000) - longitude / 360;

  // Sun's mean anomaly.
  const meanAnomaly = mod360(357.5291 + 0.98560028 * meanSolarDay);
  const sinM = Math.sin(meanAnomaly * DEG);

  // Equation of the centre — the correction from the circular mean orbit to the
  // real elliptical one.
  const equationOfCentre =
    1.9148 * sinM +
    0.02 * Math.sin(2 * meanAnomaly * DEG) +
    0.0003 * Math.sin(3 * meanAnomaly * DEG);

  // Ecliptic longitude (+102.9372° is the argument of perihelion, +180° puts the
  // sun opposite the earth).
  const eclipticLongitude = mod360(meanAnomaly + equationOfCentre + 180 + 102.9372);
  const sinLambda = Math.sin(eclipticLongitude * DEG);

  // Julian date of solar transit (local solar noon).
  const julianTransit =
    J2000 + meanSolarDay + 0.0053 * sinM - 0.0069 * Math.sin(2 * eclipticLongitude * DEG);

  // Declination of the sun on this day.
  const sinDeclination = sinLambda * Math.sin(OBLIQUITY * DEG);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));

  // Hour angle at which the sun crosses the horizon. Outside ±1 the sun never
  // reaches that altitude: polar day or polar night.
  const cosHourAngle =
    (Math.sin(HORIZON_ALTITUDE * DEG) - Math.sin(latitude * DEG) * sinDeclination) /
    (Math.cos(latitude * DEG) * cosDeclination);

  const solarNoon = fromJulian(julianTransit);

  if (cosHourAngle > 1) {
    return { sunrise: null, sunset: null, solarNoon, polarDay: false, polarNight: true };
  }
  if (cosHourAngle < -1) {
    return { sunrise: null, sunset: null, solarNoon, polarDay: true, polarNight: false };
  }

  const hourAngle = Math.acos(cosHourAngle) / DEG;
  return {
    sunrise: fromJulian(julianTransit - hourAngle / 360),
    sunset: fromJulian(julianTransit + hourAngle / 360),
    solarNoon,
    polarDay: false,
    polarNight: false,
  };
};

/** Whether the sun is above the horizon at `now` for `coords`. */
export const isDaylight = (now: Date, coords: Coordinates): boolean => {
  const { sunrise, sunset, polarDay } = solarTimes(now, coords);
  if (!sunrise || !sunset) return polarDay;
  return now >= sunrise && now < sunset;
};

/**
 * The next instant the light/dark answer changes, so the app can sleep until
 * exactly then instead of polling.
 *
 * Returns null above the polar circles while the sun is stuck on one side of
 * the horizon — there is no transition today, and the caller falls back to a
 * plain daily re-check.
 */
export const nextSolarTransition = (now: Date, coords: Coordinates): Date | null => {
  // Today's pair may both be behind us (after sunset), so walk forward a day at
  // a time until an event is in the future. Two days is enough everywhere the
  // sun rises at all; the guard is generous rather than tight.
  for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 86400000);
    const { sunrise, sunset } = solarTimes(probe, coords);
    const candidates = [sunrise, sunset].filter((d): d is Date => !!d && d > now);
    if (candidates.length) {
      return candidates.reduce((earliest, d) => (d < earliest ? d : earliest));
    }
  }
  return null;
};

/** Bratislava — the app's home market. See approximateCoordinatesFromTimeZone. */
export const DEFAULT_LATITUDE = 48.15;

/**
 * A usable location when the browser has not granted geolocation.
 *
 * The timezone offset pins longitude to within about half an hour of sun time
 * (15° per hour), which is all sunrise/sunset needs to be right to a few
 * minutes. Latitude cannot be inferred that way, so it defaults to the app's
 * home market — the error that leaves is at most a few tens of minutes at
 * mid-latitudes, and vanishes the moment the user shares a real position.
 */
export const approximateCoordinatesFromTimeZone = (now: Date = new Date()): Coordinates => {
  // getTimezoneOffset is minutes *behind* UTC, so it is negated to get east-positive.
  const offsetHours = -now.getTimezoneOffset() / 60;
  const longitude = Math.max(-180, Math.min(180, offsetHours * 15));
  return { latitude: DEFAULT_LATITUDE, longitude };
};
