import { useEffect, useState } from "react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useRecentProjects } from "../../hooks/useRecentProjects";
import { todayIso, type TimeEntry } from "../../utils/timeTracking.ts";
import { EntryDrawer } from "./EntryDrawer";
import type { TimeDeps } from "./shared";
import { NEW_TIME_ENTRY_EVENT, type NewTimeEntryRequest } from "./timeCreateBridge";

/**
 * Mounted once in App: opens the entry drawer on a blank manual entry when the task drawer or a
 * project's Time tab asks for "Add time manually". Save creates the entry (EntryDrawer `isNew`).
 */
export function NewEntryHost({ deps }: { deps: TimeDeps }) {
  const tt = useTimeTracking();
  const [draft, setDraft] = useState<(TimeEntry & { nonce: number }) | null>(null);
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
      });
    };
    window.addEventListener(NEW_TIME_ENTRY_EVENT, onNew);
    return () => window.removeEventListener(NEW_TIME_ENTRY_EVENT, onNew);
  }, [deps.tasks, tt.userId, tt.settings.billableByDefault]);
  if (!draft) return null;
  return <OpenDraft draft={draft} deps={deps} onClose={() => setDraft(null)} />;
}

/** Inner component so the recent-projects fetch only runs while a draft is open. */
function OpenDraft({ draft, deps, onClose }: { draft: TimeEntry & { nonce: number }; deps: TimeDeps; onClose: () => void }) {
  const { recentProjectIds, secondsByProject } = useRecentProjects();
  return (
    <EntryDrawer
      key={draft.nonce}
      isNew
      entry={draft}
      deps={deps}
      recentProjectIds={recentProjectIds}
      secondsByProject={secondsByProject}
      onClose={onClose}
      onDelete={onClose}
    />
  );
}
