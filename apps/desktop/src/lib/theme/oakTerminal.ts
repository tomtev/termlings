import type { ITheme } from '@xterm/xterm';
import type { ResolvedTheme } from '../stores/theme';

type RGB = { r: number; g: number; b: number };

export function getOakToken(name: string): string {
  const root = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (root) {
    return root;
  }
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function parseHex(input: string): RGB {
  const value = input.trim().replace(/^#/, '');
  const normalized = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: RGB): string {
  const hex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function mix(left: string, right: string, leftWeight = 0.5): string {
  const a = parseHex(left);
  const b = parseHex(right);
  const weight = Math.max(0, Math.min(1, leftWeight));
  return toHex({
    r: a.r * weight + b.r * (1 - weight),
    g: a.g * weight + b.g * (1 - weight),
    b: a.b * weight + b.b * (1 - weight),
  });
}

export function getOakMonoFont(): string {
  return getOakToken('--font-mono') || 'ui-monospace, Consolas, monospace';
}

export function getOakTerminalTheme(theme: ResolvedTheme): ITheme {
  const background = getOakToken('--background');
  const foreground = getOakToken('--foreground');
  const card = getOakToken('--card');
  const border = getOakToken('--border');
  const primary = getOakToken('--primary');
  const danger = getOakToken('--danger');
  const success = getOakToken('--success');
  const warning = getOakToken('--warning');
  const muted = getOakToken('--muted');
  const mutedForeground = getOakToken('--muted-foreground');

  const isDark = theme === 'dark';
  const blue = isDark ? mix(primary, foreground, 0.72) : mix(primary, background, 0.88);
  const magenta = mix(primary, danger, 0.58);
  const cyan = mix(primary, success, 0.42);

  return {
    background,
    foreground,
    cursor: mix(primary, foreground, isDark ? 0.62 : 0.82),
    cursorAccent: background,
    selectionBackground: mix(primary, background, isDark ? 0.18 : 0.12),
    black: isDark ? mix(background, foreground, 0.9) : mix(foreground, background, 0.9),
    red: danger,
    green: success,
    yellow: warning,
    blue,
    magenta,
    cyan,
    white: isDark ? mix(foreground, mutedForeground, 0.55) : mix(background, foreground, 0.78),
    brightBlack: border,
    brightRed: mix(danger, foreground, isDark ? 0.72 : 0.82),
    brightGreen: mix(success, foreground, isDark ? 0.68 : 0.78),
    brightYellow: mix(warning, foreground, isDark ? 0.7 : 0.8),
    brightBlue: mix(blue, foreground, isDark ? 0.74 : 0.82),
    brightMagenta: mix(magenta, foreground, isDark ? 0.74 : 0.82),
    brightCyan: mix(cyan, foreground, isDark ? 0.74 : 0.82),
    brightWhite: foreground,
    selectionForeground: foreground,
  };
}
