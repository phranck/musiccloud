import { defineConfig, type PresetWind4Theme, presetTypography, presetWind4, transformerDirectives } from "unocss";

export default defineConfig<PresetWind4Theme>({
  presets: [
    presetWind4(),
    presetTypography<PresetWind4Theme>({
      cssExtend: {
        h1: {
          "margin-top": "0",
          "margin-bottom": "0.6em",
          "font-weight": "600",
        },
        h2: {
          "margin-top": "1.8em",
          "margin-bottom": "0.4em",
          "font-weight": "500",
        },
        h3: {
          "margin-top": "1.4em",
          "margin-bottom": "0.3em",
          "font-weight": "600",
        },
        h4: {
          "margin-top": "1.2em",
          "margin-bottom": "0.2em",
          "font-weight": "600",
        },
        p: {
          "margin-top": "1.25em",
          "margin-bottom": "1.25em",
        },
        li: {
          "margin-top": "0.25em",
          "margin-bottom": "0.25em",
        },
      },
    }),
  ],
  transformers: [transformerDirectives()],
  theme: {
    radius: {
      control: "0.5rem",
      card: "1.25rem",
    },
    font: {
      sans: '"Inter", system-ui, -apple-system, sans-serif',
      heading: '"Barlow Condensed", system-ui, sans-serif',
      serif: '"Barlow Condensed", system-ui, sans-serif',
    },
  },
  content: {
    filesystem: ["../../packages/dashboard-ui/src/**/*.{ts,tsx}", "../../packages/dashboard-ui/dist/**/*.{js,mjs}"],
    pipeline: {
      include: ["./src/**/*.{ts,tsx,html}", "../../packages/dashboard-ui/src/**/*.{ts,tsx}"],
    },
  },
});
