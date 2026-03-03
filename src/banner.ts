/**
 * Shared banner renderer — composites the 👾 logo with text side-by-side.
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";
import { renderTermlingsLogo } from "./index.js";
import type { UpdateNotice } from "./update-check.js";

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_PATTERN, "");
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Render the 👾 logo with text lines beside it.
 * Logo is ~5 lines tall; text lines are vertically centered next to it.
 */
export function renderBanner(textLines: string[]): string {
  const logo = renderTermlingsLogo();
  const logoLines = logo.split("\n");

  const gap = "  "; // space between logo and text
  const logoWidth = Math.max(...logoLines.map((l) => stripAnsi(l).length));

  // Pad text to match logo height, centering vertically
  const totalHeight = Math.max(logoLines.length, textLines.length);
  const textOffset = Math.max(0, Math.floor((logoLines.length - textLines.length) / 2));

  const outputLines: string[] = [];
  for (let i = 0; i < totalHeight; i++) {
    const logoPart = logoLines[i] ?? "";
    const logoPad = " ".repeat(Math.max(0, logoWidth - stripAnsi(logoPart).length));
    const textIdx = i - textOffset;
    const textPart = textIdx >= 0 && textIdx < textLines.length ? textLines[textIdx]! : "";
    outputLines.push(logoPart + logoPad + gap + textPart);
  }

  return outputLines.join("\n");
}

/**
 * Print the logo + version only (no status message).
 */
export function printBanner(): void {
  const version = readVersion();
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const muted = "\x1b[38;5;245m";
  const purple = "\x1b[38;2;138;43;226m";

  const lines = [
    `${purple}${bold}termlings${reset} ${muted}v${version}${reset}`,
  ];

  console.log("");
  console.log(renderBanner(lines));
  console.log("");
}

/**
 * Print the "no workspace found" banner (before init prompts or TUI launch).
 */
export function printInitBanner(): void {
  const version = readVersion();
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const muted = "\x1b[38;5;245m";
  const purple = "\x1b[38;2;138;43;226m";

  const lines = [
    `${purple}${bold}termlings${reset} ${muted}v${version}${reset}`,
    "",
    `${muted}No workspace found in this directory.${reset}`,
    `${muted}Run ${reset}${bold}termlings init${reset}${muted} to set up.${reset}`,
  ];

  console.log("");
  console.log(renderBanner(lines));
  console.log("");
}

/**
 * Print the post-init success banner.
 */
export function printPostInitBanner(agentCount: number): void {
  const version = readVersion();
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const muted = "\x1b[38;5;245m";
  const green = "\x1b[38;5;121m";
  const purple = "\x1b[38;2;138;43;226m";

  const lines = [
    `${purple}${bold}termlings${reset} ${muted}v${version}${reset}`,
    "",
    `${green}✓ Workspace initialized${reset}`,
    `${muted}${agentCount} agent${agentCount === 1 ? "" : "s"} ready${reset}`,
  ];

  console.log("");
  console.log(renderBanner(lines));
  console.log("");
}

/**
 * Print the "update available" banner with logo.
 */
export function printUpdateBanner(currentVer: string, latestVer: string, upgradeCmd: string): void {
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const muted = "\x1b[38;5;245m";
  const current = "\x1b[38;5;181m";
  const latest = "\x1b[38;5;121m";
  const cmd = "\x1b[38;5;228m";
  const purple = "\x1b[38;2;138;43;226m";

  const lines = [
    `${purple}${bold}termlings${reset} ${muted}update available${reset}`,
    "",
    `${current}${currentVer}${reset} ${muted}→${reset} ${latest}${latestVer}${reset}`,
    `${muted}Upgrade:${reset} ${cmd}${bold}${upgradeCmd}${reset}`,
  ];

  console.log("");
  console.log(renderBanner(lines));
  console.log("");
}

/**
 * Show an interactive update menu with the 👾 logo.
 * Returns "skip" if the user chose to continue, or exits after updating.
 */
export async function showUpdateMenu(notice: UpdateNotice): Promise<void> {
  const { selectMenu } = await import("./interactive-menu.js");
  const { writeSkippedVersion } = await import("./update-check.js");

  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const muted = "\x1b[38;5;245m";
  const current = "\x1b[38;5;181m";
  const latest = "\x1b[38;5;121m";
  const purple = "\x1b[38;2;138;43;226m";

  const headerLines = [
    `${purple}${bold}termlings${reset} ${muted}update available${reset}`,
    "",
    `${current}${notice.currentVersion}${reset} ${muted}→${reset} ${latest}${notice.latestVersion}${reset}`,
  ];
  const header = renderBanner(headerLines);

  const items = [
    {
      label: "Update now",
      value: "update",
      description: notice.recommendedUpgradeCommand,
    },
    {
      label: "Skip",
      value: "skip",
      description: "Continue without updating",
    },
    {
      label: "Skip until next version",
      value: "skip-version",
      description: `Don't remind me about v${notice.latestVersion}`,
    },
  ];

  const choice = await selectMenu(items, undefined, { header });

  if (choice === "update") {
    console.log(`\n${muted}Running:${reset} ${bold}${notice.recommendedUpgradeCommand}${reset}\n`);
    try {
      execSync(notice.recommendedUpgradeCommand, { stdio: "inherit" });
      console.log(`\n${latest}✓ Updated to v${notice.latestVersion}${reset}`);
    } catch {
      console.error(`\nUpdate failed. Run manually: ${notice.recommendedUpgradeCommand}`);
    }
    process.exit(0);
  }

  if (choice === "skip-version") {
    writeSkippedVersion(notice.latestVersion);
  }
}
