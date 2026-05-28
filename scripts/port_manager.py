#!/usr/bin/env python3
"""
Port Manager - Checks backend/frontend ports and ensures uniform configuration.
Supports port rotation for security purposes.
"""

import subprocess
import socket
import json
import re
import sys
import random
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, List, Dict

@dataclass
class Service:
    name: str
    systemd_unit: str
    expected_port: int
    actual_port: Optional[int] = None
    is_running: bool = False
    env_file: Optional[Path] = None
    port_env_var: str = "PORT"

SERVICES = [
    Service(
        name="backend",
        systemd_unit="aformulationoftruth-backend.service",
        expected_port=5742,
        env_file=Path("/var/www/aformulationoftruth/apps/backend/.env"),
        port_env_var="PORT"
    ),
    Service(
        name="fresh-questionnaire",
        systemd_unit="fresh-questionnaire.service",
        expected_port=7268,
        env_file=Path("/var/www/aformulationoftruth/fresh-questionnaire/.env"),
        port_env_var="PORT"
    ),
]

CADDY_CONFIG = Path("/etc/caddy/Caddyfile")
PORT_RANGE = (7000, 9000)  # Range for port rotation
WIREGUARD_NETWORK = "10.67.0.0/24"


def run_cmd(cmd: str, check: bool = False) -> subprocess.CompletedProcess:
    """Run a shell command and return result."""
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, check=check)


def is_port_listening(port: int, host: str = "0.0.0.0") -> bool:
    """Check if a port is listening."""
    result = run_cmd(f"ss -tlnp | grep ':{port} '")
    return bool(result.stdout.strip())


def get_service_port(unit: str) -> Optional[int]:
    """Extract the port a systemd service is listening on."""
    result = run_cmd(f"systemctl show {unit} --property=MainPID --value")
    if not result.stdout.strip() or result.stdout.strip() == "0":
        return None

    pid = result.stdout.strip()
    result = run_cmd(f"ss -tlnp | grep 'pid={pid},'")
    if result.stdout:
        match = re.search(r':(\d+)\s', result.stdout)
        if match:
            return int(match.group(1))
    return None


def check_service_status(service: Service) -> Service:
    """Check if a service is running and on what port."""
    result = run_cmd(f"systemctl is-active {service.systemd_unit}")
    service.is_running = result.stdout.strip() == "active"

    if service.is_running:
        service.actual_port = get_service_port(service.systemd_unit)

    return service


def update_env_port(env_file: Path, port_var: str, new_port: int) -> bool:
    """Update the port in an environment file."""
    if not env_file.exists():
        print(f"  [WARN] Env file not found: {env_file}")
        return False

    content = env_file.read_text()
    pattern = rf'^{port_var}=\d+$'
    replacement = f'{port_var}={new_port}'

    if re.search(pattern, content, re.MULTILINE):
        new_content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
    else:
        new_content = content.rstrip() + f'\n{port_var}={new_port}\n'

    env_file.write_text(new_content)
    return True


def update_caddy_port(old_port: int, new_port: int) -> bool:
    """Update port references in Caddy configuration."""
    if not CADDY_CONFIG.exists():
        print(f"  [WARN] Caddy config not found: {CADDY_CONFIG}")
        return False

    content = CADDY_CONFIG.read_text()
    # Match patterns like localhost:PORT or IP:PORT
    pattern = rf'(reverse_proxy\s+(?:localhost|\d+\.\d+\.\d+\.\d+)):{old_port}'
    replacement = rf'\1:{new_port}'

    new_content = re.sub(pattern, replacement, content)

    if new_content != content:
        # Use sudo to write
        result = run_cmd(f"echo '{new_content}' | sudo tee {CADDY_CONFIG} > /dev/null")
        return result.returncode == 0
    return True


def restart_service(unit: str) -> bool:
    """Restart a systemd service."""
    result = run_cmd(f"sudo systemctl restart {unit}")
    return result.returncode == 0


def reload_caddy() -> bool:
    """Reload Caddy configuration."""
    result = run_cmd("sudo systemctl reload caddy")
    return result.returncode == 0


def update_ufw_port(old_port: int, new_port: int, service_name: str) -> bool:
    """Update UFW rules for a port change."""
    # Remove old rule
    run_cmd(f"sudo ufw delete allow from {WIREGUARD_NETWORK} to any port {old_port} proto tcp")
    # Add new rule
    result = run_cmd(
        f"sudo ufw allow from {WIREGUARD_NETWORK} to any port {new_port} proto tcp "
        f"comment '{service_name} via WireGuard'"
    )
    return result.returncode == 0


def check_ufw_status() -> None:
    """Check and display UFW firewall status for relevant ports."""
    print("\n=== UFW Firewall Status ===\n")
    result = run_cmd("sudo ufw status | grep -E '(7268|5742|wg0|WIREGUARD)'")
    if result.stdout:
        for line in result.stdout.strip().split('\n'):
            print(f"  {line}")
    else:
        print("  No matching UFW rules found for service ports")


