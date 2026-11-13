import { useSyncExternalStore } from "react";
import {
  normalizeListIconMap,
  renameListIcon,
  setListIcon,
  type ListIconKind,
  type ListIconMap,
} from "./listIcons.ts";

/**
 * The LIST_ICONS setting, held once for the whole app (see listIcons.ts for the shape).
 *
 * It lives outside App's settings state on purpose: the icons have their own small
 * endpoint (`/api/list_icons.php`) so picking one never sends the whole dataset, and
 * no view has to thread a prop through App. Loaded on first use, re-read when the tab
 * gets focus again (another user may have changed it), saved one change at a time.
 */

const ENDPOINT = "/api/list_icons.php";
const REFRESH_AFTER_MS = 30_000;

let icons: ListIconMap = {};
let loadedAt = 0;
let loading: Promise<void> | null = null;
let saving = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const apply = (next: ListIconMap) => {
  if (next === icons) return;
  icons = next;
  emit();
};

function load(force = false): Promise<void> {
  if (loading) return loading;
  if (!force && loadedAt && Date.now() - loadedAt < REFRESH_AFTER_MS) return Promise.resolve();
  loading = fetch(ENDPOINT, { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      loadedAt = Date.now();
      // A save started meanwhile wins; its own response carries the fresh map.
      if (saving === 0 && body && body.success && body.icons) apply(normalizeListIconMap(body.icons));
    })
    .catch(() => {
      /* offline or not installed: keep what we have */
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

const onFocus = () => {
  if (document.visibilityState === "visible") void load();
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    }
  };
}

const getSnapshot = () => icons;

/** The current icon map; re-renders when it changes. */
export function useListIcons(): ListIconMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function save(optimistic: ListIconMap, body: Record<string, unknown>): Promise<boolean> {
  const before = icons;
  if (optimistic === before) return Promise.resolve(true);
  apply(optimistic);
  saving += 1;
  return fetch(ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) throw new Error(String(res.status));
      if (data.icons) apply(normalizeListIconMap(data.icons));
      return true;
    })
    .catch(() => {
      // Put back only our own change; anything applied since stays.
      if (icons === optimistic) apply(before);
      return false;
    })
    .finally(() => {
      saving -= 1;
    });
}

/** Sets (or with `null` clears) one item's icon. Resolves false when the server refused it. */
export function saveListIcon(kind: ListIconKind, key: string, icon: string | null): Promise<boolean> {
  return save(setListIcon(icons, kind, key, icon), { kind, key, icon });
}

/** Moves an icon to a renamed list item. Fire-and-forget from the rename handlers. */
export function renameListIconEntry(kind: ListIconKind, from: string, to: string): Promise<boolean> {
  return save(renameListIcon(icons, kind, from, to), { kind, from, to });
}
