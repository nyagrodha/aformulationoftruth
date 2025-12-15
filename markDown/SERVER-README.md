# Solar-Accurate Theme Server

A Deno-based server that dynamically serves themed content based on the solar position in Pondicherry, India.

## Features

🌅 **Solar-Accurate Themes**
- Synced to Pondicherry coordinates (11.9416°N, 79.8083°E)
- Fetches real sunrise/sunset data from Open-Meteo API
- 6-hour caching to minimize API calls

🎨 **Three Theme Palettes**
- **warm**: Dawn period (±40min from sunrise)
- **cool**: Daytime (between dawn and dusk)
- **noir**: Dusk/Night (±40/60min from sunset + overnight)

🧅 **Tor Support**
- Requests from `.onion` domains always receive the `noir` theme

## Installation

### 1. Install Deno

```bash
./install-deno.sh
```

Or manually:
```bash
curl -fsSL https://deno.land/install.sh | sh
```

Add to your `~/.bashrc` or `~/.zshrc`:
```bash
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
```

### 2. Run the Server

```bash
cd /var/www/aformulationoftruth
deno run --allow-net --allow-read server.ts
```

The server will start on `http://localhost:8000`

## How It Works

1. **Request Received**: Server checks if the request is from a `.onion` domain
2. **Theme Selection**:
   - If `.onion`: Force `noir` theme
   - Otherwise: Fetch cached solar data and calculate current solar position
3. **HTML Injection**: The theme is injected into the HTML as `data-palette="${theme}"`
4. **Response**: Themed HTML is served to the client

## Theme Transitions

Based on Pondicherry's solar cycle:

```
Pre-dawn → [NOIR]
  ↓
Dawn (-40min) → [WARM]
  ↓
Post-sunrise (+40min) → [COOL]
  ↓
Pre-dusk (-40min) → [COOL]
  ↓
Dusk → [NOIR]
  ↓
Post-sunset (+60min) → [NOIR]
  ↓
Night → [NOIR]
```

## File Structure

```
/var/www/aformulationoftruth/
├── server.ts                 # Main Deno server
├── public/
│   ├── reimagined.html      # Main HTML file (theme injected)
│   ├── css/
│   └── js/
├── install-deno.sh          # Deno installation script
└── SERVER-README.md         # This file
```

## CSS Integration

The server injects `data-palette` into the `<body>` tag:

```html
<body data-palette="warm">
<body data-palette="cool">
<body data-palette="noir">
```

Style your CSS accordingly:

```css
body[data-palette="warm"] {
  /* Dawn/sunrise styles */
}

body[data-palette="cool"] {
  /* Daytime styles */
}

body[data-palette="noir"] {
  /* Dusk/night styles */
}
```

## Production Deployment

For production, consider:
1. Using a process manager (PM2, systemd)
2. Setting up a reverse proxy (Caddy, nginx)
3. Configuring proper PORT and environment variables
4. Monitoring solar API cache hits/misses

## License

Part of A Formulation of Truth project.
