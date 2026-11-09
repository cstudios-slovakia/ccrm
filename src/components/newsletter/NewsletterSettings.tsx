import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { SaveStatus, SectionCard, SettingsGroup } from "../settings/SectionCard";
import { ColorPicker } from "../ui/ColorPicker";
import { CustomSelect } from "../ui/CustomSelect";
import { makeT } from "../../utils/timeTracking";
import type { CompanyBillingSettings } from "../../types";
import { companyInfoFrom } from "./company";
import type { Language } from "../../utils/translations";
import { parseExtraAddresses } from "./audience";
import { useNewsletterConfig, type NewsletterConfigState } from "./useNewsletterConfig";
import { NEWSLETTER_FONT_STACKS, type NewsletterConfig, type NewsletterSettingsResponse, type NewsletterThemeJson } from "./types";
import { FIELD, HINT, LABEL, Loading, Notice } from "./shared";

// The builder is large and only the header/footer editors and thumbnails need it.
const HeaderFooterEditor = lazy(() => import("./HeaderFooterEditor").then((m) => ({ default: m.HeaderFooterEditor })));
const HeaderFooterCards = lazy(() => import("./HeaderFooterEditor").then((m) => ({ default: m.HeaderFooterCards })));

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

/** A number that is typed freely and clamped to its range when the field loses focus. */
const NumberField = ({
  value,
  min,
  max,
  disabled,
  onCommit,
  id,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (n: number) => void;
  id: string;
}) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = parseFloat(text);
        const next = Number.isFinite(n) ? clamp(n, min, max) : value;
        setText(String(next));
        if (next !== value) onCommit(next);
      }}
      className={FIELD}
    />
  );
};

type Loaded = Pick<NewsletterConfigState, "setDraft" | "status" | "reload"> & { draft: NewsletterConfig; info: NewsletterSettingsResponse };

const Gate = ({ state, t, children }: { state: NewsletterConfigState; t: ReturnType<typeof makeT>; children: (s: Loaded) => ReactNode }) => {
  if (state.error) {
    return (
      <div className="grid gap-3">
        <Notice tone="error">{state.error}</Notice>
        <button type="button" onClick={state.reload} className="w-fit type-label text-indigo-600 cursor-pointer">
          {t("Try again", "Skúsiť znova", "Újra")}
        </button>
      </div>
    );
  }
  if (!state.draft || !state.info) return <Loading t={t} />;
  return <>{children({ ...state, draft: state.draft, info: state.info })}</>;
};

