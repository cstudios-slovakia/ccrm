import React from "react";
import type { Lead, Project, Task, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import type { TaskAccess } from "../utils/taskSelectors";
import { EntityTasksPanel } from "./EntityTasksPanel";

interface ProjectTasksPanelProps {
  project: Project;
  /** Not saved yet: its tasks would point at a project that may never exist. */
  isNew: boolean;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projects: Project[];
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  taskStates: string[];
  taskStateColors?: Record<string, string>;
  taskAccess: TaskAccess;
  currentUser?: UserProfile;
  /** False when no outgoing mail server is set up; task e-mail reminders then warn. */
  mailConfigured?: boolean;
}

/**
 * A project's Tasks tab. Powered by EntityTasksPanel, supporting quick task creation,
 * voice tasks, full edit drawer, and date interval filtering (all, last week, last month,
 * last quarter, last year to date, custom interval).
 */
export const ProjectTasksPanel: React.FC<ProjectTasksPanelProps> = ({
  project,
  isNew,
  tasks,
  setTasks,
  projects,
  leads,
  users,
  userLanguage,
  taskStates,
  taskStateColors = {},
  taskAccess,
  currentUser,
  mailConfigured,
}) => {
  return (
    <EntityTasksPanel
      entityType="project"
      entityId={project.id}
      entityName={project.name || ""}
      isNew={isNew}
      tasks={tasks}
      setTasks={setTasks}
      projects={projects}
      leads={leads}
      users={users}
      userLanguage={userLanguage}
      taskStates={taskStates}
      taskStateColors={taskStateColors}
      taskAccess={taskAccess}
      currentUser={currentUser}
      mailConfigured={mailConfigured}
      relatedLeadId={project.leadId || undefined}
      accentColor="indigo"
    />
  );
};
