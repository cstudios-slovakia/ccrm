/**
 * Small pieces shared by the widgets of the "Výkonnostný prehľad" tab.
 * Presentational only: props in, markup out.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "../../layout/EmptyState";
import { Surface } from "../../layout/Surface";
import type { Language } from "../../../utils/translations";
import { initials, makeT } from "./format";

export type Tone = "good" | "bad" | "warn" | "neutral";

const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-700",
  bad: "text-rose-700",
  warn: "text-amber-700",
  neutral: "text-slate-600",
};

/** Tone of a delta by what the change means: `higherIsBetter` false for days, durations. */
export const deltaTone = (delta: number | null, higherIsBetter = true): Tone => {
  if (delta === null || delta === 0) return "neutral";
  return delta > 0 === higherIsBetter ? "good" : "bad";
};

export const clampPct = (v: number): number => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));

/** `value / max` as a percentage, 0 when max is not positive. */
export const ratioPct = (value: number, max: number): number => (max > 0 ? clampPct((value / max) * 100) : 0);

/* ---------------------------------------------------------------- text */

/** Bold coloured figure inside a caption line ("+12 %"). */
export const Figure = ({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`font-bold ${TONE_TEXT[tone]}`}>{children}</span>
);

/** Parts of a caption line joined with " · "; empty parts and their separators vanish. */
export const DotJoin = ({ parts }: { parts: (ReactNode | null | undefined | false | "")[] }) => {
  const kept = parts.filter((p): p is ReactNode => p !== null && p !== undefined && p !== false && p !== "");
  return (
    <>
      {kept.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          {p}
        </Fragment>
      ))}
    </>
  );
};

/** `<delta> oproti októbru`: the figure and the comparison phrase; nothing when there is no delta. */
export const DeltaPhrase = ({ text, tone, phrase }: { text: string | null; tone: Tone; phrase: string }) =>
  text === null ? null : (
    <>
      <Figure tone={tone}>{text}</Figure>
      {phrase ? ` ${phrase}` : ""}
    </>
  );

export const Overline = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`type-overline text-slate-500 ${className}`}>{children}</div>
);

export const NoRows = ({ language }: { language: Language }) => {
  const t = makeT(language);
  return (
    <p className="type-meta mt-4 text-slate-500">
      {t("No data for the selected period", "Žiadne údaje za zvolené obdobie", "Nincs adat a kiválasztott időszakra")}
    </p>
  );
};

/* ---------------------------------------------------------------- card */

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <Surface className={`flex min-w-0 flex-col ${className}`}>{children}</Surface>
);

export const LegendItem = ({ swatch, label, dot = false }: { swatch: string; label: string; dot?: boolean }) => (
  <span className="type-meta flex items-center gap-1.5 text-slate-600">
    <span className={`size-2.5 ${dot ? "rounded-full" : "rounded-xs"} ${swatch}`} />
    {label}
  </span>
);

