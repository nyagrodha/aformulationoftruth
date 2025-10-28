#!/bin/bash
################################################################################
# Iceland Server (gimbal.fobdongle.is) Deployment Script
# Automated deployment of WireGuard VPN + Encrypted Storage API
#
# Server: 185.146.234.144
# Domain: gimbal.fobdongle.is
# Role: VPN Server + Encrypted Storage Endpoint
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_IP="185.146.234.144"
DOMAIN="gimbal.fobdongle.is"
WG_PORT="51820"
WG_NETWORK="10.8.0.0/24"
WG_SERVER_IP="10.8.0.1"
STORAGE_API_PORT="3001"
DEPLOYMENT_DIR="/root/iceland-deployment"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
fi

# Check if we're on the correct server
CURRENT_IP=$(hostname -I | awk '{print $1}')
if [[ "$CURRENT_IP" != "$SERVER_IP" ]]; then
    warn "Current IP ($CURRENT_IP) doesn't match expected ($SERVER_IP)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

header "Iceland Server Deployment - gimbal.fobdongle.com"

log "Server IP: $SERVER_IP"
log "Domain: $DOMAIN"
log "WireGuard Network: $WG_NETWORK"
log "Storage API Port: $STORAGE_API_PORT"

read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log "Deployment cancelled"
    exit 0
fi

################################################################################
# Step 1: Install Dependencies
################################################################################
header "Step 1: Installing Dependencies"

log "Updating package lists..."
apt-get update -qq

log "Installing essential packages..."
apt-get install -y \
    wireguard \
    wireguard-tools \
    postgresql \
    postgresql-contrib \
    curl \
    wget \
    ufw \
    debian-keyring \
    debian-archive-keyring \
    apt-transport-https \
    gnupg \
    qrencode

# Install Node.js 20.x
if ! command -v node &> /dev/null; then
    log "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    log "Node.js already installed: $(node --version)"
fi

# Install Caddy
if ! command -v caddy &> /dev/null; then
    log "Installing Caddy web server..."
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y caddy
else
    log "Caddy already installed: $(caddy version)"
fi

log "Dependencies installed successfully"

################################################################################
# Step 2: Configure Firewall
################################################################################
header "Step 2: Configuring Firewall (UFW)"

log "Resetting UFW to default..."
ufw --force reset

log "Setting default policies..."
ufw default deny incoming
ufw default allow outgoing

log "Allowing SSH (port 22)..."
ufw allow 22/tcp comment 'SSH'

log "Allowing HTTPS (port 443)..."
ufw allow 443/tcp comment 'HTTPS'

log "Allowing HTTP (port 80 - for certificate challenges)..."
ufw allow 80/tcp comment 'HTTP'

log "Allowing WireGuard (port $WG_PORT/udp)..."
ufw allow "$WG_PORT/udp" comment 'WireGuard VPN'

log "Enabling UFW..."
ufw --force enable

log "Firewall configured successfully"
ufw status

################################################################################
# Step 3: Enable IP Forwarding
################################################################################
header "Step 3: Enabling IP Forwarding"

log "Enabling IPv4 forwarding..."
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.d/99-wireguard.conf
sysctl -p /etc/sysctl.d/99-wireguard.conf

log "IP forwarding enabled"

################################################################################
# Step 4: Generate Cryptographic Keys
################################################################################
header "Step 4: Generating Cryptographic Keys"

# WireGuard keys
log "Generating WireGuard server keys..."
mkdir -p /etc/wireguard/keys
chmod 700 /etc/wireguard/keys

if [[ ! -f /etc/wireguard/keys/server-private.key ]]; then
    wg genkey | tee /etc/wireguard/keys/server-private.key | wg pubkey > /etc/wireguard/keys/server-public.key
    chmod 400 /etc/wireguard/keys/server-private.key
    chmod 444 /etc/wireguard/keys/server-public.key
    log "Server keys generated"
else
    log "Server keys already exist"
fi

# API and Encryption keys
log "Generating API keys and encryption keys..."
API_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-20)

log "Keys generated successfully"

################################################################################
# Step 5: Configure PostgreSQL Database
################################################################################
header "Step 5: Setting Up PostgreSQL Database"

log "Starting PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

