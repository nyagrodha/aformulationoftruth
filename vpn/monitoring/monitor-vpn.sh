#!/bin/bash
set -euo pipefail

# WireGuard VPN Monitoring Script
# Comprehensive monitoring with alerts and logging

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
WG_INTERFACE="wg0"
LOG_DIR="/var/log/wireguard"
MONITOR_LOG="${LOG_DIR}/monitor.log"
ALERT_LOG="${LOG_DIR}/alerts.log"
STATS_FILE="${LOG_DIR}/stats.json"

# Alert thresholds
MAX_FAILED_HANDSHAKES=5
MAX_RX_RATE_MBPS=1000
MAX_TX_RATE_MBPS=1000
STALE_CONNECTION_THRESHOLD=300  # 5 minutes

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" | tee -a "${MONITOR_LOG}"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "${MONITOR_LOG}" "${ALERT_LOG}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "${MONITOR_LOG}" "${ALERT_LOG}"
}

log_metric() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1" >> "${MONITOR_LOG}"
}

# Check if interface is up
check_interface() {
    if ! ip link show "${WG_INTERFACE}" &> /dev/null; then
        log_error "Interface ${WG_INTERFACE} is DOWN"
        return 1
    fi
    log_info "Interface ${WG_INTERFACE} is UP"
    return 0
}

# Check WireGuard service
check_service() {
    if ! systemctl is-active --quiet "wg-quick@${WG_INTERFACE}"; then
        log_error "WireGuard service is not active"
        return 1
    fi
    log_info "WireGuard service is active"
    return 0
}

# Get peer count
get_peer_count() {
    wg show "${WG_INTERFACE}" peers 2>/dev/null | wc -l || echo 0
}

# Get active peers (with recent handshake)
get_active_peer_count() {
    local now=$(date +%s)
    local active=0

    while read -r line; do
        if [[ "$line" =~ latest\ handshake:\ ([0-9]+) ]]; then
            local handshake="${BASH_REMATCH[1]}"
            local diff=$((now - handshake))
            if [[ $diff -lt $STALE_CONNECTION_THRESHOLD ]]; then
                ((active++))
            fi
        fi
    done < <(wg show "${WG_INTERFACE}" 2>/dev/null)

    echo $active
}

# Get transfer statistics
get_transfer_stats() {
    local total_rx=0
    local total_tx=0

    while IFS=$'\t' read -r pub_key psk endpoint allowed_ips latest_handshake rx tx keepalive; do
        total_rx=$((total_rx + rx))
        total_tx=$((total_tx + tx))
    done < <(wg show "${WG_INTERFACE}" dump 2>/dev/null | tail -n +2)

    echo "${total_rx} ${total_tx}"
}

# Format bytes to human readable
format_bytes() {
    local bytes=$1
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt 1048576 ]]; then
        printf "%.2fKB" "$(echo "$bytes / 1024" | bc -l)"
    elif [[ $bytes -lt 1073741824 ]]; then
        printf "%.2fMB" "$(echo "$bytes / 1048576" | bc -l)"
    else
        printf "%.2fGB" "$(echo "$bytes / 1073741824" | bc -l)"
    fi
}

# Check for stale connections
check_stale_connections() {
    local now=$(date +%s)
    local stale_count=0

    log_info "Checking for stale connections..."

    while IFS=$'\t' read -r pub_key psk endpoint allowed_ips latest_handshake rx tx keepalive; do
        if [[ "$latest_handshake" == "0" ]]; then
            continue
        fi

        local diff=$((now - latest_handshake))
        if [[ $diff -gt $STALE_CONNECTION_THRESHOLD ]]; then
            ((stale_count++))
            log_warn "Stale connection detected: ${pub_key:0:20}... (${diff}s since last handshake)"
        fi
    done < <(wg show "${WG_INTERFACE}" dump 2>/dev/null | tail -n +2)

    if [[ $stale_count -gt 0 ]]; then
        log_warn "Found ${stale_count} stale connection(s)"
    else
        log_info "No stale connections found"
    fi

    return $stale_count
}

# Check bandwidth usage
check_bandwidth() {
    log_info "Checking bandwidth usage..."

    # Get current stats
    local stats=($(get_transfer_stats))
    local current_rx=${stats[0]}
    local current_tx=${stats[1]}

    # Check if previous stats exist
    if [[ -f "${STATS_FILE}" ]]; then
        local prev_rx=$(jq -r '.rx' "${STATS_FILE}" 2>/dev/null || echo 0)
        local prev_tx=$(jq -r '.tx' "${STATS_FILE}" 2>/dev/null || echo 0)
        local prev_time=$(jq -r '.timestamp' "${STATS_FILE}" 2>/dev/null || echo 0)
        local current_time=$(date +%s)

        local time_diff=$((current_time - prev_time))

        if [[ $time_diff -gt 0 ]]; then
            local rx_rate=$(( (current_rx - prev_rx) / time_diff ))
            local tx_rate=$(( (current_tx - prev_tx) / time_diff ))

            log_metric "Bandwidth: RX=$(format_bytes $rx_rate)/s TX=$(format_bytes $tx_rate)/s"

            # Check thresholds
            local rx_mbps=$((rx_rate * 8 / 1000000))
            local tx_mbps=$((tx_rate * 8 / 1000000))

            if [[ $rx_mbps -gt $MAX_RX_RATE_MBPS ]]; then
                log_warn "High RX rate detected: ${rx_mbps} Mbps"
            fi

            if [[ $tx_mbps -gt $MAX_TX_RATE_MBPS ]]; then
                log_warn "High TX rate detected: ${tx_mbps} Mbps"
            fi
        fi
    fi

    # Save current stats
    cat > "${STATS_FILE}" << EOF
{
  "timestamp": $(date +%s),
  "rx": ${current_rx},
  "tx": ${current_tx}
}
EOF
}

