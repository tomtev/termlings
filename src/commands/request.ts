/**
 * Request command: agents submit requests to the operator
 * Supports: env (environment variables), confirm (yes/no), choice (pick one)
 * Requests appear in the TUI Requests tab for the operator to resolve.
 */

import { createRequest, listRequests, getRequest } from "../engine/requests.js";
import type { EnvScope } from "../engine/env.js";

export async function handleRequest(flags: Set<string>, positional: string[], opts: Record<string, string> = {}) {
  if (flags.has("help") || !positional[1]) {
    console.log(`
Request - Ask the operator for decisions, env vars, or approvals

USAGE:
  termlings request env <VAR_NAME> [reason] [url] [--scope project|termlings]
  termlings request confirm <question>
  termlings request choice <question> <option1> <option2> [option3...]
  termlings request list [--all]
  termlings request check <request-id>

SUBCOMMANDS:
  env      Request an environment variable / API key
  confirm  Ask a yes/no question
  choice   Ask operator to pick from options
  list     Show pending requests (--all for resolved too)
  check    Check if a request was answered (prints response value)

EXAMPLES:
  termlings request env OPENAI_API_KEY "Needed for app runtime" --scope project
  termlings request env AGENT_BROWSER_API_KEY "Needed for browser automation" --scope termlings
  termlings request confirm "Should we deploy to production?"
  termlings request choice "Which framework?" "SvelteKit" "Next.js" "Remix"
  termlings request list
  termlings request check req-a1b2c3d4
`);
    return;
  }

  const subcommand = positional[1];

  if (subcommand === "env") {
    await handleRequestEnv(flags, positional, opts);
    return;
  }

  if (subcommand === "confirm") {
    await handleRequestConfirm(positional);
    return;
  }

  if (subcommand === "choice") {
    await handleRequestChoice(positional);
    return;
  }

  if (subcommand === "list") {
    handleRequestList(flags);
    return;
  }

  if (subcommand === "check") {
    handleRequestCheck(positional);
    return;
  }

  console.error(`Unknown request type: ${subcommand}`);
  console.error("Available: env, confirm, choice, list, check");
  process.exit(1);
}

function getAgentContext() {
  const sessionId = process.env.TERMLINGS_SESSION_ID;
  const agentName = process.env.TERMLINGS_AGENT_NAME || "Agent";
  const agentDna = process.env.TERMLINGS_AGENT_DNA || "0000000";
  const agentSlug = process.env.TERMLINGS_AGENT_SLUG || "";

  if (!sessionId) {
    console.error("Error: TERMLINGS_SESSION_ID not set");
    process.exit(1);
  }

  return { sessionId: sessionId!, agentName, agentDna, agentSlug };
}

function parseScope(flags: Set<string>, opts: Record<string, string>): EnvScope {
  if (flags.has("termlings") || flags.has("internal")) {
    return "termlings";
  }

  const raw = (opts.scope || "").trim().toLowerCase();
  if (!raw || raw === "project") return "project";
  if (raw === "termlings" || raw === "internal") return "termlings";

  console.error(`Invalid --scope value: ${opts.scope}`);
  console.error("Expected one of: project, termlings");
  process.exit(1);
}

function scopeFileLabel(scope: EnvScope): string {
  return scope === "termlings" ? ".termlings/.env" : ".env";
}

async function handleRequestEnv(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const varName = positional[2];
  if (!varName) {
    console.error("Usage: termlings request env <VAR_NAME> [reason] [url] [--scope project|termlings]");
    process.exit(1);
  }

  const scope = parseScope(flags, opts);

  // Check if already set
  if (process.env[varName]) {
    console.log(`${varName} is already set`);
    return;
  }

  const reason = positional[3] || "";
  const url = positional[4] || "";
  const { sessionId, agentName, agentDna, agentSlug } = getAgentContext();

  const request = createRequest({
    type: "env",
    from: sessionId,
    fromName: agentName,
    fromSlug: agentSlug || undefined,
    fromDna: agentDna,
    varName,
    reason: reason || undefined,
    url: url || undefined,
    envScope: scope,
  });

  console.log(`Request submitted: ${request.id}`);
  console.log(`Waiting for operator to set ${varName} in ${scopeFileLabel(scope)}`);
}

