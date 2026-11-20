import type { Language } from "../../../utils/translations";
import type { PerformanceOverviewData } from "./types";
import { makeT } from "./format";
import { AssignedTasksCard } from "./AssignedTasksCard";
import { CashflowCard } from "./CashflowCard";
import { DeadlinesCard } from "./DeadlinesCard";
import { DeploymentsCard } from "./DeploymentsCard";
import { DsoCard } from "./DsoCard";
import { InvoicingSection } from "./InvoicingSection";
import { KpiStrip } from "./KpiStrip";
import { ProfitabilityCard } from "./ProfitabilityCard";
import { RecurringIncomeCard } from "./RecurringIncomeCard";
import { ReworkCountCard } from "./ReworkCountCard";
import { ReworkRatioCard } from "./ReworkRatioCard";
import { ResponseTimeCard } from "./ResponseTimeCard";
import { ScopeCreepCard } from "./ScopeCreepCard";
import { ThroughputCard } from "./ThroughputCard";
import { TicketsCard } from "./TicketsCard";
import { UtilizationCard } from "./UtilizationCard";
import { ROW_2_1, ROW_2_1_1, ROW_3_2, ROW_EQUAL_3, Section } from "./shared";

export interface PerformanceOverviewProps {
  data: PerformanceOverviewData;
  language: Language;
  currencyCode?: string | null;
  /** false hides the whole Financie section and the Ziskovosť projektov card. */
  canSeeFinancials: boolean;
  now: Date;
  onToggleStatus: (id: string) => void;
  onClearSelection: () => void;
}

/** The tab body: KPI strip, then the five sections in the order of the design canvas. */
export const PerformanceOverview = ({
  data,
  language,
  currencyCode,
  canSeeFinancials,
  now,
  onToggleStatus,
  onClearSelection,
}: PerformanceOverviewProps) => {
  const t = makeT(language);
  const { labels } = data;
  return (
    <div className="flex flex-col gap-7">
      <KpiStrip data={data.kpis} labels={labels} language={language} currencyCode={currencyCode} />

      <InvoicingSection
        data={data.invoicing}
        language={language}
        currencyCode={currencyCode}
        onToggleStatus={onToggleStatus}
        onClearSelection={onClearSelection}
      />

      {canSeeFinancials && (
        <Section title={t("Finance", "Financie", "Pénzügyek")}>
          <div className={ROW_2_1_1}>
            <CashflowCard
              className="ws-md:col-span-2 ws-lg:col-span-1"
              data={data.cashflow}
              labels={labels}
              language={language}
              currencyCode={currencyCode}
            />
            <RecurringIncomeCard data={data.recurringIncome} labels={labels} language={language} currencyCode={currencyCode} />
            <DsoCard data={data.dso} labels={labels} language={language} />
          </div>
        </Section>
      )}

      <Section title={t("Projects", "Projekty", "Projektek")}>
        {canSeeFinancials ? (
          <div className={ROW_2_1}>
            <ProfitabilityCard data={data.profitability} language={language} currencyCode={currencyCode} />
            <DeadlinesCard data={data.deadlines} language={language} />
          </div>
        ) : (
          <DeadlinesCard data={data.deadlines} language={language} />
        )}
        <div className={ROW_EQUAL_3}>
          <ScopeCreepCard data={data.scopeCreep} language={language} />
          <DeploymentsCard data={data.deployments} state={data.deploymentsState} language={language} now={now} />
          <ThroughputCard data={data.throughput} labels={labels} language={language} />
        </div>
      </Section>

      <Section title={t("Team and tasks", "Tím a úlohy", "Csapat és feladatok")}>
        <div className={ROW_3_2}>
          <UtilizationCard data={data.utilization} state={data.utilizationState} truncated={data.utilizationTruncated} language={language} />
          <AssignedTasksCard data={data.assignedTasks} language={language} />
        </div>
        <div className={ROW_3_2}>
          <ReworkRatioCard data={data.reworkRatio} language={language} />
          <ReworkCountCard data={data.reworkCount} language={language} />
        </div>
      </Section>

      <Section title={t("Support", "Podpora", "Támogatás")}>
        <div className={ROW_3_2}>
          <TicketsCard data={data.ticketsByStatus} language={language} />
          <ResponseTimeCard data={data.responseTime} labels={labels} language={language} />
        </div>
      </Section>
    </div>
  );
};
