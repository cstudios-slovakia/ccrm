import type { Language } from "../../../utils/translations";
import { Surface } from "../../layout/Surface";
import type { TicketCategoryKey, TicketsByStatusData } from "./types";
import { count, countNoun, makeT, ofWhichOpen, percent } from "./format";
import { Card, CardTitle, HeadlineValue, SegmentedBar } from "./shared";

const SWATCH: Record<TicketCategoryKey, string> = {
  new: "bg-blue-500",
  open: "bg-indigo-500",
  waiting: "bg-amber-500",
  resolved: "bg-emerald-500",
  closed: "bg-gray-400",
};

export const TicketsCard = ({
  data,
  language,
  className = "",
}: {
  data: TicketsByStatusData;
  language: Language;
  className?: string;
}) => {
  const t = makeT(language);
  const names: Record<TicketCategoryKey, string> = {
    new: t("New", "Nový", "Új"),
    open: t("In progress", "V riešení", "Folyamatban"),
    waiting: t("Waiting on client", "Čaká na klienta", "Ügyfélre vár"),
    resolved: t("Resolved", "Vyriešený", "Megoldva"),
    closed: t("Closed", "Uzavretý", "Lezárva"),
  };
  return (
    <Card className={className}>
      <CardTitle
        title={t("Tickets by status", "Tickety podľa stavu", "Jegyek státusz szerint")}
        caption={t(
          "All tickets received in the period",
          "Všetky tickety prijaté v období",
          "Az időszakban beérkezett összes jegy",
        )}
      />
      <HeadlineValue value={countNoun("ticket", data.total, language)} unit={ofWhichOpen(data.open, language)} />
      <SegmentedBar
        className="mt-4"
        heightClass="h-4"
        label={t("Tickets by status", "Rozdelenie ticketov podľa stavu", "Jegyek eloszlása státusz szerint")}
        segments={data.categories.map((c) => ({ key: c.category, value: c.count, className: SWATCH[c.category] }))}
      />
      <div className="mt-4 flex flex-wrap gap-3">
        {data.categories.map((c) => (
          <Surface key={c.category} tone="inset" className="min-w-0 flex-1 basis-26">
            <div className="type-meta flex items-center gap-1.5 text-gray-600">
              <span className={`size-2.5 rounded-full ${SWATCH[c.category]}`} />
              {names[c.category]}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="type-metric text-gray-900">{count(c.count, language)}</span>
              <span className="type-meta text-gray-600">{percent(c.sharePct, language, 0)}</span>
            </div>
          </Surface>
        ))}
      </div>
    </Card>
  );
};
