import { useCallback, useMemo } from "react";
import type { Employee, Lead, Project, ProjectType, Task, UserProfile } from "../../types";
import type { Language } from "../../utils/translations";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { isClosedProjectStatus, projectDisplayName } from "../../utils/projects";
import { resolveTaskProject } from "../../utils/timeLinks.ts";
import { type TimeEntry } from "../../utils/timeTracking.ts";
import { deleteEntry, restoreEntry, timeErrorMessage, TimeApiError } from "../../utils/timeTrackingApi.ts";
import { formatMoney } from "../../utils/currency";
import type { NewProjectInput } from "./ProjectPicker";

/** What the module needs from the rest of the app. Built once in App and passed down. */
export interface TimeDeps {
  language: Language;
  currency: string;
  currentUser: UserProfile;
  users: UserProfile[];
  employees: Employee[];
  projects: Project[];
  projectTypes: ProjectType[];
  leads: Lead[];
  tasks: Task[];
  /** Whether a task counts as finished (its status is a done state). */
  isTaskDone: (task: Task) => boolean;
  /** May the signed-in user pick a project directly (the projects module)? */
  canPickProject: boolean;
  onCreateProject?: (input: NewProjectInput) => Project | null;
  /** May the signed-in user edit this task (and so rename it)? */
  canEditTask: (task: Task) => boolean;
  /** Rename a task through the normal task save path (sync.php): conflict handling, audit, permissions. */
  onRenameTask: (taskId: string, title: string) => void;
}

/** Whole-currency amount with two decimals. */
export const useMoney = (deps: Pick<TimeDeps, "currency" | "language">) =>
  useCallback((n: number) => formatMoney(n, deps.currency, deps.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [deps.currency, deps.language]);

/** Resolve names and the §7.1 project for a task, with the finished-status rule applied. */
export const useTimeLookups = (deps: TimeDeps) => {
  const statuses = useProjectStatuses();
  const { t } = useTimeTracking();
  const fallback = t("Untitled project", "Projekt bez názvu", "Névtelen projekt");
  const projectById = useMemo(() => new Map(deps.projects.map((p) => [p.id, p])), [deps.projects]);
  const taskById = useMemo(() => new Map(deps.tasks.map((x) => [x.id, x])), [deps.tasks]);
  const userById = useMemo(() => new Map(deps.users.filter((u) => u.id).map((u) => [u.id as string, u])), [deps.users]);
  return {
    projectName: (id: string | null, serverName?: string | null): string => {
      if (!id) return "";
      const p = projectById.get(id);
      return p ? projectDisplayName(p, deps.leads, fallback) : serverName || t("Project", "Projekt", "Projekt");
    },
    projectById,
    taskById,
    userById,
    resolveTaskProject: (task: Task) => resolveTaskProject(task, deps.projects, deps.leads, (p) => isClosedProjectStatus(p.status, statuses)),
  };
};

/** Can the viewer rename the thing this entry's title belongs to? Tickets arrive with the ticket entry points. */
export const canRenameTitle = (entry: TimeEntry, deps: TimeDeps): { can: boolean; why?: "readonly" | "ticket" } => {
  if (entry.titleSource === "entry") return { can: true };
  if (entry.titleSource === "task") {
    const task = deps.tasks.find((x) => x.id === entry.taskId);
    return task && deps.canEditTask(task) ? { can: true } : { can: false, why: "readonly" };
  }
  return { can: false, why: "ticket" };
};

/** The hint printed next to the title of a linked entry. */
export const renameHint = (entry: TimeEntry, t: ReturnType<typeof useTimeTracking>["t"]): string | null =>
  entry.titleSource === "task"
    ? t("Renames the task", "Premenuje úlohu", "Átnevezi a feladatot")
    : entry.titleSource === "ticket"
      ? t("Renames the ticket", "Premenuje tiket", "Átnevezi a jegyet")
      : null;

/** Delete with an Undo toast: the entry is soft-deleted now, restored on Undo. */
export const useEntryDeletion = () => {
  const { t, bump } = useTimeTracking();
  return useCallback(
    async (entry: TimeEntry) => {
      try {
        await deleteEntry(entry.id);
        bump();
        window.showUndoToast?.({
          message: t("Time entry deleted.", "Záznam času bol odstránený.", "Az időbejegyzés törölve."),
          undoLabel: t("Undo", "Späť", "Visszavonás"),
          onUndo: () => {
            void restoreEntry(entry.id)
              .then(() => bump())
              .catch((e) => window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error"));
          },
          onCommit: () => {},
        });
      } catch (e) {
        window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
      }
    },
    [bump, t],
  );
};

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
