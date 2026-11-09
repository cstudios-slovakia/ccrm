/**
 * Browser client for `public/api/newsletter.php` (docs/NEWSLETTER.md C4).
 *
 * Same envelope as `time_entries.php`: a success is `{ success: true, ...payload }`, a failure is
 * `{ success: false, code, message?, ... }` with the HTTP status 400 / 403 / 404 / 409 / 422.
 * Every call throws a `NewsletterApiError` on failure; `code` is the machine code, `message` the
 * server's readable text when it sent one.
 */

import type {
  AudiencePreview,
  Audience,
  Campaign,
  CampaignPatch,
  CampaignProgress,
  CampaignSummary,
  ContactStatus,
  NewsletterConfig,
  NewsletterSettingsResponse,
  RecipientRow,
  SuppressionRow,
  UploadedImage,
  WorkerState,
} from "./types";

const ENDPOINT = "/api/newsletter.php";

export class NewsletterApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

const fail = (res: Response, body: { code?: string; message?: string } | null): never => {
  const code = body?.code || (res.status === 401 ? "signed_out" : res.status === 403 ? "forbidden" : "request_failed");
  throw new NewsletterApiError(code, res.status, body?.message);
};

const parse = async (res: Response): Promise<Record<string, unknown>> => {
  let body: ({ success?: boolean; code?: string; message?: string } & Record<string, unknown>) | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) return fail(res, body);
  return body;
};

const call = async <T>(action: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
      signal,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    throw new NewsletterApiError("network", 0);
  }
  return (await parse(res)) as T;
};

/** Readable text for an error: the server's message when there is one, else a translated generic line. */
export const newsletterErrorMessage = (e: unknown, t: (en: string, sk: string, hu: string) => string): string => {
  if (e instanceof NewsletterApiError) {
    if (e.message && e.message !== e.code) return e.message;
    switch (e.code) {
      case "signed_out":
        return t("You were signed out. Sign in again.", "Boli ste odhlásený. Prihláste sa znova.", "Kijelentkeztették. Jelentkezzen be újra.");
      case "forbidden":
        return t("You do not have permission for this.", "Na toto nemáte oprávnenie.", "Ehhez nincs jogosultsága.");
      case "network":
        return t("The server could not be reached.", "Server sa nepodarilo kontaktovať.", "A szerver nem érhető el.");
      case "not_found":
        return t("This campaign no longer exists.", "Táto kampaň už neexistuje.", "Ez a kampány már nem létezik.");
      case "not_draft":
      case "wrong_status":
        return t("Only a draft can be changed.", "Meniť sa dá iba koncept.", "Csak a piszkozat módosítható.");
      default:
        break;
    }
  }
  return t("Something went wrong. Try again.", "Niečo sa pokazilo. Skúste to znova.", "Hiba történt. Próbálja újra.");
};

export const newsletterApi = {
  // read
  list: () => call<{ campaigns: CampaignSummary[] }>("list").then((r) => r.campaigns),
  get: (id: string) => call<{ campaign: Campaign }>("get", { id }).then((r) => r.campaign),
  recipients: (p: { id: string; status?: string; q?: string; offset: number; limit: number }) =>
    call<{ rows: RecipientRow[]; total: number }>("recipients", p),
  audiencePreview: (audience: Audience, signal?: AbortSignal) =>
    call<AudiencePreview>("audience_preview", { audience }, signal),
  settingsGet: () => call<NewsletterSettingsResponse>("settings_get"),
  suppressions: (p: { q?: string; offset: number; limit: number }) =>
    call<{ rows: SuppressionRow[]; total: number }>("suppressions", p),
  images: () => call<{ images: UploadedImage[] }>("images").then((r) => r.images),
  contactStatus: (emails: string[]) => call<ContactStatus>("contact_status", { emails }),

  // write
  create: (name?: string) => call<{ campaign: Campaign }>("create", name ? { name } : {}).then((r) => r.campaign),
  update: (id: string, patch: CampaignPatch) => call<{ campaign: Campaign }>("update", { id, patch }).then((r) => r.campaign),
  duplicate: (id: string) => call<{ campaign: Campaign }>("duplicate", { id }).then((r) => r.campaign),
  remove: (id: string) => call<Record<string, never>>("delete", { id }),
  suppressionAdd: (emails: string[], note?: string) =>
    call<{ added: number }>("suppression_add", { emails, ...(note ? { note } : {}) }),
  suppressionRemove: (email: string) => call<Record<string, never>>("suppression_remove", { email }),
  settingsSave: (config: NewsletterConfig) => call<{ config: NewsletterConfig }>("settings_save", { config }).then((r) => r.config),

  /** `POST /api/newsletter.php?action=upload_image`, multipart field `file`. Resolves to the absolute URL. */
  uploadImage: async (file: File): Promise<string> => {
    const form = new FormData();
    form.append("file", file);
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}?action=upload_image`, { method: "POST", body: form });
    } catch {
      throw new NewsletterApiError("network", 0);
    }
    return (await parse(res)).url as string;
  },

  // sending (wired to buttons by package 2B)
  sendTest: (p: { id: string; subject: string; html: string; text: string; to: string[]; sample?: { source: string; id: string } }) =>
    call<{ sent: number; demo: boolean }>("send_test", p),
  startSend: (p: { id: string; html: string; text: string }) => call<{ campaign: Campaign }>("start_send", p).then((r) => r.campaign),
  pause: (id: string) => call<{ campaign: Campaign }>("pause", { id }).then((r) => r.campaign),
  resume: (id: string) => call<{ campaign: Campaign }>("resume", { id }).then((r) => r.campaign),
  cancel: (id: string) => call<{ campaign: Campaign }>("cancel", { id }).then((r) => r.campaign),
  tick: (id?: string) => call<{ campaign?: CampaignProgress; worker: WorkerState }>("tick", id ? { id } : {}),
};
