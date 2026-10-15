import type { Lead } from "../types";
import { recordKind } from "./clientRecord.ts";
import { runUndoable } from "./undoable.ts";
import { pickFields, reinsertAt, removeByIds, restoreFields } from "./undoableList.ts";
import { bulkMessage, singleMessage, undoLabel, type EntityKey, type Lang } from "./undoMessages.ts";

type SetLeads = (updater: (prev: Lead[]) => Lead[]) => void;

// Lead has no declared updatedAt, but the archive handlers have always stamped one.
type ArchivableLead = Lead & { updatedAt?: string };
const ARCHIVE_FIELDS = ["archived", "updatedAt"] as const satisfies ReadonlyArray<keyof ArchivableLead>;

const idOf = (lead: Lead) => lead.id;

/** Leads and clients share one list; the toast names whichever the targets are. */
const entityFor = (targets: Lead[]): EntityKey => {
  const kinds = new Set(targets.map((lead) => recordKind(lead)));
  return kinds.size === 1 && kinds.has("client") ? "client" : kinds.size === 1 ? "lead" : "record";
};

/**
 * Archives leads or clients (strategy A). The snapshot holds the exact previous
 * `archived` / `updatedAt`, so Undo leaves each record byte-identical.
 */
export function archiveLeadsWithUndo({
  targets,
  setLeads,
  lang,
  onApplied,
  label,
}: {
  targets: Lead[];
  setLeads: SetLeads;
  lang: Lang;
  onApplied?: () => void;
  /** Names the thing in the toast when it is not simply the targets (a client profile spans several lead rows). */
  label?: { entity: EntityKey; title: string };
}): void {
  if (targets.length === 0) return;
  const ids = new Set(targets.map(idOf));
  const snapshots = new Map(targets.map((lead) => [lead.id, pickFields<ArchivableLead>(lead, ARCHIVE_FIELDS)]));
  const entity = label?.entity ?? entityFor(targets);
  runUndoable({
    message: label
      ? singleMessage(lang, label.entity, "archive", label.title)
      : targets.length === 1
        ? singleMessage(lang, entity, "archive", targets[0].name)
        : bulkMessage(lang, entity, "archive", targets.length),
    undoLabel: undoLabel(lang),
    apply: () => {
      const stamp = new Date().toISOString();
      setLeads((prev) => prev.map((lead) => (ids.has(lead.id) ? { ...lead, archived: true, updatedAt: stamp } : lead)));
      onApplied?.();
    },
    revert: () =>
      setLeads((prev) =>
        prev.map((lead) =>
          ids.has(lead.id) ? restoreFields<ArchivableLead>(lead, snapshots.get(lead.id) ?? {}, ARCHIVE_FIELDS) : lead
        )
      ),
  });
}

/**
 * Deletes leads or clients (strategy B). The server delete is held back until the
 * undo window closes: a lead's timeline, files and linked rows cascade with it
 * and not all of those live in client state, so deleting now and re-inserting on
 * Undo would lose them.
 */
export function deleteLeadsWithUndo({
  allLeads,
  targets,
  setLeads,
  lang,
  onApplied,
}: {
  allLeads: Lead[];
  targets: Lead[];
  setLeads: SetLeads;
  lang: Lang;
  onApplied?: () => void;
}): void {
  if (targets.length === 0) return;
  const ids = new Set(targets.map(idOf));
  const { removed } = removeByIds(allLeads, ids, idOf);
  const entity = entityFor(targets);
  runUndoable({
    message:
      targets.length === 1
        ? singleMessage(lang, entity, "delete", targets[0].name)
        : bulkMessage(lang, entity, "delete", targets.length),
    undoLabel: undoLabel(lang),
    deletions: [{ key: "leads", records: targets }],
    apply: () => {
      setLeads((prev) => prev.filter((lead) => !ids.has(lead.id)));
      onApplied?.();
    },
    revert: () => setLeads((prev) => reinsertAt(prev, removed, idOf)),
  });
}
