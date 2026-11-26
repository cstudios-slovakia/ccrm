import type { ReactNode } from "react";
import { Briefcase, Calculator, Layers } from "lucide-react";
import { liftAccent } from "../../../utils/accentColor";
import type { Language } from "../../../utils/translations";
import type { InvoicingData, InvoicingGroup, InvoicingStatusRow } from "./types";
import { countNoun, makeT, money, percent, statusesOf } from "./format";
import { Card, ROW_EQUAL_3, Section, SegmentedBar } from "./shared";
import { InfoTrigger } from "./MetricBreakdownDrawer";

const TILE = "grid size-10 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600 [&>svg]:size-5";
const ROW_GROUP =
  "grid min-h-11 grid-cols-[--spacing(4)_--spacing(2.5)_minmax(0,1fr)_auto_auto_--spacing(25)] items-center gap-x-2 py-2 border-t border-gray-100 text-ui";
const ROW_SUM =
  "grid h-11 grid-cols-[--spacing(4)_minmax(0,1fr)_auto_--spacing(25)] items-center gap-x-2.5 border-t border-gray-100 text-ui";
const PILL = "type-label rounded-full bg-gray-100 px-2 py-px tabular-nums";
const FOOT = "mt-auto flex items-baseline justify-between gap-3 border-t border-gray-200 pt-4";

const CardHead = ({
  icon,
  title,
  caption,
  onInfo,
  infoLabel,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
  onInfo?: () => void;
  infoLabel?: string;
}) => (
  <div className="flex items-center gap-3">
    <div className={TILE}>{icon}</div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <h3 className="type-card-title text-gray-900">{title}</h3>
        {onInfo && <InfoTrigger onClick={onInfo} label={infoLabel ?? title} />}
      </div>
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
  onInspectRow,
  onInspectGroup,
}: {
  group: InvoicingGroup;
  icon: ReactNode;
  title: string;
  noun: "lead" | "project";
  language: Language;
  currencyCode?: string | null;
  onToggleStatus: (id: string) => void;
  onInspectRow?: (row: InvoicingStatusRow) => void;
  onInspectGroup?: () => void;
}) => {
  const t = makeT(language);
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
        onInfo={onInspectGroup}
        infoLabel={t(`What is included in ${title}`, `Čo je započítané v ${title}`, `Mi tartozik ide: ${title}`)}
      />
      <div className="flex flex-col">
        {group.rows.map((row) => (
          <label key={row.id} data-status-key={row.id} className={`${ROW_GROUP} cursor-pointer`}>
            <input
              type="checkbox"
              checked={row.included}
              onChange={() => onToggleStatus(row.id)}
              className="m-0 size-4 cursor-pointer accent-entity-solid"
            />
            <span className="size-2.5 rounded-full" style={{ background: liftAccent(row.color) }} />
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
            {onInspectRow ? (
              <InfoTrigger
                onClick={() => onInspectRow(row)}
                label={t(`Show items in ${row.label}`, `Zobraziť položky v ${row.label}`, `Tételek megjelenítése: ${row.label}`)}
              />
            ) : (
              <span />
            )}
            <span className={`${PILL} ${row.included ? "text-gray-600" : "text-gray-500"}`}>{row.count}</span>
            <span
              title={primaryValueHint}
              className={`text-right font-bold tabular-nums ${row.included ? "text-gray-900" : "text-gray-500"}`}
            >
              {money(row.value, currencyCode, language, 2)}
            </span>
          </label>
        ))}
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
  onInspectRow,
  onInspectGroup,
}: {
  data: InvoicingData;
  language: Language;
  currencyCode?: string | null;
  onToggleStatus: (id: string) => void;
  onClearSelection: () => void;
  onInspectRow?: (row: InvoicingStatusRow) => void;
  onInspectGroup?: (group: "pipeline" | "projects" | "total") => void;
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
          onInspectRow={onInspectRow}
          onInspectGroup={onInspectGroup ? () => onInspectGroup("pipeline") : undefined}
        />
        <GroupCard
          group={data.projects}
          icon={<Briefcase aria-hidden="true" />}
          title={t("Projects and Deliveries", "Projekty a Realizácie", "Projektek és Megvalósítások")}
          noun="project"
          language={language}
          currencyCode={currencyCode}
          onToggleStatus={onToggleStatus}
          onInspectRow={onInspectRow}
          onInspectGroup={onInspectGroup ? () => onInspectGroup("projects") : undefined}
        />
        <Card className="gap-4">
          <CardHead
            icon={<Calculator aria-hidden="true" />}
            title={t("Total to invoice", "Spolu na fakturovanie", "Összes számlázandó")}
            caption={`${countNoun("item", data.itemCount, language)} · ${t("leads and projects", "leady a projekty", "leadek és projektek")}`}
            onInfo={onInspectGroup ? () => onInspectGroup("total") : undefined}
            infoLabel={t("What is included in Total to invoice", "Čo je započítané v Spolu na fakturovanie", "Mi tartozik az Összes számlázandó összegbe")}
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
