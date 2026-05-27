import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type RegisterTool = (server: McpServer) => void;

export function textResponse(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ]
  };
}
