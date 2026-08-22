/**
 * The interstitial page shown when someone cannot be let into the
 * questionnaire.
 *
 * Every one of these situations used to be a `302` to the landing page, which
 * told the respondent nothing. The replacement's whole design is: one reason,
 * one door, and the door works. These tests pin that invariant -- exactly one
 * anchor in the action block, pointing somewhere real -- because it is the sort
 * of thing a well-meaning edit adds a second link to.
 *
 * No database, no network, no server. Pure render.
 *
 * Run with: deno test --allow-net --allow-read --allow-write --allow-env \
 *   tests/interstitial_test.tsx
 */

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { render } from 'preact-render-to-string';
import { Interstitial, type InterstitialReason, interstitialResponse } from '../components/Interstitial.tsx';
import { getCurrentHourMetrics } from '../lib/metrics.ts';

const REASONS: InterstitialReason[] = ['nocookie', 'expired', 'notfound'];

/** Where each reason is supposed to send someone. */
const EXPECTED_HREF: Record<InterstitialReason, string> = {
  nocookie: '/#begin',
  expired: '/#begin',
  notfound: '/#begin',
};

/**
 * The `.form-actions` block only -- not the nav, not the footer.
 *
 * Counting anchors across the whole document would count the A4T logo and the
 * two footer links, which are chrome and are allowed to exist. The claim under
 * test is about the action offered to the respondent, so the assertion has to
 * look at the block that holds it. The block contains no nested `<div>`, so the
 * first closing tag after it is its own.
 */
function formActions(html: string): string {
  const start = html.indexOf('<div class="form-actions">');
  assert(start !== -1, 'no .form-actions block was rendered');
  const end = html.indexOf('</div>', start);
  assert(end !== -1, '.form-actions block was never closed');
  return html.slice(start, end);
}

/** Every `href="..."` value in a fragment, in document order. */
function hrefs(fragment: string): string[] {
  return [...fragment.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
}

Deno.test({
  name: 'Interstitial - every reason offers exactly one door, and it leads somewhere',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    for (const reason of REASONS) {
      const found = hrefs(formActions(render(<Interstitial reason={reason} />)));
      assertEquals(found.length, 1, `${reason}: expected exactly one action link, got ${found.length}`);
      assert(found[0].trim() !== '', `${reason}: the one action link has an empty href`);
    }
  },
});

Deno.test({
  name: 'Interstitial - every reason sends the reader back to the gate at /#begin',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    for (const reason of REASONS) {
      const [href] = hrefs(formActions(render(<Interstitial reason={reason} />)));
      assertEquals(href, EXPECTED_HREF[reason], `${reason}: action link points at the wrong place`);
    }
  },
});

/**
 * Regression guard, and the reason this file exists.
 *
 * The page this replaced exited to /login: a form with no method and no action,
 * which does nothing at all without JavaScript, and which -- had it run --
 * produced a session with no keypair that could never be sent a copy. A door
 * that does not open is worse than no door, because the respondent believes
 * they have already tried.
 */
Deno.test({
  name: 'Interstitial - no reason links to the orphaned /login route',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    for (const reason of REASONS) {
      const html = render(<Interstitial reason={reason} draft='something typed' />);
      assertEquals(html.includes('/login'), false, `${reason}: renders a link to /login`);
    }
  },
});

Deno.test({
  name: 'Interstitial - hands a draft back inside a readonly textarea',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    for (const reason of REASONS) {
      const html = render(<Interstitial reason={reason} draft='what I had written' />);
      const match = html.match(/(<textarea\b[^>]*>)([\s\S]*?)<\/textarea>/);
      assert(match !== null, `${reason}: no textarea rendered for a draft`);
      // The open tag only. Matching against tag-plus-content would pass for an
      // editable textarea whose content happened to contain the word.
      assertStringIncludes(match[1], 'readonly', `${reason}: the draft textarea is editable`);
      assertEquals(match[2], 'what I had written', `${reason}: the draft was not handed back verbatim`);
    }
  },
});

/**
 * The draft is whatever the respondent typed, so it is untrusted text in the
 * strictest sense: it comes back down in a page we serve.
 *
 * `>` is deliberately not asserted on. preact-render-to-string escapes `<`,
 * `&`, and `"` and leaves `>` alone, which is correct -- a bare `>` in text
 * content cannot open a tag or break out of an attribute.
 */
