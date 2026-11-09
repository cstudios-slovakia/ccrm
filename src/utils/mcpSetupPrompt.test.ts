import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_NAME } from "./brand.ts";
import { MCP_KEY_PLACEHOLDER } from "./mcpConnect.ts";
import { buildSetupPrompt, type SetupPromptInput } from "./mcpSetupPrompt.ts";

const KEY = "ccrm_mcp_0123456789abcdef";
const base: SetupPromptInput = {
  origin: "https://crm.example.com",
  key: KEY,
  titleWithProduct: `Lapidea (${PRODUCT_NAME})`,
  userName: "Erik Novak",
  language: "sk",
};
const URL = "https://crm.example.com/api/mcp.php";

test("the prompt carries the server URL, the header and the real key", () => {
  const p = buildSetupPrompt(base);
  assert.ok(p.includes(`Server URL: ${URL}`));
  assert.ok(p.includes(`X-API-Key: ${KEY}`));
  assert.ok(p.includes(`claude mcp add --transport http --scope user ccrm ${URL} --header "X-API-Key: ${KEY}"`));
  assert.ok(!p.includes(MCP_KEY_PLACEHOLDER));
});

test("every JSON recipe in it is valid JSON with the key in X-API-Key", () => {
  const p = buildSetupPrompt(base);
  const recipes = [...p.matchAll(/under "(?:mcpServers|servers)": ("ccrm": .*)$/gm)].map((m) => JSON.parse(`{${m[1]}}`));
  assert.equal(recipes.length, 4);
  for (const r of recipes) assert.deepEqual(r.ccrm.headers, { "X-API-Key": KEY });
  assert.deepEqual(recipes.map((r) => r.ccrm.httpUrl ?? r.ccrm.url ?? r.ccrm.serverUrl), [URL, URL, URL, URL]);
  assert.equal(recipes[3].ccrm.type, "http");
});

test("without the key it shows the placeholder, never 'undefined' or 'null'", () => {
  for (const key of [undefined, null, ""]) {
    const p = buildSetupPrompt({ ...base, key });
    assert.ok(p.includes(`X-API-Key: ${MCP_KEY_PLACEHOLDER}`));
    assert.ok(!/undefined|null/.test(p));
  }
});

test("it never moves the key into a URL or advertises the legacy header", () => {
  const p = buildSetupPrompt(base);
  assert.ok(!p.includes("token="));
  assert.ok(!/x-ccrm-mcp-key/i.test(p));
  assert.ok(!p.includes(`?${KEY}`) && !p.includes(`/${KEY}`));
});

test("the user's language, the installation and the key owner are named", () => {
  assert.ok(buildSetupPrompt(base).includes("Talk to me in Slovak."));
  assert.ok(buildSetupPrompt({ ...base, language: "hu" }).includes("Talk to me in Hungarian."));
  assert.ok(buildSetupPrompt({ ...base, language: "en" }).includes("Talk to me in English."));
  const p = buildSetupPrompt(base);
  assert.ok(p.startsWith(`Please connect yourself to Lapidea (${PRODUCT_NAME}),`));
  assert.ok(p.includes(`as Erik Novak, with their permissions`));
});

test("it tells a chat app to be honest and the agent to protect the key", () => {
  const p = buildSetupPrompt(base);
  assert.match(p, /do not claim you have connected/);
  assert.match(p, /Never repeat the key/);
  assert.match(p, /never in a project file/);
  assert.match(p, /delete this conversation/);
});
