# Assets Directory

This directory contains static assets for the A Formulation of Truth website.

## Current Contents

### Images
- `thereisnogod.JPG` (300KB) - Hero background for About page
- `opticalProust.jpg` (1.5MB) - Proust-related imagery

### Fonts
Directory structure ready at `/assets/fonts/`
Place custom web fonts here:
- `.woff2` - Modern browsers (preferred)
- `.woff` - Fallback for older browsers
- `.ttf` / `.otf` - Desktop font fallbacks

**Note**: Favicons and logos are stored in `/favicons/` directory

## Usage

### Referencing Assets in HTML/CSS

```html
<!-- Images -->
<img src="/assets/thereisnogod.JPG" alt="There Is No God">

<!-- Background images -->
<style>
  .hero {
    background-image: url('/assets/thereisnogod.JPG');
  }
</style>
```

### Font Files

When adding custom fonts, create a `fonts` subdirectory:
```
/assets/
  /fonts/
    /custom-font/
      custom-font.woff2
      custom-font.woff
      custom-font.ttf
```

Then reference in CSS:
```css
@font-face {
  font-family: 'CustomFont';
  src: url('/assets/fonts/custom-font/custom-font.woff2') format('woff2'),
       url('/assets/fonts/custom-font/custom-font.woff') format('woff');
  font-weight: normal;
  font-style: normal;
}
```

## Organization

Keep assets organized by type:
- Images: `/assets/` (root)
- Fonts: `/assets/fonts/`
- Icons: `/assets/icons/` (if needed)
- Other: `/assets/[type]/`

## Optimization

- Compress images before adding (use tools like ImageOptim, TinyPNG)
- Use modern formats (WebP for images, WOFF2 for fonts)
- Consider lazy loading for large images
- Provide multiple resolutions for responsive design

## Notes

- All paths are relative to `/public/`
- Express static middleware serves from `/public/`
- Files here are publicly accessible via `/assets/[filename]`
