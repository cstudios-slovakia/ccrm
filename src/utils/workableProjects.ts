// Projects a person may log time on without having the projects module.
//
// Such a caller is sent no `projects` collection at all (it is `restricted`), but the
// server names the projects they work on — ones they manage, ones a task they see
// points at, ones they already logged time on — in `readScope.referenceNames.projects`.
// The time-tracking picker is built from those names, so an Employee can put their
// hours on the project they are actually working on.

import type { Project } from "../types";
import type { ReadScope } from "./readScope.ts";

/** A name-only Project: enough for the picker and the entry rows, nothing to open or edit. */
export const workableProjectStubs = (scope: ReadScope, defaultStatus: string): Project[] =>
  Object.entries(scope.referenceNames.projects)
    .map(([id, name]) => ({
      id,
      projectTypeId: "",
      name,
      leadId: null,
      clientId: null,
      status: defaultStatus,
      managers: [],
      data: {},
      timeline: [],
      gantt: [],
      archived: false,
    }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
