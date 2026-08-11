# Co-op QR scan counting

**Date:** 2026-08-11
**Status:** implemented — migration, recorder, route and CLI all landed.
Two operator steps remain before it records anything: apply migration 009, and
seed the co-op wearable so `COOP_WEARABLE_TOKEN` is set (see Configuration).
**Scope:** this repo only. The firmware half is
`heltec-dd-node/docs/superpowers/specs/2026-08-11-coop-oled-content-rotation-design.md`.

## Problem

A Heltec V4 OLED node is being placed in public at the Willy St Co-op. Its
screen shows a QR code, and the operator wants a server-side report of how
many discrete visits that code produces.

Three things stand in the way, all verified 2026-08-11:

1. **The QR points at a URL that does not exist.** Firmware
   `DD_QR_DEFAULT_TEXT` is `aformulationoftruth.com/Level5`, and there is no
   `/Level5` route in this app. Every scan today is a 404.
2. **`lib/metrics.ts` cannot answer the question.** It is explicitly
   in-memory, single-process, one-minute buckets. It resets on every deploy,
   so it cannot report a total since the object was placed.
3. **`fresh_encounters` counts conversions, not scans.** A row appears only
   when a scanner submits their email at the gate (`routes/api/gate-submit.ts:164`).
   Someone who scans, reads, and leaves is invisible to it.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| URL | `aformulationoftruth.com/WillyStCo-op` | Human-readable; re-pointable later without reflashing the node |
| "Discrete" | Hashed IP + user-agent, deduped per UTC day | Works when cookies are blocked; owner accepted the privacy trade-off over a cookie-based count |
| Salt lifetime | Random per day, deleted at 48h | Makes past days permanently un-recomputable, which is what "non-linkable across days" has to mean to be true |
| Report surface | CLI script | Adds no public HTTP surface to guard |
| Landing | `302` to `/w/<token>` | Reuses the existing invitation page and its encounter machinery |

## Architecture

```
QR scan
  -> GET /WillyStCo-op          record the visit, never render the slug
  -> 302
  -> GET /w/<coop-token>        existing page: greets, plants 24h cookie
  -> gate                       existing: fresh_encounters on email submit
```

Counting lives on the slug route, not on `/w/[token]`. That keeps the vanity
URL and the counter together, leaves the wearable page untouched, and lets the
QR be re-pointed at a different destination later without moving the counter.

The result is two independent numbers, which answer different questions:
**scans** (this spec) and **conversions** (`fresh_encounters`, already built).

### Configuration

`COOP_WEARABLE_TOKEN` — the seeded token the slug redirects to. Absent or
malformed, the route redirects to `/` and increments
`errors.config.qr_token_missing`, rather than 404ing a printed code.

### The co-op wearable token

`/w/[token]` requires a row in `fresh_wearables`. The co-op drop gets its own,
seeded with `tools/seed-wearable.ts`, owned by the site rather than a person.

This is a hard requirement, not a convenience. `tools/seed-wearable.ts:29`
records that a wearable token is a bearer credential: anyone holding one can
pose as a scan of that object and graft themselves onto the owner's graph.
Printing one on a QR in a grocery store makes it public by definition. A
dedicated site-owned token means that exposure is intended and bounded; a
personal token would leak a real person's graph edge to every passerby.

### Counting

```
visitor_hash = HMAC-SHA256(salt_for_today, ip + "\n" + user_agent)
```

The IP exists only as a local variable feeding the HMAC. It is never stored,
never logged, and never returned.

`getClientIp()` lives in `lib/client-ip.ts`, honoring `TRUST_PROXY`.

**Found during implementation:** `routes/api/contact.ts` has a private copy of
this function, but that file exists on `production` and **not** on `main`,
which is where this work is branched from — so the two cannot be reconciled in
this change. When it reaches production, delete contact.ts's copy and import
the shared one. Nothing will fail to compile to remind you, which is precisely
why it is written down here and in the module's header.

### Schema

`db/migrations/009_qr_scan_counts.sql`:

