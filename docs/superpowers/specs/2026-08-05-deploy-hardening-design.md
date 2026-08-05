# Deploy hardening — design

Date: 2026-08-05
Status: approved, pending implementation plan

## Problem

On 2026-08-05 the site was found rendering completely unstyled, and a routine
restart then took it down entirely — crash-looping from roughly 03:26 until
03:32:26 UTC, about six minutes. Two independent faults were masked by one
stale process.

**Fault 1 — stale static-file metadata.** Fresh 1.7.3 records each file under
`staticDir` (existence and byte size) once, at process start, then streams
bodies from disk per request. The production process had been running since
Jul 30 19:01. Every asset touched by the Aug 2 deploy therefore advertised a
`Content-Length` from before the change while serving current bytes. The two
disagree, so the response is aborted mid-body: `ERR_HTTP2_PROTOCOL_ERROR` in
browsers, curl exit 92/18. Files added after boot 404, as do routes added after
boot, since the route manifest is fixed at boot too.

Measured across all 24 files in `public/css/`, the correlation was exact with no
exceptions: advertised length equal to actual size implied a clean transfer,
and any difference implied an aborted one. The homepage links exactly one
stylesheet, `prolegomenon.css`, which was in the broken set — so the site
rendered with browser defaults.

**Fault 2 — an unbootable commit sitting on production undetected.** `e27764a`
merged `import { initPool } from './lib/db.ts'`, a symbol `lib/db.ts` does not
export. CI passed because `main.ts` was not in its `deno check` list. Production
appeared healthy for two days because the running process predated the checkout
and never re-read `main.ts`. The restart intended to fix Fault 1 loaded it for
the first time and crash-looped into 502 until `d59e8ef` was deployed.

The second fault is the more serious pattern: **a stale process hides the very
breakage that would otherwise be obvious**, and the longer it runs the more
divergence accumulates silently.

## Goals

1. Commits failing `deno check main.ts` must not be restarted into. Bounded
   `/api/health` polling after restart detects runtime startup failures. A
   deploy that leaves the site unhealthy must fail loudly, at deploy time.
2. Asset staleness must be impossible, not merely avoided by discipline.
3. A deploy that leaves the site broken must fail loudly, at deploy time.

Non-goal: zero-downtime deploys. A brief restart is acceptable.

## Architecture — three independent layers

Each layer catches a different failure class. None subsumes another.

| Layer | Catches | Runs |
|---|---|---|
| A. `deno check main.ts` in CI | boot-breaking imports | PR, before merge |
| B. Caddy `file_server` for `/css/*` | stale `Content-Length` | always, by construction |
| C. `deploy.sh` + `smoke.sh` | everything else, including unknowns | at deploy |

A prevents; B eliminates; C detects. Prevention only covers anticipated
failures, which is exactly why C exists.

### Layer A — CI guard

Add `main.ts` to the existing `deno check` list in `.github/workflows/ci.yml`.

Verified in both directions: at `e27764a` the check fails with
`TS2305 ... has no exported member 'initPool'`; on current `production` the full
step passes. **Landed separately as PR #90** — it is independent of the rest of
this design and there was no reason to hold it.

### Layer B — Caddy serves `/css/*`

Fresh answers a CSS request from two sources captured at different moments: the
length from its boot snapshot, the bytes from disk. Caddy's `file_server`
`stat`s and reads within one request, so length and bytes come from a single
observation. There is no window in which they can diverge.

Inserted before the catch-all `handle` in the
`https://aformulationoftruth.com` block:

```caddy
handle /css/* {
	root * /var/www/aformulationoftruth/public
	file_server {
		disable_canonical_uris
	}
}

handle {
	reverse_proxy http://127.0.0.1:7268 { ... }   # unchanged
}
```

Caddy's `file_server` follows symlinks by default, which could escape
`/var/www/aformulationoftruth/public` if a symlink under `public/css` pointed
outside the tree. The deployment process must reject symlinks under `public/css`
or publish a symlink-free asset tree to prevent this.

`handle` blocks are first-match, so `/_frsh/*` (island JS) and every route still
reach Fresh. Scope is `/css/*` only: no route namespace collides with it, and it
covers the observed fault. Extending to `/fonts`, `/images`, `/js` is deferred
until this is proven in place.

Applied with `caddy validate` then `systemctl reload caddy` (graceful).

**Consequence that constrains Layer C:** after this change, CSS no longer proves
the app is alive. If Fresh dies, Caddy will happily serve all 24 stylesheets at
`200` while every HTML route 502s. The smoke check must therefore assert on a
Fresh-rendered response, not on assets.

### Layer C — `deploy.sh` + `smoke.sh`

Two files, deliberately split:

- **`/var/www/deploy.sh`** — outside the repo, unversioned, minimal and stable.
  Orchestration only.
- **`scripts/smoke.sh`** — inside the repo, versioned and reviewable. Evolves
  with the app; a PR adding a route adds its assertion in the same change.

The split exists for a concrete reason: **bash reads a script incrementally, not
all at once.** A deploy script inside the working tree would be rewritten by its
own `git pull` mid-execution, and bash would resume reading at a byte offset
into changed content. Keeping `deploy.sh` outside the tree makes that
impossible. `smoke.sh` is invoked as a fresh process *after* the pull, so it is
always the version matching the code just deployed — versioning where it helps,
without the self-rewrite hazard.

