import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Page } from "../layout";
import type { Language } from "../../utils/translations";
import { EmailBuilder, EmailPreview, emptyDoc, type EmailDoc } from "./builder";
import { SendTestDialog } from "./SendTestDialog";
import { composeEmail, resolveFooter, resolveHeader } from "./composeEmail";
import { NewsletterApiError, newsletterApi, newsletterErrorMessage } from "./newsletterApi";
import type { Campaign, NewsletterSettingsResponse } from "./types";
import { useDebouncedSave } from "./useDebouncedSave";
import { useConfirmDialog } from "../ui/ConfirmDialog";
import { BTN_SECONDARY, Loading, Notice, unsavedLeaveOptions, type NewsletterEnv } from "./shared";

const asLanguage = (l: string): Language => (l === "sk" || l === "hu" ? l : "en");

/** `#newsletter/<id>/design` (docs/NEWSLETTER.md C12): the builder on the whole page, autosaving the body. */
export const CampaignDesignScreen = ({ id, env, userEmail }: { id: string; env: NewsletterEnv; userEmail: string }) => {
  const { t, language, navigate, canEdit, canSend, company } = env;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [settings, setSettings] = useState<NewsletterSettingsResponse | null>(null);
  const [sampleMerge, setSampleMerge] = useState<Record<string, string>>({});
  const [body, setBody] = useState<EmailDoc>(emptyDoc());
  const [error, setError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [confirm, confirmNode] = useConfirmDialog();

  const { status, queue, flush } = useDebouncedSave<EmailDoc>(async (doc) => {
    try {
      await newsletterApi.update(id, { body: doc });
    } catch (e) {
      // Started elsewhere meanwhile: the draft is read-only from now on.
      if (e instanceof NewsletterApiError && e.status === 409) {
        setError(newsletterErrorMessage(e, t));
        newsletterApi.get(id).then(setCampaign).catch(() => undefined);
        return;
      }
      throw e;
    }
  });

  useEffect(() => {
    let cancelled = false;
    setCampaign(null);
    setError(null);
    newsletterApi
      .get(id)
      .then((c) => {
        if (cancelled) return;
        setCampaign(c);
        setBody(c.body ?? emptyDoc());
        // The builder's preview shows the first recipient's values instead of the generic sample.
        newsletterApi
          .audiencePreview(c.audience)
          .then((p) => !cancelled && setSampleMerge(p.sample[0]?.merge ?? {}))
          .catch(() => undefined);
      })
      .catch((e) => !cancelled && setError(newsletterErrorMessage(e, t)));
    newsletterApi
      .settingsGet()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const editable = !!campaign && campaign.status === "draft" && canEdit;
  const lang = asLanguage(language);

  const onChange = useCallback(
    (doc: EmailDoc) => {
      setBody(doc);
      queue(doc);
    },
    [queue],
  );

  const config = settings?.config;
  const lockedHeader = useMemo(() => (campaign && config ? resolveHeader(campaign, config, company, language) : null), [campaign, config, company, language]);
  const lockedFooter = useMemo(() => (campaign && config ? resolveFooter(campaign, config, company, language) : null), [campaign, config, company, language]);

  /** Saves, then goes; when the save failed, asks before leaving the edits behind. */
  const leave = async (go: () => void) => {
    if (await flush()) return go();
    if (await confirm(unsavedLeaveOptions(t))) go();
  };
  const back = () => void leave(() => navigate(`newsletter/${id}`));
  const editLocked = (part: "header" | "footer") =>
    void leave(() => {
      window.location.hash = `settings/newsletter/design/${part}`;
    });

  if (error && !campaign) {
    return (
      <Page>
        <Notice tone="error">{error}</Notice>
        <button type="button" onClick={() => navigate("newsletter")} className="w-fit type-label text-indigo-600 cursor-pointer">
          {t("Back to campaigns", "Späť na kampane", "Vissza a kampányokhoz")}
        </button>
      </Page>
    );
  }
  if (!campaign || !config) {
    return (
      <Page>
        <Loading t={t} />
      </Page>
    );
  }

  const render = () => composeEmail({ campaign: { ...campaign, body }, config, company, language, assetBaseUrl: window.location.origin });

  const saveLabel =
    status === "saving"
      ? t("Saving…", "Ukladá sa…", "Mentés…")
      : status === "saved"
        ? t("Saved", "Uložené", "Mentve")
        : status === "error"
          ? t("Not saved, retry", "Neuložené, skúsiť znova", "Nincs mentve, újra")
          : "";

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={BTN_SECONDARY} onClick={back}>
        <ArrowLeft className="size-4" />
        {t("Back to the campaign", "Späť na kampaň", "Vissza a kampányhoz")}
      </button>
      <h1 className="type-panel-title min-w-0 truncate text-slate-900">{campaign.name}</h1>
    </div>
  );

  if (!editable) {
    const rendered = render();
    return (
      <Page className="h-[calc(100dvh-7rem)] !pb-0">
        {header}
        <Notice tone="info">
          {campaign.status !== "draft"
            ? t("This campaign has been started, so the design is read-only.", "Táto kampaň bola spustená, dizajn je iba na čítanie.", "Ez a kampány elindult, a dizájn csak olvasható.")
            : t("You can view this design but not change it.", "Tento dizajn môžete zobraziť, ale nie meniť.", "Ezt a dizájnt megtekintheti, de nem módosíthatja.")}
        </Notice>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <EmailPreview html={campaign.htmlSnapshot && campaign.status !== "draft" ? campaign.htmlSnapshot : rendered.html} warnings={rendered.warnings} language={lang} sampleMerge={sampleMerge} />
        </div>
      </Page>
    );
  }

  return (
    <Page className="h-[calc(100dvh-7rem)] !gap-3 !pb-0">
      {header}
      {error && <Notice tone="warning">{error}</Notice>}
      <div className="min-h-0 flex-1">
        <EmailBuilder
          doc={body}
          onChange={onChange}
          mode="body"
          theme={config.theme}
          language={lang}
          lockedHeader={lockedHeader}
          lockedFooter={lockedFooter}
          onEditLocked={editLocked}
          onUploadImage={newsletterApi.uploadImage}
          listImages={() => newsletterApi.images()}
          sampleMerge={sampleMerge}
          assetBaseUrl={window.location.origin}
          toolbarExtra={
            <>
              {saveLabel && (
                <button
                  type="button"
                  onClick={() => void flush()}
                  disabled={status !== "error"}
                  aria-live="polite"
                  data-testid="newsletter-save-status"
                  data-state={status}
                  className={`type-meta ${status === "error" ? "cursor-pointer text-rose-700 underline" : "text-slate-500"}`}
                >
                  {saveLabel}
                </button>
              )}
              <button
                type="button"
                disabled={!canSend}
                title={canSend ? undefined : t("You need the permission to send newsletters.", "Na odosielanie newsletterov potrebujete oprávnenie.", "A hírlevél küldéséhez jogosultság kell.")}
                onClick={() => setTestOpen(true)}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
                {t("Send test", "Odoslať test", "Teszt küldése")}
              </button>
            </>
          }
        />
      </div>
      <SendTestDialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        env={env}
        campaignId={id}
        subject={campaign.subject}
        render={render}
        configured={config.sending.testRecipients}
        userEmail={userEmail}
        beforeSend={flush}
      />
      {confirmNode}
    </Page>
  );
};
