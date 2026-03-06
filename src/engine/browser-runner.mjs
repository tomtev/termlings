import { realpathSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

export function isIgnoredInternalBrowserPage(url) {
  const normalized = String(url || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith("chrome://omnibox-popup")
    || normalized.includes(".top-chrome/")
    || normalized.startsWith("devtools://");
}

function normalizeTimeoutMs(input, fallback = 30000) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1000, Math.min(120000, parsed));
}

function parseRunnerArgs(argv) {
  const cdpIndex = argv.indexOf("--cdp");
  if (cdpIndex < 0 || cdpIndex + 1 >= argv.length) {
    throw new Error("Missing required option: --cdp <target>");
  }

  const cdpTarget = String(argv[cdpIndex + 1] || "").trim();
  const commandArgs = argv.slice(cdpIndex + 2);
  if (!cdpTarget) {
    throw new Error("Missing required option: --cdp <target>");
  }
  if (commandArgs.length === 0) {
    throw new Error("Missing browser command");
  }
  return { cdpTarget, commandArgs };
}

function resolveHttpBase(cdpTarget) {
  const trimmed = String(cdpTarget || "").trim();
  if (!trimmed) {
    throw new Error("Missing required option: --cdp <target>");
  }
  if (/^\d+$/.test(trimmed)) {
    return `http://127.0.0.1:${trimmed}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  if (/^wss?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    const protocol = url.protocol === "wss:" ? "https:" : "http:";
    return `${protocol}//${url.host}`;
  }
  throw new Error(`Unsupported CDP target: ${trimmed}`);
}

async function fetchJson(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`CDP endpoint returned ${response.status} for ${url}`);
  }
  return await response.json();
}

function buildTargetLookup(targets) {
  const lookup = new Map();
  for (const target of targets) {
    if (target && typeof target.id === "string" && target.id.trim()) {
      lookup.set(target.id.trim(), target);
    }
  }
  return lookup;
}

export function collectVisibleTabs(targets, options = {}) {
  const selectedTargetId = typeof options.selectedTargetId === "string" && options.selectedTargetId.trim().length > 0
    ? options.selectedTargetId.trim()
    : undefined;
  const visible = [];
  const entries = Array.isArray(targets) ? targets : [];

  for (const target of entries) {
    if (!target || target.type !== "page") continue;
    if (isIgnoredInternalBrowserPage(target.url)) continue;
    const targetId = typeof target.id === "string" ? target.id.trim() : "";
    if (!targetId) continue;
    visible.push({
      id: String(visible.length),
      targetId,
      title: typeof target.title === "string" ? target.title : "",
      url: typeof target.url === "string" ? target.url : "",
      webSocketDebuggerUrl: typeof target.webSocketDebuggerUrl === "string" ? target.webSocketDebuggerUrl : "",
      active: false,
    });
  }

  if (visible.length === 0) {
    return visible;
  }

  const selected = selectedTargetId
    ? visible.find((tab) => tab.targetId === selectedTargetId)
    : null;
  if (selected) {
    selected.active = true;
  } else {
    visible[0].active = true;
  }

  return visible;
}

function resolveTabReference(tabRef, visibleTabs) {
  if (!Array.isArray(visibleTabs) || visibleTabs.length === 0) {
    throw new Error("No visible browser tabs available");
  }

  const trimmed = String(tabRef || "").trim();
  if (!trimmed) {
    return visibleTabs.find((tab) => tab.active) || visibleTabs[0];
  }

  const direct = visibleTabs.find((tab) => tab.targetId === trimmed);
  if (direct) return direct;

  if (/^\d+$/.test(trimmed)) {
    const byIndex = visibleTabs.find((tab) => tab.id === trimmed);
    if (byIndex) return byIndex;
  }

  throw new Error(`Invalid tab reference: ${trimmed}`);
}

class CDPSession {
  constructor(wsUrl, timeoutMs) {
    this.wsUrl = wsUrl;
    this.timeoutMs = timeoutMs;
    this.ws = null;
    this.sessionId = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
  }