```sql
CREATE TABLE IF NOT EXISTS fresh_qr_salts (
  day  DATE PRIMARY KEY,
  salt BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS fresh_qr_scans (
  slug         TEXT        NOT NULL,
  day          DATE        NOT NULL,
  visitor_hash TEXT        NOT NULL,   -- 64 hex chars
  bot          BOOLEAN     NOT NULL DEFAULT FALSE,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hits         INT         NOT NULL DEFAULT 1,
  PRIMARY KEY (slug, day, visitor_hash)
);
```

`visitor_hash` is TEXT rather than the BYTEA this spec first specified:
`lib/crypto.ts::hmacSign` already returns hex, and round-tripping it through
bytea would add an encoding step with nothing to show for it.

Insert with `ON CONFLICT (slug, day, visitor_hash) DO UPDATE SET hits = hits + 1`.
One table yields both numbers: distinct visitors is the row count, raw scans is
`SUM(hits)`. Neither can be lost to a bug in the other.

`slug` is a column rather than a table name so future QR-bearing objects share
this machinery.

### Salt lifecycle

On the first visit of a UTC day, generate 32 random bytes and
`INSERT ... ON CONFLICT (day) DO NOTHING`, then `SELECT` the winner — the
conflict path is what makes two simultaneous first-visits agree on one salt
instead of racing. The same code path prunes:
`DELETE FROM fresh_qr_salts WHERE day < CURRENT_DATE - 1`.

Deriving the salt from a long-lived secret was rejected. `HMAC(SECRET, date)`
is recomputable forever by anyone holding `SECRET`, so every past day stays
re-linkable and the daily rotation is decorative. Random-and-deleted means that
once a salt is gone, its rows are opaque bytes even to us.

**Known limit on the 48h guarantee.** Pruning happens in the request path,
because this app has no scheduler and adding one is a larger decision than the
feature warrants. If scanning stops, pruning stops with it, and salts outlive
the window for as long as the route is idle — so the guarantee is "48 hours,
provided the object is being scanned", not unconditionally. If the co-op node
turns out to see long quiet stretches, move the `DELETE` to a scheduled UTC
task; it is written to be safe to run from anywhere.

### Bots

Link unfurlers (Signal, iMessage, WhatsApp, Slack) fetch a URL to build a
preview, and each is a phantom scan. Match known bot user-agents, set `bot =
TRUE`, and have the report exclude them by default while still showing the
count. Excluding silently would hide the size of the correction; not excluding
at all would inflate the headline number by an unknown factor.

The denylist is a judgment call about which apps this audience actually uses,
and is the operator's to set at implementation time.

### Report

`scripts/qr-report.ts`, following `scripts/read-gate-answers.ts` (env loading,
`withConnection`, TTY discipline). Prints date range, distinct visitors, raw
scans, bots excluded, and a per-day table.

## Error handling

Counting must never break the redirect. Wrap the whole record step in
try/catch, increment an error metric, and redirect regardless — the same
non-fatal pattern `gate-submit.ts:172` uses for encounters. A scanner standing
in a grocery store must not see a 500 because the database blinked.

**No `console.log` may touch the IP, the user agent, or the hash.** The
pre-commit hook `scripts/check-zero-logging.sh` fires on emitters whose
arguments match `ip|user_agent|cookie|token|...`, and it is correct to do so
here. Log category names and `increment()` metrics only.

## Two ways this silently lies

- **`TRUST_PROXY` unset behind a reverse proxy.** Every visitor hashes to the
  proxy's address and the distinct count collapses toward 1. This is the most
  likely failure and it looks like "nobody scanned it."
- **`TRUST_PROXY=true` with a proxy that does not strip client-supplied
  `X-Forwarded-For`.** Anyone can forge the header and inflate the count.

Confirm which applies to the deployment before writing the route, and record
the answer here.

## Testing

Deno tests, `*_test.ts` per existing convention:

- same IP + UA twice in a day -> 1 distinct, 2 hits
- different UA, same IP -> 2 distinct
- same IP + UA across two days -> 2 rows, and the day-2 hash differs (salt rotation)
- a known bot UA is flagged and excluded from the default report
- a DB failure still returns the 302
- salts older than 48h are pruned
- `getClientIp()` honors `TRUST_PROXY` in both states

## Out of scope

- The `/w/[token]` page design — deferred, to be designed separately.
- Geofence and tamper alerting — separate spec, spans the node and the Pi.
