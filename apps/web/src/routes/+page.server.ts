import type { PageServerLoad } from './$types';
import { getLatestTermlingsRelease } from '$lib/server/termlings-version';

function formatRelativeReleaseAge(publishedAt: string | null, now = new Date()): string | null {
  if (!publishedAt) {
    return null;
  }

  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) {
    return null;
  }

  const diffMs = published.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absMs < dayMs) {
    return rtf.format(Math.round(diffMs / hourMs), 'hour');
  }

  if (absMs < weekMs) {
    return rtf.format(Math.round(diffMs / dayMs), 'day');
  }

  if (absMs < monthMs) {
    return rtf.format(Math.round(diffMs / weekMs), 'week');
  }

  if (absMs < yearMs) {
    return rtf.format(Math.round(diffMs / monthMs), 'month');
  }

  return rtf.format(Math.round(diffMs / yearMs), 'year');
}

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
  const latestRelease = await getLatestTermlingsRelease(fetch);
  const latestVersion = latestRelease.version;

  setHeaders({
    'cache-control': 'public, max-age=300'
  });

  return {
    latestVersion,
    latestVersionAge: formatRelativeReleaseAge(latestRelease.publishedAt),
    installCommand: 'npx termlings@latest --spawn',
    installHint: 'Fastest first run. Requires Bun.',
    installLabel: 'START'
  };
};
