import React from "react";
import * as Icons from "lucide-react";
import {
  Database, Sliders, Globe, Key, Bot, ExternalLink, AlertTriangle, CheckCircle2, Clock
} from "lucide-react";
import type { Language } from "../../utils/translations";
import type { PermissionValue } from "../../utils/permissions";
import { CustomSelect } from "../ui/CustomSelect";
import { SecretInput } from "../ui/SecretInput";
import { PasswordInput } from "../PasswordInput";
import { cn } from "../../utils/cn";
import { PRODUCT_NAME } from "../../utils/brand";
import { SectionCard, SaveStatus } from "./SectionCard";
import type { AutosaveStatus } from "./useAutosave";
import { getAgentConnectorTypeLabel, type LlmSourceConnector } from "../../utils/companyMailboxes";
import { hasOpenAiEmbeddingSource } from "../../utils/aiConfig";

interface AiIntegrationSettingsProps {
  aiConnectorId: string;
  setAiConnectorId: React.Dispatch<React.SetStateAction<string>>;
  aiConnectorName: string;
  setAiConnectorName: React.Dispatch<React.SetStateAction<string>>;
  aiConnectorType: string;
  setAiConnectorType: React.Dispatch<React.SetStateAction<string>>;
  aiSourceMode: "manual" | "connector";
  setAiSourceMode: React.Dispatch<React.SetStateAction<"manual" | "connector">>;
  aiStatus: AutosaveStatus;
  anthropicKey: string;
  setAnthropicKey: React.Dispatch<React.SetStateAction<string>>;
  geminiKey: string;
  setGeminiKey: React.Dispatch<React.SetStateAction<string>>;
  openAiKey: string;
  setOpenAiKey: React.Dispatch<React.SetStateAction<string>>;
  sonioxApiKey: string;
  setSonioxApiKey: React.Dispatch<React.SetStateAction<string>>;
  fetchTrainingStats: () => Promise<void>;
  getPermission: (key: string) => PermissionValue;
  handleStartTraining: () => Promise<void>;
  handleValidateConnection: () => Promise<void>;
  isTraining: boolean;
  isValidating: boolean;
  llmConnectors: LlmSourceConnector[];
  llmConnectorsLoading: boolean;
  mariaDbHost: string;
  setMariaDbHost: React.Dispatch<React.SetStateAction<string>>;
  mariaDbName: string;
  setMariaDbName: React.Dispatch<React.SetStateAction<string>>;
  mariaDbPassword: string;
  setMariaDbPassword: React.Dispatch<React.SetStateAction<string>>;
  mariaDbPort: string;
  setMariaDbPort: React.Dispatch<React.SetStateAction<string>>;
  mariaDbUser: string;
  setMariaDbUser: React.Dispatch<React.SetStateAction<string>>;
  pineconeApiKey: string;
  setPineconeApiKey: React.Dispatch<React.SetStateAction<string>>;
  pineconeIndex: string;
  setPineconeIndex: React.Dispatch<React.SetStateAction<string>>;
  qdrantApiKey: string;
  setQdrantApiKey: React.Dispatch<React.SetStateAction<string>>;
  qdrantUrl: string;
  setQdrantUrl: React.Dispatch<React.SetStateAction<string>>;
  setValidationResult: React.Dispatch<React.SetStateAction<any>>;
  validationResult: any;
  setVectorDb: React.Dispatch<React.SetStateAction<"none" | "mariadb" | "qdrant" | "pinecone">>;
  vectorDb: "none" | "mariadb" | "qdrant" | "pinecone";
  setVectorDbValidated: React.Dispatch<React.SetStateAction<boolean>>;
  vectorDbValidated: boolean;
  t: (en: string, sk: string, hu: string) => string;
  trainingLogs: string[];
  trainingProgress: number;
  trainingStats: any;
  updateIntegrationsConfig: ((next: any) => void) | undefined;
  userLanguage: Language;
}