/** Card title and caption, with an optional legend on the right. */
export const CardTitle = ({ title, caption, legend }: { title: string; caption: string; legend?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <h3 className="type-card-title text-slate-900">{title}</h3>
      <p className="type-meta mt-0.5 text-slate-500">{caption}</p>
    </div>
    {legend && <div className="flex flex-wrap items-center gap-3.5">{legend}</div>}
  </div>
);

/** The big figure with its unit ("27 dní" + "v priemere"). */
export const HeadlineValue = ({ value, unit }: { value: ReactNode; unit?: ReactNode }) => (
  <div className="mt-4 flex items-baseline gap-1.5">
    <span className="type-metric text-slate-900">{value}</span>
    {unit && <span className="text-ui text-slate-500">{unit}</span>}
  </div>
);

export const SubLine = ({ children }: { children: ReactNode }) => (
  <div className="type-meta mt-1 text-slate-500">{children}</div>
);

/** Phase 2 widget without stored data: the card frame with title, caption and an empty state. */
export const PendingCard = ({
  title,
  caption,
  body,
  language,
  className = "",
  icon,
}: {
  title: string;
  caption: string;
  body: string;
  language: Language;
  className?: string;
  icon?: ReactNode;
}) => {
  const t = makeT(language);
  return (
    <Card className={className}>
      <CardTitle title={title} caption={caption} />
      <EmptyState
        className="my-auto"
        icon={icon ?? <BarChart3 aria-hidden="true" />}
        title={t("No data yet", "Zatiaľ bez údajov", "Még nincs adat")}
        body={body}
      />
    </Card>
  );
};

/* ---------------------------------------------------------------- bars */

/** A rounded track with a fill (percent of the track) and an optional tick (percent position). */
export const Track = ({
  pct,
  fillClass,
  tickPct,
  className = "",
}: {
  pct: number;
  fillClass: string;
  tickPct?: number | null;
  className?: string;
}) => (
  <div className={`relative h-2 rounded-full bg-slate-100 ${className}`}>
    <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${clampPct(pct)}%` }} />
    {tickPct !== null && tickPct !== undefined && (
      <div className="absolute -top-1 h-4 w-0.5 bg-slate-600" style={{ left: `${clampPct(tickPct)}%` }} />
    )}
  </div>
);

/** The tick of a legend ("Splatnosť 30 dní", "100 % = ..."). */
export const TickLegend = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`type-meta flex items-center gap-1.5 text-slate-600 ${className}`}>
    <span className="h-3.5 w-0.5 bg-slate-600" />
    {children}
  </div>
);

export interface BarSegment {
  key: string;
  value: number;
  /** Tailwind background class. */
  className?: string;
  /** Colour that comes from the database. */
  color?: string;
}

/**
 * Segments side by side with a 2 px gap, round only at the two ends.
 * Without `scaleMax` the values are flex ratios; with it each segment is `value / scaleMax` of the width.
 */
export const SegmentedBar = ({
  segments,
  scaleMax,
  heightClass = "h-2",
  label,
  className = "",
}: {
  segments: BarSegment[];
  scaleMax?: number;
  heightClass?: string;
  label?: string;
  className?: string;
}) => {
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div
      className={`flex gap-0.5 ${heightClass} ${className}`}
      {...(label ? { role: "img", "aria-label": label } : {})}
    >
      {shown.map((s, i) => {
        const edge =
          shown.length === 1
            ? "rounded-full"
            : i === 0
              ? "rounded-l-full rounded-r-xs"
              : i === shown.length - 1
                ? "rounded-r-full rounded-l-xs"
                : "rounded-xs";
        const style =
          scaleMax !== undefined
            ? { width: `${ratioPct(s.value, scaleMax)}%`, background: s.color }
            : { flex: s.value, background: s.color };
        return <div key={s.key} className={`${edge} ${s.className ?? ""}`} style={style} />;
      })}
    </div>
  );
};

/* -------------------------------------------------------------- people */

export const Avatar = ({ name }: { name: string }) => (
  <span
    aria-hidden="true"
    className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-micro font-bold text-slate-600"
  >
    {initials(name)}
  </span>
);

/* ------------------------------------------------------------- switch */

/** Segmented switch (period, DSO order). `activeId` null leaves every segment inactive. */
export const SegmentedSwitch = ({
  ariaLabel,
  items,
  activeId,
  onSelect,
  fill = false,
}: {
  ariaLabel: string;
  items: { id: string; label: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Segments share the width and are lower (inside a card). */
  fill?: boolean;
}) => (
  <div role="group" aria-label={ariaLabel} className="flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        aria-pressed={item.id === activeId}
        onClick={() => onSelect(item.id)}
        className={`text-ui rounded-xl font-semibold transition-colors ${fill ? "h-8 flex-1" : "h-9 px-3"} ${
          item.id === activeId ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        {item.label}
      </button>
    ))}
  </div>
);

/* ------------------------------------------------------------- layout */

export const Section = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-3">
      <h2 className="type-overline text-slate-600">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

/** Row of cards: one column on a phone, the canvas proportions from `ws-lg`. */
export const ROW_2_1 = "grid grid-cols-1 gap-6 ws-lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]";
export const ROW_3_2 = "grid grid-cols-1 gap-6 ws-lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]";
export const ROW_EQUAL_3 = "grid grid-cols-1 gap-6 ws-md:grid-cols-2 ws-lg:grid-cols-3";
export const ROW_2_1_1 = "grid grid-cols-1 gap-6 ws-md:grid-cols-2 ws-lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]";