/** Settings > Newsletter > Sending (docs/NEWSLETTER.md C13). */
export const NewsletterSendingSettings = ({ language, canEdit }: { language: Language; canEdit: boolean }) => {
  const t = useMemo(() => makeT(language), [language]);
  const state = useNewsletterConfig(t, canEdit);
  const [testRaw, setTestRaw] = useState<string | null>(null);

  return (
    <div className="grid gap-6">
      <Gate state={state} t={t}>
        {({ draft, info, setDraft, status }) => {
          const tests = testRaw ?? draft.sending.testRecipients.join("\n");
          const parsed = parseExtraAddresses(tests);
          return (
            <>
              {!canEdit && (
                <Notice tone="info">{t("You can view these settings but not change them.", "Tieto nastavenia môžete zobraziť, ale nie meniť.", "Ezeket a beállításokat megtekintheti, de nem módosíthatja.")}</Notice>
              )}
              <SectionCard
                title={t("Sender", "Odosielateľ", "Feladó")}
                description={t(
                  "Defaults for every campaign; a campaign can override the name and the reply address.",
                  "Predvolené hodnoty pre každú kampaň; kampaň môže meno a adresu odpovede prepísať.",
                  "Alapértelmezések minden kampányhoz; a kampány felülírhatja a nevet és a válaszcímet.",
                )}
                action={<SaveStatus lang={language} status={status} />}
              >
                <div className="grid gap-4 ws-md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className={LABEL}>{t("From name", "Meno odosielateľa", "Feladó neve")}</span>
                    <input
                      disabled={!canEdit}
                      value={draft.sender.fromName}
                      onChange={(e) => setDraft((c) => ({ ...c, sender: { ...c.sender, fromName: e.target.value } }))}
                      placeholder={t("Company name", "Názov firmy", "Cégnév")}
                      className={FIELD}
                    />
                    <span className={HINT}>{t("Empty = the company name.", "Prázdne = názov firmy.", "Üres = a cég neve.")}</span>
                  </label>
                  <label className="grid gap-1">
                    <span className={LABEL}>{t("Reply-To", "Odpovedať na", "Válaszcím")}</span>
                    <input
                      type="email"
                      disabled={!canEdit}
                      value={draft.sender.replyTo}
                      onChange={(e) => setDraft((c) => ({ ...c, sender: { ...c.sender, replyTo: e.target.value } }))}
                      className={FIELD}
                    />
                    <span className={HINT}>{t("Empty = replies go to the From address.", "Prázdne = odpovede idú na adresu odosielateľa.", "Üres = a válaszok a feladó címére mennek.")}</span>
                  </label>
                </div>
                <div className="grid gap-1.5">
                  <span className={LABEL}>{t("From address", "Adresa odosielateľa", "Feladó címe")}</span>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-ui">
                    <span className="font-medium text-slate-900">{info.senderEmail || "-"}</span>
                    {info.senderConfigured ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <CircleCheck className="size-4" />
                        {t("Outgoing e-mail is set up", "Odchádzajúca pošta je nastavená", "A kimenő levelezés be van állítva")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-amber-700">
                        <CircleAlert className="size-4" />
                        {t("Not set up", "Nie je nastavená", "Nincs beállítva")}
                      </span>
                    )}
                    <a href="#settings/email/outgoing" className="ml-auto type-label font-semibold text-indigo-600 hover:text-indigo-500">
                      {t("Outgoing server settings", "Nastavenia odchádzajúceho servera", "Kimenő szerver beállításai")}
                    </a>
                  </div>
                  <p className={HINT}>{t("The address comes from the system mail profile and cannot be changed here.", "Adresa pochádza zo systémového poštového profilu a tu sa nedá zmeniť.", "A cím a rendszer levelezési profiljából származik, itt nem módosítható.")}</p>
                </div>
              </SectionCard>

              <SectionCard
                title={t("Sending limits", "Limity odosielania", "Küldési korlátok")}
                description={t(
                  "How fast the queue is worked through.",
                  "Ako rýchlo sa fronta spracúva.",
                  "Milyen gyorsan haladjon a sor feldolgozása.",
                )}
              >
                <div className="grid gap-4 ws-md:grid-cols-2">
                  <div className="grid gap-1">
                    <label htmlFor="nl-batch" className={LABEL}>{t("Batch size", "Veľkosť dávky", "Köteg mérete")}</label>
                    <NumberField
                      id="nl-batch"
                      min={10}
                      max={200}
                      disabled={!canEdit}
                      value={draft.sending.batchSize}
                      onCommit={(n) => setDraft((c) => ({ ...c, sending: { ...c.sending, batchSize: n } }))}
                    />
                    <span className={HINT}>{t("E-mails sent per run (10 to 200).", "E-maily odoslané v jednom behu (10 až 200).", "Egy futásban küldött e-mailek (10-200).")}</span>
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor="nl-hourly" className={LABEL}>{t("Hourly limit", "Hodinový limit", "Óránkénti korlát")}</label>
                    <NumberField
                      id="nl-hourly"
                      min={10}
                      max={10000}
                      disabled={!canEdit}
                      value={draft.sending.perHourLimit}
                      onCommit={(n) => setDraft((c) => ({ ...c, sending: { ...c.sending, perHourLimit: n } }))}
                    />
                    <span className={HINT}>{t("Ask your e-mail provider for its hourly limit and stay below it.", "Opýtajte sa svojho poskytovateľa pošty na hodinový limit a zostaňte pod ním.", "Kérdezze meg a levelezési szolgáltatóját az óránkénti korlátról, és maradjon alatta.")}</span>
                  </div>
                </div>
                <Notice tone="info">
                  {t(
                    "Sending continues in the background through the server cron every minute. Without a cron it continues only while the campaign page is open.",
                    "Odosielanie pokračuje na pozadí cez cron servera každú minútu. Bez cronu pokračuje iba, kým je otvorená stránka kampane.",
                    "A küldés a háttérben, a szerver cronján keresztül percenként folytatódik. Cron nélkül csak addig, amíg a kampány oldala nyitva van.",
                  )}
                </Notice>
              </SectionCard>

              <SectionCard
                title={t("Test addresses", "Testovacie adresy", "Tesztcímek")}
                description={t("Prefilled when you send a test e-mail. Up to 5.", "Predvyplnené pri odoslaní testovacieho e-mailu. Najviac 5.", "A tesztlevél küldésekor előre kitöltve. Legfeljebb 5.")}
              >
                <SettingsGroup>
                  <textarea
                    rows={3}
                    disabled={!canEdit}
                    value={tests}
                    onChange={(e) => {
                      setTestRaw(e.target.value);
                      setDraft((c) => ({ ...c, sending: { ...c.sending, testRecipients: parseExtraAddresses(e.target.value).valid.slice(0, 5) } }));
                    }}
                    onBlur={() => setTestRaw(null)}
                    className={`${FIELD} h-auto py-2`}
                  />
                  <span className={HINT} aria-live="polite">
                    {t(`${Math.min(parsed.valid.length, 5)} of 5 valid`, `${Math.min(parsed.valid.length, 5)} z 5 platných`, `${Math.min(parsed.valid.length, 5)} / 5 érvényes`)}
                    {parsed.invalid.length > 0 && `, ${t(`${parsed.invalid.length} invalid`, `${parsed.invalid.length} neplatných`, `${parsed.invalid.length} érvénytelen`)}`}
                    {parsed.valid.length > 5 && `, ${t("only the first 5 are kept", "ponechá sa iba prvých 5", "csak az első 5 marad meg")}`}
                  </span>
                </SettingsGroup>
              </SectionCard>
            </>
          );
        }}
      </Gate>
    </div>
  );
};

