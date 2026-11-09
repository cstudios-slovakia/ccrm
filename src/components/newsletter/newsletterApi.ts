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

type TFn = (en: string, sk: string, hu: string) => string;

/** The translated line for a known error code, or null for a code this client does not know. */
export const knownErrorLine = (code: string, t: TFn): string | null => {
  switch (code) {
    case "signed_out":
      return t("You were signed out. Sign in again.", "Boli ste odhlásený. Prihláste sa znova.", "Kijelentkeztették. Jelentkezzen be újra.");
    case "forbidden":
      return t("You do not have permission for this.", "Na toto nemáte oprávnenie.", "Ehhez nincs jogosultsága.");
    case "network":
      return t("The server could not be reached.", "Server sa nepodarilo kontaktovať.", "A szerver nem érhető el.");
    case "not_found":
      return t("This campaign no longer exists.", "Táto kampaň už neexistuje.", "Ez a kampány már nem létezik.");
    case "not_draft":
      return t("This campaign has already been started and can no longer be changed.", "Táto kampaň už bola spustená a nedá sa meniť.", "Ez a kampány már elindult, nem módosítható.");
    case "wrong_status":
      return t("This action is not possible in the campaign's current state.", "Táto akcia nie je v aktuálnom stave kampane možná.", "Ez a művelet a kampány jelenlegi állapotában nem lehetséges.");
    case "campaign_sending":
      return t("The campaign is being sent. Pause it first.", "Kampaň sa odosiela. Najprv ju pozastavte.", "A kampány küldés alatt áll. Előbb szüneteltesse.");
    case "empty_subject":
      return t("Fill in the subject first.", "Najprv vyplňte predmet.", "Előbb töltse ki a tárgyat.");
    case "sender_not_configured":
      return t("Outgoing e-mail is not set up. Set it up in Settings first.", "Odchádzajúca pošta nie je nastavená. Najprv ju nastavte v Nastaveniach.", "A kimenő levelezés nincs beállítva. Előbb állítsa be a Beállításokban.");
    case "missing_unsubscribe":
      return t("The e-mail has no unsubscribe link. Add one to the body or switch the global footer on.", "E-mail nemá odkaz na odhlásenie. Pridajte ho do obsahu alebo zapnite globálnu pätičku.", "Az e-mailben nincs leiratkozási hivatkozás. Adjon hozzá egyet, vagy kapcsolja be a globális láblécet.");
    case "data_url_image":
      return t("An image is embedded in the e-mail. Upload it instead.", "Obrázok je vložený priamo do e-mailu. Nahrajte ho namiesto toho.", "Egy kép be van ágyazva az e-mailbe. Töltse fel inkább.");
    case "dangerous_url":
      return t("A link in the e-mail is not allowed (only http, https, mailto and tel).", "Odkaz v e-maile nie je povolený (iba http, https, mailto a tel).", "Az e-mail egyik hivatkozása nem engedélyezett (csak http, https, mailto és tel).");
    case "html_too_large":
      return t("The e-mail is too large (over 1 MB). Remove some content.", "E-mail je príliš veľký (nad 1 MB). Odstráňte časť obsahu.", "Az e-mail túl nagy (1 MB felett). Távolítson el tartalmat.");
    case "no_recipients":
      return t("There is nobody to send to.", "Nie je komu odoslať.", "Nincs kinek küldeni.");
    case "invalid_audience":
      return t("The recipients are not set correctly.", "Príjemcovia nie sú nastavení správne.", "A címzettek beállítása hibás.");
    case "no_test_recipients":
      return t("Enter at least one test address.", "Zadajte aspoň jednu testovaciu adresu.", "Adjon meg legalább egy tesztcímet.");
    case "invalid_test_recipient":
      return t("A test address is not valid.", "Testovacia adresa nie je platná.", "Egy tesztcím érvénytelen.");
    case "too_many_test_recipients":
      return t("At most 5 test addresses.", "Najviac 5 testovacích adries.", "Legfeljebb 5 tesztcím.");
    case "base_url_unknown":
      return t("The address of this installation is unknown, so links cannot be built.", "Adresa tejto inštalácie nie je známa, odkazy sa nedajú vytvoriť.", "A telepítés címe ismeretlen, a hivatkozások nem hozhatók létre.");
    case "smtp_failed":
      return t("The mail server refused the message.", "Poštový server správu odmietol.", "A levelezőszerver elutasította az üzenetet.");
    case "invalid_doc":
    case "doc_too_large":
      return t("The e-mail design is not valid or is too large.", "Dizajn e-mailu nie je platný alebo je príliš veľký.", "Az e-mail dizájnja érvénytelen vagy túl nagy.");
    case "invalid_image_type":
      return t("Only JPEG, PNG, GIF and WebP images can be uploaded.", "Nahrať sa dajú iba obrázky JPEG, PNG, GIF a WebP.", "Csak JPEG, PNG, GIF és WebP képek tölthetők fel.");
    case "file_too_large":
      return t("The file is larger than 5 MB.", "Súbor je väčší ako 5 MB.", "A fájl nagyobb 5 MB-nál.");
    default:
      return null;
  }
};

/**
 * Readable text for an error. A known code gets its translated line (the server's `message` is
 * English); only an unknown code falls back to the server's message, then to a generic line.
 */
export const newsletterErrorMessage = (e: unknown, t: TFn): string => {
  if (e instanceof NewsletterApiError) {
    const known = knownErrorLine(e.code, t);
    if (known) return known;
    if (e.message && e.message !== e.code) return e.message;
  }
  return t("Something went wrong. Try again.", "Niečo sa pokazilo. Skúste to znova.", "Hiba történt. Próbálja újra.");
};

/** The server's own words for an error that has a translated line (the SMTP reply of `smtp_failed`), or null. */
export const newsletterErrorDetail = (e: unknown): string | null =>
  e instanceof NewsletterApiError && e.code === "smtp_failed" && e.message && e.message !== e.code ? e.message : null;

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
