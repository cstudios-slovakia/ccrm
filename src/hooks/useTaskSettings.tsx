import { createContext, useContext } from "react";
import type { TaskSettings } from "../types";
import { DEFAULT_TASK_SETTINGS } from "../utils/taskConclusion";

/*
  Settings → Tasks, handed to every view that creates or edits a task: the quick
  create popup, the Edit Task drawer, and the task panels on clients, leads and
  projects. App provides the live value; a view rendered outside it (a test, a
  stray preview) gets the defaults, which offer nothing extra.
*/
const TaskSettingsContext = createContext<TaskSettings>(DEFAULT_TASK_SETTINGS);

export const TaskSettingsProvider = TaskSettingsContext.Provider;

export const useTaskSettings = (): TaskSettings => useContext(TaskSettingsContext);
