/**
 * Orders that belong to a project (`Order.projectId`).
 *
 * A project lists every order linked to it, newest first. No order is marked
 * "current": an order may be a year old and still be the one being worked on.
 */
import type { Lead, Order, Project } from "../types/index.ts";

type OrderLike = Pick<Order, "id" | "orderDate" | "createdAt" | "orderNumber" | "projectId" | "clientId">;
type ProjectLike = Pick<Project, "clientId" | "leadId">;
type LeadLike = Pick<Lead, "id" | "clientId">;

/** Newest order date first; ties fall back to creation time, then the order number. */
export const compareOrdersNewestFirst = (a: OrderLike, b: OrderLike): number =>
  String(b.orderDate ?? "").localeCompare(String(a.orderDate ?? "")) ||
  String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) ||
  String(b.orderNumber ?? "").localeCompare(String(a.orderNumber ?? ""));

/** The orders linked to a project, newest first. */
export const ordersOfProject = <T extends OrderLike>(orders: readonly T[], projectId: string): T[] =>
  orders.filter((o) => o.projectId === projectId).sort(compareOrdersNewestFirst);

/**
 * Every leads-row id an order of this project's customer may be attached to: the
 * project's client and lead, the client that lead belongs to, and every lead that
 * belongs to one of those clients.
 */
export const projectCustomerIds = (project: ProjectLike, leads: readonly LeadLike[]): Set<string> => {
  const base = new Set<string>();
  if (project.clientId) base.add(project.clientId);
  if (project.leadId) {
    base.add(project.leadId);
    const lead = leads.find((l) => l.id === project.leadId);
    if (lead?.clientId) base.add(lead.clientId);
  }
  const ids = new Set(base);
  for (const l of leads) if (l.id && l.clientId && base.has(l.clientId)) ids.add(l.id);
  return ids;
};

/**
 * Orders that could be linked to the project: not linked to any project yet and
 * attached to the project's customer. A project with no customer offers every
 * unlinked order.
 */
export const linkableOrders = <T extends OrderLike>(
  orders: readonly T[],
  project: ProjectLike,
  leads: readonly LeadLike[],
): T[] => {
  const customers = projectCustomerIds(project, leads);
  return orders
    .filter((o) => !o.projectId && (customers.size === 0 || (!!o.clientId && customers.has(o.clientId))))
    .sort(compareOrdersNewestFirst);
};

/** Projects split for an order's picker: those of the order's customer first, then the rest. */
export const partitionProjectsForOrder = <P extends ProjectLike>(
  projects: readonly P[],
  clientId: string | null | undefined,
  leads: readonly LeadLike[],
): { mine: P[]; others: P[] } => {
  const mine: P[] = [];
  const others: P[] = [];
  for (const p of projects) {
    (clientId && projectCustomerIds(p, leads).has(clientId) ? mine : others).push(p);
  }
  return { mine, others };
};
