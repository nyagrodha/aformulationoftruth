# Pyazopay Container Configuration

## Overview
**Container Name:** pyazopay
**Image:** osminogin/tor-simple:latest (Tor 0.4.8.21)
**Network:** docker_internal (172.23.0.0/16)
**Status:** Running (health: starting)
**Restart Policy:** unless-stopped

## Docker Compose Configuration

```yaml
pyazopay:
  image: osminogin/tor-simple:latest
  container_name: pyazopay
  restart: unless-stopped
  volumes:
    - ./tor/torrc:/etc/tor/torrc:ro
    - ./tor/hidden_service:/var/lib/tor/hidden_service
    - ./tor/data:/var/lib/tor/data
  cap_drop:
    - ALL
  cap_add:
    - CHOWN
    - SETUID
    - SETGID
    - DAC_OVERRIDE
  security_opt:
    - no-new-privileges:true
  networks:
    - internal
```

## Tor Configuration (torrc)

```
# Tor Configuration for A Formulation of Truth
# Optimized and hardened configuration

## Exit Policy (NOT an exit node)
ExitPolicy reject *:*

## Performance & Stability
NumCPUs 0
MaxMemInQueues 512 MB

## Bandwidth Limits
RelayBandwidthRate 1 MB
RelayBandwidthBurst 2 MB

## Control Ports
ControlPort 9051
HashedControlPassword 16:872860B76453A77D60CA2BB8C1A7042072093276A3D701AD684053EC4C

## Logging
Log notice stdout

## Security
DisableDebuggerAttachment 0

## Circuit Management - Optimized
CircuitStreamTimeout 30
MaxClientCircuitsPending 128
NewCircuitPeriod 60
MaxCircuitDirtiness 600
NumEntryGuards 8

## Connection Pooling
ConnLimit 8192
ConstrainedSockets 1
ConstrainedSockSize 16384

## Consensus Optimization
FetchDirInfoEarly 1
FetchDirInfoExtraEarly 1
FetchHidServDescriptors 1
FetchUselessDescriptors 0

## Data directory
DataDirectory /var/lib/tor/data

############### Hidden Services ###############

# Primary public site - main application (via Caddy)
# Onion address: a4mula4ufjuyci3zck6ivbjbcpg4ksbcn65mmpebsw66m2cff5qgt5id.onion
HiddenServiceDir /var/lib/tor/hidden_service
HiddenServiceVersion 3
HiddenServicePort 80 172.23.0.2:5742

# Redundancy and DoS protection
HiddenServiceNumIntroductionPoints 10
HiddenServiceEnableIntroDoSDefense 1
HiddenServiceEnableIntroDoSRatePerSec 25
HiddenServiceEnableIntroDoSBurstPerSec 200

################################################
```

## Hidden Service Details

**Onion Address:** a4mula4ufjuyci3zck6ivbjbcpg4ksbcn65mmpebsw66m2cff5qgt5id.onion
**Version:** v3
**Backend Target:** 172.23.0.2:5742 (karuppacami-frontend container)
**Port Mapping:** 80 (onion) → 5742 (internal)

## Security Features

- **Capabilities:** Minimal (ALL dropped, only CHOWN, SETUID, SETGID, DAC_OVERRIDE added)
- **Security Options:** no-new-privileges enabled
- **Read-only torrc:** Configuration mounted read-only
- **Network Isolation:** Internal Docker network only, no external port exposure
- **DoS Protection:** Introduction point DoS defense enabled
  - Rate limit: 25 connections/sec
  - Burst limit: 200 connections/sec

## Volume Mounts

1. **Configuration:** `./tor/torrc` → `/etc/tor/torrc` (read-only)
2. **Hidden Service Keys:** `./tor/hidden_service` → `/var/lib/tor/hidden_service` (read-write)
3. **Data Directory:** `./tor/data` → `/var/lib/tor/data` (read-write)

## Current Status & Issues

### Bootstrap Status
**Current State:** Stuck at 5% (conn) - Connecting to a relay
**Error:** Host is unreachable; NOROUTE

### Network Connectivity Issue
The container cannot establish outbound connections to the Tor network. While it can communicate within the Docker network (pings gateway at 172.23.0.1), it cannot reach external Tor relays.

**Failed Connection Count:** 12+ (and growing)
**Root Cause:** Network routing/firewall issue preventing Docker containers from reaching the internet

### Observed Errors
```
[warn] Problem bootstrapping. Stuck at 5% (conn): Connecting to a relay.
       (Host is unreachable; NOROUTE; count N; recommendation warn;
       host [FINGERPRINT] at [IP]:[PORT])
[warn] N connections have failed:
[warn]  N connections died in state connect()ing with SSL state (No SSL object)
```

## Health Check

**Health Check Command:**
```bash
curl -x socks5h://127.0.0.1:9050 'https://check.torproject.org/api/ip' | \
  grep -qm1 -E '"IsTor"\s*:\s*true'
```

**Timeout:** 15 seconds
**Interval:** 60 seconds
**Start Period:** 20 seconds

**Current Health:** Starting (will likely become unhealthy due to network issues)

## Network Configuration

**Docker Network:** internal (docker_internal)
**IP Address:** 172.23.0.4/16
**Gateway:** 172.23.0.1
**Internal Network:** Yes
**Bridge Interface:** br-eae9d0c986e7

## Listeners (Inside Container)

- **SOCKS Proxy:** 127.0.0.1:9050
- **Control Port:** 127.0.0.1:9051 (password protected)

## Management Commands

```bash
# View logs
sudo docker logs pyazopay -f

# Check status
sudo docker ps --filter name=pyazopay

# Restart container
sudo docker-compose restart pyazopay

# Access container shell
sudo docker exec -it pyazopay sh

# Check health
sudo docker inspect pyazopay --format='{{.State.Health.Status}}'
```

## Recent Logs Summary

Container started at: 2025-12-04 14:55:32 UTC

Key events:
1. ✓ SOCKS listener opened on 127.0.0.1:9050
2. ✓ Control listener opened on 127.0.0.1:9051
3. ✓ GEOIP files parsed successfully
4. ✓ Bootstrap started (0%)
5. ✓ Reached 5% (connecting to relay)
6. ✗ **STUCK:** Cannot connect to any Tor relays - network unreachable

## Troubleshooting Required

1. **Host Firewall Rules:** Check iptables/nftables for blocking rules
2. **Docker Network:** Verify MASQUERADE rules for br-eae9d0c986e7
3. **Routing Policy:** Check ip route/ip rule for VPN/NetBird conflicts
4. **DNS Resolution:** Verify container can resolve external hostnames
5. **Outbound Connectivity:** Test if any containers can reach the internet

---
*Document generated: 2025-12-04*
*Container renamed from: tor-proxy → pyazopay*
