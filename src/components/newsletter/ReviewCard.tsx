import { useState } from "react";
import { CheckCircle2, CircleAlert, Send } from "lucide-react";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import type { RenderResult, RenderWarning } from "./builder";
import { SendTestDialog } from "./SendTestDialog";
import { newsletterApi, newsletterErrorDetail, newsletterErrorMessage } from "./newsletterApi";
import { reviewChecklist, sendBlock, type CheckKey } from "./reviewChecklist";
import type { AudiencePreview, Campaign, NewsletterSettingsResponse } from "./types";
import { BTN_SECONDARY, Notice, senderReady, unsavedSendLine, type NewsletterEnv } from "./shared";

const checkLabel = (key: CheckKey, t: NewsletterEnv["t"]): string => {
  switch (key) {
    case "recipients":
      return t("There is at least one recipient", "Je aspoň jeden príjemca", "Van legalább egy címzett");
    case "subject":
      return t("The subject is filled in", "Predmet je vyplnený", "A tárgy ki van töltve");
    case "sender":
      return t("Outgoing e-mail is set up", "Odchádzajúca pošta je nastavená", "A kimenő levelezés be van állítva");
    case "unsubscribe":
      return t("The e-mail has an unsubscribe link", "E-mail má odkaz na odhlásenie", "Az e-mailben van leiratkozási hivatkozás");
    case "render":
      return t("The e-mail has no errors (links, images)", "E-mail nemá chyby (odkazy, obrázky)", "Az e-mail hibamentes (hivatkozások, képek)");
  }
};

/** Why the send button is disabled, in words. */
const blockReason = (block: NonNullable<ReturnType<typeof sendBlock>>, t: NewsletterEnv["t"]): string =>
  block === "permission"
    ? t("You need the permission to send newsletters.", "Na odosielanie newsletterov potrebujete oprávnenie.", "A hírlevél küldéséhez jogosultság kell.")
    : t(`Not ready: ${checkLabel(block, (en) => en).toLowerCase()}.`, `Nie je pripravené: ${checkLabel(block, (_en, sk) => sk).toLowerCase()}.`, `Nem kész: ${checkLabel(block, (_en, _sk, hu) => hu).toLowerCase()}.`);

/** C12 card 4: checklist, renderer warnings, Send test and Hold to send. */
export const ReviewCard = ({
  campaign,
  rendered,
  settings,
  recipientCount,
  audienceValid,
  env,
  userEmail,
  samples,
  beforeSend,
  onStarted,
}: {
  campaign: Campaign;
  rendered: RenderResult;
  settings: NewsletterSettingsResponse | null;
  /** `audience_preview.total`, null until it loads. */
  recipientCount: number | null;
  audienceValid: boolean;
  env: NewsletterEnv;
  userEmail: string;
  /** `audience_preview.sample`: the Send test dialog offers these as the sample recipient. */
  samples: AudiencePreview["sample"];
  /** Writes every pending edit before the server looks at the campaign; false when that failed. */
  beforeSend: () => Promise<boolean>;
  onStarted: (c: Campaign) => void;
}) => {
  const { t, language, canSend, canEdit } = env;
  const [testOpen, setTestOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ line: string; detail: string | null } | null>(null);

  const items = reviewChecklist({
    recipientCount,
    audienceValid,
    subject: campaign.subject,
    senderConfigured: senderReady(settings),
    warnings: rendered.warnings,
  });
  const block = sendBlock(items, canSend && canEdit);
  const others = rendered.warnings.filter((w) => w.level === "warning" || (w.level === "error" && w.code !== "missing_unsubscribe"));
  const text = (w: RenderWarning) => w.message[language === "sk" || language === "hu" ? language : "en"] || w.message.en;

  const start = async () => {
    if (sending || block) return;
    setSending(true);
    setError(null);
    try {
      // The server sends the stored subject and audience: never start on top of a failed save.
      if (!(await beforeSend())) {
        setError({ line: unsavedSendLine(t), detail: null });
        return;
      }
      // Render again at this moment: what is posted is exactly this render (B2.2).
      const c = await newsletterApi.startSend({ id: campaign.id, html: rendered.html, text: rendered.text });
      onStarted(c);
    } catch (e) {
      setError({ line: newsletterErrorMessage(e, t), detail: newsletterErrorDetail(e) });
      window.showToast?.(newsletterErrorMessage(e, t), "error");
    } finally {
      setSending(false);
    }
  };

  const label =
    recipientCount != null
      ? t(`Hold to send to ${recipientCount} recipients`, `Podržte pre odoslanie ${recipientCount} príjemcom`, `Tartsa lenyomva a küldéshez (${recipientCount} címzett)`)
      : t("Hold to send", "Podržte pre odoslanie", "Tartsa lenyomva a küldéshez");

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2 text-ui" data-testid="newsletter-checklist">
        {items.map((c) => (
          <li key={c.key} className={`flex items-center gap-2 ${c.ok ? "text-slate-700" : "text-amber-700"}`}>
            {c.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <CircleAlert className="size-4 shrink-0" />}
            {checkLabel(c.key, t)}
          </li>
        ))}
      </ul>

      {others.length > 0 && (
        <Notice tone="warning">
          <ul className="grid gap-1">
            {others.map((w, i) => (
              <li key={`${w.code}-${w.blockId ?? i}`}>{text(w)}</li>
            ))}
          </ul>
        </Notice>
      )}

      {error && (
        <Notice tone="error">
          <p>{error.line}</p>
          {error.detail && <p className="mt-1 break-words font-mono text-micro">{error.detail}</p>}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={!canSend}
          title={canSend ? undefined : blockReason("permission", t)}
          onClick={() => setTestOpen(true)}
          data-testid="newsletter-send-test"
        >
          <Send className="size-4" />
          {t("Send test", "Odoslať test", "Teszt küldése")}
        </button>
        <HoldToConfirmButton
          tone="archive"
          lang={language as "en" | "sk" | "hu"}
          onConfirm={() => void start()}
          disabled={!!block || sending}
          hint={t("Hold to send", "Podržte pre odoslanie", "Tartsa lenyomva a küldéshez")}
          aria-label={label}
          title={block ? blockReason(block, t) : undefined}
          icon={<Send className="size-4" />}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-ui font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="newsletter-send"
        >
          {sending ? t("Starting…", "Spúšťa sa…", "Indítás…") : label}
        </HoldToConfirmButton>
      </div>
      {block && <p className="type-meta text-amber-700">{blockReason(block, t)}</p>}

      <SendTestDialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        env={env}
        campaignId={campaign.id}
        subject={campaign.subject}
        render={() => ({ html: rendered.html, text: rendered.text })}
        configured={settings?.config.sending.testRecipients ?? []}
        userEmail={userEmail}
        samples={samples}
        beforeSend={beforeSend}
      />
    </div>
  );
};
