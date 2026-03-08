const FALLBACK_VERSION = 'latest';

export type TermlingsReleaseInfo = {
  version: string;
  publishedAt: string | null;
};

export async function getLatestTermlingsVersion(fetchFn: typeof fetch): Promise<string> {
  const release = await getLatestTermlingsRelease(fetchFn);
  return release.version;
}

export async function getLatestTermlingsRelease(fetchFn: typeof fetch): Promise<TermlingsReleaseInfo> {
  let latestVersion = FALLBACK_VERSION;
  let publishedAt: string | null = null;

  try {
    const response = await fetchFn('https://registry.npmjs.org/termlings', {
      headers: { accept: 'application/json' }
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        'dist-tags'?: { latest?: string };
        time?: Record<string, string | undefined>;
      };
      const registryVersion = payload?.['dist-tags']?.latest;
      if (registryVersion) {
        latestVersion = registryVersion;
        publishedAt = payload?.time?.[registryVersion] ?? null;
      }
    }
  } catch {
    // Keep fallback when npm registry is unavailable.
  }

  return {
    version: latestVersion,
    publishedAt
  };
}

export { FALLBACK_VERSION };
