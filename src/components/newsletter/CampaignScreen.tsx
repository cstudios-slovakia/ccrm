import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Copy, Trash2 } from "lucide-react";
import { EntityHeader, Page, Surface } from "../layout";
import { InlineRenameName } from "../ui/InlineRenameName";
import { useConfirmDialog } from "../ui/ConfirmDialog";
import { AudienceEditor } from "./AudienceEditor";
import { CampaignSummaryView } from "./CampaignSummaryView";
import { SenderCard } from "./SenderCard";
import { isAudienceValid, normalizeAudience } from "./audience";
import { NewsletterApiError, newsletterApi, newsletterErrorMessage } from "./newsletterApi";
import type { Audience, AudiencePreview, Campaign, CampaignPatch, NewsletterSettingsResponse } from "./types";
import { BTN_SECONDARY, Loading, Notice, StatusChip, type NewsletterData, type NewsletterEnv } from "./shared";

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
  const timer = useRef<number | undefined>(undefined);
  const idRef = useRef(id);
  idRef.current = id;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setSave("saving");
    try {
      await newsletterApi.update(idRef.current, patch);
      setSave((s) => (Object.keys(pending.current).length ? s : "saved"));
    } catch (e) {
      pending.current = { ...patch, ...pending.current };
      setSave("error");
      if (e instanceof NewsletterApiError && e.status === 409) {
        // Started elsewhere meanwhile: the draft is no longer editable.
        pending.current = {};
        setError(newsletterErrorMessage(e, t));
        newsletterApi.get(idRef.current).then(setCampaign).catch(() => undefined);
      }
    }
  }, [t]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      void flushRef.current();
    },
    [],
  );

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
    newsletterApi
      .get(id)
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

  const back = () => {
    void flush().then(() => navigate("newsletter"));
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
  if (!campaign) {
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
      await flush();
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
  const senderOk = campaign.subject.trim().length > 0 && !!settings?.senderConfigured;

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
        <CampaignSummaryView campaign={campaign} settings={settings} env={env} />
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

          <CardShell title={t("Content", "Obsah", "Tartalom")} mark="none">
            <div className="grid gap-4">
              <p className="text-ui text-slate-500">{t("Design editor coming soon.", "Editor dizajnu už čoskoro.", "A dizájnszerkesztő hamarosan érkezik.")}</p>
              <div className="grid gap-2">
                <label className="flex cursor-pointer items-center gap-3 text-ui text-slate-800">
                  <input
                    type="checkbox"
                    role="switch"
                    disabled={!editable}
                    checked={campaign.useHeader}
                    onChange={(e) => queue({ useHeader: e.target.checked })}
                    className="size-4 accent-indigo-600"
                  />
                  {t("Use the global header", "Použiť globálnu hlavičku", "A globális fejléc használata")}
                </label>
                <label className="flex cursor-pointer items-center gap-3 text-ui text-slate-800">
                  <input
                    type="checkbox"
                    role="switch"
                    disabled={!editable}
                    checked={campaign.useFooter}
                    onChange={(e) => queue({ useFooter: e.target.checked })}
                    className="size-4 accent-indigo-600"
                  />
                  {t("Use the global footer", "Použiť globálnu pätičku", "A globális lábléc használata")}
                </label>
              </div>
            </div>
          </CardShell>

          <CardShell title={t("Review and send", "Kontrola a odoslanie", "Ellenőrzés és küldés")} mark="none">
            <ul className="grid gap-2 text-ui">
              {[
                { ok: recipientsOk, label: t("There is at least one recipient", "Je aspoň jeden príjemca", "Van legalább egy címzett") },
                { ok: campaign.subject.trim().length > 0, label: t("The subject is filled in", "Predmet je vyplnený", "A tárgy ki van töltve") },
                { ok: !!settings?.senderConfigured, label: t("Outgoing e-mail is set up", "Odchádzajúca pošta je nastavená", "A kimenő levelezés be van állítva") },
              ].map((c) => (
                <li key={c.label} className={`flex items-center gap-2 ${c.ok ? "text-slate-700" : "text-amber-700"}`}>
                  {c.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleAlert className="size-4" />}
                  {c.label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-ui text-slate-500">
              {t("Test send and sending will be added with the design editor.", "Testovacie odoslanie a odoslanie pribudnú spolu s editorom dizajnu.", "A tesztküldés és a küldés a dizájnszerkesztővel együtt érkezik.")}
            </p>
          </CardShell>
        </div>
      )}
    </Page>
  );
};