  async open() {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out opening Chrome DevTools websocket")), this.timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      ws.addEventListener("error", (event) => {
        clearTimeout(timer);
        reject(event?.error || new Error("Chrome DevTools websocket error"));
      }, { once: true });
    });

    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data || "{}"));
      if (typeof payload.id === "number" && this.pending.has(payload.id)) {
        const pending = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) {
          pending.reject(new Error(payload.error.message || JSON.stringify(payload.error)));
        } else {
          pending.resolve(payload.result);
        }
        return;
      }

      if (typeof payload.method === "string") {
        const listeners = this.eventListeners.get(payload.method);
        if (listeners && listeners.length > 0) {
          for (const listener of [...listeners]) {
            listener(payload);
          }
        }
      }
    });

    ws.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Chrome DevTools websocket closed"));
      }
      this.pending.clear();
    });
  }

  async close() {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.sessionId = null;
  }

  async send(method, params = {}, sessionIdOverride = this.sessionId) {
    if (!this.ws) {
      throw new Error("Chrome DevTools websocket is not open");
    }

    const id = this.nextId++;
    const payload = JSON.stringify(
      sessionIdOverride
        ? { id, method, params, sessionId: sessionIdOverride }
        : { id, method, params },
    );

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Chrome DevTools response: ${method}`));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.ws.send(payload);
    });
  }

  waitForEvent(method, predicate = null, timeoutMs = this.timeoutMs, sessionIdOverride = this.sessionId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for Chrome DevTools event: ${method}`));
      }, timeoutMs);

      const listener = (payload) => {
        try {
          if (sessionIdOverride && payload?.sessionId !== sessionIdOverride) return;
          const params = payload?.params || {};
          if (predicate && predicate(params) !== true) return;
          cleanup();
          resolve(params);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        const listeners = this.eventListeners.get(method) || [];
        const next = listeners.filter((entry) => entry !== listener);
        if (next.length === 0) this.eventListeners.delete(method);
        else this.eventListeners.set(method, next);
      };

      const current = this.eventListeners.get(method) || [];
      current.push(listener);
      this.eventListeners.set(method, current);
    });
  }
}

function unwrapRemoteValue(remote) {
  if (!remote || typeof remote !== "object") return undefined;
  if ("value" in remote) return remote.value;
  if (remote.type === "undefined") return undefined;
  if (remote.subtype === "null") return null;
  return undefined;
}

async function evaluate(session, expression) {
  const response = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return unwrapRemoteValue(response?.result);
}

async function waitForReady(session, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const readyState = await evaluate(session, "document.readyState");
    if (readyState === "interactive" || readyState === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("Timed out waiting for page readiness");
}

function selectorExpression(selector, actionSource) {
  return `(() => {
    const resolveByRef = (ref) => {
      const raw = window.__termlingsSnapshotRefs;
      if (!raw || typeof raw !== "object") return null;
      const entry = raw[ref];
      if (!entry || typeof entry.selector !== "string") return null;
      try { return document.querySelector(entry.selector); } catch { return null; }
    };
    const selector = ${JSON.stringify(selector)};
    const element = selector.startsWith("@")
      ? resolveByRef(selector.slice(1))
      : document.querySelector(selector);
    if (!element) return { ok: false, reason: "not-found", selector };
    ${actionSource}
  })()`;
}

function keyDescriptor(key) {
  const normalized = String(key || "").trim();
  const map = {
    Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
    Tab: { key: "Tab", code: "Tab", keyCode: 9, text: "" },
    Escape: { key: "Escape", code: "Escape", keyCode: 27, text: "" },
    Backspace: { key: "Backspace", code: "Backspace", keyCode: 8, text: "" },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38, text: "" },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40, text: "" },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37, text: "" },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39, text: "" },
    Space: { key: " ", code: "Space", keyCode: 32, text: " " },
  };
  if (map[normalized]) return map[normalized];
  const upper = normalized.length === 1 ? normalized.toUpperCase() : normalized;
  return {
    key: normalized || "Unidentified",
    code: normalized.length === 1 ? `Key${upper}` : upper,
    keyCode: normalized.length === 1 ? upper.charCodeAt(0) : 0,
    text: normalized.length === 1 ? normalized : "",
  };
}

function parseSnapshotArgs(rest) {
  let interactive = false;
  let compact = false;
  let depth = 3;
  let selector;

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "-i" || token === "--interactive") {
      interactive = true;
      continue;
    }
    if (token === "-c" || token === "--compact") {
      compact = true;
      continue;
    }
    if ((token === "-d" || token === "--depth") && rest[i + 1]) {
      depth = Math.max(0, Number.parseInt(rest[i + 1], 10) || 0);
      i += 1;
      continue;
    }
    if ((token === "-s" || token === "--selector") && rest[i + 1]) {
      selector = rest[i + 1];
      i += 1;
    }
  }

  return { interactive, compact, depth, selector };
}