log "Creating database and user..."
sudo -u postgres psql -c "CREATE DATABASE gimbal_storage;" 2>/dev/null || log "Database already exists"
sudo -u postgres psql -c "CREATE USER gimbal WITH ENCRYPTED PASSWORD '$DB_PASSWORD';" 2>/dev/null || log "User already exists"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE gimbal_storage TO gimbal;" 2>/dev/null
sudo -u postgres psql -d gimbal_storage -c "GRANT ALL ON SCHEMA public TO gimbal;" 2>/dev/null

log "PostgreSQL configured successfully"

################################################################################
# Step 6: Deploy Storage API
################################################################################
header "Step 6: Deploying Encrypted Storage API"

STORAGE_DIR="/opt/gimbal-storage"
log "Creating storage API directory: $STORAGE_DIR"
mkdir -p "$STORAGE_DIR"

# Copy storage API files
log "Copying application files..."
cp -r "$DEPLOYMENT_DIR/storage-api/"* "$STORAGE_DIR/"

# Create .env file
log "Creating environment configuration..."
cat > "$STORAGE_DIR/.env" <<EOF
# Database Configuration
DATABASE_URL=postgresql://gimbal:$DB_PASSWORD@localhost:5432/gimbal_storage

# API Authentication
API_KEY=$API_KEY

# Encryption Configuration
ENCRYPTION_KEY=$ENCRYPTION_KEY

# Server Configuration
NODE_ENV=production
PORT=$STORAGE_API_PORT
HOST=0.0.0.0

# Domain
DOMAIN=$DOMAIN
EOF

chmod 600 "$STORAGE_DIR/.env"

# Install Node.js dependencies
log "Installing Node.js dependencies..."
cd "$STORAGE_DIR"
npm install --production

# Initialize database schema
log "Initializing database schema..."
node "$STORAGE_DIR/db.js"

log "Storage API deployed successfully"

################################################################################
# Step 7: Create Systemd Service for Storage API
################################################################################
header "Step 7: Creating Systemd Service"

log "Creating gimbal-storage.service..."
cat > /etc/systemd/system/gimbal-storage.service <<EOF
[Unit]
Description=Gimbal Encrypted Storage API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$STORAGE_DIR
Environment=NODE_ENV=production
EnvironmentFile=$STORAGE_DIR/.env
ExecStart=/usr/bin/node $STORAGE_DIR/server.js
Restart=always
RestartSec=10

# Security Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$STORAGE_DIR

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gimbal-storage

[Install]
WantedBy=multi-user.target
EOF

log "Reloading systemd daemon..."
systemctl daemon-reload

log "Starting gimbal-storage service..."
systemctl start gimbal-storage
systemctl enable gimbal-storage

log "Waiting for API to start..."
sleep 3

# Test API
if curl -f http://localhost:$STORAGE_API_PORT/health &>/dev/null; then
    log "Storage API is running successfully"
else
    error "Storage API failed to start. Check logs: journalctl -u gimbal-storage"
fi

################################################################################
# Step 8: Configure Caddy for TLS
################################################################################
header "Step 8: Configuring Caddy Reverse Proxy"

log "Creating Caddyfile..."
cat > /etc/caddy/Caddyfile <<EOF
# Caddy Configuration for gimbal.fobdongle.com
# Automatic HTTPS with Let's Encrypt

$DOMAIN {
    # TLS Configuration
    tls {
        protocols tls1.3
    }

    # Security Headers
    header {
        # HSTS
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

        # Prevent MIME sniffing
        X-Content-Type-Options "nosniff"

        # Clickjacking protection
        X-Frame-Options "DENY"

        # XSS Protection
        X-XSS-Protection "1; mode=block"

        # Remove server info
        -Server
    }

    # Rate limiting (100 requests per minute per IP)
    rate_limit {
        zone storage_api {
            key {remote_host}
            events 100
            window 1m
        }
    }

    # Reverse proxy to Storage API
    reverse_proxy localhost:$STORAGE_API_PORT {
        # Health check
        health_uri /health
        health_interval 10s
        health_timeout 5s
    }

    # Access logging
    log {
        output file /var/log/caddy/gimbal-access.log
        format json
    }
}

# HTTP -> HTTPS redirect
http://$DOMAIN {
    redir https://{host}{uri} permanent
}
EOF

log "Creating log directory..."
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

log "Testing Caddy configuration..."
caddy validate --config /etc/caddy/Caddyfile

log "Starting Caddy..."
systemctl restart caddy
systemctl enable caddy

log "Caddy configured successfully"

################################################################################
# Step 9: Configure WireGuard Server
################################################################################
header "Step 9: Configuring WireGuard VPN Server"

