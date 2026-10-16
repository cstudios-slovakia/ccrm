import { test } from "node:test";
import assert from "node:assert/strict";
import { LOGIN_QUOTES, quoteFor, quoteIndexFor } from "./loginQuotes.ts";
import {
  cityFromTimeZone,
  describeWeatherCode,
  greetingFor,
  nextSunEvent,
  parseWeather,
  weatherUrl
} from "./loginWeather.ts";

const at = (h: number, m = 0) => new Date(2026, 9, 15, h, m);

test("every quote is filled in for every language", () => {
  for (const q of LOGIN_QUOTES) {
    for (const lang of ["en", "sk", "hu"] as const) {
      assert.ok(q.text[lang].trim().length > 0, `missing ${lang} text`);
      assert.ok(q.author[lang].trim().length > 0, `missing ${lang} author`);
    }
  }
});

test("the quote is stable through a day and changes the next", () => {
  assert.equal(quoteIndexFor(at(0, 1)), quoteIndexFor(at(23, 59)));
  assert.notEqual(quoteIndexFor(at(12)), quoteIndexFor(new Date(2026, 9, 16, 12)));
});

test("another quote steps forward and wraps round the list", () => {
  const base = quoteIndexFor(at(12));
  assert.equal(quoteIndexFor(at(12), 1), (base + 1) % LOGIN_QUOTES.length);
  assert.equal(quoteIndexFor(at(12), LOGIN_QUOTES.length), base);
});

test("the quote follows the app language, English otherwise", () => {
  const i = quoteIndexFor(at(12));
  assert.equal(quoteFor(at(12), "sk").text, LOGIN_QUOTES[i].text.sk);
  assert.equal(quoteFor(at(12), "hu").author, LOGIN_QUOTES[i].author.hu);
  assert.equal(quoteFor(at(12), "de").text, LOGIN_QUOTES[i].text.en);
});

test("greeting follows the hour", () => {
  assert.equal(greetingFor(at(8), "en"), "Good morning");
  assert.equal(greetingFor(at(14), "sk"), "Dobrý deň");
  assert.equal(greetingFor(at(19), "hu"), "Jó estét");
  assert.equal(greetingFor(at(2), "en"), "Working late?");
});

test("city comes from the timezone, not from UTC-style zones", () => {
  assert.equal(cityFromTimeZone("Europe/Bratislava"), "Bratislava");
  assert.equal(cityFromTimeZone("America/New_York"), "New York");
  assert.equal(cityFromTimeZone("UTC"), null);
  assert.equal(cityFromTimeZone("Etc/GMT+1"), null);
});

test("sun event: sunrise before dawn, sunset by day, tomorrow's sunrise after dark", () => {
  const rise = at(7, 6);
  const set = at(17, 58);
  const tomorrow = new Date(2026, 9, 16, 7, 8);
  assert.equal(nextSunEvent(at(5), rise, set, tomorrow, "en")?.label, "Sunrise 07:06");
  assert.equal(nextSunEvent(at(14), rise, set, tomorrow, "sk")?.label, "Západ slnka 17:58");
  assert.equal(nextSunEvent(at(21), rise, set, tomorrow, "hu")?.label, "Napkelte 07:08");
  assert.equal(nextSunEvent(at(14), null, null, null, "en"), null);
});

test("weather codes map to labels in each language", () => {
  assert.equal(describeWeatherCode(2, "en").label, "Partly cloudy");
  assert.equal(describeWeatherCode(61, "sk").label, "Dážď");
  assert.equal(describeWeatherCode(95, "hu").icon, "storm");
  assert.equal(describeWeatherCode(1234, "en").icon, "cloudy");
});

test("weather request rounds the position to one decimal", () => {
  const url = weatherUrl(48.14816, 17.10674);
  assert.match(url, /latitude=48\.1&longitude=17\.1&/);
});

test("weather response parsing tolerates junk", () => {
  assert.deepEqual(parseWeather({ current: { temperature_2m: 14.2, weather_code: 2, is_day: 1 } }), {
    temperature: 14.2,
    code: 2,
    isDay: true
  });
  assert.equal(parseWeather(null), null);
  assert.equal(parseWeather({ current: { temperature_2m: "warm" } }), null);
});
