import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0b0c",
        foreground: "#f7f7f8",
        muted: "#1f2024",
        accent: "#ef233c",
        "accent-hover": "#ff2d4a",
        border: "#27292f",
        card: "#141518",
        success: "#3ddc84",
        warning: "#ffb020",
        danger: "#ff4b6b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 20px 35px -20px rgba(239, 35, 60, 0.35)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;