SERVER_PRIVATE_KEY=$(cat /etc/wireguard/keys/server-private.key)
SERVER_PUBLIC_KEY=$(cat /etc/wireguard/keys/server-public.key)

log "Creating WireGuard server configuration..."
cat > /etc/wireguard/wg0.conf <<EOF
# WireGuard Server Configuration
# gimbal.fobdongle.com (185.146.234.144)
# Network: $WG_NETWORK

[Interface]
Address = $WG_SERVER_IP/24
ListenPort = $WG_PORT
PrivateKey = $SERVER_PRIVATE_KEY

# NAT Configuration for client internet access
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE; ip6tables -A FORWARD -i %i -j ACCEPT; ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE; ip6tables -D FORWARD -i %i -j ACCEPT; ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Client configurations will be appended below
# Use add-client.sh script to add clients
EOF

chmod 600 /etc/wireguard/wg0.conf

log "Starting WireGuard server..."
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

log "WireGuard server started successfully"
wg show

################################################################################
# Step 10: Generate Client Configuration for Proust
################################################################################
header "Step 10: Generating WireGuard Client Config for Proust"

CLIENT_NAME="proust-main"
CLIENT_IP="10.8.0.2"
CLIENT_DIR="/etc/wireguard/clients"

mkdir -p "$CLIENT_DIR"
chmod 700 "$CLIENT_DIR"

log "Generating client keys for $CLIENT_NAME..."
CLIENT_PRIVATE_KEY=$(wg genkey)
CLIENT_PUBLIC_KEY=$(echo "$CLIENT_PRIVATE_KEY" | wg pubkey)
PRESHARED_KEY=$(wg genpsk)

log "Creating client configuration..."
cat > "$CLIENT_DIR/$CLIENT_NAME.conf" <<EOF
# WireGuard Client Configuration for Proust Server
# Client: $CLIENT_NAME
# IP: $CLIENT_IP
# Server: gimbal.fobdongle.com ($SERVER_IP)

[Interface]
PrivateKey = $CLIENT_PRIVATE_KEY
Address = $CLIENT_IP/24
DNS = 1.1.1.1, 1.0.0.1

# Security: Prevent routing all traffic through VPN
# Only route VPN subnet traffic
Table = auto

[Peer]
PublicKey = $SERVER_PUBLIC_KEY
PresharedKey = $PRESHARED_KEY
Endpoint = $SERVER_IP:$WG_PORT
AllowedIPs = $WG_NETWORK

# Keepalive to maintain connection through NAT
PersistentKeepalive = 25
EOF

chmod 400 "$CLIENT_DIR/$CLIENT_NAME.conf"

log "Adding client to server configuration..."
cat >> /etc/wireguard/wg0.conf <<EOF

# Client: $CLIENT_NAME
# IP: $CLIENT_IP
# Generated: $(date)
[Peer]
PublicKey = $CLIENT_PUBLIC_KEY
PresharedKey = $PRESHARED_KEY
AllowedIPs = $CLIENT_IP/32
EOF

log "Reloading WireGuard configuration..."
wg syncconf wg0 <(wg-quick strip wg0)

log "Client configuration generated successfully"

# Generate QR code for easy mobile config
log "Generating QR code..."
qrencode -t ansiutf8 < "$CLIENT_DIR/$CLIENT_NAME.conf"

################################################################################
# Step 11: Save Configuration Summary
################################################################################
header "Step 11: Saving Configuration Summary"

SUMMARY_FILE="/root/iceland-deployment-summary.txt"

cat > "$SUMMARY_FILE" <<EOF
================================================================================
Iceland Server (gimbal.fobdongle.com) Deployment Summary
Generated: $(date)
================================================================================

SERVER INFORMATION
------------------
Public IP:       $SERVER_IP
Domain:          $DOMAIN
WireGuard IP:    $WG_SERVER_IP
VPN Network:     $WG_NETWORK

SERVICES STATUS
---------------
WireGuard VPN:   Active on port $WG_PORT/UDP
Storage API:     Active on port $STORAGE_API_PORT (internal)
Caddy HTTPS:     Active on port 443/TCP
PostgreSQL:      Active on port 5432 (localhost only)

CRYPTOGRAPHIC KEYS
------------------
⚠️  CRITICAL: Save these keys securely! You'll need them on the proust server.

