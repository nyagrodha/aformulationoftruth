#!/bin/bash
set -euo pipefail

# WireGuard VPN Server Setup Script with Strict Security
# This script sets up a secure WireGuard VPN server with proper permissions and hardening

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
WG_INTERFACE="wg0"
WG_PORT="${WG_PORT:-51820}"
WG_NET="10.8.0.0/24"
WG_SERVER_IP="10.8.0.1"
WG_DIR="/etc/wireguard"
WG_CONFIG="${WG_DIR}/${WG_INTERFACE}.conf"
WG_KEYS_DIR="${WG_DIR}/keys"
WG_CLIENTS_DIR="${WG_DIR}/clients"
WG_LOG_DIR="/var/log/wireguard"
WG_USER="wg-admin"
WG_GROUP="wg-admin"

# Function to print colored output
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Function to check system requirements
check_requirements() {
    log_info "Checking system requirements..."

    # Check if WireGuard is available
    if ! command -v wg &> /dev/null; then
        log_error "WireGuard is not installed"
        log_info "Installing WireGuard..."

        # Detect OS and install accordingly
        if [[ -f /etc/debian_version ]]; then
            apt-get update
            apt-get install -y wireguard wireguard-tools iptables
        elif [[ -f /etc/redhat-release ]]; then
            yum install -y epel-release
            yum install -y wireguard-tools iptables
        else
            log_error "Unsupported operating system"
            exit 1
        fi
    fi

    log_info "WireGuard is installed"
}

# Function to create dedicated user for WireGuard management
create_wg_user() {
    log_info "Creating dedicated WireGuard management user..."

    if ! id -u "${WG_USER}" &> /dev/null; then
        groupadd -r "${WG_GROUP}" 2>/dev/null || true
        useradd -r -g "${WG_GROUP}" -s /usr/sbin/nologin -d /nonexistent "${WG_USER}"
        log_info "Created user: ${WG_USER}"
    else
        log_warn "User ${WG_USER} already exists"
    fi
}

# Function to create directory structure with strict permissions
create_directories() {
    log_info "Creating directory structure with strict permissions..."

    # Main WireGuard directory
    mkdir -p "${WG_DIR}"
    chmod 700 "${WG_DIR}"

    # Keys directory - extra secure
    mkdir -p "${WG_KEYS_DIR}"
    chmod 700 "${WG_KEYS_DIR}"

    # Clients directory
    mkdir -p "${WG_CLIENTS_DIR}"
    chmod 750 "${WG_CLIENTS_DIR}"

    # Log directory
    mkdir -p "${WG_LOG_DIR}"
    chmod 750 "${WG_LOG_DIR}"

    # Set ownership
    chown -R root:root "${WG_DIR}"
    chown -R root:"${WG_GROUP}" "${WG_LOG_DIR}"
    chown -R root:"${WG_GROUP}" "${WG_CLIENTS_DIR}"

    log_info "Directory structure created with permissions:"
    log_info "  ${WG_DIR} -> 700 (root only)"
    log_info "  ${WG_KEYS_DIR} -> 700 (root only)"
    log_info "  ${WG_CLIENTS_DIR} -> 750 (root:${WG_GROUP})"
    log_info "  ${WG_LOG_DIR} -> 750 (root:${WG_GROUP})"
}

# Function to generate server keys
generate_server_keys() {
    log_info "Generating server keys..."

    if [[ -f "${WG_KEYS_DIR}/server_private.key" ]]; then
        log_warn "Server keys already exist. Skipping generation."
        log_warn "To regenerate, remove ${WG_KEYS_DIR}/server_private.key"
        return
    fi

    # Generate private key
    wg genkey | tee "${WG_KEYS_DIR}/server_private.key" | \
        wg pubkey > "${WG_KEYS_DIR}/server_public.key"

    # Set strict permissions on keys
    chmod 400 "${WG_KEYS_DIR}/server_private.key"
    chmod 444 "${WG_KEYS_DIR}/server_public.key"

    log_info "Server keys generated successfully"
    log_info "Public key: $(cat ${WG_KEYS_DIR}/server_public.key)"
}

