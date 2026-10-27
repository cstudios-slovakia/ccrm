/**
 * Chat models the CRM offers, and the older ids already stored on live installs.
 *
 * Prices are OpenAI's short-context input / output per 1M tokens (Oct 2026).
 * A replacement is used only when it is the same tier and costs the same or less:
 *   gpt-5.6-luna  $0.20 / $1.20  → gpt-6-luna     $0.10 / $0.50
 *   gpt-4o-mini   $0.15 / $0.60  → gpt-6-luna
 *   gpt-5.6-terra $2.00 / $12.00 → gpt-6.1-terra  $1.00 / $5.00
 *   gpt-4o        $2.50 / $10.00 → gpt-6.1-terra
 *   gpt-5.6-sol   $4.00 / $20.00 → gpt-6.1-sol    $2.00 / $10.00
 *
 * The PHP copy of this map is ccrm_ai_model_upgrades() in public/api/auth.php.
 * A schema migration rewrites rows that still hold the old ids.
 */

export const AI_MODEL_LUNA = "gpt-6-luna";
export const AI_MODEL_TERRA = "gpt-6.1-terra";
export const AI_MODEL_SOL = "gpt-6.1-sol";

/** Dashboard slider, cheap → capable. The middle one is the default. */
export const AI_DASHBOARD_MODELS = [AI_MODEL_LUNA, AI_MODEL_TERRA, AI_MODEL_SOL] as const;

/** Input price in USD per 1M tokens, used by the SAI cost estimate. */
export const AI_MODEL_INPUT_USD_PER_M: Record<string, number> = {
  [AI_MODEL_LUNA]: 0.1,
  [AI_MODEL_TERRA]: 1,
  [AI_MODEL_SOL]: 2,
};

/**
 * List price for one model. Token rates are USD per 1M tokens. A transcription
 * model billed by the minute sets `usdPerMinute` and leaves the token rates at 0.
 * Cached input is the provider's cache-read rate. Audio rates are the realtime
 * speech tokens, which are not the same as text tokens.
 */
export interface AiModelPrice {
  inputPerM: number;
  outputPerM: number;
  cachedInputPerM?: number;
  audioInputPerM?: number;
  audioOutputPerM?: number;
  usdPerMinute?: number;
}

const token = (
  inputPerM: number,
  outputPerM: number,
  extra: Partial<AiModelPrice> = {},
): AiModelPrice => ({ inputPerM, outputPerM, ...extra });

/**
 * Standard list prices (Oct 2026). Short context, not batch or flex.
 * Gemini 3.8 Flash is introductory through December 2026.
 * A snapshot id (`gpt-6-luna-2026-05-18`) uses the longest known prefix.
 */
const AI_MODEL_PRICE_TABLE: Record<string, AiModelPrice> = {
  [AI_MODEL_LUNA]: token(0.1, 0.5, { cachedInputPerM: 0.01 }),
  [AI_MODEL_TERRA]: token(1, 5, { cachedInputPerM: 0.05 }),
  [AI_MODEL_SOL]: token(2, 10, { cachedInputPerM: 0.1 }),
  "gpt-5.6-luna": token(0.2, 1.2, { cachedInputPerM: 0.02 }),
  "gpt-5.6-terra": token(2, 12, { cachedInputPerM: 0.2 }),
  "gpt-5.6-sol": token(4, 20, { cachedInputPerM: 0.4 }),
  "gpt-4o-mini": token(0.15, 0.6, { cachedInputPerM: 0.075 }),
  "gpt-4o": token(2.5, 10, { cachedInputPerM: 1.25 }),
  "claude-sonnet-5-5": token(2, 10, { cachedInputPerM: 0.1 }),
  "claude-3-5-sonnet-20241022": token(3, 15, { cachedInputPerM: 0.3 }),
  "text-embedding-3-small": token(0.02, 0),
  "text-embedding-3-large": token(0.13, 0),
  "gpt-realtime-2.1": token(4, 24, { cachedInputPerM: 0.4, audioInputPerM: 32, audioOutputPerM: 64 }),
  "gpt-realtime-1.5": token(4, 16, { cachedInputPerM: 0.4, audioInputPerM: 32, audioOutputPerM: 64 }),
  "gpt-transcribe": token(0, 0, { usdPerMinute: 0.0045 }),
  "whisper-1": token(0, 0, { usdPerMinute: 0.006 }),
  "gpt-live-transcribe": token(0, 0, { usdPerMinute: 0.017 }),
};

const GEMINI_38_INTRO_UNTIL = "2027-01";

const priceKeysLongestFirst = Object.keys(AI_MODEL_PRICE_TABLE).sort((a, b) => b.length - a.length);

/** The list price for `model` in `month` (`YYYY-MM`). Null when this app has no rate for it. */
export const aiModelPrice = (model: string, month: string): AiModelPrice | null => {
  const id = model.trim();
  if (id === "gemini-3.8-flash" || id.startsWith("gemini-3.8-flash-")) {
    const intro = month < GEMINI_38_INTRO_UNTIL;
    return token(intro ? 0.75 : 1.5, intro ? 3.75 : 7.5, { cachedInputPerM: intro ? 0.075 : 0.15 });
  }
  if (AI_MODEL_PRICE_TABLE[id]) return AI_MODEL_PRICE_TABLE[id];
  for (const key of priceKeysLongestFirst) {
    if (id.startsWith(key + "-") || id.startsWith(key + ".")) return AI_MODEL_PRICE_TABLE[key];
  }
  return null;
};

const LEGACY_MODELS: Record<string, string> = {
  "gpt-5.6-luna": AI_MODEL_LUNA,
  "gpt-4o-mini": AI_MODEL_LUNA,
  "gpt-5.6-terra": AI_MODEL_TERRA,
  "gpt-4o": AI_MODEL_TERRA,
  "gpt-5.6-sol": AI_MODEL_SOL,
};

/** Map a stored model id onto the current one. Unknown ids pass through. */
export const upgradeAiModel = (model: string | null | undefined, fallback: string): string => {
  if (typeof model !== "string" || model.trim() === "") return fallback;
  const trimmed = model.trim();
  return LEGACY_MODELS[trimmed] ?? trimmed;
};

/** SAI offers Luna and Terra. A stored Sol (never in that dropdown) lands on Terra. */
export const upgradeSwarmModel = (model: string | null | undefined): string => {
  const next = upgradeAiModel(model, AI_MODEL_LUNA);
  if (next === AI_MODEL_SOL) return AI_MODEL_TERRA;
  return next === AI_MODEL_LUNA || next === AI_MODEL_TERRA ? next : AI_MODEL_LUNA;
};
