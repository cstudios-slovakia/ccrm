import assert from "node:assert/strict";
import test from "node:test";
import {
  SECRET_MASK,
  hasAiConfigured,
  hasAiConnector,
  hasAudioTranscriptionSource,
  hasDirectOpenAiKey,
  hasOpenAiEmbeddingSource,
  hasOpenAiKey,
  isAiKeyProblem,
  translateAiApiError,
} from "./aiConfig.ts";

test("hasDirectOpenAiKey checks trimmed openAiKey values including SECRET_MASK", () => {
  assert.equal(hasDirectOpenAiKey(undefined), false);
  assert.equal(hasDirectOpenAiKey({}), false);
  assert.equal(hasDirectOpenAiKey({ openAiKey: "   " }), false);
  assert.equal(hasDirectOpenAiKey({ openAiKey: SECRET_MASK }), true);
  assert.equal(hasDirectOpenAiKey({ openAiKey: "sk-proj-123" }), true);
});

test("hasAiConnector requires aiSourceMode === 'connector' and non-empty aiConnectorId", () => {
  assert.equal(hasAiConnector({ aiSourceMode: "manual", aiConnectorId: "conn-1" }), false);
  assert.equal(hasAiConnector({ aiSourceMode: "connector", aiConnectorId: "" }), false);
  assert.equal(hasAiConnector({ aiSourceMode: "connector", aiConnectorId: "   " }), false);
  assert.equal(
    hasAiConnector({ aiSourceMode: "connector", aiConnectorId: "conn-1", aiConnectorType: "claude_api" }),
    true,
  );
});

test("hasAiConfigured and hasOpenAiKey accept either manual key or connector mode", () => {
  assert.equal(hasAiConfigured({ aiSourceMode: "manual", openAiKey: "" }), false);
  assert.equal(hasAiConfigured({ aiSourceMode: "manual", openAiKey: SECRET_MASK }), true);
  assert.equal(
    hasAiConfigured({ aiSourceMode: "connector", aiConnectorId: "conn-1", aiConnectorType: "claude_api", openAiKey: "" }),
    true,
  );
  assert.equal(
    hasOpenAiKey({ aiSourceMode: "connector", aiConnectorId: "conn-1", aiConnectorType: "gemini_api", openAiKey: "" }),
    true,
  );
});

test("hasOpenAiEmbeddingSource allows manual openAiKey or openai_api connector only", () => {
  assert.equal(
    hasOpenAiEmbeddingSource({ aiSourceMode: "connector", aiConnectorId: "c1", aiConnectorType: "claude_api" }),
    false,
  );
  assert.equal(
    hasOpenAiEmbeddingSource({ aiSourceMode: "connector", aiConnectorId: "c1", aiConnectorType: "gemini_api" }),
    false,
  );
  assert.equal(
    hasOpenAiEmbeddingSource({
      aiSourceMode: "connector",
      aiConnectorId: "c1",
      aiConnectorType: "claude_api",
      openAiKey: SECRET_MASK,
    }),
    true,
  );
  assert.equal(
    hasOpenAiEmbeddingSource({ aiSourceMode: "connector", aiConnectorId: "c2", aiConnectorType: "openai_api" }),
    true,
  );
});

test("hasAudioTranscriptionSource supports OpenAI and Gemini/Antigravity connectors or fallback OpenAI key", () => {
  assert.equal(
    hasAudioTranscriptionSource({ aiSourceMode: "connector", aiConnectorId: "c1", aiConnectorType: "claude_api" }),
    false,
  );
  assert.equal(
    hasAudioTranscriptionSource({
      aiSourceMode: "connector",
      aiConnectorId: "c1",
      aiConnectorType: "claude_api",
      openAiKey: SECRET_MASK,
    }),
    true,
  );
  for (const connectorType of ["openai_api", "gemini_api", "antigravity"]) {
    assert.equal(
      hasAudioTranscriptionSource({ aiSourceMode: "connector", aiConnectorId: "c2", aiConnectorType: connectorType }),
      true,
    );
  }
});

test("isAiKeyProblem includes ai_connector_unconfigured alongside key missing/invalid", () => {
  assert.equal(isAiKeyProblem("ai_key_missing"), true);
  assert.equal(isAiKeyProblem("ai_key_invalid"), true);
  assert.equal(isAiKeyProblem("ai_connector_unconfigured"), true);
  assert.equal(isAiKeyProblem("ai_rate_limited"), false);
  assert.equal(isAiKeyProblem("ai_error"), false);
});

test("translateAiApiError returns provider-neutral localized messages in en/sk/hu", () => {
  const err = (code: string, providerMessage?: string) => ({
    code,
    message: code,
    providerMessage,
    status: 500,
  });

  for (const lang of ["en", "sk", "hu"] as const) {
    const missing = translateAiApiError(err("ai_key_missing"), lang);
    const unconf = translateAiApiError(err("ai_connector_unconfigured"), lang);
    const invalid = translateAiApiError(err("ai_key_invalid"), lang);
    const rate = translateAiApiError(err("ai_rate_limited"), lang);
    const generic = translateAiApiError(err("ai_error", "Bad model"), lang);
    const empty = translateAiApiError(err("ai_empty"), lang);

    for (const msg of [missing, unconf, invalid, rate, generic, empty]) {
      assert.ok(msg.trim().length > 10, `empty translation for ${lang}`);
      assert.equal(msg.includes("OpenAI"), false, `unexpected OpenAI-only text for ${lang}: ${msg}`);
    }
    assert.ok(generic.includes("Bad model"));
  }
});
