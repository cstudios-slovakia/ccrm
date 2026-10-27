/**
 * Session client for `/api/time_tracker_ext.php` (pairing, devices, Unsorted).
 * The Chrome extension uses a device key and does not call this module.
 */

import { TimeApiError } from "./timeTrackingApi.ts";

const ENDPOINT = "/api/time_tracker_ext.php";

export interface TrackerDevice {
  id: string;
  name: string;
  browser: string | null;
  os: string | null;
  extensionVersion: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  state: "active" | "idle";
  updateAvailable: boolean;
}

export interface UnsortedItem {
  id: string;
  domain: string;
  pageTitle: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  suggestedProjectId: string | null;
  suggestedProjectName: string | null;
}

export interface ActivitySite {
  pattern: string;
  projectId: string | null;
}

export interface ActivityRules {
  enabled: boolean;
  companyAllows: boolean;
  extensionEnabled: boolean;
  minMinutes: number;
  sites: ActivitySite[];
}

export interface TrackerProject {
  id: string;
  name: string;
  clientName: string | null;
  suggested: boolean;
}

const parse = async (res: Response): Promise<any> => {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !body || body.success !== true) {
    throw new TimeApiError(body?.code || (res.status === 401 ? "signed_out" : "save_failed"), res.status, body?.entry ?? null);
  }
  return body;
};

const get = async (action: string, query: Record<string, string | undefined> = {}): Promise<any> => {
  const qs = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(query)) if (value) qs.set(key, value);
  return parse(await fetch(`${ENDPOINT}?${qs.toString()}`, { headers: { Accept: "application/json" } }));
};

const post = async (action: string, payload: Record<string, unknown> = {}): Promise<any> =>
  parse(
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    }),
  );

export const issuePairingCode = async (): Promise<{ code: string; expiresAt: string }> => {
  const body = await post("code");
  return { code: String(body.code), expiresAt: String(body.expiresAt) };
};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const activityRules = (body: any): ActivityRules => ({
  enabled: Boolean(body?.enabled),
  companyAllows: Boolean(body?.companyAllows),
  extensionEnabled: Boolean(body?.extensionEnabled),
  minMinutes: Number(body?.minMinutes) || 5,
  sites: asArray<ActivitySite>(body?.sites),
});

export const listPairedDevices = async (): Promise<{ devices: TrackerDevice[]; currentVersion: string }> => {
  const body = await get("devices");
  return { devices: asArray<TrackerDevice>(body.devices), currentVersion: String(body.currentVersion ?? "") };
};

export const revokeDevice = async (deviceId: string): Promise<void> => {
  await post("revoke", { deviceId });
};

export const loadUnsorted = async (): Promise<{ items: UnsortedItem[]; count: number }> => {
  const body = await get("unsorted");
  const items = asArray<UnsortedItem>(body.items);
  return { items, count: Number(body.count) || items.length };
};

export const assignUnsorted = async (ids: string[], projectId: string): Promise<number> => {
  const body = await post("assign", { ids, projectId });
  return Number(body.assigned) || 0;
};

export const dismissUnsorted = async (ids: string[]): Promise<number> => {
  const body = await post("dismiss", { ids });
  return Number(body.dismissed) || 0;
};

export const loadActivityRules = async (): Promise<ActivityRules> => activityRules(await get("rules"));

export const saveActivityRules = async (rules: Partial<Pick<ActivityRules, "enabled" | "minMinutes" | "sites">>): Promise<ActivityRules> =>
  activityRules(await post("rules", rules));

export const searchTrackerProjects = async (q: string): Promise<TrackerProject[]> => {
  const body = await get("projectSearch", { q });
  return asArray<TrackerProject>(body.projects);
};
