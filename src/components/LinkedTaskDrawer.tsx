import React from "react";
import type { Lead, Project, Task, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { TaskEditDrawer } from "./TaskEditDrawer";
import { useRecurringTemplates } from "../hooks/useRecurringTemplates";
import { archiveTasksWithUndo, deleteTasksWithUndo } from "../utils/taskActions";
import { canArchiveTask, canDeleteTask, canEditTask, type TaskAccess } from "../utils/taskSelectors";

export interface LinkedTaskDrawerProps {
  task: Task;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  leads: Lead[];
  projects: Project[];
  users: UserProfile[];
  language: Language;
  taskStates: string[];
  taskStateColors?: Record<string, string>;
  taskAccess: TaskAccess;
  currentUser?: UserProfile;
  mailConfigured?: boolean;
  /** Show the agency worker link field (Agency module on, or the task already has one). */
  agencyEnabled?: boolean;
  onClose: () => void;
}

/**
 * The full task sidebar (TaskEditDrawer) for a task shown inside another record,
 * such as a lead's gate tasks or an entity's Tasks tab. Save, archive and delete
 * behave as they do in the Tasks view, with the same permission checks.
 */
export const LinkedTaskDrawer: React.FC<LinkedTaskDrawerProps> = ({
  task,
  tasks,
  setTasks,
  leads,
  projects,
  users,
  language,
  taskStates,
  taskStateColors,
  taskAccess,
  currentUser,
  mailConfigured,
  agencyEnabled,
  onClose,
}) => {
  const recurringTemplates = useRecurringTemplates();
  const myName = currentUser?.name || users.map((u) => u.name).find(Boolean) || "";

  // Hold-to-confirm already asked; the Undo toast is the safety net. The server
  // delete is deferred until the undo window closes (see deleteTasksWithUndo).
  const deleteTask = (target: Task): Promise<boolean> => {
    if (!canDeleteTask(target, currentUser, taskAccess)) return Promise.resolve(false);
    deleteTasksWithUndo({ allTasks: tasks, targets: [target], setTasks, lang: language });
    return Promise.resolve(true);
  };

  return (
    <TaskEditDrawer
      key={task.id}
      task={task}
      leads={leads}
      projects={projects}
      users={users}
      taskStates={taskStates}
      taskStateColors={taskStateColors}
      systemLanguage={language}
      recurringTemplates={recurringTemplates}
      currentUser={currentUser}
      currentUserName={myName}
      mailConfigured={mailConfigured}
      agencyEnabled={agencyEnabled}
      canEdit={canEditTask(task, currentUser, taskAccess)}
      canArchive={taskAccess.edit && canArchiveTask(task, currentUser)}
      canDelete={canDeleteTask(task, currentUser, taskAccess)}
      onSave={(next) => setTasks((prev) => prev.map((tk) => (tk.id === next.id ? next : tk)))}
      onToggleArchive={(next) =>
        next.archived
          ? setTasks((prev) => prev.map((tk) => (tk.id === next.id ? { ...tk, archived: false } : tk)))
          : archiveTasksWithUndo({ targets: [next], setTasks, lang: language })
      }
      onDelete={deleteTask}
      onClose={onClose}
    />
  );
};
