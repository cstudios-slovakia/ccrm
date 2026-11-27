/**
 * The task-card popover creates a project with the same callback the project
 * picker already uses. That callback is built in App and handed to
 * ProjectRequestDialog. App.tsx is owned by another phase, so the dialog
 * publishes it here instead of threading a new prop through the task views.
 */

import type { Project, ProjectType } from "../../types";
import type { Language } from "../../utils/translations";
import type { TimeEntry } from "../../utils/timeTracking.ts";
import { TimeApiError, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import type { NewProjectInput } from "./ProjectPicker";

export interface TimeCreateEnv {
  onCreateProject?: (input: NewProjectInput) => Project | null | Promise<Project | null>;
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
  /** Prefill, so a create the server refused (`task_required`) opens the drawer with what was typed. */
  description?: string | null;
  note?: string | null;
  entryDate?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  durationSec?: number | null;
  billable?: boolean;
  /** The person the entry is for (a manager's Timesheet cell); defaults to the viewer. */
  userId?: string | null;
  /** Passed when the server just refused a create with `task_required`. */
  taskRequired?: boolean;
}

export const requestNewTimeEntry = (detail: NewTimeEntryRequest): void => {
  window.dispatchEvent(new CustomEvent<NewTimeEntryRequest>(NEW_TIME_ENTRY_EVENT, { detail }));
};

/** Opens the mounted EntryDrawer on an existing time entry (e.g. clicking a row in a project's Time tab). */
export const EDIT_TIME_ENTRY_EVENT = "ccrm-time-edit-entry";

export const requestEditTimeEntry = (entry: TimeEntry): void => {
  window.dispatchEvent(new CustomEvent<TimeEntry>(EDIT_TIME_ENTRY_EVENT, { detail: entry }));
};

/**
 * "Require a task on every entry": when a manual create is refused with `task_required`, tell the user why and open the
 * new-entry drawer (it has the task and ticket pickers) prefilled with what they typed. Returns true when it handled the error.
 */
export const recoverTaskRequired = (
  e: unknown,
  request: NewTimeEntryRequest,
  notify: (message: string, variant?: "error" | "warning") => void,
  t: (en: string, sk: string, hu: string) => string,
): boolean => {
  if (!(e instanceof TimeApiError) || e.code !== "task_required") return false;
  notify(timeErrorMessage("task_required", t), "warning");
  requestNewTimeEntry({ ...request, taskRequired: true });
  return true;
};
