# Manual Deployment Guide
## gimbal.fobdongle.is (Iceland Server)

This guide provides step-by-step manual deployment instructions if you prefer not to use the automated deployment script.

## Prerequisites

- Ubuntu 22.04 or 24.04 LTS
- Root access to server at 185.146.234.144
- DNS A record: `gimbal.fobdongle.is` → `185.146.234.144`
- Basic knowledge of Linux administration

## Part 1: System Preparation

### 1.1 Update System

```bash
apt-get update
apt-get upgrade -y
```

### 1.2 Install Core Dependencies

```bash
apt-get install -y \
    curl \
    wget \
    git \
    ufw \
    gnupg \
    apt-transport-https \
    ca-certificates \
    software-properties-common
```

### 1.3 Create Deployment Directory

```bash
mkdir -p /root/iceland-deployment
cd /root/iceland-deployment
```

## Part 2: WireGuard VPN Server

### 2.1 Install WireGuard

```bash
apt-get install -y wireguard wireguard-tools qrencode
```

### 2.2 Enable IP Forwarding

```bash
cat > /etc/sysctl.d/99-wireguard.conf <<EOF
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
EOF

sysctl -p /etc/sysctl.d/99-wireguard.conf
```

### 2.3 Generate Server Keys

```bash
mkdir -p /etc/wireguard/keys
chmod 700 /etc/wireguard/keys

cd /etc/wireguard/keys
wg genkey | tee server-private.key | wg pubkey > server-public.key
chmod 400 server-private.key
chmod 444 server-public.key

SERVER_PRIVATE_KEY=$(cat server-private.key)
SERVER_PUBLIC_KEY=$(cat server-public.key)

echo "Server Public Key: $SERVER_PUBLIC_KEY"
```

### 2.4 Create Server Configuration

```bash
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = $SERVER_PRIVATE_KEY

PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE; ip6tables -A FORWARD -i %i -j ACCEPT; ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE; ip6tables -D FORWARD -i %i -j ACCEPT; ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

chmod 600 /etc/wireguard/wg0.conf
```

### 2.5 Generate Client Configuration

```bash
mkdir -p /etc/wireguard/clients
chmod 700 /etc/wireguard/clients

# Generate client keys
CLIENT_PRIVATE_KEY=$(wg genkey)
CLIENT_PUBLIC_KEY=$(echo "$CLIENT_PRIVATE_KEY" | wg pubkey)
PRESHARED_KEY=$(wg genpsk)

# Create client config
cat > /etc/wireguard/clients/proust-main.conf <<EOF
[Interface]
PrivateKey = $CLIENT_PRIVATE_KEY
Address = 10.8.0.2/24
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = $SERVER_PUBLIC_KEY
PresharedKey = $PRESHARED_KEY
Endpoint = 185.146.234.144:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
EOF

chmod 400 /etc/wireguard/clients/proust-main.conf

# Add client to server config
cat >> /etc/wireguard/wg0.conf <<EOF

# Client: proust-main
[Peer]
PublicKey = $CLIENT_PUBLIC_KEY
PresharedKey = $PRESHARED_KEY
AllowedIPs = 10.8.0.2/32
EOF
```

### 2.6 Start WireGuard

```bash
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Verify
wg show
```

### 2.7 Save Client Config

```bash
echo "Save this client config for proust server:"
cat /etc/wireguard/clients/proust-main.conf
```

## Part 3: PostgreSQL Database

### 3.1 Install PostgreSQL

```bash
apt-get install -y postgresql postgresql-contrib
```

### 3.2 Configure Database

```bash
# Generate secure password
DB_PASSWORD=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-20)
echo "Database Password: $DB_PASSWORD"

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE DATABASE gimbal_storage;
CREATE USER gimbal WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE gimbal_storage TO gimbal;
\c gimbal_storage
GRANT ALL ON SCHEMA public TO gimbal;
EOF
```

## Part 4: Node.js and Storage API