API_KEY=$API_KEY
ENCRYPTION_KEY=$ENCRYPTION_KEY

DATABASE_URL=postgresql://gimbal:$DB_PASSWORD@localhost:5432/gimbal_storage

WIREGUARD SERVER
----------------
Public Key: $SERVER_PUBLIC_KEY
Endpoint:   $SERVER_IP:$WG_PORT

WIREGUARD CLIENT (proust-main)
------------------------------
Client IP:     $CLIENT_IP
Config File:   $CLIENT_DIR/$CLIENT_NAME.conf

CLIENT CONFIGURATION FILE:
--------------------------
$(cat "$CLIENT_DIR/$CLIENT_NAME.conf")

NEXT STEPS
----------
1. Verify DNS: dig gimbal.fobdongle.com (should return $SERVER_IP)

2. Test HTTPS:
   curl -v https://$DOMAIN/health

3. Transfer client config to proust server:
   scp root@$SERVER_IP:$CLIENT_DIR/$CLIENT_NAME.conf /etc/wireguard/wg0.conf

4. On proust server, configure environment variables:
   VPS_ENDPOINT=https://$DOMAIN
   VPS_API_KEY=$API_KEY
   VPS_ENCRYPTION_KEY=$ENCRYPTION_KEY

5. Start WireGuard on proust:
   systemctl enable wg-quick@wg0
   systemctl start wg-quick@wg0

6. Test VPN connection from proust:
   ping $WG_SERVER_IP

7. Test encrypted backup:
   curl -H "Authorization: Bearer $API_KEY" https://$DOMAIN/health

MONITORING COMMANDS
-------------------
# Check WireGuard status
wg show

# Check Storage API
systemctl status gimbal-storage
journalctl -u gimbal-storage -f

# Check Caddy
systemctl status caddy
journalctl -u caddy -f

# Test API health
curl http://localhost:$STORAGE_API_PORT/health
curl https://$DOMAIN/health

# View logs
tail -f /var/log/caddy/gimbal-access.log

SECURITY AUDIT
--------------
# Run security check
ls -la /etc/wireguard/
ls -la $STORAGE_DIR/

# Check firewall
ufw status

# Check open ports
ss -tulpn

================================================================================
⚠️  IMPORTANT: This file contains sensitive keys. Protect it carefully!
   chmod 400 $SUMMARY_FILE
================================================================================
EOF

chmod 400 "$SUMMARY_FILE"

log "Configuration summary saved to: $SUMMARY_FILE"

################################################################################
# Step 12: Final Verification
################################################################################
header "Step 12: Final Verification"

log "Checking service status..."

SERVICES=("postgresql" "gimbal-storage" "caddy" "wg-quick@wg0")
ALL_OK=true

for service in "${SERVICES[@]}"; do
    if systemctl is-active --quiet "$service"; then
        log "✓ $service is running"
    else
        warn "✗ $service is NOT running"
        ALL_OK=false
    fi
done

log "Testing internal API..."
if curl -f http://localhost:$STORAGE_API_PORT/health &>/dev/null; then
    log "✓ Storage API responding on localhost"
else
    warn "✗ Storage API not responding"
    ALL_OK=false
fi

log "Checking firewall rules..."
ufw status numbered | grep -E "(22|443|80|$WG_PORT)" && log "✓ Firewall rules configured"

################################################################################
# Deployment Complete
################################################################################
header "🎉 Deployment Complete!"

echo -e "${GREEN}"
cat <<'EOF'
   ____  _           _           _
  |  _ \| | ___   __| | ___   __| |
  | | | | |/ _ \ / _` |/ _ \ / _` |
  | |_| | |  __/| (_| |  __/| (_| |
  |____/|_|\___| \__,_|\___| \__,_|

  Iceland Server Ready!
EOF
echo -e "${NC}"

if $ALL_OK; then
    log "All services are running successfully!"
else
    warn "Some services may need attention. Check logs for details."
fi

echo ""
log "Configuration summary: $SUMMARY_FILE"
log "Client config: $CLIENT_DIR/$CLIENT_NAME.conf"
echo ""
log "Next steps:"
echo "  1. Verify DNS points to $SERVER_IP"
echo "  2. Test HTTPS: curl https://$DOMAIN/health"
echo "  3. Transfer client config to proust server"
echo "  4. Start WireGuard on proust and test connectivity"
echo ""
log "For detailed information, see: $SUMMARY_FILE"
echo ""

exit 0
