/**
 * Simple interactive menu selector for terminal
 * No external dependencies - uses raw ANSI codes and readline
 */

import { createInterface, Interface } from "readline";
import type { Readable, Writable } from "stream";

const ANSI_RESET = "\x1b[0m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_TITLE = "\x1b[38;5;117m";
const ANSI_TITLE_RULE = "\x1b[38;5;67m";
const ANSI_ITEM = "\x1b[38;5;252m";
const ANSI_ITEM_SELECTED = "\x1b[48;5;24m\x1b[38;5;231m";
const ANSI_ITEM_DESC = "\x1b[38;5;245m";
const ANSI_FOOTER = "\x1b[38;5;244m";
const ANSI_HINT = "\x1b[38;5;242m";
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function supportsAnsi(output: Writable): boolean {
  const stream = output as NodeJS.WriteStream;
  return stream.isTTY === true;
}

function visibleLength(input: string): number {
  return input.replace(ANSI_ESCAPE, "").length;
}

export interface MenuItem {
  label: string;
  value: string;
  description?: string;
  accentColor?: string;
}

/**
 * Display an interactive menu and return the selected value
 */
export async function selectMenu(
  items: MenuItem[],
  title?: string,
  options?: { input?: Readable; output?: Writable; footer?: string; header?: string; titleNote?: string }
): Promise<string> {
  const input = options?.input || process.stdin;
  const output = options?.output || process.stdout;

  // Clear selection if terminal supports it
  output.write("\x1b[?25l"); // Hide cursor

  const rl = createInterface({ input, output, terminal: true });

  return new Promise<string>((resolve) => {
    let selectedIndex = 0;

    const render = () => {
      // Clear previous output
      output.write("\x1b[2J\x1b[H"); // Clear screen and move cursor to top
      if (options?.header) {
        output.write(options.header + "\n");
      }
      if (title) {
        const width = (output as NodeJS.WriteStream).columns || process.stdout.columns || 80;
        const safeTitle = ` ${title} `;
        const ruleWidth = Math.max(0, width - visibleLength(safeTitle) - 2);
        output.write(`\n${ANSI_TITLE}${ANSI_BOLD}${safeTitle}${ANSI_RESET}${ANSI_TITLE_RULE}${"-".repeat(ruleWidth)}${ANSI_RESET}\n`);
        if (options?.titleNote) {
          const lines = options.titleNote.split("\n");
          for (const line of lines) {
            if (line.length === 0) {
              output.write("\n");
              continue;
            }
            if (line.includes("\x1b[")) {
              output.write(`${line}\n`);
            } else {
              output.write(`${ANSI_FOOTER}${line}${ANSI_RESET}\n`);
            }
          }
        }
      } else {
        output.write("\n");
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const isSelected = i === selectedIndex;
        const prefix = isSelected ? "> " : "  ";
        const labelColor = isSelected ? ANSI_ITEM_SELECTED : ANSI_ITEM;
        output.write(`${labelColor}${prefix}`);
        if (item.accentColor) {
          output.write(`${item.accentColor}■${labelColor} `);
        }
        output.write(`${item.label}${ANSI_RESET}\n`);

        if (item.description) {
          const desc = item.description.split("\n");
          for (const line of desc) {
            output.write(`${ANSI_ITEM_DESC}   ${line}${ANSI_RESET}\n`);
          }
        }
      }

      if (options?.footer) {
        const lines = options.footer.split("\n");
        for (const line of lines) {
          if (line.length === 0) {
            output.write("\n");
            continue;
          }
          if (line.includes("\x1b[")) {
            output.write(`\n${line}`);
          } else {
            output.write(`\n${ANSI_FOOTER}${line}${ANSI_RESET}`);
          }
        }
      }
      output.write(`\n${ANSI_HINT}(up/down to select, Enter to confirm)${ANSI_RESET}`);
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
    const decoratedDefault = supportsAnsi(output)
      ? defaultValue
        ? `${ANSI_FOOTER}Y${ANSI_RESET}/n`
        : `y/${ANSI_FOOTER}N${ANSI_RESET}`
      : defaultStr;

    rl.question(`${message} [${decoratedDefault}] `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === "") {
        resolve(defaultValue);
      } else {
        resolve(normalized === "y" || normalized === "yes");
      }
    });
  });
}

export interface GridItem {
  label: string;
  title?: string;
  value: string;
  avatar: string; // Terminal-rendered avatar
  disabled?: boolean; // Grayed out if true
}

/**
 * Display agents in a grid with their small avatars
 * Navigate with arrow keys, select with Enter
 * Grid is responsive to terminal width
 */
