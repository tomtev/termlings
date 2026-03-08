import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const dna = url.searchParams.get('dna');
  if (!dna || !/^[0-9a-fA-F]{6,7}$/.test(dna)) {
    return json({ error: 'Invalid DNA. Must be 6-7 hex characters.' }, { status: 400 });
  }

  const kv = platform?.env?.KV;
  if (!kv) {
    return json({ error: 'KV not available.' }, { status: 503 });
  }

  const key = `dna:${dna.toLowerCase()}`;
  const claim = await kv.get(key, 'json') as { email: string; claimedAt: string } | null;

  if (!claim) {
    return json({ available: true });
  }

  return json({
    available: false,
    claimedBy: maskEmail(claim.email),
  });
};
