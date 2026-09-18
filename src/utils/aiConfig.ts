import type { Language } from "./translations";

/**
 * Shared client-side view of the AI configuration.
 *
 * Two things live here because both were previously re-implemented (or simply
 * missing) in every view that talks to an AI endpoint:
 *
 *  1. The secret mask. The sync GET never sends real secrets to the browser — it
 *     substitutes CCRM_SECRET_MASK (api/auth.php). So "the key is configured"
 *     client-side means "the field came back as the mask", and a settings form
 *     that renders the mask as if it were the key shows the user eight asterisks
 *     behind a password dot mask, which reads like a corrupted value.
 *  2. The error vocabulary. The AI endpoints answer failures with a stable
 *     `code`; without a translation for it the UI could only show one generic
 *     "generation failed" toast for causes as different as "no API key" and
 *     "this company publishes no statements in the registry".
 */

/** Mirror of CCRM_SECRET_MASK in api/auth.php — never a real secret value. */
export const SECRET_MASK = "********";

/** True when a field holds the server's placeholder rather than a real secret. */
export const isSecretMask = (value: unknown): boolean => value === SECRET_MASK;

/**
 * Whether an OpenAI key is stored server-side. The browser only ever sees the
 * mask, so a non-empty value is the strongest signal available here — it cannot
 * tell a valid key from a revoked one (that only surfaces as `ai_key_invalid`
 * when an endpoint actually calls OpenAI).
 */
export const hasOpenAiKey = (integrationsConfig: any): boolean => {
  const key = integrationsConfig?.openAiKey;
  return typeof key === "string" && key.trim() !== "";
};

export interface AiApiError {
  /** Stable identifier emitted by the endpoint, or a synthetic client-side one. */
  code: string;
  /** Raw English message from the server, kept for the console / provider text. */
  message: string;
  /** Verbatim provider text on `ai_error` & friends, when the endpoint sent it. */
  providerMessage?: string;
  /** HTTP status, 0 when the request never completed. */
  status: number;
}

/**
 * Turn any endpoint response into an AiApiError. Safe on non-JSON bodies (a PHP
 * fatal renders HTML) and on a `success: false` body that arrived with 200.
 */
export const readAiApiError = async (res: Response): Promise<AiApiError> => {
  let body: any = null;
  try {
    body = await res.json();
  } catch (e) {
    // Non-JSON body — a PHP fatal or an HTML error page from the web server.
  }
  return {
    code: typeof body?.code === "string" && body.code !== "" ? body.code : "unknown",
    message: typeof body?.message === "string" ? body.message : `HTTP ${res.status}`,
    providerMessage: typeof body?.providerMessage === "string" ? body.providerMessage : undefined,
    status: res.status,
  };
};

/** Client-side counterpart for a request that never reached the server. */
export const networkAiApiError = (e: any): AiApiError => ({
  code: e?.name === "AbortError" ? "timeout" : "network",
  message: String(e?.message || e || "Request failed"),
  status: 0,
});

const pick = (lang: Language, en: string, sk: string, hu: string): string =>
  lang === "sk" ? sk : lang === "hu" ? hu : en;

/**
 * Human-readable, localised explanation of an AI endpoint failure. Unknown codes
 * fall back to a generic sentence rather than leaking the English server text,
 * except where that text is the actual answer (the provider's own message).
 */
