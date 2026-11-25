import { useState, type ReactNode } from "react";
import { Briefcase, Calculator, ChevronDown, ChevronRight, ExternalLink, Layers } from "lucide-react";
import { liftAccent } from "../../../utils/accentColor";
import type { Language } from "../../../utils/translations";
import type { InvoicingData, InvoicingGroup } from "./types";
import { countNoun, makeT, money, percent, statusesOf } from "./format";
import { Card, ROW_EQUAL_3, Section, SegmentedBar } from "./shared";

const TILE = "grid size-10 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600 [&>svg]:size-5";
const ROW_GROUP =
  "grid min-h-11 grid-cols-[--spacing(4)_--spacing(2.5)_minmax(0,1fr)_auto_--spacing(25)] items-center gap-x-2.5 py-2 border-t border-gray-100 text-ui";
const ROW_SUM =
  "grid h-11 grid-cols-[--spacing(4)_minmax(0,1fr)_auto_--spacing(25)] items-center gap-x-2.5 border-t border-gray-100 text-ui";
const PILL = "type-label rounded-full bg-gray-100 px-2 py-px tabular-nums";
const FOOT = "mt-auto flex items-baseline justify-between gap-3 border-t border-gray-200 pt-4";

const CardHead = ({ icon, title, caption }: { icon: ReactNode; title: string; caption: string }) => (
  <div className="flex items-center gap-3">
    <div className={TILE}>{icon}</div>
    <div className="min-w-0">
      <h3 className="type-card-title text-gray-900">{title}</h3>
      <p className="type-meta mt-0.5 text-gray-500">{caption}</p>
    </div>
  </div>
);

