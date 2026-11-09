import { PRODUCT_NAME } from "./brand.ts";
import { MCP_KEY_HEADER, MCP_KEY_PLACEHOLDER, mcpServerUrl } from "./mcpConnect.ts";

/**
 * The "setup prompt": one message the user pastes into any AI app, which then connects
 * itself to this installation's MCP gateway.
 *
 * What it can and cannot do, and why the text is shaped the way it is:
 *  - An app that can run commands or edit files (Claude Code, Codex, Gemini CLI, Cursor,
 *    VS Code, Windsurf...) adds the server itself. The prompt names the facts (URL,
 *    transport, header) and gives known recipes, but lets the agent prefer its own,
 *    newer knowledge of its client's config format.
 *  - A chat app (claude.ai, ChatGPT...) has no tool to change its own settings. The prompt
 *    tells it to say so and walk the user through the clicks, instead of pretending.
 *  - The key is a password, so the prompt tells the agent not to echo it, to keep it out
 *    of project files that end up in git, to send it nowhere else, and never to move it
 *    into the URL (the gateway refuses `?token=` by default; see `public/api/mcp.php`).
 *
 * The server name stays `ccrm`: existing connections and the assistant prompt use it, and
 * renaming it would force everyone to reconnect.
 */

export type SetupPromptLanguage = "en" | "sk" | "hu";

const LANGUAGE_NAMES: Record<SetupPromptLanguage, string> = {
  en: "English",
  sk: "Slovak",
  hu: "Hungarian",
};

export interface SetupPromptInput {
  origin: string;
  /** The full key. Without it the prompt carries a placeholder and must not be handed out. */
  key?: string | null;
  /** "Lapidea (Koperniq)", or just the product name for an install with no title of its own. */
  titleWithProduct: string;
  /** Whose key it is: the agent acts as this person. */
  userName: string;
  /** The language the agent should talk to the user in. The prompt itself stays English. */
  language: SetupPromptLanguage;
}

export const MCP_SERVER_NAME = "ccrm";

export const buildSetupPrompt = ({ origin, key, titleWithProduct, userName, language }: SetupPromptInput): string => {
  const url = mcpServerUrl(origin);
  const k = key || MCP_KEY_PLACEHOLDER;
  const h = MCP_KEY_HEADER;
  const name = MCP_SERVER_NAME;
  const json = (fields: string) => `"${name}": { ${fields}, "headers": { "${h}": "${k}" } }`;

  return `Please connect yourself to ${titleWithProduct}, our ${PRODUCT_NAME} business system, as an MCP (Model Context Protocol) server. Everything you need is below. Talk to me in ${LANGUAGE_NAMES[language]}.

## Connection details
- Server name: ${name}
- Server URL: ${url}
- Transport: Streamable HTTP (a remote MCP server answering JSON-RPC over HTTPS POST). Not stdio.
- Authentication: send this HTTP header with every request:
  ${h}: ${k}
  It is the raw key, with no "Bearer" in front. Only if your app cannot set a custom header, use "Authorization: Bearer <the key>" or its bearer-token field instead.
- There is no OAuth sign-in. The header is the only credential.

## Handle the key like a password
Whoever has the key can act in ${PRODUCT_NAME} as ${userName}, with their permissions.
- Never repeat the key in your replies, summaries, plans or logs. Call it "the key".
- Store it only in your own user-level MCP configuration, never in a project file that could be committed to git or shared (for example a .mcp.json, .vscode/mcp.json or .cursor/mcp.json inside a repository).
- Send it to no address other than the Server URL above, and never put it into a URL.
- If a server named "${name}" already exists in your configuration, ask me before replacing it.

## What to do
First work out which app you are running in and what you are able to do there.

A) You can run commands or edit files on this computer (for example Claude Code, Codex CLI, Gemini CLI, Cursor, Windsurf, VS Code with Copilot, Cline, Zed):
1. Tell me in one sentence which file you will change or which command you will run, then do it, the way your app documents adding a remote HTTP MCP server for the current user. Known recipes; if you know your app's current format better, use yours:
   - Claude Code: claude mcp add --transport http --scope user ${name} ${url} --header "${h}: ${k}"
   - Codex CLI, in ~/.codex/config.toml:
     [mcp_servers.${name}]
     url = "${url}"
     http_headers = { "${h}" = "${k}" }
   - Gemini CLI, in ~/.gemini/settings.json under "mcpServers": ${json(`"httpUrl": "${url}"`)}
   - Cursor, in ~/.cursor/mcp.json under "mcpServers": ${json(`"url": "${url}"`)}
   - Windsurf, in ~/.codeium/windsurf/mcp_config.json under "mcpServers": ${json(`"serverUrl": "${url}"`)}
   - VS Code, in the user-level mcp.json (command "MCP: Open User Configuration") under "servers": ${json(`"type": "http", "url": "${url}"`)}
   When the file already exists, merge: keep every other server and setting, and keep the file valid.
2. Check that the server answers: send one HTTP POST to the Server URL with the headers "Content-Type: application/json" and "${h}: <the key>", body {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}. On Windows PowerShell use curl.exe or Invoke-RestMethod, not the curl alias. A JSON reply containing "serverInfo" means it works. HTTP 401 means the key is wrong or was revoked. For anything else, tell me the status code and the error, without the key.
3. Tell me whether I have to restart or reload the app before the new tools appear, and how.

B) You are a chat app and cannot change your own settings (for example claude.ai, Claude Desktop, ChatGPT, Le Chat, Microsoft Copilot, Gemini on the web): say so plainly and do not claim you have connected. Then guide me step by step through adding a custom connector or MCP server in your app's settings with the details above. Name only menus and fields you are sure exist in your app. If your app has no field for a custom header, an API key or a bearer token, tell me it cannot connect with a key, and do not suggest a workaround that puts the key in the URL.

## Finish
Once the connection works, prove it by calling one tool of the "${name}" server, for example list my open tasks. Then remind me that this conversation contains the key: if the app keeps chat history, I should delete this conversation, and if it was ever shared, generate a new key in ${PRODUCT_NAME}.`;
};
