// Projects a person may log time on without having the projects module.
//
// Such a caller is sent no `projects` collection at all (it is `restricted`). Anyone who
// tracks time may still put it on any active project and create one from the picker (owner
// decision 2026-11-23), so the server sends a slim list in `readScope.timePicker`: every
// active project, client and project type, ids and names only. An older server sends only
// the projects the person works on, in `readScope.referenceNames.projects`.
//
// The stubs below are enough for the picker and the entry rows, nothing to open or edit.

import type { Lead, Project, ProjectType } from "../types";
import type { ReadScope } from "./readScope.ts";

const projectStub = (id: string, name: string, clientId: string | null, status: string): Project => ({
  id,
  projectTypeId: "",
  name,
  leadId: null,
  clientId,
  status,
  managers: [],
  data: {},
  timeline: [],
  gantt: [],
  archived: false,
});

const byName = (a: { name?: string | null }, b: { name?: string | null }) => (a.name ?? "").localeCompare(b.name ?? "");

/**
 * The picker's projects: the slim list when the server sent one, else the named ones. Projects
 * created in this session (`created`) are kept until the next sync brings them in.
 */
export const workableProjectStubs = (scope: ReadScope, defaultStatus: string, created: readonly Project[] = []): Project[] => {
  const list = scope.timePicker
    ? scope.timePicker.projects.map((p) => projectStub(p.id, p.name, p.clientId, p.status || defaultStatus))
    : Object.entries(scope.referenceNames.projects).map(([id, name]) => projectStub(id, name, null, defaultStatus));
  const known = new Set(list.map((p) => p.id));
  return [...list, ...created.filter((p) => !known.has(p.id))].sort(byName);
};

/** The picker's clients as name-only Lead records, added to the leads the person already sees. */
export const withPickerClients = (scope: ReadScope, leads: readonly Lead[]): Lead[] => {
  const clients = scope.timePicker?.clients ?? [];
  if (!clients.length) return leads as Lead[];
  const known = new Set(leads.map((l) => l.id));
  const stubs: Lead[] = clients
    .filter((c) => !known.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, city: "", clientType: "business", status: "", source: "", owner: "", value: 0, createdAt: "" }));
  return [...leads, ...stubs];
};

/** The picker's project types as name-only records, for the "create project" form. */
export const pickerProjectTypes = (scope: ReadScope): ProjectType[] =>
  (scope.timePicker?.projectTypes ?? []).map((pt) => ({
    id: pt.id,
    name: pt.name,
    description: "",
    icon: "",
    color: "",
    attributes: [],
    hasTimeline: false,
    hasGantt: false,
  }));
