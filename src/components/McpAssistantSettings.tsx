import React, { useEffect, useId, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Eye, EyeOff, Key, LifeBuoy, RefreshCw, Terminal, Trash2 } from "lucide-react";
import type { UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { asLang } from "../utils/undoMessages";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { useConfirmDialog } from "./ui/ConfirmDialog";
import { MCP_KEY_PLACEHOLDER, buildAgentPrompt, buildCliCommand, buildEditorConfig, buildStdioConfig } from "../utils/mcpConnect";
import { PRODUCT_NAME } from "../utils/brand";
import { CopyField, Disclosure, showToast, type T } from "./mcp/mcpUi";
import { McpWebConnectPanel } from "./mcp/McpWebConnectPanel";

interface McpKeyInfo {
  id: number;
  prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface McpKeyState {
  has_key: boolean;
  key?: McpKeyInfo;
}

const StepHeader: React.FC<{ n: number; title: string; children?: React.ReactNode }> = ({ n, title, children }) => (
  <div className="flex items-start gap-3">
    <span
      aria-hidden="true"
      className="h-7 w-7 shrink-0 rounded-full bg-emerald-600 text-white type-overline flex items-center justify-center"
    >
      {n}
    </span>
    <div className="min-w-0">
      <h4 className="text-ui font-bold text-slate-800">{title}</h4>
      {children && <div className="text-caption text-slate-500 font-medium mt-0.5">{children}</div>}
    </div>
  </div>
);

const CARD = "glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4";

const TRANSPORT_TABS = ["web", "editor", "cli", "bridge"] as const;
type TransportTab = (typeof TRANSPORT_TABS)[number];
const TAB_STORAGE_KEY = "ccrm_mcp_connect_tab";

const readStoredTab = (): TransportTab => {
  try {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    if ((TRANSPORT_TABS as readonly string[]).includes(stored ?? "")) return stored as TransportTab;
  } catch {
    /* storage blocked: fall back to the default */
  }
  return "web";
};

const LOCALES: Record<Language, string> = { en: "en-GB", sk: "sk-SK", hu: "hu-HU" };

/** The server sends "YYYY-MM-DD HH:MM:SS"; show it in the user's language, or as-is if it will not parse. */
const formatWhen = (raw: string, lang: Language): string => {
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString(LOCALES[lang] ?? LOCALES.en, { dateStyle: "medium", timeStyle: "short" });
};

export interface McpAssistantSettingsProps {
  currentUser: UserProfile;
  activeLang: Language;
}

export const McpAssistantSettings: React.FC<McpAssistantSettingsProps> = ({ currentUser, activeLang }) => {
  const brand = PRODUCT_NAME;
  const t: T = (en, sk, hu) => (activeLang === "sk" ? sk : activeLang === "hu" ? hu : en);
  const lang = asLang(activeLang);

  const [mcpData, setMcpData] = useState<McpKeyState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  // The full key exists in the browser only between generating it and leaving this tab.
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(true);
  const [tab, setTab] = useState<TransportTab>(readStoredTab);
  const [confirm, confirmNode] = useConfirmDialog();
  const tabsId = useId();

  const fetchKey = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/mcp_keys.php");
      const data = await res.json();
      if (data.success) {
        setMcpData(data);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch (e) {
      console.error("Failed to fetch MCP key:", e);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKey();
  }, []);

  const generateKey = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/mcp_keys.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${currentUser.name}'s MCP Key` }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        setNewKey(data.token);
        setShowKey(true);
        setMcpData({
          has_key: true,
          key: { id: 0, prefix: data.prefix, name: data.name, created_at: data.created_at, last_used_at: null },
        });
        showToast(t("Access key generated.", "Prístupový kľúč bol vygenerovaný.", "A hozzáférési kulcs elkészült."));
      } else {
        showToast(
          data.error || t("Could not generate the key.", "Kľúč sa nepodarilo vygenerovať.", "A kulcsot nem sikerült létrehozni."),
          "error"
        );
      }
    } catch (e) {
      console.error("Failed to generate MCP key:", e);
      showToast(t("Could not generate the key.", "Kľúč sa nepodarilo vygenerovať.", "A kulcsot nem sikerült létrehozni."), "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Generating replaces the old key, so an existing key gets a confirmation first.
  const regenerateKey = async () => {
    const ok = await confirm({
      title: t("Generate a new key?", "Vygenerovať nový kľúč?", "Új kulcs létrehozása?"),
      message: t(
        "Your current key stops working at once. Every AI app that uses it will need the new key.",
        "Váš aktuálny kľúč okamžite prestane fungovať. Každá AI aplikácia, ktorá ho používa, bude potrebovať nový.",
        "A jelenlegi kulcs azonnal megszűnik működni. Minden MI alkalmazásnak, amely használja, az új kulcsra lesz szüksége."
      ),
      confirmLabel: t("Generate new key", "Vygenerovať nový", "Új kulcs létrehozása"),
      cancelLabel: t("Cancel", "Zrušiť", "Mégse"),
      danger: true,
    });
    if (ok) await generateKey();
  };

  const revokeKey = async () => {
    setIsRevoking(true);
    try {
      const res = await fetch("/api/mcp_keys.php", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setNewKey(null);
        setMcpData({ has_key: false });
        showToast(
          t(
            "Key revoked. Connected AI apps no longer have access.",
            "Kľúč bol odvolaný. Pripojené AI aplikácie už nemajú prístup.",
            "A kulcs visszavonva. A csatlakoztatott MI alkalmazások már nem férnek hozzá."
          )
        );
      } else {
        showToast(data.error || t("Could not revoke the key.", "Kľúč sa nepodarilo odvolať.", "A kulcsot nem sikerült visszavonni."), "error");
      }
    } catch (e) {
      console.error("Failed to revoke MCP key:", e);
      showToast(t("Could not revoke the key.", "Kľúč sa nepodarilo odvolať.", "A kulcsot nem sikerült visszavonni."), "error");
    } finally {
      setIsRevoking(false);
    }
  };

  const origin = window.location.origin;
  const hasToken = !!newKey;
  const replaceWarning = hasToken
    ? undefined
    : t(
        `Replace ${MCP_KEY_PLACEHOLDER} with your key.`,
        `Nahraďte ${MCP_KEY_PLACEHOLDER} svojím kľúčom.`,
        `Cserélje le a ${MCP_KEY_PLACEHOLDER} részt a saját kulcsára.`
      );
  const agentPrompt = buildAgentPrompt({ name: currentUser.name, email: currentUser.email, role: currentUser.role });

  const tabLabels: Record<TransportTab, string> = {
    web: t("Web app / connector", "Webová aplikácia / konektor", "Webes alkalmazás / összekötő"),
    editor: t("Code editors & config files", "Editory kódu a konfiguračné súbory", "Kódszerkesztők és konfigurációs fájlok"),
    cli: t("Command line", "Príkazový riadok", "Parancssor"),
    bridge: t("Local bridge (advanced)", "Lokálny most (pokročilé)", "Helyi híd (haladó)"),
  };

  const selectTab = (next: TransportTab) => {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      /* storage blocked: the choice just is not remembered */
    }
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const at = TRANSPORT_TABS.indexOf(tab);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? TRANSPORT_TABS.length - 1 : (at + step + TRANSPORT_TABS.length) % TRANSPORT_TABS.length;
    selectTab(TRANSPORT_TABS[next]);
    document.getElementById(`${tabsId}-tab-${TRANSPORT_TABS[next]}`)?.focus();
  };

  const code = (text: string) => <code className="px-1 py-0.5 rounded bg-slate-100 font-mono text-micro text-slate-700">{text}</code>;

  const keyActions = mcpData?.has_key && (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={regenerateKey}
        disabled={isGenerating}
        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-ui font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
        <span>{t("Regenerate key", "Pregenerovať kľúč", "Kulcs újragenerálása")}</span>
      </button>
      <HoldToConfirmButton
        onConfirm={revokeKey}
        disabled={isRevoking}
        lang={lang}
        tone="danger"
        hint={t("Hold to revoke", "Podržte pre odvolanie", "Tartsa lenyomva a visszavonáshoz")}
        aria-label={t(
          "Revoke access key, hold to confirm",
          "Odvolať prístupový kľúč, podržte pre potvrdenie",
          "Hozzáférési kulcs visszavonása, tartsa lenyomva a megerősítéshez"
        )}
        icon={<Trash2 className="h-3.5 w-3.5" />}
        className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 rounded-xl text-ui font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
      >
        {t("Revoke", "Odvolať", "Visszavonás")}
      </HoldToConfirmButton>
    </div>
  );

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className={`${CARD} space-y-0`}>
        <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 border border-emerald-100/60 shadow-sm shrink-0">
              <Bot className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-title-sm font-heading font-extrabold text-slate-900 tracking-tight">
                {t("AI Assistant (MCP)", "AI asistent (MCP)", "MI asszisztens (MCP)")}
              </h3>
              <p className="text-ui text-slate-500 font-medium mt-0.5">
                {t(
                  `Let an AI assistant read and update your ${PRODUCT_NAME} data — leads, clients, projects, tasks, invoices — within your permissions.`,
                  `Nechajte AI asistenta čítať a upravovať ${PRODUCT_NAME} dáta – leady, klientov, projekty, úlohy, faktúry – v rámci vašich oprávnení.`,
                  `Engedje, hogy egy MI asszisztens olvassa és frissítse a ${PRODUCT_NAME} adatait – leadeket, ügyfeleket, projekteket, feladatokat, számlákat – a jogosultságai keretein belül.`
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchKey}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl text-ui font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 self-start ws-sm:self-auto"
            title={t("Refresh key status", "Obnoviť stav kľúča", "Kulcs állapotának frissítése")}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
            <span>{t("Refresh", "Obnoviť", "Frissítés")}</span>
          </button>
        </div>
      </div>

      {/* Step 1 — the key */}
      <section className={CARD} aria-labelledby={`${tabsId}-step1`} data-testid="mcp-step-key">
        <div id={`${tabsId}-step1`}>
          <StepHeader n={1} title={t("Your access key", "Váš prístupový kľúč", "Az Ön hozzáférési kulcsa")}>
            {t(
              "The key lets an AI app act as you, with your role's permissions. Treat it like a password.",
              "Kľúč umožňuje AI aplikácii konať vo vašom mene, s oprávneniami vašej roly. Berte ho ako heslo.",
              "A kulcs lehetővé teszi, hogy egy MI alkalmazás az Ön nevében járjon el, a szerepköre jogosultságaival. Kezelje jelszóként."
            )}
          </StepHeader>
        </div>

        {loadFailed && !mcpData && (
          <p className="text-caption font-semibold text-red-600">
            {t(
              "Could not load the key status. Press Refresh to try again.",
              "Stav kľúča sa nepodarilo načítať. Skúste to znova tlačidlom Obnoviť.",
              "A kulcs állapotát nem sikerült betölteni. Próbálja újra a Frissítés gombbal."
            )}
          </p>
        )}

        {mcpData && !mcpData.has_key && (
          <div className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60">
            <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-slate-200 text-slate-600">
              {t("No key yet", "Zatiaľ bez kľúča", "Még nincs kulcs")}
            </span>
            <button
              type="button"
              onClick={generateKey}
              disabled={isGenerating}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-ui font-extrabold transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Key className="h-4 w-4" />
              <span>
                {isGenerating ? t("Generating...", "Generujem...", "Létrehozás...") : t("Generate key", "Vygenerovať kľúč", "Kulcs létrehozása")}
              </span>
            </button>
          </div>
        )}

        {mcpData?.has_key && mcpData.key && newKey && (
          <div className="space-y-3 animate-fade-in">
            <div role="alert" className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-ui">
                <p className="font-extrabold">
                  {t("Copy it now – it is shown only once.", "Skopírujte ho hneď – zobrazí sa iba raz.", "Másolja ki most – csak egyszer jelenik meg.")}
                </p>
                <p className="font-medium mt-0.5">
                  {t(
                    "Paste it into your AI app now, or save it in a password manager. If you lose it, generate a new one.",
                    "Vložte ho hneď do AI aplikácie alebo si ho uložte do správcu hesiel. Ak ho stratíte, vygenerujte nový.",
                    "Illessze be most az MI alkalmazásba, vagy mentse el egy jelszókezelőbe. Ha elveszíti, hozzon létre újat."
                  )}
                </p>
              </div>
            </div>
            <CopyField
              testId="mcp-full-key"
              t={t}
              label={t("Access key", "Prístupový kľúč", "Hozzáférési kulcs")}
              value={newKey}
              displayValue={showKey ? newKey : "•".repeat(40)}
              actions={
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t("Hide key", "Skryť kľúč", "Kulcs elrejtése") : t("Show key", "Zobraziť kľúč", "Kulcs megjelenítése")}
                  className="px-2.5 py-1.5 text-ui font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1 cursor-pointer"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{showKey ? t("Hide", "Skryť", "Elrejtés") : t("Show", "Zobraziť", "Megjelenítés")}</span>
                </button>
              }
            />
            {keyActions}
          </div>
        )}

        {mcpData?.has_key && mcpData.key && !newKey && (
          <div className="space-y-3" data-testid="mcp-key-saved">
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 font-mono text-ui text-slate-700">
                  <Key className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-bold text-slate-800">{mcpData.key.prefix}</span>
                  <span className="text-slate-400">••••••••••••••••</span>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {t("Active", "Aktívny", "Aktív")}
                </span>
              </div>
              <p className="text-caption text-slate-500 font-medium">
                {t("Created", "Vytvorený", "Létrehozva")}: {formatWhen(mcpData.key.created_at, activeLang)} ·{" "}
                {t("Stored as a one-way hash", "Uložený ako jednosmerný hash", "Egyirányú hashként tárolva")}
              </p>
              {mcpData.key.last_used_at ? (
                <p className="flex items-center gap-1.5 text-caption font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {t("Last used", "Naposledy použitý", "Utoljára használva")} {formatWhen(mcpData.key.last_used_at, activeLang)}
                </p>
              ) : (
                <p className="text-caption font-medium text-slate-500">
                  {t("Last used", "Naposledy použitý", "Utoljára használva")}: {t("Never", "Nikdy", "Soha")} –{" "}
                  {t("the key has not connected yet.", "kľúč sa zatiaľ nepripojil.", "a kulcs még nem csatlakozott.")}
                </p>
              )}
              <p className="text-caption text-slate-600 font-medium">
                {t(
                  "For security the full key is shown only once. Lost it? Generate a new one — the old one stops working.",
                  "Z bezpečnostných dôvodov sa celý kľúč zobrazí iba raz. Stratili ste ho? Vygenerujte nový – ten starý prestane fungovať.",
                  "Biztonsági okból a teljes kulcs csak egyszer jelenik meg. Elveszett? Hozzon létre újat – a régi megszűnik működni."
                )}
              </p>
            </div>
            {keyActions}
          </div>
        )}
      </section>

      {/* Step 2 — connect */}
      <section className={CARD} aria-labelledby={`${tabsId}-step2`} data-testid="mcp-step-connect">
        <div id={`${tabsId}-step2`}>
          <StepHeader
            n={2}
            title={t("Choose how your AI app connects", "Vyberte, ako sa vaša AI aplikácia pripája", "Válassza ki, hogyan csatlakozik az MI alkalmazás")}
          />
        </div>

        {mcpData && !mcpData.has_key && (
          <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-ui font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              {t(
                "Generate your key in step 1 first. Until then the values below show a placeholder.",
                "Najprv vygenerujte kľúč v kroku 1. Dovtedy sa nižšie zobrazuje zástupný text.",
                "Először hozza létre a kulcsot az 1. lépésben. Addig az alábbi értékek helyőrzőt mutatnak."
              )}
            </span>
          </div>
        )}

        <div
          role="tablist"
          aria-label={t("How your AI app connects", "Ako sa AI aplikácia pripája", "Az MI alkalmazás csatlakozási módja")}
          className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 max-w-full overflow-x-auto"
        >
          {TRANSPORT_TABS.map((id) => (
            <button
              key={id}
              id={`${tabsId}-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => selectTab(id)}
              onKeyDown={onTabKeyDown}
              className={`px-3 py-1.5 text-caption font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                tab === id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tabLabels[id]}
            </button>
          ))}
        </div>

        <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${tab}`} className="space-y-3 min-w-0">
          {tab === "web" && (
            <McpWebConnectPanel
              t={t}
              activeLang={activeLang}
              origin={origin}
              userName={currentUser.name}
              newKey={newKey}
              hasSavedKey={!!mcpData?.has_key}
              isGenerating={isGenerating}
              onGenerate={mcpData?.has_key ? regenerateKey : generateKey}
            />
          )}

          {tab === "editor" && (
            <>
              <p className="text-ui text-slate-600 font-medium">
                {t(
                  "Cursor, VS Code, Windsurf, Antigravity, Claude Desktop (through its config file) and similar apps.",
                  "Cursor, VS Code, Windsurf, Antigravity, Claude Desktop (cez konfiguračný súbor) a podobné aplikácie.",
                  "Cursor, VS Code, Windsurf, Antigravity, Claude Desktop (a konfigurációs fájlján keresztül) és hasonló alkalmazások."
                )}
              </p>
              <p className="text-caption text-slate-500 font-medium">
                {t(
                  "Add this to your app's MCP configuration file (often called mcp.json or mcp_config.json). If the file already has an mcpServers block, add only the ccrm entry.",
                  "Pridajte to do konfiguračného súboru MCP vašej aplikácie (často sa volá mcp.json alebo mcp_config.json). Ak súbor už obsahuje blok mcpServers, pridajte iba položku ccrm.",
                  "Adja hozzá az alkalmazás MCP konfigurációs fájljához (gyakran mcp.json vagy mcp_config.json a neve). Ha a fájlban már van mcpServers blokk, csak a ccrm bejegyzést adja hozzá."
                )}
              </p>
              <CopyField
                testId="mcp-field-editor"
                t={t}
                label={t("MCP configuration (JSON)", "Konfigurácia MCP (JSON)", "MCP konfiguráció (JSON)")}
                value={buildEditorConfig(origin, newKey)}
                placeholderWarning={replaceWarning}
              />
            </>
          )}

          {tab === "cli" && (
            <>
              <p className="text-ui text-slate-600 font-medium">
                {t(
                  "For AI agents you run in a terminal. Example for Claude Code:",
                  "Pre AI agentov, ktorých spúšťate v termináli. Príklad pre Claude Code:",
                  "A terminálban futtatott MI ügynökökhöz. Példa a Claude Code-hoz:"
                )}
              </p>
              <CopyField
                testId="mcp-field-cli"
                t={t}
                label={t("Command", "Príkaz", "Parancs")}
                value={buildCliCommand(origin, newKey)}
                placeholderWarning={replaceWarning}
              />
              <p className="text-caption text-slate-500 font-medium">
                {t(
                  "Using a different command-line agent? Use its own “add MCP server” command with the Server URL and header from the “Web app / connector” tab.",
                  "Používate iného agenta v príkazovom riadku? Použite jeho vlastný príkaz na pridanie MCP servera s URL servera a hlavičkou z karty „Webová aplikácia / konektor“.",
                  "Másik parancssori ügynököt használ? Használja annak saját „MCP szerver hozzáadása” parancsát a „Webes alkalmazás / összekötő” lapon látható Szerver URL-lel és fejléccel."
                )}
              </p>
            </>
          )}

          {tab === "bridge" && (
            <>
              <p className="text-ui text-slate-600 font-medium">
                {t(
                  `Only needed for apps that cannot reach a remote URL. It runs a small Node program on your computer and needs the mcp-server folder from the ${brand} repository.`,
                  `Potrebné iba pre aplikácie, ktoré sa nevedia pripojiť na vzdialenú adresu. Spúšťa malý program v Node na vašom počítači a vyžaduje priečinok mcp-server z repozitára ${brand}.`,
                  `Csak olyan alkalmazásokhoz kell, amelyek nem érnek el távoli URL-t. Egy kis Node programot futtat a számítógépén, és a ${brand} tárolóból az mcp-server mappára van szüksége.`
                )}
              </p>
              <p className="text-caption text-slate-500 font-medium">
                {t("Replace", "Nahraďte", "Cserélje le a")} {code("/path/to/ccrm-app")}{" "}
                {t(
                  `with the folder where the ${brand} repository is on your computer.`,
                  `priečinkom, v ktorom je repozitár ${brand} na vašom počítači.`,
                  `részt arra a mappára, ahol a ${brand} tároló a számítógépén van.`
                )}
              </p>
              <CopyField
                testId="mcp-field-bridge"
                t={t}
                label={t("Local bridge configuration (JSON)", "Konfigurácia lokálneho mosta (JSON)", "Helyi híd konfigurációja (JSON)")}
                value={buildStdioConfig(origin, newKey)}
                placeholderWarning={replaceWarning}
              />
            </>
          )}
        </div>
      </section>

      {/* Step 3 — optional prompt */}
      <section className={CARD} aria-labelledby={`${tabsId}-step3`} data-testid="mcp-step-prompt">
        <div id={`${tabsId}-step3`}>
          <StepHeader
            n={3}
            title={t(
              `Optional: tell the assistant how to work with ${brand}`,
              `Voliteľné: poraďte asistentovi, ako pracovať s ${brand}`,
              `Opcionális: tájékoztassa az asszisztenst, hogyan dolgozzon a ${brand}-mel`
            )}
          >
            {t(
              "Paste these instructions into your AI app's “project instructions”, “custom instructions” or “system prompt” (the name depends on the app).",
              "Vložte tieto pokyny do „pokynov projektu“, „vlastných pokynov“ alebo „systémového promptu“ vašej AI aplikácie (názov závisí od aplikácie).",
              "Illessze be ezeket az utasításokat az MI alkalmazás „projektutasításai”, „egyéni utasításai” vagy „rendszerpromptja” közé (a név az alkalmazástól függ)."
            )}
          </StepHeader>
        </div>
        <CopyField
          testId="mcp-field-prompt"
          t={t}
          monospace={false}
          label={t("Instructions for the assistant", "Pokyny pre asistenta", "Utasítások az asszisztensnek")}
          value={agentPrompt}
          previewLabel={t("Preview what you are copying", "Zobraziť, čo kopírujete", "Előnézet a másolandó szövegről")}
        />
        <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4.5 text-ui text-amber-950 font-medium space-y-3">
          <div className="font-bold text-amber-900 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-amber-600" />
            <span>{t("Agent Identity & Scope:", "Identita a rozsah agenta:", "Ügynök identitás és hatókör:")}</span>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-caption leading-relaxed text-amber-900/90">
            <li>
              {t("Active Persona:", "Aktívna identita:", "Aktív identitás:")} <strong>{currentUser.name}</strong> ({currentUser.email})
            </li>
            <li>
              {t("Security Boundary:", "Bezpečnostná hranica:", "Biztonsági határ:")}{" "}
              {t(
                "Limited to your role's permissions. No access to credentials, licenses or destructive commands; the only setting reachable is the finance mode (admin only).",
                "Obmedzené oprávneniami vašej roly. Žiadny prístup k heslám, licenciám ani deštruktívnym príkazom; jediné dostupné nastavenie je režim financií (len admin).",
                "A szerepköre jogosultságaira korlátozva. Nincs hozzáférés jelszavakhoz, licencekhez vagy destruktív parancsokhoz; az egyetlen elérhető beállítás a pénzügyi mód (csak admin)."
              )}
            </li>
            <li>
              {t("Audit Logged:", "Auditované:", "Auditálva:")}{" "}
              {t(
                "Every write action (invoice creation, stage change, task assignment) is stamped with your user ID.",
                "Každý zápis je v audit logu označený vaším používateľským účtom.",
                "Minden művelet rögzítésre kerül az Ön felhasználói azonosítójával."
              )}
            </li>
          </ul>
        </div>
      </section>

      {/* Troubleshooting */}
      <Disclosure
        className="glass-panel rounded-3xl bg-white/95"
        summary={
          <span className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-slate-500" />
            {t("Something not working?", "Niečo nefunguje?", "Valami nem működik?")}
          </span>
        }
      >
        <dl className="space-y-3 text-ui">
          <div>
            <dt className="font-bold text-slate-800">{t("“Unauthorized” or error 401", "„Unauthorized“ alebo chyba 401", "„Unauthorized” vagy 401-es hiba")}</dt>
            <dd className="text-slate-600 font-medium">
              {t(
                "The key is wrong, was revoked or was replaced by a new one. Generate a new key in step 1 and update it in your AI app.",
                "Kľúč je nesprávny, bol odvolaný alebo ho nahradil nový. Vygenerujte nový kľúč v kroku 1 a aktualizujte ho v AI aplikácii.",
                "A kulcs hibás, vissza lett vonva, vagy egy új váltotta fel. Hozzon létre új kulcsot az 1. lépésben, és frissítse az MI alkalmazásban."
              )}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">
              {t("My app sends Authorization but still gets 401", "Moja aplikácia posiela Authorization, ale stále dostáva 401", "Az alkalmazásom Authorization fejlécet küld, mégis 401-et kap")}
            </dt>
            <dd className="text-slate-600 font-medium">
              {t(`Some servers drop that header before ${brand} sees it. Use the`, `Niektoré servery túto hlavičku zahodia skôr, než ju ${brand} uvidí. Použite hlavičku`, `Egyes szerverek eldobják ezt a fejlécet, mielőtt a ${brand} látná. Használja az`)}{" "}
              {code("X-API-Key")}{" "}
              {t("header instead.", "namiesto nej.", "fejlécet helyette.")}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">{t("What can the assistant see and do?", "Čo môže asistent vidieť a robiť?", "Mit láthat és tehet az asszisztens?")}</dt>
            <dd className="text-slate-600 font-medium">
              {t(
                "The key belongs to you: the assistant can see and do only what your role allows, and every change is logged under your name.",
                "Kľúč patrí vám: asistent vidí a robí iba to, čo dovoľuje vaša rola, a každá zmena sa zaznamená pod vaším menom.",
                "A kulcs az Öné: az asszisztens csak azt láthatja és teheti, amit a szerepköre megenged, és minden módosítás az Ön neve alatt kerül naplózásra."
              )}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">{t("I closed the page before copying the key", "Zavrel som stránku skôr, než som skopíroval kľúč", "Bezártam az oldalt, mielőtt kimásoltam a kulcsot")}</dt>
            <dd className="text-slate-600 font-medium">
              {t(
                "No problem – generate a new one in step 1. The old one stops working.",
                "Nevadí – vygenerujte nový v kroku 1. Ten starý prestane fungovať.",
                "Semmi baj – hozzon létre újat az 1. lépésben. A régi megszűnik működni."
              )}
            </dd>
          </div>
        </dl>
      </Disclosure>

      {confirmNode}
    </div>
  );
};
