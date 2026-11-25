import { useState } from "react";
import type { Language } from "../../../utils/translations";
import type { InvoicingStatusRow, PerformanceOverviewData } from "./types";
import { makeT } from "./format";
import {
  buildDashboardBreakdown,
  buildInvoicingRowBreakdown,
  type DashboardBreakdownContext,
  type DashboardMetricKey,
} from "../../../utils/performance/breakdowns";
import { MetricBreakdownDrawer, type MetricBreakdownPayload } from "./MetricBreakdownDrawer";
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

export type PerformanceBreakdownSource = Omit<DashboardBreakdownContext, "data" | "language" | "currencyCode" | "today">;

export interface PerformanceOverviewProps {
  data: PerformanceOverviewData;
  language: Language;
  currencyCode?: string | null;
  /** false hides the whole Financie section and the Ziskovosť projektov card. */
  canSeeFinancials: boolean;
  now: Date;
  onToggleStatus: (id: string) => void;
  onClearSelection: () => void;
  /** Raw collections powering the on-click slideout breakdowns for every metric. */
  breakdownSource?: PerformanceBreakdownSource;
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
  breakdownSource,
}: PerformanceOverviewProps) => {
  const t = makeT(language);
  const { labels } = data;
  const [breakdown, setBreakdown] = useState<MetricBreakdownPayload | null>(null);

  const inspect = (key: DashboardMetricKey) => {
    const ctx: DashboardBreakdownContext = {
      data,
      language,
      currencyCode,
      today: now,
      leads: breakdownSource?.leads ?? [],
      leadStageGroups: breakdownSource?.leadStageGroups ?? {},
      leadStateParents: breakdownSource?.leadStateParents ?? {},
      invoicesOffers: breakdownSource?.invoicesOffers ?? [],
      invoiceStatuses: breakdownSource?.invoiceStatuses ?? [],
      offerStatuses: breakdownSource?.offerStatuses ?? [],
      financialRecords: breakdownSource?.financialRecords ?? [],
      projects: breakdownSource?.projects ?? [],
      tasks: breakdownSource?.tasks ?? [],
      tickets: breakdownSource?.tickets ?? [],
      ticketStatuses: breakdownSource?.ticketStatuses ?? [],
    };
    setBreakdown(buildDashboardBreakdown(key, ctx));
  };

  const inspectInvoicingRow = (row: InvoicingStatusRow) =>
    setBreakdown(buildInvoicingRowBreakdown(row, language, currencyCode));

  return (
    <div className="flex flex-col gap-7">
      <KpiStrip
        data={data.kpis}
        labels={labels}
        language={language}
        currencyCode={currencyCode}
        onInspect={(k) => inspect(k)}
      />

      <InvoicingSection
        data={data.invoicing}
        language={language}
        currencyCode={currencyCode}
        onToggleStatus={onToggleStatus}
        onClearSelection={onClearSelection}
        onInspectRow={inspectInvoicingRow}
        onInspectGroup={(g) => inspect(`invoicing:${g}`)}
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
              onInspect={(k) => inspect(k)}
            />
            <RecurringIncomeCard
              data={data.recurringIncome}
              labels={labels}
              language={language}
              currencyCode={currencyCode}
              onInfo={() => inspect("finance:recurring")}
            />
            <DsoCard
              data={data.dso}
              labels={labels}
              language={language}
              onInfo={() => inspect("finance:dso")}
            />
          </div>
        </Section>
      )}

      <Section title={t("Projects", "Projekty", "Projektek")}>
        {canSeeFinancials ? (
          <div className={ROW_2_1}>
            <ProfitabilityCard
              data={data.profitability}
              language={language}
              currencyCode={currencyCode}
              onInfo={() => inspect("projects:profitability")}
            />
            <DeadlinesCard data={data.deadlines} language={language} onInfo={() => inspect("projects:deadlines")} />
          </div>
        ) : (
          <DeadlinesCard data={data.deadlines} language={language} onInfo={() => inspect("projects:deadlines")} />
        )}
        <div className={ROW_EQUAL_3}>
          <ScopeCreepCard data={data.scopeCreep} language={language} onInfo={() => inspect("projects:scopeCreep")} />
          <DeploymentsCard
            data={data.deployments}
            state={data.deploymentsState}
            language={language}
            now={now}
            onInfo={() => inspect("projects:deployments")}
          />
          <ThroughputCard
            data={data.throughput}
            labels={labels}
            language={language}
            onInfo={() => inspect("projects:throughput")}
          />
        </div>
      </Section>

      <Section title={t("Team and tasks", "Tím a úlohy", "Csapat és feladatok")}>
        <div className={ROW_3_2}>
          <UtilizationCard
            data={data.utilization}
            state={data.utilizationState}
            truncated={data.utilizationTruncated}
            language={language}
            onInfo={() => inspect("team:utilization")}
          />
          <AssignedTasksCard
            data={data.assignedTasks}
            language={language}
            onInfo={() => inspect("team:assignedTasks")}
          />
        </div>
        <div className={ROW_3_2}>
          <ReworkRatioCard data={data.reworkRatio} language={language} onInfo={() => inspect("team:reworkRatio")} />
          <ReworkCountCard data={data.reworkCount} language={language} onInfo={() => inspect("team:reworkCount")} />
        </div>
      </Section>

      <Section title={t("Support", "Podpora", "Támogatás")}>
        <div className={ROW_3_2}>
          <TicketsCard data={data.ticketsByStatus} language={language} onInfo={() => inspect("support:tickets")} />
          <ResponseTimeCard
            data={data.responseTime}
            labels={labels}
            language={language}
            onInfo={() => inspect("support:responseTime")}
          />
        </div>
      </Section>

      <MetricBreakdownDrawer
        payload={breakdown}
        onClose={() => setBreakdown(null)}
        language={language}
      />
    </div>
  );
};
