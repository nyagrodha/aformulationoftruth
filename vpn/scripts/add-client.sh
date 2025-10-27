#!/bin/bash
set -euo pipefail

# WireGuard Client Addition Script with Strict Security
# This script generates client configurations with proper security

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
WG_INTERFACE="wg0"
WG_PORT="${WG_PORT:-51820}"
WG_DIR="/etc/wireguard"
WG_CONFIG="${WG_DIR}/${WG_INTERFACE}.conf"
WG_KEYS_DIR="${WG_DIR}/keys"
WG_CLIENTS_DIR="${WG_DIR}/clients"
WG_SERVER_IP="10.8.0.1"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Validate client name
validate_client_name() {
    local name="$1"

    # Check if name is provided
    if [[ -z "${name}" ]]; then
        log_error "Client name is required"
        echo "Usage: $0 <client_name> [client_ip]"
        exit 1
    fi

    # Check if name contains only alphanumeric characters, dash, and underscore
    if [[ ! "${name}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Client name must contain only alphanumeric characters, dash, and underscore"
        exit 1
    fi

    # Check if client already exists
    if [[ -f "${WG_CLIENTS_DIR}/${name}.conf" ]]; then
        log_error "Client '${name}' already exists"
        exit 1
    fi
}

# Get next available IP
get_next_ip() {
    local used_ips=()
    local next_ip=2

    # Read existing client IPs from server config
    if [[ -f "${WG_CONFIG}" ]]; then
        while IFS= read -r line; do
            if [[ "$line" =~ AllowedIPs[[:space:]]*=[[:space:]]*10\.8\.0\.([0-9]+) ]]; then
                used_ips+=("${BASH_REMATCH[1]}")
            fi
        done < "${WG_CONFIG}"
    fi

    # Find next available IP
    while [[ ${next_ip} -lt 255 ]]; do
        local ip_used=false
        for used_ip in "${used_ips[@]}"; do
            if [[ ${next_ip} -eq ${used_ip} ]]; then
                ip_used=true
                break
            fi
        done

        if [[ ${ip_used} == false ]]; then
            echo "10.8.0.${next_ip}"
            return
        fi

        ((next_ip++))
    done

    log_error "No available IPs in the subnet"
    exit 1
}

# Generate client keys
generate_client_keys() {
    local client_name="$1"
    local client_keys_dir="${WG_KEYS_DIR}/clients/${client_name}"

    mkdir -p "${client_keys_dir}"
    chmod 700 "${client_keys_dir}"

    # Generate keys
    wg genkey | tee "${client_keys_dir}/private.key" | \
        wg pubkey > "${client_keys_dir}/public.key"

    # Generate preshared key for additional security
    wg genpsk > "${client_keys_dir}/preshared.key"

    # Set strict permissions
    chmod 400 "${client_keys_dir}/private.key"
    chmod 400 "${client_keys_dir}/preshared.key"
    chmod 444 "${client_keys_dir}/public.key"

    log_info "Generated keys for client: ${client_name}"
}

# Get server public key
get_server_public_key() {
    cat "${WG_KEYS_DIR}/server_public.key"
}

# Get server public IP/hostname
get_server_endpoint() {
    # Try to get public IP
    local public_ip=""

    # Try multiple services
    public_ip=$(curl -s -4 ifconfig.me 2>/dev/null) || \
    public_ip=$(curl -s -4 icanhazip.com 2>/dev/null) || \
    public_ip=$(curl -s -4 ipinfo.io/ip 2>/dev/null) || \
    public_ip="YOUR_SERVER_IP"

    echo "${public_ip}"
}

# Create client configuration file
create_client_config() {
    local client_name="$1"
    local client_ip="$2"
    local client_keys_dir="${WG_KEYS_DIR}/clients/${client_name}"
    local client_config="${WG_CLIENTS_DIR}/${client_name}.conf"

    local client_private_key=$(cat "${client_keys_dir}/private.key")
    local client_preshared_key=$(cat "${client_keys_dir}/preshared.key")
    local server_public_key=$(get_server_public_key)
    local server_endpoint=$(get_server_endpoint)

    # Create client configuration
    cat > "${client_config}" << EOF
# WireGuard Client Configuration
# Client: ${client_name}
# Generated: $(date)

[Interface]
# Client private key
PrivateKey = ${client_private_key}

# Client IP address in VPN
Address = ${client_ip}/24

# DNS servers (optional - use VPN server or public DNS)
DNS = ${WG_SERVER_IP}, 1.1.1.1, 1.0.0.1

# MTU optimization (optional)
# MTU = 1420

[Peer]
# Server public key
PublicKey = ${server_public_key}

# Preshared key for additional security (post-quantum resistance)
PresharedKey = ${client_preshared_key}

# Server endpoint (IP:Port)
Endpoint = ${server_endpoint}:${WG_PORT}

# Allowed IPs - routes all traffic through VPN (full tunnel)
# For split tunnel (only VPN network), use: 10.8.0.0/24
AllowedIPs = 0.0.0.0/0, ::/0

# Keep connection alive (useful for NAT traversal)
PersistentKeepalive = 25
EOF

    # Set permissions
    chmod 600 "${client_config}"
    chown root:root "${client_config}"

    log_info "Created client config: ${client_config}"
}

# Add client peer to server configuration
add_peer_to_server() {
    local client_name="$1"
    local client_ip="$2"
    local client_keys_dir="${WG_KEYS_DIR}/clients/${client_name}"

    local client_public_key=$(cat "${client_keys_dir}/public.key")
    local client_preshared_key=$(cat "${client_keys_dir}/preshared.key")

    # Add peer configuration to server config
    cat >> "${WG_CONFIG}" << EOF

# Client: ${client_name}
# Added: $(date)
[Peer]
PublicKey = ${client_public_key}
PresharedKey = ${client_preshared_key}
AllowedIPs = ${client_ip}/32
EOF

    log_info "Added peer to server configuration"
}

# Reload WireGuard configuration
reload_wireguard() {
    log_info "Reloading WireGuard configuration..."

    # Use wg syncconf for seamless reload without dropping connections
    wg syncconf "${WG_INTERFACE}" <(wg-quick strip "${WG_INTERFACE}")

    log_info "WireGuard reloaded successfully"
}

# Create QR code for mobile devices
create_qr_code() {
    local client_name="$1"
    local client_config="${WG_CLIENTS_DIR}/${client_name}.conf"

    # Check if qrencode is available
    if command -v qrencode &> /dev/null; then
        echo ""
        log_info "QR Code for mobile devices:"
        echo ""
        qrencode -t ansiutf8 < "${client_config}"
        echo ""
        log_info "Scan this QR code with WireGuard mobile app"
    else
        log_warn "qrencode not installed. Install it to generate QR codes:"
        log_warn "  Debian/Ubuntu: apt-get install qrencode"
        log_warn "  RHEL/CentOS: yum install qrencode"
    fi
}

# Create client metadata
create_client_metadata() {
    local client_name="$1"
    local client_ip="$2"
    local metadata_file="${WG_CLIENTS_DIR}/${client_name}.json"

    cat > "${metadata_file}" << EOF
{
  "name": "${client_name}",
  "ip": "${client_ip}",
  "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "public_key": "$(cat ${WG_KEYS_DIR}/clients/${client_name}/public.key)",
  "status": "active"
}
EOF

    chmod 640 "${metadata_file}"
    log_info "Created client metadata: ${metadata_file}"
}

# Display summary
display_summary() {
    local client_name="$1"
    local client_ip="$2"
    local client_config="${WG_CLIENTS_DIR}/${client_name}.conf"

    echo ""
    echo "======================================"
    log_info "Client '${client_name}' added successfully!"
    echo "======================================"
    echo ""
    echo "Client Details:"
    echo "  Name: ${client_name}"
    echo "  VPN IP: ${client_ip}"
    echo "  Config: ${client_config}"
    echo ""
    echo "Next Steps:"
    echo "  1. Download config: ${client_config}"
    echo "  2. Transfer to client device securely (SCP, SFTP, etc.)"
    echo "  3. Import into WireGuard client application"
    echo ""
    echo "Quick Commands:"
    echo "  View config: cat ${client_config}"
    echo "  Copy config: scp ${client_config} user@client:/etc/wireguard/"
    echo "  Show QR: qrencode -t ansiutf8 < ${client_config}"
    echo ""
    echo "Verify Connection:"
    echo "  Server: wg show ${WG_INTERFACE}"
    echo "  Client: wg show"
    echo ""
}

# Main execution
main() {
    local client_name="${1:-}"
    local client_ip="${2:-}"

    log_info "Adding new WireGuard client..."
    echo ""

    check_root
    validate_client_name "${client_name}"

    # Get IP if not provided
    if [[ -z "${client_ip}" ]]; then
        client_ip=$(get_next_ip)
        log_info "Assigned IP: ${client_ip}"
    else
        log_info "Using provided IP: ${client_ip}"
    fi

    generate_client_keys "${client_name}"
    create_client_config "${client_name}" "${client_ip}"
    add_peer_to_server "${client_name}" "${client_ip}"
    reload_wireguard
    create_client_metadata "${client_name}" "${client_ip}"
    create_qr_code "${client_name}"
    display_summary "${client_name}" "${client_ip}"
}

# Run main function
main "$@"
