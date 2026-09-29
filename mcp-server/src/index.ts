#!/usr/bin/env node
/**
 * CCRM Model Context Protocol (MCP) Server.
 *
 * Provides a standard stdio transport interface for MCP clients
 * (Google Antigravity, Claude Desktop, Cursor, etc.) to securely
 * control CCRM business domains.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = (process.env.CCRM_API_URL || "http://localhost:8085/api").replace(/\/$/, "");
const MCP_KEY = process.env.CCRM_MCP_KEY || "";

if (!MCP_KEY) {
  console.error("[ccrm-mcp] Error: CCRM_MCP_KEY environment variable is required.");
  console.error("[ccrm-mcp] Generate a personal MCP key in CCRM -> Personal Settings -> AI Assistant (MCP).");
  process.exit(1);
}

async function callCcrmRpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const url = `${API_URL}/mcp.php?token=${encodeURIComponent(MCP_KEY)}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MCP_KEY}`,
      "X-CCRM-MCP-KEY": MCP_KEY,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CCRM API error (${response.status}): ${errorText}`);
  }

  const json: any = await response.json();
  if (json.error) {
    throw new Error(`CCRM RPC error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  return json.result;
}

const server = new Server(
  {
    name: "ccrm-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handler for listing available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const result = await callCcrmRpc("tools/list");
    return {
      tools: result.tools || [],
    };
  } catch (err: any) {
    console.error("[ccrm-mcp] Failed to fetch tools:", err.message);
    throw err;
  }
});

// Handler for tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const toolArgs = request.params.arguments || {};

  try {
    const result = await callCcrmRpc("tools/call", {
      name: toolName,
      arguments: toolArgs,
    });

    return {
      content: result.content || [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: result.isError === true,
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: "text",
          text: `Tool execution failed: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ccrm-mcp] CCRM MCP Server running on stdio transport connected to", API_URL);
}

main().catch((error) => {
  console.error("[ccrm-mcp] Fatal error in main():", error);
  process.exit(1);
});
