# Linking Public Pages to Dist Folder

## Current Setup

### Directory Structure
- **Public static files**: `/var/www/aformulationoftruth/public/`
  - Contains: `landing.html`, `index.html`, `login.html`, `about.html`, etc.
- **React app build**: `/var/www/aformulationoftruth/apps/frontend/dist/`
  - Contains: `index.html`, `assets/`, compiled JS/CSS bundles

### Caddy Configuration

The Caddyfile at `/etc/caddy/Caddyfile` handles routing:

```caddy
# Static landing page for root and everything else
handle {
  root * /var/www/aformulationoftruth/public
  try_files {path} /landing.html
  file_server
}

# React app
handle /react-app* {
  root * /var/www/aformulationoftruth/apps/frontend/dist
  try_files {path} /index.html
  file_server
}
```

## How to Link from Public to Dist

### Option 1: Use the /react-app Route (Current Setup)

From any HTML file in `/var/www/aformulationoftruth/public/`, link to the React app:

```html
<a href="/react-app">Enter React App</a>
```

The Caddy server will:
1. Match the `/react-app*` handle
2. Serve files from `/var/www/aformulationoftruth/apps/frontend/dist/`
3. Fall back to `dist/index.html` for client-side routing

### Option 2: Copy Dist to Public (Alternative)

After building the React app, copy the dist contents to public:

```bash
cd /var/www/aformulationoftruth/apps/frontend
npm run build  # or your build command
cp -r dist/* /var/www/aformulationoftruth/public/app/
```

Then link directly:
```html
<a href="/app">Enter App</a>
```

### Option 3: Dedicated Subdomain (For Production)

Create a separate subdomain for the React app in Caddyfile:

```caddy
https://app.aformulationoftruth.com {
  bind 37.228.129.173 2a06:1700:1:45::435c:c15f
  import common

  root * /var/www/aformulationoftruth/apps/frontend/dist
  try_files {path} /index.html
  file_server
}
```

## Testing the Link

1. Build your React app: `npm run build` (from frontend directory)
2. Reload Caddy: `sudo systemctl reload caddy`
3. Visit: `https://aformulationoftruth.com/react-app`

## Current Link in landing.html

Line 315 of `/var/www/aformulationoftruth/public/landing.html`:

```html
<a class="card" href="/index.html">
  Welcome. Click here to enter the site.
</a>
```

To link to the React app instead, change to:

```html
<a class="card" href="/react-app">
  Welcome. Click here to enter the site.
</a>
```
