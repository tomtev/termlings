import { error, isHttpError, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadRepoDocs } from '$lib/server/docs.ts';

const CACHE_CONTROL = 'public, max-age=300';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
  const normalizedSlug = params.doc
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const requestedSlug = normalizedSlug === 'agents' ? 'termlings' : normalizedSlug;

  if (requestedSlug === 'init') {
    throw redirect(307, '/docs');
  }

  try {
    const docs = await loadRepoDocs({ requestedSlug });

    if (!docs.activeDoc || docs.activeSlug !== requestedSlug) {
      throw error(404, 'Doc not found.');
    }

    setHeaders({
      'cache-control': CACHE_CONTROL
    });

    return docs;
  } catch (err) {
    if (isHttpError(err)) {
      throw err;
    }

    throw error(502, 'Unable to load docs from the termlings repository.');
  }
};
