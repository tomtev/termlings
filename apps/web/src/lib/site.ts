export const SITE_NAME = 'termlings';
export const SITE_ORIGIN = 'https://termlings.com';
export const SITE_DESCRIPTION =
  'Termlings turns your terminal into a live AI startup: a full agent team building and marketing products around the clock, coordinating work in real time, running browser workflows, and shipping outcomes end to end from one shared command center.';
export const SITE_OG_IMAGE_URL = `${SITE_ORIGIN}/og-v3.png?v=20260308-1`;

export function toCanonicalUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalizedPath, SITE_ORIGIN).toString();
}
