import type { Project } from "../../types";
import { makeT } from "../../utils/timeTracking.ts";
import { createTimeProject, timeErrorMessage, TimeApiError } from "../../utils/timeTrackingApi.ts";
import type { NewProjectInput } from "./ProjectPicker";

/**
 * May someone without projects = edit create a project from the time-tracking picker? The role
 * permission `time_tracking_create_projects` (on by default) with time_tracking = edit. Twin of
 * ccrm_can_create_project_from_time() in public/api/read_scope.php.
 */
export const canCreateProjectFromTime = (access: { canEdit: (key: string) => boolean }): boolean =>
  access.canEdit("time_tracking") && access.canEdit("time_tracking_create_projects");

/**
 * "Create project" in the time-tracking picker for someone without the projects module: the
 * server creates it (api/time_projects.php) and the picker gets a name-only stub to select.
 * `onCreated` keeps the stub until the next sync lists the project. A failure shows a toast and
 * resolves to null, so the form stays open.
 */
export async function createPickerProject(input: NewProjectInput, onCreated: (project: Project) => void, language: string): Promise<Project | null> {
  try {
    const made = await createTimeProject(input);
    const stub: Project = {
      id: made.id,
      projectTypeId: made.projectTypeId,
      name: made.name,
      leadId: made.leadId,
      clientId: made.clientId ?? made.leadId,
      status: made.status,
      managers: [],
      data: {},
      timeline: [],
      gantt: [],
      archived: false,
    };
    onCreated(stub);
    return stub;
  } catch (err) {
    const code = err instanceof TimeApiError ? err.code : "save_failed";
    window.showToast?.(timeErrorMessage(code, makeT(language)), "error");
    return null;
  }
}