# Check system resources
check_system_resources() {
    log_info "Checking system resources..."

    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    log_metric "CPU Usage: ${cpu_usage}%"

    # Memory usage
    local mem_usage=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
    log_metric "Memory Usage: ${mem_usage}%"

    # Disk usage
    local disk_usage=$(df -h /etc/wireguard | tail -1 | awk '{print $5}' | sed 's/%//')
    log_metric "Disk Usage (/etc/wireguard): ${disk_usage}%"

    # Check if resources are critical
    if (( $(echo "$cpu_usage > 90" | bc -l) )); then
        log_warn "High CPU usage: ${cpu_usage}%"
    fi

    if (( $(echo "$mem_usage > 90" | bc -l) )); then
        log_warn "High memory usage: ${mem_usage}%"
    fi

    if [[ $disk_usage -gt 90 ]]; then
        log_warn "High disk usage: ${disk_usage}%"
    fi
}

# Check firewall rules
check_firewall() {
    log_info "Checking firewall rules..."

    # Check if IP forwarding is enabled
    if [[ $(cat /proc/sys/net/ipv4/ip_forward) != "1" ]]; then
        log_error "IP forwarding is disabled"
        return 1
    fi

    # Check iptables rules
    if ! iptables -t nat -L POSTROUTING -n | grep -q MASQUERADE; then
        log_warn "MASQUERADE rule not found in iptables"
    fi

    log_info "Firewall rules OK"
    return 0
}

# Generate status report
generate_report() {
    local total_peers=$(get_peer_count)
    local active_peers=$(get_active_peer_count)
    local stats=($(get_transfer_stats))
    local total_rx=${stats[0]}
    local total_tx=${stats[1]}

    echo ""
    echo "======================================"
    echo "  WireGuard VPN Monitoring Report"
    echo "======================================"
    echo "Timestamp: $(date)"
    echo ""
    echo "Status:"
    echo "  Interface: ${WG_INTERFACE}"
    echo "  Total Peers: ${total_peers}"
    echo "  Active Peers: ${active_peers}"
    echo "  Inactive Peers: $((total_peers - active_peers))"
    echo ""
    echo "Traffic:"
    echo "  Total RX: $(format_bytes $total_rx)"
    echo "  Total TX: $(format_bytes $total_tx)"
    echo ""
    echo "System:"
    echo "  CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')"
    echo "  Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
    echo ""
    echo "======================================"
    echo ""
}

# Send alert (can be extended to email, Slack, etc.)
send_alert() {
    local message="$1"
    local severity="${2:-INFO}"

    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [${severity}] ${message}" >> "${ALERT_LOG}"

    # Add custom alert mechanisms here
    # Example: send email, post to Slack, etc.
}

# Health check
health_check() {
    local status=0

    if ! check_interface; then
        send_alert "WireGuard interface is down" "CRITICAL"
        status=1
    fi

    if ! check_service; then
        send_alert "WireGuard service is not active" "CRITICAL"
        status=1
    fi

    if ! check_firewall; then
        send_alert "Firewall configuration issue detected" "WARNING"
    fi

    return $status
}

# Main monitoring loop
monitor_continuous() {
    local interval="${1:-60}"

    log_info "Starting continuous monitoring (interval: ${interval}s)"

    while true; do
        echo ""
        log_info "=== Monitoring Cycle ==="

        health_check
        check_stale_connections
        check_bandwidth
        check_system_resources
        generate_report

        sleep "${interval}"
    done
}

# Display help
show_help() {
    echo "WireGuard VPN Monitoring Tool"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  status              Show current status (default)"
    echo "  continuous [N]      Run continuous monitoring (every N seconds, default 60)"
    echo "  health              Run health check only"
    echo "  report              Generate full report"
    echo "  help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                  Show current status"
    echo "  $0 continuous       Run continuous monitoring (60s interval)"
    echo "  $0 continuous 30    Run continuous monitoring (30s interval)"
    echo "  $0 health           Run health check"
    echo ""
}

# Ensure log directory exists
mkdir -p "${LOG_DIR}"
chmod 750 "${LOG_DIR}"

# Main execution
case "${1:-status}" in
    status)
        health_check
        check_stale_connections
        check_bandwidth
        check_system_resources
        generate_report
        ;;
    continuous)
        monitor_continuous "${2:-60}"
        ;;
    health)
        health_check
        ;;
    report)
        generate_report
        ;;
    help)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
