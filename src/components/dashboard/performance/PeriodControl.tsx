import { Calendar } from "lucide-react";
import type { Language } from "../../../utils/translations";
import type { PeriodPreset } from "./types";
import { makeT } from "./format";
import { SegmentedSwitch } from "./shared";

type QuickPreset = "week" | "month" | "quarter" | "year";
const QUICK: QuickPreset[] = ["week", "month", "quarter", "year"];

/** Segmented Týždeň / Mesiac / Kvartál / Rok and the date-range button. Renders no popup. */
export const PeriodControl = ({
  preset,
  onPreset,
  rangeLabel,
  onOpenPicker,
  pickerOpen,
  language,
}: {
  preset: PeriodPreset;
  onPreset: (p: QuickPreset) => void;
  rangeLabel: string;
  onOpenPicker: () => void;
  pickerOpen: boolean;
  language: Language;
}) => {
  const t = makeT(language);
  const names: Record<QuickPreset, string> = {
    week: t("Week", "Týždeň", "Hét"),
    month: t("Month", "Mesiac", "Hónap"),
    quarter: t("Quarter", "Kvartál", "Negyedév"),
    year: t("Year", "Rok", "Év"),
  };
  const active = QUICK.find((p) => p === preset) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <SegmentedSwitch
        ariaLabel={t("Period", "Obdobie", "Időszak")}
        activeId={active}
        onSelect={(id) => {
          const picked = QUICK.find((p) => p === id);
          if (picked) onPreset(picked);
        }}
        items={QUICK.map((p) => ({ id: p, label: names[p] }))}
      />
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        onClick={onOpenPicker}
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-ui font-semibold text-gray-800 transition-colors hover:bg-gray-50"
      >
        <Calendar aria-hidden="true" className="size-4 text-gray-500" />
        <span>{rangeLabel}</span>
      </button>
    </div>
  );
};
