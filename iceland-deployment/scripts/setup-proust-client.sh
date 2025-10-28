#!/bin/bash
################################################################################
# Proust Server WireGuard Client Setup
# Configure proust.aformulationoftruth.com as VPN client
#
# Prerequisites:
# 1. WireGuard client config file from Iceland server
# 2. API_KEY and ENCRYPTION_KEY from Iceland deployment
# 3. Root access to proust server
################################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Check root
[[ $EUID -ne 0 ]] && error "This script must be run as root"

header "Proust Server - WireGuard VPN Client Setup"

# Configuration
GIMBAL_DOMAIN="gimbal.fobdongle.com"
GIMBAL_IP="185.146.234.144"
VPN_SERVER_IP="10.8.0.1"
CLIENT_CONFIG="/etc/wireguard/wg0.conf"
ENV_FILE="/home/runner/aformulationoftruth/.env"

################################################################################
# Step 1: Install WireGuard
################################################################################
header "Step 1: Installing WireGuard"

if command -v wg &> /dev/null; then
    log "WireGuard already installed: $(wg --version | head -n1)"
else
    log "Installing WireGuard..."
    apt-get update -qq
    apt-get install -y wireguard wireguard-tools
    log "WireGuard installed successfully"
fi

################################################################################
# Step 2: Configure WireGuard Client
################################################################################
header "Step 2: Configuring WireGuard Client"

if [[ -f "$CLIENT_CONFIG" ]]; then
    warn "Client config already exists: $CLIENT_CONFIG"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && log "Keeping existing config" && exit 0
fi

log "Please provide the WireGuard client configuration."
log "You can obtain it from Iceland server:"
echo ""
echo "  ssh root@$GIMBAL_IP 'cat /etc/wireguard/clients/proust-main.conf'"
echo ""
read -p "Path to client config file: " CONFIG_PATH

if [[ ! -f "$CONFIG_PATH" ]]; then
    error "Config file not found: $CONFIG_PATH"
fi

log "Installing client configuration..."
mkdir -p /etc/wireguard
cp "$CONFIG_PATH" "$CLIENT_CONFIG"
chmod 400 "$CLIENT_CONFIG"
chown root:root "$CLIENT_CONFIG"

log "Client config installed: $CLIENT_CONFIG"

################################################################################
# Step 3: Start WireGuard
################################################################################
header "Step 3: Starting WireGuard VPN"

log "Enabling WireGuard service..."
systemctl enable wg-quick@wg0

log "Starting WireGuard..."
systemctl start wg-quick@wg0

log "Waiting for connection..."
sleep 3

# Verify connection
if wg show wg0 &>/dev/null; then
    log "✓ WireGuard is running"
    wg show wg0
else
    error "✗ WireGuard failed to start. Check: journalctl -u wg-quick@wg0"
fi

################################################################################
# Step 4: Test VPN Connectivity
################################################################################
header "Step 4: Testing VPN Connectivity"

log "Testing ping to VPN server ($VPN_SERVER_IP)..."
if ping -c 3 -W 2 "$VPN_SERVER_IP" &>/dev/null; then
    log "✓ VPN connection successful"
else
    warn "✗ Cannot ping VPN server. Check WireGuard configuration."
fi

################################################################################
# Step 5: Update Environment Variables
################################################################################
header "Step 5: Updating Environment Variables"

log "Please provide the following credentials from Iceland deployment:"
echo ""
read -p "API_KEY: " API_KEY
read -p "ENCRYPTION_KEY: " ENCRYPTION_KEY
echo ""

if [[ -z "$API_KEY" || -z "$ENCRYPTION_KEY" ]]; then
    error "API_KEY and ENCRYPTION_KEY are required"
fi

# Backup existing .env
if [[ -f "$ENV_FILE" ]]; then
    log "Backing up existing .env..."
    cp "$ENV_FILE" "$ENV_FILE.backup-$(date +%Y%m%d-%H%M%S)"
fi

# Update or add VPS variables
log "Updating environment variables..."

# Remove old VPS variables if they exist
if [[ -f "$ENV_FILE" ]]; then
    grep -v "^VPS_ENDPOINT=" "$ENV_FILE" | \
    grep -v "^VPS_API_KEY=" | \
    grep -v "^VPS_ENCRYPTION_KEY=" > "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
fi

# Add new VPS variables
cat >> "$ENV_FILE" <<EOF

# VPS Encrypted Storage Configuration (Iceland/Gimbal)
VPS_ENDPOINT=https://$GIMBAL_DOMAIN
VPS_API_KEY=$API_KEY
VPS_ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF

log "Environment variables updated"

################################################################################
# Step 6: Test HTTPS Connectivity
################################################################################
header "Step 6: Testing HTTPS API Connectivity"

log "Testing DNS resolution..."
if host "$GIMBAL_DOMAIN" &>/dev/null; then
    log "✓ DNS resolves correctly"
    host "$GIMBAL_DOMAIN"
else
    warn "✗ DNS resolution failed for $GIMBAL_DOMAIN"
fi

log "Testing HTTPS connection..."
if curl -f -m 10 "https://$GIMBAL_DOMAIN/health" &>/dev/null; then
    log "✓ HTTPS connection successful"
    curl -s "https://$GIMBAL_DOMAIN/health" | jq . 2>/dev/null || cat
else
    warn "✗ HTTPS connection failed. Check certificate and DNS."
fi

log "Testing authenticated API..."
HEALTH_RESPONSE=$(curl -s -H "Authorization: Bearer $API_KEY" "https://$GIMBAL_DOMAIN/health")
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    log "✓ API authentication successful"
    echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    warn "✗ API authentication may have failed"
    echo "$HEALTH_RESPONSE"
fi

################################################################################
# Step 7: Restart Application
################################################################################
header "Step 7: Restarting Application"

log "Application needs to be restarted to load new environment variables."
read -p "Restart now? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Restarting application..."
    if systemctl restart aformulationoftruth &>/dev/null; then
        log "✓ Application restarted"
    else
        warn "Could not restart via systemd. Manual restart may be needed."
    fi
fi

################################################################################
# Complete
################################################################################
header "🎉 Setup Complete!"

echo ""
log "Proust server is now connected to Iceland VPN"
log "VPN Server: $VPN_SERVER_IP"
log "Storage API: https://$GIMBAL_DOMAIN"
echo ""
log "Monitoring commands:"
echo "  wg show                          # WireGuard status"
echo "  ping $VPN_SERVER_IP              # Test VPN"
echo "  curl https://$GIMBAL_DOMAIN/health # Test API"
echo "  journalctl -u wg-quick@wg0 -f    # VPN logs"
echo ""
log "To test encrypted backup:"
echo "  curl -X POST -H 'Authorization: Bearer $API_KEY' \\"
echo "       https://$GIMBAL_DOMAIN/api/stats"
echo ""

exit 0
