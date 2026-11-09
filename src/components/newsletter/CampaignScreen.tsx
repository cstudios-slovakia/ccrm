import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Copy, Trash2 } from "lucide-react";
import { EntityHeader, Page, Surface } from "../layout";
import { InlineRenameName } from "../ui/InlineRenameName";
import { useConfirmDialog } from "../ui/ConfirmDialog";
import { AudienceEditor } from "./AudienceEditor";
import { CampaignSummaryView } from "./CampaignSummaryView";
import { ContentCard } from "./ContentCard";
import { ReviewCard } from "./ReviewCard";
import { SenderCard } from "./SenderCard";
import { composeEmail } from "./composeEmail";
import { DEFAULT_NEWSLETTER_CONFIG } from "./types";
import { isAudienceValid, normalizeAudience } from "./audience";
import { NewsletterApiError, newsletterApi, newsletterErrorMessage } from "./newsletterApi";
import type { Audience, AudiencePreview, Campaign, CampaignPatch, NewsletterSettingsResponse } from "./types";
import { settleSaves } from "./useDebouncedSave";
import { registerPendingSave } from "../../utils/pendingSaves";
import { BTN_SECONDARY, Loading, Notice, StatusChip, senderReady, unsavedLeaveOptions, type NewsletterData, type NewsletterEnv } from "./shared";

type SaveState = "idle" | "saving" | "saved" | "error";

const CardShell = ({
  title,
  mark,
  children,
}: {
  title: string;
  mark: "done" | "attention" | "none";
  children: ReactNode;
}) => (
  <Surface>
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="type-panel-title text-slate-900">{title}</h3>
      {mark === "done" && <CheckCircle2 className="size-5 text-emerald-600" aria-label="OK" />}
      {mark === "attention" && <CircleAlert className="size-5 text-amber-600" aria-hidden="true" />}
    </div>
    {children}
  </Surface>
);

