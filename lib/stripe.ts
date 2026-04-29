/**
 * Stripe Client Initialization
 *
 * Lazy-loads Stripe SDK with secret key from environment.
 * Follows the same pattern as JWT_SECRET and other env-dependent modules.
 */

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

function getStripeSecret(): string {
  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  return secret;
}

export function getStripe(): Stripe {
  if (!_stripe) {
    const secret = getStripeSecret();
    _stripe = new Stripe(secret, {
      apiVersion: '2025-03-31.basial',
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return _stripe;
}

export function getWebhookSecret(): string {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }
  return secret;
}

export const PAYMENT_AMOUNT_CENTS = 300; // $3.00 USD
export const CURRENCY = 'usd';
