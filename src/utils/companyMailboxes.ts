/*
  Company mailboxes (Settings → E-mail): shared IMAP / SMTP mailboxes an admin defines
  once and the background job reads for the whole team (api/company_mailboxes.php).
  The password never comes back from the server; the form shows a mask and sends it
  back unchanged, which the server reads as "keep the stored one".
*/

export const SECRET_MASK = "********";

export interface MailboxFolderState {
  folder: string;
  lastUid: number;
  backfillDone: boolean;
  filedCount: number;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface MailboxSettings {
  provider: "smtp" | "exchange";
  imapHost: string;
  imapPort: string;
  imapSecure: "ssl" | "tls" | "none";
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: "ssl" | "tls" | "none";
  smtpUsername: string;
  smtpPassword: string;
  exchangeUrl: string;
  imapAllowSelfSigned: boolean;
}

export interface CompanyMailbox {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
  ownerUserId: string | null;
  backfillSince: string | null;
  settings: Partial<MailboxSettings>;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  folders: MailboxFolderState[];
}

export interface MailboxDraft {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
  ownerUserId: string;
  backfillSince: string;
  settings: MailboxSettings;
}

export const emptyMailboxDraft = (): MailboxDraft => ({
  id: "",
  name: "",
  address: "",
  isActive: true,
  ownerUserId: "",
  backfillSince: "",
  settings: {
    provider: "smtp",
    imapHost: "",
    imapPort: "993",
    imapSecure: "ssl",
    imapUsername: "",
    imapPassword: "",
    smtpHost: "",
    smtpPort: "465",
    smtpSecure: "ssl",
    smtpUsername: "",
    smtpPassword: "",
    exchangeUrl: "",
    imapAllowSelfSigned: false,
  },
});

/** A stored mailbox as the form edits it. Passwords arrive masked and are kept masked. */
export const draftFromMailbox = (box: CompanyMailbox): MailboxDraft => {
  const base = emptyMailboxDraft();
  return {
    id: box.id,
    name: box.name,
    address: box.address,
    isActive: box.isActive,
    ownerUserId: box.ownerUserId ?? "",
    backfillSince: box.backfillSince ?? "",
    settings: { ...base.settings, ...box.settings },
  };
};

/**
 * The request body for save / test. A blank SMTP login follows the IMAP one (most
 * providers use a single login), and a blank password is left out so the server keeps
 * the stored one rather than blanking it.
 */
export const mailboxPayload = (draft: MailboxDraft) => {
  const s = { ...draft.settings };
  if (!s.smtpUsername.trim()) s.smtpUsername = s.imapUsername;
  const settings: Partial<MailboxSettings> = { ...s };
  if (!s.imapPassword) delete settings.imapPassword;
  if (!s.smtpPassword) delete settings.smtpPassword;
  return {
    id: draft.id || undefined,
    name: draft.name.trim(),
    address: draft.address.trim().toLowerCase(),
    isActive: draft.isActive,
    ownerUserId: draft.ownerUserId,
    backfillSince: draft.backfillSince,
    settings,
  };
};

/** One line on the state of a mailbox's filing, from its folders. */
export const backlogSummary = (folders: readonly MailboxFolderState[]): { filed: number; caughtUp: boolean; started: boolean } => ({
  filed: folders.reduce((n, f) => n + f.filedCount, 0),
  started: folders.length > 0,
  caughtUp: folders.length > 0 && folders.every((f) => f.backfillDone),
});

type ApiResult<T> = T & { success?: boolean; error?: string };

const call = async <T>(action: string, body?: unknown): Promise<ApiResult<T>> => {
  const res = await fetch(`/api/company_mailboxes.php?action=${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: ApiResult<T> | null = null;
  try {
    data = (await res.json()) as ApiResult<T>;
  } catch {
    /* handled below */
  }
  if (!res.ok || !data || data.success === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};

export interface MailboxList {
  mailboxes: CompanyMailbox[];
  userMailboxes: { id: string; name: string; email: string; folders: MailboxFolderState[] }[];
  imapAvailable: boolean;
}

export const listMailboxes = () => call<MailboxList>("list");
export const saveMailbox = (draft: MailboxDraft) => call<{ mailbox: CompanyMailbox }>("save", mailboxPayload(draft));
export const testMailbox = (draft: MailboxDraft) => call<{ success: boolean }>("test", mailboxPayload(draft));
export const deleteMailbox = (id: string) => call<unknown>("delete", { id });
export const runMailbox = (id: string) => call<{ run: { seen?: number; filed?: number; errors?: string[] } }>("run", { id });
