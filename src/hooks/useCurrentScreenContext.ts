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
      case "sai":
        return {
          route,
          category: "sai",
          title: language === "sk" ? "SAI — Simulácie trhovej stratégie" : language === "hu" ? "SAI — Piaci Szimuláció" : "SAI — Swarm Market Simulation",
          summary: "The user is on the SAI (Swarm Artificial Intelligence) module for predictive market strategy simulations using autonomous multi-agent personas.\n" +
            "Visible elements on this screen include:\n" +
            "- Hero banner: 'Tesztelje piaci stratégiai lépéseit még a közzététel előtt' (Test market strategy steps before launch)\n" +
            "- Top actions: 'Szimulációk', 'Demó mód: BE/KI', 'Folyamatbemutató' (Process walkthrough), and '+ Új piaci szimuláció indítása' (Start new simulation)\n" +
            "- Interactive demo card: 'Q4 Enterprise átszervezés és árazás' (+25% price increase, 99.9% SLA, WhatsApp support), 'War Room' deliberation access, and 'Ugrás a végső eredményekhez'\n" +
            "- Previous strategic simulations list (Korábbi stratégiai szimulációk), including runs such as 'forbes test 4 (Pure Markdown)', 'forbes test 3' (with 15 autonomous agents, 8/8 rounds), and 'Belépés a War Roomba' (Enter War Room) action buttons."
        };

      case "dashboard":
        return {
          route,
          category: "dashboard",
          title: language === "sk" ? "Prehľad nástenky" : language === "hu" ? "Vezérlőpult" : "Dashboard Overview",
          summary: "The user is on the main executive dashboard viewing company KPIs, monthly revenue / MRR, active leads pipeline, top priority tasks, recent activity feed, and conversion metrics."
        };

      case "leads":
        return {
          route,
          category: "leads",
          title: language === "sk" ? "Záujemcovia (Leads)" : language === "hu" ? "Érdeklődők (Leads)" : "Leads Pipeline",
          summary: "The user is on the Leads pipeline board viewing incoming customer inquiries, lead qualification stages (New, Contacted, Qualified, Proposal, Won, Lost), deal values, assigned sales reps, and conversion rates."
        };

      case "clients":
        return {
          route,
          category: "clients",
          title: language === "sk" ? "Zoznam klientov" : language === "hu" ? "Ügyfelek listája" : "Clients Directory",
          summary: "The user is on the Clients directory browsing corporate accounts, contacts, active project counts, contract values, invoicing totals, and client health scores."
        };

      case "projects": {
        const projectId = params.get("id");
        return {
          route,
          category: "projects",
          title: projectId ? `Project #${projectId}` : (language === "sk" ? "Projekty" : language === "hu" ? "Projektek" : "Projects Management"),
          detail: projectId ? `Project ID: ${projectId}` : undefined,
          summary: projectId
            ? `The user is viewing project #${projectId} with task breakdowns, assigned team members, budget, milestones, deadlines, and delay reason logs.`
            : "The user is on the Projects management board viewing active deliverables, project pipeline status (New, In Progress, Review, Completed), deadlines, countdowns, and team workload."
        };
      }

      case "finances":
      case "financial":
      case "invoices": {
        const invoiceNum = params.get("invoice");
        return {
          route,
          category: "finances",
          title: invoiceNum ? `Invoice: ${invoiceNum}` : (language === "sk" ? "Financie a fakturácia" : language === "hu" ? "Pénzügyek és számlázás" : "Financials & Invoicing"),
          summary: invoiceNum
            ? `The user is inspecting invoice ${invoiceNum}, including payment status (Paid/Overdue/Pending), line items, VAT breakdown, due dates, and client billing info.`
            : "The user is on the Financial Management & Invoicing module reviewing monthly revenue, recurring MRR, issued invoices, vendor bills, overdue receivables, and 30-day cash flow forecast."
        };
      }

      case "tasks":
        return {
          route,
          category: "tasks",
          title: language === "sk" ? "Úlohy a to-do" : language === "hu" ? "Feladatok és teendők" : "Task Board",
          summary: "The user is on the Task management board viewing prioritized kanban columns (To Do, In Progress, Review, Done), deadline warning indicators, assignee workload, and personal reminders."
        };

      case "meetings":
        return {
          route,
          category: "meetings",
          title: language === "sk" ? "Stretnutia a zápisy" : language === "hu" ? "Megbeszélések" : "Meetings & Notes",
          summary: "The user is on the Meetings view reviewing scheduled executive meetings, audio voice recordings, automatic transcripts, key discussion takeaways, and extracted action items."
        };

      case "email":
        return {
          route,
          category: "email",
          title: language === "sk" ? "Emailová schránka" : language === "hu" ? "Email fiók" : "Unified Email Client",
          summary: "The user is in the integrated Email client reviewing unified mailbox folders (Inbox, Sent, Drafts, Trash), client conversation threads, search filters, and email reply composer."
        };

      case "files":
        return {
          route,
          category: "files",
          title: language === "sk" ? "Dokumenty a súbory" : language === "hu" ? "Dokumentumok és fájlok" : "Files & Documents Drive",
          summary: "The user is in the central Document & Files drive browsing folder structures, client attachments, contracts, NDA agreements, certificates, validity dates, and storage."
        };

      case "rag-ai":
      case "rag_ai":
      case "csuite":
        return {
          route,
          category: "rag-ai",
          title: language === "sk" ? "Výkonná rada vedenia (RAG)" : language === "hu" ? "Vezetői tanácsadó RAG" : "Executive Boardroom RAG",
          summary: "The user is in the Executive AI consultation boardroom interacting with specialized C-suite advisory agents (CSO, CFO, GC, CMO, COO, CHRO, CPO) and episodic decision memory."
        };

      case "automation":
        return {
          route,
          category: "automation",
          title: language === "sk" ? "Automatizácie" : language === "hu" ? "Automatizációk" : "Automations & Workflows",
          summary: "The user is in the Workflow Automation builder managing event triggers, webhooks, automatic lead assignment rules, email alerts, and workflow statuses."
        };

      case "social_media":
        return {
          route,
          category: "social_media",
          title: language === "sk" ? "Sociálne siete" : language === "hu" ? "Közösségi média" : "Social Media Planner",
          summary: "The user is in the Social Media campaign manager viewing post scheduling calendar, multi-platform publishing (LinkedIn, Facebook, Instagram), engagement metrics, and draft posts."
        };

      case "warehouse":
        return {
          route,
          category: "warehouse",
          title: language === "sk" ? "Sklad a zásoby" : language === "hu" ? "Raktár és készlet" : "Warehouse & Inventory",
          summary: "The user is in the Warehouse & Inventory module managing product SKUs, stock levels, warehouse locations, minimum inventory thresholds, suppliers, and reorder alerts."
        };

      case "updates":
        return {
          route,
          category: "updates",
          title: language === "sk" ? "Novinky a aktualizácie" : language === "hu" ? "Rendszerfrissítések" : "System Updates & Changelog",
          summary: "The user is on the System Updates view browsing release notes, product updates, and version changelog loaded from Craft CMS."
        };

      default:
        if (rawRoute.startsWith("settings") || rawRoute === "personal-settings") {
          return {
            route,
            category: "settings",
            title: language === "sk" ? "Nastavenia systému" : language === "hu" ? "Rendszerbeállítások" : "System Settings",
            summary: `The user is in the settings area (${rawRoute}) configuring integrations (OpenAI API key, Vector DB, WhatsApp, Microsoft ToDo), user account permissions, team members, or company profile.`
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
