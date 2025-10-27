#!/bin/bash
set -euo pipefail

# WireGuard Client Removal Script
# Safely removes a client with proper cleanup

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
WG_INTERFACE="wg0"
WG_DIR="/etc/wireguard"
WG_CONFIG="${WG_DIR}/${WG_INTERFACE}.conf"
WG_KEYS_DIR="${WG_DIR}/keys"
WG_CLIENTS_DIR="${WG_DIR}/clients"

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

    if [[ -z "${name}" ]]; then
        log_error "Client name is required"
        echo "Usage: $0 <client_name>"
        exit 1
    fi

    if [[ ! -f "${WG_CLIENTS_DIR}/${name}.conf" ]]; then
        log_error "Client '${name}' does not exist"
        exit 1
    fi
}

# Get client public key
get_client_public_key() {
    local client_name="$1"
    local public_key_file="${WG_KEYS_DIR}/clients/${client_name}/public.key"

    if [[ -f "${public_key_file}" ]]; then
        cat "${public_key_file}"
    else
        log_error "Client public key not found"
        exit 1
    fi
}

# Remove peer from server configuration
remove_peer_from_server() {
    local client_name="$1"
    local public_key=$(get_client_public_key "${client_name}")

    log_info "Removing peer from server configuration..."

    # Create temporary file
    local temp_config=$(mktemp)

    # Remove peer block from config
    awk -v pubkey="${public_key}" '
        /^# Client:/ { in_peer=1; buffer=$0"\n"; next }
        in_peer && /^PublicKey/ {
            if ($3 == pubkey) { skip=1 }
            buffer=buffer$0"\n"
            next
        }
        in_peer && /^$/ {
            if (!skip) print buffer
            in_peer=0; skip=0; buffer=""
            next
        }
        in_peer { buffer=buffer$0"\n"; next }
        !in_peer { print }
    ' "${WG_CONFIG}" > "${temp_config}"

    # Replace original config
    mv "${temp_config}" "${WG_CONFIG}"
    chmod 600 "${WG_CONFIG}"

    log_info "Peer removed from server configuration"
}

# Archive client files
archive_client_files() {
    local client_name="$1"
    local archive_dir="${WG_DIR}/archive"
    local timestamp=$(date +%Y%m%d_%H%M%S)

    mkdir -p "${archive_dir}"
    chmod 700 "${archive_dir}"

    # Create archive
    local archive_file="${archive_dir}/${client_name}_${timestamp}.tar.gz"

    tar -czf "${archive_file}" \
        -C "${WG_CLIENTS_DIR}" "${client_name}.conf" "${client_name}.json" \
        -C "${WG_KEYS_DIR}/clients" "${client_name}" \
        2>/dev/null || true

    chmod 600 "${archive_file}"

    log_info "Client files archived to: ${archive_file}"
}

# Remove client files
remove_client_files() {
    local client_name="$1"

    log_info "Removing client files..."

    # Remove config files
    rm -f "${WG_CLIENTS_DIR}/${client_name}.conf"
    rm -f "${WG_CLIENTS_DIR}/${client_name}.json"

    # Remove keys
    rm -rf "${WG_KEYS_DIR}/clients/${client_name}"

    log_info "Client files removed"
}

# Reload WireGuard
reload_wireguard() {
    log_info "Reloading WireGuard configuration..."

    wg syncconf "${WG_INTERFACE}" <(wg-quick strip "${WG_INTERFACE}")

    log_info "WireGuard reloaded successfully"
}

# Display summary
display_summary() {
    local client_name="$1"

    echo ""
    echo "======================================"
    log_info "Client '${client_name}' removed successfully!"
    echo "======================================"
    echo ""
    echo "Actions performed:"
    echo "  1. Peer removed from server configuration"
    echo "  2. Client files archived"
    echo "  3. Client files deleted"
    echo "  4. WireGuard reloaded"
    echo ""
    echo "Verify removal:"
    echo "  wg show ${WG_INTERFACE}"
    echo ""
}

# Confirm removal
confirm_removal() {
    local client_name="$1"

    echo ""
    log_warn "You are about to remove client: ${client_name}"
    echo ""
    read -p "Are you sure? (yes/no): " -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Removal cancelled"
        exit 0
    fi
}

# Main execution
main() {
    local client_name="${1:-}"

    log_info "WireGuard Client Removal"
    echo ""

    check_root
    validate_client_name "${client_name}"
    confirm_removal "${client_name}"

    archive_client_files "${client_name}"
    remove_peer_from_server "${client_name}"
    remove_client_files "${client_name}"
    reload_wireguard

    display_summary "${client_name}"
}

# Run main function
main "$@"
