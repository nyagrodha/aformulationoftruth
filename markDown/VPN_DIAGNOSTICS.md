# VPN Service Diagnostics Report

**Date**: October 12, 2025
**Issue**: Caddy logs showing VPN service connection errors

## Problem Summary

Caddy is experiencing connection errors when trying to proxy requests to the VPN management interface:
- Error: `dial tcp 172.17.0.2:51821: connect: no route to host`
- Error: `dial tcp 172.17.0.2:51821: i/o timeout`

## Investigation Findings

### Container Status
- **Container**: `wg-easy` (weejewel/wg-easy:7)
- **Status**: Running (2 days uptime)
- **Published Ports**:
  - `51820/udp` → WireGuard VPN
  - `51821/tcp` → Web management interface

### Network Configuration Issue
1. **Caddyfile Configuration**: Proxies to `http://172.17.0.2:51821`
2. **Actual Container IP**: `10.8.0.2` (not 172.17.0.2)
3. **IP Mismatch**: The configured IP does not match the container's actual IP

### Connection Tests
- `172.17.0.2:51821` → ❌ No route to host
- `10.8.0.2:51821` → ❌ No route to host
- `localhost:51821` → ⚠️ Connection resets (persistent issue)

### Container Health
- Container logs show normal startup
- Server listening on `http://0.0.0.0:51821`
- WireGuard configuration loaded successfully
- **Authentication**: Password-protected (PASSWORD=KaruppacamiVPN2024)

## Root Cause

The wg-easy container appears to have connection issues even when accessed via localhost, suggesting a potential problem with:
1. Container networking configuration
2. Port binding conflicts
3. Authentication/session handling
4. Container health/restart issues

## Recommendations

### Option 1: Fix Container IP in Caddyfile
Update `/etc/caddy/Caddyfile` line 111:
```
# Current (incorrect)
reverse_proxy http://172.17.0.2:51821

# Proposed (use host networking)
reverse_proxy http://localhost:51821
```

### Option 2: Investigate Container Networking
1. Check docker-compose.yml for network configuration
2. Verify no port conflicts on 51821
3. Consider recreating container with proper network settings
4. Review container logs for authentication/session errors

### Option 3: Alternative Approaches
- Use docker network name instead of IP
- Configure Caddy to use docker socket
- Implement health checks before proxying

## Current Impact

- VPN management interface (vpn.aformulationoftruth.com) may be inaccessible via HTTPS
- Caddy logs accumulate error messages
- Main site functionality is **NOT affected** (different reverse_proxy targets work fine)

## Next Steps

1. **Before making changes**: Test if vpn.aformulationoftruth.com is actually working (errors might be from scanners/bots)
2. **If broken**: Update Caddyfile to use localhost instead of container IP
3. **If still broken**: Investigate container networking and authentication issues
4. **Long term**: Set up proper health monitoring for VPN service

## Files Modified
- None (diagnostics only)

## Related Configuration
- **Caddyfile**: `/etc/caddy/Caddyfile` (line 107-112)
- **Container**: `wg-easy` (Docker)
- **Network**: Custom bridge network (10.8.0.0/24)
