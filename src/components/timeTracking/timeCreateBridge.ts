/**
 * The task-card popover creates a project with the same callback the project
 * picker already uses. That callback is built in App and handed to
 * ProjectRequestDialog. App.tsx is owned by another phase, so the dialog
 * publishes it here instead of threading a new prop through the task views.
 */

import type { Project, ProjectType } from "../../types";
import type { Language } from "../../utils/translations";
import type { NewProjectInput } from "./ProjectPicker";

export interface TimeCreateEnv {
  onCreateProject?: (input: NewProjectInput) => Project | null;
  projectTypes: ProjectType[];
  currency: string;
  language: Language;
}

const EMPTY: TimeCreateEnv = { projectTypes: [], currency: "EUR", language: "en" };

let env: TimeCreateEnv = EMPTY;

export const rememberTimeCreate = (next: TimeCreateEnv): void => {
  env = next;
};

export const readTimeCreate = (): TimeCreateEnv => env;

/** "Add time manually" from the task drawer or a project's Time tab: the host mounted in App opens the entry drawer. */
export const NEW_TIME_ENTRY_EVENT = "ccrm-time-new-entry";

export interface NewTimeEntryRequest {
  taskId?: string | null;
  projectId?: string | null;
}

export const requestNewTimeEntry = (detail: NewTimeEntryRequest): void => {
  window.dispatchEvent(new CustomEvent<NewTimeEntryRequest>(NEW_TIME_ENTRY_EVENT, { detail }));
};
