// Client side of api/my_employment.php: the signed-in person's own employment data.
//
// The server resolves WHICH employee from the session, so none of these calls names one.
// Failures cross the wire as stable codes and are turned into sentences here (see
// .agents/rules/licensing.md §4); a server string is never rendered.

export type MyEmploymentCan = {
  profile: boolean;
  editProfile: boolean;
  payroll: boolean;
  leave: boolean;
  requestLeave: boolean;
  files: boolean;
  hours: boolean;
};

export type MyPersonal = {
  pin: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressZip: string | null;
  addressCountry: string | null;
};

export type MyPayrollRow = {
  id: string;
  periodType: string;
  periodKey: string;
  year: number;
  periodNumber: number;
  items: unknown[];
  totalSalary: number;
  totalPaid: number;
  status: "pending" | "partially_paid" | "paid" | string;
  dueDate: string | null;
  paymentDate: string | null;
  paymentMethod: string;
  note: string | null;
};

export type MyLeaveType = {
  id: string;
  name: string;
  color: string | null;
  isPaid: boolean | null;
  defaultAllowance: number | null;
};

export type MyLeaveRequest = {
  id: string;
  vacationTypeId: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: string;
  note: string | null;
};

export type MyLeaveBalance = { typeId: string; year: number; allowance: number; used: number; remaining: number };

export type MyDocument = {
  id: string;
  name: string;
  size: number | null;
  type: string | null;
  uploadedAt: string | null;
  downloadUrl: string;
};

export type MyEmploymentOverview = {
  identity: { id: string; name: string; email: string | null; isActive: boolean };
  can: MyEmploymentCan;
  personal?: MyPersonal;
  pay?: { salaryType: string; salaryAmount: number; salaryDueDay: number | null; payroll: MyPayrollRow[] };
  leave?: {
    vacationAllowances: Record<string, number>;
    types: MyLeaveType[];
    requests: MyLeaveRequest[];
    balances: MyLeaveBalance[];
  };
  documents?: MyDocument[];
};

export type MyHoursDay = {
  date: string;
  day_number: number;
  weekday: string;
  is_weekend: boolean;
  hours: number;
  status: string;
};

export type MyHours = {
  year: number;
  month: number;
  total_hours: number;
  active_days: number;
  daily_log: MyHoursDay[];
};

/** A call's outcome: the payload, or the stable error code. Never a server sentence. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; status: number };

const KNOWN_CODES = [
  "not_linked",
  "forbidden",
  "invalid_dates",
  "no_working_days",
  "unknown_type",
  "overlap",
  "not_found",
  "not_cancellable",
  "invalid_value",
  "hours_unavailable",
] as const;

/** Translation key for an error code; anything the page does not know gets the generic sentence. */
export const errorTranslationKey = (code: string): string =>
  (KNOWN_CODES as readonly string[]).includes(code) || code === "network"
    ? `myEmployment.error.${code}`
    : "myEmployment.error.generic";

/** Turn a fetch Response (or its failure) into an ApiResult. Exported for tests. */
export const toApiResult = async <T>(responsePromise: Promise<Response>): Promise<ApiResult<T>> => {
  let res: Response;
  try {
    res = await responsePromise;
  } catch {
    return { ok: false, code: "network", status: 0 };
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok && body && body.success !== false) return { ok: true, data: body as T };
  const code = body && typeof body.code === "string" ? body.code : "generic";
  return { ok: false, code, status: res.status };
};

const post = (action: string, payload: Record<string, unknown>) =>
  fetch("/api/my_employment.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });

export const fetchMyEmployment = () =>
  toApiResult<MyEmploymentOverview & { success: true }>(fetch("/api/my_employment.php?action=overview"));

export const fetchMyHours = (year: number, month: number) =>
  toApiResult<{ success: true; no_user_attached?: boolean } & Partial<MyHours>>(
    fetch(`/api/my_employment.php?action=hours&year=${year}&month=${month}`)
  );

export const updateMyContact = (
  fields: Partial<Pick<MyPersonal, "phone" | "addressStreet" | "addressCity" | "addressZip" | "addressCountry">>
) => toApiResult<{ success: true; updated: string[] }>(post("update_contact", fields));

export const requestMyLeave = (input: { vacationTypeId: string; startDate: string; endDate: string; note?: string }) =>
  toApiResult<{ success: true; request: MyLeaveRequest }>(post("request_leave", input));

export const cancelMyLeave = (id: string) =>
  toApiResult<{ success: true; cancelled: string }>(post("cancel_leave", { id }));

/** A request that is still waiting for a decision (the only kind that can be cancelled). */
export const isPendingLeave = (status: string): boolean => status === "requested" || status === "pending";

/** Mon-Fri days in an inclusive ISO date range, for the "n working days" preview. 0 when the range is invalid. */
export const countWorkingDays = (start: string, end: string): number => {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
};

/** Which tabs the page shows, in order, from what the server said the caller may see. */
export type MyEmploymentTab = "personal" | "payroll" | "leave" | "documents" | "hours";
export const visibleTabs = (can: MyEmploymentCan): MyEmploymentTab[] => {
  const tabs: MyEmploymentTab[] = [];
  if (can.profile) tabs.push("personal");
  if (can.payroll) tabs.push("payroll");
  if (can.leave) tabs.push("leave");
  if (can.files) tabs.push("documents");
  if (can.hours) tabs.push("hours");
  return tabs;
};