export const AiIntegrationSettings: React.FC<AiIntegrationSettingsProps> = ({
  aiConnectorId,
  setAiConnectorId,
  aiConnectorName,
  setAiConnectorName,
  aiConnectorType,
  setAiConnectorType,
  aiSourceMode,
  setAiSourceMode,
  aiStatus,
  anthropicKey,
  setAnthropicKey,
  geminiKey,
  setGeminiKey,
  openAiKey,
  setOpenAiKey,
  sonioxApiKey,
  setSonioxApiKey,
  fetchTrainingStats,
  getPermission,
  handleStartTraining,
  handleValidateConnection,
  isTraining,
  isValidating,
  llmConnectors,
  llmConnectorsLoading,
  mariaDbHost,
  setMariaDbHost,
  mariaDbName,
  setMariaDbName,
  mariaDbPassword,
  setMariaDbPassword,
  mariaDbPort,
  setMariaDbPort,
  mariaDbUser,
  setMariaDbUser,
  pineconeApiKey,
  setPineconeApiKey,
  pineconeIndex,
  setPineconeIndex,
  qdrantApiKey,
  setQdrantApiKey,
  qdrantUrl,
  setQdrantUrl,
  setValidationResult,
  validationResult,
  setVectorDb,
  vectorDb,
  setVectorDbValidated,
  vectorDbValidated,
  t,
  trainingLogs,
  trainingProgress,
  trainingStats,
  updateIntegrationsConfig,
  userLanguage,
}) => {
        const aiReadOnly = getPermission("ai_config") === "view";
        const selectedConnector = aiConnectorId
          ? llmConnectors.find((c) => c.id === aiConnectorId) ?? null
          : null;
        const effectiveConnectorType = selectedConnector?.connectorType || aiConnectorType;
        const canConfigureVectorDb =
          hasOpenAiEmbeddingSource({
            openAiKey,
            aiSourceMode,
            aiConnectorId,
            aiConnectorType: effectiveConnectorType,
          }) &&
          !(
            aiSourceMode === "connector" &&
            effectiveConnectorType === "openai_api" &&
            selectedConnector &&
            !selectedConnector.hasCredentials &&
            openAiKey.trim() === ""
          );

        return (
                  <div className="space-y-6 animate-fade-in">
        
                    {/* API CREDENTIALS OR CONNECTOR SOURCE — always editable, independent of vector DB connection state */}
                    <SectionCard
                      title={t("AI & OpenAI Integration", "Integrácia AI a OpenAI", "AI és OpenAI integráció")}
                      description={t(`Choose whether ${PRODUCT_NAME} AI features use standalone API keys or an existing external LLM connector. Once an OpenAI credential source is available, you can also configure the vector database sidecar.`, `Vyberte, či AI funkcie v ${PRODUCT_NAME} používajú samostatné API kľúče alebo existujúci externý LLM konektor. Keď je dostupný zdroj OpenAI, môžete nastaviť aj sidecar vektorovej databázy.`, `Válassza ki, hogy a ${PRODUCT_NAME} AI funkciói külön API kulcsokat vagy egy meglévő külső LLM csatlakozót használjanak. Amint OpenAI hitelesítési forrás érhető el, a vektoradatbázis sidecart is beállíthatja.`)}
                      action={<SaveStatus lang={userLanguage} status={aiStatus} />}
                    >
                      {/* AI Source Mode Switcher */}
                      <div className="space-y-2">
                        <label className="type-overline text-slate-500 block">
                          {t("AI Source", "Zdroj AI", "AI forrás")}
                        </label>
                        <div
                          role="tablist"
                          aria-label={t("AI Source", "Zdroj AI", "AI forrás")}
                          className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 gap-1 w-full ws-sm:max-w-md"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={aiSourceMode === "manual"}
                            disabled={aiReadOnly}
                            onClick={() => setAiSourceMode("manual")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-ui transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                              aiSourceMode === "manual"
                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-bold"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/60 font-semibold"
                            }`}
                          >
                            <Key className="h-3.5 w-3.5 shrink-0" />
                            <span>{t("Manual API Keys", "Manuálne API kľúče", "Manuális API kulcsok")}</span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={aiSourceMode === "connector"}
                            disabled={aiReadOnly}
                            onClick={() => setAiSourceMode("connector")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-ui transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                              aiSourceMode === "connector"
                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-bold"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/60 font-semibold"
                            }`}
                          >
                            <Bot className="h-3.5 w-3.5 shrink-0" />
                            <span>{t("Existing LLM Connector", "Existujúci LLM konektor", "Meglévő LLM csatlakozó")}</span>
                          </button>
                        </div>
                      </div>

                      {aiSourceMode === "connector" ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 max-w-2xl">
                            <label className="type-overline text-slate-500">
                              {t("Selected LLM Connector", "Vybratý LLM konektor", "Kiválasztott LLM csatlakozó")}
                            </label>
                            <button
                              type="button"
                              data-testid="ai-manage-connectors-btn"
                              onClick={() => {
                                window.location.hash = "settings/email/mailboxes";
                              }}
                              className="inline-flex items-center gap-1.5 text-micro font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                            >
                              <span>{t("Manage Connectors", "Spravovať konektory", "Csatlakozók kezelése")}</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {!llmConnectorsLoading && llmConnectors.length === 0 ? (
                            <div
                              data-testid="ai-connectors-empty"
                              className="max-w-2xl p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2"
                            >
                              <p className="text-ui font-bold text-slate-800">
                                {t("No LLM connectors configured yet", "Zatiaľ nie sú nastavené žiadne LLM konektory", "Még nincs beállított LLM csatlakozó")}
                              </p>
                              <p className="text-micro font-medium text-slate-500 leading-relaxed">
                                {t(
                                  "Add an OpenAI API, Claude API, Gemini API, Claude, Antigravity, or ChatGPT connector in Connectors settings, then select it here.",
                                  "Pridajte konektor OpenAI API, Claude API, Gemini API, Claude, Antigravity alebo ChatGPT v nastaveniach Konektorov a následne ho vyberte tu.",
                                  "Adjon hozzá egy OpenAI API, Claude API, Gemini API, Claude, Antigravity vagy ChatGPT csatlakozót a Csatlakozók beállításaiban, majd válassza ki itt."
                                )}
                              </p>
                            </div>
                          ) : (
                            <div data-testid="ai-connector-select" className="max-w-2xl">
                              <CustomSelect
                                disabled={aiReadOnly}
                                value={aiConnectorId}
                                onChange={(val) => {
                                  const picked = llmConnectors.find((c) => c.id === val);
                                  setAiConnectorId(val);
                                  setAiConnectorType(picked?.connectorType || "");
                                  setAiConnectorName(picked?.name || "");
                                }}
                                options={[
                                  {
                                    value: "",
                                    label: llmConnectorsLoading
                                      ? t("Loading connectors...", "Načítavajú sa konektory...", "Csatlakozók betöltése...")
                                      : t("Select an LLM connector...", "Vyberte LLM konektor...", "Válasszon LLM csatlakozót..."),
                                  },
                                  ...llmConnectors.map((c) => {
                                    const typeLabel = getAgentConnectorTypeLabel(c.connectorType, userLanguage);
                                    const modelPart = c.agentModel ? ` · ${c.agentModel}` : "";
                                    const statusPart = !c.isActive
                                      ? ` — ${t("Inactive", "Neaktívny", "Inaktív")}`
                                      : !c.hasCredentials
                                        ? ` — ${t("Missing credentials", "Chýbajú údaje", "Hiányzó hitelesítés")}`
                                        : "";
                                    return {
                                      value: c.id,
                                      label: `${c.name} (${typeLabel}${modelPart})${statusPart}`,
                                    };
                                  }),
                                ]}
                              />
                            </div>
                          )}

                          {selectedConnector ? (
                            <div
                              data-testid="ai-connector-status"
                              className="max-w-2xl p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-ui font-bold text-slate-800">{selectedConnector.name}</span>
                                  <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                    {getAgentConnectorTypeLabel(selectedConnector.connectorType, userLanguage)}
                                  </span>
                                  {selectedConnector.agentModel && (
                                    <span className="px-2 py-0.5 rounded-full text-micro font-mono font-semibold bg-white text-slate-600 border border-slate-200">
                                      {selectedConnector.agentModel}
                                    </span>
                                  )}
                                </div>
                                {!selectedConnector.isActive ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {t("Inactive", "Neaktívny", "Inaktív")}
                                  </span>
                                ) : !selectedConnector.hasCredentials ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {t("Missing credentials", "Chýbajúce údaje", "Hiányzó hitelesítés")}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {t("Active & Ready", "Aktívny a pripravený", "Aktív és kész")}
                                  </span>
                                )}
                              </div>
                              <p className="text-micro font-medium text-slate-500 leading-relaxed">
                                {t(
                                  `${PRODUCT_NAME} AI features inherit this connector's configured model automatically.`,
                                  `AI funkcie v ${PRODUCT_NAME} automaticky preberajú model nakonfigurovaný v tomto konektore.`,
                                  `A ${PRODUCT_NAME} AI funkciói automatikusan átveszik a csatlakozó beállított modelljét.`
                                )}
                              </p>
                            </div>
                          ) : aiConnectorId && !llmConnectorsLoading ? (
                            <div
                              data-testid="ai-connector-missing"
                              className="max-w-2xl p-4 rounded-2xl border border-amber-200 bg-amber-50/70 flex items-start gap-2.5 text-amber-900"
                            >
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                              <div className="space-y-0.5">
                                <p className="text-ui font-bold">
                                  {t("Selected connector is unavailable", "Vybratý konektor nie je dostupný", "A kiválasztott csatlakozó nem érhető el")}
                                </p>
                                <p className="text-micro font-medium text-amber-800">
                                  {t(
                                    `“${aiConnectorName || aiConnectorId}” was removed or disabled. Select another connector or switch to manual API keys.`,
                                    `Konektor „${aiConnectorName || aiConnectorId}“ bol odstránený alebo zakázaný. Vyberte iný konektor alebo prepnite na manuálne API kľúče.`,
                                    `A(z) „${aiConnectorName || aiConnectorId}“ csatlakozót eltávolították vagy letiltották. Válasszon másik csatlakozót, vagy váltson manuális API kulcsokra.`
                                  )}
                                </p>
                              </div>
                            </div>
                          ) : !aiConnectorId ? (
                            <p className="text-micro text-slate-400 font-semibold leading-relaxed max-w-2xl">
                              {t(
                                "Select a connector above to activate AI summaries, chat, reports, dashboards, routing, and agents without entering a separate OpenAI API key.",
                                "Vyberte konektor vyššie a aktivujte AI zhrnutia, chat, reporty, dashboardy, smerovanie a agentov bez zadávania samostatného OpenAI API kľúča.",
                                "Válasszon csatlakozót fent az AI összefoglalók, csevegés, riportok, irányítópultok, jegy-irányítás és ügynökök használatához külön OpenAI API kulcs nélkül."
                              )}
                            </p>
                          ) : null}

                          {aiConnectorId && effectiveConnectorType && effectiveConnectorType !== "openai_api" && (
                            <div
                              data-testid="ai-fallback-openai-key"
                              className="space-y-3 pt-4 border-t border-slate-100 max-w-2xl"
                            >
                              <label className="type-overline text-slate-500 block">
                                {t(
                                  "Optional OpenAI Fallback Key (Embeddings, Realtime Voice & WAAI)",
                                  "Voliteľný záložný OpenAI kľúč (Vektorové indexy, Hlas v reálnom čase a WAAI)",
                                  "Opcionális tartalék OpenAI kulcs (Vektoros indexelés, Valós idejű hang és WAAI)"
                                )}
                              </label>
                              <p className="text-micro text-slate-400 font-semibold leading-relaxed">
                                {t(
                                  "Your selected connector handles chat, summaries, reports, dashboards, routing, and agents (and Gemini connectors also cover audio transcription). Add an OpenAI key below only if you use MariaDB 768-d Vector Search, Live Realtime Voice, or WAAI.",
                                  "Vybratý konektor zabezpečuje chat, zhrnutia, reporty, dashboardy, smerovanie a agentov (Gemini konektory podporujú aj prepis zvuku). OpenAI kľúč doplňte nižšie iba ak používate vektorové vyhľadávanie MariaDB, živý hlas v reálnom čase alebo WAAI.",
                                  "A kiválasztott csatlakozó kezeli a csevegést, összefoglalókat, riportokat, irányítópultokat, irányítást és ügynököket (a Gemini csatlakozók a hangátírást is). Csak akkor adjon meg OpenAI kulcsot alább, ha MariaDB vektoros keresést, valós idejű hangot vagy WAAI-t használ."
                                )}
                              </p>
                              <SecretInput
                                className="max-w-2xl"
                                language={userLanguage}
                                disabled={aiReadOnly}
                                value={openAiKey}
                                onChange={setOpenAiKey}
                                placeholder="sk-proj-..."
                              />
                            </div>
                          )}

                          {aiConnectorId && effectiveConnectorType === "openai_api" && (
                            <div
                              data-testid="ai-openai-connector-all-modalities"
                              className="max-w-2xl px-4 py-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-micro font-semibold text-indigo-800 leading-relaxed"
                            >
                              {t(
                                "This OpenAI API connector automatically supplies credentials for 768-d Vector DB embeddings, audio transcription, Live Realtime Voice, and WAAI as well.",
                                "Tento OpenAI API konektor automaticky pokrýva aj 768-d vektorové embeddingy, prepis zvuku, živý hlas v reálnom čase a WAAI.",
                                "Ez az OpenAI API csatlakozó automatikusan biztosítja a hitelesítést a 768-d vektoros beágyazásokhoz, hangátíráshoz, valós idejű hanghoz és a WAAI-hoz is."
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <label className="type-overline text-slate-500 block">
                              {t("OpenAI API Secret Key", "Tajný API kľúč OpenAI", "OpenAI API titkos kulcs")}
                            </label>
                            <SecretInput
                              className="max-w-2xl"
                              language={userLanguage}
                              disabled={aiReadOnly}
                              value={openAiKey}
                              onChange={setOpenAiKey}
                              placeholder="sk-proj-..."
                            />
                          </div>
            
                          <div className="space-y-4 pt-4 border-t border-slate-100">
                            <p className="text-micro text-slate-400 font-semibold leading-relaxed max-w-2xl">
                              {t(
                                `Optional — these providers are only used by AI agent nodes in Automations & Workflows. Every other AI feature in ${PRODUCT_NAME} runs on OpenAI unless an External LLM Connector is selected above.`,
                                `Voliteľné — títo poskytovatelia sa používajú iba v uzloch AI agenta v Automatizáciách a workflowoch. Všetky ostatné AI funkcie v ${PRODUCT_NAME} používajú OpenAI, pokiaľ vyššie nezvolíte externý LLM konektor.`,
                                `Opcionális — ezeket a szolgáltatókat csak az Automatizálások és munkafolyamatok AI ügynök csomópontjai használják. A ${PRODUCT_NAME} többi AI funkciója OpenAI-t használ, hacsak fent nincs kiválasztva egy külső LLM csatlakozó.`
                              )}
                            </p>
            
                            <div className="space-y-2">
                              <label className="type-overline text-slate-500 block">
                                {t("Anthropic API Secret Key", "Tajný API kľúč Anthropic", "Anthropic API titkos kulcs")}
                              </label>
                              <SecretInput
                                className="max-w-2xl"
                                language={userLanguage}
                                disabled={aiReadOnly}
                                value={anthropicKey}
                                onChange={setAnthropicKey}
                                placeholder="sk-ant-..."
                              />
                            </div>
            
                            <div className="space-y-2">
                              <label className="type-overline text-slate-500 block">
                                {t("Google Gemini API Secret Key", "Tajný API kľúč Google Gemini", "Google Gemini API titkos kulcs")}
                              </label>
                              <SecretInput
                                className="max-w-2xl"
                                language={userLanguage}
                                disabled={aiReadOnly}
                                value={geminiKey}
                                onChange={setGeminiKey}
                                placeholder="AIzaSy..."
                              />
                            </div>
                          </div>
                        </>
                      )}

                      <div className="space-y-2 pt-4 border-t border-slate-100">
                        <label className="type-overline text-slate-500 block">
                          {t("Meeting transcription with speakers (Soniox)", "Prepis stretnutí s rozlíšením hovoriacich (Soniox)", "Megbeszélés-átirat beszélőkkel (Soniox)")}
                        </label>
                        {/* Permanent: recording works with either source, this says what the Soniox key adds. */}
                        <div
                          className={cn(
                            "max-w-2xl flex items-start gap-2.5 px-3.5 py-3 rounded-xl border text-ui",
                            sonioxApiKey.trim() !== ""
                              ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
                              : "border-indigo-100 bg-indigo-50/60 text-slate-600",
                          )}
                        >
                          {sonioxApiKey.trim() !== ""
                            ? <Icons.Users className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                            : <Icons.Info className="h-4 w-4 mt-0.5 shrink-0 text-indigo-500" />}
                          <p className="leading-relaxed">
                            {sonioxApiKey.trim() !== ""
                              ? t(
                                  "Speakers are told apart. Meeting Room transcribes recordings through Soniox, live and after you stop, and labels who spoke (Participant 1, 2, …). The AI source above still writes the AI summary.",
                                  "Hovoriaci sa rozlišujú. Zasadačka prepisuje nahrávky cez Soniox, naživo aj po zastavení, a označí, kto hovoril (Účastník 1, 2, …). AI zhrnutie naďalej píše zdroj AI nastavený vyššie.",
                                  "A beszélők megkülönböztetve. A Tárgyaló a Sonioxon keresztül írja át a felvételeket, élőben és leállítás után is, és jelöli, ki beszélt (1., 2. résztvevő, …). Az AI-összefoglalót továbbra is a fent beállított AI forrás írja."
                                )
                              : t(
                                  "Speaker recognition needs a Soniox API key. Meetings are recorded and transcribed the same way without it, through OpenAI or a Gemini connector, but the transcript does not say who spoke. Soniox costs about $0.12 per hour live and $0.10 per hour after you stop. Create a key at soniox.com.",
                                  "Rozlíšenie hovoriacich vyžaduje API kľúč Soniox. Bez neho sa stretnutia nahrávajú a prepisujú rovnako, cez OpenAI alebo konektor Gemini, ale v prepise nebude, kto hovoril. Soniox stojí približne 0,12 $ za hodinu naživo a 0,10 $ za hodinu po zastavení. Kľúč vytvoríte na soniox.com.",
                                  "A beszélők felismeréséhez Soniox API-kulcs kell. Nélküle a megbeszélések ugyanúgy rögzülnek és átíródnak, az OpenAI-on vagy egy Gemini csatlakozón keresztül, de az átirat nem jelzi, ki beszélt. A Soniox élőben kb. 0,12 $/óra, leállítás után 0,10 $/óra. Kulcsot a soniox.com oldalon hozhat létre."
                                )}
                          </p>
                        </div>
                        <label className="type-overline text-slate-500 block">
                          {t("Soniox API key", "API kľúč Soniox", "Soniox API-kulcs")}
                        </label>
                        <SecretInput
                          className="max-w-2xl"
                          language={userLanguage}
                          disabled={aiReadOnly}
                          value={sonioxApiKey}
                          onChange={setSonioxApiKey}
                          placeholder="snx_..."
                        />
                      </div>

                      {!vectorDbValidated && canConfigureVectorDb && (
                        <div className="space-y-4 pt-4 border-t border-slate-100 animate-slide-up">
                          <div className="space-y-2">
                            <label className="type-overline text-slate-500 block">
                              {t("Vector Database Backend", "Backend vektorovej databázy", "Vektoradatbázis backend")}
                            </label>
                            <CustomSelect
                              disabled={getPermission("ai_config") === "view"}
                              value={vectorDb}
                              onChange={(v) => {
                                setVectorDb(v as any);
                                setValidationResult(null);
                              }}
                              className="max-w-2xl"
                              options={[
                                { value: "none", label: t("Disabled", "Zakázané", "Letiltva") },
                                { value: "mariadb", label: t("MariaDB (Native SQL Vectors - Recommended)", "MariaDB (Natívne SQL vektory – Odporúčané)", "MariaDB (Natív SQL vektorok – Ajánlott)") },
                                // Indexing and semantic search run on MariaDB only (api/vector_index.php); the other two
                                // backends can only be pinged, so they are shown but cannot be chosen.
                                { value: "qdrant", disabled: true, label: t("Qdrant Sidecar Container (not supported yet)", "Qdrant Sidecar kontajner (zatiaľ nepodporované)", "Qdrant Sidecar konténer (még nem támogatott)") },
                                { value: "pinecone", disabled: true, label: t("Pinecone Cloud Service (not supported yet)", "Cloudová služba Pinecone (zatiaľ nepodporované)", "Pinecone felhőszolgáltatás (még nem támogatott)") },
                              ]}
                            />
                            {(vectorDb === "qdrant" || vectorDb === "pinecone") && (
                              <p className="text-ui font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-2xl">
                                {t(
                                  "This backend is saved from an earlier version but is not supported yet: the assistant cannot build or search a vector index on it and answers from keyword search only. Select MariaDB to use semantic search.",
                                  "Tento backend je uložený z predchádzajúcej verzie, ale zatiaľ nie je podporovaný: asistent v ňom nevie vytvoriť ani prehľadávať vektorový index a odpovedá len z vyhľadávania podľa kľúčových slov. Pre sémantické vyhľadávanie zvoľte MariaDB.",
                                  "Ez a háttér egy korábbi verzióból maradt mentve, de még nem támogatott: az asszisztens nem tud rajta vektorindexet építeni vagy abban keresni, ezért csak kulcsszavas keresésből válaszol. A szemantikus kereséshez válassza a MariaDB-t."
                                )}
                              </p>
                            )}
                          </div>
        
                          {vectorDb === "mariadb" && (
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4 max-w-2xl animate-fade-in">
                              <h4 className="text-ui font-bold text-slate-800 flex items-center gap-1.5">
                                <Database className="h-4 w-4 text-emerald-500" /> {t("MariaDB Vector Connection Settings", "Nastavenia pripojenia MariaDB Vector", "MariaDB vektorkapcsolat beállításai")}
                              </h4>
                              <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="type-overline text-slate-500 block">{t("Database Host", "Hostiteľ databázy", "Adatbázis-kiszolgáló")}</label>
                                  <input
                                    type="text"
                                    value={mariaDbHost}
                                    onChange={(e) => setMariaDbHost(e.target.value)}
                                    placeholder={t("e.g. localhost or vector_db", "napr. localhost alebo vector_db", "pl. localhost vagy vector_db")}
                                    className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="type-overline text-slate-500 block">{t("Port", "Port", "Port")}</label>
                                  <input
                                    type="text"
                                    value={mariaDbPort}
                                    onChange={(e) => setMariaDbPort(e.target.value)}
                                    placeholder={t("3306 or 3307", "3306 alebo 3307", "3306 vagy 3307")}
                                    className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="type-overline text-slate-500 block">{t("Username", "Používateľské meno", "Felhasználónév")}</label>
                                  <input
                                    type="text"
                                    value={mariaDbUser}
                                    onChange={(e) => setMariaDbUser(e.target.value)}
                                    placeholder={t("e.g. vector_user", "napr. vector_user", "pl. vector_user")}
                                    className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="type-overline text-slate-500 block">{t("Password", "Heslo", "Jelszó")}</label>
                                  <PasswordInput
                                    value={mariaDbPassword}
                                    onChange={(e) => setMariaDbPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-3.5 pr-10 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1 ws-md:col-span-2">
                                  <label className="type-overline text-slate-500 block">{t("Database Name", "Názov databázy", "Adatbázis neve")}</label>
                                  <input
                                    type="text"
                                    value={mariaDbName}
                                    onChange={(e) => setMariaDbName(e.target.value)}
                                    placeholder={t("e.g. vector_db", "napr. vector_db", "pl. vector_db")}
                                    className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
        
                          {vectorDb === "qdrant" && (
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4 max-w-2xl animate-fade-in">
                              <h4 className="text-ui font-bold text-slate-800 flex items-center gap-1.5">
                                <Sliders className="h-4 w-4 text-purple-500" /> {t("Qdrant Sidecar Settings", "Nastavenia Qdrant Sidecar", "Qdrant Sidecar beállítások")}
                              </h4>
                              <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-4">
                                <div className="space-y-1 ws-md:col-span-2">
                                  <label className="type-overline text-slate-500 block">{t("Server URL", "URL servera", "Szerver URL")}</label>
                                  <input
                                    type="text"
                                    value={qdrantUrl}
                                    onChange={(e) => setQdrantUrl(e.target.value)}
                                    placeholder={t("e.g. http://localhost:6333", "napr. http://localhost:6333", "pl. http://localhost:6333")}
                                    className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1 ws-md:col-span-2">
                                  <label className="type-overline text-slate-500 block">{t("API Key (Optional)", "API kľúč (Voliteľné)", "API kulcs (Opcionális)")}</label>
                                  <PasswordInput
                                    value={qdrantApiKey}
                                    onChange={(e) => setQdrantApiKey(e.target.value)}
                                    placeholder={t("Leave blank if unsecured", "Ponechajte prázdne, ak je nezabezpečené", "Hagyja üresen, ha nincs védve")}
                                    className="w-full pl-3.5 pr-10 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
        
                          {vectorDb === "pinecone" && (
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4 max-w-2xl animate-fade-in">
                              <h4 className="text-ui font-bold text-slate-800 flex items-center gap-1.5">
                                <Globe className="h-4 w-4 text-indigo-500" /> {t("Pinecone Cloud Settings", "Nastavenia Pinecone Cloud", "Pinecone felhő beállítások")}
                              </h4>
                              <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-4">
                                <div className="space-y-1 ws-md:col-span-2">
                                  <label className="type-overline text-slate-500 block">{t("API Key", "API kľúč", "API kulcs")}</label>
                                  <PasswordInput
                                    value={pineconeApiKey}
                                    onChange={(e) => setPineconeApiKey(e.target.value)}
                                    placeholder="pcsk_..."
                                    className="w-full pl-3.5 pr-10 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1 ws-md:col-span-2">
                                  <label className="type-overline text-slate-500 block">{t("Index Name", "Názov indexu", "Index neve")}</label>
                                  <input
                                    type="text"
                                    value={pineconeIndex}
                                    onChange={(e) => setPineconeIndex(e.target.value)}
                                    placeholder={t("e.g. company-kb", "napr. firemny-index", "pl. ceges-index")}
                                    className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-ui text-slate-700 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
        
                          {vectorDb !== "none" && (
                            <div className="pt-2 max-w-2xl flex flex-col gap-3">
                              <button
                                type="button"
                                disabled={isValidating}
                                onClick={handleValidateConnection}
                                className="w-fit px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-ui font-bold transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
                              >
                                {isValidating ? t("Validating Connection...", "Overuje sa pripojenie...", "Kapcsolat ellenőrzése...") : t("Test Vector DB Connection", "Otestovať pripojenie k vektorovej DB", "Vektoradatbázis-kapcsolat tesztelése")}
                              </button>
        
                              {validationResult && (
                                <div className={`p-4 rounded-xl border text-ui font-semibold leading-relaxed animate-fade-in ${
                                  validationResult.success
                                    ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                                    : "bg-rose-50 border-rose-100 text-rose-800"
                                }`}>
                                  <div className="flex items-start gap-2.5">
                                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${validationResult.success ? "bg-emerald-500" : "bg-rose-500"}`} />
                                    <div>
                                      <span className="font-bold block mb-0.5">
                                        {validationResult.success ? t("Validation Succeeded", "Overenie úspešné", "Az ellenőrzés sikeres") : t("Validation Failed", "Overenie zlyhalo", "Az ellenőrzés sikertelen")}
                                      </span>
                                      <p className="text-micro text-slate-500">{validationResult.message}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
        
                      
                    </SectionCard>
        
                    {vectorDbValidated && (
                      /* CONFIRMED CONNECTION CARD */
                      <SectionCard
                        title={t("Vector Database Connected", "Vektorová databáza pripojená", "Vektoradatbázis csatlakoztatva")}
                        description={t(
                                  "Your RAG pipeline backend is successfully configured and active.",
                                  "Backend vašej RAG pipeline je úspešne nakonfigurovaný a aktívny.",
                                  "A RAG folyamat háttérrendszere sikeresen be van állítva és aktív."
                                )}
                        action={getPermission("ai_config") === "edit" ? (
<button
                              type="button"
                              onClick={() => {
                                setVectorDbValidated(false);
                                setValidationResult(null);
                                if (updateIntegrationsConfig) {
                                  updateIntegrationsConfig((prev: any) => ({
                                    ...(prev || {}),
                                    vectorDbValidated: false
                                  }));
                                }
                              }}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-ui font-bold transition-all cursor-pointer active:scale-95"
                            >
                              {t("Reset Configuration", "Resetovať konfiguráciu", "Konfiguráció visszaállítása")}
                            </button>
                        ) : undefined}
                      >
                        {/* Active database info summary */}
                        <div className="text-ui font-semibold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <span className="type-overline text-slate-400 block mb-2">{t("Active Backend Details", "Aktívne detaily backendu", "Aktív backend részletei")}</span>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-micro text-slate-400 block">{t("DB Type:", "Typ DB:", "DB típus:")}</span>
                              <span className="font-mono text-ui text-indigo-600 font-bold">{vectorDb}</span>
                            </div>
                            {vectorDb === "mariadb" && (
                              <>
                                <div>
                                  <span className="text-micro text-slate-400 block">{t("Host:", "Hostiteľ:", "Kiszolgáló:")}</span>
                                  <span className="font-mono text-ui">{mariaDbHost}:{mariaDbPort}</span>
                                </div>
                                <div>
                                  <span className="text-micro text-slate-400 block">{t("Database Name:", "Názov databázy:", "Adatbázis neve:")}</span>
                                  <span className="font-mono text-ui">{mariaDbName}</span>
                                </div>
                              </>
                            )}
                            {vectorDb === "qdrant" && (
                              <div>
                                <span className="text-micro text-slate-400 block">Host:</span>
                                <span className="font-mono text-ui">{qdrantUrl}</span>
                              </div>
                            )}
                            {vectorDb === "pinecone" && (
                              <div>
                                <span className="text-micro text-slate-400 block">{t("Index Name:", "Názov indexu:", "Index neve:")}</span>
                                <span className="font-mono text-ui">{pineconeIndex}</span>
                              </div>
                            )}
                          </div>
                        </div>
        
                        {/* Training widget block */}
                        <div className="space-y-4 pt-4">
                          <h4 className="text-ui font-bold text-slate-800 flex items-center gap-1.5">
                            <Database className="h-4 w-4 text-purple-500 animate-pulse" /> {t("RAG Knowledge Index Ingestion", "Indexovanie znalostnej bázy RAG", "RAG tudásbázis indexelése")}
                          </h4>
        
                          {trainingStats ? (
                            <div className="grid grid-cols-2 ws-sm:grid-cols-4 gap-3">
                              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <span className="type-overline text-slate-400 block">{t("Leads Chunks", "Časti leadov", "Lead darabok")}</span>
                                <span className="text-title-sm font-extrabold text-slate-800">{trainingStats.leads}</span>
                              </div>
                              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <span className="type-overline text-slate-400 block">{t("Clients Chunks", "Časti klientov", "Ügyfél darabok")}</span>
                                <span className="text-title-sm font-extrabold text-slate-800">{trainingStats.clients}</span>
                              </div>
                              <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-100">
                                <span className="type-overline text-blue-900 block">{t("Products / Stock", "Skladový tovar", "Termékek / Készlet")}</span>
                                <span className="text-title-sm font-extrabold text-blue-950">{trainingStats.products || 0}</span>
                              </div>
                              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <span className="type-overline text-slate-400 block">{t("Emails Indexed", "Indexované e-maily", "Indexelt e-mailek")}</span>
                                <span className="text-title-sm font-extrabold text-slate-800">{trainingStats.emails}</span>
                              </div>
                              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <span className="type-overline text-slate-400 block">{t("Chats / Notes", "Chaty / Poznámky", "Csevegések / Jegyzetek")}</span>
                                <span className="text-title-sm font-extrabold text-slate-800">{trainingStats.chats}</span>
                              </div>
                              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <span className="type-overline text-slate-400 block">{t("Meeting Notes", "Zápisy zo stretnutí", "Megbeszélések")}</span>
                                <span className="text-title-sm font-extrabold text-slate-800">{trainingStats.meeting_notes || 0}</span>
                              </div>
                              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <span className="type-overline text-slate-400 block">{t("Unified Entries", "Univerzálne záznamy", "Egységes bejegyzések")}</span>
                                <span className="text-title-sm font-extrabold text-slate-800">{trainingStats.unified_entries || 0}</span>
                              </div>
                              <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100">
                                <span className="type-overline text-purple-700 block">{t("Total Items", "Celkovo entít", "Összes elem")}</span>
                                <span className="text-title-sm font-extrabold text-purple-900">{trainingStats.total_items || 0}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-12 flex items-center justify-center text-ui text-slate-400 font-semibold">
                              {t("Loading data statistics...", "Načítavajú sa štatistiky údajov...", "Adatstatisztikák betöltése...")}
                            </div>
                          )}
                          
                          {/* Progress bar */}
                          {isTraining && (
                            <div className="space-y-2 animate-pulse">
                              <div className="flex items-center justify-between type-overline text-indigo-600">
                                <span>{t("Ingestion in Progress...", "Prebieha indexovanie...", "Indexelés folyamatban...")}</span>
                                <span>{trainingProgress}%</span>
                              </div>
                              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-300" style={{ width: `${trainingProgress}%` }}></div>
                              </div>
                            </div>
                          )}
                          
                          {/* Action buttons */}
                          {getPermission("ai_config") === "edit" && !isTraining && (
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={handleStartTraining}
                                className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-ui font-bold shadow-lg shadow-purple-600/20 active:scale-95 transition-all cursor-pointer"
                              >
                                {t("Train Existing Data", "Trénovať existujúce dáta", "Meglévő adatok betanítása")}
                              </button>
                              <button
                                type="button"
                                onClick={fetchTrainingStats}
                                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-ui font-bold active:scale-95 transition-all cursor-pointer"
                              >
                                {t("Refresh Statistics", "Obnoviť štatistiky", "Statisztikák frissítése")}
                              </button>
                            </div>
                          )}
                          
                          {/* Logs widget */}
                          {trainingLogs.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="type-overline text-slate-400 block">{t("Indexation logs", "Záznamy indexovania", "Indexelési naplók")}</span>
                              <div className="bg-slate-950 text-slate-300 p-4 rounded-2xl font-mono text-micro leading-relaxed max-h-48 overflow-y-auto space-y-1 scrollbar-thin border border-slate-900 shadow-inner">
                                {trainingLogs.map((log, idx) => (
                                  <div key={idx} className={log.includes("[ERROR]") ? "text-rose-400 font-bold" : log.includes("[SUCCESS]") ? "text-emerald-400 font-bold" : ""}>
                                    {log}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
        
                          {/* Autonomous Agents Cron Link */}
                          <div className="pt-4 border-t border-slate-100 space-y-3">
                            <h4 className="text-ui font-bold text-slate-800 flex items-center gap-1.5">
                              <Clock className="h-4 w-4 text-indigo-500 animate-pulse" /> {t("Autonomous Agents Cron Link", "Cron odkaz pre autonómne agenty", "Autonóm ügynökök Cron hivatkozása")}
                            </h4>
                            <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-100/50 text-ui font-semibold leading-relaxed text-slate-700 space-y-2.5">
                              <p className="text-caption text-slate-500">
                                {t("To run autonomous agents automatically, configure your server cron manager (e.g. crontab or a webhook runner) to trigger the endpoint URL below:", "Ak chcete autonómne agenty spúšťať automaticky, nastavte cron manažér na serveri (napr. crontab alebo webhook runner), aby spúšťal nižšie uvedenú URL adresu endpointu:", "Az autonóm ügynökök automatikus futtatásához állítsa be a szerver cron-kezelőjét (pl. crontab vagy webhook futtató), hogy meghívja az alábbi végpont URL-t:")}
                              </p>
                              <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm font-mono text-micro break-all select-all text-slate-800">
                                <span>{window.location.origin}/api/cron_agents.php</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </SectionCard>
                    )}
                  </div>
        );
};
