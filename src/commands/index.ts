/**
 * Command router - dispatches to individual command handlers
 */

import { findCommandOwnerApp, getCoreAppTitle } from "../apps/registry.js";
import { workspaceAppEnabled } from "../engine/apps.js";
import { handleListAgents, handleMessage } from "./messaging.js";
import { handleTask } from "./tasks.js";
import { handleCalendar } from "./calendar.js";
import { handleWorkflow } from "./workflow.js";
import { handleBrowser } from "./browser.js";
import { handleScheduler } from "./scheduler.js";
import { handleInit } from "./init.js";
import { handleCreate } from "./create.js";
import { handleAvatar } from "./avatar.js";
import { handleSpawn, handleSpawnDockerWorker } from "./spawn.js";
import { handleRequest } from "./request.js";
import { handleOrgChart } from "./org-chart.js";
import { handleBrief } from "./brief.js";
import { handleBrand } from "./brand.js";
import { handleConversation } from "./conversation.js";
import { handleSkills } from "./skills.js";
import { handleAgents } from "./agents.js";
import { handleCrm } from "./crm.js";
import { handleMachine } from "./machine.js";

export async function routeCommand(
  positional: string[],
  flags: Set<string>,
  opts: Record<string, string>
): Promise<boolean> {
  const command = positional[0];

  const ownerApp = command ? findCommandOwnerApp(command) : null;
  if (ownerApp) {
    const agentSlug = process.env.TERMLINGS_AGENT_SLUG || undefined;
    if (!workspaceAppEnabled(ownerApp, agentSlug)) {
      console.error(`${getCoreAppTitle(ownerApp)} is disabled by workspace app settings for this agent.`);
      process.exit(1);
    }
  }

  switch (command) {
    case "list-agents":
      await handleListAgents(flags, positional);
      return true;

    case "org-chart":
      await handleOrgChart(flags, positional);
      return true;

    case "brief":
      await handleBrief(flags, positional);
      return true;

    case "message":
      await handleMessage(flags, positional);
      return true;

    case "conversation":
      await handleConversation(flags, positional, opts);
      return true;

    case "task":
      await handleTask(flags, positional);
      return true;

    case "workflow":
      await handleWorkflow(flags, positional, opts);
      return true;

    case "calendar":
      await handleCalendar(flags, positional);
      return true;

    case "brand":
      await handleBrand(flags, positional, opts);
      return true;

    case "crm":
      await handleCrm(flags, positional, opts);
      return true;

    case "skills":
      await handleSkills(flags, positional);
      return true;

    case "browser":
      await handleBrowser(flags, positional, opts);
      return true;

    case "scheduler":
      await handleScheduler(flags, positional);
      return true;

    case "init":
      await handleInit(flags, positional, opts);
      return true;

    case "create":
      await handleCreate(flags, positional, opts);
      return true;

    case "agents":
      await handleAgents(flags, positional, opts);
      return true;

    case "avatar":
      await handleAvatar(flags, positional, opts);
      return true;

    case "spawn":
      await handleSpawn(flags, positional, opts);
      return true;

    case "spawn-docker-worker":
      await handleSpawnDockerWorker(positional, opts);
      return true;

    case "request":
      await handleRequest(flags, positional, opts);
      return true;

    case "machine":
      await handleMachine(flags, positional, opts);
      return true;
  }

  return false; // Command not handled
}
