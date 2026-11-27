import React, { useState, useMemo, useCallback } from "react";
import { SectionIcon } from "./icons/SectionIcon";
import {
  Award, Compass, TrendingUp, Users, Target, PieChart,
  MapPin, Crown, Medal, Flame, Trophy, Briefcase,
  Layers
} from "lucide-react";
import type { Lead, Project, ProjectType, FinancialRecord, FinancialCategory, InvoiceOffer, ProjectStatus, Task, Employee, Ticket, TicketStatusDef, TicketSettingsConfig, CompanyBillingSettings } from "../types";
import { isPipelineLead, isWonLeadState, leadKpis } from "../utils/dashboardMetrics";
import { type FinanceInput, type Period } from "../utils/marketingRoi";
import { MarketingRoiTab, type AdCampaign } from "./dashboard/MarketingRoiTab";
import { getTranslation } from "../utils/translations";
import { DEFAULT_INVOICE_STATUS_DEFS, DEFAULT_OFFER_STATUS_DEFS, isLiveInvoiceStatus, type OfferStatusDef } from "../utils/offerStatuses";
import { effectiveDocumentAmount } from "../utils/invoiceFinanceBridge";
import type { Language } from "../utils/translations";
import { resolveCurrencySymbol, resolveCurrencyPosition, formatMoney, currencyForRegion } from "../utils/currency";
import { projectBilling, resolveLeadEffectiveValue, resolveProjectValue } from "../utils/projectBilling";
import { formatTimestampLocalized } from "../utils/localTime";
import { isClosedLeadState } from "../utils/leadSla";
import { openProjectStatuses, projectStatusColor, projectStatusLabel } from "../utils/projects";
import { useProjectStatuses } from "../hooks/useProjectStatuses";
import type { StatusStatGroup, StatusStatItem, StatusStatDetailRow } from "./GroupedStatusValueEquationStats";
import { PerformanceOverview } from "./dashboard/performance/PerformanceOverview";
import { PeriodControl } from "./dashboard/performance/PeriodControl";
import { usePerformanceOverview } from "./dashboard/performance/usePerformanceOverview";
import { periodRangeLabel } from "../utils/performance/labels";
import { periodPresetFromName, presetNameOf, presetRange } from "../utils/performance/period";
import { useUserPref } from "../utils/userPrefs";
import { PageHeader, Tabs } from "./layout";
import { PRODUCT_NAME } from "../utils/brand";

interface DashboardProps {
  systemName: string;
  leads: Lead[];
  leadSourceColors?: Record<string, string>;
  leadCategoryColors?: Record<string, string>;
  leadStageGroups?: Record<string, "new" | "in_progress" | "closed">;
  leadStates?: string[];
  leadStateColors?: Record<string, string>;
  systemLanguage: Language;
  leadStateParents?: Record<string, string>;
  campaigns?: AdCampaign[];
  currencyCode?: string | null;
  projects?: Project[];
  projectTypes?: ProjectType[];
  financialRecords?: FinancialRecord[];
  financialCategories?: FinancialCategory[];
  /** Finance runs on the ledger ("connected") or on the hand-filled monthly table. */
  financialMode?: "connected" | "simplified";
  financialSimplifiedTable?: Record<string, string>;
  invoicesOffers?: InvoiceOffer[];
  /** Settings → Invoice statuses: which invoices still count as billed. */
  invoiceStatuses?: OfferStatusDef[];
  /** The rest feed the performance overview tab. */
  tasks?: Task[];
  taskStates?: string[];
  employees?: Employee[];
  tickets?: Ticket[];
  ticketStatuses?: TicketStatusDef[];
  ticketSettings?: TicketSettingsConfig;
  offerStatuses?: OfferStatusDef[];
  /** Hides the Finance section and the project profitability when false. */
  canSeeFinancials?: boolean;
  companyBillingSettings?: CompanyBillingSettings | null;
}

const Sparkline: React.FC<{ points: number[]; color: string }> = ({ points, color }) => {
  if (points.length < 2) return null;
  const width = 120;
  const height = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  
  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(" L ")}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="absolute bottom-1 right-2 w-27.5 h-9 opacity-40 group-hover:opacity-85 transition-opacity duration-300 pointer-events-none select-none z-10">
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${color.replace("#", "")})`} />
        <path d={pathD} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const CalendarPane: React.FC<{
  title: string;
  year: number;
  month: number;
  selectedStart: Date | null;
  selectedEnd: Date | null;
  onSelect: (date: Date) => void;
  systemLanguage: Language;
}> = ({ title, year, month, selectedStart, selectedEnd, onSelect, systemLanguage }) => {
  // Get list of days in the month
  const daysInMonth = useMemo(() => {
    const date = new Date(year, month, 1);
    const days: Date[] = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [year, month]);

  // Determine starting weekday padding (Monday is 1st day of week in user's image)
  const paddingDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay(); // Sunday=0, Monday=1, ...
    // Monday is index 0. If firstDay is 0 (Sunday), we need 6 padding days.
    // If firstDay is 1 (Monday), we need 0 padding days.
    // Padding = (firstDay + 6) % 7
    return (firstDay + 6) % 7;
  }, [year, month]);

  // Generate week annotations dynamically
  const weekNumbers = useMemo(() => {
    // For each of the 5 rows, find the first day of that row to calculate its week number.
    return Array.from({ length: 5 }, (_, weekIdx) => {
      // Find the day index relative to the start of the grid
      const dayOffset = weekIdx * 7 - paddingDays;
      // Get the date for this row's Monday (or first day)
      const targetDate = new Date(year, month, dayOffset + 1);
      
      // Calculate ISO week number
      const tempDate = new Date(targetDate.valueOf());
      const dayNum = (targetDate.getDay() + 6) % 7;
      tempDate.setDate(tempDate.getDate() - dayNum + 3);
      const firstThursday = tempDate.valueOf();
      tempDate.setMonth(0, 1);
      if (tempDate.getDay() !== 4) {
        tempDate.setMonth(0, 1 + ((4 - tempDate.getDay() + 7) % 7));
      }
      const weekNum = 1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000);
      return `W${weekNum}`;
    });
  }, [year, month, paddingDays]);

  const getDayNames = () => {
    if (systemLanguage === "sk") return ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
    if (systemLanguage === "hu") return ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  };

  return (
    <div className="flex-1 flex flex-col space-y-2 select-none">
      <div className="flex justify-between items-center px-1">
        <span className="type-overline font-heading text-gray-800">{title}</span>
      </div>
      
      <div className="grid grid-cols-8 gap-y-1 text-center items-center">
        {/* Week column header */}
        <span className="type-overline text-gray-300">{getTranslation(systemLanguage, "dashboard.picker.week_label")}</span>
        {getDayNames().map(d => (
          <span key={d} className="type-overline text-gray-400">{d}</span>
        ))}

        {/* Calendar Grid */}
        {Array.from({ length: 5 }).map((_, weekIdx) => {
          return (
            <React.Fragment key={weekIdx}>
              {/* Week Number Label */}
              <span className="text-micro font-bold text-gray-400 py-1 bg-gray-50/50 rounded-lg">{weekNumbers[weekIdx]}</span>

              {/* 7 Days of the Week */}
              {Array.from({ length: 7 }).map((_, dayIdx) => {
                const dayOffset = weekIdx * 7 + dayIdx - paddingDays;
                const dayDate = daysInMonth[dayOffset];

                if (!dayDate) {
                  return <span key={dayIdx} className="h-7 w-7" />;
                }

                // Check selection status
                const isStart = selectedStart && dayDate.toDateString() === selectedStart.toDateString();
                const isEnd = selectedEnd && dayDate.toDateString() === selectedEnd.toDateString();
                const inRange = selectedStart && selectedEnd && dayDate > selectedStart && dayDate < selectedEnd;

                const realToday = new Date();
                const isToday = dayDate && (
                  dayDate.getDate() === realToday.getDate() && 
                  dayDate.getMonth() === realToday.getMonth() && 
                  dayDate.getFullYear() === realToday.getFullYear()
                );

                let dayClass = "text-micro font-bold cursor-pointer hover:bg-purple-50 transition-colors h-7 w-7 rounded-full flex items-center justify-center relative ";
                if (isStart || isEnd) {
                  dayClass += "bg-purple-600 text-white shadow-md shadow-purple-600/25 scale-105";
                } else if (inRange) {
                  dayClass += "bg-purple-100/60 text-purple-800 rounded-none h-7 w-full";
                } else {
                  dayClass += "text-gray-700 hover:text-entity-text";
                }

                if (isToday && !isStart && !isEnd && !inRange) {
                  dayClass += " border-2 border-purple-600 bg-purple-50/50";
                }

                return (
                  <div key={dayIdx} className="flex justify-center items-center w-full">
                    <button
                      type="button"
                      onClick={() => onSelect(dayDate)}
                      className={dayClass}
                    >
                      {dayDate.getDate()}
                      {isToday && (
                        <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${isStart || isEnd ? 'bg-white' : 'bg-purple-600'}`} />
                      )}
                    </button>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

