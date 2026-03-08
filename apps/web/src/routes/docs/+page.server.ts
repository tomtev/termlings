import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadRepoDocs } from '$lib/server/docs.ts';

const CACHE_CONTROL = 'public, max-age=300';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  const requestedDoc = url.searchParams.get('doc');

  if (requestedDoc) {
    const normalizedSlug = requestedDoc
      .trim()
      .toLowerCase()
      .replace(/\.md$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (normalizedSlug) {
      if (normalizedSlug === 'install' || normalizedSlug === 'welcome' || normalizedSlug === 'init') {
        throw redirect(307, '/docs');
      }

      const slug =
        normalizedSlug === 'termlings'
          ? 'agents'
          : normalizedSlug;
      throw redirect(307, `/docs/${encodeURIComponent(slug)}`);
    }
  }

  try {
    const docs = await loadRepoDocs({ requestedSlug: 'install' });

    setHeaders({
      'cache-control': CACHE_CONTROL
    });

    return docs;
  } catch {
    throw error(502, 'Unable to load docs from the termlings repository.');
  }
};