export async function selectAgentGrid(
  items: GridItem[],
  title?: string,
  options?: { input?: Readable; output?: Writable }
): Promise<string> {
  const input = options?.input || process.stdin;
  const output = options?.output || process.stdout;

  output.write("\x1b[?25l"); // Hide cursor

  const rl = createInterface({ input, output, terminal: true });

  return new Promise<string>((resolve) => {
    let selectedIndex = items.findIndex((item) => !item.disabled);
    if (selectedIndex === -1) selectedIndex = 0;

    // Get avatar lines for all items
    const avatarLines: string[][] = items.map((item) => item.avatar.split("\n"));
    const maxLines = Math.max(...avatarLines.map((lines) => lines.length));

    // Calculate responsive columns based on terminal width
    const termWidth = process.stdout.columns || 80;
    const itemWidth = 12; // Avatar width + spacing
    const cols = Math.max(1, Math.floor((termWidth - 4) / itemWidth));
    const rows = Math.ceil(items.length / cols);

    const render = () => {
      output.write("\x1b[2J\x1b[H"); // Clear screen
      if (title) output.write(`${title}\n\n`);

      // Render grid row by row
      for (let row = 0; row < rows; row++) {
        for (let line = 0; line < maxLines; line++) {
          for (let col = 0; col < cols; col++) {
            const index = row * cols + col;
            if (index >= items.length) break;

            const item = items[index]!;
            const avatarLines_ = avatarLines[index]!;
            const avatarLine = avatarLines_[line] || "";

            output.write(avatarLine.padEnd(10));
            output.write("  "); // Spacing between columns
          }
          output.write("\n");
        }

        // Add name row
        for (let col = 0; col < cols; col++) {
          const index = row * cols + col;
          if (index >= items.length) break;

          const item = items[index]!;
          const isSelected = index === selectedIndex;
          const isDisabled = item.disabled;
          const dimGray = "\x1b[90m";
          const cyan = "\x1b[1;36m";
          const reset = "\x1b[0m";

          let nameColor = reset;
          if (isDisabled) {
            nameColor = dimGray;
          } else if (isSelected) {
            nameColor = cyan;
          }

          const name = item.label.substring(0, 10).padEnd(10);
          output.write(`${nameColor}${name}${reset}`);
          output.write("  ");
        }
        output.write("\n");

        // Add title row (muted)
        for (let col = 0; col < cols; col++) {
          const index = row * cols + col;
          if (index >= items.length) break;

          const item = items[index]!;
          const isDisabled = item.disabled;
          const dimGray = isDisabled ? "\x1b[90m" : "\x1b[90m";
          const reset = "\x1b[0m";

          const titleText = item.title ? item.title.substring(0, 10).padEnd(10) : "".padEnd(10);
          output.write(`${dimGray}${titleText}${reset}`);
          output.write("  ");
        }
        output.write("\n\n");
      }

      output.write("\x1b[90m(← → ↑ ↓ to navigate, Enter to select)\x1b[0m");
    };

    render();

    if (input.isTTY) {
      input.setRawMode(true);
      input.setEncoding("utf8");
    }

    const onData = (key: string) => {
      if (key === "\x03" || key === "q") {
        cleanup();
        process.exit(0);
      }

      const currentRow = Math.floor(selectedIndex / cols);
      const currentCol = selectedIndex % cols;
      let newIndex = selectedIndex;

      if (key === "\u001b[A" || key === "k") {
        // Up arrow
        if (currentRow > 0) {
          newIndex = (currentRow - 1) * cols + currentCol;
          if (newIndex >= items.length) newIndex = selectedIndex;
          // Skip disabled items
          while (newIndex !== selectedIndex && items[newIndex]?.disabled) {
            newIndex -= cols;
            if (newIndex < 0) newIndex = selectedIndex;
          }
        }
      } else if (key === "\u001b[B" || key === "j") {
        // Down arrow
        if (currentRow < rows - 1) {
          newIndex = (currentRow + 1) * cols + currentCol;
          if (newIndex >= items.length) newIndex = selectedIndex;
          // Skip disabled items
          while (newIndex !== selectedIndex && items[newIndex]?.disabled) {
            newIndex += cols;
            if (newIndex >= items.length) newIndex = selectedIndex;
          }
        }
      } else if (key === "\u001b[C" || key === "l") {
        // Right arrow
        if (currentCol < cols - 1 && selectedIndex + 1 < items.length) {
          newIndex = selectedIndex + 1;
          // Skip disabled items
          while (newIndex < items.length && items[newIndex]?.disabled) {
            newIndex++;
          }
          if (newIndex >= items.length) newIndex = selectedIndex;
        }
      } else if (key === "\u001b[D" || key === "h") {
        // Left arrow
        if (currentCol > 0) {
          newIndex = selectedIndex - 1;
          // Skip disabled items
          while (newIndex >= 0 && items[newIndex]?.disabled) {
            newIndex--;
          }
          if (newIndex < 0) newIndex = selectedIndex;
        }
      } else if (key === "\r" || key === "\n") {
        // Enter - only if not disabled
        if (!items[selectedIndex]?.disabled) {
          cleanup();
          resolve(items[selectedIndex]!.value);
        }
        return;
      }

      if (newIndex !== selectedIndex) {
        selectedIndex = newIndex;
        render();
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
