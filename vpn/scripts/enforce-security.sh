#!/bin/bash
set -euo pipefail

# WireGuard Security Policy Enforcement Script
# Enforces strict security policies and permissions

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
WG_DIR="/etc/wireguard"
WG_INTERFACE="wg0"
WG_CONFIG="${WG_DIR}/${WG_INTERFACE}.conf"
WG_KEYS_DIR="${WG_DIR}/keys"
WG_CLIENTS_DIR="${WG_DIR}/clients"
LOG_DIR="/var/log/wireguard"
AUDIT_LOG="${LOG_DIR}/security-audit.log"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" | tee -a "${AUDIT_LOG}"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "${AUDIT_LOG}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "${AUDIT_LOG}"
}

log_audit() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1" >> "${AUDIT_LOG}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Audit directory permissions
audit_directory_permissions() {
    log_info "Auditing directory permissions..."

    local violations=0

    # Check main WireGuard directory (should be 700)
    local wg_perms=$(stat -c "%a" "${WG_DIR}" 2>/dev/null || echo "000")
    if [[ "${wg_perms}" != "700" ]]; then
        log_warn "Incorrect permissions on ${WG_DIR}: ${wg_perms} (expected: 700)"
        ((violations++))
    fi

    # Check keys directory (should be 700)
    if [[ -d "${WG_KEYS_DIR}" ]]; then
        local keys_perms=$(stat -c "%a" "${WG_KEYS_DIR}" 2>/dev/null || echo "000")
        if [[ "${keys_perms}" != "700" ]]; then
            log_warn "Incorrect permissions on ${WG_KEYS_DIR}: ${keys_perms} (expected: 700)"
            ((violations++))
        fi
    fi

    # Check clients directory (should be 750)
    if [[ -d "${WG_CLIENTS_DIR}" ]]; then
        local clients_perms=$(stat -c "%a" "${WG_CLIENTS_DIR}" 2>/dev/null || echo "000")
        if [[ "${clients_perms}" != "750" ]]; then
            log_warn "Incorrect permissions on ${WG_CLIENTS_DIR}: ${clients_perms} (expected: 750)"
            ((violations++))
        fi
    fi

    if [[ $violations -eq 0 ]]; then
        log_info "Directory permissions are correct"
    else
        log_warn "Found ${violations} directory permission violation(s)"
    fi

    return $violations
}

# Audit file permissions
audit_file_permissions() {
    log_info "Auditing file permissions..."

    local violations=0

    # Check server config (should be 600)
    if [[ -f "${WG_CONFIG}" ]]; then
        local config_perms=$(stat -c "%a" "${WG_CONFIG}")
        if [[ "${config_perms}" != "600" ]]; then
            log_warn "Incorrect permissions on ${WG_CONFIG}: ${config_perms} (expected: 600)"
            ((violations++))
        fi
    fi

    # Check private keys (should be 400)
    if [[ -d "${WG_KEYS_DIR}" ]]; then
        while IFS= read -r -d '' key_file; do
            if [[ "$key_file" =~ private\.key$ ]] || [[ "$key_file" =~ preshared\.key$ ]]; then
                local key_perms=$(stat -c "%a" "$key_file")
                if [[ "${key_perms}" != "400" ]]; then
                    log_warn "Incorrect permissions on ${key_file}: ${key_perms} (expected: 400)"
                    ((violations++))
                fi
            fi
        done < <(find "${WG_KEYS_DIR}" -type f -print0)
    fi

    # Check client configs (should be 600)
    if [[ -d "${WG_CLIENTS_DIR}" ]]; then
        while IFS= read -r -d '' client_conf; do
            if [[ "$client_conf" =~ \.conf$ ]]; then
                local conf_perms=$(stat -c "%a" "$client_conf")
                if [[ "${conf_perms}" != "600" ]]; then
                    log_warn "Incorrect permissions on ${client_conf}: ${conf_perms} (expected: 600)"
                    ((violations++))
                fi
            fi
        done < <(find "${WG_CLIENTS_DIR}" -type f -name "*.conf" -print0)
    fi

    if [[ $violations -eq 0 ]]; then
        log_info "File permissions are correct"
    else
        log_warn "Found ${violations} file permission violation(s)"
    fi

    return $violations
}

# Fix directory permissions
fix_directory_permissions() {
    log_info "Fixing directory permissions..."

    chmod 700 "${WG_DIR}"
    log_info "Set ${WG_DIR} to 700"

    if [[ -d "${WG_KEYS_DIR}" ]]; then
        chmod 700 "${WG_KEYS_DIR}"
        log_info "Set ${WG_KEYS_DIR} to 700"

        # Fix client keys directories
        find "${WG_KEYS_DIR}/clients" -type d -exec chmod 700 {} \; 2>/dev/null || true
    fi

    if [[ -d "${WG_CLIENTS_DIR}" ]]; then
        chmod 750 "${WG_CLIENTS_DIR}"
        log_info "Set ${WG_CLIENTS_DIR} to 750"
    fi

    if [[ -d "${LOG_DIR}" ]]; then
        chmod 750 "${LOG_DIR}"
        log_info "Set ${LOG_DIR} to 750"
    fi

    log_info "Directory permissions fixed"
}

