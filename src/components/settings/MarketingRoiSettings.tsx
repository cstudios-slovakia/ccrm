import React, { useEffect, useMemo, useState } from "react";
import type { FinancialCategory } from "../../types";
import type { Language } from "../../utils/translations";
import { categoryChildren } from "../../utils/financialCategoryTree";
import {
  DEFAULT_NEWSLETTER_WINDOW_DAYS,
  normalizeMarketingRoiConfig,
  type MarketingRoiConfig,
  type RoiChannel,
} from "../../utils/marketingRoi";
import { marketingRoiApi } from "../dashboard/marketingRoiApi";
import { SaveStatus, SectionCard, SettingsGroup } from "./SectionCard";
import { useAutosave } from "./useAutosave";

/**
 * Settings → Integrations → Marketing ROI: where the Performance Dashboard's ROI takes its numbers
 * from. Costs are finance expense categories (so nothing is typed twice), revenue per channel is
 * decided by the lead source and, for the newsletter, by the attribution window.
 */
export const MarketingRoiSettings: React.FC<{
  userLanguage: Language;
  financialCategories: FinancialCategory[];
  leadSources: string[];
  canEdit: boolean;
}> = ({ userLanguage, financialCategories, leadSources, canEdit }) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const [stored, setStored] = useState<MarketingRoiConfig | null>(null);
  const [draft, setDraft] = useState<MarketingRoiConfig | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    marketingRoiApi
      .get()
      .then((r) => {
        if (cancelled) return;
        setStored(r.config);
        setDraft(r.config);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const status = useAutosave({
    value: draft,
    dirty: !!draft && JSON.stringify(draft) !== JSON.stringify(stored),
    enabled: canEdit && !!draft,
    // `stored` stays what was sent: the server normalises with the same rules, and taking its
    // answer back could leave the draft "dirty" forever on a tiny difference and re-save in a loop.
    save: (cfg) => {
      if (!cfg) return;
      setStored(cfg);
      marketingRoiApi.save(cfg).catch(() => setError(true));
    },
  });
  // The days field is typed as text and applied on blur, so clearing it to type "7" does not
  // snap back to 30 on the first keystroke.
  const [daysText, setDaysText] = useState<string | null>(null);

  // Expense categories in tree order, each with its depth for the indent.
  const expenseTree = useMemo(() => {
    const out: { cat: FinancialCategory; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (parentId: string | null, depth: number) => {
      categoryChildren(financialCategories, "expense", parentId).forEach((cat) => {
        if (seen.has(cat.id)) return;
        seen.add(cat.id);
        out.push({ cat, depth });
        walk(cat.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  }, [financialCategories]);

  const update = (patch: Partial<MarketingRoiConfig>) =>
    setDraft((d) => (d ? normalizeMarketingRoiConfig({ ...d, ...patch }) : d));

  const toggleCategory = (field: "newsletterCostCategoryIds" | "socialCostCategoryIds", id: string) => {
    if (!draft) return;
    const list = draft[field];
    update({ [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };

  if (error && !draft) {
    return (
      <SectionCard title={t("Marketing ROI", "Marketingové ROI", "Marketing ROI")} tone="warning">
        <p className="type-body text-amber-800">
          {t("The marketing settings could not be loaded.", "Nastavenia marketingu sa nepodarilo načítať.", "A marketingbeállításokat nem sikerült betölteni.")}
        </p>
      </SectionCard>
    );
  }
  if (!draft) return <div className="h-40 rounded-lg bg-gray-50 animate-pulse" />;

  const categoryPicker = (field: "newsletterCostCategoryIds" | "socialCostCategoryIds") =>
    expenseTree.length === 0 ? (
      <p className="type-body text-gray-500">
        {t("There are no expense categories yet.", "Zatiaľ nie sú žiadne kategórie výdavkov.", "Még nincsenek költségkategóriák.")}{" "}
        <a href="#settings/finance/categories" className="font-bold text-entity-text hover:underline">
          {t("Create one", "Vytvoriť", "Létrehozás")}
        </a>
      </p>
    ) : (
      <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
        {expenseTree.map(({ cat, depth }) => (
          <label
            key={cat.id}
            className={`flex items-center gap-2.5 py-2 pr-3 text-ui text-gray-700 ${canEdit ? "cursor-pointer hover:bg-gray-50" : "opacity-70"}`}
            style={{ paddingLeft: 12 + depth * 20 }}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-entity-solid"
              checked={draft[field].includes(cat.id)}
              disabled={!canEdit}
              onChange={() => toggleCategory(field, cat.id)}
            />
            {cat.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
            <span className={depth === 0 ? "font-bold" : ""}>{cat.name}</span>
          </label>
        ))}
      </div>
    );

  const channelOptions: { value: RoiChannel | ""; label: string }[] = [
    { value: "", label: t("Not marketing", "Nie je marketing", "Nem marketing") },
    { value: "social", label: t("Social media", "Sociálne siete", "Közösségi média") },
    { value: "meta_ads", label: t("Paid ads: Meta", "Platená reklama: Meta", "Fizetett hirdetés: Meta") },
    { value: "google_ads", label: t("Paid ads: Google", "Platená reklama: Google", "Fizetett hirdetés: Google") },
  ];

  return (
    <div className="space-y-6">
      <SectionCard
        title={t("Marketing costs", "Náklady na marketing", "Marketingköltségek")}
        description={t(
          "Pick the finance expense categories that hold each channel's costs. Costs are entered in Finance like any other expense; tip: create categories such as “Marketing – Newsletter” and “Marketing – Social media”.",
          "Vyberte kategórie výdavkov vo Financiách, v ktorých sú náklady jednotlivých kanálov. Náklady sa zapisujú vo Financiách ako každý iný výdavok; tip: vytvorte kategórie ako „Marketing – Newsletter“ a „Marketing – Sociálne siete“.",
          "Válassza ki azokat a pénzügyi költségkategóriákat, amelyekben az egyes csatornák költségei vannak. A költségeket a Pénzügyekben kell rögzíteni, mint bármely más kiadást; tipp: hozzon létre például „Marketing – Hírlevél” és „Marketing – Közösségi média” kategóriát.",
        )}
        action={<SaveStatus lang={userLanguage} status={status} />}
        testId="marketing-roi-costs"
      >
        <div className="grid grid-cols-1 ws-lg:grid-cols-2 gap-6">
          <SettingsGroup title={t("Newsletter costs", "Náklady na newsletter", "Hírlevél költségei")}>
            {categoryPicker("newsletterCostCategoryIds")}
          </SettingsGroup>
          <SettingsGroup title={t("Social media costs", "Náklady na sociálne siete", "Közösségi média költségei")}>
            {categoryPicker("socialCostCategoryIds")}
          </SettingsGroup>
        </div>
      </SectionCard>

      <SectionCard
        title={t("Lead sources by channel", "Zdroje leadov podľa kanálov", "Lead-források csatornánként")}
        description={t(
          "Won leads from these sources are credited to the channel. Paid ads use the spend of the Meta and Google campaigns in Integrations → Ads.",
          "Vyhraté leady z týchto zdrojov sa pripíšu kanálu. Platená reklama používa výdavky kampaní Meta a Google v Integrácie → Reklama.",
          "Az ezekből a forrásokból megnyert leadek a csatornához számítanak. A fizetett hirdetések a Meta és Google kampányok költését használják (Integrációk → Hirdetések).",
        )}
        testId="marketing-roi-sources"
      >
        {leadSources.length === 0 ? (
          <p className="type-body text-gray-500">{t("No lead sources are set up.", "Nie sú nastavené žiadne zdroje leadov.", "Nincsenek beállított lead-források.")}</p>
        ) : (
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            {leadSources.map((source) => {
              const key = source.trim().toLowerCase();
              return (
                <div key={source} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-ui font-bold text-gray-700 truncate">{source}</span>
                  <select
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-ui text-gray-800 disabled:opacity-60"
                    value={draft.sourceChannels[key] || ""}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const next = { ...draft.sourceChannels };
                      if (e.target.value) next[key] = e.target.value as RoiChannel;
                      else delete next[key];
                      update({ sourceChannels: next });
                    }}
                  >
                    {channelOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t("Newsletter attribution", "Pripisovanie newslettera", "Hírlevél-hozzárendelés")}
        description={t(
          "An invoice issued to a recipient within this many days after a campaign counts as newsletter revenue. When several campaigns reached the client, the latest one before the invoice gets it.",
          "Faktúra vystavená príjemcovi do toľkých dní po kampani sa počíta ako tržba z newslettera. Ak klienta zasiahlo viac kampaní, pripíše sa poslednej pred faktúrou.",
          "Az a számla, amelyet a címzettnek ennyi napon belül állítottak ki egy kampány után, hírlevél-bevételnek számít. Ha több kampány is elérte az ügyfelet, a számla előtti utolsót illeti.",
        )}
        testId="marketing-roi-window"
      >
        <label className="flex items-center gap-3 text-ui text-gray-700">
          <input
            type="number"
            min={1}
            max={365}
            className="w-24 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-ui text-gray-800 disabled:opacity-60"
            value={daysText ?? String(draft.newsletterWindowDays)}
            disabled={!canEdit}
            onChange={(e) => setDaysText(e.target.value)}
            onBlur={() => {
              if (daysText === null) return;
              update({ newsletterWindowDays: Number(daysText) || DEFAULT_NEWSLETTER_WINDOW_DAYS });
              setDaysText(null);
            }}
          />
          {t("days after the send", "dní po odoslaní", "nappal a kiküldés után")}
        </label>
      </SectionCard>
    </div>
  );
};
