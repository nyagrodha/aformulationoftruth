import hashlib
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ONION_RE = re.compile(r"[a-z2-7]{56}\.onion", re.IGNORECASE)


@dataclass
class Config:
    socks_host: str = os.getenv("TOR_SOCKS_HOST", "tor")
    socks_port: int = int(os.getenv("TOR_SOCKS_PORT", "9050"))
    interval_s: int = int(os.getenv("MONITOR_INTERVAL_SECONDS", "300"))
    targets_file: str = os.getenv("MONITOR_TARGETS_FILE", "/app/targets.txt")
    db_path: str = os.getenv("MONITOR_DB_PATH", "/data/monitor.db")
    follow_redirects: bool = os.getenv("MONITOR_FOLLOW_REDIRECTS", "true").lower() == "true"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_targets(path: str) -> list[str]:
    targets: list[str] = []
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            targets.append(line)
    return targets


def normalize_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    return re.sub(r"\s+", " ", text).lower()


def content_signature(html: str) -> str:
    normalized = normalize_text(html)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def discover_onion_candidates(base_url: str, html: str) -> set[str]:
    soup = BeautifulSoup(html, "html.parser")
    found: set[str] = set(ONION_RE.findall(html))

    for a in soup.find_all("a", href=True):
        full = urljoin(base_url, a["href"])
        host = (urlparse(full).hostname or "").lower()
        if ONION_RE.fullmatch(host):
            found.add(host)

    return {f"http://{host}/" for host in found}


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checked_at TEXT NOT NULL,
            target_url TEXT NOT NULL,
            final_url TEXT,
            status_code INTEGER,
            ok INTEGER NOT NULL,
            error TEXT,
            content_sig TEXT,
            title TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS discovered_onions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discovered_at TEXT NOT NULL,
            source_url TEXT NOT NULL,
            discovered_url TEXT NOT NULL,
            UNIQUE(source_url, discovered_url)
        )
        """
    )
    conn.commit()


def save_discoveries(conn: sqlite3.Connection, source_url: str, discoveries: Iterable[str]) -> None:
    for url in discoveries:
        conn.execute(
            """
            INSERT OR IGNORE INTO discovered_onions (discovered_at, source_url, discovered_url)
            VALUES (?, ?, ?)
            """,
            (utc_now(), source_url, url),
        )
    conn.commit()


def recently_seen_signature(conn: sqlite3.Connection, signature: str, current_target: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT DISTINCT target_url
        FROM checks
        WHERE content_sig = ? AND target_url <> ?
        ORDER BY checked_at DESC
        LIMIT 5
        """,
        (signature, current_target),
    ).fetchall()
    return [r[0] for r in rows]


def run() -> None:
    cfg = Config()
    session = requests.Session()
    session.proxies = {
        "http": f"socks5h://{cfg.socks_host}:{cfg.socks_port}",
        "https": f"socks5h://{cfg.socks_host}:{cfg.socks_port}",
    }
    session.headers.update({"User-Agent": "tor-uptime-monitor/0.1"})

    conn = sqlite3.connect(cfg.db_path)
    init_db(conn)

    while True:
        targets = load_targets(cfg.targets_file)
        for target in targets:
            checked_at = utc_now()
            try:
                response = session.get(target, timeout=45, allow_redirects=cfg.follow_redirects)
                html = response.text or ""
                sig = content_signature(html) if html else None
                title = BeautifulSoup(html, "html.parser").title
                title_text = title.get_text(strip=True) if title else None
                final_url = response.url

                conn.execute(
                    """
                    INSERT INTO checks (checked_at, target_url, final_url, status_code, ok, error, content_sig, title)
                    VALUES (?, ?, ?, ?, 1, NULL, ?, ?)
                    """,
                    (checked_at, target, final_url, response.status_code, sig, title_text),
                )
                conn.commit()

                discoveries = discover_onion_candidates(final_url, html)
                if discoveries:
                    save_discoveries(conn, target, discoveries)

                if sig:
                    mirrors = recently_seen_signature(conn, sig, target)
                    if mirrors:
                        print(f"[{checked_at}] mirror-like content for {target}: {mirrors}")

                if final_url != target:
                    print(f"[{checked_at}] redirect {target} -> {final_url}")

                print(f"[{checked_at}] ok {target} ({response.status_code})")
            except Exception as exc:  # noqa: BLE001
                conn.execute(
                    """
                    INSERT INTO checks (checked_at, target_url, final_url, status_code, ok, error, content_sig, title)
                    VALUES (?, ?, NULL, NULL, 0, ?, NULL, NULL)
                    """,
                    (checked_at, target, str(exc)),
                )
                conn.commit()
                print(f"[{checked_at}] fail {target}: {exc}")

        time.sleep(cfg.interval_s)


if __name__ == "__main__":
    run()
