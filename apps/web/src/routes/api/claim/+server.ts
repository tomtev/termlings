import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const body = await request.json() as { dna?: string; email?: string };
  const { dna, email } = body;

  if (!dna || !/^[0-9a-fA-F]{6,7}$/.test(dna)) {
    return json({ error: 'Invalid DNA. Must be 6-7 hex characters.' }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email address.' }, { status: 400 });
  }

  const env = platform?.env;
  if (!env?.KV || !env?.STRIPE_SECRET_KEY || !env?.STRIPE_PRICE_ID) {
    return json({ error: 'Service not configured.' }, { status: 503 });
  }

  const key = `dna:${dna.toLowerCase()}`;
  const existing = await env.KV.get(key, 'json');
  if (existing) {
    return json({ error: 'This DNA is already claimed.' }, { status: 409 });
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    metadata: { dna: dna.toLowerCase(), email },
    customer_email: email,
    success_url: `https://termlings.com/success?dna=${dna.toLowerCase()}`,
    cancel_url: 'https://termlings.com',
  });

  return json({ url: session.url });
};
