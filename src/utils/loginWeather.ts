/**
 * The time, weather and greeting shown on the login screen's left panel.
 *
 * Weather comes from Open-Meteo: free, no API key, CORS-enabled. It is asked
 * for the coordinates the "auto" theme already uses (a stored browser position
 * or the timezone estimate), so the login screen never triggers a location
 * prompt. Coordinates are rounded to ~10 km before they leave the browser.
 *
 * Everything here is optional decoration: any failure resolves to null and the
 * panel simply leaves the weather out.
 *
 * Kept free of imports so `node --test` can load it directly.
 */

export type LoginLanguage = "en" | "sk" | "hu";

const pick = (lang: string): LoginLanguage => (lang === "sk" || lang === "hu" ? lang : "en");

const tr = (lang: string, en: string, sk: string, hu: string): string => {
  const key = pick(lang);
  return key === "sk" ? sk : key === "hu" ? hu : en;
};

// -----------------------------------------------------------------------------
// Greeting, date, time
// -----------------------------------------------------------------------------

export const greetingFor = (date: Date, lang: string): string => {
  const h = date.getHours();
  if (h >= 5 && h < 12) return tr(lang, "Good morning", "Dobré ráno", "Jó reggelt");
  if (h >= 12 && h < 18) return tr(lang, "Good afternoon", "Dobrý deň", "Jó napot");
  if (h >= 18 && h < 22) return tr(lang, "Good evening", "Dobrý večer", "Jó estét");
  return tr(lang, "Working late?", "Ešte pracujete?", "Még dolgozik?");
};

const LOCALES: Record<LoginLanguage, string> = { en: "en-GB", sk: "sk-SK", hu: "hu-HU" };

/** "Thursday, 15 October" — no year, it is today. */
export const formatLoginDate = (date: Date, lang: string): string => {
  try {
    return new Intl.DateTimeFormat(LOCALES[pick(lang)], {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(date);
  } catch {
    return date.toDateString();
  }
};

export const formatHourMinute = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

/** "Europe/Bratislava" → "Bratislava". Null for zones that are not a place ("UTC", "Etc/GMT+1"). */
export const cityFromTimeZone = (timeZone: string | undefined | null): string | null => {
  if (!timeZone || !timeZone.includes("/") || timeZone.startsWith("Etc/")) return null;
  const last = timeZone.split("/").pop() || "";
  const city = last.replace(/_/g, " ").trim();
  return city || null;
};

// -----------------------------------------------------------------------------
// Sun
// -----------------------------------------------------------------------------

export interface SunEvent {
  kind: "sunrise" | "sunset";
  at: Date;
  label: string;
}

/**
 * The next sunrise or sunset worth mentioning: sunset during the day, sunrise
 * otherwise. Null inside a polar day or night, where neither happens.
 */
export const nextSunEvent = (
  now: Date,
  sunrise: Date | null,
  sunset: Date | null,
  tomorrowSunrise: Date | null,
  lang: string
): SunEvent | null => {
  const make = (kind: SunEvent["kind"], at: Date): SunEvent => ({
    kind,
    at,
    label:
      kind === "sunset"
        ? `${tr(lang, "Sunset", "Západ slnka", "Napnyugta")} ${formatHourMinute(at)}`
        : `${tr(lang, "Sunrise", "Východ slnka", "Napkelte")} ${formatHourMinute(at)}`
  });
  if (sunrise && now < sunrise) return make("sunrise", sunrise);
  if (sunset && now < sunset) return make("sunset", sunset);
  if (tomorrowSunrise) return make("sunrise", tomorrowSunrise);
  return null;
};

// -----------------------------------------------------------------------------
// Weather
// -----------------------------------------------------------------------------

export type WeatherIcon = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface LoginWeather {
  temperature: number;
  code: number;
  isDay: boolean;
}

/** WMO weather interpretation codes, as Open-Meteo returns them. */
export const describeWeatherCode = (code: number, lang: string): { icon: WeatherIcon; label: string } => {
  if (code === 0) return { icon: "clear", label: tr(lang, "Clear", "Jasno", "Derült") };
  if (code === 1) return { icon: "partly", label: tr(lang, "Mostly clear", "Prevažne jasno", "Túlnyomóan derült") };
  if (code === 2) return { icon: "partly", label: tr(lang, "Partly cloudy", "Polojasno", "Részben felhős") };
  if (code === 3) return { icon: "cloudy", label: tr(lang, "Overcast", "Zamračené", "Borult") };
  if (code === 45 || code === 48) return { icon: "fog", label: tr(lang, "Fog", "Hmla", "Köd") };
  if (code >= 51 && code <= 57) return { icon: "drizzle", label: tr(lang, "Drizzle", "Mrholenie", "Szitálás") };
  if ((code >= 61 && code <= 67)) return { icon: "rain", label: tr(lang, "Rain", "Dážď", "Eső") };
  if (code >= 80 && code <= 82) return { icon: "rain", label: tr(lang, "Showers", "Prehánky", "Zápor") };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { icon: "snow", label: tr(lang, "Snow", "Sneženie", "Havazás") };
  }
  if (code >= 95 && code <= 99) return { icon: "storm", label: tr(lang, "Thunderstorm", "Búrka", "Zivatar") };
  return { icon: "cloudy", label: tr(lang, "Cloudy", "Oblačno", "Felhős") };
};

/** One decimal place: roughly 10 km, enough for weather and no more precise than that. */
const coarse = (value: number): number => Math.round(value * 10) / 10;

export const weatherUrl = (latitude: number, longitude: number): string =>
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${coarse(latitude)}&longitude=${coarse(longitude)}` +
  "&current=temperature_2m,weather_code,is_day&timezone=auto";

export const parseWeather = (json: unknown): LoginWeather | null => {
  const current = (json as { current?: Record<string, unknown> } | null)?.current;
  if (!current) return null;
  const temperature = Number(current.temperature_2m);
  const code = Number(current.weather_code);
  if (!Number.isFinite(temperature) || !Number.isFinite(code)) return null;
  return { temperature, code, isDay: Number(current.is_day) !== 0 };
};

const CACHE_KEY = "ccrm_login_weather";
const CACHE_MS = 30 * 60 * 1000;

/** Current weather, cached for half an hour per location. Never rejects. */
export const fetchLoginWeather = async (
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<LoginWeather | null> => {
  const lat = coarse(latitude);
  const lon = coarse(longitude);
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && cached.lat === lat && cached.lon === lon && Date.now() - cached.at < CACHE_MS) {
      const hit = parseWeather({ current: cached.current });
      if (hit) return hit;
    }
  } catch {
    /* storage blocked or corrupt — fetch fresh */
  }
  try {
    const res = await fetch(weatherUrl(lat, lon), { signal });
    if (!res.ok) return null;
    const json = await res.json();
    const weather = parseWeather(json);
    if (weather) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), lat, lon, current: json.current }));
      } catch {
        /* caching is a nicety */
      }
    }
    return weather;
  } catch {
    return null;
  }
};
