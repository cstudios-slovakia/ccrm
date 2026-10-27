import type { ReactNode } from "react";
import type { TFn } from "../../utils/timeTracking.ts";
import { TimeReportsView } from "./TimeReportsView";
import { TimeTeamView } from "./TimeTeamView";
import type { TimeDeps } from "./shared";

export interface ExtraTabProps {
  deps: TimeDeps;
  onNavigate: (route: string) => void;
}

/** Team and Reports. Phase 3 mounts these beside List, Day, Calendar and Timesheet. */
export interface ExtraTimeTrackingTab {
  id: "team" | "reports";
  label: (t: TFn) => string;
  render: (props: ExtraTabProps) => ReactNode;
}

export const extraTimeTrackingTabs: ExtraTimeTrackingTab[] = [
  {
    id: "team",
    label: (t) => t("Team", "Tím", "Csapat"),
    render: (props) => <TimeTeamView deps={props.deps} onNavigate={props.onNavigate} />,
  },
  {
    id: "reports",
    label: (t) => t("Reports", "Reporty", "Jelentések"),
    render: (props) => <TimeReportsView deps={props.deps} />,
  },
];
