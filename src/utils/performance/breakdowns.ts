/**
 * Pure on-demand breakdown builders for every metric on the Performance Overview dashboard.
 * Computed lazily when the user clicks a circled info icon, so dashboard render stays fast.
 */

import type {
  FinancialRecord,
  InvoiceOffer,
  Lead,
  Project,
  Task,
  Ticket,
  TicketStatusDef,
} from "../../types/index.ts";
import type { Language } from "../translations.ts";
import type {
  InvoicingStatusRow,
  PerformanceOverviewData,
} from "../../components/dashboard/performance/types.ts";
import type {
  MetricBreakdownItem,
  MetricBreakdownPayload,
} from "../../components/dashboard/performance/MetricBreakdownDrawer.tsx";
import { isPipelineLead, isWonLeadState } from "../dashboardMetrics.ts";
import { movementAmounts } from "../financialOverviewTable.ts";
import { invoiceMovementId } from "../invoiceFinanceBridge.ts";
import { resolveLinkedClient } from "../leadClient.ts";
import { isLiveInvoiceStatus, offerStatusGroup, type OfferStatusDef } from "../offerStatuses.ts";
import { dayDiff, endOfDay, isInRange, parseAppDate, startOfDay } from "./period.ts";
import {
  countNoun,
  days,
  deadlineDistance,
  duration,
  hours,
  makeT,
  money,
  multiplier,
  percent,
  signedMoney,
} from "../../components/dashboard/performance/format.ts";

export interface DashboardBreakdownContext {
  data: PerformanceOverviewData;
  language: Language;
  currencyCode?: string | null;
  leads: readonly Lead[];
  leadStageGroups: Record<string, string>;
  leadStateParents: Record<string, string>;
  invoicesOffers: readonly InvoiceOffer[];
  invoiceStatuses: readonly OfferStatusDef[];
  offerStatuses: readonly OfferStatusDef[];
  financialRecords: readonly FinancialRecord[];
  projects: readonly Project[];
  tasks: readonly Task[];
  tickets: readonly Ticket[];
  ticketStatuses: readonly TicketStatusDef[];
  today: Date;
}

export type DashboardMetricKey =
  | "kpi:revenue"
  | "kpi:conversion"
  | "kpi:offers"
  | "kpi:avgDeal"
  | "invoicing:pipeline"
  | "invoicing:projects"
  | "invoicing:total"
  | "finance:cashflow"
  | "finance:income"
  | "finance:expenses"
  | "finance:recurring"
  | "finance:dso"
  | "projects:profitability"
  | "projects:deadlines"
  | "projects:scopeCreep"
  | "projects:deployments"
  | "projects:throughput"
  | "team:utilization"
  | "team:assignedTasks"
  | "team:reworkRatio"
  | "team:reworkCount"
  | "support:tickets"
  | "support:responseTime";