Sequence:

```
1. acquire host-level lock (flock) — held through completion or failure
2. record CURRENT_SHA
3. git pull --ff-only
4. deno check main.ts          <- pre-restart gate
5. systemctl restart
6. poll /api/health until ready (bounded, ~30s)
7. scripts/smoke.sh <base-url>
8. on failure: report + rollback instructions, exit 1
9. release lock
```

The lock prevents concurrent invocations from interleaving deployment steps. It
is acquired before recording `CURRENT_SHA` or pulling changes, and held through
health checks and smoke testing.

Each command's exit status is explicitly validated. Deployment terminates on
failure of `git pull --ff-only` or `deno check main.ts`. `systemctl restart` is
only reachable if both succeed. Failure reporting and rollback guidance remain
unchanged.

Step 4 is the load-bearing pre-restart gate. A commit that cannot boot never
reaches a restart, so the old process keeps serving rather than the site going
dark. This is strictly better than the manual sequence that caused the outage.

On health polling timeout: report the deployed SHA and the observed health
result, exit with nonzero status, and skip `scripts/smoke.sh` (the service is
not ready). Smoke-test failure handling for the successful health check case
remains unchanged.

## Error handling

**On smoke failure: report loudly and change nothing.** No auto-rollback.

This incident is the argument: rollback would have reset to `e27764a`, which was
*itself* the unbootable commit. Automated rollback assumes the previous state is
good, and that assumption was false here. A human reading a clear report decides
better than a script acting on a false premise.

Failure output names the failing target, the observed result, the deployed SHA,
the previous SHA, and the exact rollback command.

**Assertions check curl's exit code first, then HTTP status.** Never status
alone: a truncated transfer still returns a valid `200` status line, because the
status is sent before the body. Checking `%{http_code}` is precisely what would
have reported the original outage as healthy.

Targets, chosen for non-overlap:

| Target | Proves | Ownership assertion |
|---|---|---|
| `/api/health` (+ `"status":"ok"`) | Fresh alive **and** DB reachable | body key presence |
| `/` | HTML rendering | HTML marker present |
| `/gate` | route handler execution | gate-section route marker |
| `/css/prolegomenon.css` | the Caddy static path | Caddy-specific header or signal |

Ownership assertions prevent fallback or generic Caddy responses from being
accepted as Fresh route success. For `/`, require an HTML marker (e.g.,
`<title>` or a known meta tag). For `/gate`, require the gate-section route
marker (existing HTML element). For `/css/prolegomenon.css`, verify a
Caddy-specific header or equivalent signal that proves Caddy served the file.
Status and exit-code checks are retained.

`/gate` is chosen over `/about` because `/about` is a pure `PageShell` render
with no handler, making it near-redundant with `/`, whereas `/gate` exports a
`Handlers` object and exercises token generation and question loading. Its GET
path does not touch the (currently crash-looping) gate encryption service —
that `fetch` is in `POST` — so it imports no external instability.

Following the philosophy stated in `scripts/check-zero-logging.sh` — *a checker
that fires spuriously will be disabled, and then it protects no one* —
assertions stay narrow and deterministic: status and exit code, one body key on
`/api/health`, no timing thresholds, no content matching that ordinary copy
edits would break.

## Testing

`smoke.sh` takes a base URL argument, so it runs against a local instance
(`PORT=8411 deno run --allow-all main.ts`) as well as production. Both paths get
proven before it guards a real deploy:

- **pass path** — against a healthy local instance, all targets green. Start
  PostgreSQL and set `DATABASE_URL` before launching the local instance so
  `/api/health` returns 200. The `/gate` GET verification relies on bundled
  questions (no seed data required). Setup must be reproducible, not reliant on
  implicit database state.
- **fail path** — stop the local server and confirm it exits nonzero; separately,
  confirm a truncated response is caught by the exit-code assertion where a
  status-only check would pass; additionally, test a nonresponsive endpoint
  whose in-flight transfer exceeds the timeout limit.

All `curl` requests, including readiness and health checks, must specify
explicit `--connect-timeout` and `--max-time` limits.

`deploy.sh` is exercised on the server with an already-deployed SHA, which
should be a clean no-op pull followed by a green smoke run.

## Out of scope

Recorded here because they surfaced during diagnosis, and are deliberately not
addressed by this work:

- **`aformulationoftruth-gate.service` is crash-looping**, `NRestarts=114275`,
  with nothing listening on its port 8787. `lib/gate_encrypt.ts` POSTs to
  `http://127.0.0.1:8787/api/store` and is documented as failing closed with 503,
  so gate submissions are likely failing for real users. Needs its own
  investigation.
- **Fresh 1.7.x is two majors behind** (2.3.0 is current); the dev server also
  reports 1.7.2 while `deno.json` pins 1.7.3.
- **`dev.ts` watches `static/`** while `staticDir` is `./public`.
- **CI type/format lists are narrowly scoped** because `tests/` and `trash/`
  carry ~449 pre-existing type errors.
