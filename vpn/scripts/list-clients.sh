#!/bin/bash
set -euo pipefail

# WireGuard Client Listing Script
# Lists all configured clients with connection status

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
WG_INTERFACE="wg0"
WG_DIR="/etc/wireguard"
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

# Get connected peers
get_connected_peers() {
    wg show "${WG_INTERFACE}" dump 2>/dev/null | tail -n +2 || true
}

# Format bytes to human readable
format_bytes() {
    local bytes=$1
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt 1048576 ]]; then
        echo "$((bytes / 1024))KB"
    elif [[ $bytes -lt 1073741824 ]]; then
        echo "$((bytes / 1048576))MB"
    else
        echo "$((bytes / 1073741824))GB"
    fi
}

# Format timestamp to relative time
format_time() {
    local timestamp=$1
    local now=$(date +%s)
    local diff=$((now - timestamp))

    if [[ $diff -lt 60 ]]; then
        echo "${diff}s ago"
    elif [[ $diff -lt 3600 ]]; then
        echo "$((diff / 60))m ago"
    elif [[ $diff -lt 86400 ]]; then
        echo "$((diff / 3600))h ago"
    else
        echo "$((diff / 86400))d ago"
    fi
}

# List clients in table format
list_clients_table() {
    local connected_peers=$(get_connected_peers)

    echo ""
    echo "======================================"
    log_info "WireGuard Clients"
    echo "======================================"
    echo ""

    # Check if any clients exist
    if [[ ! -d "${WG_CLIENTS_DIR}" ]] || [[ -z "$(ls -A ${WG_CLIENTS_DIR}/*.json 2>/dev/null || true)" ]]; then
        log_warn "No clients configured"
        return
    fi

    # Header
    printf "%-20s %-15s %-10s %-15s %-15s\n" "CLIENT" "VPN IP" "STATUS" "RX/TX" "LAST SEEN"
    printf "%s\n" "------------------------------------------------------------------------------------"

    # Iterate through client metadata files
    for metadata_file in "${WG_CLIENTS_DIR}"/*.json; do
        if [[ ! -f "${metadata_file}" ]]; then
            continue
        fi

        # Parse metadata
        local name=$(jq -r '.name' "${metadata_file}" 2>/dev/null || echo "unknown")
        local ip=$(jq -r '.ip' "${metadata_file}" 2>/dev/null || echo "unknown")
        local public_key=$(jq -r '.public_key' "${metadata_file}" 2>/dev/null || echo "")

        # Check connection status
        local status="${RED}Offline${NC}"
        local rx_bytes="0"
        local tx_bytes="0"
        local last_handshake="Never"

        if [[ -n "${public_key}" ]]; then
            local peer_info=$(echo "${connected_peers}" | grep "${public_key}" || true)

            if [[ -n "${peer_info}" ]]; then
                status="${GREEN}Online${NC}"

                # Extract peer information
                rx_bytes=$(echo "${peer_info}" | awk '{print $6}')
                tx_bytes=$(echo "${peer_info}" | awk '{print $7}')
                local handshake_epoch=$(echo "${peer_info}" | awk '{print $5}')

                if [[ "${handshake_epoch}" != "0" ]]; then
                    last_handshake=$(format_time "${handshake_epoch}")
                fi
            fi
        fi

        # Format traffic
        local traffic="${rx_bytes}/${tx_bytes}"
        if [[ "${rx_bytes}" != "0" ]] || [[ "${tx_bytes}" != "0" ]]; then
            traffic="$(format_bytes ${rx_bytes})/$(format_bytes ${tx_bytes})"
        else
            traffic="-"
        fi

        # Print row
        printf "%-20s %-15s %-20b %-15s %-15s\n" \
            "${name}" "${ip}" "${status}" "${traffic}" "${last_handshake}"
    done

    echo ""
}

# List clients in detailed format
list_clients_detailed() {
    local connected_peers=$(get_connected_peers)

    echo ""
    echo "======================================"
    log_info "WireGuard Clients (Detailed)"
    echo "======================================"
    echo ""

    # Check if any clients exist
    if [[ ! -d "${WG_CLIENTS_DIR}" ]] || [[ -z "$(ls -A ${WG_CLIENTS_DIR}/*.json 2>/dev/null || true)" ]]; then
        log_warn "No clients configured"
        return
    fi

    # Iterate through client metadata files
    for metadata_file in "${WG_CLIENTS_DIR}"/*.json; do
        if [[ ! -f "${metadata_file}" ]]; then
            continue
        fi

        echo "--------------------------------------"

        # Parse metadata
        local name=$(jq -r '.name' "${metadata_file}" 2>/dev/null || echo "unknown")
        local ip=$(jq -r '.ip' "${metadata_file}" 2>/dev/null || echo "unknown")
        local created=$(jq -r '.created' "${metadata_file}" 2>/dev/null || echo "unknown")
        local public_key=$(jq -r '.public_key' "${metadata_file}" 2>/dev/null || echo "")

        echo "Client: ${BLUE}${name}${NC}"
        echo "VPN IP: ${ip}"
        echo "Created: ${created}"
        echo "Public Key: ${public_key:0:20}..."

        # Check connection status
        if [[ -n "${public_key}" ]]; then
            local peer_info=$(echo "${connected_peers}" | grep "${public_key}" || true)

            if [[ -n "${peer_info}" ]]; then
                echo -e "Status: ${GREEN}Online${NC}"

                local rx_bytes=$(echo "${peer_info}" | awk '{print $6}')
                local tx_bytes=$(echo "${peer_info}" | awk '{print $7}')
                local handshake_epoch=$(echo "${peer_info}" | awk '{print $5}')

                echo "Received: $(format_bytes ${rx_bytes})"
                echo "Transmitted: $(format_bytes ${tx_bytes})"

                if [[ "${handshake_epoch}" != "0" ]]; then
                    echo "Last Handshake: $(format_time ${handshake_epoch})"
                fi
            else
                echo -e "Status: ${RED}Offline${NC}"
            fi
        fi

        echo ""
    done
}

# Show statistics
show_statistics() {
    local total_clients=0
    local online_clients=0
    local connected_peers=$(get_connected_peers)

    if [[ -d "${WG_CLIENTS_DIR}" ]]; then
        total_clients=$(ls -1 "${WG_CLIENTS_DIR}"/*.json 2>/dev/null | wc -l || echo 0)
    fi

    # Count online clients
    for metadata_file in "${WG_CLIENTS_DIR}"/*.json 2>/dev/null; do
        if [[ ! -f "${metadata_file}" ]]; then
            continue
        fi

        local public_key=$(jq -r '.public_key' "${metadata_file}" 2>/dev/null || echo "")
        if [[ -n "${public_key}" ]] && echo "${connected_peers}" | grep -q "${public_key}"; then
            ((online_clients++))
        fi
    done

    echo ""
    echo "Statistics:"
    echo "  Total Clients: ${total_clients}"
    echo "  Online: ${GREEN}${online_clients}${NC}"
    echo "  Offline: ${RED}$((total_clients - online_clients))${NC}"
    echo ""
}

# Display help
show_help() {
    echo "WireGuard Client Listing Tool"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --detailed    Show detailed client information"
    echo "  -s, --stats       Show statistics only"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                List all clients (table format)"
    echo "  $0 -d             List all clients (detailed format)"
    echo "  $0 -s             Show statistics only"
    echo ""
}

# Main execution
main() {
    local mode="table"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -d|--detailed)
                mode="detailed"
                shift
                ;;
            -s|--stats)
                mode="stats"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Check if WireGuard is running
    if ! ip link show "${WG_INTERFACE}" &> /dev/null; then
        log_error "WireGuard interface ${WG_INTERFACE} is not running"
        exit 1
    fi

    # Execute based on mode
    case "${mode}" in
        table)
            list_clients_table
            show_statistics
            ;;
        detailed)
            list_clients_detailed
            show_statistics
            ;;
        stats)
            show_statistics
            ;;
    esac
}

# Run main function
main "$@"
