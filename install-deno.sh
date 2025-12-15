#!/bin/bash
# Install Deno for aformulationoftruth solar-themed server

echo "🦕 Installing Deno..."

curl -fsSL https://deno.land/install.sh | sh

# Add to PATH
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

echo ""
echo "✅ Deno installed!"
echo ""
echo "Add to your ~/.bashrc or ~/.zshrc:"
echo 'export DENO_INSTALL="$HOME/.deno"'
echo 'export PATH="$DENO_INSTALL/bin:$PATH"'
echo ""
echo "Then run the server with:"
echo "cd /var/www/aformulationoftruth"
echo "deno run --allow-net --allow-read server.ts"
