#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createGameMakerCompileMcpServer } from "./server.js";

const server = createGameMakerCompileMcpServer();
try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  const type = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`[gamemaker-compile-mcp] GM_SERVER_START_FAILED type=${type}\n`);
  process.exitCode = 1;
}
