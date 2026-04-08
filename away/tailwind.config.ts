import type { Config } from "tailwindcss";

export default {
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        cream: "#faf7f0",
        gold: {
          DEFAULT: "#c9a84c",
          light: "#e8d5a3",
          dark: "#8b6914",
        },
        sage: {
          DEFAULT: "#7c9a7c",
          light: "#a8c4a8",
          dark: "#4a6a4a",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