### 4.1 Install Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify
node --version
npm --version
```

### 4.2 Deploy Storage API

```bash
# Create application directory
mkdir -p /opt/gimbal-storage
cd /opt/gimbal-storage

# Copy application files from deployment package
cp -r /root/iceland-deployment/storage-api/* .

# Generate API keys
API_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

echo "API_KEY: $API_KEY"
echo "ENCRYPTION_KEY: $ENCRYPTION_KEY"
echo ""
echo "⚠️  SAVE THESE KEYS SECURELY - YOU'LL NEED THEM ON PROUST SERVER"
```

### 4.3 Create Environment File

```bash
cat > /opt/gimbal-storage/.env <<EOF
DATABASE_URL=postgresql://gimbal:$DB_PASSWORD@localhost:5432/gimbal_storage
API_KEY=$API_KEY
ENCRYPTION_KEY=$ENCRYPTION_KEY
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DOMAIN=gimbal.fobdongle.is
EOF

chmod 600 /opt/gimbal-storage/.env
```

### 4.4 Install Dependencies

```bash
cd /opt/gimbal-storage
npm install --production
```

### 4.5 Initialize Database Schema

```bash
node db.js
```

### 4.6 Create Systemd Service

```bash
cat > /etc/systemd/system/gimbal-storage.service <<EOF
[Unit]
Description=Gimbal Encrypted Storage API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/gimbal-storage
Environment=NODE_ENV=production
EnvironmentFile=/opt/gimbal-storage/.env
ExecStart=/usr/bin/node /opt/gimbal-storage/server.js
Restart=always
RestartSec=10

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/gimbal-storage

StandardOutput=journal
StandardError=journal
SyslogIdentifier=gimbal-storage

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gimbal-storage
systemctl start gimbal-storage

# Verify
systemctl status gimbal-storage
curl http://localhost:3001/health
```

## Part 5: Caddy Web Server

### 5.1 Install Caddy

```bash
# Add Caddy repository
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
    tee /etc/apt/sources.list.d/caddy-stable.list

apt-get update
apt-get install -y caddy
```

### 5.2 Configure Caddy

```bash
cat > /etc/caddy/Caddyfile <<EOF
gimbal.fobdongle.is {
    tls {
        protocols tls1.3
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
        -Server
    }

    reverse_proxy localhost:3001 {
        health_uri /health
        health_interval 10s
        health_timeout 5s
    }

    log {
        output file /var/log/caddy/gimbal-access.log
        format json
    }
}

http://gimbal.fobdongle.is {
    redir https://{host}{uri} permanent
}
EOF

# Create log directory
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

# Test configuration
caddy validate --config /etc/caddy/Caddyfile
```

### 5.3 Start Caddy

```bash
systemctl restart caddy
systemctl enable caddy

# Verify
systemctl status caddy
curl https://gimbal.fobdongle.is/health
```

## Part 6: Firewall Configuration

### 6.1 Configure UFW

```bash
# Reset firewall
ufw --force reset

# Set defaults
ufw default deny incoming
ufw default allow outgoing

# Allow services
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 51820/udp comment 'WireGuard'

# Enable firewall
ufw --force enable

# Verify
ufw status
```

## Part 7: Verification

### 7.1 Check All Services

```bash
# WireGuard
systemctl status wg-quick@wg0
wg show

# PostgreSQL
systemctl status postgresql

# Storage API
systemctl status gimbal-storage
curl http://localhost:3001/health

# Caddy
systemctl status caddy
curl https://gimbal.fobdongle.is/health

# Firewall
ufw status numbered
```

### 7.2 Test API Authentication

```bash
# Should fail (no auth)
curl https://gimbal.fobdongle.is/api/stats

# Should succeed
curl -H "Authorization: Bearer $API_KEY" \
     https://gimbal.fobdongle.is/health
```

### 7.3 View Logs

```bash
# WireGuard
journalctl -u wg-quick@wg0 -f

# Storage API
journalctl -u gimbal-storage -f

# Caddy
journalctl -u caddy -f
tail -f /var/log/caddy/gimbal-access.log
```

## Part 8: Configure Proust Server

### 8.1 Transfer Client Config

From Iceland server:
```bash
cat /etc/wireguard/clients/proust-main.conf
```

On proust server:
```bash
# Install WireGuard
apt-get install -y wireguard wireguard-tools

# Save client config
nano /etc/wireguard/wg0.conf
# Paste the client config, save, and exit

chmod 400 /etc/wireguard/wg0.conf

# Start WireGuard
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Test connection
ping 10.8.0.1
```

### 8.2 Update Proust Environment

On proust server, add to `.env`:
```bash
VPS_ENDPOINT=https://gimbal.fobdongle.is
VPS_API_KEY=<API_KEY_FROM_ICELAND>
VPS_ENCRYPTION_KEY=<ENCRYPTION_KEY_FROM_ICELAND>
```

### 8.3 Restart Proust Application

```bash
systemctl restart aformulationoftruth
```

## Part 9: Testing

### 9.1 Run Test Suite

On proust server:
```bash
# Set environment
export API_KEY="<YOUR_API_KEY>"
export VPS_API_KEY="$API_KEY"

# Run tests
bash /path/to/test-encrypted-link.sh
```

### 9.2 Manual Tests

```bash
# Test VPN
ping 10.8.0.1

# Test DNS
dig gimbal.fobdongle.is

# Test HTTPS
curl -v https://gimbal.fobdongle.is/health

# Test API
curl -H "Authorization: Bearer $API_KEY" \
     https://gimbal.fobdongle.is/api/stats
```

## Troubleshooting

### WireGuard Issues

```bash
# Check status
wg show

# Check logs
journalctl -u wg-quick@wg0

# Restart
systemctl restart wg-quick@wg0

# Check routing
ip route
```

### API Issues

```bash
# Check service
systemctl status gimbal-storage

# Check logs
journalctl -u gimbal-storage -n 100

# Check database
sudo -u postgres psql -d gimbal_storage -c "SELECT COUNT(*) FROM responses;"

# Test locally
curl http://localhost:3001/health
```

### Certificate Issues

```bash
# Check Caddy logs
journalctl -u caddy -n 100

# Verify DNS
dig gimbal.fobdongle.is

# Test certificate
openssl s_client -connect gimbal.fobdongle.is:443
```

### Firewall Issues

```bash
# Check rules
ufw status numbered

# Check if ports are open
ss -tulpn | grep -E '51820|3001|443'

# Temporarily disable for testing
ufw disable
# Test...
ufw enable
```

## Maintenance

### Key Rotation

Client keys should be rotated every 90 days:

```bash
# Generate new client keys
NEW_CLIENT_PRIVATE=$(wg genkey)
NEW_CLIENT_PUBLIC=$(echo "$NEW_CLIENT_PRIVATE" | wg pubkey)
NEW_PRESHARED=$(wg genpsk)

# Update client config
# Update server config
# Restart WireGuard on both servers
```

### Backups

```bash
# Backup database
pg_dump gimbal_storage > /root/backups/gimbal-$(date +%Y%m%d).sql

# Encrypt backup
gpg --symmetric --cipher-algo AES256 /root/backups/gimbal-$(date +%Y%m%d).sql

# Backup configs
tar -czf /root/backups/configs-$(date +%Y%m%d).tar.gz \
    /etc/wireguard \
    /etc/caddy/Caddyfile \
    /opt/gimbal-storage/.env
```

### Updates

```bash
# Update system
apt-get update && apt-get upgrade -y

# Update Node.js packages
cd /opt/gimbal-storage
npm update

# Restart services
systemctl restart gimbal-storage
systemctl restart caddy
```

## Next Steps

1. Set up automated backups
2. Configure monitoring and alerts
3. Implement log rotation
4. Test disaster recovery procedures
5. Document incident response procedures

## Support

For issues:
- Check logs: `journalctl -xe`
- Review [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Test with: `test-encrypted-link.sh`
