import React from "react";
import type { ClickUpProjectList, Lead, Project, Task, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import type { TaskAccess } from "../utils/taskSelectors";
import { EntityTasksPanel } from "./EntityTasksPanel";
import { ProjectClickUpListsBar } from "./projects/ProjectClickUpListsBar";

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
  clickupConnected?: boolean;
  clickupLists?: ClickUpProjectList[];
  canEditProject?: boolean;
  onClickUpListsChange?: (next: ClickUpProjectList[]) => void;
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
  clickupConnected = false,
  clickupLists,
  canEditProject = false,
  onClickUpListsChange,
}) => {
  const showClickUpBar = clickupConnected || (clickupLists?.length ?? 0) > 0;
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {showClickUpBar && onClickUpListsChange && (
        <ProjectClickUpListsBar
          projectId={project.id}
          isNew={isNew}
          value={clickupLists ?? project.clickupLists ?? []}
          canEdit={canEditProject}
          userLanguage={userLanguage}
          onChange={onClickUpListsChange}
        />
      )}
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
    </div>
  );
};
