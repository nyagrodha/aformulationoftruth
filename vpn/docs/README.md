# WireGuard VPN Architecture

A secure, production-ready WireGuard VPN implementation with strict security policies, comprehensive monitoring, and automated management tools.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [Security](#security)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

## Overview

This WireGuard VPN implementation provides a complete, enterprise-grade VPN solution with:
- Automated server and client configuration
- Strict permission controls and security hardening
- Real-time monitoring and alerting
- TypeScript-based management API
- Comprehensive logging and audit trails

## Features

### Security Features
- **AES-256 Encryption**: Military-grade encryption via WireGuard
- **Post-Quantum Resistance**: Preshared keys for additional security layer
- **Strict Permission Controls**: File and directory permissions enforced at 400/600/700
- **Systemd Hardening**: Service isolation and resource limits
- **Automatic Key Rotation Support**: Framework for key rotation policies
- **Security Auditing**: Automated security policy enforcement
- **Firewall Integration**: Automatic iptables/UFW/firewalld configuration

### Management Features
- **Automated Setup**: One-command server initialization
- **Client Management**: Easy add/remove client operations with QR code generation
- **Configuration Validation**: Automatic config syntax checking
- **Archive System**: Secure archival of removed client configurations
- **Metadata Tracking**: JSON-based client metadata for auditing

### Monitoring Features
- **Real-time Status**: Live connection monitoring
- **Bandwidth Tracking**: Per-client and aggregate bandwidth statistics
- **Health Checks**: Automated service health monitoring
- **Alert System**: Configurable alerts for security and performance issues
- **Resource Monitoring**: CPU, memory, and disk usage tracking
- **Stale Connection Detection**: Automatic detection of inactive clients

## Architecture

```
vpn/
├── config/                          # Configuration management
│   └── wireguard-manager.ts         # TypeScript management API
│
├── scripts/                         # Management scripts
│   ├── setup-wireguard-server.sh    # Server initialization
│   ├── add-client.sh                # Add new client
│   ├── remove-client.sh             # Remove client
│   ├── list-clients.sh              # List all clients
│   └── enforce-security.sh          # Security policy enforcement
│
├── monitoring/                      # Monitoring tools
│   └── monitor-vpn.sh               # Real-time monitoring
│
├── services/                        # Systemd services
│   └── (created during installation)
│
└── docs/                           # Documentation
    ├── README.md                   # This file
    ├── SECURITY.md                 # Security guidelines
    ├── INSTALLATION.md             # Installation guide
    └── API.md                      # API documentation
```

### System Directories (Created During Installation)

```
/etc/wireguard/
├── wg0.conf                        # Server configuration
├── keys/                           # Cryptographic keys (700)
│   ├── server_private.key          # Server private key (400)
│   ├── server_public.key           # Server public key (444)
│   └── clients/                    # Client keys (700)
│       └── [client-name]/
│           ├── private.key         # Client private key (400)
│           ├── public.key          # Client public key (444)
│           └── preshared.key       # Preshared key (400)
├── clients/                        # Client configurations (750)
│   ├── [client-name].conf          # Client config file (600)
│   └── [client-name].json          # Client metadata (640)
└── archive/                        # Archived configs (700)
    └── [client-name]_[timestamp].tar.gz

/var/log/wireguard/
├── monitor.log                     # Monitoring logs
├── alerts.log                      # Alert logs
└── security-audit.log              # Security audit logs
```

## Installation

### Prerequisites

- Linux server (Debian/Ubuntu or RHEL/CentOS)
- Root access
- WireGuard kernel module or wireguard-tools
- Node.js 18+ (for TypeScript management tools)
- Optional: qrencode (for QR code generation)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/aformulationoftruth.git
   cd aformulationoftruth/vpn
   ```

2. **Make scripts executable**
   ```bash
   chmod +x scripts/*.sh
   chmod +x monitoring/*.sh
   ```

3. **Run server setup**
   ```bash
   sudo ./scripts/setup-wireguard-server.sh
   ```

4. **Verify installation**
   ```bash
   sudo wg show wg0
   sudo systemctl status wg-quick@wg0
   ```

### Detailed Installation

See [INSTALLATION.md](./INSTALLATION.md) for detailed installation instructions.

## Usage

### Server Management

#### Start/Stop/Restart VPN
```bash
# Start
sudo systemctl start wg-quick@wg0

# Stop
sudo systemctl stop wg-quick@wg0

# Restart
sudo systemctl restart wg-quick@wg0

# Status
sudo systemctl status wg-quick@wg0
```

#### View Server Status
```bash
# Show interface details
sudo wg show wg0

# Show all interfaces
sudo wg show all

# Show specific peer
sudo wg show wg0 peers
```

### Client Management

#### Add a Client
```bash
# Add client with auto-assigned IP
sudo ./scripts/add-client.sh client-name

# Add client with specific IP
sudo ./scripts/add-client.sh client-name 10.8.0.50

# View client configuration
sudo cat /etc/wireguard/clients/client-name.conf

# Generate QR code for mobile
sudo qrencode -t ansiutf8 < /etc/wireguard/clients/client-name.conf
```

#### List Clients
```bash
# Table view (default)
sudo ./scripts/list-clients.sh

# Detailed view
sudo ./scripts/list-clients.sh --detailed

# Statistics only
sudo ./scripts/list-clients.sh --stats
```

#### Remove a Client
```bash
# Remove client (with confirmation)
sudo ./scripts/remove-client.sh client-name

# Client files are archived before removal
# Archives stored in: /etc/wireguard/archive/
```

### Monitoring

#### Real-time Monitoring
```bash
# One-time status check
sudo ./monitoring/monitor-vpn.sh status

# Continuous monitoring (60s interval)
sudo ./monitoring/monitor-vpn.sh continuous

# Continuous monitoring (30s interval)
sudo ./monitoring/monitor-vpn.sh continuous 30

# Health check only
sudo ./monitoring/monitor-vpn.sh health

# Generate report
sudo ./monitoring/monitor-vpn.sh report
```

#### View Logs
```bash
# System logs
sudo journalctl -u wg-quick@wg0 -f

# Monitor logs
sudo tail -f /var/log/wireguard/monitor.log

# Alert logs
sudo tail -f /var/log/wireguard/alerts.log

# Security audit logs
sudo tail -f /var/log/wireguard/security-audit.log
```

### Security Management

#### Run Security Audit
```bash
# Audit only
sudo ./scripts/enforce-security.sh --audit

# Fix issues automatically
sudo ./scripts/enforce-security.sh --fix
```

The security audit checks:
- Directory permissions (700, 750)
- File permissions (400, 600, 640)
- File ownership (root:root)
- Key format and strength
- Systemd service hardening
- Firewall configuration
- Configuration vulnerabilities

### TypeScript API

#### Basic Usage
```typescript
import { WireGuardManager } from './config/wireguard-manager';

// Initialize manager
const manager = new WireGuardManager();

// Add a client
const client = await manager.addClient('laptop-user');
console.log(`Client created with IP: ${client.ip}`);

// List all clients
const clients = await manager.listClients();
console.log(`Total clients: ${clients.length}`);

// Get peer status
const peers = await manager.getPeerStatus();
console.log(`Active peers: ${peers.length}`);

// Remove a client
await manager.removeClient('laptop-user');

// Check if running
const isRunning = await manager.isRunning();
console.log(`VPN is running: ${isRunning}`);

// Get statistics
const stats = await manager.getStatistics();
console.log(`Online: ${stats.onlineClients}/${stats.totalClients}`);
```

See [API.md](./API.md) for complete API documentation.

## Security

### Security Principles

1. **Least Privilege**: All files and directories use minimum required permissions
2. **Defense in Depth**: Multiple layers of security (encryption, firewall, permissions)
3. **Audit Trail**: Comprehensive logging of all operations
4. **Secure Defaults**: Safe configuration out of the box
5. **Regular Audits**: Automated security policy enforcement

### Permission Model

| Path | Permissions | Owner | Purpose |
|------|------------|-------|---------|
| `/etc/wireguard` | 700 | root:root | Main config directory |
| `/etc/wireguard/keys` | 700 | root:root | Key storage |
| `/etc/wireguard/clients` | 750 | root:wg-admin | Client configs |
| `*.conf` | 600 | root:root | Configuration files |
| `*_private.key` | 400 | root:root | Private keys (read-only) |
| `*_public.key` | 444 | root:root | Public keys |
| `*.json` | 640 | root:wg-admin | Metadata |

### Systemd Security Hardening

The WireGuard service includes:
- `NoNewPrivileges=true` - Prevents privilege escalation
- `PrivateTmp=true` - Isolated /tmp
- `ProtectSystem=strict` - Read-only filesystem
- `ProtectHome=true` - Hidden home directories
- `ProtectKernelTunables=true` - Protected /proc and /sys
- `RestrictNamespaces=true` - Limited namespace access
- `LockPersonality=true` - Locked execution domain
- `MemoryDenyWriteExecute=true` - W^X enforcement

### Encryption

- **Transport**: ChaCha20-Poly1305 authenticated encryption
- **Key Exchange**: Curve25519 ECDH
- **Hashing**: BLAKE2s
- **Additional Layer**: Preshared keys for post-quantum resistance

### Best Practices

1. **Regular Key Rotation**: Rotate client keys every 90 days
2. **Monitor Logs**: Review security audit logs regularly
3. **Limit Access**: Only authorized users should have VPN access
4. **Update Regularly**: Keep WireGuard and system packages updated
5. **Backup Keys**: Securely backup `/etc/wireguard/keys/server_private.key`
6. **Use Strong Endpoints**: Deploy behind firewall with DDoS protection
7. **Enable 2FA**: For VPN management access (if applicable)

See [SECURITY.md](./SECURITY.md) for comprehensive security guidelines.

## Monitoring

### Metrics Tracked

- **Connection Status**: Active/inactive clients
- **Bandwidth**: RX/TX per client and aggregate
- **Handshakes**: Latest handshake timestamps
- **System Resources**: CPU, memory, disk usage
- **Firewall Status**: iptables rules verification
- **Service Health**: Systemd service status

### Alerts

Alerts are triggered for:
- Interface down
- Service failure
- Stale connections (>5 minutes without handshake)
- High bandwidth usage (>1000 Mbps)
- High CPU/memory/disk usage (>90%)
- Firewall misconfiguration
- Permission violations

### Log Rotation

Configure logrotate for WireGuard logs:

```bash
# /etc/logrotate.d/wireguard
/var/log/wireguard/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 640 root wg-admin
}
```

## Troubleshooting

### Common Issues

#### VPN Not Starting
```bash
# Check service status
sudo systemctl status wg-quick@wg0

# Check logs
sudo journalctl -u wg-quick@wg0 -n 50

# Verify config syntax
sudo wg-quick strip wg0

# Check IP forwarding
cat /proc/sys/net/ipv4/ip_forward  # Should be 1
```

#### Client Cannot Connect
```bash
# Check server is listening
sudo ss -ulnp | grep 51820

# Check firewall
sudo iptables -L -n -v | grep 51820
sudo ufw status | grep 51820

# Verify peer is added
sudo wg show wg0 peers

# Check client config
# Ensure Endpoint points to correct server IP/hostname
```

#### No Internet Access Through VPN
```bash
# Check IP forwarding
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward

# Check NAT rules
sudo iptables -t nat -L POSTROUTING -n -v

# Check FORWARD rules
sudo iptables -L FORWARD -n -v
```

#### High Latency
```bash
# Check MTU settings
ip link show wg0  # Default 1420

# Adjust MTU if needed (in client config)
MTU = 1380

# Check network congestion
ping -c 10 10.8.0.1
```

### Debugging

Enable debug logging:
```bash
# Add to /etc/wireguard/wg0.conf
[Interface]
# ... existing config ...
# Debug = true  # Not standard, check WireGuard version

# Or use tcpdump
sudo tcpdump -i wg0 -n
```

### Recovery

#### Restore from Archive
```bash
# List archives
ls -la /etc/wireguard/archive/

# Extract archive
cd /tmp
sudo tar -xzf /etc/wireguard/archive/client-name_*.tar.gz

# Review and restore files manually
```

#### Regenerate Server
```bash
# Backup current config
sudo cp -r /etc/wireguard /etc/wireguard.backup

# Re-run setup (will skip if keys exist)
sudo ./scripts/setup-wireguard-server.sh

# Or force regeneration (delete keys first)
sudo rm /etc/wireguard/keys/server_*.key
sudo ./scripts/setup-wireguard-server.sh
```

## API Reference

See [API.md](./API.md) for complete TypeScript API documentation.

## Contributing

Contributions are welcome! Please ensure:
1. All scripts have proper error handling
2. Security best practices are followed
3. Documentation is updated
4. Changes are tested on multiple Linux distributions

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- GitHub Issues: https://github.com/nyagrodha/aformulationoftruth/issues
- Documentation: /vpn/docs/
- Security Issues: See SECURITY.md for responsible disclosure

## Acknowledgments

- WireGuard® by Jason A. Donenfeld
- Linux kernel team
- Open source security community
