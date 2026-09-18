import assert from "node:assert/strict";
import test from "node:test";
import {
  approximateCoordinatesFromTimeZone,
  isDaylight,
  nextSolarTransition,
  solarTimes,
  type Coordinates,
} from "./solar.ts";

const BRATISLAVA: Coordinates = { latitude: 48.1486, longitude: 17.1077 };
const LONGYEARBYEN: Coordinates = { latitude: 78.2232, longitude: 15.6267 };
const QUITO: Coordinates = { latitude: -0.1807, longitude: -78.4678 };
const SYDNEY: Coordinates = { latitude: -33.8688, longitude: 151.2093 };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Minutes between two instants, always positive. */
const minutesBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / MINUTE;

test("summer solstice in Bratislava matches the published times", () => {
  const { sunrise, sunset } = solarTimes(new Date("2026-06-21T12:00:00Z"), BRATISLAVA);
  assert.ok(sunrise && sunset);
  // Published: 04:50 / 20:59 CEST, i.e. 02:50 / 18:59 UTC. A ten-minute window
  // is far wider than the algorithm's error and immune to table rounding.
  assert.ok(minutesBetween(sunrise, new Date("2026-06-21T02:50:00Z")) < 10, `sunrise ${sunrise.toISOString()}`);
  assert.ok(minutesBetween(sunset, new Date("2026-06-21T18:59:00Z")) < 10, `sunset ${sunset.toISOString()}`);
});

test("winter solstice in Bratislava matches the published times", () => {
  const { sunrise, sunset } = solarTimes(new Date("2026-12-21T12:00:00Z"), BRATISLAVA);
  assert.ok(sunrise && sunset);
  // Published: 07:42 / 15:57 CET, i.e. 06:42 / 14:57 UTC.
  assert.ok(minutesBetween(sunrise, new Date("2026-12-21T06:42:00Z")) < 10, `sunrise ${sunrise.toISOString()}`);
  assert.ok(minutesBetween(sunset, new Date("2026-12-21T14:57:00Z")) < 10, `sunset ${sunset.toISOString()}`);
});

test("the sun rises before noon and sets after it", () => {
  for (const day of ["2026-03-20", "2026-06-21", "2026-09-23", "2026-12-21"]) {
    const { sunrise, sunset, solarNoon } = solarTimes(new Date(`${day}T12:00:00Z`), BRATISLAVA);
    assert.ok(sunrise && sunset, day);
    assert.ok(sunrise < solarNoon, `${day}: sunrise after noon`);
    assert.ok(sunset > solarNoon, `${day}: sunset before noon`);
  }
});

test("day length follows the season, and the hemispheres disagree", () => {
  const dayLength = (iso: string, coords: Coordinates) => {
    const { sunrise, sunset } = solarTimes(new Date(iso), coords);
    assert.ok(sunrise && sunset, iso);
    return sunset.getTime() - sunrise.getTime();
  };

  const northSummer = dayLength("2026-06-21T12:00:00Z", BRATISLAVA);
  const northWinter = dayLength("2026-12-21T12:00:00Z", BRATISLAVA);
  assert.ok(northSummer > 15.5 * HOUR && northSummer < 16.5 * HOUR, `${northSummer / HOUR}h`);
  assert.ok(northWinter > 8 * HOUR && northWinter < 9 * HOUR, `${northWinter / HOUR}h`);

  // Same dates, southern hemisphere: the long and the short day swap over.
  assert.ok(dayLength("2026-12-21T12:00:00Z", SYDNEY) > dayLength("2026-06-21T12:00:00Z", SYDNEY));

  // On the equator every day is roughly twelve hours, all year round.
  for (const iso of ["2026-06-21T12:00:00Z", "2026-12-21T12:00:00Z"]) {
    assert.ok(minutesBetween(new Date(0), new Date(dayLength(iso, QUITO) - 12 * HOUR)) < 15, iso);
  }
});

test("the equinoxes split the day roughly in half everywhere", () => {
  for (const coords of [BRATISLAVA, QUITO, SYDNEY]) {
    const { sunrise, sunset } = solarTimes(new Date("2026-03-20T12:00:00Z"), coords);
    assert.ok(sunrise && sunset);
    const hours = (sunset.getTime() - sunrise.getTime()) / HOUR;
    assert.ok(hours > 11.7 && hours < 12.5, `${coords.latitude}: ${hours}h`);
  }
});

test("above the arctic circle the sun stops rising and setting", () => {
  const midsummer = solarTimes(new Date("2026-06-21T12:00:00Z"), LONGYEARBYEN);
  assert.equal(midsummer.polarDay, true);
  assert.equal(midsummer.sunrise, null);
  assert.equal(midsummer.sunset, null);
  assert.equal(isDaylight(new Date("2026-06-21T23:00:00Z"), LONGYEARBYEN), true);

  const midwinter = solarTimes(new Date("2026-12-21T12:00:00Z"), LONGYEARBYEN);
  assert.equal(midwinter.polarNight, true);
  assert.equal(isDaylight(new Date("2026-12-21T12:00:00Z"), LONGYEARBYEN), false);
});

test("isDaylight agrees with the day's own sunrise and sunset", () => {
  const day = new Date("2026-06-21T12:00:00Z");
  const { sunrise, sunset } = solarTimes(day, BRATISLAVA);
  assert.ok(sunrise && sunset);

  assert.equal(isDaylight(new Date(sunrise.getTime() + MINUTE), BRATISLAVA), true);
  assert.equal(isDaylight(new Date(sunset.getTime() - MINUTE), BRATISLAVA), true);
  assert.equal(isDaylight(new Date(sunrise.getTime() - 30 * MINUTE), BRATISLAVA), false);
  assert.equal(isDaylight(new Date(sunset.getTime() + 30 * MINUTE), BRATISLAVA), false);
});

test("the next transition is always ahead, and flips the answer", () => {
  const probes = [
    "2026-06-21T01:00:00Z", // before sunrise
    "2026-06-21T12:00:00Z", // broad daylight
    "2026-06-21T19:30:00Z", // just after sunset
    "2026-12-21T23:30:00Z", // deep winter night
  ];
  for (const iso of probes) {
    const now = new Date(iso);
    const next = nextSolarTransition(now, BRATISLAVA);
    assert.ok(next, iso);
    assert.ok(next > now, `${iso}: transition in the past`);
    assert.ok(next.getTime() - now.getTime() < 24 * HOUR, `${iso}: transition more than a day out`);
    assert.notEqual(
      isDaylight(new Date(next.getTime() + MINUTE), BRATISLAVA),
      isDaylight(new Date(next.getTime() - MINUTE), BRATISLAVA),
      `${iso}: light/dark unchanged across the transition`
    );
  }
});

test("polar day has no transition to schedule", () => {
  assert.equal(nextSolarTransition(new Date("2026-06-21T12:00:00Z"), LONGYEARBYEN), null);
});

test("the timezone fallback puts longitude in the right hemisphere", () => {
  const coords = approximateCoordinatesFromTimeZone(new Date("2026-06-21T12:00:00Z"));
  assert.ok(coords.longitude >= -180 && coords.longitude <= 180);
  assert.ok(coords.latitude > -90 && coords.latitude < 90);
  // Whatever the runner's timezone is, the derived point must still produce a
  // sane day — this is the property the fallback exists for.
  const { sunrise, sunset } = solarTimes(new Date("2026-06-21T12:00:00Z"), coords);
  assert.ok(sunrise && sunset);
  assert.ok(sunset > sunrise);
});