# Fix file permissions
fix_file_permissions() {
    log_info "Fixing file permissions..."

    # Fix server config
    if [[ -f "${WG_CONFIG}" ]]; then
        chmod 600 "${WG_CONFIG}"
        log_info "Set ${WG_CONFIG} to 600"
    fi

    # Fix private and preshared keys
    if [[ -d "${WG_KEYS_DIR}" ]]; then
        find "${WG_KEYS_DIR}" -type f \( -name "*private.key" -o -name "*preshared.key" \) -exec chmod 400 {} \;
        log_info "Set private/preshared keys to 400"

        # Fix public keys
        find "${WG_KEYS_DIR}" -type f -name "*public.key" -exec chmod 444 {} \;
        log_info "Set public keys to 444"
    fi

    # Fix client configs
    if [[ -d "${WG_CLIENTS_DIR}" ]]; then
        find "${WG_CLIENTS_DIR}" -type f -name "*.conf" -exec chmod 600 {} \;
        log_info "Set client configs to 600"

        find "${WG_CLIENTS_DIR}" -type f -name "*.json" -exec chmod 640 {} \;
        log_info "Set client metadata to 640"
    fi

    log_info "File permissions fixed"
}

# Audit ownership
audit_ownership() {
    log_info "Auditing file ownership..."

    local violations=0

    # Check if files are owned by root
    while IFS= read -r -d '' file; do
        local owner=$(stat -c "%U" "$file")
        if [[ "${owner}" != "root" ]]; then
            log_warn "Incorrect owner on ${file}: ${owner} (expected: root)"
            ((violations++))
        fi
    done < <(find "${WG_DIR}" -print0 2>/dev/null)

    if [[ $violations -eq 0 ]]; then
        log_info "File ownership is correct"
    else
        log_warn "Found ${violations} ownership violation(s)"
    fi

    return $violations
}

# Fix ownership
fix_ownership() {
    log_info "Fixing file ownership..."

    chown -R root:root "${WG_DIR}"
    log_info "Set ownership to root:root for ${WG_DIR}"

    if [[ -d "${LOG_DIR}" ]]; then
        chown -R root:wg-admin "${LOG_DIR}" 2>/dev/null || chown -R root:root "${LOG_DIR}"
    fi

    if [[ -d "${WG_CLIENTS_DIR}" ]]; then
        chown -R root:wg-admin "${WG_CLIENTS_DIR}" 2>/dev/null || chown -R root:root "${WG_CLIENTS_DIR}"
    fi

    log_info "File ownership fixed"
}