async function buildSnapshot(session, options) {
  const { interactive, compact, depth, selector } = options;
  const source = `(() => {
    const maxDepth = ${Math.max(0, Math.min(10, depth))};
    const interactiveOnly = ${interactive ? "true" : "false"};
    const compactMode = ${compact ? "true" : "false"};
    const selector = ${JSON.stringify(selector || "")};
    const root = selector ? document.querySelector(selector) : document.body || document.documentElement;
    if (!root) {
      return { title: document.title, url: location.href, text: "", nodes: [], interactive: [] };
    }

    const refMap = {};
    let refCounter = 0;
    const interactive = [];
    const createSelector = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
      if (node.id) return "#" + CSS.escape(node.id);
      const parts = [];
      let current = node;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        if (current.classList && current.classList.length > 0) {
          part += "." + Array.from(current.classList).slice(0, 2).map((value) => CSS.escape(value)).join(".");
        }
        const parent = current.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          if (sameTag.length > 1) {
            part += ":nth-of-type(" + (sameTag.indexOf(current) + 1) + ")";
          }
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const isInteractiveNode = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
      const tag = node.tagName.toLowerCase();
      if (["a", "button", "input", "textarea", "select", "summary", "option", "label"].includes(tag)) return true;
      if (node.hasAttribute("contenteditable")) return true;
      if (node.hasAttribute("onclick")) return true;
      const role = (node.getAttribute("role") || "").toLowerCase();
      return ["button", "link", "checkbox", "radio", "tab", "menuitem", "switch", "textbox"].includes(role);
    };
    const textForNode = (node) => {
      const raw = (node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
      return raw.length > 140 ? raw.slice(0, 137) + "..." : raw;
    };
    const walk = (node, level) => {
      if (!node || level > maxDepth || node.nodeType !== Node.ELEMENT_NODE) return null;
      const interactiveNode = isInteractiveNode(node);
      const selector = createSelector(node);
      const item = {
        tag: node.tagName.toLowerCase(),
        text: textForNode(node),
        selector,
        interactive: interactiveNode,
        children: [],
      };
      if (interactiveNode) {
        const ref = "r" + (++refCounter);
        refMap[ref] = { selector };
        interactive.push({
          ref,
          tag: item.tag,
          text: item.text,
          selector,
        });
        item.ref = ref;
      }
      if (!compactMode && level < maxDepth) {
        for (const child of Array.from(node.children || [])) {
          const next = walk(child, level + 1);
          if (next) item.children.push(next);
        }
      }
      return item;
    };

    const tree = [];
    if (compactMode) {
      for (const child of Array.from(root.children || [])) {
        const next = walk(child, 1);
        if (next) tree.push(next);
      }
    } else {
      const rootNode = walk(root, 0);
      if (rootNode) tree.push(rootNode);
    }

    window.__termlingsSnapshotRefs = refMap;
    const text = (root.innerText || root.textContent || "").replace(/\\s+/g, " ").trim();
    return {
      title: document.title,
      url: location.href,
      text: text.length > 5000 ? text.slice(0, 5000) : text,
      interactive,
      nodes: tree,
    };
  })()`;

  return await evaluate(session, source);
}

async function openPageSession(ctx, tab) {
  if (!tab || !tab.targetId) {
    throw new Error("Selected tab does not expose a valid Chrome DevTools target id");
  }
  const session = new CDPSession(ctx.browserWsUrl, ctx.timeoutMs);
  await session.open();
  const attach = await session.send("Target.attachToTarget", {
    targetId: tab.targetId,
    flatten: true,
  }, null);
  const sessionId = typeof attach?.sessionId === "string" ? attach.sessionId : "";
  if (!sessionId) {
    await session.close();
    throw new Error(`Chrome did not return a session id for tab ${tab.targetId}`);
  }
  session.sessionId = sessionId;
  return session;
}

