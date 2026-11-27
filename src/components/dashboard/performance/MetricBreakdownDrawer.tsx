import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Info, X } from "lucide-react";
import type { Language } from "../../../utils/translations";
import { makeT } from "./format";

export interface MetricBreakdownItem {
  id: string;
  title: string;
  subtitle?: string;
  value: string;
  secondaryValue?: string;
  badge?: string;
  badgeTone?: "good" | "bad" | "warn" | "info" | "neutral";
  href?: string;
}

export interface MetricBreakdownPayload {
  title: string;
  subtitle?: string;
  formula?: string;
  totalLabel?: string;
  totalValue?: string;
  secondaryTotalLabel?: string;
  secondaryTotalValue?: string;
  items: MetricBreakdownItem[];
  emptyText?: string;
}

const BADGE_CLASS: Record<NonNullable<MetricBreakdownItem["badgeTone"]>, string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  bad: "bg-rose-50 text-rose-700 border-rose-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-gray-100 text-gray-600 border-gray-200",
};

/** Small circled information icon trigger used next to every dashboard metric and status row. */
export const InfoTrigger = ({
  onClick,
  label,
  className = "",
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    }}
    aria-label={label}
    title={label}
    className={`inline-flex size-5.5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-entity-text cursor-pointer ${className}`}
  >
    <Info className="size-3.5" aria-hidden="true" />
  </button>
);

/** Right-hand slideout drawer showing exactly which records and values are counted in a dashboard figure. */
export const MetricBreakdownDrawer = ({
  payload,
  onClose,
  language,
}: {
  payload: MetricBreakdownPayload | null;
  onClose: () => void;
  language: Language;
}) => {
  const t = makeT(language);

  useEffect(() => {
    if (!payload) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [payload, onClose]);

  if (!payload) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={payload.title}
      data-testid="metric-breakdown-drawer"
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px] transition-opacity"
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="type-card-title text-gray-900">{payload.title}</h3>
            {payload.subtitle && <p className="type-meta mt-0.5 text-gray-500">{payload.subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close", "Zavrieť", "Bezárás")}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Formula & summary */}
        <div className="space-y-3 border-b border-gray-100 bg-gray-50/70 px-5 py-3.5">
          {payload.formula && (
            <p className="text-caption leading-relaxed text-gray-600">{payload.formula}</p>
          )}
          {(payload.totalValue !== undefined || payload.secondaryTotalValue !== undefined) && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              {payload.totalValue !== undefined && (
                <div className="flex items-baseline gap-2">
                  <span className="text-caption font-semibold text-gray-500">
                    {payload.totalLabel ?? t("Total", "Spolu", "Összesen")}:
                  </span>
                  <span className="type-card-title font-bold text-gray-900 tabular-nums">
                    {payload.totalValue}
                  </span>
                </div>
              )}
              {payload.secondaryTotalValue !== undefined && (
                <div className="flex items-baseline gap-1.5 text-caption text-blue-700 tabular-nums">
                  <span className="font-medium">{payload.secondaryTotalLabel}:</span>
                  <span className="font-bold">{payload.secondaryTotalValue}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Itemized list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="mb-2 flex items-center justify-between text-micro font-semibold uppercase tracking-wide text-gray-400">
            <span>{t("Included items", "Započítané položky", "Beleszámított tételek")}</span>
            <span className="tabular-nums">{payload.items.length}</span>
          </div>
          {payload.items.length === 0 ? (
            <p className="py-8 text-center text-caption text-gray-500">
              {payload.emptyText ?? t("No matching records in this period.", "Žiadne zodpovedajúce záznamy v tomto období.", "Nincs egyező tétel ebben az időszakban.")}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {payload.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2.5 text-ui">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.href ? (
                        <a
                          href={item.href}
                          onClick={onClose}
                          className="inline-flex max-w-full items-center gap-1 font-semibold text-gray-900 hover:text-entity-text hover:underline"
                        >
                          <span className="truncate">{item.title}</span>
                          <ExternalLink className="size-3 shrink-0 opacity-55" />
                        </a>
                      ) : (
                        <span className="truncate font-semibold text-gray-900">{item.title}</span>
                      )}
                      {item.badge && (
                        <span className={`shrink-0 rounded-full border px-1.5 py-px text-micro font-semibold ${BADGE_CLASS[item.badgeTone ?? "neutral"]}`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="type-meta mt-0.5 truncate text-gray-500">{item.subtitle}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <div className="font-bold text-gray-900">{item.value}</div>
                    {item.secondaryValue && (
                      <div className="text-micro font-medium text-blue-600">{item.secondaryValue}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
};
