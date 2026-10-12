import { createContext, useContext } from "react";
import { DEFAULT_ORDER_STATUS_DEFS, type OrderStatusDef } from "../utils/orders";

/*
  The order statuses configured in settings, handed to every view that
  speaks or paints one. App provides the live list; a view rendered outside
  it still gets the built-in defaults rather than nothing.
*/
const OrderStatusesContext = createContext<readonly OrderStatusDef[]>(DEFAULT_ORDER_STATUS_DEFS);

export const OrderStatusesProvider = OrderStatusesContext.Provider;

export const useOrderStatuses = (): readonly OrderStatusDef[] => useContext(OrderStatusesContext);
