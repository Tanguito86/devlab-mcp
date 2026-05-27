#!/usr/bin/env node
// @tanguito/visual-regression-mcp — MCP server for visual regression testing
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerCompareImages,
  registerCreateBaseline,
  registerCompareFolder,
  registerGenerateReport
} from "./tools.js";

const server = new McpServer({
  name: "visual-regression-mcp",
  version: "0.1.0"
});

registerCompareImages(server);
registerCreateBaseline(server);
registerCompareFolder(server);
registerGenerateReport(server);

const transport = new StdioServerTransport();
await server.connect(transport);
