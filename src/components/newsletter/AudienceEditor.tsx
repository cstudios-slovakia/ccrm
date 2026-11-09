import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ClientSelect } from "../ui/ClientSelect";
import { clientCategoryColor, flattenClientCategories } from "../../utils/clientCategoryTree";
import { isClientRecord } from "../../utils/clientRecord";
import { newsletterApi } from "./newsletterApi";
import { isAudienceValid, parseExtraAddresses } from "./audience";
import type { Audience, AudiencePreview } from "./types";
import { FIELD, HINT, LABEL, Notice, useDebounced, type NewsletterData, type NewsletterEnv } from "./shared";

const ToggleRow = ({
  checked,
  onChange,
  disabled,
  title,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  title: string;
  children?: ReactNode;
}) => (
  <div className="rounded-2xl border border-slate-200 p-4">
    <label className="flex cursor-pointer items-center gap-3 text-ui font-semibold text-slate-800">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-indigo-600"
      />
      {title}
    </label>
    {checked && children && <div className="mt-3 grid gap-3">{children}</div>}
  </div>
);

const Chip = ({ active, disabled, onClick, children }: { active: boolean; disabled: boolean; onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-full border px-3 py-1 type-label transition-colors cursor-pointer disabled:cursor-not-allowed ${
      active ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
    }`}
  >
    {children}
  </button>
);

const toggleIn = (list: string[], v: string): string[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * C12 card 1: who receives the campaign. Clients are required (all, or a pick of categories and
 * clients); leads, employees and pasted addresses are optional additions. The count under the
 * editor is the server's answer (`audience_preview`, debounced 600 ms), never a client-side guess.
 */
export const AudienceEditor = ({
  audience,
  onChange,
  disabled,
  env,
  data,
  onPreview,
}: {
  audience: Audience;
  onChange: (next: Audience) => void;
  disabled: boolean;
  env: NewsletterEnv;
  data: NewsletterData;
  onPreview?: (preview: AudiencePreview | null) => void;
}) => {
  const { t } = env;
  const set = (patch: Partial<Audience>) => onChange({ ...audience, ...patch });
  const setClients = (patch: Partial<Audience["clients"]>) => set({ clients: { ...audience.clients, ...patch } });

  const flat = useMemo(() => flattenClientCategories(data.clientCategories), [data.clientCategories]);
  const clientRecords = useMemo(() => data.leads.filter(isClientRecord), [data.leads]);
  const clientsById = useMemo(() => new Map(clientRecords.map((c) => [c.id, c])), [clientRecords]);

  // Live count.
  const debounced = useDebounced(audience, 600);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const valid = isAudienceValid(debounced);

  useEffect(() => {
    if (!valid) {
      setPreview(null);
      setPreviewError(false);
      onPreviewRef.current?.(null);
      return undefined;
    }
    const ctrl = new AbortController();
    setLoading(true);
    newsletterApi
      .audiencePreview(debounced, ctrl.signal)
      .then((p) => {
        setPreview(p);
        setPreviewError(false);
        onPreviewRef.current?.(p);
      })
      .catch((e) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setPreview(null);
        setPreviewError(true);
        onPreviewRef.current?.(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [debounced, valid]);

  const extra = useMemo(() => (audience.extra.enabled ? parseExtraAddresses(audience.extra.raw) : null), [audience.extra]);

  return (
    <div className="grid gap-4">
      {/* Clients: required */}
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-ui font-semibold text-slate-800">{t("Clients", "Klienti", "Ügyfelek")}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 type-overline text-slate-600">{t("Required", "Povinné", "Kötelező")}</span>
        </div>
        <div className="mt-3 inline-flex rounded-xl bg-slate-100 p-1" role="group">
          {(["all", "pick"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              aria-pressed={audience.clients.mode === mode}
              onClick={() => setClients({ mode })}
              className={`rounded-lg px-3 py-1.5 text-ui font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                audience.clients.mode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {mode === "all" ? t("All clients", "Všetci klienti", "Minden ügyfél") : t("Choose", "Vybrať", "Kiválasztás")}
            </button>
          ))}
        </div>

        {audience.clients.mode === "pick" && (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <span className={LABEL}>{t("Client categories", "Kategórie klientov", "Ügyfélkategóriák")}</span>
              {flat.length === 0 ? (
                <p className={HINT}>{t("No client categories yet.", "Zatiaľ nie sú žiadne kategórie klientov.", "Még nincsenek ügyfélkategóriák.")}</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-xl bg-slate-50 p-2">
                  {flat.map(({ category, depth }) => (
                    <label
                      key={category.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-ui text-slate-800 hover:bg-white"
                      style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={audience.clients.categoryIds.includes(category.id)}
                        onChange={() => setClients({ categoryIds: toggleIn(audience.clients.categoryIds, category.id) })}
                        className="size-4 accent-indigo-600"
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: clientCategoryColor(data.clientCategories, category.id) || "#94a3b8" }}
                      />
                      <span className="truncate">{category.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className={HINT}>
                {t(
                  "A category includes the categories under it.",
                  "Kategória zahŕňa aj kategórie pod ňou.",
                  "Egy kategória a benne lévő alkategóriákat is magában foglalja.",
                )}
              </p>
            </div>

            <div className="grid gap-1.5">
              <span className={LABEL}>{t("Individual clients", "Jednotliví klienti", "Egyes ügyfelek")}</span>
              {!disabled && (
                <ClientSelect
                  leads={clientRecords}
                  value=""
                  onChange={(id) => id && setClients({ clientIds: [...audience.clients.clientIds, id] })}
                  excludeIds={audience.clients.clientIds}
                  placeholder={t("Add a client…", "Pridať klienta…", "Ügyfél hozzáadása…")}
                  allowAdd={false}
                />
              )}
              {audience.clients.clientIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {audience.clients.clientIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 type-label text-slate-700">
                      {clientsById.get(id)?.name ?? t("Unknown client", "Neznámy klient", "Ismeretlen ügyfél")}
                      {!disabled && (
                        <button
                          type="button"
                          aria-label={t("Remove", "Odstrániť", "Eltávolítás")}
                          onClick={() => setClients({ clientIds: audience.clients.clientIds.filter((x) => x !== id) })}
                          className="inline-flex size-5 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 cursor-pointer"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {!valid && (
              <Notice tone="warning">
                {t(
                  "Choose at least one category or client, or switch to All clients.",
                  "Vyberte aspoň jednu kategóriu alebo klienta, alebo prepnite na Všetci klienti.",
                  "Válasszon legalább egy kategóriát vagy ügyfelet, vagy váltson a Minden ügyfél lehetőségre.",
                )}
              </Notice>
            )}
          </div>
        )}
      </div>

      {/* Leads */}
      <ToggleRow
        checked={audience.leads.enabled}
        disabled={disabled}
        onChange={(enabled) => set({ leads: { ...audience.leads, enabled } })}
        title={t("Also send to leads", "Poslať aj leadom", "Küldés érdeklődőknek is")}
      >
        <div className="grid gap-1.5">
          <span className={LABEL}>{t("Pipeline status (none = all)", "Fáza predaja (žiadna = všetky)", "Értékesítési fázis (egyik sem = mind)")}</span>
          <div className="flex flex-wrap gap-2">
            {data.leadStates.map((s) => (
              <Chip
                key={s}
                disabled={disabled}
                active={audience.leads.statuses.includes(s)}
                onClick={() => set({ leads: { ...audience.leads, statuses: toggleIn(audience.leads.statuses, s) } })}
              >
                {s}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className={LABEL}>{t("Interest category (none = all)", "Kategória záujmu (žiadna = všetky)", "Érdeklődési kategória (egyik sem = mind)")}</span>
          <div className="flex flex-wrap gap-2">
            {data.leadCategories.map((c) => (
              <Chip
                key={c}
                disabled={disabled}
                active={audience.leads.interestCategories.includes(c)}
                onClick={() =>
                  set({ leads: { ...audience.leads, interestCategories: toggleIn(audience.leads.interestCategories, c) } })
                }
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>
      </ToggleRow>

      {/* Employees */}
      <ToggleRow
        checked={audience.employees.enabled}
        disabled={disabled}
        onChange={(enabled) => set({ employees: { enabled } })}
        title={t("Also send to employees", "Poslať aj zamestnancom", "Küldés a munkatársaknak is")}
      />

      {/* Extra addresses */}
      <ToggleRow
        checked={audience.extra.enabled}
        disabled={disabled}
        onChange={(enabled) => set({ extra: { ...audience.extra, enabled } })}
        title={t("Extra addresses", "Ďalšie adresy", "További címek")}
      >
        <textarea
          rows={4}
          disabled={disabled}
          value={audience.extra.raw}
          onChange={(e) => set({ extra: { ...audience.extra, raw: e.target.value } })}
          placeholder={t(
            "One per line, or separated by commas: jane@example.com, Peter <peter@example.com>",
            "Jedna na riadok alebo oddelené čiarkou: jana@example.com, Peter <peter@example.com>",
            "Soronként egy, vagy vesszővel elválasztva: jane@example.com, Peter <peter@example.com>",
          )}
          className={`${FIELD} h-auto py-2`}
        />
        {extra && (
          <p className={HINT} aria-live="polite">
            {t(`${extra.valid.length} valid`, `${extra.valid.length} platných`, `${extra.valid.length} érvényes`)}
            {extra.invalid.length > 0 &&
              `, ${t(`${extra.invalid.length} invalid`, `${extra.invalid.length} neplatných`, `${extra.invalid.length} érvénytelen`)}: ${extra.invalid.slice(0, 3).join(", ")}${extra.invalid.length > 3 ? "…" : ""}`}
          </p>
        )}
      </ToggleRow>

      {(audience.leads.enabled || audience.extra.enabled) && (
        <Notice tone="info">
          {t(
            "Send only to people who agreed to receive marketing e-mails (GDPR).",
            "Posielajte iba ľuďom, ktorí súhlasili s prijímaním marketingových e-mailov (GDPR).",
            "Csak olyanoknak küldjön, akik hozzájárultak a marketing e-mailek fogadásához (GDPR).",
          )}
        </Notice>
      )}

      {/* Live count */}
      <div className="rounded-2xl bg-slate-50 p-4" aria-live="polite" data-testid="newsletter-audience-count">
        {!valid ? (
          <p className="text-ui text-slate-500">{t("No recipients yet.", "Zatiaľ žiadni príjemcovia.", "Még nincsenek címzettek.")}</p>
        ) : previewError ? (
          <p className="text-ui text-rose-700">
            {t("The recipient count could not be loaded.", "Počet príjemcov sa nepodarilo načítať.", "A címzettek száma nem tölthető be.")}
          </p>
        ) : !preview ? (
          <p className="text-ui text-slate-500">{t("Counting…", "Počítam…", "Számolás…")}</p>
        ) : (
          <div className={`grid gap-2 ${loading ? "opacity-60" : ""}`}>
            <p className="text-ui font-semibold text-slate-900">
              {t(`${preview.total} recipients`, `${preview.total} príjemcov`, `${preview.total} címzett`)}
              {preview.withoutEmail > 0 &&
                ` · ${t(`${preview.withoutEmail} without e-mail`, `${preview.withoutEmail} bez e-mailu`, `${preview.withoutEmail} e-mail nélkül`)}`}
              {preview.withoutFirstName > 0 &&
                ` · ${t(`${preview.withoutFirstName} without a first name`, `${preview.withoutFirstName} bez krstného mena`, `${preview.withoutFirstName} keresztnév nélkül`)}`}
              {preview.skipped.unsubscribed > 0 &&
                ` · ${t(`${preview.skipped.unsubscribed} unsubscribed`, `${preview.skipped.unsubscribed} odhlásených`, `${preview.skipped.unsubscribed} leiratkozott`)}`}
              {preview.skipped.invalid > 0 &&
                ` · ${t(`${preview.skipped.invalid} invalid`, `${preview.skipped.invalid} neplatných`, `${preview.skipped.invalid} érvénytelen`)}`}
            </p>
            {preview.sample.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowList((v) => !v)}
                  className="w-fit type-label text-indigo-600 hover:text-indigo-500 cursor-pointer"
                >
                  {showList ? t("Hide list", "Skryť zoznam", "Lista elrejtése") : t("Show list", "Zobraziť zoznam", "Lista megjelenítése")}
                </button>
                {showList && (
                  <ul className="grid gap-1 text-ui text-slate-700">
                    {preview.sample.map((s) => (
                      <li key={s.email} className="flex flex-wrap gap-x-2">
                        <span className="font-medium">{s.name || s.email}</span>
                        {s.name && <span className="text-slate-500">{s.email}</span>}
                      </li>
                    ))}
                    {preview.total > preview.sample.length && (
                      <li className="text-slate-500">
                        {t(
                          `…and ${preview.total - preview.sample.length} more`,
                          `…a ďalších ${preview.total - preview.sample.length}`,
                          `…és még ${preview.total - preview.sample.length}`,
                        )}
                      </li>
                    )}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
