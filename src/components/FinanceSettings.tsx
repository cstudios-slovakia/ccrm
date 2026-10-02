import React from "react";
import { Coins, Table2, Link2, FileSpreadsheet } from "lucide-react";
import type { FinancialCategory, FinancialRecord, FinancialOperatingMode } from "../types";
import { CustomSelect } from "./ui/CustomSelect";
import { FinancialCategoriesManager } from "./FinancialCategoriesManager";
import { CURRENCY_OPTIONS, currencyForRegion } from "../utils/currency";
import { getTranslation, type Language } from "../utils/translations";
import { useUserPref } from "../utils/userPrefs";

interface FinanceSettingsProps {
  userLanguage: Language;
  systemLanguage: Language;
  /** Raw currency code, or "" for "follow the region". The same value General config edits. */
  systemCurrency: string;
  setSystemCurrency: (currency: string) => void;
  /** The currency is workspace-wide, so it follows the general-config permission. */
  canEditCurrency: boolean;
  financialCategories: FinancialCategory[];
  setFinancialCategories: React.Dispatch<React.SetStateAction<FinancialCategory[]>>;
  setFinancialRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  /** Finance module rights — what the category tree is allowed to do. */
  canEdit: boolean;
  canDelete: boolean;
  /** Financial operating mode: connected (live movements) vs simplified (detached spreadsheet) */
  financialMode?: FinancialOperatingMode;
  setFinancialMode?: (mode: FinancialOperatingMode) => void;
}

const PANEL = "glass-panel p-6 rounded-3xl space-y-5 border border-white/60 bg-white/95 shadow-glass";
const PANEL_TITLE =
  "text-body font-heading font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3";

/**
 * Settings → Finance: how the Finance screen behaves and what it is made of.
 * The screen itself keeps no configuration of its own beyond the view toggles on
 * its charts.
 */
