import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0F",
        surface: {
          DEFAULT: "#14141F",
          elevated: "#1E1E2E",
        },
        border: "#2A2A3A",
        primary: {
          DEFAULT: "#7C5CFC",
          light: "#9B82FC",
          glow: "rgba(124, 92, 252, 0.3)",
        },
        secondary: "#FC5C9C",
        text: {
          primary: "#F0F0F5",
          secondary: "#9898A8",
          muted: "#5A5A6E",
        },
        spotify: "#1DB954",
        apple: "#FC3C44",
        youtube: "#FF0000",
        soundcloud: "#FF5500",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        xs: ["0.64rem", { lineHeight: "1.2" }],
        sm: ["0.80rem", { lineHeight: "1.5" }],
        base: ["1rem", { lineHeight: "1.5" }],
        lg: ["1.25rem", { lineHeight: "1.5" }],
        xl: ["1.563rem", { lineHeight: "1.2" }],
        "2xl": ["1.953rem", { lineHeight: "1.2" }],
        "3xl": ["2.441rem", { lineHeight: "1.2" }],
        "4xl": ["3.052rem", { lineHeight: "1.2" }],
      },
      borderRadius: {
        "2xl": "1.5rem",
      },
      transitionDuration: {
        "100": "100ms",
        "200": "200ms",
        "350": "350ms",
        "500": "500ms",
        "800": "800ms",
      },
      // 3 essential animations + 2 utilities (reduced from 7)
      animation: {
        "gradient-float": "gradient-float 20s ease-in-out infinite",
        "slide-up":
          "slide-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        shake: "shake 0.3s ease-in-out",
        spin: "spin 1s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
      keyframes: {
        "gradient-float": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(10%, -5%) scale(1.05)" },
          "50%": { transform: "translate(-5%, 10%) scale(0.95)" },
          "75%": { transform: "translate(-10%, -10%) scale(1.02)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-4px)" },
          "40%, 80%": { transform: "translateX(4px)" },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 20px rgba(124, 92, 252, 0.2)",
          },
          "50%": {
            boxShadow: "0 0 40px rgba(124, 92, 252, 0.4)",
          },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