const THEME_COLORS: { key: keyof NewsletterThemeJson; label: [string, string, string] }[] = [
  { key: "pageBackground", label: ["Page background", "Pozadie stránky", "Oldal háttere"] },
  { key: "contentBackground", label: ["Content background", "Pozadie obsahu", "Tartalom háttere"] },
  { key: "textColor", label: ["Text", "Text", "Szöveg"] },
  { key: "linkColor", label: ["Links", "Odkazy", "Hivatkozások"] },
  { key: "buttonBackground", label: ["Button", "Tlačidlo", "Gomb"] },
  { key: "buttonTextColor", label: ["Button text", "Text tlačidla", "Gomb szövege"] },
];

/** Settings > Newsletter > Design: header and footer cards (their editors open on `rest`), then the theme. */
export const NewsletterDesignSettings = ({
  language,
  canEdit,
  companyBilling,
  rest = [],
}: {
  language: Language;
  canEdit: boolean;
  companyBilling?: CompanyBillingSettings | null;
  /** The route segments after `settings/newsletter/design`: `header` or `footer` opens that editor. */
  rest?: string[];
}) => {
  const t = useMemo(() => makeT(language), [language]);
  const state = useNewsletterConfig(t, canEdit);
  const company = useMemo(() => companyInfoFrom(companyBilling), [companyBilling]);
  const slot = rest[0] === "header" || rest[0] === "footer" ? rest[0] : null;

  return (
    <div className="grid gap-6">
      <Gate state={state} t={t}>
        {({ draft, setDraft, status }) => {
          if (slot) {
            return (
              <Suspense fallback={<Loading t={t} />}>
                <HeaderFooterEditor
                  slot={slot}
                  config={draft}
                  company={company}
                  language={language}
                  canEdit={canEdit}
                  status={status}
                  onChange={(doc) => setDraft((c) => ({ ...c, [slot]: doc }))}
                />
              </Suspense>
            );
          }
          const th = draft.theme;
          const setTheme = (patch: Partial<NewsletterThemeJson>) => setDraft((c) => ({ ...c, theme: { ...c.theme, ...patch } }));
          return (
            <>
              {!canEdit && (
                <Notice tone="info">{t("You can view these settings but not change them.", "Tieto nastavenia môžete zobraziť, ale nie meniť.", "Ezeket a beállításokat megtekintheti, de nem módosíthatja.")}</Notice>
              )}
              <Suspense fallback={<Loading t={t} />}>
                <HeaderFooterCards config={draft} company={company} language={language} canEdit={canEdit} />
              </Suspense>

              <SectionCard
                title={t("Theme", "Vzhľad", "Megjelenés")}
                description={t("Width, font and colours of every e-mail.", "Šírka, písmo a farby každého e-mailu.", "Minden e-mail szélessége, betűtípusa és színei.")}
                action={<SaveStatus lang={language} status={status} />}
              >
                <div className="grid gap-6 ws-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="grid content-start gap-4">
                    <div className="grid gap-1">
                      <label htmlFor="nl-width" className={LABEL}>{t("Content width (px)", "Šírka obsahu (px)", "Tartalom szélessége (px)")}</label>
                      <NumberField id="nl-width" min={520} max={800} disabled={!canEdit} value={th.contentWidth} onCommit={(n) => setTheme({ contentWidth: n })} />
                      <span className={HINT}>{t("520 to 800.", "520 až 800.", "520-800.")}</span>
                    </div>
                    <div className="grid gap-1">
                      <span className={LABEL}>{t("Font", "Písmo", "Betűtípus")}</span>
                      <CustomSelect
                        value={th.fontFamily}
                        onChange={(v) => setTheme({ fontFamily: v })}
                        disabled={!canEdit}
                        options={
                          NEWSLETTER_FONT_STACKS.some((f) => f.value === th.fontFamily)
                            ? NEWSLETTER_FONT_STACKS
                            : [...NEWSLETTER_FONT_STACKS, { value: th.fontFamily, label: th.fontFamily }]
                        }
                      />
                    </div>
                    <div className="grid gap-3 ws-sm:grid-cols-2">
                      {THEME_COLORS.map(({ key, label }) => (
                        <div key={key} className="grid gap-1">
                          <span className={LABEL}>{t(...label)}</span>
                          <ColorPicker
                            variant="field"
                            value={th[key] as string}
                            disabled={!canEdit}
                            onChange={(hex) => setTheme({ [key]: hex } as Partial<NewsletterThemeJson>)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid content-start gap-2" aria-label={t("Preview", "Náhľad", "Előnézet")}>
                    <span className={LABEL}>{t("Preview", "Náhľad", "Előnézet")}</span>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 p-4" style={{ backgroundColor: th.pageBackground }}>
                      <div
                        className="mx-auto rounded-md p-5"
                        style={{
                          backgroundColor: th.contentBackground,
                          color: th.textColor,
                          fontFamily: th.fontFamily,
                          maxWidth: `${Math.round((th.contentWidth / 800) * 100)}%`,
                          minWidth: "70%",
                        }}
                      >
                        <p className="type-card-title" style={{ fontWeight: 700, margin: 0 }}>{t("A heading for your news", "Nadpis vašej novinky", "Cím a híreihez")}</p>
                        <p className="type-body" style={{ margin: "10px 0" }}>
                          {t("Body text reads like this, with a ", "Text vyzerá takto, s ", "A szöveg így néz ki, ")}
                          <span style={{ color: th.linkColor, textDecoration: "underline" }}>{t("link", "odkazom", "hivatkozással")}</span>
                          {t(" inside.", " vo vnútri.", " benne.")}
                        </p>
                        <span
                          className="type-label"
                          style={{
                            display: "inline-block",
                            backgroundColor: th.buttonBackground,
                            color: th.buttonTextColor,
                            padding: "9px 18px",
                            borderRadius: 6,
                            fontWeight: 600,
                          }}
                        >
                          {t("Button", "Tlačidlo", "Gomb")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>
            </>
          );
        }}
      </Gate>
    </div>
  );
};