# Check for weak keys
audit_key_strength() {
    log_info "Auditing key strength..."

    local weak_keys=0

    # WireGuard uses Curve25519 keys which are always 32 bytes (44 chars in base64)
    if [[ -d "${WG_KEYS_DIR}" ]]; then
        while IFS= read -r -d '' key_file; do
            local key_content=$(cat "$key_file" 2>/dev/null || echo "")
            local key_length=${#key_content}

            # WireGuard keys should be 44 characters (base64 encoded 32 bytes)
            if [[ $key_length -ne 44 ]]; then
                log_warn "Suspicious key length in ${key_file}: ${key_length} chars"
                ((weak_keys++))
            fi
        done < <(find "${WG_KEYS_DIR}" -type f -name "*.key" -print0)
    fi

    if [[ $weak_keys -eq 0 ]]; then
        log_info "All keys have correct format"
    else
        log_warn "Found ${weak_keys} key(s) with suspicious format"
    fi

    return $weak_keys
}

# Check systemd service hardening
audit_systemd_hardening() {
    log_info "Auditing systemd service hardening..."

    local service_override="/etc/systemd/system/wg-quick@${WG_INTERFACE}.service.d/security.conf"

    if [[ ! -f "${service_override}" ]]; then
        log_warn "Systemd security hardening not found: ${service_override}"
        return 1
    fi

    # Check for key hardening directives
    local required_directives=(
        "NoNewPrivileges=true"
        "PrivateTmp=true"
        "ProtectSystem=strict"
        "ProtectHome=true"
    )

    local missing=0
    for directive in "${required_directives[@]}"; do
        if ! grep -q "^${directive}" "${service_override}"; then
            log_warn "Missing hardening directive: ${directive}"
            ((missing++))
        fi
    done

    if [[ $missing -eq 0 ]]; then
        log_info "Systemd service hardening is properly configured"
        return 0
    else
        log_warn "Missing ${missing} hardening directive(s)"
        return 1
    fi
}

# Check firewall configuration
audit_firewall() {
    log_info "Auditing firewall configuration..."

    local issues=0

    # Check IP forwarding
    if [[ $(cat /proc/sys/net/ipv4/ip_forward) != "1" ]]; then
        log_error "IP forwarding is disabled"
        ((issues++))
    fi

    # Check for MASQUERADE rule
    if ! iptables -t nat -L POSTROUTING -n | grep -q "MASQUERADE"; then
        log_warn "MASQUERADE rule not found"
        ((issues++))
    fi

    # Check for FORWARD rules
    if ! iptables -L FORWARD -n | grep -q "${WG_INTERFACE}"; then
        log_warn "FORWARD rules for ${WG_INTERFACE} not found"
        ((issues++))
    fi

    # Check if WireGuard port is allowed (if UFW is active)
    if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
        if ! ufw status | grep -q "51820"; then
            log_warn "WireGuard port not explicitly allowed in UFW"
            ((issues++))
        fi
    fi

    if [[ $issues -eq 0 ]]; then
        log_info "Firewall configuration is correct"
    else
        log_warn "Found ${issues} firewall configuration issue(s)"
    fi

    return $issues
}

# Check for configuration vulnerabilities
audit_config_security() {
    log_info "Auditing configuration security..."

    local issues=0

    if [[ ! -f "${WG_CONFIG}" ]]; then
        log_error "Server configuration not found: ${WG_CONFIG}"
        return 1
    fi

    # Check if private key is in the config (it should be)
    if ! grep -q "^PrivateKey" "${WG_CONFIG}"; then
        log_error "Private key not found in server config"
        ((issues++))
    fi

    # Check if listening port is configured
    if ! grep -q "^ListenPort" "${WG_CONFIG}"; then
        log_warn "Listening port not explicitly configured"
        ((issues++))
    fi

    # Check for any world-readable or world-writable files
    local world_readable=$(find "${WG_DIR}" -type f -perm -004 ! -name "*.pub*" 2>/dev/null | wc -l)
    if [[ $world_readable -gt 0 ]]; then
        log_warn "Found ${world_readable} world-readable file(s)"
        ((issues++))
    fi

    local world_writable=$(find "${WG_DIR}" -type f -perm -002 2>/dev/null | wc -l)
    if [[ $world_writable -gt 0 ]]; then
        log_error "Found ${world_writable} world-writable file(s)"
        ((issues++))
    fi

    if [[ $issues -eq 0 ]]; then
        log_info "Configuration security is good"
    else
        log_warn "Found ${issues} configuration security issue(s)"
    fi

    return $issues
}

# Generate security report
generate_security_report() {
    echo ""
    echo "======================================"
    echo "  WireGuard Security Audit Report"
    echo "======================================"
    echo "Timestamp: $(date)"
    echo ""

    local total_issues=0

    echo "Running security checks..."
    echo ""

    audit_directory_permissions || ((total_issues+=$?))
    audit_file_permissions || ((total_issues+=$?))
    audit_ownership || ((total_issues+=$?))
    audit_key_strength || ((total_issues+=$?))
    audit_systemd_hardening || ((total_issues++))
    audit_firewall || ((total_issues+=$?))
    audit_config_security || ((total_issues+=$?))

    echo ""
    echo "======================================"
    if [[ $total_issues -eq 0 ]]; then
        log_info "Security audit passed - no issues found"
    else
        log_warn "Security audit found ${total_issues} issue(s)"
        echo ""
        echo "Run with '--fix' flag to automatically fix issues:"
        echo "  $0 --fix"
    fi
    echo "======================================"
    echo ""

    return $total_issues
}

# Fix all security issues
fix_all_security_issues() {
    log_info "Fixing all security issues..."
    echo ""

    fix_directory_permissions
    fix_file_permissions
    fix_ownership

    echo ""
    log_info "Security issues fixed"
    log_info "Re-running audit to verify..."
    echo ""

    generate_security_report
}

# Display help
show_help() {
    echo "WireGuard Security Policy Enforcement Tool"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --audit              Run security audit (default)"
    echo "  --fix                Fix security issues automatically"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                   Run security audit"
    echo "  $0 --audit           Run security audit"
    echo "  $0 --fix             Fix all security issues"
    echo ""
}

# Ensure log directory exists
mkdir -p "${LOG_DIR}"
chmod 750 "${LOG_DIR}"

# Main execution
check_root

case "${1:---audit}" in
    --audit)
        generate_security_report
        ;;
    --fix)
        fix_all_security_issues
        ;;
    --help)
        show_help
        ;;
    *)
        log_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac
