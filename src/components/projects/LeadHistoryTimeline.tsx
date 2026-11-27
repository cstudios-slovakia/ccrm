import { History } from "lucide-react";
import type { Language } from "../../utils/translations";
import { formatTimestampLocalized } from "../../utils/localTime";
import { leadEventText, type LeadHistoryItem } from "../../utils/leadHistoryTimeline";

const tr = (language: Language, en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);

const TYPE_LABELS: Record<string, [string, string, string]> = {
  phone: ["Call", "Telefonát", "Hívás"],
  email: ["E-mail", "E-mail", "E-mail"],
  offer: ["Offer", "Ponuka", "Ajánlat"],
  appointment: ["Meeting", "Stretnutie", "Találkozó"],
  status_change: ["Status", "Stav", "Állapot"],
  whatsapp: ["WhatsApp", "WhatsApp", "WhatsApp"],
  note: ["Note", "Poznámka", "Jegyzet"],
  note_activity: ["Note", "Poznámka", "Jegyzet"],
  order: ["Order", "Objednávka", "Rendelés"],
  invoice: ["Invoice", "Faktúra", "Számla"],
  proforma_invoice: ["Proforma", "Zálohová faktúra", "Előlegszámla"],
  advance_receipt: ["Advance receipt", "Doklad k záloze", "Előlegbizonylat"],
  delivery_note: ["Delivery note", "Dodací list", "Szállítólevél"],
};

/** One entry of the paired lead's history on the project timeline: read-only, marked "Lead". */
export const LeadHistoryTimelineItem = ({ item, leadName, language }: { item: LeadHistoryItem; leadName?: string; language: Language }) => {
  const e = item.leadEvent;
  const label = TYPE_LABELS[e.type];
  const text = leadEventText(e.content);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-sky-200 bg-sky-50/40 px-3.5 py-2.5 text-left animate-fade-in">
      <History className="mt-0.5 h-4 w-4 shrink-0 text-sky-600/70" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-md border border-sky-200 bg-white px-1.5 py-0.5 type-overline text-sky-700" title={leadName}>
              {tr(language, "Lead", "Lead", "Lead")}
            </span>
            {label && <span className="shrink-0 text-micro font-semibold text-sky-700/80">{tr(language, ...label)}</span>}
            <span className="truncate text-ui font-semibold text-gray-800">{e.title}</span>
          </div>
          <span className="text-micro font-medium text-slate-400">
            {e.author ? `${e.author} · ` : ""}
            {formatTimestampLocalized(e.timestamp, language)}
          </span>
        </div>
        {text && <p className="mt-0.5 line-clamp-2 text-caption font-medium text-gray-500 whitespace-pre-line">{text}</p>}
      </div>
    </div>
  );
};

/** Shows or hides the paired lead's history on the project timeline. */
export const LeadHistoryToggle = ({ count, shown, onChange, language }: { count: number; shown: boolean; onChange: (next: boolean) => void; language: Language }) => (
  <label className="flex cursor-pointer select-none items-center justify-end gap-2 text-caption font-semibold text-gray-500">
    <input type="checkbox" checked={shown} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
    {tr(language, `Show lead history (${count})`, `Zobraziť históriu leadu (${count})`, `Lead előzményeinek megjelenítése (${count})`)}
  </label>
);
