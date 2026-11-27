import React from "react";
import { SectionCard } from "./settings/SectionCard";
import { ArrowRight, Link2, FileSpreadsheet } from "lucide-react";
import type { FinancialCategory, FinancialRecord, FinancialOperatingMode } from "../types";
import { FinancialCategoriesManager } from "./FinancialCategoriesManager";
import { CURRENCY_OPTIONS, currencyForRegion } from "../utils/currency";
import { getTranslation, type Language } from "../utils/translations";
import { useUserPref } from "../utils/userPrefs";
import { entityAccentStyle } from "../utils/entityAccent";

interface FinanceSettingsProps {
  userLanguage: Language;
  systemLanguage: Language;
  /** Raw currency code, or "" for "follow the region". Edited in Company › Language & currency only. */
  systemCurrency: string;
  financialCategories: FinancialCategory[];
  setFinancialCategories: React.Dispatch<React.SetStateAction<FinancialCategory[]>>;
  setFinancialRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  /** Finance module rights — what the category tree is allowed to do. */
  canEdit: boolean;
  canDelete: boolean;
  /** Financial operating mode: connected (live movements) vs simplified (detached spreadsheet) */
  financialMode?: FinancialOperatingMode;
  setFinancialMode?: (mode: FinancialOperatingMode) => void;
  /**
   * Which panels to draw. Settings shows the ledger side (operating mode, movements
   * table, currency) and the category tree as two sections; the default is both.
   */
  part?: "ledger" | "categories";
}


/**
 * Settings → Finance: how the Finance screen behaves and what it is made of.
 * The screen itself keeps no configuration of its own beyond the view toggles on
 * its charts.
 */
