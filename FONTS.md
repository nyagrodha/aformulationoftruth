# Fonts Used in A Formulation of Truth

All fonts are self-hosted in `/public/fonts/` to avoid third-party tracking via Google Fonts.

## Available Fonts

| Font Name | Weights/Styles | Files | Used In |
|-----------|----------------|-------|---------|
| Rye | 400 | rye-latin-400-normal.woff2 | Western theme, headers |
| Special Elite | 400 | special-elite-latin-400-normal.woff2 | Typewriter style |
| Orbitron | 400, 500, 600, 700 | orbitron-v35-latin-*.woff2 | Cyberpunk/tech headers |
| Space Mono | 400, 700 | space-mono-v17-latin-*.woff2 | Monospace text |
| Noto Serif | 400, 400i, 700, 700i | NotoSerif-*.ttf | Body text |
| Goudy Stout | 400, 400i | GoudyStM-*.woff | Display headers |
| League Spartan | 600 (Variable) | LeagueSpartan-*.woff2 | UI elements |
| Blackout | Midnight, Sunrise, Two AM | blackout_*-webfont.woff | Display/impact |
| Sancreek | 400 | sancreek-latin-400-normal.woff2 | Western display |
| Noto Sans Sharada | 400 | NotoSansSharada-Regular.ttf | Sharada script |
| Sai Indira | 400 | SaiIndira.woff2 | Indic script |

## Fonts To Download

| Font Name | Weights Needed | Status |
|-----------|----------------|--------|
| Spectral | 400, 400i, 700 | PENDING |
| Libre Baskerville | 400, 400i, 700 | PENDING |
| Noto Sans Tamil | 400, 700 | PENDING |

## Adding New Fonts

1. Download from Google Fonts or other source
2. Convert to woff2 format if needed
3. Place in `/public/fonts/`
4. Add @font-face declaration to relevant CSS
5. Update this list

## Why Self-Host?

Google Fonts tracks users across sites. By self-hosting, we:
- Prevent third-party tracking
- Improve page load (no external requests)
- Ensure fonts work offline
- Maintain user privacy

---
Last updated: 2026-01-20
