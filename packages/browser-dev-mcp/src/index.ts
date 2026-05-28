#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerOpenBrowser, registerCloseBrowser } from "./browser/tools.js";
import { registerOpenUrl } from "./browser/tools.js";
import { registerScreenshot, registerScreenshotCanvas } from "./browser/tools.js";
import { registerClick, registerClickText, registerClickPercent } from "./browser/tools.js";
import { registerPressKey, registerTypeText } from "./browser/tools.js";
import { registerEvaluateJs, registerEvaluateGameState } from "./browser/tools.js";
import { registerGetConsoleLogs, registerGetPageErrors } from "./browser/tools.js";
import { registerWait, registerWaitForSelector } from "./browser/tools.js";
import { registerWaitForCanvasChange, registerCaptureFps, registerRecordTrace } from "./browser/tools.js";
import { registerStartSession, registerStopSession, registerListSessions, registerGetSessionReport } from "./browser/tools.js";
import { registerListProfiles, registerListWorkflows, registerRunWorkflow } from "./browser/tools.js";

const server = new McpServer({
  name: "browser-dev-mcp",
  version: "1.0.0"
});

// Lifecycle
registerOpenBrowser(server);
registerCloseBrowser(server);

// Navigation
registerOpenUrl(server);

// Screenshots
registerScreenshot(server);
registerScreenshotCanvas(server);

// Interaction
registerClick(server);
registerClickText(server);
registerClickPercent(server);
registerPressKey(server);
registerTypeText(server);

// JavaScript evaluation
registerEvaluateJs(server);
registerEvaluateGameState(server);

// Console & errors
registerGetConsoleLogs(server);
registerGetPageErrors(server);

// Wait / timing
registerWait(server);
registerWaitForSelector(server);

// Canvas-specific
registerWaitForCanvasChange(server);
registerCaptureFps(server);
registerRecordTrace(server);

// Sessions & evidence
registerStartSession(server);
registerStopSession(server);
registerListSessions(server);
registerGetSessionReport(server);

// Profiles & workflows
registerListProfiles(server);
registerListWorkflows(server);
registerRunWorkflow(server);

const transport = new StdioServerTransport();
await server.connect(transport);
