# Iceland Server Deployment Package
## gimbal.fobdongle.is (185.146.234.144)

This package contains everything needed to deploy the Iceland server as the encrypted storage endpoint and VPN server for the proust.aformulationoftruth.com ↔ gimbal.fobdongle.is encrypted link.

## Server Specifications

- **Public IPv4**: 185.146.234.144
- **Subnet Mask**: 255.255.255.0
- **Gateway**: 185.146.234.254
- **IPv6 Range**: 2a06:1700:2:20c::3804:466a/64
- **Domain**: gimbal.fobdongle.is
- **Role**: VPN Server + Encrypted Storage API

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ proust.aformulationoftruth.com (Client)                     │
│  - WireGuard Client (10.8.0.2)                              │
│  - Sends encrypted responses via HTTPS API                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
            WireGuard VPN Tunnel (ChaCha20-Poly1305)
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ gimbal.fobdongle.is (Iceland Server - 185.146.234.144)    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Layer 1: Caddy (Port 443)                             │ │
│  │  - TLS 1.3 termination                                │ │
│  │  - Automatic HTTPS certificates                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                          ↓                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Layer 2: WireGuard Server (Port 51820/UDP)           │ │
│  │  - Server IP: 10.8.0.1                                │ │
│  │  - ChaCha20-Poly1305 + Preshared Keys                 │ │
│  │  - Network: 10.8.0.0/24                               │ │
│  └───────────────────────────────────────────────────────┘ │
│                          ↓                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Layer 3: Storage API (Port 3001)                      │ │
│  │  - Node.js Express server                             │ │
│  │  - PostgreSQL database                                │ │
│  │  - AES-256-GCM encrypted data storage                 │ │
│  │  - HMAC-SHA256 integrity verification                 │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Steps

### Prerequisites
1. Root access to Iceland server (185.146.234.144)
2. DNS A record: `gimbal.fobdongle.is` → `185.146.234.144`
3. Ubuntu 22.04 or 24.04 LTS installed

### Quick Deployment

```bash
# 1. Transfer this entire directory to Iceland server
scp -r iceland-deployment/ root@185.146.234.144:/root/

# 2. SSH into Iceland server
ssh root@185.146.234.144

# 3. Run the master deployment script
cd /root/iceland-deployment
chmod +x scripts/deploy-iceland.sh
./scripts/deploy-iceland.sh

# 4. Follow the interactive prompts
```

The deployment script will:
- Install all dependencies (WireGuard, PostgreSQL, Node.js, Caddy)
- Configure firewall (UFW)
- Set up WireGuard VPN server on 10.8.0.1
- Deploy encrypted storage API
- Configure TLS certificates for gimbal.fobdongle.is
- Create systemd services for auto-start
- Generate WireGuard client config for proust server

### Manual Deployment

If you prefer step-by-step control, see [docs/MANUAL_DEPLOYMENT.md](docs/MANUAL_DEPLOYMENT.md)

## Security Features

### Multi-Layer Encryption
1. **TLS 1.3** - Transport encryption via Caddy
2. **WireGuard VPN** - Network layer encryption (ChaCha20-Poly1305)
3. **Application Encryption** - AES-256-GCM for all stored data

### Authentication
- Bearer token API authentication
- WireGuard public/private key pairs
- Preshared keys for post-quantum resistance

### Hardening
- Systemd service isolation (NoNewPrivileges, ProtectSystem, ProtectHome)
- Minimal firewall rules (only 22, 443, 51820/UDP)
- Strict file permissions (400 for private keys)
- Rate limiting on API endpoints

## Directory Structure

```
iceland-deployment/
├── README.md                          # This file
├── scripts/
│   ├── deploy-iceland.sh              # Master deployment script
│   ├── setup-firewall.sh              # UFW configuration
│   ├── install-dependencies.sh        # System packages
│   └── generate-keys.sh               # Cryptographic key generation
├── config/
│   ├── wireguard-server.conf          # WireGuard server template
│   ├── Caddyfile                      # Caddy reverse proxy config
│   └── .env.template                  # Environment variables template
├── storage-api/
│   ├── package.json                   # Node.js dependencies
│   ├── server.js                      # Express API server
│   ├── db.js                          # PostgreSQL connection
│   ├── encryption.js                  # AES-256-GCM encryption service
│   └── routes.js                      # API endpoints
├── systemd/
│   ├── wireguard-server.service       # WireGuard service
│   └── gimbal-storage.service         # Storage API service
└── docs/
    ├── MANUAL_DEPLOYMENT.md           # Step-by-step instructions
    ├── TESTING.md                     # Testing procedures
    └── TROUBLESHOOTING.md             # Common issues
```

## Post-Deployment

### Retrieve Client Config for Proust
```bash
# On Iceland server
cat /etc/wireguard/clients/proust-main.conf
```

Copy this config to the proust server and save as `/etc/wireguard/wg0.conf`

### Verify Services
```bash
# Check WireGuard
systemctl status wg-quick@wg0
wg show

# Check Storage API
systemctl status gimbal-storage
curl http://localhost:3001/health

# Check Caddy
systemctl status caddy
curl https://gimbal.fobdongle.is/health
```

### Monitor VPN
```bash
# Watch real-time connections
watch -n 1 wg show

# View logs
journalctl -u wg-quick@wg0 -f
```

## Environment Variables

The deployment generates a `.env` file with secure random keys:

```bash
# Database
DATABASE_URL=postgresql://gimbal:RANDOM_PASSWORD@localhost:5432/gimbal_storage

# API Authentication
API_KEY=RANDOM_64_CHAR_HEX

# Encryption
ENCRYPTION_KEY=RANDOM_64_CHAR_HEX

# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
```

**IMPORTANT**: Save these keys securely. You'll need to configure the same `API_KEY` and `ENCRYPTION_KEY` on the proust server.

## Maintenance

### Key Rotation
```bash
# Rotate WireGuard client keys (every 90 days)
cd /root/iceland-deployment
./scripts/rotate-client-key.sh proust-main

# Update proust server with new config
```

### Backups
```bash
# Backup encrypted database
pg_dump gimbal_storage > /root/backups/gimbal-$(date +%Y%m%d).sql

# Encrypt backup
gpg --symmetric --cipher-algo AES256 /root/backups/gimbal-$(date +%Y%m%d).sql
```

### Monitoring
```bash
# Check VPN peers
wg show

# Check API health
curl https://gimbal.fobdongle.is/health

# Check disk space
df -h

# Check logs
journalctl -u gimbal-storage --since "1 hour ago"
```

## Support

For issues or questions:
1. Check [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
2. Review logs: `journalctl -xe`
3. Verify DNS: `dig gimbal.fobdongle.is`
4. Test connectivity: `curl -v https://gimbal.fobdongle.is/health`

## License

Part of the aformulationoftruth.com project.
