# WireGuard VPN - Secure VPN Infrastructure

Production-ready WireGuard VPN implementation with enterprise-grade security, comprehensive monitoring, and automated management tools.

## Quick Start

```bash
# 1. Install WireGuard
sudo apt install wireguard wireguard-tools  # Debian/Ubuntu
sudo dnf install wireguard-tools            # RHEL/Rocky

# 2. Run server setup
sudo ./scripts/setup-wireguard-server.sh

# 3. Add a client
sudo ./scripts/add-client.sh laptop

# 4. Verify
sudo wg show wg0
```

## Features

### Security
- **Military-Grade Encryption**: ChaCha20-Poly1305 authenticated encryption
- **Post-Quantum Resistant**: Preshared keys for additional security
- **Strict Permissions**: 400/600/700 file permissions enforced
- **Systemd Hardening**: Service isolation with security controls
- **Automated Auditing**: Security policy enforcement

### Management
- **One-Command Setup**: Automated server initialization
- **Easy Client Management**: Add/remove with QR code generation
- **Metadata Tracking**: JSON-based client information
- **Archive System**: Secure client configuration archival

### Monitoring
- **Real-Time Status**: Live connection monitoring
- **Bandwidth Tracking**: Per-client and aggregate statistics
- **Health Checks**: Automated service monitoring
- **Alert System**: Configurable security alerts
- **Resource Monitoring**: CPU, memory, disk tracking

## Directory Structure

```
vpn/
├── config/                          # TypeScript management API
│   └── wireguard-manager.ts
│
├── scripts/                         # Bash management scripts
│   ├── setup-wireguard-server.sh    # Server initialization
│   ├── add-client.sh                # Add client
│   ├── remove-client.sh             # Remove client
│   ├── list-clients.sh              # List all clients
│   └── enforce-security.sh          # Security policy enforcement
│
├── monitoring/                      # Monitoring tools
│   └── monitor-vpn.sh               # Real-time monitoring
│
├── services/                        # Systemd service files
│   └── (created during installation)
│
└── docs/                           # Documentation
    ├── README.md                   # Comprehensive guide
    ├── SECURITY.md                 # Security guidelines
    ├── INSTALLATION.md             # Installation guide
    └── API.md                      # API documentation
```

## Common Operations

### Server Management

```bash
# Start/stop/restart
sudo systemctl start wg-quick@wg0
sudo systemctl stop wg-quick@wg0
sudo systemctl restart wg-quick@wg0

# View status
sudo wg show wg0
sudo systemctl status wg-quick@wg0
```

### Client Management

```bash
# Add client
sudo ./scripts/add-client.sh client-name

# List clients
sudo ./scripts/list-clients.sh
sudo ./scripts/list-clients.sh --detailed

# Remove client
sudo ./scripts/remove-client.sh client-name
```

### Monitoring

```bash
# Status check
sudo ./monitoring/monitor-vpn.sh status

# Continuous monitoring
sudo ./monitoring/monitor-vpn.sh continuous 60

# Health check
sudo ./monitoring/monitor-vpn.sh health
```

### Security

```bash
# Security audit
sudo ./scripts/enforce-security.sh --audit

# Fix security issues
sudo ./scripts/enforce-security.sh --fix
```

## Documentation

- **[Comprehensive Guide](./docs/README.md)** - Complete documentation
- **[Security Guidelines](./docs/SECURITY.md)** - Security best practices
- **[Installation Guide](./docs/INSTALLATION.md)** - Step-by-step installation
- **[API Reference](./docs/API.md)** - TypeScript API documentation

## Security Features

- **Strict Permission Model**: All files have minimal required permissions
- **Systemd Hardening**: Service isolation and resource limits
- **Firewall Integration**: Automatic iptables/UFW/firewalld setup
- **Audit Logging**: Comprehensive logs for all operations
- **Key Management**: Secure generation, storage, and rotation
- **Automated Enforcement**: Regular security policy checks

## System Requirements

- **OS**: Linux (Ubuntu, Debian, RHEL, Rocky, CentOS)
- **Kernel**: Linux 5.6+ with WireGuard support
- **RAM**: 512MB minimum, 1GB+ recommended
- **Disk**: 100MB free space
- **Network**: Public IP or DDNS

## Network Architecture

```
Internet
    |
    | (51820/UDP)
    |
[WireGuard Server]
    |
    | (10.8.0.0/24)
    |
    +-- Client 1 (10.8.0.2)
    +-- Client 2 (10.8.0.3)
    +-- Client 3 (10.8.0.4)
    ...
```

## Configuration Files

After installation, configurations are stored in:

