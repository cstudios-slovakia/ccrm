import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, Eye, Pause, Play } from "lucide-react";
import { StatGrid, StatTile, Surface } from "../layout";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { EmailPreviewModal } from "./builder";
import { RecipientsTable } from "./RecipientsTable";
import { audienceLabel, normalizeAudience } from "./audience";
import { knownErrorLine, newsletterApi, newsletterErrorDetail, newsletterErrorMessage } from "./newsletterApi";
import { formatDuration, minutesLeft, shouldPoll } from "./sendProgress";
import type { Campaign, NewsletterSettingsResponse } from "./types";
import { BTN_SECONDARY, Notice, formatDate, progressPercent, type NewsletterEnv } from "./shared";

const POLL_MS = 5000;

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="grid gap-0.5 ws-sm:grid-cols-[10rem_minmax(0,1fr)] ws-sm:gap-4">
    <dt className="type-label text-slate-500">{label}</dt>
    <dd className="min-w-0 break-words text-ui text-slate-900">{value || "-"}</dd>
  </div>
);

/** The results of a started campaign (docs/NEWSLETTER.md C12 "after start"): progress, numbers, controls, recipients. */
export const CampaignSummaryView = ({
  campaign,
  settings,
  env,
  onChange,
}: {
  campaign: Campaign;
  settings: NewsletterSettingsResponse | null;
  env: NewsletterEnv;
  /** Merges fresh values (progress, a new status) into the campaign the screen holds. */
  onChange: (patch: Partial<Campaign>) => void;
}) => {
  const { t, language, canSend } = env;
  const c = campaign.counts;
  const pct = progressPercent(c);
  const fromName = campaign.fromName || settings?.config.sender.fromName || "";
  const replyTo = campaign.replyTo || settings?.config.sender.replyTo || "";
  const [busy, setBusy] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [actionError, setActionError] = useState<{ line: string; detail: string | null } | null>(null);

  // `tick` doubles as the progress poll and as the worker trigger for installs without a cron (C10).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const status = campaign.status;
  useEffect(() => {
    if (status !== "sending") return undefined;
    let stopped = false;
    let inFlight = false;
    const poll = () => {
      if (stopped || inFlight || !shouldPoll(status, document.visibilityState)) return;
      inFlight = true;
      newsletterApi
        .tick(campaign.id)
        .then((r) => {
          if (!stopped && r.campaign) onChangeRef.current(r.campaign);
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    poll();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [campaign.id, status]);

  const run = async (fn: (id: string) => Promise<Campaign>) => {
    setBusy(true);
    setActionError(null);
    try {
      const next = await fn(campaign.id);
      onChange(next);
    } catch (e) {
      setActionError({ line: newsletterErrorMessage(e, t), detail: newsletterErrorDetail(e) });
    } finally {
      setBusy(false);
    }
  };

  const left = status === "sending" ? minutesLeft(c, settings?.config.sending.perHourLimit ?? 0) : null;
  const noPermission = t("You need the permission to send newsletters.", "Na odosielanie newsletterov potrebujete oprávnenie.", "A hírlevél küldéséhez jogosultság kell.");
  // The server's own reason is English; show it as the detail under a translated heading.
  const errorHeading = knownErrorLine("smtp_failed", t);

  return (
    <div className="grid gap-6">
      {campaign.lastError && (
        <Notice tone="error">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {status === "paused" && (
                <span className="block font-semibold">
                  {t("Sending was paused because of an error.", "Odosielanie sa pozastavilo kvôli chybe.", "A küldés hiba miatt szünetel.")}
                </span>
              )}
              {status !== "paused" && errorHeading && <span className="block font-semibold">{errorHeading}</span>}
              <span className="block break-words font-mono text-micro">{campaign.lastError}</span>{" "}
              <a href="#settings/email/outgoing" className="font-semibold underline">
                {t("Outgoing e-mail settings", "Nastavenia odchádzajúcej pošty", "Kimenő levelezés beállításai")}
              </a>
            </span>
          </span>
        </Notice>
      )}

      <Surface>
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3 type-label text-slate-600">
            <span>{t("Progress", "Priebeh", "Előrehaladás")}</span>
            <span>
              {pct} %{left != null && ` · ${formatDuration(left, t)}`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" data-testid="newsletter-progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {status === "sending" && (
              <button type="button" className={BTN_SECONDARY} disabled={busy || !canSend} title={canSend ? undefined : noPermission} onClick={() => void run(newsletterApi.pause)}>
                <Pause className="size-4" />
                {t("Pause", "Pozastaviť", "Szüneteltetés")}
              </button>
            )}
            {status === "paused" && (
              <button type="button" className={BTN_SECONDARY} disabled={busy || !canSend} title={canSend ? undefined : noPermission} onClick={() => void run(newsletterApi.resume)}>
                <Play className="size-4" />
                {t("Resume", "Pokračovať", "Folytatás")}
              </button>
            )}
            {(status === "sending" || status === "paused") && (
              <HoldToConfirmButton
                tone="danger"
                lang={language as "en" | "sk" | "hu"}
                what={campaign.name}
                aria-label={t("Cancel sending, hold to confirm", "Zrušiť odosielanie, podržte pre potvrdenie", "Küldés megszakítása, tartsa lenyomva a megerősítéshez")}
                hint={t("Hold to cancel sending", "Podržte pre zrušenie odosielania", "Tartsa lenyomva a küldés megszakításához")}
                onConfirm={() => void run(newsletterApi.cancel)}
                disabled={busy || !canSend}
                title={canSend ? undefined : noPermission}
                icon={<Ban className="size-4" />}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-ui font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("Cancel sending", "Zrušiť odosielanie", "Küldés megszakítása")}
              </HoldToConfirmButton>
            )}
            <button type="button" className={BTN_SECONDARY} disabled={!campaign.htmlSnapshot} onClick={() => setViewOpen(true)} data-testid="newsletter-view-email">
              <Eye className="size-4" />
              {t("View e-mail", "Zobraziť e-mail", "E-mail megtekintése")}
            </button>
          </div>
          {actionError && (
            <Notice tone="error">
              <p>{actionError.line}</p>
              {actionError.detail && <p className="mt-1 break-words font-mono text-micro">{actionError.detail}</p>}
            </Notice>
          )}
        </div>
      </Surface>

      <StatGrid count={5}>
        <StatTile label={t("Recipients", "Príjemcovia", "Címzettek")} value={c.total} />
        <StatTile label={t("Sent", "Odoslané", "Elküldve")} value={c.sent} />
        <StatTile label={t("Failed", "Zlyhané", "Sikertelen")} value={c.failed} />
        <StatTile label={t("Skipped", "Preskočené", "Kihagyva")} value={c.skipped} />
        <StatTile label={t("Unsubscribed", "Odhlásení", "Leiratkozottak")} value={c.unsubscribed} />
      </StatGrid>

      <Surface>
        <dl className="grid gap-3">
          <Row label={t("Subject", "Predmet", "Tárgy")} value={campaign.subject} />
          <Row label={t("Recipients", "Príjemcovia", "Címzettek")} value={audienceLabel(normalizeAudience(campaign.audience), t)} />
          <Row label={t("From", "Odosielateľ", "Feladó")} value={[fromName, settings?.senderEmail].filter(Boolean).join(" · ")} />
          <Row label={t("Reply-To", "Odpovedať na", "Válaszcím")} value={replyTo} />
          <Row label={t("Started", "Spustená", "Indítva")} value={formatDate(campaign.startedAt, language)} />
          <Row label={t("Finished", "Dokončená", "Befejezve")} value={formatDate(campaign.finishedAt, language)} />
        </dl>
      </Surface>

      <div className="grid gap-3">
        <h3 className="type-panel-title text-slate-900">{t("Recipients", "Príjemcovia", "Címzettek")}</h3>
        <RecipientsTable id={campaign.id} env={env} refreshKey={`${c.sent}-${c.failed}-${c.skipped}-${c.cancelled}-${campaign.status}`} />
      </div>

      {campaign.htmlSnapshot && (
        <EmailPreviewModal
          open={viewOpen}
          onClose={() => setViewOpen(false)}
          html={campaign.htmlSnapshot}
          language={language === "sk" || language === "hu" ? language : "en"}
          title={campaign.subject || campaign.name}
        />
      )}
    </div>
  );
};
