import React, { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  RefreshCw,
  Sun,
  Sunrise,
  Sunset
} from "lucide-react";
import type { Language } from "../utils/translations";
import { getAutoLocation } from "../utils/theme";
import { solarTimes } from "../utils/solar";
import { quoteFor } from "../utils/loginQuotes";
import {
  cityFromTimeZone,
  describeWeatherCode,
  fetchLoginWeather,
  formatLoginDate,
  greetingFor,
  nextSunEvent,
  type LoginWeather,
  type WeatherIcon
} from "../utils/loginWeather";

const WeatherGlyph: React.FC<{ icon: WeatherIcon; isDay: boolean; className: string }> = ({ icon, isDay, className }) => {
  switch (icon) {
    case "clear":
      return isDay ? <Sun className={className} /> : <Moon className={className} />;
    case "partly":
      return isDay ? <CloudSun className={className} /> : <CloudMoon className={className} />;
    case "fog":
      return <CloudFog className={className} />;
    case "drizzle":
      return <CloudDrizzle className={className} />;
    case "rain":
      return <CloudRain className={className} />;
    case "snow":
      return <CloudSnow className={className} />;
    case "storm":
      return <CloudLightning className={className} />;
    case "cloudy":
    default:
      return <Cloud className={className} />;
  }
};

const chipClass =
  "inline-flex items-center gap-2 h-8.5 px-3.5 rounded-full bg-stone-100 type-meta text-stone-700 animate-in fade-in duration-500";

/**
 * Left side of the login screen: greeting, clock, today's weather and sun
 * time, and a quote of the day in the user's app language.
 */
export const LoginInfoPanel: React.FC<{ language: Language }> = ({ language }) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [quoteOffset, setQuoteOffset] = useState(0);
  const [weather, setWeather] = useState<LoginWeather | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { coords, precise } = useMemo(() => getAutoLocation(), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchLoginWeather(coords.latitude, coords.longitude, controller.signal).then((w) => {
      if (!controller.signal.aborted) setWeather(w);
    });
    return () => controller.abort();
  }, [coords]);

  // A timezone city only says where the estimate came from; once the browser
  // has given a real position it may be somewhere else entirely, so say nothing.
  const city = useMemo(() => {
    if (precise) return null;
    try {
      return cityFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      return null;
    }
  }, [precise]);

  const dayKey = now.toDateString();
  const sun = useMemo(() => {
    const today = solarTimes(now, coords);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { today, tomorrowSunrise: solarTimes(tomorrow, coords).sunrise };
    // Recomputed once a day, not every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, coords]);
  const sunEvent = nextSunEvent(now, sun.today.sunrise, sun.today.sunset, sun.tomorrowSunrise, language);

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const quote = quoteFor(now, language, quoteOffset);
  const condition = weather ? describeWeatherCode(weather.code, language) : null;
  const anotherQuoteLabel =
    language === "sk" ? "Zobraziť iný citát" : language === "hu" ? "Másik idézet" : "Show another quote";

  return (
    <section
      aria-label={greetingFor(now, language)}
      className="w-full max-w-md flex flex-col gap-7 rounded-[32px] border border-stone-200/60 bg-white/90 px-10 pt-9 pb-8 shadow-[0_30px_60px_-30px_rgba(41,37,36,0.25)] transition-colors duration-700"
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-title font-medium text-stone-700">{greetingFor(now, language)}</p>
        <p className="type-clock text-stone-900" aria-label={`${hours}:${minutes}`}>
          {hours}
          <span className="text-stone-400">:</span>
          {minutes}
        </p>
        <p className="mt-1 type-body text-stone-500">{formatLoginDate(now, language)}</p>
      </div>

      {(condition || sunEvent) && (
        <div className="flex flex-wrap gap-2">
          {weather && condition && (
            <span className={chipClass}>
              <WeatherGlyph icon={condition.icon} isDay={weather.isDay} className="h-4 w-4 text-amber-700" />
              <strong className="font-bold text-stone-900">{Math.round(weather.temperature)}°</strong>
              {city ? `${condition.label} · ${city}` : condition.label}
            </span>
          )}
          {sunEvent && (
            <span className={chipClass}>
              {sunEvent.kind === "sunset" ? (
                <Sunset className="h-4 w-4 text-amber-700" />
              ) : (
                <Sunrise className="h-4 w-4 text-amber-700" />
              )}
              {sunEvent.label}
            </span>
          )}
        </div>
      )}

      <div className="h-px bg-stone-200/70" />

      <figure className="flex flex-col gap-3.5">
        <blockquote key={quote.text} className="type-quote text-stone-900 animate-in fade-in duration-500">
          “{quote.text}”
        </blockquote>
        <figcaption className="flex items-center justify-between gap-3">
          <span className="type-meta text-stone-500">{quote.author}</span>
          <button
            type="button"
            onClick={() => setQuoteOffset((n) => n + 1)}
            aria-label={anotherQuoteLabel}
            title={anotherQuoteLabel}
            className="group h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl border border-stone-200 text-stone-500 transition-all duration-200 hover:bg-stone-50 hover:text-stone-800 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            <RefreshCw className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
          </button>
        </figcaption>
      </figure>
    </section>
  );
};