Deno.test({
  name: 'Interstitial - escapes HTML-special characters in the draft',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const draft = '<script>alert("x")</script> & <b>bold</b> > done';
    for (const reason of REASONS) {
      const html = render(<Interstitial reason={reason} draft={draft} />);
      assertEquals(html.includes(draft), false, `${reason}: the raw draft appears unescaped`);
      assertEquals(html.includes('<script'), false, `${reason}: an unescaped <script tag reached the page`);
      assertEquals(html.includes('<b>'), false, `${reason}: an unescaped <b> tag reached the page`);
      assertStringIncludes(
        html,
        '&lt;script>alert(&quot;x&quot;)&lt;/script> &amp; &lt;b>bold&lt;/b> > done',
      );
    }
  },
});

Deno.test({
  name: 'Interstitial - renders no textarea when there is nothing to hand back',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    for (const reason of REASONS) {
      for (const draft of [undefined, '', '   ', '\n\t  \n']) {
        const html = render(<Interstitial reason={reason} draft={draft} />);
        assertEquals(
          html.includes('<textarea'),
          false,
          `${reason}: rendered an empty textarea for draft ${JSON.stringify(draft)}`,
        );
      }
    }
  },
});

/**
 * 200, not 4xx: nothing has gone wrong with the request. no-store because the
 * page can carry a draft the respondent typed, and a shared cache must not keep
 * it.
 */
Deno.test({
  name: 'interstitialResponse - 200 text/html, no-store, and a real document',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    for (const reason of REASONS) {
      const res = interstitialResponse(reason);
      assertEquals(res.status, 200, `${reason}: wrong status`);
      assertStringIncludes(res.headers.get('Content-Type') ?? '', 'text/html');
      assertStringIncludes(res.headers.get('Cache-Control') ?? '', 'no-store');
      const body = await res.text();
      assert(body.startsWith('<!DOCTYPE html>'), `${reason}: body does not start with a doctype`);
    }
  },
});

/**
 * The draft has to survive the helper, not just the component.
 *
 * `interstitialResponse(reason, draft)` is what the routes actually call --
 * routes/questionnaire.tsx hands it the typed answer on a failed POST auth, and
 * that call is the entire reason the POST handler reads the body before
 * authenticating. Exercising only `<Interstitial draft=...>` leaves the second
 * parameter untested: a helper that quietly dropped it would still have passed
 * every other test in this file, while losing the respondent's answer exactly
 * as the old redirect did.
 */
Deno.test({
  name: 'interstitialResponse - carries a draft through into the document, escaped',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    for (const reason of REASONS) {
      const body = await interstitialResponse(reason, 'what I had <b>written</b>').text();
      const match = body.match(/(<textarea\b[^>]*>)([\s\S]*?)<\/textarea>/);
      assert(match !== null, `${reason}: the draft never reached the document`);
      assertStringIncludes(match[1], 'readonly', `${reason}: the draft textarea is editable`);
      assertEquals(match[2], 'what I had &lt;b>written&lt;/b>', `${reason}: draft mangled or unescaped`);
      assertEquals(body.includes('<b>'), false, `${reason}: an unescaped tag reached the page`);

      const empty = await interstitialResponse(reason).text();
      assertEquals(empty.includes('<textarea'), false, `${reason}: textarea rendered with no draft`);
    }
  },
});

/**
 * The counter is the stated reason these situations route through one helper:
 * before it they were redirects indistinguishable from ordinary traffic. It is
 * also the only thing here that writes anything down, so this pins both that it
 * happens and that what it writes is a fixed category string -- no fragment of
 * the draft, nothing about the person. See /var/www/CLAUDE.md.
 *
 * Deltas, not absolutes: the counters are process-wide and other tests in the
 * same run touch them.
 */
Deno.test({
  name: 'interstitialResponse - counts the reason, and the metric name carries nothing else',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const draft = 'a-distinctive-thing-I-typed';
    for (const reason of REASONS) {
      const before = { ...getCurrentHourMetrics() };
      interstitialResponse(reason, draft);
      const after = getCurrentHourMetrics();

      const moved = Object.keys(after).filter((k) => after[k] !== (before[k] ?? 0));
      assert(
        moved.includes(`funnel.interstitial.${reason}`),
        `${reason}: the reason was not counted (moved: ${moved.join(', ')})`,
      );
      assert(moved.includes('funnel.interstitial.with_draft'), `${reason}: a draft was not counted as one`);
      for (const name of moved) {
        assertEquals(name.includes(draft), false, `${reason}: a metric name carries the draft`);
      }
    }
  },
});
