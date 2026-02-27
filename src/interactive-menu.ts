/**
 * Simple interactive menu selector for terminal
 * No external dependencies - uses raw ANSI codes and readline
 */

import { createInterface, Interface } from "readline";
import type { Readable, Writable } from "stream";

export interface MenuItem {
  label: string;
  value: string;
  description?: string;
}

/**
 * Display an interactive menu and return the selected value
 */
export async function selectMenu(
  items: MenuItem[],
  title?: string,
  options?: { input?: Readable; output?: Writable }
): Promise<string> {
  const input = options?.input || process.stdin;
  const output = options?.output || process.stdout;

  // Clear selection if terminal supports it
  output.write("\x1b[?25l"); // Hide cursor

  const rl = createInterface({ input, output, terminal: true });

  return new Promise<string>((resolve) => {
    let selectedIndex = 0;
    const titleStr = title ? `\n${title}\n` : "";

    const render = () => {
      // Clear previous output
      output.write("\x1b[2J\x1b[H"); // Clear screen and move cursor to top
      output.write(titleStr);

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const isSelected = i === selectedIndex;
        const prefix = isSelected ? "▶ " : "  ";
        const labelColor = isSelected ? "\x1b[1;36m" : "\x1b[0m"; // Cyan if selected, normal otherwise
        const reset = "\x1b[0m";
        const dimGray = "\x1b[90m"; // Dim gray for descriptions

        output.write(`${labelColor}${prefix}${item.label}${reset}\n`);

        if (item.description) {
          output.write(`${dimGray}   ${item.description}${reset}\n`);
        }
      }

      output.write("\n\x1b[90m(↑/↓ to select, Enter to confirm)\x1b[0m");
    };

    render();

    // Handle raw key input
    if (input.isTTY) {
      input.setRawMode(true);
      input.setEncoding("utf8");
    }

    const onData = (key: string) => {
      if (key === "\x03" || key === "q") {
        // Ctrl+C or 'q' to exit
        cleanup();
        process.exit(0);
      }

      if (key === "\u001b[A" || key === "k") {
        // Up arrow or 'k'
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        render();
      } else if (key === "\u001b[B" || key === "j") {
        // Down arrow or 'j'
        selectedIndex = (selectedIndex + 1) % items.length;
        render();
      } else if (key === "\r" || key === "\n") {
        // Enter
        cleanup();
        resolve(items[selectedIndex]!.value);
      }
    };

    const cleanup = () => {
      if (input.isTTY) {
        input.setRawMode(false);
      }
      output.write("\x1b[?25h"); // Show cursor
      rl.close();
      input.removeListener("data", onData);
    };

    input.on("data", onData);
  });
}

/**
 * Display a yes/no confirmation dialog
 */
export async function confirm(
  message: string,
  defaultValue: boolean = false,
  options?: { input?: Readable; output?: Writable }
): Promise<boolean> {
  const input = options?.input || process.stdin;
  const output = options?.output || process.stdout;

  const rl = createInterface({ input, output });

  return new Promise<boolean>((resolve) => {
    const defaultStr = defaultValue ? "Y/n" : "y/N";
    rl.question(`${message} (${defaultStr}) `, (answer) => {
      rl.close();
      if (answer === "") {
        resolve(defaultValue);
      } else {
        resolve(answer.toLowerCase() === "y");
      }
    });
  });
}
