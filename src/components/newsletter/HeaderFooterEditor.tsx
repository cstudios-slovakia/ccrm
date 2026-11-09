import { useMemo } from "react";
import { ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import { SaveStatus, SectionCard } from "../settings/SectionCard";
import type { AutosaveStatus } from "../settings/useAutosave";
import type { Language } from "../../utils/translations";
import { makeT } from "../../utils/timeTracking";
import { EmailBuilder, defaultFooter, defaultHeader, emptyDoc, renderEmail, type CompanyInfo, type EmailDoc } from "./builder";
import { EmailThumbnail } from "./EmailThumbnail";
import { newsletterApi } from "./newsletterApi";
import type { NewsletterConfig } from "./types";
import { BTN_PRIMARY, BTN_SECONDARY, Notice } from "./shared";

export type Slot = "header" | "footer";

const DESIGN_HASH = "settings/newsletter/design";

const defaultDoc = (slot: Slot, company: CompanyInfo, lang: string): EmailDoc => (slot === "header" ? defaultHeader(company, lang) : defaultFooter(company, lang));

/** Settings > Newsletter > Design: the Header and Footer cards, each a thumbnail and Edit (docs/NEWSLETTER.md C13). */
export const HeaderFooterCards = ({ config, company, language, canEdit }: { config: NewsletterConfig; company: CompanyInfo; language: Language; canEdit: boolean }) => {
  const t = useMemo(() => makeT(language), [language]);
  return (
    <div className="grid gap-6 ws-md:grid-cols-2">
      {(["header", "footer"] as const).map((slot) => {
        const doc = config[slot] ?? defaultDoc(slot, company, language);
        const html = renderEmail({
          header: slot === "header" ? doc : null,
          body: emptyDoc(),
          footer: slot === "footer" ? doc : null,
          theme: config.theme,
          subject: "",
          assetBaseUrl: window.location.origin,
          lang: language,
        }).html;
        const title = slot === "header" ? t("Header", "Hlavička", "Fejléc") : t("Footer", "Pätička", "Lábléc");
        return (
          <SectionCard
            key={slot}
            title={title}
            description={
              slot === "header"
                ? t("Shown above every campaign.", "Zobrazuje sa nad každou kampaňou.", "Minden kampány felett megjelenik.")
                : t("Shown below every campaign. It must keep the unsubscribe link.", "Zobrazuje sa pod každou kampaňou. Musí obsahovať odkaz na odhlásenie.", "Minden kampány alatt megjelenik. Tartalmaznia kell a leiratkozási hivatkozást.")
            }
          >
            <div className="grid gap-3">
              <EmailThumbnail html={html} height={slot === "header" ? 150 : 220} label={title} />
              <p className="type-meta text-slate-500">
                {config[slot]
                  ? t("Edited by you.", "Upravené vami.", "Ön szerkesztette.")
                  : t("Default, built from the company profile.", "Predvolená, vytvorená z profilu firmy.", "Alapértelmezett, a cégprofilból készült.")}
              </p>
              <div>
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={() => {
                    window.location.hash = `${DESIGN_HASH}/${slot}`;
                  }}
                  data-testid={`newsletter-edit-${slot}`}
                >
                  <Pencil className="size-4" />
                  {canEdit ? t("Edit", "Upraviť", "Szerkesztés") : t("View", "Zobraziť", "Megtekintés")}
                </button>
              </div>
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
};

/** The builder in header or footer mode, on the whole settings page (`settings/newsletter/design/header|footer`). */
export const HeaderFooterEditor = ({
  slot,
  config,
  company,
  language,
  canEdit,
  status,
  onChange,
}: {
  slot: Slot;
  config: NewsletterConfig;
  company: CompanyInfo;
  language: Language;
  canEdit: boolean;
  status: AutosaveStatus;
  /** `null` goes back to the default document. */
  onChange: (doc: EmailDoc | null) => void;
}) => {
  const t = useMemo(() => makeT(language), [language]);
  const stored = config[slot];
  const doc = useMemo(() => stored ?? defaultDoc(slot, company, language), [stored, slot, company, language]);
  const title = slot === "header" ? t("Header", "Hlavička", "Fejléc") : t("Footer", "Pätička", "Lábléc");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => {
            window.location.hash = DESIGN_HASH;
          }}
        >
          <ArrowLeft className="size-4" />
          {t("Back to design settings", "Späť na nastavenia dizajnu", "Vissza a dizájnbeállításokhoz")}
        </button>
        <h2 className="type-panel-title text-slate-900">{title}</h2>
        <span className="ml-auto flex items-center gap-3">
          <SaveStatus lang={language} status={status} />
          {canEdit && stored && (
            <button type="button" className={BTN_SECONDARY} onClick={() => onChange(null)}>
              <RotateCcw className="size-4" />
              {t("Reset to default", "Obnoviť predvolené", "Alapértelmezett visszaállítása")}
            </button>
          )}
        </span>
      </div>
      {!canEdit && (
        <Notice tone="info">{t("You can view these settings but not change them.", "Tieto nastavenia môžete zobraziť, ale nie meniť.", "Ezeket a beállításokat megtekintheti, de nem módosíthatja.")}</Notice>
      )}
      {slot === "footer" && (
        <Notice tone="info">
          {t(
            "Keep a link to {{unsubscribe_url}} in the footer: an e-mail without it cannot be sent.",
            "Ponechajte v pätičke odkaz na {{unsubscribe_url}}: e-mail bez neho sa nedá odoslať.",
            "Tartson a láblécben hivatkozást a {{unsubscribe_url}} címre: az anélküli e-mail nem küldhető el.",
          )}
        </Notice>
      )}
      <div className="h-[calc(100dvh-16rem)] min-h-[34rem]">
        <EmailBuilder
          // A read-only viewer gets the builder without a way to commit: changes are dropped.
          doc={doc}
          onChange={(next) => canEdit && onChange(next)}
          mode={slot}
          theme={config.theme}
          language={language}
          onUploadImage={newsletterApi.uploadImage}
          listImages={() => newsletterApi.images()}
          sampleMerge={{}}
          assetBaseUrl={window.location.origin}
        />
      </div>
    </div>
  );
};

export default HeaderFooterEditor;
