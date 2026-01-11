#!/bin/bash

# Script to restore the main website from maintenance mode
# Usage: sudo ./restore-main.sh

echo "Restoring main website from maintenance mode..."

# Check if backup exists
if [ ! -f /etc/caddy/Caddyfile.backup ]; then
    echo "Error: No backup Caddyfile found at /etc/caddy/Caddyfile.backup"
    echo "Cannot restore main website safely."
    exit 1
fi

# Restore original Caddyfile
sudo cp /etc/caddy/Caddyfile.backup /etc/caddy/Caddyfile

# Test Caddy configuration
if sudo caddy validate --config /etc/caddy/Caddyfile; then
    echo "Caddyfile validation successful."

    # Reload Caddy
    sudo systemctl reload caddy

    if [ $? -eq 0 ]; then
        echo "✓ Main website restored successfully!"
        echo "✓ Caddy reloaded successfully"

        # Verify services are running
        echo "Checking service status..."
        systemctl is-active --quiet caddy && echo "✓ Caddy is running" || echo "✗ Caddy is not running"

        # Check if backend is running on correct port
        if pgrep -f "node.*server.js" > /dev/null; then
            echo "✓ Backend server is running"
        else
            echo "⚠ Backend server may not be running - check manually"
        fi

    else
        echo "✗ Failed to reload Caddy"
        exit 1
    fi
else
    echo "✗ Caddyfile validation failed. Maintenance mode will remain active."
    exit 1
fi