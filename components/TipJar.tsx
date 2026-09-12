/**
 * Tip jar — a collapsed disclosure that sits in every footer.
 *
 * A <details> element, so it opens and closes with no script: the site must
 * work in Tor Browser's safest mode, and a tip jar that needed JavaScript would
 * be the one thing on the page that did. For the same reason there is no copy
 * button — each address is `user-select: all`, so a single tap or click
 * selects the whole string, ready to copy.
 *
 * It brings its own stylesheet. The footers it lives in belong to two themes
 * (the paper landing and the older neon pages), and the rules in
 * /css/tip-jar.css take their colour from whichever footer they are in. A
 * <link> in <body> is allowed for stylesheets, and the jar is collapsed and at
 * the foot of the page, so nothing visible waits on it.
 *
 * What it shows comes from data/tip-jar.ts; entries not yet filled in there are
 * left out, and if nothing is filled in the jar renders nothing.
 */

import { STRIPE_TIP_LINK, TIP_ADDRESSES } from '../data/tip-jar.ts';

/** Render the configured payment options as a script-free disclosure. */
export default function TipJar() {
  const addresses = TIP_ADDRESSES.filter((a) => a.address);
  if (!STRIPE_TIP_LINK && addresses.length === 0) return null;

  return (
    <>
      <link rel='stylesheet' href='/css/tip-jar.css' />
      <details class='tip-jar'>
        <summary>tip jar</summary>
        <div class='tip-jar-body'>
          <p class='tip-jar-note'>Tips keep this place running. Thank you.</p>
          {STRIPE_TIP_LINK && (
            <a class='tip-jar-card' href={STRIPE_TIP_LINK} target='_blank' rel='noopener noreferrer'>
              tip by card <span>via Stripe</span>
            </a>
          )}
          {addresses.length > 0 && (
            <dl class='tip-jar-addresses'>
              {addresses.map(({ symbol, name, address }) => (
                <div class='tip-jar-row' key={symbol}>
                  <dt>
                    <abbr title={name}>{symbol}</abbr>
                  </dt>
                  <dd>
                    {/* notranslate: page translators must not "translate" an address */}
                    <code class='tip-jar-address notranslate'>{address}</code>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </details>
    </>
  );
}