async function runCommand(ctx, commandArgs) {
  const [command, ...rest] = commandArgs;
  const selectedTabRef = (process.env.TERMLINGS_BROWSER_SELECTED_TAB_ID || "").trim() || undefined;
  if (!command) {
    throw new Error("Missing browser command");
  }

  if (command === "tab") {
    const tabs = collectVisibleTabs(await fetchJson(`${ctx.httpBase}/json`, ctx.timeoutMs), {
      selectedTargetId: selectedTabRef,
    });
    const [subcommand, ...tabArgs] = rest;

    if (!subcommand || subcommand === "list") {
      const active = tabs.find((tab) => tab.active)?.id;
      return {
        active: active === undefined ? undefined : Number.parseInt(active, 10),
        tabs: tabs.map((tab) => ({
          index: Number.parseInt(tab.id, 10),
          targetId: tab.targetId,
          title: tab.title,
          url: tab.url,
          active: tab.active,
        })),
      };
    }

    if (subcommand === "new") {
      const url = tabArgs[0] && String(tabArgs[0]).trim().length > 0 ? String(tabArgs[0]) : "about:blank";
      const response = await fetch(`${ctx.httpBase}/json/new?${encodeURIComponent(url)}`, {
        method: "PUT",
        signal: AbortSignal.timeout(ctx.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Chrome refused to create a new tab (${response.status})`);
      }
      const created = await response.json();
      const refreshedTabs = collectVisibleTabs(await fetchJson(`${ctx.httpBase}/json`, ctx.timeoutMs), {
        selectedTargetId: created.id,
      });
      const descriptor = refreshedTabs.find((tab) => tab.targetId === created.id) || resolveTabReference(created.id, refreshedTabs);
      return {
        index: Number.parseInt(descriptor.id, 10),
        targetId: descriptor.targetId,
        total: refreshedTabs.length,
      };
    }

    if (subcommand === "close") {
      const target = resolveTabReference(tabArgs[0] || selectedTabRef, tabs);
      const response = await fetch(`${ctx.httpBase}/json/close/${target.targetId}`, {
        method: "GET",
        signal: AbortSignal.timeout(ctx.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Chrome refused to close tab ${target.id} (${response.status})`);
      }
      const refreshedTabs = collectVisibleTabs(await fetchJson(`${ctx.httpBase}/json`, ctx.timeoutMs), {
        selectedTargetId: selectedTabRef,
      });
      return {
        closed: Number.parseInt(target.id, 10),
        closedTargetId: target.targetId,
        remaining: refreshedTabs.length,
      };
    }

    const target = resolveTabReference(subcommand, tabs);
    const response = await fetch(`${ctx.httpBase}/json/activate/${target.targetId}`, {
      method: "GET",
      signal: AbortSignal.timeout(Math.min(2500, ctx.timeoutMs)),
    });
    if (!response.ok) {
      throw new Error(`Chrome refused to activate tab ${target.id} (${response.status})`);
    }
    return {
      index: Number.parseInt(target.id, 10),
      targetId: target.targetId,
      url: target.url,
      title: target.title,
    };
  }

  const visibleTabs = collectVisibleTabs(await fetchJson(`${ctx.httpBase}/json`, ctx.timeoutMs), {
    selectedTargetId: selectedTabRef,
  });
  const selectedTab = resolveTabReference(selectedTabRef, visibleTabs);
  const session = await openPageSession(ctx, selectedTab);

  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");

    if (command === "open") {
      const url = rest[0];
      if (!url) throw new Error("Missing URL for open");
      const loadPromise = session.waitForEvent("Page.loadEventFired", null, Math.min(ctx.timeoutMs, 8000)).catch(() => null);
      await session.send("Page.navigate", { url });
      await Promise.race([loadPromise, new Promise((resolve) => setTimeout(resolve, 250))]);
      await waitForReady(session, Math.min(ctx.timeoutMs, 8000));
      return {
        url: await evaluate(session, "location.href"),
        title: await evaluate(session, "document.title"),
      };
    }

    if (command === "screenshot") {
      const fullPage = rest.includes("--full");
      const pathArg = rest.find((arg) => !arg.startsWith("-"));
      if (!pathArg) throw new Error("Missing output path for screenshot");
      const result = await session.send("Page.captureScreenshot", {
        format: pathArg.toLowerCase().endsWith(".jpg") || pathArg.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png",
        captureBeyondViewport: fullPage,
      });
      const base64 = typeof result?.data === "string" ? result.data : "";
      if (!base64) {
        throw new Error("Chrome returned an empty screenshot payload");
      }
      const bytes = Buffer.from(base64, "base64");
      writeFileSync(pathArg, bytes);
      return { path: pathArg };
    }

    if (command === "type") {
      const [selector, text] = rest;
      if (!selector || text === undefined) throw new Error("Usage: type <selector> <text>");
      const result = await evaluate(session, selectorExpression(selector, `
        try { element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch {}
        try { element.focus({ preventScroll: true }); } catch { try { element.focus(); } catch {} }
        if ("value" in element) {
          element.value = ${JSON.stringify(text)};
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          return { ok: true, mode: "value" };
        }
        const contenteditable = element.getAttribute("contenteditable");
        if (contenteditable && contenteditable !== "false") {
          element.textContent = ${JSON.stringify(text)};
          element.dispatchEvent(new InputEvent("input", { bubbles: true, data: ${JSON.stringify(text)} }));
          return { ok: true, mode: "contenteditable" };
        }
        return { ok: false, reason: "not-typeable", selector };
      `));
      if (!result || result.ok !== true) {
        throw new Error(result?.reason === "not-found" ? `Element not found for type target: ${selector}` : `Element is not typeable: ${selector}`);
      }
      return { typed: true };
    }

    if (command === "keyboard") {
      const [subcommand, ...keyboardArgs] = rest;
      if (subcommand !== "type") {
        throw new Error(`Unsupported keyboard subcommand: ${subcommand || ""}`);
      }
      const text = keyboardArgs.join(" ");
      await session.send("Input.insertText", { text });
      return { typed: true };
    }

    if (command === "click") {
      const selector = rest[0];
      if (!selector) throw new Error("Usage: click <selector>");
      const result = await evaluate(session, selectorExpression(selector, `
        try { element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch {}
        try { element.focus({ preventScroll: true }); } catch { try { element.focus(); } catch {} }
        const rect = element.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          element.click();
          return { ok: true, clicked: "fallback" };
        }
        element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        element.click();
        return { ok: true, clicked: "dom" };
      `));
      if (!result || result.ok !== true) {
        throw new Error(`Element not found for click selector: ${selector}`);
      }
      return { clicked: true };
    }

    if (command === "press") {
      const key = rest[0];
      if (!key) throw new Error("Usage: press <key>");
      const descriptor = keyDescriptor(key);
      await session.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: descriptor.key,
        code: descriptor.code,
        windowsVirtualKeyCode: descriptor.keyCode,
        nativeVirtualKeyCode: descriptor.keyCode,
        text: descriptor.text,
        unmodifiedText: descriptor.text,
      });
      await session.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: descriptor.key,
        code: descriptor.code,
        windowsVirtualKeyCode: descriptor.keyCode,
        nativeVirtualKeyCode: descriptor.keyCode,
      });
      return { pressed: key };
    }

    if (command === "wait") {
      const target = rest[0];
      if (!target) throw new Error("Usage: wait <selector|ms>");
      if (/^\d+$/.test(target)) {
        await new Promise((resolve) => setTimeout(resolve, Number.parseInt(target, 10)));
        return { waited: Number.parseInt(target, 10) };
      }
      const startedAt = Date.now();
      while (Date.now() - startedAt < ctx.timeoutMs) {
        const found = await evaluate(session, `Boolean(document.querySelector(${JSON.stringify(target)}))`);
        if (found === true) {
          return { selector: target, ready: true };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out waiting for selector: ${target}`);
    }

    if (command === "get" && rest[0] === "text" && rest[1] === "body") {
      return {
        text: await evaluate(session, "(document.body && (document.body.innerText || document.body.textContent)) || ''"),
      };
    }

    if (command === "cookies") {
      const pageUrl = await evaluate(session, "location.href");
      const result = await session.send("Network.getCookies", {
        urls: typeof pageUrl === "string" && pageUrl ? [pageUrl] : [],
      });
      return { cookies: Array.isArray(result?.cookies) ? result.cookies : [] };
    }

    if (command === "snapshot") {
      return await buildSnapshot(session, parseSnapshotArgs(rest));
    }

    if (command === "eval") {
      const script = rest.join(" ");
      if (!script.trim()) throw new Error("Usage: eval <script>");
      return { result: await evaluate(session, script) };
    }

    throw new Error(`Unsupported browser runner command: ${command}`);
  } finally {
    await session.close();
  }
}

async function createRunContext(cdpTarget) {
  const httpBase = resolveHttpBase(cdpTarget);
  const version = await fetchJson(`${httpBase}/json/version`, normalizeTimeoutMs(process.env.TERMLINGS_BROWSER_TIMEOUT_MS, 30000));
  const browserWsUrl = typeof version?.webSocketDebuggerUrl === "string" ? version.webSocketDebuggerUrl : "";
  if (!browserWsUrl) {
    throw new Error("Chrome did not expose a browser-level DevTools websocket");
  }
  return {
    httpBase,
    browserWsUrl,
    timeoutMs: normalizeTimeoutMs(process.env.TERMLINGS_BROWSER_TIMEOUT_MS, 30000),
  };
}

async function main() {
  try {
    const { cdpTarget, commandArgs } = parseRunnerArgs(process.argv.slice(2));
    const ctx = await createRunContext(cdpTarget);
    const data = await runCommand(ctx, commandArgs);
    process.stdout.write(`${JSON.stringify({ success: true, data })}\n`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ success: false, error: message })}\n`);
    process.exit(1);
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(currentFilePath);
if (isMain) {
  await main();
}
