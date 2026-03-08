import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;
  if (!env?.KV || !env?.STRIPE_SECRET_KEY || !env?.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'Service not configured.' }, { status: 503 });
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const dna = session.metadata?.dna;
  const email = session.metadata?.email;

  if (!dna || !email) {
    return json({ error: 'Missing metadata.' }, { status: 400 });
  }

  const dnaKey = `dna:${dna}`;
  const emailKey = `email:${email}`;

  // Race protection
  const existing = await env.KV.get(dnaKey, 'json');
  if (existing) {
    if (session.payment_intent && typeof session.payment_intent === 'string') {
      await stripe.refunds.create({ payment_intent: session.payment_intent });
    }
    return json({ error: 'DNA was claimed by someone else. Refund issued.' });
  }

  // Write the claim
  await env.KV.put(dnaKey, JSON.stringify({ email, claimedAt: new Date().toISOString() }));

  // Append to user's DNA list
  const existingDnas = await env.KV.get(emailKey, 'json') as string[] | null;
  const dnas = existingDnas ?? [];
  dnas.push(dna);
  await env.KV.put(emailKey, JSON.stringify(dnas));

  return json({ claimed: true, dna });
};
