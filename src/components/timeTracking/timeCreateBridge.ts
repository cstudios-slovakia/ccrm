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
