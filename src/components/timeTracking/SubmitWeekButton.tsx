import { useMemo, useState } from "react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { submitWeek, weekApprovalState, type WeekApprovalEntry } from "../../utils/timeApproval.ts";
import { timeErrorMessage } from "../../utils/timeTrackingApi.ts";

interface Props {
  /** Any day in the week. The server normalises it to Monday. */
  weekStart: string;
  entries: readonly WeekApprovalEntry[];
  userId?: string;
}

/** "Submit week" for the Timesheet. Renders nothing when weekly approval is off. */
export function SubmitWeekButton({ weekStart, entries, userId }: Props) {
  const tt = useTimeTracking();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const state = useMemo(
    () => weekApprovalState({ weekStart, entries, userId, weeklyApproval: tt.settings.weeklyApproval }),
    [weekStart, entries, userId, tt.settings.weeklyApproval],
  );

  if (!state.enabled) return null;

  const submit = async () => {
    if (busy || !state.canSubmit) return;
    setBusy(true);
    try {
      await submitWeek(state.weekStart);
      setDone(true);
      tt.bump();
      tt.notify(tt.t("Week submitted.", "Týždeň bol odoslaný.", "A hét beküldve."));
    } catch (e) {
      const code = e instanceof Error ? e.message : "save_failed";
      tt.notify(timeErrorMessage(code, tt.t), "error");
    } finally {
      setBusy(false);
    }
  };

  const approved = done || state.status === "approved";
  return (
    <button
      type="button"
      onClick={() => void submit()}
      disabled={busy || approved || !state.canSubmit}
      data-testid="submit-week"
      className="inline-flex h-10 items-center rounded-xl bg-teal-600 px-4 text-ui font-semibold text-white transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
    >
      {approved
        ? tt.t("Week submitted", "Týždeň odoslaný", "Hét beküldve")
        : tt.t("Submit week", "Odoslať týždeň", "Hét beküldése")}
    </button>
  );
}
