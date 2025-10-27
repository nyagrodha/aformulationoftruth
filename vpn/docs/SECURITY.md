# WireGuard VPN Security Guidelines

## Security Architecture

This document outlines the security architecture, threat model, and best practices for the WireGuard VPN implementation.

## Table of Contents

- [Threat Model](#threat-model)
- [Security Controls](#security-controls)
- [Cryptography](#cryptography)
- [Permission Model](#permission-model)
- [Hardening](#hardening)
- [Incident Response](#incident-response)
- [Compliance](#compliance)

## Threat Model

### Protected Against

1. **Network Eavesdropping**
   - All traffic encrypted with ChaCha20-Poly1305
   - Perfect forward secrecy via ephemeral keys
   - Protection against MITM attacks

2. **Unauthorized Access**
   - Public key authentication only
   - No password-based authentication
   - Strict file permissions (400/600/700)
   - Systemd service isolation

3. **Data Tampering**
   - Authenticated encryption with Poly1305 MAC
   - Integrity verification on all packets
   - Preshared keys for additional authentication layer

4. **DoS Attacks**
   - Stateless handshake design
   - Cookie-based rate limiting
   - Minimal attack surface

5. **Post-Quantum Threats** (Partial)
   - Optional preshared keys add symmetric security
   - Recommended for high-security environments

### Not Protected Against

1. **Compromised Server**
   - If server is compromised, all VPN traffic can be intercepted
   - Mitigation: Regular security audits, minimal installed software

2. **Compromised Client Keys**
   - Stolen private keys allow impersonation
   - Mitigation: Hardware keys, short-lived certificates, regular rotation

3. **Timing Attacks**
   - Advanced side-channel attacks may leak information
   - Mitigation: Constant-time implementations, noise protocol

4. **Traffic Analysis**
   - Metadata (timing, packet sizes) may reveal information
   - Mitigation: Traffic obfuscation, constant packet rates

## Security Controls

### Access Control

#### Server Access
- **Root Access Required**: All management operations require root
- **SSH Key Authentication**: Disable password authentication for SSH
- **Firewall**: Whitelist only necessary ports (SSH, WireGuard)
- **Fail2ban**: Automatic IP banning for failed login attempts

```bash
# Recommended SSH hardening
echo "PasswordAuthentication no" >> /etc/ssh/sshd_config
echo "PermitRootLogin prohibit-password" >> /etc/ssh/sshd_config
systemctl restart sshd
```

#### VPN Access
- **Client Whitelisting**: Only explicitly added clients can connect
- **Per-Client Keys**: Each client has unique cryptographic identity
- **Revocation**: Instant removal via configuration update
- **Audit Trail**: All client additions/removals logged

### Network Security

#### Firewall Rules

Minimum required firewall configuration:

```bash
# UFW example
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 51820/udp comment "WireGuard"
ufw enable

# iptables example
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p udp --dport 51820 -j ACCEPT
iptables -A FORWARD -i wg0 -j ACCEPT
iptables -A FORWARD -o wg0 -j ACCEPT
```

#### Network Isolation
- **Separate VPN Network**: 10.8.0.0/24 isolated from host network
- **NAT**: Only NATted traffic allowed from VPN to internet
- **No Direct Host Access**: VPN clients cannot access server's other services
- **Optional Split Tunneling**: Configure client AllowedIPs for split tunnel

### File System Security

#### Directory Permissions

| Path | Mode | Owner:Group | Rationale |
|------|------|-------------|-----------|
| `/etc/wireguard` | 700 | root:root | Root-only config access |
| `/etc/wireguard/keys` | 700 | root:root | Critical key material |
| `/etc/wireguard/keys/clients/*` | 700 | root:root | Client key isolation |
| `/etc/wireguard/clients` | 750 | root:wg-admin | Admin read access |
| `/etc/wireguard/archive` | 700 | root:root | Protected archives |
| `/var/log/wireguard` | 750 | root:wg-admin | Log access for monitoring |

#### File Permissions

| File Type | Mode | Rationale |
|-----------|------|-----------|
| `*_private.key` | 400 | Read-only private keys |
| `*_preshared.key` | 400 | Read-only symmetric keys |
| `*_public.key` | 444 | Public keys (read-only) |
| `*.conf` | 600 | Config files with secrets |
| `*.json` | 640 | Metadata, group readable |
| `*.log` | 640 | Logs, group readable |

#### Automated Enforcement

Run security audit regularly:
```bash
# Audit only
sudo ./scripts/enforce-security.sh --audit

# Fix violations
sudo ./scripts/enforce-security.sh --fix

# Automated daily check (add to cron)
0 2 * * * /path/to/vpn/scripts/enforce-security.sh --audit >> /var/log/wireguard/daily-audit.log 2>&1
```

## Cryptography

### Algorithms

WireGuard uses state-of-the-art cryptography:

| Function | Algorithm | Key Size |
|----------|-----------|----------|
| Encryption | ChaCha20 | 256-bit |
| Authentication | Poly1305 | 256-bit |
| Key Exchange | Curve25519 ECDH | 256-bit |
| Hashing | BLAKE2s | 256-bit |
| Pre-shared Key | XChaCha20-Poly1305 | 256-bit |

### Key Management

#### Key Generation

Keys are generated using cryptographically secure methods:

```bash
# WireGuard built-in key generation (uses /dev/urandom)
wg genkey  # Private key
wg genpsk  # Preshared key
```

All keys are:
- 256 bits (32 bytes)
- Base64 encoded (44 characters)
- Generated from kernel CSPRNG

#### Key Storage

**Private Keys**:
- Stored only on server/client filesystem
- Never transmitted over network
- Permissions: 400 (read-only for root)
- Never logged or displayed

**Public Keys**:
- Shared between peers
- Used for peer identification
- Not secret, but integrity protected

**Preshared Keys** (Optional):
- Adds 256-bit symmetric security
- Provides post-quantum resistance
- Must be securely transmitted to clients
- Recommended for high-security deployments

#### Key Rotation

Recommended rotation schedule:

| Key Type | Rotation Period | Reason |
|----------|----------------|--------|
| Client Keys | 90 days | Limit exposure window |
| Server Keys | 1 year | Minimize client config updates |
| Preshared Keys | 180 days | Post-quantum resistance |

To rotate a client key:
```bash
# Remove old client
sudo ./scripts/remove-client.sh client-name

# Add with same IP (or new)
sudo ./scripts/add-client.sh client-name 10.8.0.X

# Distribute new config to client
```

To rotate server key (major disruption):
```bash
# Backup all client configs
sudo tar -czf ~/wg-backup.tar.gz /etc/wireguard/clients

# Remove old server key
sudo rm /etc/wireguard/keys/server_*.key

# Regenerate server
sudo ./scripts/setup-wireguard-server.sh

# Regenerate all clients
# (All client configs must be redistributed)
```

### Perfect Forward Secrecy

WireGuard provides perfect forward secrecy through:
1. **Ephemeral Session Keys**: New keys for each session
2. **Rekeying**: Automatic every 2 minutes or 2^64 bytes
3. **No Key Derivation**: Compromise doesn't affect other sessions

## Hardening

### System Hardening

#### Kernel Parameters

Add to `/etc/sysctl.conf`:

```bash
# IP Forwarding (required for VPN)
net.ipv4.ip_forward = 1

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Disable ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Enable reverse path filtering
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Log suspicious packets
net.ipv4.conf.all.log_martians = 1

# Ignore ping requests (optional)
# net.ipv4.icmp_echo_ignore_all = 1

# TCP hardening
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
```

Apply changes:
```bash
sudo sysctl -p
```

#### Systemd Service Hardening

Security features in `/etc/systemd/system/wg-quick@wg0.service.d/security.conf`:

```ini
[Service]
# Prevent privilege escalation
NoNewPrivileges=true

# Filesystem protection
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/etc/wireguard
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=false  # WireGuard needs kernel module
ProtectControlGroups=true

# Resource limits
LimitNOFILE=65536
LimitNPROC=512

# System call filtering
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
SystemCallArchitectures=native

# Namespace restrictions
RestrictNamespaces=true
PrivateUsers=false  # Required for network operations

# Additional hardening
LockPersonality=true
RestrictRealtime=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX
MemoryDenyWriteExecute=true
```

#### SELinux/AppArmor

**SELinux** (RHEL/CentOS):
```bash
# Ensure WireGuard policy is loaded
semodule -l | grep wireguard

# Set contexts
restorecon -Rv /etc/wireguard
```

**AppArmor** (Debian/Ubuntu):
```bash
# Create profile in /etc/apparmor.d/usr.bin.wg-quick
# (Profile creation is complex, consult AppArmor documentation)
```

### Application Hardening

#### Minimize Attack Surface
- Only WireGuard port (51820/udp) exposed
- No web interface (attack vector)
- No additional services on VPN server
- Minimal installed packages

#### Input Validation
- Client names: alphanumeric + dash/underscore only
- IP addresses: validated CIDR notation
- Configuration files: syntax validated before reload

#### Secure Defaults
- Full tunnel routing (0.0.0.0/0) by default
- Preshared keys enabled by default
- Strict permissions on all files
- Automatic security hardening

## Monitoring and Auditing

### Security Monitoring

#### Real-time Alerts

Configure alerts for security events:

```bash
# Edit monitoring script to add custom alerting
vim vpn/monitoring/monitor-vpn.sh

# Example: Send email on security event
send_alert() {
    local message="$1"
    echo "$message" | mail -s "WireGuard Security Alert" admin@example.com
}
```

#### Log Analysis

Monitor security-relevant logs:

```bash
# Watch authentication events
sudo journalctl -u wg-quick@wg0 -f | grep -i "peer"

# Watch for configuration changes
sudo inotifywait -m /etc/wireguard/wg0.conf

# Monitor failed connection attempts
sudo tcpdump -i eth0 udp port 51820 | grep -v "10.8.0"
```

#### Intrusion Detection

Integrate with IDS/IPS:

```bash
# Snort rule example (add to local.rules)
alert udp any any -> $HOME_NET 51820 (msg:"Excessive WireGuard handshakes"; \
    threshold:type threshold, track by_src, count 100, seconds 60; \
    classtype:attempted-dos; sid:1000001; rev:1;)
```

### Audit Logging

All security-relevant events are logged:

| Event | Log File | Retention |
|-------|----------|-----------|
| Client add/remove | `/var/log/wireguard/monitor.log` | 30 days |
| Security violations | `/var/log/wireguard/security-audit.log` | 90 days |
| Alerts | `/var/log/wireguard/alerts.log` | 90 days |
| Service events | `journalctl -u wg-quick@wg0` | System default |

Configure log rotation:
```bash
# /etc/logrotate.d/wireguard
/var/log/wireguard/*.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 640 root wg-admin
    sharedscripts
    postrotate
        systemctl reload wg-quick@wg0 > /dev/null 2>&1 || true
    endscript
}
```

## Incident Response

### Detection

Signs of compromise:
- Unexpected clients in `wg show` output
- Unusual bandwidth patterns
- Configuration file modifications (check mtime)
- Unexpected process connections to port 51820
- File permission violations

### Response Procedures

#### 1. Immediate Containment

```bash
# Stop VPN immediately
sudo systemctl stop wg-quick@wg0

# Block VPN port
sudo ufw deny 51820/udp

# Capture current state
sudo wg show all > ~/wg-incident-$(date +%s).log
sudo cp -r /etc/wireguard ~/wg-backup-$(date +%s)
```

#### 2. Investigation

```bash
# Check for unauthorized changes
sudo find /etc/wireguard -type f -mtime -1  # Files modified in last 24h

# Review logs
sudo journalctl -u wg-quick@wg0 --since "1 hour ago"
sudo grep "peer" /var/log/wireguard/* | grep -v "expected-clients"

# Check for suspicious processes
sudo ss -tulnp | grep 51820
sudo lsof -i :51820
```

#### 3. Remediation

```bash
# If server keys compromised:
# 1. Regenerate all keys
sudo rm -rf /etc/wireguard/keys/*
sudo ./scripts/setup-wireguard-server.sh

# 2. Revoke all client access
sudo rm /etc/wireguard/clients/*.conf

# 3. Re-add clients individually after verification
sudo ./scripts/add-client.sh trusted-client-1

# If specific client compromised:
sudo ./scripts/remove-client.sh compromised-client
# Issue new config to legitimate user
```

#### 4. Recovery

```bash
# Verify configuration
sudo ./scripts/enforce-security.sh --audit

# Restore service
sudo systemctl start wg-quick@wg0

# Monitor for 24 hours
sudo ./monitoring/monitor-vpn.sh continuous 60
```

### Post-Incident

1. **Root Cause Analysis**: Document what happened and why
2. **Update Procedures**: Improve detection and response
3. **Notify Users**: If client keys compromised, notify affected users
4. **Regulatory Compliance**: Report if required by law/policy

## Compliance

### Common Standards

#### NIST Guidelines

Aligns with:
- NIST SP 800-77: IPsec VPN Guide (conceptually similar)
- NIST SP 800-53: Security and Privacy Controls
  - AC-4: Information Flow Enforcement
  - SC-8: Transmission Confidentiality
  - SC-12: Cryptographic Key Management

#### CIS Benchmarks

Follows principles from:
- CIS Ubuntu Linux Benchmark
- CIS RedHat Enterprise Linux Benchmark
- Network Device Hardening

### Data Protection

#### GDPR Compliance

- **Data Minimization**: Only necessary connection metadata stored
- **Right to Erasure**: `remove-client.sh` permanently deletes user data
- **Data Portability**: Client configs in standard format
- **Security Measures**: Encryption, access controls, audit trails

#### HIPAA Considerations

For healthcare use:
- Enable audit logging for all access (BAA required)
- Implement automatic session timeout (30 minutes)
- Regular access reviews (quarterly recommended)
- Encrypted backups of configuration

### Industry-Specific

#### PCI-DSS

For payment card environments:
- Strong cryptography ✓ (ChaCha20-Poly1305)
- Unique keys per entity ✓ (per-client keys)
- Key management ✓ (secure generation, storage, rotation)
- Access control ✓ (strict permissions)
- Logging ✓ (comprehensive audit trail)

#### FedRAMP

For government use:
- FIPS 140-2 consideration: WireGuard not FIPS validated
- Alternative: Use FIPS-approved IPsec for FedRAMP systems
- Or: Wait for WireGuard FIPS mode (in development)

## Security Contacts

### Reporting Vulnerabilities

**DO NOT** create public GitHub issues for security vulnerabilities.

Instead:
1. Email: security@yourdomain.com
2. PGP Key: [Include PGP fingerprint]
3. Expected response: Within 48 hours

### Security Updates

Subscribe to security announcements:
- WireGuard mailing list: https://lists.zx2c4.com/mailman/listinfo/wireguard
- This project: Watch GitHub releases

### Third-Party Security Tools

Recommended for additional security:
- **fail2ban**: Automatic IP blocking for SSH
- **rkhunter**: Rootkit detection
- **aide**: File integrity monitoring
- **ossec**: Host-based IDS
- **lynis**: Security auditing tool

## Conclusion

This WireGuard VPN implementation prioritizes security through:
- Strong cryptography (256-bit, authenticated encryption)
- Least privilege access (strict permissions)
- Defense in depth (multiple security layers)
- Comprehensive monitoring and auditing
- Regular security policy enforcement

However, security is an ongoing process. Regularly:
- Update software packages
- Review audit logs
- Rotate cryptographic keys
- Test incident response procedures
- Stay informed about new threats

For questions or security concerns, contact the security team.
