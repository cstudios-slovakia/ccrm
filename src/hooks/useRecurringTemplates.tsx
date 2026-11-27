import { createContext, useContext } from "react";
import type { RecurringTaskTemplate } from "../types";

/*
  The recurring-task series (templates) App loaded from sync. Task panels on
  projects, clients and leads read it to describe an occurrence's series without
  threading the list through every parent view. Outside App it is empty, and a
  task that belongs to a series still gets its Repeat mark, just without the rule.
*/
const RecurringTemplatesContext = createContext<RecurringTaskTemplate[]>([]);

export const RecurringTemplatesProvider = RecurringTemplatesContext.Provider;

export const useRecurringTemplates = (): RecurringTaskTemplate[] => useContext(RecurringTemplatesContext);
