/** The "Review and send" checklist of docs/NEWSLETTER.md C12 (card 4). Pure, so it is unit-tested. */
import type { RenderWarning } from "./builder";

export type CheckKey = "recipients" | "subject" | "sender" | "unsubscribe" | "render";

export type ReviewInput = {
  /** `audience_preview.total`; null while it has not loaded. */
  recipientCount: number | null;
  audienceValid: boolean;
  subject: string;
  senderConfigured: boolean;
  warnings: RenderWarning[];
};

export type CheckItem = { key: CheckKey; ok: boolean };

export const reviewChecklist = (i: ReviewInput): CheckItem[] => [
  { key: "recipients", ok: i.audienceValid && (i.recipientCount ?? 0) > 0 },
  { key: "subject", ok: i.subject.trim().length > 0 },
  { key: "sender", ok: i.senderConfigured },
  { key: "unsubscribe", ok: !i.warnings.some((w) => w.code === "missing_unsubscribe") },
  // Every other renderer error (a dangerous link); `missing_unsubscribe` has its own line.
  { key: "render", ok: !i.warnings.some((w) => w.level === "error" && w.code !== "missing_unsubscribe") },
];

/** Which checks fail, in checklist order. Empty = ready to send. */
export const failedChecks = (items: CheckItem[]): CheckKey[] => items.filter((c) => !c.ok).map((c) => c.key);

/** Why the send button is disabled, as a key: permission first, then the first failed check; null = enabled. */
export const sendBlock = (items: CheckItem[], canSend: boolean): "permission" | CheckKey | null =>
  !canSend ? "permission" : (failedChecks(items)[0] ?? null);
