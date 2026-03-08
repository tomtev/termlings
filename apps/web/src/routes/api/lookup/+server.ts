import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform }) => {
  const email = url.searchParams.get('email');
  if (!email) {
    return json({ error: 'Missing email parameter.' }, { status: 400 });
  }

  const kv = platform?.env?.KV;
  if (!kv) {
    return json({ error: 'KV not available.' }, { status: 503 });
  }

  const dnas = await kv.get(`email:${email}`, 'json') as string[] | null;
  return json({ dnas: dnas ?? [] });
};
