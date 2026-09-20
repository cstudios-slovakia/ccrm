import { useMemo } from "react";
import { parseAppHash } from "../utils/hash";
import type { Language } from "../utils/translations";

export interface ScreenContextInfo {
  route: string;
  category: string;
  title: string;
  detail?: string;
  summary: string;
}

export function useCurrentScreenContext(activeTab: string, language: Language = "en"): ScreenContextInfo {
  return useMemo(() => {
    const { route, params } = parseAppHash(activeTab || (typeof window !== "undefined" ? window.location.hash : ""));
    const rawRoute = route.toLowerCase();

    // 1. Client Detail (#client-<name>)
    if (rawRoute.startsWith("client-")) {
      const clientName = decodeURIComponent(route.substring(7)).replace(/_/g, " ");
      const subTab = params.get("tab") || "overview";
      return {
        route,
        category: "client",
        title: `Client: ${clientName}`,
        detail: `Section: ${subTab}`,
        summary: `The user is currently viewing the detail profile of Client "${clientName}" (Active Sub-tab: ${subTab}). They can see this client's history, contacts, financial status, and associated projects.`
      };
    }

    // 2. Lead Detail (#lead-<id>)
    if (rawRoute.startsWith("lead-")) {
      const leadId = decodeURIComponent(route.substring(5));
      return {
        route,
        category: "lead",
        title: `Lead #${leadId}`,
        summary: `The user is currently viewing Lead #${leadId} detail view, including contact information, deal stage, budget, timeline, and communication notes.`
      };
    }

    // 3. Main Views
    switch (rawRoute) {
      case "dashboard":
        return {
          route,
          category: "dashboard",
          title: language === "sk" ? "Prehľad nástenky" : language === "hu" ? "Vezérlőpult" : "Dashboard Overview",
          summary: "The user is on the main executive dashboard viewing global KPIs, company metrics, conversion trends, and top priorities."
        };

      case "leads":
        return {
          route,
          category: "leads",
          title: language === "sk" ? "Záujemcovia (Leads)" : language === "hu" ? "Érdeklődők (Leads)" : "Leads Pipeline",
          summary: "The user is on the Leads pipeline board viewing incoming inquiries, qualification stages, potential deal values, and lead conversion rates."
        };

      case "clients":
        return {
          route,
          category: "clients",
          title: language === "sk" ? "Zoznam klientov" : language === "hu" ? "Ügyfelek listája" : "Clients Directory",
          summary: "The user is on the Clients directory browsing active corporate accounts, contract values, contacts, and client health scores."
        };

      case "projects": {
        const projectId = params.get("id");
        return {
          route,
          category: "projects",
          title: projectId ? `Project #${projectId}` : (language === "sk" ? "Projekty" : language === "hu" ? "Projektek" : "Projects Management"),
          detail: projectId ? `Project ID: ${projectId}` : undefined,
          summary: projectId
            ? `The user is viewing project #${projectId} with task breakdowns, assigned team members, and milestones.`
            : "The user is on the Projects board viewing ongoing deliverables, deadlines, team capacity, and project progress."
        };
      }

      case "finances":
      case "financial": {
        const invoiceNum = params.get("invoice");
        return {
          route,
          category: "finances",
          title: invoiceNum ? `Invoice: ${invoiceNum}` : (language === "sk" ? "Financie a fakturácia" : language === "hu" ? "Pénzügyek és számlázás" : "Financials & Invoicing"),
          summary: invoiceNum
            ? `The user is inspecting invoice ${invoiceNum}, including payment status, due dates, and tax breakdowns.`
            : "The user is on the Financial Management view reviewing revenue, recurring MRR, pending vendor bills, overdue customer receivables, and cashflow projections."
        };
      }

      case "tasks":
        return {
          route,
          category: "tasks",
          title: language === "sk" ? "Úlohy a to-do" : language === "hu" ? "Feladatok és teendők" : "Task Board",
          summary: "The user is on the Tasks panel managing prioritized assignments, team task completion, overdue items, and reminders."
        };

      case "meetings":
        return {
          route,
          category: "meetings",
          title: language === "sk" ? "Stretnutia a zápisy" : language === "hu" ? "Megbeszélések" : "Meetings & Notes",
          summary: "The user is viewing scheduled executive meetings, client conference notes, and audio transcripts."
        };

      case "rag-ai":
      case "csuite":
        return {
          route,
          category: "rag-ai",
          title: language === "sk" ? "Výkonná rada vedenia" : language === "hu" ? "Vezetői tanácsadó RAG" : "Executive Council Room",
          summary: "The user is in the Executive RAG AI consultation boardroom interacting with specialized C-suite advisory agents."
        };

      case "automation":
        return {
          route,
          category: "automation",
          title: language === "sk" ? "Automatizácie" : language === "hu" ? "Automatizációk" : "Automations & Workflows",
          summary: "The user is on the Workflow Automation builder managing event triggers, webhooks, and automatic lead routing."
        };

      default:
        if (rawRoute.startsWith("settings")) {
          return {
            route,
            category: "settings",
            title: language === "sk" ? "Nastavenia systému" : language === "hu" ? "Rendszerbeállítások" : "System Settings",
            summary: `The user is in the settings area (${rawRoute}) configuring preferences, users, permissions, or integrations.`
          };
        }

        return {
          route,
          category: "general",
          title: route ? route.charAt(0).toUpperCase() + route.slice(1) : "Overview",
          summary: `The user is on the "${route || "main"}" workspace view.`
        };
    }
  }, [activeTab, language]);
}