# Function to detect public network interface
detect_public_interface() {
    # Get the interface with default route
    ip route | grep default | awk '{print $5}' | head -n1
}

# Function to create server configuration
create_server_config() {
    log_info "Creating server configuration..."

    local private_key=$(cat "${WG_KEYS_DIR}/server_private.key")
    local public_interface=$(detect_public_interface)

    if [[ -z "${public_interface}" ]]; then
        log_error "Could not detect public network interface"
        exit 1
    fi

    log_info "Detected public interface: ${public_interface}"

    # Create base configuration
    cat > "${WG_CONFIG}" << EOF
# WireGuard Server Configuration
# Generated on: $(date)
# Interface: ${WG_INTERFACE}

[Interface]
# Server IP address in VPN network
Address = ${WG_SERVER_IP}/24

# Server private key
PrivateKey = ${private_key}

# Listening port
ListenPort = ${WG_PORT}

# Firewall rules - executed when interface comes up
PostUp = iptables -A FORWARD -i %i -j ACCEPT
PostUp = iptables -A FORWARD -o %i -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o ${public_interface} -j MASQUERADE

# Firewall rules - executed when interface goes down
PostDown = iptables -D FORWARD -i %i -j ACCEPT
PostDown = iptables -D FORWARD -o %i -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o ${public_interface} -j MASQUERADE

# Client configurations will be added below
# Each client peer should be added using the add-client script

EOF

    # Set strict permissions on config
    chmod 600 "${WG_CONFIG}"
    chown root:root "${WG_CONFIG}"

    log_info "Server configuration created at ${WG_CONFIG}"
}

# Function to enable IP forwarding
enable_ip_forwarding() {
    log_info "Enabling IP forwarding..."

    # Enable immediately
    echo 1 > /proc/sys/net/ipv4/ip_forward

    # Make persistent across reboots
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    fi

    sysctl -p > /dev/null 2>&1 || true

    log_info "IP forwarding enabled"
}

# Function to configure firewall
configure_firewall() {
    log_info "Configuring firewall rules..."

    # Check if UFW is installed and active
    if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
        log_info "Configuring UFW..."
        ufw allow "${WG_PORT}/udp" comment "WireGuard VPN"
        ufw route allow in on "${WG_INTERFACE}"
        log_info "UFW rules added"
    fi

    # Check if firewalld is installed and active
    if command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld; then
        log_info "Configuring firewalld..."
        firewall-cmd --permanent --add-port="${WG_PORT}/udp"
        firewall-cmd --permanent --add-masquerade
        firewall-cmd --reload
        log_info "Firewalld rules added"
    fi

    log_info "Firewall configured"
}

# Function to create systemd service hardening
create_systemd_override() {
    log_info "Creating systemd service hardening..."

    local override_dir="/etc/systemd/system/wg-quick@${WG_INTERFACE}.service.d"
    mkdir -p "${override_dir}"

    cat > "${override_dir}/security.conf" << 'EOF'
[Service]
# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/etc/wireguard
ProtectKernelTunables=true
ProtectKernelModules=false
ProtectControlGroups=true
RestrictRealtime=true
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
SystemCallArchitectures=native

# Resource limits
LimitNOFILE=65536
LimitNPROC=512

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=wireguard-${WG_INTERFACE}
EOF

    chmod 644 "${override_dir}/security.conf"
    systemctl daemon-reload

    log_info "Systemd hardening applied"
}

