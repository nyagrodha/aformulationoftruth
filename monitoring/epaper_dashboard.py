#!/usr/bin/env python3
"""e-Paper 2.13" Dashboard — aformulationoftruth.com stats + mesh status

Renders a compact status screen on a Waveshare 2.13" V4 e-Paper display.
Data sources (all fetched via SSH to marcel):
  - System metrics:  http://127.0.0.1:9191/api/metrics/system
  - Service health:  http://127.0.0.1:9191/api/services
  - Site metrics:    http://localhost:8393/api/metrics  (Fresh app, in-memory 24h)
  - Unique visitors: jq parse of /var/log/caddy/access.log (shredded every 6h)
Local data:
  - WireGuard mesh:  sudo wg show wg0 latest-handshakes
"""

import json
import subprocess
import time
from datetime import datetime
from waveshare_epd import epd2in13_V4
from PIL import Image, ImageDraw, ImageFont

# --- Connection config ---
MARCEL_HOST = "marcel@10.67.0.2"
MARCEL_KEY = "/home/cam/.ssh/finland_key"
MARCEL_PORT = "2078"
SYSTEM_API = "http://127.0.0.1:9191"
SITE_API = "http://localhost:8393"
API_USER = "gagan"
API_PASS = "OPUyaW9jHeO3Fc3B1wV0gQl0!A1"
WG_CONF = "/etc/wireguard/wg0.conf"
CADDY_LOG = "/var/log/caddy/access.log"


# ---------------------------------------------------------------------------
# Data fetching
# ---------------------------------------------------------------------------

def ssh_cmd(cmd, timeout=15):
    """Run a command on marcel via SSH and return stdout."""
    full = [
        "ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
        "-i", MARCEL_KEY, "-p", MARCEL_PORT, MARCEL_HOST, cmd,
    ]
    try:
        r = subprocess.run(full, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception:
        return ""


def ssh_json(endpoint, base=SYSTEM_API):
    """Query a JSON API on marcel via SSH, return parsed dict or None."""
    cmd = 'curl -sf -u "{}:{}" {}{}'.format(API_USER, API_PASS, base, endpoint)
    raw = ssh_cmd(cmd)
    try:
        return json.loads(raw)
    except Exception:
        return None


def get_system_metrics():
    """CPU / mem / disk / load / uptime from the system dashboard API."""
    return ssh_json("/api/metrics/system")


def get_services():
    """Service status list from the system dashboard API."""
    return ssh_json("/api/services")


def get_site_metrics():
    """Site visitor & funnel metrics from the Fresh app's in-memory store.

    Returns a flat dict with keys like:
        requests_total, gate_viewed, completions, questions_answered,
        questionnaires_started, questionnaires_completed
    """
    data = ssh_json("/api/metrics", base=SITE_API)
    if not data:
        return None

    # Aggregate current hour + all hourly history into a single totals dict
    totals = {}
    for hour_entry in data.get("history", []):
        for k, v in hour_entry.get("metrics", {}).items():
            if isinstance(v, (int, float)):
                totals[k] = totals.get(k, 0) + v
    for k, v in data.get("currentHour", {}).items():
        if isinstance(v, (int, float)):
            totals[k] = totals.get(k, 0) + v

    return {
        "requests_total": int(totals.get("requests.total", 0)
                               + totals.get("requests.api", 0)),
        "gate_viewed": int(totals.get("funnel.gate.viewed", 0)),
        "completions": int(totals.get("funnel.completion.viewed", 0)),
        "questions_answered": int(totals.get("questionnaire.answered", 0)),
        "q_started": int(totals.get("questionnaire.started", 0)),
        "q_completed": int(totals.get("questionnaire.completed", 0)),
    }


def get_unique_visitors():
    """Count unique visitor IPs from the current Caddy access log window.

    The log is shredded every 6 hours, so this returns a rolling ~6h count.
    Uses jq on the server to extract client_ip, then counts unique values.
    Falls back to a Python one-liner if jq is unavailable.
    """
    # Fast path: jq
    cmd = (
        "jq -r '.request.client_ip // empty' {} 2>/dev/null"
        " | sort -u | wc -l"
    ).format(CADDY_LOG)
    raw = ssh_cmd(cmd, timeout=20)
    try:
        count = int(raw.strip())
        if count > 0:
            return count
    except (ValueError, AttributeError):
        pass

    # Fallback: python one-liner (slower but no jq dependency)
    cmd = (
        "python3 -c \""
        "import sys,json; s=set()\\n"
        "for l in open('{}'):\\n"
        " try: s.add(json.loads(l).get('request',{{}}).get('client_ip',''))\\n"
        " except: pass\\n"
        "print(len(s-{{''}}))\""
    ).format(CADDY_LOG)
    raw = ssh_cmd(cmd, timeout=20)
    try:
        return int(raw.strip())
    except (ValueError, AttributeError):
        return None


def parse_peer_names():
    """Parse WireGuard config to build pubkey → friendly-name mapping."""
    mapping = {}
    try:
        r = subprocess.run(
            ["sudo", "cat", WG_CONF],
            capture_output=True, text=True, timeout=5,
        )
        current_name = None
        for line in r.stdout.split("\n"):
            line = line.strip()
            if line.startswith("# PEER:"):
                current_name = line.split("# PEER:", 1)[1].strip()
                if "(" in current_name:
                    current_name = current_name.split("(")[0].strip()
            elif line.startswith("PublicKey") and current_name:
                key = line.split(" = ", 1)[1].strip()
                mapping[key] = current_name
                current_name = None
    except Exception:
        pass
    return mapping


def get_mesh_peers():
    """Get WireGuard mesh peer status (runs locally on the Pi)."""
    names = parse_peer_names()
    try:
        r = subprocess.run(
            ["sudo", "wg", "show", "wg0", "latest-handshakes"],
            capture_output=True, text=True, timeout=5,
        )
        peers = []
        now = time.time()
        for line in r.stdout.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) != 2:
                continue
            pubkey, ts = parts[0], int(parts[1])
            name = names.get(pubkey, pubkey[:8] + "..")
            if ts == 0:
                status = "never"
            else:
                age = int(now - ts)
                status = "up" if age < 180 else "{}m".format(age // 60)
            peers.append((name, status))
        return peers
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def draw_dashboard(epd):
    """Fetch all data and render the e-Paper image."""
    W, H = epd.height, epd.width  # 250x122 in landscape
    image = Image.new("1", (W, H), 255)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    y = 2

    # ── Header ─────────────────────────────────────────────
    now_str = datetime.now().strftime("%H:%M")
    draw.text((2, y), "a4ot", font=font, fill=0)
    draw.text((W - len(now_str) * 6 - 2, y), now_str, font=font, fill=0)
    y += 12
    draw.line([(0, y), (W, y)], fill=0)
    y += 2

    # ── Visitors (Caddy + Fresh metrics) ───────────────────
    uniq = get_unique_visitors()
    site = get_site_metrics()

    vis_parts = []
    if uniq is not None:
        vis_parts.append("Uniq:{}".format(uniq))
    if site:
        vis_parts.append("Gate:{}".format(site["gate_viewed"]))
        vis_parts.append("Done:{}".format(site["completions"]))
    if vis_parts:
        draw.text((2, y), "  ".join(vis_parts), font=font, fill=0)
        y += 11
        if site and site["requests_total"]:
            draw.text((2, y), "Reqs:{}  Ans:{}  Start:{}".format(
                site["requests_total"],
                site["questions_answered"],
                site["q_started"],
            ), font=font, fill=0)
            y += 11
    else:
        draw.text((2, y), "Site: offline", font=font, fill=0)
        y += 11

    y += 1
    draw.line([(0, y), (W, y)], fill=0)
    y += 2

    # ── System metrics ─────────────────────────────────────
    sys_data = get_system_metrics()
    if sys_data:
        cpu = "CPU:{}%".format(sys_data.get("cpu_percent", "?"))
        mem = "Mem:{:.0f}%".format(sys_data.get("memory_percent", 0))
        disk = "Disk:{}%".format(sys_data.get("disk_percent", "?"))
        load = "Load:{}".format(sys_data.get("load_avg_1", "?"))
        up_d = sys_data.get("uptime", 0) // 86400
        draw.text((2, y), "{}  {}  {}".format(cpu, mem, disk), font=font, fill=0)
        y += 11
        draw.text((2, y), "{}  Up:{}d".format(load, up_d), font=font, fill=0)
        y += 12
    else:
        draw.text((2, y), "System: offline", font=font, fill=0)
        y += 12

    draw.line([(0, y), (W, y)], fill=0)
    y += 2

    # ── Services ───────────────────────────────────────────
    services = get_services()
    if services:
        up_count = sum(1 for s in services if s.get("active") == "active")
        down = [s["name"] for s in services if s.get("active") != "active"]
        draw.text((2, y), "Svc: {}/{} up".format(up_count, len(services)), font=font, fill=0)
        y += 11
        if down:
            down_str = ", ".join(down)
            if len(down_str) > 38:
                down_str = down_str[:35] + "..."
            draw.text((2, y), "DOWN: {}".format(down_str), font=font, fill=0)
            y += 11
    else:
        draw.text((2, y), "Services: N/A", font=font, fill=0)
        y += 11

    y += 1
    draw.line([(0, y), (W, y)], fill=0)
    y += 2

    # ── Mesh peers ─────────────────────────────────────────
    peers = get_mesh_peers()
    alive = sum(1 for _, s in peers if s == "up")
    draw.text((2, y), "Mesh: {}/{} up".format(alive, len(peers)), font=font, fill=0)
    y += 11
    for name, status in peers:
        if y > H - 10:
            break
        marker = "+" if status == "up" else "-"
        draw.text((4, y), "{} {} {}".format(marker, name, status), font=font, fill=0)
        y += 10

    return image


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    epd = epd2in13_V4.EPD()
    epd.init()
    epd.Clear(0xFF)
    time.sleep(0.5)

    image = draw_dashboard(epd)
    epd.display(epd.getbuffer(image))
    epd.sleep()
    print("Dashboard updated.")


if __name__ == "__main__":
    main()
