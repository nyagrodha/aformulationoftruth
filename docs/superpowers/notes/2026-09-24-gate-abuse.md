# Gate abuse and the stalled questionnaire — 2026-09-24

## Symptom

Nobody got past the gate. Of 1,495 questionnaire sessions created in the 30
days to 2026-09-24 (931 distinct email hashes), three ever left question
index 0.

## What was actually happening

**Almost no submissions were from people.** Every retained Caddy log was
fingerprinted by protocol for `POST /api/gate-submit`:

| client                     | submissions |
| -------------------------- | ----------- |
| HTTP/1.0, TLS 1.2, no ALPN | 445         |
| HTTP/1.1, TLS 1.3, no ALPN | 156         |
| HTTP/2, TLS 1.3, ALPN h2   | 3           |

Current browsers negotiate h2 over TLS 1.3. The first two rows are scripts:
`GET /`, then `POST` four seconds later, uncompressed, a different address
each time, the same addresses recurring every few hours. They reach Caddy
directly (SNI `aformulationoftruth.com`), not via the shared-host PHP proxy.
The shape is subscription bombing: the gate had no limit of any kind, so it
mailed a magic link to whatever address a script supplied. About 50 a day,
all accepted by iCloud SMTP (79 of 79 on 2026-09-23), none opened.

**Nobody opened the links.** 191 links were sent in 60 days; Caddy logged no
`/auth/verify?token=...` from a person. The two "successful" verifications
(2026-09-18 20:30, 2026-09-22 12:35) were mail-provider link scanners:

1. within 6 ms, one client fetched `/`, the full link, and the link cut at
   `&` (token without resume);
2. ~39 s later it followed links on each resulting page — `/login` exists
   only on the "Verification Failed" page, `/contact.html` on the
   questionnaire;
3. and submitted the questionnaire form with no cookie, which
   `POST /questionnaire` answered with a silent `302 /`.

A throwaway session proved the server path works: with the `jwt` cookie,
`GET /questionnaire` is 200 and `POST` advances to the next question.

The mail volume the scripts generated is the likely reason real visitors'
links were not reaching inboxes.

## Secondary defects found

- `/login` had no `method`/`action`; it worked only through an inline
  `fetch`, so with JavaScript off (Tor Browser, Safest) it sent nothing. It is
  also the only way back from the "Verification Failed" page.
- The email and `/check-email` promised a 15-minute, single-use link; the JWT
  is valid 24 hours and reusable. (Do not make it single-use naively: the
  scanners above would consume it before the person clicks.)
- The HTML email put a bare `&` in the link's `href`.
- `/questionnaire` refused cookieless POSTs silently, which is why the above
  had to be reconstructed from Caddy's log.

## What changed

`lib/gate-guard.ts` now stands in front of both endpoints that mail a
stranger-typed address (`/api/gate-submit`, `/api/auth/magic-link`):

1. per-client rate limit (Postgres, HMAC'd address; IPv6 counted per /64;
   onion traffic shares one larger bucket);
2. honeypot field → silent;
3. image challenge (`lib/captcha.ts`, PNG, no JS, single-use nonce);
4. MX check on the address's domain (`lib/mail-domain.ts`) → the visitor can
   fix a typo; nothing bounces in the site's name;
5. at most two links per address per day → silent. The cap counts mail
   actually sent: the charge is handed back if the request is then refused
   or the send fails;
6. site-wide hourly ceiling on links sent.

Silenced requests answer exactly as success does: same status, same body,
and a padded delay matching a real send's key provisioning and SMTP time.

A wrong challenge answer re-draws the gate with the answers kept. `/login`
is a plain form with the same challenge. Copy now says 24 hours.

Requires migration `018_gate_guard.sql`, applied by the owner role, with the
grants listed at its foot. Without it the guard fails closed and every
submission is refused.

## Known limits

- The image stops generic form scripts, not a determined OCR attacker; the
  per-address and site-wide caps bound what one could do.
- An image challenge excludes people who cannot see it. The form names the
  webmaster address as the way round.
- Answers are still stored at submission, before the address is proven. A
  stricter design defers the gate write until the link is opened.

## Tuning

Environment overrides (defaults in brackets): `GATE_IP_HOURLY_MAX` [6],
`GATE_IP_DAILY_MAX` [20], `GATE_ONION_HOURLY_MAX` [40],
`GATE_ONION_DAILY_MAX` [200], `GATE_EMAIL_DAILY_MAX` [2],
`GATE_GLOBAL_HOURLY_MAX` [30]. `CAPTCHA_SECRET` is optional; without it the
key is derived from `JWT_SECRET`.

Counters: `gate.guard.*`, `gate.submit.silenced`, `gate.submit.refused.*`,
`auth.magiclink.refused.*`.
