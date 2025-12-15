# Reimagined.html Updates - Solar Theme System

## Summary of Changes

We've transformed `reimagined.html` into a solar-aware, dynamically themed experience with continuous color blending based on real-time sun position in Pondicherry, India.

---

## 🌅 Solar-Accurate Theme System

### Server Implementation

**Two server versions created:**

1. **`server.ts`** - Original working version with basic theme detection
2. **`dserver.ts`** - Enhanced Deploy-ready version with continuous sunphase blending

### Key Features

✅ **Continuous Sunphase Calculation** (`sunphase ∈ [0, 1]`)
- `0.0` = Sunrise
- `0.5` = Solar noon
- `1.0` = Sunset
- Linear interpolation throughout the day

✅ **Three Discrete Palette Zones**
- **warm** (0.0 - 0.2): Dawn/Early morning
- **cool** (0.2 - 0.8): Daytime
- **noir** (0.8 - 1.0): Dusk/Night

✅ **Tor Support**
- `.onion` domains always receive `noir` theme with `sunphase = 0.95`

✅ **API Caching**
- 6-hour cache for Open-Meteo solar data
- Reduces API calls and improves performance

---

## 🎨 CSS Updates

### 1. Responsive Typography

```css
html {
  font-size: clamp(16px, 1.6vw + 12px, 36px);
}

.sidebar-card h3 {
  font-size: clamp(0.8rem, 1.2vw, 1.2rem);
}

.sidebar-card p {
  font-size: clamp(0.6rem, 1vw, 1rem);
}
```

### 2. Enlarged Tamil Numeral

```css
.tamil-numeral-2 {
  font-size: clamp(6rem, 15vw, 10rem);  /* Was 4rem-7rem */
}
```

### 3. Staggered Card System

**New `.staggered-card` class with:**
- Continuous color blending using CSS custom properties
- Three layered gradients (warm, cool, noir)
- Opacity calculated from `--sunphase` variable
- Alternating tilt effect (odd cards: -2.5deg, even cards: +2deg)
- Progressive vertical offset (1.5rem increments)
- Hover effects with scale and enhanced shadows

**Continuous Blending Formula:**
```css
.staggered-card::before {
  /* Warm layer */
  opacity: calc(1 - var(--sunphase, 0.5));
}

.staggered-card::after {
  /* Cool layer - peaks at midday */
  opacity: calc(1 - abs(var(--sunphase, 0.5) - 0.5) * 2);
}

/* Noir is base layer - visible as other layers fade */
```

### 4. Removed Elements

❌ Spaghetti bowl SVG (deemed "pathetic")
❌ Old seasonal theme JavaScript
❌ Fixed `theme-warm` and `theme-cold` classes

---

## 🔧 Technical Implementation

### Server Injection

The Deno server injects theme data into the `<body>` tag:

```html
<body data-sunphase="0.432" data-palette="cool" style="--sunphase: 0.432;">
```

This provides:
1. **`data-sunphase`** - Numeric value for JavaScript/debugging
2. **`data-palette`** - Semantic palette name for conditional styling
3. **`--sunphase`** - CSS custom property for continuous blending

### File Structure

```
/var/www/aformulationoftruth/
├── server.ts              # Original working server
├── dserver.ts             # Enhanced Deploy-ready server
├── install-deno.sh        # Deno installation script
├── SERVER-README.md       # Server documentation
├── REIMAGINED-UPDATES.md  # This file
└── public/
    └── reimagined.html    # Updated with continuous blending CSS
```

---

## 🚀 Running the Server

### Local Development

```bash
# Install Deno (if not installed)
./install-deno.sh

# Run basic server
deno run --allow-net --allow-read server.ts

# Run enhanced server
deno run --allow-net --allow-read dserver.ts
```

### Deno Deploy

The `dserver.ts` is optimized for Deno Deploy with:
- Edge caching support
- Efficient static file serving
- Minimal dependencies

---

## 📊 Sunphase Visualization

```
Sunrise (0.0)
    ↓
    ┌─────────────┐
    │  WARM       │  phase: 0.0 → 0.2
    └─────────────┘
    ↓
    ┌─────────────┐
    │  COOL       │  phase: 0.2 → 0.8
    │             │  (peak at 0.5)
    └─────────────┘
    ↓
    ┌─────────────┐
    │  NOIR       │  phase: 0.8 → 1.0
    └─────────────┘
    ↓
Sunset (1.0)
```

---

## 🎯 Color Palette Details

### Warm Palette (Dawn)
- `#f7ebd3` → `#f0e1c7`
- Golden, sunrise tones

### Cool Palette (Day)
- `#e8e4d8` → `#dbd5c9`
- Neutral, focused tones

### Noir Palette (Night)
- `#3b3b3b` → `#2a2a2a`
- Graphite, wine, brass accents

---

## 🔮 Future Enhancements

Potential additions:
- [ ] Smooth transitions between sunphase values (CSS transitions)
- [ ] Additional palette variations per card (currently uniform)
- [ ] Parallax effects tied to sunphase
- [ ] Moon phase integration for night hours
- [ ] Weather-aware color adjustments
- [ ] Client-side sunphase updates (polling/WebSocket)

---

## 📝 Notes

- **Pondicherry coordinates**: `11.9416°N, 79.8083°E`
- **API**: Open-Meteo Astronomy API
- **Cache TTL**: 6 hours
- **Browser compatibility**: Modern browsers with CSS custom properties support
- **Tor detection**: Host header checking for `.onion` domains

---

*Last updated: 2025-12-07*
*Solar-accurate theming for aformulationoftruth*
