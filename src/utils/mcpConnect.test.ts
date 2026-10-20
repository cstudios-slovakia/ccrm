import assert from "node:assert/strict";
import test from "node:test";
import {
  MCP_KEY_PLACEHOLDER,
  buildAgentPrompt,
  buildCliCommand,
  buildEditorConfig,
  buildStdioConfig,
  mcpBearerHeader,
  mcpKeyHeader,
  mcpServerUrl,
} from "./mcpConnect.ts";

const ORIGIN = "https://crm.example.com";
const KEY = "ccrm_mcp_abc123";

const everything = (key?: string) => [
  mcpServerUrl(ORIGIN),
  mcpKeyHeader(key).name + mcpKeyHeader(key).value,
  mcpBearerHeader(key).name + mcpBearerHeader(key).value,
  buildEditorConfig(ORIGIN, key),
  buildCliCommand(ORIGIN, key),
  buildStdioConfig(ORIGIN, key),
];

test("the server URL is the gateway under the origin", () => {
  assert.equal(mcpServerUrl(ORIGIN), "https://crm.example.com/api/mcp.php");
  assert.equal(JSON.parse(buildEditorConfig(ORIGIN, KEY)).mcpServers.ccrm.url, "https://crm.example.com/api/mcp.php");
  assert.ok(buildCliCommand(ORIGIN, KEY).includes(" https://crm.example.com/api/mcp.php "));
});

test("the key goes in X-API-Key, raw, without Bearer", () => {
  assert.deepEqual(mcpKeyHeader(KEY), { name: "X-API-Key", value: KEY });
  assert.deepEqual(JSON.parse(buildEditorConfig(ORIGIN, KEY)).mcpServers.ccrm.headers, { "X-API-Key": KEY });
  assert.ok(buildCliCommand(ORIGIN, KEY).endsWith(`--header "X-API-Key: ${KEY}"`));
  assert.ok(!buildEditorConfig(ORIGIN, KEY).includes("Bearer"));
  assert.ok(!buildCliCommand(ORIGIN, KEY).includes("Bearer"));
});

test("the Bearer variant is Authorization with a prefixed value", () => {
  assert.deepEqual(mcpBearerHeader(KEY), { name: "Authorization", value: `Bearer ${KEY}` });
  assert.deepEqual(mcpBearerHeader(null), { name: "Authorization", value: `Bearer ${MCP_KEY_PLACEHOLDER}` });
});

test("the legacy header and the query token are never advertised", () => {
  for (const key of [KEY, undefined]) {
    for (const text of everything(key)) {
      assert.ok(!/x-ccrm-mcp-key/i.test(text), text);
      assert.ok(!text.includes("?token="), text);
      assert.ok(!text.includes("token="), text);
    }
  }
});

test("without a key every builder shows the visible placeholder", () => {
  for (const key of [undefined, null, ""]) {
    assert.equal(mcpKeyHeader(key).value, MCP_KEY_PLACEHOLDER);
    assert.equal(JSON.parse(buildEditorConfig(ORIGIN, key)).mcpServers.ccrm.headers["X-API-Key"], MCP_KEY_PLACEHOLDER);
    assert.ok(buildCliCommand(ORIGIN, key).includes(MCP_KEY_PLACEHOLDER));
    assert.equal(JSON.parse(buildStdioConfig(ORIGIN, key)).mcpServers.ccrm.env.CCRM_MCP_KEY, MCP_KEY_PLACEHOLDER);
  }
});

test("with a key the real key is used and the placeholder is gone", () => {
  for (const text of everything(KEY)) assert.ok(!text.includes(MCP_KEY_PLACEHOLDER), text);
  assert.ok(buildEditorConfig(ORIGIN, KEY).includes(KEY));
  assert.ok(buildCliCommand(ORIGIN, KEY).includes(KEY));
  assert.ok(buildStdioConfig(ORIGIN, KEY).includes(KEY));
});

test("both JSON snippets parse, and the editor one carries no transport field", () => {
  const editor = JSON.parse(buildEditorConfig(ORIGIN, KEY));
  assert.deepEqual(Object.keys(editor.mcpServers.ccrm).sort(), ["headers", "url"]);
  JSON.parse(buildEditorConfig(ORIGIN));
  const stdio = JSON.parse(buildStdioConfig(ORIGIN, KEY));
  assert.equal(stdio.mcpServers.ccrm.command, "node");
  assert.equal(stdio.mcpServers.ccrm.env.CCRM_API_URL, "https://crm.example.com/api");
});

test("the agent prompt never claims a role it does not know", () => {
  const known = buildAgentPrompt({ name: "Erik", email: "erik@crm.com", role: "Sales" });
  assert.ok(known.includes("Erik (erik@crm.com, Role: Sales)"));
  for (const role of [undefined, null, "", "   "]) {
    const prompt = buildAgentPrompt({ name: "Erik", email: "erik@crm.com", role });
    assert.ok(prompt.includes("Erik (erik@crm.com)"));
    assert.ok(!/Role:|Admin/.test(prompt));
  }
});
