/**
 * Address verification: does mail reach this domain, and nothing else.
 *
 * The tests that matter most here are the ones asserting what is NOT rejected.
 * The failure mode this module could easily have is turning away exactly the
 * people the site is for -- privacy-minded respondents on providers whose
 * domain names offend commercial blocklists, and people using a throwaway
 * address on purpose because the questionnaire asks thirty-five intimate
 * questions and they would rather not sign their name to the answers.
 *
 * Network-dependent tests are marked and skipped when DNS is unavailable, so a
 * machine without a resolver reports honestly rather than green.
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { domainOf, verifyAddressDeliverable } from '../lib/email-address.ts';

/** Is there a working resolver? Without one the DNS tests prove nothing. */
async function dnsWorks(): Promise<boolean> {
  try {
    const mx = await Deno.resolveDns('gmail.com', 'MX');
    return mx.length > 0;
  } catch {
    return false;
  }
}

const HAS_DNS = await dnsWorks();

Deno.test({
  name: 'domainOf - splits at the LAST @, lowercases, drops a trailing dot',
  fn() {
    assertEquals(domainOf('someone@example.com'), 'example.com');
    assertEquals(domainOf('someone@EXAMPLE.COM'), 'example.com');
    assertEquals(domainOf('someone@example.com.'), 'example.com');
    // A quoted local part may itself contain '@'; the delimiter is the last one.
    assertEquals(domainOf('"odd@name"@example.com'), 'example.com');
    assertEquals(domainOf('nope'), null);
    assertEquals(domainOf('@example.com'), null);
    assertEquals(domainOf('someone@'), null);
  },
});

Deno.test({
  name: 'malformed domains are rejected without any lookup',
  async fn() {
    for (const bad of ['nope', 'a@b', 'a@.com', 'a@ex..ample.com', 'a@-example.com', 'a@example-.com']) {
      const v = await verifyAddressDeliverable(bad);
      assertEquals(v.ok, false, `${bad} should not be addressable`);
      if (!v.ok) assertEquals(v.reason, 'syntax');
    }
  },
});

Deno.test({
  name: 'recommended providers are accepted with no lookup at all',
  async fn() {
    // The allowlist exists so that neither a resolver outage nor a future edit
    // to this module can lock out the providers the front page recommends.
    for (const domain of ['cock.li', 'maildrop.cc', 'mailguard.cc']) {
      const v = await verifyAddressDeliverable(`someone@${domain}`);
      assertEquals(v.ok, true, `${domain} must always be accepted`);
      if (v.ok) assertEquals(v.checked, 'allowlist');
    }
  },
});

Deno.test({
  name: 'recommended providers are accepted case-insensitively',
  async fn() {
    const v = await verifyAddressDeliverable('Someone@COCK.LI');
    assertEquals(v.ok, true);
    if (v.ok) assertEquals(v.checked, 'allowlist');
  },
});

Deno.test({
  name: "cock.li's alternate domains are recognised by where their mail goes",
  ignore: !HAS_DNS,
  async fn() {
    // Not by name. cock.li runs dozens of alternates and changes the roster,
    // so enumerating them would rot; every one routes through mx1/mx2.cock.li,
    // which also covers alternates that do not exist yet. These four are NOT
    // in ALLOWED_DOMAINS -- if any is accepted, the MX rule did it.
    for (const domain of ['airmail.cc', 'horsefucker.org', 'cumallover.me', 'waifu.club']) {
      const v = await verifyAddressDeliverable(`someone@${domain}`);
      assertEquals(v.ok, true, `${domain} is a cock.li domain and must be accepted`);
      if (v.ok) {
        assertEquals(
          v.checked,
          'cockli-mx',
          `${domain} should be recognised as cock.li by MX, not merely as a generic domain`,
        );
      }
    }
  },
});

Deno.test({
  name: 'ordinary providers are accepted',
  ignore: !HAS_DNS,
  async fn() {
    for (const domain of ['gmail.com', 'proton.me', 'fastmail.com']) {
      const v = await verifyAddressDeliverable(`someone@${domain}`);
      assertEquals(v.ok, true, `${domain} must be accepted`);
    }
  },
});

Deno.test({
  name: 'a domain that accepts no mail at all is rejected',
  ignore: !HAS_DNS,
  async fn() {
    // .invalid is reserved by RFC 2606 and can never resolve, so this is a
    // definitive "no records" rather than a resolver hiccup.
    const v = await verifyAddressDeliverable('someone@zzz-no-such-domain-9182.invalid');
    assertEquals(v.ok, false);
    if (!v.ok) assertEquals(v.reason, 'no-mail-records');
  },
});

Deno.test({
  name: 'nothing is rejected for being disposable, throwaway, or rudely named',
  ignore: !HAS_DNS,
  async fn() {
    // This is the regression guard with the most value in the file. Adding a
    // "disposable domain" blocklist would feel like hygiene and would break the
    // product: the front page recommends maildrop.cc by name, and cock.li
    // appears on many such lists purely because of what its domains are called.
    for (const domain of ['maildrop.cc', 'mailinator.com', 'guerrillamail.com', 'horsefucker.org', 'nigge.rs']) {
      const v = await verifyAddressDeliverable(`someone@${domain}`);
      assert(v.ok, `${domain} must not be rejected -- this module checks deliverability, not respectability`);
    }
  },
});

Deno.test({
  name: 'a resolver failure lets the address through rather than closing the gate',
  async fn() {
    // Fail-open, proved by making the resolver throw something that is not a
    // NotFound. A false rejection turns someone away from the questionnaire
    // entirely; a false acceptance costs one undelivered email.
    const real = Deno.resolveDns;
    // deno-lint-ignore no-explicit-any
    (Deno as any).resolveDns = () => Promise.reject(new Error('SERVFAIL'));
    try {
      const v = await verifyAddressDeliverable('someone@example.com');
      assertEquals(v.ok, true, 'a broken resolver must not become a closed door');
      if (v.ok) assertEquals(v.checked, 'skipped');
    } finally {
      // deno-lint-ignore no-explicit-any
      (Deno as any).resolveDns = real;
    }
  },
});

Deno.test({
  name: 'a domain with an address record but no MX is accepted',
  async fn() {
    // RFC 5321: a domain with an A record accepts mail there even with no MX,
    // which is how plenty of small self-hosted domains work.
    const real = Deno.resolveDns;
    // deno-lint-ignore no-explicit-any
    (Deno as any).resolveDns = (_d: string, kind: string) => {
      if (kind === 'MX') return Promise.reject(new Deno.errors.NotFound('no MX'));
      if (kind === 'A') return Promise.resolve(['203.0.113.10']);
      return Promise.resolve([]);
    };
    try {
      const v = await verifyAddressDeliverable('someone@self-hosted.example');
      assertEquals(v.ok, true);
      if (v.ok) assertEquals(v.checked, 'implicit-a');
    } finally {
      // deno-lint-ignore no-explicit-any
      (Deno as any).resolveDns = real;
    }
  },
});
