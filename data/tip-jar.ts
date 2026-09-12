/**
 * The tip jar's contents — the one place its payment details live.
 *
 * Every footer renders these through components/TipJar.tsx. The two static
 * pages (public/contact.html, public/accessibility.html) carry a rendered copy
 * written by scripts/sync-tip-jar.tsx, and tests/tip_jar_test.tsx fails if that
 * copy drifts from this file, or while any entry below is still unset.
 *
 * Addresses are case-sensitive and checksummed: paste them, never retype them.
 * An unset entry (null) is not rendered at all, so a half-filled jar never
 * shows a visitor a placeholder.
 */

export interface TipAddress {
  symbol: 'BTC' | 'ETH' | 'XMR' | 'ZEC';
  name: string;
  address: string | null;
}

/** A Stripe Payment Link where the customer chooses the amount (buy.stripe.com). */
export const STRIPE_TIP_LINK: string | null = null;

export const TIP_ADDRESSES: readonly TipAddress[] = [
  { symbol: 'BTC', name: 'Bitcoin', address: null },
  { symbol: 'ETH', name: 'Ether', address: null },
  {
    symbol: 'XMR',
    name: 'Monero',
    address: '88MyQZLzKD8Z5q1eydqNLnG7aW8njaA3XChyVRuXb5FHh14a45KK98xHagruiPK5AfPxnHF281nQFfpEuQBTZyhM2vo8f35',
  },
  { symbol: 'ZEC', name: 'Zcash', address: null },
];