export const FinanceSettings: React.FC<FinanceSettingsProps> = ({
  userLanguage,
  systemLanguage,
  systemCurrency,
  financialCategories,
  setFinancialCategories,
  setFinancialRecords,
  canEdit,
  canDelete,
  financialMode = "connected",
  setFinancialMode,
  part
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const [inlineEdit, setInlineEdit] = useUserPref("financialInlineEdit");

  return (
    <div style={entityAccentStyle("financial") as React.CSSProperties} className="space-y-6">
      {part !== "categories" && (<>
      {/* Financial Operating Mode */}
      <SectionCard
        title={t("Financial Operating Mode", "Režim fungovania financií", "Pénzügyi működési mód")}
        description={t(
            "Choose how the overview table and cash flow graphs operate. You can switch between live ledger synchronization and detached spreadsheet mode at any time without losing data.",
            "Zvoľte, ako funguje prehľadová tabuľka a grafy cash flow. Medzi prepojeným režimom a odpojenou tabuľkou môžete kedykoľvek prepínať bez straty údajov.",
            "Válassza ki, hogyan működjön az áttekintő táblázat és a cash flow grafikon. Bármikor válthat a valós mozgások és a leválasztott táblázat között adatvesztés nélkül."
          )}
      >
        <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3 pt-1">
          {/* Connected Mode Card */}
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setFinancialMode?.("connected")}
            className={`text-left p-4 rounded-lg border transition-colors flex flex-col justify-between gap-3 ${
              financialMode === "connected"
                ? "bg-entity-subtle border-entity-border ring-2 ring-entity-ring"
                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            } ${canEdit ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ui font-semibold text-gray-900">
                  <Link2 className={`h-4 w-4 ${financialMode === "connected" ? "text-entity-text" : "text-gray-400"}`} />
                  {t("Connected mode (Default)", "Prepojený režim (Predvolený)", "Kapcsolt mód (Alapértelmezett)")}
                </span>
                {financialMode === "connected" && (
                  <span className="px-2 py-0.5 rounded-md text-micro font-semibold bg-entity-subtle text-entity-text border border-entity-border">
                    {t("Active", "Aktívny", "Aktív")}
                  </span>
                )}
              </div>
              <p className="text-caption text-gray-600 leading-snug">
                {t(
                  "The overview table and cash flow graphs are dynamically calculated from real movements, invoices, and recurring expense rules.",
                  "Prehľadová tabuľka a grafy cash flow sa dynamicky počítajú zo skutočných platieb, faktúr a pravidiel opakovaných výdavkov.",
                  "Az áttekintő táblázat és a grafikonok dinamikusan a valós mozgásokból, számlákból és ismétlődő tételekből számolódnak."
                )}
              </p>
            </div>
            <span className="text-micro text-gray-500">
              {t("Automatic ledger calculation", "Automatický výpočet z pohybov", "Automatikus számítás a mozgásokból")}
            </span>
          </button>

          {/* Simplified Mode Card */}
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setFinancialMode?.("simplified")}
            className={`text-left p-4 rounded-lg border transition-colors flex flex-col justify-between gap-3 ${
              financialMode === "simplified"
                ? "bg-entity-subtle border-entity-border ring-2 ring-entity-ring"
                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            } ${canEdit ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ui font-semibold text-gray-900">
                  <FileSpreadsheet className={`h-4 w-4 ${financialMode === "simplified" ? "text-entity-text" : "text-gray-400"}`} />
                  {t("Simplified mode", "Zjednodušený režim", "Egyszerűsített mód")}
                </span>
                {financialMode === "simplified" && (
                  <span className="px-2 py-0.5 rounded-md text-micro font-semibold bg-entity-subtle text-entity-text border border-entity-border">
                    {t("Active", "Aktívny", "Aktív")}
                  </span>
                )}
              </div>
              <p className="text-caption text-gray-600 leading-snug">
                {t(
                  "The overview table behaves like a standalone Excel spreadsheet. Click any cell to directly type numbers or arithmetic equations (e.g. 1200 + 450). Graphs reflect these table totals.",
                  "Prehľadová tabuľka funguje ako samostatný Excel. Kliknutím na bunku priamo vpíšete hodnotu alebo matematický vzorec (napr. 1200 + 450). Grafy automaticky čerpajú z týchto hodnôt.",
                  "Az áttekintő táblázat önálló Excel-táblázatként működik. Bármelyik cellára kattintva közvetlenül beírhat számokat vagy képleteket (pl. 1200 + 450). A grafikonok ebből épülnek fel."
                )}
              </p>
            </div>
            <span className="text-micro text-gray-500">
              {t("Direct manual cells & equations", "Priame zadávanie hodnôt a vzorcov", "Közvetlen értékek és képletek")}
            </span>
          </button>
        </div>
      </SectionCard>

      {/* Movements table */}
      <SectionCard
        title={t("Movements table", "Tabuľka pohybov", "Mozgások táblázata")}
      >
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-ui font-semibold text-gray-900">
              {t("Inline editing", "Úpravy priamo v riadku", "Szerkesztés közvetlenül a sorban")}
            </span>
            <span className="block text-caption text-gray-500 mt-0.5">
              {t(
                "Change a payment's status straight from its row in the Movements table. When off, the status is a plain badge and every change goes through the edit panel.",
                "Stav úhrady meníte priamo v riadku tabuľky Pohyby. Keď je vypnuté, stav je len štítok a každá zmena sa robí v paneli úprav.",
                "A fizetés állapotát közvetlenül a Mozgások táblázat soraiban módosíthatja. Kikapcsolva az állapot csak címke, és minden módosítás a szerkesztő panelen keresztül történik."
              )}
            </span>
            <span className="block text-micro text-gray-500 mt-1">
              {t("Applies to your account only.", "Platí iba pre váš účet.", "Csak az Ön fiókjára vonatkozik.")}
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={inlineEdit}
              onChange={(e) => setInlineEdit(e.target.checked)}
              className="sr-only peer"
            />
            <span className="w-9 h-5 bg-gray-300 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-entity-ring peer-checked:bg-entity-solid transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-transform after:duration-200 peer-checked:after:translate-x-4 peer-checked:after:border-white" />
          </span>
        </label>
      </SectionCard>

      {/* Currency: read-only here, edited in Company › Language & currency */}
      <SectionCard
        title={getTranslation(userLanguage, "settings.general.currency")}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            data-testid="finance-currency-readonly"
            className="inline-flex min-h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3.5 text-body font-semibold text-gray-900"
          >
            {systemCurrency
              ? CURRENCY_OPTIONS.find((c) => c.code === systemCurrency)?.label ?? systemCurrency
              : `${getTranslation(userLanguage, "settings.general.currency_auto")} (${currencyForRegion(systemLanguage)})`}
          </span>
          <a
            href="#settings/company/regional"
            data-testid="finance-currency-link"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3.5 text-ui font-semibold text-entity-text no-underline transition-colors hover:bg-entity-subtle shadow-2xs"
          >
            {getTranslation(userLanguage, "settings.nav.ui.currency_readonly_btn")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
        <p className="text-micro text-gray-500">
          {getTranslation(userLanguage, "settings.nav.ui.currency_readonly_body")}
        </p>
      </SectionCard>
      </>)}

      {/* Movement categories */}
      {part !== "ledger" && (
        <FinancialCategoriesManager
          financialCategories={financialCategories}
          setFinancialCategories={setFinancialCategories}
          setFinancialRecords={setFinancialRecords}
          userLanguage={userLanguage}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </div>
  );
};
