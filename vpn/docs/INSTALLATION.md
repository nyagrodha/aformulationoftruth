# WireGuard VPN Installation Guide

Complete step-by-step installation guide for setting up a secure WireGuard VPN server.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Installation](#quick-installation)
- [Detailed Installation](#detailed-installation)
- [Post-Installation](#post-installation)
- [Client Setup](#client-setup)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Operating System**: Linux (tested on)
  - Ubuntu 20.04, 22.04, 24.04
  - Debian 10, 11, 12
  - RHEL/CentOS 8, 9
  - Rocky Linux 8, 9
- **Kernel**: Linux 5.6+ (WireGuard in mainline)
- **RAM**: Minimum 512MB, recommended 1GB+
- **Disk**: 100MB free space
- **Network**: Static public IP address or DDNS

### Software Requirements

- **Root Access**: sudo or root privileges
- **WireGuard**: Kernel module or wireguard-tools
- **iptables**: Firewall management
- **curl**: For IP detection
- **Optional**:
  - qrencode: QR code generation for mobile
  - jq: JSON processing for monitoring
  - Node.js 18+: For TypeScript API

### Network Requirements

- **Port 51820/UDP**: Must be accessible from internet
- **Firewall**: Configured to allow WireGuard traffic
- **NAT**: Server must support NAT for internet routing

## Quick Installation

For experienced users:

```bash
# 1. Install WireGuard
# Ubuntu/Debian
sudo apt update && sudo apt install -y wireguard wireguard-tools

# RHEL/Rocky
sudo dnf install -y wireguard-tools

# 2. Clone repository
git clone https://github.com/nyagrodha/aformulationoftruth.git
cd aformulationoftruth/vpn

# 3. Make scripts executable
chmod +x scripts/*.sh monitoring/*.sh

# 4. Run setup
sudo ./scripts/setup-wireguard-server.sh

# 5. Add first client
sudo ./scripts/add-client.sh laptop

# 6. Verify
sudo wg show wg0
```

## Detailed Installation

### Step 1: Install WireGuard

#### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install WireGuard
sudo apt install -y wireguard wireguard-tools

# Verify installation
wg version
```

#### RHEL/CentOS/Rocky Linux

```bash
# Install EPEL repository
sudo dnf install -y epel-release

# Install WireGuard tools
sudo dnf install -y wireguard-tools

# Verify installation
wg version
```

#### Alpine Linux

```bash
# Install WireGuard
apk add wireguard-tools

# Load kernel module
modprobe wireguard

# Verify
lsmod | grep wireguard
```

### Step 2: Prepare Environment

```bash
# Update system
sudo apt update && sudo apt upgrade -y  # Debian/Ubuntu
# or
sudo dnf update -y  # RHEL/Rocky

# Install optional dependencies
sudo apt install -y qrencode jq curl net-tools  # Debian/Ubuntu
# or
sudo dnf install -y qrencode jq curl net-tools  # RHEL/Rocky

# Enable IP forwarding (temporary)
sudo sysctl -w net.ipv4.ip_forward=1

# Make IP forwarding permanent
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Step 3: Clone Repository

```bash
# Clone from GitHub
cd /opt
sudo git clone https://github.com/nyagrodha/aformulationoftruth.git

# Navigate to VPN directory
cd aformulationoftruth/vpn

# Make scripts executable
sudo chmod +x scripts/*.sh
sudo chmod +x monitoring/*.sh

# Verify files
ls -la scripts/
ls -la monitoring/
```

### Step 4: Configure Firewall

#### UFW (Ubuntu/Debian)

```bash
# Check UFW status
sudo ufw status

# Allow SSH (IMPORTANT: do this first!)
sudo ufw allow ssh

# Allow WireGuard
sudo ufw allow 51820/udp comment "WireGuard VPN"

# Enable UFW
sudo ufw enable

# Verify
sudo ufw status verbose
```

#### firewalld (RHEL/Rocky)

```bash
# Check firewalld status
sudo firewall-cmd --state

# Allow SSH (IMPORTANT: do this first!)
sudo firewall-cmd --permanent --add-service=ssh

# Allow WireGuard
sudo firewall-cmd --permanent --add-port=51820/udp

# Add masquerading for NAT
sudo firewall-cmd --permanent --add-masquerade

# Reload firewall
sudo firewall-cmd --reload

# Verify
sudo firewall-cmd --list-all
```

#### iptables (Manual)

```bash
# Allow established connections
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow SSH
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow WireGuard
sudo iptables -A INPUT -p udp --dport 51820 -j ACCEPT

# Save rules
sudo iptables-save | sudo tee /etc/iptables/rules.v4

# Or on RHEL/Rocky
sudo service iptables save
```

### Step 5: Run Server Setup

```bash
# Run setup script as root
sudo ./scripts/setup-wireguard-server.sh

# The script will:
# 1. Create dedicated user (wg-admin)
# 2. Create directory structure
# 3. Generate server keys
# 4. Create server configuration
# 5. Configure firewall rules
# 6. Enable and start WireGuard service
# 7. Apply systemd hardening

# Expected output:
# [INFO] Starting WireGuard VPN Server Setup...
# [INFO] Checking system requirements...
# [INFO] WireGuard is installed
# ... (more output)
# [INFO] WireGuard VPN Server Setup Complete!
```

### Step 6: Verify Installation

```bash
# Check WireGuard interface
sudo wg show wg0

# Should show:
# interface: wg0
#   public key: [YOUR_SERVER_PUBLIC_KEY]
#   private key: (hidden)
#   listening port: 51820

# Check systemd service
sudo systemctl status wg-quick@wg0

# Should show:
# ● wg-quick@wg0.service - WireGuard via wg-quick(8) for wg0
#    Active: active (exited) since ...

# Check IP address
ip addr show wg0

# Should show:
# inet 10.8.0.1/24 scope global wg0
```

## Post-Installation

### Step 1: Add First Client

```bash
# Add a client (auto-assigned IP)
sudo ./scripts/add-client.sh laptop

# Expected output:
# [INFO] Adding new WireGuard client...
# [INFO] Assigned IP: 10.8.0.2
# [INFO] Generated keys for client: laptop
# [INFO] Created client config: /etc/wireguard/clients/laptop.conf
# ... (more output)
# [INFO] Client 'laptop' added successfully!

# View client configuration
sudo cat /etc/wireguard/clients/laptop.conf
```

### Step 2: Generate QR Code (for mobile)

```bash
# Generate QR code
sudo qrencode -t ansiutf8 < /etc/wireguard/clients/laptop.conf

# Or use add-client.sh which generates QR automatically
sudo ./scripts/add-client.sh phone
```

### Step 3: Configure Monitoring

```bash
# Test monitoring script
sudo ./monitoring/monitor-vpn.sh status

# Set up continuous monitoring (optional)
sudo ./monitoring/monitor-vpn.sh continuous 60 &

# Or create a systemd service
sudo tee /etc/systemd/system/wireguard-monitor.service << 'EOF'
[Unit]
Description=WireGuard VPN Monitoring
After=wg-quick@wg0.service
Requires=wg-quick@wg0.service

[Service]
Type=simple
ExecStart=/opt/aformulationoftruth/vpn/monitoring/monitor-vpn.sh continuous 60
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

# Enable monitoring service
sudo systemctl daemon-reload
sudo systemctl enable wireguard-monitor
sudo systemctl start wireguard-monitor
```

### Step 4: Set Up Automated Security Audits

```bash
# Add to crontab
sudo crontab -e

# Add this line (daily security audit at 2 AM)
0 2 * * * /opt/aformulationoftruth/vpn/scripts/enforce-security.sh --audit >> /var/log/wireguard/daily-audit.log 2>&1
```

### Step 5: Configure Log Rotation

```bash
# Create logrotate config
sudo tee /etc/logrotate.d/wireguard << 'EOF'
/var/log/wireguard/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 640 root wg-admin
    sharedscripts
    postrotate
        systemctl reload wg-quick@wg0 > /dev/null 2>&1 || true
    endscript
}
EOF

# Test logrotate
sudo logrotate -d /etc/logrotate.d/wireguard
```

## Client Setup

### Linux Client

```bash
# Install WireGuard
sudo apt install wireguard  # Ubuntu/Debian
sudo dnf install wireguard-tools  # RHEL/Rocky

# Copy config from server (using scp)
scp root@your-vpn-server:/etc/wireguard/clients/laptop.conf /tmp/

# Move to WireGuard directory
sudo mv /tmp/laptop.conf /etc/wireguard/

# Start VPN
sudo wg-quick up laptop

# Verify
sudo wg show
ping 10.8.0.1  # Ping VPN server
curl ifconfig.me  # Should show VPN server IP
```

### macOS Client

```bash
# Install WireGuard app from App Store
# or using Homebrew
brew install --cask wireguard-tools

# Copy config from server
scp root@your-vpn-server:/etc/wireguard/clients/laptop.conf ~/Downloads/

# Import config in WireGuard app
# File -> Import Tunnel(s) from File...
# Select laptop.conf

# Click "Activate" to connect
```

### Windows Client

1. Download WireGuard from: https://www.wireguard.com/install/
2. Install WireGuard application
3. Copy config file from server (using WinSCP or similar)
4. In WireGuard app: Import tunnel(s) from file
5. Select the .conf file
6. Click "Activate"

### iOS Client

1. Install WireGuard from App Store
2. On server, generate QR code:
   ```bash
   sudo qrencode -t ansiutf8 < /etc/wireguard/clients/iphone.conf
   ```
3. In WireGuard app: Create from QR code
4. Scan the QR code
5. Toggle the switch to connect

### Android Client

1. Install WireGuard from Google Play Store
2. Generate QR code on server (same as iOS)
3. In WireGuard app: Tap "+" -> Scan from QR code
4. Scan the QR code
5. Toggle the switch to connect

## Testing

### Test VPN Connection

```bash
# From client machine

# 1. Test VPN server connectivity
ping 10.8.0.1

# 2. Test DNS resolution
nslookup google.com

# 3. Test internet connectivity through VPN
curl ifconfig.me  # Should show VPN server's public IP

# 4. Test with specific endpoint
curl -4 https://ifconfig.co/json
```

### Test VPN Performance

```bash
# Latency test
ping -c 10 10.8.0.1

# Bandwidth test (install iperf3 on server and client)
# On server:
sudo apt install iperf3
iperf3 -s

# On client:
iperf3 -c 10.8.0.1

# DNS performance
time dig @10.8.0.1 google.com
```

### Test VPN Security

```bash
# Check for DNS leaks
curl https://www.dnsleaktest.com/ | grep "Your IP"

# Check current IP (should be VPN server IP)
curl ifconfig.me

# Test IPv6 (should be blocked or routed through VPN)
curl -6 ifconfig.me

# Verify encryption (on server)
sudo tcpdump -i eth0 -c 10 udp port 51820
# Traffic should be encrypted, not readable
```

### Server-side Verification

```bash
# View connected clients
sudo wg show wg0

# View with detailed stats
sudo wg show wg0 dump

# Check logs
sudo journalctl -u wg-quick@wg0 -f

# Monitor bandwidth
sudo ./monitoring/monitor-vpn.sh status

# List all clients
sudo ./scripts/list-clients.sh
```

## Troubleshooting

### Issue: VPN Interface Won't Start

```bash
# Check configuration syntax
sudo wg-quick strip wg0

# Check systemd service
sudo systemctl status wg-quick@wg0 -l

# View detailed logs
sudo journalctl -u wg-quick@wg0 --no-pager

# Manually start to see errors
sudo wg-quick up wg0
```

### Issue: Client Can't Connect

```bash
# On server, check firewall
sudo iptables -L -n -v | grep 51820
sudo ufw status | grep 51820

# Check if port is listening
sudo ss -ulnp | grep 51820

# Test from client
nc -vzu YOUR_SERVER_IP 51820

# Check server logs
sudo journalctl -u wg-quick@wg0 -f
```

### Issue: No Internet Through VPN

```bash
# Check IP forwarding
cat /proc/sys/net/ipv4/ip_forward  # Should be 1

# Enable if disabled
sudo sysctl -w net.ipv4.ip_forward=1

# Check NAT rules
sudo iptables -t nat -L POSTROUTING -n -v

# Check FORWARD rules
sudo iptables -L FORWARD -n -v

# Manually add if missing
sudo iptables -A FORWARD -i wg0 -j ACCEPT
sudo iptables -A FORWARD -o wg0 -j ACCEPT
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

### Issue: Slow Performance

```bash
# Check MTU (default 1420)
ip link show wg0

# Try lower MTU in client config
MTU = 1380

# Check server load
top
htop

# Check bandwidth usage
sudo iftop -i wg0

# Check for packet loss
ping -c 100 10.8.0.1 | grep loss
```

### Issue: DNS Not Working

```bash
# In client config, ensure DNS is set
DNS = 10.8.0.1, 1.1.1.1

# Or use only external DNS
DNS = 1.1.1.1, 1.0.0.1

# Test DNS
nslookup google.com 10.8.0.1
```

## Advanced Configuration

### Split Tunneling

To only route specific traffic through VPN:

```bash
# Edit client config
# Change AllowedIPs from:
AllowedIPs = 0.0.0.0/0, ::/0

# To only VPN network:
AllowedIPs = 10.8.0.0/24

# Or specific routes:
AllowedIPs = 10.8.0.0/24, 192.168.1.0/24
```

### IPv6 Support

```bash
# Add IPv6 to server config
Address = 10.8.0.1/24, fd86:ea04:1111::1/64

# In client config
Address = 10.8.0.2/24, fd86:ea04:1111::2/64

# Allow IPv6 in AllowedIPs
AllowedIPs = 0.0.0.0/0, ::/0
```

### Custom Port

```bash
# Edit /etc/wireguard/wg0.conf
ListenPort = 12345  # Change from 51820

# Update firewall
sudo ufw allow 12345/udp

# Restart WireGuard
sudo systemctl restart wg-quick@wg0

# Update clients
Endpoint = your-server.com:12345
```

## Uninstallation

To completely remove WireGuard VPN:

```bash
# Stop and disable service
sudo systemctl stop wg-quick@wg0
sudo systemctl disable wg-quick@wg0

# Backup configuration (optional)
sudo tar -czf ~/wireguard-backup-$(date +%s).tar.gz /etc/wireguard

# Remove WireGuard files
sudo rm -rf /etc/wireguard
sudo rm -rf /var/log/wireguard

# Remove firewall rules
sudo ufw delete allow 51820/udp  # UFW
sudo firewall-cmd --permanent --remove-port=51820/udp && sudo firewall-cmd --reload  # firewalld

# Remove WireGuard package (optional)
sudo apt remove --purge wireguard wireguard-tools  # Debian/Ubuntu
sudo dnf remove wireguard-tools  # RHEL/Rocky

# Remove monitoring service (if installed)
sudo systemctl stop wireguard-monitor
sudo systemctl disable wireguard-monitor
sudo rm /etc/systemd/system/wireguard-monitor.service
sudo systemctl daemon-reload
```

## Support

For issues:
- Check logs: `/var/log/wireguard/`
- Review documentation: `/vpn/docs/`
- GitHub Issues: https://github.com/nyagrodha/aformulationoftruth/issues

For security issues, see [SECURITY.md](./SECURITY.md).
