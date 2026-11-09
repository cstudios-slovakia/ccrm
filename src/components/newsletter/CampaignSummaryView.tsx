import { AlertTriangle } from "lucide-react";
import { StatGrid, StatTile, Surface } from "../layout";
import { audienceLabel, normalizeAudience } from "./audience";
import type { Campaign, NewsletterSettingsResponse } from "./types";
import { Notice, formatDate, progressPercent, type NewsletterEnv } from "./shared";

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="grid gap-0.5 ws-sm:grid-cols-[10rem_minmax(0,1fr)] ws-sm:gap-4">
    <dt className="type-label text-slate-500">{label}</dt>
    <dd className="min-w-0 break-words text-ui text-slate-900">{value || "-"}</dd>
  </div>
);

/** Read-only summary of a campaign that has been started (the results view with the recipient table is package 2B). */
export const CampaignSummaryView = ({
  campaign,
  settings,
  env,
}: {
  campaign: Campaign;
  settings: NewsletterSettingsResponse | null;
  env: NewsletterEnv;
}) => {
  const { t, language } = env;
  const c = campaign.counts;
  const pct = progressPercent(c);
  const fromName = campaign.fromName || settings?.config.sender.fromName || "";
  const replyTo = campaign.replyTo || settings?.config.sender.replyTo || "";

  return (
    <div className="grid gap-6">
      {campaign.lastError && (
        <Notice tone="error">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {campaign.lastError}{" "}
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
            <span>{pct} %</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
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
    </div>
  );
};
