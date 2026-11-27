import { useEffect, useState } from "react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useRecentProjects } from "../../hooks/useRecentProjects";
import { todayIso, type TimeEntry } from "../../utils/timeTracking.ts";
import { deleteEntry } from "../../utils/timeTrackingApi.ts";
import { EntryDrawer } from "./EntryDrawer";
import type { TimeDeps } from "./shared";
import { EDIT_TIME_ENTRY_EVENT, NEW_TIME_ENTRY_EVENT, type NewTimeEntryRequest } from "./timeCreateBridge";

/**
 * Mounted once in App: opens the entry drawer on a blank manual entry when the task drawer or a
 * project's Time tab asks for "Add time manually", or on an existing entry when clicked in a
 * project's Time tab.
 */
export function NewEntryHost({ deps }: { deps: TimeDeps }) {
  const tt = useTimeTracking();
  const [draft, setDraft] = useState<(TimeEntry & { nonce: number; isNew: boolean; taskRequired?: boolean }) | null>(null);
  useEffect(() => {
    const onNew = (e: Event) => {
      const req = ((e as CustomEvent<NewTimeEntryRequest>).detail ?? {}) as NewTimeEntryRequest;
      // A consistent shape: a full range (start + end + duration) or hours-only, never a start without an end (that reads as running).
      let startAt = req.startAt ?? null;
      let endAt = req.endAt ?? null;
      let durationSec = req.durationSec ?? null;
      if (startAt && !endAt) {
        if (durationSec) endAt = new Date(new Date(startAt).getTime() + durationSec * 1000).toISOString();
        else startAt = null;
      }
      if (startAt && endAt) durationSec = Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000));
      if (!startAt) { endAt = null; }
      const task = req.taskId ? deps.tasks.find((x) => x.id === req.taskId) ?? null : null;
      setDraft({
        id: "",
        nonce: Date.now(),
        isNew: true,
        userId: req.userId || tt.userId || "",
        recordedByUserId: tt.userId ?? "",
        employeeId: null,
        projectId: req.projectId ?? null,
        taskId: task?.id ?? null,
        ticketId: null,
        title: task?.title ?? req.description ?? "",
        titleSource: task ? "task" : "entry",
        titleDeleted: false,
        description: null,
        legacyNote: null,
        note: req.note ?? null,
        entryDate: req.entryDate || todayIso(),
        startAt,
        endAt,
        durationSec,
        running: false,
        billable: req.billable ?? tt.settings.billableByDefault,
        tags: [],
        source: "manual",
        originType: task ? "task" : null,
        originId: task?.id ?? null,
        approvalStatus: null,
        createdAt: new Date().toISOString(),
        taskRequired: req.taskRequired === true,
      });
    };
    const onEdit = (e: Event) => {
      const entry = (e as CustomEvent<TimeEntry>).detail;
      if (entry && entry.id) {
        setDraft({ ...entry, nonce: Date.now(), isNew: false });
      }
    };
    window.addEventListener(NEW_TIME_ENTRY_EVENT, onNew);
    window.addEventListener(EDIT_TIME_ENTRY_EVENT, onEdit);
    return () => {
      window.removeEventListener(NEW_TIME_ENTRY_EVENT, onNew);
      window.removeEventListener(EDIT_TIME_ENTRY_EVENT, onEdit);
    };
  }, [deps.tasks, tt.userId, tt.settings.billableByDefault]);
  if (!draft) return null;
  return <OpenDraft draft={draft} deps={deps} onClose={() => setDraft(null)} />;
}

/** Inner component so the recent-projects fetch only runs while a draft is open. */
function OpenDraft({ draft, deps, onClose }: { draft: TimeEntry & { nonce: number; isNew: boolean; taskRequired?: boolean }; deps: TimeDeps; onClose: () => void }) {
  const tt = useTimeTracking();
  const { recentProjectIds, secondsByProject } = useRecentProjects();
  return (
    <EntryDrawer
      key={draft.nonce}
      isNew={draft.isNew}
      taskRequired={draft.taskRequired}
      entry={draft}
      deps={deps}
      recentProjectIds={recentProjectIds}
      secondsByProject={secondsByProject}
      onClose={onClose}
      onDelete={(entry) => {
        if (!draft.isNew && entry.id) {
          void deleteEntry(entry.id).then(() => tt.bump());
        }
        onClose();
      }}
    />
  );
}