async function handleRequestConfirm(positional: string[]) {
  const question = positional[2];
  if (!question) {
    console.error("Usage: termlings request confirm <question>");
    process.exit(1);
  }

  const { sessionId, agentName, agentDna, agentSlug } = getAgentContext();

  const request = createRequest({
    type: "confirm",
    from: sessionId,
    fromName: agentName,
    fromSlug: agentSlug || undefined,
    fromDna: agentDna,
    question,
  });

  console.log(`Request submitted: ${request.id}`);
  console.log(`Waiting for operator to confirm: ${question}`);
}

async function handleRequestChoice(positional: string[]) {
  const question = positional[2];
  const options = positional.slice(3);

  if (!question || options.length < 2) {
    console.error("Usage: termlings request choice <question> <option1> <option2> [option3...]");
    process.exit(1);
  }

  const { sessionId, agentName, agentDna, agentSlug } = getAgentContext();

  const request = createRequest({
    type: "choice",
    from: sessionId,
    fromName: agentName,
    fromSlug: agentSlug || undefined,
    fromDna: agentDna,
    question,
    options,
  });

  console.log(`Request submitted: ${request.id}`);
  console.log(`Waiting for operator to choose: ${question}`);
}

function handleRequestList(flags: Set<string>) {
  const all = flags.has("all");
  const requests = all ? listRequests() : listRequests("pending");

  if (requests.length === 0) {
    console.log(all ? "No requests" : "No pending requests");
    return;
  }

  for (const req of requests) {
    const from = req.fromSlug ? `agent:${req.fromSlug}` : req.fromName;
    const status = req.status === "pending" ? "PENDING" : req.status === "resolved" ? "RESOLVED" : "DISMISSED";
    const ago = Math.floor((Date.now() - req.ts) / 1000);

    if (req.type === "env") {
      const scope = req.envScope === "termlings" ? "termlings" : "project";
      console.log(`  [${status}] ${req.id}  ${from}: env ${req.varName} [${scope}]${req.reason ? ` — ${req.reason}` : ""} (${ago}s ago)`);
    } else if (req.type === "confirm") {
      console.log(`  [${status}] ${req.id}  ${from}: ${req.question} (${ago}s ago)`);
    } else if (req.type === "choice") {
      console.log(`  [${status}] ${req.id}  ${from}: ${req.question} [${req.options?.join(", ")}] (${ago}s ago)`);
    }

    if (req.status === "resolved") {
      if (req.type === "env") {
        console.log(`           → set in ${scopeFileLabel(req.envScope === "termlings" ? "termlings" : "project")}`);
      } else if (req.response) {
        console.log(`           → ${req.response}`);
      }
    }
  }
}

function handleRequestCheck(positional: string[]) {
  const id = positional[2];
  if (!id) {
    console.error("Usage: termlings request check <request-id>");
    process.exit(1);
  }

  const req = getRequest(id);
  if (!req) {
    console.error(`Request not found: ${id}`);
    process.exit(1);
  }

  if (req.status === "pending") {
    console.log(`${req.id}: pending`);
    process.exit(2); // Exit 2 = still pending (agents can check exit code)
  }

  if (req.status === "dismissed") {
    console.log(`${req.id}: dismissed`);
    process.exit(3); // Exit 3 = dismissed
  }

  // Resolved
  if (req.type === "env") {
    // Never print env var values — they are written to env files directly.
    const scope = req.envScope === "termlings" ? "termlings" : "project";
    console.log(`${req.varName}: set in ${scopeFileLabel(scope)}`);
  } else {
    console.log(req.response || "");
  }
}
