import React, { useMemo } from "react";
import { Plus, Unlink } from "lucide-react";
import type { Lead, Order, Project } from "../../types";
import type { Language } from "../../utils/translations";
import { useOrderStatuses } from "../../hooks/useOrderStatuses";
import { orderStatusColor, orderStatusLabel } from "../../utils/orders";
import { formatMoney } from "../../utils/currency";
import { formatDateLocalized } from "../../utils/localTime";
import { linkableOrders, ordersOfProject } from "../../utils/projectOrders";
import { entityAccentStyle } from "../../utils/entityAccent";
import { EntityBadge } from "../tremor/EntityBadge";
import { SectionIcon } from "../icons/SectionIcon";
import { CustomSelect } from "../ui/CustomSelect";

/** What a project card needs to show and change its orders. Absent when the user cannot see orders. */
export interface ProjectOrderLinks {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  canEdit: boolean;
}

interface ProjectOrdersTabProps {
  project: Project;
  links: ProjectOrderLinks;
  leads: Lead[];
  language: Language;
  currency: string;
}

/** Where the project card lives, so an order opened from here can lead back to it. */
const backRoute = (projectId: string) => `projects/${encodeURIComponent(projectId)}?tab=orders`;

/**
 * The project card's Orders tab: every order linked to the project, newest first. No order is
 * marked as current. New orders start from here with the project's customer prefilled, and an
 * existing order of that customer can be linked or unlinked.
 */
export const ProjectOrdersTab: React.FC<ProjectOrdersTabProps> = ({ project, links, leads, language, currency }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);
  const statuses = useOrderStatuses();
  const { orders, setOrders, canEdit } = links;

  const linked = useMemo(() => ordersOfProject(orders, project.id), [orders, project.id]);
  const linkable = useMemo(() => linkableOrders(orders, project, leads), [orders, project, leads]);
  const money = (o: Order) => formatMoney(o.totalGrossAmount || 0, o.currency || currency || "EUR", language);
  const linkOption = (group: string) => (o: Order) => ({
    value: o.id,
    label: `${o.orderNumber} · ${formatDateLocalized(o.orderDate, language)} · ${money(o)}`,
    searchText: `${o.orderNumber} ${o.orderDate}`,
    group,
  });
  const linkGroups = [
    { id: "mine", label: t("This customer's orders", "Objednávky tohto zákazníka", "Az ügyfél rendelései") },
    { id: "others", label: t("Other unlinked orders", "Ostatné neprepojené objednávky", "Egyéb csatolatlan rendelések") },
  ];

  const openOrder = (o: Order) => {
    window.location.hash = `orders/${encodeURIComponent(o.id)}?from=${encodeURIComponent(backRoute(project.id))}`;
  };

  const startNewOrder = () => {
    const customer = project.clientId || project.leadId;
    const params = [
      customer ? `customer=${encodeURIComponent(customer)}` : "",
      `project=${encodeURIComponent(project.id)}`,
      `from=${encodeURIComponent(backRoute(project.id))}`,
    ].filter(Boolean);
    window.location.hash = `orders/new?${params.join("&")}`;
  };

  const setLink = (orderId: string, projectId: string | null) =>
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, projectId } : o)));

  return (
    <div style={entityAccentStyle("orders")} className="flex-1 ws-lg:overflow-y-auto scrollbar-thin ws-lg:pr-1 space-y-4 text-left animate-in fade-in duration-150">
      <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <div>
          <h3 className="text-ui font-semibold text-gray-900 flex items-center gap-2">
            <SectionIcon id="orders" className="h-4 w-4 text-entity-text" />
            {t("Orders of this project", "Objednávky tohto projektu", "A projekt rendelései")}
          </h3>
          <p className="text-caption text-gray-500 mt-0.5">
            {t(
              "All orders linked to this project, newest first. Earlier orders stay here.",
              "Všetky objednávky prepojené s týmto projektom, od najnovšej. Predošlé objednávky tu zostávajú.",
              "A projekthez kapcsolt összes rendelés, a legújabbal kezdve. A korábbi rendelések itt maradnak.",
            )}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-col ws-sm:flex-row gap-2 shrink-0">
            <CustomSelect
              value=""
              onChange={id => id && setLink(id, project.id)}
              placeholder={t("Link existing order", "Prepojiť existujúcu objednávku", "Meglévő rendelés csatolása")}
              searchable
              searchPlaceholder={t("Search orders...", "Hľadať objednávky...", "Rendelések keresése...")}
              groups={linkGroups}
              options={[...linkable.mine.map(linkOption("mine")), ...linkable.others.map(linkOption("others"))]}
            />
            <button
              type="button"
              onClick={startNewOrder}
              className="px-4 py-2 bg-entity-solid hover:bg-entity-solid-hover text-white rounded-md text-ui font-semibold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{t("New order", "Nová objednávka", "Új rendelés")}</span>
            </button>
          </div>
        )}
      </div>

      {linked.length === 0 ? (
        <div className="p-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500 text-caption space-y-1">
          <p className="font-semibold text-gray-700">
            {t("No orders are linked to this project yet.", "K tomuto projektu zatiaľ nie sú prepojené žiadne objednávky.", "Ehhez a projekthez még nincs rendelés csatolva.")}
          </p>
          {canEdit && (
            <p className="text-micro text-gray-400">
              {t("Create a new order here or link an existing one.", "Vytvorte tu novú objednávku alebo prepojte existujúcu.", "Hozzon létre itt új rendelést, vagy csatoljon egy meglévőt.")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {linked.map(o => {
            const color = orderStatusColor(o.status, statuses);
            return (
              <div
                key={o.id}
                className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-2xs hover:border-entity-border transition-all flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <EntityBadge entity="orders" label={o.orderNumber} onClick={() => openOrder(o)} size="sm" />
                    <span className="text-micro text-gray-400 font-mono">{o.orderDate}</span>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-micro font-semibold"
                      style={{ backgroundColor: `${color}18`, color }}
                    >
                      {orderStatusLabel(o.status, t, statuses)}
                    </span>
                  </div>
                  <div className="text-micro text-gray-500">
                    {(o.items || []).length} {t("items", "položiek", "tétel")}
                  </div>
                </div>
                <div className="flex items-center gap-3 justify-between ws-sm:justify-end">
                  <div className="font-mono font-bold text-ui text-gray-900">{money(o)}</div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setLink(o.id, null)}
                      className="p-2 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                      title={t("Unlink from this project", "Odpojiť od tohto projektu", "Leválasztás a projektről")}
                      aria-label={t("Unlink from this project", "Odpojiť od tohto projektu", "Leválasztás a projektről")}
                    >
                      <Unlink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
