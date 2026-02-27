import { join } from "path";
import { homedir } from "os";

const HOOK_SCRIPT_NAME = "termlings-hooks.sh";
const HOOK_SCRIPT_PATH = join(homedir(), ".claude", "hooks", HOOK_SCRIPT_NAME);
const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

// Hook into the same Claude events that touchgrass uses
const HOOK_EVENTS = ["UserPromptSubmit", "Stop", "PermissionRequest"] as const;

function buildHookEntry(event: string): { matcher?: string; hooks: { type: string; command: string; async: boolean; timeout: number }[] } {
  const entry: { matcher?: string; hooks: { type: string; command: string; async: boolean; timeout: number }[] } = {
    hooks: [{ type: "command", command: HOOK_SCRIPT_PATH, async: true, timeout: 2 }],
  };
  if (event === "PermissionRequest") {
    entry.matcher = "*";
  }
  return entry;
}

export async function installTermlingsHooks(): Promise<{ scriptInstalled: boolean; settingsUpdated: boolean }> {
  const { readFile, writeFile, copyFile, chmod, mkdir } = await import("fs/promises");

  // Ensure hooks dir exists
  const hooksDir = join(homedir(), ".claude", "hooks");
  await mkdir(hooksDir, { recursive: true, mode: 0o700 }).catch(() => {});

  // Copy hook script from src to ~/.claude/hooks/
  let scriptInstalled = false;
  try {
    const bundledScript = join(import.meta.dir, HOOK_SCRIPT_NAME);
    await copyFile(bundledScript, HOOK_SCRIPT_PATH);
    await chmod(HOOK_SCRIPT_PATH, 0o755);
    scriptInstalled = true;
  } catch {
    // Script copy failed — not fatal
  }

  // Update ~/.claude/settings.json with hook entries
  let settingsUpdated = false;
  try {
    let settings: Record<string, unknown> = {};
    try {
      const raw = await readFile(CLAUDE_SETTINGS_PATH, "utf-8");
      settings = JSON.parse(raw);
    } catch {
      // No existing settings — start fresh
    }

    const hooks = (settings.hooks || {}) as Record<string, unknown[]>;
    let needsWrite = false;

    for (const event of HOOK_EVENTS) {
      const existing = hooks[event] as Array<{ hooks?: Array<{ command?: string }> }> | undefined;
      const alreadyInstalled = existing?.some(
        (entry) => entry.hooks?.some((h) => h.command === HOOK_SCRIPT_PATH)
      );
      if (!alreadyInstalled) {
        if (!hooks[event]) hooks[event] = [];
        (hooks[event] as unknown[]).push(buildHookEntry(event));
        needsWrite = true;
      }
    }

    if (needsWrite) {
      settings.hooks = hooks;
      // Ensure ~/.claude/ directory exists
      await mkdir(join(homedir(), ".claude"), { recursive: true }).catch(() => {});
      await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
      settingsUpdated = true;
    }
  } catch {
    // Settings update failed — not fatal
  }

  return { scriptInstalled, settingsUpdated };
}
