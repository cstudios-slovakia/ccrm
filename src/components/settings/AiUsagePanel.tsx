import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Language } from "../../utils/translations";
import {
  aiFeatureLabel,
  aiModelLabel,
  formatUsd,
  priceAiUsage,
  type AiUsageRow,
} from "../../utils/aiUsage";
import { ScrollFade } from "./ScrollFade";
import { SectionCard } from "./SectionCard";

const pad = (n: number) => String(n).padStart(2, "0");

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const monthLabel = (month: string, lang: Language): string => {
  const locale = lang === "sk" ? "sk-SK" : lang === "hu" ? "hu-HU" : "en-GB";
  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" });
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
};

const formatTokens = (n: number): string => Math.round(n).toLocaleString("en-US");

const CountUp: React.FC<{ value: number; format: (n: number) => string; className?: string }> = ({ value, format, className }) => {
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{format(shown)}</span>;
};

export const AiUsagePanel: React.FC<{ lang: Language }> = ({ lang }) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const now = currentMonth();
  const oldest = shiftMonth(now, -35);
  const [month, setMonth] = React.useState(now);
  const [rows, setRows] = React.useState<AiUsageRow[]>([]);
  const [monthsWithData, setMonthsWithData] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = React.useState(0);
  const reduceMotion = React.useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setStatus("loading");
    fetch(`/api/ai_usage.php?month=${month}`, { credentials: "same-origin", signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.success || !Array.isArray(body.rows)) throw new Error("usage");
        setRows(body.rows);
        setMonthsWithData(Array.isArray(body.months) ? body.months : []);
        setStatus("ready");
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [month, reload]);

  const priced = rows.map((row) => ({ row, price: priceAiUsage(row.model, row, month) }));
  priced.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  const total = priced.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const unpriced = priced.some((item) => item.price === null);
  const totalTokens = rows.reduce(
    (sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens + row.inputAudioTokens + row.outputAudioTokens,
    0,
  );
  const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0);
  const monthChoices: string[] = [];
  for (let cursor = now; cursor >= oldest; cursor = shiftMonth(cursor, -1)) monthChoices.push(cursor);

  const go = (next: string) => {
    if (next < oldest || next > now) return;
    setMonth(next);
  };

  const navButton = "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition duration-150 ease-out hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm active:translate-y-0 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:pointer-events-none disabled:opacity-40 motion-reduce:transform-none";

  return (
    <SectionCard
      testId="settings-ai-usage"
      title={t("AI usage", "Spotreba AI", "AI használat")}
      description={t(
        "Tokens and list price for every feature that called a model, added up for the month. The ledger starts with the next call — earlier use was not stored.",
        "Tokeny a cenníková cena každej funkcie, ktorá zavolala model, sčítané za mesiac. Evidencia začína ďalším volaním — staršie použitie sa neukladalo.",
        "Tokenek és listaár minden funkcióhoz, amely modellt hívott, havonta összeadva. A nyilvántartás a következő hívással indul — a korábbi használat nem volt tárolva.",
      )}
      action={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={navButton}
            aria-label={t("Previous month", "Predchádzajúci mesiac", "Előző hónap")}
            disabled={month <= oldest}
            onClick={() => go(shiftMonth(month, -1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <label className="sr-only" htmlFor="ai-usage-month">
            {t("Month", "Mesiac", "Hónap")}
          </label>
          <select
            id="ai-usage-month"
            value={month}
            onChange={(e) => go(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-800 transition duration-150 ease-out focus:border-indigo-500 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {monthChoices.map((choice) => (
              <option key={choice} value={choice}>
                {monthsWithData.includes(choice) ? "• " : ""}
                {monthLabel(choice, lang)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={navButton}
            aria-label={t("Next month", "Ďalší mesiac", "Következő hónap")}
            disabled={month >= now}
            onClick={() => go(shiftMonth(month, 1))}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      }
    >
      <div key={month} className={reduceMotion ? "flex flex-col gap-5" : "flex flex-col gap-5 animate-fade-in"}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="type-overline text-slate-500">{t("Month total", "Spolu za mesiac", "Havi összesen")}</p>
            <p className="text-metric font-heading tabular-nums text-slate-900" aria-live="polite">
              {status === "ready" ? <CountUp value={total} format={formatUsd} /> : "—"}
            </p>
          </div>
          <p className="text-ui text-slate-500">
            {status === "ready" ? (
              <>
                <CountUp value={totalTokens} format={formatTokens} className="font-semibold tabular-nums text-slate-700" />
                {" "}
                {t("tokens", "tokenov", "token")}
                {" · "}
                <CountUp value={totalCalls} format={formatTokens} className="font-semibold tabular-nums text-slate-700" />
                {" "}
                {t("calls", "volaní", "hívás")}
              </>
            ) : (
              t("Loading this month…", "Načítava sa mesiac…", "A hónap betöltése…")
            )}
          </p>
        </div>

        {status === "loading" && (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center">
            <p className="text-ui font-semibold text-rose-800">
              {t("Usage could not be loaded.", "Spotrebu sa nepodarilo načítať.", "A használatot nem sikerült betölteni.")}
            </p>
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              className="mt-3 rounded-xl bg-white px-4 py-2 text-ui font-bold text-slate-700 shadow-sm transition duration-150 ease-out hover:-translate-y-px hover:shadow active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-reduce:transform-none"
            >
              {t("Try again", "Skúsiť znova", "Újra")}
            </button>
          </div>
        )}

        {status === "ready" && rows.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center">
            <p className="text-ui font-bold text-slate-600">
              {t("No AI usage this month", "Tento mesiac žiadna spotreba AI", "Ebben a hónapban nincs AI-használat")}
            </p>
            <p className="mt-1 max-w-2xl text-micro text-slate-400">
              {t(
                "Summaries, the assistant, rehearsals, workflows and voice calls show up here after they run.",
                "Súhrny, asistent, skúšky, workflowy a hlasové hovory sa tu objavia po tom, ako prebehnú.",
                "Az összefoglalók, az asszisztens, a próbák, a munkafolyamatok és a hanghívások a lefutásuk után jelennek meg.",
              )}
            </p>
          </div>
        )}

        {status === "ready" && rows.length > 0 && (
          <ScrollFade axis="x" className="rounded-2xl border border-slate-200">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  {[
                    t("Feature", "Funkcia", "Funkció"),
                    t("Model", "Model", "Modell"),
                    t("Calls", "Volania", "Hívások"),
                    t("Input tokens", "Vstupné tokeny", "Bemeneti tokenek"),
                    t("Output tokens", "Výstupné tokeny", "Kimeneti tokenek"),
                    t("Audio", "Audio", "Hang"),
                    t("Price", "Cena", "Ár"),
                  ].map((heading, i) => (
                    <th
                      key={heading}
                      scope="col"
                      className={`type-overline px-3 py-2.5 text-slate-500 ${i >= 2 ? "text-right" : ""}`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priced.map(({ row, price }, index) => {
                  const input = row.inputTokens + row.cachedInputTokens;
                  const audio = row.audioSeconds > 0
                    ? `${(row.audioSeconds / 60).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${t("min", "min", "perc")}`
                    : row.inputAudioTokens + row.outputAudioTokens > 0
                      ? `${formatTokens(row.inputAudioTokens)} / ${formatTokens(row.outputAudioTokens)}`
                      : "—";
                  return (
                    <tr
                      key={`${row.feature}-${row.model}`}
                      className={`border-b border-slate-100 last:border-0 ${reduceMotion ? "" : "animate-fade-in"}`}
                      style={reduceMotion ? undefined : { animationDelay: `${index * 40}ms` }}
                    >
                      <td className="px-3 py-3 text-ui font-semibold text-slate-800">{aiFeatureLabel(row.feature, lang)}</td>
                      <td className="px-3 py-3 text-ui text-slate-600">{aiModelLabel(row.model)}</td>
                      <td className="px-3 py-3 text-right font-mono text-ui tabular-nums text-slate-600">{formatTokens(row.calls)}</td>
                      <td className="px-3 py-3 text-right font-mono text-ui tabular-nums text-slate-700">
                        {input > 0 ? formatTokens(input) : "—"}
                        {row.cachedInputTokens > 0 && (
                          <span className="mt-0.5 block text-micro font-sans text-slate-400">
                            {formatTokens(row.cachedInputTokens)} {t("cached", "z cache", "gyorsítótár")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-ui tabular-nums text-slate-700">
                        {row.outputTokens > 0 ? formatTokens(row.outputTokens) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-ui tabular-nums text-slate-600">{audio}</td>
                      <td className="px-3 py-3 text-right font-mono text-ui font-bold tabular-nums text-slate-900">
                        {price === null ? "—" : formatUsd(price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/80">
                  <th scope="row" className="px-3 py-3 text-left text-ui font-bold text-slate-900">
                    {t("Total", "Spolu", "Összesen")}
                  </th>
                  <td />
                  <td className="px-3 py-3 text-right font-mono text-ui font-bold tabular-nums text-slate-800">{formatTokens(totalCalls)}</td>
                  <td className="px-3 py-3 text-right font-mono text-ui font-bold tabular-nums text-slate-800">
                    {formatTokens(rows.reduce((sum, row) => sum + row.inputTokens + row.cachedInputTokens, 0))}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-ui font-bold tabular-nums text-slate-800">
                    {formatTokens(rows.reduce((sum, row) => sum + row.outputTokens, 0))}
                  </td>
                  <td />
                  <td className="px-3 py-3 text-right font-mono text-ui font-bold tabular-nums text-slate-900">{formatUsd(total)}</td>
                </tr>
              </tfoot>
            </table>
          </ScrollFade>
        )}

        {status === "ready" && (
          <p className="text-micro text-slate-400">
            {t(
              "Prices are the providers’ standard list rates for that month. Cached input is priced at the cache-read rate. A model with no rate here is shown, and left out of the total.",
              "Ceny sú štandardné cenníkové sadzby poskytovateľov pre daný mesiac. Vstup z cache je za sadzbu čítania cache. Model bez sadzby sa zobrazí a do súčtu sa nezaráta.",
              "Az árak a szolgáltatók adott havi standard listaárai. A gyorsítótárazott bemenet a cache-olvasás árán szerepel. Az ár nélküli modell megjelenik, és kimarad az összegből.",
            )}
            {unpriced
              ? " " + t(
                "One or more models this month have no list price.",
                "Jeden alebo viac modelov tento mesiac nemá cenníkovú cenu.",
                "Ebben a hónapban egy vagy több modellnek nincs listaára.",
              )
              : ""}
          </p>
        )}
      </div>
    </SectionCard>
  );
};
