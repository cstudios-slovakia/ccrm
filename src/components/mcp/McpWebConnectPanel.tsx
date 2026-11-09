import React, { useId, useState } from "react";
import { Key, ShieldAlert, Sparkles } from "lucide-react";
import type { Language } from "../../utils/translations";
import { mcpBearerHeader, mcpKeyHeader, mcpServerUrl } from "../../utils/mcpConnect";
import { buildSetupPrompt } from "../../utils/mcpSetupPrompt";
import { PRODUCT_NAME, resolveTitleWithProduct, useSystemTitle } from "../../utils/brand";
import { CopyField, Disclosure, type T } from "./mcpUi";

/**
 * The "Web app / connector" tab of Settings → AI Assistant (MCP), in two ways:
 *  - "Setup prompt" (the default): one message, key included, that an AI app follows to
 *    connect itself (see `buildSetupPrompt` for what it can and cannot do).
 *  - "Manual setup": the Server URL and header fields to type into a connector form.
 */

const MODES = ["prompt", "manual"] as const;
type Mode = (typeof MODES)[number];

export interface McpWebConnectPanelProps {
  t: T;
  activeLang: Language;
  origin: string;
  userName: string;
  /** The full key, only present right after generating it. */
  newKey: string | null;
  /** The server holds an active key (generating a new one replaces it). */
  hasSavedKey: boolean;
  isGenerating: boolean;
  /** Generates a key; the parent asks for confirmation first when one already exists. */
  onGenerate: () => void;
}

