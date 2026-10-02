import { createContext, useContext } from "react";
import { DEFAULT_PROJECT_STATUS_DEFS, type ProjectStatusDef } from "../utils/projects";

/*
  The project statuses configured in settings, handed to every view that
  speaks or paints one. App provides the live list; a view rendered outside
  it (a test, a stray preview) still gets the five built-ins rather than
  nothing. Pass the list on to the helpers in utils/projects.ts.
*/
const ProjectStatusesContext = createContext<readonly ProjectStatusDef[]>(DEFAULT_PROJECT_STATUS_DEFS);

export const ProjectStatusesProvider = ProjectStatusesContext.Provider;

export const useProjectStatuses = (): readonly ProjectStatusDef[] => useContext(ProjectStatusesContext);
