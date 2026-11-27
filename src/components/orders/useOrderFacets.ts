import { useCallback, useMemo } from "react";
import type { Order, Project } from "../../types";
import { useListMultiFilter, usePinnedFilterOptions } from "../../hooks/useListFilter";
import { applyFacets, withCounts, type FacetOption } from "../../utils/facetedFilters";
import { orderStatusColor, orderStatusLabel, type OrderStatusDef } from "../../utils/orders";

export type OrderFacetId = "status" | "customerType" | "payment" | "project";

/** The project facet's value for an order that belongs to no project. */
export const NO_ORDER_PROJECT = "__none__";

type Translate = (en: string, sk: string, hu: string) => string;

interface Input {
  orders: Order[];
  orderStatuses: readonly OrderStatusDef[];
  projects?: Project[];
  searchQuery: string;
  t: Translate;
  productName: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * The orders list's faceted filters (status, customer type, payment, project): multi-select, and
 * each one's option counts come from the orders the OTHER filters and the search leave. The
 * status filter can pin options as chips above the list.
 */
export function useOrderFacets(input: Input) {
  const { orders, orderStatuses, projects = [], t } = input;
  const [status, setStatus] = useListMultiFilter("orders.status");
  const [customerType, setCustomerType] = useListMultiFilter("orders.customerType");
  const [payment, setPayment] = useListMultiFilter("orders.paymentStatus");
  const [project, setProject] = useListMultiFilter("orders.project");
  const [pinnedStatuses, togglePinnedStatus] = usePinnedFilterOptions("orders.status");
  const selection: Record<OrderFacetId, string[]> = { status, customerType, payment, project };
  const setters: Record<OrderFacetId, (v: string[]) => void> = { status: setStatus, customerType: setCustomerType, payment: setPayment, project: setProject };

  const base = useCallback(
    (order: Order) => {
      if (!input.searchQuery.trim()) return true;
      const q = norm(input.searchQuery);
      const clientName = order.billing?.name || order.guest?.name || order.guest?.company || "";
      const phone = order.guest?.phone || order.delivery?.phone || "";
      const full = norm(
        `${order.orderNumber || ""} ${clientName} ${order.guest?.email || ""} ${phone} ${order.shippingTrackingNumber || ""} ${order.delivery?.city || ""}`,
      );
      return full.includes(q);
    },
    [input.searchQuery],
  );

  const defs = useMemo(
    () => [
      { id: "status", valuesOf: (o: Order) => [o.status], selected: status },
      { id: "customerType", valuesOf: (o: Order) => [o.customerType === "guest" ? "guest" : "client"], selected: customerType },
      { id: "payment", valuesOf: (o: Order) => [o.paymentStatus === "paid" ? "paid" : "unpaid"], selected: payment },
      { id: "project", valuesOf: (o: Order) => [o.projectId || NO_ORDER_PROJECT], selected: project },
    ],
    [status, customerType, payment, project],
  );

  const result = useMemo(() => applyFacets(orders, defs, base), [orders, defs, base]);

  const options = useMemo(() => {
    const c = result.counts;
    const out: Record<OrderFacetId, FacetOption[]> = {
      status: withCounts(
        orderStatuses.map((s) => ({ value: s.key, label: orderStatusLabel(s.key, t, orderStatuses), color: orderStatusColor(s.key, orderStatuses) })),
        c.status,
      ),
      customerType: withCounts(
        [
          { value: "client", label: t("Registered clients", `Klienti ${input.productName}`, `${input.productName} ügyfelek`) },
          { value: "guest", label: t("Guests (E-shop)", "Hostia (E-shop)", "Vendég vásárlók") },
        ],
        c.customerType,
      ),
      payment: withCounts(
        [
          { value: "paid", label: t("Paid", "Zaplatené", "Fizetett") },
          { value: "unpaid", label: t("Unpaid", "Nezaplatené", "Kifizetetlen") },
        ],
        c.payment,
      ),
      project: withCounts(
        [
          ...projects.map((p) => ({ value: p.id, label: p.name || p.id })),
          { value: NO_ORDER_PROJECT, label: t("No project", "Bez projektu", "Projekt nélkül") },
        ],
        c.project,
      ),
    };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, orderStatuses, projects, input.productName]);

  return {
    selection,
    setSelection: (id: OrderFacetId, values: string[]) => setters[id](values),
    options,
    filteredOrders: result.items,
    pinnedStatuses,
    togglePinnedStatus,
    allLabels: {
      status: t("All statuses", "Všetky stavy", "Minden állapot"),
      customerType: t("All customers", "Všetci zákazníci", "Minden vevő"),
      payment: t("All payments", "Všetky platby", "Minden fizetés"),
      project: t("All projects", "Všetky projekty", "Minden projekt"),
    } as Record<OrderFacetId, string>,
  };
}
