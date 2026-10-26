// --- Delta sync (protocol v2) -------------------------------------------------
// Baseline of what the server is known to hold, as id → serialised record, so a
// push can carry just the records that actually changed plus the ids that went
// away. Under v1 every save re-uploaded the entire dataset; on a real install
// that is megabytes per keystroke-level edit and it is the reason a settings
// save took ~15s on a normal office uplink.

export type RecordBaseline = Map<string, string>;

// Serialising every record on every push would be O(dataset) main-thread work.
// React state updates rebuild the array but leave untouched items as the SAME
// object, so caching by identity makes the diff cost track the edit, not the
// dataset. WeakMap so dropped records are collected with their entry.
const recordHashCache = new WeakMap<object, string>();

export const hashRecord = (record: any): string => {
  if (record === null || typeof record !== "object") return JSON.stringify(record);
  const cached = recordHashCache.get(record);
  if (cached !== undefined) return cached;
  const hash = JSON.stringify(record);
  recordHashCache.set(record, hash);
  return hash;
};

export const baselineOf = (records: any[] | undefined): RecordBaseline => {
  const out: RecordBaseline = new Map();
  for (const r of records ?? []) {
    if (r && r.id != null) out.set(String(r.id), hashRecord(r));
  }
  return out;
};

/**
 * Records that differ from the baseline, and ids the baseline had but the current
 * list does not. A missing baseline means "we have never confirmed anything with
 * the server", so everything is treated as changed and nothing as deleted — the
 * safe direction, since inventing deletions is how data disappears.
 *
 * `holdBack` names ids whose deletion the user can still undo (see
 * pendingDeletions.ts). They are left out of `deletedIds` and kept in the next
 * baseline, so the server still holds the row — and its cascade children — until
 * the undo window closes, and a later diff still knows to delete it.
 */
export const diffRecords = (
  records: any[] | undefined,
  baseline: RecordBaseline | undefined,
  holdBack?: ReadonlySet<string>
): { changed: any[]; deletedIds: string[]; next: RecordBaseline } => {
  const list = records ?? [];
  const next = baselineOf(list);
  if (!baseline) {
    return { changed: list, deletedIds: [], next };
  }
  const changed: any[] = [];
  for (const r of list) {
    if (!r) continue;
    // A record with no id cannot be held in the baseline (which is keyed by id),
    // so there is no way to tell whether it changed — it must always be sent.
    // Skipping it, as this used to, silently dropped whole collections: user rows
    // carry no id, so every profile edit (name, password, mailbox credentials, a
    // newly added user) was diffed down to an empty array and never reached the
    // server, while the UI happily showed it as saved until the next reload.
    if (r.id == null) {
      changed.push(r);
      continue;
    }
    const id = String(r.id);
    if (baseline.get(id) !== next.get(id)) changed.push(r);
  }
  const deletedIds: string[] = [];
  for (const [id, hash] of baseline) {
    if (next.has(id)) continue;
    if (holdBack?.has(id)) {
      next.set(id, hash);
      continue;
    }
    deletedIds.push(id);
  }
  return { changed, deletedIds, next };
};

// Collections the delta sync tracks, plus the two blobs that are not record
// lists (settings, the role registry). A refusal tag whose collection is not
// here is one this client does not know — it is still a refused write.
const KNOWN_SKIP_COLLECTIONS = new Set([
  "leads", "tasks", "users", "roles", "meetingNotes", "customDashboards",
  "projectTypes", "projects", "warehouses", "suppliers", "warehouseItems",
  "warehouseStock", "warehouseBatches", "warehouseMovements", "financialCategories",
  "financialRecords", "invoicesOffers", "aiCustomTemplates", "clientCategories",
  "employees", "employeeSalaries", "employeeVacations", "orders", "tickets",
  "supportContracts", "settings", "unifiedEntries", "unifiedEntriesData",
]);

/**
 * The collection a `permissionSkipped` tag belongs to.
 * `settings:DIVISIONS` → settings, `leads:clients` and `customDashboards:home`
 * (with or without `:delete`) → the parent list, `users:nameTaken` → users.
 */
export const skippedCollection = (tag: string): string => {
  if (tag.startsWith("settings:")) return "settings";
  const body = tag.endsWith(":delete") ? tag.slice(0, -":delete".length) : tag;
  if (body === "leads:clients") return "leads";
  if (body === "customDashboards:home") return "customDashboards";
  const colon = body.indexOf(":");
  return colon === -1 ? body : body.slice(0, colon);
};

/** Keep the previous baseline for this collection: the server did not store it. */
export const skipHoldsBaseline = (skipped: ReadonlySet<string>, key: string): boolean => {
  for (const tag of skipped) {
    if (skippedCollection(tag) === key) return true;
  }
  return false;
};

/**
 * Whether the user should be told this tag is unsaved work.
 * A bare collection the push did not touch stays quiet (the server names the
 * collection whenever a write was refused, including an empty one). A reason
 * suffix (`users:nameTaken`, `leads:outside-scope`, `employees:userId`) is
 * lost work. A tag this client does not recognise is lost work too — treating
 * it as success is how a refused edit stays on screen with nothing said.
 */
export const skipIsLostWork = (tag: string, payload: { [key: string]: unknown }): boolean => {
  const col = skippedCollection(tag);
  if (!KNOWN_SKIP_COLLECTIONS.has(col)) return true;
  if (col === "settings") return payload.settings != null;
  const bare = tag === col || tag === `${col}:delete`
    || tag === "leads:clients" || tag === "leads:clients:delete"
    || tag === "customDashboards:home" || tag === "customDashboards:home:delete";
  if (!bare) return true;
  if (tag.endsWith(":delete")) {
    const deleted = payload.deleted;
    const ids = deleted && typeof deleted === "object"
      ? (deleted as { [key: string]: unknown })[col]
      : undefined;
    return Array.isArray(ids) && ids.length > 0;
  }
  const body = payload[col];
  return Array.isArray(body) ? body.length > 0 : body != null && typeof body === "object";
};