const GroupCard = ({
  group,
  icon,
  title,
  noun,
  language,
  currencyCode,
  onToggleStatus,
}: {
  group: InvoicingGroup;
  icon: ReactNode;
  title: string;
  noun: "lead" | "project";
  language: Language;
  currencyCode?: string | null;
  onToggleStatus: (id: string) => void;
}) => {
  const t = makeT(language);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const includedOpenTotal = group.rows.reduce((sum, r) => (r.included ? sum + (r.invoicedOpen || 0) : sum), 0);
  const primaryValueHint =
    noun === "project"
      ? t(
          "Not yet invoiced (project value minus issued/planned invoices)",
          "Zatiaľ nevyfakturované (hodnota projektu mínus vystavené/plánované faktúry)",
          "Még nem számlázott (projekt értéke mínusz kiállított/tervezett számlák)",
        )
      : t("Lead pipeline value", "Hodnota leadov v pipeline", "Lead pipeline érték");

  return (
    <Card className="gap-4">
      <CardHead
        icon={icon}
        title={title}
        caption={`${countNoun(noun, group.itemCount, language)} · ${statusesOf(group.includedStatuses, group.totalStatuses, language)}`}
      />
      <div className="flex flex-col">
        {group.rows.map((row) => {
          const isExpanded = expandedRowId === row.id;
          const hasDetails = row.items.length > 0;
          return (
            <div key={row.id} data-status-key={row.id}>
              <div className={ROW_GROUP}>
                <input
                  type="checkbox"
                  checked={row.included}
                  onChange={() => onToggleStatus(row.id)}
                  aria-label={row.label}
                  className="m-0 size-4 cursor-pointer accent-entity-solid"
                />
                <span className="size-2.5 rounded-full" style={{ background: liftAccent(row.color) }} />
                {hasDetails ? (
                  <button
                    type="button"
                    onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-col text-left cursor-pointer group"
                    title={t(
                      "Click to view contributing items",
                      "Kliknutím zobrazíte jednotlivé položky",
                      "Kattintson a tételek megtekintéséhez",
                    )}
                  >
                    <span className={`inline-flex items-center gap-1 truncate font-semibold group-hover:text-entity-text ${row.included ? "text-gray-800" : "text-gray-500"}`}>
                      {isExpanded ? <ChevronDown className="size-3.5 shrink-0 text-gray-400" /> : <ChevronRight className="size-3.5 shrink-0 text-gray-400" />}
                      <span className="truncate">{row.label}</span>
                    </span>
                    {row.invoicedOpen > 0 && (
                      <span
                        data-testid={`invoicing-open-${row.id}`}
                        className="pl-4.5 text-micro font-medium text-blue-600 tabular-nums"
                      >
                        {t("Unpaid invoiced", "Neuhradené faktúry", "Kifizetetlen számlák")}: {money(row.invoicedOpen, currencyCode, language, 2)}
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-col">
                    <span className={`truncate font-semibold ${row.included ? "text-gray-800" : "text-gray-500"}`}>{row.label}</span>
                    {row.invoicedOpen > 0 && (
                      <span
                        data-testid={`invoicing-open-${row.id}`}
                        className="text-micro font-medium text-blue-600 tabular-nums"
                      >
                        {t("Unpaid invoiced", "Neuhradené faktúry", "Kifizetetlen számlák")}: {money(row.invoicedOpen, currencyCode, language, 2)}
                      </span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!hasDetails}
                  onClick={() => hasDetails && setExpandedRowId(isExpanded ? null : row.id)}
                  className={`${PILL} ${row.included ? "text-gray-600" : "text-gray-500"} ${hasDetails ? "cursor-pointer hover:bg-gray-200" : ""}`}
                >
                  {row.count}
                </button>
                <span
                  title={primaryValueHint}
                  className={`text-right font-bold tabular-nums ${row.included ? "text-gray-900" : "text-gray-500"}`}
                >
                  {money(row.value, currencyCode, language, 2)}
                </span>
              </div>
              {isExpanded && hasDetails && (
                <div
                  data-testid={`invoicing-drilldown-${row.id}`}
                  className="mb-2 ml-6 max-h-60 overflow-y-auto rounded-lg border border-gray-200/80 bg-gray-50/90 divide-y divide-gray-200/60"
                >
                  {row.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-caption">
                      <div className="min-w-0 flex-1">
                        {item.url ? (
                          <a
                            href={item.url}
                            className="inline-flex max-w-full items-center gap-1 font-medium text-gray-800 hover:text-entity-text hover:underline"
                          >
                            <span className="truncate">{item.name}</span>
                            <ExternalLink className="size-3 shrink-0 opacity-60" />
                          </a>
                        ) : (
                          <span className="block truncate font-medium text-gray-800">{item.name}</span>
                        )}
                        {item.clientName && item.clientName !== item.name && (
                          <span className="block truncate text-micro text-gray-500">{item.clientName}</span>
                        )}
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <div className="font-semibold text-gray-900">{money(item.invoicable, currencyCode, language, 2)}</div>
                        {item.invoicedOpen > 0 && (
                          <div className="text-micro text-blue-600">
                            {t("Unpaid", "Neuhradené", "Fizetetlen")}: {money(item.invoicedOpen, currencyCode, language, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={FOOT}>
        <div className="flex flex-col">
          <span className="text-ui font-semibold text-gray-600">{t("Total", "Spolu", "Összesen")}</span>
          {includedOpenTotal > 0 && (
            <span className="text-micro font-medium text-blue-600 tabular-nums">
              {t("Invoiced, unpaid", "Vyfakturované, neuhradené", "Számlázva, fizetetlen")}: {money(includedOpenTotal, currencyCode, language, 2)}
            </span>
          )}
        </div>
        <span className="type-metric text-gray-900">{money(group.total, currencyCode, language, 2)}</span>
      </div>
    </Card>
  );
};

export const InvoicingSection = ({
  data,
  language,
  currencyCode,
  onToggleStatus,
  onClearSelection,
}: {
  data: InvoicingData;
  language: Language;
  currencyCode?: string | null;
  onToggleStatus: (id: string) => void;
  onClearSelection: () => void;
}) => {
  const t = makeT(language);
  const segments = [...data.pipeline.rows, ...data.projects.rows]
    .filter((r) => r.included && r.value > 0)
    .map((r) => ({ key: r.id, value: r.value, color: liftAccent(r.color) }));

  return (
    <Section
      rootProps={{ "data-status-equation": true }}
      title={t("To invoice", "Na fakturovanie", "Számlázandó")}
      action={
        <button
          type="button"
          onClick={onClearSelection}
          className="text-ui h-8 rounded-md px-2.5 font-semibold text-gray-600 transition-colors hover:bg-gray-100"
        >
          {t("Clear status selection", "Zrušiť výber stavov", "Státuszválasztás törlése")}
        </button>
      }
    >
      <div className={ROW_EQUAL_3}>
        <GroupCard
          group={data.pipeline}
          icon={<Layers aria-hidden="true" />}
          title={t("Deals and Pipeline", "Obchody a Pipeline", "Üzletek és Pipeline")}
          noun="lead"
          language={language}
          currencyCode={currencyCode}
          onToggleStatus={onToggleStatus}
        />
        <GroupCard
          group={data.projects}
          icon={<Briefcase aria-hidden="true" />}
          title={t("Projects and Deliveries", "Projekty a Realizácie", "Projektek és Megvalósítások")}
          noun="project"
          language={language}
          currencyCode={currencyCode}
          onToggleStatus={onToggleStatus}
        />
        <Card className="gap-4">
          <CardHead
            icon={<Calculator aria-hidden="true" />}
            title={t("Total to invoice", "Spolu na fakturovanie", "Összes számlázandó")}
            caption={`${countNoun("item", data.itemCount, language)} · ${t("leads and projects", "leady a projekty", "leadek és projektek")}`}
          />
          <SegmentedBar
            segments={segments}
            heightClass="h-3"
            label={t(
              "Share of each status in the total amount",
              "Podiel jednotlivých stavov na celkovej sume",
              "Az egyes státuszok részesedése az összegből",
            )}
          />
          <div className="flex flex-col">
            <div className={ROW_SUM}>
              <span />
              <span className="truncate font-semibold text-gray-800">
                {t("Deals and Pipeline", "Obchody a Pipeline", "Üzletek és Pipeline")}
              </span>
              <span className={`${PILL} text-gray-600`}>{percent(data.pipelineSharePct, language, 0)}</span>
              <span className="text-right font-bold tabular-nums text-gray-900">
                {money(data.pipeline.total, currencyCode, language, 2)}
              </span>
            </div>
            <div className={ROW_SUM}>
              <span className="type-card-title text-center text-gray-500">+</span>
              <span className="truncate font-semibold text-gray-800">
                {t("Projects and Deliveries", "Projekty a Realizácie", "Projektek és Megvalósítások")}
              </span>
              <span className={`${PILL} text-gray-600`}>{percent(data.projectsSharePct, language, 0)}</span>
              <span className="text-right font-bold tabular-nums text-gray-900">
                {money(data.projects.total, currencyCode, language, 2)}
              </span>
            </div>
          </div>
          <div className={FOOT}>
            <span className="text-ui font-semibold text-gray-600">= {t("Total", "Spolu", "Összesen")}</span>
            <span className="type-metric text-gray-900">{money(data.total, currencyCode, language, 2)}</span>
          </div>
        </Card>
      </div>
    </Section>
  );
};