export const translateAiApiError = (error: AiApiError, lang: Language): string => {
  switch (error.code) {
    case "ai_key_missing":
      return pick(
        lang,
        "The OpenAI API key is not configured. Add it in Settings → AI integration.",
        "OpenAI API kľúč nie je nastavený. Doplňte ho v Nastaveniach → AI integrácia.",
        "Az OpenAI API kulcs nincs beállítva. Adja meg a Beállítások → AI integráció alatt."
      );
    case "ai_key_invalid":
      return pick(
        lang,
        "OpenAI rejected the stored API key. Check it in Settings → AI integration.",
        "OpenAI odmietol uložený API kľúč. Skontrolujte ho v Nastaveniach → AI integrácia.",
        "Az OpenAI elutasította a tárolt API kulcsot. Ellenőrizze a Beállítások → AI integráció alatt."
      );
    case "ai_rate_limited":
      return pick(
        lang,
        "OpenAI rate limit or quota reached. Try again in a moment.",
        "Dosiahnutý limit alebo kredit OpenAI. Skúste to o chvíľu znova.",
        "Elérte az OpenAI korlátját vagy keretét. Próbálja újra később."
      );
    case "ai_error":
      return pick(
        lang,
        "OpenAI could not process the request",
        "OpenAI nedokázal spracovať požiadavku",
        "Az OpenAI nem tudta feldolgozni a kérést"
      ) + (error.providerMessage ? `: ${error.providerMessage}` : ".");
    case "ai_empty":
      return pick(
        lang,
        "OpenAI returned an empty answer. Try generating it again.",
        "OpenAI vrátil prázdnu odpoveď. Skúste generovanie zopakovať.",
        "Az OpenAI üres választ adott. Próbálja meg újra."
      );
    case "company_not_found":
      return pick(
        lang,
        "This company ID (IČO) was not found in the RegisterÚZ registry.",
        "Toto IČO sa v registri RegisterÚZ nenašlo.",
        "Ez a cégazonosító (IČO) nem található a RegisterÚZ nyilvántartásban."
      );
    case "registry_unavailable":
      return pick(
        lang,
        "The RegisterÚZ registry is not responding. Try again later.",
        "RegisterÚZ neodpovedá. Skúste to neskôr.",
        "A RegisterÚZ nyilvántartás nem válaszol. Próbálja később."
      );
    case "no_statements":
      return pick(
        lang,
        "This company has no financial statements published in the RegisterÚZ registry, so there is nothing to analyse.",
        "Táto spoločnosť nemá v registri RegisterÚZ zverejnené žiadne účtovné závierky, nie je teda čo analyzovať.",
        "Ennek a cégnek nincsenek közzétett pénzügyi beszámolói a RegisterÚZ nyilvántartásban, így nincs mit elemezni."
      );
    case "no_financial_data":
      return pick(
        lang,
        "The published statements contain no usable financial figures.",
        "Zverejnené závierky neobsahujú žiadne použiteľné finančné údaje.",
        "A közzétett beszámolók nem tartalmaznak használható pénzügyi adatokat."
      );
    case "missing_company_id":
      return pick(
        lang,
        "The client has no company ID (IČO) filled in.",
        "Klient nemá vyplnené IČO.",
        "Az ügyfélnek nincs kitöltve a cégazonosítója (IČO)."
      );
    case "missing_statement_id":
      return pick(
        lang,
        "The financial statement to analyse was not identified.",
        "Nepodarilo sa určiť, ktorá závierka sa má analyzovať.",
        "Nem sikerült azonosítani az elemzendő beszámolót."
      );
    case "not_installed":
      return pick(
        lang,
        "The CRM is not installed yet.",
        "CRM ešte nie je nainštalovaný.",
        "A CRM még nincs telepítve."
      );
    case "db_error":
      return pick(
        lang,
        "The database is not reachable right now.",
        "Databáza je momentálne nedostupná.",
        "Az adatbázis jelenleg nem érhető el."
      );
    case "timeout":
      return pick(
        lang,
        "The request took too long and was cancelled. Try again.",
        "Požiadavka trvala príliš dlho a bola zrušená. Skúste to znova.",
        "A kérés túl sokáig tartott és megszakadt. Próbálja újra."
      );
    case "network":
      return pick(
        lang,
        "The server could not be reached. Check your connection.",
        "Server je nedostupný. Skontrolujte pripojenie.",
        "A kiszolgáló nem érhető el. Ellenőrizze a kapcsolatot."
      );
    default:
      return pick(
        lang,
        "The request could not be completed.",
        "Požiadavku sa nepodarilo dokončiť.",
        "A kérést nem sikerült teljesíteni."
      );
  }
};

/** Codes the user fixes in Settings → AI integration. */
export const isAiKeyProblem = (code: string): boolean =>
  code === "ai_key_missing" || code === "ai_key_invalid";

/** Send the user straight to the field they need to fill in. */
export const openAiSettings = (): void => {
  window.location.hash = "settings/ai";
};