/** `#newsletter/<id>`: the draft editor, or the read-only summary once the campaign has been started. */
export const CampaignScreen = ({ id, env, data }: { id: string; env: NewsletterEnv; data: NewsletterData }) => {
  const { t, navigate, canEdit } = env;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [settings, setSettings] = useState<NewsletterSettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [confirm, confirmNode] = useConfirmDialog();

  // Edits go out together, 700 ms after the last keystroke, and at once when leaving the screen.
  const pending = useRef<CampaignPatch>({});
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const idRef = useRef(id);
  idRef.current = id;

  /**
   * Writes the waiting edits now, one request at a time (two PATCHes never overtake each other).
   * Resolves true when nothing is left unsaved, false when a write failed. Sending checks it: the
   * server sends the stored subject and audience, not what is on screen.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    for (;;) {
      if (inFlight.current) {
        await inFlight.current;
        continue;
      }
      const patch = pending.current;
      if (Object.keys(patch).length === 0) return true;
      pending.current = {};
      setSave("saving");
      const run = newsletterApi.update(idRef.current, patch).then(
        () => {
          setSave((s) => (Object.keys(pending.current).length ? s : "saved"));
          return true;
        },
        (e: unknown) => {
          pending.current = { ...patch, ...pending.current };
          setSave("error");
          if (e instanceof NewsletterApiError && e.status === 409) {
            // Started elsewhere meanwhile: the draft is no longer editable.
            pending.current = {};
            setError(newsletterErrorMessage(e, t));
            newsletterApi.get(idRef.current).then(setCampaign).catch(() => undefined);
          }
          return false;
        },
      );
      inFlight.current = run;
      const ok = await run;
      if (inFlight.current === run) inFlight.current = null;
      if (!ok) return false;
    }
  }, [t]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    // A reload inside the 700 ms pause hands the edits to the app's unload guard.
    const unregister = registerPendingSave({
      isPending: () => Object.keys(pending.current).length > 0,
      flush: () => void flushRef.current(),
    });
    return () => {
      unregister();
      void flushRef.current();
    };
  }, []);

  /** Saves, then goes; when the save failed, asks before leaving the edits behind. */
  const leave = async (go: () => void) => {
    if (await flush()) return go();
    if (await confirm(unsavedLeaveOptions(t))) go();
  };

  const queue = useCallback(
    (patch: CampaignPatch, immediate = false) => {
      setCampaign((c) => (c ? ({ ...c, ...patch } as Campaign) : c));
      pending.current = { ...pending.current, ...patch };
      setSave("saving");
      window.clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = window.setTimeout(() => void flush(), 700);
    },
    [flush],
  );

  useEffect(() => {
    let cancelled = false;
    setCampaign(null);
    setError(null);
    setSave("idle");
    settleSaves()
      .then(() => newsletterApi.get(id))
      .then((c) => !cancelled && setCampaign({ ...c, audience: normalizeAudience(c.audience) }))
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

  const back = () => void leave(() => navigate("newsletter"));
  const editDesign = () => void leave(() => navigate(`newsletter/${id}/design`));
  // The e-mail exactly as it would be sent: the thumbnail, the checklist and Start send all use this one render.
  const rendered = useMemo(
    () =>
      campaign
        ? composeEmail({
            campaign,
            config: settings?.config ?? DEFAULT_NEWSLETTER_CONFIG,
            company: env.company,
            language: env.language,
            assetBaseUrl: window.location.origin,
          })
        : null,
    [campaign, settings, env.company, env.language],
  );
  // Sending has started: fetch the stored campaign (with its snapshot) so the results view has it all.
  const started = (c: Campaign) => {
    setCampaign((prev) => (prev ? { ...prev, ...c, audience: normalizeAudience(c.audience) } : prev));
    newsletterApi.get(id).then((full) => setCampaign({ ...full, audience: normalizeAudience(full.audience) })).catch(() => undefined);
  };

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
  if (!campaign || !rendered) {
    return (
      <Page>
        <Loading t={t} />
      </Page>
    );
  }

  const isDraft = campaign.status === "draft";
  const editable = isDraft && canEdit;

  const duplicate = async () => {
    try {
      if (!(await flush())) {
        window.showToast?.(
          t("Your last changes are not saved. Retry the save first.", "Posledné zmeny nie sú uložené. Najprv skúste uložiť znova.", "Az utolsó módosítások nincsenek mentve. Előbb próbálja újra a mentést."),
          "error",
        );
        return;
      }
      const copy = await newsletterApi.duplicate(campaign.id);
      navigate(`newsletter/${copy.id}`);
    } catch (e) {
      window.showToast?.(newsletterErrorMessage(e, t), "error");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t("Delete this campaign?", "Odstrániť túto kampaň?", "Törli ezt a kampányt?"),
      message: t(`"${campaign.name}" will be removed from the list.`, `„${campaign.name}“ sa odstráni zo zoznamu.`, `„${campaign.name}” eltűnik a listáról.`),
      confirmLabel: t("Delete", "Odstrániť", "Törlés"),
      cancelLabel: t("Cancel", "Zrušiť", "Mégse"),
      danger: true,
    });
    if (!ok) return;
    try {
      pending.current = {};
      window.clearTimeout(timer.current);
      await newsletterApi.remove(campaign.id);
      navigate("newsletter");
    } catch (e) {
      window.showToast?.(newsletterErrorMessage(e, t), "error");
    }
  };

  const audience = campaign.audience as Audience;
  const recipientsOk = isAudienceValid(audience) && (preview ? preview.total > 0 : false);
  const senderOk = campaign.subject.trim().length > 0 && senderReady(settings);
  const contentOk = !!campaign.body && campaign.body.rows.length > 0 && !rendered.warnings.some((w) => w.level === "error");

  const saveLabel =
    save === "saving"
      ? t("Saving…", "Ukladá sa…", "Mentés…")
      : save === "saved"
        ? t("Saved", "Uložené", "Mentve")
        : save === "error"
          ? t("Not saved, retry", "Neuložené, skúsiť znova", "Nincs mentve, újra")
          : "";

  return (
    <Page>
      {confirmNode}
      <EntityHeader
        onBack={back}
        backLabel={t("Back to campaigns", "Späť na kampane", "Vissza a kampányokhoz")}
        title={
          <InlineRenameName
            value={campaign.name}
            canEdit={editable}
            onCommit={(name) => queue({ name }, true)}
            renameTitle={t("Rename", "Premenovať", "Átnevezés")}
          >
            {campaign.name}
          </InlineRenameName>
        }
        badges={
          <>
            <StatusChip status={campaign.status} counts={campaign.counts} t={t} />
            {isDraft && saveLabel && (
              <button
                type="button"
                onClick={() => void flush()}
                disabled={save !== "error"}
                aria-live="polite"
                data-testid="newsletter-save-status"
                data-state={save}
                className={`type-meta ${save === "error" ? "text-rose-700 underline cursor-pointer" : "text-slate-500"}`}
              >
                {saveLabel}
              </button>
            )}
          </>
        }
        actions={
          canEdit && (
            <>
              <button type="button" className={BTN_SECONDARY} onClick={duplicate}>
                <Copy className="size-4" />
                {t("Duplicate", "Duplikovať", "Másolás")}
              </button>
              {campaign.status !== "sending" && (
                <button type="button" className={`${BTN_SECONDARY} hover:text-rose-700`} onClick={remove}>
                  <Trash2 className="size-4" />
                  {t("Delete", "Odstrániť", "Törlés")}
                </button>
              )}
            </>
          )
        }
      />

      {error && <Notice tone="warning">{error}</Notice>}
      {isDraft && !canEdit && (
        <Notice tone="info">
          {t("You can view this draft but not change it.", "Tento koncept môžete zobraziť, ale nie meniť.", "Ezt a piszkozatot megtekintheti, de nem módosíthatja.")}
        </Notice>
      )}

      {!isDraft ? (
        <CampaignSummaryView campaign={campaign} settings={settings} env={env} onChange={(patch) => setCampaign((c) => (c ? { ...c, ...patch } : c))} />
      ) : (
        <div className="grid gap-6">
          <CardShell title={t("Recipients", "Príjemcovia", "Címzettek")} mark={recipientsOk ? "done" : "attention"}>
            <AudienceEditor
              audience={audience}
              onChange={(next) => queue({ audience: next })}
              disabled={!editable}
              env={env}
              data={data}
              onPreview={setPreview}
            />
          </CardShell>

          <CardShell title={t("Sender and subject", "Odosielateľ a predmet", "Feladó és tárgy")} mark={senderOk ? "done" : "attention"}>
            <SenderCard campaign={campaign} settings={settings} disabled={!editable} env={env} onPatch={(patch) => queue(patch)} />
          </CardShell>

          <CardShell title={t("Content", "Obsah", "Tartalom")} mark={contentOk ? "done" : "attention"}>
            <ContentCard campaign={campaign} rendered={rendered} editable={editable} env={env} onPatch={(patch) => queue(patch)} onEditDesign={editDesign} />
          </CardShell>

          <CardShell title={t("Review and send", "Kontrola a odoslanie", "Ellenőrzés és küldés")} mark="none">
            <ReviewCard
              campaign={campaign}
              rendered={rendered}
              settings={settings}
              recipientCount={preview ? preview.total : null}
              audienceValid={isAudienceValid(audience)}
              env={env}
              userEmail={data.userEmail}
              samples={preview?.sample ?? []}
              beforeSend={flush}
              onStarted={started}
            />
          </CardShell>
        </div>
      )}
    </Page>
  );
};
