import { isClientRecord } from "../../../utils/clientRecord.ts";
import type { ChatCrmEntity } from "../api/contract.ts";
import { crmHashForRecord } from "../lib/routes.ts";
import type { DemoDirectory } from "./demoDataset.ts";

/** The fields of a lead (or client) and of a project that the demo directory reads. */
interface LeadRow {
  id: string;
  name?: string;
  adjustment?: number;
}
interface ProjectRow {
  id: string;
  name?: string;
}

const MAX_RESULTS = 20;

/** Lower case without accents, so "muller" finds "Müller". */
const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The CRM's leads, clients and projects as the demo module's directory (docs/WHATSAPP-DEMO-MODULE.md C5.4).
 * A client is a lead row with a `client-*` id or a positive adjustment (`isClientRecord`); `url` is the hash
 * the record opens at.
 */
export function buildDemoDirectory(leads: readonly LeadRow[], projects: readonly ProjectRow[]): DemoDirectory {
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const hash = (kind: "lead" | "project", id: string) => `#${crmHashForRecord(kind, id, (leadId) => leadById.get(leadId))}`;

  return {
    get(type, id) {
      if (type === "lead") {
        const lead = leadById.get(id);
        return lead ? { name: lead.name ?? "", isClient: isClientRecord(lead) } : null;
      }
      const project = projectById.get(id);
      return project ? { name: project.name ?? "", isClient: false } : null;
    },
    search(q) {
      const needle = fold(q.trim());
      if (!needle) return [];
      const out: ChatCrmEntity[] = [];
      for (const lead of leads) {
        if (out.length >= MAX_RESULTS) break;
        if (fold(lead.name ?? "").includes(needle)) {
          out.push({ entity_type: "lead", crm_id: lead.id, name: lead.name ?? "", is_client: isClientRecord(lead), url: hash("lead", lead.id) });
        }
      }
      for (const project of projects) {
        if (out.length >= MAX_RESULTS) break;
        if (fold(project.name ?? "").includes(needle)) {
          out.push({ entity_type: "project", crm_id: project.id, name: project.name ?? "", is_client: false, url: hash("project", project.id) });
        }
      }
      return out;
    },
  };
}