interface InspectableDataPoint {
  label: string;
  value: number;
  cumulative: number;
  date: string;
}

interface InspectableSparkline {
  title: string;
  color: string;
  points: number[];
  details: InspectableDataPoint[];
  valueSuffix?: string;
  valuePrefix?: string;
}

const getPresetTranslationKey = (name: string) => {
  switch (name) {
    case "Today": return "dashboard.picker.today";
    case "Yesterday": return "dashboard.picker.yesterday";
    case "This week": return "dashboard.picker.this_week";
    case "Last week": return "dashboard.picker.last_week";
    case "This month": return "dashboard.picker.this_month";
    case "Last month": return "dashboard.picker.last_month";
    case "This quarter": return "dashboard.picker.this_quarter";
    case "Last quarter": return "dashboard.picker.last_quarter";
    case "This year": return "dashboard.picker.this_year";
    case "Last year": return "dashboard.picker.last_year";
    case "All Time": return "dashboard.picker.all_time";
    default: return "";
  }
};

export const Dashboard: React.FC<DashboardProps> = ({
  leads,
  leadStageGroups = {},
  leadStates = [],
  leadStateColors = {},
  systemLanguage,
  leadStateParents = {},
  campaigns: propCampaigns,
  currencyCode,
  projects = [],
  projectTypes = [],
  financialRecords = [],
  financialCategories = [],
  financialMode = "connected",
  financialSimplifiedTable = {},
  invoicesOffers = [],
  invoiceStatuses,
  tasks = [],
  taskStates = [],
  employees = [],
  tickets = [],
  ticketStatuses = [],
  ticketSettings,
  offerStatuses,
  canSeeFinancials = true,
  companyBillingSettings,
}) => {
  const netMode = Boolean(companyBillingSettings?.financeNetMode);
  const projectStatuses = useProjectStatuses();
  // Inline translation helper for short UI strings
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const currencySymbol = resolveCurrencySymbol(currencyCode, systemLanguage);
  const currencyPosition = resolveCurrencyPosition(currencyCode, systemLanguage);
  const defaultCurrency = currencyCode || currencyForRegion(systemLanguage);
  const money = (value: number, opts?: Intl.NumberFormatOptions) => formatMoney(value, currencyCode, systemLanguage, opts);

  // Active lead status items for equation breakdown
  const leadGroupItems = useMemo<StatusStatItem[]>(() => {
    if (!leads || leads.length === 0) return [];
    const stages = leadStates && leadStates.length > 0 ? leadStates : Array.from(new Set(leads.map(l => l.status || "new")));
    const activeStates = stages.filter(
      (s) => !leadStateParents[s.toLowerCase()] && !isClosedLeadState(s, leadStageGroups, leadStateParents)
    );

    return activeStates.map((state) => {
      const stateLower = state.toLowerCase();
      const leadsInState = leads.filter((l) => {
        if (l.archived) return false;
        if (l.id === "unassigned-docs" || (l.id || "").startsWith("client-")) return false;
        const sKey = (l.status || "").toLowerCase();
        const parent = leadStateParents[sKey];
        const target = parent ? parent.toLowerCase() : sKey;
        return target === stateLower;
      });

      const val = leadsInState.reduce((sum, l) => sum + resolveLeadEffectiveValue(l, { netMode, invoicesOffers }), 0);
      const col = leadStateColors?.[stateLower] || leadStateColors?.[state] || "#3b82f6";

      const rows: StatusStatDetailRow[] = leadsInState.map((l) => {
        const lVal = resolveLeadEffectiveValue(l, { netMode, invoicesOffers });
        return {
          id: l.id,
          name: l.name || `Lead #${l.id}`,
          clientName: l.contactPerson || l.name,
          manager: l.owner,
          division: l.division,
          date: l.createdAt ? new Date(l.createdAt).toLocaleDateString() : undefined,
          totalBudget: lVal,
          invoiced: 0,
          invoicable: lVal,
          type: "lead",
          url: `#leads?lead=${encodeURIComponent(l.id)}`,
        };
      });

      return {
        key: stateLower,
        name: state,
        value: val,
        count: leadsInState.length,
        color: col,
        rows,
      };
    });
  }, [leads, leadStates, leadStageGroups, leadStateParents, leadStateColors, netMode, invoicesOffers]);

  // Projects group items calculation
  const projectGroupItems: StatusStatItem[] = useMemo(() => {
    if (!projects || projects.length === 0) {
      return [];
    }

    const activeStatuses: ProjectStatus[] = openProjectStatuses(projectStatuses);

    let totalProjectBudgetValue = 0;
    let totalInvoicedValue = 0;

    return activeStatuses.map((status) => {
      const projectsInStatus = projects.filter((p) => !p.archived && p.status === status);
      let statusInvoicableVal = 0;
      let statusInvoicedOpenVal = 0;
      let statusTotalBudgetValue = 0;
      let statusTotalInvoicedValue = 0;
      const statusRows: StatusStatDetailRow[] = [];

      projectsInStatus.forEach((p) => {
        const pType = (projectTypes || []).find((t) => t.id === p.projectTypeId);
        /* Value and invoiced come from the same helpers as the project's Finances
           tab. Cancelled rows are not invoiced, a partly paid row counts in full,
           and `project.budget` (a cost ceiling) is never taken for revenue. */
        const pVal = resolveProjectValue(
          p,
          pType,
          leads?.find((l) => l.id === p.leadId),
          defaultCurrency,
          { siblingProjects: projects, projectTypes, netMode, invoicesOffers },
        ).value;

        let pInvoiced = 0;
        let pInvoicedOpen = 0;
        let pInvoicable = 0;
        if (financialRecords && financialRecords.length > 0) {
          const billing = projectBilling(pVal, financialRecords, p.id);
          pInvoiced = billing.invoiced;
          pInvoicedOpen = billing.invoicedOpen;
          pInvoicable = billing.notInvoiced;
        } else {
          if (invoicesOffers && invoicesOffers.length > 0) {
            const pInvoices = invoicesOffers.filter(
              (io) => p.leadId && io.leadId === p.leadId && io.type === "invoice" && isLiveInvoiceStatus(io.status, invoiceStatuses)
            );
            pInvoiced = pInvoices.reduce((sum, io) => sum + effectiveDocumentAmount(io, netMode), 0);
            pInvoicedOpen = pInvoices
              .filter((io) => (io.status || "").toLowerCase() !== "paid")
              .reduce((sum, io) => sum + effectiveDocumentAmount(io, netMode), 0);
          }
          pInvoicable = Math.max(0, pVal - pInvoiced);
        }

        statusInvoicableVal += pInvoicable;
        statusInvoicedOpenVal += pInvoicedOpen;
        statusTotalBudgetValue += pVal;
        statusTotalInvoicedValue += pInvoiced;

        totalProjectBudgetValue += pVal;
        totalInvoicedValue += pInvoiced;

        const leadName = p.leadId && leads ? leads.find((l) => l.id === p.leadId)?.name : undefined;

        statusRows.push({
          id: p.id,
          name: p.name || `Project #${p.id}`,
          clientName: leadName || p.name || `Project #${p.id}`,
          manager: p.managers?.[0],
          division: p.division,
          date: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : undefined,
          totalBudget: pVal,
          invoiced: pInvoiced,
          invoicedOpen: pInvoicedOpen,
          invoicable: pInvoicable,
          type: "project",
          url: `#projects/${encodeURIComponent(p.id)}`,
        });
      });

      return {
        key: status,
        name: projectStatusLabel(status, t, projectStatuses),
        value: statusInvoicableVal,
        count: projectsInStatus.length,
        color: projectStatusColor(status, projectStatuses),
        totalBudget: statusTotalBudgetValue,
        invoiced: statusTotalInvoicedValue,
        invoicedOpen: statusInvoicedOpenVal,
        rows: statusRows,
      };
    });
  }, [projects, projectTypes, projectStatuses, leads, financialRecords, invoicesOffers, invoiceStatuses, defaultCurrency, netMode, t]);

  const dashboardEquationGroups: StatusStatGroup[] = useMemo(() => {
    const list: StatusStatGroup[] = [];

    if (leadGroupItems.length > 0) {
      list.push({
        id: "leads",
        name: t("Sales & Pipeline", "Obchody a Pipeline", "Értékesítés és Pipeline"),
        subtitle: t("Active phase values in sales funnel", "Hodnoty aktívnych fáz obchodného lievika", "Aktív értékesítési fázisok"),
        icon: Layers,
        colorTheme: "blue",
        items: leadGroupItems,
        unitLabel: t("leads", "leadov", "lead"),
      });
    }

    if (projectGroupItems.length > 0) {
      list.push({
        id: "projects",
        name: t("Projects & Deliverables", "Projekty a Realizácie", "Projektek és Kivitelezés"),
        subtitle: t("Active project budgets & scopes", "Rozpočty a rozsah aktívnych projektov", "Aktív projektek költségvetése"),
        icon: Briefcase,
        colorTheme: "purple",
        items: projectGroupItems,
        unitLabel: t("projects", "projektov", "projekt"),
      });
    }

    return list;
  }, [leadGroupItems, projectGroupItems, t]);

  // Sub-tabs active status inside Dashboard
  const [activeTab, setActiveTab] = useState<"overview" | "campaigns" | "crm" | "clients">("overview");

  // Statuses the user unticked in "Na fakturovanie" (`<group>:<status>` keys)
  const [storedEquationExcluded, setEquationExcluded] = useUserPref("dashboardEquationExcluded");
  const equationExcluded = Array.isArray(storedEquationExcluded) ? storedEquationExcluded : [];
  const toggleEquationStatus = (id: string) =>
    setEquationExcluded(equationExcluded.includes(id) ? equationExcluded.filter((key) => key !== id) : [...equationExcluded, id]);

  // Chart inspector states
  const [inspectingChart, setInspectingChart] = useState<InspectableSparkline | null>(null);
  const [isClosingInspector, setIsClosingInspector] = useState(false);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  // One clock per render pass (refreshed once a minute), shared by the period and the overview
  const clockMinute = Math.floor(Date.now() / 60_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [clockMinute]);

  // Interval date range filter states (restores last quick-switch preset; manual ranges reset it to "month")
  const [storedPeriodPreset, setStoredPeriodPreset] = useUserPref("dashboardPeriodPreset");
  const initialPeriodPreset =
    storedPeriodPreset === "week" || storedPeriodPreset === "month" || storedPeriodPreset === "quarter" || storedPeriodPreset === "year"
      ? storedPeriodPreset
      : "month";
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(() => presetRange(initialPeriodPreset, new Date()).start);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(() => presetRange(initialPeriodPreset, new Date()).end);
  const [filterPresetName, setFilterPresetName] = useState<string>(() => presetNameOf(initialPeriodPreset));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);

  // PM comparison aspect state
  const [compareAspect, setCompareAspect] = useState<"won" | "revenue" | "conversion">("revenue");

  // Project manager color map following brand guidelines
  const getPMColor = (name: string, idx: number) => {
    const pmColors: Record<string, string> = {
      "Alex": "#10b981", // Emerald Green
      "Sam": "#6366f1", // Indigo
      "Jordan": "#f59e0b"  // Amber
    };
    if (pmColors[name]) return pmColors[name];
    const defaultColors = ["#3b82f6", "#f43f5e", "#8b5cf6", "#ec4899"];
    return defaultColors[idx % defaultColors.length];
  };

  // Filter leads based on selected date interval
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (l.id === "unassigned-docs" || l.archived) return false;
      if (!l.createdAt) return false;
      const date = new Date(l.createdAt);
      if (filterStartDate && date < filterStartDate) return false;
      if (filterEndDate) {
        const adjustedEnd = new Date(filterEndDate);
        adjustedEnd.setHours(23, 59, 59, 999);
        if (date > adjustedEnd) return false;
      }
      return true;
    });
  }, [leads, filterStartDate, filterEndDate]);

  // Paid Meta/Google campaigns from Settings → Integrations → Ads.
  const campaigns = useMemo<AdCampaign[]>(() => propCampaigns || [], [propCampaigns]);

  // --- Company CRM Performance Aggregators ---
  // One definition of a lead for every card and chart below: pipeline leads only (client
  // records are not leads), and "won" means a winning closed stage, never lost or rejected.
  // See utils/dashboardMetrics.ts.
  const pipelineLeads = useMemo(() => filteredLeads.filter(isPipelineLead), [filteredLeads]);
  const isWon = useCallback(
    (status: string) => isWonLeadState(status, leadStageGroups, leadStateParents),
    [leadStageGroups, leadStateParents],
  );
  const isOpen = useCallback(
    (status: string) => !isClosedLeadState(status, leadStageGroups, leadStateParents),
    [leadStageGroups, leadStateParents],
  );
  const kpis = useMemo(() => leadKpis(pipelineLeads, leadStageGroups, leadStateParents), [pipelineLeads, leadStageGroups, leadStateParents]);
  const wonLeads = useMemo(() => pipelineLeads.filter(l => isWon(l.status)), [pipelineLeads, isWon]);
  const activePipelineLeads = useMemo(() => pipelineLeads.filter(l => isOpen(l.status)), [pipelineLeads, isOpen]);
  const wonValue = kpis.won.value;
  const averageDealValue = wonLeads.length > 0 ? wonValue / wonLeads.length : 0;

  // The date filter as Finance bounds (ledger or simplified table, whichever Finance runs on).
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const period = useMemo<Period>(
    () => ({ startIso: filterStartDate ? isoOf(filterStartDate) : null, endIso: filterEndDate ? isoOf(filterEndDate) : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterStartDate, filterEndDate],
  );
  const financeInput = useMemo<FinanceInput>(
    () => ({ mode: financialMode, records: financialRecords, categories: financialCategories, simplifiedTable: financialSimplifiedTable, todayIso: isoOf(new Date()) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financialMode, financialRecords, financialCategories, financialSimplifiedTable],
  );
  const roiProps = {
    t, money, period, allLeads: leads, pipelineLeads, isWon, finance: financeInput,
    invoices: invoicesOffers, invoiceStatuses, adCampaigns: campaigns,
  };

  // Performance overview tab and the period control of the header
  const overview = usePerformanceOverview({
    today: now, active: activeTab === "overview", language: systemLanguage, presetName: filterPresetName, startDate: filterStartDate, endDate: filterEndDate,
    canSeeFinancials, leads, leadStageGroups, leadStateParents,
    invoicesOffers, invoiceStatuses, offerStatuses,
    financeInput, financialRecords, uncategorizedLabel: t("Uncategorized", "Bez kategórie", "Kategória nélkül"),
    invoicingGroups: dashboardEquationGroups, excludedStatusKeys: equationExcluded,
    projects, projectTypes, projectStatuses, defaultCurrency, netMode,
    tasks, taskStates, employees, tickets, ticketStatuses, ticketSettings,
  });

  const sortedLeads = useMemo(() => {
    return [...pipelineLeads]
      .filter(l => l.createdAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [pipelineLeads]);

  // Project Managers leaderboard
  const pmLeaderboard = useMemo(() => {
    const owners = Array.from(new Set(pipelineLeads.map(l => l.owner).filter(Boolean)));
    return owners.map(name => {
      const pmLeads = pipelineLeads.filter(l => l.owner === name);
      const won = pmLeads.filter(l => isWon(l.status));
      const rev = won.reduce((acc: number, l: Lead) => acc + l.value, 0);
      const conv = pmLeads.length > 0 ? (won.length / pmLeads.length) * 100 : 0;
      
      // Calculate chronological won revenue trend for this specific PM
      const sortedWon = [...won]
        .filter(l => l.createdAt)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      let sum = 0;
      const trendPoints = sortedWon.map(l => {
        sum += l.value;
        return sum;
      });

      return {
        name,
        leadsCount: pmLeads.length,
        wonCount: won.length,
        revenue: rev,
        conversionRate: conv,
        trendPoints: trendPoints.length > 1 ? trendPoints : [0, rev]
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [pipelineLeads, isWon]);

  // PM chronological progression lines racing over the interval
  const pmRacingChartData = useMemo(() => {
    const dates = pipelineLeads.map(l => l.createdAt ? new Date(l.createdAt).getTime() : 0).filter(Boolean);
    const startMs = filterStartDate ? filterStartDate.getTime() : (dates.length > 0 ? Math.min(...dates) : new Date().setDate(new Date().getDate() - 30));
    const endMs = filterEndDate ? filterEndDate.getTime() : (dates.length > 0 ? Math.max(...dates) : new Date().getTime());
    const rangeMs = endMs - startMs || 1;

    const series = pmLeaderboard.map((pm, pmIdx) => {
      const pmLeads = pipelineLeads.filter(l => l.owner === pm.name);
      const sortedPmLeads = [...pmLeads]
        .filter(l => l.createdAt)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let cumulativeRevenue = 0;
      let cumulativeWon = 0;
      let totalProcessed = 0;

      const dataPoints: { xRatio: number; revenue: number; won: number; conversion: number; leadName: string }[] = [
        { xRatio: 0, revenue: 0, won: 0, conversion: 0, leadName: t("Interval Start", "Začiatok intervalu", "Intervallum kezdete") }
      ];

      sortedPmLeads.forEach(l => {
        const leadTime = new Date(l.createdAt).getTime();
        const xRatio = Math.max(0, Math.min(1, (leadTime - startMs) / rangeMs));
        
        totalProcessed += 1;
        if (isWon(l.status)) {
          cumulativeRevenue += l.value;
          cumulativeWon += 1;
        }

        const currentConversion = totalProcessed > 0 ? (cumulativeWon / totalProcessed) * 100 : 0;
        dataPoints.push({
          xRatio,
          revenue: cumulativeRevenue,
          won: cumulativeWon,
          conversion: Number(currentConversion.toFixed(1)),
          leadName: l.name
        });
      });

      if (dataPoints.length > 1) {
        const last = dataPoints[dataPoints.length - 1];
        dataPoints.push({
          ...last,
          xRatio: 1,
          leadName: t("Interval End", "Koniec intervalu", "Intervallum vége")
        });
      } else {
        dataPoints.push({
          xRatio: 1,
          revenue: 0,
          won: 0,
          conversion: 0,
          leadName: t("Interval End", "Koniec intervalu", "Intervallum vége")
        });
      }

      return {
        name: pm.name,
        color: getPMColor(pm.name, pmIdx),
        dataPoints
      };
    });

    return { startMs, endMs, series };
  }, [pipelineLeads, pmLeaderboard, filterStartDate, filterEndDate, isWon]);

  // Monthly revenue, lead counts, and client averages trends
  const monthlyTrends = useMemo(() => {
    const monthsMap: Record<string, { revenue: number; clientCount: number; leadCount: number }> = {};
    
    pipelineLeads.forEach(l => {
      if (!l.createdAt) return;
      const monthKey = l.createdAt.substring(0, 7); // "2026-05"
      if (!monthsMap[monthKey]) {
        monthsMap[monthKey] = { revenue: 0, clientCount: 0, leadCount: 0 };
      }
      monthsMap[monthKey].leadCount += 1;
      if (isWon(l.status)) {
        monthsMap[monthKey].revenue += l.value;
        monthsMap[monthKey].clientCount += 1;
      }
    });

    return Object.keys(monthsMap).sort().map(key => {
      const data = monthsMap[key];
      const revPerClient = data.clientCount > 0 ? data.revenue / data.clientCount : 0;
      const date = new Date(key + "-01");
      const label = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      return {
        label,
        revenue: data.revenue,
        totalClients: data.clientCount,
        revPerClient,
        leadCount: data.leadCount
      };
    });
  }, [pipelineLeads, isWon]);

  // --- Client Demographics & Funnel Aggregators ---
  const clientTypes = useMemo(() => {
    const counts = { business: 0, person: 0, partner: 0 };
    filteredLeads.forEach(l => {
      if (counts[l.clientType] !== undefined) {
        counts[l.clientType] += 1;
      }
    });
    return counts;
  }, [filteredLeads]);

  // Interactive dynamic Pie chart computations for Client Types
  const clientTypeChartData = useMemo(() => {
    const total = (clientTypes.business || 0) + (clientTypes.person || 0) + (clientTypes.partner || 0);
    if (total === 0) {
      return { total: 0, segments: [] };
    }
    
    const segments = [
      { label: t("Business Entities (B2B)", "Firemní klienti (B2B)", "Céges ügyfelek (B2B)"), count: clientTypes.business, color: "#2563eb", strokeColor: "stroke-blue-600", fillColor: "fill-blue-600", textClass: "text-blue-600 font-bold", rawColor: "blue" },
      { label: t("Retail / Persons (B2C)", "Drobní klienti (B2C)", "Lakossági ügyfelek (B2C)"), count: clientTypes.person, color: "#10b981", strokeColor: "stroke-emerald-600", fillColor: "fill-emerald-600", textClass: "text-emerald-600 font-bold", rawColor: "emerald" },
      { label: t("Partner Accounts", "Partnerské účty", "Partnerfiókok"), count: clientTypes.partner, color: "#d97706", strokeColor: "stroke-amber-600", fillColor: "fill-amber-600", textClass: "text-amber-600 font-bold", rawColor: "amber" }
    ];

    let currentOffset = 0;
    const segmentsWithMath = segments.map(seg => {
      const percentage = (seg.count / total) * 100;
      const strokeDasharray = `${percentage} ${100 - percentage}`;
      const strokeDashoffset = (100 - currentOffset + 25) % 100;
      currentOffset += percentage;
      return {
        ...seg,
        percentage,
        strokeDasharray,
        strokeDashoffset
      };
    });

    return { total, segments: segmentsWithMath };
  }, [clientTypes, systemLanguage]);

  const cityDistribution = useMemo(() => {
    const cities: Record<string, number> = {};
    filteredLeads.forEach(l => {
      if (l.city) {
        cities[l.city] = (cities[l.city] || 0) + 1;
      }
    });
    return Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filteredLeads]);

  // Currency goes on whichever side (prefix/suffix) its own convention dictates
  // (see resolveCurrencyPosition) — e.g. "$1,000" vs "1 000 €".
  const currencyValuePrefix = currencyPosition === "suffix" ? "" : currencySymbol;
  const currencyValueSuffix = currencyPosition === "suffix" ? ` ${currencySymbol}` : "";

  const handleInspectChart = (type: "pm", pmName?: string) => {
    let title = "";
    let color = "";
    let valuePrefix = "";
    let valueSuffix = "";
    let details: InspectableDataPoint[] = [];

    if (type === "pm" && pmName) {
      title = `${pmName} - ${t("Sales Performance Trend", "Vývoj predajnej výkonnosti", "Értékesítési teljesítmény trendje")}`;
      color = "#f59e0b";
      valuePrefix = currencyValuePrefix;
      valueSuffix = currencyValueSuffix;
      let sum = 0;
      details = sortedLeads
        .filter(l => l.owner === pmName && isWon(l.status))
        .map(l => {
          sum += l.value;
          return {
            label: l.name,
            value: l.value,
            cumulative: sum,
            date: l.createdAt ? l.createdAt.substring(0, 16).replace("T", " ") : "N/A"
          };
        });
    }

    const points = details.map(d => d.cumulative);
    setInspectingChart({
      title,
      color,
      points: points.length > 1 ? points : [0, ...points],
      details,
      valuePrefix,
      valueSuffix
    });
    setIsClosingInspector(false);
  };

  const closeInspector = () => {
    setIsClosingInspector(true);
    setTimeout(() => {
      setInspectingChart(null);
      setIsClosingInspector(false);
      setHoveredPointIdx(null);
    }, 350);
  };

  const handleCalendarSelect = (date: Date) => {
    if (!filterStartDate || (filterStartDate && filterEndDate)) {
      setFilterStartDate(date);
      setFilterEndDate(null);
      setFilterPresetName("Custom Range");
      setStoredPeriodPreset("month");
    } else if (filterStartDate && !filterEndDate) {
      if (date < filterStartDate) {
        setFilterStartDate(date);
      } else {
        setFilterEndDate(date);
      }
      setFilterPresetName("Custom Range");
      setStoredPeriodPreset("month");
    }
  };

  return (
    <div className="space-y-8 select-none animate-fade-in text-gray-800 relative">
      {/* Title Header */}
      <PageHeader
        icon={<SectionIcon id="overview" />}
        title={getTranslation(systemLanguage, "header.title.dashboard")}
        subtitle={t("Finance, sales, projects, team and support for the selected period", "Financie, obchod, projekty, tím a podpora za zvolené obdobie", "Pénzügyek, értékesítés, projektek, csapat és támogatás a kiválasztott időszakra")}
        actions={<>
          {/* Period switch and date picker */}
          <div className="relative">
            <PeriodControl
              preset={periodPresetFromName(filterPresetName)}
              onPreset={(preset) => {
                const range = presetRange(preset, now);
                setFilterStartDate(range.start);
                setFilterEndDate(range.end);
                setFilterPresetName(presetNameOf(preset));
                setStoredPeriodPreset(preset);
                setIsDatePickerOpen(false);
              }}
              rangeLabel={periodRangeLabel(overview.period, systemLanguage)}
              onOpenPicker={() => setIsDatePickerOpen(!isDatePickerOpen)}
              pickerOpen={isDatePickerOpen}
              language={systemLanguage}
            />

            {isDatePickerOpen && (
              <div className="absolute top-full mt-1 right-0 bg-white border border-gray-100 shadow-xl rounded-lg p-6 flex flex-col ws-md:flex-row gap-6 z-[999] animate-in fade-in slide-in-from-top-4 duration-200 w-full ws-md:w-210">
          
                {/* Left sidebar: Preset quick intervals */}
                <div className="w-full ws-md:w-65 border-r border-gray-100 pr-4 flex flex-col space-y-1.5 justify-start text-left shrink-0">
                  <span className="type-overline text-gray-400 mb-1 pl-1">{getTranslation(systemLanguage, "dashboard.quick_intervals")}</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { name: "Today", getRange: () => { const d = new Date(); return { start: d, end: d }; } },
                      { name: "Yesterday", getRange: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { start: d, end: d }; } },
                      { name: "This week", getRange: () => {
                          const start = new Date();
                          const day = start.getDay();
                          const diff = day === 0 ? -6 : 1 - day;
                          start.setDate(start.getDate() + diff);
                          const end = new Date();
                          return { start, end };
                        }
                      },
                      { name: "Last week", getRange: () => {
                          const start = new Date();
                          const day = start.getDay();
                          const diff = (day === 0 ? -6 : 1 - day) - 7;
                          start.setDate(start.getDate() + diff);
                          const end = new Date(start);
                          end.setDate(end.getDate() + 6);
                          return { start, end };
                        }
                      },
                      { name: "This month", getRange: () => {
                          const start = new Date();
                          start.setDate(1);
                          const end = new Date();
                          return { start, end };
                        }
                      },
                      { name: "Last month", getRange: () => {
                          const start = new Date();
                          start.setMonth(start.getMonth() - 1);
                          start.setDate(1);
                          const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
                          return { start, end };
                        }
                      },
                      { name: "This quarter", getRange: () => {
                          const start = new Date();
                          const currentMonth = start.getMonth();
                          const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
                          start.setMonth(quarterStartMonth);
                          start.setDate(1);
                          const end = new Date();
                          return { start, end };
                        }
                      },
                      { name: "Last quarter", getRange: () => {
                          const start = new Date();
                          const currentMonth = start.getMonth();
                          const lastQuarterStartMonth = (Math.floor(currentMonth / 3) - 1) * 3;
                          start.setMonth(lastQuarterStartMonth);
                          start.setDate(1);
                          const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
                          return { start, end };
                        }
                      },
                      { name: "This year", getRange: () => {
                          const start = new Date(new Date().getFullYear(), 0, 1);
                          const end = new Date();
                          return { start, end };
                        }
                      },
                      { name: "Last year", getRange: () => {
                          const start = new Date(new Date().getFullYear() - 1, 0, 1);
                          const end = new Date(new Date().getFullYear() - 1, 11, 31);
                          return { start, end };
                        }
                      },
                      { name: "All Time", getRange: () => ({ start: null, end: null }), fullWidth: true }
                    ].map(preset => {
                      const isSelected = filterPresetName === preset.name;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            const { start, end } = preset.getRange();
                            setFilterStartDate(start);
                            setFilterEndDate(end);
                            setFilterPresetName(preset.name);
                            setStoredPeriodPreset("month");
                            setIsDatePickerOpen(false);
                          }}
          className={`text-left px-2.5 py-1.5 rounded-md type-overline transition-all cursor-pointer border ${
                            preset.fullWidth ? "col-span-2 text-center" : ""
                          } ${
                            isSelected 
                              ? "bg-purple-50 text-purple-700 border-purple-200" 
                              : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-transparent"
                          }`}
                        >
                          {getTranslation(systemLanguage, getPresetTranslationKey(preset.name) as any)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right side: Dual calendars */}
                <div className="flex-1 flex flex-col space-y-4">
                  <div className="flex flex-col ws-sm:flex-row gap-6">
                    {/* Calendar 1: Current Month */}
                     <CalendarPane 
                      title={(() => {
                        const d = new Date();
                        return d.toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", { month: "long", year: "numeric" });
                      })()}
                      year={new Date().getFullYear()}
                      month={new Date().getMonth()}
                      selectedStart={filterStartDate}
                      selectedEnd={filterEndDate}
                      onSelect={(date) => handleCalendarSelect(date)}
                      systemLanguage={systemLanguage}
                    />
                    {/* Calendar 2: Next Month */}
                    <CalendarPane 
                      title={(() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + 1);
                        return d.toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", { month: "long", year: "numeric" });
                      })()}
                      year={(() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + 1);
                        return d.getFullYear();
                      })()}
                      month={(() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + 1);
                        return d.getMonth();
                      })()}
                      selectedStart={filterStartDate}
                      selectedEnd={filterEndDate}
                      onSelect={(date) => handleCalendarSelect(date)}
                      systemLanguage={systemLanguage}
                    />
                  </div>

                  {/* Actions bottom block */}
                  <div className="flex justify-between items-center border-t border-gray-100 pt-4 text-micro font-bold text-gray-400">
                    <span>{getTranslation(systemLanguage, "dashboard.picker.info")}</span>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => {
                          setFilterStartDate(null);
                          setFilterEndDate(null);
                          setFilterPresetName("All Time");
                          setIsDatePickerOpen(false);
                        }}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md font-bold uppercase tracking-wider transition-colors cursor-pointer border border-gray-200"
                      >
                        {getTranslation(systemLanguage, "dashboard.picker.reset")}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIsDatePickerOpen(false)}
                        className="px-3.5 py-1.5 bg-entity-solid hover:bg-entity-solid-hover text-white rounded-md font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md shadow-purple-600/10"
                      >
                        {getTranslation(systemLanguage, "dashboard.picker.apply")}
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </>}
      />

      {/* Navigation sub-tabs */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "overview", icon: <Award className="h-3.5 w-3.5" />, label: getTranslation(systemLanguage, "dashboard.tab_overview") },
          { key: "campaigns", icon: <Target className="h-3.5 w-3.5" />, label: getTranslation(systemLanguage, "dashboard.tab_campaigns") },
          { key: "crm", icon: <TrendingUp className="h-3.5 w-3.5" />, label: getTranslation(systemLanguage, "dashboard.tab_crm") },
          { key: "clients", icon: <Users className="h-3.5 w-3.5" />, label: getTranslation(systemLanguage, "dashboard.tab_clients") },
        ]}
      />

      {/* --- TAB 1: PERFORMANCE OVERVIEW --- */}
      {activeTab === "overview" && (
        <PerformanceOverview
          data={overview}
          language={systemLanguage}
          currencyCode={currencyCode}
          canSeeFinancials={canSeeFinancials}
          now={now}
          onToggleStatus={toggleEquationStatus}
          onClearSelection={() => setEquationExcluded([])}
          breakdownSource={{
            leads,
            leadStageGroups,
            leadStateParents,
            invoicesOffers,
            invoiceStatuses: invoiceStatuses ?? DEFAULT_INVOICE_STATUS_DEFS,
            offerStatuses: offerStatuses ?? DEFAULT_OFFER_STATUS_DEFS,
            financialRecords,
            projects,
            tasks,
            tickets,
            ticketStatuses,
          }}
        />
      )}

      {/* --- TAB 2: MARKETING ROI (newsletter, social media, paid ads) --- */}
      {activeTab === "campaigns" && <MarketingRoiTab {...roiProps} />}

      {/* --- TAB 3: CRM COMPANY PERFORMANCE & PM LEADERBOARD --- */}
      {activeTab === "crm" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Company Core KPI Summaries */}
          <div className=" p-6 rounded-lg border border-gray-200 bg-white shadow-sm space-y-4">
            <h3 className="text-ui font-heading font-bold text-gray-900 flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-entity-text" /> {t(`${PRODUCT_NAME} Company Key Performance Indicators`, `Kľúčové ukazovatele výkonnosti firmy v ${PRODUCT_NAME}`, `A vállalat kulcsfontosságú teljesítménymutatói a ${PRODUCT_NAME}-ben`)}
            </h3>
            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-4 text-center">
              <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
                <span className="type-overline text-gray-400 block">{t("Average Deal Value", "Priemerná hodnota obchodu", "Átlagos üzletérték")}</span>
                <span className="text-title font-bold text-gray-800 block mt-1">{money(averageDealValue, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
                <span className="type-overline text-gray-400 block">{t("Active Deals in Funnel", "Aktívne obchody v lieviku", "Aktív üzletek a tölcsérben")}</span>
                <span className="text-title font-bold text-entity-text block mt-1">{activePipelineLeads.length}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 ws-lg:grid-cols-12 gap-6">
            
            {/* PM Leaderboard */}
            <div className="ws-lg:col-span-5  p-6 rounded-lg border border-gray-200 bg-white shadow-sm space-y-4">
              <h3 className="text-ui font-heading font-bold text-gray-900 flex items-center gap-1.5">
                <Award className="h-4 w-4 text-amber-500" /> {t("Project Managers Toplist", "Rebríček projektových manažérov", "Projektmenedzserek ranglistája")}
              </h3>

              <div className="space-y-3 pt-2">
                {pmLeaderboard.map((pm, idx) => {
                  const maxRevenue = Math.max(...pmLeaderboard.map(p => p.revenue), 1);
                  const revenuePercentage = (pm.revenue / maxRevenue) * 100;
                  
                  // Rank styling configurations
                  let badgeBg = "bg-gray-100 text-gray-500 border-gray-200";
                  let cardHover = "hover:border-gray-300 hover:shadow-md hover:shadow-gray-100/50";
                  let rankTitle = t("Contender", "Vyzývateľ", "Kihívó");
                  let icon = <Award className="h-3.5 w-3.5 text-gray-400" />;
                  let sparklineColor = "#6366f1"; // indigo
                  
                  if (idx === 0) {
                    badgeBg = "bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 text-white border-amber-300 shadow-md shadow-amber-500/25";
                    cardHover = "hover:border-amber-300 hover:shadow-lg hover:shadow-amber-500/5";
                    rankTitle = t("Elite Champion", "Elitný šampión", "Elit bajnok");
                    icon = <Crown className="h-3.5 w-3.5 text-white animate-bounce duration-1000" />;
                    sparklineColor = "#f59e0b"; // gold/amber
                  } else if (idx === 1) {
                    badgeBg = "bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500 text-white border-gray-200 shadow-md shadow-gray-500/15";
                    cardHover = "hover:border-entity hover:shadow-lg hover:shadow-indigo-500/5";
                    rankTitle = t("Super Challenger", "Super vyzývateľ", "Szuper kihívó");
                    icon = <Medal className="h-3.5 w-3.5 text-white" />;
                    sparklineColor = "#6366f1"; // indigo/silver
                  } else if (idx === 2) {
                    badgeBg = "bg-gradient-to-br from-orange-400 via-amber-600 to-orange-600 text-white border-orange-300 shadow-md shadow-orange-500/15";
                    cardHover = "hover:border-orange-300 hover:shadow-lg hover:shadow-orange-500/5";
                    rankTitle = t("Rising Star", "Vychádzajúca hviezda", "Feltörekvő csillag");
                    icon = <Trophy className="h-3.5 w-3.5 text-white" />;
                    sparklineColor = "#f97316"; // orange/bronze
                  }

                  // Streaks / Status tag triggers (No Emojis!)
                  const isHighConversion = pm.conversionRate >= 20;

                  return (
                    <div 
                      key={pm.name} 
                      onClick={() => handleInspectChart("pm", pm.name)}
                      className={`flex flex-col p-4 bg-gray-50/50 border border-gray-100 rounded-lg transition-all relative overflow-hidden group cursor-pointer shadow-sm ${cardHover}`}
                    >
                      {/* Top Row: Rank & Name + Status Badge & Sparkline/Revenue */}
                      <div className="flex items-center justify-between relative z-20">
                        <div className="flex items-center gap-3">
                          {/* Gamified physical round badge */}
                          <div className={`h-9 w-9 rounded-full font-heading font-bold text-caption flex items-center justify-center border relative shrink-0 ${badgeBg}`}>
                            {icon}
                            {/* Level floating tag */}
                            <span className="absolute -bottom-1 -right-1.5 px-1 bg-gray-800 text-white type-overline rounded-full scale-90 border border-white">
                              {t("Lvl", "Úr.", "Szint")} {pm.wonCount + 1}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-ui font-bold text-gray-800">{pm.name}</span>
                              <span className={`type-overline px-1.5 py-0.5 rounded-full border select-none ${
                                idx === 0 ? "bg-amber-500/10 text-amber-700 border-amber-200" :
                                idx === 1 ? "bg-indigo-50/15 text-entity-text border-entity-border" :
                                "bg-orange-50 text-orange-700 border-orange-200"
                              }`}>
                                {rankTitle}
                              </span>
                            </div>
                            <span className="text-micro text-gray-400 font-semibold">{pm.wonCount} {t("won of", "vyhraných z", "megnyerve ebből")} {pm.leadsCount} {t("deals", "obchodov", "üzlet")}</span>
                          </div>
                        </div>

                        {/* Revenue & Conversion Rate stats */}
                        <div className="flex items-center gap-4">
                          {/* Sparkline chart */}
                          <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                            <Sparkline points={pm.trendPoints} color={sparklineColor} />
                          </div>
                          
                          <div className="flex flex-col items-end shrink-0">
                            <span className="text-ui font-bold text-gray-900">{money(pm.revenue)}</span>
                            <div className="flex items-center gap-1 text-micro font-bold">
                              {isHighConversion && <Flame className="h-3 w-3 text-orange-500 animate-pulse" />}
                              <span className={isHighConversion ? "text-orange-600" : "text-emerald-600"}>
                                {pm.conversionRate.toFixed(0)}% {t("conversion", "konverzia", "konverzió")}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: XP Progress Bar comparing to #1 */}
                      <div className="mt-3 flex items-center justify-between gap-3 relative z-20">
                        {/* XP bar label */}
                        <span className="type-overline text-gray-400 shrink-0">
                          {idx === 0 ? t("Champion Level Max", "Maximálna úroveň šampióna", "Bajnoki szint max") : `${Math.round(revenuePercentage)}% ${t("of Top Score", "z najlepšieho skóre", "a legjobb pontszámból")}`}
                        </span>
                        {/* Interactive progress bar */}
                        <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden relative border border-gray-200/30">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${
                              idx === 0 ? "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" :
                              idx === 1 ? "bg-gradient-to-r from-gray-400 to-indigo-500" :
                              "bg-gradient-to-r from-orange-400 to-orange-500"
                            }`}
                            style={{ width: `${revenuePercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PM Comparison Graph */}
            <div className="ws-lg:col-span-7  p-6 rounded-lg border border-gray-200 bg-white shadow-sm space-y-6">
              <div className="flex flex-col ws-sm:flex-row ws-sm:items-center ws-sm:justify-between gap-4">
                <h3 className="text-ui font-heading font-bold text-gray-900 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-purple-600" /> {t("PM Comparison Race", "Pretek porovnania PM", "PM összehasonlító verseny")}
                </h3>
                
                {/* Selector Toggles */}
                <div className="flex bg-gray-100 p-0.5 rounded-md border border-gray-200 w-fit gap-1 type-overline font-heading shrink-0 select-none">
                  <button 
                    type="button" 
                    onClick={() => setCompareAspect("revenue")}
                    className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${compareAspect === "revenue" ? "bg-purple-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800 bg-white"}`}
                  >
                    {t("Revenue", "Tržby", "Bevétel")}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setCompareAspect("won")}
                    className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${compareAspect === "won" ? "bg-purple-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800 bg-white"}`}
                  >
                    {t("Won Deals", "Uzavreté obchody", "Megnyert üzletek")}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setCompareAspect("conversion")}
                    className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${compareAspect === "conversion" ? "bg-purple-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800 bg-white"}`}
                  >
                    {t("Conversion", "Konverzia", "Konverzió")}
                  </button>
                </div>
              </div>

              {/* Shared Racing Plotline Chart */}
              <div className="relative bg-gray-50 border border-gray-100 rounded-lg p-4 flex flex-col items-center justify-center min-h-65">
                {(() => {
                  const width = 500;
                  const height = 200;
                  const paddingX = 40;
                  const paddingY = 24;

                  // Find maximum Y value across all data points
                  const allPoints: number[] = [];
                  pmRacingChartData.series.forEach(s => {
                    s.dataPoints.forEach(p => {
                      if (compareAspect === "revenue") allPoints.push(p.revenue);
                      else if (compareAspect === "won") allPoints.push(p.won);
                      else allPoints.push(p.conversion);
                    });
                  });
                  const maxVal = Math.max(...allPoints, 1);

                  return (
                    <div className="w-full">
                      <svg width="100%" height="200" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                        {/* Horizontal Gridlines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                          const y = paddingY + ratio * (height - paddingY * 2);
                          const gridVal = maxVal - ratio * maxVal;
                          return (
                            <g key={ratio} className="opacity-30">
                              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                              <text x={5} y={y + 3} fill="#64748b" style={{ fontSize: "var(--text-micro)" }} fontWeight="bold">
                                {compareAspect === "revenue"
                                  ? money(Math.round(gridVal))
                                  : `${Math.round(gridVal).toLocaleString()}${compareAspect === "conversion" ? "%" : ""}`}
                              </text>
                            </g>
                          );
                        })}

                        {/* Draw racing lines */}
                        {pmRacingChartData.series.map((s) => {
                          const coords = s.dataPoints.map(p => {
                            const val = compareAspect === "revenue" ? p.revenue : compareAspect === "won" ? p.won : p.conversion;
                            const x = paddingX + p.xRatio * (width - paddingX * 2);
                            const y = height - paddingY - (val / maxVal) * (height - paddingY * 2);
                            return `${x},${y}`;
                          });

                          const pathD = `M ${coords.join(" L ")}`;
                          const lastPoint = s.dataPoints[s.dataPoints.length - 1];
                          const lastVal = compareAspect === "revenue" ? lastPoint.revenue : compareAspect === "won" ? lastPoint.won : lastPoint.conversion;
                          const lastX = paddingX + lastPoint.xRatio * (width - paddingX * 2);
                          const lastY = height - paddingY - (lastVal / maxVal) * (height - paddingY * 2);

                          return (
                            <g key={s.name}>
                              {/* Glowing path underlay */}
                              <path 
                                d={pathD} 
                                stroke={s.color} 
                                strokeWidth="6" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                fill="none" 
                                className="opacity-15 blur-sm" 
                              />
                              {/* Main solid path */}
                              <path 
                                d={pathD} 
                                stroke={s.color} 
                                strokeWidth="3" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                fill="none" 
                                className="transition-all duration-300" 
                              />
                              {/* Pulsing racing head indicator */}
                              <circle 
                                cx={lastX} 
                                cy={lastY} 
                                r="5.5" 
                                fill="#ffffff" 
                                stroke={s.color} 
                                strokeWidth="3" 
                                className="animate-pulse" 
                              />
                            </g>
                          );
                        })}
                      </svg>

                      {/* Racing Legend with final values */}
                      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1.5 mt-2 border-t border-gray-100 pt-3 select-none">
                        {pmLeaderboard.map((pm) => {
                          const series = pmRacingChartData.series.find(s => s.name === pm.name);
                          const color = series ? series.color : "#cbd5e1";
                          let finalLabel = "";
                          if (compareAspect === "revenue") finalLabel = money(pm.revenue);
                          else if (compareAspect === "won") finalLabel = `${pm.wonCount} ${t("won", "vyhraných", "megnyert")}`;
                          else finalLabel = `${pm.conversionRate.toFixed(0)}%`;

                          return (
                            <div key={pm.name} className="flex items-center gap-1.5 type-overline text-gray-600">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span>{pm.name}: <strong className="text-gray-800">{finalLabel}</strong></span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Performance Trends (Full Width) */}
          <div className=" p-6 rounded-lg border border-gray-200 bg-white shadow-sm space-y-6 w-full">
            <h3 className="text-ui font-heading font-bold text-gray-900 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-entity-text" /> {getTranslation(systemLanguage, "dashboard.charts.mom_trend")}
            </h3>

            {monthlyTrends.length > 0 ? (
              <div className="space-y-4 pt-2">
                {monthlyTrends.map(trend => (
                  <div key={trend.label} className="p-4 bg-gray-50/30 rounded-lg border border-gray-100 flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-ui font-bold text-gray-800">{trend.label}</span>
                      <span className="text-micro text-gray-400 font-semibold">{t(`${PRODUCT_NAME} Activity Node Period`, `Obdobie aktivity v ${PRODUCT_NAME}`, `${PRODUCT_NAME} aktivitási időszak`)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center ws-sm:text-right">
                      <div>
                        <span className="type-overline text-gray-400 block">{t("Revenue", "Tržby", "Bevétel")}</span>
                        <strong className="text-ui font-bold text-gray-800 block mt-0.5">{money(trend.revenue)}</strong>
                      </div>
                      <div>
                        <span className="type-overline text-gray-400 block">{t("Clients", "Klienti", "Ügyfelek")}</span>
                        <strong className="text-ui font-bold text-entity-text block mt-0.5">{trend.totalClients}</strong>
                      </div>
                      <div>
                        <span className="type-overline text-gray-400 block">{t("Rev/Client", "Tržby/klient", "Bevétel/ügyfél")}</span>
                        <strong className="text-ui font-bold text-emerald-600 block mt-0.5">{money(trend.revPerClient, { maximumFractionDigits: 0 })}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center text-center text-gray-400 text-ui">
                <span>{t(`No monthly records found in ${PRODUCT_NAME} sandbox. Seeding cleanup records will regenerate trends.`, `V ${PRODUCT_NAME} sandboxe sa nenašli žiadne mesačné záznamy. Vyčistenie a opätovné naplnenie záznamov obnoví trendy.`, `Nem találhatók havi rekordok a ${PRODUCT_NAME} sandboxban. A rekordok feltöltése után újragenerálódnak a trendek.`)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 4: CLIENT STATISTICS & GEOGRAPHIES --- */}
      {activeTab === "clients" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-6">
            
            {/* Client type ratio */}
            <div className=" p-6 rounded-lg border border-gray-200 bg-white shadow-sm space-y-4">
              <h3 className="text-ui font-heading font-bold text-gray-900 flex items-center gap-1.5">
                <PieChart className="h-4 w-4 text-entity-text" /> {t("Client Type Distribution", "Rozdelenie typov klientov", "Ügyféltípusok megoszlása")}
              </h3>

              <div className="flex flex-col ws-sm:flex-row items-center gap-6 pt-2">
                {/* SVG Donut/Pie Chart */}
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 42 42">
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="4.5" />
                    {clientTypeChartData.segments.map((seg, idx) => (
                      seg.count > 0 && (
                        <circle
                          key={idx}
                          cx="21"
                          cy="21"
                          r="15.915"
                          fill="transparent"
                          stroke={seg.color}
                          strokeWidth="4.5"
                          strokeDasharray={seg.strokeDasharray}
                          strokeDashoffset={seg.strokeDashoffset}
                          className="transition-all duration-300 hover:stroke-[5.5] cursor-pointer"
                        />
                      )
                    ))}
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-title font-bold text-gray-800 leading-none">{clientTypeChartData.total}</span>
                    <span className="type-overline text-gray-400 mt-0.5">{t("Clients", "Klienti", "Ügyfelek")}</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex-1 space-y-2.5 w-full">
                  {clientTypeChartData.segments.map((seg, idx) => {
                    return (
                      <div key={idx} className="flex flex-col gap-0.5">
                        <div className="flex justify-between items-center text-micro font-bold text-gray-700">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                            {seg.label}
                          </span>
                          <span className="text-gray-900">{seg.count} ({seg.percentage.toFixed(0)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* City Demographics */}
            <div className=" p-6 rounded-lg border border-gray-200 bg-white shadow-sm space-y-4">
              <h3 className="text-ui font-heading font-bold text-gray-900 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-emerald-600" /> {t("Top Client Locations", "Najčastejšie lokality klientov", "Top ügyfélhelyszínek")}
              </h3>

              <div className="space-y-3 pt-2">
                {cityDistribution.map(([city, count]) => {
                  const percent = filteredLeads.length > 0 ? (count / filteredLeads.length) * 100 : 0;
                  return (
                    <div key={city} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-ui font-bold text-gray-700">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                          {city}
                        </span>
                        <span>{count}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Interactive Trend Chart Inspector Modal */}
      {inspectingChart && (
        <div className={`fixed inset-0 bg-gray-900/60  flex items-center justify-center p-4 ws-sm:p-6 z-[9999] transition-all duration-300 ${
          isClosingInspector ? "opacity-0 scale-95" : "opacity-100 scale-100 animate-in fade-in zoom-in-95 duration-200"
        }`}>
          {/* Main Modal Container */}
          <div 
            className="w-full max-w-212.5 bg-white rounded-lg border-2 border-gray-100 shadow-xl p-6 ws-sm:p-8 flex flex-col space-y-6 overflow-hidden max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div className="flex flex-col">
                <h3 className="text-body font-heading font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full animate-ping shrink-0" style={{ backgroundColor: inspectingChart.color }} />
                  {inspectingChart.title}
                </h3>
                <span className="type-overline text-gray-400 mt-1">
                  {t("Chronological progression & value analysis log", "Záznam chronologického vývoja a analýzy hodnoty", "Kronologikus folyamat és értékelemzési napló")}
                </span>
              </div>
              <button 
                type="button"
                onClick={closeInspector}
                className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center font-bold text-ui transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Grid */}
            <div className="grid grid-cols-1 ws-lg:grid-cols-12 gap-6 overflow-y-auto pr-1">
              
              {/* Detailed SVG Chart (lg:col-span-7) */}
              <div className="ws-lg:col-span-7 flex flex-col space-y-4">
                <div className="relative bg-gray-50 border border-gray-100 rounded-lg p-4 flex items-center justify-center min-h-65">
                  {/* SVG detailed curve */}
                  {(() => {
                    const width = 500;
                    const height = 200;
                    const padding = 24;
                    const points = inspectingChart.points;
                    const min = Math.min(...points);
                    const max = Math.max(...points);
                    const range = max - min || 1;

                    const coords = points.map((p, idx) => {
                      const x = padding + (idx / (points.length - 1 || 1)) * (width - padding * 2);
                      const y = height - padding - ((p - min) / range) * (height - padding * 2);
                      return { x, y, val: p, originalIdx: idx };
                    });

                    const pathD = `M ${coords.map(c => `${c.x},${c.y}`).join(" L ")}`;
                    const areaD = `${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

                    return (
                      <svg width="100%" height="220" viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
                        {/* Horizontal Gridlines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                          const y = padding + ratio * (height - padding * 2);
                          const gridVal = max - ratio * range;
                          return (
                            <g key={ratio} className="opacity-30">
                              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                              <text x={5} y={y + 3} fill="#64748b" style={{ fontSize: "var(--text-micro)" }} fontWeight="bold">
                                {inspectingChart.valuePrefix}
                                {Math.round(gridVal).toLocaleString()}
                                {inspectingChart.valueSuffix}
                              </text>
                            </g>
                          );
                        })}

                        {/* Gradient Area under curve */}
                        <defs>
                          <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={inspectingChart.color} stopOpacity="0.3" />
                            <stop offset="100%" stopColor={inspectingChart.color} stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        <path d={areaD} fill="url(#detailGrad)" className="transition-all duration-300" />
                        <path d={pathD} stroke={inspectingChart.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />

                        {/* Chart Interactive Points */}
                        {coords.map((c, idx) => {
                          const isHovered = hoveredPointIdx === c.originalIdx;
                          return (
                            <g key={idx} className="cursor-pointer">
                              <circle
                                cx={c.x}
                                cy={c.y}
                                r={isHovered ? 7 : 4.5}
                                fill={isHovered ? "#ffffff" : inspectingChart.color}
                                stroke={inspectingChart.color}
                                strokeWidth={isHovered ? 3 : 1.5}
                                className="transition-all duration-200"
                                onMouseEnter={() => setHoveredPointIdx(c.originalIdx)}
                                onMouseLeave={() => setHoveredPointIdx(null)}
                              />
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>

                {/* Point details display */}
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 min-h-17.5 flex items-center justify-center text-center">
                  {hoveredPointIdx !== null && inspectingChart.details[hoveredPointIdx] ? (
                    (() => {
                      const pt = inspectingChart.details[hoveredPointIdx];
                      return (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom duration-150">
                          <span className="type-overline text-gray-400">{t("Selected Data Node", "Vybraný dátový bod", "Kiválasztott adatpont")}</span>
                          <span className="text-ui font-bold text-gray-800 mt-0.5">{pt.label}</span>
                          <div className="flex items-center justify-center gap-3 mt-1 text-caption font-bold">
                            <span className="text-gray-500">{t("Date", "Dátum", "Dátum")}: <strong className="text-gray-700">{formatTimestampLocalized(pt.date, systemLanguage)}</strong></span>
                            <span className="text-gray-500">{t("Change", "Zmena", "Változás")}: <strong className="text-gray-700">+{inspectingChart.valuePrefix}{pt.value.toLocaleString()}{inspectingChart.valueSuffix}</strong></span>
                            <span className="text-gray-500">{t("Value", "Hodnota", "Érték")}: <strong style={{ color: inspectingChart.color }}>{inspectingChart.valuePrefix}{pt.cumulative.toLocaleString()}{inspectingChart.valueSuffix}</strong></span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="type-overline text-gray-400 animate-pulse">
                      {t("Hover over any node on the plotline above to inspect granular values", "Prejdite myšou na ktorýkoľvek bod krivky vyššie pre zobrazenie podrobných hodnôt", "Vigye az egeret a fenti görbe bármely pontjára a részletes értékek megtekintéséhez")}
                    </div>
                  )}
                </div>
              </div>

              {/* Chronological Values Log (lg:col-span-5) */}
              <div className="ws-lg:col-span-5 flex flex-col space-y-3 overflow-hidden max-h-87.5">
                <h4 className="type-overline text-gray-400 border-b border-gray-100 pb-2">
                  {t("Chronological Progression Log", "Záznam chronologického vývoja", "Kronologikus folyamatnapló")}
                </h4>
                <div className="overflow-y-auto space-y-2 pr-1 flex-1">
                  {inspectingChart.details.map((pt, idx) => (
                    <div 
                      key={idx} 
                      onMouseEnter={() => setHoveredPointIdx(idx)}
                      onMouseLeave={() => setHoveredPointIdx(null)}
                      className={`p-3 rounded-md border transition-all text-left flex justify-between items-center ${
                        hoveredPointIdx === idx 
                          ? "bg-gray-50 border-gray-200 translate-x-1 shadow-sm" 
                          : "bg-white border-gray-100"
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-caption font-bold text-gray-800 truncate leading-snug">{pt.label}</span>
                        <span className="text-micro text-gray-400 font-bold mt-0.5">{formatTimestampLocalized(pt.date, systemLanguage)}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <strong className="text-ui font-bold text-gray-800">
                          {inspectingChart.valuePrefix}
                          {pt.cumulative.toLocaleString()}
                          {inspectingChart.valueSuffix}
                        </strong>
                        <span className="text-micro text-gray-400 font-bold">
                          +{inspectingChart.valuePrefix}{pt.value.toLocaleString()}{inspectingChart.valueSuffix}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
