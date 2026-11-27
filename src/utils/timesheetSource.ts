/**
 * The employee timesheet source switch (B17).
 *
 * Explicit and per view: the caller passes the choice the person just made.
 * Nothing here inspects which source has data, so picking one never removes
 * the other from the switch. Toggl stays available when CCRM is showing, and
 * the other way around.
 */

export const TIMESHEET_SOURCES = ["toggl", "ccrm"] as const;

export type TimesheetSource = (typeof TIMESHEET_SOURCES)[number];

export interface TimesheetSourceSwitch {
  selected: TimesheetSource;
  /** Both sources, always. Selecting one does not drop the other. */
  available: readonly TimesheetSource[];
}

export const timesheetSourceSwitch = (selected: TimesheetSource): TimesheetSourceSwitch => ({
  selected,
  available: TIMESHEET_SOURCES,
});
