/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        'sans': ['ui-sans-serif', 'system-ui', 'sans-serif'], // Your default sans-serif
        'devanagari': ['"Noto Sans Devanagari"', 'sans-serif'],
        'tamil': ['"Noto Sans Tamil"', 'sans-serif'],
        'kannada': ['"Noto Sans Kannada"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