def get_available_port(exclude: List[int] = None) -> int:
    """Get a random available port in the allowed range."""
    exclude = exclude or []
    attempts = 0
    while attempts < 100:
        port = random.randint(*PORT_RANGE)
        if port not in exclude and not is_port_listening(port):
            return port
        attempts += 1
    raise RuntimeError("Could not find available port")


def check_all_services() -> Dict[str, Service]:
    """Check status of all services."""
    print("\n=== Service Status Check ===\n")
    results = {}

    for service in SERVICES:
        service = check_service_status(service)
        results[service.name] = service

        status = "RUNNING" if service.is_running else "STOPPED"
        port_info = f"port {service.actual_port}" if service.actual_port else "no port detected"
        expected = f"(expected: {service.expected_port})"

        match = ""
        if service.is_running and service.actual_port:
            if service.actual_port == service.expected_port:
                match = "[OK]"
            else:
                match = "[MISMATCH]"

        print(f"  {service.name}: {status} - {port_info} {expected} {match}")

    return results


def fix_mismatches(services: Dict[str, Service]) -> None:
    """Fix any port mismatches between services and Caddy."""
    print("\n=== Fixing Mismatches ===\n")

    for name, service in services.items():
        if not service.is_running:
            print(f"  {name}: Starting service...")
            restart_service(service.systemd_unit)
            continue

        if service.actual_port and service.actual_port != service.expected_port:
            print(f"  {name}: Updating Caddy to use actual port {service.actual_port}")
            if update_caddy_port(service.expected_port, service.actual_port):
                service.expected_port = service.actual_port
                print(f"    [OK] Caddy updated")
            else:
                print(f"    [FAIL] Could not update Caddy")

    print("\n  Reloading Caddy...")
    if reload_caddy():
        print("    [OK] Caddy reloaded")
    else:
        print("    [FAIL] Caddy reload failed")


def rotate_ports() -> None:
    """Rotate all service ports to new random values."""
    print("\n=== Port Rotation ===\n")

    used_ports = []

    for service in SERVICES:
        service = check_service_status(service)
        old_port = service.actual_port or service.expected_port
        new_port = get_available_port(exclude=used_ports)
        used_ports.append(new_port)

        print(f"  {service.name}: {old_port} -> {new_port}")

        # Update env file
        if service.env_file:
            if update_env_port(service.env_file, service.port_env_var, new_port):
                print(f"    [OK] Updated {service.env_file}")

        # Update Caddy
        if update_caddy_port(old_port, new_port):
            print(f"    [OK] Updated Caddy config")

        # Update UFW
        if update_ufw_port(old_port, new_port, service.name):
            print(f"    [OK] Updated UFW rules")
        else:
            print(f"    [WARN] UFW update may have failed")

        # Restart service
        print(f"    Restarting {service.systemd_unit}...")
        if restart_service(service.systemd_unit):
            print(f"    [OK] Service restarted")
        else:
            print(f"    [FAIL] Service restart failed")

    print("\n  Reloading Caddy...")
    if reload_caddy():
        print("    [OK] Caddy reloaded")
    else:
        print("    [FAIL] Caddy reload failed")


def test_endpoints() -> None:
    """Test that all endpoints are responding."""
    print("\n=== Endpoint Tests ===\n")

    endpoints = [
        ("Backend (localhost)", "http://localhost:5742/"),
        ("Backend (WireGuard)", "http://10.67.0.1:5742/"),
        ("Fresh (localhost)", "http://localhost:7268/"),
        ("Fresh (secondary IP)", "http://82.221.100.18/"),
    ]

    for name, url in endpoints:
        result = run_cmd(f"curl -s -o /dev/null -w '%{{http_code}}' -m 5 {url}")
        code = result.stdout.strip()
        status = "[OK]" if code and code != "000" else "[FAIL]"
        print(f"  {name}: HTTP {code} {status}")


def main():
    if len(sys.argv) < 2:
        print("Usage: port_manager.py <command>")
        print("\nCommands:")
        print("  check   - Check service status and port configuration")
        print("  fix     - Fix any mismatches between services and Caddy")
        print("  rotate  - Rotate all ports to new random values")
        print("  test    - Test all endpoints are responding")
        print("  ufw     - Check UFW firewall status")
        print("  all     - Run check, fix, ufw, and test")
        sys.exit(1)

    command = sys.argv[1]

    if command == "check":
        check_all_services()
    elif command == "fix":
        services = check_all_services()
        fix_mismatches(services)
    elif command == "rotate":
        rotate_ports()
    elif command == "test":
        test_endpoints()
    elif command == "ufw":
        check_ufw_status()
    elif command == "all":
        services = check_all_services()
        fix_mismatches(services)
        check_ufw_status()
        test_endpoints()
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
