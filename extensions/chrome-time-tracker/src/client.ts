import { EXTENSION_VERSION } from "../../../src/utils/timeTrackerRules.ts";

export class TrackerError extends Error {
  readonly code: string;
  readonly status: number;
  readonly entry: unknown;
  constructor(code: string, status: number, entry?: unknown) {
    super(code);
    this.code = code;
    this.status = status;
    this.entry = entry ?? null;
  }
}

export async function trackerCall(
  ccrmUrl: string,
  deviceKey: string,
  method: "GET" | "POST",
  action: string,
  payload: Record<string, unknown> = {},
  query: Record<string, string> = {},
): Promise<any> {
  const root = ccrmUrl.replace(/\/$/, "");
  const url = new URL(`${root}/api/time_tracker_ext.php`);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-CCRM-Extension-Version": EXTENSION_VERSION,
  };
  if (deviceKey) headers.Authorization = `Bearer ${deviceKey}`;
  const init: RequestInit = { method, headers, credentials: "omit" };
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify({ action, version: EXTENSION_VERSION, ...payload });
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new TrackerError("offline", 0);
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) {
    throw new TrackerError(body?.code || (res.status === 401 ? "not_paired" : "save_failed"), res.status, body?.entry);
  }
  return body;
}
