import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── Override default gray with warm stone tones ─────────────── */
        gray: {
          50:  "#FAF9F7",
          100: "#F5F3EF",
          200: "#E8E4DD",
          300: "#D4D0C8",
          400: "#A39E93",
          500: "#7A756B",
          600: "#5C574E",
          700: "#433F38",
          800: "#2D2926",
          900: "#1E1B18",
          950: "#0F0D0B",
        },

        /* ── Brand ──────────────────────────────────────────────────── */
        cobalt: {
          DEFAULT: "#1A56DB",
          light:   "#D6E4FF",
          dark:    "#1442A8",
        },
        accent: {
          DEFAULT: "#E8C547",
          light:   "#FDF6D8",
          dark:    "#C9A51E",
        },
        mist: "#F5F3EF",

        /* ── Status — muted & earthy ────────────────────────────────── */
        pass:    { DEFAULT: "#3D9970", bg: "#EBF5F0", text: "#1B5E42" },
        fail:    { DEFAULT: "#C0392B", bg: "#FCEAE8", text: "#7B241C" },
        blocked: { DEFAULT: "#D4820C", bg: "#FDF3E2", text: "#8B5A08" },
        skipped: { DEFAULT: "#8B8680", bg: "#F2F1EE", text: "#5C574E" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body:    ["var(--font-body)", "system-ui", "sans-serif"],
        mono:    ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      width: {
        sidebar: "240px",
        "sidebar-collapsed": "48px",
      },
    },
  },
  plugins: [],
}

export default config
