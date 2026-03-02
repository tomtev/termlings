import { join } from "path";
import { homedir } from "os";

const HOOK_SCRIPT_NAME = "termlings-hooks.sh";
const HOOK_SCRIPT_PATH = join(homedir(), ".claude", "hooks", HOOK_SCRIPT_NAME);
const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

type HookEntry = { hooks?: Array<{ command?: string }> };

function filterTermlingsHooks(entries: unknown[] | undefined): { filtered: HookEntry[]; changed: boolean } {
  const typed = (entries || []) as HookEntry[];
  const filtered = typed.filter(
    (entry) => !entry.hooks?.some((hook) => hook.command === HOOK_SCRIPT_PATH),
  );
  return { filtered, changed: filtered.length !== typed.length };
}

export async function uninstallTermlingsHooks(): Promise<{ scriptRemoved: boolean; settingsUpdated: boolean }> {
  const { readFile, writeFile, unlink, mkdir } = await import("fs/promises");

  let settingsUpdated = false;
  try {
    const raw = await readFile(CLAUDE_SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const hooks = (settings.hooks || {}) as Record<string, unknown[]>;
    let changed = false;

    for (const [event, entries] of Object.entries(hooks)) {
      const { filtered, changed: eventChanged } = filterTermlingsHooks(entries);
      if (!eventChanged) continue;
      changed = true;
      if (filtered.length > 0) {
        hooks[event] = filtered as unknown[];
      } else {
        delete hooks[event];
      }
    }

    if (changed) {
      if (Object.keys(hooks).length > 0) {
        settings.hooks = hooks;
      } else {
        delete settings.hooks;
      }
      await mkdir(join(homedir(), ".claude"), { recursive: true }).catch(() => {});
      await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
      settingsUpdated = true;
    }
  } catch {
    // Missing/invalid settings are fine.
  }

  let scriptRemoved = false;
  try {
    await unlink(HOOK_SCRIPT_PATH);
    scriptRemoved = true;
  } catch {
    // Script may not exist; that's fine.
  }

  return { scriptRemoved, settingsUpdated };
}
