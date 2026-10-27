import type { Language } from "./translations";
import { aiModelPrice } from "./aiModels.ts";

/** Counts stored for one feature on one model. Input tokens are uncached text. */
export interface AiUsageAmounts {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  audioSeconds: number;
}

export interface AiUsageRow extends AiUsageAmounts {
  feature: string;
  model: string;
  calls: number;
}

const FEATURES: Record<string, { en: string; sk: string; hu: string }> = {
  executive_assistant: { en: "Executive assistant", sk: "Výkonný asistent", hu: "Vezetői asszisztens" },
  executive_council: { en: "Executive council", sk: "Výkonná rada", hu: "Vezetői tanács" },
  executive_agent: { en: "Scheduled executive agent", sk: "Naplánovaný výkonný agent", hu: "Ütemezett vezetői ügynök" },
  email_summary: { en: "Email summary", sk: "Súhrn e-mailu", hu: "E-mail összefoglaló" },
  meeting_summary: { en: "Meeting summary", sk: "Súhrn stretnutia", hu: "Találkozó összefoglaló" },
  meeting_transcription: { en: "Meeting transcription", sk: "Prepis stretnutia", hu: "Találkozó átirata" },
  meeting_minutes: { en: "Meeting minutes", sk: "Zápisnica zo stretnutia", hu: "Találkozó jegyzőkönyve" },
  voice_note: { en: "Voice note", sk: "Hlasová poznámka", hu: "Hangjegyzet" },
  task_transcription: { en: "Voice task transcription", sk: "Prepis hlasovej úlohy", hu: "Hangfeladat átirata" },
  task_extraction: { en: "Voice task extraction", sk: "Rozpoznanie hlasovej úlohy", hu: "Hangfeladat kinyerése" },
  client_summary: { en: "Client and lead summary", sk: "Súhrn klienta a leadu", hu: "Ügyfél- és leadösszefoglaló" },
  financial_summary: { en: "Financial summary", sk: "Finančný súhrn", hu: "Pénzügyi összefoglaló" },
  dashboard_layout: { en: "Dashboard layout", sk: "Rozloženie nástenky", hu: "Irányítópult elrendezése" },
  dashboard_translate: { en: "Dashboard translation", sk: "Preklad nástenky", hu: "Irányítópult fordítása" },
  report: { en: "Report", sk: "Report", hu: "Jelentés" },
  offer_template: { en: "Offer template", sk: "Šablóna ponuky", hu: "Ajánlatsablon" },
  ticket_routing: { en: "Ticket routing", sk: "Smerovanie tiketu", hu: "Jegyirányítás" },
  rag_embeddings: { en: "Semantic search embeddings", sk: "Vektory sémantického vyhľadávania", hu: "Szemantikus keresés beágyazásai" },
  sai_swarm: { en: "SAI rehearsal", sk: "SAI skúška", hu: "SAI próba" },
  workflow: { en: "Workflow agent", sk: "Agent workflowu", hu: "Munkafolyamat-ügynök" },
  voice_call: { en: "Live voice call", sk: "Živý hlasový hovor", hu: "Élő hanghívás" },
  live_transcription: { en: "Live transcription", sk: "Živý prepis", hu: "Élő átirat" },
};

export const aiFeatureLabel = (feature: string, lang: Language): string => {
  const row = FEATURES[feature];
  if (!row) return feature;
  return lang === "sk" ? row.sk : lang === "hu" ? row.hu : row.en;
};

const MODEL_NAMES: Record<string, string> = {
  "gpt-6-luna": "GPT-6 Luna",
  "gpt-6.1-terra": "GPT-6.1 Terra",
  "gpt-6.1-sol": "GPT-6.1 Sol",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-4o-mini": "GPT-4o mini",
  "gpt-4o": "GPT-4o",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "text-embedding-3-small": "Embedding 3 Small",
  "text-embedding-3-large": "Embedding 3 Large",
  "gpt-realtime-2.1": "GPT Realtime 2.1",
  "gpt-realtime-1.5": "GPT Realtime 1.5",
  "gpt-transcribe": "GPT Transcribe",
  "whisper-1": "Whisper",
  "gpt-live-transcribe": "GPT Live Transcribe",
};