```
/etc/wireguard/
├── wg0.conf                    # Server config (600)
├── keys/                       # Keys directory (700)
│   ├── server_private.key      # Server private key (400)
│   ├── server_public.key       # Server public key (444)
│   └── clients/                # Client keys
│       └── [client]/
│           ├── private.key     # Client private key (400)
│           ├── public.key      # Client public key (444)
│           └── preshared.key   # Preshared key (400)
├── clients/                    # Client configs (750)
│   ├── [client].conf           # Client config (600)
│   └── [client].json           # Client metadata (640)
└── archive/                    # Removed clients (700)

/var/log/wireguard/
├── monitor.log                 # Monitoring logs
├── alerts.log                  # Alert logs
└── security-audit.log          # Audit logs
```

## TypeScript API

```typescript
import { WireGuardManager } from './config/wireguard-manager';

const manager = new WireGuardManager();

// Add client
const client = await manager.addClient('laptop');

// List clients
const clients = await manager.listClients();

// Get status
const peers = await manager.getPeerStatus();

// Get statistics
const stats = await manager.getStatistics();

// Remove client
await manager.removeClient('laptop');
```

## Client Installation

### Linux
```bash
sudo apt install wireguard
sudo wg-quick up /path/to/client.conf
```

### macOS
```bash
brew install wireguard-tools
# Or use WireGuard app from App Store
```

### Windows
Download from: https://www.wireguard.com/install/

### iOS/Android
1. Install WireGuard app from App/Play Store
2. Scan QR code generated by `add-client.sh`

## Monitoring Dashboard

```
====================================
  WireGuard VPN Monitoring Report
====================================
Status:
  Interface: wg0
  Total Peers: 5
  Active Peers: 3
  Inactive Peers: 2

Traffic:
  Total RX: 1.2GB
  Total TX: 850MB

System:
  CPU: 5.2%
  Memory: 256MB/1GB
====================================
```

## Security Best Practices

1. **Regular Updates**: Keep WireGuard and system updated
2. **Key Rotation**: Rotate client keys every 90 days
3. **Monitor Logs**: Review security logs regularly
4. **Limit Access**: Only add necessary clients
5. **Backup Keys**: Securely backup server private key
6. **Use Preshared Keys**: Enable for post-quantum resistance
7. **Enable Monitoring**: Run continuous monitoring

## Troubleshooting

### VPN Won't Start
```bash
sudo systemctl status wg-quick@wg0
sudo journalctl -u wg-quick@wg0 -n 50
sudo wg-quick strip wg0  # Check config syntax
```

### Client Can't Connect
```bash
sudo wg show wg0  # Check if peer is listed
sudo ss -ulnp | grep 51820  # Check if listening
sudo iptables -L -n -v | grep 51820  # Check firewall
```

### No Internet Through VPN
```bash
cat /proc/sys/net/ipv4/ip_forward  # Should be 1
sudo iptables -t nat -L POSTROUTING -n -v  # Check NAT
```

## Performance Tuning

```bash
# Adjust MTU (in client config)
MTU = 1380

# Optimize kernel parameters
echo "net.core.rmem_max=2500000" >> /etc/sysctl.conf
echo "net.core.wmem_max=2500000" >> /etc/sysctl.conf
sudo sysctl -p
```

## Logs

```bash
# Service logs
sudo journalctl -u wg-quick@wg0 -f

# Monitor logs
sudo tail -f /var/log/wireguard/monitor.log

# Alert logs
sudo tail -f /var/log/wireguard/alerts.log

# Security audits
sudo tail -f /var/log/wireguard/security-audit.log
```

## Backup and Recovery

```bash
# Backup configuration
sudo tar -czf wireguard-backup-$(date +%s).tar.gz /etc/wireguard

# Restore configuration
sudo tar -xzf wireguard-backup-*.tar.gz -C /

# Restart service
sudo systemctl restart wg-quick@wg0
```

## Support

- **Documentation**: See `docs/` directory
- **GitHub Issues**: https://github.com/nyagrodha/aformulationoftruth/issues
- **Security Issues**: See [SECURITY.md](./docs/SECURITY.md)

## Contributing

Contributions welcome! Please ensure:
- Proper error handling in scripts
- Security best practices followed
- Documentation updated
- Tested on multiple distributions

## License

MIT License - See LICENSE file for details

## Acknowledgments

- WireGuard® by Jason A. Donenfeld
- Linux kernel community
- Open source security community

---

**Note**: WireGuard is a registered trademark of Jason A. Donenfeld.

For comprehensive documentation, see [docs/README.md](./docs/README.md).
