# systemd units

Host configuration, versioned here rather than living only on the server.

`deploy.sh` is deliberately kept *outside* the repo (see the deploy-hardening
spec): bash reads a script incrementally, so a deploy script inside the working
tree would be rewritten by its own `git pull` mid-execution. That reasoning does
not apply to unit files — systemd reads them from `/etc`, never from the working
tree — so they belong in version control, where a rebuilt box can recover them.

## qr-salt-prune

Deletes QR daily salts past the retention window, hourly. This is what enforces
unlinkability when the QR is idle; the request-path prune in `lib/qr-scans.ts`
only runs while the object is being scanned. Both are kept because they fail
under opposite conditions.

**Best-effort, not a guarantee.** Retention is day-granular, so a salt lives
between ~24h and ~48h depending on when in the day it was created, and the
hourly timer adds up to ~61 minutes on top — worst case near 49 hours. Failed
runs and host downtime extend it further; `Persistent=true` catches up after
downtime but cannot delete retroactively. Do not quote a strict 48h figure.

Install:

    sudo install -m0644 deploy/systemd/qr-salt-prune.service /etc/systemd/system/
    sudo install -m0644 deploy/systemd/qr-salt-prune.timer   /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now qr-salt-prune.timer

Verify:

    systemctl list-timers qr-salt-prune.timer
    sudo systemctl start qr-salt-prune.service   # run once, now
    journalctl -u qr-salt-prune.service -n 20    # counts and a date only

## daily report

`monitoring/daily_report.py` is the site report, mailed at 08:00, 18:00 and
23:15 local by `a4t-report.timer`. It reads the Caddy access log and the
database, and sends over the site's own SMTP credentials.

**This file is the source of truth as of 2026-08-19, and was not before.** The
program had been edited in place at `/usr/local/bin/a4t-daily-report.py` while a
652-line SendGrid-era ancestor sat in the repository, 222 lines and one mail
provider out of date. Anyone who "fixed the daily report" by editing the tracked
copy changed nothing that runs. Install after every edit, or the divergence
starts again:

    sudo install -m0755 monitoring/daily_report.py /usr/local/bin/a4t-daily-report.py
    sudo install -m0644 monitoring/e290_report.py /usr/local/bin/e290_report.py
    sudo systemctl start a4t-report.service        # run once, now
    journalctl -u a4t-report.service -n 30

`REPORT_EMAIL` has no default. A recipient baked into a tracked file would sit
in git history permanently, so an unset value skips the email channel and logs
that it did, rather than quietly mailing someone. `a4t-report.service.d/smtp.conf`
supplies it in production.

The service runs as root to read its sources. Traffic is filtered by report
vhost and audience comes from integer windows. App counters cover only the
selected UTC date and are lost on app restart; confirmed deliveries are durable.
Failed key withdrawal means cleanup after a refused gate submission, not a PDF
failure. `/health` on the renderer uses the existing render bearer token and
exposes aggregate stage failures since renderer start. Queue counts are current
status, even when generating a historical report.

## PDF delivery queue

Apply `db/migrations/015_pdf_delivery_queue.sql` as the schema owner, and grant
SELECT/INSERT/UPDATE/DELETE on `pdf_delivery_jobs` to the web/worker database role.
Deploy the renderer (including `delivery.ts`, `subprocess.ts`, and its updated
unit) before restarting Fresh and enabling the worker. Its systemd
`StateDirectory=a4t-render` stores only opaque delivery receipts, never answers.

    sudo install -m0644 deploy/systemd/a4t-delivery.service /etc/systemd/system/
    sudo install -m0644 deploy/systemd/a4t-delivery.timer /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now a4t-delivery.timer

The worker leases jobs for ten minutes and retries pre-send failures with
exponential backoff for up to 24 hours. A sent receipt allows callback retries
without another email. SMTP failure after a send has started is uncertain:
the job stops for operator attention because automatic retry could duplicate
a message the server already accepted. Review SMTP and renderer logs before
authorizing another request. Terminal jobs discard ciphertext immediately and
expire after seven days; receipts expire after eight. Pending jobs can be
cancelled, but mail already sending cannot be recalled. Repeated consent keeps
the original queued copy and password. A cancelled request may be submitted
again; a failed request needs operator attention.

    python3 -B -m unittest discover -s monitoring -p 'test_*.py'
    deno test --allow-env --allow-read --allow-write romania/tests/delivery_test.ts tests/deliver_bundle_test.ts

`tests/delivery_queue_test.ts` requires an isolated database whose name matches
`a4t_delivery_test_[0-9]+`, supplied in `DELIVERY_TEST_DATABASE`. It derives the
connection credentials from DATABASE_URL but replaces the database name before
connecting. Fixtures must never target the live schema.

## Direct SSH transport

Install `a4t-keybox-direct.conf` as `a4t-keybox-tunnel.service.d/zz-direct-ssh.conf`.
Disable any previous `mesh.conf` drop-in (retain it as `mesh.conf.disabled`),
reload systemd, and restart the tunnel. Both ports remain loopback-only and
StrictHostKeyChecking verifies the existing host key. SSH encrypts the channel
directly over the public network; WireGuard is not a dependency. Keep the
existing retry backoff drop-in.
