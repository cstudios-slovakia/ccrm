import assert from "node:assert/strict";
import test from "node:test";
import { AI_MODEL_INPUT_USD_PER_M, AI_MODEL_LUNA, AI_MODEL_SOL, AI_MODEL_TERRA, aiModelPrice } from "./aiModels.ts";
import { aiFeatureLabel, aiModelLabel, priceAiUsage } from "./aiUsage.ts";

const zero = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  inputAudioTokens: 0,
  outputAudioTokens: 0,
  audioSeconds: 0,
};

test("chat list prices match the SAI input table and the published output rates", () => {
  assert.equal(aiModelPrice(AI_MODEL_LUNA, "2026-10")?.inputPerM, AI_MODEL_INPUT_USD_PER_M[AI_MODEL_LUNA]);
  assert.equal(aiModelPrice(AI_MODEL_TERRA, "2026-10")?.outputPerM, 5);
  assert.equal(aiModelPrice(AI_MODEL_SOL, "2026-10")?.outputPerM, 10);
  const luna = priceAiUsage(AI_MODEL_LUNA, { ...zero, inputTokens: 1_000_000, outputTokens: 1_000_000 }, "2026-10");
  assert.equal(luna, 0.6);
  const terra = priceAiUsage(AI_MODEL_TERRA, { ...zero, inputTokens: 1_000, outputTokens: 1_000 }, "2026-10");
  assert.equal(terra, 0.006);
});

test("a snapshot id uses the model it belongs to", () => {
  assert.equal(priceAiUsage("gpt-6-luna-2026-05-18", { ...zero, inputTokens: 1_000_000 }, "2026-10"), 0.1);
  assert.equal(aiModelLabel("gpt-6.1-terra-2026-06-01"), "GPT-6.1 Terra");
});

test("cached input is cheaper than a fresh prompt", () => {
  const fresh = priceAiUsage(AI_MODEL_LUNA, { ...zero, inputTokens: 1_000_000 }, "2026-10");
  const cached = priceAiUsage(AI_MODEL_LUNA, { ...zero, cachedInputTokens: 1_000_000 }, "2026-10");
  assert.equal(fresh, 0.1);
  assert.equal(cached, 0.01);
});

test("Gemini 3.8 Flash stays on the introductory rate through December 2026", () => {
  const amounts = { ...zero, inputTokens: 1_000_000, outputTokens: 1_000_000 };
  assert.equal(priceAiUsage("gemini-3.8-flash", amounts, "2026-10"), 4.5);
  assert.equal(priceAiUsage("gemini-3.8-flash", amounts, "2026-12"), 4.5);
  assert.equal(priceAiUsage("gemini-3.8-flash", amounts, "2027-01"), 9);
});

test("transcription is priced per minute and a voice call splits text from audio", () => {
  const minutes = priceAiUsage("gpt-transcribe", { ...zero, audioSeconds: 90 }, "2026-10");
  assert.ok(minutes !== null && Math.abs(minutes - 0.00675) < 1e-9);
  assert.equal(priceAiUsage("gpt-transcribe", { ...zero, inputTokens: 500 }, "2026-10"), null);
  const call = priceAiUsage("gpt-realtime-2.1", {
    ...zero,
    inputTokens: 1_000_000,
    inputAudioTokens: 1_000_000,
    outputAudioTokens: 1_000_000,
  }, "2026-10");
  assert.equal(call, 100);
});

test("embeddings, Claude and an unknown model", () => {
  assert.equal(priceAiUsage("text-embedding-3-small", { ...zero, inputTokens: 1_000_000 }, "2026-10"), 0.02);
  assert.equal(priceAiUsage("claude-sonnet-5-5", { ...zero, inputTokens: 1_000_000, outputTokens: 1_000_000 }, "2026-10"), 12);
  assert.equal(priceAiUsage("some-private-model", { ...zero, inputTokens: 100 }, "2026-10"), null);
  assert.equal(aiFeatureLabel("sai_swarm", "sk"), "SAI skúška");
  assert.equal(aiFeatureLabel("not_a_feature", "en"), "not_a_feature");
});