export const McpWebConnectPanel: React.FC<McpWebConnectPanelProps> = ({
  t,
  activeLang,
  origin,
  userName,
  newKey,
  hasSavedKey,
  isGenerating,
  onGenerate,
}) => {
  const brand = PRODUCT_NAME;
  const titleWithProduct = resolveTitleWithProduct(useSystemTitle());
  const [mode, setMode] = useState<Mode>("prompt");
  const modesId = useId();

  const hasToken = !!newKey;
  const serverUrl = mcpServerUrl(origin);
  const keyHeader = mcpKeyHeader(newKey);
  const bearerHeader = mcpBearerHeader(newKey);
  const needGenerate = t(
    "Generate a new key to copy it here",
    "Vygenerujte nový kľúč, aby ste ho mohli skopírovať tu",
    "Hozzon létre új kulcsot, hogy itt kimásolhassa"
  );

  const setupPrompt = buildSetupPrompt({ origin, key: newKey, titleWithProduct, userName, language: activeLang });

  const modeLabels: Record<Mode, string> = {
    prompt: t("Setup prompt", "Prompt na nastavenie", "Beállító prompt"),
    manual: t("Manual setup", "Ručné nastavenie", "Kézi beállítás"),
  };

  const onModeKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const at = MODES.indexOf(mode);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? MODES.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + MODES.length) % MODES.length;
    setMode(MODES[next]);
    document.getElementById(`${modesId}-mode-${MODES[next]}`)?.focus();
  };

  return (
    <div className="space-y-3 min-w-0">
      <div
        role="tablist"
        aria-label={t("Setup method", "Spôsob nastavenia", "Beállítás módja")}
        className="inline-flex max-w-full items-center gap-1 rounded-xl border border-slate-200 p-0.5 overflow-x-auto"
      >
        {MODES.map((id) => (
          <button
            key={id}
            id={`${modesId}-mode-${id}`}
            type="button"
            role="tab"
            aria-selected={mode === id}
            aria-controls={`${modesId}-mode-panel`}
            tabIndex={mode === id ? 0 : -1}
            onClick={() => setMode(id)}
            onKeyDown={onModeKeyDown}
            className={`flex items-center gap-1.5 px-3 py-1 text-caption font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              mode === id ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            {id === "prompt" && <Sparkles className="h-3.5 w-3.5" />}
            {modeLabels[id]}
          </button>
        ))}
      </div>

      <div id={`${modesId}-mode-panel`} role="tabpanel" aria-labelledby={`${modesId}-mode-${mode}`} className="space-y-3 min-w-0">
        {mode === "prompt" && (
          <div className="space-y-3" data-testid="mcp-setup-prompt-panel">
            <p className="text-ui text-slate-600 font-medium">
              {t(
                "Copy the prompt and send it as a message in your AI app. It holds everything the app needs, your key included.",
                "Skopírujte prompt a pošlite ho ako správu vo svojej AI aplikácii. Obsahuje všetko, čo aplikácia potrebuje, vrátane vášho kľúča.",
                "Másolja ki a promptot, és küldje el üzenetként az MI alkalmazásban. Mindent tartalmaz, amire az alkalmazásnak szüksége van, a kulcsát is."
              )}
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-caption text-slate-600 font-medium marker:text-emerald-600">
              <li>
                {t(
                  "Apps that can run commands or edit files (Claude Code, Codex, Gemini CLI, Cursor, VS Code, Windsurf) add the connection themselves and test it.",
                  "Aplikácie, ktoré vedia spúšťať príkazy alebo upravovať súbory (Claude Code, Codex, Gemini CLI, Cursor, VS Code, Windsurf), pridajú pripojenie samy a otestujú ho.",
                  "A parancsokat futtatni vagy fájlokat szerkeszteni tudó alkalmazások (Claude Code, Codex, Gemini CLI, Cursor, VS Code, Windsurf) maguk adják hozzá és tesztelik a kapcsolatot."
                )}
              </li>
              <li>
                {t(
                  "Chat apps (claude.ai, ChatGPT and similar) cannot change their own settings. They say so and guide you through the few clicks, with your values already filled in.",
                  "Chatovacie aplikácie (claude.ai, ChatGPT a podobné) nevedia meniť vlastné nastavenia. Povedia vám to a prevedú vás niekoľkými kliknutiami s už vyplnenými hodnotami.",
                  "A csevegőalkalmazások (claude.ai, ChatGPT és hasonlók) nem tudják módosítani a saját beállításaikat. Ezt jelzik, és végigvezetik a néhány kattintáson, az értékeket már kitöltve."
                )}
              </li>
            </ul>

            <div
              data-testid="mcp-setup-prompt-warning"
              className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950"
            >
              <ShieldAlert className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-caption font-medium space-y-1">
                <p className="text-ui font-extrabold">
                  {t("The prompt contains your access key", "Prompt obsahuje váš prístupový kľúč", "A prompt tartalmazza a hozzáférési kulcsát")}
                </p>
                <p>
                  {t(
                    "Send it only to an AI app you trust, in a private conversation. The key stays in that conversation's history: delete it once the connection works. If the conversation was ever shared, generate a new key — the old one stops working at once.",
                    "Pošlite ho iba AI aplikácii, ktorej dôverujete, v súkromnej konverzácii. Kľúč zostane v histórii tejto konverzácie: keď pripojenie funguje, konverzáciu vymažte. Ak ste ju niekedy zdieľali, vygenerujte nový kľúč – ten starý okamžite prestane fungovať.",
                    "Csak megbízható MI alkalmazásnak küldje el, privát beszélgetésben. A kulcs a beszélgetés előzményeiben marad: ha a kapcsolat működik, törölje a beszélgetést. Ha valaha megosztotta, hozzon létre új kulcsot – a régi azonnal megszűnik működni."
                  )}
                </p>
              </div>
            </div>

            {!hasToken && (
              <div className="flex flex-col items-start gap-2.5 p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/60">
                <p className="text-caption text-slate-600 font-medium">
                  {hasSavedKey
                    ? t(
                        "The full key is shown only once, so it cannot be filled in now. Generate a new one to fill it in; AI apps that use the current key will need the new one.",
                        "Celý kľúč sa zobrazí iba raz, preto ho teraz nemožno doplniť. Vygenerujte nový; AI aplikácie, ktoré používajú aktuálny kľúč, budú potrebovať nový.",
                        "A teljes kulcs csak egyszer jelenik meg, ezért most nem tölthető ki. Hozzon létre újat; a jelenlegi kulcsot használó MI alkalmazásoknak az újra lesz szükségük."
                      )
                    : t(
                        "Generate your access key to fill it into the prompt.",
                        "Vygenerujte si prístupový kľúč, aby sa doplnil do promptu.",
                        "Hozza létre a hozzáférési kulcsát, hogy bekerüljön a promptba."
                      )}
                </p>
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={isGenerating}
                  data-testid="mcp-setup-prompt-generate"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-ui font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Key className="h-3.5 w-3.5" />
                  <span>
                    {hasSavedKey
                      ? t("Generate a new key and fill it in", "Vygenerovať nový kľúč a doplniť ho", "Új kulcs létrehozása és kitöltése")
                      : t("Generate a key and fill it in", "Vygenerovať kľúč a doplniť ho", "Kulcs létrehozása és kitöltése")}
                  </span>
                </button>
              </div>
            )}

            <CopyField
              testId="mcp-field-setup-prompt"
              t={t}
              monospace={false}
              label={t("Setup prompt", "Prompt na nastavenie", "Beállító prompt")}
              value={setupPrompt}
              longText
              // A prompt with `<your key>` would make an agent write the placeholder into its config.
              disabled={!hasToken}
              disabledReason={t(
                "Generate a key first, so the prompt carries it.",
                "Najprv vygenerujte kľúč, aby ho prompt obsahoval.",
                "Először hozzon létre kulcsot, hogy a prompt tartalmazza."
              )}
            />
            <p className="text-caption text-slate-500 font-medium">
              {t(
                "Once it is connected, press Refresh at the top: the key's “Last used” time shows its first request. Prefer to type the values yourself? Use Manual setup.",
                "Keď je pripojenie hotové, stlačte hore Obnoviť: pri kľúči sa zobrazí čas „Naposledy použitý“. Chcete hodnoty zadať sami? Použite Ručné nastavenie.",
                "Ha a kapcsolat létrejött, nyomja meg fent a Frissítés gombot: a kulcsnál megjelenik az „Utoljára használva” idő. Inkább saját maga írná be az értékeket? Használja a Kézi beállítást."
              )}
            </p>
          </div>
        )}

        {mode === "manual" && (
          <>
            <p className="text-ui text-slate-600 font-medium">
              {t(
                "claude.ai, ChatGPT, Le Chat and other AI apps that let you add a custom MCP server or connector.",
                "claude.ai, ChatGPT, Le Chat a ďalšie AI aplikácie, ktoré umožňujú pridať vlastný MCP server alebo konektor.",
                "claude.ai, ChatGPT, Le Chat és más MI alkalmazások, amelyek engedik egyéni MCP szerver vagy összekötő hozzáadását."
              )}
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-ui text-slate-700 font-medium marker:font-bold marker:text-emerald-600">
              <li>
                {t(
                  "In your AI app, open the settings and look for Connectors, Integrations, Tools or MCP servers.",
                  "V AI aplikácii otvorte nastavenia a nájdite Konektory, Integrácie, Nástroje alebo MCP servery.",
                  "Az MI alkalmazásban nyissa meg a beállításokat, és keresse az Összekötők, Integrációk, Eszközök vagy MCP szerverek menüpontot."
                )}
              </li>
              <li>
                {t(
                  "Choose Add custom connector or Add MCP server and paste the Server URL.",
                  "Zvoľte Pridať vlastný konektor alebo Pridať MCP server a vložte URL servera.",
                  "Válassza az Egyéni összekötő hozzáadása vagy az MCP szerver hozzáadása lehetőséget, és illessze be a Szerver URL-t."
                )}
              </li>
              <li>
                {t(
                  "If the app asks how to sign in, choose API key or Custom header, then paste the Header name and the Header value.",
                  "Ak sa aplikácia opýta na prihlásenie, zvoľte API kľúč alebo Vlastná hlavička a vložte Názov hlavičky a Hodnotu hlavičky.",
                  "Ha az alkalmazás rákérdez a bejelentkezésre, válassza az API-kulcs vagy az Egyéni fejléc lehetőséget, majd illessze be a Fejléc nevét és a Fejléc értékét."
                )}
              </li>
              <li>
                {t(
                  `Save, then test it: ask the assistant “List my open tasks in ${brand}”.`,
                  `Uložte a vyskúšajte: opýtajte sa asistenta „Zobraz moje otvorené úlohy v ${brand}“.`,
                  `Mentse, majd próbálja ki: kérdezze meg az asszisztenst: „Listázd a nyitott feladataimat a ${brand}-ben”.`
                )}
              </li>
            </ol>
            <CopyField testId="mcp-field-url" t={t} label={t("Server URL", "URL servera", "Szerver URL")} value={serverUrl} />
            <CopyField testId="mcp-field-header-name" t={t} label={t("Header name", "Názov hlavičky", "Fejléc neve")} value={keyHeader.name} />
            <CopyField
              testId="mcp-field-header-value"
              t={t}
              label={t("Header value", "Hodnota hlavičky", "Fejléc értéke")}
              value={keyHeader.value}
              hint={t("Just the key – no “Bearer” in front.", "Iba kľúč – bez „Bearer“ pred ním.", "Csak a kulcs – elé nem kell a „Bearer”.")}
              disabled={!hasToken}
              disabledReason={needGenerate}
            />
            <Disclosure summary={t("My app only accepts a Bearer token", "Moja aplikácia prijíma iba Bearer token", "Az alkalmazásom csak Bearer tokent fogad")}>
              <p className="text-caption text-slate-600 font-medium">
                {t(
                  "If your app has a single “Bearer token” or “API key” field, paste only the key there – the app adds “Bearer ” itself. If you can set the header yourself, use:",
                  "Ak má vaša aplikácia jediné pole „Bearer token“ alebo „API kľúč“, vložte tam iba kľúč – „Bearer “ pridá aplikácia sama. Ak si hlavičku nastavujete sami, použite:",
                  "Ha az alkalmazásban egyetlen „Bearer token” vagy „API-kulcs” mező van, csak a kulcsot illessze be – a „Bearer ” előtagot az alkalmazás maga adja hozzá. Ha a fejlécet Ön állíthatja be, használja ezt:"
                )}
              </p>
              <CopyField
                testId="mcp-field-bearer-name"
                t={t}
                label={t("Header name", "Názov hlavičky", "Fejléc neve") + " (Bearer)"}
                value={bearerHeader.name}
              />
              <CopyField
                testId="mcp-field-bearer-value"
                t={t}
                label={t("Header value", "Hodnota hlavičky", "Fejléc értéke") + " (Bearer)"}
                value={bearerHeader.value}
                disabled={!hasToken}
                disabledReason={needGenerate}
              />
            </Disclosure>
            <p className="text-caption text-slate-500 font-medium">
              {t(
                "Apps that only offer sign-in (OAuth) and no custom header or API key cannot connect with a key yet.",
                "Aplikácie, ktoré ponúkajú iba prihlásenie (OAuth) a nemajú vlastnú hlavičku ani API kľúč, sa zatiaľ nedajú pripojiť kľúčom.",
                "Az olyan alkalmazások, amelyek csak bejelentkezést (OAuth) kínálnak, egyéni fejléc vagy API-kulcs nélkül, egyelőre nem csatlakoztathatók kulccsal."
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
