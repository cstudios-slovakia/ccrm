/** Typed client for api/project_pushes.php (GitHub pushes stored per project by api/github_webhook.php). */

export interface ProjectPushSummary {
  projectId: string;
  /** Pushes inside the requested range. */
  pushes: number;
  /** The project's latest push of all time (UTC ISO 8601 with `Z`). */
  lastPushAt: string | null;
}

export interface ProjectPushesOverview {
  /** Every project that has had a push, newest last push first. */
  projects: ProjectPushSummary[];
  /** The latest push inside the range, across all projects; null when there is none. */
  lastPush: { projectId: string; pushedAt: string } | null;
  /** Sum of `pushes`. */
  total: number;
}

export interface ProjectPush {
  deliveryId: string;
  branch: string;
  pushedAt: string;
  pusher: string | null;
  commitCount: number;
  headSha: string | null;
  headMessage: string | null;
  compareUrl: string | null;
}

const ENDPOINT = "/api/project_pushes.php";

const get = async <T>(query: URLSearchParams): Promise<T> => {
  const suffix = query.toString();
  const response = await fetch(suffix ? `${ENDPOINT}?${suffix}` : ENDPOINT, { credentials: "same-origin" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) throw new Error(result.message || "The pushes could not be loaded.");
  return result as T;
};

/** Pushes per project in a range of company-timezone days (`YYYY-MM-DD`, both optional = all time). */
export const fetchProjectPushesOverview = async (range: { from?: string; to?: string } = {}): Promise<ProjectPushesOverview> => {
  const query = new URLSearchParams();
  if (range.from) query.set("from", range.from);
  if (range.to) query.set("to", range.to);
  const { projects, lastPush, total } = await get<ProjectPushesOverview>(query);
  return { projects, lastPush, total };
};

/** One project's pushes, newest first. */
export const fetchProjectPushes = async (projectId: string, limit = 100): Promise<ProjectPush[]> => {
  const { pushes } = await get<{ pushes: ProjectPush[] }>(new URLSearchParams({ projectId, limit: String(limit) }));
  return pushes;
};
