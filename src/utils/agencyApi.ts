import type {
  AgencyBootstrapPayload,
  AgencyCalculatedPayment,
  AgencyFileCategory,
  AgencyPayment,
  AgencyPlacement,
  AgencySettings,
  AgencyShift,
  AgencyTimelineEvent,
  AgencyTimelineEventType,
  AgencyWorker,
  AgencyWorkerChecklistItem,
  AgencyWorkerDetailPayload,
  AgencyWorkerFile,
  AgencyWorkplace,
} from "../types/agency.ts";

const apiUrl = (path: string): string => path;
const getAuthHeaders = (): Record<string, string> => ({ Accept: "application/json" });

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.success === false)) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`) as Error & { code?: string; status?: number };
    err.code = data?.error;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function fetchAgencyBootstrap(from?: string, to?: string): Promise<AgencyBootstrapPayload> {
  const params = new URLSearchParams({ action: "bootstrap" });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(apiUrl(`/api/agency.php?${params.toString()}`), {
    credentials: "include",
    headers: getAuthHeaders(),
  });
  return parseJson<AgencyBootstrapPayload>(res);
}

export async function fetchAgencyWorkerDetail(id: string): Promise<AgencyWorkerDetailPayload> {
  const params = new URLSearchParams({ action: "worker_detail", id });
  const res = await fetch(apiUrl(`/api/agency.php?${params.toString()}`), {
    credentials: "include",
    headers: getAuthHeaders(),
  });
  return parseJson<AgencyWorkerDetailPayload>(res);
}

export async function saveAgencyWorker(worker: Partial<AgencyWorker> & { fullName: string }): Promise<AgencyWorker> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "save_worker", worker }),
  });
  const data = await parseJson<{ worker: AgencyWorker }>(res);
  return data.worker;
}

export async function deleteAgencyWorker(id: string): Promise<void> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "delete_worker", id }),
  });
  await parseJson<{ success: boolean }>(res);
}

export async function saveAgencyChecklist(
  workerId: string,
  items: Array<Partial<AgencyWorkerChecklistItem> & { label: string }>
): Promise<AgencyWorkerChecklistItem[]> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "save_checklist", workerId, items }),
  });
  const data = await parseJson<{ checklist: AgencyWorkerChecklistItem[] }>(res);
  return data.checklist;
}

export async function uploadAgencyWorkerFile(
  workerId: string,
  category: AgencyFileCategory,
  file: File,
  checklistItemId?: string | null
): Promise<AgencyWorkerFile> {
  const fd = new FormData();
  fd.append("module", "agency");
  fd.append("eventId", workerId);
  fd.append("workerId", workerId);
  fd.append("category", category);
  if (checklistItemId) fd.append("checklistItemId", checklistItemId);
  fd.append("file", file);
  const res = await fetch(apiUrl("/upload.php"), {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders(),
    body: fd,
  });
  const data = await parseJson<{ file: AgencyWorkerFile }>(res);
  return data.file;
}

export async function deleteAgencyFile(id: string): Promise<void> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "delete_file", id }),
  });
  await parseJson<{ success: boolean }>(res);
}

export function agencyFileUrl(fileId: string, download = false): string {
  return apiUrl(`/api/agency_file.php?id=${encodeURIComponent(fileId)}${download ? "&download=1" : ""}`);
}

export async function saveAgencyTimelineEvent(payload: {
  workerId: string;
  eventType: AgencyTimelineEventType;
  title: string;
  description?: string;
  meta?: Record<string, unknown>;
  occurredAt?: string;
}): Promise<AgencyTimelineEvent> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "save_timeline_event", ...payload }),
  });
  const data = await parseJson<{ event: AgencyTimelineEvent }>(res);
  return data.event;
}

export async function saveAgencyWorkplace(
  workplace: Partial<AgencyWorkplace> & { companyClientId: string; name: string }
): Promise<AgencyWorkplace> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "save_workplace", workplace }),
  });
  const data = await parseJson<{ workplace: AgencyWorkplace }>(res);
  return data.workplace;
}

export async function deleteAgencyWorkplace(id: string): Promise<void> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "delete_workplace", id }),
  });
  await parseJson<{ success: boolean }>(res);
}

export async function saveAgencyPlacement(
  placement: Partial<AgencyPlacement> & { workerId: string; companyClientId: string; startDate: string }
): Promise<AgencyPlacement> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "save_placement", placement }),
  });
  const data = await parseJson<{ placement: AgencyPlacement }>(res);
  return data.placement;
}

export async function saveAgencyShifts(
  shifts: Array<Partial<AgencyShift> & { workerId: string; companyClientId: string; workDate: string }>
): Promise<AgencyShift[]> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "save_shifts", shifts }),
  });
  const data = await parseJson<{ shifts: AgencyShift[] }>(res);
  return data.shifts;
}

export async function deleteAgencyShift(id: string): Promise<void> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "delete_shift", id }),
  });
  await parseJson<{ success: boolean }>(res);
}

export async function calculateAgencyPayment(workerId: string, periodYm: string): Promise<AgencyCalculatedPayment> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "calculate_payment", workerId, periodYm }),
  });
  const data = await parseJson<{ calculated: AgencyCalculatedPayment }>(res);
  return data.calculated;
}

export async function saveAgencyPayment(payment: Partial<AgencyPayment> & { workerId: string; periodYm: string }): Promise<AgencyPayment> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "save_payment", payment }),
  });
  const data = await parseJson<{ payment: AgencyPayment }>(res);
  return data.payment;
}

export async function createAgencyClientBillingRecord(
  companyClientId: string,
  periodYm: string
): Promise<{ financialRecordId: string; amount: number }> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "create_client_billing_record", companyClientId, periodYm }),
  });
  return parseJson<{ financialRecordId: string; amount: number }>(res);
}

export async function saveAgencySettings(settings: AgencySettings): Promise<AgencySettings> {
  const res = await fetch(apiUrl("/api/agency.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ action: "save_settings", settings }),
  });
  const data = await parseJson<{ settings: AgencySettings }>(res);
  return data.settings;
}
