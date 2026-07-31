# Tor DNS + Onion Uptime Monitor

This stack gives you:

1. A DNS resolver endpoint (`:53`) backed by Tor `DNSPort`.
2. A SOCKS5 Tor proxy (`:9050`) for `.onion` access.
3. A monitor service that checks onion URLs for uptime, captures redirects, and stores discovered `.onion` candidates + mirror-like signatures.

## Quick start

```bash
cd tools/tor-watch
docker compose up -d --build
```

## Configure monitored sites

Edit `monitor/targets.txt` and add one onion URL per line:

```text
http://youronionv3addressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.onion/
```

The monitor loops every 300 seconds by default (`MONITOR_INTERVAL_SECONDS`).

## Data captured

Monitor writes to SQLite at `monitor-data` volume (`/data/monitor.db`) with:

- `checks`: success/failure status, status code, final URL, content signature.
- `discovered_onions`: onion URLs detected in page HTML and links.

Mirror detection is signature-based (normalized page text hash). This is a heuristic; tune for your threat model.

## Notes and limitations

- Tor DNS is not a full recursive resolver and some clients/features may expect behavior it does not provide.
- Onion liveness checks should prefer HTTP GET through SOCKS (`socks5h`) rather than ICMP ping.
- Auto-follow to “new locations” is intentionally passive here: it records redirects/discovered onions; it does not rewrite targets automatically.
- For production you should add alerting (Prometheus/Grafana, Loki, or webhook notifications), rate limits, and authentication for any exposed dashboards.
