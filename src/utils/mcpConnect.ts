/**
 * What the "AI Assistant (MCP)" settings tab hands to the user to paste into an AI app.
 *
 * Pure string builders, so the exact text can be unit-tested. The gateway
 * (`public/api/mcp.php`) accepts `X-API-Key: <key>` (raw) and
 * `Authorization: Bearer <key>`; the older `X-CCRM-MCP-KEY` header still works on the
 * server but is no longer advertised, and a `?token=` URL is refused unless an operator
 * opts in, so it never appears here.
 */

/** Shown wherever the real key is not available (it is only visible once, right after generating). */
export const MCP_KEY_PLACEHOLDER = "<your key>";

export const MCP_KEY_HEADER = "X-API-Key";
export const MCP_BEARER_HEADER = "Authorization";

const keyOrPlaceholder = (key?: string | null): string => (key ? key : MCP_KEY_PLACEHOLDER);

/** The remote MCP endpoint of this CCRM installation. */
export const mcpServerUrl = (origin: string): string => `${origin}/api/mcp.php`;

/** Header the user should add in a connector form: the key as it is, no "Bearer ". */
export const mcpKeyHeader = (key?: string | null) => ({
  name: MCP_KEY_HEADER,
  value: keyOrPlaceholder(key),
});

/** Alternative for apps that only offer an `Authorization` header or a bearer field. */
export const mcpBearerHeader = (key?: string | null) => ({
  name: MCP_BEARER_HEADER,
  value: `Bearer ${keyOrPlaceholder(key)}`,
});

/**
 * `mcpServers` block for editors that take a remote URL (Cursor, VS Code, Windsurf,
 * Antigravity, Claude Desktop via its config file). No `transport` field: the gateway
 * answers JSON-RPC over POST, which is what current remote-URL clients use.
 */
export const buildEditorConfig = (origin: string, key?: string | null): string =>
  JSON.stringify(
    {
      mcpServers: {
        ccrm: {
          url: mcpServerUrl(origin),
          headers: { [MCP_KEY_HEADER]: keyOrPlaceholder(key) },
        },
      },
    },
    null,
    2,
  );

/** Claude Code: `claude mcp add --transport http <name> <url> --header "<Name>: <value>"`. */
export const buildCliCommand = (origin: string, key?: string | null): string =>
  `claude mcp add --transport http ccrm ${mcpServerUrl(origin)} --header "${MCP_KEY_HEADER}: ${keyOrPlaceholder(key)}"`;

/** Local stdio bridge from `mcp-server/`; its env var names are fixed by that code. */
export const buildStdioConfig = (origin: string, key?: string | null): string =>
  JSON.stringify(
    {
      mcpServers: {
        ccrm: {
          command: "node",
          args: ["/path/to/ccrm-app/mcp-server/dist/index.js"],
          env: {
            CCRM_API_URL: `${origin}/api`,
            CCRM_MCP_KEY: keyOrPlaceholder(key),
          },
        },
      },
    },
    null,
    2,
  );

export interface AgentPromptUser {
  name: string;
  email: string;
  role?: string | null;
}

/** The optional system prompt. An unknown role is left out rather than guessed. */
export const buildAgentPrompt = (user: AgentPromptUser): string => {
  const role = user.role?.trim();
  const who = `${user.name} (${user.email}${role ? `, Role: ${role}` : ""})`;
  return `You have access to CCRM via the \`ccrm\` MCP server tools.
You are operating on behalf of ${who}. You can only use the tools and see the data that this role is allowed to; a tool that is not listed or that answers "Forbidden" is outside it.

### Available Capabilities:
- Leads & Opportunities: Manage sales pipeline, stage transitions, deal values.
- Clients & Contacts: View, create, update companies, addresses, and contacts.
- Projects & Tasks: Manage Gantt milestones, tasks, statuses, assignments, and priorities.
- Financials & Invoicing: Finance overview, forecast, project billing and invoicable value; create draft invoices and planned expenses. Approving, settling and paying money is done in the app.
- Warehouse & Stock: View inventory levels, movements, and stock locations.
- Meetings & Comms: Schedule meetings, log internal notes, view communication threads.
- Employees: Staff, vacations and (only with the salaries permission) payroll.
- Global Search: Search the modules your role can see with \`search_entities\`.

### Strict Operational Rules:
1. Always search or inspect existing records before creating duplicates.
2. For financial actions (invoices, expenses), double check amounts, currencies, and client IDs. Lead stages, project statuses and task statuses must be ones configured in the workspace; a wrong value is rejected with the list of valid ones.
3. You CANNOT view or modify application settings, licenses, credentials, or raw DB tables. The only setting reachable is the finance mode (admin only).
4. All actions taken through your tools are logged and attributed to ${user.name} in the system audit log.`;
};