export const FinanceSettings: React.FC<FinanceSettingsProps> = ({
  userLanguage,
  systemLanguage,
  systemCurrency,
  setSystemCurrency,
  canEditCurrency,
  financialCategories,
  setFinancialCategories,
  setFinancialRecords,
  canEdit,
  canDelete,
  financialMode = "connected",
  setFinancialMode
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const [inlineEdit, setInlineEdit] = useUserPref("financialInlineEdit");

  return (
    <div className="space-y-6">
      {/* Financial Operating Mode */}
      <div className={PANEL}>
        <h3 className={PANEL_TITLE}>
          <FileSpreadsheet className="h-4.5 w-4.5 text-indigo-500" />
          {t("Financial Operating Mode", "Režim fungovania financií", "Pénzügyi működési mód")}
        </h3>

        <p className="text-micro font-medium text-slate-500 leading-relaxed -mt-2">
          {t(
            "Choose how the overview table and cash flow graphs operate. You can switch between live ledger synchronization and detached spreadsheet mode at any time without losing data.",
            "Zvoľte, ako funguje prehľadová tabuľka a grafy cash flow. Medzi prepojeným režimom a odpojenou tabuľkou môžete kedykoľvek prepínať bez straty údajov.",
            "Válassza ki, hogyan működjön az áttekintő táblázat és a cash flow grafikon. Bármikor válthat a valós mozgások és a leválasztott táblázat között adatvesztés nélkül."
          )}
        </p>

        <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3 pt-1">
          {/* Connected Mode Card */}
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setFinancialMode?.("connected")}
            className={`text-left p-4 rounded-2xl border transition-all duration-150 ease-out flex flex-col justify-between gap-3 ${
              financialMode === "connected"
                ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/15"
                : "bg-white border-slate-200 hover:border-slate-300 hover:-translate-y-px"
            } ${canEdit ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ui font-bold text-slate-900">
                  <Link2 className={`h-4 w-4 ${financialMode === "connected" ? "text-indigo-600" : "text-slate-400"}`} />
                  {t("Connected mode (Default)", "Prepojený režim (Predvolený)", "Kapcsolt mód (Alapértelmezett)")}
                </span>
                {financialMode === "connected" && (
                  <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-indigo-100 text-indigo-700">
                    {t("Active", "Aktívny", "Aktív")}
                  </span>
                )}
              </div>
              <p className="text-caption text-slate-600 leading-snug">
                {t(
                  "The overview table and cash flow graphs are dynamically calculated from real movements, invoices, and recurring expense rules.",
                  "Prehľadová tabuľka a grafy cash flow sa dynamicky počítajú zo skutočných platieb, faktúr a pravidiel opakovaných výdavkov.",
                  "Az áttekintő táblázat és a grafikonok dinamikusan a valós mozgásokból, számlákból és ismétlődő tételekből számolódnak."
                )}
              </p>
            </div>
            <span className="text-micro text-slate-400">
              {t("Automatic ledger calculation", "Automatický výpočet z pohybov", "Automatikus számítás a mozgásokból")}
            </span>
          </button>

          {/* Simplified Mode Card */}
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setFinancialMode?.("simplified")}
            className={`text-left p-4 rounded-2xl border transition-all duration-150 ease-out flex flex-col justify-between gap-3 ${
              financialMode === "simplified"
                ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/15"
                : "bg-white border-slate-200 hover:border-slate-300 hover:-translate-y-px"
            } ${canEdit ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ui font-bold text-slate-900">
                  <FileSpreadsheet className={`h-4 w-4 ${financialMode === "simplified" ? "text-emerald-600" : "text-slate-400"}`} />
                  {t("Simplified mode", "Zjednodušený režim", "Egyszerűsített mód")}
                </span>
                {financialMode === "simplified" && (
                  <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-emerald-100 text-emerald-700">
                    {t("Active", "Aktívny", "Aktív")}
                  </span>
                )}
              </div>
              <p className="text-caption text-slate-600 leading-snug">
                {t(
                  "The overview table behaves like a standalone Excel spreadsheet. Click any cell to directly type numbers or arithmetic equations (e.g. 1200 + 450). Graphs reflect these table totals.",
                  "Prehľadová tabuľka funguje ako samostatný Excel. Kliknutím na bunku priamo vpíšete hodnotu alebo matematický vzorec (napr. 1200 + 450). Grafy automaticky čerpajú z týchto hodnôt.",
                  "Az áttekintő táblázat önálló Excel-táblázatként működik. Bármelyik cellára kattintva közvetlenül beírhat számokat vagy képleteket (pl. 1200 + 450). A grafikonok ebből épülnek fel."
                )}
              </p>
            </div>
            <span className="text-micro text-slate-400">
              {t("Direct manual cells & equations", "Priame zadávanie hodnôt a vzorcov", "Közvetlen értékek és képletek")}
            </span>
          </button>
        </div>
      </div>

      {/* Movements table */}
      <div className={PANEL}>
        <h3 className={PANEL_TITLE}>
          <Table2 className="h-4.5 w-4.5 text-indigo-500" />
          {t("Movements table", "Tabuľka pohybov", "Mozgások táblázata")}
        </h3>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-ui font-bold text-slate-800">
              {t("Inline editing", "Úpravy priamo v riadku", "Szerkesztés közvetlenül a sorban")}
            </span>
            <span className="block text-caption text-slate-500 mt-0.5">
              {t(
                "Change a payment's status straight from its row in the Movements table. When off, the status is a plain badge and every change goes through the edit panel.",
                "Stav úhrady meníte priamo v riadku tabuľky Pohyby. Keď je vypnuté, stav je len štítok a každá zmena sa robí v paneli úprav.",
                "A fizetés állapotát közvetlenül a Mozgások táblázat soraiban módosíthatja. Kikapcsolva az állapot csak címke, és minden módosítás a szerkesztő panelen keresztül történik."
              )}
            </span>
            <span className="block text-micro text-slate-400 mt-1">
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
            <span className="w-9 h-5 bg-slate-300 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40 peer-checked:bg-indigo-600 transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-transform after:duration-200 peer-checked:after:translate-x-4 peer-checked:after:border-white" />
          </span>
        </label>
      </div>

      {/* Currency */}
      <div className={PANEL}>
        <h3 className={PANEL_TITLE}>
          <Coins className="h-4.5 w-4.5 text-emerald-500" />
          {getTranslation(userLanguage, "settings.general.currency")}
        </h3>
        <div className="space-y-1.5 max-w-md">
          <CustomSelect
            disabled={!canEditCurrency}
            value={systemCurrency || ""}
            onChange={(v) => setSystemCurrency(v)}
            options={[
              {
                value: "",
                label: `${getTranslation(userLanguage, "settings.general.currency_auto")} (${currencyForRegion(systemLanguage)})`
              },
              ...CURRENCY_OPTIONS.map((c) => ({ value: c.code, label: c.label }))
            ]}
          />
          <p className="text-micro text-slate-400">
            {getTranslation(userLanguage, "settings.general.currency_desc")}
          </p>
          <p className="text-micro text-slate-400">
            {t(
              "The same setting as in General config — it applies to the whole workspace, not just Finance.",
              "Rovnaké nastavenie ako vo Všeobecnej konfigurácii — platí pre celý systém, nielen pre Financie.",
              "Ugyanaz a beállítás, mint az Általános beállításokban — a teljes rendszerre vonatkozik, nem csak a Pénzügyekre."
            )}
          </p>
        </div>
      </div>

      {/* Movement categories */}
      <FinancialCategoriesManager
        financialCategories={financialCategories}
        setFinancialCategories={setFinancialCategories}
        setFinancialRecords={setFinancialRecords}
        userLanguage={userLanguage}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  );
};
