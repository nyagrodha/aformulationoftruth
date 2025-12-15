#!/bin/bash

# Script to enable maintenance mode for the website
# Usage: sudo ./enable-maintenance.sh

echo "Enabling maintenance mode..."

# Backup current Caddyfile if not already backed up
if [ ! -f /etc/caddy/Caddyfile.backup ]; then
    echo "Creating backup of current Caddyfile..."
    sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup
    echo "✓ Backup created at /etc/caddy/Caddyfile.backup"
else
    echo "⚠ Backup already exists at /etc/caddy/Caddyfile.backup (not overwriting)"
fi

# Check if maintenance Caddyfile exists
if [ ! -f /etc/caddy/Caddyfile.maintenance ]; then
    echo "Error: Maintenance Caddyfile not found at /etc/caddy/Caddyfile.maintenance"
    exit 1
fi

# Replace current Caddyfile with maintenance version
echo "Switching to maintenance Caddyfile..."
sudo cp /etc/caddy/Caddyfile.maintenance /etc/caddy/Caddyfile

# Test Caddy configuration
if sudo caddy validate --config /etc/caddy/Caddyfile; then
    echo "✓ Caddyfile validation successful"

    # Reload Caddy
    sudo systemctl reload caddy

    if [ $? -eq 0 ]; then
        echo "✓ Maintenance mode enabled successfully!"
        echo "✓ Caddy reloaded successfully"
        echo ""
        echo "The website is now in maintenance mode."
        echo "To restore normal operation, run: sudo ./restore-main.sh"
    else
        echo "✗ Failed to reload Caddy"
        echo "Restoring original Caddyfile..."
        sudo cp /etc/caddy/Caddyfile.backup /etc/caddy/Caddyfile
        sudo systemctl reload caddy
        exit 1
    fi
else
    echo "✗ Caddyfile validation failed. Maintenance mode not enabled."
    echo "Restoring original Caddyfile..."
    sudo cp /etc/caddy/Caddyfile.backup /etc/caddy/Caddyfile
    exit 1
fi
