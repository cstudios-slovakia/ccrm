/**
 * Newsletter: the shapes of docs/NEWSLETTER.md C3, C4 and C5.
 *
 * The campaign body is opaque here (`EmailDocJson`): package 2B swaps it, and the theme, for the
 * builder's own types. Nothing in this module imports from `builder/`.
 */

/** The e-mail document as the server stores it (C6). Opaque until the builder is wired in. */
export type EmailDocJson = { version: 1; rows: unknown[] };

/** C3 `NewsletterTheme`, exactly. */
export type NewsletterThemeJson = {
  contentWidth: number; // 520..800
  pageBackground: string;
  contentBackground: string;
  fontFamily: string;
  textColor: string;
  linkColor: string;
  buttonBackground: string;
  buttonTextColor: string;
};

export type NewsletterConfig = {
  version: 1;
  header: EmailDocJson | null;
  footer: EmailDocJson | null;
  theme: NewsletterThemeJson;
  sender: { fromName: string; replyTo: string };
  sending: { batchSize: number; perHourLimit: number; testRecipients: string[] };
};

export const DEFAULT_NEWSLETTER_THEME: NewsletterThemeJson = {
  contentWidth: 600,
  pageBackground: "#f1f5f9",
  contentBackground: "#ffffff",
  fontFamily: "Arial, Helvetica, sans-serif",
  textColor: "#1e293b",
  linkColor: "#2563eb",
  buttonBackground: "#2563eb",
  buttonTextColor: "#ffffff",
};

/** The web-safe stacks the theme offers (C3). The builder keeps the same list in `builder/defaults.ts`. */
export const NEWSLETTER_FONT_STACKS: { value: string; label: string }[] = [
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Tahoma, Geneva, sans-serif", label: "Tahoma" },
  { value: "'Trebuchet MS', Helvetica, sans-serif", label: "Trebuchet MS" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
];

export const DEFAULT_NEWSLETTER_CONFIG: NewsletterConfig = {
  version: 1,
  header: null,
  footer: null,
  theme: DEFAULT_NEWSLETTER_THEME,
  sender: { fromName: "", replyTo: "" },
  sending: { batchSize: 40, perHourLimit: 400, testRecipients: [] },
};

export type CampaignStatus = "draft" | "sending" | "paused" | "sent" | "cancelled";

export type Counts = {
  total: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  cancelled: number;
  unsubscribed: number;
};

/** C5. */
export type Audience = {
  clients: { mode: "all" | "pick"; categoryIds: string[]; clientIds: string[] };
  leads: { enabled: boolean; statuses: string[]; interestCategories: string[] };
  employees: { enabled: boolean };
  extra: { enabled: boolean; raw: string };
};

export type CampaignSummary = {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  audience: Audience;
  counts: Counts;
  lastError: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type Campaign = CampaignSummary & {
  preheader: string;
  fromName: string | null;
  replyTo: string | null;
  body: EmailDocJson | null;
  useHeader: boolean;
  useFooter: boolean;
  htmlSnapshot: string | null;
};

/** What `update` accepts (drafts only). */
export type CampaignPatch = Partial<
  Pick<Campaign, "name" | "subject" | "preheader" | "fromName" | "replyTo" | "audience" | "body" | "useHeader" | "useFooter">
>;

export type CampaignProgress = Pick<Campaign, "id" | "status" | "counts" | "lastError" | "finishedAt">;

export type RecipientRow = {
  id: number;
  email: string;
  name: string | null;
  source: "client" | "lead" | "employee" | "extra";
  leadId: string | null;
  employeeId: string | null;
  status: string;
  skipReason: string | null;
  error: string | null;
  sentAt: string | null;
  unsubscribedAt: string | null;
};

export type SuppressionRow = {
  email: string;
  reason: "unsubscribed" | "bounced" | "manual";
  campaignId: string | null;
  campaignName: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type AudiencePreview = {
  total: number;
  bySource: { client: number; lead: number; employee: number; extra: number };
  skipped: { unsubscribed: number; invalid: number };
  withoutEmail: number;
  sample: { email: string; name: string; source: string; merge: Record<string, string> }[];
};

export type NewsletterSettingsResponse = {
  config: NewsletterConfig;
  senderEmail: string;
  senderConfigured: boolean;
  demo: boolean;
};

export type WorkerState = "ran" | "busy" | "throttled" | "idle";

export type UploadedImage = { url: string; name: string; size: number; uploadedAt: string };

export type ContactStatus = Record<
  string,
  { unsubscribed?: { at: string; campaignId: string }; campaigns: { id: string; name: string; sentAt: string }[] }
>;
