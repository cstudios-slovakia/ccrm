import { Pencil, Trash2 } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { isEntryLocked, lockReason } from "../../utils/timeLock.ts";
import { isAdminRoleName } from "../../utils/permissions.ts";
import { todayIso, type TimeEntry } from "../../utils/timeTracking.ts";
import { describeTimeLock, useEntryDeletion, type TimeDeps } from "./shared";

/**
 * The Day view's always-visible row actions: edit (opens the entry drawer, same as clicking the
 * row) and delete (hold to confirm, then the usual Undo toast). Delete follows the drawer's rule:
 * not offered without edit permission, disabled while the entry is locked.
 */
export function DayEntryActions({ entry, deps, onOpen }: { entry: TimeEntry; deps: TimeDeps; onOpen: (entry: TimeEntry) => void }) {
  const tt = useTimeTracking();
  const { t } = tt;
  const remove = useEntryDeletion();
  const lock = {
    lockAfterDays: tt.settings.lockAfterDays,
    paidPayrollMonths: entry.paidPayrollMonth ? [entry.entryDate.slice(0, 7)] : [],
    isAdmin: isAdminRoleName(deps.currentUser.role),
  };
  const locked = isEntryLocked(entry, lock, todayIso());
  const reason = locked ? lockReason(entry, lock, todayIso()) : null;
  const lockTitle = reason ? describeTimeLock(reason, t) : undefined;
  return (
    <span className="flex shrink-0 items-center gap-0.5 pr-3" data-testid="day-row-actions">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={t("Edit", "Upraviť", "Szerkesztés")}
        aria-label={t("Edit", "Upraviť", "Szerkesztés")}
        data-testid="day-row-edit"
        className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
      >
        <Pencil className="size-4" />
      </button>
      {tt.viewer.canEdit && (
        <HoldToConfirmButton
          onConfirm={() => void remove(entry)}
          what={entry.title}
          lang={deps.language}
          disabled={locked}
          title={lockTitle ?? t("Hold to delete", "Podržte pre odstránenie", "Tartsa a törléshez")}
          data-testid="day-row-delete"
          className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 cursor-pointer"
        >
          <Trash2 className="size-4" />
        </HoldToConfirmButton>
      )}
    </span>
  );
}