const modelNameKeys = Object.keys(MODEL_NAMES).sort((a, b) => b.length - a.length);

export const aiModelLabel = (model: string): string => {
  if (MODEL_NAMES[model]) return MODEL_NAMES[model];
  for (const key of modelNameKeys) {
    if (model.startsWith(key + "-") || model.startsWith(key + ".")) return MODEL_NAMES[key];
  }
  return model;
};

/**
 * USD for one row in `month` (`YYYY-MM`), from the list price of its model.
 * Null when the model has no rate here — those rows stay out of the month total.
 * A per-minute model is priced from audio seconds. Cached input uses the
 * cache-read rate. Realtime audio tokens use the audio rate, not the text rate.
 */
export const priceAiUsage = (model: string, amounts: AiUsageAmounts, month: string): number | null => {
  const rate = aiModelPrice(model, month);
  if (!rate) return null;
  if (rate.usdPerMinute) {
    if (amounts.audioSeconds > 0) return (amounts.audioSeconds / 60) * rate.usdPerMinute;
    if (!rate.inputPerM && !rate.outputPerM) return null;
  }
  const cached = rate.cachedInputPerM ?? rate.inputPerM;
  const audioIn = rate.audioInputPerM ?? rate.inputPerM;
  const audioOut = rate.audioOutputPerM ?? rate.outputPerM;
  return (
    amounts.inputTokens * rate.inputPerM +
    amounts.cachedInputTokens * cached +
    amounts.outputTokens * rate.outputPerM +
    amounts.inputAudioTokens * audioIn +
    amounts.outputAudioTokens * audioOut
  ) / 1_000_000;
};

export const formatUsd = (amount: number): string => {
  const abs = Math.abs(amount);
  const maximumFractionDigits = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(amount);
};

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Realtime usage arrives on the browser data channel, so the page reports it. */
export const reportVoiceUsage = (event: { type?: string; response?: any; usage?: any; duration?: unknown }): void => {
  if (!event || typeof event.type !== "string") return;
  if (event.type === "response.done") {
    const usage = event.response?.usage ?? event.usage;
    if (!usage || typeof usage !== "object") return;
    const inD = usage.input_token_details ?? {};
    const outD = usage.output_token_details ?? {};
    const audioIn = num(inD.audio_tokens);
    const audioOut = num(outD.audio_tokens);
    const cached = num(inD.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens);
    const textInRaw = inD.text_tokens != null
      ? num(inD.text_tokens)
      : Math.max(0, num(usage.input_tokens ?? usage.prompt_tokens) - audioIn);
    const textIn = Math.max(0, textInRaw - cached);
    const textOut = outD.text_tokens != null
      ? num(outD.text_tokens)
      : Math.max(0, num(usage.output_tokens ?? usage.completion_tokens) - audioOut);
    const model = typeof event.response?.model === "string" && event.response.model.startsWith("gpt-realtime")
      ? event.response.model
      : "gpt-realtime-2.1";
    postUsage({
      feature: "voice_call",
      model,
      inputTokens: textIn,
      cachedInputTokens: cached,
      outputTokens: textOut,
      inputAudioTokens: audioIn,
      outputAudioTokens: audioOut,
    });
    return;
  }
  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const seconds = num(event.usage?.seconds ?? event.duration);
    if (seconds <= 0) return;
    postUsage({ feature: "live_transcription", model: "gpt-live-transcribe", audioSeconds: seconds });
  }
};

const postUsage = (body: Record<string, unknown>): void => {
  void fetch("/api/ai_usage.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  }).catch(() => {});
};