# Function to enable and start WireGuard
enable_wireguard() {
    log_info "Enabling and starting WireGuard..."

    # Enable service to start on boot
    systemctl enable "wg-quick@${WG_INTERFACE}"

    # Start the service
    systemctl start "wg-quick@${WG_INTERFACE}"

    # Check status
    if systemctl is-active --quiet "wg-quick@${WG_INTERFACE}"; then
        log_info "WireGuard is running successfully"
    else
        log_error "Failed to start WireGuard"
        systemctl status "wg-quick@${WG_INTERFACE}"
        exit 1
    fi
}

# Function to create monitoring script
create_monitoring_script() {
    log_info "Creating monitoring script..."

    cat > "${WG_DIR}/monitor.sh" << 'EOF'
#!/bin/bash
# WireGuard Monitoring Script

WG_INTERFACE="wg0"
LOG_FILE="/var/log/wireguard/monitor.log"

echo "=== WireGuard Status Report ===" | tee -a "${LOG_FILE}"
echo "Timestamp: $(date)" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"

# Check if interface is up
if ip link show "${WG_INTERFACE}" &> /dev/null; then
    echo "Interface ${WG_INTERFACE}: UP" | tee -a "${LOG_FILE}"
else
    echo "Interface ${WG_INTERFACE}: DOWN" | tee -a "${LOG_FILE}"
    exit 1
fi

# Show interface details
echo "" | tee -a "${LOG_FILE}"
echo "--- Interface Details ---" | tee -a "${LOG_FILE}"
wg show "${WG_INTERFACE}" | tee -a "${LOG_FILE}"

# Show connected peers
echo "" | tee -a "${LOG_FILE}"
echo "--- Connected Peers ---" | tee -a "${LOG_FILE}"
wg show "${WG_INTERFACE}" peers | wg show "${WG_INTERFACE}" | grep -c "peer:" | tee -a "${LOG_FILE}"

# Show traffic statistics
echo "" | tee -a "${LOG_FILE}"
echo "--- Traffic Statistics ---" | tee -a "${LOG_FILE}"
wg show "${WG_INTERFACE}" transfer | tee -a "${LOG_FILE}"

echo "" | tee -a "${LOG_FILE}"
echo "=============================" | tee -a "${LOG_FILE}"
EOF

    chmod 750 "${WG_DIR}/monitor.sh"
    chown root:"${WG_GROUP}" "${WG_DIR}/monitor.sh"

    log_info "Monitoring script created at ${WG_DIR}/monitor.sh"
}

# Function to display summary
display_summary() {
    echo ""
    echo "======================================"
    log_info "WireGuard VPN Server Setup Complete!"
    echo "======================================"
    echo ""
    echo "Configuration Details:"
    echo "  Interface: ${WG_INTERFACE}"
    echo "  Port: ${WG_PORT}"
    echo "  Network: ${WG_NET}"
    echo "  Server IP: ${WG_SERVER_IP}"
    echo "  Config: ${WG_CONFIG}"
    echo ""
    echo "Server Public Key:"
    echo "  $(cat ${WG_KEYS_DIR}/server_public.key)"
    echo ""
    echo "Next Steps:"
    echo "  1. Add clients using: vpn/scripts/add-client.sh <client_name>"
    echo "  2. Monitor status: wg show ${WG_INTERFACE}"
    echo "  3. View logs: journalctl -u wg-quick@${WG_INTERFACE}"
    echo "  4. Run monitoring: ${WG_DIR}/monitor.sh"
    echo ""
    echo "Security Notes:"
    echo "  - All keys stored in ${WG_KEYS_DIR} with 400 permissions"
    echo "  - Config files have 600 permissions (root only)"
    echo "  - Systemd service has security hardening enabled"
    echo "  - IP forwarding is enabled for VPN routing"
    echo ""
}

# Main execution
main() {
    log_info "Starting WireGuard VPN Server Setup..."
    echo ""

    check_root
    check_requirements
    create_wg_user
    create_directories
    generate_server_keys
    create_server_config
    enable_ip_forwarding
    configure_firewall
    create_systemd_override
    create_monitoring_script
    enable_wireguard

    display_summary
}

# Run main function
main "$@"
