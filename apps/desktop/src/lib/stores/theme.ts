import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const theme = writable<Theme>('system');
/** Tracks the OS preference for "system" mode. */
const systemPrefersDark = writable(true);

/** The actual theme applied — always 'dark' or 'light'. */
export const resolvedTheme = derived(
  [theme, systemPrefersDark],
  ([$theme, $sysDark]) => {
    if ($theme === 'system') return $sysDark ? 'dark' : 'light';
    return $theme as ResolvedTheme;
  },
);

let mediaQuery: MediaQueryList | null = null;

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

function resolve(t: Theme): ResolvedTheme {
  if (t === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

export async function loadTheme() {
  try {
    const t = await invoke<string>('get_theme');
    theme.set(t as Theme);
    systemPrefersDark.set(window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(resolve(t as Theme));
    setupMediaListener(t as Theme);
  } catch {
    theme.set('system');
    applyTheme(resolve('system'));
  }
}

export async function setTheme(t: Theme) {
  theme.set(t);
  applyTheme(resolve(t));
  setupMediaListener(t);
  await invoke('set_theme', { theme: t });
}

function setupMediaListener(t: Theme) {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', onSystemChange);
    mediaQuery = null;
  }
  if (t === 'system') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', onSystemChange);
  }
}

function onSystemChange(e: MediaQueryListEvent) {
  systemPrefersDark.set(e.matches);
  applyTheme(e.matches ? 'dark' : 'light');
}
