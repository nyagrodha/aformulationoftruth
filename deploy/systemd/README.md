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
    sudo systemctl start a4t-report.service        # run once, now
    journalctl -u a4t-report.service -n 30

`REPORT_EMAIL` has no default. A recipient baked into a tracked file would sit
in git history permanently, so an unset value skips the email channel and logs
that it did, rather than quietly mailing someone. `a4t-report.service.d/smtp.conf`
supplies it in production.

Not yet fixed, and worth knowing when reading its output: the service runs as
root with no `User=`, unlike qr-salt-prune; every "visitor statistics" number is
summed across every vhost sharing the access log, not just aformulationoftruth.com;
and `Unique Visitors` has structurally always been 0, because the field it reads
is one the Caddyfile deletes.