/** Breakdown for one status row in the "To invoice" section. */
export function buildInvoicingRowBreakdown(
  row: InvoicingStatusRow,
  language: Language,
  currencyCode?: string | null,
): MetricBreakdownPayload {
  const t = makeT(language);
  const isProject = row.id.startsWith("projects:");
  const m = (v: number) => money(v, currencyCode, language, 2);
  const items: MetricBreakdownItem[] = [...row.items]
    .sort((a, b) => b.invoicable - a.invoicable || b.invoicedOpen - a.invoicedOpen || a.name.localeCompare(b.name))
    .map((it) => ({
      id: it.id,
      title: it.name,
      subtitle: [
        it.clientName && it.clientName !== it.name ? it.clientName : null,
        isProject && it.totalBudget > 0
          ? `${t("Value", "Hodnota", "Érték")}: ${m(it.totalBudget)} · ${t("Invoiced", "Fakturované", "Számlázva")}: ${m(it.invoiced)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
      value: m(it.invoicable),
      secondaryValue:
        it.invoicedOpen > 0
          ? `${t("Unpaid invoiced", "Neuhradené faktúry", "Kifizetetlen számlák")}: ${m(it.invoicedOpen)}`
          : undefined,
      href: it.url,
    }));

  return {
    title: row.label,
    subtitle: isProject
      ? t("Projects & Deliveries", "Projekty a Realizácie", "Projektek és Megvalósítások")
      : t("Deals & Pipeline", "Obchody a Pipeline", "Üzletek és Pipeline"),
    formula: isProject
      ? t(
          "Sum of not-yet-invoiced amounts (project value minus issued/planned invoices) for non-archived projects in this status. Unpaid issued invoices are shown separately.",
          "Súčet zatiaľ nevyfakturovaných súm (hodnota projektu mínus vystavené/plánované faktúry) pre nearchivované projekty v tomto stave. Neuhradené faktúry sú uvedené osobitne.",
          "A még nem számlázott összegek összege (projekt értéke mínusz kiállított/tervezett számlák) az ebben a státuszban lévő aktív projekteknél. A kifizetetlen számlák külön láthatók.",
        )
      : t(
          "Sum of active lead values in this pipeline stage.",
          "Súčet hodnôt aktívnych leadov v tejto fáze pipeline.",
          "Az aktív leadek értékeinek összege ebben a pipeline fázisban.",
        ),
    totalLabel: isProject
      ? t("Not yet invoiced", "Zatiaľ nevyfakturované", "Még nem számlázott")
      : t("Total", "Spolu", "Összesen"),
    totalValue: m(row.value),
    secondaryTotalLabel: row.invoicedOpen > 0 ? t("Unpaid invoiced", "Neuhradené faktúry", "Kifizetetlen számlák") : undefined,
    secondaryTotalValue: row.invoicedOpen > 0 ? m(row.invoicedOpen) : undefined,
    items,
  };
}

export function buildDashboardBreakdown(
  key: DashboardMetricKey,
  ctx: DashboardBreakdownContext,
): MetricBreakdownPayload {
  const {
    data,
    language,
    currencyCode,
    leads,
    leadStageGroups,
    leadStateParents,
    invoicesOffers,
    invoiceStatuses,
    offerStatuses,
    financialRecords,
    projects,
    tickets,
    today,
  } = ctx;
  const t = makeT(language);
  const m = (v: number | null, dec = 0) => money(v, currencyCode, language, dec);
  const { period, labels } = data;
  const pStart = period.start ? startOfDay(period.start) : null;
  const pEnd = period.end ? endOfDay(period.end) : null;

  const periodLeads = () =>
    leads.filter((l) => {
      if (l.id === "unassigned-docs" || l.archived || !l.createdAt) return false;
      if (!isPipelineLead(l)) return false;
      return isInRange(parseAppDate(l.createdAt), pStart, pEnd);
    });

  switch (key) {
    case "kpi:revenue":
    case "kpi:avgDeal": {
      const won = periodLeads()
        .filter((l) => isWonLeadState(l.status, leadStageGroups, leadStateParents))
        .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
      const isAvg = key === "kpi:avgDeal";
      return {
        title: isAvg
          ? t("Average deal value", "Priemerná hodnota zákazky", "Átlagos megrendelésérték")
          : t("Revenue · closed deals", "Obrat · uzavreté obchody", "Árbevétel · lezárt ügyletek"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: isAvg
          ? t(
              "Total value of won pipeline leads created in the selected period divided by the number of won deals.",
              "Celková hodnota vyhraných leadov vytvorených vo zvolenom období vydelená ich počtom.",
              "A kiválasztott időszakban létrehozott megnyert leadek összértéke osztva a darabszámukkal.",
            )
          : t(
              "Sum of deal values of won pipeline leads created in the selected period.",
              "Súčet hodnôt vyhraných leadov vytvorených vo zvolenom období.",
              "A kiválasztott időszakban létrehozott megnyert leadek értékeinek összege.",
            ),
        totalLabel: isAvg ? t("Average", "Priemer", "Átlag") : t("Total", "Spolu", "Összesen"),
        totalValue: isAvg ? m(data.kpis.averageDeal.value) : m(data.kpis.revenue.value),
        secondaryTotalLabel: isAvg ? t("Deals", "Zákazky", "Ügyletek") : undefined,
        secondaryTotalValue: isAvg ? String(won.length) : undefined,
        items: won.map((l) => ({
          id: l.id,
          title: l.name || `Lead #${l.id}`,
          subtitle: [l.status, l.owner, l.createdAt?.slice(0, 10)].filter(Boolean).join(" · "),
          value: m(Number(l.value) || 0, 2),
          href: `#leads?lead=${encodeURIComponent(l.id)}`,
        })),
      };
    }

    case "kpi:conversion": {
      const all = periodLeads();
      const sorted = [...all].sort((a, b) => {
        const aw = isWonLeadState(a.status, leadStageGroups, leadStateParents) ? 0 : 1;
        const bw = isWonLeadState(b.status, leadStageGroups, leadStateParents) ? 0 : 1;
        return aw - bw || (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      return {
        title: t("Lead → client conversion", "Konverzia lead → klient", "Lead → ügyfél konverzió"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Share of pipeline leads created in the period that reached a won stage.",
          "Podiel pipeline leadov vytvorených v období, ktoré dosiahli vyhraný stav.",
          "Az időszakban létrehozott pipeline leadek megnyert aránya.",
        ),
        totalLabel: t("Conversion", "Konverzia", "Konverzió"),
        totalValue: percent(data.kpis.leadConversion.ratePct, language),
        secondaryTotalLabel: t("Won / Total", "Vyhrané / Spolu", "Megnyert / Összes"),
        secondaryTotalValue: `${data.kpis.leadConversion.converted} / ${data.kpis.leadConversion.total}`,
        items: sorted.map((l) => {
          const won = isWonLeadState(l.status, leadStageGroups, leadStateParents);
          return {
            id: l.id,
            title: l.name || `Lead #${l.id}`,
            subtitle: [l.status, l.owner, l.createdAt?.slice(0, 10)].filter(Boolean).join(" · "),
            badge: won ? t("Won", "Vyhrané", "Megnyert") : undefined,
            badgeTone: won ? "good" : "neutral",
            value: m(Number(l.value) || 0, 2),
            href: `#leads?lead=${encodeURIComponent(l.id)}`,
          };
        }),
      };
    }

    case "kpi:offers": {
      const todayStart = startOfDay(today);
      const decided: { offer: InvoiceOffer; outcome: "won" | "lost" | "expired" }[] = [];
      for (const offer of invoicesOffers) {
        if (offer.type !== "price_offer") continue;
        const group = offerStatusGroup(offer.status, offerStatuses);
        if (group === "won" || group === "lost") {
          const decidedAt = parseAppDate(offer.statusChangedAt) ?? parseAppDate(offer.issuedAt) ?? parseAppDate(offer.createdAt);
          if (isInRange(decidedAt, period.start, period.end)) {
            decided.push({ offer, outcome: group });
          }
        } else if (group === "open") {
          const validUntil = parseAppDate(offer.validUntil);
          if (validUntil && validUntil.getTime() < todayStart.getTime() && isInRange(validUntil, period.start, period.end)) {
            decided.push({ offer, outcome: "expired" });
          }
        }
      }
      return {
        title: t("Price offer success rate", "Úspešnosť cenových ponúk", "Árajánlatok sikeressége"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Accepted price offers divided by all closed offers (accepted, rejected, or expired) in the period.",
          "Prijaté cenové ponuky delené všetkými uzavretými ponukami (prijaté, zamietnuté alebo po platnosti) v období.",
          "Elfogadott árajánlatok osztva az időszakban lezárt (elfogadott, elutasított vagy lejárt) ajánlatokkal.",
        ),
        totalLabel: t("Success rate", "Úspešnosť", "Sikeresség"),
        totalValue: percent(data.kpis.offerSuccess.ratePct, language),
        secondaryTotalLabel: t("Accepted / Closed", "Prijaté / Uzavreté", "Elfogadott / Lezárt"),
        secondaryTotalValue: `${data.kpis.offerSuccess.accepted} / ${data.kpis.offerSuccess.closed}`,
        items: decided.map(({ offer, outcome }) => ({
          id: offer.id,
          title: offer.documentNumber ? `${offer.documentNumber} · ${offer.clientName || offer.title}` : offer.title,
          subtitle: [offer.subject, offer.issuedAt?.slice(0, 10)].filter(Boolean).join(" · "),
          badge:
            outcome === "won"
              ? t("Accepted", "Prijatá", "Elfogadott")
              : outcome === "expired"
                ? t("Expired", "Po platnosti", "Lejárt")
                : t("Rejected", "Zamietnutá", "Elutasított"),
          badgeTone: outcome === "won" ? "good" : outcome === "expired" ? "warn" : "bad",
          value: m(Number(offer.totalPrice) || 0, 2),
          href: "#price_offers",
        })),
      };
    }

    case "invoicing:pipeline":
    case "invoicing:projects":
    case "invoicing:total": {
      const rows =
        key === "invoicing:pipeline"
          ? data.invoicing.pipeline.rows
          : key === "invoicing:projects"
            ? data.invoicing.projects.rows
            : [...data.invoicing.pipeline.rows, ...data.invoicing.projects.rows];
      const includedRows = rows.filter((r) => r.included);
      const flat = includedRows.flatMap((r) =>
        r.items.map((it) => ({ ...it, statusLabel: r.label })),
      );
      const openTotal = includedRows.reduce((s, r) => s + (r.invoicedOpen || 0), 0);
      const totalVal =
        key === "invoicing:pipeline"
          ? data.invoicing.pipeline.total
          : key === "invoicing:projects"
            ? data.invoicing.projects.total
            : data.invoicing.total;
      return {
        title:
          key === "invoicing:pipeline"
            ? t("Deals and Pipeline", "Obchody a Pipeline", "Üzletek és Pipeline")
            : key === "invoicing:projects"
              ? t("Projects and Deliveries", "Projekty a Realizácie", "Projektek és Megvalósítások")
              : t("Total to invoice", "Spolu na fakturovanie", "Összes számlázandó"),
        subtitle: countNoun("item", flat.length, language),
        formula: t(
          "Includes all leads and projects in currently checked statuses. Unticked statuses are excluded from the total.",
          "Zahŕňa všetky leady a projekty v zaškrtnutých stavoch. Odškrtnuté stavy nie sú v sume.",
          "Az összes bepipált státuszban lévő leadet és projektet tartalmazza. A kipipálatlan státuszok kimaradnak.",
        ),
        totalLabel: t("Total to invoice", "Spolu na fakturovanie", "Összes számlázandó"),
        totalValue: m(totalVal, 2),
        secondaryTotalLabel: openTotal > 0 ? t("Unpaid invoiced", "Neuhradené faktúry", "Kifizetetlen számlák") : undefined,
        secondaryTotalValue: openTotal > 0 ? m(openTotal, 2) : undefined,
        items: flat
          .sort((a, b) => b.invoicable - a.invoicable || b.invoicedOpen - a.invoicedOpen || a.name.localeCompare(b.name))
          .map((it) => ({
            id: `${it.type}:${it.id}`,
            title: it.name,
            subtitle: [it.statusLabel, it.clientName && it.clientName !== it.name ? it.clientName : null].filter(Boolean).join(" · "),
            value: m(it.invoicable, 2),
            secondaryValue: it.invoicedOpen > 0 ? `${t("Unpaid", "Neuhradené", "Fizetetlen")}: ${m(it.invoicedOpen, 2)}` : undefined,
            href: it.url,
          })),
      };
    }

    case "finance:cashflow":
    case "finance:income":
    case "finance:expenses": {
      const wantType = key === "finance:income" ? "income" : key === "finance:expenses" ? "expense" : null;
      const inRange = financialRecords
        .filter((r) => {
          if (r.status === "cancelled" || r.isRecurring) return false;
          if (wantType && r.type !== wantType) return false;
          const dt = parseAppDate(r.paidDate || r.issueDate);
          return isInRange(dt, pStart, pEnd);
        })
        .map((r) => {
          const { real, estimated } = movementAmounts(r);
          return { r, amt: real + estimated };
        })
        .filter(({ amt }) => amt > 0)
        .sort((a, b) => (b.r.paidDate || b.r.issueDate || "").localeCompare(a.r.paidDate || a.r.issueDate || ""));

      const net = data.cashflow.periodIncome - data.cashflow.periodExpenses;
      return {
        title:
          key === "finance:income"
            ? t("Cashflow · Income", "Cashflow · Príjmy", "Cashflow · Bevételek")
            : key === "finance:expenses"
              ? t("Cashflow · Expenses", "Cashflow · Výdavky", "Cashflow · Kiadások")
              : "Cashflow",
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Non-cancelled income and expense movements in the selected period from Financial management.",
          "Nezrušené príjmové a výdavkové pohyby vo zvolenom období z Finančného prehľadu.",
          "A kiválasztott időszak nem törölt bevételi és kiadási tételei a Pénzügyi áttekintésből.",
        ),
        totalLabel:
          key === "finance:income"
            ? t("Income", "Príjmy", "Bevétel")
            : key === "finance:expenses"
              ? t("Expenses", "Výdavky", "Kiadások")
              : t("Net flow", "Čistý tok", "Nettó forgalom"),
        totalValue:
          key === "finance:income"
            ? m(data.cashflow.periodIncome, 2)
            : key === "finance:expenses"
              ? m(data.cashflow.periodExpenses, 2)
              : signedMoney(net, currencyCode, language),
        items: inRange.map(({ r, amt }) => ({
          id: r.id,
          title: r.title || r.invoiceNumber || r.id,
          subtitle: [r.paidDate || r.issueDate, r.categoryPath || r.status].filter(Boolean).join(" · "),
          badge: r.type === "income" ? t("Income", "Príjem", "Bevétel") : t("Expense", "Výdavok", "Kiadás"),
          badgeTone: r.type === "income" ? "good" : "bad",
          value: signedMoney(r.type === "income" ? amt : -amt, currencyCode, language),
          href: "#financial",
        })),
      };
    }

    case "finance:recurring": {
      const rules = financialRecords.filter((r) => r.type === "income" && r.isRecurring && r.status !== "cancelled");
      return {
        title: t("Recurring income", "Rekurentné príjmy", "Ismétlődő bevételek"),
        subtitle: labels.current || t("Monthly run-rate", "Mesačný základ", "Havi alap"),
        formula: t(
          "Active recurring income schedules normalized to a monthly amount.",
          "Aktívne pravidelné príjmy prepočítané na mesačnú sumu.",
          "Aktív ismétlődő bevételek havi összegre átszámítva.",
        ),
        totalLabel: t("Monthly", "Mesačne", "Havonta"),
        totalValue: m(data.recurringIncome.monthly, 2),
        secondaryTotalLabel: t("Yearly", "Ročne", "Évente"),
        secondaryTotalValue: m(data.recurringIncome.yearly, 2),
        items:
          rules.length > 0
            ? rules.map((r) => ({
                id: r.id,
                title: r.title || r.id,
                subtitle: [r.categoryPath, r.recurringFrequency].filter(Boolean).join(" · "),
                value: m(Number(r.amountPlanned || r.amountReal) || 0, 2),
                href: "#financial",
              }))
            : data.recurringIncome.breakdown.map((b, idx) => ({
                id: `rec-${idx}`,
                title: b.other ? t("Other", "Ostatné", "Egyéb") : b.label,
                value: m(b.amount, 2),
                href: "#financial",
              })),
      };
    }

    case "finance:dso": {
      const ledger = new Map(financialRecords.map((r) => [r.id, r]));
      const leadList = leads as Lead[];
      const leadById = new Map(leadList.map((l) => [l.id, l]));
      const projectById = new Map(projects.map((p) => [p.id, p]));
      const linkedIds = new Set<string>();
      const counted: { id: string; title: string; subtitle: string; days: number; term: number | null; href?: string }[] = [];

      for (const inv of invoicesOffers) {
        const movId = invoiceMovementId(inv.id);
        linkedIds.add(movId);
        if (inv.type !== "invoice" || !isLiveInvoiceStatus(inv.status, invoiceStatuses)) continue;
        const issued = parseAppDate(inv.issuedAt);
        const paid = parseAppDate(ledger.get(movId)?.paidDate);
        if (!issued || !paid || !isInRange(paid, period.start, period.end)) continue;
        const due = parseAppDate(inv.dueDate);
        const lead = inv.leadId ? leadById.get(inv.leadId) : undefined;
        const client = inv.clientId ? leadById.get(inv.clientId) : lead ? resolveLinkedClient(lead, leadList) ?? lead : undefined;
        counted.push({
          id: inv.id,
          title: inv.documentNumber ? `${inv.documentNumber} · ${client?.name || inv.clientName || inv.title}` : client?.name || inv.title,
          subtitle: `${inv.issuedAt?.slice(0, 10)} → ${ledger.get(movId)?.paidDate?.slice(0, 10)}`,
          days: Math.max(0, dayDiff(issued, paid)),
          term: due ? Math.max(0, dayDiff(issued, due)) : null,
          href: "#financial",
        });
      }
      for (const rec of financialRecords) {
        if (linkedIds.has(rec.id)) continue;
        if (rec.type !== "income" || rec.status !== "paid" || rec.isRecurring) continue;
        if (!(rec.subtype === "invoice" || Boolean(rec.invoiceNumber?.trim()) || Boolean(rec.projectId))) continue;
        const issued = parseAppDate(rec.issueDate);
        const paid = parseAppDate(rec.paidDate);
        if (!issued || !paid || !isInRange(paid, period.start, period.end)) continue;
        const due = parseAppDate(rec.dueDate);
        const proj = rec.projectId ? projectById.get(rec.projectId) : undefined;
        counted.push({
          id: rec.id,
          title: rec.title || rec.invoiceNumber || rec.id,
          subtitle: [proj?.name, `${rec.issueDate?.slice(0, 10)} → ${rec.paidDate?.slice(0, 10)}`].filter(Boolean).join(" · "),
          days: Math.max(0, dayDiff(issued, paid)),
          term: due ? Math.max(0, dayDiff(issued, due)) : null,
          href: rec.projectId ? `#projects/${encodeURIComponent(rec.projectId)}` : "#financial",
        });
      }
      counted.sort((a, b) => b.days - a.days);
      return {
        title: t("DSO · collection time", "DSO · doba inkasa", "DSO · beszedési idő"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Mean calendar days between issue date and paid date across paid invoices settled in the period (both Invoicing and Project/imported ledger invoices).",
          "Priemerný počet kalendárnych dní medzi dátumom vystavenia a úhrady uhradených faktúr v období (vrátane projektových a importovaných faktúr).",
          "A számla kiállítása és kifizetése között eltelt átlagos naptári napok száma az időszakban kifizetett számláknál (projekt- és importált számlákkal együtt).",
        ),
        totalLabel: t("Average", "Priemer", "Átlag"),
        totalValue: days(data.dso.averageDays, language),
        secondaryTotalLabel: data.dso.paymentTermDays !== null ? t("Payment term", "Splatnosť", "Fizetési határidő") : undefined,
        secondaryTotalValue: data.dso.paymentTermDays !== null ? days(data.dso.paymentTermDays, language) : undefined,
        items: counted.map((c) => ({
          id: c.id,
          title: c.title,
          subtitle: c.subtitle,
          value: days(c.days, language),
          secondaryValue: c.term !== null ? `${t("Term", "Splatnosť", "Határidő")}: ${days(c.term, language)}` : undefined,
          href: c.href,
        })),
      };
    }

    case "projects:profitability":
      return {
        title: t("Project profitability", "Ziskovosť projektov", "Projektek jövedelmezősége"),
        subtitle: countNoun("project", data.profitability.total.projects, language),
        formula: t(
          "Profit = Invoiced − Costs (paid project expenses + tracked labour costs). Includes active projects and inactive ones with costs in the last 30 days.",
          "Zisk = Fakturované − Náklady (uhradené výdavky projektu + mzdové náklady z evidencie času). Zahŕňa aktívne a nedávno zaťažené neaktívne projekty.",
          "Nyereség = Számlázott − Költségek (kifizetett projektkiadások + időkövetési munkaköltség). Aktív és az elmúlt 30 napban költséggel terhelt projektek.",
        ),
        totalLabel: t("Total profit", "Celkový zisk", "Összes nyereség"),
        totalValue: signedMoney(data.profitability.total.profit, currencyCode, language),
        secondaryTotalLabel: t("Costs / invoiced", "Náklady / fakt.", "Költség / száml."),
        secondaryTotalValue: percent(data.profitability.total.costRatioPct, language, 0),
        items: data.profitability.rows.map((r) => ({
          id: r.projectId,
          title: r.name,
          subtitle: [
            r.clientName || null,
            `${t("Invoiced", "Fakt.", "Száml.")}: ${m(r.invoiced)} · ${t("Costs", "Nákl.", "Költs.")}: ${m(r.costs)}`,
          ]
            .filter(Boolean)
            .join(" · "),
          badge: r.inactive ? t("Inactive", "Neaktívny", "Inaktív") : undefined,
          value: signedMoney(r.profit, currencyCode, language),
          secondaryValue: r.costRatioPct !== null ? percent(r.costRatioPct, language, 0) : undefined,
          href: `#projects/${encodeURIComponent(r.projectId)}`,
        })),
      };

    case "projects:deadlines":
      return {
        title: t("Project deadlines", "Termíny projektov", "Projektek határidői"),
        subtitle: `${data.deadlines.overdue} ${t("overdue", "po termíne", "lejárt")} · ${data.deadlines.soon} ${t("within 14 days", "do 14 dní", "14 napon belül")} · ${data.deadlines.later} ${t("later", "neskôr", "később")}`,
        formula: t(
          "Active non-archived projects with a deadline set, ordered by nearest deadline first.",
          "Aktívne nearchivované projekty s nastaveným termínom, zoradené od najbližšieho.",
          "Aktív, határidővel rendelkező projektek a legközelebbi határidő szerint rendezve.",
        ),
        items: data.deadlines.rows.map((r) => ({
          id: r.projectId,
          title: r.name,
          subtitle: [r.clientName, r.deadline.toISOString().slice(0, 10)].filter(Boolean).join(" · "),
          badge: deadlineDistance(r.daysFromToday, language),
          badgeTone: r.tone === "overdue" ? "bad" : r.tone === "soon" ? "warn" : "neutral",
          value: r.deadline.toISOString().slice(0, 10),
          href: `#projects/${encodeURIComponent(r.projectId)}`,
        })),
      };

    case "projects:scopeCreep":
      return {
        title: "Scope creep",
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Acceptance criteria added after the project's scope was approved, compared against the original approved scope.",
          "Akceptačné kritériá pridané po schválení rozsahu projektu v porovnaní s pôvodným rozsahom.",
          "A projekt terjedelmének jóváhagyása után hozzáadott elfogadási kritériumok az eredetihez képest.",
        ),
        totalLabel: t("Added", "Pridané", "Hozzáadott"),
        totalValue: data.scopeCreep ? `+${data.scopeCreep.addedInPeriod}` : "—",
        items: (data.scopeCreep?.rows ?? []).map((r) => ({
          id: r.projectId,
          title: r.name,
          subtitle: `${t("Original scope", "Pôvodný rozsah", "Eredeti")}: ${r.original}`,
          value: `+${r.added}`,
          href: `#projects/${encodeURIComponent(r.projectId)}`,
        })),
      };

    case "projects:deployments":
      return {
        title: t("Server deployments", "Nasadenia na server", "Szerver telepítések"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "GitHub pushes recorded in the selected period across projects paired with a repository.",
          "Pushe z GitHubu zaznamenané v období na projektoch prepojených s repozitárom.",
          "Az időszakban rögzített GitHub push-ok a repóval összekötött projekteken.",
        ),
        totalLabel: t("Total pushes", "Spolu pushov", "Összes push"),
        totalValue: data.deployments ? countNoun("push", data.deployments.total, language) : "—",
        items: (data.deployments?.rows ?? []).map((r) => ({
          id: r.projectId,
          title: r.name,
          subtitle: `${t("Latest", "Posledný", "Utolsó")}: ${r.lastPushAt.toISOString().slice(0, 10)}`,
          badge: r.stale ? t("Stale", "Neaktívne", "Régi") : undefined,
          badgeTone: r.stale ? "warn" : "neutral",
          value: countNoun("push", r.pushes, language),
          href: `#projects/${encodeURIComponent(r.projectId)}`,
        })),
      };

    case "projects:throughput":
      return {
        title: t("Task throughput", "Priepustnosť úloh", "Feladatok átfutása"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Average calendar days from task creation to completion across tasks finished in the selected period.",
          "Priemerný počet dní od vytvorenia úlohy po dokončenie pre úlohy dokončené v období.",
          "Átlagos napok száma a feladat létrehozásától a befejezéséig az időszakban lezárt feladatoknál.",
        ),
        totalLabel: t("Average", "Priemer", "Átlag"),
        totalValue: days(data.throughput.averageDays, language),
        items: data.throughput.byProject.map((r) => ({
          id: r.projectId,
          title: r.name,
          value: days(r.days, language),
          href: `#projects/${encodeURIComponent(r.projectId)}`,
        })),
      };

    case "team:utilization":
      return {
        title: t("Utilization · time on bugs", "Utilizácia · čas na bugoch", "Kihasználtság · hibákra fordított idő"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Worked time logged on tasks in the Bug category divided by total worked time in the period.",
          "Odpracovaný čas na úlohách kategórie Bug delený celkovým odpracovaným časom v období.",
          "A Bug kategóriájú feladatokon ledolgozott idő osztva az időszak teljes ledolgozott idejével.",
        ),
        totalLabel: t("Bug share", "Podiel bugov", "Hiba arány"),
        totalValue: data.utilization ? percent(data.utilization.sharePct, language, 0) : "—",
        items: (data.utilization?.rows ?? []).map((r) => ({
          id: r.employeeId,
          title: r.name,
          subtitle: `${hours(r.bugMs, language)} ${t("of", "z", "/")} ${hours(r.totalMs, language)}`,
          value: percent(r.sharePct, language, 0),
        })),
      };

    case "team:assignedTasks":
      return {
        title: t("Assigned tasks", "Pridelené úlohy", "Kiosztott feladatok"),
        subtitle: `${data.assignedTasks.total} ${t("open", "otvorených", "nyitott")} · ${data.assignedTasks.overdue} ${t("overdue", "po termíne", "lejárt")}`,
        formula: t(
          "Count of currently open tasks per assignee (a task with multiple assignees counts for each).",
          "Počet aktuálne otvorených úloh podľa priradeného (úloha s viacerými riešiteľmi sa počíta každému).",
          "Aktuálisan nyitott feladatok száma felelősönként (több felelős esetén mindegyiknél számolva).",
        ),
        totalLabel: t("Open tasks", "Otvorené úlohy", "Nyitott feladatok"),
        totalValue: String(data.assignedTasks.total),
        items: data.assignedTasks.rows.map((r) => ({
          id: r.employeeId,
          title: r.name,
          badge: r.overdue > 0 ? `${r.overdue} ${t("overdue", "po termíne", "lejárt")}` : undefined,
          badgeTone: r.overdue > 0 ? "bad" : "neutral",
          value: countNoun("task", r.open, language),
          href: "#tasks",
        })),
      };

    case "team:reworkRatio":
      return {
        title: t("Rework ratio", "Rework pomer", "Rework arány"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Share of completed tasks in the period that were reopened at least once.",
          "Podiel dokončených úloh v období, ktoré boli aspoň raz znovu otvorené.",
          "Az időszakban befejezett feladatok aránya, amelyeket legalább egyszer újranyitottak.",
        ),
        totalLabel: t("Rework ratio", "Rework pomer", "Rework arány"),
        totalValue: data.reworkRatio ? percent(data.reworkRatio.ratePct, language, 0) : "—",
        items: (data.reworkRatio?.rows ?? []).map((r) => ({
          id: r.employeeId,
          title: r.name,
          subtitle: `${r.reopened} / ${r.completed}`,
          value: percent(r.ratePct, language, 0),
          href: "#tasks",
        })),
      };

    case "team:reworkCount":
      return {
        title: "Rework count",
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Average number of reopenings per reopened task, grouped by project.",
          "Priemerný počet opätovných otvorení na jednu znovuotvorenú úlohu podľa projektu.",
          "Az újranyitások átlagos száma újranyitott feladatonként, projektenként.",
        ),
        totalLabel: t("Average", "Priemer", "Átlag"),
        totalValue: data.reworkCount ? multiplier(data.reworkCount.average, language) : "—",
        items: (data.reworkCount?.byProject ?? []).map((r) => ({
          id: r.projectId,
          title: r.name,
          value: multiplier(r.average, language),
          href: `#projects/${encodeURIComponent(r.projectId)}`,
        })),
      };

    case "support:tickets": {
      const inPeriod = tickets.filter((tk) => !tk.archived && !tk.isArchived && isInRange(parseAppDate(tk.createdAt), pStart, pEnd));
      return {
        title: t("Tickets by status", "Tickety podľa stavu", "Jegyek státusz szerint"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "All non-archived support tickets created in the selected period, grouped by status category.",
          "Všetky nearchivované tickety vytvorené v období, rozdelené podľa kategórie stavu.",
          "Az időszakban létrehozott összes nem archivált támogatási jegy státuszkategória szerint.",
        ),
        totalLabel: t("Total tickets", "Spolu ticketov", "Összes jegy"),
        totalValue: countNoun("ticket", data.ticketsByStatus.total, language),
        items: inPeriod.slice(0, 100).map((tk) => ({
          id: tk.id,
          title: tk.title || tk.ticketNumber || tk.id,
          subtitle: [tk.ticketNumber, tk.createdAt?.slice(0, 10)].filter(Boolean).join(" · "),
          value: tk.status || "—",
          href: "#tickets",
        })),
      };
    }

    case "support:responseTime": {
      const answered = tickets
        .filter((tk) => !tk.archived && !tk.isArchived && (tk.slaFirstRespondedAt || tk.firstRespondedAt) && isInRange(parseAppDate(tk.createdAt), pStart, pEnd))
        .map((tk) => {
          const created = parseAppDate(tk.createdAt);
          const replied = parseAppDate(tk.slaFirstRespondedAt || tk.firstRespondedAt);
          const ms = created && replied ? Math.max(0, replied.getTime() - created.getTime()) : null;
          return { tk, ms };
        })
        .filter((x): x is { tk: Ticket; ms: number } => x.ms !== null)
        .sort((a, b) => b.ms - a.ms);
      return {
        title: t("Average response time", "Priemerná reakčná doba", "Átlagos reakcióidő"),
        subtitle: labels.current || t("All time", "Celé obdobie", "Teljes időszak"),
        formula: t(
          "Average time from ticket creation to first response across tickets created in the period.",
          "Priemerný čas od prijatia ticketu po prvú odpoveď pre tickety vytvorené v období.",
          "Átlagos idő a jegy beérkezésétől az első válaszig az időszakban létrehozott jegyeknél.",
        ),
        totalLabel: t("Average", "Priemer", "Átlag"),
        totalValue: duration(data.responseTime.averageMs, language),
        secondaryTotalLabel: data.responseTime.withinSlaPct !== null ? t("Within SLA", "V SLA", "SLA-n belül") : undefined,
        secondaryTotalValue: data.responseTime.withinSlaPct !== null ? percent(data.responseTime.withinSlaPct, language, 0) : undefined,
        items: answered.slice(0, 100).map(({ tk, ms }) => ({
          id: tk.id,
          title: tk.title || tk.ticketNumber || tk.id,
          subtitle: [tk.ticketNumber, tk.createdAt?.slice(0, 10)].filter(Boolean).join(" · "),
          value: duration(ms, language),
          href: "#tickets",
        })),
      };
    }
  }
}
