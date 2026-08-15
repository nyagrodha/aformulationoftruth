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
